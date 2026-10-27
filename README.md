# Watersports Kaki 🌊

> Check conditions. Find your people.

🌐 [watersportskaki.sg](https://watersportskaki.sg)

**Watersports Kaki (WSK)** is a Singapore-focused weather-aware activity coordination platform for watersports enthusiasts — windsurfers, wakeboarders, wakesurfers, kayakers, SUP paddlers, and divers. It combines real-time NEA weather data, GPS-verified community credibility, algorithmic group matching, and a private dating layer into one consumer app.

---

## Product vision

**Conditions → Discovery → Intent → Matching → Group → Experience → Repeat**

WSK helps people:
1. Decide what activity is suitable given real-time conditions
2. Express low-commitment interest ("I'm interested")
3. Find compatible people to do it with
4. Discover and reuse proven experiences
5. Optionally form romantic connections after meeting naturally
6. Connect aggregated demand with businesses that can fulfil it

---

## What it does

### Conditions checker
- Real-time wind speed, wind direction, temperature, and humidity from NEA APIs
- Sport-specific and level-specific verdicts — "good for beginner windsurfers", "too strong for you"
- Lightning alerts from MSS Lightning Detection System — updated every 2 minutes
- Weather radar imagery for incoming rain bands
- Spot-level readings for coastal stations (East Coast, Changi, Sembawang, Marina Barrage)

### GPS check-in and credibility
- GPS-verified check-ins at known Singapore watersports spots
- Per-sport check-in counts as credibility signal
- Three-tier visibility:
  - Public → check-in count + sport only
  - Mutual follow → adds spot name + "weekday" or "weekend"
  - Mutual follow + opt-in → adds exact date (never hours)
- GPS coordinates never exposed regardless of any setting

### Low-commitment intent
- Users tap "I'm interested" without booking or committing
- Optional constraints: date window, time slot, budget, spot preference, group composition preference
- Feeds demand aggregation engine and group matching algorithm
- "Do This Again" on past experiences generates new intent

### Algorithmic group matching
- Opt-in — users select which sports to be matched for
- Algorithm groups 3–6 compatible users per sport
- Small cohort: matches on sport + level + spot + time slot
- Large cohort: adds gender preference and age group as tiebreakers
- Group description auto-generated from matched dimensions
- Groups expire in 24 hours if no message — become permanent once chat starts
- Free tier: max 2 group formations per week, 1 active group per sport
- Paid tiers: higher formation limits

### Session coordination
- Shared availability calendar inside each group chat
- Any member can confirm a session slot
- Multiple sessions can be confirmed per group
- System messages guide the flow — availability prompt, session confirmed, review link

### Mutual follow and connections
- Tap follow on any profile — mutual follow unlocks richer check-in visibility
- Avoid flag on connections — avoided pairs are never placed in the same group
- Avoid is silent — the avoided person is never notified
- Contact sharing always explicit and voluntary — field by field, after mutual follow

### Experience library
- Past sessions become reusable Experience pages — not dead listings
- Experience (template) vs Occurrence (specific run) — separated cleanly
- Each Experience accumulates reviews, photos, participant count, price history
- "Do This Again" generates new intent → new demand → new occurrence

### Private dating layer — "Meet first. Match after."
- Optional module inside the same app — not a separate product
- Hard rule: nobody knows who is open to dating until there is a mutual match
- Users privately opt in before a session
- After the session, opted-in users can privately indicate romantic interest
- One-sided interest is permanently private — never revealed
- Mutual match only revealed when A likes B AND B likes A
- Free tier: ~3 mutual match unlocks
- Dating+: unlimited matches, proactive alerts, better compatibility

### User portal dashboard
- Platform pulse — total active users, activities this week, new groups, mutual matches
- Per-sport personalised stats — interested count, participant count, same level, same spots, age group
- Cross-sport discovery panel — "8 people matching your criteria are active in diving at Lazarus Island"
- Dating signals — private, only visible to the user, never below count of 5 to prevent identification
- Drives organic adoption of new sports through social and romantic signals

### Coach profiles (paid — private coaches)
- Individual coaches verified by certification upload (PADI, IWS, RYA, etc.)
- "Cert uploaded" badge immediately, "Verified" badge after manual review
- Discoverable by sport and level
- Photo + video uploads (100MB cap per video)
- Reviews tied to confirmed sessions — timestamped, group-verified, no anonymous reviews
- Paid tier unlocks when sport category crosses demand threshold (default: 500 active users)

### Business profiles (paid — operators)
- Companies: cable parks, diving schools, rental shops, event organisers
- Verified by UEN lookup against ACRA public registry — instant "Registered Business" badge
- Offer listing — businesses post packages, users choose to respond
- Business web portal — demand intelligence dashboard
- Paid tier unlocks when sport category crosses demand threshold (default: 1,000 active users)

### Business web portal
- Indicated interest count vs active participant count — two distinct signals
- Spot breakdown, skill breakdown, time breakdown (tiered by subscription)
- Trend data — month-over-month growth per category
- Demand-based pricing — paid tiers only activate when category demand crosses threshold

---

## Privacy principles

**Check-in visibility** — three-tier ladder, never exposes GPS coordinates

**Dating privacy** — dating status, preferences, and one-sided interests are permanently private. No operator, other participant, or paid user can identify who is open to dating before a mutual match.

**Race** — WSK does not collect, store, or use race or ethnicity as a matching, filtering, or targeting signal anywhere in the platform.

**Contact details** — never auto-revealed. Always explicit opt-in, field by field, after mutual follow.

**Avoid** — silent to the avoided person. Affects group placement only, not contact visibility.

**Business data** — businesses see aggregated demand counts only. Never individual profiles, names, or contact details.

---

## User types and pricing

| Type | Paid trigger | What unlocks |
|---|---|---|
| User | Free always | Weather, intent, matching, ~3 dating matches |
| Dating+ | Individual subscription | Unlimited matches, proactive alerts, better compatibility |
| Private coach | Sport category ≥ 500 active users | Verified profile, student discovery, demand alerts |
| Business | Sport category ≥ 1,000 active users | Demand intelligence, offer listing, B2B partner matching |

Pricing thresholds are configurable constants — not hardcoded. Tighten as platform matures.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React Native (iOS + Android, Expo) |
| Backend | FastAPI (Python) |
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth (phone OTP) |
| File storage | Supabase Storage |
| Weather data | NEA APIs via data.gov.sg |
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

## Database schema — 20 tables

| Table | Purpose |
|---|---|
| `users` | Profiles, sports, levels, privacy settings, matching preferences |
| `spots` | Curated SG watersports locations with GPS boundaries |
| `checkins` | GPS-verified sessions — basis for all credibility signals |
| `connections` | Mutual follows + avoid flags |
| `contact_shares` | Explicit field-by-field contact sharing after mutual follow |
| `intents` | Low-commitment "I'm interested" signals with optional constraints |
| `groups` | Algorithmically matched cohorts |
| `group_members` | Group membership |
| `group_sessions` | Confirmed session slots within a group |
| `session_availability` | Each member's indicated date/time availability |
| `messages` | Group chat — user and system messages |
| `private_coach_profiles` | Individual coach profiles with cert verification |
| `business_profiles` | Business profiles with UEN verification |
| `coach_reviews` | Session-verified reviews linked to confirmed sessions |
| `dating_profiles` | Private dating opt-in and preferences |
| `dating_interests` | Private post-session romantic interest — never exposed |
| `mutual_matches` | Revealed only when both parties indicate interest |
| `experiences` | Reusable activity templates |
| `occurrences` | Specific runs of an experience |
| `activity_category_stats` | Demand threshold tracking per sport for pricing |
| `platform_stats` | Global weekly snapshot for user portal |
| `user_sport_stats` | Per-user per-sport aggregations for user portal |
| `user_dating_signals` | Private dating signals for cross-sport discovery |
| `business_demand_stats` | Aggregated demand intelligence for business portal |

---

## Key design decisions

**GPS-gated check-ins** — users can only check in within 300m of a known spot. No faking from a couch.

**Adaptive matching algorithm** — small cohort matches on sport + level + spot + time. Large cohort adds gender and age group as tiebreakers. Group description auto-generated from matched dimensions.

**Avoid flag** — stored on `connections` as `from_avoided` / `to_avoided`. Either direction True = never placed in same group. Algorithm checks both directions before every group formation.

**Group lifecycle** — forms with 3–6 compatible users → 24-hour expiry if no message (configurable via `GROUP_EXPIRY_HOURS`) → permanent on first message → session confirmed → completed → review link if coach present.

**Experience library** — past sessions become discovery assets. "Do This Again" generates new intent without creating a new event, feeding the demand aggregation engine.

**Demand-based pricing** — paid tiers only unlock when a sport category crosses a configurable active user threshold. Coaches and businesses never pay for a ghost town.

**Dating integrity** — review links only appear in group chats after a confirmed, completed session. Reviews tied to session with timestamp. No anonymous reviews possible.

**No race signals** — race and ethnicity are not collected, stored, or used anywhere in the platform.

---

## Project structure

```
watersports-kaki/
├── frontend/               # React Native app (Expo)
├── backend/
│   ├── api/routes/         # FastAPI route handlers
│   ├── models/             # SQLAlchemy DB models (20+ tables)
│   ├── schemas/            # Pydantic request/response schemas
│   ├── services/           # NEA API, verdict logic, GPS check-in, matching algorithm
│   ├── core/               # Config, database session, dependencies
│   └── alembic/            # DB migrations
├── docs/                   # Architecture notes
└── scripts/                # Seed data, dev tools
```

---

## Roadmap

- [x] v0.1 — Conditions checker (NEA API integration, sport + level verdicts)
- [x] v0.2 — Database schema — full 20-table model on Supabase
- [ ] v0.3 — Auth (Supabase phone OTP)
- [ ] v0.4 — GPS check-ins wired to DB
- [ ] v0.5 — User profiles and mutual follow
- [ ] v0.6 — Intent ("I'm interested") and demand aggregation
- [ ] v0.7 — Group matching algorithm
- [ ] v0.8 — Group chat and session coordination
- [ ] v0.9 — Experience library
- [ ] v0.10 — Coach profiles and reviews
- [ ] v0.11 — Dating layer
- [ ] v0.12 — Business portal and demand intelligence
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
EOF
echo "Done"