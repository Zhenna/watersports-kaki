// Runs app.js against a minimal fake DOM to catch runtime errors in the render and error paths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { upcomingDays } from "../lib.js";

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

function payload({ strikes = 0, windSummary } = {}) {
  const r1 = { station_id: "S1", station_name: "Alpha", distance_km: 1.2, selection: "mapped", kmh: 12, knots: 6.5 };
  const r2 = { station_id: "S2", station_name: "Bravo", distance_km: 4.0, selection: "nearest", kmh: 14, knots: 7.6 };
  return {
    spot: { slug: "east-coast", name: "East Coast Parkway (Carpark E5)" },
    activity: "windsurf", level: "beginner", generated_at: "2026-11-04T20:38:50+08:00",
    observations: {
      wind: { kmh: 12, knots: 6.5, kmh_min: 12, kmh_max: 14, knots_min: 6.5, knots_max: 7.6,
              readings: [r1, r2], from_deg: 200, observed_at: "2026-11-04T20:34:00+08:00", age_min: 4, stale: false, note: null },
      wind_message: null,
      gusts: null,
      lightning: { strikes_within_radius: strikes, nearest_km: strikes ? 9.1 : 44, radius_km: 20, lookback_min: 30,
                   fetched_at: "2026-11-04T20:38:50+08:00", age_min: 0, stale: false },
    },
    guidance: {
      status: strikes ? "flagged" : "within_reference_range",
      summary: "ignored when wind fields exist",
      wind_status: "within", wind_position: "within",
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

// Forecast dates come from today's calendar, so these tests never go stale.
function forecastPayload({ pmText = "Thundery Showers", pmThundery = true } = {}) {
  const days = upcomingDays();
  const mk = (d, low, high, status, position) => ({
    date: d.iso, source: "nea_4day", stale: false,
    wind: { kmh_low: low, kmh_high: high, knots_low: Number((low / 1.852).toFixed(1)),
            knots_high: Number((high / 1.852).toFixed(1)), direction: "NE", from_deg: 45 },
    weather: "Showers", thundery: pmThundery,
    slots: { AM: { text: "Fair (Day)", thundery: false, source: "nea_24h" },
             PM: { text: pmText, thundery: pmThundery, source: "nea_24h" } },
    guidance: { status: "x", summary: "x", wind_status: status, wind_position: position,
                wind_summary: "Forecast wind ...", wind_reasons: [],
                scope: { wind_speed: true, direction: false, gusts: false }, flags: [], review_status: "unreviewed" },
  });
  return {
    available: true, horizon_days: 4, note: "Island-wide NEA forecast, not specific to this spot.",
    days: [mk(days[0], 10, 20, "within", "within"), mk(days[1], 2, 6, "outside", "below")],
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
async function runApp(fetchImpl, search = "?level=beginner") {
  const els = {};
  const ids = ["sport", "spot", "level", "refresh", "context", "updated", "banner", "pane-now", "now-status",
               "lightning-alert", "headline", "details", "details-body", "pane-plan", "plan", "about",
               "tab-now", "tab-plan"];
  for (const id of ids) els[id] = new El("div");
  globalThis.document = {
    getElementById: (id) => els[id],
    createElement: (t) => new El(t),
    addEventListener: () => {},
    visibilityState: "visible",
  };
  globalThis.location = { search, href: `http://localhost:5173/${search}` };
  globalThis.history = { replaceState: () => {} };
  globalThis.setInterval = () => 0;
  globalThis.fetch = fetchImpl;
  await import(`../app.js?run=${++counter}`);
  await new Promise((r) => setTimeout(r, 40));
  return els;
}

const wait = () => new Promise((r) => setTimeout(r, 40));

const happyRoutes = (p, fc = forecastPayload()) => [
  ["/api/catalog/activities", () => ok(ACTIVITIES)],
  ["/api/catalog/spots", () => ok(SPOTS)],
  ["/forecast", () => ok(fc)],
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
  assert.ok(!f.calls.some((u) => u.includes("/forecast")), "the forecast loads only when asked for");
});

test("right now shows only the headline, and everything else is tucked into the details", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())));
  const h = els.headline.textContent;
  assert.match(h, /Right now/);
  assert.match(h, /Beginner windsurfing/);
  assert.match(h, /Gentle breeze/);
  assert.match(h, /Within provisional range/);
  assert.match(h, /6\.5 to 7\.6 kn \u00b7 From SSW \u00b7 200\u00b0/);
  for (const hidden of [/Limits/, /Source/, /Lightning/, /No strikes/, /Nearby stations report/, /Alpha/]) {
    assert.doesNotMatch(h, hidden);
  }
  assert.equal(els["lightning-alert"].hidden, true);

  assert.equal(els.details.hidden, false);
  const d = els["details-body"].textContent;
  assert.match(d, /Conditions summary/);
  assert.match(d, /Nearby stations report 12\.0 to 14\.0 km\/h/);
  assert.match(d, /Source and limits/);
  assert.match(d, /2 nearby stations, 1\.2 to 4 km from spot/);
  assert.match(d, /Alpha, 1\.2 km away: 6\.5 kn \(12\.0 km\/h\), mapped to this spot/);
  assert.match(d, /Wind speed only\. Gusts and shore-relative direction not assessed\. Ranges provisional\./);
  assert.match(d, /Lightning/);
  assert.match(d, /No strikes observed nearby\. No strikes within 20 km in the last 30 min\. This is not an all-clear\./);
  assert.match(d, /Lightning data can lag by a few minutes/);
  assert.match(els.about.textContent, /For information only\. Not safety advice\./);
});

