import pytest


def _create_course(auth_client, payload):
    response = auth_client.post("/courses/", json=payload)
    assert response.status_code == 200
    return response.json()["course_id"]


def _update_grades(auth_client, course_id, assessments):
    response = auth_client.put(
        f"/courses/{course_id}/grades",
        json={"assessments": assessments},
    )
    assert response.status_code == 200


def _get_course_from_list(auth_client, course_id):
    response = auth_client.get("/courses/")
    assert response.status_code == 200
    courses = response.json()
    return next(course for course in courses if course["course_id"] == course_id)


def test_create_course_with_mandatory_pass_rule_persists(auth_client):
    course_id = _create_course(
        auth_client,
        {
            "name": "Advanced Rules 1",
            "term": "W26",
            "assessments": [
                {"name": "Assignments", "weight": 40},
                {
                    "name": "Final Exam",
                    "weight": 60,
                    "rule_type": "mandatory_pass",
                    "rule_config": {"pass_threshold": 50},
                },
            ],
        },
    )

    course = _get_course_from_list(auth_client, course_id)
    final_exam = next(item for item in course["assessments"] if item["name"] == "Final Exam")

    assert final_exam["rule_type"] == "mandatory_pass"
    assert final_exam["rule_config"] == {"pass_threshold": 50}


def test_dashboard_mandatory_pass_failed_status(auth_client):
    course_id = _create_course(
        auth_client,
        {
            "name": "Advanced Rules 2",
            "term": "W26",
            "assessments": [
                {"name": "Assignment", "weight": 40},
                {
                    "name": "Final Exam",
                    "weight": 60,
                    "rule_type": "mandatory_pass",
                    "rule_config": {"pass_threshold": 60},
                },
            ],
        },
    )

    _update_grades(
        auth_client,
        course_id,
        [
            {"name": "Assignment", "raw_score": 80, "total_score": 100},
            {"name": "Final Exam", "raw_score": 40, "total_score": 100},
        ],
    )

    response = auth_client.get(f"/courses/{course_id}/dashboard")
    assert response.status_code == 200
    data = response.json()

    status = data["mandatory_pass_status"]
    assert status["has_requirements"] is True
    assert status["requirements_met"] is False
    assert status["failed_assessments"] == ["Final Exam"]

    final_breakdown = next(item for item in data["breakdown"] if item["name"] == "Final Exam")
    assert final_breakdown["is_mandatory_pass"] is True
    assert final_breakdown["pass_threshold"] == 60.0
    assert final_breakdown["pass_status"] == "failed"


def test_dashboard_mandatory_pass_passed_status(auth_client):
    course_id = _create_course(
        auth_client,
        {
            "name": "Advanced Rules 3",
            "term": "W26",
            "assessments": [
                {"name": "Assignment", "weight": 50},
                {
                    "name": "Final Exam",
                    "weight": 50,
                    "rule_type": "mandatory_pass",
                    "rule_config": {"pass_threshold": 55},
                },
            ],
        },
    )

    _update_grades(
        auth_client,
        course_id,
        [
            {"name": "Assignment", "raw_score": 75, "total_score": 100},
            {"name": "Final Exam", "raw_score": 70, "total_score": 100},
        ],
    )

    response = auth_client.get(f"/courses/{course_id}/dashboard")
    assert response.status_code == 200
    data = response.json()

    status = data["mandatory_pass_status"]
    assert status["has_requirements"] is True
    assert status["requirements_met"] is True
    assert status["failed_assessments"] == []
    assert status["pending_assessments"] == []


def test_dashboard_mandatory_pass_pending_status(auth_client):
    course_id = _create_course(
        auth_client,
        {
            "name": "Advanced Rules 4",
            "term": "W26",
            "assessments": [
                {"name": "Midterm", "weight": 40},
                {
                    "name": "Final Exam",
                    "weight": 60,
                    "rule_type": "mandatory_pass",
                    "rule_config": {"pass_threshold": 50},
                },
            ],
        },
    )

    _update_grades(
        auth_client,
        course_id,
        [{"name": "Midterm", "raw_score": 85, "total_score": 100}],
    )

    response = auth_client.get(f"/courses/{course_id}/dashboard")
    assert response.status_code == 200
    data = response.json()

    status = data["mandatory_pass_status"]
    assert status["has_requirements"] is True
    assert status["requirements_met"] is False
    assert status["pending_assessments"] == ["Final Exam"]

    final_breakdown = next(item for item in data["breakdown"] if item["name"] == "Final Exam")
    assert final_breakdown["pass_status"] == "pending"


