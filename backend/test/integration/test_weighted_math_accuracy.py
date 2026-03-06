import pytest


def _create_course(auth_client, weights, graded=None):
    payload = {
        "name": "EECS2311",
        "term": "W26",
        "assessments": [
            {"name": name, "weight": weight, "raw_score": None, "total_score": None}
            for name, weight in weights
        ],
    }
    created = auth_client.post("/courses/", json=payload)
    assert created.status_code == 200
    course_id = created.json()["course_id"]

    if graded:
        updated = auth_client.put(
            f"/courses/{course_id}/grades",
            json={
                "assessments": [
                    {"name": name, "raw_score": float(percent), "total_score": 100.0}
                    for name, percent in graded.items()
                ]
            },
        )
        assert updated.status_code == 200

    return course_id


def test_weighted_math_current_standing_matches_expected(auth_client):
    course_id = _create_course(
        auth_client,
        [("A1", 20), ("Midterm", 30), ("Final", 50)],
        graded={"A1": 80, "Midterm": 70},
    )

    response = auth_client.post(f"/courses/{course_id}/target", json={"target": 85})
    assert response.status_code == 200
    data = response.json()

    assert data["current_standing"] == pytest.approx(37.0, abs=0.01)


def test_best_case_maximum_possible_is_current_plus_remaining_potential(auth_client):
    course_id = _create_course(
        auth_client,
        [("A1", 20), ("Midterm", 30), ("Final", 50)],
        graded={"A1": 80},
    )

    response = auth_client.post(f"/courses/{course_id}/target", json={"target": 85})
    assert response.status_code == 200
    data = response.json()

    assert data["current_standing"] == pytest.approx(16.0, abs=0.01)
    assert data["maximum_possible"] == pytest.approx(96.0, abs=0.01)


def test_incomplete_weight_structure_does_not_crash_and_is_stable(auth_client):
    course_id = _create_course(
        auth_client,
        [("A1", 30), ("Final", 30)],
        graded={"A1": 80},
    )

    first = auth_client.post(f"/courses/{course_id}/target", json={"target": 85})
    second = auth_client.post(f"/courses/{course_id}/target", json={"target": 85})

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()
