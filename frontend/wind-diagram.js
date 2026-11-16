// Wind direction diagram: thin animated arrows and a compass ring, drawn as SVG.
// Pure helpers are exported so they can be tested in Node. The DOM is only touched in createWindDiagram.
//
// Input is observations.wind from the conditions API. Direction is where the wind blows FROM.
// It fails closed: a missing, stale or invalid reading shows no arrows and says so.
// The shoreline is drawn only when the API sends spot.launch_point (draft or reviewed, labelled as such).
// It draws no sectors and no wording about suitability. Those wait for reviewed data.

const NS = "http://www.w3.org/2000/svg";
const W = 480, H = 150, CX = 240, CY = 80, R = 56;
const LANE_GAP = 18, PER_LANE = 3;
const P16 = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];

export function norm(d) { return ((d % 360) + 360) % 360; }
export function compass(d) { return P16[Math.round(norm(d) / 22.5) % 16]; }
export function vec(deg) { const r = deg * Math.PI / 180; return [Math.sin(r), -Math.cos(r)]; }
export function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Largest gap in degrees between any two directions, going the short way round.
export function angularSpread(degs) {
  let max = 0;
  for (let i = 0; i < degs.length; i++) {
    for (let j = i + 1; j < degs.length; j++) {
      const diff = Math.abs(norm(degs[i]) - norm(degs[j]));
      max = Math.max(max, Math.min(diff, 360 - diff));
    }
  }
  return max;
}

export function arrowSpeedPx(knots) { return clamp(14 + knots * 4.5, 14, 110); }
export function arrowLengthPx(knots) { return clamp(10 + knots * 1.8, 12, 34); }

// Turns observations.wind into what the diagram should show.
function windState(wind) {
  const none = { status: "unavailable", main: "Wind direction unavailable", sub: "No arrows are shown without a current reading." };
  if (!wind || typeof wind !== "object") return none;
  if (wind.stale === true) {
    return { status: "unavailable", main: "Wind reading is out of date", sub: "No arrows are shown without a current reading." };
  }
  if (!isNum(wind.from_deg) || wind.from_deg < 0 || wind.from_deg > 360) return none;

  const fromDeg = norm(wind.from_deg);
  const toDeg = norm(fromDeg + 180);
  const station = wind.direction_station && wind.direction_station.station_name;
  const dirId = wind.direction_station && wind.direction_station.station_id;
  const others = (Array.isArray(wind.readings) ? wind.readings : [])
    .filter((r) => r && isNum(r.direction_deg) && r.station_id !== dirId)
    .map((r) => norm(r.direction_deg));
  const disagree = others.length > 0 && angularSpread([fromDeg, ...others]) > 45;

  const base = { fromDeg, toDeg, others, disagree, knots: null, station };
  const sub = [`Blowing toward ${compass(toDeg)} (${Math.round(toDeg)}\u00b0)`];
  if (station) sub.push(`direction from ${station}`);
  let subText = sub.join(", ") + ".";
  if (disagree) subText += " Nearby stations report different directions (hollow dots).";

  if (!isNum(wind.knots) || wind.knots < 0) {
    return { ...base, status: "no_speed", main: `Wind from ${compass(fromDeg)} (${Math.round(fromDeg)}\u00b0)`, sub: subText + " Speed unavailable, so no arrows." };
  }
  if (wind.knots < 1) {
    return { ...base, status: "calm", knots: wind.knots, main: `Wind from ${compass(fromDeg)} (${Math.round(fromDeg)}\u00b0)`, sub: subText + " Calm, so no arrows." };
  }
  return { ...base, status: "ok", knots: wind.knots, main: `Wind from ${compass(fromDeg)} (${Math.round(fromDeg)}\u00b0)`, sub: subText };
}

// spot.launch_point from the API, checked again here. Anything odd means no shoreline is drawn.
export function shoreState(lp) {
  if (!lp || typeof lp !== "object") return null;
  const shore = lp.shore_bearing_deg, sea = lp.sea_bearing_deg;
  if (!isNum(shore) || !isNum(sea) || shore < 0 || shore > 360 || sea < 0 || sea > 360) return null;
  const gap = norm(sea - shore);
  if (Math.abs(gap - 90) > 15 && Math.abs(gap - 270) > 15) return null; // sea must lie across the shore
  const name = typeof lp.name === "string" && lp.name.trim() ? lp.name.trim() : null;
  return { shoreDeg: norm(shore), seaDeg: norm(sea), name, draft: lp.review_status !== "reviewed" };
}

