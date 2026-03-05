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

from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.dependencies import (
    get_course_service,
    get_current_user,
    get_deadline_service,
    get_extraction_service,
)
from app.models_deadline import (
    Deadline,
    DeadlineCreate,
    DeadlineExportRequest,
    DeadlineExportResponse,
    DeadlineListResponse,
    DeadlineUpdate,
    GoogleAuthUrlResponse,
)
from app.services.auth_service import AuthenticatedUser
from app.services.course_service import CourseNotFoundError, CourseService
from app.services.deadline_service import (
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
                "due_date": ed.due_date or "",
                "due_time": ed.due_time,
                "source": "outline",
                "notes": ed.notes,
                "assessment_name": ed.title,
            })

    # Step 3 — Additionally run our lightweight parser on raw text
    #          (extraction_result may include a raw_text field; fall back to
    #          concatenating assessment titles if not)
    raw_text = getattr(extraction_result, "raw_text", "")
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
    ics_content = dl_service.export_ics(
        user_id=current_user.user_id,
        course_id=course_id,
        course_name=stored.course.name,
        deadline_ids=payload.deadline_ids,
    )
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
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Return the Google OAuth2 consent URL.  The frontend redirects the user
    there.  After consent, Google redirects to ``/deadlines/google/callback``.

    Returns 501 if ``GOOGLE_CLIENT_ID`` is not configured.
    """
    try:
        return get_google_auth_url(state=str(current_user.user_id))
    except GoogleCalendarError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc


@router.get("/deadlines/google/callback")
def google_callback(
    code: str = Query(...),
    state: str = Query(default=""),
    dl_service: DeadlineService = Depends(get_deadline_service),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Handle the Google OAuth2 callback.  Exchanges the authorization code
    for tokens and stores them (in-memory, per user).
    """
    try:
        tokens = exchange_google_code(code)
    except GoogleCalendarError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    dl_service.store_google_tokens(current_user.user_id, tokens)
    return {"message": "Google Calendar connected successfully"}


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
        )
    except GoogleCalendarError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    return DeadlineExportResponse(
        exported_count=result["exported_count"],
        skipped_duplicates=result["skipped_duplicates"],
        events=result["events"],
    )
