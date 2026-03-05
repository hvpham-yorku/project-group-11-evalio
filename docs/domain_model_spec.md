# Evalio Backend Domain Model Specification

This document describes the **actual backend domain model** implemented in code, so database and architecture work can align with runtime behavior.

Source files analyzed:

- `backend/app/models.py`
- `backend/app/models_deadline.py`
- `backend/app/models_extraction.py`
- `backend/app/services/grading_service.py`
- `backend/app/services/course_service.py`

## 1. System Domains

The backend can be viewed as three major logical domains.

### 1.1 Academic Planning Domain

Primary responsibility:

- Model course grading structures and perform deterministic grade analysis.

Core domain objects and logic:

- `CourseCreate`
- `Assessment`
- `ChildAssessment`
- `course_service` orchestration
- `grading_service` calculation engine
- what-if analysis (`calculate_whatif_scenario` and service wrappers)

What this domain does:

- course setup and updates
- score entry validation
- weighted contribution computation
- target feasibility analysis
- minimum-required score analysis
- read-only scenario projections

### 1.2 Course Outline Extraction Domain

Primary responsibility:

- Parse uploaded outlines into structured academic planning data and extraction diagnostics.

Core models:

- `OutlineExtractionRequest`
- `ExtractionAssessment`
- `ExtractionDeadline`
- `ExtractionDiagnostics`
- `ExtractionResponse`

What this domain does:

- intake and classify upload requests
- extract assessments/deadlines from unstructured outline content
- attach parse diagnostics/confidence/trigger metadata
- provide a structured response that can be mapped into course setup

### 1.3 Deadline Management Domain

Primary responsibility:

- Manage course-associated due dates and export workflows.

Core models:

- `Deadline`
- `DeadlineCreate`
- `DeadlineUpdate`
- `DeadlineExportRequest`

What this domain does:

- create/update/delete/list deadlines per course
- maintain source and metadata fields (`source`, `assessment_name`, notes)
- support export flows (ICS/Google Calendar integrations via service layer)
- preserve deadline identity and linkage to a course (`course_id`)

## 2. Core Domain Entities

### Course

Represents a user-defined course with a list of top-level assessments.

Model: `CourseCreate`

- `name: str`
  - Course identifier/display name (for example, `EECS2311`).
  - Required, non-empty.
- `term: Optional[str]`
  - Academic term label (for example, `W26`).
  - Optional.
- `assessments: List[Assessment]`
  - Top-level assessment definitions for grading calculations.
  - Required list.

### Assessment

Represents a top-level grading item or a parent grouping item (when `children` exist).

Model: `Assessment`

- `name: str`
  - Assessment label, used heavily as lookup key in update APIs and grading logic.
- `weight: float`
  - Weighted contribution percentage capacity.
  - Must be `> 0`.
- `raw_score: Optional[float]`
  - Earned points (numerator), nullable.
  - Must be `>= 0` when present.
- `total_score: Optional[float]`
  - Maximum points (denominator), nullable.
  - Must be `> 0` when present.
- `children: Optional[List[ChildAssessment]]`
  - Child assessment items for nested grading structures.
- `rule_type: Optional[str]`
  - Rule identifier interpreted by grading engine for nested items.
- `rule_config: Optional[dict[str, Any]]`
  - Rule parameters (for example `best_count`, `drop_count`).
- `is_bonus: bool = False`
  - Marks assessment as bonus contribution (added separately from core total).

Validation rules in model:

- If `children` is present and `rule_type` is not rule-based:
  - Sum of child weights must equal parent weight.
- If `rule_type` is `best_of` or `drop_lowest`:
  - Sum of child weights must be greater than or equal to parent weight.

### ChildAssessment

Represents a nested grading item under a parent assessment.

Model: `ChildAssessment`

- `name: str`
- `weight: float` (must be `> 0`)
- `raw_score: Optional[float]` (must be `>= 0` when present)
- `total_score: Optional[float]` (must be `> 0` when present)

Notes:

- Child items do not carry `rule_type`, `rule_config`, or `is_bonus`.
- Grading logic treats children as weighted components in parent contribution calculation.

### Rule

There is no standalone Pydantic `Rule` entity in `models.py`. Rules are embedded in `Assessment` via:

- `rule_type`
- `rule_config`

Rule interpretation is performed in `grading_service.py`.

### Scenario

There is no persisted scenario model in the analyzed files.

Scenario behavior exists as computation inputs/outputs:

- `calculate_whatif_scenario(course, assessment_name, hypothetical_score)`
- Returns projected grade effects without persistence.

From current backend behavior:

- Scenarios are **ephemeral/read-only calculations**, not stored as domain records.

### Deadline

Represents course deadline/task metadata used by deadline endpoints and exports.

Model: `Deadline` in `models_deadline.py`

- `deadline_id: UUID`
- `course_id: UUID`
- `title: str`
- `due_date: str` (ISO date, `YYYY-MM-DD`)
- `due_time: Optional[str]` (`HH:MM` 24h)
- `source: str` (`manual` or `outline` semantics)
- `notes: Optional[str]`
- `assessment_name: Optional[str]`
- `exported_to_gcal: bool`
- `gcal_event_id: Optional[str]`
- `created_at: str` (ISO datetime string)

Auxiliary request models:

- `DeadlineCreate`
- `DeadlineUpdate`
- `DeadlineExportRequest`

### Extraction Models

Used for outline parsing/extraction pipeline responses.

Models in `models_extraction.py`:

- `OutlineExtractionRequest`
  - `filename: str`
  - `content_type: str`
- `ExtractionAssessment`
  - `name`, `weight`, `is_bonus`, `children`, `rule`, `total_count`, `effective_count`, `unit_weight`, `rule_type`, `notes`
- `ExtractionDeadline`
  - `title`, `due_date`, `due_time`, `source`, `notes`
- `ExtractionDiagnostics`
  - extraction telemetry and validation flags (`confidence_score`, `failure_reason`, OCR flags, trigger flags, etc.)
- `ExtractionResponse`
  - `course_code`, `assessments`, `deadlines`, `diagnostics`, `structure_valid`, `message`

## 3. Entity Relationship Overview

The current backend domain relationships can be summarized as:

```text
User (user_id)
└── Course (course_id)
    ├── Assessment (identified by name in current APIs)
    │   └── ChildAssessment (embedded under parent Assessment)
    ├── Deadline (deadline_id, linked by course_id)
    └── Scenario (conceptual today; what-if inputs are computed, not persisted)
```

Operational relationship view:

```text
[User]
  1 ─── * [Course]
            1 ─── * [Assessment]
                      1 ─── * [ChildAssessment]
            1 ─── * [Deadline]
            1 ─── * [Scenario] (future persistent model)
```

## 4. Aggregate Root

`Course` should be treated as the aggregate root for academic planning in this domain.

Within current backend behavior, the course aggregate conceptually owns:

- top-level assessments
- nested child assessments
- embedded score state (`raw_score`, `total_score`)
- rule metadata (`rule_type`, `rule_config`)
- bonus flags (`is_bonus`)
- deadline association by `course_id`.

Reasoning:

- Most business invariants are evaluated in the context of one course.
- Most command operations are course-scoped (`/courses/{course_id}/...`).
- Grading, what-if, and target feasibility all derive from a full course aggregate snapshot.

## 5. Naming Conventions (Exact Backend Field Names)

### `CourseCreate`

- `name`
- `term`
- `assessments`

### `Assessment`

- `name`
- `weight`
- `raw_score`
- `total_score`
- `children`
- `rule_type`
- `rule_config`
- `is_bonus`

### `ChildAssessment`

- `name`
- `weight`
- `raw_score`
- `total_score`

### Deadline-related names

- `deadline_id`
- `course_id`
- `title`
- `due_date`
- `due_time`
- `source`
- `notes`
- `assessment_name`
- `exported_to_gcal`
- `gcal_event_id`
- `created_at`