test("nearby lightning is a notice above the headline, and is not repeated in it", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload({ strikes: 3 }))));
  const a = els["lightning-alert"];
  assert.equal(a.hidden, false);
  assert.match(a.className, /alert-box/);
  assert.match(a.textContent, /Lightning detected nearby/);
  assert.match(a.textContent, /3 strikes within 20 km/);
  assert.match(a.textContent, /MSS/);
  assert.doesNotMatch(els.headline.textContent, /Lightning/);
  assert.doesNotMatch(els["details-body"].textContent, /3 strikes within 20 km/);
});

test("the plan tab is hidden until chosen, then loads the forecast once", async () => {
  const f = makeFetch(happyRoutes(payload()));
  const els = await runApp(f);
  assert.equal(els["pane-plan"].hidden, true);
  assert.equal(els["pane-now"].hidden, false);
  els["tab-plan"].listeners.click();
  await wait();
  assert.equal(els["pane-plan"].hidden, false);
  assert.equal(els["pane-now"].hidden, true);
  assert.equal(els["tab-plan"].className, "tab on");
  assert.equal(els["tab-now"].className, "tab");
  assert.equal(f.calls.filter((u) => u.includes("/forecast")).length, 1);
  els["tab-now"].listeners.click();
  els["tab-plan"].listeners.click();
  await wait();
  assert.equal(f.calls.filter((u) => u.includes("/forecast")).length, 1, "no reload for the same selection");
});

test("plan ahead offers seven days and AM or PM, with the forecast for the chosen time", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())), "?tab=plan&level=beginner");
  const text = els.plan.textContent;
  assert.match(text, /Find your Kakis/);
  assert.match(text, /AMMorning/);
  assert.match(text, /PMAfternoon/);
  assert.doesNotMatch(text, /\d\s?(AM|PM)\s?[-\u2013]/);
  const chips = els.plan.children[2].children;
  assert.equal(chips.length, 7);
  for (const c of chips) assert.match(c.textContent, /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{1,2} [A-Z][a-z]{2}$/);
  assert.match(text, /Forecast/);
  assert.match(text, /Light breeze to moderate breeze/);
  assert.match(text, /Within provisional range/);
  assert.match(text, /5\.4 to 10\.8 kn \u00b7 From NE/);
  assert.match(text, /Morning: Fair \(Day\)/);
  assert.doesNotMatch(text, /Thundery showers in the forecast/);
  assert.match(text, /Island-wide NEA forecast/);
  assert.match(text, /Interest only\. Nothing is booked\./);
  const foot = els.plan.children[els.plan.children.length - 1];
  assert.equal(foot.children[1].href, "https://forms.gle/a8mwPQpaSkaex2w37");
});

test("choosing PM shows the afternoon weather, and thunder is called out in plain words", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())), "?tab=plan&level=beginner");
  els.plan.children[3].children[1].listeners.click();    // PM
  const text = els.plan.textContent;
  assert.match(text, /Afternoon: Thundery Showers/);
  assert.match(text, /Thundery showers in the forecast\./);
  assert.equal(els.plan.children[3].children[1].className, "slot on");
});

test("choosing another day shows that day's forecast, or says there is none yet", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())), "?tab=plan&level=beginner");
  els.plan.children[2].children[1].listeners.click();    // second day: below the range
  assert.match(els.plan.textContent, /Below provisional range/);
  els.plan.children[2].children[5].listeners.click();    // a day beyond the outlook
  assert.match(els.plan.textContent, /No forecast for .* yet\. NEA's outlook covers the next 4 days\./);
  assert.doesNotMatch(els.plan.textContent, /Below provisional range/);
});

