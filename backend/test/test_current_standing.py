from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def _create_course():
    payload = {
        "name": "EECS2311",
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 20, "raw_score": None, "total_score": None},
            {"name": "Midterm", "weight": 30, "raw_score": None, "total_score": None},
            {"name": "Final", "weight": 50, "raw_score": None, "total_score": None},
        ],
    }
    r = client.post("/courses/", json=payload)
    assert r.status_code == 200

def test_current_standing_partial_grade():
    _create_course()
    r = client.put(
        "/courses/0/grades",
        json={"assessments": [{"name": "A1", "raw_score": 80, "total_score": 100}]},
    )
    assert r.status_code == 200
    assert r.json()["current_standing"] == 16.0

def test_current_standing_boundary_0():
    _create_course()
    r = client.put(
        "/courses/0/grades",
        json={"assessments": [{"name": "A1", "raw_score": 0, "total_score": 100}]},
    )
    assert r.status_code == 200
    assert r.json()["current_standing"] == 0.0

def test_current_standing_boundary_100():
    _create_course()
    r = client.put(
        "/courses/0/grades",
        json={"assessments": [{"name": "A1", "raw_score": 100, "total_score": 100}]},
    )
    assert r.status_code == 200
    assert r.json()["current_standing"] == 20.0
