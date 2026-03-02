from uuid import uuid4

import pytest


def _course_payload():
    return {
        "name": "EECS2311",
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 20, "raw_score": None, "total_score": None},
            {"name": "Midterm", "weight": 30, "raw_score": None, "total_score": None},
            {"name": "Final", "weight": 50, "raw_score": None, "total_score": None},
        ],
    }


@pytest.mark.parametrize(
    "method,path,payload",
    [
        ("get", "/courses/", None),
        ("post", "/courses/", _course_payload()),
        (
            "put",
            f"/courses/{uuid4()}/weights",
            {
                "assessments": [
                    {"name": "A1", "weight": 20},
                    {"name": "Midterm", "weight": 30},
                    {"name": "Final", "weight": 50},
                ]
            },
        ),
        (
            "put",
            f"/courses/{uuid4()}/grades",
            {"assessments": [{"name": "A1", "raw_score": 80, "total_score": 100}]},
        ),
        ("post", f"/courses/{uuid4()}/target", {"target": 80}),
        (
            "post",
            f"/courses/{uuid4()}/minimum-required",
            {"target": 80, "assessment_name": "Final"},
        ),
        (
            "post",
            f"/courses/{uuid4()}/whatif",
            {"assessment_name": "Final", "hypothetical_score": 80},
        ),
    ],
)
def test_courses_endpoints_require_authentication(client, method, path, payload):
    request_fn = getattr(client, method)
    response = request_fn(path, json=payload) if payload is not None else request_fn(path)
    assert response.status_code == 401


def test_courses_are_user_scoped(make_auth_client):
    client_a = make_auth_client(email="usera@example.com")
    client_b = make_auth_client(email="userb@example.com")

    created = client_a.post("/courses/", json=_course_payload())
    assert created.status_code == 200
    course_id = created.json()["course_id"]

    list_a = client_a.get("/courses/")
    assert list_a.status_code == 200
    assert len(list_a.json()) == 1

    list_b = client_b.get("/courses/")
    assert list_b.status_code == 200
    assert list_b.json() == []

    update_by_b = client_b.put(
        f"/courses/{course_id}/grades",
        json={"assessments": [{"name": "A1", "raw_score": 75, "total_score": 100}]},
    )
    assert update_by_b.status_code == 404
