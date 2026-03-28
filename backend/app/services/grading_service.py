from typing import Any
from uuid import UUID

from app.models import CourseCreate

CHILD_ASSESSMENT_SEPARATOR = "::"

YORKU_SCALE = [
    {"letter": "A+", "min": 90, "point": 9, "desc": "Exceptional"},
    {"letter": "A", "min": 80, "point": 8, "desc": "Excellent"},
    {"letter": "B+", "min": 75, "point": 7, "desc": "Very Good"},
    {"letter": "B", "min": 70, "point": 6, "desc": "Good"},
    {"letter": "C+", "min": 65, "point": 5, "desc": "Competent"},
    {"letter": "C", "min": 60, "point": 4, "desc": "Fairly Competent"},
    {"letter": "D+", "min": 55, "point": 3, "desc": "Passing"},
    {"letter": "D", "min": 50, "point": 2, "desc": "Marginally Passing"},
    {"letter": "E", "min": 40, "point": 1, "desc": "Marginally Failing"},
    {"letter": "F", "min": 0, "point": 0, "desc": "Failing"},
]


def calculate_assessment_percent(raw_score: float, total_score: float) -> float:
    return (raw_score / total_score) * 100


def _resolve_percent(raw_score: float | None, total_score: float | None, *, missing_percent: float) -> float:
    if raw_score is None or total_score is None:
        return missing_percent
    return calculate_assessment_percent(raw_score, total_score)


def _normalize_assessment_name(assessment_name: str) -> str:
    return assessment_name.strip()


def _split_assessment_path(assessment_name: str) -> tuple[str, str | None]:
    normalized = _normalize_assessment_name(assessment_name)
    if CHILD_ASSESSMENT_SEPARATOR not in normalized:
        return normalized, None

    parent_name, child_name = normalized.split(CHILD_ASSESSMENT_SEPARATOR, 1)
    parent_name = parent_name.strip()
    child_name = child_name.strip()
    if not parent_name or not child_name:
        raise ValueError(
            f"Invalid assessment path '{assessment_name}'. "
            f"Use '{CHILD_ASSESSMENT_SEPARATOR}' as Parent{CHILD_ASSESSMENT_SEPARATOR}Child."
        )
    return parent_name, child_name


def _target_label(parent_name: str, child_name: str | None) -> str:
    if child_name is None:
        return parent_name
    return f"{parent_name}{CHILD_ASSESSMENT_SEPARATOR}{child_name}"


def resolve_assessment_target(course: CourseCreate, assessment_name: str):
    parent_name, child_name = _split_assessment_path(assessment_name)

    if child_name is not None:
        for assessment in course.assessments:
            if assessment.name != parent_name:
                continue
            for child in assessment.children or []:
                if child.name == child_name:
                    return assessment, child
            raise ValueError(
                f"Child assessment '{child_name}' not found under '{parent_name}'"
            )
        raise ValueError(f"Assessment '{parent_name}' not found")

    for assessment in course.assessments:
        if assessment.name == parent_name:
            return assessment, None

    child_matches: list[tuple] = []
    for assessment in course.assessments:
        for child in assessment.children or []:
            if child.name == parent_name:
                child_matches.append((assessment, child))

    if len(child_matches) == 1:
        return child_matches[0]
    if len(child_matches) > 1:
        raise ValueError(
            f"Assessment name '{assessment_name}' is ambiguous across multiple parent assessments. "
            f"Use '{CHILD_ASSESSMENT_SEPARATOR}' path syntax (Parent{CHILD_ASSESSMENT_SEPARATOR}Child)."
        )

    raise ValueError(f"Assessment '{assessment_name}' not found")


def resolve_assessment_target_by_id(course: CourseCreate, assessment_id: UUID | str):
    normalized_id = str(assessment_id)
    for assessment in course.assessments:
        if assessment.assessment_id is not None and str(assessment.assessment_id) == normalized_id:
            return assessment, None
        for child in assessment.children or []:
            if child.assessment_id is not None and str(child.assessment_id) == normalized_id:
                return assessment, child
    raise ValueError(f"Assessment '{assessment_id}' not found")


def _is_target_fully_graded(parent, child) -> bool:
    if child is not None:
        return child.raw_score is not None and child.total_score is not None
    return _is_assessment_fully_graded(parent)


def _get_target_weight(parent, child) -> float:
    if child is not None:
        return float(child.weight)
    return float(parent.weight)


