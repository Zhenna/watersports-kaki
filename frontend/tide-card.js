// Tide card: the predicted tide for today, from observations.tide in the conditions response.
// Pure helpers are exported so Node can test them. The DOM is only touched inside createTideCard.
//
// It shows tide height only. It says nothing about current direction or strength.
// Anything missing or odd fails closed: "Tide data unavailable", never a guess.

// The card does not show a height for right now: it is a curve fitted between two predicted tides, not a prediction
// for this minute. Set this to true to show "Now about 0.9 m (estimate)" beside the marker again.
export const SHOW_HEIGHT_NOW = false;

export const NEA_TIDE_URL = "https://www.nea.gov.sg/corporate-functions/weather/tide-timings";
const NS = "http://www.w3.org/2000/svg";
const W = 400;
const FULL = { h: 150, x0: 36, x1: 392, ytop: 16, ybase: 120, tickY: 139 };   // the labelled chart, inside Details
const STRIP = { h: 70, x0: 6, x1: 394, ytop: 24, ybase: 50, topRow: 13, bottomRow: 65 };                        // the small strip that stays visible
const HOUR = 3600e3;
const KIND = { high: "High", low: "Low" };

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// "2026-11-16T14:20:00+08:00" -> "14:20". Read from the text, so the browser's own time zone never matters.
export function hm(iso) {
  const m = typeof iso === "string" ? /T(\d{2}):(\d{2})/.exec(iso) : null;
  return m ? `${m[1]}:${m[2]}` : null;
}

export function sgtDate(ms) {
  return new Date(ms + 8 * HOUR).toISOString().slice(0, 10);
}

function point(p) {
  if (!p || typeof p !== "object" || !KIND[p.kind] || !isNum(p.height_m)) return null;
  const t = typeof p.at === "string" && /T\d{2}:\d{2}.*(\+|-)\d{2}:\d{2}$/.test(p.at) ? Date.parse(p.at) : NaN;
  if (!isNum(t)) return null;
  return { t, h: p.height_m, kind: p.kind, time: hm(p.at) };
}

// Height between two extremes: a smooth curve, the same one the API uses for the estimate.
export function heightAt(points, ms) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (ms >= a.t && ms <= b.t) {
      const f = (ms - a.t) / (b.t - a.t);
      return a.h + (b.h - a.h) * (1 - Math.cos(Math.PI * f)) / 2;
    }
  }
  return null;
}

function dayNote(t, nowMs) {
  const d = sgtDate(t), n = sgtDate(nowMs);
  return d > n ? " tomorrow" : d < n ? " yesterday" : "";
}

// observations.tide -> what to draw, or null when it cannot be trusted.
export function tideView(tide, nowMs) {
  if (!tide || typeof tide !== "object") return null;
  if (tide.state !== "rising" && tide.state !== "falling") return null;
  const prev = point(tide.previous), next = point(tide.next);
  if (!prev || !next || next.t <= prev.t || prev.kind === next.kind) return null;
  if (!isNum(tide.leg_height_m)) return null;
  if (tide.height_estimate_m != null && !isNum(tide.height_estimate_m)) return null;   // optional, but never garbage
  nowMs = isNum(nowMs) ? nowMs : Date.now();
  if (nowMs < prev.t - 60e3 || nowMs > next.t + 60e3) return null;     // the block no longer brackets now
  const raw = Array.isArray(tide.chart) && tide.chart.length >= 2 ? tide.chart : [tide.previous, tide.next];
  const points = raw.map(point).filter(Boolean).sort((a, b) => a.t - b.t);
  for (let i = 1; i < points.length; i++) if (points[i].kind === points[i - 1].kind) return null;
  if (points.length < 2) return null;
  // The tide after the next one is optional. If it is missing or does not alternate, the strip just ends at the next tide.
  let after = tide.after_next == null ? null : point(tide.after_next);
  if (after && (after.t <= next.t || after.kind === next.kind)) after = null;
  const dayStart = Date.parse(`${sgtDate(nowMs)}T00:00:00+08:00`);
  const fetched = typeof tide.fetched_at === "string" ? hm(tide.fetched_at) : null;
  // A chart is only drawn when its points run past both edges of the day. A partial curve would look like the whole day.
  const chartOk = points.length >= 3 && points[0].t <= dayStart && points[points.length - 1].t >= dayStart + 24 * HOUR;
  return {
    state: tide.state,
    chartOk,
    heading: tide.state === "rising" ? "Rising tide" : "Falling tide",
    previous: { label: KIND[prev.kind], time: prev.time + dayNote(prev.t, nowMs), height: prev.h },
    next: { label: KIND[next.kind], time: next.time + dayNote(next.t, nowMs), height: next.h },
    nowHeight: isNum(tide.height_estimate_m) ? tide.height_estimate_m : null,
    legHeight: tide.leg_height_m,
    points, prevPoint: prev, nextPoint: next, afterPoint: after, nowMs, dayStart, dayEnd: dayStart + 24 * HOUR,
    stale: tide.served_stale === true,
    fetchedTime: fetched,
    note: typeof tide.note === "string" ? tide.note : "",
    source: typeof tide.source === "string" ? tide.source : "NEA",
  };
}

