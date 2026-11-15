import test from "node:test";
import assert from "node:assert/strict";
import { norm, compass, vec, angularSpread, diagramState, arrowSpeedPx, arrowLengthPx, createWindDiagram, shoreState, labelCorners, directionState } from "../wind-diagram.js";

// Shape copied from a real /api/spots/<slug>/conditions response.
const wind = (over = {}) => ({
  knots: 1.9, from_deg: 35, stale: false,
  direction_station: { station_id: "S43", station_name: "Kim Chuan Road" },
  readings: [
    { station_id: "S43", direction_deg: 35 },
    { station_id: "S108", direction_deg: 296 },
    { station_id: "S06", direction_deg: 306 },
  ],
  ...over,
});

test("compass names", () => {
  assert.equal(compass(0), "N");
  assert.equal(compass(35), "NE");
  assert.equal(compass(345), "NNW");
  assert.equal(compass(359), "N");
  assert.equal(compass(-10), "N");  // 350 is within 11.25 of north
  assert.equal(compass(-30), "NNW"); // 330
});

test("norm wraps", () => {
  assert.equal(norm(360), 0);
  assert.equal(norm(-90), 270);
});

test("vec points the way a compass does", () => {
  const [x, y] = vec(90);
  assert.ok(Math.abs(x - 1) < 1e-9 && Math.abs(y) < 1e-9); // east is right
  const [nx, ny] = vec(0);
  assert.ok(Math.abs(nx) < 1e-9 && Math.abs(ny + 1) < 1e-9); // north is up
});

test("angularSpread goes the short way round", () => {
  assert.equal(angularSpread([350, 10]), 20);
  assert.equal(angularSpread([35, 296, 306]), 99); // 35 to 296 the short way
  assert.equal(angularSpread([90]), 0);
});

test("arrows travel toward from + 180", () => {
  const s = diagramState(wind());
  assert.equal(s.status, "ok");
  assert.equal(s.fromDeg, 35);
  assert.equal(s.toDeg, 215);
  assert.match(s.main, /Wind from NE \(35\u00b0\)/);
  assert.match(s.sub, /toward SW \(215\u00b0\)/);
  assert.match(s.sub, /Kim Chuan Road/);
});

test("stations that disagree are flagged", () => {
  const s = diagramState(wind());
  assert.equal(s.disagree, true);
  assert.deepEqual(s.others, [296, 306]);
  assert.match(s.sub, /different directions/);
});

test("stations that agree are not flagged", () => {
  const s = diagramState(wind({ readings: [{ station_id: "S43", direction_deg: 35 }, { station_id: "S1", direction_deg: 50 }] }));
  assert.equal(s.disagree, false);
});

test("fails closed on missing, stale or invalid readings", () => {
  for (const bad of [null, undefined, "x", {}, wind({ from_deg: null }), wind({ from_deg: NaN }), wind({ from_deg: -5 }), wind({ from_deg: 400 }), wind({ from_deg: "35" })]) {
    const s = diagramState(bad);
    assert.equal(s.status, "unavailable");
    assert.equal(s.fromDeg, undefined);
  }
  const stale = diagramState(wind({ stale: true }));
  assert.equal(stale.status, "unavailable");
  assert.match(stale.main, /out of date/);
});

test("missing or negative speed shows direction but no arrows", () => {
  for (const knots of [null, undefined, NaN, -1]) {
    assert.equal(diagramState(wind({ knots })).status, "no_speed");
  }
});

test("calm shows no arrows", () => {
  assert.equal(diagramState(wind({ knots: 0.4 })).status, "calm");
  assert.equal(diagramState(wind({ knots: 1 })).status, "ok");
});

test("360 is treated as north", () => {
  assert.equal(diagramState(wind({ from_deg: 360 })).fromDeg, 0);
});

test("speed and length scale and stay bounded", () => {
  assert.ok(arrowSpeedPx(2) < arrowSpeedPx(15));
  assert.equal(arrowSpeedPx(500), 110);
  assert.ok(arrowLengthPx(2) < arrowLengthPx(15));
  assert.equal(arrowLengthPx(500), 34);
});

test("no wording about suitability appears in any output", () => {
  const banned = /safe|good to go|no-go|go\b|recommend|ideal|dangerous/i;
  for (const w of [wind(), wind({ stale: true }), wind({ knots: 0 }), null]) {
    const s = diagramState(w);
    assert.doesNotMatch(s.main + " " + s.sub, banned);
  }
});

test("a page with no usable DOM never breaks the app", () => {
  const saved = globalThis.document;
  try {
    for (const doc of [undefined, {}, { createElementNS: () => { throw new Error("boom"); }, createElement: () => ({}) }]) {
      globalThis.document = doc;
      const d = createWindDiagram({ hidden: false });
      assert.doesNotThrow(() => d.update(wind()));
      assert.doesNotThrow(() => d.update(null));
      assert.doesNotThrow(() => d.clear());
      assert.doesNotThrow(() => d.destroy());
    }
    globalThis.document = saved;
    assert.doesNotThrow(() => createWindDiagram(undefined).update(wind()));
  } finally {
    globalThis.document = saved;
  }
});

test("a missing host is ignored", () => {
  const d = createWindDiagram(null);
  assert.doesNotThrow(() => { d.update(wind()); d.clear(); d.destroy(); });
});

