from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.courses import router as courses_router

app = FastAPI(title="Evalio API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# register routes
app.include_router(courses_router)

@app.get("/health")
def health():
    return {"status": "ok"}
