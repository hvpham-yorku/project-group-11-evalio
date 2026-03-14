import os
import warnings

from fastapi import Depends, HTTPException, Request, status

from app.config import AUTH_COOKIE_NAME
from app.repositories.base import (
    CalendarConnectionRepository,
    CourseRepository,
    DeadlineRepository,
    GradeTargetRepository,
    ScenarioRepository,
    UserRepository,
)
from app.repositories.inmemory_calendar_repo import InMemoryCalendarRepository
from app.repositories.inmemory_course_repo import InMemoryCourseRepository
from app.repositories.inmemory_deadline_repo import InMemoryDeadlineRepository
from app.repositories.inmemory_grade_target_repo import InMemoryGradeTargetRepository
from app.repositories.inmemory_scenario_repo import InMemoryScenarioRepository
from app.repositories.inmemory_user_repo import InMemoryUserRepository
from app.services.auth_service import AuthService, AuthenticatedUser, AuthenticationError
from app.services.course_service import CourseService
from app.services.deadline_service import DeadlineService
from app.services.extraction_service import ExtractionService
from app.services.scenario_service import ScenarioService


def _is_truthy_env(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _allow_postgres_fallback() -> bool:
    raw = os.getenv("POSTGRES_FALLBACK_TO_MEMORY")
    if raw is None:
        return True
    return _is_truthy_env(raw)


def _build_course_repo() -> CourseRepository:
    if _is_truthy_env(os.getenv("USE_POSTGRES")):
        try:
            from app.repositories.postgres_course_repo import PostgresCourseRepository

            return PostgresCourseRepository()
        except Exception as exc:
            if not _allow_postgres_fallback():
                raise
            warnings.warn(
                "USE_POSTGRES=true but Postgres repository initialization failed. "
                f"Falling back to InMemoryCourseRepository. Reason: {exc}",
                RuntimeWarning,
            )
            return InMemoryCourseRepository()
    return InMemoryCourseRepository()


def _build_deadline_repo() -> DeadlineRepository:
    if _is_truthy_env(os.getenv("USE_POSTGRES")):
        try:
            from app.repositories.postgres_deadline_repo import PostgresDeadlineRepository

            return PostgresDeadlineRepository()
        except Exception as exc:
            if not _allow_postgres_fallback():
                raise
            warnings.warn(
                "USE_POSTGRES=true but Postgres deadline repository initialization failed. "
                f"Falling back to InMemoryDeadlineRepository. Reason: {exc}",
                RuntimeWarning,
            )
            return InMemoryDeadlineRepository()
    return InMemoryDeadlineRepository()


def _build_user_repo() -> UserRepository:
    if _is_truthy_env(os.getenv("USE_POSTGRES")):
        try:
            from app.repositories.postgres_user_repo import PostgresUserRepository

            return PostgresUserRepository()
        except Exception as exc:
            if not _allow_postgres_fallback():
                raise
            warnings.warn(
                "USE_POSTGRES=true but Postgres user repository initialization failed. "
                f"Falling back to InMemoryUserRepository. Reason: {exc}",
                RuntimeWarning,
            )
            return InMemoryUserRepository()
    return InMemoryUserRepository()


def _build_scenario_repo() -> ScenarioRepository:
    if _is_truthy_env(os.getenv("USE_POSTGRES")):
        try:
            from app.repositories.postgres_scenario_repo import PostgresScenarioRepository

            return PostgresScenarioRepository()
        except Exception as exc:
            if not _allow_postgres_fallback():
                raise
            warnings.warn(
                "USE_POSTGRES=true but Postgres scenario repository initialization failed. "
                f"Falling back to InMemoryScenarioRepository. Reason: {exc}",
                RuntimeWarning,
            )
            return InMemoryScenarioRepository()
    return InMemoryScenarioRepository()


def _build_calendar_repo() -> CalendarConnectionRepository:
    if _is_truthy_env(os.getenv("USE_POSTGRES")):
        try:
            from app.repositories.postgres_calendar_repo import PostgresCalendarRepository

            return PostgresCalendarRepository()
        except Exception as exc:
            if not _allow_postgres_fallback():
                raise
            warnings.warn(
                "USE_POSTGRES=true but Postgres calendar repository initialization failed. "
                f"Falling back to InMemoryCalendarRepository. Reason: {exc}",
                RuntimeWarning,
            )
            return InMemoryCalendarRepository()
    return InMemoryCalendarRepository()


def _build_grade_target_repo() -> GradeTargetRepository:
    if _is_truthy_env(os.getenv("USE_POSTGRES")):
        try:
            from app.repositories.postgres_grade_target_repo import PostgresGradeTargetRepository

            return PostgresGradeTargetRepository()
        except Exception as exc:
            if not _allow_postgres_fallback():
                raise
            warnings.warn(
                "USE_POSTGRES=true but Postgres grade target repository initialization failed. "
                f"Falling back to InMemoryGradeTargetRepository. Reason: {exc}",
                RuntimeWarning,
            )
            return InMemoryGradeTargetRepository()
    return InMemoryGradeTargetRepository()


_course_repo = _build_course_repo()
_user_repo = _build_user_repo()
_deadline_repo = _build_deadline_repo()
_scenario_repo = _build_scenario_repo()
_calendar_repo = _build_calendar_repo()
_grade_target_repo = _build_grade_target_repo()
_course_service = CourseService(_course_repo)
_auth_service = AuthService(_user_repo)
_extraction_service = ExtractionService()
_deadline_service = DeadlineService(_deadline_repo, _calendar_repo)
_scenario_service = ScenarioService(_scenario_repo, _course_service)


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


def get_deadline_repo() -> DeadlineRepository:
    return _deadline_repo


def get_scenario_repo() -> ScenarioRepository:
    return _scenario_repo


def get_scenario_service() -> ScenarioService:
    return _scenario_service


def get_calendar_repo() -> CalendarConnectionRepository:
    return _calendar_repo


def get_grade_target_repo() -> GradeTargetRepository:
    return _grade_target_repo


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
