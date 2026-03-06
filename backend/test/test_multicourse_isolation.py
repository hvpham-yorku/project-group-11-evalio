import copy
from uuid import UUID


def _create_course(auth_client, name: str):
    payload = {
        "name": name,
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 50, "raw_score": None, "total_score": None},
            {"name": "Final", "weight": 50, "raw_score": None, "total_score": None},
        ],
    }
    r = auth_client.post("/courses/", json=payload)
    assert r.status_code == 200
    course_id = str(r.json()["course_id"])
    UUID(course_id)
    return course_id


def _get_course_from_list(auth_client, course_id: str) -> dict:
    r = auth_client.get("/courses/")
    assert r.status_code == 200
    for c in r.json():
        if str(c["course_id"]) == str(course_id):
            return c
    raise AssertionError(f"Course {course_id} not found")


def test_two_courses_are_isolated_on_grade_updates(auth_client):
    course_a = _create_course(auth_client, "EECS2311")
    course_b = _create_course(auth_client, "EECS3311")

    before_a = copy.deepcopy(_get_course_from_list(auth_client, course_a))
    before_b = copy.deepcopy(_get_course_from_list(auth_client, course_b))

    # Update grades ONLY in course A
    r = auth_client.put(
        f"/courses/{course_a}/grades",
        json={"assessments": [{"name": "A1", "raw_score": 80, "total_score": 100}]},
    )
    assert r.status_code == 200

    after_a = _get_course_from_list(auth_client, course_a)
    after_b = _get_course_from_list(auth_client, course_b)

    assert after_a != before_a  # course A changed
    assert after_b == before_b  # course B unchanged


def test_scenarios_are_isolated_per_course(auth_client):
    course_a = _create_course(auth_client, "EECS2311")
    course_b = _create_course(auth_client, "EECS3311")

    # Create scenario for course A
    payload = {"name": "Final 90", "scenarios": [{"assessment_name": "Final", "score": 90}]}
    r = auth_client.post(f"/courses/{course_a}/scenarios", json=payload)
    assert r.status_code == 200

    # List scenarios in A: should have 1
    la = auth_client.get(f"/courses/{course_a}/scenarios")
    assert la.status_code == 200
    assert la.json()["count"] == 1

    # List scenarios in B: should have 0
    lb = auth_client.get(f"/courses/{course_b}/scenarios")
    assert lb.status_code == 200
    assert lb.json()["count"] == 0