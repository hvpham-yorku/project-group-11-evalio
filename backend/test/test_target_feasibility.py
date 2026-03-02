from uuid import uuid4

def _create_course_total_80(auth_client):
    payload = {
        "name": "Test",
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 30, "raw_score": None, "total_score": None},
            {"name": "A2", "weight": 50, "raw_score": None, "total_score": None},
        ],
    }
    r = auth_client.post("/courses/", json=payload)
    assert r.status_code == 200
    return r.json()["course_id"]

def test_target_too_high_not_feasible(auth_client):
    course_id = _create_course_total_80(auth_client)
    r = auth_client.post(f"/courses/{course_id}/target", json={"target": 90})
    assert r.status_code == 200
    assert r.json()["feasible"] is False

def test_target_exactly_achievable_feasible(auth_client):
    course_id = _create_course_total_80(auth_client)
    r = auth_client.post(f"/courses/{course_id}/target", json={"target": 80})
    assert r.status_code == 200
    assert r.json()["feasible"] is True

def test_no_remaining_assessments_max_possible_equals_current(auth_client):
    course_id = _create_course_total_80(auth_client)
    r = auth_client.put(f"/courses/{course_id}/grades", json={
        "assessments": [
            {"name": "A1", "raw_score": 100, "total_score": 100},
            {"name": "A2", "raw_score": 100, "total_score": 100},
        ]
    })
    assert r.status_code == 200

    r2 = auth_client.post(f"/courses/{course_id}/target", json={"target": 80})
    assert r2.status_code == 200
    data = r2.json()
    assert data["maximum_possible"] == data["current_standing"]

def test_target_unknown_course_returns_404(auth_client):
    r = auth_client.post(f"/courses/{uuid4()}/target", json={"target": 80})
    assert r.status_code == 404


def test_target_feasibility_respects_best_of_remaining_potential(auth_client):
    payload = {
        "name": "EECS Parent Child",
        "term": "W26",
        "assessments": [
            {
                "name": "Quizzes",
                "weight": 30,
                "rule_type": "best_of",
                "rule_config": {"best_count": 2},
                "children": [
                    {"name": "Quiz 1", "weight": 10, "raw_score": 100, "total_score": 100},
                    {"name": "Quiz 2", "weight": 10, "raw_score": 100, "total_score": 100},
                    {"name": "Quiz 3", "weight": 10, "raw_score": None, "total_score": None},
                ],
            },
            {"name": "Midterm", "weight": 70, "raw_score": 70, "total_score": 100},
        ],
    }
    created = auth_client.post("/courses/", json=payload)
    assert created.status_code == 200
    course_id = created.json()["course_id"]

    response = auth_client.post(f"/courses/{course_id}/target", json={"target": 80})
    assert response.status_code == 200
    data = response.json()

    assert data["current_standing"] == 69.0
    assert data["maximum_possible"] == 69.0
    assert data["feasible"] is False


def test_target_feasibility_ignores_bonus_contribution(auth_client):
    payload = {
        "name": "EECS Bonus",
        "term": "W26",
        "assessments": [
            {"name": "Core Midterm", "weight": 60, "raw_score": 100, "total_score": 100},
            {"name": "Core Final", "weight": 20, "raw_score": None, "total_score": None},
            {"name": "Participation Bonus", "weight": 20, "raw_score": 100, "total_score": 100, "is_bonus": True},
        ],
    }
    created = auth_client.post("/courses/", json=payload)
    assert created.status_code == 200
    course_id = created.json()["course_id"]

    response = auth_client.post(f"/courses/{course_id}/target", json={"target": 85})
    assert response.status_code == 200
    data = response.json()

    assert data["current_standing"] == 60.0
    assert data["maximum_possible"] == 80.0
    assert data["core_total"] == 60.0
    assert data["bonus_total"] == 20.0
    assert data["final_total"] == 80.0
    assert data["feasible"] is False
