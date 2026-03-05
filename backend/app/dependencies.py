import os

from fastapi import Depends, HTTPException, Request, status

from app.config import AUTH_COOKIE_NAME
from app.repositories.base import CourseRepository, UserRepository
from app.repositories.inmemory_course_repo import InMemoryCourseRepository
from app.repositories.inmemory_deadline_repo import InMemoryDeadlineRepository
from app.repositories.inmemory_user_repo import InMemoryUserRepository
from app.services.auth_service import AuthService, AuthenticatedUser, AuthenticationError
from app.services.course_service import CourseService
from app.services.deadline_service import DeadlineService
from app.services.extraction_service import ExtractionService


def _is_truthy_env(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _build_course_repo() -> CourseRepository:
    if _is_truthy_env(os.getenv("USE_POSTGRES")):
        from app.repositories.postgres_course_repo import PostgresCourseRepository

        return PostgresCourseRepository()
    return InMemoryCourseRepository()


_course_repo = _build_course_repo()
_user_repo = InMemoryUserRepository()
_deadline_repo = InMemoryDeadlineRepository()
_course_service = CourseService(_course_repo)
_auth_service = AuthService(_user_repo)
_extraction_service = ExtractionService()
_deadline_service = DeadlineService(_deadline_repo)


def get_course_repo() -> CourseRepository:
    return _course_repo


def get_user_repo() -> UserRepository:
    return _user_repo


def get_course_service() -> CourseService:
    return _course_service


def get_auth_service() -> AuthService:
    return _auth_service


def get_extraction_service() -> ExtractionService:
    return _extraction_service


def get_deadline_service() -> DeadlineService:
    return _deadline_service


def get_deadline_repo() -> InMemoryDeadlineRepository:
    return _deadline_repo


def get_current_user(
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
) -> AuthenticatedUser:
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    try:
        return auth_service.get_current_user(token)
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication",
        ) from exc
