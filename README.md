# Watersports Kaki 🌊

> Check conditions. Find your people.

🌐 [watersportskaki.sg](https://watersportskaki.sg)

**Watersports Kaki** is a Singapore-focused community app for watersports enthusiasts — windsurfers, wakeboarders, wakesurfers, kayakers, and SUP paddlers. It combines real-time NEA weather and wind data with a GPS-verified community layer, so you always know if conditions are right and who else is out there.

---

## What it does

**Conditions checker**
- Real-time wind speed, wind direction, temperature, and humidity from NEA APIs
- Sport-specific and level-specific verdicts (e.g. "good for beginner windsurfers")
- Lightning alerts from MSS Lightning Detection System — updated every 2 minutes
- Weather radar imagery for incoming rain bands
- Spot-level readings for coastal stations (East Coast, Changi, Sembawang, Marina Barrage)

**Community layer**
- GPS-verified check-ins at known Singapore watersports spots
- User profiles showing sports, self-indicated skill level, and check-in history
- Activity calendar and per-sport check-in counts as credibility signals
- Discover other active watersports people by sport, level, and usual spots
- Mutual interest connection — tap to connect, both parties notified

**For businesses**
- Targeted ad inventory based on verified sport activity and spot history
- Reach real, active watersports people — not demographic guesses

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React Native (iOS + Android) |
| Backend | FastAPI (Python) |
| Database | PostgreSQL |
| Weather data | NEA APIs via data.gov.sg |
| Auth | JWT + phone number verification |
| Maps | Google Maps SDK |
| Hosting | TBD |

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

All data sourced from [data.gov.sg](https://data.gov.sg) under the Singapore Open Data Licence — free for personal and commercial use.

---

## Project structure

```
watersports-kaki/
├── frontend/          # React Native app
├── backend/           # FastAPI server
│   ├── api/           # Route handlers
│   ├── models/        # DB models
│   ├── services/      # NEA API integration, check-in logic
│   └── core/          # Config, auth, dependencies
├── docs/              # Design docs, API specs, wireframes
└── scripts/           # DB migrations, seed data, spot list
```

---

## Key concepts

**GPS-gated check-ins** — users can only check in when within 300m of a known watersports spot. This keeps activity data honest and builds genuine credibility.

**Per-sport credibility** — check-ins are tagged by sport. A profile showing 20 windsurf check-ins at East Coast tells other users something real about who they're connecting with.

**Spot registry** — a curated list of Singapore watersports locations with GPS boundaries, supported sports, and nearest NEA weather stations. Stored in the DB and maintainable without a redeploy.

**Ad targeting** — advertisers can target by verified sport, skill level, usual spots, and activity recency. No demographic assumptions — all signals come from actual check-in behaviour.

---

## Roadmap

- [ ] v0.1 — Conditions checker (NEA API integration, sport + level verdicts)
- [ ] v0.2 — User profiles and GPS check-ins
- [ ] v0.3 — Community discovery (browse by sport, level, spot)
- [ ] v0.4 — Mutual interest / connection flow
- [ ] v0.5 — Business ad slots and targeting logic
- [ ] v1.0 — Public launch

---

## Local development

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npx expo start
```

---

## Licence

Private — all rights reserved.

---

---

## Built by

Data scientist by day, watersports gremlin by weekend.
Follow the build journey on Instagram: [@lu.zhenna](https://www.instagram.com/lu.zhenna/)

*Built in Singapore, for Singapore's watersports community.*
