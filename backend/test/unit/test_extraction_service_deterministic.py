import sys
import types

from app.services.extraction_service import ExtractionService
from app.services.grading_section_filter import GradingSectionFilter
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


class _TrackingLlmClient:
    def __init__(self):
        self.call_count = 0

    def extract(self, text: str):
        _ = text
        self.call_count += 1
        return {"assessments": [], "deadlines": []}


class _FakePdfPage:
    def __init__(self, text: str):
        self._text = text

    def extract_text(self):
        return self._text


class _FakePdfContext:
    def __init__(self, pages: list[_FakePdfPage]):
        self.pages = pages

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        _ = exc_type
        _ = exc
        _ = tb
        return False


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


def test_pdfplumber_exception_attempts_ocr(monkeypatch):
    service = ExtractionService(llm_client=_StaticLlmClient(payload={"assessments": [], "deadlines": []}))

    def _raise_open(_stream):
        raise RuntimeError("pdfplumber blew up")

    monkeypatch.setitem(sys.modules, "pdfplumber", types.SimpleNamespace(open=_raise_open))

    ocr_called = {"value": False}

    def _fake_ocr(_file_bytes):
        ocr_called["value"] = True
        return {
            "text": "OCR text",
            "available": True,
            "error": None,
            "parse_warnings": [],
        }

    monkeypatch.setattr(service, "_extract_text_ocr", _fake_ocr)
    result = service._extract_text_pdf(b"pdf-bytes")

    assert ocr_called["value"] is True
    assert result["text"] == "OCR text"
    assert any("pdf_parse_error" in warning for warning in result["parse_warnings"])


def test_pdf_long_text_without_percent_does_not_attempt_ocr(monkeypatch):
    service = ExtractionService(llm_client=_StaticLlmClient(payload={"assessments": [], "deadlines": []}))
    long_text = "final exam details " * 30  # > 400 chars and no percent symbols

    def _open_pdf(_stream):
        return _FakePdfContext([_FakePdfPage(long_text)])

    monkeypatch.setitem(sys.modules, "pdfplumber", types.SimpleNamespace(open=_open_pdf))

    ocr_called = {"value": False}

    def _fake_ocr(_file_bytes):
        ocr_called["value"] = True
        return {
            "text": "should-not-be-used",
            "available": True,
            "error": None,
            "parse_warnings": [],
        }

    monkeypatch.setattr(service, "_extract_text_ocr", _fake_ocr)
    result = service._extract_text_pdf(b"pdf-bytes")

    assert ocr_called["value"] is False
    assert result["text"] == long_text.strip()
    assert result["ocr_used"] is False


def test_pdf_primary_and_ocr_empty_returns_failure_without_llm(monkeypatch):
    llm_client = _TrackingLlmClient()
    service = ExtractionService(llm_client=llm_client)

    def _raise_open(_stream):
        raise RuntimeError("pdf parser failed")

    monkeypatch.setitem(sys.modules, "pdfplumber", types.SimpleNamespace(open=_raise_open))
    monkeypatch.setattr(
        service,
        "_extract_text_ocr",
        lambda _file_bytes: {
            "text": "",
            "available": False,
            "error": "OCR unavailable",
            "parse_warnings": ["ocr_dependencies_missing:OCR unavailable"],
        },
    )

    response = service.extract(
        filename="outline.pdf",
        content_type="application/pdf",
        file_bytes=b"pdf-bytes",
        term="W26",
    )

    assert response.structure_valid is False
    assert response.assessments == []
    assert response.deadlines == []
    assert response.diagnostics.failure_reason == "No text could be extracted from the file"
    assert "text_extraction_failed" in response.diagnostics.parse_warnings
    assert llm_client.call_count == 0


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
    assert any(
        warning in {"filtered_text_used:true", "filtered_text_used:false"}
        for warning in response.diagnostics.parse_warnings
    )


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


