from app.repositories.base import (
    CourseRepository,
    DeadlineRepository,
    StoredCourse,
    StoredUser,
    UserRepository,
)
from app.repositories.inmemory_course_repo import InMemoryCourseRepository
from app.repositories.inmemory_deadline_repo import InMemoryDeadlineRepository
from app.repositories.inmemory_user_repo import InMemoryUserRepository

__all__ = [
    "CourseRepository",
    "DeadlineRepository",
    "StoredCourse",
    "StoredUser",
    "UserRepository",
    "InMemoryCourseRepository",
    "InMemoryDeadlineRepository",
    "InMemoryUserRepository",
    "PostgresUserRepository",
]


def __getattr__(name: str):
    if name == "PostgresUserRepository":
        from app.repositories.postgres_user_repo import PostgresUserRepository

        return PostgresUserRepository
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
