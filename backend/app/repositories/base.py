from dataclasses import dataclass
from typing import Protocol
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
