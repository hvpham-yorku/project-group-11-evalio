from __future__ import annotations

import io
import re
import shutil
from collections import Counter
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from app.models_extraction import (
    ExtractionAssessment,
    ExtractionDeadline,
    ExtractionDiagnostics,
    ExtractionResponse,
    OutlineExtractionRequest,
)
from app.services.llm_extraction_client import LlmExtractionClient, LlmExtractionError

PERCENTAGE_REGEX = re.compile(r"(?<!\d)(100(?:\.0+)?|[1-9]?\d(?:\.\d+)?)\s*%")
SECTION_KEYWORDS = (
    "grading",
    "evaluation",
    "assessment",
    "breakdown",
    "weight",
    "worth",
    "distribution",
    "%",
)
PENALTY_KEYWORDS = ("late penalty", "deduct", "penalty", "per day late")
RULE_PATTERNS = (
    re.compile(r"\bbest\s+\d+\s+of\s+\d+\b", re.IGNORECASE),
    re.compile(r"\bdrop\s+lowest\b", re.IGNORECASE),
    re.compile(r"\bmust\s+pass\b", re.IGNORECASE),
    re.compile(r"\bbonus\b", re.IGNORECASE),
)
ASSESSMENT_KEYWORDS = {
    "quiz",
    "quizzes",
    "test",
    "term test",
    "lab test",
    "assignment",
    "midterm",
    "final",
    "project",
    "presentation",
    "participation",
    "activity",
    "report",
    "viva",
}
ASSESSMENT_WHITELIST_KEYWORDS = (
    "assignment",
    "quiz",
    "quizzes",
    "test",
    "midterm",
    "final",
    "exam",
    "lab",
    "tutorial",
    "participation",
    "project",
    "presentation",
    "essay",
    "report",
    "homework",
    "deliverable",
)
ASSESSMENT_SHORTFORM_REGEX = re.compile(r"\b(?:a\d+|hw\d+|q\d+|quiz\s*\d+)\b", re.IGNORECASE)
EXAM_TERMS = ("exam", "examination")
EXAM_ACCEPTED_START_TOKENS = ("final", "midterm", "practice", "quiz", "lab", "test", "exam", "examination")
EXAM_ADMIN_VERBS = (
    "must",
    "required",
    "requirement",
    "may",
    "vary",
    "contributes",
    "include",
    "subject to",
    "discretion",
    "obtain",
    "achieve",
)
EXAM_ADMIN_NOUNS = (
    "logistics",
    "format",
    "formatting",
    "attendance",
    "integrity",
    "compliance",
    "guideline",
    "policy",
    "department",
    "administrative",
)
POLICY_BLACKLIST_PHRASES = (
    "policy",
    "policies",
    "guideline",
    "guidelines",
    "compliance",
    "integrity",
    "department",
    "academic integrity",
    "must",
    "required",
    "must obtain",
    "must achieve",
    "required to",
    "requirement",
    "to pass",
    "pass the course",
    "pass this course",
    "minimum",
    "threshold",
    "at least",
    "overall",
    "in order to",
    "mandatory",
    "may vary",
    "discretion",
    "subject to change",
    "contributes",
    "late penalty",
    "deduct",
    "per day",
    "penalized",
    "penalty",
)
MONTH_DATE_REGEX = re.compile(
    r"\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    r"\s+\d{1,2}(?:,\s*\d{4})?\b",
    re.IGNORECASE,
)
NUMERIC_DATE_REGEX = re.compile(r"\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b")
TIME_REGEX = re.compile(
    r"(?:\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s?(?:am|pm))?\b)|"
    r"(?:\b(?:1[0-2]|0?[1-9])\s?(?:am|pm)\b)",
    re.IGNORECASE,
)
TERM_REGEX = re.compile(r"^\s*([WFS])\s*([0-9]{2}|[0-9]{4})\s*$", re.IGNORECASE)
TOKEN_REGEX = re.compile(r"[a-z0-9]+")
WEIGHT_NUMBER_REGEX = re.compile(r"[-+]?\d*\.?\d+")
WEIGHT_MARKS_UNIT_REGEX = re.compile(r"\b(?:marks?|pts?|points?)\b", re.IGNORECASE)
WEIGHT_PERCENT_UNIT_REGEX = re.compile(r"%")

