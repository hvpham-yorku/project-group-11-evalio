"""
In-memory repository for calendar connections.
Used as fallback when Postgres is not available.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from app.repositories.base import StoredCalendarConnection


class InMemoryCalendarRepository:
    def __init__(self) -> None:
        self._connections: dict[tuple[UUID, str], dict] = {}

    def create(
        self,
        user_id: UUID,
        provider: str,
        access_token: str,
        refresh_token: str | None,
        token_expiry: datetime | None = None,
        calendar_id: str | None = None,
    ) -> StoredCalendarConnection:
        key = (user_id, provider)
        if key in self._connections:
            raise ValueError(f"Calendar connection already exists for provider {provider}")

        connection_id = uuid4()
        created_at = datetime.now(UTC)
        self._connections[key] = {
            "connection_id": connection_id,
            "user_id": user_id,
            "provider": provider,
            "calendar_id": calendar_id,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_expiry": token_expiry,
            "is_connected": True,
            "created_at": created_at,
        }
        return StoredCalendarConnection(
            connection_id=connection_id,
            user_id=user_id,
            provider=provider,
            calendar_id=calendar_id,
            is_connected=True,
            created_at=created_at,
        )

    def get_by_user(self, user_id: UUID) -> list[StoredCalendarConnection]:
        results = []
        for (uid, _), data in self._connections.items():
            if uid == user_id:
                results.append(
                    StoredCalendarConnection(
                        connection_id=data["connection_id"],
                        user_id=data["user_id"],
                        provider=data["provider"],
                        calendar_id=data["calendar_id"],
                        is_connected=data["is_connected"],
                        created_at=data["created_at"],
                    )
                )
        return sorted(results, key=lambda c: c.created_at)

    def get_by_user_and_provider(self, user_id: UUID, provider: str) -> StoredCalendarConnection | None:
        key = (user_id, provider)
        data = self._connections.get(key)
        if data is None:
            return None
        return StoredCalendarConnection(
            connection_id=data["connection_id"],
            user_id=data["user_id"],
            provider=data["provider"],
            calendar_id=data["calendar_id"],
            is_connected=data["is_connected"],
            created_at=data["created_at"],
        )

    def update_tokens(
        self,
        user_id: UUID,
        provider: str,
        access_token: str,
        refresh_token: str | None,
        token_expiry: datetime | None = None,
    ) -> StoredCalendarConnection | None:
        key = (user_id, provider)
        data = self._connections.get(key)
        if data is None:
            return None

        data["access_token"] = access_token
        data["refresh_token"] = refresh_token
        data["token_expiry"] = token_expiry
        data["is_connected"] = True
        return StoredCalendarConnection(
            connection_id=data["connection_id"],
            user_id=data["user_id"],
            provider=data["provider"],
            calendar_id=data["calendar_id"],
            is_connected=data["is_connected"],
            created_at=data["created_at"],
        )

    def get_tokens(self, user_id: UUID, provider: str) -> dict[str, Any] | None:
        key = (user_id, provider)
        data = self._connections.get(key)
        if data is None or not data.get("is_connected"):
            return None
        return {
            "access_token": data.get("access_token"),
            "refresh_token": data.get("refresh_token"),
            "token_expiry": data.get("token_expiry"),
        }

    def disconnect(self, user_id: UUID, provider: str) -> bool:
        key = (user_id, provider)
        data = self._connections.get(key)
        if data is None:
            return False

        data["is_connected"] = False
        data["access_token"] = None
        data["refresh_token"] = None
        data["token_expiry"] = None
        return True

    def delete(self, user_id: UUID, provider: str) -> bool:
        key = (user_id, provider)
        if key not in self._connections:
            return False
        del self._connections[key]
        return True

    def clear(self) -> None:
        self._connections.clear()
