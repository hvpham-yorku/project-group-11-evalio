# Evalio Backend

FastAPI backend for authentication, course management, extraction, grading analysis, GPA conversion, and deadline workflows.

Note: submission-facing DB artifacts live in `../database/`; runtime DB code remains in this `backend/` package.

## Runtime Overview

- Framework: FastAPI + Pydantic v2
- Main app entry: `app/main.py`
- Route modules:
  - `app/routes/auth.py`
  - `app/routes/courses.py`
  - `app/routes/extraction.py`
  - `app/routes/dashboard.py`
  - `app/routes/scenarios.py`
  - `app/routes/gpa.py`
  - `app/routes/deadlines.py`
- Service layer in `app/services/`
- Extraction system split into `app/services/extraction/` with `orchestrator.py` entrypoint

## Prerequisites

- Python 3.12.12
- OCR system tools (for PDF/image OCR paths):
  - `tesseract`
  - `pdftoppm` (Poppler)

## Setup

1. Create virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Create env file:

```bash
cp .env.example .env
```

4. Run the API:

```bash
uvicorn app.main:app --reload --port 8000
```

OpenAPI docs: `http://127.0.0.1:8000/docs`

## Environment Variables

### Core/auth

```bash
AUTH_SECRET_KEY=change-this-in-real-env
AUTH_ALGORITHM=HS256
AUTH_ACCESS_TOKEN_EXPIRE_MINUTES=480
AUTH_COOKIE_NAME=evalio_access_token
AUTH_COOKIE_SECURE=false
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### Extraction/LLM

```bash
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_SECONDS=20
FILTER_DEBUG=1
```

### Optional PostgreSQL storage

```bash
USE_POSTGRES=true
DATABASE_URL=postgresql+psycopg://localhost:5432/evalio
POSTGRES_FALLBACK_TO_MEMORY=true
```

## PostgreSQL Local Setup (Recommended)

1. Start Postgres (macOS/Homebrew):

```bash
brew services start postgresql@16
```

2. Ensure tools are in PATH (one-time):

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
hash -r
```

3. Verify service:

```bash
psql --version
pg_isready -h localhost -p 5432
```

4. Create DB once:

```bash
createdb evalio
```

5. Run backend with Postgres and fail-fast (no in-memory fallback):

```bash
source .venv/bin/activate
export USE_POSTGRES=true
export DATABASE_URL='postgresql+psycopg://localhost:5432/evalio'
export POSTGRES_FALLBACK_TO_MEMORY=false
uvicorn app.main:app --reload --port 8000
```

Note: startup `init_db()` now auto-aligns the `rules.rule_type` DB constraint with backend values (`pure_multiplicative`, `best_of`, `drop_lowest`, `mandatory_pass`).

### Optional Google Calendar integration

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8000/deadlines/google/callback
```

## API Endpoints

All `/courses/*`, `/gpa/*`, `/dashboard/*`, `/deadlines/*`, and extraction endpoints require auth via HttpOnly cookie, unless noted.

### Health

- `GET /health`

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

### Courses & grading

- `GET /courses/`
- `POST /courses/`
- `PUT /courses/{course_id}/weights`
- `PUT /courses/{course_id}/grades`
- `POST /courses/{course_id}/target`
- `POST /courses/{course_id}/minimum-required`
- `POST /courses/{course_id}/whatif`

### Extraction

- `POST /extraction/outline`
- `POST /extraction/confirm`

### Strategy dashboard

- `GET /courses/{course_id}/dashboard`
- `POST /courses/{course_id}/dashboard/whatif`
- `GET /courses/{course_id}/dashboard/strategies`

### Scenarios

- `POST /courses/{course_id}/scenarios`
- `GET /courses/{course_id}/scenarios`
- `GET /courses/{course_id}/scenarios/{scenario_id}`
- `GET /courses/{course_id}/scenarios/{scenario_id}/run`
- `DELETE /courses/{course_id}/scenarios/{scenario_id}`

### GPA

- `GET /gpa/scales`
- `GET /courses/{course_id}/gpa`
- `POST /courses/{course_id}/gpa/whatif`
- `POST /gpa/cgpa`

### Deadlines

- `POST /courses/{course_id}/deadlines/extract`
- `GET /courses/{course_id}/deadlines`
- `POST /courses/{course_id}/deadlines`
- `PUT /courses/{course_id}/deadlines/{deadline_id}`
- `DELETE /courses/{course_id}/deadlines/{deadline_id}`
- `POST /courses/{course_id}/deadlines/export/ics`
- `GET /deadlines/google/authorize`
- `GET /deadlines/google/callback`
- `POST /courses/{course_id}/deadlines/export/gcal`

## Storage Notes

- Default mode uses in-memory repositories.
- If `USE_POSTGRES=true`, courses/users/deadlines/scenarios use PostgreSQL repositories.

## Testing

Run backend tests:

```bash
source .venv/bin/activate
python -m pytest -q
```

Run only unit tests:

```bash
python -m pytest -q test/unit
```

Run only integration tests:

```bash
python -m pytest -q test/integration
```
