from uuid import UUID, uuid4

from app.models import CourseCreate
from app.repositories.base import StoredCourse


class InMemoryCourseRepository:
    def __init__(self) -> None:
        self._courses_by_user: dict[UUID, dict[UUID, CourseCreate]] = {}

    def create(self, user_id: UUID, course: CourseCreate) -> StoredCourse:
        course_id = uuid4()
        user_courses = self._courses_by_user.setdefault(user_id, {})
        user_courses[course_id] = course
        return StoredCourse(course_id=course_id, course=course)

    def list_all(self, user_id: UUID) -> list[StoredCourse]:
        user_courses = self._courses_by_user.get(user_id, {})
        return [
            StoredCourse(course_id=course_id, course=course)
            for course_id, course in user_courses.items()
        ]

    def get_by_id(self, user_id: UUID, course_id: UUID) -> StoredCourse | None:
        user_courses = self._courses_by_user.get(user_id, {})
        course = user_courses.get(course_id)
        if course is None:
            return None
        return StoredCourse(course_id=course_id, course=course)

    def update(self, user_id: UUID, course_id: UUID, course: CourseCreate) -> StoredCourse:
        user_courses = self._courses_by_user.get(user_id)
        if user_courses is None or course_id not in user_courses:
            raise KeyError(course_id)
        user_courses[course_id] = course
        return StoredCourse(course_id=course_id, course=course)

    def delete(self, user_id: UUID, course_id: UUID) -> None:
        user_courses = self._courses_by_user.get(user_id)
        if user_courses is None or course_id not in user_courses:
            raise KeyError(course_id)
        del user_courses[course_id]

    def clear(self) -> None:
        self._courses_by_user.clear()

    def get_index(self, user_id: UUID, course_id: UUID) -> int | None:
        user_courses = self._courses_by_user.get(user_id, {})
        for index, key in enumerate(user_courses.keys()):
            if key == course_id:
                return index
        return None
