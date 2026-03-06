def _create_course(auth_client):
    payload = {
        "name": "EECS2311",
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 20, "raw_score": None, "total_score": None},
            {"name": "Midterm", "weight": 30, "raw_score": None, "total_score": None},
            {"name": "Final", "weight": 50, "raw_score": None, "total_score": None},
        ],
    }
    r = auth_client.post("/courses/", json=payload)
    assert r.status_code == 200
    return r.json()["course_id"]

def test_current_standing_partial_grade(auth_client):
    course_id = _create_course(auth_client)
    r = auth_client.put(
        f"/courses/{course_id}/grades",
        json={"assessments": [{"name": "A1", "raw_score": 80, "total_score": 100}]},
    )
    assert r.status_code == 200
    assert r.json()["current_standing"] == 16.0

def test_current_standing_boundary_0(auth_client):
    course_id = _create_course(auth_client)
    r = auth_client.put(
        f"/courses/{course_id}/grades",
        json={"assessments": [{"name": "A1", "raw_score": 0, "total_score": 100}]},
    )
    assert r.status_code == 200
    assert r.json()["current_standing"] == 0.0

def test_current_standing_boundary_100(auth_client):
    course_id = _create_course(auth_client)
    r = auth_client.put(
        f"/courses/{course_id}/grades",
        json={"assessments": [{"name": "A1", "raw_score": 100, "total_score": 100}]},
    )
    assert r.status_code == 200
    assert r.json()["current_standing"] == 20.0
