import test from "node:test";
import assert from "node:assert/strict";
import { buildView } from "../lib.js";

const payload = (guidance) => ({
  level: "beginner",
  observations: { wind: null, lightning: null },
  guidance: { status: "assessed", review_status: "unreviewed", wind_status: "outside", wind_position: "below", ...guidance },
});
const flag = (code, message, severity = "info") => ({ code, severity, message, data: {} });

test("the cross-shore note leaves the wind card once the API sends guidance.direction", () => {
  const v = buildView(payload({
    flags: [flag("cross_shore_wind", "Wind is cross-shore.")],
    direction: { class: "cross_shore", other_classes: [], review_status: "unreviewed" },
  }));
  assert.deepEqual(v.guidance.flags, []);
});

test("an older API without guidance.direction keeps the note, so nothing is lost", () => {
  const v = buildView(payload({ flags: [flag("cross_shore_wind", "Wind is cross-shore.")] }));
  assert.equal(v.guidance.flags.length, 1);
  assert.equal(v.guidance.flags[0].message, "Wind is cross-shore.");
});

test("the offshore warning for beginners stays in the wind card", () => {
  const warn = flag("offshore_wind_beginner", "Offshore wind can make returning to shore difficult for beginners. Independent practice is not recommended under this scenario.", "advise_against");
  const v = buildView(payload({
    flags: [warn],
    direction: { class: "offshore", other_classes: [], review_status: "unreviewed" },
  }));
  assert.equal(v.guidance.flags.length, 1);
  assert.match(v.guidance.flags[0].message, /Independent practice is not recommended/);
});

test("other notes are untouched", () => {
  const v = buildView(payload({
    flags: [flag("cross_shore_wind", "Wind is cross-shore."), flag("some_other_note", "Something else.")],
    direction: { class: "cross_shore", other_classes: [], review_status: "unreviewed" },
  }));
  assert.deepEqual(v.guidance.flags.map((f) => f.message), ["Something else."]);
});
