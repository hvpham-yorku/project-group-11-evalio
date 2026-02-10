# Evalio

EECS 2311 – Group 11  
Winter 2026

Evalio is a student-focused application that helps users understand course grading structures and evaluate whether their target grades are achievable. Upload your course syllabus, and we'll extract the grading rules, calculate required scores, and simulate different scenarios.

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ (for frontend)
- **Python** 3.13+ (for backend)
- **npm** or **yarn** (for frontend dependency management)
- **Git** (for cloning the repository)

### Installation & Setup

#### 1. Clone the Repository

```bash
git clone <repository-url>
cd project-group-11-evalio
```

#### 2. Frontend Setup (Next.js + React)

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on **http://localhost:3000**

#### 3. Backend Setup (FastAPI)

In a new terminal:

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The backend API will start on **http://localhost:8000**  
API docs available at **http://localhost:8000/docs**

## 📋 Current Implementation

### ✅ Completed Features

**Frontend:**
- Landing page with 3-step process overview
- Dashboard with tab-based navigation
- **Course Extraction** (User Story 1) – Upload and preview extracted assessments
- **Feasibility Analysis** (User Stories 3 & 6) – Calculate required scores and risk ranges
- **What-If Simulator** (User Story 5) – Interactive slider to test grade scenarios
- Dark theme with glass morphism design (blue/cyan palette)
- Responsive layout (mobile, tablet, desktop)

**Backend:**
- FastAPI server with CORS enabled
- Health check endpoint (`/health`)
- Course routes stub (`GET/POST /courses`)

### 🔄 In Progress

- API endpoint integration (connecting UI to backend data)
- Database models (SQLAlchemy + PostgreSQL)
- User Story 2 (Rule Modeling editor)
- User Story 4 (Minimum Requirements calculator as standalone view)

### ⏳ Planned Features

- GPA converter (multiple scales)
- Google Calendar integration for deadline export
- OCR document parsing for automatic deadline extraction
- Learning technique recommendations
- Authentication (Auth0 integration)
- Multi-course management
- Data persistence

## 📁 Project Structure

```
project-group-11-evalio/
├── frontend/                          # Next.js 15 + React 18 + TypeScript
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx              # Landing page
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx          # Dashboard main page
│   │   │   ├── layout.tsx            # Root layout with providers
│   │   │   ├── providers.tsx         # TanStack Query setup
│   │   │   └── globals.css           # Design tokens & utilities
│   │   └── components/
│   │       ├── landing/              # Landing page components
│   │       │   ├── index.tsx         # Main landing component
│   │       │   └── navbar.tsx        # Navigation header
│   │       └── dashboard/            # Dashboard feature components
│   │           ├── index.tsx         # Dashboard orchestrator
│   │           ├── sidebar.tsx       # Left navigation
│   │           ├── course-extraction.tsx
│   │           ├── feasibility.tsx
│   │           └── simulator.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── tailwind.config.ts
│
└── backend/                           # FastAPI + Python
    ├── app/
    │   ├── main.py                   # FastAPI app entry point
    │   └── __init__.py
    ├── requirements.txt              # Python dependencies
    └── .gitignore
```

## 🛠 Tech Stack

**Frontend:**
- Next.js 15.5+ (React 18.2)
- TypeScript 5.3
- Tailwind CSS 3.4
- Framer Motion 10.16 (animations)
- TanStack Query 5.28 (data fetching)
- Lucide React 0.395 (icons)

**Backend:**
- FastAPI 0.112
- Uvicorn 0.30
- Pydantic 2.8
- SQLAlchemy 2.0
- PostgreSQL (via psycopg 3.2)

## 🎨 Design System

- **Color Palette:** Slate-950 base with cyan (06b6d4) & blue (0ea5e9) accents
- **Effects:** Glass morphism with backdrop-blur
- **Typography:** Bold, clean sans-serif headers
- **Animations:** Smooth transitions with Framer Motion

## 📝 Available Scripts

**Frontend:**
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

**Backend:**
```bash
uvicorn app.main:app --reload          # Development with auto-reload
uvicorn app.main:app --host 0.0.0.0    # Production
```

## 🔗 API Endpoints (Current)

- `GET /health` – Health check
- `GET /courses` – List courses (stub)
- `POST /courses` – Create course (stub)
- `GET /docs` – Swagger UI documentation

## 📧 Questions?

Refer to `docs/` folder for detailed user stories and design specifications.
