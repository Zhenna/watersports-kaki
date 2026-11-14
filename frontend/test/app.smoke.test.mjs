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
  setAttribute(k, v) { this[k] = v; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
}

const ACTIVITIES = { activities: [{ slug: "windsurf", name: "Windsurfing" }] };
const SPOTS = { activity: "windsurf", spots: [
  { slug: "east-coast", name: "East Coast Parkway (Carpark E5)" },
  { slug: "marina", name: "Marina Barrage" },
] };

function payload({ strikes = 0, windSummary, two = true } = {}) {
  const r1 = { station_id: "S1", station_name: "Alpha", distance_km: 1.2, selection: "mapped", kmh: 12, knots: 6.5 };
  const r2 = { station_id: "S2", station_name: "Bravo", distance_km: 4.0, selection: "nearest", kmh: 14, knots: 7.6 };
  const readings = two ? [r1, r2] : [r1];
  return {
    spot: { slug: "east-coast", name: "East Coast Parkway (Carpark E5)" },
    activity: "windsurf", level: "beginner", generated_at: "2026-11-04T20:38:50+08:00",
    observations: {
      wind: { kmh: 12, knots: 6.5, kmh_min: 12, kmh_max: two ? 14 : 12, knots_min: 6.5, knots_max: two ? 7.6 : 6.5,
              readings, from_deg: 200, observed_at: "2026-11-04T20:34:00+08:00", age_min: 4, stale: false, note: null },
      wind_message: null,
      gusts: null,
      lightning: { strikes_within_radius: strikes, nearest_km: strikes ? 9.1 : 44, radius_km: 20, lookback_min: 30,
                   fetched_at: "2026-11-04T20:38:50+08:00", age_min: 0, stale: false },
    },
    guidance: {
      status: strikes ? "flagged" : "within_reference_range",
      summary: "ignored when wind fields exist",
      wind_status: "within",
      wind_summary: windSummary ?? "Nearby stations report 12.0 to 14.0 km/h (6.5 to 7.6 knots), all within the WSK reference range of 8 to 20 km/h for beginner windsurf. This is not a safety clearance.",
      wind_reasons: [],
      scope: { wind_speed: true, direction: false, gusts: false },
      review_status: "unreviewed",
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
  const ids = ["sport", "spot", "level", "refresh", "context", "updated", "banner",
               "guidance", "lightning", "plan", "about"];
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

test("sport and location are dropdowns filled from the catalog", async () => {
  const f = makeFetch(happyRoutes(payload()));
  const els = await runApp(f);
  assert.equal(els.sport.children.length, 1);
  assert.equal(els.sport.children[0].textContent, "Windsurfing");
  assert.equal(els.spot.children.length, 2);
  assert.equal(els.level.children.length, 4);
  assert.equal(els.context.textContent, "Conditions at East Coast Parkway (Carpark E5)");
  assert.ok(f.calls.some((u) => u.includes("/api/catalog/spots?activity=windsurf")));
  assert.ok(f.calls.some((u) => u.includes("/api/spots/east-coast/conditions")));
});

test("quiet conditions: a plain headline, metrics, one limits line, and a neutral lightning card", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())));
  const g = els.guidance.textContent;
  assert.match(g, /Conditions summary/);
  assert.match(g, /Beginner windsurfing/);
  assert.match(g, /Gentle breeze/);
  assert.match(g, /Wind speed only: within provisional range/);
  assert.match(g, /Reported wind6\.5 to 7\.6 knFrom SSW \u00b7 200\u00b0/);
  assert.match(g, /Source2 nearby stations1\.2 to 4 km from spot/);
  assert.match(g, /Limits: Based on wind readings from 2 nearby stations, 1\.2 to 4 km away\. Gusts and wind direction relative to the shore are not assessed\. Reference ranges are provisional\./);
  assert.match(g, /View observation details/);
  assert.match(g, /Alpha, 1\.2 km away: 6\.5 kn \(12\.0 km\/h\), mapped to this spot/);
  assert.match(g, /Bravo, 4 km away: 7\.6 kn \(14\.0 km\/h\)/);
  assert.equal(els.lightning.className, "card");
  assert.match(els.lightning.textContent, /No strikes observed nearby/);
  assert.match(els.lightning.textContent, /not an all-clear/);
  assert.match(els.about.textContent, /NEA via data\.gov\.sg/);
  assert.equal(els.banner.hidden, true);
});

test("lightning is one prominent card, with the advisory link, and is not repeated in the summary", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload({ strikes: 3 }))));
  assert.match(els.lightning.className, /alert/);
  assert.match(els.lightning.textContent, /Lightning detected nearby/);
  assert.match(els.lightning.textContent, /3 strikes within 20 km/);
  assert.match(els.lightning.textContent, /MSS/);
  assert.doesNotMatch(els.guidance.textContent, /Lightning detected nearby/);
  assert.doesNotMatch(els.guidance.textContent, /repeated text/);
});

test("the planner offers weekend days and AM or PM, never hour ranges", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())));
  const text = els.plan.textContent;
  assert.match(text, /Find your Kakis/);
  assert.match(text, /When would you like to get on the water\?/);
  assert.match(text, /AMMorning/);
  assert.match(text, /PMAfternoon/);
  assert.match(text, /Interest only\. No booking or equipment reservation\./);
  assert.doesNotMatch(text, /\d\s?(AM|PM)\s?[-\u2013]/);   // no "9-11 AM" style ranges
  const chips = els.plan.children[2].children;
  assert.equal(chips.length, 4);
  for (const c of chips) assert.match(c.textContent, /^(Sat|Sun), \d{1,2} [A-Z][a-z]{2}$/);
  const link = els.plan.children[4].children[1];
  assert.equal(link.href, "https://forms.gle/a8mwPQpaSkaex2w37");
  assert.equal(link.target, "_blank");
});

test("choosing a day and a time updates the summary and the form hint", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())));
  const labels = els.plan.children[2].children.map((c) => c.textContent);
  els.plan.children[2].children[1].listeners.click();           // second day
  els.plan.children[3].children[1].listeners.click();           // PM
  const foot = els.plan.children[4];
  assert.equal(foot.children[0].children[0].textContent, `${labels[1]} \u00b7 PM`);
  const short = labels[1].slice(0, 3);
  assert.match(foot.children[0].children[1].textContent, new RegExp(`In the form, tick ${short} PM\\.`));
  assert.equal(els.plan.children[2].children[1].className, "chip on");
  assert.equal(els.plan.children[3].children[1].className, "slot on");
  assert.equal(els.plan.children[3].children[0].className, "slot");
});

test("changing the location loads that location's conditions", async () => {
  const f = makeFetch(happyRoutes(payload()));
  const els = await runApp(f);
  els.spot.value = "marina";
  els.spot.listeners.change();
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(f.calls.some((u) => u.includes("/api/spots/marina/conditions")));
  assert.equal(els.context.textContent, "Conditions at Marina Barrage");
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
  assert.equal(els.guidance.children.length, 0);
  assert.equal(els.plan.children.length, 0);
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
