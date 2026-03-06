"""
Deadline Management Service — SCRUM-83

Orchestrates deadline CRUD, OCR-based extraction bridge,
ICS calendar generation, and Google Calendar export.

Design decisions
────────────────
- Extraction reuses the existing ``ExtractionService`` pipeline for
  PDF / image text extraction, then applies a lightweight date-line
  parser to find assessment–deadline pairs.
- ``generate_ics()`` produces RFC-5545 iCalendar text with zero
  external dependencies — works with Google, Apple, and Outlook
  calendar import.
- Google Calendar integration uses stdlib ``urllib`` to avoid adding
  pip dependencies.  If ``GOOGLE_CLIENT_ID`` is not configured the
  export endpoint returns 501 gracefully.
- Duplicate-prevention: each deadline tracks ``exported_to_gcal`` +
  ``gcal_event_id``.  Re-exporting the same deadline is a no-op.
"""

from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from app.models_deadline import (
    Deadline,
    DeadlineCreate,
)
from app.repositories.base import DeadlineRepository

# ─── Date-parsing regexes (shared with extraction_service) ────────────────────

_MONTH_DATE_RE = re.compile(
    r"\b((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    r"\s+\d{1,2}(?:,\s*\d{4})?)\b",
    re.IGNORECASE,
)
_NUMERIC_DATE_RE = re.compile(
    r"\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b"
)
_TIME_RE = re.compile(
    r"(?:\b([01]?\d|2[0-3]):[0-5]\d(?:\s?(?:am|pm))?\b)|"
    r"(?:\b(1[0-2]|0?[1-9])\s?(?:am|pm)\b)",
    re.IGNORECASE,
)

_ASSESSMENT_HINTS = {
    "assignment", "quiz", "quizzes", "test", "midterm", "final",
    "exam", "lab", "project", "presentation", "report", "essay",
    "homework", "deliverable", "tutorial", "participation",
}

# ─── Google Calendar config ───────────────────────────────────────────────────

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI", "http://localhost:8000/deadlines/google/callback"
)
_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"
_SCOPES = "https://www.googleapis.com/auth/calendar.events"


def google_calendar_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID) and bool(GOOGLE_CLIENT_SECRET)


# ─── Lightweight date parser ──────────────────────────────────────────────────

_MONTH_MAP = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "september": 9, "oct": 10, "october": 10,
    "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def _parse_date_str(raw: str) -> str | None:
    """Try to parse a raw date string into ISO-8601 YYYY-MM-DD."""
    raw = raw.strip()

    # ISO format: 2026-03-15
    if re.match(r"^\d{4}-\d{1,2}-\d{1,2}$", raw):
        try:
            datetime.strptime(raw, "%Y-%m-%d")
            return raw
        except ValueError:
            return None

    # "March 15, 2026" or "Mar 15"
    month_match = re.match(
        r"(\w+)\s+(\d{1,2})(?:,\s*(\d{4}))?", raw, re.IGNORECASE
    )
    if month_match:
        month_name = month_match.group(1).lower()
        day = int(month_match.group(2))
        year = int(month_match.group(3)) if month_match.group(3) else date.today().year
        month = _MONTH_MAP.get(month_name)
        if month:
            try:
                return date(year, month, day).isoformat()
            except ValueError:
                return None

    # MM/DD/YYYY or DD/MM/YYYY — assume MM/DD (North American)
    slash = re.match(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})", raw)
    if slash:
        a, b, c = int(slash.group(1)), int(slash.group(2)), int(slash.group(3))
        year = c if c > 99 else (2000 + c)
        try:
            return date(year, a, b).isoformat()
        except ValueError:
            try:
                return date(year, b, a).isoformat()
            except ValueError:
                return None

    return None


def _parse_time_str(raw: str) -> str | None:
    """Best-effort parse to HH:MM (24h)."""
    raw = raw.strip().lower()
    m = re.match(r"(\d{1,2}):(\d{2})\s*(am|pm)?", raw)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        if m.group(3) == "pm" and h < 12:
            h += 12
        elif m.group(3) == "am" and h == 12:
            h = 0
        return f"{h:02d}:{mi:02d}"
    m2 = re.match(r"(\d{1,2})\s*(am|pm)", raw)
    if m2:
        h = int(m2.group(1))
        if m2.group(2) == "pm" and h < 12:
            h += 12
        elif m2.group(2) == "am" and h == 12:
            h = 0
        return f"{h:02d}:00"
    return None


