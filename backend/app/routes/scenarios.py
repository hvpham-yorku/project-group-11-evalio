from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.dependencies import get_current_user, get_scenario_service
from app.services.auth_service import AuthenticatedUser
from app.services.course_service import CourseNotFoundError
from app.services.scenario_service import (
    ScenarioNotFoundError,
    ScenarioService,
    ScenarioValidationError,
)

router = APIRouter(prefix="/courses/{course_id}/scenarios", tags=["Scenarios"])


class ScenarioEntryRequest(BaseModel):
    assessment_id: UUID | None = None
    assessment_name: str | None = Field(None, min_length=1)
    score: float = Field(..., ge=0, le=100)


class ScenarioCreateRequest(BaseModel):
    name: str = Field(..., min_length=1)
    scenarios: list[ScenarioEntryRequest] = Field(..., min_length=1)


@router.post("")
def create_scenario(
    course_id: UUID,
    payload: ScenarioCreateRequest,
    service: ScenarioService = Depends(get_scenario_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        return service.save_scenario(
            user_id=current_user.user_id,
            course_id=course_id,
            name=payload.name,
            entries=[entry.model_dump() for entry in payload.scenarios],
        )
    except CourseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ScenarioValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("")
def list_scenarios(
    course_id: UUID,
    service: ScenarioService = Depends(get_scenario_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        return service.list_scenarios(
            user_id=current_user.user_id,
            course_id=course_id,
        )
    except CourseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{scenario_id}")
def get_scenario(
    course_id: UUID,
    scenario_id: UUID,
    service: ScenarioService = Depends(get_scenario_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        return service.get_scenario(
            user_id=current_user.user_id,
            course_id=course_id,
            scenario_id=scenario_id,
        )
    except CourseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ScenarioNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{scenario_id}/run")
def run_scenario(
    course_id: UUID,
    scenario_id: UUID,
    service: ScenarioService = Depends(get_scenario_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        return service.run_saved_scenario(
            user_id=current_user.user_id,
            course_id=course_id,
            scenario_id=scenario_id,
        )
    except CourseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ScenarioNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ScenarioValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{scenario_id}")
def delete_scenario(
    course_id: UUID,
    scenario_id: UUID,
    service: ScenarioService = Depends(get_scenario_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        return service.delete_scenario(
            user_id=current_user.user_id,
            course_id=course_id,
            scenario_id=scenario_id,
        )
    except CourseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ScenarioNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
