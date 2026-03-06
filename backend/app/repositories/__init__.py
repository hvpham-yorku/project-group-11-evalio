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
from app.repositories.postgres_user_repo import PostgresUserRepository

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