MAX_TEXT_CHARS = 120000
MAX_SCAN_LINES = 2000
MAX_OCR_PAGES = 10
PDF_SUSPICIOUS_TEXT_THRESHOLD = 400


class ExtractionService:
    def __init__(self, *, llm_client: LlmExtractionClient | None = None):
        self._llm_client = llm_client or LlmExtractionClient()

    def extract(
        self,
        *,
        filename: str,
        content_type: str,
        file_bytes: bytes,
        term: str | None = None,
    ) -> ExtractionResponse:
        text_result = self._extract_text(
            filename=filename,
            content_type=content_type,
            file_bytes=file_bytes,
        )
        full_text = text_result["text"]
        if not full_text.strip():
            return self._failure_response(
                text_result=text_result,
                failure_reason="No text could be extracted from the file",
                trigger_reasons=["no_extracted_text"],
            )

        try:
            llm_payload = self._llm_client.extract(full_text)
        except LlmExtractionError as exc:
            return self._failure_response(
                text_result=text_result,
                failure_reason=exc.reason_code,
                trigger_reasons=[exc.reason_code],
                method="llm",
            )
        except Exception as exc:  # pragma: no cover - defensive fallback
            return self._failure_response(
                text_result=text_result,
                failure_reason=f"LLM extraction failed unexpectedly: {exc}",
                trigger_reasons=["llm_unexpected_failure"],
                method="llm",
            )

        try:
            normalized = self._normalize_llm_payload(llm_payload)
        except ValueError as exc:
            return self._failure_response(
                text_result=text_result,
                failure_reason=str(exc),
                trigger_reasons=["llm_invalid_schema"],
                method="llm",
            )

        validation_result = self._validate_structure(
            assessment_entries=normalized["assessment_entries"]
        )
        confidence_result = self._compute_confidence_from_llm(
            assessment_entries=normalized["assessment_entries"],
            deadlines=normalized["deadlines"],
            validation_result=validation_result,
        )
        parse_warnings = self._merge_parse_warnings(
            text_result.get("parse_warnings", []),
            normalized.get("parse_warnings", []),
            validation_result.get("warnings", []),
        )
        if confidence_result["confidence_score"] < 60:
            parse_warnings = self._merge_parse_warnings(parse_warnings, ["low_confidence"])
        trigger_result = self._compute_trigger_flags(
            sum_non_bonus=validation_result["sum_non_bonus"],
            confidence_score=confidence_result["confidence_score"],
            structure_valid=validation_result["valid"],
            reason_code=validation_result["reason_code"],
        )

        diagnostics = ExtractionDiagnostics(
            method="llm",
            ocr_used=text_result["ocr_used"],
            ocr_available=text_result["ocr_available"],
            ocr_error=text_result["ocr_error"],
            parse_warnings=parse_warnings,
            confidence_score=confidence_result["confidence_score"],
            confidence_level=confidence_result["confidence_level"],
            deterministic_failed_validation=not validation_result["valid"],
            failure_reason=validation_result["reason"] if not validation_result["valid"] else None,
            trigger_gpt=trigger_result["trigger_gpt"],
            trigger_reasons=trigger_result["trigger_reasons"],
            stub=False,
        )

        if not validation_result["valid"]:
            return self._build_validation_failure_response(diagnostics=diagnostics)

        return ExtractionResponse(
            assessments=normalized["assessments"],
            deadlines=normalized["deadlines"],
            diagnostics=diagnostics,
            structure_valid=True,
            message="Deterministic extraction completed",
        )

    def extract_legacy(self, request: OutlineExtractionRequest) -> ExtractionResponse:
        _ = request
        return ExtractionResponse(
            assessments=[],
            deadlines=[],
            diagnostics=ExtractionDiagnostics(
                method="stub",
                ocr_used=False,
                ocr_available=True,
                ocr_error=None,
                parse_warnings=[],
                confidence_score=0.0,
                confidence_level="Low",
                deterministic_failed_validation=False,
                failure_reason=None,
                trigger_gpt=False,
                trigger_reasons=[],
                stub=True,
            ),
            structure_valid=False,
            message="Outline extraction is in stub mode",
        )

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
            assessment, entry, warnings, unit_kind = self._normalize_assessment_item(raw_item)
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
        notes_value = notes if isinstance(notes, str) else None

        assessment = ExtractionAssessment(
            name=name,
            weight=weight_float,
            is_bonus=is_bonus,
            children=[],
            rule=rule_value,
            notes=notes_value,
        )
        entry = {
            "name": name,
            "weight": weight_float if weight_decimal is not None else None,
            "is_bonus": is_bonus,
            "children": [],
            "rule": rule_value,
            "notes": notes_value,
            "line_idx": 0,
            "normalized_name": self._normalize_assessment_name(name),
            "accepted_by_keyword": True,
        }
        return assessment, entry, weight_warnings, unit_kind

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
        return self._build_validation_failure_response(diagnostics=diagnostics)

    def _extract_text(self, *, filename: str, content_type: str, file_bytes: bytes) -> dict[str, Any]:
        lowered_name = filename.lower()
        lowered_type = content_type.lower()
        if lowered_name.endswith(".txt") or "text/plain" in lowered_type:
            txt_result = self._extract_text_txt(file_bytes)
            return {
                "text": txt_result["text"],
                "ocr_used": False,
                "ocr_available": True,
                "ocr_error": None,
                "parse_warnings": txt_result["parse_warnings"],
            }

        if lowered_name.endswith(".docx") or "wordprocessingml.document" in lowered_type:
            docx_result = self._extract_text_docx(file_bytes)
            return {
                "text": docx_result["text"],
                "ocr_used": False,
                "ocr_available": True,
                "ocr_error": None,
                "parse_warnings": docx_result["parse_warnings"],
            }

        if lowered_name.endswith(".pdf") or "application/pdf" in lowered_type:
            return self._extract_text_pdf(file_bytes)

        return {
            "text": "",
            "ocr_used": False,
            "ocr_available": True,
            "ocr_error": f"Unsupported file type for {filename}",
            "parse_warnings": [
                self._format_warning(
                    "unsupported_file_type",
                    f"Unsupported file type for {filename}",
                )
            ],
        }

    def _extract_text_txt(self, file_bytes: bytes) -> dict[str, Any]:
        return {
            "text": file_bytes.decode("utf-8", errors="replace"),
            "parse_warnings": [],
        }

    def _extract_text_docx(self, file_bytes: bytes) -> dict[str, Any]:
        parse_warnings: list[str] = []
        try:
            from docx import Document
        except ImportError as exc:
            parse_warnings.append(self._format_warning("docx_import_error", str(exc)))
            return {"text": "", "parse_warnings": parse_warnings}

        try:
            document = Document(io.BytesIO(file_bytes))
        except Exception as exc:
            parse_warnings.append(self._format_warning("docx_parse_error", str(exc)))
            return {"text": "", "parse_warnings": parse_warnings}

        text = "\n".join(
            paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()
        )
        return {"text": text, "parse_warnings": parse_warnings}

    def _extract_text_pdf(self, file_bytes: bytes) -> dict[str, Any]:
        primary_text = ""
        parse_warnings: list[str] = []
        try:
            import pdfplumber

            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                page_texts = [(page.extract_text() or "").strip() for page in pdf.pages]
            primary_text = "\n".join(part for part in page_texts if part)
        except Exception as exc:
            parse_warnings.append(self._format_warning("pdf_parse_error", str(exc)))
            return {
                "text": "",
                "ocr_used": False,
                "ocr_available": False,
                "ocr_error": self._truncate_error(f"Failed to read PDF text: {exc}"),
                "parse_warnings": parse_warnings,
            }

        if not self._should_trigger_ocr(primary_text):
            return {
                "text": primary_text,
                "ocr_used": False,
                "ocr_available": True,
                "ocr_error": None,
                "parse_warnings": parse_warnings,
            }

        ocr_result = self._extract_text_ocr(file_bytes)
        parse_warnings.extend(ocr_result["parse_warnings"])
        if ocr_result["text"].strip():
            return {
                "text": ocr_result["text"],
                "ocr_used": True,
                "ocr_available": ocr_result["available"],
                "ocr_error": ocr_result["error"],
                "parse_warnings": parse_warnings,
            }
        return {
            "text": primary_text,
            "ocr_used": False,
            "ocr_available": ocr_result["available"],
            "ocr_error": ocr_result["error"],
            "parse_warnings": parse_warnings,
        }

    def _should_trigger_ocr(self, text: str) -> bool:
        normalized = text.strip()
        if len(normalized) < PDF_SUSPICIOUS_TEXT_THRESHOLD:
            return True
        return PERCENTAGE_REGEX.search(normalized) is None

    def _extract_text_ocr(self, file_bytes: bytes) -> dict[str, Any]:
        parse_warnings: list[str] = []
        if shutil.which("tesseract") is None or shutil.which("pdftoppm") is None:
            message = "OCR dependencies not available (tesseract or poppler missing)"
            parse_warnings.append(self._format_warning("ocr_dependencies_missing", message))
            return {
                "text": "",
                "available": False,
                "error": message,
                "parse_warnings": parse_warnings,
            }
        try:
            from pdf2image import convert_from_bytes
            import pytesseract
        except ImportError as exc:
            parse_warnings.append(self._format_warning("ocr_import_error", str(exc)))
            return {
                "text": "",
                "available": False,
                "error": self._truncate_error(f"OCR package missing: {exc}"),
                "parse_warnings": parse_warnings,
            }

        try:
            images = convert_from_bytes(
                file_bytes,
                first_page=1,
                last_page=MAX_OCR_PAGES,
            )
            chunks = [pytesseract.image_to_string(image).strip() for image in images]
            return {
                "text": "\n".join(part for part in chunks if part),
                "available": True,
                "error": None,
                "parse_warnings": parse_warnings,
            }
        except Exception as exc:
            parse_warnings.append(self._format_warning("ocr_runtime_error", str(exc)))
            return {
                "text": "",
                "available": True,
                "error": self._truncate_error(f"OCR failed: {exc}"),
                "parse_warnings": parse_warnings,
            }

    def _detect_grading_section(self, full_text: str) -> dict[str, Any]:
        lines = self._bounded_lines(full_text)
        if not lines:
            return {"lines": []}

        best_score = 0
        best_index = 0
        for idx in range(len(lines)):
            start = max(0, idx - 3)
            end = min(len(lines), idx + 4)
            window = " ".join(lines[start:end]).lower()
            score = sum(window.count(keyword) for keyword in SECTION_KEYWORDS)
            if score > best_score:
                best_score = score
                best_index = idx

        if best_score == 0:
            return {"lines": lines[:120]}

        start = max(0, best_index - 20)
        end = min(len(lines), best_index + 60)
        return {"lines": lines[start:end]}

    def _extract_percentages(self, lines: list[str]) -> dict[str, Any]:
        entries: list[dict[str, Any]] = []
        for line_idx, line in enumerate(lines):
            for match in PERCENTAGE_REGEX.finditer(line):
                value = float(match.group(1))
                lowered_line = line.lower()
                entries.append(
                    {
                        "line_idx": line_idx,
                        "line": line,
                        "match_start": match.start(),
                        "value": value,
                        "is_bonus": bool("bonus" in lowered_line),
                        "is_penalty_context": any(
                            keyword in lowered_line for keyword in PENALTY_KEYWORDS
                        ),
                    }
                )

        filtered = [entry for entry in entries if not entry["is_penalty_context"]]
        return {
            "all_entries": entries,
            "filtered_entries": filtered,
            "filtered_count": len(filtered),
            "all_count": len(entries),
        }

    def _cluster_assessments(
        self,
        *,
        lines: list[str],
        percentage_entries: list[dict[str, Any]],
    ) -> dict[str, Any]:
        assessment_entries: list[dict[str, Any]] = []
        linked_percentages = 0
        orphan_percentages = 0
        linked_non_bonus_percentages = 0
        orphan_non_bonus_percentages = 0
        dropped_by_gating_count = 0
        policy_filtered_count = 0
        assessment_keyword_hits = 0

        for entry in percentage_entries:
            context_result = self._extract_name_from_context(
                lines=lines,
                line_idx=entry["line_idx"],
                match_start=entry["match_start"],
            )
            name = context_result["name"]
            candidate_line = context_result["candidate_line"]
            if not name:
                orphan_percentages += 1
                if not entry.get("is_bonus", False):
                    orphan_non_bonus_percentages += 1
                continue

            if not self._is_likely_assessment_line(candidate_line):
                dropped_by_gating_count += 1
                orphan_percentages += 1
                if not entry.get("is_bonus", False):
                    orphan_non_bonus_percentages += 1
                if self._has_policy_blacklist(candidate_line):
                    policy_filtered_count += 1
                continue

            linked_percentages += 1
            if not entry.get("is_bonus", False):
                linked_non_bonus_percentages += 1
            line = lines[entry["line_idx"]]
            rules = [pattern.search(line) for pattern in RULE_PATTERNS]
            matched_rule = next((item.group(0) for item in rules if item), None)
            normalized_name = self._normalize_assessment_name(name)
            accepted_by_keyword = self._has_assessment_keyword(name) or self._has_assessment_keyword(
                candidate_line
            )
            assessment_entries.append(
                {
                    "name": name,
                    "weight": entry["value"],
                    "is_bonus": entry["is_bonus"],
                    "children": [],
                    "rule": matched_rule,
                    "notes": None,
                    "line_idx": entry["line_idx"],
                    "normalized_name": normalized_name,
                    "accepted_by_keyword": accepted_by_keyword,
                }
            )
            if accepted_by_keyword:
                assessment_keyword_hits += 1

        return {
            "assessments": [
                ExtractionAssessment(
                    name=item["name"],
                    weight=item["weight"],
                    is_bonus=item["is_bonus"],
                    children=[],
                    rule=item["rule"],
                    notes=item["notes"],
                )
                for item in assessment_entries
            ],
            "assessment_entries": assessment_entries,
            "linked_percentages": linked_percentages,
            "orphan_percentages": orphan_percentages,
            "linked_non_bonus_percentages": linked_non_bonus_percentages,
            "orphan_non_bonus_percentages": orphan_non_bonus_percentages,
            "dropped_by_gating_count": dropped_by_gating_count,
            "policy_filtered_count": policy_filtered_count,
            "assessment_keyword_hits": assessment_keyword_hits,
        }

    def _extract_name_from_context(
        self,
        *,
        lines: list[str],
        line_idx: int,
        match_start: int,
    ) -> dict[str, str | None]:
        current_line = lines[line_idx]
        prefix = current_line[:match_start].strip(" -:\t")
        cleaned_prefix = self._clean_assessment_name(prefix)
        if cleaned_prefix:
            return {"name": cleaned_prefix, "candidate_line": current_line}

        for offset in (1, 2):
            previous_index = line_idx - offset
            if previous_index < 0:
                break
            previous_line = lines[previous_index].strip(" -:\t")
            candidate = self._clean_assessment_name(previous_line)
            if candidate:
                return {"name": candidate, "candidate_line": lines[previous_index]}

        return {"name": None, "candidate_line": current_line}

    def _clean_assessment_name(self, text: str) -> str | None:
        stripped = re.sub(r"\s+", " ", text).strip(" -:\t")
        stripped = PERCENTAGE_REGEX.sub("", stripped).strip(" -:\t")
        shortform_match = ASSESSMENT_SHORTFORM_REGEX.fullmatch(stripped.lower()) is not None
        if (len(stripped) < 3 and not shortform_match) or len(stripped) > 50:
            return None
        if sum(1 for char in stripped if char.isalpha()) < 2 and not shortform_match:
            return None
        return stripped

    def _normalize_assessment_name(self, name: str) -> str:
        return re.sub(r"\s+", " ", name.lower()).strip()

    def _extract_deadlines(
        self,
        *,
        lines: list[str],
        assessment_entries: list[dict[str, Any]],
        term: str | None,
    ) -> dict[str, Any]:
        term_window = self._parse_term_window(term)
        candidate_dates: list[dict[str, Any]] = []
        valid_date_count = 0

        for line_idx, line in enumerate(lines):
            raw_dates = [*MONTH_DATE_REGEX.findall(line), *NUMERIC_DATE_REGEX.findall(line)]
            if not raw_dates:
                continue
            for date_text in raw_dates:
                parsed = self._parse_date(date_text=date_text, term_window=term_window)
                if parsed is None:
                    continue
                valid_date_count += 1
                time_match = TIME_REGEX.search(line)
                candidate_dates.append(
                    {
                        "line_idx": line_idx,
                        "line": line,
                        "date": parsed,
                        "due_time": time_match.group(0) if time_match else None,
                    }
                )

        return self._attach_deadlines(
            candidate_dates=candidate_dates,
            assessment_entries=assessment_entries,
            term_window=term_window,
            valid_date_count=valid_date_count,
        )

    def _attach_deadlines(
        self,
        *,
        candidate_dates: list[dict[str, Any]],
        assessment_entries: list[dict[str, Any]],
        term_window: dict[str, date] | None,
        valid_date_count: int,
    ) -> dict[str, Any]:
        deadlines: list[ExtractionDeadline] = []
        attached_count = 0
        within_window_count = 0
        attached_non_bonus_count = 0
        within_window_non_bonus_count = 0
        seen: set[tuple[str, str, str | None]] = set()
        now = datetime.now(UTC).date()

        for candidate in candidate_dates:
            matched_assessment = self._match_deadline_to_assessment(
                line_idx=candidate["line_idx"],
                line=candidate["line"],
                assessment_entries=assessment_entries,
            )
            if matched_assessment is None:
                continue
            attached_count += 1
            if not matched_assessment.get("is_bonus", False):
                attached_non_bonus_count += 1

            deadline_date: date = candidate["date"]
            if term_window is not None:
                if not (term_window["start"] <= deadline_date <= term_window["end"]):
                    continue
                within_window_count += 1
                if not matched_assessment.get("is_bonus", False):
                    within_window_non_bonus_count += 1
            else:
                if deadline_date.year < now.year - 1 or deadline_date.year > now.year + 1:
                    continue
                within_window_count += 1
                if not matched_assessment.get("is_bonus", False):
                    within_window_non_bonus_count += 1

            due_time = candidate["due_time"]
            dedupe_key = (
                matched_assessment["name"],
                deadline_date.isoformat(),
                due_time,
            )
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            deadlines.append(
                ExtractionDeadline(
                    title=matched_assessment["name"],
                    due_date=deadline_date.isoformat(),
                    due_time=due_time,
                    source="outline",
                    notes=None,
                )
            )

        return {
            "deadlines": deadlines,
            "valid_date_count": valid_date_count,
            "attached_count": attached_count,
            "within_window_count": within_window_count,
            "attached_non_bonus_count": attached_non_bonus_count,
            "within_window_non_bonus_count": within_window_non_bonus_count,
        }

    def _match_deadline_to_assessment(
        self,
        *,
        line_idx: int,
        line: str,
        assessment_entries: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        lowered_line = line.lower()
        for assessment in assessment_entries:
            if assessment["name"].lower() in lowered_line:
                return assessment

        nearest: dict[str, Any] | None = None
        nearest_distance = 4
        for assessment in assessment_entries:
            distance = abs(assessment["line_idx"] - line_idx)
            if distance <= 3 and distance < nearest_distance:
                nearest = assessment
                nearest_distance = distance
        return nearest

    def _parse_date(self, *, date_text: str, term_window: dict[str, date] | None) -> date | None:
        has_explicit_year = bool(re.search(r"\b\d{4}\b", date_text)) or bool(
            re.search(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b", date_text)
        )

        if not has_explicit_year:
            if term_window is None:
                return None
            date_text = f"{date_text} {term_window['year']}"

        try:
            from dateutil import parser as date_parser
        except ImportError:
            return self._parse_date_with_strptime(date_text)

        try:
            parsed_datetime = date_parser.parse(date_text, fuzzy=False, dayfirst=False)
            return parsed_datetime.date()
        except (ValueError, OverflowError):
            return self._parse_date_with_strptime(date_text)

    def _parse_date_with_strptime(self, date_text: str) -> date | None:
        formats = (
            "%B %d %Y",
            "%b %d %Y",
            "%B %d, %Y",
            "%b %d, %Y",
            "%Y-%m-%d",
            "%m/%d/%Y",
            "%m/%d/%y",
            "%d/%m/%Y",
            "%d/%m/%y",
        )
        for fmt in formats:
            try:
                return datetime.strptime(date_text, fmt).date()
            except ValueError:
                continue
        return None

    def _parse_term_window(self, term: str | None) -> dict[str, date] | None:
        if term is None:
            return None

        match = TERM_REGEX.match(term)
        if not match:
            return None

        season = match.group(1).upper()
        year_raw = match.group(2)
        year = int(year_raw)
        if len(year_raw) == 2:
            year += 2000

        if season == "W":
            return {"year": year, "start": date(year, 1, 1), "end": date(year, 4, 30)}
        if season == "S":
            return {"year": year, "start": date(year, 5, 1), "end": date(year, 8, 31)}
        return {"year": year, "start": date(year, 9, 1), "end": date(year, 12, 31)}

    def _validate_structure(self, *, assessment_entries: list[dict[str, Any]]) -> dict[str, Any]:
        if not assessment_entries:
            return {
                "valid": False,
                "reason": "No assessments could be extracted",
                "reason_code": "no_assessments",
                "sum_non_bonus": Decimal("0"),
                "has_duplicate_names": False,
                "has_invalid_weights": False,
                "has_invalid_names": False,
                "warnings": [],
            }

        normalized_names: list[str] = []
        has_invalid_names = False

        has_invalid_weights = False
        sum_non_bonus = Decimal("0.00")
        non_bonus_count = 0
        quantize_scale = Decimal("0.01")
        warnings: list[str] = []

        for entry in assessment_entries:
            raw_name = entry.get("name")
            if not isinstance(raw_name, str) or not raw_name.strip():
                has_invalid_names = True
                normalized_name = ""
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

        name_counts = Counter(normalized_names)
        has_duplicate_names = any(count > 1 for count in name_counts.values())

        if non_bonus_count == 0:
            return {
                "valid": False,
                "reason": "Bonus-only assessment structures are invalid",
                "reason_code": "bonus_only_structure",
                "sum_non_bonus": sum_non_bonus,
                "has_duplicate_names": has_duplicate_names,
                "has_invalid_weights": has_invalid_weights,
                "has_invalid_names": has_invalid_names,
                "warnings": warnings,
            }

        if has_invalid_names:
            return {
                "valid": False,
                "reason": "Assessment names must be non-empty",
                "reason_code": "invalid_assessment_names",
                "sum_non_bonus": sum_non_bonus,
                "has_duplicate_names": has_duplicate_names,
                "has_invalid_weights": has_invalid_weights,
                "has_invalid_names": has_invalid_names,
                "warnings": warnings,
            }

        if has_duplicate_names:
            return {
                "valid": False,
                "reason": "Duplicate assessment names detected",
                "reason_code": "duplicate_assessment_names",
                "sum_non_bonus": sum_non_bonus,
                "has_duplicate_names": has_duplicate_names,
                "has_invalid_weights": has_invalid_weights,
                "has_invalid_names": has_invalid_names,
                "warnings": warnings,
            }

        if has_invalid_weights:
            return {
                "valid": False,
                "reason": "Assessment weights contain invalid values",
                "reason_code": "invalid_weight_values",
                "sum_non_bonus": sum_non_bonus,
                "has_duplicate_names": has_duplicate_names,
                "has_invalid_weights": has_invalid_weights,
                "has_invalid_names": has_invalid_names,
                "warnings": warnings,
            }

        if abs(sum_non_bonus - Decimal("100.00")) > Decimal("0.01"):
            return {
                "valid": False,
                "reason": "Weight sum does not equal 100",
                "reason_code": "weight_sum_not_100",
                "sum_non_bonus": sum_non_bonus,
                "has_duplicate_names": has_duplicate_names,
                "has_invalid_weights": has_invalid_weights,
                "has_invalid_names": has_invalid_names,
                "warnings": warnings,
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
        }

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
    ) -> ExtractionResponse:
        return ExtractionResponse(
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

    def _extract_partial_from_text(self, *, full_text: str, term: str | None) -> dict[str, Any]:
        section = self._detect_grading_section(full_text)
        lines = section.get("lines", [])
        if not lines:
            lines = self._bounded_lines(full_text)
        percentage_result = self._extract_percentages(lines)
        cluster_result = self._cluster_assessments(
            lines=lines,
            percentage_entries=percentage_result["filtered_entries"],
        )
        deadline_result = self._extract_deadlines(
            lines=lines,
            assessment_entries=cluster_result["assessment_entries"],
            term=term,
        )
        return {
            "assessments": cluster_result["assessments"],
            "assessment_entries": cluster_result["assessment_entries"],
            "deadlines": deadline_result["deadlines"],
        }

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

    def _bounded_lines(self, text: str) -> list[str]:
        bounded_text = text[:MAX_TEXT_CHARS]
        lines = [line.strip() for line in bounded_text.splitlines() if line.strip()]
        return lines[:MAX_SCAN_LINES]

    def _has_repeated_garbage_lines(self, lines: list[str]) -> bool:
        normalized = [
            re.sub(r"[^a-z0-9]", "", line.lower())
            for line in lines
            if len(line.strip()) >= 3
        ]
        repeated = Counter(normalized)
        return any(count > 3 and len(value) < 12 for value, count in repeated.items())

    def _to_decimal(self, value: Any) -> Decimal:
        try:
            return Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError):
            return Decimal("-1")

    def _truncate_error(self, message: str, *, max_len: int = 180) -> str:
        normalized = re.sub(r"\s+", " ", message).strip()
        if len(normalized) <= max_len:
            return normalized
        return f"{normalized[: max_len - 3]}..."

    def _format_warning(self, code: str, message: str) -> str:
        return f"{code}:{self._truncate_error(message)}"

    def _has_assessment_keyword(self, text: str) -> bool:
        lowered = text.lower()
        whitelist_hit = any(
            re.search(rf"\b{re.escape(keyword)}\b", lowered)
            for keyword in ASSESSMENT_WHITELIST_KEYWORDS
        )
        shortform_hit = ASSESSMENT_SHORTFORM_REGEX.search(lowered) is not None
        return whitelist_hit or shortform_hit

    def _has_policy_blacklist(self, line_text: str) -> bool:
        lowered = line_text.lower()
        if any(phrase in lowered for phrase in POLICY_BLACKLIST_PHRASES):
            return True

        tokens = re.findall(r"[a-z]+", lowered)
        attendance_positions = [idx for idx, token in enumerate(tokens) if token == "attendance"]
        policy_required_positions = [
            idx for idx, token in enumerate(tokens) if token in {"policy", "required"}
        ]
        return any(
            abs(attendance_idx - policy_idx) <= 4
            for attendance_idx in attendance_positions
            for policy_idx in policy_required_positions
        )

    def _contains_exam_term(self, line_text: str) -> bool:
        lowered = line_text.lower()
        return any(re.search(rf"\b{term}\b", lowered) for term in EXAM_TERMS)

    def _is_exam_assessment_shaped(self, line_text: str) -> bool:
        lowered = PERCENTAGE_REGEX.sub(" ", line_text.lower())
        normalized = re.sub(r"\s+", " ", lowered).strip()
        tokens = TOKEN_REGEX.findall(normalized)
        if not tokens or len(tokens) > 8:
            return False

        if any(term in normalized for term in EXAM_ADMIN_VERBS):
            return False
        if any(term in normalized for term in EXAM_ADMIN_NOUNS):
            return False

        return tokens[0] in EXAM_ACCEPTED_START_TOKENS

    def _is_likely_assessment_line(self, line_text: str) -> bool:
        if self._has_policy_blacklist(line_text):
            return False
        if not self._has_assessment_keyword(line_text):
            return False
        if self._contains_exam_term(line_text):
            return self._is_exam_assessment_shaped(line_text)
        return True
