from decimal import Decimal
from uuid import UUID

from app.models import CourseCreate
from app.repositories.base import CourseRepository, StoredCourse
from app.services.grading_service import (
    calculate_current_standing,
    calculate_minimum_required_score,
    calculate_required_average_summary,
    calculate_whatif_scenario,
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

        total_weight = sum(assessment.weight for assessment in course.assessments)
        if total_weight > 100:
            raise CourseValidationError("Total assessment weight cannot exceed 100%")

        stored = self._repository.create(user_id=user_id, course=course)
        return {
            "message": "Course created successfully",
            "total_weight": total_weight,
            "course_id": stored.course_id,
            "course": stored.course,
        }

    def list_courses(self, user_id: UUID) -> list[dict]:
        stored_courses = self._repository.list_all(user_id=user_id)
        return [
            {"course_id": stored.course_id, **stored.course.model_dump()}
            for stored in stored_courses
        ]

    def update_course_weights(self, user_id: UUID, course_id: UUID, assessments: list[dict]) -> dict:
        if not assessments:
            raise CourseValidationError("At least one assessment weight update is required")

        total_weight = Decimal("0")
        seen_names: set[str] = set()
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
            total_weight += decimal_weight

        if total_weight != Decimal("100"):
            raise CourseValidationError("Total assessment weight must equal 100%")

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

        for assessment in assessments:
            existing_assessments[assessment["name"]].weight = float(assessment["weight"])

        self._repository.update(user_id=user_id, course_id=course_id, course=stored.course)
        course_index = self._repository.get_index(user_id=user_id, course_id=course_id)

        return {
            "message": "Assessment weights updated successfully",
            "course_id": course_id,
            "course_index": course_index,
            "total_weight": float(total_weight),
            "course": stored.course,
        }

    def update_course_grades(self, user_id: UUID, course_id: UUID, assessments: list[dict]) -> dict:
        if not assessments:
            raise CourseValidationError("At least one assessment grade update is required")

        stored = self._get_course_or_raise(user_id=user_id, course_id=course_id)
        existing_assessments = {
            assessment.name: assessment for assessment in stored.course.assessments
        }

        seen_names: set[str] = set()
        for assessment in assessments:
            name = assessment["name"]
            raw_score = assessment.get("raw_score")
            total_score = assessment.get("total_score")

            if name in seen_names:
                raise CourseValidationError(
                    f"Duplicate assessment '{name}' in update payload"
                )
            seen_names.add(name)

            if name not in existing_assessments:
                raise CourseValidationError(
                    f"Assessment '{name}' does not exist in this course"
                )
            if (raw_score is None) != (total_score is None):
                raise CourseValidationError("Both scores must be provided or both null")
            if raw_score is None and total_score is None:
                continue
            if raw_score < 0:
                raise CourseValidationError(
                    f"Assessment '{name}' raw_score must be non-negative"
                )
            if total_score <= 0:
                raise CourseValidationError(
                    f"Assessment '{name}' total_score must be greater than 0"
                )
            if raw_score > total_score:
                raise CourseValidationError(
                    f"Assessment '{name}' raw_score cannot exceed total_score"
                )

        for assessment in assessments:
            existing = existing_assessments[assessment["name"]]
            raw_score = assessment.get("raw_score")
            total_score = assessment.get("total_score")
            if raw_score is None and total_score is None:
                existing.raw_score = None
                existing.total_score = None
            else:
                existing.raw_score = raw_score
                existing.total_score = total_score

        self._repository.update(user_id=user_id, course_id=course_id, course=stored.course)
        current_standing = calculate_current_standing(stored.course)
        course_index = self._repository.get_index(user_id=user_id, course_id=course_id)

        return {
            "message": "Assessment grades updated successfully",
            "course_id": course_id,
            "course_index": course_index,
            "current_standing": current_standing,
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

    def check_target_feasibility(self, user_id: UUID, course_id: UUID, target: float) -> dict:
        stored = self._get_course_or_raise(user_id=user_id, course_id=course_id)
        current_standing = calculate_current_standing(stored.course)

        remaining_potential = sum(
            assessment.weight
            for assessment in stored.course.assessments
            if assessment.raw_score is None or assessment.total_score is None
        )

        maximum_possible = current_standing + remaining_potential
        current_standing = round(current_standing, 2)
        maximum_possible = round(maximum_possible, 2)
        feasible = maximum_possible >= target

        explanation = (
            "Target is achievable if perfect scores are obtained on remaining assessments."
            if feasible
            else "Target is not achievable even with perfect scores on remaining assessments."
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

    def _get_course_or_raise(self, user_id: UUID, course_id: UUID) -> StoredCourse:
        stored = self._repository.get_by_id(user_id=user_id, course_id=course_id)
        if stored is None:
            raise CourseNotFoundError(f"Course not found for id {course_id}")
        return stored
