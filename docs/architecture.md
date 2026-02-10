# Architecture Notes – Iteration 1

## Overview
Evalio uses a layered architecture separating frontend, backend API, and data storage.

Iteration 1 focuses on manual course setup with a stub data layer.

## Backend
- Framework: FastAPI
- Validation: Pydantic models
- API documentation: OpenAPI (Swagger UI)

## Domain Model
- Course
  - name
  - term (optional)
  - assessments (list)

- Assessment
  - name
  - weight (percentage)

## Data Layer (Iteration 1)
- Implemented as in-memory Python lists
- Non-persistent stub storage
- Satisfies Iteration 1 requirements

## Future Improvements
- Replace stub data layer with PostgreSQL
- Add SQLAlchemy ORM models
- Add database migrations
