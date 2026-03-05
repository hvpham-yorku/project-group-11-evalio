from __future__ import annotations

from collections import Counter
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from app.services.extraction.constants import BEST_OF_REGEX


class ValidateMixin:
    def _validate_structure(self, *, assessment_entries: list[dict[str, Any]]) -> dict[str, Any]:
        def _error(*, code: str, message: str, path: str | None = None) -> dict[str, str]:
            item = {"code": code, "message": message}
            if path:
                item["path"] = path
            return item

        def _first_error_by_code(code: str) -> dict[str, str]:
            for item in errors:
                if item["code"] == code:
                    return item
            return _error(code=code, message="")

        if not assessment_entries:
            errors = [
                _error(
                    code="no_assessments",
                    message="No assessments could be extracted",
                    path="assessments",
                )
            ]
            return {
                "valid": False,
                "reason": errors[0]["message"],
                "reason_code": errors[0]["code"],
                "sum_non_bonus": Decimal("0"),
                "has_duplicate_names": False,
                "has_invalid_weights": False,
                "has_invalid_names": False,
                "warnings": [],
                "errors": errors,
            }

        normalized_names: list[str] = []
        child_normalized_names: list[str] = []
        has_invalid_names = False
        has_invalid_weights = False
        sum_non_bonus = Decimal("0.00")
        non_bonus_count = 0
        quantize_scale = Decimal("0.01")
        warnings: list[str] = []
        errors: list[dict[str, str]] = []
        parent_child_mismatch = False
        depth_limit_exceeded = False

        for index, entry in enumerate(assessment_entries):
            raw_name = entry.get("name")
            if not isinstance(raw_name, str) or not raw_name.strip():
                has_invalid_names = True
                normalized_name = ""
                errors.append(
                    _error(
                        code="invalid_assessment_names",
                        message="Assessment names must be non-empty",
                        path=f"assessments[{index}].name",
                    )
                )
            else:
                normalized_name = self._normalize_assessment_name(raw_name)
                normalized_names.append(normalized_name)

            weight_decimal = self._to_decimal(entry.get("weight"))
            if (
                weight_decimal.is_nan()
                or not weight_decimal.is_finite()
                or weight_decimal < Decimal("0")
                or weight_decimal > Decimal("100")
            ):
                has_invalid_weights = True
                errors.append(
                    _error(
                        code="invalid_weight_values",
                        message="Assessment weights contain invalid values",
                        path=f"assessments[{index}].weight",
                    )
                )
            if not entry["is_bonus"]:
                non_bonus_count += 1
                if not (
                    weight_decimal.is_nan()
                    or not weight_decimal.is_finite()
                    or weight_decimal < Decimal("0")
                    or weight_decimal > Decimal("100")
                ):
                    quantized_weight = weight_decimal.quantize(
                        quantize_scale,
                        rounding=ROUND_HALF_UP,
                    )
                    sum_non_bonus += quantized_weight

            raw_children = entry.get("children", [])
            if raw_children is None:
                raw_children = []
            if not isinstance(raw_children, list):
                has_invalid_names = True
                errors.append(
                    _error(
                        code="invalid_children_type",
                        message="Assessment children must be a list",
                        path=f"assessments[{index}].children",
                    )
                )
                continue

            if not raw_children:
                continue

            tolerance = Decimal("0.5")
            child_weight_sum = Decimal("0.00")
            child_weight_values: list[Decimal] = []
            for child_index, child in enumerate(raw_children):
                if not isinstance(child, dict):
                    has_invalid_names = True
                    errors.append(
                        _error(
                            code="invalid_child_assessment",
                            message="Each child assessment must be an object",
                            path=f"assessments[{index}].children[{child_index}]",
                        )
                    )
                    continue

                raw_child_name = child.get("name")
                if not isinstance(raw_child_name, str) or not raw_child_name.strip():
                    has_invalid_names = True
                    errors.append(
                        _error(
                            code="invalid_assessment_names",
                            message="Assessment names must be non-empty",
                            path=f"assessments[{index}].children[{child_index}].name",
                        )
                    )
                else:
                    child_normalized_names.append(self._normalize_assessment_name(raw_child_name))

                child_weight_decimal = self._to_decimal(child.get("weight"))
                if (
                    child_weight_decimal.is_nan()
                    or not child_weight_decimal.is_finite()
                    or child_weight_decimal < Decimal("0")
                    or child_weight_decimal > Decimal("100")
                ):
                    has_invalid_weights = True
                    errors.append(
                        _error(
                            code="invalid_weight_values",
                            message="Assessment weights contain invalid values",
                            path=f"assessments[{index}].children[{child_index}].weight",
                        )
                    )
                else:
                    quantized_child_weight = child_weight_decimal.quantize(
                        quantize_scale,
                        rounding=ROUND_HALF_UP,
                    )
                    child_weight_sum += quantized_child_weight
                    child_weight_values.append(quantized_child_weight)

                grand_children = child.get("children", [])
                if grand_children is None:
                    grand_children = []
                if not isinstance(grand_children, list):
                    depth_limit_exceeded = True
                    errors.append(
                        _error(
                            code="depth_limit_exceeded",
                            message="Assessment nesting depth cannot exceed 2",
                            path=f"assessments[{index}].children[{child_index}].children",
                        )
                    )
                elif grand_children:
                    depth_limit_exceeded = True
                    errors.append(
                        _error(
                            code="depth_limit_exceeded",
                            message="Assessment nesting depth cannot exceed 2",
                            path=f"assessments[{index}].children[{child_index}].children",
                        )
                    )

            if (
                not (
                    weight_decimal.is_nan()
                    or not weight_decimal.is_finite()
                    or weight_decimal < Decimal("0")
                    or weight_decimal > Decimal("100")
                )
            ):
                quantized_parent_weight = weight_decimal.quantize(
                    quantize_scale,
                    rounding=ROUND_HALF_UP,
                )
                rule_type = entry.get("rule_type")
                fallback_effective_count: Decimal | None = None
                if rule_type not in {"pure_multiplicative", "best_of"}:
                    raw_rule_text = entry.get("rule")
                    if isinstance(raw_rule_text, str):
                        best_match = BEST_OF_REGEX.search(raw_rule_text)
                        if best_match is not None:
                            rule_type = "best_of"
                            try:
                                fallback_effective_count = Decimal(best_match.group(1))
                            except (InvalidOperation, TypeError, ValueError):
                                fallback_effective_count = None
                if rule_type == "pure_multiplicative":
                    total_count_decimal = self._to_decimal(entry.get("total_count"))
                    if (
                        not child_weight_values
                        or total_count_decimal <= Decimal("0")
                        or not total_count_decimal.is_finite()
                        or total_count_decimal != total_count_decimal.to_integral_value()
                    ):
                        parent_child_mismatch = True
                        errors.append(
                            _error(
                                code="rule_based_parent_child_weight_mismatch",
                                message=(
                                    "Rule-based parent assessment child weights do not align "
                                    "with parent weight"
                                ),
                                path=f"assessments[{index}]",
                            )
                        )
                    else:
                        expected_parent_weight = self._quantize_weight(
                            total_count_decimal * child_weight_values[0]
                        )
                        if abs(expected_parent_weight - quantized_parent_weight) > tolerance:
                            parent_child_mismatch = True
                            errors.append(
                                _error(
                                    code="rule_based_parent_child_weight_mismatch",
                                    message=(
                                        "Rule-based parent assessment child weights do not align "
                                        "with parent weight"
                                    ),
                                    path=f"assessments[{index}]",
                                )
                            )
                elif rule_type == "best_of":
                    effective_count_decimal = self._to_decimal(entry.get("effective_count"))
                    if (
                        (effective_count_decimal <= Decimal("0") or not effective_count_decimal.is_finite())
                        and fallback_effective_count is not None
                    ):
                        effective_count_decimal = fallback_effective_count
                    if (
                        not child_weight_values
                        or effective_count_decimal <= Decimal("0")
                        or not effective_count_decimal.is_finite()
                        or effective_count_decimal != effective_count_decimal.to_integral_value()
                    ):
                        parent_child_mismatch = True
                        errors.append(
                            _error(
                                code="rule_based_parent_child_weight_mismatch",
                                message=(
                                    "Rule-based parent assessment child weights do not align "
                                    "with parent weight"
                                ),
                                path=f"assessments[{index}]",
                            )
                        )
                    else:
                        expected_parent_weight = self._quantize_weight(
                            effective_count_decimal * child_weight_values[0]
                        )
                        if abs(expected_parent_weight - quantized_parent_weight) > tolerance:
                            parent_child_mismatch = True
                            errors.append(
                                _error(
                                    code="rule_based_parent_child_weight_mismatch",
                                    message=(
                                        "Rule-based parent assessment child weights do not align "
                                        "with parent weight"
                                    ),
                                    path=f"assessments[{index}]",
                                )
                            )
                elif abs(child_weight_sum - quantized_parent_weight) > tolerance:
                    parent_child_mismatch = True
                    errors.append(
                        _error(
                            code="parent_child_weight_mismatch",
                            message="Parent assessment weight must equal sum of child assessment weights",
                            path=f"assessments[{index}]",
                        )
                    )

        name_counts = Counter(normalized_names)
        has_top_level_duplicates = any(count > 1 for count in name_counts.values())
        has_duplicate_representation = bool(set(normalized_names) & set(child_normalized_names))
        has_duplicate_names = has_top_level_duplicates or has_duplicate_representation

        if non_bonus_count == 0:
            errors.append(
                _error(
                    code="bonus_only_structure",
                    message="Bonus-only assessment structures are invalid",
                )
            )
            first = _first_error_by_code("bonus_only_structure")
            return {
                "valid": False,
                "reason": first["message"],
                "reason_code": first["code"],
                "sum_non_bonus": sum_non_bonus,
                "has_duplicate_names": has_duplicate_names,
                "has_invalid_weights": has_invalid_weights,
                "has_invalid_names": has_invalid_names,
                "warnings": warnings,
                "errors": errors,
            }

        if has_invalid_names:
            first = _first_error_by_code("invalid_assessment_names")
            return {
                "valid": False,
                "reason": first["message"],
                "reason_code": first["code"],
                "sum_non_bonus": sum_non_bonus,
                "has_duplicate_names": has_duplicate_names,
                "has_invalid_weights": has_invalid_weights,
                "has_invalid_names": has_invalid_names,
                "warnings": warnings,
                "errors": errors,
            }

        if has_top_level_duplicates:
            errors.append(
                _error(
                    code="duplicate_assessment_names",
                    message="Duplicate assessment names detected",
                )
            )
            first = _first_error_by_code("duplicate_assessment_names")
            return {
                "valid": False,
                "reason": first["message"],
                "reason_code": first["code"],
                "sum_non_bonus": sum_non_bonus,
                "has_duplicate_names": has_duplicate_names,
                "has_invalid_weights": has_invalid_weights,
                "has_invalid_names": has_invalid_names,
                "warnings": warnings,
                "errors": errors,
            }

        if has_duplicate_representation:
            errors.append(
                _error(
                    code="duplicate_parent_child_representation",
                    message="Child assessments must not be duplicated as top-level assessments",
                )
            )
            first = _first_error_by_code("duplicate_parent_child_representation")
            return {
                "valid": False,
                "reason": first["message"],
                "reason_code": first["code"],
                "sum_non_bonus": sum_non_bonus,
                "has_duplicate_names": has_duplicate_names,
                "has_invalid_weights": has_invalid_weights,
                "has_invalid_names": has_invalid_names,
                "warnings": warnings,
                "errors": errors,
            }

        if has_invalid_weights:
            first = _first_error_by_code("invalid_weight_values")
            return {
                "valid": False,
                "reason": first["message"],
                "reason_code": first["code"],
                "sum_non_bonus": sum_non_bonus,
                "has_duplicate_names": has_duplicate_names,
                "has_invalid_weights": has_invalid_weights,
                "has_invalid_names": has_invalid_names,
                "warnings": warnings,
                "errors": errors,
            }

        if abs(sum_non_bonus - Decimal("100.00")) > Decimal("0.01"):
            errors.append(
                _error(
                    code="weight_sum_not_100",
                    message="Weight sum does not equal 100",
                )
            )
            first = _first_error_by_code("weight_sum_not_100")
            return {
                "valid": False,
                "reason": first["message"],
                "reason_code": first["code"],
                "sum_non_bonus": sum_non_bonus,
                "has_duplicate_names": has_duplicate_names,
                "has_invalid_weights": has_invalid_weights,
                "has_invalid_names": has_invalid_names,
                "warnings": warnings,
                "errors": errors,
            }

        if depth_limit_exceeded:
            first = _first_error_by_code("depth_limit_exceeded")
            return {
                "valid": False,
                "reason": first["message"],
                "reason_code": first["code"],
                "sum_non_bonus": sum_non_bonus,
                "has_duplicate_names": has_duplicate_names,
                "has_invalid_weights": has_invalid_weights,
                "has_invalid_names": has_invalid_names,
                "warnings": warnings,
                "errors": errors,
            }

        if parent_child_mismatch:
            if _first_error_by_code("parent_child_weight_mismatch")["message"]:
                first = _first_error_by_code("parent_child_weight_mismatch")
            else:
                first = _first_error_by_code("rule_based_parent_child_weight_mismatch")
            return {
                "valid": False,
                "reason": first["message"],
                "reason_code": first["code"],
                "sum_non_bonus": sum_non_bonus,
                "has_duplicate_names": has_duplicate_names,
                "has_invalid_weights": has_invalid_weights,
                "has_invalid_names": has_invalid_names,
                "warnings": warnings,
                "errors": errors,
            }

        return {
            "valid": True,
            "reason": None,
            "reason_code": None,
            "sum_non_bonus": sum_non_bonus,
            "has_duplicate_names": has_duplicate_names,
            "has_invalid_weights": has_invalid_weights,
            "has_invalid_names": has_invalid_names,
            "warnings": warnings,
            "errors": [],
        }
