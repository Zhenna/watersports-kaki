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

// A panel is a card with a visible part and a "Details" element that starts closed.
const detailsOf = (panel) => panel.children.find((c) => c.tagName === "details");
const tabsWrapOf = (panel) => panel.children.find((c) => c.className === "subtabs-wrap");
const visibleText = (panel) => panel.children
  .filter((c) => c.tagName !== "details" && c.className !== "subtabs-wrap")
  .map((c) => c.textContent).join(" | ");
// The wind panel has two tabs, closed until one is tapped. Returns the text of the open tab, if any.
const tabButtons = (panel) => tabsWrapOf(panel).children[0].children;
const openTabText = (panel) => {
  const body = tabsWrapOf(panel).children.find((c) => c.className === "subtab-body");
  return body ? body.textContent : null;
};

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
               "wind-panel", "lightning-panel", "pane-plan", "plan", "about", "tab-now", "tab-plan"];
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

// The plan card is found by class, so the tests do not depend on the order of its parts.
const byClass = (el, cls) => el.children.find((c) => c.className.split(" ").includes(cls));
const chipsOf = (plan) => byClass(plan, "chips");
const slotsOf = (plan) => byClass(plan, "slots");
const sessionOf = (plan) => byClass(plan, "session");
const ctaOf = (plan) => plan.children.find((c) => c.tagName === "a");
const forecastOf = (plan) => byClass(plan, "forecast");

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

test("the wind panel shows a headline, with two tabs for the rest, both closed", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())));
  const panel = els["wind-panel"];
  const v = visibleText(panel);
  assert.match(v, /Wind/);
  assert.match(v, /Beginner windsurfing/);
  assert.match(v, /Gentle breeze/);
  assert.match(v, /Within provisional range/);
  assert.match(v, /6\.5 to 7\.6 kn \u00b7 From SSW \u00b7 200\u00b0/);
  for (const hidden of [/Limits/, /Source/, /Nearby stations report/, /Alpha/, /Ranges provisional/]) {
    assert.doesNotMatch(v, hidden);
  }
  assert.doesNotMatch(panel.textContent, /Lightning|strike/i, "lightning does not belong in the wind panel");

  const buttons = tabButtons(panel);
  assert.deepEqual(buttons.map((b) => b.textContent), ["Conditions summary", "Sources and limits"]);
  assert.equal(openTabText(panel), null, "both tabs start closed");
  assert.match(els.about.textContent, /For information only\. Not safety advice\./);
});

test("the Conditions summary tab holds the full wording", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())));
  const panel = els["wind-panel"];
  tabButtons(panel)[0].listeners.click();
  assert.equal(tabButtons(panel)[0].className, "subtab on");
  assert.equal(tabButtons(panel)[1].className, "subtab");
  const t = openTabText(panel);
  assert.match(t, /Nearby stations report 12\.0 to 14\.0 km\/h/);
  assert.doesNotMatch(t, /Alpha|Source/);
});

test("the Sources and limits tab holds the stations, the limits and the disclaimer", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())));
  const panel = els["wind-panel"];
  tabButtons(panel)[1].listeners.click();
  const t = openTabText(panel);
  assert.match(t, /2 nearby stations, 1\.2 to 4 km from spot/);
  assert.match(t, /Alpha, 1\.2 km away: 6\.5 kn \(12\.0 km\/h\), mapped to this spot/);
  assert.match(t, /Wind speed only\. Gusts and shore-relative direction not assessed\. Ranges provisional\./);
  assert.match(t, /Source: NEA via data\.gov\.sg\./);
  assert.match(t, /Information only\./);
  assert.doesNotMatch(t, /Nearby stations report/);
});

test("tapping a tab again closes it, and switching tabs shows the other one", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())));
  const panel = els["wind-panel"];
  tabButtons(panel)[0].listeners.click();
  assert.notEqual(openTabText(panel), null);
  tabButtons(panel)[0].listeners.click();
  assert.equal(openTabText(panel), null);
  tabButtons(panel)[0].listeners.click();
  tabButtons(panel)[1].listeners.click();
  assert.match(openTabText(panel), /Alpha/);
  assert.equal(tabButtons(panel)[0].className, "subtab");
});

