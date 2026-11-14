import { test } from "node:test";
import assert from "node:assert/strict";
import {
  degreesToCardinal, formatTimeSGT, agoText, levelFromQuery, isSafeHttpsUrl,
  apiUrl, errorMessage, buildView, STATUS_LABELS,
} from "../lib.js";

// The real response from the East Coast endpoint, with the newer fields added.
const NORMAL = {
  spot: { slug: "east-coast-parkway-carpark-e5", name: "East Coast Parkway (Carpark E5)", lat: 1.3021, lng: 103.913 },
  activity: "windsurf",
  level: "beginner",
  generated_at: "2026-11-04T20:38:50.593168+08:00",
  observations: {
    wind: {
      kmh: 1.5, knots: 0.8, from_deg: 32,
      station: { station_id: "S43", station_name: "Kim Chuan Road", distance_km: 5.1, selection: "nearest" },
      observed_at: "2026-11-04T20:34:00+08:00", age_min: 4.8, stale: false,
      note: "Wind readings come from Kim Chuan Road, 5.1 km from this spot (the nearest station that reports wind). Conditions at the spot can differ.",
    },
    gusts: null,
    lightning: {
      strikes_within_radius: 0, nearest_km: 44.3, radius_km: 20, lookback_min: 30,
      fetched_at: "2026-11-04T20:38:50.592737+08:00", age_min: 0, stale: false,
    },
  },
  guidance: {
    status: "outside_reference_range",
    summary: "Wind is 1.5 km/h (0.8 knots), below the WSK reference range of 8 to 20 km/h for beginner windsurf. This is not a safety assessment.",
    flags: [
      { code: "no_strikes_observed", severity: "info", message: "No strikes observed within 20 km in the last 30 minutes. This is not an all-clear. Data may be delayed." },
      { code: "rules_unreviewed", severity: "info", message: "These reference ranges have not been reviewed by an instructor." },
    ],
    review_status: "unreviewed",
  },
  sources: ["NEA via data.gov.sg"],
  official_advisories: [
    { label: "Meteorological Service Singapore", url: "https://www.weather.gov.sg/" },
    { label: "Bad link", url: "javascript:alert(1)" },
    { label: "Plain http", url: "http://example.com" },
  ],
  disclaimer: "Information only.",
};

test("cardinal directions", () => {
  assert.equal(degreesToCardinal(0), "N");
  assert.equal(degreesToCardinal(32), "NNE");
  assert.equal(degreesToCardinal(350), "N");
  assert.equal(degreesToCardinal(180), "S");
  assert.equal(degreesToCardinal(-10), "N");
  assert.equal(degreesToCardinal(null), null);
  assert.equal(degreesToCardinal(NaN), null);
});

test("time is shown in Singapore time", () => {
  assert.equal(formatTimeSGT("2026-11-04T20:34:00+08:00"), "20:34");
  assert.equal(formatTimeSGT("2026-11-04T12:34:00+00:00"), "20:34");
  assert.equal(formatTimeSGT("garbage"), null);
  assert.equal(formatTimeSGT(null), null);
});

test("age text", () => {
  assert.equal(agoText(0), "just now");
  assert.equal(agoText(4.8), "5 min ago");
  assert.equal(agoText(65), "1 h 5 min ago");
  assert.equal(agoText(120), "2 h ago");
  assert.equal(agoText(null), null);
  assert.equal(agoText(-3), null);
});

test("level from query falls back to beginner", () => {
  assert.equal(levelFromQuery("?level=advanced"), "advanced");
  assert.equal(levelFromQuery("?level=expert"), "beginner");
  assert.equal(levelFromQuery(""), "beginner");
});

test("only https links are allowed", () => {
  assert.equal(isSafeHttpsUrl("https://www.weather.gov.sg/"), true);
  assert.equal(isSafeHttpsUrl("http://example.com"), false);
  assert.equal(isSafeHttpsUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpsUrl("nonsense"), false);
});

test("api url is built from config", () => {
  const url = apiUrl({ API_BASE: "http://127.0.0.1:8000/", SPOT_SLUG: "east-coast", ACTIVITY: "windsurf" }, "beginner");
  assert.equal(url, "http://127.0.0.1:8000/api/spots/east-coast/conditions?activity=windsurf&level=beginner");
});

