import test from "node:test";
import assert from "node:assert/strict";
import { PLAN_PERIODS, windDirectionDeg, weatherTitle, weatherIcon, planDayView } from "../lib.js";

const day = { iso: "2026-11-24", label: "Tue, 24 Nov", long: "Tuesday, 24 November" };
const forecastDay = (over = {}) => ({
  date: "2026-11-24", stale: false,
  wind: { knots_low: 5.4, knots_high: 10.8, direction: "NNE" },
  slots: { AM: { text: "Partly Cloudy (Day)", thundery: false }, PM: { text: "Thundery Showers", thundery: true } },
  guidance: {},
  tide: { am: "Rising", pm: "Falling" },
  ...over,
});
const payload = (d = forecastDay(), over = {}) => ({ available: true, horizon_days: 4, note: "NEA outlook", tide_note: "Predicted, not measured.", days: [d], ...over });

test("the two periods are AM and PM with NEA's hours", () => {
  assert.deepEqual(PLAN_PERIODS.map((p) => [p.key, p.slot, p.label, p.sub, p.hours]),
    [["am", "AM", "AM", "morning", "6am \u2013 12pm"], ["pm", "PM", "PM", "afternoon", "12pm \u2013 6pm"]]);
});

test("a wind direction becomes degrees, from a code or a word, and anything else is null", () => {
  assert.equal(windDirectionDeg("NNE"), 22.5);
  assert.equal(windDirectionDeg("nne"), 22.5);
  assert.equal(windDirectionDeg(" N "), 0);
  assert.equal(windDirectionDeg("Northeast"), 45);
  assert.equal(windDirectionDeg("SOUTHWEST"), 225);
  assert.equal(windDirectionDeg("NNW"), 337.5);
  for (const bad of ["", "x", "Variable", "__proto__", "toString", null, undefined, 5, {}]) assert.equal(windDirectionDeg(bad), null, String(bad));
});

test("a forecast text becomes a short sentence-case title", () => {
  assert.equal(weatherTitle("Partly Cloudy (Day)"), "Partly cloudy");
  assert.equal(weatherTitle("Thundery Showers"), "Thundery showers");
  assert.equal(weatherTitle("  Fair   (Night)  "), "Fair");
  assert.equal(weatherTitle("Light Rain"), "Light rain");
  for (const bad of ["", "   ", "(Day)", null, undefined, 5]) assert.equal(weatherTitle(bad), null, String(bad));
});

test("a forecast text picks a picture, thunder first", () => {
  assert.equal(weatherIcon("Thundery Showers"), "thunder");
  assert.equal(weatherIcon("Showers"), "rain");
  assert.equal(weatherIcon("Light Rain"), "rain");
  assert.equal(weatherIcon("Partly Cloudy (Day)"), "partly");
  assert.equal(weatherIcon("Cloudy"), "cloud");
  assert.equal(weatherIcon("Fair (Day)"), "sun");
  assert.equal(weatherIcon("Hazy"), "cloud");
  for (const odd of ["", "Something new", null, undefined, 5]) assert.equal(weatherIcon(odd), "none", String(odd));
});

test("a day with a forecast gives two periods, the wind, the tide and the thunder note", () => {
  const v = planDayView(payload(), day);
  assert.equal(v.state, "ok");
  assert.deepEqual(v.periods.map((p) => [p.key, p.title, p.icon, p.thundery, p.tide]),
    [["am", "Partly cloudy", "partly", false, "Rising"], ["pm", "Thundery showers", "thunder", true, "Falling"]]);
  assert.deepEqual(v.wind, { range: "5.4 to 10.8 kn", direction: "NNE", deg: 22.5 });
  assert.equal(v.thunderNotice, "Thundery showers forecast for the afternoon.");
  assert.equal(v.tidePredicted, true);
  assert.equal(v.tideNote, "Predicted, not measured.");
  assert.equal("tide" in v, false);                                                                 // no hourly tide any more
  assert.equal(v.stale, false);
});

test("the wind assessment line keeps the wording the old card used", () => {
  const v = planDayView(payload(), day);
  assert.ok(v.assessment);
  assert.equal(typeof v.assessment.pill, "string");
  assert.ok(v.assessment.headline);
  assert.equal(typeof v.small, "string");
});

test("one wind figure is shown once, not as a range", () => {
  const v = planDayView(payload(forecastDay({ wind: { knots_low: 6, knots_high: 6, direction: "NE" } })), day);
  assert.equal(v.wind.range, "6.0 kn");
});

test("missing or odd data is null, so the card says Not available and never guesses", () => {
  assert.equal(planDayView(payload(forecastDay({ wind: null })), day).wind, null);
  assert.equal(planDayView(payload(forecastDay({ wind: { knots_low: "x", knots_high: 5 } })), day).wind, null);
  const noDir = planDayView(payload(forecastDay({ wind: { knots_low: 5, knots_high: 9, direction: "Variable" } })), day).wind;
  assert.equal(noDir.direction, "Variable");
  assert.equal(noDir.deg, null);                                                                   // no arrow, but the text stays
  assert.equal(planDayView(payload(forecastDay({ tide: undefined })), day).tidePredicted, false);   // no tide word, so no claim about one
  assert.deepEqual(planDayView(payload(forecastDay({ tide: { am: "Rising" } })), day).periods.map((p) => p.tide), ["Rising", null]);
  for (const bad of [5, "", null, {}, ["Rising"]]) assert.equal(planDayView(payload(forecastDay({ tide: { am: bad, pm: bad } })), day).periods[0].tide, null, JSON.stringify(bad));
  const v = planDayView(payload(forecastDay({ slots: { AM: { text: null }, PM: {} } })), day);
  assert.deepEqual(v.periods.map((p) => [p.title, p.icon, p.thundery]), [[null, "none", false], [null, "none", false]]);
  assert.equal(planDayView(payload(forecastDay({ slots: undefined })), day).periods[0].title, null);
});

test("the tide is called a prediction only when a tide word is shown, and the note must be text", () => {
  assert.equal(planDayView(payload(forecastDay({ tide: { am: "Rising" } })), day).tidePredicted, true);
  assert.equal(planDayView(payload(forecastDay({ tide: { am: "", pm: null } })), day).tidePredicted, false);
  assert.equal(planDayView(payload(forecastDay({ tide: {} })), day).tidePredicted, false);
  assert.equal(planDayView(payload(forecastDay(), { tide_note: 5 }), day).tideNote, null);
  assert.equal(planDayView(payload(forecastDay(), { tide_note: undefined }), day).tideNote, null);
});

test("a day without a forecast, an unavailable forecast, or no day gives a message and no cards", () => {
  const none = planDayView(payload(), { iso: "2026-11-30", label: "Mon, 30 Nov" });
  assert.equal(none.state, "none");
  assert.match(none.message, /Forecast not yet available for Mon, 30 Nov\. NEA's outlook covers the next 4 days\./);
  assert.deepEqual(planDayView({ available: false }, day), { state: "none", message: "Forecast unavailable right now." });
  assert.deepEqual(planDayView(null, day), { state: "none", message: "Forecast unavailable right now." });
  assert.deepEqual(planDayView(payload(), null), { state: "none", message: "Choose a day." });
});

test("a stale forecast is flagged", () => {
  assert.equal(planDayView(payload(forecastDay({ stale: true })), day).stale, true);
});
