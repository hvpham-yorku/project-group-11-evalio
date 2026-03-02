from typing import Any, List, Optional

from pydantic import BaseModel, Field, model_validator


class ChildAssessment(BaseModel):
    name: str = Field(..., min_length=1)
    weight: float = Field(..., gt=0)
    raw_score: Optional[float] = Field(None, ge=0)
    total_score: Optional[float] = Field(None, gt=0)

class Assessment(BaseModel):
    name: str = Field(..., min_length=1)
    weight: float = Field(..., gt=0)
    raw_score: Optional[float] = Field(None, ge=0)
    total_score: Optional[float] = Field(None, gt=0)
    children: Optional[List[ChildAssessment]] = None
    rule_type: Optional[str] = None
    rule_config: Optional[dict[str, Any]] = None
    is_bonus: bool = False

    @model_validator(mode="after")
    def validate_parent_child_weight_consistency(self) -> "Assessment":
        if not self.children:
            return self

        child_weight_sum = sum(child.weight for child in self.children)
        if self.rule_type in {"best_of", "drop_lowest"}:
            if child_weight_sum + 0.001 < self.weight:
                raise ValueError(
                    "Rule-based parent assessment child weights must be greater than or equal to parent weight"
                )
            return self

        if abs(self.weight - child_weight_sum) > 0.001:
            raise ValueError("Parent assessment weight must equal sum of child assessment weights")
        return self

class CourseCreate(BaseModel):
    name: str = Field(..., min_length=1)
    term: Optional[str] = None
    assessments: List[Assessment]
