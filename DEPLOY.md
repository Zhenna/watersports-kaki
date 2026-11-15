# Deploying WaterSports Kaki: soft launch

**What goes live:** Right now (wind and lightning), Plan ahead (NEA forecast, AM and PM), and the "I'm interested" button, which still opens the early-access form.
**What the public sees:** the facts, with a pill saying "Awaiting instructor review". No suitability statements until the wind ranges are reviewed.

| Piece | Address | Host |
|---|---|---|
| Landing page | `watersportskaki.sg` | Vercel (unchanged) |
| App (static files in `frontend/`) | `app.watersportskaki.sg` | A static host (see step 5) |
| API (`backend/`) | `api.watersportskaki.sg` | Render, Starter instance, Singapore region |

Link the landing page to the app. **Do not embed it in an iframe.** Google sign-in does not work inside a frame, and room share links must be real addresses people can send.

## Before you start

- [ ] Tests pass: `python -m unittest discover -s tests` in `backend/`, and `npm test` in `frontend/`.
- [ ] `backend/requirements.txt` lists what the code imports. Check:
  ```bash
  cd ~/my_code/watersports-kaki/backend
  grep -i -E "fastapi|uvicorn|sqlalchemy|psycopg2|httpx|alembic|pydantic" requirements.txt
  ```
  You need all of these (psycopg2 as `psycopg2-binary`). If one is missing, add it before you go on.
- [ ] Everything is committed and pushed to GitHub.
- [ ] You know your Python version (`python --version`), for step 1.

## 1. The API on Render

New, then Web Service, then connect the GitHub repo.

| Setting | Value |
|---|---|
| Region | Singapore |
| Branch | `main` |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Instance type | Starter (about $7 a month, always on) |
| Health Check Path | `/` |

**Environment variables** (copy the first three from your local `backend/.env`):

| Name | Value |
|---|---|
| `DATABASE_URL` | The same Supabase connection string |
| `NEA_BASE_URL` | The same value as local |
| `ALLOWED_ORIGINS` | `https://app.watersportskaki.sg` only, in the same format as your local file |
| `PYTHON_VERSION` | Match your local version, for example `3.11.9` |

**Never set `WSK_SHOW_PRIVATE_SPOTS` on Render.** It would show unreviewed guidance to the public.

## 2. Check the API on Render's own address

Render gives you an `https://<name>.onrender.com` address. Replace `API` below with it.

```bash
API=https://<name>.onrender.com
curl -s $API/                                                  # {"status":"ok",...}
curl -s "$API/api/catalog/spots?activity=windsurf"             # {"spots":[]} until step 3
```

## 3. The "go public" switch

East Coast is hidden until this migration runs. **The development and production servers share one database**, so running it here takes effect for the live API too. Run it when you are ready:

```bash
cd ~/my_code/watersports-kaki/backend
alembic upgrade head          # applies d9a4e6f1b283
```

Then check, and confirm the guidance is hidden:

```bash
curl -s "$API/api/catalog/spots?activity=windsurf"
curl -s "$API/api/spots/east-coast-parkway-carpark-e5/conditions?activity=windsurf&level=beginner" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['guidance']['status'])"
```

The last line must print `not_published`. **If it prints anything else, the private-spots flag is on. Fix that before going further.**

To hide the spot again: `alembic downgrade -1`.

## 4. DNS for the API

In Render, open the service, then Settings, then Custom Domains, and add `api.watersportskaki.sg`. Render shows a CNAME record to create. Add it where your domain's DNS is managed (Vercel, if your nameservers point there). Render checks it and issues the HTTPS certificate. Then:

```bash
curl -s https://api.watersportskaki.sg/
```

## 5. The app's static files

The `frontend/` folder is plain files with no build step. On Vercel, add a second project from the same repo:

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Framework Preset | Other |
| Build Command | leave empty |

Add the domain `app.watersportskaki.sg`, then the DNS record Vercel shows you.

**Check the plan terms before relying on Vercel's free Hobby plan.** It has been described as non-commercial. Cloudflare Pages is a free alternative for static files, and its terms also need checking.

## 6. Check the CORS setting

```bash
curl -s -i -H "Origin: https://app.watersportskaki.sg" https://api.watersportskaki.sg/api/catalog/activities \
  | grep -i "access-control-allow-origin"
```

You should see your app address. If not, `ALLOWED_ORIGINS` is wrong on Render.

## 7. Try it on your phone

Open `https://app.watersportskaki.sg` on mobile data. Check:
- [ ] The wind and lightning panels load, and the wind pill says "Awaiting instructor review".
- [ ] Plan ahead shows dots on the days that have a forecast, and a thunder notice when there is one.
- [ ] "I'm interested" opens the form, and the Privacy link opens your privacy page.

## 8. Link it from the landing page

After the app works, add a button on the landing page, for example:

```html
<a href="https://app.watersportskaki.sg" class="btn-cta">Check conditions now</a>
```

## 9. Right after launch

- **Start the weather logger.** Weather history cannot be recovered afterwards, so every day without it is lost.
- **Watch the first week.** Check Render's logs and the `feed_fetch_log` table in Supabase for failing feeds.
- **Supabase free projects pause after a week of inactivity.** A quiet week could take the API down. Move to Pro when real people use the app.

## If something goes wrong

| Symptom | Likely cause |
|---|---|
| The page shows "Couldn't reach the conditions service" | The API is down or `ALLOWED_ORIGINS` is wrong |
| "No locations are available for this sport yet" | The step 3 migration has not been applied |
| The first load takes about a minute | The API instance is asleep (only on the free plan, not Starter) |
| Guidance shows when it should be hidden | `WSK_SHOW_PRIVATE_SPOTS` is set on Render. Remove it |
| A feed shows as unavailable | Check `feed_fetch_log` for the error |

## Costs

About $7 a month for the API, plus the domain. The database, the static hosting and sign-in are free at this size. This changes once you outgrow the Supabase free plan.
