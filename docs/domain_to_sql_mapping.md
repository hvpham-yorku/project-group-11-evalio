# Domain Model to SQL Mapping

This document maps the current backend domain model to the current SQL schema in
`database/schema/evalio_schema.sql`.

It is intended as a final-state truth document for the repo, not an earlier-gap
audit. Where the SQL schema and runtime models intentionally differ, that
difference is called out explicitly.

## Inputs Analyzed

- `backend/app/models.py`
- `backend/app/models_deadline.py`
- `backend/app/models_extraction.py`
- `backend/app/db.py`
- `backend/app/repositories/postgres_*.py`
- `docs/domain_model_spec.md`
- `database/schema/evalio_schema.sql`

## Current SQL Tables

- `users`
- `calendar_connections`
- `courses`
- `deadlines`
- `deadline_exports`
- `assessment_categories`
- `assessments`
- `rules`
- `grade_targets`
- `scenarios`
- `scenario_scores`

Important truth note:

- The final SQL schema does **not** use a standalone `scores` table.
- Current runtime score state is stored directly on `assessments` through
  `raw_score` and `total_score`.

## High-Level Domain Relationship View

```text
User
 ├── Course
 │    ├── Assessment
 │    │    └── Child Assessment
 │    ├── Deadline
 │    ├── Scenario
 │    │    └── Scenario Score
 │    └── Grade Target
 └── Calendar Connection
      └── Deadline Export
```

## Entity Mapping

### User

#### Domain

- Authenticated application user

#### Runtime models / usage

- Auth payloads and service-layer identity lookup
- persisted through repository layer and `UserDB`

#### SQL table

- `users`

#### SQL columns

- `id`
- `email`
- `password_hash`
- `created_at`

#### Notes

- This mapping is direct and complete.

### Course

#### Domain

- Root academic-planning aggregate for one course workspace

#### Runtime models / usage

- `CourseCreate`
- repository persisted course records
- course-scoped APIs and orchestration services

#### SQL table

- `courses`

#### SQL columns used

- `id`
- `user_id`
- `name`
- `term`
- `bonus_policy`
- `bonus_cap_percentage`
- `credits`
- `final_percentage`
- `grade_type`
- `created_at`

#### Relationship mapping

- `courses.user_id -> users.id`
- `courses.id -> assessments.course_id`
- `courses.id -> deadlines.course_id`
- `courses.id -> scenarios.course_id`
- `courses.id -> grade_targets.course_id`
- `courses.id -> assessment_categories.course_id`

#### Notes

- The SQL schema stores more durable course metadata than the lightweight
  `CourseCreate` request model alone.
- Credits and final-percentage fields exist in SQL and backend persistence, but
  the standard setup UI still does not collect transcript-style credits during
  the normal setup flow.

### Assessment

#### Domain

- Top-level assessment or parent assessment inside a course

#### Runtime models / usage

- `Assessment`
- child-aware grading logic in `grading_service.py`

#### SQL table

- `assessments`

#### SQL columns used

- `id`
- `course_id`
- `parent_assessment_id`
- `category_id`
- `name`
- `weight`
- `raw_score`
- `total_score`
- `is_bonus`
- `position`
- `created_at`

#### Relationship mapping

- `assessments.course_id -> courses.id`
- `assessments.parent_assessment_id -> assessments.id`
- `assessments.category_id -> assessment_categories.id`
- `rules.assessment_id -> assessments.id`
- `scenario_scores.assessment_id -> assessments.id`
- `deadlines.assessment_id -> assessments.id`

#### Notes

- The final schema now supports nested assessment structure directly through
  `parent_assessment_id`.
- Score state is stored directly on assessments, which aligns with the runtime
  grading model.
- `position` provides deterministic ordering when reconstructing course trees.

### Child Assessment

#### Domain

- Nested assessment under a parent `Assessment`

#### Runtime models / usage

- `ChildAssessment`

#### SQL representation

- Reuses the `assessments` table

#### SQL columns used

- Same persisted shape as `Assessment`, with child linkage represented by
  `parent_assessment_id`

#### Notes

- Child assessments are no longer a schema gap.
- Parent-child hierarchy is representable and reconstructable from SQL.

### Rule

#### Domain

- Embedded rule metadata attached to one assessment

#### Runtime models / usage

- `rule_type`
- `rule_config`

#### SQL table

- `rules`

#### SQL columns used

- `id`
- `assessment_id`
- `rule_type`
- `rule_config`
- `created_at`

#### Notes

- Runtime semantics expect at most one rule per assessment.
- SQL matches that expectation through `UNIQUE (assessment_id)`.
- Supported persisted rule types are aligned with the final backend values:
  - `pure_multiplicative`
  - `best_of`
  - `drop_lowest`
  - `mandatory_pass`

### Deadline

#### Domain

- Course-associated due date record used by planning and export workflows

#### Runtime models / usage

- `Deadline`
- `DeadlineCreate`
- `DeadlineUpdate`

#### SQL table

- `deadlines`

#### SQL columns used

- `id`
- `course_id`
- `assessment_id`
- `title`
- `deadline_type`
- `due_date`
- `due_time`
- `source`
- `notes`
- `assessment_name`
- `exported_to_gcal`
- `gcal_event_id`
- `created_at`

