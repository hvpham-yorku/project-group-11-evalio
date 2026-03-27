from __future__ import annotations

from datetime import UTC
from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import aliased

from app.db import (
    AssessmentDB,
    CourseDB,
    ScenarioDB,
    ScenarioScoreDB,
    SessionLocal,
    init_db,
)
from app.repositories.base import StoredScenario, StoredScenarioEntry


def _to_float(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


class PostgresScenarioRepository:
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

    def _get_scenario_row(
        self,
        session,
        user_id: UUID,
        course_id: UUID,
        scenario_id: UUID,
    ) -> ScenarioDB | None:
        return session.scalar(
            select(ScenarioDB)
            .join(CourseDB, ScenarioDB.course_id == CourseDB.id)
            .where(
                ScenarioDB.id == scenario_id,
                ScenarioDB.course_id == course_id,
                CourseDB.user_id == user_id,
            )
        )

    def _hydrate_scenario(self, session, row: ScenarioDB) -> StoredScenario:
        parent_alias = aliased(AssessmentDB)
        score_rows = session.execute(
            select(
                ScenarioScoreDB.simulated_score,
                AssessmentDB.id,
                AssessmentDB.name,
                parent_alias.name,
                AssessmentDB.position,
            )
            .join(AssessmentDB, ScenarioScoreDB.assessment_id == AssessmentDB.id)
            .outerjoin(parent_alias, AssessmentDB.parent_assessment_id == parent_alias.id)
            .where(ScenarioScoreDB.scenario_id == row.id)
            .order_by(
                AssessmentDB.position.asc().nulls_last(),
                AssessmentDB.name.asc(),
                AssessmentDB.id.asc(),
            )
        ).all()
        entries = [
            StoredScenarioEntry(
                assessment_id=assessment_id,
                assessment_name=f"{parent_name}::{name}" if parent_name else name,
                score=_to_float(simulated_score) or 0.0,
            )
            for simulated_score, assessment_id, name, parent_name, _position in score_rows
        ]
        created_at = row.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)

        return StoredScenario(
            scenario_id=row.id,
            name=row.name,
            entries=entries,
            created_at=created_at.isoformat(),
        )

    def create(
        self,
        user_id: UUID,
        course_id: UUID,
        name: str,
        entries: list[StoredScenarioEntry],
    ) -> StoredScenario:
        with self._session_factory() as session:
            course = self._get_course(session, user_id=user_id, course_id=course_id)
            if course is None:
                raise KeyError(course_id)

            scenario_row = ScenarioDB(course_id=course_id, name=name)
            session.add(scenario_row)
            session.flush()

            valid_assessment_ids = {
                assessment_id
                for assessment_id in session.scalars(
                    select(AssessmentDB.id).where(AssessmentDB.course_id == course_id)
                ).all()
            }
            seen_assessment_ids: set[UUID] = set()
            for entry in entries:
                if entry.assessment_id in seen_assessment_ids:
                    raise ValueError(f"Duplicate assessment '{entry.assessment_name}' in scenario")
                seen_assessment_ids.add(entry.assessment_id)

                if entry.assessment_id not in valid_assessment_ids:
                    raise ValueError(
                        f"Assessment '{entry.assessment_name}' not found in course"
                    )
                session.add(
                    ScenarioScoreDB(
                        scenario_id=scenario_row.id,
                        assessment_id=entry.assessment_id,
                        simulated_score=float(entry.score),
                    )
                )

            session.commit()
            session.refresh(scenario_row)
            return self._hydrate_scenario(session=session, row=scenario_row)

    def list_all(self, user_id: UUID, course_id: UUID) -> list[StoredScenario]:
        with self._session_factory() as session:
            rows = session.scalars(
                select(ScenarioDB)
                .join(CourseDB, ScenarioDB.course_id == CourseDB.id)
                .where(
                    ScenarioDB.course_id == course_id,
                    CourseDB.user_id == user_id,
                )
                .order_by(ScenarioDB.created_at.asc(), ScenarioDB.id.asc())
            ).all()
            return [self._hydrate_scenario(session=session, row=row) for row in rows]

    def get_by_id(self, user_id: UUID, course_id: UUID, scenario_id: UUID) -> StoredScenario | None:
        with self._session_factory() as session:
            row = self._get_scenario_row(
                session=session,
                user_id=user_id,
                course_id=course_id,
                scenario_id=scenario_id,
            )
            if row is None:
                return None
            return self._hydrate_scenario(session=session, row=row)

    def delete(self, user_id: UUID, course_id: UUID, scenario_id: UUID) -> bool:
        with self._session_factory() as session:
            row = self._get_scenario_row(
                session=session,
                user_id=user_id,
                course_id=course_id,
                scenario_id=scenario_id,
            )
            if row is None:
                return False
            session.delete(row)
            session.commit()
            return True

    def clear(self) -> None:
        with self._session_factory() as session:
            session.execute(delete(ScenarioDB))
            session.commit()
