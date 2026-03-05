from __future__ import annotations

import os
from decimal import Decimal, InvalidOperation
from typing import Any

from app.models import CourseCreate
from app.services.extraction.constants import (
    BEST_OF_REGEX,
    DROP_LOWEST_ALT_RULE_REGEX,
    DROP_LOWEST_RULE_REGEX,
    EACH_PERCENT_REGEX,
    LEADING_COUNT_REGEX,
    TOTAL_COUNT_REGEX,
)


def _read_field(raw_item: Any, field_name: str, default: Any = None) -> Any:
    if isinstance(raw_item, dict):
        return raw_item.get(field_name, default)
    return getattr(raw_item, field_name, default)


def _parse_total_count_from_name(name_value: Any) -> int | None:
    if not isinstance(name_value, str):
        return None
    match = LEADING_COUNT_REGEX.match(name_value.strip())
    if match is None:
        return None
    try:
        count = int(match.group(1))
    except ValueError:
        return None
    return count if count > 0 else None


def _parse_total_count_from_rule(rule_text: str) -> int | None:
    match = TOTAL_COUNT_REGEX.search(rule_text)
    if match is None:
        return None
    try:
        count = int(match.group(1))
    except ValueError:
        return None
    return count if count > 0 else None


def _parse_optional_syllabus_each(rule_text: str) -> Decimal | None:
    each_match = EACH_PERCENT_REGEX.search(rule_text)
    if each_match is None:
        return None
    try:
        value = Decimal(each_match.group(1))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return value if value > Decimal("0") else None


def _derive_rule_metadata(raw_item: Any) -> tuple[str | None, dict[str, Any] | None]:
    explicit_rule_type = _read_field(raw_item, "rule_type")
    explicit_rule_config = _read_field(raw_item, "rule_config")

    if isinstance(explicit_rule_type, str) and explicit_rule_type.strip():
        rule_type = explicit_rule_type.strip()
        if isinstance(explicit_rule_config, dict):
            return rule_type, explicit_rule_config
        return rule_type, None

    rule_text = _read_field(raw_item, "rule")
    if not isinstance(rule_text, str) or not rule_text.strip():
        return None, None

    best_match = BEST_OF_REGEX.search(rule_text)
    if best_match:
        try:
            best_count = int(best_match.group(1))
            total_count = int(best_match.group(2))
        except ValueError:
            return "best_of", None
        config: dict[str, Any] = {
            "best_count": best_count,
            "total_count": total_count,
        }
        syllabus_each = _parse_optional_syllabus_each(rule_text)
        if syllabus_each is not None:
            config["syllabus_each"] = float(syllabus_each)
        return "best_of", config

    drop_count = 1
    drop_rule_present = False
    drop_match = DROP_LOWEST_RULE_REGEX.search(rule_text)
    if drop_match:
        drop_rule_present = True
        if drop_match.group(1):
            try:
                drop_count = int(drop_match.group(1))
            except ValueError:
                drop_count = 1

    alt_drop_match = DROP_LOWEST_ALT_RULE_REGEX.search(rule_text)
    if alt_drop_match:
        drop_rule_present = True
        try:
            drop_count = int(alt_drop_match.group(1))
        except ValueError:
            drop_count = 1

    if drop_rule_present:
        config = {"drop_count": drop_count}
        total_count = _parse_total_count_from_rule(rule_text)
        if total_count is None:
            total_count = _parse_total_count_from_name(_read_field(raw_item, "name"))
        if total_count is not None:
            config["total_count"] = total_count
        syllabus_each = _parse_optional_syllabus_each(rule_text)
        if syllabus_each is not None:
            config["syllabus_each"] = float(syllabus_each)
        return "drop_lowest", config

    return None, None


def map_extraction_to_course_create(extraction_result: Any) -> CourseCreate:
    course_name = _read_field(extraction_result, "course_name")
    if not isinstance(course_name, str) or not course_name.strip():
        course_name = _read_field(extraction_result, "name")
    if not isinstance(course_name, str) or not course_name.strip():
        raise ValueError("course_name is required")
    course_name = course_name.strip()

    term_value = _read_field(extraction_result, "term")
    if term_value is not None and not isinstance(term_value, str):
        raise ValueError("term must be a string or null")

    raw_assessments = _read_field(extraction_result, "assessments")
    if not isinstance(raw_assessments, list):
        raise ValueError("extraction_result.assessments must be a list")
    debug_enabled = bool(os.getenv("FILTER_DEBUG"))

    mapped_assessments: list[dict[str, Any]] = []
    confirm_parent_debug: list[dict[str, Any]] = []
    for raw_assessment in raw_assessments:
        name = _read_field(raw_assessment, "name")
        if not isinstance(name, str) or not name.strip():
            raise ValueError("assessment name must be a non-empty string")
        weight = _read_field(raw_assessment, "weight")
        try:
            weight_value = float(weight)
        except (TypeError, ValueError):
            raise ValueError("assessment weight must be numeric") from None

        is_bonus = bool(_read_field(raw_assessment, "is_bonus", False))
        rule_type, rule_config = _derive_rule_metadata(raw_assessment)

        raw_children = _read_field(raw_assessment, "children", None)
        child_payload: list[dict[str, Any]] | None = None
        if isinstance(raw_children, list) and raw_children:
            child_payload = []
            for raw_child in raw_children:
                child_name = _read_field(raw_child, "name")
                if not isinstance(child_name, str) or not child_name.strip():
                    raise ValueError("child assessment name must be a non-empty string")
                child_weight = _read_field(raw_child, "weight")
                try:
                    child_weight_value = float(child_weight)
                except (TypeError, ValueError):
                    raise ValueError("child assessment weight must be numeric") from None
                child_payload.append(
                    {
                        "name": child_name.strip(),
                        "weight": child_weight_value,
                        "raw_score": None,
                        "total_score": None,
                    }
                )
        if debug_enabled:
            confirm_parent_debug.append(
                {
                    "name": name.strip(),
                    "child_count": len(child_payload) if isinstance(child_payload, list) else 0,
                    "rule_type": rule_type,
                    "rule_config": rule_config,
                }
            )

        mapped_assessments.append(
            {
                "name": name.strip(),
                "weight": weight_value,
                "raw_score": None,
                "total_score": None,
                "children": child_payload,
                "rule_type": rule_type,
                "rule_config": rule_config,
                "is_bonus": is_bonus,
            }
        )
    if debug_enabled:
        child_counts = [entry["child_count"] for entry in confirm_parent_debug]
        print(
            f"[CONFIRM_PAYLOAD_RECEIVED] assessments={len(raw_assessments)} "
            f"child_counts={child_counts} rules={confirm_parent_debug}"
        )

    return CourseCreate(
        name=course_name,
        term=term_value.strip() if isinstance(term_value, str) else None,
        assessments=mapped_assessments,
    )
