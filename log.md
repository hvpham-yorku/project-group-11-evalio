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

(https://rimaaa.atlassian.net/browse/SCRUM-39)

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

6. Database: Ensure schema supports weight updates

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

---

# Iteration 2 Log (ITR2)

This section records the planning, development process, task assignments, time tracking, and design decisions for Iteration 2 of the Evalio project.

## 1. Meeting Minutes (ITR2)

### Internal Team Meeting #1 – ITR2 Planning Discussion

**Date:** February 16, 2026  
**Participants:** All team members

**Discussion:**

* Reviewed the goals and expectations for Iteration 2.
* Discussed the main features to be implemented during ITR2.
* Finalized the ITR2 user stories based on project priorities and feasibility.
* Aligned team members on implementation ownership for the selected stories.

**Outcome:**

* ITR2 user stories were finalized.
* Initial task ownership was discussed and agreed upon.
* Development direction for Iteration 2 was confirmed.

---

### Internal Team Meeting #2 – Deliverable 1 Discussion

**Date:** March 1, 2026  
**Participants:** Shivam, Shadi, Himanshi, Rima

**Discussion:**

* Discussed the requirements and preparation needed for Deliverable 1.
* Worked on the presentation content and slide organization.
* Prepared the supporting document(s) required for submission.
* Completed the peer evaluation form.

**Outcome:**

* Deliverable 1 presentation was prepared.
* Required supporting document for submission was completed.
* Peer evaluation form was finalized.

## 2. Plan Review (ITR1 → ITR2)

At the beginning of Iteration 2, the team reviewed the results and scope of Iteration 1 and confirmed that the overall project direction for Evalio remained unchanged.

The team decided to continue building on the existing foundation from ITR1 rather than changing the core vision or architecture. The main focus of ITR2 was to extend the system with additional planned functionality.

Compared to ITR1:

* The overall project direction remained the same.
* New ITR2 user stories were added based on the planned next phase of development.
* No previously planned ITR1 stories were significantly changed or redefined.
* No major priority changes were introduced during ITR2 planning.
* No major scope reductions or dropped items were identified at the planning stage.

The team proceeded with ITR2 by expanding the system with the next set of planned features while keeping the original Evalio concept and structure consistent.

## 3. Task Assignment & Work Breakdown (ITR2)

### ITR2-1 — Automatic Course Evaluation Extraction (AI-Optional & Robust Design)

([SCRUM-95](https://rimaaa.atlassian.net/browse/SCRUM-95))

**Story Owner:** Shivam Gupta  
**Planned Effort:** 5–6 days  
**Actual Effort:** 4 days

#### Story Description

As a student, I want to upload my course outline (PDF or image) and automatically extract assessment components, weight percentages, and grading rules, so that I can quickly and accurately set up my course evaluation without manually entering all grading details.

#### Scope (ITR2)

* AI is used only to assist in extracting structured grading information.
* Core evaluation logic remains independent and fully functional without AI.
* User can upload a course outline in supported file formats.
* System extracts assessment components such as:

  * Tests
  * Quizzes
  * Assignments
  * Exams
* System extracts corresponding weight percentages for each assessment.
* System detects supported grading rules such as:

  * Best X of Y
  * Drop Lowest
* Extracted information is converted into structured grading data.
* Extracted grading structure is shown in an editable preview screen.
* User can:

  * edit assessment names
  * modify weight percentages
  * adjust grading rule parameters
* System requires explicit user confirmation before saving extracted data.
* System validates extracted data before saving, including:

  * no negative weights
  * valid total weight
  * logical consistency of grading rules
* Manual setup remains available if extraction fails or AI is unavailable.
* Core grading calculations must continue working correctly without AI extraction.

#### Out of Scope (Future Iterations)

* Advanced grading rule semantics such as mandatory pass requirements and bonus-cap behavior.
* Institution-specific extraction customization beyond the currently supported grading rule patterns.
* Fully automatic correction of ambiguous or incomplete course outlines without user review.
* AI-driven academic recommendations based on extracted course data.

#### Development Subtasks & Assignments

1. Backend: Extraction pipeline & validation logic

   * Assignee: Shivam ([SCRUM-101](https://rimaaa.atlassian.net/browse/SCRUM-101))

2. Frontend: Upload interface & editable extraction preview

   * Assignee: Shadi ([SCRUM-102](https://rimaaa.atlassian.net/browse/SCRUM-102))

3. Frontend: UI/UX design in Figma

   * Assignee: Shadi ([SCRUM-127](https://rimaaa.atlassian.net/browse/SCRUM-127))

4. Frontend–Backend integration for extraction flow

   * Assignee: Shivam ([SCRUM-133](https://rimaaa.atlassian.net/browse/SCRUM-133))

5. Database: Design schema for extracted course persistence

   * Assignee: Himanshi ([SCRUM-105](https://rimaaa.atlassian.net/browse/SCRUM-105))

6. Backend–Database integration for extracted course persistence

   * Assignee: Shivam ([SCRUM-134](https://rimaaa.atlassian.net/browse/SCRUM-134))

7. Testing: Unit & integration tests for extraction flow

   * Assignee: Shivam ([SCRUM-103](https://rimaaa.atlassian.net/browse/SCRUM-103))

8. Docs: Update `log.md`

   * Assignee: Shivam ([SCRUM-104](https://rimaaa.atlassian.net/browse/SCRUM-104))

#### Notes / Reflection

* Implemented a modular backend extraction pipeline to support multiple file types and improve maintainability.
* Added PDF parsing and OCR fallback to support scanned or low-quality course outlines.
* Ensured extracted data is not persisted automatically and only saved after explicit user confirmation.
* Validation and confirmation flow improved reliability by preventing invalid extracted structures from being accepted directly.
* AI was limited to extraction support only, while all grading and evaluation logic remained deterministic and independent of AI.
* No major blockers were encountered, although extraction robustness required handling inconsistent formatting across different course outline documents.

### ITR2-2 — Persistent Multi-Course Planning System (DB + Multi-Course Support)

([SCRUM-96](https://rimaaa.atlassian.net/browse/SCRUM-95))

**Story Owner:** Himanshi Verma  
**Planned Effort:** 4–5 days  
**Actual Effort:** 5 days

#### Story Description

As a student, when I manage my courses, I want my courses, grades, and what-if scenarios to be saved permanently so that I can track and plan my academic performance across sessions without losing data between sessions.

#### Scope (ITR2)

* Course persistence:
  * Save extracted course structure, including assessments, weights, and grading rules.
  * Load saved courses automatically when the application restarts.
  * Allow students to edit and delete saved courses.
  * Ensure course data remains consistent after reload.

* Score and scenario persistence:
  * Save entered grades for assessments.
  * Allow stored scores to be updated and deleted.
  * Save and label what-if scenarios.
  * Reload saved scenarios without overwriting actual grades.
  * Recalculate grades and feasibility correctly after loading persisted data.

* Multi-course planning:
  * Allow each student to create and manage multiple courses.
  * Provide an overview page displaying:
    * Course name
    * Current grade
    * Target grade
    * Feasibility status
  * Allow switching between courses without data loss.
  * Support cascading deletion of course-related data.

* Dual database support:
  * Implement repository abstraction.
  * Support both:
    * Stub (in-memory) database
    * PostgreSQL database
  * Enable database switching through configuration.
  * Include PostgreSQL initialization scripts.
  * Provide integration tests for real database persistence behavior.

#### Out of Scope (Future Iterations)

* Cloud-hosted database deployment and scaling concerns.
* Real-time collaboration or shared course editing between multiple users.
* Cross-device sync beyond the configured persistence layer.
* Automatic migration tools for future schema evolution.

#### Development Subtasks & Assignments

1. Backend: Implement Repository Layer & Multi-Course CRUD Logic  
   * Assignee: Shivam ([SCRUM-96](https://rimaaa.atlassian.net/browse/SCRUM-96))

2. Frontend: Multi-Course Overview & Switching Interface  
   * Assignee: Rima ([SCRUM-98](https://rimaaa.atlassian.net/browse/SCRUM-98))

3. Frontend: UI/UX Design in Figma  
   * Assignee: Shadi ([SCRUM-128](https://rimaaa.atlassian.net/browse/SCRUM-128))

4. Frontend–Backend Integration for Multi-Course Planning  
   * Assignee: Shivam ([SCRUM-135](https://rimaaa.atlassian.net/browse/SCRUM-135))

5. Database: Relational Schema Design & Initialization Script  
   * Assignee: Himanshi ([SCRUM-97](https://rimaaa.atlassian.net/browse/SCRUM-97))

6. Docs: Create ER Diagram (Database Schema)  
   * Assignee: Himanshi ([SCRUM-121](https://rimaaa.atlassian.net/browse/SCRUM-121))

7. Backend–Database Integration for Persistent Multi-Course Support  
   * Assignee: Shivam ([SCRUM-136](https://rimaaa.atlassian.net/browse/SCRUM-136))

8. Testing: Unit & Integration Tests for Persistence  
   * Assignee: Bardiya ([SCRUM-99](https://rimaaa.atlassian.net/browse/SCRUM-99))

9. Docs: Update Class Diagram (Persistence Architecture)  
   * Assignee: Bardiya ([SCRUM-100](https://rimaaa.atlassian.net/browse/SCRUM-100))

10. Docs: Create Sequence Diagrams for Persistence Flows  
   * Assignee: Bardiya ([SCRUM-120](https://rimaaa.atlassian.net/browse/SCRUM-120))

11. Docs: Update `log.md` (Persistence Architecture)  
   * Assignee: Himanshi ([SCRUM-122](https://rimaaa.atlassian.net/browse/SCRUM-122))

#### Acceptance Criteria

* Students can create, edit, delete, and load multiple courses.
* Course, score, and what-if scenario data persists after restarting the application.
* Persisted scores and scenarios reload accurately without corrupting actual grade data.
* Switching between stub and PostgreSQL implementations works without errors.
* The multi-course overview page displays accurate summaries.
* Integration tests validate PostgreSQL persistence behavior.

#### Notes / Reflection

* Implemented a repository abstraction layer so that business logic remains independent of the storage implementation.
* Designed a relational schema to persist courses, assessments, scores, scenarios, and related course data in PostgreSQL.
* Added support for multiple courses per user, including overview and course-switching functionality.
* Ensured persistence logic works with both the stub database and PostgreSQL through configuration-based switching.
* Added integration coverage to verify persistence behavior, reload consistency, and database-backed CRUD flows.
* No major blockers were encountered, although coordinating persistence across multiple layers required careful backend and database alignment.

### ITR2-3 — Universal GPA Converter (4.0, 9.0, & 10.0 Scales)

([SCRUM-109](https://rimaaa.atlassian.net/browse/SCRUM-109))

**Story Owner:** Kartik Sharma  
**Planned Effort:** 3–4 days  
**Actual Effort:** 3 days

#### Story Description

As a student, I want to convert my course percentages and YorkU grade points into various standardized GPA scales (4.0, 9.0, and 10.0), so that I can assess my academic standing for graduate school applications, internships, and internal university requirements.

#### Scope (ITR2)

* Multi-scale GPA support:
  * Implement conversion logic for the OMSAS 4.0 scale.
  * Implement conversion logic for the YorkU 9.0 scale.
  * Implement conversion logic for a standard 10.0 scale used in international conversions.

* Weighted GPA calculation:
  * Calculate cumulative GPA (cGPA) by weighting course grade points using course credit values.
  * Support GPA calculations across multiple manually supplied courses.
  * Distinguish between term GPA and cumulative GPA use cases.

* Visual data representation:
  * Provide a summary view comparing student standing across all three GPA scales.
  * Show a clear conversion path such as percentage → letter grade → GPA value.

* System agnosticism:
  * Ensure the converter works for both actual grades and what-if scenarios.
  * Keep GPA conversion logic decoupled from the UI so additional scales can be added in future iterations.

#### Out of Scope (Future Iterations)

* Institution-specific custom GPA scale definitions beyond the supported 4.0, 9.0, and 10.0 systems.
* Transcript-style GPA exports or official reporting formats.
* Persisting GPA history over time.
* Automatic GPA recalculation triggers tied to all course updates across the system.

#### Development Subtasks & Assignments

1. Backend: Implement GPA Conversion Logic (4.0 / 9.0 / 10.0 scales)  
   * Assignee: Kartik ([SCRUM-109](https://rimaaa.atlassian.net/browse/SCRUM-109))

2. Frontend: GPA Summary Component & Scale Toggle  
   * Assignee: Rima ([SCRUM-111](https://rimaaa.atlassian.net/browse/SCRUM-111))

3. Frontend: UI/UX Design in Figma  
   * Assignee: Shadi ([SCRUM-129](https://rimaaa.atlassian.net/browse/SCRUM-129))

4. Tests: Unit tests for boundary cases (e.g., 79.4% vs 79.5%)  
   * Assignee: Bardiya ([SCRUM-113](https://rimaaa.atlassian.net/browse/SCRUM-113))

5. Docs: Update API documentation for GPA endpoints  
   * Assignee: Kartik ([SCRUM-114](https://rimaaa.atlassian.net/browse/SCRUM-114))

6. Database: Support GPA Conversion Data  
   * Assignee: Himanshi ([SCRUM-119](https://rimaaa.atlassian.net/browse/SCRUM-119))

#### Acceptance Criteria

* The system accurately converts a percentage to the correct grade point on the 4.0, 9.0, and 10.0 scales.
* Users can include course credit weights so cumulative GPA calculations are weighted correctly.
* The dashboard displays a side-by-side comparison of all three scales.
* GPA calculations update correctly for what-if scenarios.
* The system handles non-numeric grades such as Pass/Fail or Withdrawn without breaking the calculation engine.

#### Notes / Reflection

* Designed the GPA conversion engine as a stateless backend module so that conversion logic remains reusable and independent of the frontend.
* Implemented support for three recognized GPA systems to make the feature useful for both York University requirements and external application contexts.
* Added weighted GPA support so cumulative calculations reflect course credit differences correctly.
* Ensured the same conversion logic can be reused for both actual grades and hypothetical what-if projections.
* Boundary-value testing was important for preventing ambiguity around grade cutoffs such as 79.4% versus 79.5%.
* No major blockers were encountered during implementation.

### ITR2-4 — Course Evaluation & Rule Modeling

([SCRUM-106](https://rimaaa.atlassian.net/browse/SCRUM-106))

**Story Owner:** Bardiya Ameri  
**Planned Effort:** 1 day (6 hours)  
**Actual Effort:** 8 hours

#### Story Description

As a student, I want the system to evaluate my course performance using York University’s specific grading rules, so that I can understand my academic standing through letter grades, grade points, and realistic projections of what is required to hit my targets.

#### Scope (ITR2)

* Institutional grading logic:
  * Map calculated percentages to the YorkU 9-point scale.
  * Generate structured evaluation results including:
    * Letter grade
    * Grade point value
    * Performance descriptor

* Target feasibility analysis:
  * Calculate the exact average required on remaining coursework to achieve a user-defined target.

* Dynamic difficulty classification:
  * Categorize the target as:
    * Comfortable
    * Achievable
    * Challenging
    * Very Challenging
    * Not Possible
    * Already Achieved

* Engine integrity:
  * Ensure the evaluation engine is deterministic and read-only.
  * Prevent evaluation logic from mutating or overwriting stored course data.
  * Keep the evaluation engine fully independent of AI components.
  * Handle edge cases such as:
    * 0% remaining weight
    * target already met
    * required averages above 100%

* Stability and integration:
  * Maintain compatibility with the ITR1 in-memory stub database.
  * Ensure numerical stability and consistent rounding at boundary thresholds.

#### Out of Scope (Future Iterations)

* Support for grading systems beyond York University’s 9-point scale.
* Saving evaluation history or trend tracking over time.
* Institution-specific grading customization by the user.
* Advanced advisory recommendations beyond rule-based difficulty classification.

#### Development Subtasks & Assignments

1. Backend: Evaluation & Rule Modeling Engine  
   * Assignee: Shivam ([SCRUM-112](https://rimaaa.atlassian.net/browse/SCRUM-112))

2. Frontend: Evaluation Results Display  
   * Assignee: Shadi ([SCRUM-115](https://rimaaa.atlassian.net/browse/SCRUM-115))

3. Frontend: UI/UX Design in Figma  
   * Assignee: Shadi ([SCRUM-130](https://rimaaa.atlassian.net/browse/SCRUM-130))

4. Frontend–Backend Integration for Course Evaluation & Rule Modeling  
   * Assignee: Shivam ([SCRUM-137](https://rimaaa.atlassian.net/browse/SCRUM-137))

5. Database: Support Evaluation Data (Stub Compatible)  
   * Assignee: Himanshi ([SCRUM-116](https://rimaaa.atlassian.net/browse/SCRUM-116))

6. Backend–Database Integration for Evaluation Data Consistency  
   * Assignee: Shivam ([SCRUM-138](https://rimaaa.atlassian.net/browse/SCRUM-138))

7. Testing: Unit & Integration Tests for Evaluation Logic  
   * Assignee: Bardiya ([SCRUM-117](https://rimaaa.atlassian.net/browse/SCRUM-117))

8. Docs: Update `log.md` & Technical Notes  
   * Assignee: Bardiya ([SCRUM-118](https://rimaaa.atlassian.net/browse/SCRUM-118))

#### Acceptance Criteria

* Percentages map correctly to YorkU grade boundaries.
* The required remaining average is mathematically accurate for partially graded courses.
* Difficulty labels trigger correctly based on the calculated remaining average.
* Running an evaluation does not modify the underlying course or grade data.
* The system handles 0–100% input constraints and provides clear explanations for impossible targets.
* Calculations remain stable across repeated calls without rounding drift.

#### Notes / Reflection

* Implemented a deterministic evaluation engine to keep academic standing calculations mathematically reliable and reproducible.
* Added YorkU-specific rule modeling so users can view results in the grading format most relevant to their institution.
* Designed the feature to remain read-only, ensuring that running evaluations or projections never changes stored grade data.
* Covered important edge cases such as already-achieved targets, no remaining weight, and impossible score requirements.
* Consistent rounding and threshold handling were important to avoid incorrect results near YorkU boundary cutoffs.
* No major blockers were encountered, although ensuring stable rule behavior across repeated evaluations required careful testing.

### ITR2-5 — Interactive Strategy Dashboard (Grade Boundaries + Calculation Transparency + Learning Optimization)

([SCRUM-91](https://rimaaa.atlassian.net/browse/SCRUM-91))

**Story Owner:** Rima Ramcharan  
**Planned Effort:** 5–6 days  
**Actual Effort:** 6 days

#### Story Description

As a student, I want an interactive dashboard that models my best and worst-case grade scenarios and suggests specific study techniques, so that I can strategically prioritize my efforts and trust the accuracy of the system’s projections through transparent calculations.

#### Scope (ITR2)

* Interactive planning dashboard:
  * Create a central dashboard view showing current progress, remaining assessments, and projected outcomes.
  * Present grade-related information in a clear, student-friendly format.

* Grade boundary modeling:
  * Calculate and display worst-case scenarios, such as the minimum scores needed to pass or reach a target.
  * Calculate and display best-case scenarios, such as the maximum possible final grade based on remaining assessments.

* Calculation transparency:
  * Include a “Show Calculations” toggle or expandable section for each estimate.
  * Display the underlying weighted-average math used to generate projections.

* Smart learning strategies:
  * Suggest study strategies based on assessment importance and remaining time.
  * Include techniques such as:
    * 80/20 Rule (Pareto Principle)
    * Active Recall
    * Spaced Repetition
    * Feynman Technique

* Dynamic updating:
  * Update projections immediately when the user enters what-if scores.
  * Ensure hypothetical inputs do not overwrite actual stored grades.
  * Continue functioning even when course weights do not yet sum to 100%.

#### Out of Scope (Future Iterations)

* AI-personalized study recommendations based on learning history.
* Automatic calendar-based study scheduling.
* Advanced visual analytics such as heatmaps or long-term trend graphs.
* Saving and comparing multiple dashboard strategy snapshots.

#### Development Subtasks & Assignments

1. Backend: Implement grade boundary algorithms (Min/Max), what-if scenario support, and projection logic  
   * Assignee: Kartik ([SCRUM-90](https://rimaaa.atlassian.net/browse/SCRUM-90))

2. Frontend: Build interactive dashboard UI including what-if inputs, expandable calculations, and strategy display  
   * Assignee: Rima ([SCRUM-91](https://rimaaa.atlassian.net/browse/SCRUM-91))

3. Frontend: UI/UX Design in Figma  
   * Assignee: Shadi ([SCRUM-131](https://rimaaa.atlassian.net/browse/SCRUM-131))

4. Database: Update schema to support grade targets, weighted category structure, and related dashboard data needs  
   * Assignee: Himanshi ([SCRUM-92](https://rimaaa.atlassian.net/browse/SCRUM-92))

5. Tests: Add unit tests for weighted grade math accuracy and integration tests for dashboard projection behavior  
   * Assignee: Bardiya ([SCRUM-93](https://rimaaa.atlassian.net/browse/SCRUM-93))

6. Docs: Document grade projection algorithms, 80/20 rule logic, and update relevant notes  
   * Assignee: Rima ([SCRUM-94](https://rimaaa.atlassian.net/browse/SCRUM-94))

#### Acceptance Criteria

* The dashboard displays clear minimum and maximum grade boundaries for the final course result.
* A “Show Math” or expandable view reveals the formulas used for the displayed projections.
* The system suggests at least one specific learning technique for each major upcoming assessment or deadline.
* What-if inputs do not overwrite actual saved grades.
* Calculations remain accurate even when course weightings do not sum to 100%.

#### Notes / Reflection

* Built the dashboard as a strategy-focused planning surface rather than just a static results page.
* Combined projection logic with transparent formulas so users can verify how each estimate is calculated.
* Added support for what-if exploration without mutating real course data, which improves safety and user trust.
* Included lightweight study strategy recommendations so the feature supports decision-making as well as grade tracking.
* Special handling was required for incomplete grading structures where total course weight had not yet reached 100%.
* No major blockers were encountered, though syncing frontend dashboard behavior with backend projection logic required careful coordination.

### ITR2-6 — Smart Deadline Management (OCR + Manual Entry + Calendar Sync)

([SCRUM-82](https://rimaaa.atlassian.net/browse/SCRUM-82))

**Story Owner:** Shadi Karimpour  
**Planned Effort:** 4–5 days  
**Actual Effort:** 4 days

#### Story Description

As a student, I want my assignment and test deadlines to be automatically extracted from my course outline, but also be able to manually add or edit them, so that I have full control over my deadlines and never miss anything due to OCR errors or missing information.

#### Scope (ITR2)

* Use OCR to extract assessment names, due dates, and times (if available) from uploaded course outlines.
* Display all detected deadlines in an editable list view.
* Allow users to:

  * edit any deadline (name, date, time, type, notes)
  * delete incorrect entries
  * add new deadlines manually at any time
* If OCR detects no deadlines, show a clear empty state with an “Add Deadline” button.
* Include a review and confirm step before exporting deadlines to Google Calendar.
* Allow users to export selected or all deadlines to Google Calendar using the Google Calendar API.
* Exported events include:

  * course name + assessment title
  * due date/time
  * automatic reminder 1 week before the due date
  * minimum grade needed (if calculated) in the event description
* Show a countdown display on the dashboard for upcoming deadlines.
* Mark deadlines with a badge such as “From Outline” or “Manual” for clarity.
* Prevent duplicate exports of the same deadline.

#### Out of Scope (Future Iterations)

* Advanced recurring deadline logic for repeated academic tasks.
* Support for external calendar providers beyond Google Calendar.
* Full natural-language deadline extraction from highly ambiguous course outlines.
* Smart prioritization or scheduling recommendations based on workload and time remaining.

#### Development Tasks & Assignments

1. Backend: Deadline management, OCR parsing, and calendar integration

   * Assignee: Kartik ([SCRUM-83](https://rimaaa.atlassian.net/browse/SCRUM-83))

2. Frontend: Deadline management UI, review flow, and countdown display

   * Assignee: Shadi ([SCRUM-84](https://rimaaa.atlassian.net/browse/SCRUM-84))

3. Frontend: UI/UX design in Figma

   * Assignee: Shadi ([SCRUM-132](https://rimaaa.atlassian.net/browse/SCRUM-132))

4. Database: Deadline storage and calendar sync schema

   * Assignee: Himanshi ([SCRUM-85](https://rimaaa.atlassian.net/browse/SCRUM-85))

5. Testing: Unit & integration tests for deadline flow

   * Assignee: Bardiya ([SCRUM-86](https://rimaaa.atlassian.net/browse/SCRUM-86))

6. Docs: Update `log.md` for deadline feature architecture, API endpoints, and flow

   * Assignee: Shadi ([SCRUM-87](https://rimaaa.atlassian.net/browse/SCRUM-87))


#### Notes / Reflection

* Combined OCR-based extraction with manual deadline management to reduce user effort while still allowing full control over deadline data.
* Added editable deadline review flow so extracted results can be corrected before being used or exported.
* Integrated countdown display to improve visibility of upcoming academic tasks directly in the dashboard.
* Designed the feature so manually added deadlines and OCR-detected deadlines behave consistently across editing, display, and export flows.
* Google Calendar integration required careful handling of event export behavior and duplicate prevention logic.
* No major blockers were encountered during this story.

## 4. Major Design Decisions (ITR2)

During Iteration 2, the team made the following major architectural and design decisions:

### 1. Repository Abstraction with Runtime-Switchable Persistence

A repository abstraction layer was introduced so that business logic remains independent of the storage implementation. The system can switch between the in-memory stub database and PostgreSQL through configuration.

This decision allowed the team to support both fast development/testing and persistent runtime storage without duplicating service logic.

### 2. User-Scoped Data Isolation

Authentication and persistence were designed around user-scoped data access. Backend routes resolve the authenticated user through cookie-based JWT authentication, and repository operations for courses, deadlines, and scenarios are scoped by `user_id`.

This ensures that users can only access and modify their own data and prevents cross-user access at the backend level.

### 3. Shared Setup Flow with Central Course Context

The setup pages were designed around a shared setup layout and a centralized course context provider. This layout handles common concerns such as authentication checks, the shared header, the course selector, and step navigation.

This decision reduced duplication across pages and kept the setup flow consistent across multiple course-related screens.

### 4. Modular AI-Assisted Extraction Pipeline with Confirm-Before-Save

The automatic extraction feature was designed as a modular backend pipeline with separate stages for ingestion, normalization, validation, diagnostics, and orchestration. Extracted data is not saved automatically; users must explicitly review and confirm it before persistence.

This improved maintainability and robustness while preventing incorrect OCR or AI-generated output from being stored directly.

### 5. Hierarchical Assessment Modeling

The grading model was extended to support parent-child assessments, rule metadata, and nested score persistence. Backend grading logic was designed to operate correctly on hierarchical grading structures rather than assuming all assessments are flat.

This allowed the application to support more realistic course grading schemes and laid the foundation for future advanced rule handling.

### 6. UI-Agnostic GPA Conversion Engine

The GPA conversion module was designed as a stateless, UI-agnostic engine: the service accepts a raw percentage and returns structured grade data (letter, grade point, description) without any coupling to the frontend or persistence layer. Three internationally recognized scales (4.0 OMSAS, 9.0 York, 10.0 International) are defined as static band tables evaluated with inclusive lower-bound matching.

This decision allows the conversion logic to be reused across single-course GPA, what-if projections, and cumulative GPA calculations without duplication, and makes it straightforward to add new scales in future iterations.

## 5. Concerns / Issues (ITR2)

* No major group conflicts occurred during Iteration 2.
* Some integration work required extra coordination between backend, frontend, and database components due to the larger scope of persistence and extraction features.
* A few features were implemented in a phased manner, where backend functionality was completed before full frontend refinement.
* Minor adjustments were needed during testing to align persistence behavior, extraction flow, and multi-course interactions.
* No critical blockers prevented completion of the main ITR2 goals.

## 6. Iteration Summary (ITR2)

Total number of user stories implemented: 7

During Iteration 2, the team expanded Evalio from a stub-based single-course prototype into a more complete planning system with persistence, extraction, multi-course support, evaluation modeling, and deadline management.

The team successfully delivered:

* Persistent multi-course storage with repository abstraction and PostgreSQL support
* Automatic course outline extraction with editable confirmation flow
* Universal GPA Converter with three recognized scales (4.0 OMSAS, 9.0 York, 10.0 International), including single-course GPA, what-if GPA projections, and cumulative GPA calculation
* YorkU-based evaluation and rule modeling
* Interactive dashboard and multi-course management improvements
* Smart deadline management with OCR/manual support, ICS export, and Google Calendar integration
* User-scoped authentication and protected course access
* Expanded backend/frontend integration across newly added features
* Improved test coverage with both unit and integration testing

Overall, Iteration 2 introduced significantly more architectural complexity than Iteration 1, especially through persistence, extraction, authentication, and multi-feature integration. Despite this, the main ITR2 goals were completed and the project progressed toward a more realistic end-to-end system.

The system is now substantially more complete than in ITR1, with stronger persistence, richer workflows, and better support for real student planning across multiple sessions and multiple courses.
