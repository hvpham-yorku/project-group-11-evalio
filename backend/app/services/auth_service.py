from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from passlib.context import CryptContext

from app.config import (
    AUTH_ACCESS_TOKEN_EXPIRE_MINUTES,
    AUTH_ALGORITHM,
    AUTH_SECRET_KEY,
)
from app.repositories.base import StoredUser, UserRepository


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthValidationError(Exception):
    pass


class AuthConflictError(Exception):
    pass


class AuthenticationError(Exception):
    pass


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: UUID
    email: str


class AuthService:
    def __init__(self, repository: UserRepository):
        self._repository = repository

    def register_user(self, email: str, password: str) -> dict:
        normalized_email = self._normalize_email(email)
        self._validate_password(password)

        existing = self._repository.get_by_email(normalized_email)
        if existing is not None:
            raise AuthConflictError("An account already exists for this email")

        password_hash = pwd_context.hash(password)
        try:
            stored = self._repository.create_user(
                email=normalized_email,
                password_hash=password_hash,
            )
        except ValueError as exc:
            raise AuthConflictError("An account already exists for this email") from exc

        return {
            "message": "User registered successfully",
            "user": {
                "user_id": str(stored.user_id),
                "email": stored.email,
            },
        }

    def login_user(self, email: str, password: str) -> str:
        normalized_email = self._normalize_email(email)
        stored = self._repository.get_by_email(normalized_email)
        if stored is None or not pwd_context.verify(password, stored.password_hash):
            raise AuthenticationError("Invalid email or password")
        return self.create_access_token(stored)

    def get_current_user(self, token: str) -> AuthenticatedUser:
        claims = self._decode_token(token)
        sub = claims.get("sub")
        email = claims.get("email")
        if not isinstance(sub, str) or not isinstance(email, str):
            raise AuthenticationError("Invalid authentication token")

        try:
            user_id = UUID(sub)
        except ValueError as exc:
            raise AuthenticationError("Invalid authentication token") from exc

        stored = self._repository.get_by_id(user_id)
        if stored is None:
            raise AuthenticationError("Authentication token is no longer valid")

        return AuthenticatedUser(user_id=stored.user_id, email=stored.email)

    def create_access_token(self, stored_user: StoredUser) -> str:
        now = datetime.now(UTC)
        expiry = now + timedelta(minutes=AUTH_ACCESS_TOKEN_EXPIRE_MINUTES)
        payload = {
            "sub": str(stored_user.user_id),
            "email": stored_user.email,
            "iat": int(now.timestamp()),
            "exp": int(expiry.timestamp()),
        }
        return jwt.encode(payload, AUTH_SECRET_KEY, algorithm=AUTH_ALGORITHM)

    def _decode_token(self, token: str) -> dict:
        try:
            claims = jwt.decode(token, AUTH_SECRET_KEY, algorithms=[AUTH_ALGORITHM])
        except jwt.InvalidTokenError as exc:
            raise AuthenticationError("Invalid or expired authentication token") from exc
        return claims

    def _normalize_email(self, email: str) -> str:
        normalized = email.strip().lower()
        if not normalized or "@" not in normalized:
            raise AuthValidationError("A valid email is required")
        return normalized

    def _validate_password(self, password: str) -> None:
        if len(password) < 8:
            raise AuthValidationError("Password must be at least 8 characters long")