def extract_deadlines_from_text(
    text: str,
    course_name: str = "",
) -> list[dict[str, Any]]:
    """
    Scan raw document text for lines containing dates near assessment-like
    keywords.  Returns a list of candidate deadline dicts (not yet stored).

    This is intentionally **best-effort**: OCR and outline formatting vary
    wildly.  If nothing useful is found the caller should return an empty
    list with a clear status so the frontend shows "Add Deadline".
    """
    results: list[dict[str, Any]] = []
    lines = text.splitlines()

    for idx, line in enumerate(lines):
        # Look for a date on this line
        date_match = _MONTH_DATE_RE.search(line) or _NUMERIC_DATE_RE.search(line)
        if not date_match:
            continue

        parsed_date = _parse_date_str(date_match.group(1))
        if not parsed_date:
            continue

        # Look for a time on the same line
        time_match = _TIME_RE.search(line)
        parsed_time = _parse_time_str(time_match.group(0)) if time_match else None

        # Try to extract an assessment title from this line or nearby lines
        title = _extract_title_near(lines, idx, line)
        if not title:
            title = f"Deadline ({parsed_date})"

        results.append({
            "title": title,
            "due_date": parsed_date,
            "due_time": parsed_time,
            "source": "outline",
            "notes": f"Extracted from line: {line.strip()[:120]}",
            "assessment_name": _guess_assessment_name(title),
        })

    # De-duplicate by (title, due_date)
    seen: set[tuple[str, str]] = set()
    unique: list[dict[str, Any]] = []
    for r in results:
        key = (r["title"].lower(), r["due_date"])
        if key not in seen:
            seen.add(key)
            unique.append(r)

    return unique


def _extract_title_near(lines: list[str], idx: int, current_line: str) -> str | None:
    """Heuristic: find an assessment-like title in the current line or ±2 lines."""
    search_window = [current_line]
    for offset in (-1, -2, 1, 2):
        neighbor = idx + offset
        if 0 <= neighbor < len(lines):
            search_window.append(lines[neighbor])

    for text in search_window:
        lower = text.lower()
        for hint in _ASSESSMENT_HINTS:
            if hint in lower:
                # Extract a clean title: take the text around the keyword
                cleaned = re.sub(r"\s+", " ", text.strip())
                # Limit length
                if len(cleaned) > 80:
                    cleaned = cleaned[:77] + "..."
                return cleaned
    return None


def _guess_assessment_name(title: str) -> str | None:
    """Try to match the title to a known assessment keyword for linking."""
    lower = title.lower()
    for hint in _ASSESSMENT_HINTS:
        if hint in lower:
            return title
    return None


# ─── ICS Calendar Generation ─────────────────────────────────────────────────

def generate_ics(
    deadlines: list[Deadline],
    course_name: str,
    min_grade_info: dict[str, Any] | None = None,
) -> str:
    """
    Generate an RFC-5545 iCalendar (.ics) string.

    Each deadline becomes a VEVENT with:
    - Summary: ``course_name — deadline.title``
    - DTSTART on the due date/time (all-day if no time)
    - VALARM trigger 7 days before
    - Description includes minimum grade needed (if available)
    """
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Evalio//Deadline Export//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]

    for dl in deadlines:
        uid = f"{dl.deadline_id}@evalio"
        summary = f"{course_name} — {dl.title}"

        # Build description
        desc_parts = []
        if dl.notes:
            desc_parts.append(dl.notes)
        if dl.assessment_name and min_grade_info:
            grade_data = min_grade_info.get(dl.assessment_name)
            if grade_data:
                desc_parts.append(
                    f"Minimum grade needed: {grade_data.get('minimum_required', '?')}%"
                )
        desc_parts.append(f"Source: {dl.source}")
        description = "\\n".join(desc_parts)

        # Date/time
        if dl.due_time:
            # Event with time
            dt_str = dl.due_date.replace("-", "") + "T" + dl.due_time.replace(":", "") + "00"
            lines.append("BEGIN:VEVENT")
            lines.append(f"UID:{uid}")
            lines.append(f"DTSTART:{dt_str}")
            lines.append(f"DTEND:{dt_str}")
        else:
            # All-day event
            dt_str = dl.due_date.replace("-", "")
            lines.append("BEGIN:VEVENT")
            lines.append(f"UID:{uid}")
            lines.append(f"DTSTART;VALUE=DATE:{dt_str}")
            lines.append(f"DTEND;VALUE=DATE:{dt_str}")

        lines.append(f"SUMMARY:{summary}")
        lines.append(f"DESCRIPTION:{description}")

        # 7-day reminder
        lines.append("BEGIN:VALARM")
        lines.append("TRIGGER:-P7D")
        lines.append("ACTION:DISPLAY")
        lines.append(f"DESCRIPTION:Reminder: {summary} is due in 1 week")
        lines.append("END:VALARM")

        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines)


