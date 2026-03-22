from __future__ import annotations

from uuid import UUID

from app.repositories.base import ScenarioRepository, StoredScenario, StoredScenarioEntry
from app.services.course_service import (
    CourseNotFoundError,
    CourseService,
    CourseValidationError,
)
from app.services.grading_service import _is_assessment_fully_graded
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
        top_level_assessment_names = {
            assessment.name for assessment in stored_course.course.assessments
        }
        assessments_by_name = {
            assessment.name: assessment for assessment in stored_course.course.assessments
        }

        seen_names: set[str] = set()
        normalized_entries: list[StoredScenarioEntry] = []
        for entry in entries:
            assessment_name = str(entry.get("assessment_name", "")).strip()
            if not assessment_name:
                raise ScenarioValidationError("assessment_name is required for each scenario entry")
            if assessment_name in seen_names:
                raise ScenarioValidationError(
                    f"Duplicate assessment '{assessment_name}' in scenario payload"
                )
            seen_names.add(assessment_name)
            if assessment_name not in top_level_assessment_names:
                raise ScenarioValidationError(
                    f"Assessment '{assessment_name}' not found in course"
                )
            if _is_assessment_fully_graded(assessments_by_name[assessment_name]):
                raise ScenarioValidationError(
                    f"Assessment '{assessment_name}' is already graded and cannot be simulated"
                )

            score = entry.get("score")
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
                StoredScenarioEntry(assessment_name=assessment_name, score=score)
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

        known_assessment_names = {
            assessment.name for assessment in stored_course.course.assessments
        }
        missing = [
            entry.assessment_name
            for entry in scenario.entries
            if entry.assessment_name not in known_assessment_names
        ]
        if missing:
            missing_joined = ", ".join(sorted(set(missing)))
            raise ScenarioValidationError(
                f"Saved scenario references stale assessments: {missing_joined}"
            )

        if len(scenario.entries) == 1:
            entry = scenario.entries[0]
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
                    for entry in scenario.entries
                ],
            )

        return {
            "scenario": self._to_dict(scenario),
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
                    "assessment_name": entry.assessment_name,
                    "score": entry.score,
                }
                for entry in scenario.entries
            ],
            "entry_count": len(scenario.entries),
        }
