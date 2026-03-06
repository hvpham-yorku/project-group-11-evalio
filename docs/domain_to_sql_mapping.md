# Domain Model -> SQL Mapping (Audit)

This document maps the current backend domain model to the SQL schema in `database/schema/evalio_schema.sql`.

## Inputs Analyzed

- `backend/app/models.py`
- `backend/app/models_deadline.py`
- `backend/app/models_extraction.py`
- `docs/domain_model_spec.md`
- `database/schema/evalio_schema.sql`

## Domain Hierarchy Diagram

```text
Course
 ├── Assessments
 │      ├── ChildAssessments
 │      ├── Rules
 │      └── Scores
 ├── Scenarios
 │      └── ScenarioScores
 └── Deadlines
```

## SQL Tables

- `users`
- `courses`
- `assessments`
- `scores`
- `rules`
- `assessment_categories`
- `grade_targets`
- `scenarios`
- `scenario_scores`

## Entity Mapping

### Course

#### 1) Domain Entity
`Course` (aggregate root, represented by `CourseCreate` + repository/API identity fields)

#### 2) Fields in Backend Model
- From `CourseCreate`: `name`, `term`, `assessments`
- From domain/runtime contract (`domain_model_spec.md`): `course_id`, `user_id`

#### 3) SQL Table Used
- `courses`

#### 4) SQL Columns Used
- `id` -> `course_id`
- `user_id` -> `user_id`
- `name` -> `name`
- `term` -> `term`

#### 5) Relationship Mapping
- `courses.user_id -> users.id`
- `courses.id -> assessments.course_id`
- `courses.id -> scenarios.course_id`
- (`deadlines` relationship expected by backend, but no SQL table exists)

#### 6) Missing Columns in SQL (if any)
- No direct `assessments` nested column (must be reconstructed via joins)

#### 7) Extra Columns in SQL Not Used by Backend
- `credits`
- `final_percentage`
- `grade_type`
- `created_at`

### Assessment

#### 1) Domain Entity
`Assessment` (`models.py`)

#### 2) Fields in Backend Model
- `name`
- `weight`
- `raw_score`
- `total_score`
- `children`
- `rule_type`
- `rule_config`
- `is_bonus`

#### 3) SQL Table Used
- Primary: `assessments`
- Related: `rules`, `scores`

#### 4) SQL Columns Used
- `assessments.name` -> `name`
- `assessments.weight` -> `weight`
- `assessments.course_id` -> parent course linkage
- `rules.rule_type` -> `rule_type` (semantic mismatch in casing/value style)
- `rules.rule_config` -> `rule_config`
- `scores.score` -> partial score representation only

#### 5) Relationship Mapping
- `assessments.course_id -> courses.id`
- `rules.assessment_id -> assessments.id`
- `scores.assessment_id -> assessments.id`

#### 6) Missing Columns in SQL (if any)
- `raw_score` (exact field missing)
- `total_score` (exact field missing)
- `is_bonus`
- `parent_assessment_id` (required to represent nested structure)

`parent_assessment_id` is required to reconstruct backend hierarchy semantics:

```text
Assessment
   -> children: List[ChildAssessment]
```

Without this column, assessments remain flat and child nodes cannot be deterministically attached to parent assessments.

#### 7) Extra Columns in SQL Not Used by Backend
- `assessments.id` (useful for persistence, not present in Pydantic model)
- `assessments.category_id` (not used by backend grading domain)
- `rules.created_at`
- `scores.created_at`

### ChildAssessment

#### 1) Domain Entity
`ChildAssessment` (`models.py`)

#### 2) Fields in Backend Model
- `name`
- `weight`
- `raw_score`
- `total_score`

#### 3) SQL Table Used
- Intended reuse of `assessments` (same shape as assessment row), but schema lacks explicit hierarchy key

#### 4) SQL Columns Used
- Potentially `assessments.name`, `assessments.weight`
- Potentially `scores.score` for derived percentage

#### 5) Relationship Mapping
- Backend needs: `Course -> Assessment(parent) -> ChildAssessment`
- SQL currently supports only: `Course -> assessments (flat)`

#### 6) Missing Columns in SQL (if any)
- `parent_assessment_id` (or equivalent) to represent child linkage
- `raw_score`
- `total_score`

#### 7) Extra Columns in SQL Not Used by Backend
- `assessments.category_id` (not a child-link field)