### Extraction naming highlights

- `course_code`
- `structure_valid`
- `confidence_score`
- `failure_reason`
- `trigger_reasons`
- `ocr_used`
- `ocr_available`
- `ocr_error`

These names should be preserved when designing persistent schemas and mappings.

## 6. Course Structure

The grading structure is hierarchical:

```text
CourseCreate
└── assessments: List[Assessment]
    ├── leaf assessment (no children)
    └── parent assessment
        └── children: List[ChildAssessment]
```

How nested assessments are represented:

- Parent item is still an `Assessment` in top-level course list.
- Children are embedded inside parent `children` field.
- Parent rules (`rule_type`, `rule_config`) control how child performances are aggregated.

Current code assumptions:

- Parent and child names are important identifiers in API update flows.
- Parent-child structure is processed in grading logic directly from nested objects.

## 7. Scoring Model

Primary score fields:

- `raw_score`: achieved points
- `total_score`: max points
- `weight`: contribution capacity

Key formulas in `grading_service.py`:

1. Assessment percent:

- `percent = (raw_score / total_score) * 100`

2. Leaf contribution:

- `contribution = (percent * weight) / 100`

3. Parent with children:

- Compute each child contribution as `(child_percent * child_weight) / 100`.
- Optionally filter children via rule (best/drop).
- Sum selected child contributions.

4. Course totals:

- `core_total`: sum of non-bonus assessment contributions.
- `bonus_total`: sum of `is_bonus=True` contributions.
- `final_total = core_total + bonus_total`.

Missing-score handling:

- In projection methods, missing scores can be treated as:
  - `0%` (current/min view)
  - `100%` (max potential view)
  - hypothetical percentage for what-if calculations.

## 8. Rule System

Rule handling in current grading engine (`grading_service.py`):

### `best_of`

Implemented.

- `rule_type == "best_of"`
- Reads `best_count` from `rule_config`.
- Sorts child percentages descending.
- Keeps top `best_count` child items.

### `drop_lowest`

Implemented.

- `rule_type == "drop_lowest"`
- Reads `drop_count` from `rule_config` (default 1).
- Drops lowest `drop_count` child items by percent.

### `mandatory_pass`

Not interpreted in current grading logic.

- May exist conceptually, but no grading branch currently applies mandatory-pass behavior.

### `bonus` (as a rule)

Not interpreted as `rule_type` in current grading logic.

Bonus behavior is currently modeled via `Assessment.is_bonus` field, not rule evaluation.

Rule config usage summary:

- `best_of` expects `best_count`.
- `drop_lowest` expects `drop_count`.
- Invalid/missing values fall back to safe defaults in code.

## 9. Bonus Assessments

Bonus behavior is field-driven (`is_bonus`), not rule-driven.

Current behavior:

- Bonus assessments contribute to `bonus_total`.
- Non-bonus assessments contribute to `core_total`.
- Final grade reported as `core_total + bonus_total`.

Implications:

- Bonus can increase final grade beyond core weight contribution.
- Target feasibility in `course_service` explicitly computes on non-bonus path for core potential calculations.

## 10. Domain Workflows

### Course Creation Flow

1. API receives `CourseCreate` payload.
2. `course_service.create_course()` validates:
   - at least one assessment exists
   - top-level total weight does not exceed 100.
3. Repository persists the course aggregate.
4. Service returns `course_id`, `course`, and summary metadata.

### Grade Update Flow

1. API receives assessment grade updates (`name`, `raw_score`, `total_score`).
2. `course_service.update_course_grades()` loads course by `course_id`.
3. Service validates payload constraints:
   - assessment exists
   - no duplicates in payload
   - score pair consistency (`raw_score`/`total_score` both set or both null)
   - numeric bounds.
4. Service mutates in-memory `CourseCreate.assessments`.
5. Repository writes updated course aggregate.
6. `grading_service.calculate_course_totals()` computes `core_total`, `bonus_total`, `final_total`.
7. Service returns updated standing and assessment score state.

