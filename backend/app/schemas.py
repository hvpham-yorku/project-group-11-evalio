from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class AssessmentCreate(BaseModel):
    name: str = Field(..., min_length=1)
    weight: float = Field(..., gt=0, le=1)
    current_score: Optional[float] = None
    due_date: Optional[datetime] = None

class AssessmentResponse(AssessmentCreate):
    id: int
    course_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class CourseCreate(BaseModel):
    name: str = Field(..., min_length=1)
    target_grade: float = Field(..., ge=0, le=100)

class CourseUpdate(BaseModel):
    name: Optional[str] = None
    target_grade: Optional[float] = None

class CourseResponse(CourseCreate):
    id: int
    assessments: List[AssessmentResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class AnalyzeRequest(BaseModel):
    current_scores: dict  # e.g., {"Iteration Tests": 78.5, "Deliverables": 82}

class RiskRange(BaseModel):
    minimum: float
    safe: float
    stretch: float

class AnalyzeResponse(BaseModel):
    required_score: float
    is_achievable: bool
    current_average: float
    target_grade: float
    risk_ranges: RiskRange
    completed_assessments: dict

class SimulateRequest(BaseModel):
    hypothetical_scores: dict  # e.g., {"Final Demo": 95}

class SimulateResponse(BaseModel):
    projected_final_grade: float
    breakdown: dict
    status: str  # "above", "on_track", "below"
