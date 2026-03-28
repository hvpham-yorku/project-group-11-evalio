# Evalio ITR3 Architecture With Test Seams

This document is the ITR3-oriented architecture view for submission and review.
It focuses on the implemented runtime layers plus the integration seams covered
by backend integration tests.

Note: the repo uses a mix of pytest classes and function-based test modules. The
diagram labels a seam with the closest test class when one exists, otherwise the
test module filename is listed.

## Final Diagram

```mermaid
flowchart LR
    subgraph FE[Frontend]
        FE_Routes["Next.js routes<br/>/login, /setup/*, /explore"]
        FE_Shell["setup/layout.tsx<br/>course-context.tsx"]
        FE_Dash["Dashboard.tsx<br/>GPA Overview + GpaScaleConverter"]
        FE_Upload["UploadStep / StructureStep"]
        FE_Deadlines["Deadlines.tsx"]
        FE_Explore["ExploreScenarios.tsx / RiskCenter.tsx"]
        FE_API["lib/api.ts"]
    end

    subgraph API[FastAPI Route Layer]
        R_Auth["routes/auth.py"]
        R_Courses["routes/courses.py"]
        R_Dashboard["routes/dashboard.py"]
        R_GPA["routes/gpa.py"]
        R_Extraction["routes/extraction.py"]
        R_Deadlines["routes/deadlines.py"]
        R_Planning["routes/planning.py"]
        R_Scenarios["routes/scenarios.py"]
    end

    subgraph Services[Service Layer]
        S_Auth["auth_service.py"]
        S_Course["course_service.py"]
        S_Grading["grading_service.py"]
        S_Strategy["strategy_service.py"]
        S_GPA["gpa_service.py"]
        S_Extraction["services/extraction/orchestrator.py"]
        S_Deadline["deadline_service.py"]
        S_Planning["planning_service.py"]
        S_Scenario["scenario_service.py"]
    end

    subgraph Persistence[Persistence]
        Repos["Repository interfaces + impls<br/>in-memory / postgres"]
        DB["db.py SQLAlchemy models<br/>users, courses, assessments, rules,<br/>scenarios, deadlines, calendar_connections,<br/>grade_targets, deadline_exports"]
    end

    subgraph External[External Systems]
        OCR["OCR tools<br/>tesseract / pdftoppm"]
        OpenAI["OpenAI extraction client"]
        Google["Google Calendar OAuth + Events"]
    end

    FE_Routes --> FE_Shell --> FE_API
    FE_Dash --> FE_API
    FE_Upload --> FE_API
    FE_Deadlines --> FE_API
    FE_Explore --> FE_API

    FE_API --> R_Auth --> S_Auth --> Repos
    FE_API --> R_Courses --> S_Course --> Repos
    FE_API --> R_Dashboard --> S_Strategy --> S_Grading
    FE_API --> R_GPA --> S_GPA
    FE_API --> R_Extraction --> S_Extraction
    FE_API --> R_Deadlines --> S_Deadline --> Repos
    FE_API --> R_Planning --> S_Planning --> Repos
    FE_API --> R_Scenarios --> S_Scenario --> Repos

    S_Course --> S_Grading
    S_Strategy --> S_GPA
    S_Scenario --> S_Course
    S_Deadline --> Google
    S_Deadline --> OCR
    S_Extraction --> OCR
    S_Extraction --> OpenAI
    Repos --> DB

    Seam_Auth["Integration seam<br/>test_auth_endpoints.py<br/>test_authorization.py"] -. covers .- R_Auth
    Seam_Courses["Integration seam<br/>test_course_setup.py<br/>test_course_management.py<br/>test_current_standing.py<br/>test_weighted_math_accuracy.py"] -. covers .- R_Courses
    Seam_GPA["Integration seam<br/>test_gpa_service.py::TestGpaEndpoints"] -. covers .- R_GPA
    Seam_Extract["Integration seam<br/>test_extraction_route.py<br/>test_extraction_confirm_mapping.py"] -. covers .- R_Extraction
    Seam_Deadlines["Integration seam<br/>test_deadline_endpoints.py::TestDeadlineEndpoints"] -. covers .- R_Deadlines
    Seam_Planning["Integration seam<br/>test_planning_endpoints.py"] -. covers .- R_Planning
    Seam_Scenarios["Integration seam<br/>test_scenarios_endpoints.py<br/>test_strategy_service.py::TestDashboardEndpoints"] -. covers .- R_Scenarios
    Seam_Postgres["Integration seam<br/>test_postgres_persistence_optional.py"] -. covers .- DB
```

## Seam Notes

- Auth seam checks login, registration, cookie-backed identity, and access
  control boundaries.
- Course seam checks setup, grade updates, standing math, and multi-course
  isolation.
- GPA seam now covers:
  - single-course GPA
  - weighted manual cGPA
  - mandatory-pass failure behavior
  - normalized GPA scale conversion
- Extraction seam checks both outline extraction and confirmation/mapping into
  the course model.
- Deadline, planning, and scenario seams cover the newer ITR2/ITR3 workflow
  additions beyond the original course setup core.