def apply_hypothetical_score(course: CourseCreate, assessment_name: str, score: float):
    parent, child = resolve_assessment_target(course, assessment_name)
    safe_score = max(0.0, min(100.0, float(score)))

    if child is not None:
        child.raw_score = safe_score
        child.total_score = 100.0
        return

    if parent.children:
        for child_assessment in parent.children:
            child_assessment.raw_score = safe_score
            child_assessment.total_score = 100.0

    parent.raw_score = safe_score
    parent.total_score = 100.0


def fill_remaining_ungraded_scores(
    course: CourseCreate,
    *,
    missing_percent: float,
    exclude_assessment_name: str | None = None,
):
    safe_percent = max(0.0, min(100.0, float(missing_percent)))
    excluded_parent: str | None = None
    excluded_child: str | None = None

    if exclude_assessment_name and exclude_assessment_name.strip():
        excluded_parent, excluded_child = _split_assessment_path(exclude_assessment_name)

    for assessment in course.assessments:
        if excluded_parent is not None and assessment.name == excluded_parent and excluded_child is None:
            continue

        children = assessment.children or []
        if children:
            for child in children:
                if (
                    excluded_parent is not None
                    and excluded_child is not None
                    and assessment.name == excluded_parent
                    and child.name == excluded_child
                ):
                    continue

                if child.raw_score is None or child.total_score is None:
                    child.raw_score = safe_percent
                    child.total_score = 100.0
            continue

        if assessment.raw_score is None or assessment.total_score is None:
            assessment.raw_score = safe_percent
            assessment.total_score = 100.0


def _get_best_count(assessment) -> int:
    if assessment.rule_type != "best_of":
        return len(assessment.children or [])
    config = assessment.rule_config or {}
    try:
        best_count = int(config.get("best_count", config.get("best")))
    except (TypeError, ValueError):
        return len(assessment.children or [])
    if best_count <= 0:
        return len(assessment.children or [])
    return min(best_count, len(assessment.children or []))


def _get_drop_count(assessment) -> int:
    if assessment.rule_type != "drop_lowest":
        return 0
    config = assessment.rule_config or {}
    try:
        drop_count = int(config.get("drop_count", 1))
    except (TypeError, ValueError):
        drop_count = 1
    if drop_count < 0:
        drop_count = 1
    return drop_count


def _is_assessment_fully_graded(assessment) -> bool:
    if assessment.children:
        return all(child.raw_score is not None and child.total_score is not None for child in assessment.children)
    return assessment.raw_score is not None and assessment.total_score is not None


def compute_assessment_contribution(assessment, *, missing_percent: float = 0.0) -> float:
    if assessment.children:
        child_percentages: list[tuple[float, float]] = []
        for child in assessment.children:
            percent = _resolve_percent(
                child.raw_score,
                child.total_score,
                missing_percent=missing_percent,
            )
            child_percentages.append((percent, child.weight))

        if assessment.rule_type == "best_of":
            best_count = _get_best_count(assessment)
            child_percentages.sort(key=lambda item: item[0], reverse=True)
            child_percentages = child_percentages[:best_count]
        elif assessment.rule_type == "drop_lowest":
            drop_count = _get_drop_count(assessment)
            best_count = len(child_percentages) - drop_count
            if best_count <= 0:
                return 0.0
            child_percentages.sort(key=lambda item: item[0], reverse=True)
            child_percentages = child_percentages[:best_count]

        contribution = sum((percent * weight) / 100 for percent, weight in child_percentages)
        return float(contribution)

    percent = _resolve_percent(
        assessment.raw_score,
        assessment.total_score,
        missing_percent=missing_percent,
    )
    return float((percent * assessment.weight) / 100)


def _compute_assessment_max_contribution(assessment) -> float:
    return compute_assessment_contribution(assessment, missing_percent=100.0)


def _compute_remaining_potential(assessment) -> float:
    current = compute_assessment_contribution(assessment)
    maximum = _compute_assessment_max_contribution(assessment)
    return max(0.0, maximum - current)


def _get_mandatory_pass_threshold(assessment) -> float:
    config = assessment.rule_config or {}
    try:
        threshold = float(config.get("pass_threshold", 50))
    except (TypeError, ValueError):
        return 50.0
    return threshold


