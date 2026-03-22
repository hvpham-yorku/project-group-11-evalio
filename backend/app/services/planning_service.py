from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from app.repositories.base import StoredCourse
from app.repositories.base import GradeTargetRepository
from app.services.course_service import CourseService
from app.services.deadline_service import DeadlineService
from app.services.grading_service import (
    _get_target_weight,
    _is_assessment_fully_graded,
    _target_label,
    resolve_assessment_target,
)

PLANNING_TIMEZONE = ZoneInfo("America/Toronto")
WEEKLY_WINDOW_DAYS = 7
CONFLICT_WINDOW_HOURS = 48
NEAR_TERM_WINDOW_HOURS = 72
HIGH_WEIGHT_THRESHOLD = 20.0

_SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}
_ALERT_TYPE_ORDER = {
    "overdue_deadline": 0,
    "impossible_target": 1,
    "near_term_deadline": 2,
    "high_weight_ungraded": 3,
}


class PlanningService:
    def __init__(
        self,
        course_service: CourseService,
        deadline_service: DeadlineService,
        grade_target_repo: GradeTargetRepository,
    ) -> None:
        self._course_service = course_service
        self._deadline_service = deadline_service
        self._grade_target_repo = grade_target_repo

    def get_weekly_planner(
        self,
        user_id,
        *,
        start_date: date | None = None,
    ) -> dict[str, Any]:
        window_start = start_date or self._now().date()
        window_end = window_start + timedelta(days=WEEKLY_WINDOW_DAYS - 1)

        items: list[dict[str, Any]] = []
        for stored_course in self._course_service.list_stored_courses(user_id):
            items.extend(
                self._build_weekly_items_for_course(
                    user_id=user_id,
                    stored_course=stored_course,
                    window_start=window_start,
                    window_end=window_end,
                )
            )

        items.sort(key=self._weekly_item_sort_key)
        conflicts = self._detect_conflicts(items)

        days: list[dict[str, Any]] = []
        for offset in range(WEEKLY_WINDOW_DAYS):
            current_date = window_start + timedelta(days=offset)
            day_items = [item for item in items if item["due_date"] == current_date.isoformat()]
            days.append(
                {
                    "date": current_date.isoformat(),
                    "item_count": len(day_items),
                    "course_count": len({item["course_id"] for item in day_items}),
                    "items": day_items,
                }
            )

        busiest_day = None
        if days:
            busiest_day_entry = max(days, key=lambda day: (day["item_count"], day["date"]))
            if busiest_day_entry["item_count"] > 0:
                busiest_day = {
                    "date": busiest_day_entry["date"],
                    "item_count": busiest_day_entry["item_count"],
                    "course_count": busiest_day_entry["course_count"],
                }

        return {
            "window": {
                "start_date": window_start.isoformat(),
                "end_date": window_end.isoformat(),
                "day_count": WEEKLY_WINDOW_DAYS,
                "timezone": "America/Toronto",
                "conflict_window_hours": CONFLICT_WINDOW_HOURS,
            },
            "summary": {
                "item_count": len(items),
                "course_count": len({item["course_id"] for item in items}),
                "days_with_items": sum(1 for day in days if day["item_count"] > 0),
                "conflict_count": len(conflicts),
                "busiest_day": busiest_day,
            },
            "days": days,
            "items": items,
            "conflicts": conflicts,
        }

    def get_risk_alerts(
        self,
        user_id,
        *,
        reference_at: datetime | None = None,
    ) -> dict[str, Any]:
        reference_point = self._normalize_datetime(reference_at) if reference_at else self._now()
        alerts: list[dict[str, Any]] = []

        for stored_course in self._course_service.list_stored_courses(user_id):
            alerts.extend(
                self._build_deadline_alerts_for_course(
                    user_id=user_id,
                    stored_course=stored_course,
                    reference_point=reference_point,
                )
            )
            alerts.extend(
                self._build_target_alerts_for_course(
                    user_id=user_id,
                    stored_course=stored_course,
                )
            )
            alerts.extend(
                self._build_ungraded_alerts_for_course(
                    user_id=user_id,
                    stored_course=stored_course,
                    reference_point=reference_point,
                )
            )

        alerts.sort(key=self._alert_sort_key)
        ranked_alerts: list[dict[str, Any]] = []
        for index, alert in enumerate(alerts, start=1):
            ranked_alert = dict(alert)
            ranked_alert["rank"] = index
            ranked_alerts.append(ranked_alert)

        severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        type_counts: dict[str, int] = {}
        for alert in ranked_alerts:
            severity_counts[alert["severity"]] += 1
            type_counts[alert["type"]] = type_counts.get(alert["type"], 0) + 1

        return {
            "generated_at": reference_point.isoformat(),
            "reference_at": reference_point.isoformat(),
            "rules": {
                "timezone": "America/Toronto",
                "near_term_window_hours": NEAR_TERM_WINDOW_HOURS,
                "high_weight_threshold": HIGH_WEIGHT_THRESHOLD,
            },
            "summary": {
                "total_alerts": len(ranked_alerts),
                "course_count": len({alert["course_id"] for alert in ranked_alerts}),
                "severity_counts": severity_counts,
                "type_counts": type_counts,
            },
            "alerts": ranked_alerts,
        }

    def _build_weekly_items_for_course(
        self,
        *,
        user_id,
        stored_course: StoredCourse,
        window_start: date,
        window_end: date,
    ) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for deadline in self._deadline_service.list_deadlines(user_id, stored_course.course_id):
            due_date = self._parse_due_date(deadline.due_date)
            if due_date is None or due_date < window_start or due_date > window_end:
                continue

            due_at = self._deadline_due_at(deadline.due_date, deadline.due_time)
            assessment_context = self._resolve_deadline_assessment_context(
                stored_course.course,
                deadline.assessment_name,
                deadline.title,
            )
            items.append(
                {
                    "deadline_id": str(deadline.deadline_id),
                    "course_id": str(stored_course.course_id),
                    "course_name": stored_course.course.name,
                    "title": deadline.title,
                    "deadline_type": deadline.deadline_type,
                    "due_date": deadline.due_date,
                    "due_time": deadline.due_time,
                    "due_at": due_at.isoformat(),
                    "days_until_due": (due_date - window_start).days,
                    "source": deadline.source,
                    "assessment_name": assessment_context["assessment_name"],
                    "assessment_weight": assessment_context["assessment_weight"],
                }
            )
        return items

    def _build_deadline_alerts_for_course(
        self,
        *,
        user_id,
        stored_course: StoredCourse,
        reference_point: datetime,
    ) -> list[dict[str, Any]]:
        alerts: list[dict[str, Any]] = []
        near_term_limit = reference_point + timedelta(hours=NEAR_TERM_WINDOW_HOURS)

        for deadline in self._deadline_service.list_deadlines(user_id, stored_course.course_id):
            due_at = self._deadline_due_at(deadline.due_date, deadline.due_time)
            assessment_context = self._resolve_deadline_assessment_context(
                stored_course.course,
                deadline.assessment_name,
                deadline.title,
            )
            base_payload = {
                "course_id": str(stored_course.course_id),
                "course_name": stored_course.course.name,
                "item_type": "deadline",
                "item_label": deadline.title,
                "deadline_id": str(deadline.deadline_id),
                "due_date": deadline.due_date,
                "due_time": deadline.due_time,
                "due_at": due_at.isoformat(),
                "assessment_name": assessment_context["assessment_name"],
                "assessment_weight": assessment_context["assessment_weight"],
            }

            if due_at < reference_point:
                hours_overdue = round((reference_point - due_at).total_seconds() / 3600, 1)
                alerts.append(
                    {
                        **base_payload,
                        "alert_id": f"overdue:{stored_course.course_id}:{deadline.deadline_id}",
                        "type": "overdue_deadline",
                        "severity": "critical",
                        "message": f"{deadline.title} in {stored_course.course.name} is overdue.",
                        "hours_overdue": hours_overdue,
                    }
                )
                continue

            if due_at <= near_term_limit:
                hours_until_due = round((due_at - reference_point).total_seconds() / 3600, 1)
                severity = "critical" if hours_until_due <= 24 else "high"
                alerts.append(
                    {
                        **base_payload,
                        "alert_id": f"near-term:{stored_course.course_id}:{deadline.deadline_id}",
                        "type": "near_term_deadline",
                        "severity": severity,
                        "message": (
                            f"{deadline.title} in {stored_course.course.name} is due within "
                            f"{NEAR_TERM_WINDOW_HOURS} hours."
                        ),
                        "hours_until_due": hours_until_due,
                    }
                )

        return alerts

    def _build_target_alerts_for_course(
        self,
        *,
        user_id,
        stored_course: StoredCourse,
    ) -> list[dict[str, Any]]:
        target_record = self._grade_target_repo.get_target(user_id, stored_course.course_id)
        if target_record is None or target_record.target_percentage is None:
            return []

        feasibility = self._course_service.check_target_feasibility(
            user_id=user_id,
            course_id=stored_course.course_id,
            target=target_record.target_percentage,
        )
        if feasibility["feasible"]:
            return []

        return [
            {
                "alert_id": f"impossible-target:{stored_course.course_id}",
                "type": "impossible_target",
                "severity": "critical",
                "course_id": str(stored_course.course_id),
                "course_name": stored_course.course.name,
                "item_type": "course_target",
                "item_label": f"Target {target_record.target_percentage}%",
                "message": (
                    f"Saved target {target_record.target_percentage}% is not achievable in "
                    f"{stored_course.course.name}."
                ),
                "target": target_record.target_percentage,
                "current_standing": feasibility["current_standing"],
                "maximum_possible": feasibility["maximum_possible"],
                "classification": feasibility.get("classification"),
            }
        ]

    def _build_ungraded_alerts_for_course(
        self,
        *,
        user_id,
        stored_course: StoredCourse,
        reference_point: datetime,
    ) -> list[dict[str, Any]]:
        alerts: list[dict[str, Any]] = []
        deadlines = self._deadline_service.list_deadlines(user_id, stored_course.course_id)

        for assessment in stored_course.course.assessments:
            if getattr(assessment, "is_bonus", False):
                continue
            if assessment.weight < HIGH_WEIGHT_THRESHOLD:
                continue
            if _is_assessment_fully_graded(assessment):
                continue

            linked_deadline = self._match_deadline_to_assessment(deadlines, assessment.name)
            due_at = None
            due_date = None
            due_time = None
            severity = "high" if assessment.weight >= 35 else "medium"
            if linked_deadline is not None:
                due_at = self._deadline_due_at(linked_deadline.due_date, linked_deadline.due_time)
                due_date = linked_deadline.due_date
                due_time = linked_deadline.due_time
                if due_at <= reference_point + timedelta(hours=NEAR_TERM_WINDOW_HOURS):
                    severity = "high"

            alerts.append(
                {
                    "alert_id": f"high-weight:{stored_course.course_id}:{assessment.name}",
                    "type": "high_weight_ungraded",
                    "severity": severity,
                    "course_id": str(stored_course.course_id),
                    "course_name": stored_course.course.name,
                    "item_type": "assessment",
                    "item_label": assessment.name,
                    "message": (
                        f"{assessment.name} ({assessment.weight}% weight) in "
                        f"{stored_course.course.name} is still ungraded."
                    ),
                    "assessment_name": assessment.name,
                    "assessment_weight": float(assessment.weight),
                    "due_date": due_date,
                    "due_time": due_time,
                    "due_at": due_at.isoformat() if due_at is not None else None,
                }
            )

        return alerts

    def _detect_conflicts(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if len(items) < 2:
            return []

        sorted_items = sorted(items, key=self._weekly_item_sort_key)
        conflicts: list[dict[str, Any]] = []
        cluster: list[dict[str, Any]] = [sorted_items[0]]
        conflict_window = timedelta(hours=CONFLICT_WINDOW_HOURS)

        for item in sorted_items[1:]:
            last_due_at = datetime.fromisoformat(cluster[-1]["due_at"])
            current_due_at = datetime.fromisoformat(item["due_at"])
            if current_due_at - last_due_at <= conflict_window:
                cluster.append(item)
                continue

            if len(cluster) >= 2:
                conflicts.append(self._build_conflict_payload(cluster, len(conflicts) + 1))
            cluster = [item]

        if len(cluster) >= 2:
            conflicts.append(self._build_conflict_payload(cluster, len(conflicts) + 1))

        return conflicts

    def _build_conflict_payload(self, cluster: list[dict[str, Any]], ordinal: int) -> dict[str, Any]:
        earliest = datetime.fromisoformat(cluster[0]["due_at"])
        latest = datetime.fromisoformat(cluster[-1]["due_at"])
        shortest_gap_hours = min(
            (
                (datetime.fromisoformat(cluster[index]["due_at"]) - datetime.fromisoformat(cluster[index - 1]["due_at"]))
                .total_seconds()
                / 3600
                for index in range(1, len(cluster))
            ),
            default=CONFLICT_WINDOW_HOURS,
        )

        if len(cluster) >= 3 or shortest_gap_hours <= 24:
            severity = "high"
        else:
            severity = "medium"

        return {
            "conflict_id": f"conflict-{ordinal}",
            "severity": severity,
            "reason": f"{len(cluster)} deadlines fall within {CONFLICT_WINDOW_HOURS} hours.",
            "window_start": earliest.isoformat(),
            "window_end": latest.isoformat(),
            "item_count": len(cluster),
            "course_count": len({item["course_id"] for item in cluster}),
            "items": cluster,
        }

    def _resolve_deadline_assessment_context(
        self,
        course,
        assessment_name: str | None,
        deadline_title: str,
    ) -> dict[str, Any]:
        for candidate in (assessment_name, deadline_title):
            if not candidate:
                continue
            try:
                parent, child = resolve_assessment_target(course, candidate)
            except ValueError:
                continue
            return {
                "assessment_name": _target_label(parent.name, child.name if child is not None else None),
                "assessment_weight": _get_target_weight(parent, child),
            }
        return {
            "assessment_name": assessment_name,
            "assessment_weight": None,
        }

    @staticmethod
    def _match_deadline_to_assessment(deadlines, assessment_name: str):
        assessment_key = assessment_name.casefold()
        for deadline in deadlines:
            if deadline.assessment_name and deadline.assessment_name.casefold() == assessment_key:
                return deadline
            if deadline.title.casefold() == assessment_key:
                return deadline
        return None

    @staticmethod
    def _parse_due_date(raw_due_date: str) -> date | None:
        try:
            return date.fromisoformat(raw_due_date)
        except ValueError:
            return None

    @staticmethod
    def _deadline_due_at(raw_due_date: str, raw_due_time: str | None) -> datetime:
        due_date = date.fromisoformat(raw_due_date)
        if raw_due_time:
            due_time = time.fromisoformat(raw_due_time)
        else:
            due_time = time(23, 59)
        return datetime.combine(due_date, due_time, tzinfo=PLANNING_TIMEZONE)

    @staticmethod
    def _weekly_item_sort_key(item: dict[str, Any]) -> tuple[Any, ...]:
        return (
            item["due_at"],
            item["course_name"].casefold(),
            item["title"].casefold(),
            item["deadline_id"],
        )

    @staticmethod
    def _alert_sort_key(alert: dict[str, Any]) -> tuple[Any, ...]:
        due_at = alert.get("due_at") or "9999-12-31T23:59:59+00:00"
        return (
            _SEVERITY_ORDER.get(alert["severity"], 99),
            _ALERT_TYPE_ORDER.get(alert["type"], 99),
            due_at,
            alert["course_name"].casefold(),
            alert["item_label"].casefold(),
            alert["alert_id"],
        )

    @staticmethod
    def _normalize_datetime(raw_datetime: datetime) -> datetime:
        if raw_datetime.tzinfo is None:
            return raw_datetime.replace(tzinfo=PLANNING_TIMEZONE)
        return raw_datetime.astimezone(PLANNING_TIMEZONE)

    @staticmethod
    def _now() -> datetime:
        return datetime.now(PLANNING_TIMEZONE)
