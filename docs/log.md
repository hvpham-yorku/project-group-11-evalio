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

### Status
- Backend and database stub complete for Iteration 1


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
