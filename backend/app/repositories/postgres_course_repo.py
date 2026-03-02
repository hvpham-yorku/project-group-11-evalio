from uuid import UUID

from sqlalchemy import delete, select

from app.db import CourseDB, SessionLocal, init_db
from app.models import CourseCreate
from app.repositories.base import StoredCourse


class PostgresCourseRepository:
    def __init__(self, session_factory=SessionLocal) -> None:
        self._session_factory = session_factory
        init_db()

    def create(self, user_id: UUID, course: CourseCreate) -> StoredCourse:
        payload = course.model_dump()
        with self._session_factory() as session:
            row = CourseDB(
                user_id=user_id,
                name=course.name,
                term=course.term,
                data=payload,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return StoredCourse(course_id=row.id, course=CourseCreate(**row.data))

    def create_course(self, user_id: UUID, course: CourseCreate) -> StoredCourse:
        return self.create(user_id=user_id, course=course)

    def list_all(self, user_id: UUID) -> list[StoredCourse]:
        with self._session_factory() as session:
            query = (
                select(CourseDB)
                .where(CourseDB.user_id == user_id)
                .order_by(CourseDB.created_at.asc(), CourseDB.id.asc())
            )
            rows = session.scalars(query).all()
            return [
                StoredCourse(course_id=row.id, course=CourseCreate(**row.data))
                for row in rows
            ]

    def list_courses(self, user_id: UUID) -> list[StoredCourse]:
        return self.list_all(user_id=user_id)

    def get_by_id(self, user_id: UUID, course_id: UUID) -> StoredCourse | None:
        with self._session_factory() as session:
            query = select(CourseDB).where(
                CourseDB.user_id == user_id,
                CourseDB.id == course_id,
            )
            row = session.scalar(query)
            if row is None:
                return None
            return StoredCourse(course_id=row.id, course=CourseCreate(**row.data))

    def get_course(self, user_id: UUID, course_id: UUID) -> StoredCourse | None:
        return self.get_by_id(user_id=user_id, course_id=course_id)

    def update(self, user_id: UUID, course_id: UUID, course: CourseCreate) -> StoredCourse:
        with self._session_factory() as session:
            query = select(CourseDB).where(
                CourseDB.user_id == user_id,
                CourseDB.id == course_id,
            )
            row = session.scalar(query)
            if row is None:
                raise KeyError(course_id)

            row.name = course.name
            row.term = course.term
            row.data = course.model_dump()
            session.commit()
            session.refresh(row)
            return StoredCourse(course_id=row.id, course=CourseCreate(**row.data))

    def delete(self, user_id: UUID, course_id: UUID) -> None:
        with self._session_factory() as session:
            query = select(CourseDB).where(
                CourseDB.user_id == user_id,
                CourseDB.id == course_id,
            )
            row = session.scalar(query)
            if row is None:
                raise KeyError(course_id)
            session.delete(row)
            session.commit()

    def clear(self) -> None:
        with self._session_factory() as session:
            session.execute(delete(CourseDB))
            session.commit()

    def get_index(self, user_id: UUID, course_id: UUID) -> int | None:
        with self._session_factory() as session:
            query = (
                select(CourseDB.id)
                .where(CourseDB.user_id == user_id)
                .order_by(CourseDB.created_at.asc(), CourseDB.id.asc())
            )
            ids = list(session.scalars(query).all())
            for index, existing_course_id in enumerate(ids):
                if existing_course_id == course_id:
                    return index
            return None
