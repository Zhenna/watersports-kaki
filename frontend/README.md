# WaterSports Kaki web app (frontend)

Plain HTML, CSS and JavaScript. No build step, no dependencies.

## Run locally

1. Start the API from `backend/`. Set `WSK_SHOW_PRIVATE_SPOTS=1` while spots are not public, or the
   location list will be empty.
2. From this folder: `python3 serve.py` (a development server that turns caching off, so you always see the latest files)
3. Open http://localhost:5173

The page must be served over http, not opened as a file, because it uses ES modules.

**CORS:** the API only answers browsers from origins in its `ALLOWED_ORIGINS` setting. Add
`http://localhost:5173` there. Test with:

    curl -i -H "Origin: http://localhost:5173" "http://127.0.0.1:8000/api/spots/<slug>/conditions?activity=windsurf&level=beginner"

and look for an `access-control-allow-origin` header in the response.

## Configure

Edit `config.js` (`API_BASE`, `INTEREST_URL`). Nothing else contains an address.

Sports and locations are not configured here. The page reads them from the API
(`/api/catalog/activities` and `/api/catalog/spots`), so adding a sport or a spot is a data change.
A sport appears only if `activities.config.conditions_enabled` is true, and a location only if it is
public and supports that sport.

## Test

`npm test` (Node 20 or later). It covers the pure logic in `lib.js`.

## Notes

- All text from the API is inserted with `textContent`, never `innerHTML`.
- The page does not cache conditions offline. Stale weather data is worse than none.
- Unknown statuses, failed feeds and unreachable APIs all show "unavailable", never a favourable result.
