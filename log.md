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

SCRUM-96

**Story Owner:** Himanshi Verma
**Planned Effort:** 4–5 days
**Actual Effort:** 5 days

#### Story Description

As a student, when I manage my courses, I want my courses, grades, and what-if scenarios to be saved permanently so that I can track and plan my academic performance across sessions without losing data between sessions.

#### Scope (ITR2)

- Course persistence:
  - Courses and their structures are stored in a persistent database.
  - The system saves course data including assessments, grading rules, and weights.
  - Saved courses are automatically loaded when the application restarts.
  - Students can edit and delete previously saved courses.
  - Course data remains consistent when reloaded.
- Score and scenario persistence:
  - Entered grades for assessments are saved in the database.
  - Students can update and delete stored scores.
  - What-If scenarios can be saved and labeled.
  - Saved scenarios can be reloaded without overwriting actual grades.
  - The system recalculates grades and feasibility correctly after loading persisted data.
- Multi-course planning:
  Students can create and manage multiple courses.
  The application provides a course overview page showing:
- Course name
- Current grade
- Target grade
- Feasibility status
  Students can switch between courses without losing data.
  Deleting a course removes all related data using cascading delete rules.
- Dual database support:
  - The system supports both an in-memory stub database and a PostgreSQL database.
  - Repository abstraction allows switching between the two implementations.
  - Database switching is controlled through configuration.
  - PostgreSQL initialization scripts are included.
  - Integration tests verify correct persistence behaviour.

#### Development Tasks & Assignments

Backend: Implement Repository Layer & Multi-Course CRUD Logic
Assignee: Shivam (SCRUM-96)

Database: Design Schema & PostgreSQL Integration
Assignee: Himanshi (SCRUM-97)

Frontend: Multi-Course Overview & Switching Interface
Assignee: Rima (SCRUM-98)

Frontend: UI/UX Design in Figma
Assignee: Shadi (SCRUM-128)

Tests: Unit & Integration Tests for Persistence
Assignee: Bardiya (SCRUM-99)

Docs: Update Class Diagram (Persistence Architecture)
Assignee: Bardiya (SCRUM-100)

Docs: Create Sequence Diagrams for Persistence Flows
Assignee: Bardiya (SCRUM-120)

Docs: Create ER Diagram (Database Schema)
Assignee: Himanshi (SCRUM-121)

Docs: Update log.md (Persistence Architecture)
Assignee: Himanshi (SCRUM-122)

#### Notes / Reflection

- Implemented a repository abstraction layer to support both the stub database and PostgreSQL without changing business logic.
- Designed a relational database schema to persist courses, assessments, scores, scenarios, and deadlines.
- Added referential integrity constraints and cascading deletes to maintain consistent data relationships.
- Implemented multi-course support allowing students to create and switch between multiple courses without data loss.
- Integration tests verified that data persists after application restart and that switching between stub and PostgreSQL works correctly.
- No major blockers were encountered during development.

### ITR2-4 — Course Evaluation & Rule Modeling

