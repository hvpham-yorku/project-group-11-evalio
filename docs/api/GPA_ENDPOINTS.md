# GPA Endpoints — API Documentation

> **SCRUM-109 / SCRUM-114** · Universal GPA Converter  
> **Base URL:** `http://localhost:8000`  
> **Auth:** All endpoints require a valid `evalio_access_token` cookie (JWT, HttpOnly).

---

## Table of Contents

1. [Overview](#overview)
2. [Supported GPA Scales](#supported-gpa-scales)
3. [Endpoints](#endpoints)
   - [GET /gpa/scales](#get-gpascales)
   - [GET /courses/{course_id}/gpa](#get-coursescourse_idgpa)
   - [POST /courses/{course_id}/gpa/whatif](#post-coursescourse_idgpawhatif)
   - [POST /gpa/cgpa](#post-gpacgpa)
   - [POST /gpa/convert](#post-gpaconvert)
4. [Error Handling](#error-handling)
5. [Conversion Rules](#conversion-rules)

---

## Overview

The GPA module converts course percentages into letter grades and grade-point values across three internationally recognized scales. It supports:

- **Single-course GPA**: derive GPA from a course's current graded assessments.
- **What-if GPA**: project GPA under hypothetical score overrides (read-only, non-persisting).
- **Cumulative GPA (cGPA)**: compute a weighted cGPA across multiple manually supplied courses.
- **Scale-to-scale GPA conversion**: convert an already-issued GPA between arbitrary numeric scales using normalized linear scaling.
- **Scales metadata**: expose all band tables so the frontend can render dropdowns and legends.

Important distinction:

- `/courses/{course_id}/gpa` and `/gpa/cgpa` are percentage-to-grade-point GPA features.
- `/gpa/convert` is a point-scale normalization feature for an existing GPA
  value such as `8.2 / 9.0 -> 3.6444 / 4.0`.
- The frontend dashboard's "Overall GPA Snapshot" is currently an equal-weight
  course average because the setup flow does not yet collect course credits.

---

## Supported GPA Scales

| Scale Name | Max Point | Use Case |
|------------|-----------|----------|
| `4.0` | 4.0 | OMSAS / Ontario Medical School standard |
| `9.0` | 9.0 | York University |
| `10.0` | 10.0 | International / European |

### Boundary Rule

Conversion uses **inclusive lower bounds** (`>=`), evaluated from the highest band downward.

| Percentage | 4.0 Scale Result | Why |
|-----------|-------------------|-----|
| 79.5% | B+ (3.3) | 79.5 < 80 threshold |
| 80.0% | A- (3.7) | 80.0 >= 80 threshold |

Negative percentages are rejected. Bonus-adjusted percentages above 100 still
map to the highest GPA band on the requested supported scale.

---

## Endpoints

### GET `/gpa/scales`

Return metadata for every supported GPA scale, including all bands with letter grades, minimum percentages, grade points, and descriptions.

**Use case:** Populate frontend dropdowns and GPA legend tables.

#### Request

```
GET /gpa/scales
Cookie: evalio_access_token=<jwt>
```

No query parameters or body required.

#### Response `200 OK`

```json
{
  "scales": [
    {
      "scale": "4.0",
      "max_point": 4.0,
      "bands": [
        {
          "letter": "A+",
          "min_percent": 90,
          "grade_point": 4.0,
          "description": "Exceptional"
        },
        {
          "letter": "A",
          "min_percent": 85,
          "grade_point": 3.9,
          "description": "Excellent"
        }
        // … remaining bands
      ]
    },
    {
      "scale": "9.0",
      "max_point": 9.0,
      "bands": [ /* … */ ]
    },
    {
      "scale": "10.0",
      "max_point": 10.0,
      "bands": [ /* … */ ]
    }
  ]
}
```

---

### GET `/courses/{course_id}/gpa`

Compute the current GPA for a single course on a given scale. Uses the grading engine to calculate the final percentage from graded assessments, then maps it through the GPA converter.

#### Request

```
GET /courses/550e8400-e29b-41d4-a716-446655440000/gpa?scale=4.0
Cookie: evalio_access_token=<jwt>
```

| Parameter | In | Type | Required | Default | Description |
|-----------|------|------|----------|---------|-------------|
| `course_id` | path | UUID | yes | — | Course identifier |
| `scale` | query | string | no | `"4.0"` | GPA scale: `4.0`, `9.0`, or `10.0` |

#### Response `200 OK`

```json
{
  "course_id": "550e8400-e29b-41d4-a716-446655440000",
  "course_name": "EECS 2311",
  "percentage": 82.5,
  "is_failed": false,
  "totals": {
    "final_total": 82.5,
    "earned": 82.5,
    "possible": 100.0,
    "details": { /* per-assessment breakdown from grading engine */ }
  },
  "gpa": {
    "letter": "A-",
    "grade_point": 3.7,
    "description": "Very Good",
    "scale": "4.0",
    "percentage": 82.5
  },
  "all_scales": {
    "4.0": { "letter": "A-", "grade_point": 3.7, "description": "Very Good", "scale": "4.0", "percentage": 82.5 },
    "9.0": { "letter": "A",  "grade_point": 8.0, "description": "Excellent", "scale": "9.0", "percentage": 82.5 },
    "10.0": { "letter": "B+", "grade_point": 8.0, "description": "Good",      "scale": "10.0", "percentage": 82.5 }
  }
}
```

#### Errors

| Status | Condition |
|--------|-----------|
| 404 | Course not found or not owned by the authenticated user |
| 400 | Unsupported GPA scale |

---

### POST `/courses/{course_id}/gpa/whatif`

Project the GPA if hypothetical scores are applied to ungraded assessments. **Read-only** — does NOT persist any changes.

Internally delegates to `strategy_service.compute_multi_whatif` for the projected percentage, then maps through the GPA converter.

#### Request

```
POST /courses/550e8400-e29b-41d4-a716-446655440000/gpa/whatif
Cookie: evalio_access_token=<jwt>
Content-Type: application/json

{
  "hypothetical_scores": [
    { "assessment_name": "Final Exam", "score": 85.0 },
    { "assessment_name": "Project Phase 3", "score": 90.0 }
  ],
  "scale": "9.0"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `hypothetical_scores` | array | yes | — | List of `{assessment_name, score}` overrides. Score is 0-100. |
| `scale` | string | no | `"4.0"` | Target GPA scale |

#### Response `200 OK`

```json
{
  "course_id": "550e8400-e29b-41d4-a716-446655440000",
  "course_name": "EECS 2311",
  "projected_percentage": 87.25,
  "gpa": {
    "letter": "A",
    "grade_point": 3.9,
    "description": "Excellent",
    "scale": "4.0",
    "percentage": 87.25
  },
  "all_scales": {
    "4.0":  { "letter": "A",  "grade_point": 3.9, "scale": "4.0",  "percentage": 87.25 },
    "9.0":  { "letter": "A",  "grade_point": 8.0, "scale": "9.0",  "percentage": 87.25 },
    "10.0": { "letter": "A-", "grade_point": 8.5, "scale": "10.0", "percentage": 87.25 }
  },
  "whatif_detail": {
    "original_grade": 78.0,
    "projected_grade": 87.25,
    "delta": 9.25,
    "overrides_applied": [
      { "assessment_name": "Final Exam", "score": 85.0 },
      { "assessment_name": "Project Phase 3", "score": 90.0 }
    ]
  }
}
```

#### Errors

| Status | Condition |
|--------|-----------|
| 404 | Course not found |
| 400 | Unsupported scale, or invalid assessment name in hypothetical_scores |

---

### POST `/gpa/cgpa`

Calculate cumulative GPA from manually supplied course entries. Useful when a student wants to see their overall GPA across all courses, even those not fully set up in Evalio.

#### Request

```
POST /gpa/cgpa
Cookie: evalio_access_token=<jwt>
Content-Type: application/json

{
  "courses": [
    { "name": "EECS 2311", "percentage": 82.5, "credits": 3.0 },
    { "name": "EECS 3101", "percentage": 91.0, "credits": 3.0 },
    { "name": "NATS 1740", "percentage": null, "credits": 6.0, "grade_type": "pass_fail" }
  ],
  "scale": "4.0"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `courses` | array (min 1) | yes | — | List of course entries |
| `courses[].name` | string | yes | — | Course display name |
| `courses[].percentage` | float \| null | no | null | Final grade (%). `null` for non-numeric. |
| `courses[].credits` | float (> 0) | yes | — | Credit weight |
| `courses[].grade_type` | string | no | `"numeric"` | `"numeric"`, `"pass_fail"`, or `"withdrawn"` |
| `scale` | string | no | `"4.0"` | Target GPA scale |

#### Response `200 OK`

```json
{
  "scale": "4.0",
  "cgpa": 3.8,
  "total_credits": 6.0,
  "total_weighted_points": 22.8,
  "courses": [
    {
      "name": "EECS 2311",
      "credits": 3.0,
      "percentage": 82.5,
      "letter": "A-",
      "grade_point": 3.7,
      "description": "Very Good",
      "scale": "4.0",
      "weighted_contribution": 11.1
    },
    {
      "name": "EECS 3101",
      "credits": 3.0,
      "percentage": 91.0,
      "letter": "A+",
      "grade_point": 4.0,
      "description": "Exceptional",
      "scale": "4.0",
      "weighted_contribution": 12.0
    }
  ],
  "excluded": [
    {
      "name": "NATS 1740",
      "credits": 6.0,
      "grade_type": "pass_fail",
      "reason": "Non-numeric grade excluded from GPA calculation"
    }
  ],
  "formula": "cGPA = Σ(GP × credits) / Σ(credits) = 22.8 / 6.0 = 3.8"
}
```

#### Key Behaviours

- **Non-numeric courses** (`pass_fail`, `withdrawn`, or `percentage: null`) are excluded from the weighted average but reported in the `excluded` array.
- The `formula` field shows the human-readable calculation for transparency.

#### Errors

| Status | Condition |
|--------|-----------|
| 400 | Unsupported scale, or empty courses array |
| 422 | Validation error (missing required fields, `credits <= 0`) |

---

### POST `/gpa/convert`

Convert an already-issued GPA value between arbitrary point-scale maxima.

This endpoint is intentionally different from the percentage-based GPA endpoints:
it does not infer letters or percentages from institutional bands. Instead, it
normalizes the current GPA against its source scale and applies that ratio to
the target scale.

#### Request

```
POST /gpa/convert
Cookie: evalio_access_token=<jwt>
Content-Type: application/json

{
  "current_gpa": 8.2,
  "from_scale": 9.0,
  "to_scale": 4.0
}
```

#### Response `200 OK`

```json
{
  "current_gpa": 8.2,
  "from_scale": 9.0,
  "to_scale": 4.0,
  "converted_gpa": 3.6444,
  "normalized_percent": 91.11,
  "formula": "converted_gpa = (current_gpa / from_scale) * to_scale = (8.2 / 9.0) * 4.0 = 3.6444",
  "method": "normalized_linear_scale_conversion"
}
```

#### Errors

| Status | Condition |
|--------|-----------|
| 400 | `current_gpa` exceeds `from_scale`, or a scale is not greater than 0 |
| 422 | Validation error (missing fields, negative values) |

---

## Error Handling

All error responses follow FastAPI's standard format:

```json
{
  "detail": "Unsupported GPA scale 'abc'. Supported: 4.0, 9.0, 10.0"
}
```

| HTTP Status | Meaning |
|-------------|---------|
| 400 | Bad request (unsupported scale, invalid assessment name, invalid negative percentage, invalid scale-conversion input) |
| 401 | Missing or expired JWT cookie |
| 404 | Course not found or not owned by user |
| 422 | Pydantic validation error (malformed request body) |

---

## Conversion Rules

### 4.0 Scale (OMSAS)

| Letter | Min % | Grade Point |
|--------|-------|-------------|
| A+ | 90 | 4.0 |
| A  | 85 | 3.9 |
| A- | 80 | 3.7 |
| B+ | 77 | 3.3 |
| B  | 73 | 3.0 |
| B- | 70 | 2.7 |
| C+ | 67 | 2.3 |
| C  | 63 | 2.0 |
| C- | 60 | 1.7 |
| D+ | 57 | 1.3 |
| D  | 53 | 1.0 |
| D- | 50 | 0.7 |
| F  |  0 | 0.0 |

### 9.0 Scale (York University)

| Letter | Min % | Grade Point |
|--------|-------|-------------|
| A+ | 90 | 9.0 |
| A  | 80 | 8.0 |
| B+ | 75 | 7.0 |
| B  | 70 | 6.0 |
| C+ | 65 | 5.0 |
| C  | 60 | 4.0 |
| D+ | 55 | 3.0 |
| D  | 50 | 2.0 |
| E  | 40 | 1.0 |
| F  |  0 | 0.0 |

### 10.0 Scale (International)

| Letter | Min % | Grade Point |
|--------|-------|-------------|
| A+ | 95 | 10.0 |
| A  | 90 |  9.0 |
| A- | 85 |  8.5 |
| B+ | 80 |  8.0 |
| B  | 75 |  7.5 |
| B- | 70 |  7.0 |
| C+ | 65 |  6.5 |
| C  | 60 |  6.0 |
| C- | 55 |  5.5 |
| D  | 50 |  5.0 |
| D- | 40 |  4.0 |
| F  |  0 |  0.0 |
