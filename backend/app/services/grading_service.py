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


def calculate_course_totals(course: CourseCreate, *, missing_percent: float = 0.0) -> dict[str, float]:
    core_total = 0.0
    bonus_total = 0.0

    for assessment in course.assessments:
        contribution = compute_assessment_contribution(assessment, missing_percent=missing_percent)
        if getattr(assessment, "is_bonus", False):
            bonus_total += contribution
        else:
            core_total += contribution

    final_total = core_total + bonus_total
    return {
        "core_total": round(core_total, 2),
        "bonus_total": round(bonus_total, 2),
        "final_total": round(final_total, 2),
    }


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

    current_standing = calculate_current_standing(course)

    optimistic_course = course.model_copy(deep=True)
    fill_remaining_ungraded_scores(
        optimistic_course,
        missing_percent=100.0,
        exclude_assessment_name=target_path,
    )
    totals_without_target = calculate_course_totals(optimistic_course)
    points_after_others = totals_without_target["final_total"]
    other_remaining_max = max(0.0, points_after_others - current_standing)

    points_needed = target - points_after_others

    maximum_course = optimistic_course.model_copy(deep=True)
    apply_hypothetical_score(maximum_course, target_path, 100.0)
    maximum_totals = calculate_course_totals(maximum_course)
    max_possible = maximum_totals["final_total"]

    if points_needed <= 0:
        minimum_required = 0.0
        is_achievable = True
    elif max_possible + 1e-9 < target:
        target_capacity = max(0.0, max_possible - points_after_others)
        if target_capacity <= 0:
            minimum_required = 101.0
        else:
            minimum_required = (points_needed / target_capacity) * 100
        is_achievable = False
    else:
        low = 0.0
        high = 100.0
        for _ in range(30):
            mid = (low + high) / 2
            candidate_course = optimistic_course.model_copy(deep=True)
            apply_hypothetical_score(candidate_course, target_path, mid)
            candidate_total = calculate_course_totals(candidate_course)["final_total"]
            if candidate_total >= target:
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
        "current_standing": round(current_standing, 2),
        "projected_grade": round(projected_grade, 2),
        "remaining_potential": round(remaining_potential, 2),
        "maximum_possible": round(maximum_possible, 2),
        "york_equivalent": get_york_grade(projected_grade),
        "explanation": (
            f"If you score {hypothetical_score}% on {display_name} ({_get_target_weight(target_assessment, target_child)}% weight), "
            f"your grade will be {round(projected_grade, 2)}%. "
            f"With {remaining_potential}% weight remaining, your maximum possible is {round(maximum_possible, 2)}%."
        )
    }
