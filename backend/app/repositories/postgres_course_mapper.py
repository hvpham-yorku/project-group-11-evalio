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


def _normalize_bonus_policy(value: str | None) -> str:
    if not isinstance(value, str):
        return "none"
    normalized = value.strip().lower()
    if normalized not in {"none", "additive", "capped"}:
        return "none"
    return normalized


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
            normalized_rule_config = _normalize_rule_config_for_persistence(
                rule_type=assessment.rule_type,
                raw=assessment.rule_config,
            )
            session.add(
                RuleDB(
                    assessment_id=parent_row.id,
                    rule_type=assessment.rule_type,
                    rule_config=normalized_rule_config,
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


def sync_course_assessments(
    session: Session,
    course_id: UUID,
    assessments: list[Assessment],
) -> None:
    existing_parent_rows = session.scalars(
        select(AssessmentDB).where(
            AssessmentDB.course_id == course_id,
            AssessmentDB.parent_assessment_id.is_(None),
        )
    ).all()
    existing_children_by_parent: dict[UUID, dict[str, AssessmentDB]] = {}
    for parent_row in existing_parent_rows:
        child_rows = session.scalars(
            select(AssessmentDB).where(
                AssessmentDB.parent_assessment_id == parent_row.id,
            )
        ).all()
        existing_children_by_parent[parent_row.id] = {row.name: row for row in child_rows}

    existing_parents_by_name = {row.name: row for row in existing_parent_rows}
    retained_parent_ids: set[UUID] = set()

    for position, assessment in enumerate(assessments):
        parent_row = existing_parents_by_name.get(assessment.name)
        if parent_row is None:
            parent_row = AssessmentDB(
                course_id=course_id,
                parent_assessment_id=None,
                name=assessment.name,
            )
            session.add(parent_row)
            session.flush()

        parent_row.name = assessment.name
        parent_row.weight = float(assessment.weight)
        parent_row.raw_score = _to_float(assessment.raw_score)
        parent_row.total_score = _to_float(assessment.total_score)
        parent_row.is_bonus = bool(assessment.is_bonus)
        parent_row.position = position
        retained_parent_ids.add(parent_row.id)

        normalized_rule_config = None
        if assessment.rule_type:
            normalized_rule_config = _normalize_rule_config_for_persistence(
                rule_type=assessment.rule_type,
                raw=assessment.rule_config,
            )

        existing_rule = parent_row.rule
        if assessment.rule_type:
            if existing_rule is None:
                session.add(
                    RuleDB(
                        assessment_id=parent_row.id,
                        rule_type=assessment.rule_type,
                        rule_config=normalized_rule_config,
                    )
                )
            else:
                existing_rule.rule_type = assessment.rule_type
                existing_rule.rule_config = normalized_rule_config
        elif existing_rule is not None:
            session.delete(existing_rule)

        existing_children = existing_children_by_parent.get(parent_row.id, {})
        retained_child_ids: set[UUID] = set()
        for child_position, child in enumerate(assessment.children or []):
            child_row = existing_children.get(child.name)
            if child_row is None:
                child_row = AssessmentDB(
                    course_id=course_id,
                    parent_assessment_id=parent_row.id,
                    name=child.name,
                )
                session.add(child_row)
                session.flush()

            child_row.name = child.name
            child_row.weight = float(child.weight)
            child_row.raw_score = _to_float(child.raw_score)
            child_row.total_score = _to_float(child.total_score)
            child_row.is_bonus = False
            child_row.position = child_position
            retained_child_ids.add(child_row.id)

        for child_row in existing_children.values():
            if child_row.id not in retained_child_ids:
                session.delete(child_row)

    for parent_row in existing_parent_rows:
        if parent_row.id not in retained_parent_ids:
            session.delete(parent_row)

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
                rule_config=_normalize_rule_config(
                    rule_type=rule.rule_type if rule else None,
                    raw=rule.rule_config if rule else None,
                ),
                is_bonus=bool(parent_row.is_bonus),
            )
        )

    return CourseCreate(
        name=course_row.name,
        term=course_row.term,
        bonus_policy=_normalize_bonus_policy(course_row.bonus_policy),
        bonus_cap_percentage=_to_float(course_row.bonus_cap_percentage),
        assessments=assessments,
    )


def _normalize_rule_config(rule_type: str | None, raw: Any) -> dict[str, Any] | None:
    if raw is None:
        if rule_type == "mandatory_pass":
            return {"pass_threshold": 50.0}
        return None
    if isinstance(raw, dict):
        if rule_type == "mandatory_pass":
            config = dict(raw)
            threshold = config.get("pass_threshold", 50.0)
            try:
                normalized_threshold = float(threshold)
            except (TypeError, ValueError):
                normalized_threshold = 50.0
            if not 0 <= normalized_threshold <= 100:
                normalized_threshold = 50.0
            config["pass_threshold"] = normalized_threshold
            return config
        return raw
    return None


def _normalize_rule_config_for_persistence(
    rule_type: str,
    raw: Any,
) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}

    if rule_type != "mandatory_pass":
        return dict(raw)

    if "pass_threshold" not in raw:
        raise ValueError(
            "mandatory_pass rule_config must include pass_threshold between 0 and 100"
        )

    threshold = raw.get("pass_threshold")
    try:
        normalized_threshold = float(threshold)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "mandatory_pass rule_config pass_threshold must be between 0 and 100"
        ) from exc

    if not 0 <= normalized_threshold <= 100:
        raise ValueError(
            "mandatory_pass rule_config pass_threshold must be between 0 and 100"
        )

    return {
        **raw,
        "pass_threshold": normalized_threshold,
    }
