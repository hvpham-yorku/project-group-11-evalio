# EECS 2311 – Group 11 – Evalio

# Iteration 1 Log (ITR1)

This document records the planning, development process, task assignments, time tracking, and design decisions for Iteration 1 of the Evalio project.

## 1. Meeting Minutes

### Internal Team Meeting #1 – Project Ideation

Date: January 14, 2026  
Participants: All team members

Discussion:

- Brainstormed potential project ideas.
- Shortlisted two options.
- Decided to consult the professor before finalizing.

Outcome:

- Agreement to refine ideas.
- Initial responsibilities distributed.

### Internal Team Meeting #2 – Project Finalization

Date: January 19, 2026  
Participants: All team members

Discussion:

- Finalized project idea: Evalio.
- Identified high-level features.
- Prepared for customer meeting.

Outcome:

- Project scope confirmed.
- ITR0 planning responsibilities assigned.

### Customer Meeting – Evalio

Date: February 5, 2026  
Participants: Shivam, Rima, Shadi, Himanshi  
Customer: Dinesh

Discussion:

- Presented project vision and big user stories.
- Discussed feasibility and feature priorities.
- Collected feedback for iteration planning.

Outcome:

- Vision validated.
- Feature priorities confirmed.
- Summary video recorded.

### ITR1 Sprint Planning Meeting

Date: February 9, 2026  
Participants: All team members

Discussion:

- Finalized ITR1 scope.
- Assigned user stories.
- Set internal deadlines.
- Created and organized Jira board (by Shivam).

Outcome:

- Sprint backlog defined.
- Development phase started.

## 2. Plan Review (ITR0 → ITR1)

At the beginning of Iteration 1, the team reviewed the planning document produced in Iteration 0, including the vision statement, big user stories, and detailed user stories for ITR1.

After evaluation, the team determined that no major changes to scope, priorities, or user stories were required.

The ITR1 user stories were feasible within the iteration timeline and remained aligned with the customer’s validated priorities.

No stories were added, removed, or significantly modified between ITR0 and ITR1.

The team proceeded with implementation according to the original plan.

## 3. Task Assignment & Work Breakdown (ITR1)

During Iteration 1, each user story was assigned to one primary owner.
Development tasks were further broken down and assigned to team members.
Time estimates and actual effort were tracked for accountability.

### User Story: ITR1-1 — Manual Course Setup (Assessments + Weights)