def _get_assessment_percent(assessment) -> float | None:
    if assessment.children:
        if not _is_assessment_fully_graded(assessment):
            return None
        contribution = compute_assessment_contribution(assessment)
        if assessment.weight <= 0:
            return 0.0
        return float((contribution / assessment.weight) * 100)

    if assessment.raw_score is None or assessment.total_score is None:
        return None
    return float(calculate_assessment_percent(assessment.raw_score, assessment.total_score))


def evaluate_mandatory_pass_requirements(course: CourseCreate) -> dict[str, object]:
    requirements: list[dict[str, object]] = []
    pending_assessments: list[str] = []
    failed_assessments: list[str] = []

    for assessment in course.assessments:
        if assessment.rule_type != "mandatory_pass":
            continue

        threshold = float(_get_mandatory_pass_threshold(assessment))
        percent = _get_assessment_percent(assessment)

        if percent is None:
            status = "pending"
            pending_assessments.append(assessment.name)
        elif percent >= threshold:
            status = "passed"
        else:
            status = "failed"
            failed_assessments.append(assessment.name)

        requirements.append(
            {
                "assessment_name": assessment.name,
                "threshold": threshold,
                "status": status,
                "percent": None if percent is None else float(percent),
            }
        )

    has_requirements = bool(requirements)
    requirements_met = has_requirements and not pending_assessments and not failed_assessments

    return {
        "has_requirements": has_requirements,
        "requirements_met": requirements_met,
        "pending_assessments": pending_assessments,
        "failed_assessments": failed_assessments,
        "requirements": requirements,
    }


def _get_bonus_policy(course: CourseCreate) -> str:
    raw_policy = getattr(course, "bonus_policy", "none")
    if not isinstance(raw_policy, str):
        return "none"
    normalized = raw_policy.strip().lower()
    if normalized not in {"none", "additive", "capped"}:
        return "none"
    return normalized


def _apply_bonus_policy(
    course: CourseCreate,
    *,
    core_total: float,
    bonus_total: float,
) -> float:
    policy = _get_bonus_policy(course)
    if policy == "none":
        return float(core_total)

    final_total = float(core_total + bonus_total)
    if policy != "capped":
        return final_total

    bonus_cap = getattr(course, "bonus_cap_percentage", None)
    if bonus_cap is None:
        return final_total
    return min(final_total, float(bonus_cap))


def _summarize_mandatory_pass_state(course: CourseCreate) -> tuple[str, dict[str, object], bool]:
    details = evaluate_mandatory_pass_requirements(course)
    failed_assessments = list(details.get("failed_assessments", []))
    pending_assessments = list(details.get("pending_assessments", []))

    if failed_assessments:
        return "failed", details, True
    if pending_assessments:
        return "pending", details, False
    return "passed", details, False


def _calculate_grading_result(
    course: CourseCreate,
    *,
    missing_percent: float = 0.0,
) -> dict[str, Any]:
    core_total = 0.0
    bonus_total = 0.0

    for assessment in course.assessments:
        contribution = compute_assessment_contribution(assessment, missing_percent=missing_percent)
        if getattr(assessment, "is_bonus", False):
            bonus_total += contribution
        else:
            core_total += contribution

    final_total = _apply_bonus_policy(
        course,
        core_total=core_total,
        bonus_total=bonus_total,
    )
    mandatory_pass_status, mandatory_pass_details, is_failed = _summarize_mandatory_pass_state(course)
    return {
        "core_total": round(core_total, 2),
        "bonus_total": round(bonus_total, 2),
        "final_total": round(final_total, 2),
        "mandatory_pass_status": mandatory_pass_status,
        "mandatory_pass_details": mandatory_pass_details,
        "is_failed": is_failed,
    }


def calculate_course_totals(course: CourseCreate, *, missing_percent: float = 0.0) -> dict[str, Any]:
    return _calculate_grading_result(course, missing_percent=missing_percent)


def calculate_current_standing(course: CourseCreate) -> float:
    totals = calculate_course_totals(course)
    return totals["final_total"]


def get_york_grade(percent: float) -> dict[str, float | str]:
    for band in YORKU_SCALE:
        if percent >= band["min"]:
            return {
                "letter": band["letter"],
                "grade_point": band["point"],
                "description": band["desc"],
            }
    return {
        "letter": "F",
        "grade_point": 0,
        "description": "Failing",
    }


