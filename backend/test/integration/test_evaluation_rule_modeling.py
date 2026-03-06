import copy

import pytest

from app.services.grading_service import get_york_grade


def _create_course(auth_client, weights):
    payload = {
        "name": "EECS2311",
        "term": "W26",
        "assessments": [
            {"name": name, "weight": weight, "raw_score": None, "total_score": None}
            for name, weight in weights
        ],
    }
    response = auth_client.post("/courses/", json=payload)
    assert response.status_code == 200
    return response.json()["course_id"]


def _set_percent(auth_client, course_id: str, assessment_name: str, percent: float):
    response = auth_client.put(
        f"/courses/{course_id}/grades",
        json={
            "assessments": [
                {"name": assessment_name, "raw_score": percent, "total_score": 100}
            ]
        },
    )
    assert response.status_code == 200
    return response.json()


def _get_course(auth_client, course_id: str):
    courses = auth_client.get("/courses/").json()
    return next(course for course in courses if course["course_id"] == course_id)


@pytest.mark.parametrize(
    ("pct", "expected_letter"),
    [
        (90.0, "A+"),
        (89.99, "A"),
        (80.0, "A"),
        (79.99, "B+"),
        (75.0, "B+"),
        (70.0, "B"),
        (60.0, "C"),
        (50.0, "D"),
        (0.0, "F"),
    ],
)
def test_yorku_mapping_boundaries(pct, expected_letter):
    result = get_york_grade(pct)
    assert result["letter"] == expected_letter


def test_required_average_correct_partial_grades(auth_client):
    course_id = _create_course(auth_client, [("A1", 20), ("Midterm", 30), ("Final", 50)])

    update = _set_percent(auth_client, course_id, "A1", 80)
    assert update["current_standing"] == 16.0

    response = auth_client.post(f"/courses/{course_id}/target", json={"target": 80})
    assert response.status_code == 200
    data = response.json()
    assert data["required_average"] == pytest.approx(80.0, abs=0.1)
    assert data["classification"] == "Achievable"
    assert data["york_equivalent"]["letter"] == "A"


def test_classification_complete_when_no_remaining_weight(auth_client):
    course_id = _create_course(auth_client, [("A1", 50), ("A2", 50)])
    _set_percent(auth_client, course_id, "A1", 100)
    _set_percent(auth_client, course_id, "A2", 100)

    response = auth_client.post(f"/courses/{course_id}/target", json={"target": 80})
    assert response.status_code == 200
    data = response.json()
    assert data["classification"] == "Complete"
    assert data["required_average"] == 0.0
    assert data["maximum_possible"] == data["current_standing"]


def test_classification_already_achieved_when_target_below_current(auth_client):
    course_id = _create_course(auth_client, [("A1", 50), ("Final", 50)])
    _set_percent(auth_client, course_id, "A1", 100)

    response = auth_client.post(f"/courses/{course_id}/target", json={"target": 40})
    assert response.status_code == 200
    data = response.json()
    assert data["classification"] == "Already Achieved"
    assert data["required_average"] == 0.0


def test_classification_not_possible_when_required_avg_over_100(auth_client):
    course_id = _create_course(auth_client, [("A1", 90), ("Final", 10)])
    _set_percent(auth_client, course_id, "A1", 10)

    response = auth_client.post(f"/courses/{course_id}/target", json={"target": 95})
    assert response.status_code == 200
    data = response.json()
    assert data["classification"] == "Not Possible"
    assert data["required_average"] > 100


def test_classification_threshold_boundary_70(auth_client):
    course_id = _create_course(auth_client, [("A1", 30), ("Final", 70)])
    _set_percent(auth_client, course_id, "A1", 0)

    response = auth_client.post(f"/courses/{course_id}/target", json={"target": 49})
    assert response.status_code == 200
    data = response.json()
    assert data["required_average"] == pytest.approx(70.0, abs=0.1)
    assert data["classification"] == "Comfortable"


def test_target_is_non_mutating(auth_client):
    course_id = _create_course(auth_client, [("A1", 50), ("Final", 50)])
    _set_percent(auth_client, course_id, "A1", 80)

    before = copy.deepcopy(_get_course(auth_client, course_id))
    response = auth_client.post(f"/courses/{course_id}/target", json={"target": 85})
    assert response.status_code == 200
    after = _get_course(auth_client, course_id)
    assert after == before


def test_minimum_required_is_non_mutating(auth_client):
    course_id = _create_course(auth_client, [("A1", 50), ("Final", 50)])
    _set_percent(auth_client, course_id, "A1", 80)

    before = copy.deepcopy(_get_course(auth_client, course_id))
    response = auth_client.post(
        f"/courses/{course_id}/minimum-required",
        json={"target": 85, "assessment_name": "Final"},
    )
    assert response.status_code == 200
    after = _get_course(auth_client, course_id)
    assert after == before


def test_whatif_is_non_mutating_and_stable(auth_client):
    course_id = _create_course(auth_client, [("A1", 20), ("Final", 80)])
    _set_percent(auth_client, course_id, "A1", 80)

    before = copy.deepcopy(_get_course(auth_client, course_id))
    first = auth_client.post(
        f"/courses/{course_id}/whatif",
        json={"assessment_name": "Final", "hypothetical_score": 75},
    )
    second = auth_client.post(
        f"/courses/{course_id}/whatif",
        json={"assessment_name": "Final", "hypothetical_score": 75},
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()
    after = _get_course(auth_client, course_id)
    assert after == before


def test_target_validation_rejects_over_100(auth_client):
    course_id = _create_course(auth_client, [("A1", 50), ("Final", 50)])
    response = auth_client.post(f"/courses/{course_id}/target", json={"target": 101})
    assert response.status_code == 422


def test_whatif_validation_rejects_negative(auth_client):
    course_id = _create_course(auth_client, [("A1", 50), ("Final", 50)])
    response = auth_client.post(
        f"/courses/{course_id}/whatif",
        json={"assessment_name": "Final", "hypothetical_score": -1},
    )
    assert response.status_code == 422


def test_min_required_validation_rejects_over_100(auth_client):
    course_id = _create_course(auth_client, [("A1", 50), ("Final", 50)])
    response = auth_client.post(
        f"/courses/{course_id}/minimum-required",
        json={"target": 150, "assessment_name": "Final"},
    )
    assert response.status_code == 422
