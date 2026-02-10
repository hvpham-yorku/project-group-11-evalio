from fastapi import APIRouter, HTTPException
from app.models import CourseCreate

router = APIRouter(prefix="/courses", tags=["Courses"])

# In-memory storage for ITR1
courses_db = []

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