def calculate_required_average_summary(
    current_standing: float,
    target_percentage: float,
    remaining_weight: float
) -> dict[str, float | str]:
    remaining_weight_display = (
        str(int(remaining_weight))
        if float(remaining_weight).is_integer()
        else str(remaining_weight)
    )
    required_points = target_percentage - current_standing

    if remaining_weight <= 0:
        return {
            "required_points": round(required_points, 2),
            "required_average": 0.0,
            "required_average_display": "0.0%",
            "required_fraction_display": (
                f"({max(required_points, 0):.2f} / {remaining_weight_display} remaining weight)"
            ),
            "classification": "Complete",
        }

    if required_points <= 0:
        return {
            "required_points": 0.0,
            "required_average": 0.0,
            "required_average_display": "0.0%",
            "required_fraction_display": (
                f"(0.00 / {remaining_weight_display} remaining weight)"
            ),
            "classification": "Already Achieved",
        }

    required_average = (required_points / remaining_weight) * 100

    if required_average > 100:
        classification = "Not Possible"
    elif required_average > 95:
        classification = "Very Challenging"
    elif required_average > 85:
        classification = "Challenging"
    elif required_average > 70:
        classification = "Achievable"
    else:
        classification = "Comfortable"

    return {
        "required_points": round(required_points, 2),
        "required_average": round(required_average, 1),
        "required_average_display": f"{required_average:.1f}%",
        "required_fraction_display": (
            f"({required_points:.2f} / {remaining_weight_display} remaining weight)"
        ),
        "classification": classification,
    }


def calculate_uniform_required(
    course: CourseCreate,
    target: float,
) -> dict[str, Any]:
    """
    Binary-search for the single percentage P such that scoring P% on every
    ungraded assessment reaches the target — computed through the real grading
    engine so best_of, drop_lowest, mandatory_pass, and pure_multiplicative
    are all respected.

    Returns the uniform required %, per-assessment breakdown, and feasibility.
    """
    current_totals = calculate_course_totals(course)
    current_standing = current_totals["final_total"]

    # Check if target is already achieved
    if current_standing >= target:
        return _build_uniform_result(
            course, target, current_standing,
            uniform_percent=0.0,
            is_achievable=True,
            classification="Already Achieved",
        )

    # Check if target is achievable at all (100% on everything remaining)
    max_course = course.model_copy(deep=True)
    fill_remaining_ungraded_scores(max_course, missing_percent=100.0)
    max_totals = calculate_course_totals(max_course)

    if max_totals["is_failed"] or max_totals["final_total"] + 1e-9 < target:
        return _build_uniform_result(
            course, target, current_standing,
            uniform_percent=101.0,
            is_achievable=False,
            classification="Not Possible",
            max_possible=max_totals["final_total"],
        )

    # Binary search: find the minimum uniform % that hits the target
    low, high = 0.0, 100.0
    for _ in range(40):
        mid = (low + high) / 2
        candidate = course.model_copy(deep=True)
        fill_remaining_ungraded_scores(candidate, missing_percent=mid)
        result = calculate_course_totals(candidate)
        if not result["is_failed"] and result["final_total"] >= target - 1e-9:
            high = mid
        else:
            low = mid

    uniform_percent = high

    if uniform_percent > 100:
        classification = "Not Possible"
    elif uniform_percent > 95:
        classification = "Very Challenging"
    elif uniform_percent > 85:
        classification = "Challenging"
    elif uniform_percent > 70:
        classification = "Achievable"
    else:
        classification = "Comfortable"

    return _build_uniform_result(
        course, target, current_standing,
        uniform_percent=uniform_percent,
        is_achievable=uniform_percent <= 100.0,
        classification=classification,
        max_possible=max_totals["final_total"],
    )


