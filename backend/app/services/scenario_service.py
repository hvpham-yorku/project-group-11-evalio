from __future__ import annotations

from uuid import UUID, uuid4

from app.repositories.base import ScenarioRepository, StoredScenario, StoredScenarioEntry
from app.services.course_service import (
    CourseNotFoundError,
    CourseService,
    CourseValidationError,
)
from app.services.grading_service import (
    _is_assessment_fully_graded,
    _target_label,
    resolve_assessment_target,
    resolve_assessment_target_by_id,
)
from app.services.strategy_service import compute_multi_whatif


class ScenarioNotFoundError(Exception):
    pass


class ScenarioValidationError(Exception):
    pass


class ScenarioService:
    def __init__(self, repository: ScenarioRepository, course_service: CourseService):
        self._repository = repository
        self._course_service = course_service

    def save_scenario(
        self,
        user_id: UUID,
        course_id: UUID,
        name: str,
        entries: list[dict],
    ) -> dict:
        normalized_name = name.strip()
        if not normalized_name:
            raise ScenarioValidationError("Scenario name is required")
        if not entries:
            raise ScenarioValidationError("At least one scenario entry is required")

        stored_course = self._course_service._get_course_or_raise(
            user_id=user_id,
            course_id=course_id,
        )
        pending_entries: list[dict] = []
        unresolved_names: list[str] = []
        for entry in entries:
            raw_name = str(entry.get("assessment_name", "")).strip()
            raw_id = entry.get("assessment_id")
            input_label = raw_name or str(raw_id)
            try:
                target = self._resolve_scenario_entry_target(stored_course.course, entry)
            except ScenarioValidationError as exc:
                if "not found in course" not in str(exc):
                    raise
                unresolved_names.append(input_label or "unknown")
                pending_entries.append(
                    {
                        "input_label": input_label or "unknown",
                        "resolved": False,
                    }
                )
                continue

            pending_entries.append(
                {
                    "input_label": target["assessment_name"],
                    "resolved": True,
                    "duplicate_key": (
                        str(target["assessment"].assessment_id)
                        if target["assessment"].assessment_id is not None
                        else target["assessment_name"].strip().casefold()
                    ),
                    "assessment_id": target["assessment_id"],
                    "assessment_name": target["assessment_name"],
                    "assessment": target["assessment"],
                    "score": entry.get("score"),
                }
            )

        seen_assessment_keys: set[str] = set()
        for entry in pending_entries:
            if not entry["resolved"]:
                continue
            duplicate_key = entry["duplicate_key"]
            if duplicate_key in seen_assessment_keys:
                raise ScenarioValidationError(
                    f"Duplicate assessment '{entry['assessment_name']}' in scenario payload"
                )
            seen_assessment_keys.add(duplicate_key)

        if unresolved_names:
            missing_label = unresolved_names[0]
            raise ScenarioValidationError(f"Assessment '{missing_label}' not found in course")

        normalized_entries: list[StoredScenarioEntry] = []
        for entry in pending_entries:
            assessment_name = entry["assessment_name"]
            assessment = entry["assessment"]
            if _is_assessment_fully_graded(assessment):
                raise ScenarioValidationError(
                    f"Assessment '{assessment_name}' is already graded and cannot be simulated"
                )

            score = entry["score"]
            if score is None:
                raise ScenarioValidationError(
                    f"Score is required for assessment '{assessment_name}'"
                )
            try:
                score = float(score)
            except (TypeError, ValueError) as exc:
                raise ScenarioValidationError(
                    f"Score for assessment '{assessment_name}' must be a number"
                ) from exc
            if score < 0 or score > 100:
                raise ScenarioValidationError(
                    f"Score for assessment '{assessment_name}' must be between 0 and 100"
                )
            normalized_entries.append(
                StoredScenarioEntry(
                    assessment_id=entry["assessment_id"],
                    assessment_name=assessment_name,
                    score=score,
                )
            )

        try:
            stored = self._repository.create(
                user_id=user_id,
                course_id=course_id,
                name=normalized_name,
                entries=normalized_entries,
            )
        except KeyError as exc:
            raise CourseNotFoundError(f"Course not found for id {course_id}") from exc
        except ValueError as exc:
            raise ScenarioValidationError(str(exc)) from exc

        return {
            "message": "Scenario saved successfully",
            "scenario": self._to_dict(stored),
        }

    def list_scenarios(self, user_id: UUID, course_id: UUID) -> dict:
        self._course_service._get_course_or_raise(user_id=user_id, course_id=course_id)
        scenarios = self._repository.list_all(user_id=user_id, course_id=course_id)
        return {
            "scenarios": [self._to_dict(s) for s in scenarios],
            "count": len(scenarios),
        }

    def get_scenario(self, user_id: UUID, course_id: UUID, scenario_id: UUID) -> dict:
        self._course_service._get_course_or_raise(user_id=user_id, course_id=course_id)
        scenario = self._repository.get_by_id(
            user_id=user_id,
            course_id=course_id,
            scenario_id=scenario_id,
        )
        if scenario is None:
            raise ScenarioNotFoundError("Scenario not found")
        return {"scenario": self._to_dict(scenario)}

    def delete_scenario(self, user_id: UUID, course_id: UUID, scenario_id: UUID) -> dict:
        self._course_service._get_course_or_raise(user_id=user_id, course_id=course_id)
        deleted = self._repository.delete(
            user_id=user_id,
            course_id=course_id,
            scenario_id=scenario_id,
        )
        if not deleted:
            raise ScenarioNotFoundError("Scenario not found")
        return {"message": "Scenario deleted"}

    def run_saved_scenario(self, user_id: UUID, course_id: UUID, scenario_id: UUID) -> dict:
        stored_course = self._course_service._get_course_or_raise(
            user_id=user_id,
            course_id=course_id,
        )
        scenario = self._repository.get_by_id(
            user_id=user_id,
            course_id=course_id,
            scenario_id=scenario_id,
        )
        if scenario is None:
            raise ScenarioNotFoundError("Scenario not found")
        if not scenario.entries:
            raise ScenarioValidationError(
                "Saved scenario has no entries and cannot be executed"
            )

        resolved_entries: list[StoredScenarioEntry] = []
        missing: list[str] = []
        for entry in scenario.entries:
            try:
                current_name = self._resolve_entry_display_name(
                    stored_course.course,
                    entry,
                )
            except ValueError:
                missing.append(entry.assessment_name)
                continue
            resolved_entries.append(
                StoredScenarioEntry(
                    assessment_id=entry.assessment_id,
                    assessment_name=current_name,
                    score=entry.score,
                )
            )
        if missing:
            missing_joined = ", ".join(sorted(set(missing)))
            raise ScenarioValidationError(
                f"Saved scenario references stale assessments: {missing_joined}"
            )

        if len(resolved_entries) == 1:
            entry = resolved_entries[0]
            try:
                result = self._course_service.run_whatif_scenario(
                    user_id=user_id,
                    course_id=course_id,
                    assessment_name=entry.assessment_name,
                    hypothetical_score=entry.score,
                )
            except CourseValidationError as exc:
                raise ScenarioValidationError(str(exc)) from exc
        else:
            result = compute_multi_whatif(
                stored_course.course,
                scenarios=[
                    {
                        "assessment_name": entry.assessment_name,
                        "score": entry.score,
                    }
                    for entry in resolved_entries
                ],
            )

        return {
            "scenario": self._to_dict(
                StoredScenario(
                    scenario_id=scenario.scenario_id,
                    name=scenario.name,
                    entries=resolved_entries,
                    created_at=scenario.created_at,
                )
            ),
            "result": result,
            "execution_mode": "simulation",
            "mutates_real_grades": False,
            "persistence": {
                "supported": False,
                "reason": "Saved scenarios are read-only previews and do not update stored grades.",
            },
        }

    @staticmethod
    def _to_dict(scenario: StoredScenario) -> dict:
        return {
            "scenario_id": str(scenario.scenario_id),
            "name": scenario.name,
            "created_at": scenario.created_at,
            "entries": [
                {
                    "assessment_id": str(entry.assessment_id),
                    "assessment_name": entry.assessment_name,
                    "score": entry.score,
                }
                for entry in scenario.entries
            ],
            "entry_count": len(scenario.entries),
        }

    @staticmethod
    def _resolve_scenario_entry_target(course, entry: dict) -> dict:
        assessment_id = entry.get("assessment_id")
        assessment_name = str(entry.get("assessment_name", "")).strip()

        if assessment_id is not None:
            try:
                parent, child = resolve_assessment_target_by_id(course, assessment_id)
            except ValueError as exc:
                raise ScenarioValidationError(
                    f"Assessment '{assessment_id}' not found in course"
                ) from exc
        else:
            if not assessment_name:
                raise ScenarioValidationError(
                    "assessment_id or assessment_name is required for each scenario entry"
                )
            try:
                parent, child = resolve_assessment_target(course, assessment_name)
            except ValueError as exc:
                normalized_name = assessment_name.casefold()
                parent = next(
                    (
                        assessment
                        for assessment in course.assessments
                        if assessment.name.strip().casefold() == normalized_name
                    ),
                    None,
                )
                child = None
                if parent is None:
                    raise ScenarioValidationError(
                        f"Assessment '{assessment_name}' not found in course"
                    ) from exc

        label = _target_label(parent.name, child.name if child is not None else None)
        target = child if child is not None else parent
        resolved_assessment_id = target.assessment_id or uuid4()
        return {
            "assessment_id": resolved_assessment_id,
            "assessment_name": label,
            "assessment": target,
        }

    @staticmethod
    def _resolve_entry_display_name(course, entry: StoredScenarioEntry) -> str:
        try:
            parent, child = resolve_assessment_target_by_id(course, entry.assessment_id)
        except ValueError:
            try:
                parent, child = resolve_assessment_target(course, entry.assessment_name)
            except ValueError as exc:
                normalized_name = entry.assessment_name.strip().casefold()
                parent = next(
                    (
                        assessment
                        for assessment in course.assessments
                        if assessment.name.strip().casefold() == normalized_name
                    ),
                    None,
                )
                child = None
                if parent is None:
                    raise exc
        return _target_label(parent.name, child.name if child is not None else None)
