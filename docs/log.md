# Iteration 1 – Development Log

## Backend: Manual Course Setup

### Work Completed
- Implemented FastAPI endpoints for manual course creation
- Added domain models for Course and Assessment
- Implemented in-memory stub data storage
- Added validation for assessment inputs:
  - Empty assessment names are rejected
  - Negative weights are rejected
  - Total assessment weight cannot exceed 100%
- Verified functionality using Swagger UI

### Design Decisions
- Used in-memory lists as a stub database for Iteration 1
- Deferred persistent database integration to Iteration 2
- Focused on clean API separation and validation

### Architecture Notes
- FastAPI application initialized in main.py
- Course endpoints organized using APIRouter in routes/courses.py
- Pydantic models enforce request validation
- In-memory list (courses_db) acts as a temporary storage layer
- Clear separation between routing, validation, and storage logic

## Frontend: Manual Course Setup

### Work Completed
- Implemented UI for manual course creation
- Added form inputs for course name and assessments
- Allowed users to input assessment names and weights
- Integrated frontend with backend `/courses` endpoint
- Displayed validation errors returned from backend

### Design Decisions
- Frontend validation kept minimal; backend enforces grading rules
- Relied on API responses for error handling and consistency

### Architecture Notes
- Frontend communicates with backend via REST API calls
- Course creation form submits data to `/courses` endpoint
- UI reflects backend validation responses

## Testing

### Work Completed
- Manually tested endpoints using Swagger UI
- Verified validation rules for:
  - Empty assessment names
  - Negative weights
  - Total weight exceeding 100%
- Confirmed correct API responses for valid and invalid inputs

### Design Decisions
- Focused on manual testing for Iteration 1
- Automated tests deferred to later iterations

### Status
- Manual Course Setup user story completed for Iteration 1
- Backend, frontend integration, and validation testing complete for Iteration 1





# Iteration 2 – Grading Structure Validation

## Database: Ensure Schema Supports Weight Updates

### Work Completed 
- Reviewed schema for assessment weight updates
- Confirmed AssessmentWeightUpdate model allows weight modification
- Added validation constraints (ge=0, le=100) to ensure valid weight range
- Verified that weight updates do not conflict with in-memory storage structure

### Design Decision
- Validation is enforced at the schema/application layer (Pydantic).
- No database-level enforcement was added, as persistent DB constraints are out of scope    for ITR-2.
- Stub/in-memory storage remains unchanged.

### Status 
- Schema supports safe weight updates. SCRUM-44 complete (Iteration 2 database)
