import pytest

from app.models import CourseCreate
from app.services.grading_service import calculate_minimum_required_score


def _course():
    return CourseCreate(
        name="EECS2311",
        term="W26",
        assessments=[
            {"name": "A1", "weight": 20, "raw_score": 80, "total_score": 100},
            {"name": "Midterm", "weight": 30, "raw_score": None, "total_score": None},
            {"name": "Final", "weight": 50, "raw_score": None, "total_score": None},
        ],
    )


def test_min_required_raises_if_assessment_not_found():
    course = _course()
    with pytest.raises(ValueError, match="not found"):
        calculate_minimum_required_score(course, target=80, assessment_name="NotReal")


def test_min_required_raises_if_assessment_already_graded():
    course = _course()
    # A1 is already graded
    with pytest.raises(ValueError, match="already graded"):
        calculate_minimum_required_score(course, target=80, assessment_name="A1")


def test_min_required_returns_zero_when_target_already_met():
    course = _course()
    # Target is already met even without the selected assessment.
    result = calculate_minimum_required_score(course, target=10, assessment_name="Midterm")
    assert result["minimum_required"] == 0.0
    assert result["is_achievable"] is True


def test_min_required_over_100_marks_not_achievable():
    course = CourseCreate(
        name="EECS2311",
        term="W26",
        assessments=[
            {"name": "A1", "weight": 90, "raw_score": 10, "total_score": 100},  # standing 9
            {"name": "Final", "weight": 10, "raw_score": None, "total_score": None},
        ],
    )
    result = calculate_minimum_required_score(course, target=100, assessment_name="Final")
    assert result["is_achievable"] is False
    assert result["minimum_required"] > 100


def test_min_required_normal_case_exact_value():
    course = _course()
    # Choose Final as target assessment. Assume Midterm = 100%.
    # Current standing: A1 16.
    # Other remaining max (Midterm) = 30.
    # Need from Final: 80 - (16 + 30) = 34 points.
    # Final weight 50 => required % = 34/50*100 = 68
    result = calculate_minimum_required_score(course, target=80, assessment_name="Final")
    assert result["is_achievable"] is True
    assert result["minimum_required"] == pytest.approx(68.0, abs=0.1)