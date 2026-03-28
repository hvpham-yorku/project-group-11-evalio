"""
Universal GPA Converter — SCRUM-109

Converts course percentages to 4.0 (OMSAS), 9.0 (YorkU), and 10.0 GPA scales.

Design decisions
────────────────
- Boundary comparison uses `>=` consistently against inclusive lower bounds.
  e.g. 79.5% < 80.0 threshold → B+ (3.3) on 4.0 scale, NOT A- (3.7).
  e.g. 80.0% >= 80.0 threshold → A- (3.7).
- No rounding of input percentages before lookup — raw float compared directly.
- Non-numeric grades (P/F, W) are excluded from GPA and returned as structured metadata.
- Conversion logic is fully decoupled from UI; adding a new scale requires only a new
  SCALE entry (list of GpaBand).
- When course weights don't sum to 100%, the caller (strategy_service) normalises;
  this module works purely on final percentages.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# ─── Band definition ───────────────────────────────────────────────────────────

@dataclass(frozen=True)
class GpaBand:
    letter: str
    min_percent: float   # inclusive lower bound (>=)
    grade_point: float
    description: str


# ─── 4.0 OMSAS scale (Ontario Medical School Application Service) ──────────────

SCALE_4_0: list[GpaBand] = [
    GpaBand("A+", 90, 4.0, "Exceptional"),
    GpaBand("A",  85, 3.9, "Excellent"),
    GpaBand("A-", 80, 3.7, "Very Good"),
    GpaBand("B+", 77, 3.3, "Good"),
    GpaBand("B",  73, 3.0, "Good"),
    GpaBand("B-", 70, 2.7, "Satisfactory"),
    GpaBand("C+", 67, 2.3, "Adequate"),
    GpaBand("C",  63, 2.0, "Adequate"),
    GpaBand("C-", 60, 1.7, "Marginal"),
    GpaBand("D+", 57, 1.3, "Marginal"),
    GpaBand("D",  53, 1.0, "Minimum Pass"),
    GpaBand("D-", 50, 0.7, "Minimum Pass"),
    GpaBand("F",   0, 0.0, "Failing"),
]

# ─── 9.0 YorkU scale ──────────────────────────────────────────────────────────

SCALE_9_0: list[GpaBand] = [
    GpaBand("A+", 90, 9.0, "Exceptional"),
    GpaBand("A",  80, 8.0, "Excellent"),
    GpaBand("B+", 75, 7.0, "Very Good"),
    GpaBand("B",  70, 6.0, "Good"),
    GpaBand("C+", 65, 5.0, "Competent"),
    GpaBand("C",  60, 4.0, "Fairly Competent"),
    GpaBand("D+", 55, 3.0, "Passing"),
    GpaBand("D",  50, 2.0, "Marginally Passing"),
    GpaBand("E",  40, 1.0, "Marginally Failing"),
    GpaBand("F",   0, 0.0, "Failing"),
]

# ─── 10.0 International scale ─────────────────────────────────────────────────

SCALE_10_0: list[GpaBand] = [
    GpaBand("A+", 95, 10.0, "Outstanding"),
    GpaBand("A",  90,  9.0, "Excellent"),
    GpaBand("A-", 85,  8.5, "Very Good"),
    GpaBand("B+", 80,  8.0, "Good"),
    GpaBand("B",  75,  7.5, "Good"),
    GpaBand("B-", 70,  7.0, "Above Average"),
    GpaBand("C+", 65,  6.5, "Average"),
    GpaBand("C",  60,  6.0, "Satisfactory"),
    GpaBand("C-", 55,  5.5, "Below Average"),
    GpaBand("D",  50,  5.0, "Minimum Pass"),
    GpaBand("D-", 40,  4.0, "Poor"),
    GpaBand("F",   0,  0.0, "Failing"),
]

SCALES: dict[str, list[GpaBand]] = {
    "4.0": SCALE_4_0,
    "9.0": SCALE_9_0,
    "10.0": SCALE_10_0,
}

SUPPORTED_SCALES: list[str] = list(SCALES.keys())


# ─── Exceptions ────────────────────────────────────────────────────────────────

class GpaConversionError(Exception):
    pass


# ─── Core conversion ──────────────────────────────────────────────────────────

def _coerce_finite_float(value: Any, *, field_name: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise GpaConversionError(f"{field_name} must be a number") from exc

    if parsed != parsed or parsed in (float("inf"), float("-inf")):
        raise GpaConversionError(f"{field_name} must be a finite number")
    return parsed


def _normalize_percentage(percent: Any) -> float:
    parsed = _coerce_finite_float(percent, field_name="percentage")
    if parsed < 0:
        raise GpaConversionError("percentage must be greater than or equal to 0")
    return parsed


def _normalize_credits(credits: Any) -> float:
    parsed = _coerce_finite_float(credits, field_name="credits")
    if parsed <= 0:
        raise GpaConversionError("credits must be greater than 0")
    return parsed


def _normalize_scale_value(scale_value: Any, *, field_name: str) -> float:
    parsed = _coerce_finite_float(scale_value, field_name=field_name)
    if parsed <= 0:
        raise GpaConversionError(f"{field_name} must be greater than 0")
    return parsed


def _normalize_current_gpa(current_gpa: Any, *, source_scale: float) -> float:
    parsed = _coerce_finite_float(current_gpa, field_name="current_gpa")
    if parsed < 0:
        raise GpaConversionError("current_gpa must be greater than or equal to 0")
    if parsed > source_scale:
        raise GpaConversionError(
            f"current_gpa cannot exceed from_scale ({source_scale:g})"
        )
    return parsed

def get_scale(scale_name: str) -> list[GpaBand]:
    """Return the band table for *scale_name* or raise ``GpaConversionError``."""
    bands = SCALES.get(scale_name)
    if bands is None:
        raise GpaConversionError(
            f"Unsupported GPA scale '{scale_name}'. "
            f"Supported: {', '.join(SUPPORTED_SCALES)}"
        )
    return bands


def convert_percentage(percent: float, scale_name: str) -> dict[str, Any]:
    """
    Map a percentage to a GPA band on the requested scale.

    Boundary rule: ``percent >= band.min_percent`` (inclusive lower bound),
    evaluated from the highest band downward.
    """
    normalized_percent = _normalize_percentage(percent)
    bands = get_scale(scale_name)
    for band in bands:
        if normalized_percent >= band.min_percent:
            return {
                "letter": band.letter,
                "grade_point": band.grade_point,
                "description": band.description,
                "scale": scale_name,
                "percentage": round(normalized_percent, 2),
            }
    # Fallback — should never be reached because all scales end with min=0.
    last = bands[-1]
    return {
        "letter": last.letter,
        "grade_point": last.grade_point,
        "description": last.description,
        "scale": scale_name,
        "percentage": round(normalized_percent, 2),
    }


def convert_percentage_all_scales(percent: float) -> dict[str, dict[str, Any]]:
    """Convert a single percentage to every supported GPA scale."""
    return {name: convert_percentage(percent, name) for name in SUPPORTED_SCALES}


def convert_gpa_value(
    current_gpa: float,
    from_scale: float,
    to_scale: float,
) -> dict[str, Any]:
    """
    Convert an already-issued GPA between arbitrary numeric scales.

    This is a normalized point-scale conversion, not a transcript-equivalency
    or institutional percentage conversion.
    """
    normalized_from_scale = _normalize_scale_value(
        from_scale,
        field_name="from_scale",
    )
    normalized_to_scale = _normalize_scale_value(
        to_scale,
        field_name="to_scale",
    )
    normalized_current_gpa = _normalize_current_gpa(
        current_gpa,
        source_scale=normalized_from_scale,
    )

    ratio = normalized_current_gpa / normalized_from_scale
    converted_value = ratio * normalized_to_scale

    return {
        "current_gpa": round(normalized_current_gpa, 4),
        "from_scale": round(normalized_from_scale, 4),
        "to_scale": round(normalized_to_scale, 4),
        "converted_gpa": round(converted_value, 4),
        "normalized_percent": round(ratio * 100, 2),
        "formula": (
            f"converted_gpa = (current_gpa / from_scale) * to_scale = "
            f"({round(normalized_current_gpa, 4)} / {round(normalized_from_scale, 4)}) "
            f"* {round(normalized_to_scale, 4)} = {round(converted_value, 4)}"
        ),
        "method": "normalized_linear_scale_conversion",
    }


# ─── Weighted cGPA ─────────────────────────────────────────────────────────────

def calculate_weighted_gpa(
    courses: list[dict[str, Any]],
    scale_name: str | None = None,
    *,
    scale: str | None = None,
) -> dict[str, Any]:
    """
    Calculate weighted cumulative GPA from a list of course entries.

    Each *course* dict must contain:
      - ``percentage``  : float | None  — final course grade (%).
      - ``credits``     : float         — credit weight (e.g. 3.0, 6.0).
      - ``name``        : str           — course display name.
      - ``grade_type``  : str           — ``"numeric"`` (default), ``"pass_fail"``,
                                          or ``"withdrawn"``.

    Non-numeric entries are excluded from the GPA computation but still appear
    in the *excluded* list so the frontend can render them.
    """
    resolved_scale = scale if scale is not None else scale_name
    if resolved_scale is None:
        raise TypeError("calculate_weighted_gpa() missing required GPA scale")
    if scale_name is not None and scale is not None and scale_name != scale:
        raise GpaConversionError(
            f"Conflicting GPA scales provided: '{scale_name}' and '{scale}'"
        )

    get_scale(resolved_scale)  # validate early

    total_weighted_points = 0.0
    total_credits = 0.0
    course_results: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []

    for entry in courses:
        name = entry.get("name", "Unknown")
        credits = _normalize_credits(entry.get("credits", 0))
        percentage = entry.get("percentage")
        grade_type = entry.get("grade_type", "numeric")

        # ── Non-numeric grades: skip GPA, record metadata ──
        if grade_type != "numeric" or percentage is None:
            excluded.append({
                "name": name,
                "credits": credits,
                "grade_type": grade_type,
                "reason": "Non-numeric grade excluded from GPA calculation",
            })
            continue

        pct = _normalize_percentage(percentage)
        conversion = convert_percentage(pct, resolved_scale)
        gp = conversion["grade_point"]

        total_weighted_points += gp * credits
        total_credits += credits

        course_results.append({
            "name": name,
            "credits": credits,
            "percentage": round(pct, 2),
            **conversion,
            "weighted_contribution": round(gp * credits, 4),
        })

    cgpa = (total_weighted_points / total_credits) if total_credits > 0 else 0.0

    return {
        "scale": resolved_scale,
        "cgpa": round(cgpa, 2),
        "total_credits": total_credits,
        "total_weighted_points": round(total_weighted_points, 4),
        "courses": course_results,
        "excluded": excluded,
        "formula": (
            f"cGPA = Σ(GP × credits) / Σ(credits) = "
            f"{round(total_weighted_points, 2)} / {total_credits} = {round(cgpa, 2)}"
        ),
    }


def get_scales_metadata() -> list[dict[str, Any]]:
    """Return metadata about all supported scales (for frontend dropdowns)."""
    result = []
    for name, bands in SCALES.items():
        result.append({
            "scale": name,
            "max_point": bands[0].grade_point,
            "bands": [
                {
                    "letter": b.letter,
                    "min_percent": b.min_percent,
                    "grade_point": b.grade_point,
                    "description": b.description,
                }
                for b in bands
            ],
        })
    return result
