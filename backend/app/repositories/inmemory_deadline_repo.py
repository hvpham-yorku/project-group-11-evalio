"""
In-memory deadline repository.

Mirrors the pattern in ``inmemory_course_repo.py``.
Stores deadlines keyed by (user_id, course_id, deadline_id).
Will be replaced by a PostgreSQL implementation when DB schema work (SCRUM-85)
is completed.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.models_deadline import Deadline, DeadlineCreate, DeadlineUpdate


class InMemoryDeadlineRepository:
    """Thread-safe-enough for single-process dev; production uses DB."""

    def __init__(self) -> None:
        # {user_id: {course_id: {deadline_id: Deadline}}}
        self._store: dict[UUID, dict[UUID, dict[UUID, Deadline]]] = {}

    # ── helpers ──

    def _user_course(self, user_id: UUID, course_id: UUID) -> dict[UUID, Deadline]:
        return self._store.setdefault(user_id, {}).setdefault(course_id, {})

    # ── CRUD ──

    def create(
        self,
        user_id: UUID,
        course_id: UUID,
        data: DeadlineCreate,
    ) -> Deadline:
        deadline_id = uuid4()
        deadline = Deadline(
            deadline_id=deadline_id,
            course_id=course_id,
            assessment_id=data.assessment_id,
            title=data.title,
            deadline_type=data.deadline_type,
            due_date=data.due_date,
            due_time=data.due_time,
            source=data.source,
            notes=data.notes,
            assessment_name=data.assessment_name,
            exported_to_gcal=False,
            gcal_event_id=None,
            created_at=datetime.now(UTC).isoformat(),
        )
        self._user_course(user_id, course_id)[deadline_id] = deadline
        return deadline

    def list_all(self, user_id: UUID, course_id: UUID) -> list[Deadline]:
        return list(self._user_course(user_id, course_id).values())

    def get_by_id(
        self, user_id: UUID, course_id: UUID, deadline_id: UUID
    ) -> Deadline | None:
        return self._user_course(user_id, course_id).get(deadline_id)

    def update(
        self,
        user_id: UUID,
        course_id: UUID,
        deadline_id: UUID,
        data: DeadlineUpdate,
    ) -> Deadline | None:
        bucket = self._user_course(user_id, course_id)
        existing = bucket.get(deadline_id)
        if existing is None:
            return None

        updated = existing.model_copy(
            update={
                k: v
                for k, v in data.model_dump(exclude_unset=True).items()
                if v is not None
            }
        )
        bucket[deadline_id] = updated
        return updated

    def delete(self, user_id: UUID, course_id: UUID, deadline_id: UUID) -> bool:
        bucket = self._user_course(user_id, course_id)
        if deadline_id in bucket:
            del bucket[deadline_id]
            return True
        return False

    def mark_exported(
        self,
        user_id: UUID,
        course_id: UUID,
        deadline_id: UUID,
        gcal_event_id: str,
    ) -> Deadline | None:
        bucket = self._user_course(user_id, course_id)
        existing = bucket.get(deadline_id)
        if existing is None:
            return None
        updated = existing.model_copy(
            update={"exported_to_gcal": True, "gcal_event_id": gcal_event_id}
        )
        bucket[deadline_id] = updated
        return updated

    def clear(self) -> None:
        self._store.clear()
