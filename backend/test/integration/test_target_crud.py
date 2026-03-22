from uuid import uuid4


def _create_course(auth_client, name="Test Course"):
    payload = {
        "name": name,
        "term": "W26",
        "assessments": [
            {"name": "Midterm", "weight": 40},
            {"name": "Final", "weight": 60},
        ],
    }
    response = auth_client.post("/courses/", json=payload)
    assert response.status_code == 200
    return response.json()["course_id"]


def test_get_target_returns_404_when_none_set(auth_client):
    course_id = _create_course(auth_client)
    response = auth_client.get(f"/courses/{course_id}/target")
    assert response.status_code == 404


def test_set_then_get_target(auth_client):
    course_id = _create_course(auth_client)
    set_response = auth_client.post(f"/courses/{course_id}/target", json={"target": 85})
    assert set_response.status_code == 200

    get_response = auth_client.get(f"/courses/{course_id}/target")
    assert get_response.status_code == 200
    data = get_response.json()
    assert data["course_id"] == course_id
    assert data["target_percentage"] == 85.0
    assert "created_at" in data


def test_update_target_overwrites(auth_client):
    course_id = _create_course(auth_client)
    auth_client.post(f"/courses/{course_id}/target", json={"target": 70})
    auth_client.post(f"/courses/{course_id}/target", json={"target": 90})

    response = auth_client.get(f"/courses/{course_id}/target")
    assert response.status_code == 200
    assert response.json()["target_percentage"] == 90.0


def test_delete_target(auth_client):
    course_id = _create_course(auth_client)
    auth_client.post(f"/courses/{course_id}/target", json={"target": 80})

    delete_response = auth_client.delete(f"/courses/{course_id}/target")
    assert delete_response.status_code == 204

    get_response = auth_client.get(f"/courses/{course_id}/target")
    assert get_response.status_code == 404


def test_delete_target_when_none_set_returns_404(auth_client):
    course_id = _create_course(auth_client)
    response = auth_client.delete(f"/courses/{course_id}/target")
    assert response.status_code == 404


def test_get_target_unknown_course_returns_404(auth_client):
    response = auth_client.get(f"/courses/{uuid4()}/target")
    assert response.status_code == 404


def test_delete_target_unknown_course_returns_404(auth_client):
    response = auth_client.delete(f"/courses/{uuid4()}/target")
    assert response.status_code == 404


def test_course_deletion_cascades_target(auth_client):
    course_id = _create_course(auth_client)
    auth_client.post(f"/courses/{course_id}/target", json={"target": 75})

    delete_course_response = auth_client.delete(f"/courses/{course_id}")
    assert delete_course_response.status_code == 200

    response = auth_client.get(f"/courses/{course_id}/target")
    assert response.status_code == 404


def test_get_target_other_user_returns_404(make_auth_client):
    owner = make_auth_client(email="owner@example.com")
    other = make_auth_client(email="other@example.com")
    course_id = _create_course(owner, name="Owner Course")
    set_response = owner.post(f"/courses/{course_id}/target", json={"target": 82})
    assert set_response.status_code == 200

    get_response = other.get(f"/courses/{course_id}/target")
    assert get_response.status_code == 404
