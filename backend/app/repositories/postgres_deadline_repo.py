from __future__ import annotations

from datetime import UTC, date, datetime, time
from uuid import UUID

from sqlalchemy import delete, select

from app.db import CourseDB, DeadlineDB, SessionLocal, init_db
from app.models_deadline import Deadline, DeadlineCreate, DeadlineUpdate


class PostgresDeadlineRepository:
    def __init__(self, session_factory=SessionLocal) -> None:
        self._session_factory = session_factory
        init_db()

    def _get_course(self, session, user_id: UUID, course_id: UUID) -> CourseDB | None:
        return session.scalar(
            select(CourseDB).where(
                CourseDB.id == course_id,
                CourseDB.user_id == user_id,
            )
        )

    def _get_deadline(
        self,
        session,
        user_id: UUID,
        course_id: UUID,
        deadline_id: UUID,
    ) -> DeadlineDB | None:
        return session.scalar(
            select(DeadlineDB)
            .join(CourseDB, DeadlineDB.course_id == CourseDB.id)
            .where(
                DeadlineDB.id == deadline_id,
                DeadlineDB.course_id == course_id,
                CourseDB.user_id == user_id,
            )
        )

    def create(self, user_id: UUID, course_id: UUID, data: DeadlineCreate) -> Deadline:
        with self._session_factory() as session:
            course = self._get_course(session, user_id, course_id)
            if course is None:
                raise KeyError(course_id)

            due_date = date.fromisoformat(data.due_date)
            due_time = time.fromisoformat(data.due_time) if data.due_time else None

            row = DeadlineDB(
                course_id=course_id,
                title=data.title,
                due_date=due_date,
                due_time=due_time,
                source=data.source,
                notes=data.notes,
                assessment_name=data.assessment_name,
                exported_to_gcal=False,
                gcal_event_id=None,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return self._to_model(row)

    def list_all(self, user_id: UUID, course_id: UUID) -> list[Deadline]:
        with self._session_factory() as session:
            rows = session.scalars(
                select(DeadlineDB)
                .join(CourseDB, DeadlineDB.course_id == CourseDB.id)
                .where(
                    DeadlineDB.course_id == course_id,
                    CourseDB.user_id == user_id,
                )
                .order_by(DeadlineDB.due_date.asc(), DeadlineDB.created_at.asc(), DeadlineDB.id.asc())
            ).all()
            return [self._to_model(row) for row in rows]

    def get_by_id(self, user_id: UUID, course_id: UUID, deadline_id: UUID) -> Deadline | None:
        with self._session_factory() as session:
            row = self._get_deadline(session, user_id, course_id, deadline_id)
            if row is None:
                return None
            return self._to_model(row)

    def update(
        self,
        user_id: UUID,
        course_id: UUID,
        deadline_id: UUID,
        data: DeadlineUpdate,
    ) -> Deadline | None:
        with self._session_factory() as session:
            row = self._get_deadline(session, user_id, course_id, deadline_id)
            if row is None:
                return None

            updates = {
                k: v
                for k, v in data.model_dump(exclude_unset=True).items()
                if v is not None
            }
            if "title" in updates:
                row.title = updates["title"]
            if "due_date" in updates:
                row.due_date = date.fromisoformat(updates["due_date"])
            if "due_time" in updates:
                row.due_time = time.fromisoformat(updates["due_time"])
            if "notes" in updates:
                row.notes = updates["notes"]
            if "assessment_name" in updates:
                row.assessment_name = updates["assessment_name"]

            session.commit()
            session.refresh(row)
            return self._to_model(row)

    def delete(self, user_id: UUID, course_id: UUID, deadline_id: UUID) -> bool:
        with self._session_factory() as session:
            row = self._get_deadline(session, user_id, course_id, deadline_id)
            if row is None:
                return False
            session.delete(row)
            session.commit()
            return True

    def mark_exported(
        self,
        user_id: UUID,
        course_id: UUID,
        deadline_id: UUID,
        gcal_event_id: str,
    ) -> Deadline | None:
        with self._session_factory() as session:
            row = self._get_deadline(session, user_id, course_id, deadline_id)
            if row is None:
                return None
            row.exported_to_gcal = True
            row.gcal_event_id = gcal_event_id
            session.commit()
            session.refresh(row)
            return self._to_model(row)

    def clear(self) -> None:
        with self._session_factory() as session:
            session.execute(delete(DeadlineDB))
            session.commit()

    @staticmethod
    def _to_model(row: DeadlineDB) -> Deadline:
        created_at = row.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)

        return Deadline(
            deadline_id=row.id,
            course_id=row.course_id,
            title=row.title,
            due_date=row.due_date.isoformat(),
            due_time=row.due_time.strftime("%H:%M") if row.due_time else None,
            source=row.source,
            notes=row.notes,
            assessment_name=row.assessment_name,
            exported_to_gcal=bool(row.exported_to_gcal),
            gcal_event_id=row.gcal_event_id,
            created_at=created_at.isoformat(),
        )
