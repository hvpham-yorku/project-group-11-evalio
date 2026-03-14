"""
PostgreSQL repository for calendar connections.
Manages OAuth tokens and calendar integrations per user.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select, delete

from app.db import CalendarConnectionDB, SessionLocal, init_db
from app.repositories.base import StoredCalendarConnection


class PostgresCalendarRepository:
    def __init__(self, session_factory=SessionLocal) -> None:
        self._session_factory = session_factory
        init_db()

    def _to_stored(self, row: CalendarConnectionDB) -> StoredCalendarConnection:
        created_at = row.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        return StoredCalendarConnection(
            connection_id=row.id,
            user_id=row.user_id,
            provider=row.provider,
            calendar_id=row.calendar_id,
            is_connected=row.is_connected,
            created_at=created_at,
        )

    def create(
        self,
        user_id: UUID,
        provider: str,
        access_token: str,
        refresh_token: str | None,
        token_expiry: datetime | None = None,
        calendar_id: str | None = None,
    ) -> StoredCalendarConnection:
        with self._session_factory() as session:
            # Check if connection already exists
            existing = session.scalar(
                select(CalendarConnectionDB).where(
                    CalendarConnectionDB.user_id == user_id,
                    CalendarConnectionDB.provider == provider,
                )
            )
            if existing is not None:
                raise ValueError(f"Calendar connection already exists for provider {provider}")

            row = CalendarConnectionDB(
                user_id=user_id,
                provider=provider,
                calendar_id=calendar_id,
                access_token=access_token,
                refresh_token=refresh_token,
                token_expiry=token_expiry,
                is_connected=True,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return self._to_stored(row)

    def get_by_user(self, user_id: UUID) -> list[StoredCalendarConnection]:
        with self._session_factory() as session:
            rows = session.scalars(
                select(CalendarConnectionDB)
                .where(CalendarConnectionDB.user_id == user_id)
                .order_by(CalendarConnectionDB.created_at.asc())
            ).all()
            return [self._to_stored(row) for row in rows]

    def get_by_user_and_provider(self, user_id: UUID, provider: str) -> StoredCalendarConnection | None:
        with self._session_factory() as session:
            row = session.scalar(
                select(CalendarConnectionDB).where(
                    CalendarConnectionDB.user_id == user_id,
                    CalendarConnectionDB.provider == provider,
                )
            )
            if row is None:
                return None
            return self._to_stored(row)

    def update_tokens(
        self,
        user_id: UUID,
        provider: str,
        access_token: str,
        refresh_token: str | None,
        token_expiry: datetime | None = None,
    ) -> StoredCalendarConnection | None:
        with self._session_factory() as session:
            row = session.scalar(
                select(CalendarConnectionDB)
                .where(
                    CalendarConnectionDB.user_id == user_id,
                    CalendarConnectionDB.provider == provider,
                )
                .with_for_update()
            )
            if row is None:
                return None

            row.access_token = access_token
            row.refresh_token = refresh_token
            row.token_expiry = token_expiry
            row.is_connected = True
            session.commit()
            session.refresh(row)
            return self._to_stored(row)

    def get_tokens(self, user_id: UUID, provider: str) -> dict[str, Any] | None:
        with self._session_factory() as session:
            row = session.scalar(
                select(CalendarConnectionDB).where(
                    CalendarConnectionDB.user_id == user_id,
                    CalendarConnectionDB.provider == provider,
                )
            )
            if row is None or not row.is_connected:
                return None
            return {
                "access_token": row.access_token,
                "refresh_token": row.refresh_token,
                "token_expiry": row.token_expiry,
            }

    def disconnect(self, user_id: UUID, provider: str) -> bool:
        with self._session_factory() as session:
            row = session.scalar(
                select(CalendarConnectionDB)
                .where(
                    CalendarConnectionDB.user_id == user_id,
                    CalendarConnectionDB.provider == provider,
                )
                .with_for_update()
            )
            if row is None:
                return False

            row.is_connected = False
            row.access_token = None
            row.refresh_token = None
            row.token_expiry = None
            session.commit()
            return True

    def delete(self, user_id: UUID, provider: str) -> bool:
        with self._session_factory() as session:
            row = session.scalar(
                select(CalendarConnectionDB).where(
                    CalendarConnectionDB.user_id == user_id,
                    CalendarConnectionDB.provider == provider,
                )
            )
            if row is None:
                return False
            session.delete(row)
            session.commit()
            return True

    def clear(self) -> None:
        with self._session_factory() as session:
            session.execute(delete(CalendarConnectionDB))
            session.commit()
