import test from "node:test";
import assert from "node:assert/strict";
import { hm, sgtDate, tideView, heightAt, chartGeometry, stripGeometry, yMaxFor, createTideCard, NEA_TIDE_URL, SHOW_HEIGHT_NOW } from "../tide-card.js";

const E = (kind, at, h) => ({ kind, at, height_m: h });
// The shape the API sends for 16 Nov 2026 at 12:30 Singapore time.
const tide = (over = {}) => ({
  source: "NEA, from MPA predictions", station: null, datum: "chart_datum", predicted: true,
  state: "rising",
  previous: E("low", "2026-11-16T08:50:00+08:00", 1.7), next: E("high", "2026-11-16T14:20:00+08:00", 2.7),
  after_next: E("low", "2026-11-16T21:37:00+08:00", 0.9),
  height_estimate_m: 2.5, leg_height_m: 1.0, minutes_to_next: 110,
  today: [E("high", "2026-11-16T03:58:00+08:00", 2.4), E("low", "2026-11-16T08:50:00+08:00", 1.7),
          E("high", "2026-11-16T14:20:00+08:00", 2.7), E("low", "2026-11-16T21:37:00+08:00", 0.9)],
  chart: [E("low", "2026-11-15T20:45:00+08:00", 0.7), E("high", "2026-11-16T03:58:00+08:00", 2.4),
          E("low", "2026-11-16T08:50:00+08:00", 1.7), E("high", "2026-11-16T14:20:00+08:00", 2.7),
          E("low", "2026-11-16T21:37:00+08:00", 0.9), E("high", "2026-11-17T04:50:00+08:00", 2.3)],
  fetched_at: "2026-11-16T09:30:00+08:00", served_stale: false,
  note: "Predicted, not measured. Heights are metres above Chart Datum, not water depth at the launch.",
  ...over,
});
const NOW = Date.parse("2026-11-16T12:30:00+08:00");

test("hm reads the clock time from the text, whatever the browser's zone", () => {
  assert.equal(hm("2026-11-16T14:20:00+08:00"), "14:20");
  assert.equal(hm("2026-11-16T00:00:00+08:00"), "00:00");
  assert.equal(hm("nope"), null);
  assert.equal(hm(null), null);
});

test("sgtDate gives the Singapore calendar day", () => {
  assert.equal(sgtDate(Date.parse("2026-11-15T17:00:00Z")), "2026-11-16");
  assert.equal(sgtDate(Date.parse("2026-11-16T15:59:00Z")), "2026-11-16");
  assert.equal(sgtDate(Date.parse("2026-11-16T16:00:00Z")), "2026-11-17");
});

test("a good block becomes a view", () => {
  const v = tideView(tide(), NOW);
  assert.equal(v.heading, "Rising tide");
  assert.deepEqual([v.next.label, v.next.time, v.next.height], ["High", "14:20", 2.7]);
  assert.deepEqual([v.previous.label, v.previous.time, v.previous.height], ["Low", "08:50", 1.7]);
  assert.equal(v.nowHeight, 2.5);
  assert.equal(v.points.length, 6);
  assert.equal(v.fetchedTime, "09:30");
});

test("a falling tide, and tomorrow's tide named as tomorrow", () => {
  const evening = Date.parse("2026-11-16T21:50:00+08:00");
  const v = tideView(tide({ state: "rising", previous: E("low", "2026-11-16T21:37:00+08:00", 0.9), next: E("high", "2026-11-17T04:50:00+08:00", 2.3), height_estimate_m: 0.9, leg_height_m: 1.4 }), evening);
  assert.equal(v.next.time, "04:50 tomorrow");
  assert.equal(v.previous.time, "21:37");
  const falling = tideView(tide({ state: "falling", previous: E("high", "2026-11-16T14:20:00+08:00", 2.7), next: E("low", "2026-11-16T21:37:00+08:00", 0.9) }), Date.parse("2026-11-16T18:00:00+08:00"));
  assert.equal(falling.heading, "Falling tide");
});

