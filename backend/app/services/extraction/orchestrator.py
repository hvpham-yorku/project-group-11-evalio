from __future__ import annotations

import os
import time
from concurrent.futures import Future, ThreadPoolExecutor
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from app.models import CourseCreate
from app.models_extraction import (
    ExtractionAssessment,
    ExtractionDiagnostics,
    ExtractionResponse,
    OutlineExtractionRequest,
)
from app.services.extraction.course_code import (
    extract_course_code,
    extract_course_code_from_filename,
)
from app.services.extraction.deterministic import DeterministicMixin
from app.services.extraction.diagnostics import DiagnosticsMixin
from app.services.extraction.heuristics import HeuristicsMixin
from app.services.extraction.mapping import map_extraction_to_course_create
from app.services.extraction.normalize import NormalizeMixin
from app.services.extraction.text_ingest import TextIngestMixin
from app.services.extraction.validate import ValidateMixin
from app.services.grading_section_filter import GradingSectionFilter
from app.services.llm_extraction_client import LlmExtractionClient, LlmExtractionError


class ExtractionService(
    TextIngestMixin,
    NormalizeMixin,
    DeterministicMixin,
    ValidateMixin,
    DiagnosticsMixin,
    HeuristicsMixin,
):
    def __init__(self, *, llm_client: LlmExtractionClient | None = None):
        self._llm_client = llm_client or LlmExtractionClient()
        self._grading_filter = GradingSectionFilter()

    def extract(
        self,
        *,
        filename: str,
        content_type: str,
        file_bytes: bytes,
        term: str | None = None,
    ) -> ExtractionResponse:
        debug_enabled = bool(os.getenv("FILTER_DEBUG"))
        start_total = time.perf_counter()
        print("[UPLOAD_FILENAME]")
        print(f"filename={filename}")
        text_result = self._extract_text(
            filename=filename,
            content_type=content_type,
            file_bytes=file_bytes,
        )
        full_text = text_result["text"]
        print("FULL_TEXT_LEN:", len(full_text))
        print("FULL_TEXT_APPROX_TOKENS:", len(full_text) / 4)
        if not full_text.strip():
            end_total = time.perf_counter()
            print("TOTAL_EXTRACTION_SECONDS:", round(end_total - start_total, 3))
            if debug_enabled:
                print("[FINAL_EXTRACTION_RESULT] assessments=0 deadlines=0 structure_valid=False")
            return self._failure_response(
                text_result=text_result,
                failure_reason="No text could be extracted from the file",
                trigger_reasons=["no_extracted_text"],
                course_code=None,
            )
        filename_course_code = extract_course_code_from_filename(filename)
        print("[FILENAME_COURSE_CODE_DETECTION]")
        print(f"filename={filename}")
        print(f"detected_course_code={filename_course_code}")
        course_code_executor: ThreadPoolExecutor | None = None
        course_code_future: Future[str | None] | None = None
        resolved_course_code: dict[str, str | None | bool] = {
            "value": filename_course_code,
            "done": filename_course_code is not None,
        }
        if filename_course_code is None:
            print("fallback=text_extraction")
            print("[COURSE_CODE_FALLBACK]")
            print("course_code_source=text")
            course_code_executor = ThreadPoolExecutor(max_workers=1)
            course_code_future = course_code_executor.submit(
                extract_course_code,
                full_text,
            )
        else:
            print("[FILENAME_COURSE_CODE_SELECTED]")
            print("course_code_source=filename")
            print(f"course_code={filename_course_code}")

        def _resolve_course_code() -> str | None:
            if bool(resolved_course_code["done"]):
                return resolved_course_code["value"] if isinstance(resolved_course_code["value"], str) else None
            if course_code_future is None:
                return None
            try:
                resolved_course_code["value"] = course_code_future.result()
            except Exception:
                resolved_course_code["value"] = None
            finally:
                resolved_course_code["done"] = True
                if course_code_executor is not None:
                    course_code_executor.shutdown(wait=False)
            return resolved_course_code["value"] if isinstance(resolved_course_code["value"], str) else None
        llm_input_text, filtered_used = self._grading_filter.filter(full_text)
        print("FILTERED_TEXT_LEN:", len(llm_input_text))
        print("FILTERED_TEXT_APPROX_TOKENS:", len(llm_input_text) / 4)
        print("FILTER_USED:", filtered_used)
        filtered_warning = f"filtered_text_used:{str(filtered_used).lower()}"
        retry_warning: str | None = None

        def _sum_non_bonus_weights(assessments: list[ExtractionAssessment]) -> Decimal:
            total = Decimal("0.00")
            for assessment in assessments:
                if assessment.is_bonus:
                    continue
                total += Decimal(str(assessment.weight))
            return total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        try:
            start_llm = time.perf_counter()
            llm_payload = self._llm_client.extract(llm_input_text)
            end_llm = time.perf_counter()
            print("LLM_DURATION_SECONDS:", round(end_llm - start_llm, 3))
        except LlmExtractionError as exc:
            end_total = time.perf_counter()
            print("TOTAL_EXTRACTION_SECONDS:", round(end_total - start_total, 3))
            if debug_enabled:
                print(f"[GPT_ERROR] reason={exc.reason_code} message={exc.message}")
            if debug_enabled:
                print("[FINAL_EXTRACTION_RESULT] assessments=0 deadlines=0 structure_valid=False")
            return self._failure_response(
                text_result=text_result,
                failure_reason=exc.reason_code,
                trigger_reasons=[exc.reason_code],
                extra_warnings=[filtered_warning],
                method="llm",
                course_code=_resolve_course_code(),
            )
        except Exception as exc:  # pragma: no cover - defensive fallback
            end_total = time.perf_counter()
            print("TOTAL_EXTRACTION_SECONDS:", round(end_total - start_total, 3))
            if debug_enabled:
                print("[FINAL_EXTRACTION_RESULT] assessments=0 deadlines=0 structure_valid=False")
            return self._failure_response(
                text_result=text_result,
                failure_reason=f"LLM extraction failed unexpectedly: {exc}",
                trigger_reasons=["llm_unexpected_failure"],
                extra_warnings=[filtered_warning],
                method="llm",
                course_code=_resolve_course_code(),
            )

        try:
            normalized = self._normalize_llm_payload(llm_payload)
            if debug_enabled:
                first_assessment = normalized["assessments"][0].model_dump() if normalized["assessments"] else None
                print(
                    f"[POST_GPT_NORMALIZED] assessments={len(normalized['assessments'])} "
                    f"first_assessment={first_assessment}"
                )
        except ValueError as exc:
            end_total = time.perf_counter()
            print("TOTAL_EXTRACTION_SECONDS:", round(end_total - start_total, 3))
            if debug_enabled:
                print("[FINAL_EXTRACTION_RESULT] assessments=0 deadlines=0 structure_valid=False")
            return self._failure_response(
                text_result=text_result,
                failure_reason=str(exc),
                trigger_reasons=["llm_invalid_schema"],
                extra_warnings=[filtered_warning],
                method="llm",
                course_code=_resolve_course_code(),
            )

        validation_result = self._validate_structure(
            assessment_entries=normalized["assessment_entries"]
        )
        filtered_weight_sum = _sum_non_bonus_weights(normalized["assessments"])
        retry_used = False
        if filtered_weight_sum < Decimal("60.00") and not retry_used:
            retry_used = True
            retry_warning = "full_text_retry_attempted:true"
            if debug_enabled:
                print(
                    f"[FULL_TEXT_RETRY] filtered_weight_sum={filtered_weight_sum} "
                    "retrying_llm_with_full_text=true"
                )
            try:
                retry_start = time.perf_counter()
                retry_payload = self._llm_client.extract(full_text)
                retry_end = time.perf_counter()
                print("LLM_RETRY_DURATION_SECONDS:", round(retry_end - retry_start, 3))
                retry_normalized = self._normalize_llm_payload(retry_payload)
                retry_validation_result = self._validate_structure(
                    assessment_entries=retry_normalized["assessment_entries"]
                )
                retry_weight_sum = _sum_non_bonus_weights(retry_normalized["assessments"])
                filtered_distance = abs(filtered_weight_sum - Decimal("100.00"))
                full_distance = abs(retry_weight_sum - Decimal("100.00"))
                if debug_enabled:
                    print(
                        f"[FULL_TEXT_RETRY_COMPARE] filtered_distance={filtered_distance} "
                        f"full_distance={full_distance}"
                    )
                if full_distance < filtered_distance:
                    normalized = retry_normalized
                    validation_result = retry_validation_result
                    if debug_enabled:
                        print("[FULL_TEXT_RETRY_SELECTED] source=full_text_retry")
            except LlmExtractionError as exc:
                retry_warning = f"full_text_retry_failed:{exc.reason_code}"
                if debug_enabled:
                    print(f"[FULL_TEXT_RETRY_ERROR] reason={exc.reason_code} message={exc.message}")
            except ValueError as exc:
                retry_warning = self._format_warning("full_text_retry_invalid_schema", str(exc))
                if debug_enabled:
                    print(f"[FULL_TEXT_RETRY_SCHEMA_ERROR] message={exc}")
            except Exception as exc:  # pragma: no cover - defensive fallback
                retry_warning = self._format_warning("full_text_retry_unexpected_failure", str(exc))
                if debug_enabled:
                    print(f"[FULL_TEXT_RETRY_UNEXPECTED_ERROR] message={exc}")

        confidence_result = self._compute_confidence_from_llm(
            assessment_entries=normalized["assessment_entries"],
            deadlines=normalized["deadlines"],
            validation_result=validation_result,
        )
        source_warnings = [filtered_warning]
        if retry_warning:
            source_warnings.append(retry_warning)
        parse_warnings = self._merge_parse_warnings(
            text_result.get("parse_warnings", []),
            normalized.get("parse_warnings", []),
            validation_result.get("warnings", []),
            source_warnings,
        )
        if confidence_result["confidence_score"] < 60:
            parse_warnings = self._merge_parse_warnings(parse_warnings, ["low_confidence"])
        trigger_result = self._compute_trigger_flags(
            sum_non_bonus=validation_result["sum_non_bonus"],
            confidence_score=confidence_result["confidence_score"],
            structure_valid=validation_result["valid"],
            reason_code=validation_result["reason_code"],
        )
        if debug_enabled:
            print(
                f"[DETERMINISTIC_RESULT] assessments={len(normalized['assessment_entries'])} "
                f"structure_valid={validation_result['valid']} "
                f"trigger_gpt={trigger_result['trigger_gpt']} "
                f"trigger_reasons={trigger_result['trigger_reasons']}"
            )
            if trigger_result["trigger_gpt"]:
                print(f"[GPT_TRIGGERED] trigger_reasons={trigger_result['trigger_reasons']}")

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
            end_total = time.perf_counter()
            print("TOTAL_EXTRACTION_SECONDS:", round(end_total - start_total, 3))
            if debug_enabled:
                print(
                    f"[FINAL_EXTRACTION_RESULT] assessments={len(normalized['assessments'])} "
                    f"deadlines={len(normalized['deadlines'])} structure_valid=False"
                )
            return self._build_validation_failure_response(
                diagnostics=diagnostics,
                course_code=_resolve_course_code(),
            )

        end_total = time.perf_counter()
        print("TOTAL_EXTRACTION_SECONDS:", round(end_total - start_total, 3))
        if debug_enabled:
            print(
                f"[FINAL_EXTRACTION_RESULT] assessments={len(normalized['assessments'])} "
                f"deadlines={len(normalized['deadlines'])} structure_valid=True"
            )
        return ExtractionResponse(
            course_code=_resolve_course_code(),
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

    def map_extraction_to_course_create(self, extraction_result: Any) -> CourseCreate:
        return map_extraction_to_course_create(extraction_result)
