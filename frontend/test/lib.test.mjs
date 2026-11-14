import { test } from "node:test";
import assert from "node:assert/strict";
import {
  degreesToCardinal, formatTimeSGT, agoText, levelFromQuery, isSafeHttpsUrl,
  catalogActivitiesUrl, catalogSpotsUrl, conditionsUrl, selectionFromQuery, pickOption,
  errorMessage, buildView, buildAlert, pillLabel, notAssessed, STATUS_LABELS,
} from "../lib.js";

const CONFIG = { API_BASE: "http://127.0.0.1:8000/" };

// The real East Coast response, with the newer fields added.
const NORMAL = {
  spot: { slug: "east-coast", name: "East Coast Parkway (Carpark E5)" },
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
    wind_status: "outside",
    wind_summary: "Wind is 1.5 km/h (0.8 knots), below the WSK reference range of 8 to 20 km/h for beginner windsurf. This is not a safety assessment.",
    wind_reasons: [],
    scope: { wind_speed: true, direction: false, gusts: false },
    flags: [
      { code: "no_strikes_observed", severity: "info", message: "No strikes observed within 20 km in the last 30 minutes. This is not an all-clear. Data may be delayed." },
      { code: "rules_unreviewed", severity: "info", message: "These reference ranges have not been reviewed by an instructor." },
      { code: "gusts_not_available", severity: "info", message: "Gust data is not available, so gusts are not part of this assessment." },
      { code: "direction_not_assessed", severity: "info", message: "Wind direction relative to the shore is not assessed for this spot yet." },
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

const withLightning = (n, nearest) => {
  const p = structuredClone(NORMAL);
  p.observations.lightning = { strikes_within_radius: n, nearest_km: nearest, radius_km: 20, lookback_min: 30, fetched_at: NORMAL.generated_at, age_min: 0, stale: false };
  p.guidance.flags.unshift({ code: "lightning_observed", severity: "hazard", message: "Lightning detected nearby: 3 strike(s)..." });
  p.guidance.status = "flagged";
  p.guidance.summary = "Lightning detected nearby: 3 strike(s)...";
  return p;
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

test("urls are built from config and the selection", () => {
  assert.equal(catalogActivitiesUrl(CONFIG), "http://127.0.0.1:8000/api/catalog/activities");
  assert.equal(catalogSpotsUrl(CONFIG, "windsurf"), "http://127.0.0.1:8000/api/catalog/spots?activity=windsurf");
  assert.equal(
    conditionsUrl(CONFIG, { spot: "east-coast", activity: "windsurf", level: "beginner" }),
    "http://127.0.0.1:8000/api/spots/east-coast/conditions?activity=windsurf&level=beginner",
  );
});

test("selection comes from the query and options never get invented", () => {
  const sel = selectionFromQuery("?activity=windsurf&spot=marina&level=advanced");
  assert.deepEqual(sel, { activity: "windsurf", spot: "marina", level: "advanced" });
  const opts = [{ slug: "a", name: "A" }, { slug: "b", name: "B" }];
  assert.equal(pickOption(opts, "b").slug, "b");
  assert.equal(pickOption(opts, "zzz").slug, "a");   // unknown falls back to the first real option
  assert.equal(pickOption(opts, null).slug, "a");
  assert.equal(pickOption([], "a"), null);
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
  assert.equal(v.windLine, "Wind now: 0.8 kn, from NNE (32°)");
  assert.equal(v.lightning.headline, "No strikes observed within 20 km in the last 30 min");
  assert.match(v.lightning.detail, /not an all-clear/);
  assert.equal(v.levelLabel, "Beginner");
  assert.equal(v.updated, "20:38");
  assert.equal(v.alert, null);
});

test("guidance shows the wind result without repeating other items", () => {
  const g = buildView(NORMAL).guidance;
  assert.equal(g.statusLabel, "Outside WSK reference range");
  assert.match(g.summary, /below the WSK reference range/);
  assert.deepEqual(g.notAssessed, ["wind direction relative to the shore", "gusts"]);
  // lightning and "not assessed" flags are shown elsewhere, so only the review note remains
  assert.deepEqual(g.flags.map((f) => f.message), ["These reference ranges have not been reviewed by an instructor."]);
});

test("a within-range result is labelled as wind speed only until direction and gusts exist", () => {
  const p = structuredClone(NORMAL);
  p.guidance.wind_status = "within";
  assert.equal(buildView(p).guidance.statusLabel, "Wind speed only: within WSK reference range");
  p.guidance.scope = { wind_speed: true, direction: true, gusts: true };
  assert.equal(buildView(p).guidance.statusLabel, STATUS_LABELS.within_reference_range);
  assert.deepEqual(buildView(p).guidance.notAssessed, []);
});

test("nearby lightning is one alert at the top and not repeated in the guidance", () => {
  const v = buildView(withLightning(3, 8.2));
  assert.equal(v.alert.kind, "lightning");
  assert.equal(v.alert.title, "Lightning detected nearby");
  assert.match(v.alert.text, /3 strikes within 20 km/);
  assert.match(v.alert.text, /8\.2 km/);
  assert.match(v.alert.text, /official advisories/);
  assert.ok(!v.guidance.flags.some((f) => /Lightning/.test(f.message)));
  assert.doesNotMatch(v.guidance.summary, /Lightning/);
  assert.equal(v.lightning.headline, "Lightning detected nearby");  // details still hold the facts
});

test("alerts for missing or old lightning data", () => {
  assert.equal(buildAlert(null).kind, "unavailable");
  assert.equal(buildAlert(null).title, "Lightning data unavailable");
  const old = { strikes_within_radius: 0, radius_km: 20, lookback_min: 30, stale: true };
  assert.equal(buildAlert(old).title, "Lightning data is out of date");
  assert.equal(buildAlert({ strikes_within_radius: 0, radius_km: 20, lookback_min: 30, stale: false }), null);
  assert.equal(buildAlert({ strikes_within_radius: 1, nearest_km: 2, radius_km: 20, lookback_min: 30 }).title, "Lightning data is out of date"); // missing stale flag counts as stale
});

test("unsafe or non-https advisory links are dropped", () => {
  assert.deepEqual(buildView(NORMAL).advisories.map((a) => a.label), ["Meteorological Service Singapore"]);
});

test("missing feeds show unavailable, never a favourable state", () => {
  const p = structuredClone(NORMAL);
  p.observations = { wind: null, gusts: null, lightning: null };
  p.guidance = {
    status: "unavailable", summary: "x", wind_status: "unavailable",
    wind_reasons: ["wind data unavailable"], scope: { wind_speed: false, direction: false, gusts: false }, flags: [],
  };
  const v = buildView(p);
  assert.equal(v.wind, null);
  assert.equal(v.windLine, null);
  assert.equal(v.windMessage, "Wind data unavailable.");
  assert.equal(v.alert.title, "Lightning data unavailable");
  assert.equal(v.guidance.statusLabel, "Assessment unavailable");
  assert.match(v.guidance.summary, /Wind assessment unavailable: wind data unavailable/);
  assert.match(v.guidance.summary, /Check official advisories/);
  assert.deepEqual(v.guidance.notAssessed, []);
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
  p.guidance = { status: "not_published", summary: "Guidance for this sport and level is awaiting instructor review.", flags: [], wind_status: null, scope: {} };
  const v = buildView(p);
  assert.equal(v.guidance.statusLabel, "Awaiting instructor review");
  assert.match(v.guidance.summary, /awaiting instructor review/);
});

test("pill labels cover every state, and unknown input is never favourable", () => {
  assert.equal(pillLabel({ wind_status: "not_applicable", scope: {} }), "Wind limits not applicable");
  assert.equal(pillLabel({ wind_status: "unavailable", scope: {} }), "Assessment unavailable");
  assert.equal(pillLabel({ status: "within_reference_range" }), "Within WSK reference range"); // older API shape
  assert.equal(pillLabel({ status: "all_good" }), STATUS_LABELS.unavailable);
  assert.equal(pillLabel({}), STATUS_LABELS.unavailable);
  assert.deepEqual(notAssessed({ wind_status: "unavailable" }), []);
});

test("no verdict wording in any label or fallback", () => {
  const banned = /good to go|safe to|get off the water|cat 1|cancel/i;
  for (const label of Object.values(STATUS_LABELS)) assert.doesNotMatch(label, banned);
  assert.doesNotMatch(errorMessage("http", 500), banned);
  assert.doesNotMatch(buildView(withLightning(2, 5)).alert.text, banned);
});

test("error messages", () => {
  assert.equal(errorMessage("http", 404), "This spot isn't available yet.");
  assert.equal(errorMessage("http", 422), "That sport or level isn't supported at this spot.");
  assert.equal(errorMessage("http", 500), "Conditions are unavailable right now.");
  assert.equal(errorMessage("timeout"), "Conditions took too long to load.");
  assert.equal(errorMessage("network"), "Couldn't reach the conditions service.");
});
