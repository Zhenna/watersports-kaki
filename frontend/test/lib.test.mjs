import { test } from "node:test";
import assert from "node:assert/strict";
import {
  degreesToCardinal, beaufortName, formatTimeSGT, agoText, levelFromQuery, isSafeHttpsUrl,
  upcomingDays, planSummary, formHint, SLOTS, forecastUrl, buildForecastView,
  catalogActivitiesUrl, catalogSpotsUrl, conditionsUrl, selectionFromQuery, pickOption,
  errorMessage, buildView, buildAlert, pillLabel, notAssessed, STATUS_LABELS,
} from "../lib.js";

const CONFIG = { API_BASE: "http://127.0.0.1:8000/" };

const R1 = { station_id: "S43", station_name: "Kim Chuan Road", distance_km: 5.1, selection: "nearest", kmh: 5.7, knots: 3.1 };
const R2 = { station_id: "S108", station_name: "Marina Barrage", distance_km: 5.4, selection: "nearest", kmh: 10.9, knots: 5.9 };

const lightningQuiet = {
  strikes_within_radius: 0, nearest_km: 44.3, radius_km: 20, lookback_min: 30,
  fetched_at: "2026-11-04T20:38:50.592737+08:00", age_min: 0, stale: false,
};

// Two stations that straddle the beginner range: the situation seen at East Coast.
const TWO = {
  spot: { slug: "east-coast", name: "East Coast Parkway (Carpark E5)" },
  activity: "windsurf",
  level: "beginner",
  generated_at: "2026-11-04T20:38:50.593168+08:00",
  observations: {
    wind: {
      kmh: 5.7, knots: 3.1, kmh_min: 5.7, kmh_max: 10.9, knots_min: 3.1, knots_max: 5.9,
      readings: [R1, R2], from_deg: 32,
      observed_at: "2026-11-04T20:34:00+08:00", age_min: 4.8, stale: false,
      note: "Wind readings come from 2 nearby stations (Kim Chuan Road, Marina Barrage), 5.1 to 5.4 km from this spot. Stations can disagree, and conditions at the spot can differ.",
    },
    wind_message: null,
    gusts: null,
    lightning: lightningQuiet,
  },
  guidance: {
    status: "inconclusive",
    summary: "x",
    wind_status: "inconclusive",
    wind_position: "mixed",
    wind_summary: "Nearby stations report 5.7 to 10.9 km/h (3.1 to 5.9 knots), which straddles the WSK reference range of 8 to 20 km/h for beginner windsurf, so this assessment is inconclusive. This is not a safety assessment.",
    wind_reasons: [],
    scope: { wind_speed: false, direction: false, gusts: false },
    flags: [
      { code: "no_strikes_observed", severity: "info", message: "No strikes observed within 20 km in the last 30 minutes. This is not an all-clear. Data may be delayed." },
      { code: "rules_unreviewed", severity: "info", message: "These reference ranges have not been reviewed by an instructor." },
      { code: "gusts_not_available", severity: "info", message: "Gust data is not available." },
      { code: "direction_not_assessed", severity: "info", message: "Direction not assessed." },
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

function single(kn, windStatus, { reviewed = false, scope = { wind_speed: true, direction: false, gusts: false } } = {}) {
  const p = structuredClone(TWO);
  const kmh = kn * 1.852;
  const r = { ...R1, kmh: Number(kmh.toFixed(1)), knots: kn };
  p.observations.wind = { ...p.observations.wind, kmh: r.kmh, knots: kn, kmh_min: r.kmh, kmh_max: r.kmh,
                          knots_min: kn, knots_max: kn, readings: [r], note: null };
  p.guidance.status = windStatus === "within" ? "within_reference_range" : "outside_reference_range";
  p.guidance.wind_status = windStatus;
  p.guidance.wind_position = windStatus === "within" ? "within" : "below";
  p.guidance.wind_summary = `Wind is ${kmh.toFixed(1)} km/h (${kn.toFixed(1)} knots), ${windStatus === "within" ? "within" : "below"} the WSK reference range of 8 to 20 km/h for beginner windsurf. This is not a safety clearance.`;
  p.guidance.scope = scope;
  p.guidance.review_status = reviewed ? "reviewed" : "unreviewed";
  return p;
}

const withLightning = (n, nearest) => {
  const p = structuredClone(TWO);
  p.observations.lightning = { strikes_within_radius: n, nearest_km: nearest, radius_km: 20, lookback_min: 30, fetched_at: TWO.generated_at, age_min: 0, stale: false };
  p.guidance.flags.unshift({ code: "lightning_observed", severity: "hazard", message: "Lightning detected nearby: repeated text" });
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

test("Beaufort names follow the standard knot bands", () => {
  assert.equal(beaufortName(0), "Calm");
  assert.equal(beaufortName(0.8), "Light air");     // rounds to 1
  assert.equal(beaufortName(3.1), "Light air");
  assert.equal(beaufortName(5.9), "Light breeze");
  assert.equal(beaufortName(9), "Gentle breeze");
  assert.equal(beaufortName(12), "Moderate breeze");
  assert.equal(beaufortName(18), "Fresh breeze");
  assert.equal(beaufortName(25), "Strong breeze");
  assert.equal(beaufortName(30), "Near gale");
  assert.equal(beaufortName(70), "Hurricane force");
  assert.equal(beaufortName(null), null);
  assert.equal(beaufortName(-1), null);
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
  assert.equal(
    forecastUrl(CONFIG, { spot: "east-coast", activity: "windsurf", level: "beginner" }),
    "http://127.0.0.1:8000/api/spots/east-coast/forecast?activity=windsurf&level=beginner",
  );
});

test("selection comes from the query and options never get invented", () => {
  assert.deepEqual(selectionFromQuery("?activity=windsurf&spot=marina&level=advanced"),
                   { activity: "windsurf", spot: "marina", level: "advanced", tab: "now" });
  assert.equal(selectionFromQuery("?tab=plan").tab, "plan");
  assert.equal(selectionFromQuery("?tab=elsewhere").tab, "now");
  const opts = [{ slug: "a", name: "A" }, { slug: "b", name: "B" }];
  assert.equal(pickOption(opts, "b").slug, "b");
  assert.equal(pickOption(opts, "zzz").slug, "a");
  assert.equal(pickOption(opts, null).slug, "a");
  assert.equal(pickOption([], "a"), null);
});

test("several stations are shown as a range, with every station listed", () => {
  const v = buildView(TWO);
  assert.equal(v.wind.big, "3.1 to 5.9 kn");
  assert.equal(v.wind.sub, "5.7 to 10.9 km/h");
  assert.equal(v.wind.directionShort, "From NNE \u00b7 32\u00b0");
  assert.equal(v.wind.source, "2 nearby stations");
  assert.equal(v.wind.sourceSub, "5.1 to 5.4 km from spot");
  assert.deepEqual(v.wind.stations, [
    "Kim Chuan Road, 5.1 km away: 3.1 kn (5.7 km/h)",
    "Marina Barrage, 5.4 km away: 5.9 kn (10.9 km/h)",
  ]);
  assert.equal(v.headline, "Light air to light breeze");
  assert.equal(v.windLine, "3.1 to 5.9 kn \u00b7 From NNE \u00b7 32\u00b0");
  assert.match(v.wind.note, /Stations can disagree/);
  assert.equal(v.wind.observed, "Observed 20:34 SGT, 5 min ago");
  assert.equal(v.updated, "20:38");
});

test("stations that straddle the range are shown as disagreeing and never as suitable", () => {
  const g = buildView(TWO).guidance;
  assert.equal(g.statusLabel, "Stations disagree");
  assert.equal(g.summary, "Nearby stations fall on both sides of the range.");
  assert.match(g.detail, /straddles the provisional reference range/);
  assert.match(g.detail, /inconclusive/);
  assert.doesNotMatch(g.statusLabel, /within/i);
});

test("the limits are one short line, not several notes", () => {
  const g = buildView(TWO).guidance;
  assert.equal(g.limitations, "Wind speed only. Gusts and shore-relative direction not assessed. Ranges provisional.");
  assert.deepEqual(g.flags, []);   // every note was folded into the limits line or shown elsewhere
});

test("a single station gives a plain headline, and the pill says which side of the range", () => {
  const v = buildView(single(4.8, "outside"));
  assert.equal(v.headline, "Light breeze");
  assert.equal(v.wind.big, "4.8 kn");
  assert.equal(v.wind.source, "Kim Chuan Road");
  assert.equal(v.wind.sourceSub, "5.1 km from spot");
  assert.equal(v.guidance.statusLabel, "Below provisional range");
  assert.equal(v.guidance.summary, null);      // the pill and the figures already say it
  assert.match(v.guidance.detail, /below the provisional reference range/);
  assert.match(v.guidance.limitations, /^Wind speed only\./);
});

test("above the range and within the range are labelled too", () => {
  const above = single(25, "outside");
  above.guidance.wind_position = "above";
  assert.equal(buildView(above).guidance.statusLabel, "Above provisional range");
  assert.equal(buildView(single(6, "within")).guidance.statusLabel, "Within provisional range");
  const older = single(25, "outside");
  delete older.guidance.wind_position;          // an older API response
  assert.equal(buildView(older).guidance.statusLabel, "Outside provisional range");
});

test("range wording is provisional until the rules are reviewed", () => {
  const reviewed = single(6, "within", { reviewed: true, scope: { wind_speed: true, direction: true, gusts: true } });
  assert.equal(buildView(reviewed).guidance.statusLabel, "Within reference range");
  assert.equal(buildView(reviewed).guidance.limitations, null);   // nothing left to caveat
  assert.deepEqual(notAssessed(reviewed.guidance), []);
  const gustsOnly = single(6, "within", { reviewed: true, scope: { wind_speed: true, direction: true, gusts: false } });
  assert.equal(buildView(gustsOnly).guidance.limitations, "Gusts not assessed.");
  const directionOnly = single(6, "within", { scope: { wind_speed: true, direction: false, gusts: true } });
  assert.equal(buildView(directionOnly).guidance.limitations, "Shore-relative direction not assessed. Ranges provisional.");
});

test("not-assessed items are listed in a fixed order", () => {
  assert.deepEqual(notAssessed({ wind_status: "within", scope: { wind_speed: true } }),
                   ["gusts", "wind direction relative to the shore"]);
  assert.deepEqual(notAssessed({ wind_status: "unavailable" }), []);
});

test("quiet lightning is a short neutral panel, never an all-clear, with the rest as details", () => {
  const c = buildView(TWO).lightningCard;
  assert.equal(c.kind, "quiet");
  assert.equal(c.headline, "No strikes observed");
  assert.equal(c.pill, "Not an all-clear");
  assert.equal(c.line, "Within 20 km of this spot, last 30 min");
  assert.deepEqual(c.detail, [
    "No strikes within 20 km of East Coast Parkway (Carpark E5) in the last 30 minutes. This is not an all-clear.",
    "Nearest strike: 44.3 km from the spot.",
    "Checked 20:38 SGT, just now.",
    "Lightning data can lag by a few minutes.",
    "Source: NEA lightning observations via data.gov.sg. Each point is a detected strike, not a station.",
  ]);
});

test("nearby lightning is one prominent panel and is not repeated in the wind guidance", () => {
  const v = buildView(withLightning(3, 8.2));
  const c = v.lightningCard;
  assert.equal(c.kind, "alert");
  assert.equal(c.headline, "Lightning detected nearby");
  assert.equal(c.pill, "Follow official advisories");
  assert.equal(c.line, "3 strikes within 20 km of this spot \u00b7 nearest 8.2 km");
  assert.match(c.detail.join(" "), /3 strikes within 20 km of East Coast Parkway \(Carpark E5\)/);
  assert.match(c.detail.join(" "), /not a station/);
  assert.match(c.detail.join(" "), /Follow official advisories and your operator's procedures/);
  assert.ok(!v.guidance.flags.some((f) => /Lightning/.test(f.message)));
  assert.doesNotMatch(v.guidance.summary ?? "", /Lightning/);
  assert.equal(buildView(withLightning(1, 5)).lightningCard.line, "1 strike within 20 km of this spot \u00b7 nearest 5 km");
});

test("missing or old lightning data is a visible panel, not silence", () => {
  assert.equal(buildAlert(null).title, "Lightning data unavailable");
  const missing = structuredClone(TWO);
  missing.observations.lightning = null;
  const m = buildView(missing).lightningCard;
  assert.equal(m.kind, "unavailable");
  assert.equal(m.headline, "Lightning data unavailable");
  assert.equal(m.pill, "Check official advisories");
  const old = structuredClone(TWO);
  old.observations.lightning.stale = true;
  assert.equal(buildView(old).lightningCard.headline, "Lightning data is out of date");
  assert.equal(buildAlert({ strikes_within_radius: 0, radius_km: 20, lookback_min: 30, stale: false }), null);
  assert.equal(buildAlert({ strikes_within_radius: 1, nearest_km: 2, radius_km: 20, lookback_min: 30 }).title, "Lightning data is out of date");
});

test("unsafe or non-https advisory links are dropped", () => {
  assert.deepEqual(buildView(TWO).advisories.map((a) => a.label), ["Meteorological Service Singapore"]);
});

test("missing wind shows unavailable, and says when no station is close enough", () => {
  const p = structuredClone(TWO);
  p.observations = { wind: null, wind_message: null, gusts: null, lightning: null };
  p.guidance = { status: "unavailable", summary: "x", wind_status: "unavailable",
                 wind_reasons: ["wind data unavailable"], scope: {}, flags: [] };
  const v = buildView(p);
  assert.equal(v.wind, null);
  assert.equal(v.headline, null);
  assert.equal(v.windMessage, "Wind data unavailable.");
  assert.equal(v.lightningCard.headline, "Lightning data unavailable");
  assert.equal(v.guidance.statusLabel, "Assessment unavailable");
  assert.match(v.guidance.summary, /Wind assessment unavailable: wind data unavailable/);
  assert.match(v.guidance.summary, /Check official advisories/);
  assert.equal(v.guidance.limitations, null);

  p.observations.wind_message = "No wind-reporting station within 10 km of this spot.";
  assert.equal(buildView(p).windMessage, "No wind-reporting station within 10 km of this spot.");
});

test("stale readings are marked, and a missing stale flag counts as stale", () => {
  const p = structuredClone(TWO);
  p.observations.wind.stale = true;
  assert.equal(buildView(p).wind.stale, true);
  delete p.observations.wind.stale;
  assert.equal(buildView(p).wind.stale, true);
});

test("unreviewed guidance is shown as awaiting review, with the facts intact", () => {
  const p = structuredClone(TWO);
  p.guidance = { status: "not_published", summary: "Guidance for this sport and level is awaiting instructor review.", flags: [], wind_status: null, scope: {}, review_status: "unreviewed" };
  const v = buildView(p);
  assert.equal(v.guidance.statusLabel, "Awaiting instructor review");
  assert.equal(v.guidance.summary, "Guidance awaits instructor review.");
  assert.equal(v.guidance.detail, null);
  assert.equal(v.guidance.limitations, null);
  assert.equal(v.headline, "Light air to light breeze");
  assert.equal(v.wind.source, "2 nearby stations");
});

test("pill labels cover every state, and unknown input is never favourable", () => {
  assert.equal(pillLabel({ wind_status: "not_applicable", scope: {} }), "Wind limits not applicable");
  assert.equal(pillLabel({ wind_status: "unavailable", scope: {} }), "Assessment unavailable");
  assert.equal(pillLabel({ status: "within_reference_range" }), "Within reference range"); // older API shape
  assert.equal(pillLabel({ status: "all_good" }), STATUS_LABELS.unavailable);
  assert.equal(pillLabel({}), STATUS_LABELS.unavailable);
});

test("no verdict wording in any label or fallback", () => {
  const banned = /good to go|safe to|get off the water|cat 1|cancel/i;
  for (const label of Object.values(STATUS_LABELS)) assert.doesNotMatch(label, banned);
  assert.doesNotMatch(errorMessage("http", 500), banned);
  assert.doesNotMatch(buildView(withLightning(2, 5)).lightningCard.detail.join(" "), banned);
  const g = buildView(TWO).guidance;
  assert.doesNotMatch(`${g.statusLabel} ${g.summary} ${g.detail} ${g.limitations}`, banned);
});

test("error messages", () => {
  assert.equal(errorMessage("http", 404), "This spot isn't available yet.");
  assert.equal(errorMessage("http", 422), "That sport or level isn't supported at this spot.");
  assert.equal(errorMessage("http", 500), "Conditions are unavailable right now.");
  assert.equal(errorMessage("timeout"), "Conditions took too long to load.");
  assert.equal(errorMessage("network"), "Couldn't reach the conditions service.");
});

test("the planner offers the next seven days, counted by the Singapore calendar", () => {
  const labels = (now) => upcomingDays(new Date(now)).map((d) => d.label);
  assert.deepEqual(labels("2026-11-15T10:00:00+08:00"), [
    "Mon, 16 Nov", "Tue, 17 Nov", "Wed, 18 Nov", "Thu, 19 Nov", "Fri, 20 Nov", "Sat, 21 Nov", "Sun, 22 Nov"]);
  // 17:00 UTC on Saturday 14 Nov is already Sunday 15 Nov, 01:00 in Singapore
  assert.equal(labels("2026-11-14T17:00:00Z")[0], "Mon, 16 Nov");
  // Saturday 23:30 in Singapore: tomorrow is Sunday 15 Nov
  assert.equal(labels("2026-11-14T23:30:00+08:00")[0], "Sun, 15 Nov");
  assert.equal(upcomingDays(new Date("2026-11-15T10:00:00+08:00"), 3).length, 3);
  const days = upcomingDays(new Date("2026-11-15T10:00:00+08:00"));
  assert.deepEqual(days.filter((d) => d.weekend).map((d) => d.short), ["Sat", "Sun"]);
  assert.equal(days[0].iso, "2026-11-16");
});

test("the planner uses AM and PM only, with no hour ranges", () => {
  assert.deepEqual(SLOTS.map((s) => s.key), ["AM", "PM"]);
  assert.deepEqual(SLOTS.map((s) => s.sub), ["Morning", "Afternoon"]);
  assert.doesNotMatch(JSON.stringify(SLOTS), /\d/);
});

test("the plan summary and form hint match the form's options, for one slot or both", () => {
  const sat = { iso: "2026-11-21", short: "Sat", weekend: true, label: "Sat, 21 Nov", long: "Saturday, 21 November", num: 21 };
  const mon = { iso: "2026-11-16", short: "Mon", weekend: false, label: "Mon, 16 Nov", num: 16 };
  assert.equal(planSummary(sat, ["AM"]), "Saturday, 21 November \u00b7 AM");
  assert.equal(planSummary(sat, ["AM", "PM"]), "Saturday, 21 November \u00b7 AM and PM");
  assert.equal(planSummary(sat, "PM"), "Saturday, 21 November \u00b7 PM");
  assert.equal(formHint(sat, ["PM"]), "In the form, tick Sat PM.");
  assert.equal(formHint(sat, ["AM", "PM"]), "In the form, tick Sat AM and Sat PM.");
  assert.equal(formHint(mon, ["AM"]), "Weekday times aren't in the form yet.");
  assert.doesNotMatch(formHint(mon, ["AM", "PM"]), /evening/i);
  assert.equal(planSummary(null, ["AM"]), "");
  assert.equal(formHint(null, ["AM"]), "");
});

test("each date also has a full name for the selected-session card", () => {
  const days = upcomingDays(new Date("2026-11-15T10:00:00+08:00"));
  assert.equal(days[0].long, "Monday, 16 November");
  assert.equal(days[5].long, "Saturday, 21 November");
  assert.equal(days[6].long, "Sunday, 22 November");
});

test("each date has a short day name and a number for the scrolling row", () => {
  const days = upcomingDays(new Date("2026-11-15T10:00:00+08:00"));
  assert.deepEqual(days.map((d) => `${d.short} ${d.num}`),
    ["Mon 16", "Tue 17", "Wed 18", "Thu 19", "Fri 20", "Sat 21", "Sun 22"]);
});

// ---------- plan ahead ----------
const MON = { iso: "2026-11-16", short: "Mon", weekend: false, label: "Mon, 16 Nov" };
const TUE = { iso: "2026-11-17", short: "Tue", weekend: false, label: "Tue, 17 Nov" };
const NEXT_MON = { iso: "2026-11-23", short: "Mon", weekend: false, label: "Mon, 23 Nov" };

function fday(date, low, high, status, position, extra = {}) {
  return {
    date, source: "nea_4day", stale: false,
    wind: { kmh_low: low, kmh_high: high, knots_low: Number((low / 1.852).toFixed(1)),
            knots_high: Number((high / 1.852).toFixed(1)), direction: "NE", from_deg: 45 },
    weather: "Afternoon thundery showers", thundery: true,
    slots: { AM: { text: "Fair (Day)", thundery: false, source: "nea_24h" },
             PM: { text: "Thundery Showers", thundery: true, source: "nea_24h" } },
    guidance: { status: "x", summary: "x", wind_status: status, wind_position: position,
                wind_summary: "Forecast wind ...", wind_reasons: [],
                scope: { wind_speed: status !== "unavailable", direction: false, gusts: false },
                flags: [], review_status: "unreviewed" },
    ...extra,
  };
}

const FORECAST = {
  available: true, horizon_days: 4, note: "Island-wide NEA forecast, not specific to this spot.",
  days: [fday("2026-11-16", 10, 20, "within", "within"), fday("2026-11-17", 2, 6, "outside", "below")],
};

test("a forecast day: wind first when it is fine, with the weather for the chosen time", () => {
  const am = buildForecastView(FORECAST, MON, ["AM"]);
  assert.equal(am.state, "ok");
  assert.equal(am.thunderNotice, null);
  assert.deepEqual(am.weatherLines, ["Morning: Fair (Day)"]);
  assert.equal(am.headline, "Light breeze to moderate breeze");
  assert.equal(am.pill, "Within provisional range");
  assert.equal(am.windLine, "5.4 to 10.8 kn \u00b7 From NE");
  assert.equal(am.summary, null);
  assert.equal(
    am.small,
    "Island-wide NEA forecast, not specific to this spot. " +
    "Wind speed only. Gusts and shore-relative direction not assessed. Ranges provisional.",
  );
});

test("thunder comes first and is said once, not three times", () => {
  const pm = buildForecastView(FORECAST, MON, ["PM"]);
  assert.equal(pm.thunderNotice, "Thundery showers forecast for the afternoon.");
  assert.deepEqual(pm.weatherLines, []);          // the thundery slot is not repeated as a weather line
  const both = buildForecastView(FORECAST, MON, ["AM", "PM"]);
  assert.equal(both.thunderNotice, "Thundery showers forecast for the afternoon.");
  assert.deepEqual(both.weatherLines, ["Morning: Fair (Day)"]);
  const p = structuredClone(FORECAST);
  p.days[0].slots.AM = { text: "Thundery Showers", thundery: true, source: "nea_24h" };
  assert.equal(buildForecastView(p, MON, ["AM", "PM"]).thunderNotice,
               "Thundery showers forecast for the morning and afternoon.");
});

test("a forecast day below the range says so", () => {
  assert.equal(buildForecastView(FORECAST, TUE, ["AM"]).pill, "Below provisional range");
});

test("a range that spans the reference range is not called suitable, and is said once", () => {
  const p = structuredClone(FORECAST);
  p.days[0].guidance.wind_status = "inconclusive";
  p.days[0].guidance.wind_position = "mixed";
  const v = buildForecastView(p, MON, ["AM"]);
  assert.equal(v.pill, "Spans the range");
  assert.equal(v.summary, null);                  // the pill already says it
});

test("a day beyond the outlook says so, and a missing forecast is never invented", () => {
  const v = buildForecastView(FORECAST, NEXT_MON, ["AM"]);
  assert.equal(v.state, "none");
  assert.equal(v.message, "No forecast for Mon, 23 Nov yet. NEA's outlook covers the next 4 days.");
  assert.equal(buildForecastView({ available: false, days: [] }, MON, ["AM"]).message, "Forecast unavailable right now.");
  assert.equal(buildForecastView(null, MON, ["AM"]).message, "Forecast unavailable right now.");
  assert.equal(buildForecastView(FORECAST, null, ["AM"]).message, "Choose a day.");
});

test("an old or unavailable forecast fails closed", () => {
  const p = structuredClone(FORECAST);
  p.days[0].stale = true;
  p.days[0].guidance.wind_status = "unavailable";
  p.days[0].guidance.wind_position = null;
  p.days[0].guidance.wind_reasons = ["wind data is out of date"];
  const v = buildForecastView(p, MON, ["AM"]);
  assert.equal(v.pill, "Assessment unavailable");
  assert.match(v.summary, /Wind assessment unavailable: wind data is out of date/);
  assert.equal(v.stale, true);
});

test("the forecast never mentions lightning observations, which are live only", () => {
  const v = buildForecastView(FORECAST, MON, ["AM", "PM"]);
  assert.doesNotMatch(JSON.stringify(v), /lightning|strike/i);
});

test("forecast wording has no verdict language", () => {
  const banned = /good to go|safe to|get off the water|cat 1|cancel/i;
  for (const day of [MON, TUE]) {
    const v = buildForecastView(FORECAST, day, ["AM", "PM"]);
    assert.doesNotMatch(`${v.thunderNotice} ${v.weatherLines.join(" ")} ${v.headline} ${v.pill} ${v.windLine} ${v.small}`, banned);
  }
});
