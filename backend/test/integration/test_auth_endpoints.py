from app.config import AUTH_COOKIE_NAME


def test_register_success(client):
    response = client.post(
        "/auth/register",
        json={"email": "student@example.com", "password": "password123"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["message"] == "User registered successfully"
    assert body["user"]["email"] == "student@example.com"
    assert body["user"]["user_id"]


def test_register_duplicate_email_returns_409(client):
    payload = {"email": "student@example.com", "password": "password123"}
    first = client.post("/auth/register", json=payload)
    assert first.status_code == 200

    second = client.post("/auth/register", json=payload)
    assert second.status_code == 409


def test_login_success_sets_cookie(client):
    payload = {"email": "student@example.com", "password": "password123"}
    register = client.post("/auth/register", json=payload)
    assert register.status_code == 200

    login = client.post("/auth/login", json=payload)
    assert login.status_code == 200
    assert f"{AUTH_COOKIE_NAME}=" in login.headers.get("set-cookie", "")


def test_login_invalid_credentials_returns_401(client):
    payload = {"email": "student@example.com", "password": "password123"}
    register = client.post("/auth/register", json=payload)
    assert register.status_code == 200

    login = client.post(
        "/auth/login",
        json={"email": "student@example.com", "password": "wrong-password"},
    )
    assert login.status_code == 401


def test_me_requires_authentication(client):
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_me_returns_authenticated_user(auth_client):
    response = auth_client.get("/auth/me")
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "user@example.com"
    assert body["user_id"]


def test_logout_clears_session(auth_client):
    me_before = auth_client.get("/auth/me")
    assert me_before.status_code == 200

    logout = auth_client.post("/auth/logout")
    assert logout.status_code == 200

    me_after = auth_client.get("/auth/me")
    assert me_after.status_code == 401
