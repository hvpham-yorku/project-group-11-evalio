# Evalio

EECS 2311 - Group 11  
Winter 2026

Evalio is a course-planning web app for tracking weighted assessments, calculating current standing, testing target feasibility, and running what-if scenarios from either manual setup or extracted course-outline data.

## Current Feature Set

- Cookie-based authentication (`/auth/register`, `/auth/login`, `/auth/me`, `/auth/logout`)
- Manual course setup with weighted assessments (validation on create/update)
- Grade entry and standing calculation
- Target grade feasibility and minimum-required score analysis
- What-if analysis (single assessment and multi-assessment dashboard what-if)
- Saved scenarios (create, list, run, delete)
- Weekly planning and risk alerts
- GPA conversion endpoints (4.0 / 9.0 / 10.0), weighted manual cGPA calculator, and normalized GPA scale conversion
- Outline extraction pipeline:
  - accepts `pdf`, `docx`, `txt`, `png`, `jpg`, `jpeg`
  - text extraction + OCR fallback for PDFs and direct OCR for images
  - grading-section filter + LLM extraction + normalization/validation
- Deadlines workflow:
  - extract from uploaded outline
  - CRUD endpoints
  - ICS export
  - optional Google Calendar export

## Architecture

The current architecture source of truth lives in
`docs/architecture/current-architecture.md`.

The ITR3 submission-oriented architecture diagram with integration-test seams
lives in `docs/architecture/itr3-architecture-with-test-seams.md`.

At a glance:

- `frontend/`: Next.js App Router app with route-level pages under `src/app/`,
  setup workflow screens under `src/components/setup/`, and a shared API client
  in `src/lib/api.ts`.
- `backend/`: FastAPI API with routers in `backend/app/routes/`, orchestration
  services in `backend/app/services/`, repository-backed persistence in
  `backend/app/repositories/`, and SQLAlchemy models in `backend/app/db.py`.
- `backend/app/dependencies.py`: startup-time dependency wiring that chooses
  between in-memory and PostgreSQL repositories, then exposes singleton service
  instances to the route layer.
- `backend/app/services/extraction/`: modular outline ingestion pipeline for
  text extraction, OCR fallback, LLM-assisted grading extraction,
  normalization/validation, and mapping into the course domain model.
- `database/`: submission-facing database artifacts (schema, setup notes, ER
  copy).

Storage behavior today:

- Default runtime mode uses in-memory repositories.
- Optional PostgreSQL repositories can be enabled via `USE_POSTGRES=true` for
  users, courses, deadlines, scenarios, calendar connections, and grade
  targets.
- When `USE_POSTGRES=true`, startup is fail-fast by default if Postgres is
  unavailable.
- Set `POSTGRES_FALLBACK_TO_MEMORY=true` only if you explicitly want fallback
  behavior.

## Repository Layout

```text
project-group-11-evalio/
├── README.md
├── database/
│   ├── README.md
│   └── schema/
│       └── evalio_schema.sql
├── submission/
│   ├── itr0/
│   ├── itr1/
│   └── itr2/
├── setup.sh
├── docs/
│   ├── api/GPA_ENDPOINTS.md
│   └── architecture/            # current architecture doc + historical images
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routes/               # auth, courses, dashboard, deadlines, extraction, gpa, planning, scenarios
│   │   ├── services/
│   │   │   ├── extraction/       # orchestrator + modular extraction helpers
│   │   │   └── extraction_service.py  # compatibility wrapper
│   │   ├── repositories/         # in-memory + postgres repos (users/courses/deadlines/scenarios/calendar/targets)
│   │   ├── models*.py
│   │   └── db.py
│   ├── test/
│   │   ├── unit/
│   │   └── integration/
│   ├── requirements.txt
│   └── README.md
└── frontend/
    ├── src/app/                  # app routes (landing, login, setup flow)
    ├── src/components/setup/     # upload/structure/grades/goals/deadlines/dashboard/explore/risk/manage
    ├── src/lib/api.ts            # API client
    ├── package.json
    └── README.md
```

## Database Artifacts For Submission

- Runtime database code stays in `backend/` (`app/db.py`, repositories, models, DI).
- Submission-facing artifacts live in `database/`:
  - `database/schema/evalio_schema.sql`
  - `docs/ER diagram/erdiagram_evalio.png`
  - `database/README.md`

## Known Limitations

- The dashboard's overall GPA snapshot is an equal-weight average across tracked
  courses. The setup flow does not currently collect course credits, so it is
  not a transcript-weighted cGPA.
- The `/gpa/cgpa` endpoint is the truthful weighted cGPA calculator when the
  caller supplies course percentages and credits explicitly.
- The `/gpa/convert` endpoint performs normalized point-scale conversion for an
  existing GPA value. It is useful for comparison, but it is not an official
  institutional equivalency policy engine.
- Extraction remains best-effort. Unsupported or ambiguous grading rules are
  not treated as reliably inferable from uploaded documents.
