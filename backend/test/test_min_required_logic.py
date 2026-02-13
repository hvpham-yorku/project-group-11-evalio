import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def _create_course_20_30_50():
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

def _set_percent(name: str, percent: float):
    # percent as raw_score out of 100
    r = client.put("/courses/0/grades", json={
        "assessments": [{"name": name, "raw_score": percent, "total_score": 100}]
    })
    assert r.status_code == 200
    return r

def test_min_required_exact_boundary_hits_target():
    _create_course_20_30_50()

    # A1 = 80% => standing = 80*20/100 = 16
    r1 = _set_percent("A1", 80)
    assert r1.json()["current_standing"] == 16.0

    # Target 80% on Midterm (30%) assuming Final (50%) = 100%
    # points needed from Midterm:
    # target - (standing + FinalWeight) = 80 - (16 + 50) = 14
    # required percent on Midterm = 14 / 30 * 100 = 46.666...
    r = client.post("/courses/0/minimum-required", json={
        "target": 80,
        "assessment_name": "Midterm",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["assessment_name"] == "Midterm"
    assert data["minimum_required"] == pytest.approx(46.7, abs=0.1)
    assert data["is_achievable"] is True

def test_min_required_already_achieved_returns_0():
    _create_course_20_30_50()

    # If A1=100 (20 points) and Midterm=100 (30 points), standing = 50 already.
    _set_percent("A1", 100)
    _set_percent("Midterm", 100)

    r = client.post("/courses/0/minimum-required", json={
        "target": 40,                  # already achieved
        "assessment_name": "Final",     # still ungraded
    })
    assert r.status_code == 200
    data = r.json()
    assert data["minimum_required"] == 0.0
    assert data["is_achievable"] is True

def test_min_required_required_score_over_100_not_achievable():
    payload = {
        "name": "EECS2311",
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 90, "raw_score": None, "total_score": None},
            {"name": "Final", "weight": 10, "raw_score": None, "total_score": None},
        ],
    }
    r = client.post("/courses/", json=payload)
    assert r.status_code == 200

    # A1 = 10% => standing = 10*90/100 = 9
    r2 = client.put("/courses/0/grades", json={
        "assessments": [{"name": "A1", "raw_score": 10, "total_score": 100}]
    })
    assert r2.status_code == 200
    assert r2.json()["current_standing"] == 9.0

    # Need target 95 on Final (10%) assuming nothing else remains.
    # required points = 95 - 9 = 86, required % on final = 86/10*100 = 860%
    r3 = client.post("/courses/0/minimum-required", json={
        "target": 95,
        "assessment_name": "Final",
    })
    assert r3.status_code == 200
    data = r3.json()
    assert data["minimum_required"] > 100
    assert data["is_achievable"] is False

def test_min_required_single_remaining_assessment():
    payload = {
        "name": "EECS2311",
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 70, "raw_score": None, "total_score": None},
            {"name": "Final", "weight": 30, "raw_score": None, "total_score": None},
        ],
    }
    r = client.post("/courses/", json=payload)
    assert r.status_code == 200

    # A1=80 => standing=56
    r2 = client.put("/courses/0/grades", json={
        "assessments": [{"name": "A1", "raw_score": 80, "total_score": 100}]
    })
    assert r2.status_code == 200
    assert r2.json()["current_standing"] == 56.0

    # Need target 80 => points needed = 24
    # required % on Final (30%) = 24/30*100 = 80
    r3 = client.post("/courses/0/minimum-required", json={
        "target": 80,
        "assessment_name": "Final",
    })
    assert r3.status_code == 200
    data = r3.json()
    assert data["minimum_required"] == pytest.approx(80.0, abs=0.1)
    assert data["is_achievable"] is True

def test_min_required_rejects_unknown_or_already_graded_assessment():
    _create_course_20_30_50()
    _set_percent("A1", 80)

    # unknown assessment
    r = client.post("/courses/0/minimum-required", json={
        "target": 80,
        "assessment_name": "Quiz1",
    })
    assert r.status_code == 400

    # already graded assessment should be rejected
    r2 = client.post("/courses/0/minimum-required", json={
        "target": 80,
        "assessment_name": "A1",
    })
    assert r2.status_code == 400
