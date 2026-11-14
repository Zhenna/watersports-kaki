import { CONFIG } from "./config.js";
import {
  LEVELS, LEVEL_LABELS, levelFromQuery, apiUrl, buildView, errorMessage, FAIL_CLOSED_NOTE,
} from "./lib.js";

const $ = (id) => document.getElementById(id);

// All API text goes in through textContent, never innerHTML.
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

let level = levelFromQuery(location.search);
let lastLoad = 0;
let inflight = null;

function setupControls() {
  const select = $("level");
  for (const l of LEVELS) {
    const o = el("option", null, LEVEL_LABELS[l]);
    o.value = l;
    select.appendChild(o);
  }
  select.value = level;
  select.addEventListener("change", () => {
    level = select.value;
    const url = new URL(location.href);
    url.searchParams.set("level", level);
    history.replaceState(null, "", url);
    load();
  });
  $("refresh").addEventListener("click", load);
}

function clearSections() {
  for (const id of ["wind", "lightning", "guidance", "about"]) $(id).replaceChildren();
}

function showBanner(message, kind) {
  const b = $("banner");
  b.hidden = false;
  b.className = `banner ${kind}`;
  b.replaceChildren(el("p", null, message));
}

function hideBanner() {
  const b = $("banner");
  b.hidden = true;
  b.replaceChildren();
}

function showLoading() {
  $("updated").textContent = "Loading conditions...";
  showBanner("Fetching the latest readings. This can take a few seconds.", "info");
}

function showError(message) {
  clearSections();
  $("updated").textContent = "";
  const b = $("banner");
  b.hidden = false;
  b.className = "banner error";
  b.replaceChildren(el("p", "strong", message), el("p", null, FAIL_CLOSED_NOTE));
  const about = $("about");
  about.appendChild(el("p", "small", "WSK shows weather data for information only. It is not safety advice."));
}

function renderWind(v) {
  const s = $("wind");
  s.replaceChildren(el("h2", null, "Wind"));
  if (!v.wind) {
    s.appendChild(el("p", "muted", v.windMessage));
    return;
  }
  const row = el("div", "big-row");
  row.appendChild(el("span", "big", v.wind.knots));
  row.appendChild(el("span", "muted", v.wind.kmh));
  s.appendChild(row);
  s.appendChild(el("p", null, v.wind.direction));
  if (v.wind.station) s.appendChild(el("p", "small", v.wind.station));
  if (v.wind.observed) {
    const p = el("p", "small", v.wind.observed);
    if (v.wind.stale) p.appendChild(el("span", "tag", "Out of date"));
    s.appendChild(p);
  }
  if (v.wind.note) s.appendChild(el("p", "small note", v.wind.note));
}

function renderLightning(v) {
  const s = $("lightning");
  s.replaceChildren(el("h2", null, "Lightning observations"));
  if (!v.lightning) {
    s.appendChild(el("p", "muted", v.lightningMessage));
    return;
  }
  s.appendChild(el("p", "strong", v.lightning.headline));
  s.appendChild(el("p", null, v.lightning.detail));
  if (v.lightning.checked) {
    const p = el("p", "small", v.lightning.checked);
    if (v.lightning.stale) p.appendChild(el("span", "tag", "Out of date"));
    s.appendChild(p);
  }
}

function renderGuidance(v) {
  const s = $("guidance");
  s.replaceChildren(el("h2", null, `${v.levelLabel} ${v.activityLabel.toLowerCase()}`));
  s.appendChild(el("span", "pill", v.guidance.statusLabel));
  s.appendChild(el("p", "summary", v.guidance.summary));
  if (v.guidance.flags.length) {
    const ul = el("ul", "flags");
    for (const f of v.guidance.flags) {
      const li = el("li", `flag ${f.severity}`);
      li.appendChild(el("span", "flag-label", f.label));
      li.appendChild(el("span", null, f.message));
      ul.appendChild(li);
    }
    s.appendChild(ul);
  }
}

function renderAbout(v) {
  const s = $("about");
  s.replaceChildren();
  if (v.sources.length) s.appendChild(el("p", "small", `Source: ${v.sources.join(", ")}`));
  for (const a of v.advisories) {
    const link = el("a", null, a.label);
    link.href = a.url;
    link.target = "_blank";
    link.rel = "noopener";
    const p = el("p", "small", "Official advisories: ");
    p.appendChild(link);
    s.appendChild(p);
  }
  s.appendChild(el("p", "small", v.disclaimer));
}

function render(v) {
  hideBanner();
  $("spot-name").textContent = v.spotName;
  $("updated").textContent = v.updated ? `Updated ${v.updated} SGT` : "";
  renderWind(v);
  renderLightning(v);
  renderGuidance(v);
  renderAbout(v);
}

async function load() {
  if (inflight) inflight.abort();
  const ctrl = new AbortController();
  inflight = ctrl;
  const timer = setTimeout(() => ctrl.abort("timeout"), 25000);
  showLoading();
  try {
    const res = await fetch(apiUrl(CONFIG, level), {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      showError(errorMessage("http", res.status));
      return;
    }
    render(buildView(await res.json()));
    lastLoad = Date.now();
  } catch (e) {
    if (inflight !== ctrl) return;  // replaced by a newer request
    showError(errorMessage(ctrl.signal.reason === "timeout" ? "timeout" : "network"));
  } finally {
    clearTimeout(timer);
    if (inflight === ctrl) inflight = null;
  }
}

setupControls();
load();
setInterval(() => { if (document.visibilityState === "visible") load(); }, 120000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastLoad > 60000) load();
});