test("anything odd fails closed", () => {
  const bad = [
    null, undefined, "x", {}, tide({ state: "steady" }), tide({ previous: null }), tide({ next: undefined }),
    tide({ next: E("low", "2026-11-16T14:20:00+08:00", 2.7) }),                     // same kind twice
    tide({ next: E("high", "2026-11-16T08:00:00+08:00", 2.7) }),                    // next before previous
    tide({ height_estimate_m: NaN }), tide({ leg_height_m: null }),
    tide({ previous: E("low", "2026-11-16 08:50", 1.7) }),                           // no zone
    tide({ previous: E("low", "2026-11-16T08:50:00+08:00", "1.7") }),
    tide({ chart: [E("low", "2026-11-16T08:50:00+08:00", 1.7), E("low", "2026-11-16T14:20:00+08:00", 1.8)] }),
  ];
  for (const b of bad) assert.equal(tideView(b, NOW), null, JSON.stringify(b));
});

test("a block that no longer brackets now is not shown", () => {
  assert.equal(tideView(tide(), Date.parse("2026-11-16T15:00:00+08:00")), null);
  assert.equal(tideView(tide(), Date.parse("2026-11-16T08:00:00+08:00")), null);
});

test("without a chart list it still draws from the previous and next tide", () => {
  const v = tideView(tide({ chart: undefined }), NOW);
  assert.equal(v.points.length, 2);
});

test("heightAt follows the smooth curve and stays between the two tides", () => {
  const v = tideView(tide(), NOW);
  const h = heightAt(v.points, NOW);
  assert.ok(h >= 2.4 && h <= 2.5, h);
  assert.equal(heightAt(v.points, Date.parse("2026-11-16T08:50:00+08:00")), 1.7);
  assert.equal(heightAt(v.points, Date.parse("2026-11-16T14:20:00+08:00")), 2.7);
  assert.equal(heightAt(v.points, Date.parse("2026-11-18T00:00:00+08:00")), null);
  for (let ms = Date.parse("2026-11-16T08:50:00+08:00"); ms <= Date.parse("2026-11-16T14:20:00+08:00"); ms += 7 * 60e3) {
    const x = heightAt(v.points, ms);
    assert.ok(x >= 1.7 - 1e-9 && x <= 2.7 + 1e-9);
  }
});

test("chart geometry covers the whole day inside the plot", () => {
  const g = chartGeometry(tideView(tide(), NOW));
  assert.equal(g.curve.length, 145);
  for (let i = 1; i < g.curve.length; i++) assert.ok(g.curve[i][0] > g.curve[i - 1][0]);
  for (const [x, y] of g.curve) { assert.ok(x >= 36 && x <= 392); assert.ok(y >= 16 && y <= 120); }
  assert.equal(g.labels.length, 4);
  assert.deepEqual(g.labels.map((l) => l.kind), ["high", "low", "high", "low"]);
  assert.equal(g.labels[2].text, "High 2.7 m 14:20");
  assert.ok(g.labels[2].y < g.labels[1].y);                    // a high sits above a low
  assert.ok(g.leg.x0 < g.leg.x1);
  assert.deepEqual(g.ticks.map((t) => t.text), ["00:00", "06:00", "12:00", "18:00", "24:00"]);
  assert.equal(g.yMax, 3);
});

test("the small strip has its own box and keeps every point inside it", () => {
  const v = tideView(tide(), NOW);
  const g = chartGeometry(v, { h: 38, x0: 2, x1: 398, ytop: 4, ybase: 33 });
  for (const [x, y] of g.curve) { assert.ok(x >= 2 && x <= 398); assert.ok(y >= 4 && y <= 33); }
  assert.ok(g.now.y >= 4 && g.now.y <= 33);
});

test("a chart is only drawn when the points reach both edges of the day", () => {
  assert.equal(tideView(tide(), NOW).chartOk, true);
  assert.equal(tideView(tide({ chart: undefined }), NOW).chartOk, false);                       // an older API
  const noBefore = tide().chart.slice(1);                                                       // nothing before midnight
  assert.equal(tideView(tide({ chart: noBefore }), NOW).chartOk, false);
  const noAfter = tide().chart.slice(0, -1);                                                    // nothing after the day
  assert.equal(tideView(tide({ chart: noAfter }), NOW).chartOk, false);
  assert.equal(tideView(tide({ chart: tide().chart.slice(0, 2) }), NOW).chartOk, false);
});

