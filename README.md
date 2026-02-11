# Evalio

**EECS 2311 – Group 11 · Winter 2026**

Evalio is a student-focused grade planning application that helps university students understand their course grading structures and evaluate whether their target grades are achievable. Add your courses, define assessment breakdowns, run feasibility analysis, simulate what-if scenarios, and convert between GPA scales — all in a polished dark-mode interface.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Frontend Components](#frontend-components)
- [Database Schema](#database-schema)
- [Contributing](#contributing)

---

## Features

| Feature | Description |
|---|---|
| **Course Management** | Create, edit, and delete courses with target grade goals |
| **Assessment Setup** | Define weighted assessments (assignments, midterms, finals) with scores and due dates |
| **Feasibility Analysis** | Calculate required scores on remaining assessments, risk ranges (minimum / safe / stretch), and achievability status |
| **What-If Simulator** | Adjust hypothetical scores via sliders and see projected final grade in real-time with a circular progress ring |
| **Scenario Save/Load** | Save named what-if scenarios and reload them later for comparison |
| **GPA Converter** | Convert between Percentage, 4.0, 9.0, 10.0 scales, and letter grades |
| **Dark Mode UI** | Glassmorphism cards, glow effects, gradient accents, Geist typography — Awwwards-level design |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Client (Browser)                      │
│                                                              │
│  Next.js 15 App Router  ·  React 18  ·  TypeScript           │
│  Tailwind CSS (HSL tokens)  ·  Framer Motion  ·  Radix UI    │
│  TanStack React Query (server state cache)                   │
│                                                              │
│  Pages:                                                      │
│    /           → Landing page (hero, features, CTA)          │
│    /dashboard  → Dashboard (tabs: Setup, Feasibility,        │
│                  What-If Simulator, GPA Converter)            │
└──────────────────────┬───────────────────────────────────────┘
                       │  HTTP REST (JSON)
                       │  Port 3000 → Port 8000
┌──────────────────────▼───────────────────────────────────────┐
│                     Backend (FastAPI)                         │
│                                                              │
│  Endpoints:                                                  │
│    GET    /health                                            │
│    GET    /courses             → list all courses             │
│    POST   /courses             → create course                │
│    GET    /courses/:id         → get course + assessments     │
│    PUT    /courses/:id         → update course                │
│    DELETE /courses/:id         → delete course                │
│    POST   /courses/:id/assessments  → add assessment          │
│    PUT    /assessments/:id     → update assessment            │
│    DELETE /assessments/:id     → delete assessment            │
│    POST   /courses/:id/analyze → feasibility analysis         │
│    POST   /courses/:id/simulate → what-if simulation          │
│                                                              │
│  Validation: Pydantic v2 schemas                             │
│  Business logic: utils.py (weighted avg, required score,     │
│                  risk ranges, final grade, status)            │
└──────────────────────┬───────────────────────────────────────┘
                       │  SQLAlchemy ORM
┌──────────────────────▼───────────────────────────────────────┐
│                    SQLite (test.db)                           │
│                                                              │
│  Tables: users, courses, assessments, scenarios              │
│  Auto-created on first startup via Base.metadata.create_all  │
└──────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| Next.js | 15.x | React framework (App Router, SSR) |
| React | 18.2 | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 3.4 | Utility-first styling with HSL CSS variable design tokens |
| Framer Motion | 11.x | Animations and page transitions |
| Radix UI | Latest | Accessible primitives (Dialog, Tabs, Slider, Select, etc.) |
| TanStack Query | 5.x | Server state management, caching, mutations |
| Geist | 1.7 | Sans & Mono font family (Vercel) |
| Lucide React | 0.395 | Icon library |
| Zod | 3.22 | Runtime schema validation |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Python | 3.12+ | Runtime |
| FastAPI | 0.112 | Async REST API framework |
| Uvicorn | 0.30 | ASGI server |
| SQLAlchemy | 2.0 | ORM for database operations |
| Pydantic | 2.8 | Request/response validation |
| SQLite | — | Lightweight file-based database |

---

## Project Structure

```
project-group-11-evalio/
├── README.md
├── backend/
│   ├── requirements.txt          # Python dependencies
│   └── app/
│       ├── __init__.py
│       ├── config.py             # DB engine, session, Base
│       ├── main.py               # FastAPI app, all REST endpoints
│       ├── models.py             # SQLAlchemy models (User, Course, Assessment, Scenario)
│       ├── schemas.py            # Pydantic request/response schemas
│       └── utils.py              # Business logic (averages, required scores, risk, simulation)
├── frontend/
│   ├── package.json
│   ├── tailwind.config.ts        # Design tokens, custom animations
│   ├── tsconfig.json
│   ├── next.config.ts
│   └── src/
│       ├── app/
│       │   ├── globals.css       # CSS variables, glassmorphism, glow utilities
│       │   ├── layout.tsx        # Root layout (Geist fonts, dark body)
│       │   ├── page.tsx          # Landing page route
│       │   ├── providers.tsx     # TanStack QueryClientProvider
│       │   └── dashboard/
│       │       └── page.tsx      # Dashboard route
│       ├── components/
│       │   ├── landing/
│       │   │   ├── navbar.tsx    # Sticky blur navbar with gradient logo
│       │   │   └── index.tsx     # Hero, features grid, CTA, footer
│       │   └── dashboard/
│       │       ├── sidebar.tsx       # Course list sidebar with CRUD
│       │       ├── index.tsx         # Tab controller (Setup/Feasibility/Simulator/GPA)
│       │       ├── course-extraction.tsx  # Assessment CRUD with weight/score cards
│       │       ├── feasibility.tsx        # Analysis results with status badges
│       │       ├── simulator.tsx          # What-if sliders, progress ring, scenario save
│       │       └── gpa-converter.tsx      # Multi-scale GPA conversion
│       └── lib/
│           ├── utils.ts          # cn() utility (clsx + tailwind-merge)
│           └── api/
│               ├── client.ts     # Typed fetch wrapper for all API endpoints
│               └── hooks.ts      # TanStack Query hooks (useCourses, useAnalyze, etc.)
└── docs/
    ├── architecture.md
    └── log.md
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and **npm**
- **Python** 3.12+
- **Git**

### 1. Clone the Repository

```bash
git clone https://github.com/hvpham-yorku/project-group-11-evalio.git
cd project-group-11-evalio
```

### 2. Backend Setup (FastAPI)

```bash
cd backend
pip3 install -r requirements.txt
```

Start the server:

```bash
python3 -m uvicorn app.main:app --reload --port 8000
```

The backend will be running at **http://localhost:8000**
Interactive API docs at **http://localhost:8000/docs**

> **Note:** The SQLite database (`test.db`) is auto-created on first startup. No manual DB setup needed.

### 3. Frontend Setup (Next.js)

In a **new terminal**:

```bash
cd frontend
npm install
npm run dev
```

The frontend will be running at **http://localhost:3000**

### 4. Open the App

Visit **http://localhost:3000** in your browser. Both servers must be running simultaneously.

---

## API Reference

All endpoints are prefixed at `http://localhost:8000`. Full interactive docs at `/docs`.

### Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check → `{"status": "ok"}` |

### Courses

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/courses` | List all courses (with nested assessments) |
| `POST` | `/courses` | Create course — body: `{name, target_grade}` |
| `GET` | `/courses/:id` | Get single course with assessments |
| `PUT` | `/courses/:id` | Update course name or target grade |
| `DELETE` | `/courses/:id` | Delete course and all related data |

### Assessments

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/courses/:id/assessments` | Add assessment — body: `{name, weight, current_score?, due_date?}` |
| `PUT` | `/assessments/:id` | Update assessment |
| `DELETE` | `/assessments/:id` | Delete assessment |

> **Weight validation:** Total weights per course cannot exceed 1.0 (100%).

### Analysis

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/courses/:id/analyze` | Feasibility analysis — body: `{current_scores: {name: score}}` |
| `POST` | `/courses/:id/simulate` | What-if simulation — body: `{hypothetical_scores: {name: score}}` |

**Analyze response** includes: `required_score`, `is_achievable`, `current_average`, `target_grade`, `risk_ranges` (minimum/safe/stretch), `completed_assessments`.

**Simulate response** includes: `projected_final_grade`, `breakdown` (per-assessment), `status` ("above" / "on_track" / "below").

---

## Frontend Components

### Landing Page (`/`)
- **Navbar** — Sticky blur header with gradient logo and CTA button
- **Hero** — Animated glow orbs, gradient heading, shimmer call-to-action
- **How It Works** — 3-step glass cards with numbered badges
- **Features Grid** — 6-item bento layout (feasibility, simulator, GPA, rules, recovery, insights)
- **CTA Section** — Final conversion section with gradient border
- **Footer** — Minimal dark footer

### Dashboard (`/dashboard`)
- **Sidebar** — Course list with create/delete, gradient badges, animated transitions
- **Tab Bar** — 4 glassmorphism tabs: Setup · Feasibility · What-If · GPA
- **Course Setup** — Assessment CRUD with weight badges, score inputs, progress bar, add form
- **Feasibility Analysis** — Required score display, achievability status (6 states), risk ranges, progress visualization
- **What-If Simulator** — Score sliders per assessment, SVG circular progress ring, projected grade, scenario save/load
- **GPA Converter** — Convert between Percentage ↔ 4.0 ↔ 9.0 ↔ 10.0 ↔ Letter grades

---

## Database Schema

```sql
users
├── id          INTEGER PRIMARY KEY
├── email       VARCHAR UNIQUE
├── name        VARCHAR
└── created_at  DATETIME

courses
├── id           INTEGER PRIMARY KEY
├── user_id      INTEGER FK → users.id (nullable)
├── name         VARCHAR
├── target_grade FLOAT
├── created_at   DATETIME
└── updated_at   DATETIME

assessments
├── id            INTEGER PRIMARY KEY
├── course_id     INTEGER FK → courses.id (CASCADE)
├── name          VARCHAR
├── weight        FLOAT        -- 0.0 to 1.0 (e.g., 0.3 = 30%)
├── current_score FLOAT NULL   -- null if not yet graded
├── due_date      DATETIME NULL
└── created_at    DATETIME

scenarios
├── id                    INTEGER PRIMARY KEY
├── course_id             INTEGER FK → courses.id (CASCADE)
├── name                  VARCHAR NULL
├── test_input            JSON     -- hypothetical scores map
├── projected_final_grade FLOAT
└── created_at            DATETIME
```

---

## Design System

| Token | Value | Usage |
|---|---|---|
| `--background` | `228 33% 4%` | Page background (near-black) |
| `--foreground` | `210 40% 98%` | Primary text (off-white) |
| `--primary` | `217 91% 60%` | Buttons, links, active states (blue) |
| `--accent` | `250 80% 65%` | Secondary highlights (violet) |
| `--card` | `222 20% 8%` | Card surfaces |
| `--border` | `220 13% 18%` | Borders and dividers |
| `--destructive` | `0 84% 60%` | Delete actions (red) |
| `--success` | `142 71% 45%` | Success states (green) |

**Effects:** Glassmorphism (backdrop-blur + translucent bg), glow utilities (blue/violet/success), shimmer animation, gradient text, noise texture overlay.

**Typography:** Geist Sans (body) + Geist Mono (code/numbers).

---

## Available Scripts

### Frontend

```bash
npm run dev      # Start dev server (http://localhost:3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint check
```

### Backend

```bash
python3 -m uvicorn app.main:app --reload --port 8000   # Dev with hot reload
python3 -m uvicorn app.main:app --host 0.0.0.0          # Production
```

---

## Contributing

1. Create a feature branch from `main`
2. Make changes and verify both `npm run build` and backend startup succeed
3. Push your branch and open a Pull Request

Refer to `docs/` for detailed user stories and design specifications.
