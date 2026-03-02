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
- Python 3.10+

### 1. Clone

```bash
git clone <repository-url>
cd project-group-11-evalio
```

### 2. Run Backend (FastAPI)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend URLs:

- API root: `http://127.0.0.1:8000`
- Swagger docs: `http://127.0.0.1:8000/docs`

### 3. Run Frontend (Next.js)

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL:

- App: `http://localhost:3000`

### 4. Optional Frontend Env Variable

The frontend defaults to `http://127.0.0.1:8000`.  
To override, create `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

### 5. Optional Backend Auth/CORS Env Variables

Create `backend/.env` (optional):

```bash
AUTH_SECRET_KEY=change-this-in-real-env
AUTH_ALGORITHM=HS256
AUTH_ACCESS_TOKEN_EXPIRE_MINUTES=480
AUTH_COOKIE_NAME=evalio_access_token
AUTH_COOKIE_SECURE=false
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
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
source venv/bin/activate
pip install pytest
python -m pytest -q
```

Note: `pytest` is used by `backend/test/*` but is not pinned in `backend/requirements.txt`.

## Known Limitations

- In-memory backend storage only (no DB persistence yet)
- No persistent user/course data across backend restarts
- Upload page does not perform real file parsing yet
- Frontend route `/explore` exists but is currently empty; main explorer is `/setup/explore`

## Iteration Artifacts

- Architecture sketch: `docs/architecture/itr1-architecture.png`
- Team process and sprint log: `log.md`
- Planning/design PDFs in project root (ITR0/ITR1 artifacts)
