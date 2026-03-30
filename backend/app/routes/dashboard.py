"""
Interactive Strategy Dashboard Endpoints — SCRUM-90

GET  /courses/{course_id}/dashboard            → grade boundaries + breakdown
POST /courses/{course_id}/dashboard/whatif      → multi-assessment what-if
GET  /courses/{course_id}/dashboard/strategies  → learning technique suggestions
"""

from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.dependencies import get_course_service, get_current_user, get_grade_target_repo
from app.repositories.base import GradeTargetRepository
from app.services.auth_service import AuthenticatedUser
from app.services.course_service import CourseNotFoundError, CourseService
from app.services.grading_service import calculate_uniform_required
from app.services.strategy_service import (
    compute_grade_boundaries,
    compute_multi_whatif,
    suggest_learning_strategies,
)

router = APIRouter(prefix="/courses/{course_id}/dashboard", tags=["Dashboard"])


# ─── Request schemas ───────────────────────────────────────────────────────────

class ScenarioEntry(BaseModel):
    assessment_name: str = Field(..., min_length=1)
    score: float = Field(..., ge=0, le=100)


class MultiWhatIfRequest(BaseModel):
    scenarios: list[ScenarioEntry] = Field(
        ...,
        min_length=1,
        description="Hypothetical scores on multiple remaining assessments",
    )


class UniformRequiredRequest(BaseModel):
    target: float = Field(..., ge=0, le=100)


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _get_course(service: CourseService, user_id, course_id):
    try:
        return service.get_course(user_id=user_id, course_id=course_id)
    except CourseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _load_optional_deadlines(current_user: AuthenticatedUser, course_id: UUID) -> list[dict[str, Any]] | None:
    try:
        from app.dependencies import get_deadline_service

        deadline_service = get_deadline_service()
        return [
            deadline.model_dump()
            for deadline in deadline_service.list_deadlines(current_user.user_id, course_id)
        ]
    except Exception:
        return None


def _resolve_dashboard_current_grade(boundaries: dict[str, Any]) -> float:
    if boundaries.get("normalisation_applied"):
        return boundaries["current_normalised"]
    return boundaries["current_grade"]


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def get_dashboard(
    course_id: UUID,
    service: CourseService = Depends(get_course_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Return the full strategy dashboard for a course:   
    - Current standing (raw + normalised)
    - Min / Max grade boundaries
    - Per-assessment breakdown with "Show Math" data
    - GPA conversions on current + best-case grades
    """
    stored = _get_course(service, current_user.user_id, course_id)
    return compute_grade_boundaries(stored.course)


@router.post("/whatif")
def multi_whatif(
    course_id: UUID,
    payload: MultiWhatIfRequest,
    service: CourseService = Depends(get_course_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Compute the projected grade when hypothetical scores are applied to
    **multiple** remaining assessments simultaneously.

    This is **read-only** — no grades are persisted.
    """
    stored = _get_course(service, current_user.user_id, course_id)
    scenario_dicts = [s.model_dump() for s in payload.scenarios]
    try:
        return compute_multi_whatif(stored.course, scenario_dicts)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/strategies")
def get_strategies(
    course_id: UUID,
    service: CourseService = Depends(get_course_service),
    grade_target_repo: GradeTargetRepository = Depends(get_grade_target_repo),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Return AI-free, deterministic learning technique suggestions for each
    remaining (ungraded) assessment based on type, weight, and time until due.

    If deadline data is available for the course, pass it via the
    ``deadlines`` query parameter (or, more typically, the frontend already
    has deadlines and can include them in a POST body — this GET form works
    without them).
    """
    stored = _get_course(service, current_user.user_id, course_id)
    raw_deadlines = _load_optional_deadlines(current_user, course_id)

    target_record = grade_target_repo.get_target(current_user.user_id, course_id)
    boundaries = compute_grade_boundaries(stored.course)
    current_grade = _resolve_dashboard_current_grade(boundaries)

    return {
        "course_name": stored.course.name,
        "suggestions": suggest_learning_strategies(
            stored.course,
            raw_deadlines,
            target_grade=target_record.target_percentage if target_record else None,
            current_grade=current_grade,
        ),
    }


@router.post("/uniform-required")
def get_uniform_required(
    course_id: UUID,
    payload: UniformRequiredRequest,
    service: CourseService = Depends(get_course_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Compute the single uniform percentage needed on every ungraded assessment
    to reach the target. Uses binary search through the real grading engine
    so best_of, drop_lowest, mandatory_pass rules are all respected.
    """
    stored = _get_course(service, current_user.user_id, course_id)
    return calculate_uniform_required(stored.course, payload.target)
