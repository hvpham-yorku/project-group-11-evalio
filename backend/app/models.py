from pydantic import BaseModel, Field
from typing import List, Optional

class Assessment(BaseModel):
    name: str = Field(..., min_length=1)
    weight: float = Field(..., gt=0)
    raw_score: Optional[float] = Field(None, ge=0)
    total_score: Optional[float] = Field(None, gt=0)

class CourseCreate(BaseModel):
    name: str = Field(..., min_length=1)
    term: Optional[str] = None
    assessments: List[Assessment]