test("normal payload becomes a readable view", () => {
  const v = buildView(NORMAL);
  assert.equal(v.wind.knots, "0.8 kn");
  assert.equal(v.wind.kmh, "1.5 km/h");
  assert.equal(v.wind.direction, "from NNE (32°)");
  assert.equal(v.wind.station, "Kim Chuan Road, 5.1 km away (nearest station reporting wind)");
  assert.equal(v.wind.observed, "Observed 20:34 SGT, 5 min ago");
  assert.equal(v.wind.stale, false);
  assert.match(v.wind.note, /Conditions at the spot can differ/);
  assert.equal(v.lightning.headline, "No strikes observed within 20 km in the last 30 min");
  assert.match(v.lightning.detail, /not an all-clear/);
  assert.match(v.lightning.detail, /44\.3 km/);
  assert.equal(v.guidance.statusLabel, "Outside WSK reference range");
  assert.equal(v.guidance.flags.length, 2);
  assert.equal(v.guidance.flags[0].label, "Note");
  assert.equal(v.levelLabel, "Beginner");
  assert.equal(v.updated, "20:38");
});

test("unsafe or non-https advisory links are dropped", () => {
  const v = buildView(NORMAL);
  assert.deepEqual(v.advisories.map((a) => a.label), ["Meteorological Service Singapore"]);
});

test("nearby lightning is reported plainly", () => {
  const p = structuredClone(NORMAL);
  p.observations.lightning = { strikes_within_radius: 3, nearest_km: 8.2, radius_km: 20, lookback_min: 30, fetched_at: NORMAL.generated_at, age_min: 0, stale: false };
  const v = buildView(p);
  assert.equal(v.lightning.headline, "Lightning detected nearby");
  assert.match(v.lightning.detail, /3 strikes within 20 km/);
  assert.match(v.lightning.detail, /8\.2 km/);
});

test("missing feeds show unavailable, never a favourable state", () => {
  const p = structuredClone(NORMAL);
  p.observations = { wind: null, gusts: null, lightning: null };
  p.guidance = { status: "unavailable", summary: "Assessment unavailable: wind data unavailable; lightning data unavailable.", flags: [] };
  const v = buildView(p);
  assert.equal(v.wind, null);
  assert.equal(v.windMessage, "Wind data unavailable.");
  assert.equal(v.lightning, null);
  assert.match(v.lightningMessage, /Check official advisories/);
  assert.equal(v.guidance.statusLabel, "Assessment unavailable");
});

test("stale readings are marked, and a missing stale flag counts as stale", () => {
  const p = structuredClone(NORMAL);
  p.observations.wind.stale = true;
  assert.equal(buildView(p).wind.stale, true);
  delete p.observations.wind.stale;
  assert.equal(buildView(p).wind.stale, true);
});

test("unreviewed guidance is shown as awaiting review", () => {
  const p = structuredClone(NORMAL);
  p.guidance = { status: "not_published", summary: "Guidance for this sport and level is awaiting instructor review.", flags: [] };
  const v = buildView(p);
  assert.equal(v.guidance.statusLabel, "Awaiting instructor review");
});

test("unknown status falls back to unavailable", () => {
  const p = structuredClone(NORMAL);
  p.guidance = { status: "all_good", summary: "x", flags: [] };
  assert.equal(buildView(p).guidance.statusLabel, STATUS_LABELS.unavailable);
  assert.equal(buildView({}).guidance.statusLabel, STATUS_LABELS.unavailable);
});

test("no verdict wording in any label or fallback", () => {
  const banned = /good to go|safe to|get off the water|cat 1|cancel/i;
  for (const label of Object.values(STATUS_LABELS)) assert.doesNotMatch(label, banned);
  assert.doesNotMatch(errorMessage("http", 500), banned);
});

test("error messages", () => {
  assert.equal(errorMessage("http", 404), "This spot isn't available yet.");
  assert.equal(errorMessage("http", 422), "That sport or level isn't supported at this spot.");
  assert.equal(errorMessage("http", 500), "Conditions are unavailable right now.");
  assert.equal(errorMessage("timeout"), "Conditions took too long to load.");
  assert.equal(errorMessage("network"), "Couldn't reach the conditions service.");
});
