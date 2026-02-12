from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def _create_course():
    payload = {
        "name": "EECS2311",
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 20, "grade": None},
            {"name": "Midterm", "weight": 30, "grade": None},
            {"name": "Final", "weight": 50, "grade": None},
        ],
    }
    r = client.post("/courses/", json=payload)
    assert r.status_code == 200

def test_current_standing_partial_grade():
    _create_course()
    # A1=80, weight=20 -> contribution = 16.0
    r = client.put("/courses/0/grades", json={"assessments": [{"name": "A1", "grade": 80}]})
    assert r.status_code == 200
    assert r.json()["current_standing"] == 16.0

def test_current_standing_boundary_0():
    _create_course()
    # A1=0, weight=20 -> contribution = 0.0
    r = client.put("/courses/0/grades", json={"assessments": [{"name": "A1", "grade": 0}]})
    assert r.status_code == 200
    assert r.json()["current_standing"] == 0.0

def test_current_standing_boundary_100():
    _create_course()
    # A1=100, weight=20 -> contribution = 20.0
    r = client.put("/courses/0/grades", json={"assessments": [{"name": "A1", "grade": 100}]})
    assert r.status_code == 200
    assert r.json()["current_standing"] == 20.0
