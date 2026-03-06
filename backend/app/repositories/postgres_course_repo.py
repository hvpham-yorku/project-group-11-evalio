from uuid import UUID

from sqlalchemy import delete, select

from app.db import AssessmentDB, CourseDB, SessionLocal, init_db
from app.models import CourseCreate
from app.repositories.base import StoredCourse
from app.repositories.postgres_course_mapper import (
    hydrate_course_aggregate,
    persist_course_assessments,
)


class PostgresCourseRepository:
    def __init__(self, session_factory=SessionLocal) -> None:
        self._session_factory = session_factory
        init_db()

    def create(self, user_id: UUID, course: CourseCreate) -> StoredCourse:
        with self._session_factory() as session:
            row = CourseDB(
                user_id=user_id,
                name=course.name,
                term=course.term,
            )
            session.add(row)
            session.flush()

            persist_course_assessments(session=session, course_id=row.id, assessments=course.assessments)

            session.commit()
            session.refresh(row)
            hydrated = hydrate_course_aggregate(session=session, course_row=row)
            return StoredCourse(course_id=row.id, course=hydrated)

    def create_course(self, user_id: UUID, course: CourseCreate) -> StoredCourse:
        return self.create(user_id=user_id, course=course)

    def list_all(self, user_id: UUID) -> list[StoredCourse]:
        with self._session_factory() as session:
            rows = session.scalars(
                select(CourseDB)
                .where(CourseDB.user_id == user_id)
                .order_by(CourseDB.created_at.asc(), CourseDB.id.asc())
            ).all()
            return [
                StoredCourse(
                    course_id=row.id,
                    course=hydrate_course_aggregate(session=session, course_row=row),
                )
                for row in rows
            ]

    def list_courses(self, user_id: UUID) -> list[StoredCourse]:
        return self.list_all(user_id=user_id)

    def get_by_id(self, user_id: UUID, course_id: UUID) -> StoredCourse | None:
        with self._session_factory() as session:
            row = session.scalar(
                select(CourseDB).where(
                    CourseDB.user_id == user_id,
                    CourseDB.id == course_id,
                )
            )
            if row is None:
                return None
            hydrated = hydrate_course_aggregate(session=session, course_row=row)
            return StoredCourse(course_id=row.id, course=hydrated)

    def get_course(self, user_id: UUID, course_id: UUID) -> StoredCourse | None:
        return self.get_by_id(user_id=user_id, course_id=course_id)

    def update(self, user_id: UUID, course_id: UUID, course: CourseCreate) -> StoredCourse:
        with self._session_factory() as session:
            row = session.scalar(
                select(CourseDB)
                .where(
                    CourseDB.user_id == user_id,
                    CourseDB.id == course_id,
                )
                .with_for_update()
            )
            if row is None:
                raise KeyError(course_id)

            row.name = course.name
            row.term = course.term

            session.execute(
                delete(AssessmentDB).where(AssessmentDB.course_id == course_id)
            )
            session.flush()

            persist_course_assessments(session=session, course_id=course_id, assessments=course.assessments)

            session.commit()
            session.refresh(row)
            hydrated = hydrate_course_aggregate(session=session, course_row=row)
            return StoredCourse(course_id=row.id, course=hydrated)

    def delete(self, user_id: UUID, course_id: UUID) -> None:
        with self._session_factory() as session:
            row = session.scalar(
                select(CourseDB).where(
                    CourseDB.user_id == user_id,
                    CourseDB.id == course_id,
                )
            )
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
            ids = list(
                session.scalars(
                    select(CourseDB.id)
                    .where(CourseDB.user_id == user_id)
                    .order_by(CourseDB.created_at.asc(), CourseDB.id.asc())
                ).all()
            )
            for index, existing_course_id in enumerate(ids):
                if existing_course_id == course_id:
                    return index
            return None
