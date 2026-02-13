# Evalio Backend

FastAPI-based backend for Evalio course grading rules and simulation.

## Setup

1. Create virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

## API Endpoints

- `GET /health` - Health check
- `GET /courses` - List all courses
- `POST /courses` - Create a new course

## Database (Coming Soon)

SQLAlchemy models and PostgreSQL integration.

## Architecture Sketch (ITR1)

![ITR1 Architecture Sketch](docs/architecture/itr1-architecture.png)
