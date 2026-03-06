from uuid import uuid4


def _course_payload(name: str = "EECS2311"):
    return {
        "name": name,
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 20, "raw_score": None, "total_score": None},
            {"name": "Midterm", "weight": 30, "raw_score": None, "total_score": None},
            {"name": "Final", "weight": 50, "raw_score": None, "total_score": None},
        ],
    }


def test_update_course_metadata_success(auth_client):
    created = auth_client.post("/courses/", json=_course_payload())
    assert created.status_code == 200
    course_id = created.json()["course_id"]

    response = auth_client.put(
        f"/courses/{course_id}",
        json={"name": "EECS2311 Updated", "term": "F26"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["message"] == "Course metadata updated successfully"
    assert body["course"]["name"] == "EECS2311 Updated"
    assert body["course"]["term"] == "F26"


def test_update_course_metadata_unknown_course_returns_404(auth_client):
    response = auth_client.put(
        f"/courses/{uuid4()}",
        json={"name": "EECS2311 Updated", "term": "F26"},
    )
    assert response.status_code == 404


def test_delete_course_success(auth_client):
    created = auth_client.post("/courses/", json=_course_payload())
    assert created.status_code == 200
    course_id = created.json()["course_id"]

    deleted = auth_client.delete(f"/courses/{course_id}")
    assert deleted.status_code == 200
    assert deleted.json()["message"] == "Course deleted successfully"

    listed = auth_client.get("/courses/")
    assert listed.status_code == 200
    assert listed.json() == []


def test_delete_course_unknown_course_returns_404(auth_client):
    response = auth_client.delete(f"/courses/{uuid4()}")
    assert response.status_code == 404


def test_course_management_endpoints_are_user_scoped(make_auth_client):
    client_a = make_auth_client(email="owner@example.com")
    client_b = make_auth_client(email="other@example.com")

    created = client_a.post("/courses/", json=_course_payload("EECS Owner"))
    assert created.status_code == 200
    course_id = created.json()["course_id"]

    update_by_other = client_b.put(
        f"/courses/{course_id}",
        json={"name": "Hacked", "term": "F26"},
    )
    assert update_by_other.status_code == 404

    delete_by_other = client_b.delete(f"/courses/{course_id}")
    assert delete_by_other.status_code == 404