// Shape copied from the API's spot.launch_point.
const lp = (over = {}) => ({
  name: "PAssion WaVe @ East Coast launch", lat: 1.311285, lng: 103.952722,
  shore_bearing_deg: 75, sea_bearing_deg: 165, note: "n", review_status: "unreviewed", ...over,
});

test("a launch point gives a shoreline, labelled draft until reviewed", () => {
  const s = shoreState(lp());
  assert.equal(s.shoreDeg, 75);
  assert.equal(s.seaDeg, 165);
  assert.equal(s.draft, true);
  assert.equal(shoreState(lp({ review_status: "reviewed" })).draft, false);
  assert.match(diagramState(wind(), lp()).sub, /Shoreline about 75\u00b0, draft\./);
  assert.doesNotMatch(diagramState(wind(), lp({ review_status: "reviewed" })).sub, /draft/);
});

test("no launch point means no shoreline and the text is unchanged", () => {
  for (const none of [undefined, null, {}, "x"]) {
    assert.equal(diagramState(wind(), none).shore, null);
  }
  assert.equal(diagramState(wind()).sub, diagramState(wind(), null).sub);
  assert.doesNotMatch(diagramState(wind()).sub, /Shoreline/);
});

test("a launch point with odd numbers is ignored, not drawn", () => {
  for (const bad of [lp({ shore_bearing_deg: null }), lp({ sea_bearing_deg: NaN }), lp({ shore_bearing_deg: 400 }),
                     lp({ sea_bearing_deg: 75 }), lp({ sea_bearing_deg: 120 }), lp({ shore_bearing_deg: "75" })]) {
    assert.equal(shoreState(bad), null);
  }
});

test("the sea may be on either side of the shore", () => {
  assert.equal(shoreState(lp({ sea_bearing_deg: 345 })).seaDeg, 345);
});

test("the shoreline shows even when the wind reading is unavailable", () => {
  const s = diagramState(null, lp());
  assert.equal(s.status, "unavailable");
  assert.equal(s.shore.shoreDeg, 75);
});

test("Land and Sea labels go in opposite corners, land on the land side", () => {
  const { land, sea } = labelCorners(165);   // sea to the south-south-east
  assert.ok(land[1] < sea[1]);               // land is higher up the panel than sea
  assert.notDeepEqual(land, sea);
  const n = labelCorners(0);                 // sea to the north: land is at the bottom
  assert.ok(n.land[1] > n.sea[1]);
});

test("shoreline wording has no suitability language", () => {
  const banned = /safe|good to go|no-go|recommend|ideal|dangerous|offshore|onshore/i;
  assert.doesNotMatch(diagramState(wind(), lp()).sub, banned);
});

const dirBlock = (over = {}) => ({ class: "cross_shore", other_classes: ["offshore"], review_status: "unreviewed", ...over });

test("the class label names the class, with draft until reviewed", () => {
  assert.deepEqual(directionState(dirBlock()), { label: "Cross-shore", differ: ["offshore"], draft: true });
  assert.equal(directionState(dirBlock({ review_status: "reviewed" })).draft, false);
  assert.equal(directionState(dirBlock({ class: "onshore", other_classes: [] })).label, "Onshore");
  assert.equal(directionState(dirBlock({ class: "offshore" })).label, "Offshore");
});

test("stations in another class are named, and agreeing stations add nothing", () => {
  const s = diagramState(wind({ from_deg: 45 }), null, dirBlock());
  assert.match(s.sub, /Other stations read as offshore\./);
  const agree = diagramState(wind({ from_deg: 45 }), null, dirBlock({ other_classes: [] }));
  assert.doesNotMatch(agree.sub, /Other stations/);
});

test("no direction block means no label and unchanged text", () => {
  for (const none of [undefined, null, {}, "x", { class: "unknown" }, { class: 5 }]) {
    assert.equal(diagramState(wind(), null, none).dir, null);
  }
  assert.equal(diagramState(wind()).sub, diagramState(wind(), null, null).sub);
});

test("unknown classes in other_classes are dropped, and the primary class is not repeated", () => {
  assert.deepEqual(directionState(dirBlock({ other_classes: ["bogus", "cross_shore", "offshore"] })).differ, ["offshore"]);
  assert.deepEqual(directionState(dirBlock({ other_classes: "offshore" })).differ, []);
});

test("the label is hidden when the wind reading is missing or stale", () => {
  assert.equal(diagramState(null, null, dirBlock()).dir, null);
  assert.equal(diagramState(wind({ stale: true }), null, dirBlock()).dir, null);
  assert.equal(diagramState(wind({ from_deg: null }), null, dirBlock()).dir, null);
});

test("the label still shows in calm wind, where the direction is real but there are no arrows", () => {
  assert.equal(diagramState(wind({ knots: 0.4 }), null, dirBlock()).dir.label, "Cross-shore");
});

test("the class label adds no advice words", () => {
  const banned = /safe|good to go|no-go|recommend|ideal|dangerous|avoid|should/i;
  for (const c of ["onshore", "cross_shore", "offshore"]) {
    const s = diagramState(wind(), lp(), dirBlock({ class: c, other_classes: ["offshore", "onshore"].filter((k) => k !== c) }));
    assert.doesNotMatch(s.sub + " " + s.dir.label, banned);
  }
});
