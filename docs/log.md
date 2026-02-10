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
