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
