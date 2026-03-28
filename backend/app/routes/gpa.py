"""
GPA Conversion Endpoints — SCRUM-109

GET  /gpa/scales                       → list supported scales + bands
GET  /courses/{course_id}/gpa          → GPA for one course
POST /courses/{course_id}/gpa/whatif   → what-if GPA (does NOT persist)
POST /gpa/cgpa                         → cumulative GPA across courses
"""

from __future__ import annotations

from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.dependencies import get_course_service, get_current_user
from app.services.auth_service import AuthenticatedUser
from app.services.course_service import CourseNotFoundError, CourseService
from app.services.gpa_service import (
    SUPPORTED_SCALES,
    GpaConversionError,
    calculate_weighted_gpa,
    convert_gpa_value,
    convert_percentage,
    convert_percentage_all_scales,
    get_scales_metadata,
)
from app.services.grading_service import calculate_course_totals

router = APIRouter(tags=["GPA"])


# ─── Request / Response models ─────────────────────────────────────────────────

class CourseGpaEntry(BaseModel):
    name: str
    percentage: Optional[float] = None
    credits: float = Field(..., gt=0)
    grade_type: Literal["numeric", "pass_fail", "withdrawn"] = Field(
        default="numeric"
    )


class CgpaRequest(BaseModel):
    """Compute cumulative GPA across multiple courses."""
    courses: list[CourseGpaEntry] = Field(..., min_length=1)
    scale: str = Field(default="4.0")


class WhatIfGpaRequest(BaseModel):
    """Compute projected GPA under hypothetical score overrides."""
    hypothetical_scores: list[dict[str, Any]] = Field(
        ...,
        description=(
            "List of {assessment_name: str, score: float (0-100)} overrides"
        ),
    )
    scale: str = Field(default="4.0")


class GpaScaleConvertRequest(BaseModel):
    current_gpa: float = Field(..., ge=0)
    from_scale: float = Field(..., gt=0)
    to_scale: float = Field(..., gt=0)


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/gpa/scales")
def list_scales(
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Return metadata for all supported GPA scales (for frontend dropdowns)."""
    _ = current_user
    return {"scales": get_scales_metadata()}


@router.get("/courses/{course_id}/gpa")
def get_course_gpa(
    course_id: UUID,
    scale: str = Query(default="4.0", description="GPA scale: 4.0, 9.0, or 10.0"),
    service: CourseService = Depends(get_course_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Return the current GPA for a single course on the requested scale.
    Computes the final percentage using the grading engine, then maps it
    through the GPA converter.
    """
    try:
        stored = service._get_course_or_raise(
            user_id=current_user.user_id, course_id=course_id
        )
    except CourseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    totals = calculate_course_totals(stored.course)
    pct = totals["final_total"]
    effective_pct = 0.0 if totals["is_failed"] else pct

    try:
        conversion = convert_percentage(effective_pct, scale)
        all_scales = convert_percentage_all_scales(effective_pct)
    except GpaConversionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "course_id": str(course_id),
        "course_name": stored.course.name,
        "percentage": round(pct, 2),
        "is_failed": totals["is_failed"],
        "totals": totals,
        "gpa": conversion,
        "all_scales": all_scales,
    }


@router.post("/courses/{course_id}/gpa/whatif")
def whatif_gpa(
    course_id: UUID,
    payload: WhatIfGpaRequest,
    service: CourseService = Depends(get_course_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Project the GPA if hypothetical scores are applied to remaining
    assessments.  This is **read-only** and does NOT persist.

    Re-uses ``strategy_service.compute_multi_whatif`` for the projected
    percentage, then maps through the GPA converter.
    """
    from app.services.strategy_service import compute_multi_whatif

    try:
        stored = service._get_course_or_raise(
            user_id=current_user.user_id, course_id=course_id
        )
    except CourseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        whatif_result = compute_multi_whatif(
            stored.course, payload.hypothetical_scores
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    projected = whatif_result["projected_grade"]
    effective_projected = 0.0 if whatif_result.get("is_failed") else projected
    try:
        gpa = convert_percentage(effective_projected, payload.scale)
        all_scales = convert_percentage_all_scales(effective_projected)
    except GpaConversionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "course_id": str(course_id),
        "course_name": stored.course.name,
        "projected_percentage": round(projected, 2),
        "is_failed": bool(whatif_result.get("is_failed")),
        "gpa": gpa,
        "all_scales": all_scales,
        "whatif_detail": whatif_result,
    }


@router.post("/gpa/cgpa")
def compute_cgpa(
    payload: CgpaRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Calculate cumulative GPA from manually supplied course entries.

    Each entry contains ``name``, ``percentage``, ``credits``, and
    optionally ``grade_type`` ("numeric" | "pass_fail" | "withdrawn").
    Non-numeric grades are excluded from the computation but reported.
    """
    _ = current_user
    try:
        result = calculate_weighted_gpa(
            [c.model_dump() for c in payload.courses],
            payload.scale,
        )
    except GpaConversionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return result


@router.post("/gpa/convert")
def convert_gpa_scale(
    payload: GpaScaleConvertRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Convert an already-issued GPA between arbitrary numeric scale maxima.

    Example: 8.2 on a 9-point scale -> 3.6444 on a 4-point scale.
    """
    _ = current_user
    try:
        return convert_gpa_value(
            current_gpa=payload.current_gpa,
            from_scale=payload.from_scale,
            to_scale=payload.to_scale,
        )
    except GpaConversionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
