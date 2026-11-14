// Runs app.js against a minimal fake DOM to catch runtime errors in the render and error paths.
import { test } from "node:test";
import assert from "node:assert/strict";

class El {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.className = ""; this._text = "";
    this.hidden = false; this.value = ""; this.href = ""; this.target = ""; this.rel = "";
    this.listeners = {};
  }
  set textContent(t) { this._text = String(t); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...cs) { this.children = cs; this._text = ""; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
}

const ACTIVITIES = { activities: [{ slug: "windsurf", name: "Windsurfing" }] };
const SPOTS = { activity: "windsurf", spots: [
  { slug: "east-coast", name: "East Coast Parkway (Carpark E5)" },
  { slug: "marina", name: "Marina Barrage" },
] };

function payload({ strikes = 0, windSummary } = {}) {
  return {
    spot: { slug: "east-coast", name: "East Coast Parkway (Carpark E5)" },
    activity: "windsurf", level: "beginner", generated_at: "2026-11-04T20:38:50+08:00",
    observations: {
      wind: { kmh: 12, knots: 6.5, from_deg: 200, station: { station_id: "S1", station_name: "Near", distance_km: 1.2, selection: "mapped" },
              observed_at: "2026-11-04T20:34:00+08:00", age_min: 4, stale: false, note: null },
      gusts: null,
      lightning: { strikes_within_radius: strikes, nearest_km: strikes ? 9.1 : 44, radius_km: 20, lookback_min: 30,
                   fetched_at: "2026-11-04T20:38:50+08:00", age_min: 0, stale: false },
    },
    guidance: {
      status: strikes ? "flagged" : "within_reference_range",
      summary: "ignored when wind fields exist",
      wind_status: "within",
      wind_summary: windSummary ?? "Wind is 12.0 km/h (6.5 knots), within the WSK reference range of 8 to 20 km/h for beginner windsurf. This is not a safety clearance.",
      wind_reasons: [],
      scope: { wind_speed: true, direction: false, gusts: false },
      flags: strikes
        ? [{ code: "lightning_observed", severity: "hazard", message: "Lightning detected nearby: repeated text" }]
        : [{ code: "no_strikes_observed", severity: "info", message: "No strikes observed. Not an all-clear." }],
    },
    sources: ["NEA via data.gov.sg"],
    official_advisories: [{ label: "MSS", url: "https://www.weather.gov.sg/" }],
    disclaimer: "Information only.",
  };
}

const ok = (data) => ({ ok: true, status: 200, json: async () => data });

function makeFetch(routes) {
  const calls = [];
  const f = async (url) => {
    calls.push(String(url));
    for (const [pattern, handler] of routes) {
      if (String(url).includes(pattern)) return handler(String(url));
    }
    throw new Error("unrouted " + url);
  };
  f.calls = calls;
  return f;
}

let counter = 0;
async function runApp(fetchImpl) {
  const els = {};
  const ids = ["sport", "spot", "level", "refresh", "context", "updated", "banner", "alert",
               "guidance", "wind", "lightning", "details", "interest", "about"];
  for (const id of ids) els[id] = new El("div");
  globalThis.document = {
    getElementById: (id) => els[id],
    createElement: (t) => new El(t),
    addEventListener: () => {},
    visibilityState: "visible",
  };
  globalThis.location = { search: "?level=beginner", href: "http://localhost:5173/?level=beginner" };
  globalThis.history = { replaceState: () => {} };
  globalThis.setInterval = () => 0;
  globalThis.fetch = fetchImpl;
  await import(`../app.js?run=${++counter}`);
  await new Promise((r) => setTimeout(r, 40));
  return els;
}

const happyRoutes = (p) => [
  ["/api/catalog/activities", () => ok(ACTIVITIES)],
  ["/api/catalog/spots", () => ok(SPOTS)],
  ["/conditions", () => ok(p)],
];

