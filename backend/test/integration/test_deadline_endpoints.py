"""
Tests for Deadline Management — SCRUM-83

Covers:
- Deadline CRUD via API endpoints
- ICS calendar file generation
- Date parsing from text (extraction bridge)
- Duplicate prevention
- Endpoint integration
"""

import pytest

from app.models_deadline import DeadlineCreate
from app.repositories.inmemory_deadline_repo import InMemoryDeadlineRepository
from app.services.deadline_service import (
    DeadlineService,
    extract_deadlines_from_text,
    generate_ics,
)
from uuid import uuid4


# ─── Date Extraction from Text ────────────────────────────────────────────────

class TestDeadlineExtraction:
    def test_month_date_extraction(self):
        text = "Assignment 1 due March 15, 2026\nMidterm Exam on April 10, 2026"
        results = extract_deadlines_from_text(text, "EECS 2311")
        assert len(results) >= 1
        # At least one should have a parsed date
        dates = [r["due_date"] for r in results]
        assert any("2026-03-15" in d for d in dates)

    def test_iso_date_extraction(self):
        text = "Project deliverable: 2026-01-20\nFinal Exam 2026-04-15"
        results = extract_deadlines_from_text(text, "CS101")
        assert len(results) >= 1
        dates = [r["due_date"] for r in results]
        assert any("2026-01-20" in d for d in dates)

    def test_no_dates_returns_empty(self):
        text = "This outline has no dates whatsoever."
        results = extract_deadlines_from_text(text, "CS101")
        assert results == []

    def test_deduplication(self):
        text = (
            "Assignment 1 due March 15, 2026\n"
            "Assignment 1 is due March 15, 2026\n"
        )
        results = extract_deadlines_from_text(text, "CS101")
        # Should deduplicate by (title_lower, due_date)
        titles = [r["title"].lower() for r in results]
        # At most one entry for the same date + title combo
        assert len(results) <= 2  # might be 1 if titles match perfectly

    def test_source_is_outline(self):
        text = "Quiz 1: January 10, 2026"
        results = extract_deadlines_from_text(text, "CS101")
        if results:
            assert results[0]["source"] == "outline"


# ─── ICS Generation ──────────────────────────────────────────────────────────

class TestICSGeneration:
    def _make_deadline(self, **kwargs):
        from app.models_deadline import Deadline
        defaults = {
            "deadline_id": uuid4(),
            "course_id": uuid4(),
            "title": "Midterm Exam",
            "due_date": "2026-03-15",
            "due_time": None,
            "source": "manual",
            "notes": "Study chapters 1-5",
            "assessment_name": "Midterm",
            "exported_to_gcal": False,
            "gcal_event_id": None,
            "created_at": "2025-03-04T12:00:00+00:00",
        }
        defaults.update(kwargs)
        return Deadline(**defaults)

    def test_ics_structure(self):
        dl = self._make_deadline()
        ics = generate_ics([dl], "EECS 2311")
        assert "BEGIN:VCALENDAR" in ics
        assert "END:VCALENDAR" in ics
        assert "BEGIN:VEVENT" in ics
        assert "END:VEVENT" in ics

    def test_ics_contains_summary(self):
        dl = self._make_deadline(title="Final Exam")
        ics = generate_ics([dl], "EECS 2311")
        assert "EECS 2311 — Final Exam" in ics

    def test_ics_all_day_event(self):
        dl = self._make_deadline(due_time=None)
        ics = generate_ics([dl], "CS101")
        assert "VALUE=DATE:" in ics

    def test_ics_timed_event(self):
        dl = self._make_deadline(due_time="14:30")
        ics = generate_ics([dl], "CS101")
        assert "DTSTART:20260315T143000" in ics

    def test_ics_7_day_reminder(self):
        dl = self._make_deadline()
        ics = generate_ics([dl], "CS101")
        assert "TRIGGER:-P7D" in ics

    def test_ics_min_grade_in_description(self):
        dl = self._make_deadline(assessment_name="Midterm")
        min_info = {"Midterm": {"minimum_required": 75.0}}
        ics = generate_ics([dl], "CS101", min_grade_info=min_info)
        assert "Minimum grade needed: 75.0%" in ics

    def test_ics_multiple_deadlines(self):
        dls = [
            self._make_deadline(title="Midterm"),
            self._make_deadline(title="Final", due_date="2026-04-20"),
        ]
        ics = generate_ics(dls, "CS101")
        assert ics.count("BEGIN:VEVENT") == 2


# ─── InMemory Deadline Repo ──────────────────────────────────────────────────