test("the form hint follows the chosen day", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())), "?tab=plan&level=beginner");
  const days = upcomingDays();
  const sat = days.findIndex((d) => d.short === "Sat");
  els.plan.children[2].children[sat].listeners.click();
  assert.match(els.plan.textContent, /In the form, tick Sat AM\./);
  const mon = days.findIndex((d) => d.short === "Mon");
  els.plan.children[2].children[mon].listeners.click();
  assert.match(els.plan.textContent, /The form lists weekends and weekday evenings\./);
});

test("a failed forecast fails closed and does not break the rest of the page", async () => {
  const els = await runApp(makeFetch([
    ["/api/catalog/activities", () => ok(ACTIVITIES)],
    ["/api/catalog/spots", () => ok(SPOTS)],
    ["/forecast", () => { throw new TypeError("network down"); }],
    ["/conditions", () => ok(payload())],
  ]), "?tab=plan&level=beginner");
  assert.match(els.plan.textContent, /Forecast unavailable right now\. Check official advisories/);
  assert.match(els.plan.textContent, /Find your Kakis/);
  assert.match(els.headline.textContent, /Gentle breeze/);
});

test("changing the location reloads conditions, and the forecast when that tab is open", async () => {
  const f = makeFetch(happyRoutes(payload()));
  const els = await runApp(f, "?tab=plan&level=beginner");
  els.spot.value = "marina";
  els.spot.listeners.change();
  await wait();
  assert.ok(f.calls.some((u) => u.includes("/api/spots/marina/conditions")));
  assert.ok(f.calls.some((u) => u.includes("/api/spots/marina/forecast")));
  assert.equal(els.context.textContent, "Conditions at Marina Barrage");
});

test("a conditions failure does not stop the plan tab working", async () => {
  const els = await runApp(makeFetch([
    ["/api/catalog/activities", () => ok(ACTIVITIES)],
    ["/api/catalog/spots", () => ok(SPOTS)],
    ["/forecast", () => ok(forecastPayload())],
    ["/conditions", () => { throw new TypeError("network down"); }],
  ]));
  assert.equal(els["now-status"].hidden, false);
  assert.match(els["now-status"].textContent, /Couldn't reach the conditions service/);
  assert.match(els["now-status"].textContent, /Check official advisories/);
  assert.equal(els.headline.children.length, 0);
  els["tab-plan"].listeners.click();
  await wait();
  assert.match(els.plan.textContent, /Light breeze to moderate breeze/);
});

test("a 404 on conditions says the spot is not available", async () => {
  const els = await runApp(makeFetch([
    ["/api/catalog/activities", () => ok(ACTIVITIES)],
    ["/api/catalog/spots", () => ok(SPOTS)],
    ["/conditions", () => ({ ok: false, status: 404, json: async () => ({}) })],
  ]));
  assert.match(els["now-status"].textContent, /isn't available yet/);
});

test("a sport with no locations says so and loads nothing else", async () => {
  const f = makeFetch([
    ["/api/catalog/activities", () => ok(ACTIVITIES)],
    ["/api/catalog/spots", () => ok({ activity: "windsurf", spots: [] })],
  ]);
  const els = await runApp(f);
  assert.match(els.banner.textContent, /No locations are available for this sport yet/);
  assert.ok(!f.calls.some((u) => u.includes("/conditions") || u.includes("/forecast")));
});

test("a failing catalog shows an error and loads nothing else", async () => {
  const f = makeFetch([["/api/catalog/activities", () => ({ ok: false, status: 500, json: async () => ({}) })]]);
  const els = await runApp(f);
  assert.match(els.banner.textContent, /unavailable right now/);
  assert.ok(!f.calls.some((u) => u.includes("/conditions")));
});

test("API text is inserted as text, not markup", async () => {
  const evil = payload({ windSummary: "<img src=x onerror=alert(1)>" });
  const fc = forecastPayload({ pmText: "<script>alert(1)</script>" });
  const els = await runApp(makeFetch(happyRoutes(evil, fc)), "?tab=plan&level=beginner");
  els.plan.children[3].children[1].listeners.click();    // PM shows the forecast text
  assert.match(els["details-body"].textContent, /<img src=x onerror=alert\(1\)>/);
  assert.match(els.plan.textContent, /<script>alert\(1\)<\/script>/);
  const tags = [];
  const walk = (e) => { tags.push(e.tagName); e.children.forEach(walk); };
  walk(els["details-body"]);
  walk(els.plan);
  assert.ok(!tags.includes("img") && !tags.includes("script"));
});
