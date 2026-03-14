from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol
from uuid import UUID

from app.models import CourseCreate
from app.models_deadline import Deadline, DeadlineCreate, DeadlineUpdate


@dataclass(frozen=True)
class StoredCourse:
    course_id: UUID
    course: CourseCreate


@dataclass(frozen=True)
class StoredUser:
    user_id: UUID
    email: str
    password_hash: str


@dataclass(frozen=True)
class StoredScenarioEntry:
    assessment_name: str
    score: float


@dataclass(frozen=True)
class StoredScenario:
    scenario_id: UUID
    name: str
    entries: list[StoredScenarioEntry]
    created_at: str


@dataclass(frozen=True)
class StoredCalendarConnection:
    connection_id: UUID
    user_id: UUID
    provider: str
    calendar_id: str | None
    is_connected: bool
    created_at: datetime


@dataclass(frozen=True)
class StoredGradeTarget:
    target_id: UUID
    course_id: UUID
    target_percentage: float | None
    created_at: datetime


class CourseRepository(Protocol):
    def create(self, user_id: UUID, course: CourseCreate) -> StoredCourse:
        ...

    def list_all(self, user_id: UUID) -> list[StoredCourse]:
        ...

    def get_by_id(self, user_id: UUID, course_id: UUID) -> StoredCourse | None:
        ...

    def update(self, user_id: UUID, course_id: UUID, course: CourseCreate) -> StoredCourse:
        ...

    def delete(self, user_id: UUID, course_id: UUID) -> None:
        ...

    def clear(self) -> None:
        ...

    def get_index(self, user_id: UUID, course_id: UUID) -> int | None:
        ...


class UserRepository(Protocol):
    def create_user(self, email: str, password_hash: str) -> StoredUser:
        ...

    def get_by_email(self, email: str) -> StoredUser | None:
        ...

    def get_by_id(self, user_id: UUID) -> StoredUser | None:
        ...

    def clear(self) -> None:
        ...


class DeadlineRepository(Protocol):
    def create(self, user_id: UUID, course_id: UUID, data: DeadlineCreate) -> Deadline:
        ...

    def list_all(self, user_id: UUID, course_id: UUID) -> list[Deadline]:
        ...

    def get_by_id(self, user_id: UUID, course_id: UUID, deadline_id: UUID) -> Deadline | None:
        ...

    def update(
        self,
        user_id: UUID,
        course_id: UUID,
        deadline_id: UUID,
        data: DeadlineUpdate,
    ) -> Deadline | None:
        ...

    def delete(self, user_id: UUID, course_id: UUID, deadline_id: UUID) -> bool:
        ...

    def mark_exported(
        self,
        user_id: UUID,
        course_id: UUID,
        deadline_id: UUID,
        gcal_event_id: str,
    ) -> Deadline | None:
        ...

    def clear(self) -> None:
        ...


class ScenarioRepository(Protocol):
    def create(
        self,
        user_id: UUID,
        course_id: UUID,
        name: str,
        entries: list[StoredScenarioEntry],
    ) -> StoredScenario:
        ...

    def list_all(self, user_id: UUID, course_id: UUID) -> list[StoredScenario]:
        ...

    def get_by_id(self, user_id: UUID, course_id: UUID, scenario_id: UUID) -> StoredScenario | None:
        ...

    def delete(self, user_id: UUID, course_id: UUID, scenario_id: UUID) -> bool:
        ...

    def clear(self) -> None:
        ...


class CalendarConnectionRepository(Protocol):
    """Repository for managing OAuth calendar connections."""

    def create(
        self,
        user_id: UUID,
        provider: str,
        access_token: str,
        refresh_token: str | None,
        token_expiry: datetime | None = None,
        calendar_id: str | None = None,
    ) -> StoredCalendarConnection:
        ...

    def get_by_user(self, user_id: UUID) -> list[StoredCalendarConnection]:
        ...

    def get_by_user_and_provider(self, user_id: UUID, provider: str) -> StoredCalendarConnection | None:
        ...

    def update_tokens(
        self,
        user_id: UUID,
        provider: str,
        access_token: str,
        refresh_token: str | None,
        token_expiry: datetime | None = None,
    ) -> StoredCalendarConnection | None:
        ...

    def get_tokens(self, user_id: UUID, provider: str) -> dict[str, Any] | None:
        ...

    def disconnect(self, user_id: UUID, provider: str) -> bool:
        ...

    def delete(self, user_id: UUID, provider: str) -> bool:
        ...

    def clear(self) -> None:
        ...


class GradeTargetRepository(Protocol):
    """Repository for managing course grade targets."""

    def set_target(
        self,
        user_id: UUID,
        course_id: UUID,
        target_percentage: float,
    ) -> StoredGradeTarget:
        ...

    def get_target(self, user_id: UUID, course_id: UUID) -> StoredGradeTarget | None:
        ...

    def delete_target(self, user_id: UUID, course_id: UUID) -> bool:
        ...

    def clear(self) -> None:
        ...
