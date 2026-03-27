import pytest
from pydantic import ValidationError

from app.models_deadline import DeadlineCreate, DeadlineUpdate


def test_deadline_create_accepts_and_normalizes_iso_fields():
    model = DeadlineCreate(
        title="Midterm",
        due_date="2026-03-15",
        due_time="9:05",
    )

    assert model.due_date == "2026-03-15"
    assert model.due_time == "09:05"


def test_deadline_create_rejects_invalid_due_date():
    with pytest.raises(ValidationError, match="due_date must be a valid ISO-8601 date"):
        DeadlineCreate(
            title="Midterm",
            due_date="03/15/2026",
        )


def test_deadline_create_rejects_invalid_due_time():
    with pytest.raises(ValidationError, match="due_time must be a valid 24-hour time"):
        DeadlineCreate(
            title="Midterm",
            due_date="2026-03-15",
            due_time="25:00",
        )


def test_deadline_update_allows_none_and_normalizes_time():
    model = DeadlineUpdate(due_time="7:30")

    assert model.due_time == "07:30"