export function yMaxFor(points) {
  return Math.max(3, Math.ceil(Math.max(...points.map((p) => p.h)) + 0.2));
}

export function chartGeometry(view, box = FULL) {
  const yMax = yMaxFor(view.points);
  const x = (ms) => box.x0 + ((ms - view.dayStart) / (view.dayEnd - view.dayStart)) * (box.x1 - box.x0);
  const y = (h) => box.ybase - (h / yMax) * (box.ybase - box.ytop);
  const curve = [];
  for (let ms = view.dayStart; ms <= view.dayEnd; ms += 10 * 60e3) {
    const h = heightAt(view.points, ms);
    if (h != null) curve.push([x(ms), y(h)]);
  }
  const labels = view.points
    .filter((p) => p.t >= view.dayStart && p.t <= view.dayEnd)
    .map((p) => ({ x: x(p.t), y: y(p.h), kind: p.kind, text: `${KIND[p.kind]} ${p.h.toFixed(1)} m ${p.time}` }));
  const nowH = heightAt(view.points, view.nowMs);
  return {
    yMax, x, y, curve, labels, box,
    now: nowH == null ? null : { x: x(view.nowMs), y: y(nowH) },
    leg: { x0: Math.max(box.x0, x(view.prevPoint.t)), x1: Math.min(box.x1, x(view.nextPoint.t)) },
    ticks: [0, 6, 12, 18, 24].map((h) => ({ x: x(view.dayStart + h * HOUR), text: `${String(h).padStart(2, "0")}:00` })),
    grid: Array.from({ length: yMax }, (_, i) => i + 1).map((v) => ({ y: y(v), text: `${v} m` })),
  };
}