def _build_uniform_result(
    course: CourseCreate,
    target: float,
    current_standing: float,
    *,
    uniform_percent: float,
    is_achievable: bool,
    classification: str,
    max_possible: float | None = None,
) -> dict[str, Any]:
    """Build the response dict for calculate_uniform_required."""
    mandatory_status = evaluate_mandatory_pass_requirements(course)
    mandatory_lookup: dict[str, dict] = {
        req["assessment_name"]: req
        for req in mandatory_status.get("requirements", [])
        if isinstance(req.get("assessment_name"), str)
    }

    # Compute per-assessment contributions at the uniform rate
    projected_course = course.model_copy(deep=True)
    safe_percent = max(0.0, min(100.0, uniform_percent))
    fill_remaining_ungraded_scores(projected_course, missing_percent=safe_percent)
    projected_totals = calculate_course_totals(projected_course)

    assessments: list[dict[str, Any]] = []
    for original, projected in zip(course.assessments, projected_course.assessments):
        is_bonus = getattr(original, "is_bonus", False)
        is_mandatory = original.rule_type == "mandatory_pass"
        threshold = (
            float((original.rule_config or {}).get("pass_threshold", 50))
            if is_mandatory else None
        )
        mandatory_req = mandatory_lookup.get(original.name)

        children_list: list[dict[str, Any]] = []
        if original.children:
            for orig_child, proj_child in zip(original.children, projected.children):
                child_graded = (
                    orig_child.raw_score is not None
                    and orig_child.total_score is not None
                )
                child_contribution = (
                    (proj_child.raw_score / proj_child.total_score * proj_child.weight / 100)
                    if proj_child.raw_score is not None and proj_child.total_score is not None and proj_child.total_score > 0
                    else 0.0
                ) if proj_child.weight else 0.0
                children_list.append({
                    "name": orig_child.name,
                    "weight": orig_child.weight,
                    "graded": child_graded,
                    "uniform_percent": 0.0 if child_graded else round(safe_percent, 1),
                    "contribution": round(child_contribution * 100, 2),
                })

        fully_graded = _is_assessment_fully_graded(original)
        current_contrib = compute_assessment_contribution(original, missing_percent=0.0)
        projected_contrib = compute_assessment_contribution(projected, missing_percent=0.0)

        assessments.append({
            "name": original.name,
            "weight": original.weight,
            "is_bonus": is_bonus,
            "graded": fully_graded,
            "current_contribution": round(current_contrib, 4),
            "projected_contribution": round(projected_contrib, 4),
            "uniform_percent": 0.0 if fully_graded else round(safe_percent, 1),
            "is_mandatory_pass": is_mandatory,
            "pass_threshold": threshold,
            "pass_status": mandatory_req.get("status") if mandatory_req else None,
            "has_children": bool(original.children),
            "children": children_list if children_list else None,
        })

    return {
        "target": target,
        "current_standing": round(current_standing, 2),
        "uniform_required": round(uniform_percent, 1),
        "projected_total": round(projected_totals["final_total"], 2),
        "max_possible": round(max_possible, 2) if max_possible is not None else None,
        "is_achievable": is_achievable,
        "classification": classification,
        "assessments": assessments,
    }


def calculate_minimum_required_score(
    course: CourseCreate,
    target: float,
    assessment_name: str
) -> dict:
    """
    Calculate the minimum score needed on ONE specific assessment to achieve
    the target grade, assuming 100% on all OTHER remaining assessments.
    """
    target_assessment, target_child = resolve_assessment_target(course, assessment_name)
    target_path = _target_label(
        target_assessment.name,
        target_child.name if target_child is not None else None,
    )

    if _is_target_fully_graded(target_assessment, target_child):
        raise ValueError(f"Assessment '{assessment_name}' is already graded")

    current_result = calculate_course_totals(course)
    current_standing = current_result["final_total"]

    optimistic_course = course.model_copy(deep=True)
    fill_remaining_ungraded_scores(
        optimistic_course,
        missing_percent=100.0,
        exclude_assessment_name=target_path,
    )
    totals_without_target = calculate_course_totals(optimistic_course)
    points_after_others = totals_without_target["final_total"]
    other_remaining_max = max(0.0, points_after_others - current_standing)

    if totals_without_target["is_failed"]:
        return {
            "course_name": course.name,
            "assessment_name": target_path if target_path != assessment_name else assessment_name,
            "assessment_weight": _get_target_weight(target_assessment, target_child),
            "minimum_required": 101.0,
            "is_achievable": False,
            "current_standing": round(current_standing, 2),
            "other_remaining_assumed_max": round(other_remaining_max, 2),
            "target": target,
            "explanation": (
                "Target is not achievable because a mandatory pass assessment "
                "has already been failed."
            ),
            "is_failed": True,
        }

    points_needed = target - points_after_others

    maximum_course = optimistic_course.model_copy(deep=True)
    apply_hypothetical_score(maximum_course, target_path, 100.0)
    maximum_totals = calculate_course_totals(maximum_course)
    max_possible = maximum_totals["final_total"]
    target_pass_threshold = (
        _get_mandatory_pass_threshold(target_assessment)
        if target_assessment.rule_type == "mandatory_pass"
        else 0.0
    )

    if maximum_totals["is_failed"]:
        minimum_required = 101.0
        is_achievable = False
    elif points_needed <= 0:
        minimum_required = max(0.0, target_pass_threshold)
        is_achievable = True
    elif max_possible + 1e-9 < target:
        target_capacity = max(0.0, max_possible - points_after_others)
        if target_capacity <= 0:
            minimum_required = 101.0
        else:
            minimum_required = (points_needed / target_capacity) * 100
        is_achievable = False
    else:
        low = max(0.0, target_pass_threshold)
        high = 100.0
        for _ in range(30):
            mid = (low + high) / 2
            candidate_course = optimistic_course.model_copy(deep=True)
            apply_hypothetical_score(candidate_course, target_path, mid)
            candidate_result = calculate_course_totals(candidate_course)
            candidate_total = candidate_result["final_total"]
            if not candidate_result["is_failed"] and candidate_total >= target:
                high = mid
            else:
                low = mid
        minimum_required = high
        is_achievable = True

    display_name = target_path if target_path != assessment_name else assessment_name

    return {
        "course_name": course.name,
        "assessment_name": display_name,
        "assessment_weight": _get_target_weight(target_assessment, target_child),
        "minimum_required": round(minimum_required, 1),
        "is_achievable": is_achievable,
        "current_standing": round(current_standing, 2),
        "other_remaining_assumed_max": round(other_remaining_max, 2),
        "target": target,
        "is_failed": False,
        "explanation": (
            f"You need at least {round(minimum_required, 1)}% on {display_name} "
            f"to reach {target}% (assuming 100% on all other remaining assessments)."
            if is_achievable
            else (
                f"Target {target}% is not achievable. Even with 100% on "
                f"{display_name} and all other remaining assessments, "
                f"maximum is {round(max_possible, 1)}%."
            )
        )
    }


