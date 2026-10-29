# WaterSports Kaki (WSK)

Get on the water. Find your kakis.

WSK is a watersports participation marketplace for Singapore. It turns conditions,
availability and user intent into real sessions with the right people and operators.

Landing page: [watersportskaki.sg](https://watersportskaki.sg) (separate repo: `watersports-kaki-landing`)

## Model

Free consumer app captures intent and live conditions. WSK aggregates anonymised
demand. A verified operator hosts the session and takes payment. WSK earns a
referral fee or commission on attended bookings, never on impressions.

Full thinking: [docs/business_model.md](docs/business_model.md)
Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

North-star metric: watersports sessions completed through WSK.

## Stack

FastAPI, SQLAlchemy, Alembic, Supabase Postgres (Singapore). Live wind data from the
NEA v2 real-time API on data.gov.sg.

## Schema (9 tables)

| Table | Purpose |
|---|---|
| `users` | Accounts, sport and level |
| `spots` | Singapore watersports locations |
| `checkins` | On-water check-ins (three-tier privacy) |
| `intents` | Sport, level, time slot, spot: the demand signal |
| `operators` | Businesses that fulfil sessions, with fee model |
| `activity_sessions` | Group sessions, community or operator-hosted |
| `session_members` | Booking, verification and attendance per user |
| `water_profiles` | Water Days, Sports Unlocked, Kakis Met |
| `milestones` | Profile milestones |

## Principles

- Operators only ever see aggregate counts. Individual details are shared only when a
  user opts in to book.
- Race and ethnicity are never matching signals.
- No payment processing in the MVP. The operator takes payment directly.
- Operators host and carry liability. WSK convenes demand.

## Local setup

```bash
conda activate watersports
cd backend
cp .env.example .env   # set DATABASE_URL (Supabase transaction pooler, port 6543)
alembic upgrade head
uvicorn main:app --reload
```

Special characters in the DB password must be percent-encoded in `DATABASE_URL`.

## Next milestone

Turn about 20 expressions of intent into one paid, attended operator-hosted session.