// The strip spans the last tide, the next one, and the one after it, so the turn that follows is visible.
// The vertical scale fits those tides, because the strip carries no axis. The heights are in the text below it.
// Labels sit on the graph itself: the time above a high, below a low, and "Now" over the dashed line.
export function stripGeometry(view, box = STRIP, showHeight = SHOW_HEIGHT_NOW) {
  const pts = view.afterPoint ? [view.prevPoint, view.nextPoint, view.afterPoint] : [view.prevPoint, view.nextPoint];
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const hs = pts.map((p) => p.h);
  const lo = Math.min(...hs), hi = Math.max(...hs);
  const span = Math.max(hi - lo, 0.2), pad = span * 0.08;
  const x = (ms) => box.x0 + ((ms - t0) / (t1 - t0)) * (box.x1 - box.x0);
  const y = (h) => box.ybase - ((h - (lo - pad)) / (span + 2 * pad)) * (box.ybase - box.ytop);
  const curve = [];
  for (let ms = t0; ms < t1; ms += 10 * 60e3) curve.push([x(ms), y(heightAt(pts, ms))]);
  curve.push([x(t1), y(pts[pts.length - 1].h)]);
  const nowH = heightAt(pts, view.nowMs);
  const nowX = x(Math.min(Math.max(view.nowMs, t0), t1));

  const clampAnchor = (cx, half) => (cx - half < box.x0 - 4 ? "start" : cx + half > box.x1 + 4 ? "end" : "middle");
  const ends = [view.prevPoint, view.nextPoint].map((p) => {
    const cx = x(p.t), anchor = clampAnchor(cx, 16);
    return {
      x: cx, y: y(p.h), kind: p.kind, time: p.time,
      label: { x: anchor === "start" ? Math.max(1, cx - 4) : anchor === "end" ? Math.min(399, cx + 4) : cx,
               y: p.kind === "high" ? box.topRow : box.bottomRow, anchor },
    };
  });

  let text, label;
  if (showHeight && view.nowHeight != null) {
    // the longer label with a height: beside the marker, on the top row
    text = `Now about ${view.nowHeight.toFixed(1)} m (estimate)`;
    const fitsRight = nowX + 6 + text.length * 6.4 <= box.x1;
    label = { x: fitsRight ? nowX + 6 : nowX - 6, y: box.topRow, anchor: fitsRight ? "start" : "end" };
  } else {
    // "Now" over the dashed line, moved to the bottom row if the top row already holds a high's time
    text = "Now";
    const near = (e) => Math.abs(e.label.x - nowX) < 40;
    const topTaken = ends.some((e) => e.kind === "high" && near(e));
    const bottomTaken = ends.some((e) => e.kind === "low" && near(e));
    const row = topTaken && !bottomTaken ? box.bottomRow : box.topRow;
    const anchor = clampAnchor(nowX, 12);
    label = { x: anchor === "start" ? Math.max(1, nowX - 4) : anchor === "end" ? Math.min(399, nowX + 4) : nowX, y: row, anchor };
  }
  return {
    box, curve, pts, text, ends, label,
    now: nowH == null ? null : { x: nowX, y: y(nowH) },
  };
}

const CSS = `
.wsk-td .td-svg{display:block;width:100%;height:auto;margin-top:8px}
.wsk-td .td-leg{fill:#2a6fdb;opacity:.1}
.wsk-td .td-grid{stroke:#0d2c5b;stroke-opacity:.12;stroke-width:1;vector-effect:non-scaling-stroke}
.wsk-td .td-area{fill:#2a6fdb;opacity:.1}
.wsk-td .td-line{fill:none;stroke:#2a6fdb;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.wsk-td .td-now{stroke:#0d2c5b;stroke-width:1;stroke-dasharray:4 3;vector-effect:non-scaling-stroke}
.wsk-td .td-dot{fill:#2a6fdb;stroke:#fff;stroke-width:2;vector-effect:non-scaling-stroke}
.wsk-td .td-nowdot{fill:#fff;stroke:#0d2c5b;stroke-width:2;vector-effect:non-scaling-stroke}
.wsk-td text{font:400 11px Inter,system-ui,sans-serif;fill:#5b6b86}
.wsk-td .td-lbl{fill:#0d2c5b}
.wsk-td .td-row{margin:2px 0 0}
.wsk-td .td-strip{display:block;width:100%;height:auto;margin-top:4px}
.wsk-td .td-nowlbl,.wsk-td .td-endlbl{font-size:12px;font-weight:600;fill:#0d2c5b}
.wsk-td .td-pair{display:flex;flex-wrap:wrap;gap:2px 18px;margin:2px 0 0;font-size:13px}
.wsk-td .td-k{color:#5b6b86;margin-right:4px}
.wsk-td .td-v{font-weight:600;color:#0d2c5b}
.wsk-td details{margin-top:6px}
.wsk-td details .td-svg{margin-top:6px}
`;

