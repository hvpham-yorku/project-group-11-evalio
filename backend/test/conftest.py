import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_course_repo, get_user_repo
from app.main import app

@pytest.fixture(autouse=True)
def clear_inmemory_repositories():
    get_course_repo().clear()
    get_user_repo().clear()
    yield
    get_course_repo().clear()
    get_user_repo().clear()


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def _register_and_login(client: TestClient, email: str, password: str = "password123") -> None:
    register = client.post(
        "/auth/register",
        json={"email": email, "password": password},
    )
    assert register.status_code == 200

    login = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200


@pytest.fixture
def auth_client(client: TestClient):
    _register_and_login(client, email="user@example.com")
    return client


@pytest.fixture
def make_auth_client():
    clients: list[TestClient] = []

    def _make_auth_client(email: str, password: str = "password123") -> TestClient:
        test_client = TestClient(app)
        clients.append(test_client)
        _register_and_login(test_client, email=email, password=password)
        return test_client

    yield _make_auth_client

    for test_client in clients:
        test_client.close()