test("an older API without chart points still shows the strip, and no day chart", () => {
  const saved = globalThis.document;
  globalThis.document = fakeDoc();
  try {
    const host = globalThis.document.createElement("section");
    createTideCard(host).update(tide({ chart: undefined, after_next: undefined }), null, "2026-11-16T12:30:00+08:00");
    assert.equal(find(host, "svg").length, 1);                          // the strip only
    assert.equal(find(find(host, "details")[0], "svg").length, 0);      // no day chart inside Details
    const t = textOf(host);
    assert.match(t, /Rising tide/);
    assert.match(t, /Next high 2.7 m · 14:20/);
    assert.match(t, /chart isn't available/);
  } finally { globalThis.document = saved; }
});

test("the visible part is compact: a headline, a pair of values and a small strip, with the rest in Details", () => {
  const saved = globalThis.document;
  globalThis.document = fakeDoc();
  try {
    const host = globalThis.document.createElement("section");
    createTideCard(host).update(tide(), null, "2026-11-16T12:30:00+08:00");
    const body = host.children[1];
    const visible = body.children.filter((c) => c.tag !== "details");
    assert.deepEqual(visible.map((c) => c.tag), ["p", "svg", "div"]);      // headline, the graph, then the pair of values
    assert.equal(textOf(visible[0]), "Rising tide");
    assert.equal(visible[0].className, "headline");                           // the same style as the lightning card's headline
    assert.equal(visible[2].children.length, 2);                              // last tide and next tide, two compact values
    assert.equal(textOf(visible[2].children[0]).replace(/\s+/g, " ").trim(), "Last low 1.7 m · 08:50");
    assert.equal(textOf(visible[2].children[1]).replace(/\s+/g, " ").trim(), "Next high 2.7 m · 14:20");
    assert.equal(visible[1].attrs.class, "td-strip");
    const labels = find(visible[1], "text").map((t) => textOf(t));
    assert.deepEqual(labels, ["08:50", "14:20", "Now"]);                     // the dots and the marker are labelled on the graph
    assert.equal(visible[1].attrs.preserveAspectRatio, undefined);              // it scales evenly, so the dots stay round
  } finally { globalThis.document = saved; }
});

test("the strip runs from the last tide through the next to the one after", () => {
  const v = tideView(tide(), NOW);
  const g = stripGeometry(v);
  assert.equal(g.pts.length, 3);
  assert.equal(g.curve[0][0], g.box.x0);
  assert.ok(Math.abs(g.curve[g.curve.length - 1][0] - g.box.x1) < 1e-9);
  for (let i = 1; i < g.curve.length; i++) assert.ok(g.curve[i][0] > g.curve[i - 1][0]);
  for (const [x, y] of g.curve) { assert.ok(x >= g.box.x0 && x <= g.box.x1); assert.ok(y >= g.box.ytop - 1e-9 && y <= g.box.ybase + 1e-9); }
  assert.equal(g.ends.length, 2);
  assert.ok(g.ends[0].x < g.now.x && g.now.x < g.ends[1].x);                  // now sits between the last and next tide
  assert.equal(g.ends[0].kind, "low");
  assert.ok(g.ends[0].y > g.ends[1].y);                                       // the low is lower on the strip than the high
  assert.equal(g.text, "Now");
  assert.equal(stripGeometry(v, undefined, true).text, "Now about 2.5 m (estimate)");   // what the switch brings back
});

test("the dots are labelled on the graph: a high above, a low below, and Now over the dashed line", () => {
  const g = stripGeometry(tideView(tide(), NOW));
  assert.deepEqual(g.ends.map((e) => [e.kind, e.time]), [["low", "08:50"], ["high", "14:20"]]);
  assert.equal(g.ends[0].label.y, g.box.bottomRow);                           // a low's time sits below the graph
  assert.equal(g.ends[1].label.y, g.box.topRow);                              // a high's time sits above it
  assert.equal(g.label.y, g.box.topRow);
  assert.equal(g.label.anchor, "middle");
  for (const l of [...g.ends.map((e) => e.label), g.label]) { assert.ok(l.x >= 0 && l.x <= 400); assert.ok(l.y >= 0 && l.y <= g.box.h); }
});

test("Now moves to the bottom row when it would sit on a high's time, and stays on top otherwise", () => {
  const nearHigh = stripGeometry(tideView(tide(), Date.parse("2026-11-16T14:10:00+08:00")));
  assert.equal(nearHigh.label.y, nearHigh.box.bottomRow);
  const nearLow = stripGeometry(tideView(tide(), Date.parse("2026-11-16T08:55:00+08:00")));
  assert.equal(nearLow.label.y, nearLow.box.topRow);
  const mid = stripGeometry(tideView(tide(), NOW));
  assert.equal(mid.label.y, mid.box.topRow);
});

test("labels near the edges of the strip are anchored so they stay inside", () => {
  const g = stripGeometry(tideView(tide(), Date.parse("2026-11-16T08:55:00+08:00")));
  assert.equal(g.ends[0].label.anchor, "start");                              // the last tide is at the left edge
  const noAfter = stripGeometry(tideView(tide({ after_next: undefined }), NOW));
  assert.equal(noAfter.ends[1].label.anchor, "end");                          // the next tide is at the right edge
  for (const e of [...g.ends, ...noAfter.ends]) {
    const w = 30, l = e.label.anchor === "start" ? e.label.x : e.label.anchor === "end" ? e.label.x - w : e.label.x - w / 2;
    assert.ok(l >= 0 && l + w <= 400, JSON.stringify(e.label));
  }
});

test("without the tide after the next, the strip ends at the next tide", () => {
  const v = tideView(tide({ after_next: undefined }), NOW);
  assert.equal(v.afterPoint, null);
  const g = stripGeometry(v);
  assert.equal(g.pts.length, 2);
  assert.ok(Math.abs(g.ends[1].x - g.box.x1) < 1e-9);
});

test("a tide after the next that does not alternate or is out of order is ignored, not trusted", () => {
  assert.equal(tideView(tide({ after_next: E("high", "2026-11-16T21:37:00+08:00", 2.0) }), NOW).afterPoint, null);   // same kind as next
  assert.equal(tideView(tide({ after_next: E("low", "2026-11-16T10:00:00+08:00", 0.9) }), NOW).afterPoint, null);    // before the next tide
  assert.equal(tideView(tide({ after_next: "x" }), NOW).afterPoint, null);
  assert.equal(tideView(tide({ after_next: null }), NOW).afterPoint, null);
});

test("the now label stays inside the strip near either end of the window, even when it is long", () => {
  const early = stripGeometry(tideView(tide(), Date.parse("2026-11-16T08:55:00+08:00")), undefined, true);
  assert.equal(early.label.anchor, "start");
  const late = stripGeometry(tideView(tide({ after_next: undefined }), Date.parse("2026-11-16T14:10:00+08:00")), undefined, true);
  assert.equal(late.label.anchor, "end");
  for (const g of [early, late]) {
    const width = g.text.length * 6.4;
    const left = g.label.anchor === "start" ? g.label.x : g.label.x - width;
    assert.ok(left >= 0 && left + width <= 400, `${left} ${left + width}`);
  }
});

test("the strip scale fits a small tide as well as a big one", () => {
  const small = stripGeometry(tideView(tide({ previous: E("low", "2026-11-16T08:50:00+08:00", 1.7), next: E("high", "2026-11-16T14:20:00+08:00", 1.9), after_next: undefined, leg_height_m: 0.2 }), NOW));
  for (const [, y] of small.curve) assert.ok(y >= small.box.ytop - 1e-9 && y <= small.box.ybase + 1e-9);
  assert.ok(small.ends[0].y > small.ends[1].y);
});

test("the now marker sits on the curve", () => {
  const v = tideView(tide(), NOW);
  const g = chartGeometry(v);
  assert.ok(Math.abs(g.now.x - g.x(NOW)) < 1e-9);
  assert.ok(Math.abs(g.now.y - g.y(heightAt(v.points, NOW))) < 1e-9);
});

test("the vertical range grows for a big tide and never drops below 3 m", () => {
  assert.equal(yMaxFor([{ h: 2.0 }, { h: 0.5 }]), 3);
  assert.equal(yMaxFor([{ h: 3.4 }, { h: 0.1 }]), 4);
  assert.equal(yMaxFor([{ h: 2.9 }]), 4);
});

// ---- rendering, with a minimal fake page
function fakeDoc() {
  const mk = (tag) => {
    const n = { tag, children: [], attrs: {}, hidden: false, className: "", _t: "", classList: { add() {} } };
    Object.defineProperty(n, "textContent", { get: () => n._t, set: (v) => { n._t = v; } });
    n.setAttribute = (k, v) => { n.attrs[k] = v; };
    n.appendChild = (c) => { n.children.push(c); return c; };
    n.append = (...cs) => { for (const c of cs) n.children.push(typeof c === "string" ? { tag: "#text", _t: c, children: [] } : c); };
    n.replaceChildren = (...cs) => { n.children = [...cs]; };
    return n;
  };
  return { createElement: mk, createElementNS: (ns, t) => mk(t), getElementById: () => null, head: mk("head") };
}
const textOf = (n) => (n._t || "") + (n.children || []).map(textOf).join(" ");

test("the card shows the tide, and hides itself for an older API", () => {
  const saved = globalThis.document;
  globalThis.document = fakeDoc();
  try {
    const host = globalThis.document.createElement("section");
    const card = createTideCard(host);
    card.update(tide(), null, "2026-11-16T12:30:00+08:00");
    assert.equal(host.hidden, false);
    const t = textOf(host);
    assert.match(t, /Rising tide/);
    assert.match(t, /Next high 2.7 m · 14:20/);
    assert.match(t, /Last low 1.7 m · 08:50/);
    assert.match(t, /Predicted \(NEA\), not measured/);
    assert.doesNotMatch(t, /about 2\.5|estimate/);                              // no height is shown for right now
    assert.match(t, /tide height only/);
    assert.match(t, /Current direction and strength aren't shown/);
    assert.match(t, /Source: NEA, from MPA predictions/);
    assert.match(t, /Table read at 09:30/);
    assert.doesNotMatch(t, /Showing the last tide table/);
    card.update(undefined);
    assert.equal(host.hidden, true);
  } finally { globalThis.document = saved; }
});

function find(n, tag, out = []) {
  if (n.tag === tag) out.push(n);
  for (const c of n.children || []) find(c, tag, out);
  return out;
}

test("the explanations are tucked into a closed Details, and the key facts stay visible", () => {
  const saved = globalThis.document;
  globalThis.document = fakeDoc();
  try {
    const host = globalThis.document.createElement("section");
    createTideCard(host).update(tide(), null, "2026-11-16T12:30:00+08:00");
    const details = find(host, "details");
    assert.equal(details.length, 1);
    assert.equal(details[0].attrs.open, undefined);                       // closed to begin with
    assert.equal(details[0].children[0].tag, "summary");
    assert.equal(textOf(details[0].children[0]), "Details");
    const inside = textOf(details[0]);
    assert.match(inside, /Shaded: the current rise or fall/);
    assert.match(inside, /tide height only/);
    assert.match(inside, /Source: NEA, from MPA predictions/);
    assert.match(inside, /Chart Datum, not water depth/);
    const outside = textOf(host).replace(inside, "");
    assert.match(outside, /Rising tide/);
    assert.match(outside, /Next high 2.7 m · 14:20/);
    assert.doesNotMatch(outside, /about 2\.5|estimate/);
    assert.match(outside, /Predicted \(NEA\), not measured/);
    assert.doesNotMatch(outside, /Chart Datum|Source:|Shaded/);
    assert.equal(find(host, "svg").length, 2);                           // the small strip, and the full chart inside Details
    assert.equal(find(details[0], "svg").length, 1);
  } finally { globalThis.document = saved; }
});

test("a stale table is never tucked away", () => {
  const saved = globalThis.document;
  globalThis.document = fakeDoc();
  try {
    const host = globalThis.document.createElement("section");
    createTideCard(host).update(tide({ served_stale: true }), null, "2026-11-16T12:30:00+08:00");
    const inside = textOf(find(host, "details")[0]);
    assert.doesNotMatch(inside, /Showing the last tide table/);
    assert.match(textOf(host), /Showing the last tide table we could read/);
  } finally { globalThis.document = saved; }
});

test("no tide data shows the message and a link, never a number", () => {
  const saved = globalThis.document;
  globalThis.document = fakeDoc();
  try {
    const host = globalThis.document.createElement("section");
    const card = createTideCard(host);
    card.update(null, "Tide data unavailable.", "2026-11-16T12:30:00+08:00");
    assert.equal(host.hidden, false);
    const t = textOf(host);
    assert.match(t, /Tide data unavailable/);
    assert.doesNotMatch(t, /\d\.\d m/);
    const link = JSON.stringify(host);
    assert.ok(link.includes(NEA_TIDE_URL));
    card.update({ state: "rising" }, null, "2026-11-16T12:30:00+08:00");      // a block we cannot trust
    assert.match(textOf(host), /could not be checked/);
    card.clear();
    assert.equal(host.hidden, true);
  } finally { globalThis.document = saved; }
});

test("a stale table is labelled", () => {
  const saved = globalThis.document;
  globalThis.document = fakeDoc();
  try {
    const host = globalThis.document.createElement("section");
    createTideCard(host).update(tide({ served_stale: true }), null, "2026-11-16T12:30:00+08:00");
    assert.match(textOf(host), /Showing the last tide table we could read/);
  } finally { globalThis.document = saved; }
});

test("the card never gives advice or talks about current strength", () => {
  const saved = globalThis.document;
  globalThis.document = fakeDoc();
  try {
    for (const state of ["rising", "falling"]) {
      const host = globalThis.document.createElement("section");
      const t = state === "rising" ? tide() : tide({ state: "falling", previous: E("high", "2026-11-16T14:20:00+08:00", 2.7), next: E("low", "2026-11-16T21:37:00+08:00", 0.9) });
      createTideCard(host).update(t, null, state === "rising" ? "2026-11-16T12:30:00+08:00" : "2026-11-16T18:00:00+08:00");
      assert.doesNotMatch(textOf(host), /safe|recommend|avoid|should|ideal|dangerous|strong|peak/i);
    }
  } finally { globalThis.document = saved; }
});

test("a page that cannot build the card never throws", () => {
  const saved = globalThis.document;
  try {
    for (const doc of [undefined, {}, { createElementNS: () => { throw new Error("boom"); }, createElement: () => ({}) }]) {
      globalThis.document = doc;
      const card = createTideCard({ hidden: false });
      assert.doesNotThrow(() => card.update(tide(), null, "2026-11-16T12:30:00+08:00"));
      assert.doesNotThrow(() => card.update(null, "x"));
      assert.doesNotThrow(() => card.clear());
      assert.doesNotThrow(() => card.destroy());
    }
    assert.doesNotThrow(() => createTideCard(null).update(tide()));
  } finally { globalThis.document = saved; }
});

test("no height for right now is shown anywhere unless the switch is turned on", () => {
  assert.equal(SHOW_HEIGHT_NOW, false);
  const saved = globalThis.document;
  globalThis.document = fakeDoc();
  try {
    const host = globalThis.document.createElement("section");
    createTideCard(host).update(tide(), null, "2026-11-16T12:30:00+08:00");
    const strip = find(host, "svg").find((n) => n.attrs.class === "td-strip");
    assert.doesNotMatch(strip.attrs["aria-label"], /\d\.\d metres/);
    for (const t of find(strip, "text")) assert.match(textOf(t), /^(Now|\d\d:\d\d)$/);     // times and "Now" only, never a height
    assert.doesNotMatch(textOf(strip), /\d\.\d|about|estimate/);
    assert.equal(textOf(find(strip, "text").pop()), "Now");
  } finally { globalThis.document = saved; }
});

test("the card still works when the API sends no height estimate, and refuses a garbage one", () => {
  assert.ok(tideView(tide({ height_estimate_m: undefined }), NOW));
  assert.ok(tideView(tide({ height_estimate_m: null }), NOW));
  assert.equal(tideView(tide({ height_estimate_m: "2.5" }), NOW), null);
  assert.equal(tideView(tide({ height_estimate_m: NaN }), NOW), null);
});