// The corner farthest on the land side and the corner farthest on the sea side, for the Land and Sea labels.
export function labelCorners(seaDeg) {
  const [sx, sy] = vec(seaDeg);
  const corners = [[14, 22], [W - 14, 22], [14, H - 10], [W - 14, H - 10]];
  let land = null, sea = null, lo = Infinity, hi = -Infinity;
  for (const c of corners) {
    const d = (c[0] - CX) * sx + (c[1] - CY) * sy;
    if (d < lo) { lo = d; land = c; }
    if (d > hi) { hi = d; sea = c; }
  }
  return { land, sea };
}

const CLASS_LABEL = { onshore: "Onshore", cross_shore: "Cross-shore", offshore: "Offshore" };

// guidance.direction from the API: the wind's class against the shore. Anything odd means no label.
export function directionState(d) {
  if (!d || typeof d !== "object" || !CLASS_LABEL[d.class]) return null;
  const others = (Array.isArray(d.other_classes) ? d.other_classes : [])
    .filter((c) => CLASS_LABEL[c] && c !== d.class);
  return {
    label: CLASS_LABEL[d.class],
    differ: others.map((c) => CLASS_LABEL[c].toLowerCase()),
    draft: d.review_status !== "reviewed",
  };
}

export function diagramState(wind, launchPoint, direction) {
  const st = windState(wind);
  const shore = shoreState(launchPoint);
  // The class comes from the same reading as the arrows, so it is hidden when that reading is not usable.
  const usable = st.status === "ok" || st.status === "calm" || st.status === "no_speed";
  const dir = usable ? directionState(direction) : null;
  let sub = st.sub;
  if (dir && dir.differ.length) sub += ` Other stations read as ${dir.differ.join(" and ")}.`;
  if (shore) sub += ` Shoreline about ${Math.round(shore.shoreDeg)}\u00b0${shore.draft ? ", draft" : ""}.`;
  return { ...st, shore, dir, sub };
}