### Score

#### 1) Domain Entity
`Score` is embedded in `Assessment`/`ChildAssessment` as `raw_score` + `total_score` (no standalone Pydantic entity)

#### 2) Fields in Backend Model
- `raw_score`
- `total_score`

#### 3) SQL Table Used
- `scores`

#### 4) SQL Columns Used
- `scores.score`

#### 5) Relationship Mapping
- `scores.assessment_id -> assessments.id` (1:1 via `UNIQUE`)

#### 6) Missing Columns in SQL (if any)
- `raw_score`
- `total_score`

Backend grading requires the ratio model (`raw_score / total_score`). A single `score` column cannot represent denominator-aware grading behavior, validation (`raw_score <= total_score`), or exact reconstruction of in-progress grading state.

#### 7) Extra Columns in SQL Not Used by Backend
- `scores.id`
- `scores.created_at`

### Rule

#### 1) Domain Entity
Embedded rule fields on `Assessment`

#### 2) Fields in Backend Model
- `rule_type`
- `rule_config`

#### 3) SQL Table Used
- `rules`

#### 4) SQL Columns Used
- `rules.rule_type`
- `rules.rule_config`
- `rules.assessment_id`

#### 5) Relationship Mapping
- `rules.assessment_id -> assessments.id`

#### 6) Missing Columns in SQL (if any)
- No mandatory missing column for storage of current fields
- Structural mismatch: backend expects at most one optional rule per assessment, SQL allows multiple rows per assessment

#### 7) Extra Columns in SQL Not Used by Backend
- `rules.id`
- `rules.created_at`

### Scenario

#### 1) Domain Entity
Scenario is conceptual/ephemeral in backend services (no persisted Pydantic scenario model)

#### 2) Fields in Backend Model
- Inputs handled in service methods (e.g., assessment target + hypothetical score)
- No first-class stored model in `models.py`

#### 3) SQL Table Used
- `scenarios`

#### 4) SQL Columns Used
- `scenarios.id`
- `scenarios.course_id`
- `scenarios.name`
- `scenarios.created_at`

#### 5) Relationship Mapping
- `scenarios.course_id -> courses.id`
- `scenarios.id -> scenario_scores.scenario_id`

#### 6) Missing Columns in SQL (if any)
- None required for minimal scenario header persistence

Scenarios are currently computed in backend services but will require persistence for User Story 2.

#### 7) Extra Columns in SQL Not Used by Backend
- Entire table is currently unused by active backend scenario logic (what-if is computed, not persisted)

### ScenarioScore

#### 1) Domain Entity
No explicit backend model; scenario values are currently transient in what-if calculations

#### 2) Fields in Backend Model
- Conceptual fields only (assessment reference + hypothetical score)

#### 3) SQL Table Used
- `scenario_scores`

#### 4) SQL Columns Used
- `scenario_id`
- `assessment_id`
- `simulated_score`

#### 5) Relationship Mapping
- `scenario_scores.scenario_id -> scenarios.id`
- `scenario_scores.assessment_id -> assessments.id`

#### 6) Missing Columns in SQL (if any)
- If backend continues name-based assessment addressing, a mapping layer to assessment IDs is required
- If backend stores raw/total what-if inputs, extra columns would be required

#### 7) Extra Columns in SQL Not Used by Backend
- `scenario_scores.id`

### Deadline

#### 1) Domain Entity
`Deadline` (`models_deadline.py`)

#### 2) Fields in Backend Model
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

#### 3) SQL Table Used
- None in `database/schema/evalio_schema.sql`

#### 4) SQL Columns Used
- Not applicable

#### 5) Relationship Mapping
- Backend expects `Deadline.course_id -> Course.course_id`
- SQL schema has no deadline table to enforce/store this relationship

#### 6) Missing Columns in SQL (if any)
- All deadline persistence columns are missing

#### 7) Extra Columns in SQL Not Used by Backend
- Not applicable (no deadline table exists)

### Extraction Entities

#### 1) Domain Entity
Extraction models from `models_extraction.py`