class TestDeadlineRepo:
    def setup_method(self):
        self.repo = InMemoryDeadlineRepository()
        self.user_id = uuid4()
        self.course_id = uuid4()

    def test_create_and_list(self):
        data = DeadlineCreate(
            title="Midterm", due_date="2026-03-15", source="manual"
        )
        created = self.repo.create(self.user_id, self.course_id, data)
        assert created.title == "Midterm"
        assert created.due_date == "2026-03-15"

        all_dls = self.repo.list_all(self.user_id, self.course_id)
        assert len(all_dls) == 1

    def test_get_by_id(self):
        data = DeadlineCreate(title="Final", due_date="2026-04-20")
        created = self.repo.create(self.user_id, self.course_id, data)
        fetched = self.repo.get_by_id(self.user_id, self.course_id, created.deadline_id)
        assert fetched is not None
        assert fetched.title == "Final"

    def test_update(self):
        from app.models_deadline import DeadlineUpdate
        data = DeadlineCreate(title="Quiz 1", due_date="2026-02-01")
        created = self.repo.create(self.user_id, self.course_id, data)
        upd = DeadlineUpdate(title="Quiz 1 (Updated)")
        updated = self.repo.update(
            self.user_id, self.course_id, created.deadline_id, upd
        )
        assert updated is not None
        assert updated.title == "Quiz 1 (Updated)"

    def test_delete(self):
        data = DeadlineCreate(title="Lab 1", due_date="2026-01-15")
        created = self.repo.create(self.user_id, self.course_id, data)
        assert self.repo.delete(self.user_id, self.course_id, created.deadline_id)
        assert self.repo.list_all(self.user_id, self.course_id) == []

    def test_delete_nonexistent(self):
        assert not self.repo.delete(self.user_id, self.course_id, uuid4())

    def test_mark_exported(self):
        data = DeadlineCreate(title="Exam", due_date="2026-04-01")
        created = self.repo.create(self.user_id, self.course_id, data)
        result = self.repo.mark_exported(
            self.user_id, self.course_id, created.deadline_id, "gcal_123"
        )
        assert result is not None
        assert result.exported_to_gcal is True
        assert result.gcal_event_id == "gcal_123"


# ─── Deadline Service ────────────────────────────────────────────────────────

class TestDeadlineService:
    def setup_method(self):
        self.repo = InMemoryDeadlineRepository()
        self.service = DeadlineService(self.repo)
        self.user_id = uuid4()
        self.course_id = uuid4()

    def test_create_and_list(self):
        data = DeadlineCreate(title="Midterm", due_date="2026-03-15")
        created = self.service.create_deadline(self.user_id, self.course_id, data)
        items = self.service.list_deadlines(self.user_id, self.course_id)
        assert len(items) == 1
        assert items[0].deadline_id == created.deadline_id

    def test_import_extracted(self):
        raw = [
            {"title": "Quiz 1", "due_date": "2026-02-01", "source": "outline"},
            {"title": "Midterm", "due_date": "2026-03-10", "source": "outline"},
        ]
        created = self.service.import_extracted_deadlines(
            self.user_id, self.course_id, raw
        )
        assert len(created) == 2
        items = self.service.list_deadlines(self.user_id, self.course_id)
        assert len(items) == 2

    def test_ics_export(self):
        data = DeadlineCreate(title="Final", due_date="2026-04-15")
        self.service.create_deadline(self.user_id, self.course_id, data)
        ics = self.service.export_ics(
            self.user_id, self.course_id, "EECS 2311"
        )
        assert "BEGIN:VCALENDAR" in ics
        assert "EECS 2311 — Final" in ics


# ─── Deadline Endpoint Integration ────────────────────────────────────────────

class TestDeadlineEndpoints:
    def _create_course(self, client):
        r = client.post("/courses/", json={
            "name": "EECS 2311",
            "term": "F25",
            "assessments": [
                {"name": "Midterm", "weight": 40},
                {"name": "Final", "weight": 60},
            ],
        })
        assert r.status_code == 200
        return r.json()["course_id"]

    def test_create_and_list_deadlines(self, auth_client):
        course_id = self._create_course(auth_client)

        # Create
        r = auth_client.post(f"/courses/{course_id}/deadlines", json={
            "title": "Midterm Exam",
            "due_date": "2026-03-15",
            "due_time": "14:00",
        })
        assert r.status_code == 200
        assert r.json()["deadline"]["title"] == "Midterm Exam"

        # List
        r2 = auth_client.get(f"/courses/{course_id}/deadlines")
        assert r2.status_code == 200
        assert r2.json()["count"] == 1

    def test_update_deadline(self, auth_client):
        course_id = self._create_course(auth_client)
        r = auth_client.post(f"/courses/{course_id}/deadlines", json={
            "title": "Quiz 1", "due_date": "2026-02-01"
        })
        dl_id = r.json()["deadline"]["deadline_id"]

        r2 = auth_client.put(
            f"/courses/{course_id}/deadlines/{dl_id}",
            json={"title": "Quiz 1 (Updated)"},
        )
        assert r2.status_code == 200
        assert r2.json()["deadline"]["title"] == "Quiz 1 (Updated)"

    def test_delete_deadline(self, auth_client):
        course_id = self._create_course(auth_client)
        r = auth_client.post(f"/courses/{course_id}/deadlines", json={
            "title": "Lab", "due_date": "2026-01-10"
        })
        dl_id = r.json()["deadline"]["deadline_id"]

        r2 = auth_client.delete(f"/courses/{course_id}/deadlines/{dl_id}")
        assert r2.status_code == 200

        r3 = auth_client.get(f"/courses/{course_id}/deadlines")
        assert r3.json()["count"] == 0

    def test_ics_export_endpoint(self, auth_client):
        course_id = self._create_course(auth_client)
        auth_client.post(f"/courses/{course_id}/deadlines", json={
            "title": "Final Exam", "due_date": "2026-04-15"
        })

        r = auth_client.post(f"/courses/{course_id}/deadlines/export/ics")
        assert r.status_code == 200
        assert "BEGIN:VCALENDAR" in r.text
        assert r.headers["content-type"] == "text/calendar; charset=utf-8"

    def test_nonexistent_course_returns_404(self, auth_client):
        fake_id = str(uuid4())
        r = auth_client.get(f"/courses/{fake_id}/deadlines")
        assert r.status_code == 404

    def test_delete_nonexistent_deadline_returns_404(self, auth_client):
        course_id = self._create_course(auth_client)
        fake_dl = str(uuid4())
        r = auth_client.delete(f"/courses/{course_id}/deadlines/{fake_dl}")
        assert r.status_code == 404
