from app.services.extraction_service import ExtractionService
from app.services.llm_extraction_client import LlmExtractionClient, LlmExtractionError


class _StaticLlmClient:
    def __init__(self, payload=None, error: Exception | None = None):
        self._payload = payload
        self._error = error

    def extract(self, text: str):
        _ = text
        if self._error is not None:
            raise self._error
        return self._payload


class _TimeoutingResponses:
    def create(self, **kwargs):
        _ = kwargs
        raise TimeoutError("request timed out")


class _TimeoutingOpenAiClient:
    def __init__(self):
        self.responses = _TimeoutingResponses()


class _OutputTextResponse:
    def __init__(self, text: str):
        self.output_text = text


class _SequentialResponses:
    def __init__(self, output_texts: list[str]):
        self._output_texts = output_texts
        self.call_count = 0

    def create(self, **kwargs):
        _ = kwargs
        self.call_count += 1
        index = self.call_count - 1
        if index >= len(self._output_texts):
            raise RuntimeError("unexpected extra call")
        return _OutputTextResponse(self._output_texts[index])


class _SequentialOpenAiClient:
    def __init__(self, output_texts: list[str]):
        self.responses = _SequentialResponses(output_texts)


def _extract_txt(service: ExtractionService, text: str, term: str | None = "W26"):
    return service.extract(
        filename="outline.txt",
        content_type="text/plain",
        file_bytes=text.encode("utf-8"),
        term=term,
    )


def test_ocr_dependencies_missing_is_handled_gracefully(monkeypatch):
    service = ExtractionService(llm_client=_StaticLlmClient(payload={"assessments": [], "deadlines": []}))
    monkeypatch.setattr("app.services.extraction_service.shutil.which", lambda _: None)

    result = service._extract_text_ocr(b"pdf-bytes")
    assert result["available"] is False
    assert result["text"] == ""
    assert "dependencies" in result["error"].lower()
    assert any("ocr_dependencies_missing" in warning for warning in result["parse_warnings"])