([SCRUM-106](https://rimaaa.atlassian.net/browse/SCRUM-106))

**Story Owner:** Bardiya Ameri  
**Planned Effort:** 4 days  
**Actual Effort:** 3 day

#### Story Description

As a student, I want the system to evaluate my course performance using York University’s specific grading rules,  
so that I can understand my academic standing through letter grades, grade points, and realistic projections of what is required to hit my targets.

#### Scope (ITR2)

- Institutional grading logic:
  - Map calculated percentages to the YorkU 9-point scale (A+ = 9, A = 8, etc.)
  - Return structured results including:
    - Letter grade
    - Grade point value
    - Performance descriptor (e.g., Exceptional, Excellent, Good)
- Target feasibility analysis:
  - Calculate the exact average required on remaining coursework to achieve a user-defined target
- Dynamic difficulty classification:
  - Categorize the target as:
    - Comfortable
    - Achievable
    - Challenging
    - Very Challenging
    - Not Possible
    - Already Achieved
    - Complete (when remaining weight is 0)
- Engine integrity:
  - Deterministic and read-only (evaluations must not mutate or overwrite stored grade data)
  - Independent of AI components to ensure mathematical correctness
- Stability & integration:
  - Maintain compatibility with the in-memory stub database
  - Ensure consistent rounding and stable output at boundary thresholds (e.g., 79.5% vs 80.0%)

#### Development Tasks & Assignments (SCRUM-106)

- Backend: Evaluation & rule modeling engine

  - Assignee: Kartik
  - Status: DONE (SCRUM-112)

- Frontend: Evaluation results UI

  - Assignee: Shadi
  - Status: DONE (SCRUM-115)

- Frontend: UI/UX design support

  - Assignee: Shadi
  - Status: DONE (SCRUM-130)

- Database: Support evaluation data/model compatibility

  - Assignee: Himanshi
  - Status: DONE (SCRUM-116)

- Testing: Unit & integration tests for evaluation logic

  - Assignee: Bardiya
  - Status: DONE (SCRUM-117)

- Docs: Update log.md & technical notes
  - Assignee: Bardiya
  - Status: TO DO (SCRUM-118)

#### Key Design Decisions / Notes

- Deterministic + AI-independent engine: evaluation is purely mathematical for correctness and reproducibility.
- Read-only analysis: evaluation outputs do not overwrite real grades; repeated calls produce consistent results.
- Boundary handling: YorkU thresholds and rounding rules were designed to avoid drift at cutoffs (e.g., 79.5 vs 80.0).
- Edge cases covered:
  - Remaining weight = 0 → classification “Complete”
  - Target already met → classification “Already Achieved”
  - Required average > 100 → classification “Not Possible”

#### Testing Summary (SCRUM-117)

Automated tests verify:

- YorkU boundary mappings and rounding thresholds.
- Required remaining average math for partially graded courses.
- Difficulty classification threshold correctness.
- Non-mutation guarantees (analysis endpoints do not modify stored course data).
- Repeat-call stability (same inputs yield the same results).

#### Out of Scope / Future Work

- Institution-specific grading scale configuration.
- Saving evaluation history and trends over time.
- Advanced strategy engine beyond rule-based difficulty labels.
- Additional UI visualization for showing calculation steps (if prioritized).

### ITR2-5 — Interactive Strategy Dashboard (Grade Boundaries + Calculation Transparency + Learning Optimization)

SCRUM-91

**Story Owner:** Rima Ramcharan
**Planned Effort:** 5–6 days
**Actual Effort:** 6 days

#### Story Description

As a student, I want an interactive dashboard that models my best and worst-case grade scenarios and suggests specific study techniques, so that I can strategically prioritize my efforts and trust the accuracy of the system’s projections through transparent calculations.

#### Scope (ITR2)

- Interactive Planning Dashboard:
  - Central hub visualizing current progress, weighted contributions, and projected final grades.
  - Integration of "What-If" sliders to adjust performance assumptions dynamically.
- Grade Boundary Modeling:
  - Calculation and display of "Worst-Case" (minimum needed to pass/hit target) and "Best-Case" (max possible grade) scenarios.
- Calculation Transparency:
  - "Show Calculations" toggle to reveal weighted average formulas and underlying math.
  - Transparent breakdown of how each assessment contributes to the final standing.
- Smart Learning Strategies:
  - Integration of a recommendation engine suggesting specific techniques (80/20 Rule, Active Recall, Feynman Technique) based on assessment weight and remaining time.
- Dynamic Updating:
  - Projections and boundaries update immediately as the user explores "what-if" scores without overwriting actual saved grades.
  - System handles incomplete syllabi where total weight may not yet sum to 100%.

#### Development Tasks & Assignments

Backend: Implement grade boundaries and projection logic
Assignee: Kartik Sharma (SCRUM-90)
Status: TO DO

Frontend: Build Interactive Strategy Dashboard & Boundary Visualization
Assignee: Rima Ram... (SCRUM-91)
Status: DONE

Frontend: UI/UX Design in Figma
Assignee: Shadi Kari... (SCRUM-131)
Status: DONE

Database: Update schema for learning strategies & projections
Assignee: himanshi v... (SCRUM-92)
Status: IN PROGRESS

Tests: Add unit tests for weighted average & boundary math
Assignee: Bardiya A... (SCRUM-93)
Status: DONE

Docs: Document grade projection logic & learning strategies
Assignee: Rima Ram... (SCRUM-94)
Status: IN PROGRESS

#### Notes / Reflection

- Completed the core frontend dashboard architecture, including the performance assumption slider and the multi-course selector interface.
- Implemented "What-If" state management to allow real-time grade exploration without data loss or accidental overwrites of actual grades.
- Integrated the learning strategy recommendation UI to help students prioritize high-weight assessments (80/20 rule).
- Verified calculation transparency logic with unit tests to ensure mathematical accuracy in the weighted average displays.
- Current focus is finalizing the documentation for the persistence architecture and helping the backend team sync the projection logic with the updated database schema.

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

## 5. Concerns / Issues (ITR2)

* No major group conflicts occurred during Iteration 2.
* Some integration work required extra coordination between backend, frontend, and database components due to the larger scope of persistence and extraction features.
* A few features were implemented in a phased manner, where backend functionality was completed before full frontend refinement.
* Minor adjustments were needed during testing to align persistence behavior, extraction flow, and multi-course interactions.
* No critical blockers prevented completion of the main ITR2 goals.

## 6. Iteration Summary (ITR2)

Total number of user stories implemented: 6

During Iteration 2, the team expanded Evalio from a stub-based single-course prototype into a more complete planning system with persistence, extraction, multi-course support, evaluation modeling, and deadline management.

The team successfully delivered:

* Persistent multi-course storage with repository abstraction and PostgreSQL support
* Automatic course outline extraction with editable confirmation flow
* YorkU-based evaluation and rule modeling
* Interactive dashboard and multi-course management improvements
* Smart deadline management with OCR/manual support and calendar export flow
* User-scoped authentication and protected course access
* Expanded backend/frontend integration across newly added features
* Improved test coverage with both unit and integration testing

Overall, Iteration 2 introduced significantly more architectural complexity than Iteration 1, especially through persistence, extraction, authentication, and multi-feature integration. Despite this, the main ITR2 goals were completed and the project progressed toward a more realistic end-to-end system.

The system is now substantially more complete than in ITR1, with stronger persistence, richer workflows, and better support for real student planning across multiple sessions and multiple courses.
