from app.models import CourseCreate

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


def _get_best_count(assessment) -> int:
    if assessment.rule_type != "best_of":
        return len(assessment.children or [])
    config = assessment.rule_config or {}
    try:
        best_count = int(config.get("best_count"))
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
    target_assessment = None
    for assessment in course.assessments:
        if assessment.name == assessment_name:
            target_assessment = assessment
            break

    if target_assessment is None:
        raise ValueError(f"Assessment '{assessment_name}' not found")

    if _is_assessment_fully_graded(target_assessment):
        raise ValueError(f"Assessment '{assessment_name}' is already graded")

    current_standing = calculate_current_standing(course)

    other_remaining_max = 0.0
    for assessment in course.assessments:
        if assessment.name == assessment_name:
            continue
        other_remaining_max += _compute_remaining_potential(assessment)

    points_after_others = current_standing + other_remaining_max
    points_needed = target - points_after_others
    target_remaining_capacity = _compute_remaining_potential(target_assessment)

    if points_needed <= 0:
        minimum_required = 0.0
        is_achievable = True
    elif target_remaining_capacity <= 0:
        minimum_required = float("inf")
        is_achievable = False
    else:
        minimum_required = (points_needed / target_remaining_capacity) * 100
        is_achievable = minimum_required <= 100

    return {
        "course_name": course.name,
        "assessment_name": assessment_name,
        "assessment_weight": target_assessment.weight,
        "minimum_required": round(minimum_required, 1),
        "is_achievable": is_achievable,
        "current_standing": round(current_standing, 2),
        "other_remaining_assumed_max": round(other_remaining_max, 2),
        "target": target,
        "explanation": (
            f"You need at least {round(minimum_required, 1)}% on {assessment_name} "
            f"to reach {target}% (assuming 100% on all other remaining assessments)."
            if is_achievable
            else (
                f"Target {target}% is not achievable. Even with 100% on "
                f"{assessment_name} and all other remaining assessments, "
                f"maximum is {round(points_after_others + target_assessment.weight, 1)}%."
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
    target_assessment = None
    for assessment in course.assessments:
        if assessment.name == assessment_name:
            target_assessment = assessment
            break

    if target_assessment is None:
        raise ValueError(f"Assessment '{assessment_name}' not found")

    if _is_assessment_fully_graded(target_assessment):
        raise ValueError(f"Assessment '{assessment_name}' is already graded")

    current_standing = calculate_current_standing(course)
    current_target_contribution = compute_assessment_contribution(target_assessment)
    hypothetical_target_contribution = compute_assessment_contribution(
        target_assessment,
        missing_percent=hypothetical_score,
    )
    hypothetical_contribution = hypothetical_target_contribution

    remaining_potential = sum(
        _compute_remaining_potential(assessment)
        for assessment in course.assessments
        if assessment.name != assessment_name
    )

    projected_grade = current_standing - current_target_contribution + hypothetical_target_contribution
    maximum_possible = projected_grade + remaining_potential

    return {
        "course_name": course.name,
        "assessment_name": assessment_name,
        "assessment_weight": target_assessment.weight,
        "hypothetical_score": hypothetical_score,
        "hypothetical_contribution": round(hypothetical_contribution, 2),
        "current_standing": round(current_standing, 2),
        "projected_grade": round(projected_grade, 2),
        "remaining_potential": round(remaining_potential, 2),
        "maximum_possible": round(maximum_possible, 2),
        "york_equivalent": get_york_grade(projected_grade),
        "explanation": (
            f"If you score {hypothetical_score}% on {assessment_name} ({target_assessment.weight}% weight), "
            f"your grade will be {round(projected_grade, 2)}%. "
            f"With {remaining_potential}% weight remaining, your maximum possible is {round(maximum_possible, 2)}%."
        )
    }