# ─── Google Calendar OAuth2 + Event Creation ──────────────────────────────────

class GoogleCalendarError(Exception):
    pass


def get_google_auth_url(state: str = "") -> dict[str, str]:
    """Return the Google OAuth2 consent URL.  Raises if not configured."""
    if not google_calendar_configured():
        raise GoogleCalendarError(
            "Google Calendar integration is not configured. "
            "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables."
        )
    params = urllib.parse.urlencode({
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": _SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    })
    return {
        "authorization_url": f"{_GOOGLE_AUTH_URL}?{params}",
        "state": state,
    }


def exchange_google_code(code: str) -> dict[str, Any]:
    """Exchange an authorization code for access + refresh tokens."""
    if not google_calendar_configured():
        raise GoogleCalendarError("Google Calendar not configured")

    data = urllib.parse.urlencode({
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }).encode()

    req = urllib.request.Request(
        _GOOGLE_TOKEN_URL,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as exc:
        raise GoogleCalendarError(f"Token exchange failed: {exc}") from exc


def create_google_calendar_event(
    access_token: str,
    deadline: Deadline,
    course_name: str,
    min_grade_text: str = "",
) -> dict[str, Any]:
    """Create a single event on the user's primary Google Calendar."""
    summary = f"{course_name} — {deadline.title}"

    desc_parts = [f"Course: {course_name}"]
    if deadline.notes:
        desc_parts.append(deadline.notes)
    if min_grade_text:
        desc_parts.append(min_grade_text)
    desc_parts.append(f"Source: {deadline.source}")

    event_body: dict[str, Any] = {
        "summary": summary,
        "description": "\n".join(desc_parts),
    }

    if deadline.due_time:
        dt = f"{deadline.due_date}T{deadline.due_time}:00"
        event_body["start"] = {"dateTime": dt, "timeZone": "America/Toronto"}
        event_body["end"] = {"dateTime": dt, "timeZone": "America/Toronto"}
    else:
        event_body["start"] = {"date": deadline.due_date}
        event_body["end"] = {"date": deadline.due_date}

    # 7-day reminder
    event_body["reminders"] = {
        "useDefault": False,
        "overrides": [{"method": "popup", "minutes": 7 * 24 * 60}],
    }

    url = f"{_GOOGLE_CALENDAR_API}/calendars/primary/events"
    body = json.dumps(event_body).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as exc:
        raise GoogleCalendarError(f"Calendar event creation failed: {exc}") from exc


# ─── DeadlineService (stateful, uses repo) ────────────────────────────────────

class DeadlineService:
    """
    Orchestrates deadline CRUD and export.

    Injected via FastAPI ``Depends()`` — see ``dependencies.py``.
    """

    def __init__(self, repository: DeadlineRepository) -> None:
        self._repo = repository
        # In-memory Google token storage per user_id (for dev).
        # TODO (SCRUM-85): move to DB when deadline schema lands.
        self._google_tokens: dict[UUID, dict[str, Any]] = {}

    # ── CRUD ──

    def create_deadline(
        self, user_id: UUID, course_id: UUID, data: DeadlineCreate
    ) -> Deadline:
        return self._repo.create(user_id, course_id, data)

    def list_deadlines(self, user_id: UUID, course_id: UUID) -> list[Deadline]:
        return self._repo.list_all(user_id, course_id)

    def get_deadline(
        self, user_id: UUID, course_id: UUID, deadline_id: UUID
    ) -> Deadline | None:
        return self._repo.get_by_id(user_id, course_id, deadline_id)

    def update_deadline(
        self, user_id: UUID, course_id: UUID, deadline_id: UUID, data: Any
    ) -> Deadline | None:
        return self._repo.update(user_id, course_id, deadline_id, data)

    def delete_deadline(
        self, user_id: UUID, course_id: UUID, deadline_id: UUID
    ) -> bool:
        return self._repo.delete(user_id, course_id, deadline_id)

    # ── Bulk import from extraction ──

    def import_extracted_deadlines(
        self,
        user_id: UUID,
        course_id: UUID,
        raw_deadlines: list[dict[str, Any]],
    ) -> list[Deadline]:
        """Save a batch of extracted deadline dicts to the repo."""
        created: list[Deadline] = []
        for raw in raw_deadlines:
            dl_create = DeadlineCreate(
                title=raw.get("title", "Untitled"),
                due_date=raw.get("due_date", date.today().isoformat()),
                due_time=raw.get("due_time"),
                source=raw.get("source", "outline"),
                notes=raw.get("notes"),
                assessment_name=raw.get("assessment_name"),
            )
            created.append(self._repo.create(user_id, course_id, dl_create))
        return created

    # ── ICS Export ──

    def export_ics(
        self,
        user_id: UUID,
        course_id: UUID,
        course_name: str,
        deadline_ids: list[UUID] | None = None,
        min_grade_info: dict[str, Any] | None = None,
    ) -> str:
        """Generate .ics content for selected (or all) deadlines."""
        all_dls = self._repo.list_all(user_id, course_id)
        if deadline_ids is not None:
            id_set = set(deadline_ids)
            all_dls = [d for d in all_dls if d.deadline_id in id_set]
        return generate_ics(all_dls, course_name, min_grade_info)

    # ── Google Calendar Export ──

    def store_google_tokens(self, user_id: UUID, tokens: dict[str, Any]) -> None:
        self._google_tokens[user_id] = tokens

    def get_google_access_token(self, user_id: UUID) -> str | None:
        tokens = self._google_tokens.get(user_id)
        return tokens.get("access_token") if tokens else None

    def export_to_google_calendar(
        self,
        user_id: UUID,
        course_id: UUID,
        course_name: str,
        deadline_ids: list[UUID] | None = None,
        min_grade_info: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Export deadlines to Google Calendar.  Skips already-exported
        deadlines (duplicate prevention via ``exported_to_gcal``).
        """
        access_token = self.get_google_access_token(user_id)
        if not access_token:
            raise GoogleCalendarError(
                "No Google access token found. Complete OAuth flow first."
            )

        all_dls = self._repo.list_all(user_id, course_id)
        if deadline_ids is not None:
            id_set = set(deadline_ids)
            all_dls = [d for d in all_dls if d.deadline_id in id_set]

        exported = 0
        skipped = 0
        events: list[dict[str, Any]] = []

        for dl in all_dls:
            # ── Duplicate prevention ──
            if dl.exported_to_gcal:
                skipped += 1
                continue

            min_grade_text = ""
            if dl.assessment_name and min_grade_info:
                info = min_grade_info.get(dl.assessment_name)
                if info:
                    min_grade_text = (
                        f"Minimum grade needed: {info.get('minimum_required', '?')}%"
                    )

            try:
                result = create_google_calendar_event(
                    access_token=access_token,
                    deadline=dl,
                    course_name=course_name,
                    min_grade_text=min_grade_text,
                )
                gcal_id = result.get("id", str(uuid4()))
                self._repo.mark_exported(user_id, course_id, dl.deadline_id, gcal_id)
                events.append({
                    "deadline_id": str(dl.deadline_id),
                    "gcal_event_id": gcal_id,
                    "status": "exported",
                })
                exported += 1
            except GoogleCalendarError:
                events.append({
                    "deadline_id": str(dl.deadline_id),
                    "status": "failed",
                })

        return {
            "exported_count": exported,
            "skipped_duplicates": skipped,
            "events": events,
        }
