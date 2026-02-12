import copy
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def _create_course():
    r = client.post("/courses/", json={
        "name": "EECS2311",
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 20, "grade": None},
            {"name": "Final", "weight": 80, "grade": None},
        ]
    })
    assert r.status_code == 200

def _set_grade(name, grade):
    r = client.put("/courses/0/grades", json={"assessments": [{"name": name, "grade": grade}]})
    assert r.status_code == 200

def _get_course():
    r = client.get("/courses/")
    assert r.status_code == 200
    return r.json()[0]

def what_if_final_grade(course_dict, assessment_name, hypothetical_grade):
    # read-only calculation: ONE hypothetical score for ONE remaining assessment
    total = 0.0
    for a in course_dict["assessments"]:
        w = float(a["weight"])
        g = a["grade"]
        if g is None and a["name"] == assessment_name:
            total += (float(hypothetical_grade) * w) / 100.0
        elif g is not None:
            total += (float(g) * w) / 100.0
    return total

def test_what_if_real_grades_unchanged():
    _create_course()
    _set_grade("A1", 80)

    before = _get_course()
    before_copy = copy.deepcopy(before)

    projected = what_if_final_grade(before, "Final", 90)
    assert projected == pytest.approx(88.0)  # 16 + 72

    after = _get_course()
    assert after == before_copy
    final_grade = [a["grade"] for a in after["assessments"] if a["name"] == "Final"][0]
    assert final_grade is None

def test_what_if_boundary_values_0_and_100():
    _create_course()
    _set_grade("A1", 80)
    c = _get_course()

    p0 = what_if_final_grade(c, "Final", 0)
    p100 = what_if_final_grade(c, "Final", 100)

    assert p0 == pytest.approx(16.0)
    assert p100 == pytest.approx(96.0)
    assert p100 >= p0

def test_repeated_what_if_calls_consistent():
    _create_course()
    _set_grade("A1", 80)
    c = _get_course()

    p1 = what_if_final_grade(c, "Final", 75)
    p2 = what_if_final_grade(c, "Final", 75)
    p3 = what_if_final_grade(c, "Final", 75)

    assert p1 == pytest.approx(p2)
    assert p2 == pytest.approx(p3)
