from __future__ import annotations

import json
import os
from typing import Any


class _CompatResponsesAPI:
    def __init__(self, client: Any):
        self._client = client

    def create(
        self,
        *,
        model: str,
        input: list[dict[str, Any]],
        temperature: float | None = None,
        response_format: dict[str, Any] | None = None,
        max_output_tokens: int | None = None,
    ) -> Any:
        messages = _convert_responses_input_to_chat_messages(input)
        kwargs: dict[str, Any] = {}
        if temperature is not None:
            kwargs["temperature"] = temperature
        if response_format is not None:
            kwargs["response_format"] = response_format
        if max_output_tokens is not None:
            kwargs["max_completion_tokens"] = max_output_tokens
        completion = self._client.chat.completions.create(
            model=model,
            messages=messages,
            **kwargs,
        )
        content = _extract_chat_completion_content(completion)
        return _CompatResponse(content)


class _CompatResponse:
    def __init__(self, output_text: str):
        self.output_text = output_text


def _convert_responses_input_to_chat_messages(input_items: list[dict[str, Any]]) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    for item in input_items:
        role = item.get("role")
        content = item.get("content")
        if role not in {"system", "user", "assistant"}:
            continue
        if isinstance(content, str):
            content_text = content
        elif isinstance(content, list):
            content_text = " ".join(
                str(part.get("text", "")).strip()
                for part in content
                if isinstance(part, dict)
            ).strip()
        else:
            content_text = str(content or "")
        messages.append({"role": role, "content": content_text})
    return messages


def _extract_chat_completion_content(completion: Any) -> str:
    choices = getattr(completion, "choices", None)
    if not isinstance(choices, list) or not choices:
        return ""
    first_choice = choices[0]
    message = getattr(first_choice, "message", None)
    if message is None:
        return ""
    content = getattr(message, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        collected: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    collected.append(text)
        return "\n".join(part for part in collected if part)
    return ""


class LlmExtractionError(RuntimeError):
    def __init__(self, reason_code: str, message: str):
        super().__init__(message)
        self.reason_code = reason_code
        self.message = message


HIERARCHICAL_EXTRACTION_RESPONSE_FORMAT: dict[str, Any] = {
    "type": "json_schema",
    "json_schema": {
        "name": "course_outline_hierarchical_extraction",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["assessments", "deadlines"],
            "properties": {
                "assessments": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": [
                            "name",
                            "weight",
                            "is_bonus",
                            "rule",
                            "children",
                            "total_count",
                            "effective_count",
                            "unit_weight",
                            "rule_type",
                        ],
                        "properties": {
                            "name": {"type": "string"},
                            "weight": {"anyOf": [{"type": "number"}, {"type": "string"}]},
                            "is_bonus": {"type": "boolean"},
                            "rule": {"type": ["string", "null"]},
                            "total_count": {"type": ["number", "null"]},
                            "effective_count": {"type": ["number", "null"]},
                            "unit_weight": {"type": ["number", "null"]},
                            "rule_type": {
                                "type": ["string", "null"],
                                "enum": ["pure_multiplicative", "best_of", None],
                            },
                            "children": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "required": [
                                        "name",
                                        "weight",
                                        "is_bonus",
                                        "rule",
                                        "children",
                                        "total_count",
                                        "effective_count",
                                        "unit_weight",
                                        "rule_type",
                                    ],
                                    "properties": {
                                        "name": {"type": "string"},
                                        "weight": {"anyOf": [{"type": "number"}, {"type": "string"}]},
                                        "is_bonus": {"type": "boolean"},
                                        "rule": {"type": ["string", "null"]},
                                        "total_count": {"type": ["number", "null"]},
                                        "effective_count": {"type": ["number", "null"]},
                                        "unit_weight": {"type": ["number", "null"]},
                                        "rule_type": {
                                            "type": ["string", "null"],
                                            "enum": ["pure_multiplicative", "best_of", None],
                                        },
                                        "children": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "additionalProperties": False,
                                                "required": [],
                                                "properties": {},
                                            },
                                            "maxItems": 0,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                "deadlines": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["title", "due_date", "due_time"],
                        "properties": {
                            "title": {"type": "string"},
                            "due_date": {"type": ["string", "null"]},
                            "due_time": {"type": ["string", "null"]},
                        },
                    },
                },
            },
        },
    },
}


