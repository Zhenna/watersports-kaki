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

const PAYLOAD = {
  spot: { slug: "s", name: "East Coast Parkway (Carpark E5)" },
  activity: "windsurf", level: "beginner", generated_at: "2026-11-04T20:38:50+08:00",
  observations: {
    wind: { kmh: 12, knots: 6.5, from_deg: 200, station: { station_id: "S1", station_name: "Near", distance_km: 1.2, selection: "mapped" },
            observed_at: "2026-11-04T20:34:00+08:00", age_min: 4, stale: false, note: null },
    gusts: null,
    lightning: { strikes_within_radius: 2, nearest_km: 9.1, radius_km: 20, lookback_min: 30, fetched_at: "2026-11-04T20:38:50+08:00", age_min: 0, stale: false },
  },
  guidance: { status: "flagged", summary: "Lightning detected nearby.", flags: [{ code: "lightning_observed", severity: "hazard", message: "Lightning detected nearby: 2 strikes." }] },
  sources: ["NEA via data.gov.sg"],
  official_advisories: [{ label: "MSS", url: "https://www.weather.gov.sg/" }],
  disclaimer: "Information only.",
};

let counter = 0;
async function runApp(fetchImpl) {
  const els = {};
  const ids = ["wind", "lightning", "guidance", "about", "banner", "updated", "spot-name", "level", "refresh"];
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
  await new Promise((r) => setTimeout(r, 30));
  return els;
}

test("renders wind, lightning, guidance and links", async () => {
  const els = await runApp(async () => ({ ok: true, status: 200, json: async () => PAYLOAD }));
  assert.match(els.wind.textContent, /6\.5 kn/);
  assert.match(els.wind.textContent, /from SSW \(200°\)/);
  assert.match(els.wind.textContent, /station mapped to this spot/);
  assert.match(els.lightning.textContent, /Lightning detected nearby/);
  assert.match(els.guidance.textContent, /Flags raised/);
  assert.match(els.guidance.textContent, /Important/);
  assert.match(els.about.textContent, /NEA via data\.gov\.sg/);
  assert.match(els.about.textContent, /MSS/);
  assert.equal(els.banner.hidden, true);
  assert.equal(els["spot-name"].textContent, "East Coast Parkway (Carpark E5)");
  assert.equal(els.level.children.length, 4);
});

test("an unreachable API fails closed with a clear message", async () => {
  const els = await runApp(async () => { throw new TypeError("network down"); });
  assert.equal(els.banner.hidden, false);
  assert.match(els.banner.textContent, /Couldn't reach the conditions service/);
  assert.match(els.banner.textContent, /Check official advisories/);
  assert.equal(els.wind.children.length, 0);
});

test("a 404 shows the spot is not available", async () => {
  const els = await runApp(async () => ({ ok: false, status: 404, json: async () => ({}) }));
  assert.match(els.banner.textContent, /isn't available yet/);
});

test("API text is inserted as text, not markup", async () => {
  const evil = structuredClone(PAYLOAD);
  evil.guidance.summary = "<img src=x onerror=alert(1)>";
  const els = await runApp(async () => ({ ok: true, status: 200, json: async () => evil }));
  assert.match(els.guidance.textContent, /<img src=x onerror=alert\(1\)>/);
  // no element other than the normal ones was created from that string
  const tags = [];
  const walk = (e) => { tags.push(e.tagName); e.children.forEach(walk); };
  walk(els.guidance);
  assert.ok(!tags.includes("img"));
});
