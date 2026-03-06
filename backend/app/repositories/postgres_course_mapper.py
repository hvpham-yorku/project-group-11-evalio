from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import AssessmentDB, CourseDB, RuleDB
from app.models import Assessment, ChildAssessment, CourseCreate


def _to_float(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


def persist_course_assessments(
    session: Session,
    course_id: UUID,
    assessments: list[Assessment],
) -> None:
    for position, assessment in enumerate(assessments):
        parent_row = AssessmentDB(
            course_id=course_id,
            parent_assessment_id=None,
            name=assessment.name,
            weight=float(assessment.weight),
            raw_score=_to_float(assessment.raw_score),
            total_score=_to_float(assessment.total_score),
            is_bonus=bool(assessment.is_bonus),
            position=position,
        )
        session.add(parent_row)
        session.flush()

        if assessment.rule_type:
            session.add(
                RuleDB(
                    assessment_id=parent_row.id,
                    rule_type=assessment.rule_type,
                    rule_config=assessment.rule_config or {},
                )
            )

        for child_position, child in enumerate(assessment.children or []):
            session.add(
                AssessmentDB(
                    course_id=course_id,
                    parent_assessment_id=parent_row.id,
                    name=child.name,
                    weight=float(child.weight),
                    raw_score=_to_float(child.raw_score),
                    total_score=_to_float(child.total_score),
                    is_bonus=False,
                    position=child_position,
                )
            )

    session.flush()


def hydrate_course_aggregate(session: Session, course_row: CourseDB) -> CourseCreate:
    parent_rows = session.scalars(
        select(AssessmentDB)
        .where(
            AssessmentDB.course_id == course_row.id,
            AssessmentDB.parent_assessment_id.is_(None),
        )
        .order_by(
            AssessmentDB.position.asc().nulls_last(),
            AssessmentDB.created_at.asc(),
            AssessmentDB.id.asc(),
        )
    ).all()

    child_rows = session.scalars(
        select(AssessmentDB)
        .where(
            AssessmentDB.course_id == course_row.id,
            AssessmentDB.parent_assessment_id.is_not(None),
        )
        .order_by(
            AssessmentDB.parent_assessment_id.asc(),
            AssessmentDB.position.asc().nulls_last(),
            AssessmentDB.created_at.asc(),
            AssessmentDB.id.asc(),
        )
    ).all()

    parent_ids = [row.id for row in parent_rows]
    rules_by_assessment: dict[UUID, RuleDB] = {}
    if parent_ids:
        rules = session.scalars(
            select(RuleDB).where(RuleDB.assessment_id.in_(parent_ids))
        ).all()
        rules_by_assessment = {rule.assessment_id: rule for rule in rules}

    children_by_parent: dict[UUID, list[ChildAssessment]] = defaultdict(list)
    for child_row in child_rows:
        if child_row.parent_assessment_id is None:
            continue
        children_by_parent[child_row.parent_assessment_id].append(
            ChildAssessment(
                name=child_row.name,
                weight=float(child_row.weight),
                raw_score=_to_float(child_row.raw_score),
                total_score=_to_float(child_row.total_score),
            )
        )

    assessments: list[Assessment] = []
    for parent_row in parent_rows:
        rule = rules_by_assessment.get(parent_row.id)
        children = children_by_parent.get(parent_row.id, [])
        assessments.append(
            Assessment(
                name=parent_row.name,
                weight=float(parent_row.weight),
                raw_score=_to_float(parent_row.raw_score),
                total_score=_to_float(parent_row.total_score),
                children=children or None,
                rule_type=rule.rule_type if rule else None,
                rule_config=_normalize_rule_config(rule.rule_config if rule else None),
                is_bonus=bool(parent_row.is_bonus),
            )
        )

    return CourseCreate(name=course_row.name, term=course_row.term, assessments=assessments)


def _normalize_rule_config(raw: Any) -> dict[str, Any] | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    return None
