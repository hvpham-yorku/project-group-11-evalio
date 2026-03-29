from decimal import Decimal
from uuid import UUID

from app.models import CourseCreate
from app.repositories.base import CourseRepository, StoredCourse
from app.services.grading_service import (
    calculate_course_totals,
    compute_assessment_contribution,
    calculate_minimum_required_score,
    calculate_required_average_summary,
    calculate_whatif_scenario,
    evaluate_mandatory_pass_requirements,
    fill_remaining_ungraded_scores,
    get_york_grade,
)


class CourseNotFoundError(Exception):
    pass


class CourseValidationError(Exception):
    pass


class CourseConflictError(Exception):
    pass


class CourseService:
    def __init__(self, repository: CourseRepository):
        self._repository = repository

    def create_course(self, user_id: UUID, course: CourseCreate) -> dict:
        if not course.assessments:
            raise CourseValidationError("At least one assessment is required")

        for assessment in course.assessments:
            if getattr(assessment, "is_bonus", False) and assessment.rule_type == "mandatory_pass":
                raise CourseValidationError(
                    f"Assessment '{assessment.name}' cannot be both bonus and mandatory_pass"
                )

        core_weight = sum(
            a.weight for a in course.assessments if not getattr(a, "is_bonus", False)
        )
        if core_weight > 100:
            raise CourseValidationError("Total non-bonus assessment weight cannot exceed 100%")

        stored = self._repository.create(user_id=user_id, course=course)
        return {
            "message": "Course created successfully",
            "total_weight": core_weight,
            "course_id": stored.course_id,
            "course": stored.course,
        }

    def list_courses(self, user_id: UUID) -> list[dict]:
        stored_courses = self._repository.list_all(user_id=user_id)
        return [
            {"course_id": stored.course_id, **stored.course.model_dump()}
            for stored in stored_courses
        ]

    def list_stored_courses(self, user_id: UUID) -> list[StoredCourse]:
        return self._repository.list_all(user_id=user_id)

    def update_course_weights(self, user_id: UUID, course_id: UUID, assessments: list[dict]) -> dict:
        if not assessments:
            raise CourseValidationError("At least one assessment weight update is required")

        seen_names: set[str] = set()
        weight_by_name: dict[str, Decimal] = {}
        for assessment in assessments:
            weight = assessment["weight"]
            decimal_weight = weight if isinstance(weight, Decimal) else Decimal(str(weight))

            if decimal_weight < 0:
                raise CourseValidationError(
                    f"Assessment '{assessment['name']}' weight must be non-negative"
                )
            if assessment["name"] in seen_names:
                raise CourseValidationError(
                    f"Duplicate assessment '{assessment['name']}' in update payload"
                )

            seen_names.add(assessment["name"])
            weight_by_name[assessment["name"]] = decimal_weight

        stored = self._get_course_or_raise(user_id=user_id, course_id=course_id)
        existing_assessments = {
            assessment.name: assessment for assessment in stored.course.assessments
        }

        for assessment in assessments:
            if assessment["name"] not in existing_assessments:
                raise CourseValidationError(
                    f"Assessment '{assessment['name']}' does not exist in this course"
                )

        missing_assessments = set(existing_assessments.keys()) - seen_names
        if missing_assessments:
            missing = ", ".join(sorted(missing_assessments))
            raise CourseValidationError(f"Missing assessment updates for: {missing}")

        core_weight = sum(
            weight_by_name[name]
            for name, a in existing_assessments.items()
            if not getattr(a, "is_bonus", False) and name in weight_by_name
        )
        if core_weight != Decimal("100"):
            raise CourseValidationError("Total non-bonus assessment weight must equal 100%")

        for assessment in assessments:
            existing_assessments[assessment["name"]].weight = float(assessment["weight"])

        self._repository.update(user_id=user_id, course_id=course_id, course=stored.course)
        course_index = self._repository.get_index(user_id=user_id, course_id=course_id)

        return {
            "message": "Assessment weights updated successfully",
            "course_id": course_id,
            "course_index": course_index,
            "total_weight": float(core_weight),
            "course": stored.course,
        }

    def update_course_grades(self, user_id: UUID, course_id: UUID, assessments: list[dict]) -> dict:
        if not assessments:
            raise CourseValidationError("At least one assessment grade update is required")

        stored = self._get_course_or_raise(user_id=user_id, course_id=course_id)
        existing_assessments = {
            assessment.name: assessment for assessment in stored.course.assessments
        }

        def validate_score_pair(label: str, raw_score: float | None, total_score: float | None) -> None:
            if (raw_score is None) != (total_score is None):
                raise CourseValidationError(f"{label}: both scores must be provided or both null")
            if raw_score is None and total_score is None:
                return
            if raw_score < 0:
                raise CourseValidationError(f"{label}: raw_score must be non-negative")
            if total_score <= 0:
                raise CourseValidationError(f"{label}: total_score must be greater than 0")
            if raw_score > total_score:
                raise CourseValidationError(f"{label}: raw_score cannot exceed total_score")

        seen_names: set[str] = set()
        for assessment in assessments:
            name = assessment["name"]
            raw_score = assessment.get("raw_score")
            total_score = assessment.get("total_score")
            child_updates = assessment.get("children")

            if name in seen_names:
                raise CourseValidationError(
                    f"Duplicate assessment '{name}' in update payload"
                )
            seen_names.add(name)

            if name not in existing_assessments:
                raise CourseValidationError(
                    f"Assessment '{name}' does not exist in this course"
                )
            validate_score_pair(f"Assessment '{name}'", raw_score, total_score)

            if child_updates is None:
                continue

            existing_children = {
                child.name: child for child in (existing_assessments[name].children or [])
            }
            seen_child_names: set[str] = set()
            for child_update in child_updates:
                child_name = child_update["name"]
                child_raw_score = child_update.get("raw_score")
                child_total_score = child_update.get("total_score")

                if child_name in seen_child_names:
                    raise CourseValidationError(
                        f"Duplicate child assessment '{child_name}' under '{name}' in update payload"
                    )
                seen_child_names.add(child_name)

                if child_name not in existing_children:
                    raise CourseValidationError(
                        f"Child assessment '{child_name}' does not exist under '{name}'"
                    )

                validate_score_pair(
                    f"Child assessment '{child_name}' under '{name}'",
                    child_raw_score,
                    child_total_score,
                )

        for assessment in assessments:
            existing = existing_assessments[assessment["name"]]
            raw_score = assessment.get("raw_score")
            total_score = assessment.get("total_score")
            child_updates = assessment.get("children")
            if raw_score is None and total_score is None:
                existing.raw_score = None
                existing.total_score = None
            else:
                existing.raw_score = raw_score
                existing.total_score = total_score

            if child_updates is None:
                continue

            existing_children = {
                child.name: child for child in (existing.children or [])
            }
            for child_update in child_updates:
                child_name = child_update["name"]
                child_raw_score = child_update.get("raw_score")
                child_total_score = child_update.get("total_score")
                existing_child = existing_children[child_name]
                if child_raw_score is None and child_total_score is None:
                    existing_child.raw_score = None
                    existing_child.total_score = None
                else:
                    existing_child.raw_score = child_raw_score
                    existing_child.total_score = child_total_score

        self._repository.update(user_id=user_id, course_id=course_id, course=stored.course)
        totals = calculate_course_totals(stored.course)
        current_standing = totals["final_total"]
        course_index = self._repository.get_index(user_id=user_id, course_id=course_id)

        return {
            "message": "Assessment grades updated successfully",
            "course_id": course_id,
            "course_index": course_index,
            "current_standing": current_standing,
            "core_total": totals["core_total"],
            "bonus_total": totals["bonus_total"],
            "final_total": totals["final_total"],
            "mandatory_pass_status": evaluate_mandatory_pass_requirements(stored.course),
            "is_failed": totals["is_failed"],
            "assessments": [
                {
                    "name": assessment.name,
                    "weight": assessment.weight,
                    "raw_score": assessment.raw_score,
                    "total_score": assessment.total_score
                }
                for assessment in stored.course.assessments
            ]
        }

    def update_course_structure(
        self,
        user_id: UUID,
        course_id: UUID,
        course_update: CourseCreate,
    ) -> dict:
        """Replace the full assessment structure of an existing course.

        Preserves scores for assessments (and children) whose names still match.
        """
        if not course_update.assessments:
            raise CourseValidationError("At least one assessment is required")

        for assessment in course_update.assessments:
            if getattr(assessment, "is_bonus", False) and assessment.rule_type == "mandatory_pass":
                raise CourseValidationError(
                    f"Assessment '{assessment.name}' cannot be both bonus and mandatory_pass"
                )

        core_weight = sum(
            a.weight for a in course_update.assessments if not getattr(a, "is_bonus", False)
        )
        if core_weight > 100:
            raise CourseValidationError("Total non-bonus assessment weight cannot exceed 100%")

        stored = self._get_course_or_raise(user_id=user_id, course_id=course_id)

        # Build lookup of existing scores by name for grade preservation
        old_scores: dict[str, dict] = {}
        for a in stored.course.assessments:
            entry: dict = {
                "raw_score": a.raw_score,
                "total_score": a.total_score,
                "children": {},
            }
            for child in (a.children or []):
                entry["children"][child.name] = {
                    "raw_score": child.raw_score,
                    "total_score": child.total_score,
                }
            old_scores[a.name] = entry

        # Carry forward scores where names match
        for assessment in course_update.assessments:
            old = old_scores.get(assessment.name)
            if not old:
                continue
            if assessment.children:
                for child in assessment.children:
                    old_child = old["children"].get(child.name)
                    if old_child and child.raw_score is None and child.total_score is None:
                        child.raw_score = old_child["raw_score"]
                        child.total_score = old_child["total_score"]
            elif assessment.raw_score is None and assessment.total_score is None:
                assessment.raw_score = old["raw_score"]
                assessment.total_score = old["total_score"]

        # Update stored course with new structure
        updated = course_update.model_copy(deep=True)
        updated.name = course_update.name
        updated.term = course_update.term

        self._repository.update(user_id=user_id, course_id=course_id, course=updated)

        return {
            "message": "Course structure updated successfully",
            "course_id": course_id,
            "total_weight": float(core_weight),
            "course": updated,
        }

    def update_course_metadata(
        self,
        user_id: UUID,
        course_id: UUID,
        name: str,
        term: str | None,
    ) -> dict:
        cleaned_name = name.strip()
        if not cleaned_name:
            raise CourseValidationError("Course name cannot be empty")

        stored = self._get_course_or_raise(user_id=user_id, course_id=course_id)
        updated_course = stored.course.model_copy(deep=True)
        updated_course.name = cleaned_name
        updated_course.term = term

        self._repository.update(user_id=user_id, course_id=course_id, course=updated_course)
        return {
            "message": "Course metadata updated successfully",
            "course_id": course_id,
            "course": updated_course,
        }

    def delete_course(self, user_id: UUID, course_id: UUID) -> dict:
        self._get_course_or_raise(user_id=user_id, course_id=course_id)
        self._repository.delete(user_id=user_id, course_id=course_id)
        return {
            "message": "Course deleted successfully",
            "course_id": course_id,
        }

    def check_target_feasibility(self, user_id: UUID, course_id: UUID, target: float) -> dict:
        stored = self._get_course_or_raise(user_id=user_id, course_id=course_id)
        current_totals = calculate_course_totals(stored.course)
        maximum_course = stored.course.model_copy(deep=True)
        fill_remaining_ungraded_scores(maximum_course, missing_percent=100.0)
        maximum_totals = calculate_course_totals(maximum_course)

        current_standing = round(current_totals["final_total"], 2)
        maximum_possible = round(maximum_totals["final_total"], 2)
        remaining_potential = max(0.0, maximum_possible - current_standing)
        feasible = (not maximum_totals["is_failed"]) and (maximum_possible + 1e-9 >= target)

        if maximum_totals["is_failed"]:
            explanation = (
                "Target is not achievable because a mandatory pass assessment "
                "has already been failed."
            )
        elif feasible:
            explanation = (
                "Target is achievable if perfect scores are obtained on remaining assessments."
            )
        else:
            explanation = (
                "Target is not achievable even with perfect scores on remaining assessments."
            )
        required_average_summary = calculate_required_average_summary(
            current_standing=current_standing,
            target_percentage=target,
            remaining_weight=remaining_potential,
        )

        return {
            "course_id": course_id,
            "target": target,
            "current_standing": current_standing,
            "maximum_possible": maximum_possible,
            "core_total": current_totals["core_total"],
            "bonus_total": current_totals["bonus_total"],
            "final_total": current_totals["final_total"],
            "mandatory_pass_status": evaluate_mandatory_pass_requirements(stored.course),
            "is_failed": current_totals["is_failed"],
            "feasible": feasible,
            "explanation": explanation,
            "york_equivalent": get_york_grade(target),
            **required_average_summary,
        }

    def get_minimum_required_score(
        self, user_id: UUID, course_id: UUID, target: float, assessment_name: str
    ) -> dict:
        stored = self._get_course_or_raise(user_id=user_id, course_id=course_id)
        try:
            result = calculate_minimum_required_score(
                course=stored.course,
                target=target,
                assessment_name=assessment_name,
            )
        except ValueError as exc:
            raise CourseValidationError(str(exc)) from exc
        return {"course_id": course_id, **result}

    def run_whatif_scenario(
        self, user_id: UUID, course_id: UUID, assessment_name: str, hypothetical_score: float
    ) -> dict:
        stored = self._get_course_or_raise(user_id=user_id, course_id=course_id)
        try:
            result = calculate_whatif_scenario(
                course=stored.course,
                assessment_name=assessment_name,
                hypothetical_score=hypothetical_score,
            )
        except ValueError as exc:
            raise CourseValidationError(str(exc)) from exc
        return {"course_id": course_id, **result}

    def get_course(self, user_id: UUID, course_id: UUID) -> StoredCourse:
        return self._get_course_or_raise(user_id=user_id, course_id=course_id)

    def _get_course_or_raise(self, user_id: UUID, course_id: UUID) -> StoredCourse:
        stored = self._repository.get_by_id(user_id=user_id, course_id=course_id)
        if stored is None:
            raise CourseNotFoundError(f"Course not found for id {course_id}")
        return stored
