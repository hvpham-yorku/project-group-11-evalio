import copy
from uuid import UUID

import pytest


def _create_course(auth_client, name="EECS2311"):
    payload = {
        "name": name,
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 20, "raw_score": None, "total_score": None},
            {"name": "Final", "weight": 80, "raw_score": None, "total_score": None},
        ],
    }
    r = auth_client.post("/courses/", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert "course_id" in data
    UUID(str(data["course_id"]))
    return str(data["course_id"])


def _get_course_from_list(auth_client, course_id: str) -> dict:
    r = auth_client.get("/courses/")
    assert r.status_code == 200
    courses = r.json()
    for c in courses:
        if str(c["course_id"]) == str(course_id):
            return c
    raise AssertionError(f"Course {course_id} not found in list")


def test_scenario_crud_and_run_non_mutating(auth_client):
    course_id = _create_course(auth_client)

    # Set a real grade so we can verify non-mutation later
    r = auth_client.put(
        f"/courses/{course_id}/grades",
        json={"assessments": [{"name": "A1", "raw_score": 80, "total_score": 100}]},
    )
    assert r.status_code == 200

    before = copy.deepcopy(_get_course_from_list(auth_client, course_id))

    # Create scenario (single-entry)
    payload = {
        "name": "Final 90",
        "scenarios": [{"assessment_name": "Final", "score": 90}],
    }
    created = auth_client.post(f"/courses/{course_id}/scenarios", json=payload)
    assert created.status_code == 200
    created_json = created.json()
    assert created_json["message"] == "Scenario saved successfully"
    scenario = created_json["scenario"]
    assert "scenario_id" in scenario
    scenario_id = scenario["scenario_id"]
    UUID(scenario_id)

    # List scenarios
    listed = auth_client.get(f"/courses/{course_id}/scenarios")
    assert listed.status_code == 200
    listed_json = listed.json()
    assert listed_json["count"] == 1
    assert listed_json["scenarios"][0]["scenario_id"] == scenario_id

    # Get scenario
    fetched = auth_client.get(f"/courses/{course_id}/scenarios/{scenario_id}")
    assert fetched.status_code == 200
    assert fetched.json()["scenario"]["name"] == "Final 90"

    # Run scenario (should not mutate stored course grades)
    run = auth_client.get(f"/courses/{course_id}/scenarios/{scenario_id}/run")
    assert run.status_code == 200
    run_json = run.json()
    assert run_json["scenario"]["scenario_id"] == scenario_id
    assert "result" in run_json  # result payload from what-if logic

    after = _get_course_from_list(auth_client, course_id)
    assert after == before  # non-mutation guarantee

    # Delete scenario
    deleted = auth_client.delete(f"/courses/{course_id}/scenarios/{scenario_id}")
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True

    # List should be empty
    listed2 = auth_client.get(f"/courses/{course_id}/scenarios")
    assert listed2.status_code == 200
    assert listed2.json()["count"] == 0


def test_scenario_validation_duplicate_assessment_in_payload(auth_client):
    course_id = _create_course(auth_client)

    payload = {
        "name": "Dup test",
        "scenarios": [
            {"assessment_name": "Final", "score": 90},
            {"assessment_name": "Final", "score": 80},
        ],
    }
    r = auth_client.post(f"/courses/{course_id}/scenarios", json=payload)
    assert r.status_code == 400
    assert "Duplicate assessment" in r.json()["detail"]


def test_scenario_validation_assessment_not_found(auth_client):
    course_id = _create_course(auth_client)

    payload = {
        "name": "Bad assessment",
        "scenarios": [{"assessment_name": "Midterm", "score": 80}],
    }
    r = auth_client.post(f"/courses/{course_id}/scenarios", json=payload)
    assert r.status_code == 400
    assert "not found in course" in r.json()["detail"]


def test_scenario_score_out_of_range_rejected_by_schema(auth_client):
    course_id = _create_course(auth_client)

    payload = {
        "name": "Bad score",
        "scenarios": [{"assessment_name": "Final", "score": 101}],
    }
    r = auth_client.post(f"/courses/{course_id}/scenarios", json=payload)
    assert r.status_code == 422  # Pydantic schema validation