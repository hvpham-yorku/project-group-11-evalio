from decimal import Decimal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models import CourseCreate

router = APIRouter(prefix="/courses", tags=["Courses"])

# In-memory storage for ITR1
courses_db = []


class AssessmentWeightUpdate(BaseModel):
   name: str = Field(..., min_length=1)
   weight: Decimal = Field(..., ge=0, le=100)


class CourseWeightsUpdateRequest(BaseModel):
    assessments: list[AssessmentWeightUpdate]


class AssessmentGradeUpdate(BaseModel):
    name: str = Field(..., min_length=1)
    grade: float = Field(..., ge=0, le=100)


class CourseGradesUpdateRequest(BaseModel):
    assessments: list[AssessmentGradeUpdate]


class TargetGradeRequest(BaseModel):
    target: float = Field(..., ge=0, le=100)


def calculate_current_standing(course: CourseCreate) -> float:
    standing = 0.0
    for assessment in course.assessments:
        if assessment.grade is not None:
            standing += (assessment.grade * assessment.weight) / 100
    return float(standing)


@router.post("/")
def create_course(course: CourseCreate):
    if not course.assessments:
        raise HTTPException(
            status_code=400,
            detail="At least one assessment is required"
        )

    total_weight = sum(a.weight for a in course.assessments)

    if total_weight > 100:
        raise HTTPException(
            status_code=400,
            detail="Total assessment weight cannot exceed 100%"
        )

    courses_db.append(course)

    return {
        "message": "Course created successfully",
        "total_weight": total_weight,
        "course": course
    }

@router.get("/")
def list_courses():
    return courses_db


@router.put("/{course_index}/weights")
def update_course_weights(course_index: int, payload: CourseWeightsUpdateRequest):
    if course_index < 0 or course_index >= len(courses_db):
        raise HTTPException(
            status_code=404,
            detail=f"Course not found for index {course_index}"
        )

    if not payload.assessments:
        raise HTTPException(
            status_code=400,
            detail="At least one assessment weight update is required"
        )

    total_weight = Decimal("0")
    seen_names = set()
    for assessment in payload.assessments:
        if assessment.weight < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Assessment '{assessment.name}' weight must be non-negative"
            )
        if assessment.name in seen_names:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate assessment '{assessment.name}' in update payload"
            )
        seen_names.add(assessment.name)
        total_weight += assessment.weight

    if total_weight != Decimal("100"):
        raise HTTPException(
            status_code=400,
            detail="Total assessment weight must equal 100%"
        )

    course = courses_db[course_index]
    existing_assessments = {assessment.name: assessment for assessment in course.assessments}

    for assessment in payload.assessments:
        if assessment.name not in existing_assessments:
            raise HTTPException(
                status_code=400,
                detail=f"Assessment '{assessment.name}' does not exist in this course"
            )

    missing_assessments = set(existing_assessments.keys()) - set(seen_names)
    if missing_assessments:
        missing = ", ".join(sorted(missing_assessments))
        raise HTTPException(
            status_code=400,
            detail=f"Missing assessment updates for: {missing}"
        )

    for assessment in payload.assessments:
        existing_assessments[assessment.name].weight = float(assessment.weight)

    return {
        "message": "Assessment weights updated successfully",
        "course_index": course_index,
        "total_weight": float(total_weight),
        "course": course
    }


@router.put("/{course_index}/grades")
def update_course_grades(course_index: int, payload: CourseGradesUpdateRequest):
    if course_index < 0 or course_index >= len(courses_db):
        raise HTTPException(
            status_code=404,
            detail=f"Course not found for index {course_index}"
        )

    if not payload.assessments:
        raise HTTPException(
            status_code=400,
            detail="At least one assessment grade update is required"
        )

    course = courses_db[course_index]
    existing_assessments = {assessment.name: assessment for assessment in course.assessments}

    seen_names = set()
    for assessment in payload.assessments:
        if assessment.name in seen_names:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate assessment '{assessment.name}' in update payload"
            )
        seen_names.add(assessment.name)

        if assessment.name not in existing_assessments:
            raise HTTPException(
                status_code=400,
                detail=f"Assessment '{assessment.name}' does not exist in this course"
            )

    for assessment in payload.assessments:
        existing_assessments[assessment.name].grade = assessment.grade

    current_standing = calculate_current_standing(course)

    return {
        "message": "Assessment grades updated successfully",
        "course_index": course_index,
        "current_standing": current_standing,
        "assessments": [
            {
                "name": assessment.name,
                "weight": assessment.weight,
                "grade": assessment.grade
            }
            for assessment in course.assessments
        ]
    }


@router.post("/{course_index}/target")
def check_target_feasibility(course_index: int, payload: TargetGradeRequest):
    if course_index < 0 or course_index >= len(courses_db):
        raise HTTPException(
            status_code=404,
            detail=f"Course not found for index {course_index}"
        )

    course = courses_db[course_index]
    current_standing = calculate_current_standing(course)

    remaining_potential = sum(
        assessment.weight
        for assessment in course.assessments
        if assessment.grade is None
    )

    maximum_possible = current_standing + remaining_potential

    current_standing = round(current_standing, 2)
    maximum_possible = round(maximum_possible, 2)
    feasible = maximum_possible >= payload.target

    explanation = (
        "Target is achievable if perfect scores are obtained on remaining assessments."
        if feasible
        else "Target is not achievable even with perfect scores on remaining assessments."
    )

    return {
        "target": payload.target,
        "current_standing": current_standing,
        "maximum_possible": maximum_possible,
        "feasible": feasible,
        "explanation": explanation
    }
