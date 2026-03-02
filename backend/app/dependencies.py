from fastapi import Depends, HTTPException, Request, status

from app.config import AUTH_COOKIE_NAME
from app.repositories.base import CourseRepository, UserRepository
from app.repositories.inmemory_course_repo import InMemoryCourseRepository
from app.repositories.inmemory_user_repo import InMemoryUserRepository
from app.services.auth_service import AuthService, AuthenticatedUser, AuthenticationError
from app.services.course_service import CourseService
from app.services.extraction_service import ExtractionService

_course_repo = InMemoryCourseRepository()
_user_repo = InMemoryUserRepository()
_course_service = CourseService(_course_repo)
_auth_service = AuthService(_user_repo)
_extraction_service = ExtractionService()


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
