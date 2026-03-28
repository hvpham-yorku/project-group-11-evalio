# Evalio Frontend

Next.js App Router frontend for Evalio.

## Tech Stack

- Next.js 15 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- Radix UI primitives
- Framer Motion
- Lucide icons

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure env:

```bash
cp .env.local.example .env.local
```

`.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

3. Run dev server:

```bash
npm run dev
```

App URL: `http://localhost:3000`

## Current App Routes

- `/` landing page
- `/login` auth page
- `/setup/upload`
- `/setup/structure`
- `/setup/grades`
- `/setup/goals`
- `/setup/deadlines`
- `/setup/dashboard`
- `/setup/explore`
- `/setup/risk-center`
- `/setup/manage`
- `/setup/plan` (alternate route to the scenario explorer component)
- `/explore` (standalone scenario explorer wrapper)

## Setup Flow Behavior

- The setup flow is authenticated; unauthenticated users are redirected to `/login`.
- A shared setup context stores:
  - active `course_id` in localStorage
  - latest extraction result
  - institutional grading rules from the structure step
- If no active course is selected, the frontend falls back to the first course in API results.

## Extraction Integration

- Upload step sends multipart form data to `POST /extraction/outline`.
- Structure step lets users edit extracted assessments and confirm via `POST /extraction/confirm`.
- If extraction returns `structure_valid=false`, UI shows a fail-closed message and does not continue with extracted structure.

## Project Structure

```text
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── login/page.tsx
│   ├── setup/
│   │   ├── layout.tsx
│   │   ├── course-context.tsx
│   │   ├── upload/page.tsx
│   │   ├── structure/page.tsx
│   │   ├── grades/page.tsx
│   │   ├── goals/page.tsx
│   │   ├── deadlines/page.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── explore/page.tsx
│   │   └── plan/page.tsx
│   └── explore/page.tsx
├── components/
│   ├── landing/
│   └── setup/
└── lib/
    ├── api.ts
    └── errors.ts
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Notes / Limitations

- Upload input UI currently accepts `.pdf`, `.docx`, `.txt`, `.png`, `.jpg`, `.jpeg`.
- Deadlines page currently uses localStorage for pending/confirmed UI state while the backend also exposes deadline APIs.
- Dashboard "Overall GPA Snapshot" is an equal-weight course average, not a transcript-weighted cGPA, because course credits are not captured in setup.
- The GPA scale converter in the dashboard is a normalized point-scale comparison tool, not an official institutional conversion policy.