[SCRUM-17](https://rimaaa.atlassian.net/browse/SCRUM-17)

**Story Owner:** Himanshi
**Planned Effort:** 8 hours  
**Actual Effort:** 6 hours

#### Story Description

As a student,I want to manually create a course and define its assessments with weights,
so that I can set up my grading structure at the beginning of the term.

#### Scope (ITR1)

- User can create a course
- User can add multiple assessments
- Each assessment includes:
  - Name
  - Weight (percentage)
- Validation rules:
  - Assessment names cannot be empty
  - Weights must be non-negative
  - Total assessment weight cannot exceed 100%
- Uses stub / in-memory data only

#### Out of Scope (Future Iterations)

- Persistent database storage
- Editing assessments after creation (handled in later story)
- Advanced grading rules
- Authentication and multi-user separation

#### Development Tasks & Assignments

1. Backend: Course & Assessment domain models

- Assignee: Himanshi

2. Backend: API endpoints for course setup

- Assignee: Himanshi

3. Frontend: Course setup UI (manual input)

- Assignee: Rima

4. Frontend: UX/UI Designs in Figma

- Assignee: Shadi

5. Tests: Unit tests for course setup logic

- Assignee: Bardiya

6. Docs: Update log.md for course setup

- Assignee: Himanshi

7.  Database: Stub data layer & schema design for course setup

- Assignee: Himanshi

#### Notes / Reflection

- Validation logic ensured grading structure integrity from initial setup.
- Stub database approach allowed rapid backend development.
- Backend and frontend integration required alignment on validation error formats.
- No major blockers were encountered during development.

### ITR1-2 — Edit & Validate Grading Structure  
([SCRUM-39](https://rimaaa.atlassian.net/browse/SCRUM-39))


**Story Owner:** Kartik  
**Planned Effort:** 6 hours  
**Actual Effort:** 5 hours

#### Story Description

As a student, I want to edit, delete, and reorder assessments with weight validation feedback,  
so that I can correct mistakes and keep my grading structure consistent.

#### Scope (ITR1)

- User can edit assessment name and weight after creation
- User can delete existing assessments
- UI reflects total weight changes in real-time
- System provides a visual warning if total weight ≠ 100%
- Validation prevents invalid inputs (negative weights, empty names)
- Uses stub / in-memory data only

#### Out of Scope (Future Iterations)

- Drag-and-drop reordering of assessments
- Undo/redo functionality
- Batch editing of multiple assessments
- Assessment templates or presets

#### Development Tasks & Assignments

1. Backend: API endpoint for editing assessment weights (SCRUM-66)

   - Assignee: Shivam

2. Backend: API endpoint for what-if scenario analysis (SCRUM-67)

   - Assignee: Shivam

3. Frontend: Edit/delete UI for assessments

   - Assignee: Rima

4. Frontend: Real-time weight validation display

   - Assignee: Shadi

5. Tests: Unit tests for edit/delete logic

   - Assignee: Bardiya
  
7.  Database: Ensure schema supports weight updates

   - Assignee: Himanshi

6. Docs: Update log.md for edit & validate grading structure

   - Assignee: Kartik

#### Notes / Reflection

- Implemented real-time validation feedback to show users when total weight deviates from 100%.
- Added clear error messages for invalid inputs (negative weights, empty assessment names).
- Backend API supports partial updates, allowing users to modify individual assessments without affecting others.
- Frontend integrated with backend to persist changes immediately upon blur/save.
- No major blockers were encountered during development.

### ITR1-3 — Grade Entry & Current Standing  
([SCRUM-46](https://rimaaa.atlassian.net/browse/SCRUM-46))

**Story Owner:** Shadi  
**Planned Effort:** 7 hours  
**Actual Effort:** 5 hours

#### Story Description

As a student, I want to enter the grades I have received so far,  
so that I can see my current standing in the course.

#### Scope (ITR1)

- User can enter grades for completed assessments only
- Grades must be numeric values between 0 and 100
- Current standing is calculated as a weighted average
- Missing grades are ignored in the calculation
- Uses stub / in-memory data only

#### Out of Scope (Future Iterations)

- Automatic grade import
- Grade history or trends
- Visual analytics or charts

#### Development Tasks & Assignments

1. Frontend: Grade entry UI for completed assessments and UX/UI Design

   - Assignee: Shadi

2. Backend: Calculate current weighted standing

   - Assignee: Shivam

3. Backend: API endpoint for grade submission and standing

   - Assignee: Shivam

4. Tests: Unit tests for the current standing calculation

   - Assignee: Bardiya

5. Database: Ensure schema supports grade storage (stub)

   - Assignee: Himanshi

6. Docs: Update log.md for grade entry & standing
   - Assignee: Shadi

#### Notes / Reflection

- Built a grade entry UI that updates the current standing in real-time as scores are entered.
- Added validation to ensure scores are complete and logically valid before saving.
- Made sure missing grades are ignored in the weighted average calculation.
- Integrated frontend with backend API for grade submission and reset functionality.
- No major blockers were encountered during development.

### ITR1-4 — Target Grade Feasibility  
([SCRUM-53](https://rimaaa.atlassian.net/browse/SCRUM-53))

**Story Owner:** Shivam  
**Planned Effort:** 7 hours  
**Actual Effort:** 4 hours

#### Story Description

As a student, I want to enter a target final grade so that I can know whether it is achievable based on my current progress.

#### Scope (ITR1)

- User enters a target final grade (0–100)
- System determines whether the target is achievable
- Calculation is based on:
  - Current grades
  - Remaining assessments
  - Maximum possible scores
- Result returned as simple Yes/No with explanation
- Uses stub / in-memory data only

#### Out of Scope (Future Iterations)

- Suggested strategies to reach the target
- Visual projections or charts
- Saving target history

---

#### Development Tasks & Assignments

1. Backend: Implement target grade feasibility calculation logic

   - Assignee: Shivam

2. Backend: Create API endpoint for target grade feasibility

   - Assignee: Shivam

3. Frontend: Target grade input and result display and UX/UI Design

   - Assignee: Shadi

4. Tests: Unit tests for target feasibility logic

   - Assignee: Bardiya

5. Documentation: Update log.md and related notes
   - Assignee: Shivam

---

#### Notes / Reflection

- Core feasibility logic required careful handling of remaining weight calculations.
- Stub database was reused from previous user story.
- No major blockers encountered.

### ITR1-5 — Minimum Required Score Calculation  
([SCRUM-59](https://rimaaa.atlassian.net/browse/SCRUM-59))

**Story Owner:** Rima  
**Planned Effort:** 8 hours  
**Actual Effort:** 6 hours

#### Story Description

As a student, I want to know the minimum score I need on a remaining assessment to achieve a target final grade, so that I can plan my effort realistically.

#### Scope (ITR1)

- User provides a target final grade (0–100)
- System calculates the minimum required score on ONE remaining assessment
- Calculation assumes all other remaining assessments receive maximum possible scores (100%).
- Assumes all other remaining assessments receive maximum possible scores
- If the required score is above 100, the target is marked as not achievable
- Uses stub / in-memory data only

#### Out of Scope (Future Iterations)

- Multiple remaining assessments at once
- Strategy recommendations
- Saving or comparing targets

##### Development Tasks & Assignments

1. Backend: Calculate minimum required score for target grade (SCRUM-60)

   - Assignee: Kartik

2. Backend: API endpoint for minimum required score (SCRUM-61)

   - Assignee: Kartik

3. Frontend: Minimum required score display (SCRUM-62)

   - Assignee: Rima

4. Tests: Unit tests for minimum required logic (SCRUM-63)

   - Assignee: Bardiya

5. Docs: Update log.md for minimum required score logic (SCRUM-64)
   - Assignee: Rima

#### Notes / Reflection

- **Design Decision:** Implemented an "Optimistic Projection" model. This assumes the user will achieve 100% on all other future assessments to calculate the absolute minimum effort required for the selected task.
- **Frontend Integration:** Linked the calculation to the Dashboard Assessment Breakdown, ensuring that if a target is mathematically impossible (>100% required), the UI clearly flags the goal as "Not Achievable."
- **Edge Cases:** Handled scenarios where a user has already achieved their target grade before all assessments are completed.

### ITR1-6 — What-If Scenario Analysis (Stretch)  
([SCRUM-65](https://rimaaa.atlassian.net/browse/SCRUM-65))

**Story Owner:** Bardiya  
**Planned Effort:** 6 hours  
**Actual Effort:** 8 hours

#### Story Description

As a student, I want to temporarily try a hypothetical score on a remaining assessment,  
so that I can see how it would affect my final grade.

#### Scope (ITR1 – Stretch)

- User inputs **ONE** hypothetical score for **ONE** remaining assessment
- System calculates projected grade impact using existing weighted-grade logic
- Hypothetical data is **NOT saved or persisted** (read-only analysis)
- Uses stub / in-memory data only

#### Out of Scope (Future Iterations)

- Multiple what-if scenarios
- Saving/comparing scenarios
- Charts/projections
- Natural language / AI inputs

#### Development Tasks & Assignments

1. Backend: Add what-if scenario calculation function (read-only; no persistence)

   - Assignee: Kartik

2. Backend: Add API endpoint for what-if scenario analysis (`/courses/{course_index}/whatif`)

   - Assignee: Kartik

3. Tests: Unit tests for what-if scenario logic

   - Assignee: Bardiya

4. Docs: Update log.md to mark this story as a stretch feature and document the no-persistence decision
   - Assignee: Bardiya

5. Frontend: What-if input (slider or number) and result display (Explore Scenarios page), and UX/UI Design
   - Assignee: Shadi

#### Notes / Reflection

- **Design decision (scope control):** hypothetical values are intentionally **not persisted** in ITR1.
- Implemented as read-only scenario analysis using existing standing/weight calculations.
- Main work on this story was split: **backend implementation by Kartik**, and **tests + documentation by Bardiya**.

## 4. Major Design Decisions

During Iteration 1, the team made the following architectural and design decisions:

### 1. Three-Layer Architecture

The system was structured using a three-layer architecture:

- UI Layer (Frontend)
- Business Logic Layer
- Data Layer (Stub Database)

This separation ensures clear responsibilities and prevents business logic from being placed inside the UI.

### 2. Stub Database with Interface

A database interface was created along with a stub (in-memory) implementation.
This allows the system to switch to a real persistent database in future iterations with minimal changes.

### 3. Separation of Concerns

- Business logic (grade calculations, feasibility logic) was implemented strictly in the service layer.
- UI layer is responsible only for user input and displaying results.
- Data layer handles storage via stub implementation.

### 4. Unit Testing Strategy

Unit tests were written for domain and business logic classes.
Database-dependent logic was tested using the stub implementation.

### 5. Controlled Scope for Iteration 1

Advanced grading rules and persistent database were intentionally deferred to later iterations to maintain focus on core functionality.

### 6. Grading Validation Rules (SCRUM-45)

The following validation rules were implemented for grading structure integrity:

**Assessment Weight Validation:**

- Weights must be non-negative (≥ 0)
- Total weight must equal exactly 100%
- Each assessment must have a unique name

**Grade Entry Validation:**

- Grades must be numeric values
- Raw score must be ≥ 0
- Total score must be > 0
- Raw score cannot exceed total score
- Both raw_score and total_score must be provided together, or both null

**What-If Scenario Validation (SCRUM-66/67):**

- Hypothetical scores must be between 0-100%
- Assessment must exist and be ungraded
- Read-only operation - does not persist data

**Minimum Required Score Validation (SCRUM-60/61):**

- Target must be between 0-100%
- Assessment must exist and be ungraded
- Returns `is_achievable: false` if required score exceeds 100%

## 5. Concerns / Issues

- No major group conflicts occurred during Iteration 1.
- Initial time estimates for some stories were higher than actual effort required.
- Minor integration adjustments were needed between backend and frontend components.
- No critical blockers affected completion of ITR1 stories.

## 6. Iteration Summary

Total number of user stories implemented: 6

All planned ITR1 user stories were completed within the iteration timeline.

Overall planned effort aligned closely with actual effort, with some stories completed faster than estimated.

The team successfully delivered:

- Domain models
- Stub database implementation
- Basic GUI for ITR1 stories
- Unit tests for business logic
- Structured Jira tracking

Iteration 1 goals were met successfully, and the system remains stable with no major defects.
