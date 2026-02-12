# Architecture Notes – Iteration 1

## Overview
Evalio follows a layered architecture separating the frontend, backend API, and data storage.

Iteration 1 focuses on implementing manual course setup using a temporary stub data layer. The goal was to validate API design and grading structure rules before introducing persistent storage.

## System Structure

### Frontend Layer
- Responsible for rendering the manual course setup form.
- Collects course name and assessment information.
- Sends data to the backend via REST API calls.
- Displays validation errors returned from the backend.

### Backend Layer
- Framework: FastAPI
- Routing: `APIRouter` used to organize course-related endpoints.
- Validation: Pydantic models enforce request structure and constraints.
- API documentation automatically generated using OpenAPI (Swagger UI).

Responsibilities:
- Accept course creation requests.
- Validate grading structure rules:
  - Assessment names must not be empty.
  - Weights must be non-negative.
  - Total weight must not exceed 100%.
- Return structured JSON responses.

## Domain Model

### Course
- `name`
- `term` (optional)
- `assessments` (list of Assessment objects)

### Assessment
- `name`
- `weight` (percentage)

The domain model is defined using Pydantic schemas to ensure consistent validation and type safety.

## Data Layer (Iteration 1)

- Implemented as an in-memory Python list (`courses_db`).
- Acts as a non-persistent stub storage mechanism.
- Data is lost when the server restarts.
- Satisfies Iteration 1 requirement for stub-based storage.

Design Decision:
Persistent database integration was intentionally deferred to later iterations to prioritize API correctness and validation logic.

## Data Flow

1. User submits course creation form.
2. Frontend sends a POST request to `/courses`.
3. Backend validates input using Pydantic.
4. Business rules are enforced.
5. Valid data is stored in in-memory stub.
6. Response is returned to frontend.

## Future Improvements
- Replace stub data layer with a relational database (e.g., PostgreSQL or MySQL).
- Introduce SQLAlchemy ORM models.
- Add database migrations.
- Add automated unit and integration tests.
