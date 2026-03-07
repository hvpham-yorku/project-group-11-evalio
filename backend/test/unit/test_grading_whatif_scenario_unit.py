import copy
import pytest

from app.models import CourseCreate
from app.services.grading_service import calculate_whatif_scenario


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


def test_whatif_raises_if_assessment_not_found():
    course = _course()
    with pytest.raises(ValueError, match="not found"):
        calculate_whatif_scenario(course, assessment_name="NotReal", hypothetical_score=90)


def test_whatif_raises_if_assessment_already_graded():
    course = _course()
    # A1 is graded
    with pytest.raises(ValueError, match="already graded"):
        calculate_whatif_scenario(course, assessment_name="A1", hypothetical_score=90)


def test_whatif_is_read_only_and_does_not_mutate_course():
    course = _course()
    before = copy.deepcopy(course.model_dump())
    _ = calculate_whatif_scenario(course, assessment_name="Final", hypothetical_score=90)
    after = course.model_dump()
    assert after == before


def test_whatif_projected_and_maximum_possible_math():
    course = _course()
    # Current standing = 16. Hypothetical Final 90% of 50 = 45.
    # projected = 61. remaining (Midterm 30) => maximum = 91.
    result = calculate_whatif_scenario(course, assessment_name="Final", hypothetical_score=90)
    assert result["current_standing"] == pytest.approx(16.0, abs=0.01)
    assert result["hypothetical_contribution"] == pytest.approx(45.0, abs=0.01)
    assert result["projected_grade"] == pytest.approx(61.0, abs=0.01)
    assert result["remaining_potential"] == pytest.approx(30.0, abs=0.01)
    assert result["maximum_possible"] == pytest.approx(91.0, abs=0.01)