from __future__ import annotations

import argparse
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.db import AssessmentDB, CourseDB, SessionLocal
from app.models import CourseCreate
from app.repositories.postgres_course_mapper import persist_course_assessments


@dataclass
class MigrationStats:
    total_rows: int = 0
    migrated_courses: int = 0
    skipped_already_migrated: int = 0
    skipped_no_payload: int = 0
    failed: int = 0
    migrated_assessments: int = 0
    migrated_children: int = 0
    migrated_rules: int = 0


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="One-time migration: courses.data JSONB -> relational assessments/rules"
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate and report only")
    parser.add_argument("--course-id", type=str, default=None, help="Migrate only one course UUID")
    parser.add_argument("--user-id", type=str, default=None, help="Migrate only one user UUID")
    parser.add_argument(
        "--force-replace",
        action="store_true",
        help="Delete existing relational assessments for a course before reinserting",
    )
    return parser.parse_args()


def _has_legacy_data_column() -> bool:
    with SessionLocal() as session:
        exists = session.scalar(
            text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'courses'
                      AND column_name = 'data'
                )
                """
            )
        )
        return bool(exists)


def _load_legacy_rows(course_id: UUID | None, user_id: UUID | None) -> list[dict[str, Any]]:
    conditions = ["data IS NOT NULL"]
    params: dict[str, Any] = {}

    if course_id is not None:
        conditions.append("id = :course_id")
        params["course_id"] = str(course_id)

    if user_id is not None:
        conditions.append("user_id = :user_id")
        params["user_id"] = str(user_id)

    where_clause = " AND ".join(conditions)
    query = text(
        f"""
        SELECT id, user_id, name, term, data
        FROM courses
        WHERE {where_clause}
        ORDER BY created_at ASC, id ASC
        """
    )

    with SessionLocal() as session:
        rows = session.execute(query, params).mappings().all()
        return [dict(row) for row in rows]


def _count_components(course: CourseCreate) -> tuple[int, int, int]:
    parent_count = len(course.assessments)
    child_count = sum(len(assessment.children or []) for assessment in course.assessments)
    rule_count = sum(1 for assessment in course.assessments if assessment.rule_type)
    return parent_count, child_count, rule_count


def _migrate_single_row(row: dict[str, Any], force_replace: bool, dry_run: bool) -> tuple[bool, str, tuple[int, int, int]]:
    course_id = row["id"]

    payload = row.get("data")
    if payload is None:
        return False, "no_payload", (0, 0, 0)

    try:
        course = CourseCreate.model_validate(payload)
    except ValidationError as exc:
        return False, f"invalid_payload: {exc}", (0, 0, 0)

    parent_count, child_count, rule_count = _count_components(course)

    with SessionLocal() as session:
        course_row = session.scalar(select(CourseDB).where(CourseDB.id == course_id))
        if course_row is None:
            return False, f"course_not_found: {course_id}", (0, 0, 0)

        existing_count = session.scalar(
            select(func.count()).select_from(AssessmentDB).where(AssessmentDB.course_id == course_id)
        )
        if existing_count and not force_replace:
            return False, "already_migrated", (0, 0, 0)

        if dry_run:
            return True, "dry_run_ok", (parent_count, child_count, rule_count)

        try:
            course_row.name = course.name
            course_row.term = course.term

            if force_replace and existing_count:
                session.execute(delete_stmt_for_course(course_id))
                session.flush()

            persist_course_assessments(session=session, course_id=course_id, assessments=course.assessments)
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            return False, f"integrity_error: {exc.orig}", (0, 0, 0)
        except SQLAlchemyError as exc:
            session.rollback()
            return False, f"db_error: {exc}", (0, 0, 0)

    return True, "migrated", (parent_count, child_count, rule_count)


def delete_stmt_for_course(course_id: UUID):
    return text("DELETE FROM assessments WHERE course_id = :course_id").bindparams(course_id=str(course_id))


def main() -> int:
    args = _parse_args()

    course_id = UUID(args.course_id) if args.course_id else None
    user_id = UUID(args.user_id) if args.user_id else None

    if not _has_legacy_data_column():
        print("[MIGRATION] No legacy courses.data column found; nothing to migrate.")
        return 0

    rows = _load_legacy_rows(course_id=course_id, user_id=user_id)
    stats = MigrationStats(total_rows=len(rows))

    print(
        f"[MIGRATION] Starting JSONB -> relational migration. "
        f"rows={stats.total_rows} dry_run={args.dry_run} force_replace={args.force_replace}"
    )

    failures: list[str] = []

    for row in rows:
        ok, reason, counts = _migrate_single_row(
            row=row,
            force_replace=args.force_replace,
            dry_run=args.dry_run,
        )

        if reason == "no_payload":
            stats.skipped_no_payload += 1
            continue
        if reason == "already_migrated":
            stats.skipped_already_migrated += 1
            continue

        if ok:
            stats.migrated_courses += 1
            stats.migrated_assessments += counts[0]
            stats.migrated_children += counts[1]
            stats.migrated_rules += counts[2]
            print(f"[MIGRATION] course_id={row['id']} status={reason}")
            continue

        stats.failed += 1
        failure = f"course_id={row['id']} reason={reason}"
        failures.append(failure)
        print(f"[MIGRATION][FAILED] {failure}")

    print("[MIGRATION] Summary")
    print(f"  total_rows={stats.total_rows}")
    print(f"  migrated_courses={stats.migrated_courses}")
    print(f"  skipped_already_migrated={stats.skipped_already_migrated}")
    print(f"  skipped_no_payload={stats.skipped_no_payload}")
    print(f"  failed={stats.failed}")
    print(f"  migrated_assessments={stats.migrated_assessments}")
    print(f"  migrated_children={stats.migrated_children}")
    print(f"  migrated_rules={stats.migrated_rules}")

    if failures:
        print("[MIGRATION] Failures:")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
