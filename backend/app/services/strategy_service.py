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
from datetime import date, datetime
from typing import Any

from app.models import Assessment, CourseCreate
from app.services.grading_service import (
    calculate_course_totals,
    compute_assessment_contribution,
    _compute_remaining_potential,
    _is_assessment_fully_graded,
    calculate_assessment_percent,
    get_york_grade,
)
from app.services.gpa_service import convert_percentage_all_scales


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

    for a in course.assessments:
        is_bonus = getattr(a, "is_bonus", False)
        current = compute_assessment_contribution(a, missing_percent=0.0)
        maximum = compute_assessment_contribution(a, missing_percent=100.0)
        remaining = max(0.0, maximum - current)
        graded = _is_assessment_fully_graded(a)

        entry: dict[str, Any] = {
            "name": a.name,
            "weight": a.weight,
            "is_bonus": is_bonus,
            "graded": graded,
            "current_contribution": round(current, 4),
            "max_contribution": round(maximum, 4),
            "remaining_potential": round(remaining, 4),
        }

        if graded and not a.children:
            assert a.raw_score is not None and a.total_score is not None
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
        "graded_weight": round(graded_weight, 2),
        "remaining_weight": round(remaining_weight, 2),
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
    for s in scenarios:
        name = s.get("assessment_name", "")
        score = s.get("score", 0.0)
        if not name:
            continue
        # Validate name exists
        if not any(a.name == name for a in course.assessments):
            raise ValueError(f"Assessment '{name}' not found in course '{course.name}'")
        scenario_map[name] = score

    # ── Compute projected grade ──
    projected = 0.0
    max_possible = 0.0
    whatif_breakdown: list[dict[str, Any]] = []
    core_weight = sum(
        a.weight for a in course.assessments if not getattr(a, "is_bonus", False)
    )
    bonus_weight = sum(
        a.weight for a in course.assessments if getattr(a, "is_bonus", False)
    )

    for a in course.assessments:
        is_bonus = getattr(a, "is_bonus", False)
        graded = _is_assessment_fully_graded(a)

        if a.name in scenario_map:
            # Apply hypothetical score
            hyp_pct = scenario_map[a.name]
            contribution = compute_assessment_contribution(a, missing_percent=hyp_pct)
            max_contribution = compute_assessment_contribution(a, missing_percent=hyp_pct)
            source = "whatif"
        elif graded:
            # Already graded — use actual
            contribution = compute_assessment_contribution(a, missing_percent=0.0)
            max_contribution = contribution
            source = "actual"
        else:
            # Ungraded, not in scenario — 0 for projected, 100 for max
            contribution = 0.0
            max_contribution = compute_assessment_contribution(a, missing_percent=100.0)
            source = "remaining"

        projected += contribution
        max_possible += max_contribution

        whatif_breakdown.append({
            "name": a.name,
            "weight": a.weight,
            "is_bonus": is_bonus,
            "source": source,
            "contribution": round(contribution, 4),
            "max_contribution": round(max_contribution, 4),
            "hypothetical_score": scenario_map.get(a.name),
        })

    current_totals = calculate_course_totals(course)

    if 0 < core_weight < 100:
        norm_factor = 100.0 / core_weight
        projected_normalised = round(projected * norm_factor, 2)
        maximum_possible_normalised = round(max_possible * norm_factor, 2)
        current_normalised = round(current_totals["final_total"] * norm_factor, 2)
    else:
        projected_normalised = round(projected, 2)
        maximum_possible_normalised = round(max_possible, 2)
        current_normalised = round(current_totals["final_total"], 2)

    return {
        "course_name": course.name,
        "projected_grade": round(projected, 2),
        "maximum_possible": round(max_possible, 2),
        "current_grade": current_totals["final_total"],
        "projected_normalised": projected_normalised,
        "maximum_possible_normalised": maximum_possible_normalised,
        "current_normalised": current_normalised,
        "normalisation_applied": 0 < core_weight < 100,
        "core_weight": round(core_weight, 2),
        "bonus_weight": round(bonus_weight, 2),
        "scenarios_applied": len(scenario_map),
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


def _classify_assessment_type(name: str) -> str:
    """Heuristic: classify an assessment by its name into a broad type."""
    lower = name.lower()
    for atype, keywords in _TYPE_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return atype
    return "general"


def _days_until(due_date_str: str | None) -> int | None:
    """Parse an ISO date string and return days from today, or None."""
    if not due_date_str:
        return None
    try:
        due = datetime.fromisoformat(due_date_str).date()
        return (due - date.today()).days
    except (ValueError, TypeError):
        return None


def suggest_learning_strategies(
    course: CourseCreate,
    deadlines: list[dict[str, Any]] | None = None,
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

        # De-duplicate by technique name (keep highest priority)
        seen: set[str] = set()
        unique_techniques: list[dict[str, Any]] = []
        for t in techniques:
            if t["name"] not in seen:
                seen.add(t["name"])
                unique_techniques.append(t)

        suggestions.append({
            "assessment_name": a.name,
            "assessment_type": atype,
            "weight": a.weight,
            "days_until_due": days_left,
            "due_date": due_date_str,
            "techniques": unique_techniques,
        })

    return suggestions
