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

def test_target_check_does_not_change_grades():
    _create_course()

    # Set one grade
    r1 = client.put("/courses/0/grades", json={"assessments": [{"name": "A1", "grade": 80}]})
    assert r1.status_code == 200

    # Snapshot stored state
    before = client.get("/courses/").json()
    before_grades = [(a["name"], a["grade"]) for a in before[0]["assessments"]]

    # Call analysis endpoint (should not mutate anything)
    r2 = client.post("/courses/0/target", json={"target": 85})
    assert r2.status_code == 200

    after = client.get("/courses/").json()
    after_grades = [(a["name"], a["grade"]) for a in after[0]["assessments"]]

    assert before_grades == after_grades

def test_repeated_target_calls_consistent():
    _create_course()
    r1 = client.post("/courses/0/target", json={"target": 70})
    r2 = client.post("/courses/0/target", json={"target": 70})
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json() == r2.json()