test("sport and location are dropdowns filled from the catalog, and the header says nothing about a spot", async () => {
  const f = makeFetch(happyRoutes(payload()));
  const els = await runApp(f);
  assert.equal(els.sport.children.length, 1);
  assert.equal(els.sport.children[0].textContent, "Windsurfing");
  assert.equal(els.spot.children.length, 2);
  assert.equal(els.level.children.length, 4);
  assert.equal(els.context.textContent, "Windsurfing at East Coast Parkway (Carpark E5)");
  assert.ok(f.calls.some((u) => u.includes("/api/catalog/spots?activity=windsurf")));
  assert.ok(f.calls.some((u) => u.includes("/api/spots/east-coast/conditions")));
});

test("quiet conditions: no alert, a partial-assessment label, details collapsed, and a link to the interest form", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())));
  assert.equal(els.alert.hidden, true);
  assert.match(els.guidance.textContent, /Beginner windsurfing/);
  assert.match(els.guidance.textContent, /Wind speed only: within WSK reference range/);
  assert.match(els.guidance.textContent, /Wind now: 6\.5 kn, from SSW \(200°\)/);
  assert.match(els.guidance.textContent, /Not assessed: wind direction relative to the shore, gusts/);
  assert.match(els.wind.textContent, /station mapped to this spot/);
  assert.equal(els.details.hidden, false);
  assert.match(els.interest.textContent, /Tell us when you would go/);
  assert.equal(els.interest.children[2].href, "https://forms.gle/a8mwPQpaSkaex2w37");
  assert.match(els.about.textContent, /NEA via data\.gov\.sg/);
  assert.equal(els.banner.hidden, true);
});

test("lightning is one alert at the top and is not repeated in the guidance", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload({ strikes: 3 }))));
  assert.equal(els.alert.hidden, false);
  assert.match(els.alert.textContent, /Lightning detected nearby/);
  assert.match(els.alert.textContent, /3 strikes within 20 km/);
  assert.match(els.alert.textContent, /MSS/);
  assert.doesNotMatch(els.guidance.textContent, /Lightning detected nearby/);
  assert.doesNotMatch(els.guidance.textContent, /repeated text/);
});

test("changing the location loads that location's conditions", async () => {
  const f = makeFetch(happyRoutes(payload()));
  const els = await runApp(f);
  els.spot.value = "marina";
  els.spot.listeners.change();
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(f.calls.some((u) => u.includes("/api/spots/marina/conditions")));
  assert.equal(els.context.textContent, "Windsurfing at Marina Barrage");
});

test("a sport with no locations says so and does not load conditions", async () => {
  const f = makeFetch([
    ["/api/catalog/activities", () => ok(ACTIVITIES)],
    ["/api/catalog/spots", () => ok({ activity: "windsurf", spots: [] })],
  ]);
  const els = await runApp(f);
  assert.match(els.banner.textContent, /No locations are available for this sport yet/);
  assert.ok(!f.calls.some((u) => u.includes("/conditions")));
});

test("an unreachable conditions API fails closed with a clear message", async () => {
  const els = await runApp(makeFetch([
    ["/api/catalog/activities", () => ok(ACTIVITIES)],
    ["/api/catalog/spots", () => ok(SPOTS)],
    ["/conditions", () => { throw new TypeError("network down"); }],
  ]));
  assert.equal(els.banner.hidden, false);
  assert.match(els.banner.textContent, /Couldn't reach the conditions service/);
  assert.match(els.banner.textContent, /Check official advisories/);
  assert.equal(els.wind.children.length, 0);
  assert.equal(els.details.hidden, true);
});

test("a failing catalog shows an error and loads nothing else", async () => {
  const f = makeFetch([["/api/catalog/activities", () => ({ ok: false, status: 500, json: async () => ({}) })]]);
  const els = await runApp(f);
  assert.match(els.banner.textContent, /unavailable right now/);
  assert.ok(!f.calls.some((u) => u.includes("/conditions")));
});

test("API text is inserted as text, not markup", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload({ windSummary: "<img src=x onerror=alert(1)>" }))));
  assert.match(els.guidance.textContent, /<img src=x onerror=alert\(1\)>/);
  const tags = [];
  const walk = (e) => { tags.push(e.tagName); e.children.forEach(walk); };
  walk(els.guidance);
  assert.ok(!tags.includes("img"));
});
