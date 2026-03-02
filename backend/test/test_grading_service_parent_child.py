from app.models import Assessment, CourseCreate
from app.services.grading_service import (
    calculate_course_totals,
    calculate_current_standing,
    compute_assessment_contribution,
)


def test_parent_child_without_rule_aggregates_children():
    assessment = Assessment(
        name="Labs",
        weight=20,
        children=[
            {"name": "Lab 1", "weight": 10, "raw_score": 80, "total_score": 100},
            {"name": "Lab 2", "weight": 10, "raw_score": 50, "total_score": 100},
        ],
    )

    assert compute_assessment_contribution(assessment) == 13.0


def test_best_of_selects_highest_percentages():
    assessment = Assessment(
        name="Quizzes",
        weight=30,
        rule_type="best_of",
        rule_config={"best_count": 2},
        children=[
            {"name": "Quiz 1", "weight": 10, "raw_score": 50, "total_score": 100},
            {"name": "Quiz 2", "weight": 10, "raw_score": 90, "total_score": 100},
            {"name": "Quiz 3", "weight": 10, "raw_score": 80, "total_score": 100},
        ],
    )

    assert compute_assessment_contribution(assessment) == 17.0


def test_best_of_with_missing_grades_treats_missing_as_zero():
    assessment = Assessment(
        name="Quizzes",
        weight=30,
        rule_type="best_of",
        rule_config={"best_count": 2},
        children=[
            {"name": "Quiz 1", "weight": 10, "raw_score": 90, "total_score": 100},
            {"name": "Quiz 2", "weight": 10, "raw_score": None, "total_score": None},
            {"name": "Quiz 3", "weight": 10, "raw_score": 70, "total_score": 100},
        ],
    )

    assert compute_assessment_contribution(assessment) == 16.0


def test_flat_assessment_contribution_unchanged():
    assessment = Assessment(name="A1", weight=20, raw_score=80, total_score=100)
    assert compute_assessment_contribution(assessment) == 16.0


def test_mixed_flat_and_parent_child_course_current_standing():
    course = CourseCreate(
        name="EECS",
        term="W26",
        assessments=[
            {"name": "A1", "weight": 20, "raw_score": 80, "total_score": 100},
            {
                "name": "Labs",
                "weight": 20,
                "children": [
                    {"name": "Lab 1", "weight": 10, "raw_score": 100, "total_score": 100},
                    {"name": "Lab 2", "weight": 10, "raw_score": 50, "total_score": 100},
                ],
            },
            {"name": "Final", "weight": 60, "raw_score": None, "total_score": None},
        ],
    )

    assert calculate_current_standing(course) == 31.0


def test_best_of_uses_all_children_when_best_count_exceeds_count():
    assessment = Assessment(
        name="Quizzes",
        weight=20,
        rule_type="best_of",
        rule_config={"best_count": 5},
        children=[
            {"name": "Quiz 1", "weight": 10, "raw_score": 80, "total_score": 100},
            {"name": "Quiz 2", "weight": 10, "raw_score": 60, "total_score": 100},
        ],
    )

    assert compute_assessment_contribution(assessment) == 14.0


def test_drop_lowest_basic_case():
    assessment = Assessment(
        name="Quizzes",
        weight=30,
        rule_type="drop_lowest",
        children=[
            {"name": "Quiz 1", "weight": 10, "raw_score": 100, "total_score": 100},
            {"name": "Quiz 2", "weight": 10, "raw_score": 80, "total_score": 100},
            {"name": "Quiz 3", "weight": 10, "raw_score": 50, "total_score": 100},
        ],
    )

    assert compute_assessment_contribution(assessment) == 18.0


def test_drop_lowest_drop_count_two():
    assessment = Assessment(
        name="Labs",
        weight=40,
        rule_type="drop_lowest",
        rule_config={"drop_count": 2},
        children=[
            {"name": "Lab 1", "weight": 10, "raw_score": 90, "total_score": 100},
            {"name": "Lab 2", "weight": 10, "raw_score": 80, "total_score": 100},
            {"name": "Lab 3", "weight": 10, "raw_score": 70, "total_score": 100},
            {"name": "Lab 4", "weight": 10, "raw_score": 60, "total_score": 100},
        ],
    )

    assert compute_assessment_contribution(assessment) == 17.0


def test_drop_lowest_when_drop_count_exceeds_children_returns_zero():
    assessment = Assessment(
        name="Labs",
        weight=20,
        rule_type="drop_lowest",
        rule_config={"drop_count": 3},
        children=[
            {"name": "Lab 1", "weight": 10, "raw_score": 90, "total_score": 100},
            {"name": "Lab 2", "weight": 10, "raw_score": 80, "total_score": 100},
        ],
    )

    assert compute_assessment_contribution(assessment) == 0.0


def test_bonus_contributes_outside_core_totals():
    course = CourseCreate(
        name="EECS",
        term="W26",
        assessments=[
            {"name": "Midterm", "weight": 70, "raw_score": 80, "total_score": 100},
            {"name": "Final", "weight": 20, "raw_score": None, "total_score": None},
            {"name": "Participation Bonus", "weight": 10, "raw_score": 100, "total_score": 100, "is_bonus": True},
        ],
    )

    totals = calculate_course_totals(course)
    assert totals["core_total"] == 56.0
    assert totals["bonus_total"] == 10.0
    assert totals["final_total"] == 66.0
    assert calculate_current_standing(course) == 66.0


def test_final_total_can_exceed_100_with_bonus():
    course = CourseCreate(
        name="EECS",
        term="W26",
        assessments=[
            {"name": "Core", "weight": 100, "raw_score": 100, "total_score": 100},
            {"name": "Bonus", "weight": 10, "raw_score": 100, "total_score": 100, "is_bonus": True},
        ],
    )

    totals = calculate_course_totals(course)
    assert totals["core_total"] == 100.0
    assert totals["bonus_total"] == 10.0
    assert totals["final_total"] == 110.0
