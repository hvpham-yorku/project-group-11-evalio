from __future__ import annotations

import json
import os
from typing import Any


class _CompatResponsesAPI:
    def __init__(self, client: Any):
        self._client = client

    def create(self, *, model: str, input: list[dict[str, Any]]) -> Any:
        messages = _convert_responses_input_to_chat_messages(input)
        completion = self._client.chat.completions.create(
            model=model,
            messages=messages,
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
        system_prompt = (
            "Extract ONLY grading components that contribute to the final grade.\n"
            "Ignore these items entirely: attendance, review sessions, exam setup, scheduling, "
            "academic integrity, late penalties, formatting instructions, administrative notes.\n"
            "Nested grading rule:\n"
            "- If a parent has 40% and children sum to 40%, return parent only.\n"
            "- If children are independent weighted components, return children.\n"
            'If the syllabus specifies grading conditions (e.g., “best X of Y”, “drop lowest”, “must pass”, minimum score requirements, or bonus caps), include a short description in the "rule" field of that assessment. Otherwise set "rule" to null. Keep rule concise (one short sentence).\n'
            "Do NOT invent or infer weights.\n"
            'If grading structure is unclear, return {"assessments": [], "deadlines": []}.\n'
            "Return ONLY valid JSON.\n"
            "No markdown.\n"
            "No commentary.\n"
            "Output schema:\n"
            '{"assessments":[{"name":"string","weight":number_or_percent_string,"is_bonus":bool,"rule":string_or_null}],'
            '"deadlines":[]}'
        )
        user_prompt = f"Course outline text:\n{text}"

        try:
            response = client.responses.create(
                model=self.model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
        except Exception as exc:
            if self._is_timeout_exception(exc):
                raise LlmExtractionError(
                    "llm_timeout",
                    f"LLM request timed out after {self.timeout_seconds:.0f}s",
                ) from exc
            raise LlmExtractionError("llm_call_failed", f"LLM request failed: {exc}") from exc

        raw_text = self._extract_output_text(response)
        try:
            payload = json.loads(raw_text)
        except json.JSONDecodeError:
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
                )
            except Exception as retry_exc:
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
            try:
                payload = json.loads(retry_raw_text)
            except json.JSONDecodeError as retry_parse_exc:
                raise LlmExtractionError(
                    "llm_invalid_json",
                    f"LLM returned invalid JSON: {retry_parse_exc}",
                ) from retry_parse_exc
        if not isinstance(payload, dict):
            raise LlmExtractionError("llm_invalid_schema", "LLM JSON root must be an object")
        return payload

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