- Google Calendar export is optional and requires valid Google OAuth
  configuration in `backend/.env`.

## Quick Start

### Prerequisites

- Node.js 18+ (20+ recommended)
- npm
- Python 3.12.12 (required by `setup.sh`)
- System OCR tools:
  - `tesseract`
  - `pdftoppm` (Poppler)

### 1. Clone

```bash
git clone <repository-url>
cd project-group-11-evalio
```

### 2. One-command setup (recommended)

```bash
bash setup.sh
```

The script:

- creates missing env files from examples
- creates `backend/.venv` if needed
- installs backend/frontend dependencies
- verifies `openai==1.46.0` and `httpx==0.27.2`
- prints run commands

### 3. Run backend

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Backend docs: `http://127.0.0.1:8000/docs`

### 3b. Run backend with PostgreSQL (team/dev)

If you want persistence across restarts, run backend in Postgres mode.

1. Start Postgres (macOS/Homebrew):

```bash
brew services start postgresql@16
```

2. Ensure CLI tools are available (one-time):

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
hash -r
```

3. Verify DB service:

```bash
psql --version
pg_isready -h localhost -p 5432
```

4. Create database once:

```bash
createdb evalio
```

5. Run backend with Postgres (disable fallback for fail-fast):

```bash
cd backend
source .venv/bin/activate
export USE_POSTGRES=true
export DATABASE_URL='postgresql+psycopg://localhost:5432/evalio'
export POSTGRES_FALLBACK_TO_MEMORY=false
uvicorn app.main:app --reload --port 8000
```

### 4. Run frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend app: `http://localhost:3000`

## Environment Variables

### Required (`backend/.env`)

```bash
AUTH_SECRET_KEY=change-this-in-real-env
AUTH_ALGORITHM=HS256
AUTH_ACCESS_TOKEN_EXPIRE_MINUTES=480
AUTH_COOKIE_NAME=evalio_access_token
AUTH_COOKIE_SECURE=false
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_SECONDS=20
```

### Optional backend flags

```bash
USE_POSTGRES=true
DATABASE_URL=postgresql+psycopg://localhost:5432/evalio
POSTGRES_FALLBACK_TO_MEMORY=false
FILTER_DEBUG=1
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8000/deadlines/google/callback
```

### Frontend (`frontend/.env.local`)

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## API Surface (High Level)

Base URL: `http://127.0.0.1:8000`

- Health:
  - `GET /health`
- Auth:
  - `POST /auth/register`
  - `POST /auth/login`
  - `POST /auth/logout`
  - `GET /auth/me`
- Courses & grading:
  - `GET /courses/`
  - `POST /courses/`
  - `PUT /courses/{course_id}/weights`
  - `PUT /courses/{course_id}/grades`
  - `POST /courses/{course_id}/target`
  - `POST /courses/{course_id}/minimum-required`
  - `POST /courses/{course_id}/whatif`
- Extraction:
  - `POST /extraction/outline`
  - `POST /extraction/confirm`
- Dashboard:
  - `GET /courses/{course_id}/dashboard`
  - `POST /courses/{course_id}/dashboard/whatif`
  - `GET /courses/{course_id}/dashboard/strategies`
- Scenarios:
  - `POST /courses/{course_id}/scenarios`
  - `GET /courses/{course_id}/scenarios`
  - `GET /courses/{course_id}/scenarios/{scenario_id}`
  - `GET /courses/{course_id}/scenarios/{scenario_id}/run`
  - `DELETE /courses/{course_id}/scenarios/{scenario_id}`
- GPA:
  - `GET /gpa/scales`
  - `GET /courses/{course_id}/gpa`
  - `POST /courses/{course_id}/gpa/whatif`
  - `POST /gpa/cgpa`
  - `POST /gpa/convert`
- Deadlines:
  - `POST /courses/{course_id}/deadlines/extract`
  - `GET /courses/{course_id}/deadlines`
  - `POST /courses/{course_id}/deadlines`
  - `PUT /courses/{course_id}/deadlines/{deadline_id}`
  - `DELETE /courses/{course_id}/deadlines/{deadline_id}`
  - `POST /courses/{course_id}/deadlines/export/ics`
  - `GET /deadlines/google/authorize`
  - `GET /deadlines/google/status`
  - `GET /deadlines/google/callback`
  - `POST /courses/{course_id}/deadlines/export/gcal`

## Frontend Flow

Primary setup workflow under `/setup/*`:

1. `/setup/upload`
2. `/setup/structure`
3. `/setup/grades`
4. `/setup/goals`
5. `/setup/deadlines`
6. `/setup/dashboard`

Scenario exploration route: `/setup/explore`

## Testing

Backend tests:

```bash
cd backend
env PYTHONPATH=. .venv/bin/pytest -q
```

Frontend lint:

```bash
cd frontend
npm run lint
```

## Iteration Artifacts

- `docs/architecture/itr1-architecture.png`
- `docs/architecture/class diagram.png`
- `docs/api/GPA_ENDPOINTS.md`
- `log.md`
