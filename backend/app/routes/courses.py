from decimal import Decimal
from typing import Optional

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
    raw_score: Optional[float] = None
    total_score: Optional[float] = None


class CourseGradesUpdateRequest(BaseModel):
    assessments: list[AssessmentGradeUpdate]


class TargetGradeRequest(BaseModel):
    target: float = Field(..., ge=0, le=100)


YORKU_SCALE = [
    {"letter": "A+", "min": 90, "point": 9, "desc": "Exceptional"},
    {"letter": "A", "min": 80, "point": 8, "desc": "Excellent"},
    {"letter": "B+", "min": 75, "point": 7, "desc": "Very Good"},
    {"letter": "B", "min": 70, "point": 6, "desc": "Good"},
    {"letter": "C+", "min": 65, "point": 5, "desc": "Competent"},
    {"letter": "C", "min": 60, "point": 4, "desc": "Fairly Competent"},
    {"letter": "D+", "min": 55, "point": 3, "desc": "Passing"},
    {"letter": "D", "min": 50, "point": 2, "desc": "Marginally Passing"},
    {"letter": "E", "min": 40, "point": 1, "desc": "Marginally Failing"},
    {"letter": "F", "min": 0, "point": 0, "desc": "Failing"},
]


def calculate_assessment_percent(raw_score: float, total_score: float) -> float:
    return (raw_score / total_score) * 100


def calculate_current_standing(course: CourseCreate) -> float:
    standing = 0.0
    for assessment in course.assessments:
        if assessment.raw_score is not None and assessment.total_score is not None:
            percent = calculate_assessment_percent(
                assessment.raw_score,
                assessment.total_score
            )
            standing += (percent * assessment.weight) / 100
    return round(float(standing), 2)


def get_york_grade(percent: float) -> dict[str, float | str]:
    for band in YORKU_SCALE:
        if percent >= band["min"]:
            return {
                "letter": band["letter"],
                "grade_point": band["point"],
                "description": band["desc"],
            }
    return {
        "letter": "F",
        "grade_point": 0,
        "description": "Failing",
    }


def calculate_required_average_summary(
    current_standing: float,
    target_percentage: float,
    remaining_weight: float
) -> dict[str, float | str]:
    remaining_weight_display = (
        str(int(remaining_weight))
        if float(remaining_weight).is_integer()
        else str(remaining_weight)
    )
    required_points = target_percentage - current_standing

    if remaining_weight <= 0:
        return {
            "required_points": round(required_points, 2),
            "required_average": 0.0,
            "required_average_display": "0.0%",
            "required_fraction_display": (
                f"({max(required_points, 0):.2f} / {remaining_weight_display} remaining weight)"
            ),
            "classification": "Complete",
        }

    if required_points <= 0:
        return {
            "required_points": 0.0,
            "required_average": 0.0,
            "required_average_display": "0.0%",
            "required_fraction_display": (
                f"(0.00 / {remaining_weight_display} remaining weight)"
            ),
            "classification": "Already Achieved",
        }

    required_average = (required_points / remaining_weight) * 100

    if required_average > 100:
        classification = "Not Possible"
    elif required_average > 95:
        classification = "Very Challenging"
    elif required_average > 85:
        classification = "Challenging"
    elif required_average > 70:
        classification = "Achievable"
    else:
        classification = "Comfortable"

    return {
        "required_points": round(required_points, 2),
        "required_average": round(required_average, 1),
        "required_average_display": f"{required_average:.1f}%",
        "required_fraction_display": (
            f"({required_points:.2f} / {remaining_weight_display} remaining weight)"
        ),
        "classification": classification,
    }


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
        if (assessment.raw_score is None) != (assessment.total_score is None):
            raise HTTPException(
                status_code=400,
                detail="Both scores must be provided or both null"
            )
        if assessment.raw_score is None and assessment.total_score is None:
            continue
        if assessment.raw_score < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Assessment '{assessment.name}' raw_score must be non-negative"
            )
        if assessment.total_score <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Assessment '{assessment.name}' total_score must be greater than 0"
            )
        if assessment.raw_score > assessment.total_score:
            raise HTTPException(
                status_code=400,
                detail=f"Assessment '{assessment.name}' raw_score cannot exceed total_score"
            )

    for assessment in payload.assessments:
        if assessment.raw_score is None and assessment.total_score is None:
            existing_assessments[assessment.name].raw_score = None
            existing_assessments[assessment.name].total_score = None
        else:
            existing_assessments[assessment.name].raw_score = assessment.raw_score
            existing_assessments[assessment.name].total_score = assessment.total_score

    current_standing = calculate_current_standing(course)

    return {
        "message": "Assessment grades updated successfully",
        "course_index": course_index,
        "current_standing": current_standing,
        "assessments": [
            {
                "name": assessment.name,
                "weight": assessment.weight,
                "raw_score": assessment.raw_score,
                "total_score": assessment.total_score
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
        if assessment.raw_score is None or assessment.total_score is None
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
    required_average_summary = calculate_required_average_summary(
        current_standing=current_standing,
        target_percentage=payload.target,
        remaining_weight=remaining_potential,
    )

    return {
        "target": payload.target,
        "current_standing": current_standing,
        "maximum_possible": maximum_possible,
        "feasible": feasible,
        "explanation": explanation,
        "york_equivalent": get_york_grade(payload.target),
        **required_average_summary,
    }