const CSS = `
.wsk-wd .wd-svg{display:block;width:100%;height:auto;margin-top:8px}
.wsk-wd .wd-bg{fill:#eef5fd}
.wsk-wd .wd-land{fill:#f9ecd8}
.wsk-wd .wd-sea{fill:#d3e6f8}
.wsk-wd .wd-shore{stroke:#0d2c5b;stroke-width:2.2;fill:none;vector-effect:non-scaling-stroke}
.wsk-wd .wd-lbl{font:600 12px Inter,system-ui,sans-serif;fill:#5b6b86;paint-order:stroke;stroke-width:3px;stroke-linejoin:round}
.wsk-wd .wd-lbl.l{stroke:#f9ecd8}
.wsk-wd .wd-lbl.s{stroke:#d3e6f8}
.wsk-wd .wd-ring{fill:none;stroke:#0d2c5b;stroke-opacity:.25;stroke-width:1;vector-effect:non-scaling-stroke}
.wsk-wd .wd-n{font:600 14px Inter,system-ui,sans-serif;fill:#0d2c5b;text-anchor:middle}
.wsk-wd .wd-arrow{fill:none;stroke:#2a6fdb;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.wsk-wd .wd-from{fill:#2a6fdb;stroke:#fff;stroke-width:2;vector-effect:non-scaling-stroke}
.wsk-wd .wd-other{fill:#fff;stroke:#0d2c5b;stroke-opacity:.6;stroke-width:1.2;vector-effect:non-scaling-stroke}
.wsk-wd .wd-main{margin:8px 0 0;font-weight:600}
.wsk-wd .wd-main .pill{margin-left:8px;vertical-align:middle}
.wsk-wd .wd-sub{margin:2px 0 0}
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

function buildDiagram(host) {
  const head = document.head;
  if (head && !document.getElementById("wsk-wd-css")) {
    const st = document.createElement("style");
    st.id = "wsk-wd-css";
    st.textContent = CSS + "#wind-diagram-panel{margin-top:16px}";
    head.appendChild(st);
  }
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  host.classList.add("wsk-wd");
  host.hidden = true;

  // Static structure, built once.
  const tagrow = htmlEl("div", "tagrow");
  tagrow.appendChild(htmlEl("span", "chip-tag", "Wind direction"));
  const stationLabel = htmlEl("span", "small");
  tagrow.appendChild(stationLabel);

  const svg = svgEl("svg", { class: "wd-svg", viewBox: `0 0 ${W} ${H}`, role: "img" });
  const defs = svgEl("defs", {}, svg);
  const clip = svgEl("clipPath", { id: "wsk-wd-clip" }, defs);
  svgEl("rect", { width: W, height: H, rx: 12 }, clip);
  const frame = svgEl("g", { "clip-path": "url(#wsk-wd-clip)" }, svg);
  svgEl("rect", { class: "wd-bg", width: W, height: H }, frame);
  const scene = svgEl("g", {}, frame);
  const flow = svgEl("g", {}, frame);
  svgEl("circle", { class: "wd-ring", cx: CX, cy: CY, r: R }, frame);
  const nTick = svgEl("text", { class: "wd-n", x: CX, y: 15 }, frame);
  nTick.textContent = "N";
  const otherDots = svgEl("g", {}, frame);
  const fromDot = svgEl("circle", { class: "wd-from", r: 5.5, cx: CX, cy: CY }, frame);

  const main = htmlEl("p", "wd-main");
  const sub = htmlEl("p", "small wd-sub");
  const live = htmlEl("div");
  live.setAttribute("aria-live", "polite");
  live.append(main, sub);
  host.append(tagrow, svg, live);

  let arrows = [];
  let current = null;
  let raf = null;
  let t0 = null;

  function stop() { if (raf != null) cancelAnimationFrame(raf); raf = null; }

  function buildPool(toDeg, knots) {
    flow.replaceChildren();
    const [dx, dy] = vec(toDeg);
    const px = -dy, py = dx;
    const alongExtent = Math.abs(dx) * W + Math.abs(dy) * H;
    const perpExtent = Math.abs(px) * W + Math.abs(py) * H;
    const lanes = Math.ceil(perpExtent / LANE_GAP) + 1;
    const len = arrowLengthPx(knots);
    const cycle = alongExtent + 2 * len;
    arrows = [];
    for (let i = 0; i < lanes; i++) {
      for (let k = 0; k < PER_LANE; k++) {
        const node = svgEl("path", { class: "wd-arrow", d: `M${-len},0H0M-4,-3L0,0L-4,3` }, flow);
        arrows.push({
          node, cycle,
          offset: (i - (lanes - 1) / 2) * LANE_GAP,
          phase: ((i * 0.37) % 1 + k / PER_LANE) % 1,
        });
      }
    }
  }

  function frameAt(sec) {
    const [dx, dy] = vec(current.toDeg);
    const px = -dy, py = dx;
    const speed = arrowSpeedPx(current.knots);
    const rot = current.toDeg - 90;
    for (const a of arrows) {
      const f = ((sec * speed) / a.cycle + a.phase) % 1;
      const s = (f - 0.5) * a.cycle;
      const x = CX + dx * s + px * a.offset;
      const y = CY + dy * s + py * a.offset;
      a.node.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})`);
      a.node.setAttribute("opacity", (Math.sin(Math.PI * f) * 0.95).toFixed(2));
    }
  }

  function tick(ts) {
    if (t0 == null) t0 = ts;
    frameAt((ts - t0) / 1000);
    raf = requestAnimationFrame(tick);
  }

  function render() {
    stop();
    host.hidden = false;
    const showArrows = current.status === "ok";
    const showDot = current.status === "ok" || current.status === "calm" || current.status === "no_speed";
    flow.replaceChildren();
    otherDots.replaceChildren();
    scene.replaceChildren();
    fromDot.style.display = showDot ? "" : "none";

    const shore = current.shore;
    if (shore) {
      const g = svgEl("g", { transform: `rotate(${shore.seaDeg - 180} ${CX} ${CY})` }, scene);
      svgEl("rect", { class: "wd-land", x: -600, y: -600, width: 1680, height: 600 + CY }, g);
      svgEl("rect", { class: "wd-sea", x: -600, y: CY, width: 1680, height: 700 }, g);
      svgEl("line", { class: "wd-shore", x1: -600, y1: CY, x2: 1080, y2: CY }, g);
      const { land, sea } = labelCorners(shore.seaDeg);
      for (const [pt, cls, text] of [[land, "l", "Land"], [sea, "s", "Sea"]]) {
        const t = svgEl("text", { class: `wd-lbl ${cls}`, x: pt[0], y: pt[1], "text-anchor": pt[0] < CX ? "start" : "end" }, scene);
        t.textContent = text;
      }
      const place = shore.name ? `Shore at ${shore.name}` : "Shoreline";
      stationLabel.textContent = shore.draft ? `${place} (draft)` : place;
    } else {
      stationLabel.textContent = current.station || "";
    }

    if (showDot) {
      const [vx, vy] = vec(current.fromDeg);
      fromDot.setAttribute("cx", CX + vx * R);
      fromDot.setAttribute("cy", CY + vy * R);
      for (const d of current.others) {
        const [ox, oy] = vec(d);
        svgEl("circle", { class: "wd-other", r: 3.5, cx: CX + ox * R, cy: CY + oy * R }, otherDots);
      }
    }
    main.replaceChildren(htmlEl("span", null, current.main));
    let dirText = "";
    if (current.dir) {
      dirText = `${current.dir.label}${current.dir.draft ? " (draft)" : ""}`;
      main.appendChild(htmlEl("span", "pill", dirText));
      if (current.dir.differ.length) main.appendChild(htmlEl("span", "pill", "Stations differ"));
      dirText = `, ${dirText}`;
    }
    sub.textContent = current.sub;
    svg.setAttribute("aria-label", `${current.main}${dirText}. ${current.sub}`);

    if (showArrows) {
      buildPool(current.toDeg, current.knots);
      t0 = null;
      if (reduced) frameAt(0.35);
      else raf = requestAnimationFrame(tick);
    }
  }

  function onVisibility() {
    if (!current) return;
    if (document.hidden) stop();
    else render();
  }
  if (typeof document.addEventListener === "function") document.addEventListener("visibilitychange", onVisibility);

  return {
    // wind: observations.wind. launchPoint: spot.launch_point. direction: guidance.direction. Any may be missing.
    update(wind, launchPoint, direction) { current = diagramState(wind, launchPoint, direction); render(); },
    clear() { stop(); current = null; flow.replaceChildren(); scene.replaceChildren(); host.hidden = true; },
    destroy() {
      stop();
      if (typeof document.removeEventListener === "function") document.removeEventListener("visibilitychange", onVisibility);
      host.replaceChildren();
    },
  };
}

// Builds the panel inside `host` (a <section class="card">). Returns { update, clear, destroy }.
// The panel is built on first use, and it can never break the rest of the page: if the page has no
// usable DOM, or drawing throws, the diagram switches itself off and the conditions cards carry on.
export function createWindDiagram(host) {
  let inner = null;
  let off = false;

  function disable(err) {
    off = true;
    if (err && typeof console !== "undefined") console.error("Wind diagram turned off:", err);
    try { if (host) host.hidden = true; } catch (e) { /* nothing to hide */ }
  }

  function get() {
    if (inner || off) return inner;
    if (!host || typeof document === "undefined" || typeof document.createElementNS !== "function") {
      off = true;
      return null;
    }
    try { inner = buildDiagram(host); } catch (err) { disable(err); }
    return inner;
  }

  return {
    update(wind, launchPoint, direction) {
      const d = get();
      if (!d) return;
      try { d.update(wind, launchPoint, direction); } catch (err) { disable(err); }
    },
    clear() { if (inner) { try { inner.clear(); } catch (err) { disable(err); } } },
    destroy() { if (inner) { try { inner.destroy(); } catch (err) { /* already gone */ } } inner = null; },
  };
}
