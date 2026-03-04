# Evalio

EECS 2311 - Group 11  
Winter 2026

Evalio helps students model course assessments, track current standing, test target-grade feasibility, and run what-if grade scenarios.

## What Is Implemented Right Now

- Manual course setup with weighted assessments (must total 100%)
- Grade entry with validation (`raw_score <= total_score`, non-negative values)
- Current standing calculation from graded assessments only
- Target feasibility analysis with YorkU letter/point mapping
- Minimum required score for a specific remaining assessment
- What-if scenario analysis for ungraded assessments
- Planning dashboard and scenario explorer UI

## Current Architecture

- `frontend/`: Next.js App Router app (TypeScript + Tailwind)
- `backend/`: FastAPI app with in-memory repository storage
- `backend/test/`: pytest suite for grading logic and endpoint behavior

Important behavior today:

- Data is not persisted. Restarting the backend clears all courses.
- The frontend works with the most recently created course (`courses[courses.length - 1]`).
- Upload UI exists, but automatic syllabus parsing is not wired yet.

## Repository Layout

```text
project-group-11-evalio/
├── README.md
├── log.md
├── docs/architecture/itr1-architecture.png
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI app + CORS + /health
│   │   ├── models.py              # Pydantic course/assessment schemas
│   │   ├── repositories/          # Repository interface + in-memory implementation
│   │   ├── services/              # Grading and course orchestration services
│   │   └── routes/courses.py      # Thin API endpoints
│   ├── test/                      # pytest coverage for ITR1 logic
│   ├── requirements.txt
│   └── README.md
└── frontend/
    ├── src/app/setup/             # 5-step workflow routes
    ├── src/components/setup/       # Setup, goals, dashboard, scenario UI
    ├── src/lib/api.ts              # API client + shared types
    ├── package.json
    └── README.md
```

## Quick Start

### Prerequisites

- Node.js 18+ (20+ recommended)
- npm
- Python 3.12.12
- `tesseract` (system package)
- `pdftoppm` from Poppler (system package)

### 1. Clone

```bash
git clone <repository-url>
cd project-group-11-evalio
```

### 2. One-Command Setup (Recommended)

```bash
bash setup.sh
```

This script will:

- Copy missing env files (`backend/.env`, `frontend/.env.local`)
- Create backend virtual environment (`backend/.venv`) if needed
- Install backend and frontend dependencies
- Verify required backend versions (`openai==1.46.0`, `httpx==0.27.2`)
- Print the exact backend/frontend run commands

### 3. Run Backend (FastAPI)

```bash
cd backend
source .venv/bin/activate            # Windows: .venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

Backend URLs:

- API root: `http://127.0.0.1:8000`
- Swagger docs: `http://127.0.0.1:8000/docs`

### 4. Run Frontend (Next.js)

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL:

- App: `http://localhost:3000`

### 5. Frontend Env Variable

Create `frontend/.env.local` from example:

```bash
cp frontend/.env.local.example frontend/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### 6. Backend Env Variables

`backend/.env` should include:

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

## API Endpoints

Base URL: `http://127.0.0.1:8000`

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /courses/`
- `POST /courses/`
- `PUT /courses/{course_id}/weights`
- `PUT /courses/{course_id}/grades`
- `POST /courses/{course_id}/target`
- `POST /courses/{course_id}/minimum-required`
- `POST /courses/{course_id}/whatif`

Example create-course payload:

```json
{
  "name": "EECS2311",
  "term": "W26",
  "assessments": [
    { "name": "A1", "weight": 20, "raw_score": null, "total_score": null },
    { "name": "Midterm", "weight": 30, "raw_score": null, "total_score": null },
    { "name": "Final", "weight": 50, "raw_score": null, "total_score": null }
  ]
}
```

Create/list course responses now include a `course_id` UUID used by all
`/courses/{course_id}/...` operations.
All `/courses/*` endpoints require authentication via HttpOnly cookie session.

## Frontend Workflow

The setup flow under `/setup/*` is:

1. Upload (`/setup/upload`)
2. Structure (`/setup/structure`)
3. Grades (`/setup/grades`)
4. Goals (`/setup/goals`)
5. Dashboard (`/setup/dashboard`)

Scenario exploration is at `/setup/explore`.

## Scripts

Frontend:

```bash
cd frontend
npm run dev
npm run build
npm run start
npm run lint
```

Backend:

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

## Testing and Validation

Frontend lint:

```bash
cd frontend
npm run lint
```

Backend tests:

```bash
cd backend
source .venv/bin/activate
python -m pytest -q
```

`pytest` is included in `backend/requirements.txt`.

## Known Limitations

- In-memory backend storage only (no DB persistence yet)
- No persistent user/course data across backend restarts
- Upload page does not perform real file parsing yet
- Frontend route `/explore` exists but is currently empty; main explorer is `/setup/explore`

## Iteration Artifacts

- Architecture sketch: `docs/architecture/itr1-architecture.png`
- Team process and sprint log: `log.md`
- Planning/design PDFs in project root (ITR0/ITR1 artifacts)
