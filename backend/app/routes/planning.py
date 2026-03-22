from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends

from app.dependencies import get_current_user, get_planning_service
from app.services.auth_service import AuthenticatedUser
from app.services.planning_service import PlanningService

router = APIRouter(prefix="/planning", tags=["Planning"])


@router.get("/weekly")
def get_weekly_planner(
    start_date: date | None = None,
    service: PlanningService = Depends(get_planning_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    return service.get_weekly_planner(
        user_id=current_user.user_id,
        start_date=start_date,
    )


@router.get("/alerts")
def get_risk_alerts(
    reference_at: datetime | None = None,
    service: PlanningService = Depends(get_planning_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    return service.get_risk_alerts(
        user_id=current_user.user_id,
        reference_at=reference_at,
    )