function svgEl(name, attrs, parent) {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function htmlEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function buildCard(host) {
  const head = document.head;
  if (head && !document.getElementById("wsk-td-css")) {
    const st = document.createElement("style");
    st.id = "wsk-td-css";
    st.textContent = CSS + "#tide-panel{margin-top:16px}";
    head.appendChild(st);
  }
  host.classList.add("wsk-td");
  host.hidden = true;

  const tagrow = htmlEl("div", "tagrow");
  tagrow.appendChild(htmlEl("span", "chip-tag", "Tide"));
  tagrow.appendChild(htmlEl("span", "small", "Predicted (NEA), not measured"));
  const body = htmlEl("div");
  host.append(tagrow, body);

  function showUnavailable(message) {
    host.hidden = false;
    body.replaceChildren();
    body.appendChild(htmlEl("p", "headline", "Tide data unavailable"));
    body.appendChild(htmlEl("p", "small td-row", message || "The tide table could not be read right now."));
    const p = htmlEl("p", "small td-row");
    p.append("Check ");
    const a = htmlEl("a", null, "NEA's tide timings");
    a.setAttribute("href", NEA_TIDE_URL);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
    p.append(a, " for today's tides.");
    body.appendChild(p);
  }

  function drawChart(svg, g, full) {
    const box = g.box;
    if (full) {
      svgEl("rect", { class: "td-leg", x: g.leg.x0, y: box.ytop, width: Math.max(0, g.leg.x1 - g.leg.x0), height: box.ybase - box.ytop }, svg);
      for (const gl of g.grid) {
        svgEl("line", { class: "td-grid", x1: box.x0, x2: box.x1, y1: gl.y, y2: gl.y }, svg);
        const t = svgEl("text", { x: box.x0 - 4, y: gl.y + 4, "text-anchor": "end" }, svg);
        t.textContent = gl.text;
      }
    }
    const d = g.curve.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
    svgEl("path", { class: "td-area", d: `${d}L${g.curve[g.curve.length - 1][0].toFixed(1)} ${box.ybase}L${g.curve[0][0].toFixed(1)} ${box.ybase}Z` }, svg);
    svgEl("path", { class: "td-line", d }, svg);
    if (g.now) {
      svgEl("line", { class: "td-now", x1: g.now.x, x2: g.now.x, y1: box.ytop, y2: box.ybase }, svg);
      svgEl("circle", { class: "td-nowdot", cx: g.now.x, cy: g.now.y, r: full ? 4 : 3.5 }, svg);
    }
    if (!full) return;
    for (const l of g.labels) {
      svgEl("circle", { class: "td-dot", cx: l.x, cy: l.y, r: 4 }, svg);
      const anchor = l.x < 70 ? "start" : l.x > 330 ? "end" : "middle";
      const t = svgEl("text", { class: "td-lbl", x: anchor === "start" ? Math.max(box.x0, l.x - 4) : anchor === "end" ? Math.min(box.x1, l.x + 4) : l.x,
        y: l.kind === "high" ? l.y - 9 : l.y + 17, "text-anchor": anchor }, svg);
      t.textContent = l.text;
    }
    for (const tk of g.ticks) {
      const t = svgEl("text", { x: tk.x, y: box.tickY, "text-anchor": tk.x < 50 ? "start" : tk.x > 380 ? "end" : "middle" }, svg);
      t.textContent = tk.text;
    }
  }

  function showTide(view) {
    host.hidden = false;
    body.replaceChildren();
    const now = view.nowHeight == null ? "" : view.nowHeight.toFixed(1);
    body.appendChild(htmlEl("p", "headline", view.heading));      // the site's own headline style, like "No strikes observed"
    const sg = stripGeometry(view);
    const strip = svgEl("svg", { class: "td-strip", viewBox: `0 0 ${W} ${STRIP.h}`, role: "img",
      "aria-label": `Predicted tide from the last ${view.previous.label.toLowerCase()} at ${view.previous.time} to the next ${view.next.label.toLowerCase()} at ${view.next.time}. ` +
        (SHOW_HEIGHT_NOW && view.nowHeight != null ? `Now about ${now} metres, an estimate.` : "The time now is marked.") }, body);
    const d = sg.curve.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
    svgEl("path", { class: "td-area", d: `${d}L${sg.curve[sg.curve.length - 1][0].toFixed(1)} ${STRIP.ybase}L${sg.curve[0][0].toFixed(1)} ${STRIP.ybase}Z` }, strip);
    svgEl("path", { class: "td-line", d }, strip);
    if (sg.now) svgEl("line", { class: "td-now", x1: sg.now.x, x2: sg.now.x, y1: STRIP.ytop - 6, y2: STRIP.ybase + 4 }, strip);
    for (const e of sg.ends) {
      svgEl("circle", { class: "td-dot", cx: e.x, cy: e.y, r: 3.5 }, strip);
      const t = svgEl("text", { class: "td-endlbl", x: e.label.x, y: e.label.y, "text-anchor": e.label.anchor }, strip);
      t.textContent = e.time;
    }
    if (sg.now) {
      svgEl("circle", { class: "td-nowdot", cx: sg.now.x, cy: sg.now.y, r: 3.5 }, strip);
      const t = svgEl("text", { class: "td-nowlbl", x: sg.label.x, y: sg.label.y, "text-anchor": sg.label.anchor }, strip);
      t.textContent = sg.text;
    }

    const pair = htmlEl("div", "td-pair");
    for (const t of [view.previous, view.next]) {
      const item = htmlEl("span");
      item.appendChild(htmlEl("span", "td-k", `${t === view.previous ? "Last" : "Next"} ${t.label.toLowerCase()}`));
      item.appendChild(htmlEl("span", "td-v", `${t.height.toFixed(1)} m \u00b7 ${t.time}`));
      pair.appendChild(item);
    }
    body.appendChild(pair);
    // A stale table stays in view. Everything else that explains the card is tucked into Details, like the lightning card.
    if (view.stale) body.appendChild(htmlEl("p", "small td-row", "Showing the last tide table we could read."));
    const more = document.createElement("details");
    more.appendChild(htmlEl("summary", null, "Details"));
    if (view.chartOk) {
      const full = svgEl("svg", { class: "td-svg", viewBox: `0 0 ${W} ${FULL.h}`, role: "img",
        "aria-label": `Predicted tide today with each high and low. Next ${view.next.label.toLowerCase()} at ${view.next.time}, ${view.next.height.toFixed(1)} metres.` });
      drawChart(full, chartGeometry(view, FULL), true);
      more.appendChild(full);
      more.appendChild(htmlEl("p", "small td-row", "Shaded: the current rise or fall, from one tide to the next. Dashed line: now."));
    } else {
      more.appendChild(htmlEl("p", "small td-row", "The day's chart isn't available right now."));
    }
    more.appendChild(htmlEl("p", "small td-row", "This card shows tide height only. Current direction and strength aren't shown."));
    const src = `Source: ${view.source}.` + (view.fetchedTime ? ` Table read at ${view.fetchedTime}.` : "");
    more.appendChild(htmlEl("p", "small td-row", `${view.note} ${src}`.trim()));
    body.appendChild(more);
  }

  return {
    update(tide, message, generatedAt) {
      if (tide === undefined) { host.hidden = true; return; }       // an older API with no tide field: show nothing
      const ms = typeof generatedAt === "string" ? Date.parse(generatedAt) : NaN;
      const view = tide === null ? null : tideView(tide, ms);
      if (view) showTide(view);
      else showUnavailable(tide === null ? message : "The tide table could not be checked right now.");
    },
    clear() { host.hidden = true; body.replaceChildren(); },
    destroy() { host.replaceChildren(); },
  };
}

// Builds on first use, and can never break the rest of the page.
export function createTideCard(host) {
  let inner = null, off = false;
  const disable = (err) => {
    off = true;
    if (err && typeof console !== "undefined") console.error("Tide card turned off:", err);
    try { if (host) host.hidden = true; } catch (e) { /* nothing to hide */ }
  };
  const get = () => {
    if (inner || off) return inner;
    if (!host || typeof document === "undefined" || typeof document.createElementNS !== "function") { off = true; return null; }
    try { inner = buildCard(host); } catch (err) { disable(err); }
    return inner;
  };
  return {
    update(tide, message, generatedAt) {
      const c = get();
      if (!c) return;
      try { c.update(tide, message, generatedAt); } catch (err) { disable(err); }
    },
    clear() { if (inner) { try { inner.clear(); } catch (err) { disable(err); } } },
    destroy() { if (inner) { try { inner.destroy(); } catch (err) { /* already gone */ } } inner = null; },
  };
}
