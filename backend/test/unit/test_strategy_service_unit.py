# backend/test/unit/test_strategy_service_unit.py

import pytest

from app.models import Assessment, CourseCreate
from app.services.strategy_service import (
    compute_grade_boundaries,
    compute_multi_whatif,
    suggest_learning_strategies,
)


def _make_course(assessments: list[dict]) -> CourseCreate:
    return CourseCreate(
        name="Test Course",
        term="F25",
        assessments=[Assessment(**a) for a in assessments],
    )


class TestGradeBoundaries:
    def test_fully_graded_course(self):
        course = _make_course([
            {"name": "Midterm", "weight": 40, "raw_score": 80, "total_score": 100},
            {"name": "Final",   "weight": 60, "raw_score": 70, "total_score": 100},
        ])
        result = compute_grade_boundaries(course)
        assert result["current_grade"] == 74.0
        assert result["min_grade"] == 74.0
        assert result["max_grade"] == 74.0
        assert result["remaining_weight"] == 0.0

    def test_partially_graded_course(self):
        course = _make_course([
            {"name": "Midterm", "weight": 40, "raw_score": 80, "total_score": 100},
            {"name": "Final",   "weight": 60},
        ])
        result = compute_grade_boundaries(course)
        assert result["min_grade"] == 32.0
        assert result["max_grade"] == 92.0
        assert result["remaining_weight"] == 60.0

    def test_normalisation_when_under_100(self):
        course = _make_course([
            {"name": "Midterm", "weight": 30, "raw_score": 80, "total_score": 100},
            {"name": "Final",   "weight": 50, "raw_score": 70, "total_score": 100},
        ])
        result = compute_grade_boundaries(course)
        assert result["normalisation_applied"] is True
        assert result["current_normalised"] == 73.75


class TestMultiWhatIf:
    def test_single_scenario(self):
        course = _make_course([
            {"name": "Midterm", "weight": 40, "raw_score": 80, "total_score": 100},
            {"name": "Final",   "weight": 60},
        ])
        result = compute_multi_whatif(course, [{"assessment_name": "Final", "score": 90}])
        assert result["projected_grade"] == 86.0

    def test_unknown_assessment_raises(self):
        course = _make_course([{"name": "Final", "weight": 100}])
        with pytest.raises(ValueError, match="not found"):
            compute_multi_whatif(course, [{"assessment_name": "NonExistent", "score": 50}])


class TestLearningStrategies:
    def test_high_weight_gets_pareto(self):
        course = _make_course([{"name": "Big Project", "weight": 25}])
        suggestions = suggest_learning_strategies(course)
        technique_names = [t["name"] for t in suggestions[0]["techniques"]]
        assert "80/20 Rule (Pareto Principle)" in technique_names

    def test_target_gap_and_weakest_area_are_included(self):
        course = _make_course([
            {"name": "Midterm Exam", "weight": 40, "raw_score": 62, "total_score": 100},
            {"name": "Final Exam", "weight": 60},
        ])

        suggestions = suggest_learning_strategies(
            course,
            deadlines=[{"assessment_name": "Final Exam", "due_date": "2099-01-01"}],
            target_grade=85,
            current_grade=24.8,
        )

        assert suggestions[0]["target_gap"] == 60.2
        assert suggestions[0]["weakest_area"]["name"] == "Midterm Exam"
        assert any("85.0% target" in t["reason"] for t in suggestions[0]["techniques"])