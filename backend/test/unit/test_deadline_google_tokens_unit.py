from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.repositories.inmemory_calendar_repo import InMemoryCalendarRepository
from app.repositories.inmemory_deadline_repo import InMemoryDeadlineRepository
from app.services import deadline_service as deadline_service_module
from app.services.deadline_service import DeadlineService


def _build_service(calendar_repo: InMemoryCalendarRepository | None = None) -> DeadlineService:
    return DeadlineService(
        repository=InMemoryDeadlineRepository(),
        calendar_repository=calendar_repo or InMemoryCalendarRepository(),
    )


def test_get_google_access_token_refreshes_expired_cached_token(monkeypatch):
    service = _build_service()
    user_id = uuid4()

    service.store_google_tokens(
        user_id,
        {
            "access_token": "expired-token",
            "refresh_token": "refresh-token",
            "token_expiry": datetime.now(UTC) - timedelta(minutes=5),
        },
    )

    monkeypatch.setattr(
        deadline_service_module,
        "refresh_google_access_token",
        lambda _refresh_token: {
            "access_token": "fresh-token",
            "refresh_token": "refresh-token",
            "token_expiry": datetime.now(UTC) + timedelta(hours=1),
        },
    )

    assert service.get_google_access_token(user_id) == "fresh-token"


def test_get_google_access_token_refreshes_expired_persisted_token(monkeypatch):
    calendar_repo = InMemoryCalendarRepository()
    service = _build_service(calendar_repo)
    user_id = uuid4()

    calendar_repo.create(
        user_id=user_id,
        provider="google",
        access_token="persisted-expired",
        refresh_token="persisted-refresh",
        token_expiry=datetime.now(UTC) - timedelta(minutes=10),
    )

    monkeypatch.setattr(
        deadline_service_module,
        "refresh_google_access_token",
        lambda _refresh_token: {
            "access_token": "persisted-fresh",
            "refresh_token": "persisted-refresh",
            "token_expiry": datetime.now(UTC) + timedelta(hours=2),
        },
    )

    assert service.get_google_access_token(user_id) == "persisted-fresh"


def test_get_google_access_token_returns_none_when_expired_and_no_refresh_token():
    service = _build_service()
    user_id = uuid4()

    service.store_google_tokens(
        user_id,
        {
            "access_token": "expired-token",
            "token_expiry": datetime.now(UTC) - timedelta(minutes=1),
        },
    )

    assert service.get_google_access_token(user_id) is None