test("lightning has its own panel: a short neutral summary, with the details tucked away", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())));
  const panel = els["lightning-panel"];
  assert.equal(panel.className, "card");
  const v = visibleText(panel);
  assert.match(v, /Lightning/);
  assert.match(v, /Live/);
  assert.match(v, /No strikes observed/);
  assert.match(v, /Not an all-clear/);
  assert.match(v, /Within 20 km of this spot, last 30 min/);
  assert.doesNotMatch(v, /Nearest strike|Checked|lag/);
  const d = detailsOf(panel).textContent;
  assert.match(d, /No strikes within 20 km of East Coast Parkway \(Carpark E5\) in the last 30 minutes\. This is not an all-clear\./);
  assert.match(d, /Nearest strike: 44 km from the spot\./);
  assert.match(d, /Source: NEA lightning observations via data\.gov\.sg\. Each point is a detected strike, not a station\./);
  assert.match(d, /Lightning data can lag by a few minutes\./);
  assert.doesNotMatch(panel.textContent, /Gentle breeze|kn/, "wind does not belong in the lightning panel");
});

test("nearby lightning makes its panel prominent, with the advisory link, and is not repeated in the wind panel", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload({ strikes: 3 }))));
  const panel = els["lightning-panel"];
  assert.match(panel.className, /alert/);
  const v = visibleText(panel);
  assert.match(v, /Lightning detected nearby/);
  assert.match(v, /3 strikes within 20 km of this spot \u00b7 nearest 9\.1 km/);
  assert.match(v, /MSS/);
  assert.match(detailsOf(panel).textContent, /Follow official advisories and your operator's procedures/);
  assert.doesNotMatch(els["wind-panel"].textContent, /Lightning|strike/i);
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

test("plan ahead: seven scrolling dates, AM and PM, and a forecast with thunder said once", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())), "?tab=plan&level=beginner");
  const text = els.plan.textContent;
  assert.match(text, /Find your next Water Day/);
  assert.match(text, /Windsurfing \u00b7 East Coast Parkway \(Carpark E5\) \u00b7 Beginner/);
  assert.match(text, /When would you like to go\?/);
  assert.match(text, /Pick AM, PM or both\./);
  const chips = chipsOf(els.plan).children;
  assert.equal(chips.length, 7);
  for (const c of chips) {
    assert.match(c.textContent, /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\d{1,2}$/);
    assert.match(c["aria-label"], /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{1,2} [A-Z][a-z]{2}$/);
  }
  assert.match(text, /AMMorning/);
  assert.match(text, /PMAfternoon/);
  assert.doesNotMatch(text, /\d\s?(AM|PM)\s?[-\u2013]/);
  assert.match(text, /Forecast for /);
  assert.match(text, /Morning: Fair \(Day\)/);          // the default is AM only
  assert.match(text, /Light breeze to moderate breeze/);
  assert.match(text, /Within provisional range/);
  assert.match(text, /5\.4 to 10\.8 kn \u00b7 From NE/);
  assert.match(text, /Island-wide NEA forecast, not specific to this spot\./);
  assert.match(text, /Lightning is checked live on the day\. See Right now\./);
  assert.doesNotMatch(text, /strike|No strikes|Lightning detected/);
  assert.match(text, /Interest only\. Nothing is booked\. We'll email you when others with similar plans sign up\./);
  const session = sessionOf(els.plan).textContent;
  assert.match(session, /Selected session/);
  assert.match(session, /^Selected session(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \d{1,2} [A-Z][a-z]+ \u00b7 AM/);
  assert.match(session, /Windsurfing \u00b7 East Coast Parkway \(Carpark E5\)/);
  const cta = ctaOf(els.plan);
  assert.equal(cta.textContent, "I'm interested \u2192");
  assert.match(cta.className, /wide/);
  assert.equal(cta.href, "https://forms.gle/a8mwPQpaSkaex2w37");
  assert.doesNotMatch(text, /Be the first/i, "the page has no data about other people, so it must not claim this");
});

test("the forecast shows thunder, the headline, the status and the wind figures, with the limits tucked away", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())), "?tab=plan&level=beginner");
  const box = forecastOf(els.plan);
  const shown = box.children.filter((c) => c.tagName !== "details").map((c) => c.textContent).join(" | ");
  const tucked = box.children.find((c) => c.tagName === "details").textContent;
  assert.match(shown, /Forecast for /);
  assert.match(shown, /Morning: Fair \(Day\)/);
  assert.match(shown, /Light breeze to moderate breeze/);
  assert.match(shown, /Within provisional range/);
  assert.match(shown, /5\.4 to 10\.8 kn \u00b7 From NE/);
  for (const hidden of [/Island-wide/, /Gusts/, /Lightning is checked live/]) {
    assert.doesNotMatch(shown, hidden);
  }
  assert.match(tucked, /Details/);
  assert.doesNotMatch(tucked, /5\.4 to 10\.8 kn/);
  assert.match(tucked, /Island-wide NEA forecast, not specific to this spot\./);
  assert.match(tucked, /Gusts and shore-relative direction not assessed/);
  assert.match(tucked, /Lightning is checked live on the day\. See Right now\./);
});

