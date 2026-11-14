# WaterSports Kaki web app (frontend)

Plain HTML, CSS and JavaScript. No build step, no dependencies.

## Run locally

1. Start the API from `backend/`. Set `WSK_SHOW_PRIVATE_SPOTS=1` while the spot is not public.
2. From this folder: `python3 -m http.server 5173`
3. Open http://localhost:5173

The page must be served over http, not opened as a file, because it uses ES modules.

**CORS:** the API only answers browsers from origins in its `ALLOWED_ORIGINS` setting. Add
`http://localhost:5173` there. Test with:

    curl -i -H "Origin: http://localhost:5173" "http://127.0.0.1:8000/api/spots/<slug>/conditions?activity=windsurf&level=beginner"

and look for an `access-control-allow-origin` header in the response.

## Configure

Edit `config.js` (`API_BASE`, `SPOT_SLUG`, `ACTIVITY`). Nothing else contains an address.

## Test

`npm test` (Node 20 or later). It covers the pure logic in `lib.js`.

## Notes

- All text from the API is inserted with `textContent`, never `innerHTML`.
- The page does not cache conditions offline. Stale weather data is worse than none.
- Unknown statuses, failed feeds and unreachable APIs all show "unavailable", never a favourable result.
