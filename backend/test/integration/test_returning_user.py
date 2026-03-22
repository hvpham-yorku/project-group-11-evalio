def _create_course(client, name="Course A"):
    payload = {
        "name": name,
        "term": "W26",
        "assessments": [
            {"name": "Assignment", "weight": 30},
            {"name": "Exam", "weight": 70},
        ],
    }
    response = client.post("/courses/", json=payload)
    assert response.status_code == 200
    return response.json()["course_id"]


def test_state_no_courses(auth_client):
    response = auth_client.get("/auth/me/state")
    assert response.status_code == 200
    data = response.json()
    assert data["has_courses"] is False
    assert data["courses"] == []
    assert "user_id" in data
    assert "email" in data


def test_state_one_course_no_target(auth_client):
    course_id = _create_course(auth_client)
    response = auth_client.get("/auth/me/state")
    assert response.status_code == 200
    data = response.json()
    assert data["has_courses"] is True
    assert len(data["courses"]) == 1
    assert data["courses"][0]["course_id"] == course_id
    assert data["courses"][0]["target_percentage"] is None


def test_state_one_course_with_target(auth_client):
    course_id = _create_course(auth_client)
    auth_client.post(f"/courses/{course_id}/target", json={"target": 85})

    response = auth_client.get("/auth/me/state")
    data = response.json()
    assert len(data["courses"]) == 1
    assert data["courses"][0]["target_percentage"] == 85.0


def test_state_multiple_courses_different_targets(auth_client):
    course_a = _create_course(auth_client, name="Course A")
    course_b = _create_course(auth_client, name="Course B")

    auth_client.post(f"/courses/{course_a}/target", json={"target": 90})
    auth_client.post(f"/courses/{course_b}/target", json={"target": 70})

    response = auth_client.get("/auth/me/state")
    data = response.json()
    assert data["has_courses"] is True
    assert len(data["courses"]) == 2

    by_id = {course["course_id"]: course for course in data["courses"]}
    assert by_id[course_a]["target_percentage"] == 90.0
    assert by_id[course_b]["target_percentage"] == 70.0


def test_state_target_survives_simulated_relogin(make_auth_client):
    client = make_auth_client(email="resume@example.com")
    course_id = _create_course(client, name="Persistent Course")
    client.post(f"/courses/{course_id}/target", json={"target": 88})

    logout_response = client.post("/auth/logout")
    assert logout_response.status_code == 200
    login_response = client.post(
        "/auth/login",
        json={"email": "resume@example.com", "password": "password123"},
    )
    assert login_response.status_code == 200

    response = client.get("/auth/me/state")
    assert response.status_code == 200
    data = response.json()
    assert len(data["courses"]) == 1
    assert data["courses"][0]["target_percentage"] == 88.0


def test_state_unauthenticated_returns_401(client):
    response = client.get("/auth/me/state")
    assert response.status_code == 401


def test_state_course_deletion_removes_from_state(auth_client):
    course_keep = _create_course(auth_client, name="Keep")
    course_delete = _create_course(auth_client, name="Delete")
    auth_client.post(f"/courses/{course_keep}/target", json={"target": 80})
    auth_client.post(f"/courses/{course_delete}/target", json={"target": 75})

    delete_response = auth_client.delete(f"/courses/{course_delete}")
    assert delete_response.status_code == 200

    response = auth_client.get("/auth/me/state")
    data = response.json()
    assert len(data["courses"]) == 1
    assert data["courses"][0]["course_id"] == course_keep
    assert data["courses"][0]["target_percentage"] == 80.0


def test_state_includes_assessment_count(auth_client):
    _create_course(auth_client)
    response = auth_client.get("/auth/me/state")
    data = response.json()
    assert data["courses"][0]["assessment_count"] == 2