### What-If Calculation Flow

1. API receives `assessment_name` + hypothetical percentage score.
2. `course_service.run_whatif_scenario()` loads course by `course_id`.
3. `grading_service.calculate_whatif_scenario()` computes projected outcomes:
   - current standing
   - projected grade
   - remaining potential
   - maximum possible.
4. Result is returned as read-only analysis.
5. No persistence mutation occurs.

### Deadline Creation Flow

1. API receives `DeadlineCreate` payload for a course.
2. Deadline service validates course ownership (via course service in route layer).
3. `DeadlineCreate` is converted into stored `Deadline` with generated `deadline_id` and `created_at`.
4. Deadline repository stores record keyed by `user_id` + `course_id`.
5. API returns created deadline object.

## 11. Business Constraints

Domain constraints currently enforced by models/services include:

- `Assessment.weight > 0`.
- `ChildAssessment.weight > 0`.
- `raw_score >= 0` when provided.
- `total_score > 0` when provided.
- For grade updates: `raw_score <= total_score`.
- For grade updates: both `raw_score` and `total_score` must be provided together or both null.
- Course creation requires at least one assessment.
- Course creation rejects top-level total assessment weight above 100.
- Weight update endpoint requires exact top-level weight sum of 100.
- Parent-child consistency:
  - non-rule parent: child weights must exactly equal parent weight.
  - `best_of` / `drop_lowest` parent: child weights must be greater than or equal to parent weight.
- Duplicate assessment names in update payload are rejected.
- Updates referencing non-existent assessment names are rejected.
- What-if and minimum-required calculations reject unknown assessments and already-graded target items.

Practical note:

- In several calculations, core and bonus totals are intentionally separated; bonus does not reduce required core structure validation logic.

## 12. Service Responsibilities

### `course_service`

Primary orchestration service for course lifecycle and course-scoped operations.

Responsibilities:

- create/list course records
- update assessment weights
- update assessment grades
- run target feasibility checks
- run minimum-required score analysis
- run single-assessment what-if analysis
- enforce course-domain validations before persistence
- coordinate repository writes/reads for course state

### `grading_service`

Pure grading and analysis logic operating on `CourseCreate` domain objects.

Responsibilities:

- convert raw/total points into percentages
- compute weighted contributions for leaf and nested assessments
- apply implemented rule behaviors (`best_of`, `drop_lowest`)
- compute course totals (`core_total`, `bonus_total`, `final_total`)
- compute remaining potential and max/min projections
- compute minimum required score for target achievement
- compute read-only what-if projections
- map final percentages to York letter/point equivalents

## 13. Database Implications

A relational schema intended to match current backend domain semantics must support:

- Nested assessments:
  - Parent-child assessment relationships.
  - Parent-level rules over child sets.
- Score model with **both**:
  - `raw_score`
  - `total_score`
  - not just one percentage/score field.
- Rule metadata:
  - `rule_type`
  - `rule_config` (structured config object/JSON).
- Bonus assessments:
  - explicit `is_bonus` semantics in storage.
- Scenario support:
  - what-if inputs/results should be represented if scenario persistence is needed.
- Deadline model:
  - course-linked deadline records and export metadata if deadline persistence is in scope.
- Name-based update compatibility:
  - current services often identify assessments by `name`; schema and mappings should preserve deterministic assessment identity behavior.

Implementation note for DB designers:

- Current services operate on a nested domain object (`CourseCreate`).
- If persistence is normalized, repository mapping must faithfully reconstruct this object shape to keep service behavior unchanged.

## 14. Entity Identity and Keys

### Current behavior

- `Course` identity is stable and UUID-based:
  - `course_id` is returned by create/list APIs and used by all `/courses/{course_id}/...` operations.
- `Assessment` identity is currently name-based in course operations:
  - weight and grade updates target assessments by `name`.
- `ChildAssessment` identity is currently contextual:
  - children are identified by position/name within their parent assessment.
