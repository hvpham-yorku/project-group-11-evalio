from typing import Any, List, Optional

from pydantic import BaseModel, Field, model_validator

SUPPORTED_RULE_TYPES = {
    "pure_multiplicative",
    "best_of",
    "drop_lowest",
    "mandatory_pass",
}


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
    def validate_rule_metadata(self) -> "Assessment":
        if self.rule_type is None:
            return self

        if self.rule_type not in SUPPORTED_RULE_TYPES:
            raise ValueError(f"Unsupported rule_type '{self.rule_type}'")

        config = self.rule_config or {}

        if self.rule_type == "best_of":
            best_count = config.get("best_count", config.get("best"))
            if best_count is None:
                return self
            try:
                normalized_best_count = int(best_count)
            except (TypeError, ValueError) as exc:
                raise ValueError("best_of rule_config must include a positive best_count") from exc
            if normalized_best_count <= 0:
                raise ValueError("best_of rule_config must include a positive best_count")
            return self

        if self.rule_type == "drop_lowest":
            drop_count = config.get("drop_count")
            if drop_count is None:
                return self
            try:
                normalized_drop_count = int(drop_count)
            except (TypeError, ValueError) as exc:
                raise ValueError(
                    "drop_lowest rule_config drop_count must be zero or greater"
                ) from exc
            if normalized_drop_count < 0:
                raise ValueError("drop_lowest rule_config drop_count must be zero or greater")
            return self

        if self.rule_type == "mandatory_pass":
            threshold = config.get("pass_threshold", 50)
            try:
                normalized_threshold = float(threshold)
            except (TypeError, ValueError) as exc:
                raise ValueError(
                    "mandatory_pass rule_config pass_threshold must be between 0 and 100"
                ) from exc
            if not 0 <= normalized_threshold <= 100:
                raise ValueError(
                    "mandatory_pass rule_config pass_threshold must be between 0 and 100"
                )

        return self

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
