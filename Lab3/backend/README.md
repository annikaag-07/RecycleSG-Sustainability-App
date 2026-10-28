
# RecycleSG Backend

Backend for the SC2006 RecycleSG project.

## Technology
- Supabase
- PostgreSQL
- Supabase Authentication
- Supabase Storage
- FastAPI CV integration (see [CV setup](../CV/README.md))

## Responsibilities
- User authentication and profiles
- Recycling point management
- Location-based search
- GPS check-in verification
- Eco Points and XP
- Database security

## Development
API contracts are maintained in [API_ENDPOINTS.md](../../API_ENDPOINTS.md).
See [tests](../../docs/demo/TESTING.md) and [hosted migration mapping](../../docs/demo/LIVE_SETUP.md).

## Local Supabase Setup

Run these commands from the `Lab3/backend` directory.

### 1. Start Supabase

```bash
supabase start
```

### 2. Generate Recycling Seed Data

```bash
python3 scripts/build_seed_sql.py
```

This generates `supabase/seed.sql` from the committed
`data/recycling_points.csv`.

### 3. Initialise Local Database

```bash
supabase db reset
```

For a fresh **local** development database only: reset deletes existing local data.
Do not use this workflow to reset the shared hosted project. This creates:

- 12,300 recycling locations
- 49,200 recycling point/material associations
- All backend tables, functions, and security policies

### 4. Open Supabase Studio

http://127.0.0.1:54323

### Important

- Never commit Supabase service-role or secret API keys.
- The generated `supabase/seed.sql` is intentionally ignored by Git.
- Run the seed-generation script before resetting the database.

The CSV seed inserts are not idempotent. Generate once for each fresh local reset;
do not apply it repeatedly to an existing populated database.
