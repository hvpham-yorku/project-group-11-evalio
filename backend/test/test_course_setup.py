from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_create_course_success():
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
    data = r.json()
    assert data["message"] == "Course created successfully"
    assert data["total_weight"] == 100

def test_create_course_rejects_empty_assessments():
    payload = {"name": "X", "term": "W26", "assessments": []}
    r = client.post("/courses/", json=payload)
    assert r.status_code == 400
    assert "At least one assessment" in r.json()["detail"]

def test_create_course_rejects_total_weight_over_100():
    payload = {
        "name": "X",
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 60, "grade": None},
            {"name": "A2", "weight": 60, "grade": None},
        ],
    }
    r = client.post("/courses/", json=payload)
    assert r.status_code == 400
    assert "cannot exceed 100" in r.json()["detail"]