test("thunder stays visible, outside the details, when the afternoon is thundery", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())), "?tab=plan&level=beginner");
  slotsOf(els.plan).children[1].listeners.click();      // add PM
  const box = forecastOf(els.plan);
  const shown = box.children.filter((c) => c.tagName !== "details").map((c) => c.textContent).join(" | ");
  assert.match(shown, /Thundery showers forecast for the afternoon\./);
  assert.match(shown, /Check updated forecasts and official warnings on the day\./);
});

test("PM shows thunder first, once, and AM and PM can both be chosen", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())), "?tab=plan&level=beginner");
  const pressed = () => slotsOf(els.plan).children.map((b) => b.className);
  assert.deepEqual(pressed(), ["slot on", "slot"]);
  slotsOf(els.plan).children[1].listeners.click();          // add PM
  assert.deepEqual(pressed(), ["slot on", "slot on"]);
  let text = els.plan.textContent;
  assert.equal((text.match(/Thundery/gi) || []).length, 1, "thunder is said once");
  assert.match(text, /Thundery showers forecast for the afternoon\./);
  assert.match(text, /Check updated forecasts and official warnings on the day\./);
  assert.match(text, /Morning: Fair \(Day\)/);
  assert.doesNotMatch(text, /Afternoon: /);
  slotsOf(els.plan).children[0].listeners.click();          // remove AM
  assert.deepEqual(pressed(), ["slot", "slot on"]);
  text = els.plan.textContent;
  assert.doesNotMatch(text, /Morning: /);
  slotsOf(els.plan).children[1].listeners.click();          // the last one cannot be removed
  assert.deepEqual(pressed(), ["slot", "slot on"]);
});

test("the form hint follows the chosen day and both slots", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())), "?tab=plan&level=beginner");
  const days = upcomingDays();
  const sat = days.findIndex((d) => d.short === "Sat");
  chipsOf(els.plan).children[sat].listeners.click();
  assert.match(els.plan.textContent, /In the form, tick Sat AM\./);
  slotsOf(els.plan).children[1].listeners.click();
  assert.match(els.plan.textContent, /In the form, tick Sat AM and Sat PM\./);
  assert.match(els.plan.textContent, /\u00b7 AM and PM/);
  const mon = days.findIndex((d) => d.short === "Mon");
  chipsOf(els.plan).children[mon].listeners.click();
  assert.match(els.plan.textContent, /Weekday times aren't in the form yet\./);
  assert.doesNotMatch(els.plan.textContent, /evening/i);
});

test("choosing another day shows that day's forecast, or says there is none yet", async () => {
  const els = await runApp(makeFetch(happyRoutes(payload())), "?tab=plan&level=beginner");
  chipsOf(els.plan).children[1].listeners.click();    // second day: below the range
  assert.match(els.plan.textContent, /Below provisional range/);
  chipsOf(els.plan).children[5].listeners.click();    // a day beyond the outlook
  assert.match(els.plan.textContent, /No forecast for .* yet\. NEA's outlook covers the next 4 days\./);
  assert.doesNotMatch(els.plan.textContent, /Below provisional range/);
});

test("a failed forecast fails closed and does not break the rest of the page", async () => {
  const els = await runApp(makeFetch([
    ["/api/catalog/activities", () => ok(ACTIVITIES)],
    ["/api/catalog/spots", () => ok(SPOTS)],
    ["/forecast", () => { throw new TypeError("network down"); }],
    ["/conditions", () => ok(payload())],
  ]), "?tab=plan&level=beginner");
  assert.match(els.plan.textContent, /Forecast unavailable right now\. Check official advisories/);
  assert.match(els.plan.textContent, /Find your next Water Day/);
  assert.match(visibleText(els["wind-panel"]), /Gentle breeze/);
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
  assert.equal(els["wind-panel"].children.length, 0);
  assert.equal(els["lightning-panel"].children.length, 0);
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
  const fc = forecastPayload({ pmText: "<script>alert(1)</script>", pmThundery: false });
  const els = await runApp(makeFetch(happyRoutes(evil, fc)), "?tab=plan&level=beginner");
  slotsOf(els.plan).children[1].listeners.click();    // add PM, which shows the forecast text
  tabButtons(els["wind-panel"])[0].listeners.click();
  assert.match(openTabText(els["wind-panel"]), /<img src=x onerror=alert\(1\)>/);
  assert.match(els.plan.textContent, /Afternoon: <script>alert\(1\)<\/script>/);
  const tags = [];
  const walk = (e) => { tags.push(e.tagName); e.children.forEach(walk); };
  walk(els["wind-panel"]);
  walk(els.plan);
  assert.ok(!tags.includes("img") && !tags.includes("script"));
});
