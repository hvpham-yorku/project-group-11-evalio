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
- GPA conversion endpoints (4.0 / 9.0 / 10.0) plus CGPA calculator
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

- `frontend/`: Next.js App Router (TypeScript + Tailwind)
- `backend/`: FastAPI app
  - route modules under `backend/app/routes/`
  - service layer under `backend/app/services/`
  - extraction package under `backend/app/services/extraction/`
- `backend/test/`: pytest suite (service and API behavior)

Storage behavior today:

- Default is in-memory repositories.
- Optional PostgreSQL repositories can be enabled via `USE_POSTGRES=true` (courses, users, deadlines).

## Repository Layout

```text
project-group-11-evalio/
├── README.md
├── setup.sh
├── docs/
│   ├── api/GPA_ENDPOINTS.md
│   └── architecture/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routes/               # auth, courses, extraction, gpa, dashboard, deadlines
│   │   ├── services/
│   │   │   ├── extraction/       # orchestrator + modular extraction helpers
│   │   │   └── extraction_service.py  # compatibility wrapper
│   │   ├── repositories/         # in-memory + postgres course repo
│   │   ├── models*.py
│   │   └── db.py
│   ├── test/
│   ├── requirements.txt
│   └── README.md
└── frontend/
    ├── src/app/                  # app routes (landing, login, setup flow)
    ├── src/components/setup/     # upload/structure/grades/goals/deadlines/dashboard
    ├── src/lib/api.ts            # API client
    ├── package.json
    └── README.md
```

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
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/evalio
POSTGRES_FALLBACK_TO_MEMORY=true
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
- GPA:
  - `GET /gpa/scales`
  - `GET /courses/{course_id}/gpa`
  - `POST /courses/{course_id}/gpa/whatif`
  - `POST /gpa/cgpa`
- Deadlines:
  - `POST /courses/{course_id}/deadlines/extract`
  - `GET /courses/{course_id}/deadlines`
  - `POST /courses/{course_id}/deadlines`
  - `PUT /courses/{course_id}/deadlines/{deadline_id}`
  - `DELETE /courses/{course_id}/deadlines/{deadline_id}`
  - `POST /courses/{course_id}/deadlines/export/ics`
  - `GET /deadlines/google/authorize`
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
source .venv/bin/activate
python -m pytest -q
```

Frontend lint:

```bash
cd frontend
npm run lint
```

## Known Limitations

- Default runtime storage is still mostly in-memory.
- PostgreSQL integration supports course, user, and deadline repositories when enabled.
- Extraction quality depends on outline formatting and OCR quality.
- Frontend upload picker currently lists `.pdf/.doc/.docx/.txt`; backend extraction endpoint also supports image uploads.
- `/setup/plan` and `/explore` are placeholder routes.

## Iteration Artifacts

- `docs/architecture/itr1-architecture.png`
- `docs/architecture/class diagram.png`
- `docs/api/GPA_ENDPOINTS.md`
- `log.md`
