from __future__ import annotations

import re
from collections import Counter
from decimal import Decimal
from typing import Any

from app.models_extraction import ExtractionDeadline, ExtractionDiagnostics, ExtractionResponse
from app.services.extraction.constants import ASSESSMENT_KEYWORDS


class DiagnosticsMixin:
    def _compute_confidence_from_llm(
        self,
        *,
        assessment_entries: list[dict[str, Any]],
        deadlines: list[ExtractionDeadline],
        validation_result: dict[str, Any],
    ) -> dict[str, Any]:
        non_bonus_entries = [entry for entry in assessment_entries if not entry.get("is_bonus", False)]
        score = 0
        if len(non_bonus_entries) >= 3:
            score += 20
        if validation_result["sum_non_bonus"] == Decimal("100"):
            score += 35
        if not validation_result["has_duplicate_names"]:
            score += 15
        if not validation_result["has_invalid_weights"]:
            score += 10
        if not validation_result.get("has_invalid_names", False):
            score += 10
        if deadlines:
            score += 10
        score = min(score, 100)
        return {
            "confidence_score": float(score),
            "confidence_level": self._classify_confidence(score),
        }

    def _failure_response(
        self,
        *,
        text_result: dict[str, Any],
        failure_reason: str,
        trigger_reasons: list[str],
        extra_warnings: list[str] | None = None,
        method: str = "deterministic",
        course_code: str | None = None,
    ) -> ExtractionResponse:
        parse_warnings = self._merge_parse_warnings(
            text_result.get("parse_warnings", []),
            extra_warnings or [],
        )
        diagnostics = ExtractionDiagnostics(
            method=method,
            ocr_used=text_result["ocr_used"],
            ocr_available=text_result["ocr_available"],
            ocr_error=text_result["ocr_error"],
            parse_warnings=parse_warnings,
            confidence_score=0.0,
            confidence_level="Low",
            deterministic_failed_validation=True,
            failure_reason=failure_reason,
            trigger_gpt=True,
            trigger_reasons=trigger_reasons,
            stub=False,
        )
        return self._build_validation_failure_response(
            diagnostics=diagnostics,
            course_code=course_code,
        )

    def _compute_confidence(
        self,
        *,
        cluster_result: dict[str, Any],
        percentage_result: dict[str, Any],
        deadline_result: dict[str, Any],
        validation_result: dict[str, Any],
        lines: list[str],
    ) -> dict[str, Any]:
        score = 0
        assessments = cluster_result["assessment_entries"]
        non_bonus_assessments = [
            assessment for assessment in assessments if not assessment.get("is_bonus", False)
        ]
        non_bonus_percentage_entries = [
            entry for entry in percentage_result["filtered_entries"] if not entry.get("is_bonus", False)
        ]
        non_bonus_assessment_count = len(non_bonus_assessments)
        non_bonus_percentage_count = len(non_bonus_percentage_entries)

        if non_bonus_assessment_count >= 3:
            score += 10
        if non_bonus_percentage_count >= 3:
            score += 5
        if cluster_result["linked_non_bonus_percentages"] > 0:
            score += 5
        if cluster_result["orphan_non_bonus_percentages"] == 0:
            score += 5

        if validation_result["sum_non_bonus"] == Decimal("100"):
            score += 25
        if not validation_result["has_duplicate_names"]:
            score += 5
        if not validation_result["has_invalid_weights"]:
            score += 5

        keyword_match = any(
            keyword in entry["name"].lower()
            for entry in non_bonus_assessments
            for keyword in ASSESSMENT_KEYWORDS
        )
        if keyword_match:
            score += 10
        if non_bonus_assessments and all(
            3 <= len(entry["name"].strip()) <= 50 for entry in non_bonus_assessments
        ):
            score += 5

        if deadline_result["attached_non_bonus_count"] >= 1:
            score += 5
        if deadline_result["attached_non_bonus_count"] >= 1:
            score += 5
        if deadline_result["within_window_non_bonus_count"] >= 1:
            score += 5

        if non_bonus_percentage_count <= 10:
            score += 5
        if not self._has_repeated_garbage_lines(lines):
            score += 5

        confidence_level = self._classify_confidence(score)
        return {
            "confidence_score": float(score),
            "confidence_level": confidence_level,
        }

    def _compute_trigger_flags(
        self,
        *,
        sum_non_bonus: Decimal,
        confidence_score: float,
        structure_valid: bool,
        reason_code: str | None,
    ) -> dict[str, Any]:
        trigger_reasons: list[str] = []
        trigger_gpt = False

        if sum_non_bonus != Decimal("100"):
            trigger_gpt = True
            trigger_reasons.append("weight_sum_not_100")
        if not structure_valid and reason_code and reason_code not in trigger_reasons:
            trigger_gpt = True
            trigger_reasons.append(reason_code)

        return {
            "trigger_gpt": trigger_gpt,
            "trigger_reasons": trigger_reasons,
        }

    def _build_validation_failure_response(
        self,
        *,
        diagnostics: ExtractionDiagnostics,
        course_code: str | None = None,
    ) -> ExtractionResponse:
        return ExtractionResponse(
            course_code=course_code,
            assessments=[],
            deadlines=[],
            diagnostics=diagnostics,
            structure_valid=False,
            message="Deterministic extraction failed strict validation. Manual review required.",
        )

    def _timeout_partial_response(
        self,
        *,
        text_result: dict[str, Any],
        full_text: str,
        term: str | None,
        timeout_reason: str,
    ) -> ExtractionResponse:
        partial = self._extract_partial_from_text(full_text=full_text, term=term)
        assessments = partial["assessments"]
        assessment_entries = partial["assessment_entries"]
        deadlines = partial["deadlines"]

        validation_result = self._validate_structure(assessment_entries=assessment_entries)
        structure_valid = validation_result["valid"]
        confidence_result = self._compute_confidence_from_llm(
            assessment_entries=assessment_entries,
            deadlines=deadlines,
            validation_result=validation_result,
        )
        parse_warnings = self._merge_parse_warnings(
            text_result.get("parse_warnings", []),
            validation_result.get("warnings", []),
            ["llm_timeout"],
        )
        if confidence_result["confidence_score"] < 60:
            parse_warnings = self._merge_parse_warnings(parse_warnings, ["low_confidence"])

        trigger_reasons = ["llm_timeout"]
        if not structure_valid:
            if validation_result.get("reason_code"):
                trigger_reasons.append(validation_result["reason_code"])
            else:
                trigger_reasons.append("no_assessments")

        diagnostics = ExtractionDiagnostics(
            method="deterministic",
            ocr_used=text_result["ocr_used"],
            ocr_available=text_result["ocr_available"],
            ocr_error=text_result["ocr_error"],
            parse_warnings=parse_warnings,
            confidence_score=confidence_result["confidence_score"],
            confidence_level=confidence_result["confidence_level"],
            deterministic_failed_validation=not structure_valid,
            failure_reason=None if structure_valid else validation_result["reason"],
            trigger_gpt=True,
            trigger_reasons=trigger_reasons,
            stub=False,
        )
        if not structure_valid:
            return self._build_validation_failure_response(diagnostics=diagnostics)

        return ExtractionResponse(
            assessments=assessments,
            deadlines=deadlines,
            diagnostics=diagnostics,
            structure_valid=True,
            message=f"Partial extraction returned after timeout: {timeout_reason}",
        )

    def _merge_parse_warnings(self, *warning_lists: list[str]) -> list[str]:
        merged: list[str] = []
        for warning_list in warning_lists:
            for warning in warning_list:
                if warning and warning not in merged:
                    merged.append(warning)
        return merged

    def _classify_confidence(self, score: float) -> str:
        if score >= 85:
            return "High"
        if score >= 80:
            return "Medium"
        return "Low"

    def _has_repeated_garbage_lines(self, lines: list[str]) -> bool:
        normalized = [
            re.sub(r"[^a-z0-9]", "", line.lower())
            for line in lines
            if len(line.strip()) >= 3
        ]
        repeated = Counter(normalized)
        return any(count > 3 and len(value) < 12 for value, count in repeated.items())

    def _truncate_error(self, message: str, *, max_len: int = 180) -> str:
        normalized = re.sub(r"\s+", " ", message).strip()
        if len(normalized) <= max_len:
            return normalized
        return f"{normalized[: max_len - 3]}..."

    def _format_warning(self, code: str, message: str) -> str:
        return f"{code}:{self._truncate_error(message)}"