- `Deadline` identity is UUID-based:
  - `deadline_id` is used for update/delete/export operations.

### Future improvement (recommended identity model)

- Add `assessment_id: UUID` for top-level assessments.
- Add `parent_assessment_id: UUID | null` to explicitly support hierarchy in persistence.
- Optionally add `child_assessment_id: UUID` if child items become first-class rows.

### Why stable identity matters

- Renaming assessments should not break update behavior.
- Name collisions (duplicate or similar labels) become safer to handle.
- Cross-table references for scenarios/rules/deadlines become reliable.
- Audit trails and historical records require immutable identifiers.
- Synchronization between frontend edits and backend persistence is more robust with UUID keys.

## 15. Full `CourseCreate` JSON Example

```json
{
  "name": "EECS2311",
  "term": "W26",
  "assessments": [
    {
      "name": "Assignments",
      "weight": 20,
      "raw_score": null,
      "total_score": null,
      "rule_type": "drop_lowest",
      "rule_config": {
        "drop_count": 1
      },
      "children": [
        { "name": "A1", "weight": 5, "raw_score": 84, "total_score": 100 },
        { "name": "A2", "weight": 5, "raw_score": 78, "total_score": 100 },
        { "name": "A3", "weight": 5, "raw_score": null, "total_score": null },
        { "name": "A4", "weight": 5, "raw_score": null, "total_score": null }
      ],
      "is_bonus": false
    },
    {
      "name": "Quizzes",
      "weight": 15,
      "raw_score": null,
      "total_score": null,
      "rule_type": "best_of",
      "rule_config": {
        "best_count": 3
      },
      "children": [
        { "name": "Q1", "weight": 5, "raw_score": 70, "total_score": 100 },
        { "name": "Q2", "weight": 5, "raw_score": 82, "total_score": 100 },
        { "name": "Q3", "weight": 5, "raw_score": null, "total_score": null },
        { "name": "Q4", "weight": 5, "raw_score": null, "total_score": null },
        { "name": "Q5", "weight": 5, "raw_score": null, "total_score": null }
      ],
      "is_bonus": false
    },
    {
      "name": "Midterm",
      "weight": 25,
      "raw_score": 72,
      "total_score": 100,
      "children": null,
      "rule_type": null,
      "rule_config": null,
      "is_bonus": false
    },
    {
      "name": "Final Exam",
      "weight": 38,
      "raw_score": null,
      "total_score": null,
      "children": null,
      "rule_type": null,
      "rule_config": null,
      "is_bonus": false
    },
    {
      "name": "Participation Bonus",
      "weight": 2,
      "raw_score": 90,
      "total_score": 100,
      "children": null,
      "rule_type": null,
      "rule_config": null,
      "is_bonus": true
    }
  ]
}
```

## 16. Glossary

### Assessment

A top-level grading item in a course with its own weight and optional score state (`raw_score`, `total_score`).
It may be a leaf item or a parent container with children.

### Child Assessment

A nested grading item under a parent assessment.
Its score contributes through the parent assessment’s aggregation logic.

### Contribution

The weighted grade points produced by an assessment (or selected child set), computed as:

- `(percent * weight) / 100`

and summed into course totals.

### Core Total

Sum of contributions from all assessments where `is_bonus == false`.
Represents the primary course-grade total before bonus marks.

### Bonus Total

Sum of contributions from all assessments where `is_bonus == true`.
Added on top of core total in final grade reporting.

### What-If Scenario

A read-only projection that applies hypothetical percentages to selected remaining assessments and returns projected outcomes.
It does not persist changes to stored course grade data.

### Course Aggregate

The full in-memory course domain object (`CourseCreate`) containing top-level assessments, nested child assessments, score state, and rule metadata.
Service operations typically load, validate, and update this aggregate as one unit.

### Rule Configuration

The structured parameter object stored in `rule_config`, interpreted according to `rule_type`.
Examples include:

- `best_count` for `best_of`
- `drop_count` for `drop_lowest`
