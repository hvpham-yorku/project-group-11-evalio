from app.dependencies import get_extraction_service


def _legacy_payload() -> dict:
    return {
        "filename": "EECS2311-outline.pdf",
        "content_type": "application/pdf",
    }


def test_extraction_outline_requires_authentication(client):
    response = client.post("/extraction/outline", json=_legacy_payload())
    assert response.status_code == 401


def test_extraction_outline_legacy_json_remains_compatible(auth_client):
    response = auth_client.post("/extraction/outline", json=_legacy_payload())
    assert response.status_code == 200
    body = response.json()
    assert body["diagnostics"]["stub"] is True
    assert body["diagnostics"]["method"] == "stub"
    assert body["structure_valid"] is False


def test_extraction_outline_multipart_requires_file(auth_client):
    response = auth_client.post(
        "/extraction/outline",
        data={"term": "W26"},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "file required"


def test_extraction_outline_legacy_payload_malformed_returns_invalid_payload(auth_client):
    response = auth_client.post(
        "/extraction/outline",
        content="{bad-json",
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "invalid legacy payload"


def test_extraction_outline_multipart_rejects_oversized_file(auth_client):
    oversized = b"x" * (10 * 1024 * 1024 + 1)
    response = auth_client.post(
        "/extraction/outline",
        files={"file": ("huge.txt", oversized, "text/plain")},
    )
    assert response.status_code == 413
    assert response.json()["detail"] == "file too large (max 10MB)"


def test_extraction_outline_multipart_deterministic_success(auth_client, monkeypatch):
    service = get_extraction_service()
    monkeypatch.setattr(
        service._llm_client,
        "extract",
        lambda _text: {
            "assessments": [
                {"name": "Assignment", "weight": 20},
                {"name": "Midterm", "weight": 30},
                {"name": "Final Exam", "weight": 50},
            ],
            "deadlines": [],
        },
    )
    outline_text = "\n".join(
        [
            "Course Grading Breakdown",
            "Assignment 20%",
            "Midterm 30%",
            "Final Exam 50%",
            "Final Exam due March 10, 2026 11:59 PM",
        ]
    )
    response = auth_client.post(
        "/extraction/outline",
        files={"file": ("outline.txt", outline_text.encode("utf-8"), "text/plain")},
        data={"term": "W26"},
    )
    assert response.status_code == 200

    body = response.json()
    assert body["structure_valid"] is True
    assert len(body["assessments"]) == 3
    assert body["diagnostics"]["method"] == "llm"
    assert body["diagnostics"]["stub"] is False
    assert body["diagnostics"]["deterministic_failed_validation"] is False


def test_extraction_outline_validation_failure_hard_contract(auth_client, monkeypatch):
    service = get_extraction_service()
    monkeypatch.setattr(
        service._llm_client,
        "extract",
        lambda _text: {
            "assessments": [
                {"name": "Assignment", "weight": 20},
                {"name": "Midterm", "weight": 30},
            ],
            "deadlines": [],
        },
    )
    invalid_outline = "\n".join(
        [
            "Course Grading Breakdown",
            "Assignment 20%",
            "Midterm 30%",
            "Final Exam due March 10, 2026 11:59 PM",
        ]
    )
    response = auth_client.post(
        "/extraction/outline",
        files={"file": ("outline.txt", invalid_outline.encode("utf-8"), "text/plain")},
        data={"term": "W26"},
    )
    assert response.status_code == 200

    body = response.json()
    assert body["structure_valid"] is False
    assert body["assessments"] == []
    assert body["deadlines"] == []
    assert body["message"] == "Deterministic extraction failed strict validation. Manual review required."
    diagnostics = body["diagnostics"]
    assert diagnostics["method"] == "llm"
    assert diagnostics["deterministic_failed_validation"] is True
    assert diagnostics["failure_reason"] == "Weight sum does not equal 100"
    assert diagnostics["trigger_gpt"] is True
    assert "weight_sum_not_100" in diagnostics["trigger_reasons"]
