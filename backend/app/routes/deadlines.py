"""
Deadline Management Endpoints — SCRUM-83

POST   /courses/{cid}/deadlines/extract      → OCR-extract deadlines from uploaded file
GET    /courses/{cid}/deadlines               → list deadlines
POST   /courses/{cid}/deadlines               → create manual deadline
PUT    /courses/{cid}/deadlines/{did}         → update deadline
DELETE /courses/{cid}/deadlines/{did}         → delete deadline
POST   /courses/{cid}/deadlines/export/ics    → download .ics file
POST   /courses/{cid}/deadlines/export/gcal   → export to Google Calendar
GET    /deadlines/google/authorize             → Google OAuth2 consent URL
GET    /deadlines/google/callback              → Google OAuth2 callback
"""

from __future__ import annotations

import os
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, Field

from app.config import AUTH_COOKIE_NAME
# Frontend URL for OAuth callback redirect
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

from app.dependencies import (
    get_auth_service,
    get_course_service,
    get_current_user,
    get_deadline_service,
    get_extraction_service,
    get_user_repo,
)
from app.models_deadline import (
    Deadline,
    DeadlineCreate,
    DeadlineExportRequest,
    DeadlineExportResponse,
    DeadlineListResponse,
    GoogleConnectionStatusResponse,
    DeadlineUpdate,
    GoogleAuthUrlResponse,
)
from app.repositories.base import UserRepository
from app.services.auth_service import AuthService, AuthenticatedUser, AuthenticationError
from app.services.course_service import CourseNotFoundError, CourseService
from app.services.deadline_service import (
    DeadlineValidationError,
    DeadlineService,
    GoogleCalendarError,
    extract_deadlines_from_text,
    get_google_auth_url,
    exchange_google_code,
    google_calendar_configured,
)
from app.services.extraction_service import ExtractionService

