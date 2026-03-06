import pytest
from pydantic import ValidationError

from app.models import Assessment, CourseCreate
from app.services.grading_service import (
    calculate_course_totals,
    compute_assessment_contribution,
    evaluate_mandatory_pass_requirements,
)


def test_rule_validation_rejects_unsupported_rule_type():
    with pytest.raises(ValidationError, match="Unsupported rule_type"):
        Assessment(name="Final", weight=40, rule_type="curve_rule")


def test_rule_validation_requires_positive_best_of_count():
    with pytest.raises(ValidationError, match="positive best_count"):
        Assessment(
            name="Quizzes",
            weight=20,
            rule_type="best_of",
            rule_config={"best_count": 0},
            children=[
                {"name": "Quiz 1", "weight": 10, "raw_score": 90, "total_score": 100},
                {"name": "Quiz 2", "weight": 10, "raw_score": 80, "total_score": 100},
            ],
        )


def test_rule_validation_rejects_negative_drop_lowest_count():
    with pytest.raises(ValidationError, match="zero or greater"):
        Assessment(
            name="Labs",
            weight=20,
            rule_type="drop_lowest",
            rule_config={"drop_count": -1},
            children=[
                {"name": "Lab 1", "weight": 10, "raw_score": 90, "total_score": 100},
                {"name": "Lab 2", "weight": 10, "raw_score": 80, "total_score": 100},
            ],
        )


def test_rule_validation_rejects_mandatory_pass_threshold_above_100():
    with pytest.raises(ValidationError, match="between 0 and 100"):
        Assessment(
            name="Final Exam",
            weight=50,
            raw_score=None,
            total_score=None,
            rule_type="mandatory_pass",
            rule_config={"pass_threshold": 101},
        )


def test_best_of_legacy_best_key_is_used_in_calculation():
    assessment = Assessment(
        name="Quizzes",
        weight=20,
        rule_type="best_of",
        rule_config={"best": 2},
        children=[
            {"name": "Quiz 1", "weight": 10, "raw_score": 50, "total_score": 100},
            {"name": "Quiz 2", "weight": 10, "raw_score": 90, "total_score": 100},
            {"name": "Quiz 3", "weight": 10, "raw_score": 80, "total_score": 100},
        ],
    )

    assert compute_assessment_contribution(assessment) == 17.0


def test_drop_lowest_drops_missing_grade_before_scored_items():
    assessment = Assessment(
        name="Labs",
        weight=30,
        rule_type="drop_lowest",
        children=[
            {"name": "Lab 1", "weight": 10, "raw_score": 90, "total_score": 100},
            {"name": "Lab 2", "weight": 10, "raw_score": None, "total_score": None},
            {"name": "Lab 3", "weight": 10, "raw_score": 70, "total_score": 100},
        ],
    )

    assert compute_assessment_contribution(assessment) == 16.0


def test_mandatory_pass_pending_when_assessment_is_ungraded():
    course = CourseCreate(
        name="EECS",
        term="W26",
        assessments=[
            {"name": "Assignment", "weight": 50, "raw_score": 80, "total_score": 100},
            {
                "name": "Final Exam",
                "weight": 50,
                "raw_score": None,
                "total_score": None,
                "rule_type": "mandatory_pass",
                "rule_config": {"pass_threshold": 50},
            },
        ],
    )

    summary = evaluate_mandatory_pass_requirements(course)

    assert summary["has_requirements"] is True
    assert summary["requirements_met"] is False
    assert summary["pending_assessments"] == ["Final Exam"]
    assert summary["failed_assessments"] == []
    assert summary["requirements"] == [
        {
            "assessment_name": "Final Exam",
            "threshold": 50.0,
            "status": "pending",
            "percent": None,
        }
    ]


@pytest.mark.parametrize(
    ("score", "threshold", "expected_status", "requirements_met"),
    [
        (49, 50, "failed", False),
        (50, 50, "passed", True),
        (60, 60, "passed", True),
    ],
)
def test_mandatory_pass_boundary_and_custom_threshold_behavior(
    score: float,
    threshold: float,
    expected_status: str,
    requirements_met: bool,
):
    course = CourseCreate(
        name="EECS",
        term="W26",
        assessments=[
            {"name": "Assignment", "weight": 50, "raw_score": 100, "total_score": 100},
            {
                "name": "Final Exam",
                "weight": 50,
                "raw_score": score,
                "total_score": 100,
                "rule_type": "mandatory_pass",
                "rule_config": {"pass_threshold": threshold},
            },
        ],
    )

    totals = calculate_course_totals(course)
    summary = evaluate_mandatory_pass_requirements(course)

    assert totals["final_total"] == pytest.approx(50 + (score * 0.5))
    assert summary["requirements_met"] is requirements_met
    assert summary["pending_assessments"] == []
    assert summary["failed_assessments"] == ([] if expected_status == "passed" else ["Final Exam"])
    assert summary["requirements"] == [
        {
            "assessment_name": "Final Exam",
            "threshold": float(threshold),
            "status": expected_status,
            "percent": float(score),
        }
    ]


def test_course_api_preserves_mandatory_pass_metadata_and_grade_calculation(auth_client):
    payload = {
        "name": "EECS2311",
        "term": "W26",
        "assessments": [
            {"name": "Assignment", "weight": 50, "raw_score": None, "total_score": None},
            {
                "name": "Final Exam",
                "weight": 50,
                "raw_score": None,
                "total_score": None,
                "rule_type": "mandatory_pass",
                "rule_config": {"pass_threshold": 50},
            },
        ],
    }
    created = auth_client.post("/courses/", json=payload)
    assert created.status_code == 200

    course = created.json()["course"]
    final_exam = next(item for item in course["assessments"] if item["name"] == "Final Exam")
    assert final_exam["rule_type"] == "mandatory_pass"
    assert final_exam["rule_config"] == {"pass_threshold": 50}

    updated = auth_client.put(
        f"/courses/{created.json()['course_id']}/grades",
        json={
            "assessments": [
                {"name": "Assignment", "raw_score": 100, "total_score": 100},
                {"name": "Final Exam", "raw_score": 40, "total_score": 100},
            ]
        },
    )
    assert updated.status_code == 200
    assert updated.json()["current_standing"] == 70.0
    assert updated.json()["final_total"] == 70.0
