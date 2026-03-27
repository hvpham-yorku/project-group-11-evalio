"""
Deadline Pydantic models — SCRUM-83

Request / response schemas for the deadline management API.
Kept separate from the core ``models.py`` to mirror the extraction split.
"""

from __future__ import annotations

from datetime import date, time
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


def _normalize_due_date(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise ValueError("due_date must be a valid ISO-8601 date (YYYY-MM-DD)") from exc


def _normalize_due_time(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    parts = value.split(":")
    if len(parts) != 2:
        raise ValueError("due_time must be a valid 24-hour time (HH:MM)")

    try:
        hour = int(parts[0])
        minute = int(parts[1])
        parsed = time(hour=hour, minute=minute)
    except ValueError as exc:
        raise ValueError("due_time must be a valid 24-hour time (HH:MM)") from exc

    return parsed.strftime("%H:%M")


# ─── Stored / internal representation ─────────────────────────────────────────

class Deadline(BaseModel):
    deadline_id: UUID
    course_id: UUID
    assessment_id: Optional[UUID] = None
    title: str
    deadline_type: Optional[str] = None
    due_date: str = Field(..., description="ISO-8601 date (YYYY-MM-DD)")
    due_time: Optional[str] = Field(None, description="HH:MM (24h)")
    source: str = Field(default="manual", description="'outline' or 'manual'")
    notes: Optional[str] = None
    assessment_name: Optional[str] = Field(
        None, description="Linked assessment name for min-grade enrichment"
    )
    exported_to_gcal: bool = False
    gcal_event_id: Optional[str] = None
    created_at: str = Field(..., description="ISO-8601 datetime")

    @field_validator("due_date")
    @classmethod
    def validate_due_date(cls, value: str) -> str:
        return _normalize_due_date(value)

    @field_validator("due_time")
    @classmethod
    def validate_due_time(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_due_time(value)


# ─── API request schemas ──────────────────────────────────────────────────────

class DeadlineCreate(BaseModel):
    title: str = Field(..., min_length=1)
    deadline_type: Optional[str] = None
    due_date: str = Field(..., description="ISO-8601 date (YYYY-MM-DD)")
    due_time: Optional[str] = Field(None, description="HH:MM (24h)")
    source: str = Field(default="manual")
    notes: Optional[str] = None
    assessment_id: Optional[UUID] = None
    assessment_name: Optional[str] = None

    @field_validator("due_date")
    @classmethod
    def validate_due_date(cls, value: str) -> str:
        return _normalize_due_date(value)

    @field_validator("due_time")
    @classmethod
    def validate_due_time(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_due_time(value)


class DeadlineUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1)
    deadline_type: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    notes: Optional[str] = None
    assessment_id: Optional[UUID] = None
    assessment_name: Optional[str] = None

    @field_validator("due_date")
    @classmethod
    def validate_due_date(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return _normalize_due_date(value)

    @field_validator("due_time")
    @classmethod
    def validate_due_time(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_due_time(value)


class DeadlineExportRequest(BaseModel):
    """Select which deadlines to export. *None* means 'export all'."""
    deadline_ids: Optional[list[UUID]] = Field(
        None,
        description="Specific deadline IDs to export. Omit or null to export all.",
    )
    min_grade_info: Optional[dict[str, dict[str, Any]]] = Field(
        None,
        description="Optional minimum-grade mapping by assessment name for export descriptions.",
    )


# ─── API response schemas ────────────────────────────────────────────────────

class DeadlineListResponse(BaseModel):
    deadlines: list[Deadline]
    count: int


class DeadlineExportResponse(BaseModel):
    exported_count: int
    skipped_duplicates: int
    events: list[dict[str, Any]]
    ics_content: Optional[str] = None


class GoogleAuthUrlResponse(BaseModel):
    authorization_url: str
    state: str


class GoogleConnectionStatusResponse(BaseModel):
    connected: bool