router = APIRouter(tags=["Deadlines"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _ensure_course_exists(service: CourseService, user_id: UUID, course_id: UUID):
    """Validate that the course belongs to the authenticated user."""
    try:
        return service._get_course_or_raise(user_id=user_id, course_id=course_id)
    except CourseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _resolve_google_callback_user(
    request: Request,
    state: str,
    auth_service: AuthService,
    user_repo: UserRepository,
) -> AuthenticatedUser:
    """Resolve the user for the OAuth callback from cookie first, then state."""
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if token:
        try:
            return auth_service.get_current_user(token)
        except AuthenticationError:
            pass

    if state:
        try:
            return auth_service.get_current_user(state)
        except AuthenticationError:
            pass

        try:
            user_id = UUID(state)
        except ValueError as exc:
            raise HTTPException(
                status_code=401,
                detail="Authentication required to complete Google Calendar connection",
            ) from exc

        stored_user = user_repo.get_by_id(user_id)
        if stored_user is not None:
            return AuthenticatedUser(user_id=stored_user.user_id, email=stored_user.email)

    raise HTTPException(
        status_code=401,
        detail="Authentication required to complete Google Calendar connection",
    )


# ─── Extraction ────────────────────────────────────────────────────────────────

@router.post("/courses/{course_id}/deadlines/extract")
async def extract_deadlines(
    course_id: UUID,
    file: UploadFile = File(...),
    course_service: CourseService = Depends(get_course_service),
    extraction_service: ExtractionService = Depends(get_extraction_service),
    dl_service: DeadlineService = Depends(get_deadline_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Upload a course outline (PDF / image) and extract deadlines via OCR.

    Flow:
    1. Reuse the existing ``ExtractionService`` to extract text.
    2. Run lightweight date-line parser (``extract_deadlines_from_text``).
    3. Save extracted deadlines to the in-memory repo.
    4. Return the deadlines for review / edit before calendar export.
    """
    stored = _ensure_course_exists(course_service, current_user.user_id, course_id)

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=422, detail="File is empty")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    # Step 1 — extract text using existing pipeline
    try:
        extraction_result = extraction_service.extract(
            filename=file.filename or "uploaded_file",
            content_type=file.content_type or "application/octet-stream",
            file_bytes=file_bytes,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=422, detail=f"Extraction failed: {exc}"
        ) from exc

    # Step 2 — Use any deadlines the extraction service already found
    candidates: list[dict[str, Any]] = []
    if extraction_result.deadlines:
        for ed in extraction_result.deadlines:
            candidates.append({
                "title": ed.title,
                "deadline_type": getattr(ed, "deadline_type", None),
                "due_date": ed.due_date or "",
                "due_time": ed.due_time,
                "source": "outline",
                "notes": ed.notes,
                "assessment_name": ed.title,
            })

    # Step 3 — Additionally run our lightweight parser on raw text.
    # If the extraction response doesn't expose raw_text, re-run text ingest
    # directly from uploaded bytes to keep deadline extraction robust.
    raw_text = getattr(extraction_result, "raw_text", "")
    if not raw_text:
        try:
            text_result = extraction_service._extract_text(
                filename=file.filename or "uploaded_file",
                content_type=file.content_type or "application/octet-stream",
                file_bytes=file_bytes,
            )
            raw_text = text_result.get("text", "")
        except Exception:
            raw_text = ""
    if raw_text:
        parsed = extract_deadlines_from_text(raw_text, stored.course.name)
        # Merge, avoiding duplicates by (title_lower, due_date)
        existing_keys = {(c["title"].lower(), c["due_date"]) for c in candidates}
        for p in parsed:
            key = (p["title"].lower(), p["due_date"])
            if key not in existing_keys:
                candidates.append(p)
                existing_keys.add(key)

    # Step 4 — Persist and return
    if not candidates:
        return {
            "message": "No deadlines could be extracted. Add them manually.",
            "deadlines": [],
            "count": 0,
        }

    created = dl_service.import_extracted_deadlines(
        user_id=current_user.user_id,
        course_id=course_id,
        raw_deadlines=candidates,
    )

    return {
        "message": f"Extracted {len(created)} deadline(s) from the outline.",
        "deadlines": [d.model_dump() for d in created],
        "count": len(created),
    }


# ─── CRUD ──────────────────────────────────────────────────────────────────────

@router.get(
    "/courses/{course_id}/deadlines",
    response_model=DeadlineListResponse,
)
def list_deadlines(
    course_id: UUID,
    course_service: CourseService = Depends(get_course_service),
    dl_service: DeadlineService = Depends(get_deadline_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    _ensure_course_exists(course_service, current_user.user_id, course_id)
    items = dl_service.list_deadlines(current_user.user_id, course_id)
    return DeadlineListResponse(deadlines=items, count=len(items))


@router.post("/courses/{course_id}/deadlines")
def create_deadline(
    course_id: UUID,
    payload: DeadlineCreate,
    course_service: CourseService = Depends(get_course_service),
    dl_service: DeadlineService = Depends(get_deadline_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    _ensure_course_exists(course_service, current_user.user_id, course_id)
    deadline = dl_service.create_deadline(
        current_user.user_id, course_id, payload
    )
    return {"message": "Deadline created", "deadline": deadline.model_dump()}


@router.put("/courses/{course_id}/deadlines/{deadline_id}")
def update_deadline(
    course_id: UUID,
    deadline_id: UUID,
    payload: DeadlineUpdate,
    course_service: CourseService = Depends(get_course_service),
    dl_service: DeadlineService = Depends(get_deadline_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    _ensure_course_exists(course_service, current_user.user_id, course_id)
    updated = dl_service.update_deadline(
        current_user.user_id, course_id, deadline_id, payload
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Deadline not found")
    return {"message": "Deadline updated", "deadline": updated.model_dump()}


@router.delete("/courses/{course_id}/deadlines/{deadline_id}")
def delete_deadline(
    course_id: UUID,
    deadline_id: UUID,
    course_service: CourseService = Depends(get_course_service),
    dl_service: DeadlineService = Depends(get_deadline_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    _ensure_course_exists(course_service, current_user.user_id, course_id)
    removed = dl_service.delete_deadline(
        current_user.user_id, course_id, deadline_id
    )
    if not removed:
        raise HTTPException(status_code=404, detail="Deadline not found")
    return {"message": "Deadline deleted"}


# ─── Export: ICS Download ──────────────────────────────────────────────────────

@router.post("/courses/{course_id}/deadlines/export/ics")
def export_ics(
    course_id: UUID,
    payload: DeadlineExportRequest = DeadlineExportRequest(),
    course_service: CourseService = Depends(get_course_service),
    dl_service: DeadlineService = Depends(get_deadline_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Generate and return an .ics (iCalendar) file for the selected deadlines.
    Works with Google Calendar, Apple Calendar, Outlook, etc.
    """
    stored = _ensure_course_exists(course_service, current_user.user_id, course_id)
    try:
        ics_content = dl_service.export_ics(
            user_id=current_user.user_id,
            course_id=course_id,
            course_name=stored.course.name,
            deadline_ids=payload.deadline_ids,
            min_grade_info=payload.min_grade_info,
        )
    except DeadlineValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return Response(
        content=ics_content,
        media_type="text/calendar",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{stored.course.name}_deadlines.ics"'
            )
        },
    )


# ─── Export: Google Calendar ───────────────────────────────────────────────────

@router.get("/deadlines/google/authorize", response_model=GoogleAuthUrlResponse)
def google_authorize(
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Return the Google OAuth2 consent URL.  The frontend redirects the user
    there.  After consent, Google redirects to ``/deadlines/google/callback``.

    Returns 501 if ``GOOGLE_CLIENT_ID`` is not configured.
    """
    try:
        return get_google_auth_url(
            state=request.cookies.get(AUTH_COOKIE_NAME, str(current_user.user_id))
        )
    except GoogleCalendarError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc


@router.get("/deadlines/google/status", response_model=GoogleConnectionStatusResponse)
def google_status(
    dl_service: DeadlineService = Depends(get_deadline_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    return GoogleConnectionStatusResponse(
        connected=bool(dl_service.get_google_access_token(current_user.user_id))
    )


@router.get("/deadlines/google/callback")
def google_callback(
    request: Request,
    code: str = Query(...),
    state: str = Query(default=""),
    dl_service: DeadlineService = Depends(get_deadline_service),
    auth_service: AuthService = Depends(get_auth_service),
    user_repo: UserRepository = Depends(get_user_repo),
):
    """
    Handle the Google OAuth2 callback.  Exchanges the authorization code
    for tokens and stores them (in-memory, per user).
    Redirects back to frontend after success.
    """
    current_user = _resolve_google_callback_user(
        request=request,
        state=state,
        auth_service=auth_service,
        user_repo=user_repo,
    )

    try:
        tokens = exchange_google_code(code)
    except GoogleCalendarError as exc:
        # Redirect to frontend with error
        return RedirectResponse(
            url=f"{FRONTEND_URL}/setup/deadlines?gcal_error={exc}",
            status_code=302,
        )

    dl_service.store_google_tokens(current_user.user_id, tokens)
    # Redirect to frontend with success
    return RedirectResponse(
        url=f"{FRONTEND_URL}/setup/deadlines?gcal_connected=true",
        status_code=302,
    )


@router.post(
    "/courses/{course_id}/deadlines/export/gcal",
    response_model=DeadlineExportResponse,
)
def export_to_google_calendar(
    course_id: UUID,
    payload: DeadlineExportRequest = DeadlineExportRequest(),
    course_service: CourseService = Depends(get_course_service),
    dl_service: DeadlineService = Depends(get_deadline_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Export selected (or all) deadlines to the user's Google Calendar.
    Duplicate-prevention: already-exported deadlines are skipped.

    Requires a prior OAuth flow (see ``/deadlines/google/authorize``).
    Returns 501 if Google Calendar is not configured, or 401 if the
    OAuth flow has not been completed.
    """
    if not google_calendar_configured():
        raise HTTPException(
            status_code=501,
            detail="Google Calendar integration is not configured.",
        )

    stored = _ensure_course_exists(course_service, current_user.user_id, course_id)

    try:
        result = dl_service.export_to_google_calendar(
            user_id=current_user.user_id,
            course_id=course_id,
            course_name=stored.course.name,
            deadline_ids=payload.deadline_ids,
            min_grade_info=payload.min_grade_info,
        )
    except GoogleCalendarError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except DeadlineValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return DeadlineExportResponse(
        exported_count=result["exported_count"],
        skipped_duplicates=result["skipped_duplicates"],
        events=result["events"],
    )