def test_dashboard_whatif_below_mandatory_threshold_returns_failure(auth_client):
    course_id = _create_course(
        auth_client,
        {
            "name": "Advanced Rules 5",
            "term": "W26",
            "assessments": [
                {"name": "Midterm", "weight": 50, "raw_score": 70, "total_score": 100},
                {
                    "name": "Final Exam",
                    "weight": 50,
                    "rule_type": "mandatory_pass",
                    "rule_config": {"pass_threshold": 60},
                },
            ],
        },
    )

    response = auth_client.post(
        f"/courses/{course_id}/dashboard/whatif",
        json={
            "scenarios": [
                {"assessment_name": "Final Exam", "score": 40},
            ]
        },
    )
    assert response.status_code == 200
    data = response.json()

    status = data["mandatory_pass_status"]
    assert status["has_requirements"] is True
    assert "Final Exam" in status["failed_assessments"]
    assert len(data["mandatory_pass_warnings"]) >= 1

    final_breakdown = next(item for item in data["breakdown"] if item["name"] == "Final Exam")
    assert final_breakdown["pass_status"] == "failed"


def test_minimum_required_warns_when_below_mandatory_threshold(auth_client):
    course_id = _create_course(
        auth_client,
        {
            "name": "Advanced Rules 6",
            "term": "W26",
            "assessments": [
                {"name": "Assignments", "weight": 80},
                {
                    "name": "Final Exam",
                    "weight": 20,
                    "rule_type": "mandatory_pass",
                    "rule_config": {"pass_threshold": 60},
                },
            ],
        },
    )

    _update_grades(
        auth_client,
        course_id,
        [{"name": "Assignments", "raw_score": 80, "total_score": 100}],
    )

    response = auth_client.post(
        f"/courses/{course_id}/minimum-required",
        json={"target": 70, "assessment_name": "Final Exam"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["minimum_required"] < 60
    assert "mandatory_pass_warning" in data
    assert "below the mandatory pass threshold" in data["mandatory_pass_warning"]


def test_bonus_contribution_is_separate_and_does_not_change_mandatory_evaluation(auth_client):
    course_id = _create_course(
        auth_client,
        {
            "name": "Advanced Rules 7",
            "term": "W26",
            "assessments": [
                {
                    "name": "Final Exam",
                    "weight": 100,
                    "rule_type": "mandatory_pass",
                    "rule_config": {"pass_threshold": 50},
                },
                {
                    "name": "Participation Bonus",
                    "weight": 5,
                    "is_bonus": True,
                },
            ],
        },
    )

    _update_grades(
        auth_client,
        course_id,
        [
            {"name": "Final Exam", "raw_score": 40, "total_score": 100},
            {"name": "Participation Bonus", "raw_score": 100, "total_score": 100},
        ],
    )

    response = auth_client.get(f"/courses/{course_id}/dashboard")
    assert response.status_code == 200
    data = response.json()

    assert data["core_grade"] == pytest.approx(40.0, abs=0.01)
    assert data["bonus_contribution"] == pytest.approx(5.0, abs=0.01)
    assert data["current_grade"] == pytest.approx(45.0, abs=0.01)

    status = data["mandatory_pass_status"]
    assert status["requirements_met"] is False
    assert status["failed_assessments"] == ["Final Exam"]

    bonus_entry = next(item for item in data["breakdown"] if item["name"] == "Participation Bonus")
    assert bonus_entry["is_bonus"] is True
    assert bonus_entry["is_mandatory_pass"] is False


def test_create_course_rejects_bonus_and_mandatory_pass_on_same_assessment(auth_client):
    response = auth_client.post(
        "/courses/",
        json={
            "name": "Invalid Combo",
            "term": "W26",
            "assessments": [
                {
                    "name": "Bonus Gate",
                    "weight": 10,
                    "is_bonus": True,
                    "rule_type": "mandatory_pass",
                    "rule_config": {"pass_threshold": 50},
                },
                {"name": "Main", "weight": 100},
            ],
        },
    )
    assert response.status_code == 400
    assert "cannot be both bonus and mandatory_pass" in response.json()["detail"]


def test_parent_with_children_mandatory_pass_uses_parent_aggregate(auth_client):
    course_id = _create_course(
        auth_client,
        {
            "name": "Parent Mandatory",
            "term": "W26",
            "assessments": [
                {
                    "name": "Labs",
                    "weight": 40,
                    "rule_type": "mandatory_pass",
                    "rule_config": {"pass_threshold": 65},
                    "children": [
                        {"name": "Lab 1", "weight": 20},
                        {"name": "Lab 2", "weight": 20},
                    ],
                },
                {"name": "Final", "weight": 60},
            ],
        },
    )

    _update_grades(
        auth_client,
        course_id,
        [
            {
                "name": "Labs",
                "raw_score": None,
                "total_score": None,
                "children": [
                    {"name": "Lab 1", "raw_score": 70, "total_score": 100},
                    {"name": "Lab 2", "raw_score": 50, "total_score": 100},
                ],
            },
            {"name": "Final", "raw_score": 80, "total_score": 100},
        ],
    )

    response = auth_client.get(f"/courses/{course_id}/dashboard")
    assert response.status_code == 200
    data = response.json()

    status = data["mandatory_pass_status"]
    assert status["has_requirements"] is True
    assert status["requirements_met"] is False
    assert status["failed_assessments"] == ["Labs"]

    labs_entry = next(item for item in data["breakdown"] if item["name"] == "Labs")
    assert labs_entry["is_mandatory_pass"] is True
    assert labs_entry["pass_status"] == "failed"
    assert labs_entry["pass_threshold"] == 65.0


def test_multiple_mandatory_pass_rules_report_all_states(auth_client):
    course_id = _create_course(
        auth_client,
        {
            "name": "Multiple Mandatory",
            "term": "W26",
            "assessments": [
                {
                    "name": "Midterm",
                    "weight": 40,
                    "rule_type": "mandatory_pass",
                    "rule_config": {"pass_threshold": 60},
                },
                {
                    "name": "Final",
                    "weight": 60,
                    "rule_type": "mandatory_pass",
                    "rule_config": {"pass_threshold": 50},
                },
            ],
        },
    )

    _update_grades(
        auth_client,
        course_id,
        [{"name": "Midterm", "raw_score": 55, "total_score": 100}],
    )

    response = auth_client.get(f"/courses/{course_id}/dashboard")
    assert response.status_code == 200
    status = response.json()["mandatory_pass_status"]

    assert status["has_requirements"] is True
    assert status["requirements_met"] is False
    assert status["failed_assessments"] == ["Midterm"]
    assert status["pending_assessments"] == ["Final"]
    assert len(status["requirements"]) == 2


@pytest.mark.parametrize(
    ("threshold", "score", "expected"),
    [
        (0, 0, "passed"),
        (100, 100, "passed"),
        (100, 99, "failed"),
    ],
)
def test_mandatory_pass_threshold_boundaries(auth_client, threshold, score, expected):
    course_id = _create_course(
        auth_client,
        {
            "name": "Threshold Boundaries",
            "term": "W26",
            "assessments": [
                {"name": "Assignment", "weight": 50},
                {
                    "name": "Final Exam",
                    "weight": 50,
                    "rule_type": "mandatory_pass",
                    "rule_config": {"pass_threshold": threshold},
                },
            ],
        },
    )

    _update_grades(
        auth_client,
        course_id,
        [
            {"name": "Assignment", "raw_score": 80, "total_score": 100},
            {"name": "Final Exam", "raw_score": score, "total_score": 100},
        ],
    )

    response = auth_client.get(f"/courses/{course_id}/dashboard")
    assert response.status_code == 200
    final_entry = next(
        item for item in response.json()["breakdown"] if item["name"] == "Final Exam"
    )
    assert final_entry["pass_status"] == expected


def test_minimum_required_invalid_assessment_returns_400(auth_client):
    course_id = _create_course(
        auth_client,
        {
            "name": "Min Required Error",
            "term": "W26",
            "assessments": [
                {"name": "Assignment", "weight": 100},
            ],
        },
    )

    response = auth_client.post(
        f"/courses/{course_id}/minimum-required",
        json={"target": 80, "assessment_name": "Unknown Assessment"},
    )
    assert response.status_code == 400
