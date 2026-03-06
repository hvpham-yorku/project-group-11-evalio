# Database Artifacts (Submission)

This folder is intentionally separate for EECS 2311 ITR2 submission review.

## Contents

- `schema/evalio_schema.sql`: SQL schema artifact used for submission.
- ER diagram: `docs/ER diagram/erdiagram_evalio.png`.

## Important Scope Note

- Runtime backend database code is in `backend/` (connection config, repositories, models, dependency wiring).
- This folder is for submission-facing artifacts only.

## Optional Local Use

If you want to apply the schema manually to a local Postgres database:

```bash
psql -d evalio -f database/schema/evalio_schema.sql
```
