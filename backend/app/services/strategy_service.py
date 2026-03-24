"""
Interactive Strategy Dashboard — SCRUM-90

Grade boundary algorithms (min/max), multi-assessment "what-if" scenario logic,
learning strategy suggestions, and calculation breakdown for transparency.

Design decisions
────────────────
- Calculations tolerate weights that don't sum to 100%.
  *Normalised* view: effective_grade = (earned / available_weight) × 100.
  *Raw* view: the straight sum of weighted contributions (may be < 100 even
  with perfect scores).  Both are returned; the frontend picks the display.
- "What-if" scenarios NEVER persist — they operate on a snapshot.
- Learning strategy suggestions are deterministic (no AI) and based on:
  assessment_type × time_until_due × weight.
"""

from __future__ import annotations

import math
import logging
import unicodedata
from datetime import date, datetime
from typing import Any

from app.models import Assessment, CourseCreate
from app.services.grading_service import (
    apply_hypothetical_score,
    calculate_course_totals,
    compute_assessment_contribution,
    fill_remaining_ungraded_scores,
    evaluate_mandatory_pass_requirements,
    _is_assessment_fully_graded,
    _is_target_fully_graded,
    _target_label,
    calculate_assessment_percent,
    get_york_grade,
    resolve_assessment_target,
)
from app.services.gpa_service import convert_percentage_all_scales

logger = logging.getLogger(__name__)