def calculate_whatif_scenario(
    course: CourseCreate,
    assessment_name: str,
    hypothetical_score: float
) -> dict:
    """
    Calculate the resulting final grade if a hypothetical score is achieved
    on ONE remaining assessment. This is read-only and does NOT persist.
    """
    target_assessment, target_child = resolve_assessment_target(course, assessment_name)
    target_path = _target_label(
        target_assessment.name,
        target_child.name if target_child is not None else None,
    )

    if _is_target_fully_graded(target_assessment, target_child):
        raise ValueError(f"Assessment '{assessment_name}' is already graded")

    current_standing = calculate_current_standing(course)
    current_result = calculate_course_totals(course)

    projected_course = course.model_copy(deep=True)
    apply_hypothetical_score(projected_course, target_path, hypothetical_score)
    projected_totals = calculate_course_totals(projected_course)
    projected_grade = projected_totals["final_total"]

    baseline_target_course = course.model_copy(deep=True)
    apply_hypothetical_score(baseline_target_course, target_path, 0.0)
    baseline_target_total = calculate_course_totals(baseline_target_course)["final_total"]
    hypothetical_contribution = projected_grade - baseline_target_total

    maximum_course = projected_course.model_copy(deep=True)
    fill_remaining_ungraded_scores(maximum_course, missing_percent=100.0)
    maximum_totals = calculate_course_totals(maximum_course)
    maximum_possible = maximum_totals["final_total"]
    remaining_potential = max(0.0, maximum_possible - projected_grade)

    display_name = target_path if target_path != assessment_name else assessment_name

    return {
        "course_name": course.name,
        "assessment_name": display_name,
        "assessment_weight": _get_target_weight(target_assessment, target_child),
        "hypothetical_score": hypothetical_score,
        "hypothetical_contribution": round(hypothetical_contribution, 2),
        "current_standing": round(current_result["final_total"], 2),
        "projected_grade": round(projected_grade, 2),
        "remaining_potential": round(remaining_potential, 2),
        "maximum_possible": round(maximum_possible, 2),
        "is_failed": projected_totals["is_failed"],
        "york_equivalent": get_york_grade(0.0 if projected_totals["is_failed"] else projected_grade),
        "explanation": (
            f"If you score {hypothetical_score}% on {display_name} ({_get_target_weight(target_assessment, target_child)}% weight), "
            f"your grade will be {round(projected_grade, 2)}%. "
            f"With {remaining_potential}% weight remaining, your maximum possible is {round(maximum_possible, 2)}%."
            + (
                " Course outcome would still be a fail because a mandatory pass requirement is not met."
                if projected_totals["is_failed"]
                else ""
            )
        )
    }
