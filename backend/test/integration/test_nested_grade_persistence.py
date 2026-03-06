import pytest


def _create_parent_child_course(auth_client):
    payload = {
        "name": "EECS2311",
        "term": "W26",
        "assessments": [
            {
                "name": "Labs",
                "weight": 40,
                "raw_score": None,
                "total_score": None,
                "children": [
                    {"name": "Lab 1", "weight": 20, "raw_score": None, "total_score": None},
                    {"name": "Lab 2", "weight": 20, "raw_score": None, "total_score": None},
                ],
            },
            {"name": "Final", "weight": 60, "raw_score": None, "total_score": None},
        ],
    }
    created = auth_client.post("/courses/", json=payload)
    assert created.status_code == 200
    return created.json()["course_id"]


def _get_course(auth_client, course_id: str) -> dict:
    listed = auth_client.get("/courses/")
    assert listed.status_code == 200
    for course in listed.json():
        if str(course["course_id"]) == str(course_id):
            return course
    raise AssertionError(f"Course {course_id} not found")


def test_nested_child_grades_are_persisted_and_used_for_current_grade(auth_client):
    course_id = _create_parent_child_course(auth_client)

    update = auth_client.put(
        f"/courses/{course_id}/grades",
        json={
            "assessments": [
                {
                    "name": "Labs",
                    "raw_score": 70,
                    "total_score": 100,
                    "children": [
                        {"name": "Lab 1", "raw_score": 80, "total_score": 100},
                        {"name": "Lab 2", "raw_score": 60, "total_score": 100},
                    ],
                }
            ]
        },
    )
    assert update.status_code == 200
    assert update.json()["current_standing"] == pytest.approx(28.0, abs=0.01)

    stored = _get_course(auth_client, course_id)
    labs = next(assessment for assessment in stored["assessments"] if assessment["name"] == "Labs")
    assert labs["raw_score"] == pytest.approx(70.0, abs=0.01)
    assert labs["total_score"] == pytest.approx(100.0, abs=0.01)

    child_scores = {child["name"]: (child["raw_score"], child["total_score"]) for child in labs["children"]}
    assert child_scores["Lab 1"] == pytest.approx((80.0, 100.0), abs=0.01)
    assert child_scores["Lab 2"] == pytest.approx((60.0, 100.0), abs=0.01)

    target = auth_client.post(f"/courses/{course_id}/target", json={"target": 85})
    assert target.status_code == 200
    assert target.json()["final_total"] == pytest.approx(28.0, abs=0.01)


def test_nested_child_grades_can_be_cleared(auth_client):
    course_id = _create_parent_child_course(auth_client)

    first_update = auth_client.put(
        f"/courses/{course_id}/grades",
        json={
            "assessments": [
                {
                    "name": "Labs",
                    "raw_score": 70,
                    "total_score": 100,
                    "children": [
                        {"name": "Lab 1", "raw_score": 80, "total_score": 100},
                        {"name": "Lab 2", "raw_score": 60, "total_score": 100},
                    ],
                }
            ]
        },
    )
    assert first_update.status_code == 200

    clear_child = auth_client.put(
        f"/courses/{course_id}/grades",
        json={
            "assessments": [
                {
                    "name": "Labs",
                    "raw_score": 60,
                    "total_score": 100,
                    "children": [
                        {"name": "Lab 1", "raw_score": None, "total_score": None},
                        {"name": "Lab 2", "raw_score": 60, "total_score": 100},
                    ],
                }
            ]
        },
    )
    assert clear_child.status_code == 200

    stored = _get_course(auth_client, course_id)
    labs = next(assessment for assessment in stored["assessments"] if assessment["name"] == "Labs")
    child_scores = {child["name"]: (child["raw_score"], child["total_score"]) for child in labs["children"]}
    assert child_scores["Lab 1"] == (None, None)
    assert child_scores["Lab 2"] == pytest.approx((60.0, 100.0), abs=0.01)

    target = auth_client.post(f"/courses/{course_id}/target", json={"target": 85})
    assert target.status_code == 200
    assert target.json()["final_total"] == pytest.approx(12.0, abs=0.01)
