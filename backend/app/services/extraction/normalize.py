from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from app.models_extraction import ExtractionAssessment, ExtractionDeadline
from app.services.extraction.constants import (
    BEST_OF_REGEX,
    DROP_LOWEST_ALT_RULE_REGEX,
    DROP_LOWEST_RULE_REGEX,
    WEIGHT_MARKS_UNIT_REGEX,
    WEIGHT_NUMBER_REGEX,
    WEIGHT_PERCENT_UNIT_REGEX,
)


def get_child_base_label(parent_name: str) -> str:
    name = parent_name.lower()

    if "lab test" in name:
        return "Lab test"
    if "quiz" in name:
        return "Quiz"
    if "lab" in name:
        return "Lab"
    if "assignment" in name:
        return "Assignment"
    if "test" in name:
        return "Test"
    if "exam" in name:
        return "Exam"

    return "Item"


class NormalizeMixin:
    def _normalize_llm_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise ValueError("LLM output must be a JSON object")

        raw_assessments = payload.get("assessments")
        if not isinstance(raw_assessments, list):
            raise ValueError("LLM output must include an assessments list")

        raw_deadlines = payload.get("deadlines", [])
        if not isinstance(raw_deadlines, list):
            raise ValueError("LLM output deadlines must be a list")

        assessments: list[ExtractionAssessment] = []
        assessment_entries: list[dict[str, Any]] = []
        parse_warnings: list[str] = []
        unit_kinds: list[str | None] = []
        for raw_item in raw_assessments:
            assessment, entry, warnings, unit_kind = self._normalize_assessment_item(raw_item, depth=0)
            entry["name"] = assessment.name
            entry["normalized_name"] = self._normalize_assessment_name(assessment.name)
            if entry.get("weight") is not None:
                entry["weight"] = float(assessment.weight)
            assessments.append(assessment)
            assessment_entries.append(entry)
            parse_warnings.extend(warnings)
            unit_kinds.append(unit_kind)

        scaled_warnings = self._maybe_scale_mark_weights(
            assessments=assessments,
            assessment_entries=assessment_entries,
            unit_kinds=unit_kinds,
        )
        parse_warnings.extend(scaled_warnings)
        self._maybe_synthesize_children_from_count_metadata(
            assessments=assessments,
            assessment_entries=assessment_entries,
        )

        deadlines: list[ExtractionDeadline] = []
        for raw_deadline in raw_deadlines:
            deadlines.append(self._normalize_deadline_item(raw_deadline))

        return {
            "assessments": assessments,
            "assessment_entries": assessment_entries,
            "deadlines": deadlines,
            "parse_warnings": parse_warnings,
        }

    def _normalize_assessment_item(
        self,
        raw_item: Any,
        *,
        depth: int,
    ) -> tuple[ExtractionAssessment, dict[str, Any], list[str], str | None]:
        if not isinstance(raw_item, dict):
            raise ValueError("Each assessment must be an object")

        raw_name = raw_item.get("name")
        if not isinstance(raw_name, str) or not raw_name.strip():
            raise ValueError("Assessment name must be a non-empty string")
        name = raw_name.strip()

        weight_decimal, weight_warnings, unit_kind = self._normalize_weight(raw_item.get("weight"))
        weight_float = 0.0 if weight_decimal is None else float(weight_decimal)
        is_bonus = self._coerce_bool(raw_item.get("is_bonus", False))

        rule = raw_item.get("rule")
        notes = raw_item.get("notes")
        if isinstance(rule, str):
            stripped_rule = rule.strip()
            rule_value = stripped_rule if stripped_rule else None
        else:
            rule_value = None
        total_count_value = self._normalize_nullable_number(raw_item.get("total_count"))
        effective_count_value = self._normalize_nullable_number(raw_item.get("effective_count"))
        unit_weight_value = self._normalize_nullable_number(raw_item.get("unit_weight"))
        rule_type_value = self._normalize_count_rule_type(raw_item.get("rule_type"))
        notes_value = notes if isinstance(notes, str) else None

        raw_children = raw_item.get("children", [])
        if raw_children is None:
            raw_children = []
        if not isinstance(raw_children, list):
            raise ValueError("Assessment children must be a list")

        child_assessments: list[ExtractionAssessment] = []
        child_entries: list[dict[str, Any]] = []
        child_unit_kinds: list[str | None] = []
        child_warnings: list[str] = []
        for raw_child in raw_children:
            child_assessment, child_entry, child_item_warnings, child_unit_kind = self._normalize_assessment_item(
                raw_child,
                depth=depth + 1,
            )
            child_assessments.append(child_assessment)
            child_entries.append(child_entry)
            child_unit_kinds.append(child_unit_kind)
            child_warnings.extend(child_item_warnings)

        assessment = ExtractionAssessment(
            name=name,
            weight=weight_float,
            is_bonus=is_bonus,
            children=child_assessments,
            rule=rule_value,
            total_count=total_count_value,
            effective_count=effective_count_value,
            unit_weight=unit_weight_value,
            rule_type=rule_type_value,
            notes=notes_value,
        )
        entry = {
            "name": name,
            "weight": weight_float if weight_decimal is not None else None,
            "is_bonus": is_bonus,
            "children": child_entries,
            "rule": rule_value,
            "total_count": total_count_value,
            "effective_count": effective_count_value,
            "unit_weight": unit_weight_value,
            "rule_type": rule_type_value,
            "notes": notes_value,
            "line_idx": 0,
            "normalized_name": self._normalize_assessment_name(name),
            "accepted_by_keyword": True,
            "depth": depth,
            "unit_kind": unit_kind,
        }
        combined_warnings = [*weight_warnings, *child_warnings]
        _ = child_unit_kinds  # Tracked for this sibling level for downstream normalization.
        return assessment, entry, combined_warnings, unit_kind

    def _normalize_deadline_item(self, raw_deadline: Any) -> ExtractionDeadline:
        if not isinstance(raw_deadline, dict):
            raise ValueError("Each deadline must be an object")

        raw_title = raw_deadline.get("title")
        if not isinstance(raw_title, str) or not raw_title.strip():
            raise ValueError("Deadline title must be a non-empty string")

        due_date = raw_deadline.get("due_date")
        due_time = raw_deadline.get("due_time")
        source = raw_deadline.get("source", "outline")
        notes = raw_deadline.get("notes")

        if due_date is not None and not isinstance(due_date, str):
            raise ValueError("Deadline due_date must be a string or null")
        if due_time is not None and not isinstance(due_time, str):
            raise ValueError("Deadline due_time must be a string or null")
        if not isinstance(source, str) or not source.strip():
            raise ValueError("Deadline source must be a non-empty string")
        if notes is not None and not isinstance(notes, str):
            raise ValueError("Deadline notes must be a string or null")

        return ExtractionDeadline(
            title=raw_title.strip(),
            due_date=due_date,
            due_time=due_time,
            source=source.strip(),
            notes=notes,
        )

    def _normalize_weight(self, value: Any) -> tuple[Decimal | None, list[str], str | None]:
        warnings: list[str] = []
        normalized = False
        unit_kind: str | None = None

        if value is None:
            return None, warnings, None
        if isinstance(value, bool):
            return None, warnings, None
        if isinstance(value, (int, float, Decimal)):
            try:
                raw_decimal = Decimal(str(value))
            except (InvalidOperation, TypeError, ValueError):
                return None, warnings, None
            unit_kind = "plain"
        elif isinstance(value, str):
            raw_text = value.strip()
            lowered_text = raw_text.lower()
            if not raw_text:
                return None, warnings, None
            if WEIGHT_MARKS_UNIT_REGEX.search(lowered_text):
                unit_kind = "marks"
            elif WEIGHT_PERCENT_UNIT_REGEX.search(lowered_text):
                unit_kind = "percent"
            else:
                unit_kind = "plain"

            if lowered_text in {"nan", "+nan", "-nan", "inf", "+inf", "-inf", "infinity", "+infinity", "-infinity"}:
                try:
                    raw_decimal = Decimal(lowered_text)
                except (InvalidOperation, TypeError, ValueError):
                    return None, warnings, unit_kind
            else:
                number_match = WEIGHT_NUMBER_REGEX.search(lowered_text)
                if number_match is None:
                    return None, warnings, unit_kind
                try:
                    raw_decimal = Decimal(number_match.group(0))
                except (InvalidOperation, TypeError, ValueError):
                    return None, warnings, unit_kind
        else:
            return None, warnings, None

        if raw_decimal.is_nan() or not raw_decimal.is_finite():
            raw_decimal = Decimal("0")
            normalized = True

        if raw_decimal < Decimal("0"):
            raw_decimal = Decimal("0")
            normalized = True
        elif raw_decimal > Decimal("100"):
            raw_decimal = Decimal("100")
            normalized = True

        raw_decimal = self._quantize_weight(raw_decimal)
        if normalized:
            warnings.append("weight_normalized")
        return raw_decimal, warnings, unit_kind

    def _quantize_weight(self, value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    def _normalize_nullable_number(self, value: Any) -> float | None:
        if value is None or isinstance(value, bool):
            return None
        try:
            decimal_value = Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError):
            return None
        if decimal_value.is_nan() or not decimal_value.is_finite():
            return None
        return float(self._quantize_weight(decimal_value))

    def _normalize_count_rule_type(self, value: Any) -> str | None:
        if not isinstance(value, str):
            return None
        normalized = value.strip().lower()
        if normalized in {"pure_multiplicative", "best_of"}:
            return normalized
        return None

    def _maybe_scale_mark_weights(
        self,
        *,
        assessments: list[ExtractionAssessment],
        assessment_entries: list[dict[str, Any]],
        unit_kinds: list[str | None],
    ) -> list[str]:
        numeric_non_bonus_indices = [
            idx
            for idx, entry in enumerate(assessment_entries)
            if not entry.get("is_bonus", False) and entry.get("weight") is not None
        ]
        if not numeric_non_bonus_indices:
            return []

        all_non_bonus_marked = all(unit_kinds[idx] == "marks" for idx in numeric_non_bonus_indices)
        if not all_non_bonus_marked:
            return []

        total = sum(
            Decimal(str(assessment_entries[idx]["weight"]))
            for idx in numeric_non_bonus_indices
        )
        if total <= Decimal("0"):
            return []

        if total == Decimal("100.00"):
            return []

        scaled_values: dict[int, Decimal] = {}
        for idx in numeric_non_bonus_indices:
            raw_value = Decimal(str(assessment_entries[idx]["weight"]))
            scaled_values[idx] = self._quantize_weight((raw_value / total) * Decimal("100"))

        residual = Decimal("100.00") - sum(scaled_values.values())
        if residual != Decimal("0.00"):
            largest_idx = max(numeric_non_bonus_indices, key=lambda i: scaled_values[i])
            scaled_values[largest_idx] = self._quantize_weight(scaled_values[largest_idx] + residual)

        for idx, scaled in scaled_values.items():
            scaled_float = float(scaled)
            assessment_entries[idx]["weight"] = scaled_float
            assessments[idx].weight = scaled_float

        return ["weight_scaled_from_marks"]

    def _maybe_synthesize_children_from_count_metadata(
        self,
        *,
        assessments: list[ExtractionAssessment],
        assessment_entries: list[dict[str, Any]],
    ) -> None:
        if len(assessments) != len(assessment_entries):
            return

        tolerance = Decimal("0.5")
        for index, assessment in enumerate(assessments):
            entry = assessment_entries[index]
            if assessment.children:
                continue

            total_count_raw = assessment.total_count
            effective_count_raw = assessment.effective_count
            unit_weight_raw = assessment.unit_weight
            rule_type_raw = assessment.rule_type
            if rule_type_raw not in {"pure_multiplicative", "best_of"}:
                continue
            if total_count_raw is None or unit_weight_raw is None:
                continue

            total_count_decimal = self._to_decimal(total_count_raw)
            unit_weight_decimal = self._to_decimal(unit_weight_raw)
            parent_weight_decimal = self._quantize_weight(Decimal(str(assessment.weight)))
            if total_count_decimal <= Decimal("0") or unit_weight_decimal <= Decimal("0"):
                continue
            if not total_count_decimal.is_finite() or not unit_weight_decimal.is_finite():
                continue
            if total_count_decimal != total_count_decimal.to_integral_value():
                continue

            divisor: Decimal
            expected_parent: Decimal
            if rule_type_raw == "pure_multiplicative":
                expected_parent = self._quantize_weight(total_count_decimal * unit_weight_decimal)
                divisor = total_count_decimal
            else:
                if effective_count_raw is None:
                    continue
                effective_count_decimal = self._to_decimal(effective_count_raw)
                if effective_count_decimal <= Decimal("0") or not effective_count_decimal.is_finite():
                    continue
                if effective_count_decimal != effective_count_decimal.to_integral_value():
                    continue
                expected_parent = self._quantize_weight(effective_count_decimal * unit_weight_decimal)
                divisor = effective_count_decimal

            if abs(expected_parent - parent_weight_decimal) > tolerance:
                continue

            total_count = int(total_count_decimal)
            normalized_unit_weight = float(parent_weight_decimal / divisor)
            base_label = get_child_base_label(assessment.name)

            synthesized_children = [
                ExtractionAssessment(
                    name=f"{base_label} {child_index}",
                    weight=normalized_unit_weight,
                    is_bonus=False,
                    children=[],
                    rule=None,
                    total_count=None,
                    effective_count=None,
                    unit_weight=None,
                    rule_type=None,
                    notes=None,
                )
                for child_index in range(1, total_count + 1)
            ]
            assessment.children = synthesized_children
            entry["children"] = [
                {
                    "name": child.name,
                    "weight": child.weight,
                    "is_bonus": child.is_bonus,
                    "children": [],
                    "rule": child.rule,
                    "total_count": None,
                    "effective_count": None,
                    "unit_weight": None,
                    "rule_type": None,
                    "notes": None,
                    "line_idx": 0,
                    "normalized_name": self._normalize_assessment_name(child.name),
                    "accepted_by_keyword": True,
                    "depth": (entry.get("depth", 0) or 0) + 1,
                    "unit_kind": "plain",
                }
                for child in synthesized_children
            ]

    def _coerce_bool(self, value: Any, *, default: bool = False) -> bool:
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"true", "1", "yes"}:
                return True
            if lowered in {"false", "0", "no"}:
                return False
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return bool(value)
        return default

    def _to_decimal(self, value: Any) -> Decimal:
        try:
            return Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError):
            return Decimal("-1")
