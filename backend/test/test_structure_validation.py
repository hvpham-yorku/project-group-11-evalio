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


def test_update_weights_success_total_100():
    _create_course()
    r = client.put("/courses/0/weights", json={
        "assessments": [
            {"name": "A1", "weight": "25"},
            {"name": "Midterm", "weight": "25"},
            {"name": "Final", "weight": "50"},
        ]
    })
    assert r.status_code == 200
    assert r.json()["total_weight"] == 100.0


def test_update_weights_reject_total_not_100():
    _create_course()
    r = client.put("/courses/0/weights", json={
        "assessments": [
            {"name": "A1", "weight": "20"},
            {"name": "Midterm", "weight": "20"},
            {"name": "Final", "weight": "50"},
        ]
    })
    assert r.status_code == 400
    assert "must equal 100" in r.json()["detail"]


def test_update_weights_reject_duplicate_names():
    _create_course()
    r = client.put("/courses/0/weights", json={
        "assessments": [
            {"name": "A1", "weight": "50"},
            {"name": "A1", "weight": "50"},
            {"name": "Final", "weight": "0"},
        ]
    })
    assert r.status_code == 400
    assert "Duplicate assessment" in r.json()["detail"]


def test_update_weights_reject_missing_assessment():
    _create_course()
    r = client.put("/courses/0/weights", json={
        "assessments": [
            {"name": "A1", "weight": "50"},
            {"name": "Final", "weight": "50"},
        ]
    })
    assert r.status_code == 400
    assert "Missing assessment updates" in r.json()["detail"]


def test_update_weights_reject_unknown_assessment():
    _create_course()
    r = client.put("/courses/0/weights", json={
        "assessments": [
            {"name": "A1", "weight": "50"},
            {"name": "Midterm", "weight": "50"},
            {"name": "Quiz", "weight": "0"},
        ]
    })
    assert r.status_code == 400
    assert "does not exist" in r.json()["detail"]


def test_update_weights_reject_negative_weight():
    _create_course()
    r = client.put("/courses/0/weights", json={
        "assessments": [
            {"name": "A1", "weight": "-1"},
            {"name": "Midterm", "weight": "51"},
            {"name": "Final", "weight": "50"},
        ]
    })
    assert r.status_code == 400
    assert "non-negative" in r.json()["detail"]
