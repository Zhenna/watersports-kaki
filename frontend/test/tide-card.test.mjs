import test from "node:test";
import assert from "node:assert/strict";
import { hm, sgtDate, tideView, heightAt, chartGeometry, yMaxFor, createTideCard, NEA_TIDE_URL } from "../tide-card.js";

const E = (kind, at, h) => ({ kind, at, height_m: h });
// The shape the API sends for 16 Nov 2026 at 12:30 Singapore time.
const tide = (over = {}) => ({
  source: "NEA, from MPA predictions", station: null, datum: "chart_datum", predicted: true,
  state: "rising",
  previous: E("low", "2026-11-16T08:50:00+08:00", 1.7), next: E("high", "2026-11-16T14:20:00+08:00", 2.7),
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
  for (const [x, y] of g.curve) { assert.ok(x >= 36 && x <= 392); assert.ok(y >= 14 && y <= 140); }
  assert.equal(g.labels.length, 4);
  assert.deepEqual(g.labels.map((l) => l.kind), ["high", "low", "high", "low"]);
  assert.equal(g.labels[2].text, "High 2.7 m 14:20");
  assert.ok(g.labels[2].y < g.labels[1].y);                    // a high sits above a low
  assert.ok(g.leg.x0 < g.leg.x1);
  assert.deepEqual(g.ticks.map((t) => t.text), ["00:00", "06:00", "12:00", "18:00", "24:00"]);
  assert.equal(g.yMax, 3);
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
    assert.match(t, /Next high 14:20, 2.7 m/);
    assert.match(t, /Last low 08:50, 1.7 m/);
    assert.match(t, /Height now: about 2.5 m \(estimate\)/);
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
    assert.match(outside, /Next high 14:20, 2.7 m/);
    assert.match(outside, /Height now: about 2.5 m \(estimate\)/);
    assert.match(outside, /Predicted, not measured/);
    assert.doesNotMatch(outside, /Chart Datum|Source:|Shaded/);
    assert.equal(find(host, "svg").length, 1);
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
