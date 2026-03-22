from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.config import (
    AUTH_ACCESS_TOKEN_EXPIRE_MINUTES,
    AUTH_COOKIE_NAME,
)
from app.dependencies import (
    get_auth_service,
    get_course_service,
    get_current_user,
    get_grade_target_repo,
)
from app.repositories.base import GradeTargetRepository
from app.services.auth_service import (
    AuthConflictError,
    AuthService,
    AuthValidationError,
    AuthenticatedUser,
    AuthenticationError,
)
from app.services.course_service import CourseService

router = APIRouter(prefix="/auth", tags=["Auth"])


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=8, max_length=128)


@router.post("/register")
def register_user(
    payload: RegisterRequest,
    auth_service: AuthService = Depends(get_auth_service),
):
    try:
        return auth_service.register_user(email=payload.email, password=payload.password)
    except AuthValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except AuthConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/login")
def login_user(
    payload: LoginRequest,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
):
    try:
        token = auth_service.login_user(email=payload.email, password=payload.password)
    except AuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    except AuthValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    max_age_seconds = AUTH_ACCESS_TOKEN_EXPIRE_MINUTES * 60
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=max_age_seconds,
        path="/",
    )
    return {"message": "Login successful"}


@router.post("/logout")
def logout_user(response: Response):
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
    )
    return {"message": "Logout successful"}


@router.get("/me")
def get_me(current_user: AuthenticatedUser = Depends(get_current_user)):
    return {
        "user_id": str(current_user.user_id),
        "email": current_user.email,
    }


@router.get("/me/state")
def get_user_state(
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: CourseService = Depends(get_course_service),
    grade_target_repo: GradeTargetRepository = Depends(get_grade_target_repo),
):
    # Pragmatic placement for ITR3-1; move to a dedicated users/profile router if this expands.
    courses = service.list_courses(user_id=current_user.user_id)
    course_summaries = []
    for course in courses:
        course_id = course["course_id"]
        target_record = grade_target_repo.get_target(
            user_id=current_user.user_id,
            course_id=course_id,
        )
        target_pct = (
            float(target_record.target_percentage)
            if target_record and target_record.target_percentage is not None
            else None
        )

        summary = {
            "course_id": str(course_id),
            "name": course.get("name", ""),
            "term": course.get("term"),
            "assessment_count": len(course.get("assessments", [])),
            "target_percentage": target_pct,
        }
        course_summaries.append(summary)

    return {
        "user_id": str(current_user.user_id),
        "email": current_user.email,
        "has_courses": len(course_summaries) > 0,
        "courses": course_summaries,
    }
