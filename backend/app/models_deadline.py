"""
Deadline Pydantic models — SCRUM-83

Request / response schemas for the deadline management API.
Kept separate from the core ``models.py`` to mirror the extraction split.
"""

from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


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


class DeadlineUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1)
    deadline_type: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    notes: Optional[str] = None
    assessment_id: Optional[UUID] = None
    assessment_name: Optional[str] = None


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
