# Watersports Kaki 🌊

> Check conditions. Find your people.

🌐 [watersportskaki.sg](https://watersportskaki.sg)

**Watersports Kaki** is a Singapore-focused community app for watersports enthusiasts — windsurfers, wakeboarders, wakesurfers, kayakers, SUP paddlers, and divers. It combines real-time NEA weather and wind data with a GPS-verified community layer and algorithmic group matching, so you always know if conditions are right and who else is out there.

---

## What it does

**Conditions checker**
- Real-time wind speed, wind direction, temperature, and humidity from NEA APIs
- Sport-specific and level-specific verdicts (e.g. "good for beginner windsurfers")
- Lightning alerts from MSS Lightning Detection System — updated every 2 minutes
- Weather radar imagery for incoming rain bands
- Spot-level readings for coastal stations (East Coast, Changi, Sembawang, Marina Barrage)

**GPS check-in and credibility**
- GPS-verified check-ins at known Singapore watersports spots
- Per-sport check-in counts as credibility signal
- Three-tier visibility: count + sport (public) → adds spot + weekday/weekend (mutual follow) → adds exact date (opt-in)
- Activity calendar on every profile

**Algorithmic group matching**
- Opt-in community matching — users select which sports to be matched for
- Algorithm groups 3–6 compatible users based on sport, level, preferred spots, time slots
- Small cohort: matches on sport + level + spot + time
- Large cohort: adds gender and age proximity as tiebreakers
- Group description auto-generated from matched dimensions
- Groups expire in 24 hours if no message sent — become permanent once chat starts
- Free tier: max 2 group formations per week, 1 active group per sport
- Paid (coach): higher group formation limits

**Session coordination**
- Shared availability calendar inside each group chat
- Any member can confirm a session slot
- Multiple sessions can be confirmed per group
- System messages guide the coordination flow

**Mutual follow and connections**
- Tap follow on any profile — mutual follow unlocks richer check-in visibility
- Avoid flag on connections — avoided pairs are never placed in the same group
- Avoid is silent — the avoided person is never notified
- Contact sharing is always explicit and voluntary, field by field

**Coach profiles (paid feature)**
- Verified coach profiles behind a paywall
- Discoverable by sport and level
- Photo uploads + video uploads (100MB cap per video)
- Reviews tied to confirmed sessions — timestamped, group-verified, no anonymous reviews

**For businesses**
- Targeted ad inventory based on verified sport activity and spot history
- Reach real, active watersports people — not demographic guesses

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React Native (iOS + Android) |
| Backend | FastAPI (Python) |
| Database | PostgreSQL (Supabase) |
| Weather data | NEA APIs via data.gov.sg |
| Auth | Supabase Auth (phone OTP) |
| File storage | Supabase Storage |
| Maps | Google Maps SDK |
| Deployment | Railway |

---

## Data sources

| Dataset | Provider | Update frequency |
|---|---|---|
| Wind speed | NEA / data.gov.sg | 1-minute intervals |
| Wind direction | NEA / data.gov.sg | 1-minute intervals |
| Air temperature | NEA / data.gov.sg | 1-minute intervals |
| Rainfall | NEA / data.gov.sg | 5-minute intervals |
| Lightning observation | NEA / MSS | 2-minute intervals |
| Weather radar imagery | NEA / data.gov.sg | 5–15 minutes |

All data sourced from [data.gov.sg](https://data.gov.sg) under the Singapore Open Data Licence.

---

## Database schema

11 tables:

| Table | Purpose |
|---|---|
| `users` | Profiles, sports, levels, privacy settings, matching preferences |
| `spots` | Curated SG watersports locations with GPS boundaries |
| `checkins` | GPS-verified sessions — basis for all credibility signals |
| `connections` | Mutual follows + avoid flags between users |
| `coach_profiles` | Paid coach profiles with media and certification |
| `groups` | Algorithmically matched cohorts |
| `group_members` | Group membership |
| `group_sessions` | Confirmed session slots within a group |
| `session_availability` | Each member's indicated date/time availability |
| `messages` | Group chat — user and system messages |
| `coach_reviews` | Session-verified reviews linked to confirmed sessions |

---

## Key concepts

**GPS-gated check-ins** — users can only check in within 300m of a known spot. Keeps activity data honest.

**Three-tier check-in visibility**
- Public: check-in count + sport only
- Mutual follow: adds spot name + "weekday" or "weekend"
- Mutual follow + opt-in: adds exact date (never hours)

**Algorithmic group matching** — adaptive complexity. Small cohort matches on sport + level + spot + time. Large cohort adds gender and age as tiebreakers. Group description is auto-generated from matched dimensions.

**Avoid flag** — stored on the `connections` table as `from_avoided` / `to_avoided`. Either direction True = never place in same group. Silent — avoided person never notified.

**Group lifecycle**
- Forms with 3–6 compatible users
- 24-hour expiry window if no message (configurable via `GROUP_EXPIRY_HOURS`)
- Becomes permanent on first message
- Session confirmed → status flips to upcoming → completed → triggers review link if coach present

**Coach review integrity** — review links only appear inside group chats after a session is confirmed and completed. Reviews are tied to a specific session with timestamp. No anonymous reviews.

**Ad targeting signals** — all derived from verified check-in behaviour: sport preference, skill level, usual spots, activity recency, frequency.

---

## Project structure

```
watersports-kaki/
├── frontend/          # React Native app (Expo)
├── backend/
│   ├── api/routes/    # FastAPI route handlers
│   ├── models/        # SQLAlchemy DB models (11 tables)
│   ├── schemas/       # Pydantic request/response schemas
│   ├── services/      # NEA API, verdict logic, GPS check-in, matching algorithm
│   ├── core/          # Config, database session, dependencies
│   └── alembic/       # DB migrations
├── docs/              # Architecture notes
└── scripts/           # Seed data (SG watersports spots)
```

---

## Roadmap

- [x] v0.1 — Conditions checker (NEA API integration, sport + level verdicts)
- [x] v0.2 — Database schema — all 11 tables migrated to Supabase
- [ ] v0.3 — Auth (Supabase phone OTP)
- [ ] v0.4 — GPS check-ins wired to DB
- [ ] v0.5 — User profiles and mutual follow
- [ ] v0.6 — Group matching algorithm
- [ ] v0.7 — Group chat and session coordination
- [ ] v0.8 — Coach profiles and reviews
- [ ] v0.9 — Community discovery feed
- [ ] v1.0 — Public launch

---

## Local development

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in Supabase credentials
alembic upgrade head   # run migrations
uvicorn main:app --reload

# Frontend (coming soon)
cd frontend
npm install
npx expo start
```

---

## Licence

Private — all rights reserved.

---

## Built by

Data scientist by day, watersports gremlin by weekend.
Follow the build journey on Instagram: [@lu.zhenna](https://www.instagram.com/lu.zhenna/)

*Built in Singapore, for Singapore's watersports community.*
