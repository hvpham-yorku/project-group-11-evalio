# Evalio

**EECS 2311 – Group 11**

A grade planning app for students. Upload your syllabus, track assessments, analyze if your target grade is achievable.

---

## How to Run

### Step 1: Clone the repo
```bash
git clone https://github.com/hvpham-yorku/project-group-11-evalio.git
cd project-group-11-evalio
```

### Step 2: Start Backend (Terminal 1)
```bash
cd backend
pip3 install -r requirements.txt
python3 -m uvicorn app.main:app --reload --port 8000
```
> On macOS, you may need: `pip3 install -r requirements.txt --break-system-packages`

Backend runs at: **http://localhost:8000**

### Step 3: Start Frontend (Terminal 2)
```bash
cd frontend
npm install
npm run dev
```
Frontend runs at: **http://localhost:3000**

### Step 4: Open Browser
Go to **http://localhost:3000** (both servers must be running)

---

## Database

We use **SQLite** - a simple file-based database. **No setup required!**

- The database file `test.db` is auto-created when you first start the backend
- All data is stored locally in `backend/test.db`
- To reset the database, just delete `test.db` and restart the backend

If you want to switch to MySQL/PostgreSQL later, edit `backend/app/config.py`.

---

## What's Working ✅

- Landing page with light theme
- Dashboard with course management
- Add/edit/delete courses and assessments
- Feasibility analysis (calculates required scores)
- What-if simulator (slide scores to see projected grade)
- GPA converter (percentage ↔ 4.0 ↔ 9.0 ↔ letter)
- Upload syllabus UI (6-step wizard)

## What Needs Work 🔧

| Problem | Where to Fix |
|---------|--------------|
| **Syllabus parsing is broken** - extracts random text instead of real assessments | `backend/app/utils.py` → `parse_syllabus_text()` |
| **AI parsing needs API key** - Gemini integration exists but untested | `backend/app/ai.py` |
| **No user login** - users table exists but no auth | `backend/app/models.py`, need new routes |
| **Mobile UI** - looks okay but needs polish | Frontend components |
| **No tests** - need unit tests | Create `tests/` folders |

---

## Project Structure (Key Files)

```
backend/
  app/
    main.py      ← API endpoints (add new features here)
    utils.py     ← Business logic (FIX PARSING HERE)
    ai.py        ← Gemini AI parsing (needs work)
    models.py    ← Database tables
    config.py    ← Database connection

frontend/
  src/
    app/
      page.tsx           ← Landing page
      upload/page.tsx    ← Upload wizard (needs work)
      dashboard/page.tsx ← Main dashboard
      globals.css        ← Colors/theme (modify here)
    components/
      dashboard/         ← Dashboard UI components
      landing/           ← Landing page components
    lib/api/
      client.ts          ← API calls to backend
```

---

## API Endpoints

| Method | URL | What it does |
|--------|-----|--------------|
| GET | `/health` | Check if backend is running |
| GET | `/courses` | Get all courses |
| POST | `/courses` | Create a course |
| DELETE | `/courses/:id` | Delete a course |
| POST | `/courses/:id/assessments` | Add an assessment |
| POST | `/courses/:id/analyze` | Run feasibility analysis |
| POST | `/courses/:id/simulate` | Run what-if simulation |
| POST | `/upload-syllabus` | Upload and parse syllabus |
| POST | `/gpa/convert` | Convert GPA scales |

API docs with test UI: **http://localhost:8000/docs**

---

## How to Contribute

1. Pull latest: `git pull origin main`
2. Create branch: `git checkout -b feature/your-feature`
3. Make changes
4. Test: `npm run build` (frontend) and check backend starts
5. Push: `git push origin feature/your-feature`
6. Create Pull Request on GitHub

### Priority Tasks
1. 🔴 **Fix syllabus parsing** in `backend/app/utils.py`
2. 🟡 **Test AI parsing** with Gemini API key
3. 🟢 **Add user authentication**
4. 🟢 **Write tests**

---

## Tech Stack

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS
- **Backend:** Python, FastAPI, SQLAlchemy
- **Database:** SQLite (can switch to MySQL/PostgreSQL)

---

## Team

EECS 2311 - Group 11 - York University

Feel free to modify any part of the code!
