import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.auth import router as auth_router
from app.routes.courses import router as courses_router
from app.routes.extraction import router as extraction_router
from app.routes.gpa import router as gpa_router
from app.routes.dashboard import router as dashboard_router
from app.routes.deadlines import router as deadlines_router
from app.routes.scenarios import router as scenarios_router

app = FastAPI(title="Evalio API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3003",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# register routes
app.include_router(auth_router)
app.include_router(courses_router)
app.include_router(extraction_router)
app.include_router(gpa_router)
app.include_router(dashboard_router)
app.include_router(deadlines_router)
app.include_router(scenarios_router)

_persistence_mode = (
    "postgres" if os.getenv("USE_POSTGRES", "").strip().lower() in {"1", "true", "yes", "on"} else "in-memory"
)
print(f"[evalio] persistence_mode={_persistence_mode}", flush=True)

@app.get("/health")
def health():
    return {"status": "ok"}