def test_llm_valid_structure_passes():
    llm_payload = {
        "assessments": [
            {"name": "Assignment", "weight": 20},
            {"name": "Midterm", "weight": "30"},
            {"name": "Final Exam", "weight": "50%"},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    assert [a.name for a in response.assessments] == ["Assignment", "Midterm", "Final Exam"]
    assert response.diagnostics.method == "llm"
    assert response.diagnostics.deterministic_failed_validation is False


def test_llm_valid_cumulative_structure_passes():
    llm_payload = {
        "assessments": [
            {"name": "Quizzes", "weight": "20%"},
            {"name": "Midterm", "weight": 30},
            {"name": "Final (cumulative)", "weight": "50"},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    assert [a.name for a in response.assessments] == ["Quizzes", "Midterm", "Final (cumulative)"]


def test_llm_valid_shortform_structure_passes():
    llm_payload = {
        "assessments": [
            {"name": "A1", "weight": 25},
            {"name": "A2", "weight": "25%"},
            {"name": "A3", "weight": "50"},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    assert [a.name for a in response.assessments] == ["A1", "A2", "A3"]


def test_weight_string_percent_normalizes():
    llm_payload = {
        "assessments": [
            {"name": "Assignment", "weight": "40%"},
            {"name": "Midterm", "weight": "30%"},
            {"name": "Final", "weight": "30%"},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    assert [a.weight for a in response.assessments] == [40.0, 30.0, 30.0]


def test_weight_string_marks_normalizes():
    llm_payload = {
        "assessments": [
            {"name": "Assignment", "weight": "40 marks"},
            {"name": "Midterm", "weight": "30 marks"},
            {"name": "Final", "weight": "30 marks"},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    assert [a.weight for a in response.assessments] == [40.0, 30.0, 30.0]


def test_weight_string_float_normalizes():
    llm_payload = {
        "assessments": [
            {"name": "Assignment", "weight": "40.0"},
            {"name": "Midterm", "weight": "30.0"},
            {"name": "Final", "weight": "30.0"},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    assert [a.weight for a in response.assessments] == [40.0, 30.0, 30.0]


def test_marks_sum_100_kept_as_percent():
    llm_payload = {
        "assessments": [
            {"name": "Assignment", "weight": "20 marks"},
            {"name": "Midterm", "weight": "30 marks"},
            {"name": "Final", "weight": "50 marks"},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    assert [a.weight for a in response.assessments] == [20.0, 30.0, 50.0]


def test_marks_sum_200_scaled_to_100():
    llm_payload = {
        "assessments": [
            {"name": "Assignment", "weight": "20 marks"},
            {"name": "Midterm", "weight": "30 marks"},
            {"name": "Project", "weight": "50 marks"},
            {"name": "Final", "weight": "100 marks"},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    assert [a.weight for a in response.assessments] == [10.0, 15.0, 25.0, 50.0]
    assert "weight_scaled_from_marks" in response.diagnostics.parse_warnings


def test_non_numeric_weight_still_fails_strictly():
    llm_payload = {
        "assessments": [
            {"name": "Assignment", "weight": "abc marks"},
            {"name": "Midterm", "weight": "30 marks"},
            {"name": "Final", "weight": "70 marks"},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is False
    assert response.assessments == []
    assert response.deadlines == []


def test_rule_best_x_of_y_preserved():
    llm_payload = {
        "assessments": [
            {"name": "Quizzes", "weight": "15%", "rule": "Best 10 of 11 count"},
            {"name": "Midterm", "weight": 35},
            {"name": "Final", "weight": 50},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    quizzes = next(a for a in response.assessments if a.name == "Quizzes")
    assert quizzes.rule == "Best 10 of 11 count"
    assert quizzes.weight == 15.0


def test_rule_must_pass_preserved():
    llm_payload = {
        "assessments": [
            {"name": "Assignment", "weight": 20},
            {"name": "Midterm", "weight": 40},
            {"name": "Final Exam", "weight": 40, "rule": "Must pass final exam"},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    final_exam = next(a for a in response.assessments if a.name == "Final Exam")
    assert final_exam.rule == "Must pass final exam"


def test_missing_or_blank_rule_maps_to_none():
    llm_payload = {
        "assessments": [
            {"name": "Assignment", "weight": 20},
            {"name": "Midterm", "weight": 30, "rule": "   "},
            {"name": "Final", "weight": 50},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    assignment = next(a for a in response.assessments if a.name == "Assignment")
    midterm = next(a for a in response.assessments if a.name == "Midterm")
    final = next(a for a in response.assessments if a.name == "Final")
    assert assignment.rule is None
    assert midterm.rule is None
    assert final.rule is None


def test_less_than_three_non_bonus_assessments_passes_with_relaxed_validator():
    llm_payload = {
        "assessments": [
            {"name": "Final review", "weight": 50},
            {"name": "Midterm review", "weight": 50},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    assert len(response.assessments) == 2
    assert response.diagnostics.failure_reason is None


def test_sum_non_bonus_not_100_fails():
    llm_payload = {
        "assessments": [
            {"name": "Assignment logistics", "weight": 30},
            {"name": "Final administration", "weight": 40},
            {"name": "Exam setup", "weight": 60},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is False
    assert response.assessments == []
    assert response.diagnostics.failure_reason == "Weight sum does not equal 100"


def test_quantized_non_bonus_sum_must_equal_100_00():
    llm_payload = {
        "assessments": [
            {"name": "Assignment", "weight": 33.3333},
            {"name": "Midterm", "weight": 33.3333},
            {"name": "Final Exam", "weight": 33.3334},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    assert len(response.assessments) == 3


def test_duplicate_names_case_insensitive_fail():
    llm_payload = {
        "assessments": [
            {"name": "Assignment 1", "weight": 30},
            {"name": "assignment 1", "weight": 30},
            {"name": "Final", "weight": 40},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is False
    assert response.diagnostics.failure_reason == "Duplicate assessment names detected"


def test_invalid_weight_values_are_normalized():
    llm_payload = {
        "assessments": [
            {"name": "Assignment", "weight": -5},
            {"name": "Midterm", "weight": 30},
            {"name": "Final", "weight": 75},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is False
    assert response.assessments == []
    assert response.diagnostics.failure_reason == "Weight sum does not equal 100"
    assert "weight_normalized" in response.diagnostics.parse_warnings


def test_nan_weight_values_are_normalized():
    llm_payload = {
        "assessments": [
            {"name": "Assignment", "weight": "NaN"},
            {"name": "Midterm", "weight": 30},
            {"name": "Final", "weight": 70},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    assert [a.weight for a in response.assessments] == [0.0, 30.0, 70.0]
    assert "weight_normalized" in response.diagnostics.parse_warnings


def test_bonus_only_structure_fails():
    llm_payload = {
        "assessments": [
            {"name": "Bonus Quiz 1", "weight": 10, "is_bonus": True},
            {"name": "Bonus Quiz 2", "weight": 5, "is_bonus": True},
            {"name": "Bonus Quiz 3", "weight": 5, "is_bonus": True},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is False
    assert response.diagnostics.failure_reason == "Bonus-only assessment structures are invalid"


def test_empty_name_fails():
    llm_payload = {
        "assessments": [
            {"name": " ", "weight": 20},
            {"name": "Midterm", "weight": 30},
            {"name": "Final", "weight": 50},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is False
    assert response.diagnostics.failure_reason == "Assessment name must be a non-empty string"


def test_llm_non_json_failure_returns_empty():
    service = ExtractionService(
        llm_client=_StaticLlmClient(
            error=LlmExtractionError("llm_invalid_json", "LLM returned invalid JSON")
        )
    )
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is False
    assert response.assessments == []
    assert response.deadlines == []
    assert response.diagnostics.trigger_gpt is True
    assert response.diagnostics.failure_reason == "llm_invalid_json"


def test_llm_missing_fields_fail():
    service = ExtractionService(llm_client=_StaticLlmClient(payload={"deadlines": []}))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is False
    assert response.diagnostics.failure_reason == "LLM output must include an assessments list"


def test_llm_wrong_types_fail():
    payload = {
        "assessments": [{"name": "Assignment", "weight": 20}],
        "deadlines": "not-a-list",
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is False
    assert response.diagnostics.failure_reason == "LLM output deadlines must be a list"


def test_component_rows_fail_when_llm_returns_empty_assessments():
    llm_payload = {
        "assessments": [],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(
        service,
        "\n".join(
            [
                "Component 1 ........ 10%",
                "Component 2 ........ 15%",
                "Component 3 ........ 25%",
                "Component 4 ........ 50%",
            ]
        ),
    )

    assert response.structure_valid is False
    assert response.assessments == []
    assert response.diagnostics.trigger_gpt is True


def test_llm_timeout_returns_failure_envelope():
    llm_client = LlmExtractionClient(client=_TimeoutingOpenAiClient(), timeout_seconds=20)
    service = ExtractionService(llm_client=llm_client)
    response = _extract_txt(service, "ignored by mocked llm timeout")

    assert response.structure_valid is False
    assert response.assessments == []
    assert response.deadlines == []
    assert response.diagnostics.method == "llm"
    assert response.diagnostics.failure_reason == "llm_timeout"
    assert response.diagnostics.trigger_gpt is True
    assert "llm_timeout" in response.diagnostics.trigger_reasons


def test_llm_timeout_returns_partial_structure_when_available():
    llm_client = LlmExtractionClient(client=_TimeoutingOpenAiClient(), timeout_seconds=20)
    service = ExtractionService(llm_client=llm_client)
    outline = "\n".join(
        [
            "Course Grading Breakdown",
            "Assignment 20%",
            "Midterm 30%",
            "Final Exam 50%",
        ]
    )
    response = _extract_txt(service, outline)

    assert response.structure_valid is False
    assert response.assessments == []
    assert response.deadlines == []
    assert response.diagnostics.method == "llm"
    assert response.diagnostics.failure_reason == "llm_timeout"
    assert "llm_timeout" in response.diagnostics.trigger_reasons


def test_llm_timeout_partial_extraction_fails_when_validation_fails():
    llm_client = LlmExtractionClient(client=_TimeoutingOpenAiClient(), timeout_seconds=20)
    service = ExtractionService(llm_client=llm_client)
    outline = "\n".join(
        [
            "Course Grading Breakdown",
            "Assignment 20%",
            "Midterm 30%",
        ]
    )
    response = _extract_txt(service, outline)

    assert response.structure_valid is False
    assert response.assessments == []
    assert response.deadlines == []
    assert response.diagnostics.method == "llm"
    assert response.diagnostics.failure_reason == "llm_timeout"
    assert "llm_timeout" in response.diagnostics.trigger_reasons


def test_llm_invalid_json_retries_once_and_succeeds():
    fake_client = _SequentialOpenAiClient(
        output_texts=[
            '{"assessments": [',
            (
                '{"assessments":[{"name":"Assignment","weight":20},'
                '{"name":"Midterm","weight":30},{"name":"Final Exam","weight":"50%"}],'
                '"deadlines":[]}'
            ),
        ]
    )
    llm_client = LlmExtractionClient(client=fake_client, timeout_seconds=20)
    service = ExtractionService(llm_client=llm_client)

    response = _extract_txt(service, "ignored by mocked llm retry")

    assert response.structure_valid is True
    assert [a.name for a in response.assessments] == ["Assignment", "Midterm", "Final Exam"]
    assert fake_client.responses.call_count == 2


def test_llm_invalid_json_after_retry_returns_failure_envelope():
    fake_client = _SequentialOpenAiClient(
        output_texts=[
            '{"assessments": [',
            '{"assessments": [',
        ]
    )
    llm_client = LlmExtractionClient(client=fake_client, timeout_seconds=20)
    service = ExtractionService(llm_client=llm_client)

    response = _extract_txt(service, "ignored by mocked llm retry failure")

    assert response.structure_valid is False
    assert response.assessments == []
    assert response.deadlines == []
    assert response.diagnostics.trigger_gpt is True
    assert "llm_invalid_json" in response.diagnostics.trigger_reasons
    assert response.diagnostics.failure_reason == "llm_invalid_json"
    assert fake_client.responses.call_count == 2