#### Relationship mapping

- `deadlines.course_id -> courses.id`
- `deadlines.assessment_id -> assessments.id`

#### Notes

- This is fully represented in the final SQL schema.
- The runtime DB layer also contains compatibility helpers for older local DBs
  that may still use legacy deadline columns.

### Deadline Export

#### Domain

- Tracks external calendar export of a saved deadline

#### Runtime models / usage

- export tracking via repository and SQLAlchemy models

#### SQL table

- `deadline_exports`

#### SQL columns used

- `id`
- `deadline_id`
- `connection_id`
- `provider`
- `external_event_id`
- `exported_at`

#### Relationship mapping

- `deadline_exports.deadline_id -> deadlines.id`
- `deadline_exports.connection_id -> calendar_connections.id`

#### Notes

- This table supports duplicate-export prevention and external-event linkage.

### Calendar Connection

#### Domain

- External OAuth-backed calendar connection owned by a user

#### Runtime models / usage

- `CalendarConnectionDB`
- calendar repository implementations

#### SQL table

- `calendar_connections`

#### SQL columns used

- `id`
- `user_id`
- `provider`
- `calendar_id`
- `access_token`
- `refresh_token`
- `token_expiry`
- `is_connected`
- `created_at`
- `updated_at`

#### Relationship mapping

- `calendar_connections.user_id -> users.id`

#### Notes

- Final schema and runtime both support persisted Google Calendar connection
  state.

### Grade Target

#### Domain

- Saved target percentage for one course

#### Runtime models / usage

- persisted target record consumed by course and planning services

#### SQL table

- `grade_targets`

#### SQL columns used

- `id`
- `course_id`
- `target_percentage`
- `created_at`

#### Relationship mapping

- `grade_targets.course_id -> courses.id`

#### Notes

- One-to-one course target persistence is enforced by `UNIQUE (course_id)`.

### Scenario

#### Domain

- Persisted named scenario definition for a course

#### Runtime models / usage

- `StoredScenario`
- `routes/scenarios.py`
- `services/scenario_service.py`
- postgres and in-memory scenario repositories

#### SQL table

- `scenarios`

#### SQL columns used

- `id`
- `course_id`
- `name`
- `created_at`

#### Relationship mapping

- `scenarios.course_id -> courses.id`
- `scenario_scores.scenario_id -> scenarios.id`

#### Notes

- Saved scenarios are part of the implemented final system.
- Running a scenario remains simulation-only; it does not mutate stored grades.

### Scenario Score

#### Domain

- Per-assessment override value stored under a saved scenario

#### Runtime models / usage

- `StoredScenarioEntry`
- persisted scenario entries in repository layer

#### SQL table

- `scenario_scores`

#### SQL columns used

- `id`
- `scenario_id`
- `assessment_id`
- `simulated_score`

#### Relationship mapping

- `scenario_scores.scenario_id -> scenarios.id`
- `scenario_scores.assessment_id -> assessments.id`

#### Notes

- SQL stores scenario entries by assessment ID.
- Some API flows still accept assessment names, so repository/service mapping is
  responsible for resolving names to stored assessment identifiers.

### Assessment Category

#### Domain

- Optional grouping/category metadata attached to assessments

#### Runtime models / usage

- `AssessmentCategoryDB`
- course persistence layer

#### SQL table

- `assessment_categories`

#### SQL columns used

- `id`
- `course_id`
- `name`
- `weight`

#### Relationship mapping

- `assessment_categories.course_id -> courses.id`
- `assessments.category_id -> assessment_categories.id`

#### Notes

- This exists in the final schema and SQLAlchemy layer even though the primary
  frontend planning flow is still centered on assessment trees rather than rich
  category management.

### Extraction Models

#### Domain

- Outline extraction request/response and diagnostics models

#### Runtime models / usage

- `OutlineExtractionRequest`
- `ExtractionAssessment`
- `ExtractionDeadline`
- `ExtractionDiagnostics`
- `ExtractionResponse`

#### SQL representation

- No direct SQL tables

#### Notes

- Extraction output is operational workflow data, not directly persisted as raw
  extraction runs in the current final schema.
- Extracted structures are transformed into course/assessment/deadline records
  through application services instead.

## Final Alignment Summary

The most important final-state alignments are:

- nested assessments are supported in SQL through `parent_assessment_id`
- score state is stored directly on `assessments` via `raw_score` and
  `total_score`
- deadlines are fully represented in SQL
- saved scenarios and scenario scores are fully represented in SQL
- rule persistence is aligned with the runtime one-rule-per-assessment model
- calendar connections and deadline exports are represented in SQL

## Remaining Intentional Differences

- Extraction diagnostics are runtime workflow objects, not SQL-persisted audit
  records.
- Some user-facing APIs still address assessments by name, while SQL persistence
  uses stable UUID identifiers internally.
- The setup UI does not yet make full use of all persisted course metadata
  fields such as transcript-style credits in the normal course flow.

## Practical Review Guidance

When there is any conflict between older submission artifacts and the runtime
implementation, treat the following as authoritative in this order:

1. `backend/app/db.py`
2. `backend/app/repositories/postgres_*.py`
3. `database/schema/evalio_schema.sql`
4. `docs/domain_model_spec.md`

This document is meant to match that final implemented state.
