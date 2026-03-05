"""
Tests for Interactive Strategy Dashboard — SCRUM-90

Covers:
- Grade boundary computation (min / max / normalised)
- Multi-assessment what-if scenarios
- Learning strategy suggestions
- Weight normalisation when < 100%
- Dashboard endpoint integration
"""

import pytest

from app.models import Assessment, CourseCreate
from app.services.strategy_service import (
    compute_grade_boundaries,
    compute_multi_whatif,
    suggest_learning_strategies,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_course(assessments: list[dict]) -> CourseCreate:
    """Build a CourseCreate from a list of simplified assessment dicts."""
    return CourseCreate(
        name="Test Course",
        term="F25",
        assessments=[Assessment(**a) for a in assessments],
    )


# ─── Grade Boundaries ────────────────────────────────────────────────────────

class TestGradeBoundaries:
    def test_fully_graded_course(self):
        course = _make_course([
            {"name": "Midterm", "weight": 40, "raw_score": 80, "total_score": 100},
            {"name": "Final",   "weight": 60, "raw_score": 70, "total_score": 100},
        ])
        result = compute_grade_boundaries(course)
        # current = 40*80/100 + 60*70/100 = 32 + 42 = 74
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
        # min: 32 + 0 = 32
        # max: 32 + 60 = 92
        assert result["min_grade"] == 32.0
        assert result["max_grade"] == 92.0
        assert result["remaining_weight"] == 60.0

    def test_normalisation_when_under_100(self):
        course = _make_course([
            {"name": "Midterm", "weight": 30, "raw_score": 80, "total_score": 100},
            {"name": "Final",   "weight": 50, "raw_score": 70, "total_score": 100},
        ])
        result = compute_grade_boundaries(course)
        # raw = 24 + 35 = 59, core_weight = 80
        assert result["normalisation_applied"] is True
        # normalised = (59 / 80) * 100 = 73.75
        assert result["current_normalised"] == 73.75

    def test_gpa_conversion_present(self):
        course = _make_course([
            {"name": "Final", "weight": 100, "raw_score": 85, "total_score": 100},
        ])
        result = compute_grade_boundaries(course)
        assert "gpa_current" in result
        assert "4.0" in result["gpa_current"]
        assert "9.0" in result["gpa_current"]

    def test_breakdown_contains_all_assessments(self):
        course = _make_course([
            {"name": "A1", "weight": 30, "raw_score": 90, "total_score": 100},
            {"name": "A2", "weight": 70},
        ])
        result = compute_grade_boundaries(course)
        assert len(result["breakdown"]) == 2
        names = [b["name"] for b in result["breakdown"]]
        assert "A1" in names
        assert "A2" in names


# ─── Multi-Assessment What-If ────────────────────────────────────────────────

class TestMultiWhatIf:
    def test_single_scenario(self):
        course = _make_course([
            {"name": "Midterm", "weight": 40, "raw_score": 80, "total_score": 100},
            {"name": "Final",   "weight": 60},
        ])
        result = compute_multi_whatif(course, [
            {"assessment_name": "Final", "score": 90},
        ])
        # Midterm: 32, Final (hyp): 60*90/100 = 54; total = 86
        assert result["projected_grade"] == 86.0

    def test_multiple_scenarios(self):
        course = _make_course([
            {"name": "Midterm", "weight": 30, "raw_score": 70, "total_score": 100},
            {"name": "Final",   "weight": 40},
            {"name": "Project", "weight": 30},
        ])
        result = compute_multi_whatif(course, [
            {"assessment_name": "Final", "score": 80},
            {"assessment_name": "Project", "score": 90},
        ])
        # Midterm: 21, Final: 32, Project: 27; total = 80
        assert result["projected_grade"] == 80.0
        assert result["scenarios_applied"] == 2

    def test_unknown_assessment_raises(self):
        course = _make_course([
            {"name": "Final", "weight": 100},
        ])
        with pytest.raises(ValueError, match="not found"):
            compute_multi_whatif(course, [
                {"assessment_name": "NonExistent", "score": 50},
            ])

    def test_breakdown_includes_source(self):
        course = _make_course([
            {"name": "Midterm", "weight": 40, "raw_score": 80, "total_score": 100},
            {"name": "Final",   "weight": 60},
        ])
        result = compute_multi_whatif(course, [
            {"assessment_name": "Final", "score": 90},
        ])
        sources = {b["name"]: b["source"] for b in result["breakdown"]}
        assert sources["Midterm"] == "actual"
        assert sources["Final"] == "whatif"


# ─── Learning Strategies ─────────────────────────────────────────────────────

class TestLearningStrategies:
    def test_exam_gets_active_recall(self):
        course = _make_course([
            {"name": "Midterm Exam", "weight": 30},
        ])
        suggestions = suggest_learning_strategies(course)
        assert len(suggestions) == 1
        technique_names = [t["name"] for t in suggestions[0]["techniques"]]
        assert "Active Recall" in technique_names

    def test_assignment_gets_feynman(self):
        course = _make_course([
            {"name": "Assignment 1", "weight": 15},
        ])
        suggestions = suggest_learning_strategies(course)
        technique_names = [t["name"] for t in suggestions[0]["techniques"]]
        assert "Feynman Technique" in technique_names

    def test_high_weight_gets_pareto(self):
        course = _make_course([
            {"name": "Big Project", "weight": 25},
        ])
        suggestions = suggest_learning_strategies(course)
        technique_names = [t["name"] for t in suggestions[0]["techniques"]]
        assert "80/20 Rule (Pareto Principle)" in technique_names

    def test_graded_assessments_skipped(self):
        course = _make_course([
            {"name": "Midterm", "weight": 40, "raw_score": 80, "total_score": 100},
            {"name": "Final",   "weight": 60},
        ])
        suggestions = suggest_learning_strategies(course)
        names = [s["assessment_name"] for s in suggestions]
        assert "Midterm" not in names
        assert "Final" in names

    def test_with_deadline_info(self):
        course = _make_course([
            {"name": "Final Exam", "weight": 50},
        ])
        deadlines = [
            {"assessment_name": "Final Exam", "due_date": "2099-01-01"},
        ]
        suggestions = suggest_learning_strategies(course, deadlines)
        assert suggestions[0]["days_until_due"] is not None
        assert suggestions[0]["days_until_due"] > 0


# ─── Dashboard Endpoint Integration ──────────────────────────────────────────

class TestDashboardEndpoints:
    def _create_course(self, client):
        return client.post("/courses/", json={
            "name": "EECS 2311",
            "term": "F25",
            "assessments": [
                {"name": "Midterm", "weight": 40, "raw_score": 80, "total_score": 100},
                {"name": "Final",   "weight": 60},
            ],
        })

    def test_get_dashboard(self, auth_client):
        r = self._create_course(auth_client)
        assert r.status_code == 200
        course_id = r.json()["course_id"]

        resp = auth_client.get(f"/courses/{course_id}/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert "min_grade" in data
        assert "max_grade" in data
        assert "breakdown" in data
        assert "gpa_current" in data

    def test_multi_whatif_endpoint(self, auth_client):
        r = self._create_course(auth_client)
        course_id = r.json()["course_id"]

        resp = auth_client.post(
            f"/courses/{course_id}/dashboard/whatif",
            json={"scenarios": [{"assessment_name": "Final", "score": 85}]},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "projected_grade" in data
        # 40*80/100 + 60*85/100 = 32 + 51 = 83
        assert data["projected_grade"] == 83.0

    def test_strategies_endpoint(self, auth_client):
        r = self._create_course(auth_client)
        course_id = r.json()["course_id"]

        resp = auth_client.get(f"/courses/{course_id}/dashboard/strategies")
        assert resp.status_code == 200
        data = resp.json()
        assert "suggestions" in data