def _normalize_requirement_key(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    normalized = unicodedata.normalize("NFKC", value)
    return normalized.strip().casefold()


def _coerce_pass_threshold(rule_config: dict[str, Any] | None) -> float:
    config = rule_config or {}
    try:
        threshold = float(config.get("pass_threshold", 50))
    except (TypeError, ValueError):
        return 50.0
    return max(0.0, min(100.0, threshold))


def _format_mandatory_pass_status(raw_status: dict[str, Any]) -> dict[str, Any]:
    requirements: list[dict[str, Any]] = []
    for requirement in raw_status.get("requirements", []):
        percent = requirement.get("percent")
        actual_percent = float(percent) if isinstance(percent, (int, float)) else None
        requirements.append(
            {
                "assessment_name": str(requirement.get("assessment_name", "")),
                "threshold": float(requirement.get("threshold", 50.0)),
                "status": str(requirement.get("status", "pending")),
                "actual_percent": actual_percent,
            }
        )

    return {
        "has_requirements": bool(raw_status.get("has_requirements", False)),
        "requirements_met": bool(raw_status.get("requirements_met", False)),
        "failed_assessments": list(raw_status.get("failed_assessments", [])),
        "pending_assessments": list(raw_status.get("pending_assessments", [])),
        "requirements": requirements,
    }


def _mandatory_requirement_lookup(
    mandatory_status: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    return {
        _normalize_requirement_key(requirement.get("assessment_name", "")): requirement
        for requirement in mandatory_status.get("requirements", [])
        if _normalize_requirement_key(requirement.get("assessment_name", ""))
    }


# ─── Grade Boundary Algorithms ────────────────────────────────────────────────

def compute_grade_boundaries(course: CourseCreate) -> dict[str, Any]:
    """
    Return min / max final grade boundaries plus a per-assessment breakdown
    suitable for feeding a "Show Math" panel.

    * **min_grade** — current standing (assumes 0 % on every remaining item).
    * **max_grade** — best-case (assumes 100 % on every remaining item).
    * Normalised variants scale by available core weight when < 100 %.
    """
    core_weight = 0.0
    bonus_weight = 0.0
    breakdown: list[dict[str, Any]] = []
    mandatory_pass_status = _format_mandatory_pass_status(
        evaluate_mandatory_pass_requirements(course)
    )
    mandatory_lookup = _mandatory_requirement_lookup(mandatory_pass_status)

    for a in course.assessments:
        is_bonus = getattr(a, "is_bonus", False)
        is_mandatory_pass = a.rule_type == "mandatory_pass"
        requirement = mandatory_lookup.get(_normalize_requirement_key(a.name))
        current = compute_assessment_contribution(a, missing_percent=0.0)
        maximum = compute_assessment_contribution(a, missing_percent=100.0)
        remaining = max(0.0, maximum - current)
        graded = _is_assessment_fully_graded(a)
        if is_mandatory_pass and requirement is None:
            logger.warning(
                "mandatory_pass requirement missing in lookup for assessment=%r",
                a.name,
            )

        entry: dict[str, Any] = {
            "name": a.name,
            "weight": a.weight,
            "is_bonus": is_bonus,
            "graded": graded,
            "current_contribution": round(current, 4),
            "max_contribution": round(maximum, 4),
            "remaining_potential": round(remaining, 4),
            "has_children": bool(a.children),
            "is_mandatory_pass": is_mandatory_pass,
            "pass_threshold": (
                _coerce_pass_threshold(a.rule_config) if is_mandatory_pass else None
            ),
            "pass_status": requirement.get("status") if requirement else None,
        }

        if a.children:
            entry["rule_type"] = a.rule_type
            entry["rule_config"] = a.rule_config
            children_detail: list[dict[str, Any]] = []
            for child in a.children:
                child_graded = child.raw_score is not None and child.total_score is not None
                child_entry: dict[str, Any] = {
                    "name": child.name,
                    "weight": child.weight,
                    "graded": child_graded,
                    "raw_score": child.raw_score,
                    "total_score": child.total_score,
                    "score_percent": (
                        round(calculate_assessment_percent(child.raw_score, child.total_score), 2)
                        if child_graded
                        else None
                    ),
                    "is_mandatory_pass": False,
                    "pass_threshold": None,
                    "pass_status": None,
                }
                children_detail.append(child_entry)
            entry["children"] = children_detail
        elif graded:
            if a.raw_score is None or a.total_score is None:
                logger.warning(
                    "graded assessment %r missing score pair; omitting score_percent",
                    a.name,
                )
                breakdown.append(entry)
                if is_bonus:
                    bonus_weight += a.weight
                else:
                    core_weight += a.weight
                continue
            entry["score_percent"] = round(
                calculate_assessment_percent(a.raw_score, a.total_score), 2
            )

        breakdown.append(entry)

        if is_bonus:
            bonus_weight += a.weight
        else:
            core_weight += a.weight

    totals_min = calculate_course_totals(course, missing_percent=0.0)
    totals_max = calculate_course_totals(course, missing_percent=100.0)
    current_totals = calculate_course_totals(course)

    min_grade = totals_min["final_total"]
    max_grade = totals_max["final_total"]
    current_grade = current_totals["final_total"]

    # ── Normalised view (when core weights < 100 %) ──
    # Bonus weight is intentionally excluded from the denominator so that
    # bonus marks can push the effective grade above 100 %.
    if core_weight > 0 and core_weight < 100:
        norm_factor = 100.0 / core_weight
        min_normalised = round(totals_min["core_total"] * norm_factor + totals_min["bonus_total"], 2)
        max_normalised = round(totals_max["core_total"] * norm_factor + totals_max["bonus_total"], 2)
        current_normalised = round(current_totals["core_total"] * norm_factor + current_totals["bonus_total"], 2)
    else:
        min_normalised = min_grade
        max_normalised = max_grade
        current_normalised = current_grade

    graded_weight = sum(
        a.weight for a in course.assessments
        if _is_assessment_fully_graded(a) and not getattr(a, "is_bonus", False)
    )
    remaining_weight = core_weight - graded_weight

    return {
        "course_name": course.name,
        # Raw (un-normalised) boundaries
        "min_grade": round(min_grade, 2),
        "max_grade": round(max_grade, 2),
        "current_grade": round(current_grade, 2),
        # Normalised boundaries (scales if total core weight < 100 %)
        "min_normalised": min_normalised,
        "max_normalised": max_normalised,
        "current_normalised": current_normalised,
        "normalisation_applied": core_weight < 100 and core_weight > 0,
        "core_weight": round(core_weight, 2),
        "bonus_weight": round(bonus_weight, 2),
        "core_grade": round(current_totals["core_total"], 2),
        "bonus_contribution": round(current_totals["bonus_total"], 2),
        "graded_weight": round(graded_weight, 2),
        "remaining_weight": round(remaining_weight, 2),
        "mandatory_pass_status": mandatory_pass_status,
        # Transparent breakdown
        "breakdown": breakdown,
        # GPA conversions on current grade
        "gpa_current": convert_percentage_all_scales(current_grade),
        "gpa_best_case": convert_percentage_all_scales(max_grade),
        "york_equivalent": get_york_grade(current_grade),
    }


# ─── Multi-Assessment What-If ────────────────────────────────────────────────

def compute_multi_whatif(
    course: CourseCreate,
    scenarios: list[dict[str, float]],
) -> dict[str, Any]:
    """
    Compute projected grade given hypothetical scores on *multiple* remaining
    assessments simultaneously.  This does **not** persist any changes.

    *scenarios* is a list of ``{"assessment_name": str, "score": float}`` dicts
    where *score* is a percentage (0-100).

    Assessments not mentioned in *scenarios* keep their current value (graded)
    or are assumed 0 % (ungraded) for the "projected" view.  The response also
    includes a "maximum_possible" that assumes 100 % on any remaining
    assessments not covered by the scenarios.
    """
    scenario_map: dict[str, float] = {}
    for scenario in scenarios:
        name = str(scenario.get("assessment_name", "")).strip()
        score = float(scenario.get("score", 0.0))
        if not name:
            continue
        target_assessment, target_child = resolve_assessment_target(course, name)
        if _is_target_fully_graded(target_assessment, target_child):
            raise ValueError(f"Assessment '{name}' is already graded")
        target_path = _target_label(
            target_assessment.name,
            target_child.name if target_child is not None else None,
        )
        if target_path in scenario_map:
            raise ValueError(f"Duplicate assessment '{target_path}' in scenario payload")
        scenario_map[target_path] = max(0.0, min(100.0, score))

    projected_course = course.model_copy(deep=True)
    for assessment_name, score in scenario_map.items():
        apply_hypothetical_score(projected_course, assessment_name, score)
    mandatory_pass_status = _format_mandatory_pass_status(
        evaluate_mandatory_pass_requirements(projected_course)
    )
    mandatory_lookup = _mandatory_requirement_lookup(mandatory_pass_status)

    max_course = projected_course.model_copy(deep=True)
    fill_remaining_ungraded_scores(max_course, missing_percent=100.0)

    projected_totals = calculate_course_totals(projected_course)
    max_totals = calculate_course_totals(max_course)
    current_totals = calculate_course_totals(course)

    projected = projected_totals["final_total"]
    max_possible = max_totals["final_total"]

    whatif_breakdown: list[dict[str, Any]] = []
    core_weight = sum(
        a.weight for a in course.assessments if not getattr(a, "is_bonus", False)
    )
    bonus_weight = sum(
        a.weight for a in course.assessments if getattr(a, "is_bonus", False)
    )

    projected_lookup = {
        assessment.name: assessment for assessment in projected_course.assessments
    }
    max_lookup = {
        assessment.name: assessment for assessment in max_course.assessments
    }

    for assessment in course.assessments:
        is_bonus = getattr(assessment, "is_bonus", False)
        is_mandatory_pass = assessment.rule_type == "mandatory_pass"
        requirement = mandatory_lookup.get(_normalize_requirement_key(assessment.name))
        graded = _is_assessment_fully_graded(assessment)
        if is_mandatory_pass and requirement is None:
            logger.warning(
                "mandatory_pass requirement missing in projected lookup for assessment=%r",
                assessment.name,
            )
        projected_assessment = projected_lookup[assessment.name]
        max_assessment = max_lookup[assessment.name]
        contribution = compute_assessment_contribution(projected_assessment)
        max_contribution = compute_assessment_contribution(max_assessment)

        scenario_applied = any(
            scenario_name == assessment.name
            or scenario_name.startswith(f"{assessment.name}::")
            for scenario_name in scenario_map
        )
        if scenario_applied:
            source = "whatif"
        elif graded:
            source = "actual"
        else:
            source = "remaining"

        entry: dict[str, Any] = {
            "name": assessment.name,
            "weight": assessment.weight,
            "is_bonus": is_bonus,
            "source": source,
            "contribution": round(contribution, 4),
            "max_contribution": round(max_contribution, 4),
            "hypothetical_score": scenario_map.get(assessment.name),
            "has_children": bool(assessment.children),
            "is_mandatory_pass": is_mandatory_pass,
            "pass_threshold": (
                _coerce_pass_threshold(assessment.rule_config) if is_mandatory_pass else None
            ),
            "pass_status": requirement.get("status") if requirement else None,
        }

        if assessment.children:
            entry["rule_type"] = assessment.rule_type
            entry["rule_config"] = assessment.rule_config
            projected_children = {
                c.name: c for c in (projected_assessment.children or [])
            }
            child_entries: list[dict[str, Any]] = []
            for child in assessment.children:
                child_graded = child.raw_score is not None and child.total_score is not None
                child_path = f"{assessment.name}::{child.name}"

                if child_path in scenario_map:
                    child_source = "whatif"
                    child_hypo: float | None = scenario_map[child_path]
                elif child_graded:
                    child_source = "actual"
                    child_hypo = None
                else:
                    child_source = "remaining"
                    child_hypo = None

                proj_child = projected_children.get(child.name)
                child_score_pct: float | None = None
                if proj_child and proj_child.raw_score is not None and proj_child.total_score is not None:
                    child_score_pct = round(
                        calculate_assessment_percent(proj_child.raw_score, proj_child.total_score), 2
                    )

                child_entries.append({
                    "name": child.name,
                    "weight": child.weight,
                    "graded": child_graded,
                    "source": child_source,
                    "hypothetical_score": child_hypo,
                    "score_percent": child_score_pct,
                    "is_mandatory_pass": False,
                    "pass_threshold": None,
                    "pass_status": None,
                })
            entry["children"] = child_entries

        whatif_breakdown.append(entry)

    mandatory_pass_warnings: list[str] = []
    for requirement in mandatory_pass_status.get("requirements", []):
        if requirement.get("status") != "failed":
            continue
        assessment_name = str(requirement.get("assessment_name", ""))
        if not any(
            scenario_name == assessment_name
            or scenario_name.startswith(f"{assessment_name}::")
            for scenario_name in scenario_map
        ):
            continue

        actual_percent = requirement.get("actual_percent")
        actual_display = (
            f"{float(actual_percent):.1f}%"
            if isinstance(actual_percent, (int, float))
            else "ungraded"
        )
        threshold = float(requirement.get("threshold", 50.0))
        mandatory_pass_warnings.append(
            f"Warning: Score of {actual_display} on {assessment_name} "
            f"is below the mandatory pass threshold of {threshold:.1f}%."
        )

    if 0 < core_weight < 100:
        norm_factor = 100.0 / core_weight
        projected_normalised = round(
            projected_totals["core_total"] * norm_factor + projected_totals["bonus_total"], 2
        )
        maximum_possible_normalised = round(
            max_totals["core_total"] * norm_factor + max_totals["bonus_total"], 2
        )
        current_normalised = round(
            current_totals["core_total"] * norm_factor + current_totals["bonus_total"], 2
        )
    else:
        projected_normalised = round(projected, 2)
        maximum_possible_normalised = round(max_possible, 2)
        current_normalised = round(current_totals["final_total"], 2)

    return {
        "course_name": course.name,
        "projected_grade": round(projected, 2),
        "maximum_possible": round(max_possible, 2),
        "current_grade": round(current_totals["final_total"], 2),
        "projected_normalised": projected_normalised,
        "maximum_possible_normalised": maximum_possible_normalised,
        "current_normalised": current_normalised,
        "normalisation_applied": 0 < core_weight < 100,
        "core_weight": round(core_weight, 2),
        "bonus_weight": round(bonus_weight, 2),
        "current_core_grade": round(current_totals["core_total"], 2),
        "current_bonus_contribution": round(current_totals["bonus_total"], 2),
        "projected_core_grade": round(projected_totals["core_total"], 2),
        "projected_bonus_contribution": round(projected_totals["bonus_total"], 2),
        "maximum_core_grade": round(max_totals["core_total"], 2),
        "maximum_bonus_contribution": round(max_totals["bonus_total"], 2),
        "scenarios_applied": len(scenario_map),
        "mandatory_pass_status": mandatory_pass_status,
        "mandatory_pass_warnings": mandatory_pass_warnings,
        "york_equivalent_projected": get_york_grade(projected),
        "gpa_projected": convert_percentage_all_scales(projected),
        "breakdown": whatif_breakdown,
    }


# ─── Learning Strategy Suggestions ───────────────────────────────────────────

# Assessment-type → technique mapping
_TYPE_KEYWORDS: dict[str, list[str]] = {
    "exam":          ["final", "exam", "midterm", "term test"],
    "quiz":          ["quiz", "quizzes"],
    "assignment":    ["assignment", "homework", "hw", "deliverable", "report"],
    "project":       ["project", "capstone"],
    "presentation":  ["presentation", "viva"],
    "lab":           ["lab", "tutorial"],
    "participation": ["participation", "activity", "attendance"],
}

_TECHNIQUE_DB: dict[str, dict[str, Any]] = {
    "active_recall": {
        "name": "Active Recall",
        "description": (
            "Test yourself without looking at notes. Use flashcards, practice "
            "questions, or blank-page recall to strengthen memory retrieval."
        ),
        "best_for": ["exams", "quizzes", "term tests"],
    },
    "spaced_repetition": {
        "name": "Spaced Repetition",
        "description": (
            "Review material at increasing intervals (1 day → 3 days → 7 days → …). "
            "Tools like Anki automate the schedule."
        ),
        "best_for": ["long-term retention", "cumulative exams"],
    },
    "feynman_technique": {
        "name": "Feynman Technique",
        "description": (
            "Explain the concept in simple language as if teaching a 12-year-old. "
            "Identify gaps, re-study, and simplify again."
        ),
        "best_for": ["assignments", "reports", "conceptual topics"],
    },
    "pareto_80_20": {
        "name": "80/20 Rule (Pareto Principle)",
        "description": (
            "Identify the 20 % of topics that account for 80 % of the mark. "
            "Prioritise high-weight, high-frequency material first."
        ),
        "best_for": ["high-weight assessments", "time-constrained study"],
    },
    "practice_problems": {
        "name": "Practice Problems / Past Papers",
        "description": (
            "Work through previous exam papers and problem sets under timed "
            "conditions to build speed and pattern recognition."
        ),
        "best_for": ["exams", "quizzes", "problem-solving courses"],
    },
    "pomodoro": {
        "name": "Pomodoro Technique",
        "description": (
            "Study in focused 25-minute blocks with 5-minute breaks. "
            "After four blocks, take a longer 15-30 minute break."
        ),
        "best_for": ["any assessment", "maintaining focus"],
    },
}

_PRIORITY_RANK = {
    "critical": 4,
    "high": 3,
    "medium": 2,
    "low": 1,
}


def _classify_assessment_type(name: str) -> str:
    """Heuristic: classify an assessment by its name into a broad type."""
    lower = name.lower()
    for atype, keywords in _TYPE_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return atype
    return "general"


def _priority_rank(priority: str) -> int:
    return _PRIORITY_RANK.get(priority, 0)


def _days_until(due_date_str: str | None) -> int | None:
    """Parse an ISO date string and return days from today, or None."""
    if not due_date_str:
        return None
    try:
        due = datetime.fromisoformat(due_date_str).date()
        return (due - date.today()).days
    except (ValueError, TypeError):
        return None


def _summarise_weakest_graded_assessment(course: CourseCreate) -> dict[str, Any] | None:
    weakest: dict[str, Any] | None = None
    for assessment in course.assessments:
        if not _is_assessment_fully_graded(assessment):
            continue
        if getattr(assessment, "is_bonus", False):
            continue
        if assessment.raw_score is None or assessment.total_score is None:
            continue

        percent = round(
            calculate_assessment_percent(assessment.raw_score, assessment.total_score),
            1,
        )
        candidate = {
            "name": assessment.name,
            "percent": percent,
            "type": _classify_assessment_type(assessment.name),
            "weight": assessment.weight,
        }
        if weakest is None or percent < weakest["percent"]:
            weakest = candidate
    return weakest


def _merge_unique_techniques(techniques: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[str, dict[str, Any]] = {}
    for technique in techniques:
        key = technique["name"]
        existing = deduped.get(key)
        if existing is None:
            deduped[key] = technique
            continue

        existing_rank = _priority_rank(existing.get("priority", ""))
        candidate_rank = _priority_rank(technique.get("priority", ""))
        if candidate_rank > existing_rank:
            deduped[key] = technique
            continue
        if candidate_rank == existing_rank and len(technique.get("reason", "")) > len(existing.get("reason", "")):
            deduped[key] = technique

    return sorted(
        deduped.values(),
        key=lambda technique: (
            -_priority_rank(technique.get("priority", "")),
            technique.get("name", ""),
        ),
    )


def _build_deadline_fallback_suggestions(
    deadlines: list[dict[str, Any]] | None,
    target_grade: float | None = None,
    current_grade: float | None = None,
    weakest_graded: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    if not deadlines:
        course_review_reason = "No ungraded assessments were detected, so use retrieval practice to keep core material fresh."
        if target_grade is not None and current_grade is not None and target_grade > current_grade:
            gap = round(target_grade - current_grade, 1)
            course_review_reason = (
                f"You are about {gap} points below your {target_grade:.1f}% target, so keep reviewing core material to stay ready for the next graded opportunity."
            )
        return [
            {
                "assessment_name": "General Course Review",
                "assessment_type": "general",
                "weight": 0.0,
                "days_until_due": None,
                "due_date": None,
                "target_grade": target_grade,
                "current_grade": current_grade,
                "target_gap": round(max((target_grade or 0) - (current_grade or 0), 0), 1)
                if target_grade is not None and current_grade is not None
                else None,
                "weakest_area": weakest_graded,
                "techniques": [
                    {
                        **_TECHNIQUE_DB["active_recall"],
                        "reason": course_review_reason,
                        "priority": "medium",
                    },
                    {
                        **_TECHNIQUE_DB["spaced_repetition"],
                        "reason": "Use spaced review to retain the most important course concepts over time.",
                        "priority": "medium",
                    },
                    {
                        **_TECHNIQUE_DB["pomodoro"],
                        "reason": "Short focused sessions help rebuild momentum when there is no single urgent assessment driving the plan.",
                        "priority": "low",
                    },
                ],
            }
        ]

    normalized_deadlines: list[dict[str, Any]] = []
    for item in deadlines:
        title = (item.get("assessment_name") or item.get("title") or "Upcoming deadline").strip()
        due_date = item.get("due_date")
        days_left = _days_until(due_date)
        normalized_deadlines.append(
            {
                "title": title,
                "due_date": due_date,
                "days_left": days_left,
                "type": _classify_assessment_type(title),
            }
        )

    normalized_deadlines.sort(
        key=lambda item: item["days_left"] if item["days_left"] is not None else 10**9
    )
    nearest = normalized_deadlines[0]
    days_left = nearest["days_left"]
    target_gap = None
    if target_grade is not None and current_grade is not None:
        target_gap = round(max(target_grade - current_grade, 0), 1)

    techniques: list[dict[str, Any]] = []
    if days_left is not None and days_left <= 3:
        techniques.append(
            {
                **_TECHNIQUE_DB["pareto_80_20"],
                "reason": f"'{nearest['title']}' is due in {days_left} day(s) — focus only on the highest-yield material right now.",
                "priority": "critical",
            }
        )
        techniques.append(
            {
                **_TECHNIQUE_DB["pomodoro"],
                "reason": "Use short, intense work blocks to finish preparation without burning out.",
                "priority": "high",
            }
        )
    elif days_left is not None and days_left <= 7:
        techniques.append(
            {
                **_TECHNIQUE_DB["active_recall"],
                "reason": f"'{nearest['title']}' is coming up in {days_left} days — rapid retrieval practice gives the best short-term payoff.",
                "priority": "high",
            }
        )
        techniques.append(
            {
                **_TECHNIQUE_DB["practice_problems"],
                "reason": "Timed drills and worked examples are the fastest way to expose weak spots before the deadline.",
                "priority": "medium",
            }
        )
    else:
        techniques.append(
            {
                **_TECHNIQUE_DB["spaced_repetition"],
                "reason": "There is still enough runway to use spaced review instead of cramming.",
                "priority": "medium",
            }
        )
        techniques.append(
            {
                **_TECHNIQUE_DB["pomodoro"],
                "reason": "Break the work into regular study blocks to build consistent progress.",
                "priority": "low",
            }
        )

    if nearest["type"] in {"exam", "quiz"}:
        techniques.append(
            {
                **_TECHNIQUE_DB["active_recall"],
                "reason": f"'{nearest['title']}' looks assessment-heavy, so self-testing should be a core part of prep.",
                "priority": "high",
            }
        )
    elif nearest["type"] in {"assignment", "project", "presentation"}:
        techniques.append(
            {
                **_TECHNIQUE_DB["feynman_technique"],
                "reason": f"'{nearest['title']}' likely rewards explanation and understanding more than memorisation.",
                "priority": "high",
            }
        )

    if target_gap is not None and target_gap >= 5:
        techniques.append(
            {
                **_TECHNIQUE_DB["pareto_80_20"],
                "reason": f"You are roughly {target_gap} points below your target, so prioritise only the highest-yield tasks tied to '{nearest['title']}'.",
                "priority": "high" if target_gap < 12 else "critical",
            }
        )

    if weakest_graded is not None:
        techniques.append(
            {
                **_TECHNIQUE_DB["active_recall"],
                "reason": f"Your weakest completed area so far was {weakest_graded['name']} ({weakest_graded['percent']}%), so revisit those mistakes before the next deadline.",
                "priority": "medium",
            }
        )
    unique_techniques = _merge_unique_techniques(techniques)

    return [
        {
            "assessment_name": nearest["title"],
            "assessment_type": nearest["type"],
            "weight": 0.0,
            "days_until_due": nearest["days_left"],
            "due_date": nearest["due_date"],
            "target_grade": target_grade,
            "current_grade": current_grade,
            "target_gap": target_gap,
            "weakest_area": weakest_graded,
            "techniques": unique_techniques,
        }
    ]


def suggest_learning_strategies(
    course: CourseCreate,
    deadlines: list[dict[str, Any]] | None = None,
    target_grade: float | None = None,
    current_grade: float | None = None,
) -> list[dict[str, Any]]:
    """
    Return per-assessment learning technique suggestions based on:
    1. Assessment type (exam → Active Recall, assignment → Feynman, etc.)
    2. Time remaining until deadline (< 7 days → high-yield focus)
    3. Weight of assessment (≥ 20 % → 80/20 rule recommended)
    """
    deadline_map: dict[str, str] = {}
    if deadlines:
        for d in deadlines:
            aname = d.get("assessment_name") or d.get("title", "")
            ddate = d.get("due_date")
            if aname and ddate:
                deadline_map[aname.lower()] = ddate

    if current_grade is None:
        current_grade = round(calculate_course_totals(course)["final_total"], 2)

    weakest_graded = _summarise_weakest_graded_assessment(course)
    target_gap = None
    if target_grade is not None:
        target_gap = round(max(target_grade - current_grade, 0), 1)

    suggestions: list[dict[str, Any]] = []

    for a in course.assessments:
        if _is_assessment_fully_graded(a):
            continue  # already done — no study advice needed

        atype = _classify_assessment_type(a.name)
        due_date_str = deadline_map.get(a.name.lower())
        days_left = _days_until(due_date_str)

        techniques: list[dict[str, Any]] = []

        # ── Weight-based: 80/20 for high-weight items ──
        if a.weight >= 20:
            techniques.append({
                **_TECHNIQUE_DB["pareto_80_20"],
                "reason": f"High weight ({a.weight}%) — focus on highest-yield topics first.",
                "priority": "high",
            })

        if target_gap is not None and target_gap >= 5:
            pressure_priority = "critical" if target_gap >= 12 and a.weight >= 20 else "high"
            techniques.append({
                **_TECHNIQUE_DB["pareto_80_20"],
                "reason": f"You are about {target_gap} points below your {target_grade:.1f}% target, so '{a.name}' is a strong place to recover marks.",
                "priority": pressure_priority,
            })

        # ── Type-based suggestions ──
        if atype in ("exam", "quiz"):
            techniques.append({
                **_TECHNIQUE_DB["active_recall"],
                "reason": f"'{a.name}' is a {atype} — retrieval practice is the most effective study method.",
                "priority": "high",
            })
            techniques.append({
                **_TECHNIQUE_DB["practice_problems"],
                "reason": "Past papers and timed practice build exam-readiness.",
                "priority": "medium",
            })
        elif atype in ("assignment", "project"):
            techniques.append({
                **_TECHNIQUE_DB["feynman_technique"],
                "reason": f"'{a.name}' is a {atype} — deep understanding helps produce better work.",
                "priority": "high",
            })
        elif atype == "presentation":
            techniques.append({
                **_TECHNIQUE_DB["feynman_technique"],
                "reason": "Explaining concepts simply is the core of a good presentation.",
                "priority": "high",
            })

        if weakest_graded is not None:
            weakest_reason = (
                f"Your weakest completed assessment so far was {weakest_graded['name']} ({weakest_graded['percent']}%), so use '{a.name}' to correct that pattern early."
            )
            if atype in ("exam", "quiz") or weakest_graded["type"] in ("exam", "quiz"):
                techniques.append({
                    **_TECHNIQUE_DB["active_recall"],
                    "reason": weakest_reason,
                    "priority": "high" if weakest_graded["percent"] < 70 else "medium",
                })
            else:
                techniques.append({
                    **_TECHNIQUE_DB["feynman_technique"],
                    "reason": weakest_reason,
                    "priority": "medium",
                })

        # ── Time-based suggestions ──
        if days_left is not None:
            if days_left <= 3:
                techniques.append({
                    **_TECHNIQUE_DB["pareto_80_20"],
                    "reason": f"Only {days_left} day(s) left — focus on the highest-value 20% of content.",
                    "priority": "critical",
                })
            elif days_left <= 7:
                techniques.append({
                    **_TECHNIQUE_DB["active_recall"],
                    "reason": f"{days_left} days left — intensive recall practice is most efficient now.",
                    "priority": "high",
                })
                techniques.append({
                    **_TECHNIQUE_DB["pomodoro"],
                    "reason": "Use focused study blocks to maximise retention in limited time.",
                    "priority": "medium",
                })
            elif days_left <= 21:
                techniques.append({
                    **_TECHNIQUE_DB["spaced_repetition"],
                    "reason": f"{days_left} days left — enough time to benefit from spaced review intervals.",
                    "priority": "medium",
                })
            # > 21 days — general techniques already covered

        # Fallback: if nothing matched, suggest general techniques
        if not techniques:
            techniques.append({
                **_TECHNIQUE_DB["active_recall"],
                "reason": "General recommendation: active recall is effective for all assessment types.",
                "priority": "medium",
            })
            techniques.append({
                **_TECHNIQUE_DB["spaced_repetition"],
                "reason": "Start reviewing early with spaced intervals for long-term retention.",
                "priority": "low",
            })

        unique_techniques = _merge_unique_techniques(techniques)

        suggestions.append({
            "assessment_name": a.name,
            "assessment_type": atype,
            "weight": a.weight,
            "days_until_due": days_left,
            "due_date": due_date_str,
            "target_grade": target_grade,
            "current_grade": current_grade,
            "target_gap": target_gap,
            "weakest_area": weakest_graded,
            "techniques": unique_techniques,
        })

    if suggestions:
        return sorted(
            suggestions,
            key=lambda item: (
                item["days_until_due"] is None,
                item["days_until_due"] if item["days_until_due"] is not None else 10**9,
                -item["weight"],
                item["assessment_name"].lower(),
            ),
        )

    return _build_deadline_fallback_suggestions(
        deadlines,
        target_grade=target_grade,
        current_grade=current_grade,
        weakest_graded=weakest_graded,
    )
