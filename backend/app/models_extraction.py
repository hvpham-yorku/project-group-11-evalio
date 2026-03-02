from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class OutlineExtractionRequest(BaseModel):
    filename: str = Field(..., min_length=1)
    content_type: str = Field(..., min_length=1)


class ExtractionAssessment(BaseModel):
    name: str = Field(..., min_length=1)
    weight: float = Field(..., ge=0)
    is_bonus: bool = False
    children: list["ExtractionAssessment"] = Field(default_factory=list)
    rule: Optional[str] = None
    notes: Optional[str] = None


class ExtractionDeadline(BaseModel):
    title: str = Field(..., min_length=1)
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    source: str = Field(default="outline")
    notes: Optional[str] = None


class ExtractionDiagnostics(BaseModel):
    method: str
    ocr_used: bool
    ocr_available: bool = True
    ocr_error: Optional[str] = None
    parse_warnings: list[str] = Field(default_factory=list)
    confidence_score: float = Field(..., ge=0, le=100)
    confidence_level: str
    deterministic_failed_validation: bool = False
    failure_reason: Optional[str] = None
    trigger_gpt: bool = False
    trigger_reasons: list[str] = Field(default_factory=list)
    stub: bool


class ExtractionResponse(BaseModel):
    assessments: list[ExtractionAssessment] = Field(default_factory=list)
    deadlines: list[ExtractionDeadline] = Field(default_factory=list)
    diagnostics: ExtractionDiagnostics
    structure_valid: bool
    message: str


ExtractionAssessment.model_rebuild()
