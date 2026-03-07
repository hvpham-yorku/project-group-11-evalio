# backend/test/unit/test_deadline_service_unit.py

from uuid import uuid4

from app.models_deadline import Deadline
from app.services.deadline_service import (
    _parse_date_str,
    _parse_time_str,
    extract_deadlines_from_text,
    generate_ics,
)


def test_parse_date_iso():
    assert _parse_date_str("2026-03-15") == "2026-03-15"


def test_parse_date_month_name():
    assert _parse_date_str("March 15, 2026") == "2026-03-15"


def test_parse_date_slash_format():
    assert _parse_date_str("03/15/26") == "2026-03-15"


def test_parse_date_hyphen_format_defaults_day_first():
    assert _parse_date_str("10-02-2025") == "2025-02-10"


def test_parse_time_12h_and_24h():
    assert _parse_time_str("11:59 pm") == "23:59"
    assert _parse_time_str("12am") == "00:00"
    assert _parse_time_str("9pm") == "21:00"
    assert _parse_time_str("13:05") == "13:05"


def test_extract_deadlines_deduplicates():
    text = "\n".join([
        "Assignment 1 due March 15, 2026 at 11:59pm",
        "Assignment 1 due March 15, 2026 at 11:59pm",
        "Final Exam April 10, 2026",
    ])
    results = extract_deadlines_from_text(text, course_name="EECS2311")
    assert len(results) == 2
    assert results[0]["due_date"] in {"2026-03-15", "2026-04-10"}


def test_extract_deadlines_skips_non_assessment_date_lines():
    text = "\n".join([
        "Course starts from January 13, 2026",
        "Reading week from February 17, 2026",
        "Assignment 2 due March 01, 2026",
    ])
    results = extract_deadlines_from_text(text, course_name="EECS2311")
    assert len(results) == 1
    assert results[0]["title"].lower().startswith("assignment 2")


def test_extract_deadlines_table_style_row_title_cleanup():
    text = "Lab Test 1 15 10-02-2025, 11-02-2025"
    results = extract_deadlines_from_text(text, course_name="EECS2311")
    assert len(results) == 1
    assert results[0]["title"] == "Lab Test 1"
    assert results[0]["due_date"] == "2025-02-10"


def test_generate_ics_contains_alarm_and_summary():
    dl = Deadline(
        deadline_id=uuid4(),
        course_id=uuid4(),
        title="Assignment 1",
        due_date="2026-03-15",
        due_time="23:59",
        source="outline",
        notes="From outline",
        assessment_name="Assignment 1",
        exported_to_gcal=False,
        gcal_event_id=None,
        created_at="2026-03-01T00:00:00Z",
    )
    ics = generate_ics([dl], course_name="EECS2311")
    assert "BEGIN:VCALENDAR" in ics
    assert "BEGIN:VEVENT" in ics
    assert "TRIGGER:-P7D" in ics
    assert "SUMMARY:EECS2311 — Assignment 1" in ics