#### 2) Fields in Backend Model
- `OutlineExtractionRequest`: `filename`, `content_type`
- `ExtractionAssessment`: `name`, `weight`, `is_bonus`, `children`, `rule`, `total_count`, `effective_count`, `unit_weight`, `rule_type`, `notes`
- `ExtractionDeadline`: `title`, `due_date`, `due_time`, `source`, `notes`
- `ExtractionDiagnostics`: `method`, `ocr_used`, `ocr_available`, `ocr_error`, `parse_warnings`, `confidence_score`, `confidence_level`, `deterministic_failed_validation`, `failure_reason`, `trigger_gpt`, `trigger_reasons`, `stub`
- `ExtractionResponse`: `course_code`, `assessments`, `deadlines`, `diagnostics`, `structure_valid`, `message`

#### 3) SQL Table Used
- None in `database/schema/evalio_schema.sql`

#### 4) SQL Columns Used
- Not applicable

#### 5) Relationship Mapping
- Extraction output is transformed into course/assessment/deadline domain payloads; not persisted directly in current schema

#### 6) Missing Columns in SQL (if any)
- No extraction run/audit tables exist (if persistence is desired)

#### 7) Extra Columns in SQL Not Used by Backend
- Not applicable

## Cross-Entity Mismatch Summary

### Structural mismatches
- Nested child assessments are not representable as-is (no `parent_assessment_id` or equivalent self-reference in `assessments`).
- Backend score model is two-field (`raw_score`, `total_score`), SQL score model is single-field (`score`).
- Rule cardinality mismatch: backend expects one optional rule per assessment, SQL `rules` table allows multiple rows per assessment.
- Deadlines have full backend models but no SQL table.
- Extraction entities have backend models but no SQL tables.

### Naming/value mismatches
- Backend rule values are lowercase style (`best_of`, `drop_lowest`), SQL constraint uses uppercase enum values (`BEST_OF`, `DROP_LOWEST`, `MANDATORY_PASS`, `BONUS`).
- Backend often uses name-based assessment addressing; SQL scenario tables are ID-based.

### SQL-only tables currently outside backend domain models
- `assessment_categories`
- `grade_targets`
- Some `courses` GPA-related columns (`credits`, `final_percentage`, `grade_type`)

## Required SQL Changes for Full Backend Compatibility

The following schema updates are required to fully align SQL storage with backend domain semantics.

### Assessment hierarchy and structure
- Add `assessments.parent_assessment_id` with self-reference:

```sql
ALTER TABLE assessments
ADD COLUMN parent_assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE;
```

Note: if `assessments.id` were integer in a different schema variant, use matching integer FK type.

### Scoring model support
- Add score pair columns required by backend grading logic:

```sql
ALTER TABLE assessments
ADD COLUMN raw_score NUMERIC,
ADD COLUMN total_score NUMERIC;
```

### Bonus support
- Add bonus flag:

```sql
ALTER TABLE assessments
ADD COLUMN is_bonus BOOLEAN NOT NULL DEFAULT FALSE;
```

### Assessment Ordering

Relational databases do not guarantee insertion order for query results. To reconstruct `Course -> Assessment -> ChildAssessment` deterministically, add an explicit ordering column and always query with `ORDER BY`.

```sql
ALTER TABLE assessments
ADD COLUMN position INTEGER;
```

### Rule cardinality alignment
- Enforce one rule per assessment to match backend semantics:

```sql
ALTER TABLE rules
ADD CONSTRAINT unique_rule_per_assessment UNIQUE (assessment_id);
```

### Deadlines persistence
- Add deadlines table used by backend deadline models:

```sql
CREATE TABLE deadlines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date DATE NOT NULL,
    due_time TIME,
    source VARCHAR(20) NOT NULL DEFAULT 'manual',
    notes TEXT,
    assessment_name TEXT,
    exported_to_gcal BOOLEAN NOT NULL DEFAULT FALSE,
    gcal_event_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Repository Integration Notes

Relational rows should be reconstructed into the backend aggregate shape:

```text
Course
  -> List[Assessment]
       -> children: List[ChildAssessment]
```

High-level reconstruction steps:

1. Load course.
2. Load assessments.
3. Load scores.
4. Load rules.
5. Split parent vs child assessments.
6. Attach children.
7. Hydrate `Assessment` objects.
8. Return `Course` aggregate.

Additional integration details:

- The repository should normalize rule enum values between SQL (`BEST_OF`) and backend (`best_of`).
- The repository should apply deterministic ordering using `position` and stable tiebreakers.
- The repository should preserve nullable score states so partially graded assessments round-trip without data loss.
- If the legacy SQL schema remains unchanged, reconstruction is lossy and backend behavior parity is not guaranteed.
