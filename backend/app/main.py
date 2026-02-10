from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uuid

app = FastAPI(title="Evalio API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Course(BaseModel):
    id: str
    name: str
    code: Optional[str] = None

class CreateCourseRequest(BaseModel):
    name: str
    code: Optional[str] = None

# In-memory storage for demo
COURSES: List[Course] = []

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/courses", response_model=List[Course])
def list_courses():
    return COURSES

@app.post("/courses", response_model=Course)
def create_course(body: CreateCourseRequest):
    c = Course(id=str(uuid.uuid4()), name=body.name, code=body.code)
    COURSES.append(c)
    return c
