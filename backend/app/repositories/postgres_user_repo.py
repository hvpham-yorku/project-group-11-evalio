from __future__ import annotations

from sqlalchemy import delete, select
from uuid import UUID

from app.db import SessionLocal, UserDB, init_db
from app.repositories.base import StoredUser


class PostgresUserRepository:
    def __init__(self, session_factory=SessionLocal) -> None:
        self._session_factory = session_factory
        init_db()

    def create_user(self, email: str, password_hash: str) -> StoredUser:
        normalized_email = email.strip().lower()
        with self._session_factory() as session:
            existing = session.scalar(
                select(UserDB).where(UserDB.email == normalized_email)
            )
            if existing is not None:
                raise ValueError(f"User already exists for email {normalized_email}")

            row = UserDB(email=normalized_email, password_hash=password_hash)
            session.add(row)
            session.commit()
            session.refresh(row)
            return StoredUser(
                user_id=row.id,
                email=row.email,
                password_hash=row.password_hash,
            )

    def get_by_email(self, email: str) -> StoredUser | None:
        normalized_email = email.strip().lower()
        with self._session_factory() as session:
            row = session.scalar(select(UserDB).where(UserDB.email == normalized_email))
            if row is None:
                return None
            return StoredUser(
                user_id=row.id,
                email=row.email,
                password_hash=row.password_hash,
            )

    def get_by_id(self, user_id: UUID) -> StoredUser | None:
        with self._session_factory() as session:
            row = session.scalar(select(UserDB).where(UserDB.id == user_id))
            if row is None:
                return None
            return StoredUser(
                user_id=row.id,
                email=row.email,
                password_hash=row.password_hash,
            )

    def clear(self) -> None:
        with self._session_factory() as session:
            session.execute(delete(UserDB))
            session.commit()
