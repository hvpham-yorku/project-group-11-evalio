# Evalio Backend

FastAPI-based backend for Evalio course grading rules and simulation.

## Prerequisites

- Python 3.12.12
- System OCR tools (required for PDF OCR fallback):
  - `tesseract`
  - `pdftoppm` (Poppler)

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

   Required pinned versions in `requirements.txt`:
   - `openai==1.46.0`
   - `httpx==0.27.2`

3. Create env file:
   ```bash
   cp .env.example .env
   ```

4. Run server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

Example `.env` contents:

```bash
AUTH_SECRET_KEY=change-this-in-real-env
AUTH_ALGORITHM=HS256
AUTH_ACCESS_TOKEN_EXPIRE_MINUTES=480
AUTH_COOKIE_NAME=evalio_access_token
AUTH_COOKIE_SECURE=false
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_SECONDS=20
```

## API Endpoints

- `GET /health` - Health check
- `POST /auth/register` - Register user with email/password
- `POST /auth/login` - Login and set HttpOnly JWT cookie
- `POST /auth/logout` - Clear auth cookie
- `GET /auth/me` - Return current authenticated user
- `GET /courses` - List current user's courses (auth required)
- `POST /courses` - Create course for current user (auth required)
- `PUT /courses/{course_id}/weights` - Update assessment weights (auth required)
- `PUT /courses/{course_id}/grades` - Update grades and standing (auth required)
- `POST /courses/{course_id}/target` - Evaluate target feasibility (auth required)
- `POST /courses/{course_id}/minimum-required` - Minimum needed on one assessment (auth required)
- `POST /courses/{course_id}/whatif` - Read-only what-if analysis (auth required)

`course_id` is a UUID returned by course creation/list endpoints.
JWT is stored only in an HttpOnly cookie.

## Database (Coming Soon)

SQLAlchemy models and PostgreSQL integration.
