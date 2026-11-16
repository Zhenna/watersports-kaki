// Tide card: the predicted tide for today, from observations.tide in the conditions response.
// Pure helpers are exported so Node can test them. The DOM is only touched inside createTideCard.
//
// It shows tide height only. It says nothing about current direction or strength.
// Anything missing or odd fails closed: "Tide data unavailable", never a guess.

export const NEA_TIDE_URL = "https://www.nea.gov.sg/corporate-functions/weather/tide-timings";
const NS = "http://www.w3.org/2000/svg";
const W = 400, H = 170, X0 = 36, X1 = 392, YBASE = 140, YTOP = 14;
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
  if (!isNum(tide.height_estimate_m) || !isNum(tide.leg_height_m)) return null;
  nowMs = isNum(nowMs) ? nowMs : Date.now();
  if (nowMs < prev.t - 60e3 || nowMs > next.t + 60e3) return null;     // the block no longer brackets now
  const raw = Array.isArray(tide.chart) && tide.chart.length >= 2 ? tide.chart : [tide.previous, tide.next];
  const points = raw.map(point).filter(Boolean).sort((a, b) => a.t - b.t);
  for (let i = 1; i < points.length; i++) if (points[i].kind === points[i - 1].kind) return null;
  if (points.length < 2) return null;
  const dayStart = Date.parse(`${sgtDate(nowMs)}T00:00:00+08:00`);
  const fetched = typeof tide.fetched_at === "string" ? hm(tide.fetched_at) : null;
  return {
    state: tide.state,
    heading: tide.state === "rising" ? "Rising tide" : "Falling tide",
    previous: { label: KIND[prev.kind], time: prev.time + dayNote(prev.t, nowMs), height: prev.h },
    next: { label: KIND[next.kind], time: next.time + dayNote(next.t, nowMs), height: next.h },
    nowHeight: tide.height_estimate_m,
    legHeight: tide.leg_height_m,
    points, prevPoint: prev, nextPoint: next, nowMs, dayStart, dayEnd: dayStart + 24 * HOUR,
    stale: tide.served_stale === true,
    fetchedTime: fetched,
    note: typeof tide.note === "string" ? tide.note : "",
    source: typeof tide.source === "string" ? tide.source : "NEA",
  };
}

export function yMaxFor(points) {
  return Math.max(3, Math.ceil(Math.max(...points.map((p) => p.h)) + 0.2));
}

export function chartGeometry(view) {
  const yMax = yMaxFor(view.points);
  const x = (ms) => X0 + ((ms - view.dayStart) / (view.dayEnd - view.dayStart)) * (X1 - X0);
  const y = (h) => YBASE - (h / yMax) * (YBASE - YTOP);
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
    yMax, x, y, curve, labels,
    now: nowH == null ? null : { x: x(view.nowMs), y: y(nowH) },
    leg: { x0: Math.max(X0, x(view.prevPoint.t)), x1: Math.min(X1, x(view.nextPoint.t)) },
    ticks: [0, 6, 12, 18, 24].map((h) => ({ x: x(view.dayStart + h * HOUR), text: `${String(h).padStart(2, "0")}:00` })),
    grid: Array.from({ length: yMax }, (_, i) => i + 1).map((v) => ({ y: y(v), text: `${v} m` })),
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
.wsk-td .td-head{margin:8px 0 0;font-weight:600;font-size:1.1rem}
.wsk-td .td-row{margin:2px 0 0}
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
  tagrow.appendChild(htmlEl("span", "small", "Predicted, not measured"));
  const body = htmlEl("div");
  host.append(tagrow, body);

  function showUnavailable(message) {
    host.hidden = false;
    body.replaceChildren();
    body.appendChild(htmlEl("p", "td-head", "Tide data unavailable"));
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

  function showTide(view) {
    host.hidden = false;
    body.replaceChildren();
    body.appendChild(htmlEl("p", "td-head", view.heading));
    body.appendChild(htmlEl("p", "small td-row",
      `Next ${view.next.label.toLowerCase()} ${view.next.time}, ${view.next.height.toFixed(1)} m. ` +
      `Last ${view.previous.label.toLowerCase()} ${view.previous.time}, ${view.previous.height.toFixed(1)} m.`));
    body.appendChild(htmlEl("p", "td-row", `Height now: about ${view.nowHeight.toFixed(1)} m (estimate)`));

    const g = chartGeometry(view);
    const svg = svgEl("svg", { class: "td-svg", viewBox: `0 0 ${W} ${H}`, role: "img",
      "aria-label": `Predicted tide today. ${view.heading}, about ${view.nowHeight.toFixed(1)} metres now. ` +
        `Next ${view.next.label.toLowerCase()} at ${view.next.time}, ${view.next.height.toFixed(1)} metres.` }, body);
    svgEl("rect", { class: "td-leg", x: g.leg.x0, y: YTOP, width: Math.max(0, g.leg.x1 - g.leg.x0), height: YBASE - YTOP }, svg);
    for (const gl of g.grid) {
      svgEl("line", { class: "td-grid", x1: X0, x2: X1, y1: gl.y, y2: gl.y }, svg);
      const t = svgEl("text", { x: X0 - 4, y: gl.y + 4, "text-anchor": "end" }, svg);
      t.textContent = gl.text;
    }
    const d = g.curve.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
    svgEl("path", { class: "td-area", d: `${d}L${g.curve[g.curve.length - 1][0].toFixed(1)} ${YBASE}L${g.curve[0][0].toFixed(1)} ${YBASE}Z` }, svg);
    svgEl("path", { class: "td-line", d }, svg);
    if (g.now) {
      svgEl("line", { class: "td-now", x1: g.now.x, x2: g.now.x, y1: YTOP, y2: YBASE }, svg);
      svgEl("circle", { class: "td-nowdot", cx: g.now.x, cy: g.now.y, r: 4 }, svg);
    }
    for (const l of g.labels) {
      svgEl("circle", { class: "td-dot", cx: l.x, cy: l.y, r: 4 }, svg);
      const anchor = l.x < 70 ? "start" : l.x > 330 ? "end" : "middle";
      const t = svgEl("text", { class: "td-lbl", x: anchor === "start" ? Math.max(X0, l.x - 4) : anchor === "end" ? Math.min(X1, l.x + 4) : l.x,
        y: l.kind === "high" ? l.y - 9 : l.y + 17, "text-anchor": anchor }, svg);
      t.textContent = l.text;
    }
    for (const tk of g.ticks) {
      const t = svgEl("text", { x: tk.x, y: 158, "text-anchor": tk.x < 50 ? "start" : tk.x > 380 ? "end" : "middle" }, svg);
      t.textContent = tk.text;
    }

    // A stale table stays in view. Everything else that explains the card is tucked into Details, like the lightning card.
    if (view.stale) body.appendChild(htmlEl("p", "small td-row", "Showing the last tide table we could read."));
    const more = document.createElement("details");
    more.appendChild(htmlEl("summary", null, "Details"));
    more.appendChild(htmlEl("p", "small td-row", "Shaded: the current rise or fall, from one tide to the next. Dashed line: now."));
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