class LlmExtractionClient:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        timeout_seconds: float | None = None,
        client: Any | None = None,
    ):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model or os.getenv("OPENAI_MODEL", "gpt-5-mini")
        raw_timeout = os.getenv("OPENAI_TIMEOUT_SECONDS")
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else (
            float(raw_timeout) if raw_timeout is not None else 20.0
        )
        self._client = client

    def _get_client(self) -> Any:
        if self._client is not None:
            if not hasattr(self._client, "responses") and hasattr(self._client, "chat"):
                self._client.responses = _CompatResponsesAPI(self._client)
            return self._client
        if not self.api_key:
            raise LlmExtractionError("llm_api_key_missing", "OPENAI_API_KEY is not configured")
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise LlmExtractionError("llm_sdk_missing", f"OpenAI SDK is not available: {exc}") from exc
        self._client = OpenAI(api_key=self.api_key, timeout=self.timeout_seconds)
        if not hasattr(self._client, "responses"):
            self._client.responses = _CompatResponsesAPI(self._client)
        return self._client

    def extract(self, text: str) -> dict[str, Any]:
        if not text.strip():
            raise LlmExtractionError("llm_empty_input", "LLM extraction input text is empty")

        client = self._get_client()
        if os.getenv("FILTER_DEBUG"):
            print(
                f"[GPT_CALL_START] model={self.model} "
                f"filtered_text_len={len(text)} approx_tokens={int(len(text) / 4)}"
            )
        system_prompt = (
            "Extract grading components that directly contribute to the final grade.\n\n"
            "INCLUSION RULE:\n"
            "- Include only items that explicitly display a numeric weight (percentage or marks).\n"
            "- Do not include items without an explicit numeric weight.\n\n"
            "DEADLINES:\n"
            "- Extract deadline entries for graded assessments when an explicit date is present.\n"
            "- A deadline can come from words like due, due date, exam date, test date, submission date.\n"
            "- Use the assessment label as title when possible.\n"
            "- Set due_date to a normalized date string when present, else null.\n"
            "- Set due_time only when an explicit time appears, else null.\n"
            "- If a line has dates but no graded assessment context, do not create a deadline.\n\n"
            "STRUCTURE:\n"
            "- Maximum depth 2: top-level assessments and optional children.\n"
            "- Every object must include a 'children' field.\n"
            "- Child objects must have 'children': [].\n"
            "- Do not create hierarchy unless explicitly indicated in text.\n"
            "- Do not assume equal splits.\n\n"
            "MULTIPLICATIVE METADATA:\n"
            "- Extract total_count only if a total number of items is explicitly written.\n"
            "- Extract unit_weight only if a per-item weight is explicitly written.\n"
            "- Extract effective_count only if text explicitly states that only some items count.\n"
            "- Set rule_type = 'pure_multiplicative' only if all items count and per-item weight is explicit.\n"
            "- Set rule_type = 'best_of' only if text explicitly states drop-lowest, best-of, or subset counting.\n"
            "- If multiplicative structure is not explicitly stated, set total_count, effective_count, "
            "unit_weight, and rule_type to null.\n"
            "- Do NOT compute, divide, infer, or derive values.\n"
            "- Only extract multiplicative metadata if the arithmetic explicitly matches the total weight written in the text.\n\n"
            "EXCLUSIONS:\n"
            "- Ignore attendance policies, academic integrity, formatting instructions, "
            "administrative notes, and non-graded activities.\n"
            "- Ignore schedule text that has no specific date tied to a graded assessment.\n\n"
            "FAIL-SAFE:\n"
            "- If grading structure cannot be clearly determined, return "
            "{\"assessments\": [], \"deadlines\": []}.\n\n"
            "Return ONLY valid JSON.\n"
            "No markdown.\n"
            "No commentary.\n"
        )
        user_prompt = f"Course outline text:\n{text}"

        try:
            response = client.responses.create(
                model=self.model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0,
                response_format=HIERARCHICAL_EXTRACTION_RESPONSE_FORMAT,
                max_output_tokens=1000,
            )
        except Exception as exc:
            if os.getenv("FILTER_DEBUG"):
                print(f"[GPT_CALL_ERROR] attempt=1 error={exc!r}")
            if self._is_unsupported_temperature_exception(exc):
                if os.getenv("FILTER_DEBUG"):
                    print("[GPT_CALL_RETRY] attempt=1 mode=without_temperature")
                try:
                    response = client.responses.create(
                        model=self.model,
                        input=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        response_format=HIERARCHICAL_EXTRACTION_RESPONSE_FORMAT,
                        max_output_tokens=1000,
                    )
                except Exception as fallback_exc:
                    if os.getenv("FILTER_DEBUG"):
                        print(f"[GPT_CALL_ERROR] attempt=1_fallback error={fallback_exc!r}")
                    if self._is_timeout_exception(fallback_exc):
                        raise LlmExtractionError(
                            "llm_timeout",
                            f"LLM request timed out after {self.timeout_seconds:.0f}s",
                        ) from fallback_exc
                    raise LlmExtractionError("llm_call_failed", f"LLM request failed: {fallback_exc}") from fallback_exc
            else:
                if self._is_timeout_exception(exc):
                    raise LlmExtractionError(
                        "llm_timeout",
                        f"LLM request timed out after {self.timeout_seconds:.0f}s",
                    ) from exc
                raise LlmExtractionError("llm_call_failed", f"LLM request failed: {exc}") from exc

        raw_text = self._extract_output_text(response)
        if os.getenv("FILTER_DEBUG"):
            print(f"[GPT_RAW_RESPONSE] attempt=1 raw={raw_text[:1000]!r}")
        try:
            payload = json.loads(raw_text)
            if os.getenv("FILTER_DEBUG"):
                print("[GPT_RAW_RESPONSE] attempt=1 json_parse=success")
                self._log_payload_counts(payload, attempt=1)
        except json.JSONDecodeError:
            if os.getenv("FILTER_DEBUG"):
                print("[GPT_RAW_RESPONSE] attempt=1 json_parse=failure")
                print("[GPT_JSON_PARSE_ERROR] attempt=1")
            retry_system_prompt = (
                system_prompt
                + "\nYour previous response was not valid JSON. Return ONLY valid JSON. "
                "No markdown. No commentary."
            )
            try:
                retry_response = client.responses.create(
                    model=self.model,
                    input=[
                        {"role": "system", "content": retry_system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0,
                    response_format=HIERARCHICAL_EXTRACTION_RESPONSE_FORMAT,
                    max_output_tokens=1000,
                )
            except Exception as retry_exc:
                if os.getenv("FILTER_DEBUG"):
                    print(f"[GPT_CALL_ERROR] attempt=2 error={retry_exc!r}")
                if self._is_unsupported_temperature_exception(retry_exc):
                    if os.getenv("FILTER_DEBUG"):
                        print("[GPT_CALL_RETRY] attempt=2 mode=without_temperature")
                    try:
                        retry_response = client.responses.create(
                            model=self.model,
                            input=[
                                {"role": "system", "content": retry_system_prompt},
                                {"role": "user", "content": user_prompt},
                            ],
                            response_format=HIERARCHICAL_EXTRACTION_RESPONSE_FORMAT,
                            max_output_tokens=1000,
                        )
                    except Exception as retry_fallback_exc:
                        if os.getenv("FILTER_DEBUG"):
                            print(
                                f"[GPT_CALL_ERROR] attempt=2_fallback error={retry_fallback_exc!r}"
                            )
                        if self._is_timeout_exception(retry_fallback_exc):
                            raise LlmExtractionError(
                                "llm_timeout",
                                f"LLM request timed out after {self.timeout_seconds:.0f}s",
                            ) from retry_fallback_exc
                        raise LlmExtractionError(
                            "llm_call_failed",
                            f"LLM request failed: {retry_fallback_exc}",
                        ) from retry_fallback_exc
                else:
                    if self._is_timeout_exception(retry_exc):
                        raise LlmExtractionError(
                            "llm_timeout",
                            f"LLM request timed out after {self.timeout_seconds:.0f}s",
                        ) from retry_exc
                    raise LlmExtractionError(
                        "llm_call_failed",
                        f"LLM request failed: {retry_exc}",
                    ) from retry_exc

            retry_raw_text = self._extract_output_text(retry_response)
            if os.getenv("FILTER_DEBUG"):
                print(f"[GPT_RAW_RESPONSE] attempt=2 raw={retry_raw_text[:1000]!r}")
            try:
                payload = json.loads(retry_raw_text)
                if os.getenv("FILTER_DEBUG"):
                    print("[GPT_RAW_RESPONSE] attempt=2 json_parse=success")
                    self._log_payload_counts(payload, attempt=2)
            except json.JSONDecodeError as retry_parse_exc:
                if os.getenv("FILTER_DEBUG"):
                    print("[GPT_RAW_RESPONSE] attempt=2 json_parse=failure")
                    print("[GPT_JSON_PARSE_ERROR] attempt=2")
                raise LlmExtractionError(
                    "llm_invalid_json",
                    f"LLM returned invalid JSON: {retry_parse_exc}",
                ) from retry_parse_exc
        if not isinstance(payload, dict):
            raise LlmExtractionError("llm_invalid_schema", "LLM JSON root must be an object")
        return payload

    def _log_payload_counts(self, payload: Any, *, attempt: int) -> None:
        if not isinstance(payload, dict):
            print(f"[GPT_PARSED_COUNTS] attempt={attempt} root_type={type(payload).__name__}")
            return

        assessments = payload.get("assessments")
        deadlines = payload.get("deadlines")
        assessments_count = len(assessments) if isinstance(assessments, list) else "invalid"
        deadlines_count = len(deadlines) if isinstance(deadlines, list) else "invalid"
        print(
            f"[GPT_PARSED_COUNTS] attempt={attempt} "
            f"assessments_count={assessments_count} deadlines_count={deadlines_count}"
        )
        if isinstance(deadlines, list):
            for idx, item in enumerate(deadlines[:10], start=1):
                print(f"[GPT_PARSED_DEADLINE] attempt={attempt} index={idx} value={item}")

    def _is_timeout_exception(self, exc: Exception) -> bool:
        current: BaseException | None = exc
        visited: set[int] = set()
        while current is not None and id(current) not in visited:
            visited.add(id(current))
            class_name = current.__class__.__name__.lower()
            message = str(current).lower()
            if "timeout" in class_name or "timed out" in message:
                return True
            current = current.__cause__ or current.__context__
        return False

    def _is_unsupported_temperature_exception(self, exc: Exception) -> bool:
        message = str(exc).lower()
        return "temperature" in message and (
            "unsupported value" in message or "not supported" in message
        )

    def _extract_output_text(self, response: Any) -> str:
        output_text = getattr(response, "output_text", None)
        if isinstance(output_text, str) and output_text.strip():
            return output_text.strip()

        output_items = getattr(response, "output", None)
        if isinstance(output_items, list):
            collected: list[str] = []
            for item in output_items:
                content_items = getattr(item, "content", None)
                if not isinstance(content_items, list):
                    continue
                for content in content_items:
                    text = getattr(content, "text", None)
                    if isinstance(text, str) and text.strip():
                        collected.append(text.strip())
            if collected:
                return "\n".join(collected)

        raise LlmExtractionError("llm_empty_output", "LLM response contained no text output")
