import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def _create_course_20_30_50():
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

def test_min_required_exact_boundary_hits_target():
    """
    We don't have a 'min required' endpoint yet, so we test the logic by:
    - computing the required remaining avg in the TEST (oracle),
    - applying that avg as grades to remaining assessments,
    - confirming target becomes feasible.
    """
    _create_course_20_30_50()

    # Set A1 = 80 => standing contribution = 80*20/100 = 16
    r = client.put("/courses/0/grades", json={"assessments": [{"name": "A1", "grade": 80}]})
    assert r.status_code == 200
    assert r.json()["current_standing"] == 16.0

    target = 80.0
    standing = 16.0
    remaining_weight = 30.0 + 50.0  # Midterm + Final
    required_avg = (target - standing) / remaining_weight * 100.0  # should be 80.0 exactly here
    assert required_avg == pytest.approx(80.0)

    # Apply required avg to remaining assessments
    r2 = client.put("/courses/0/grades", json={
        "assessments": [
            {"name": "Midterm", "grade": required_avg},
            {"name": "Final", "grade": required_avg},
        ]
    })
    assert r2.status_code == 200

    # Now the target should be feasible (course complete, max_possible == current_standing)
    r3 = client.post("/courses/0/target", json={"target": target})
    assert r3.status_code == 200
    data = r3.json()
    assert data["feasible"] is True
    assert data["maximum_possible"] == data["current_standing"]
    assert data["current_standing"] == pytest.approx(80.0, abs=0.01)

def test_min_required_slightly_below_fails_target():
    _create_course_20_30_50()
    client.put("/courses/0/grades", json={"assessments": [{"name": "A1", "grade": 80}]})

    # Required avg is 80; use 79 to show it fails
    r2 = client.put("/courses/0/grades", json={
        "assessments": [
            {"name": "Midterm", "grade": 79},
            {"name": "Final", "grade": 79},
        ]
    })
    assert r2.status_code == 200

    r3 = client.post("/courses/0/target", json={"target": 80})
    assert r3.status_code == 200
    assert r3.json()["feasible"] is False
def test_min_required_required_score_over_100():
    # Course total weight 100, but remaining is tiny so required becomes >100 easily
    payload = {
        "name": "EECS2311",
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 90, "grade": None},
            {"name": "Final", "weight": 10, "grade": None},
        ],
    }
    r = client.post("/courses/", json=payload)
    assert r.status_code == 200

    # Put a low grade in A1 => standing = 10*90/100 = 9
    r2 = client.put("/courses/0/grades", json={"assessments": [{"name": "A1", "grade": 10}]})
    assert r2.status_code == 200
    standing = r2.json()["current_standing"]
    assert standing == 9.0

    target = 30.0
    remaining_weight = 10.0
    required_avg = (target - standing) / remaining_weight * 100.0
    assert required_avg > 100

    # Target should be infeasible (max possible = 9 + 10 = 19)
    r3 = client.post("/courses/0/target", json={"target": target})
    assert r3.status_code == 200
    assert r3.json()["feasible"] is False


def test_min_required_single_remaining_assessment():
    payload = {
        "name": "EECS2311",
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 70, "grade": None},
            {"name": "Final", "weight": 30, "grade": None},
        ],
    }
    r = client.post("/courses/", json=payload)
    assert r.status_code == 200

    # A1=80 => standing = 56
    r2 = client.put("/courses/0/grades", json={"assessments": [{"name": "A1", "grade": 80}]})
    assert r2.status_code == 200
    standing = r2.json()["current_standing"]
    assert standing == 56.0

    target = 65.0
    remaining_weight = 30.0
    required_avg = (target - standing) / remaining_weight * 100.0
    assert required_avg == pytest.approx(30.0)

    # Apply exactly required avg to the single remaining assessment
    r3 = client.put("/courses/0/grades", json={"assessments": [{"name": "Final", "grade": required_avg}]})
    assert r3.status_code == 200

    r4 = client.post("/courses/0/target", json={"target": target})
    assert r4.status_code == 200
    assert r4.json()["feasible"] is True
