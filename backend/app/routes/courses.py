from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.dependencies import get_course_service, get_current_user
from app.models import CourseCreate
from app.services.auth_service import AuthenticatedUser
from app.services.course_service import (
    CourseNotFoundError,
    CourseService,
    CourseValidationError,
)

router = APIRouter(prefix="/courses", tags=["Courses"])


class AssessmentWeightUpdate(BaseModel):
    name: str = Field(..., min_length=1)
    weight: Decimal = Field(..., ge=0, le=100)


class CourseWeightsUpdateRequest(BaseModel):
    assessments: list[AssessmentWeightUpdate]


class AssessmentGradeUpdate(BaseModel):
    name: str = Field(..., min_length=1)
    raw_score: Optional[float] = None
    total_score: Optional[float] = None


class CourseGradesUpdateRequest(BaseModel):
    assessments: list[AssessmentGradeUpdate]


class TargetGradeRequest(BaseModel):
    target: float = Field(..., ge=0, le=100)


class MinimumRequiredRequest(BaseModel):
    target: float = Field(..., ge=0, le=100)
    assessment_name: str = Field(..., min_length=1)


class WhatIfRequest(BaseModel):
    assessment_name: str = Field(..., min_length=1)
    hypothetical_score: float = Field(..., ge=0, le=100)


@router.post("/")
def create_course(
    course: CourseCreate,
    service: CourseService = Depends(get_course_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        return service.create_course(user_id=current_user.user_id, course=course)
    except CourseValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/")
def list_courses(
    service: CourseService = Depends(get_course_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    return service.list_courses(user_id=current_user.user_id)


@router.put("/{course_id}/weights")
def update_course_weights(
    course_id: UUID,
    payload: CourseWeightsUpdateRequest,
    service: CourseService = Depends(get_course_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        return service.update_course_weights(
            user_id=current_user.user_id,
            course_id=course_id,
            assessments=[assessment.model_dump() for assessment in payload.assessments],
        )
    except CourseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CourseValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/{course_id}/grades")
def update_course_grades(
    course_id: UUID,
    payload: CourseGradesUpdateRequest,
    service: CourseService = Depends(get_course_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        return service.update_course_grades(
            user_id=current_user.user_id,
            course_id=course_id,
            assessments=[assessment.model_dump() for assessment in payload.assessments],
        )
    except CourseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CourseValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{course_id}/target")
def check_target_feasibility(
    course_id: UUID,
    payload: TargetGradeRequest,
    service: CourseService = Depends(get_course_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        return service.check_target_feasibility(
            user_id=current_user.user_id,
            course_id=course_id,
            target=payload.target,
        )
    except CourseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{course_id}/minimum-required")
def get_minimum_required_score(
    course_id: UUID,
    payload: MinimumRequiredRequest,
    service: CourseService = Depends(get_course_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    SCRUM-61: API endpoint for minimum required score calculation.
    Returns the minimum score needed on a specific assessment to achieve target grade.
    """
    try:
        return service.get_minimum_required_score(
            user_id=current_user.user_id,
            course_id=course_id,
            target=payload.target,
            assessment_name=payload.assessment_name,
        )
    except CourseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CourseValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{course_id}/whatif")
def run_whatif_scenario(
    course_id: UUID,
    payload: WhatIfRequest,
    service: CourseService = Depends(get_course_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    SCRUM-67: API endpoint for what-if scenario analysis.
    Calculates projected grade based on a hypothetical score. Read-only operation.
    """
    try:
        return service.run_whatif_scenario(
            user_id=current_user.user_id,
            course_id=course_id,
            assessment_name=payload.assessment_name,
            hypothetical_score=payload.hypothetical_score,
        )
    except CourseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CourseValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
