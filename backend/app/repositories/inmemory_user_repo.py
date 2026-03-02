from uuid import UUID, uuid4

from app.repositories.base import StoredUser


class InMemoryUserRepository:
    def __init__(self) -> None:
        self._users_by_id: dict[UUID, StoredUser] = {}
        self._user_ids_by_email: dict[str, UUID] = {}

    def create_user(self, email: str, password_hash: str) -> StoredUser:
        normalized_email = email.strip().lower()
        if normalized_email in self._user_ids_by_email:
            raise ValueError(f"User already exists for email {normalized_email}")

        user_id = uuid4()
        stored = StoredUser(
            user_id=user_id,
            email=normalized_email,
            password_hash=password_hash,
        )
        self._users_by_id[user_id] = stored
        self._user_ids_by_email[normalized_email] = user_id
        return stored

    def get_by_email(self, email: str) -> StoredUser | None:
        normalized_email = email.strip().lower()
        user_id = self._user_ids_by_email.get(normalized_email)
        if user_id is None:
            return None
        return self._users_by_id.get(user_id)

    def get_by_id(self, user_id: UUID) -> StoredUser | None:
        return self._users_by_id.get(user_id)

    def clear(self) -> None:
        self._users_by_id.clear()
        self._user_ids_by_email.clear()
