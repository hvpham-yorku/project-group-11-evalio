from pathlib import Path

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.auth import router as auth_router
from app.routes.courses import router as courses_router
from app.routes.extraction import router as extraction_router

app = FastAPI(title="Evalio API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# register routes
app.include_router(auth_router)
app.include_router(courses_router)
app.include_router(extraction_router)

@app.get("/health")
def health():
    return {"status": "ok"}