def test_llm_explicit_children_are_preserved():
    llm_payload = {
        "assessments": [
            {
                "name": "Quizzes",
                "weight": "15%",
                "is_bonus": False,
                "rule": "Best 10 of 11 quizzes count",
                "children": [
                    {"name": "Quiz 1", "weight": "1.5%", "is_bonus": False, "rule": None, "children": []},
                    {"name": "Quiz 2", "weight": "1.5%", "is_bonus": False, "rule": None, "children": []},
                    {"name": "Quiz 3", "weight": "1.5%", "is_bonus": False, "rule": None, "children": []},
                    {"name": "Quiz 4", "weight": "1.5%", "is_bonus": False, "rule": None, "children": []},
                    {"name": "Quiz 5", "weight": "1.5%", "is_bonus": False, "rule": None, "children": []},
                    {"name": "Quiz 6", "weight": "1.5%", "is_bonus": False, "rule": None, "children": []},
                    {"name": "Quiz 7", "weight": "1.5%", "is_bonus": False, "rule": None, "children": []},
                    {"name": "Quiz 8", "weight": "1.5%", "is_bonus": False, "rule": None, "children": []},
                    {"name": "Quiz 9", "weight": "1.5%", "is_bonus": False, "rule": None, "children": []},
                    {"name": "Quiz 10", "weight": "1.5%", "is_bonus": False, "rule": None, "children": []},
                    {"name": "Quiz 11", "weight": "1.5%", "is_bonus": False, "rule": None, "children": []},
                ],
            },
            {"name": "Midterm", "weight": 35, "is_bonus": False},
            {"name": "Final", "weight": 50, "is_bonus": False},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    parent = next(a for a in response.assessments if a.name == "Quizzes")
    assert len(parent.children) == 11
    assert parent.children[0].name == "Quiz 1"
    assert parent.children[0].weight == 1.5
    assert parent.weight == 15.0
    assert sum(child.weight for child in parent.children) > parent.weight


def test_rule_does_not_synthesize_children():
    llm_payload = {
        "assessments": [
            {
                "name": "Quizzes",
                "weight": "15%",
                "is_bonus": False,
                "rule": "Best 10 of 11 quizzes count",
            },
            {"name": "Midterm", "weight": 35, "is_bonus": False},
            {"name": "Final", "weight": 50, "is_bonus": False},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    parent = next(a for a in response.assessments if a.name == "Quizzes")
    assert parent.children == []
    assert parent.weight == 15.0


def test_parent_without_rule_requires_exact_child_sum():
    llm_payload = {
        "assessments": [
            {
                "name": "Labs",
                "weight": "20%",
                "is_bonus": False,
                "children": [
                    {"name": "Lab 1", "weight": "8%", "is_bonus": False, "rule": None, "children": []},
                    {"name": "Lab 2", "weight": "8%", "is_bonus": False, "rule": None, "children": []},
                ],
            },
            {"name": "Midterm", "weight": 30, "is_bonus": False},
            {"name": "Final", "weight": 50, "is_bonus": False},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is False
    assert response.diagnostics.failure_reason == "Parent assessment weight must equal sum of child assessment weights"


def test_parent_with_rule_allows_child_sum_above_parent():
    llm_payload = {
        "assessments": [
            {
                "name": "Quizzes",
                "weight": "20%",
                "is_bonus": False,
                "rule": "Best 2 of 3 count",
                "children": [
                    {"name": "Quiz 1", "weight": "10%", "is_bonus": False, "rule": None, "children": []},
                    {"name": "Quiz 2", "weight": "10%", "is_bonus": False, "rule": None, "children": []},
                    {"name": "Quiz 3", "weight": "10%", "is_bonus": False, "rule": None, "children": []},
                ],
            },
            {"name": "Final", "weight": 80, "is_bonus": False},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    quizzes = next(a for a in response.assessments if a.name == "Quizzes")
    assert len(quizzes.children) == 3
    assert sum(child.weight for child in quizzes.children) > quizzes.weight


def test_duplicate_child_and_top_level_name_rejected():
    llm_payload = {
        "assessments": [
            {
                "name": "Labs",
                "weight": "40%",
                "is_bonus": False,
                "children": [
                    {"name": "Lab 1", "weight": "20%", "is_bonus": False, "rule": None, "children": []},
                    {"name": "Lab 2", "weight": "20%", "is_bonus": False, "rule": None, "children": []},
                ],
            },
            {"name": "Lab 1", "weight": 20, "is_bonus": False},
            {"name": "Final", "weight": 40, "is_bonus": False},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is False
    assert response.diagnostics.failure_reason == "Child assessments must not be duplicated as top-level assessments"


def test_depth_greater_than_two_rejected():
    llm_payload = {
        "assessments": [
            {
                "name": "Quizzes",
                "weight": "50%",
                "is_bonus": False,
                "children": [
                    {
                        "name": "Quiz Group",
                        "weight": "50%",
                        "is_bonus": False,
                        "rule": None,
                        "children": [
                            {
                                "name": "Quiz 1",
                                "weight": "50%",
                                "is_bonus": False,
                                "rule": None,
                                "children": [],
                            }
                        ],
                    }
                ],
            },
            {"name": "Final", "weight": 50, "is_bonus": False},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is False
    assert response.diagnostics.failure_reason == "Assessment nesting depth cannot exceed 2"


def test_top_level_sum_uses_only_top_level_weights():
    llm_payload = {
        "assessments": [
            {
                "name": "Labs",
                "weight": "30%",
                "is_bonus": False,
                "children": [
                    {"name": "Lab 1", "weight": "15%", "is_bonus": False, "rule": None, "children": []},
                    {"name": "Lab 2", "weight": "15%", "is_bonus": False, "rule": None, "children": []},
                ],
            },
            {"name": "Final", "weight": 60, "is_bonus": False},
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is False
    assert response.diagnostics.failure_reason == "Weight sum does not equal 100"


def test_pure_multiplicative_expansion_synthesizes_children_on_exact_match():
    llm_payload = {
        "assessments": [
            {
                "name": "Lab tests",
                "weight": "40 marks",
                "is_bonus": False,
                "rule": None,
                "children": [],
                "total_count": 5,
                "effective_count": 5,
                "unit_weight": 8,
                "rule_type": "pure_multiplicative",
            },
            {
                "name": "Final exam",
                "weight": "60 marks",
                "is_bonus": False,
                "rule": None,
                "children": [],
                "total_count": None,
                "effective_count": None,
                "unit_weight": None,
                "rule_type": None,
            },
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    labs = next(a for a in response.assessments if a.name == "Lab tests")
    assert len(labs.children) == 5
    assert labs.children[0].name == "Lab test 1"
    assert all(child.weight == 8.0 for child in labs.children)
    assert all(child.total_count is None for child in labs.children)
    assert all(child.effective_count is None for child in labs.children)
    assert all(child.unit_weight is None for child in labs.children)
    assert all(child.rule_type is None for child in labs.children)


def test_best_of_expansion_synthesizes_total_count_children():
    llm_payload = {
        "assessments": [
            {
                "name": "Online activities",
                "weight": "10%",
                "is_bonus": False,
                "rule": "Best 10 out of 12 count.",
                "children": [],
                "total_count": 12,
                "effective_count": 10,
                "unit_weight": 1,
                "rule_type": "best_of",
            },
            {
                "name": "Final exam",
                "weight": "90%",
                "is_bonus": False,
                "rule": None,
                "children": [],
                "total_count": None,
                "effective_count": None,
                "unit_weight": None,
                "rule_type": None,
            },
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    activities = next(a for a in response.assessments if a.name == "Online activities")
    assert len(activities.children) == 12
    assert activities.children[0].weight == 1.0
    assert activities.weight == 10.0
    assert activities.rule == "Best 10 out of 12 count."


def test_best_of_expansion_skips_on_mismatch():
    llm_payload = {
        "assessments": [
            {
                "name": "Online activities",
                "weight": "10%",
                "is_bonus": False,
                "rule": "Best 10 out of 12 count.",
                "children": [],
                "total_count": 12,
                "effective_count": 10,
                "unit_weight": 0.9,
                "rule_type": "best_of",
            },
            {
                "name": "Final exam",
                "weight": "90%",
                "is_bonus": False,
                "rule": None,
                "children": [],
                "total_count": None,
                "effective_count": None,
                "unit_weight": None,
                "rule_type": None,
            },
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    activities = next(a for a in response.assessments if a.name == "Online activities")
    assert activities.children == []


def test_flat_case_without_count_metadata_does_not_expand():
    llm_payload = {
        "assessments": [
            {
                "name": "Assignment",
                "weight": "20%",
                "is_bonus": False,
                "rule": None,
                "children": [],
                "total_count": None,
                "effective_count": None,
                "unit_weight": None,
                "rule_type": None,
            },
            {
                "name": "Midterm",
                "weight": "30%",
                "is_bonus": False,
                "rule": None,
                "children": [],
                "total_count": None,
                "effective_count": None,
                "unit_weight": None,
                "rule_type": None,
            },
            {
                "name": "Final",
                "weight": "50%",
                "is_bonus": False,
                "rule": None,
                "children": [],
                "total_count": None,
                "effective_count": None,
                "unit_weight": None,
                "rule_type": None,
            },
        ],
        "deadlines": [],
    }
    service = ExtractionService(llm_client=_StaticLlmClient(payload=llm_payload))
    response = _extract_txt(service, "ignored by mocked llm")

    assert response.structure_valid is True
    assignment = next(a for a in response.assessments if a.name == "Assignment")
    assert assignment.children == []


def test_grading_filter_reduces_text_when_keywords_present():
    filler_top = "\n".join(f"intro line {i}" for i in range(200))
    grading_block = "\n".join(
        [
            "Grading Policy",
            "Assignment 20%",
            "Midterm 30%",
            "Final Exam 50%",
        ]
    )
    filler_bottom = "\n".join(f"policy line {i}" for i in range(200))
    text = f"{filler_top}\n{grading_block}\n{filler_bottom}"

    filtered_text, filtered_used = GradingSectionFilter().filter(text)

    assert filtered_used is True
    assert len(filtered_text) < len(text)
    assert "Grading Policy" in filtered_text
    assert "Assignment 20%" in filtered_text


def test_grading_filter_fallback_when_no_keywords():
    text = "\n".join(f"random narrative line {i}" for i in range(50))

    filtered_text, filtered_used = GradingSectionFilter().filter(text)

    assert filtered_used is False
    assert filtered_text == text


def test_grading_filter_anchors_small_section_without_semantic_validation():
    text = "\n".join(
        [
            "Course information",
            "Grading",
            "Attendance policy details",
        ]
    )

    filtered_text, filtered_used = GradingSectionFilter().filter(text)

    assert filtered_used is True
    assert "Grading" in filtered_text
    assert "Attendance policy details" in filtered_text


def test_anchor_rejects_sentence_like_line():
    text = "\n".join(
        [
            "",
            "Students will be evaluated using quizzes and assignments.",
            "",
            "Random syllabus details without grading table",
            "More policy statements only",
        ]
    )

    filtered_text, filtered_used = GradingSectionFilter().filter(text)

    assert filtered_used is False
    assert filtered_text == text


def test_anchor_detects_header_without_following_blank_line():
    text = "\n".join(
        [
            "",
            "Grading Policy",
            "The grade will count the assessments listed below.",
            "",
            "Quiz 10%",
            "Exam 40%",
            "Final 50%",
            "Week 1 introduction",
            "Week 2 review",
            "Week 3 quiz prep",
        ]
    )

    filtered_text, filtered_used = GradingSectionFilter().filter(text)

    assert filtered_used is True
    assert "Grading Policy" in filtered_text
    assert "Quiz 10%" in filtered_text
    assert "Exam 40%" in filtered_text
    assert "Final 50%" in filtered_text


def test_plain_number_not_weight_without_grading_context():
    text = "\n".join(
        [
            "",
            "Grading",
            "",
            "Task 10",
            "Week 10",
            "Milestone 20",
            "Project final notes",
        ]
    )

    filtered_text, filtered_used = GradingSectionFilter().filter(text)

    assert filtered_used is True
    assert "Grading" in filtered_text
    assert "Milestone 20" in filtered_text


def test_anchor_prefix_with_allowed_delimiter_matches():
    text = "\n".join(
        [
            "Intro",
            "Grading: policy details",
            "Assignment 20%",
            "Midterm 30%",
            "Final 50%",
        ]
    )

    filtered_text, filtered_used = GradingSectionFilter().filter(text)

    assert filtered_used is True
    assert "Grading: policy details" in filtered_text


def test_overlapping_anchor_windows_are_merged():
    lines = [f"line {i}" for i in range(80)]
    lines[20] = "Grading"
    lines[30] = "Evaluation"
    text = "\n".join(lines)

    filtered_text, filtered_used = GradingSectionFilter().filter(text)

    assert filtered_used is True
    assert "line 15" in filtered_text
    assert "line 60" in filtered_text


def test_filter_fallback_when_anchor_not_exact_phrase():
    text = "\n".join(
        [
            "Course details",
            "Course Grading Breakdown",
            "Assignment 20%",
            "Midterm 30%",
            "Final 50%",
        ]
    )

    filtered_text, filtered_used = GradingSectionFilter().filter(text)

    assert filtered_used is False
    assert filtered_text == text


def test_grading_filter_table_mode_uses_table_rows_only_for_sum():
    filler_top = "\n".join(f"intro line {i}" for i in range(120))
    grading_block = "\n".join(
        [
            "Grading Policy",
            "S. No. Assessment %age Due Date/ Time",
            "1 11 Quizzes 15 10-02-2025 11:59",
            "2 9 Labs 15 17-02-2025 11:59",
            "3 Lab Test 15 24-02-2025 11:59",
            "4 Midterm Exam 20 10-03-2025 12:00",
            "5 Final Exam 35 25-04-2025 09:30",
            "Rules:",
            "- best 10 of 11 quizzes count",
            "- Labs 7 to 9 have additional prep checks",
            "- Lab 1 demo required in week 2",
        ]
    )
    filler_bottom = "\n".join(f"admin line {i}" for i in range(120))
    text = f"{filler_top}\n{grading_block}\n{filler_bottom}"

    filtered_text, filtered_used = GradingSectionFilter().filter(text)

    assert filtered_used is True
    assert filtered_text != text
    assert "S. No. Assessment %age Due Date/ Time" in filtered_text
    assert "Final Exam 35" in filtered_text


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
