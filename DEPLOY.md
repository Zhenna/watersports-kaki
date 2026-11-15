# Deploying WaterSports Kaki: soft launch

**What goes live:** Right now (wind and lightning), Plan ahead (NEA forecast, AM and PM), and the "I'm interested" button, which still opens the early-access form.
**What the public sees:** the facts, with a pill saying "Awaiting instructor review". No suitability statements until the wind ranges are reviewed.

| Piece | Address | Host |
|---|---|---|
| Landing page | `www.watersportskaki.sg` (the bare `.sg` redirects to it) | Vercel (unchanged) |
| App (static files from `frontend/`) | `www.watersportskaki.sg/app/`, inside the landing project | Vercel, the same project as the landing page |
| API (`backend/`) | `api.watersportskaki.sg` | Render, Starter instance, Singapore region |

One website serves both. The landing page's hero button links to `/app/`. **Do not embed the app in an iframe.** Google sign-in does not work inside a frame, and room share links must be real addresses people can send.

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
| `ALLOWED_ORIGINS` | `["https://www.watersportskaki.sg"]` only, in the same format as your local file |
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

## 5. Put the app inside the landing project

No second Vercel project and no extra DNS record. The app's files are copied into the landing repo, in an `app/` folder, and Vercel publishes them with the landing page.

```bash
cd ~/my_code/watersports-kaki
bash scripts/sync_app.sh                  # copies 8 files into ~/my_code/wsk-landing/app/
cd ~/my_code/wsk-landing
git status --short                        # the new app/ folder and the updated index.html
git add app index.html
git commit -m "feat: windsurfing pilot app at /app, hero button leads to it"
git push
```

Vercel deploys on its own. Then `https://www.watersportskaki.sg/app/` shows the app.

**Whenever the app changes, repeat the copy and push.** The `frontend/` folder in the watersports-kaki repo stays the source of truth. The copy in the landing repo is generated, so never edit it by hand.

## 6. Check the CORS setting

```bash
curl -s -i -H "Origin: https://www.watersportskaki.sg" https://api.watersportskaki.sg/api/catalog/activities \
  | grep -i "access-control-allow-origin"
```

You should see `https://www.watersportskaki.sg`. If not, `ALLOWED_ORIGINS` is wrong on Render. After you change it there, the service restarts for about a minute.

## 7. Try it on your phone

Open `https://www.watersportskaki.sg` on mobile data, tap the hero button, and check the app at `/app/`:
- [ ] The wind and lightning panels load, and the wind pill says "Awaiting instructor review".
- [ ] Plan ahead shows dots on the days that have a forecast, and a thunder notice when there is one.
- [ ] "I'm interested" opens the form, and the Privacy link opens your privacy page.

## 8. The landing page button

Already done in the landing `index.html`: the hero button now reads "Check windsurfing conditions" and links to `/app/`. Under it, a note says this is a pilot for windsurfing at East Coast, with a small link to the form for asking for another sport. The other form links further down the page are unchanged.

## 9. Right after launch

- **Start the weather logger.** Weather history cannot be recovered afterwards, so every day without it is lost.
- **Watch the first week.** Check Render's logs and the `feed_fetch_log` table in Supabase for failing feeds.
- **Supabase free projects pause after a week of inactivity.** A quiet week could take the API down. Move to Pro when real people use the app.

## 10. Provisional guidance: make the page usable before the review

By default the public sees the facts only. Two separate switches change that. Both are off until you act, and either can be undone.

1. **Push the new backend code.** Render deploys it. Nothing changes yet: the guidance still reads `not_published`.
2. **Apply the migration** that adds provisional East Coast shore sectors (`f2c8d51e7b94`):
   ```bash
   cd ~/my_code/watersports-kaki/backend
   alembic heads                 # expect f2c8d51e7b94
   alembic upgrade head
   ```
   On its own this changes nothing publicly, because the live site loads only reviewed sectors unless the second switch is on.
3. **Turn on provisional guidance.** In Render, open `wsk-api`, then **Environment**, add `WSK_PROVISIONAL_GUIDANCE` with the value `1`, and choose **Save and deploy**.
4. **Check it:**
   ```bash
   curl -s "https://api.watersportskaki.sg/api/spots/east-coast-parkway-carpark-e5/conditions?activity=windsurf&level=beginner" \
     | python3 -c "import sys,json; d=json.load(sys.stdin)['guidance']; print(d['status'], d['wind_status'], d['review_status'])"
   ```
   The first word must **not** be `not_published`, and the last must be `unreviewed`. The page then says "provisional" wherever it shows a range.

**To turn it off:** delete `WSK_PROVISIONAL_GUIDANCE` in Render and deploy. The page goes back to facts only. To remove the sectors as well: `alembic downgrade -1`.

**Never set `WSK_SHOW_PRIVATE_SPOTS` on Render.** It is a different switch: it also reveals private spots.

**What the public sees while this is on:** the headline (for example "Light air"), a status such as "Below provisional range", a limits line that says "Ranges provisional", and direction notes from the provisional sectors. The offshore note for beginners says "Independent practice is not recommended under this scenario." That is the strongest sentence the page says, and it rests on provisional sectors.

**To end the provisional label,** a qualified reviewer signs the review pack, and the agreed values are loaded with the reviewer's name and the date.

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
