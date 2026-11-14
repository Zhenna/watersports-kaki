import { CONFIG } from "./config.js";
import {
  LEVELS, LEVEL_LABELS, selectionFromQuery, pickOption, catalogActivitiesUrl, catalogSpotsUrl,
  conditionsUrl, buildView, errorMessage, FAIL_CLOSED_NOTE,
} from "./lib.js";

const $ = (id) => document.getElementById(id);

// All API text goes in through textContent, never innerHTML.
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const state = { activities: [], spots: [], activity: null, spot: null, level: "beginner" };
let lastLoad = 0;
let inflight = null;

// ---------- small helpers ----------
async function getJson(url, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false, kind: ctrl.signal.reason === "timeout" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

function fillSelect(select, options, selectedSlug) {
  select.replaceChildren();
  for (const o of options) {
    const opt = el("option", null, o.name);
    opt.value = o.slug;
    select.appendChild(opt);
  }
  select.value = selectedSlug ?? "";
}

function updateUrl() {
  const url = new URL(location.href);
  if (state.activity) url.searchParams.set("activity", state.activity.slug);
  if (state.spot) url.searchParams.set("spot", state.spot.slug);
  url.searchParams.set("level", state.level);
  history.replaceState(null, "", url);
}

function clearSections() {
  for (const id of ["alert", "guidance", "wind", "lightning", "interest", "about"]) $(id).replaceChildren();
  $("alert").hidden = true;
  $("details").hidden = true;
  $("context").textContent = "";
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

function showError(message, withNote = true) {
  clearSections();
  $("updated").textContent = "";
  const b = $("banner");
  b.hidden = false;
  b.className = "banner error";
  b.replaceChildren(el("p", "strong", message));
  if (withNote) b.appendChild(el("p", null, FAIL_CLOSED_NOTE));
  $("about").appendChild(el("p", "small", "WSK shows weather data for information only. It is not safety advice."));
}

// ---------- rendering ----------
function renderAlert(v) {
  const s = $("alert");
  s.replaceChildren();
  if (!v.alert) {
    s.hidden = true;
    return;
  }
  s.hidden = false;
  s.className = `alert ${v.alert.kind}`;
  s.appendChild(el("h2", null, v.alert.title));
  s.appendChild(el("p", null, v.alert.text));
  for (const a of v.advisories) {
    const link = el("a", null, a.label);
    link.href = a.url;
    link.target = "_blank";
    link.rel = "noopener";
    const p = el("p", "small", "Official advisories: ");
    p.appendChild(link);
    s.appendChild(p);
    break;
  }
}

function renderGuidance(v, ctx) {
  const s = $("guidance");
  s.replaceChildren(el("h2", null, `${v.levelLabel} ${ctx.activityName.toLowerCase()}`));
  s.appendChild(el("span", "pill", v.guidance.statusLabel));
  if (v.windLine) s.appendChild(el("p", "windline", v.windLine));
  s.appendChild(el("p", "summary", v.guidance.summary));
  if (v.guidance.notAssessed.length) {
    s.appendChild(el("p", "small", `Not assessed: ${v.guidance.notAssessed.join(", ")}.`));
  }
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

function renderWind(v) {
  const s = $("wind");
  s.replaceChildren(el("h3", null, "Wind"));
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
  s.replaceChildren(el("h3", null, "Lightning observations"));
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

function renderInterest() {
  const s = $("interest");
  s.replaceChildren(el("h2", null, "Want company?"));
  s.appendChild(el("p", null,
    "Tell us when you would go, morning or afternoon, and we will email you when others match."));
  const link = el("a", "cta", "Tell us when you would go");
  link.href = CONFIG.INTEREST_URL;
  link.target = "_blank";
  link.rel = "noopener";
  s.appendChild(link);
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

function render(v, ctx) {
  hideBanner();
  $("context").textContent = `${ctx.activityName} at ${ctx.spotName}`;
  $("updated").textContent = v.updated ? `Updated ${v.updated} SGT` : "";
  renderAlert(v);
  renderGuidance(v, ctx);
  renderWind(v);
  renderLightning(v);
  $("details").hidden = false;
  renderInterest();
  renderAbout(v);
}

// ---------- loading ----------
async function loadConditions() {
  if (!state.activity || !state.spot) return;
  if (inflight) inflight.abort();
  const ctrl = new AbortController();
  inflight = ctrl;
  const timer = setTimeout(() => ctrl.abort("timeout"), 25000);
  $("updated").textContent = "Loading conditions...";
  showBanner("Fetching the latest readings. This can take a few seconds.", "info");
  try {
    const res = await fetch(
      conditionsUrl(CONFIG, { spot: state.spot.slug, activity: state.activity.slug, level: state.level }),
      { signal: ctrl.signal, headers: { Accept: "application/json" } },
    );
    if (!res.ok) {
      showError(errorMessage("http", res.status));
      return;
    }
    const payload = await res.json();
    render(buildView(payload), { activityName: state.activity.name, spotName: state.spot.name });
    lastLoad = Date.now();
  } catch (e) {
    if (inflight !== ctrl) return;  // replaced by a newer request
    showError(errorMessage(ctrl.signal.reason === "timeout" ? "timeout" : "network"));
  } finally {
    clearTimeout(timer);
    if (inflight === ctrl) inflight = null;
  }
}

async function loadSpots(wantedSpot) {
  const res = await getJson(catalogSpotsUrl(CONFIG, state.activity.slug));
  if (!res.ok) {
    showError(errorMessage(res.kind ? res.kind : "http", res.status));
    return false;
  }
  state.spots = res.data.spots || [];
  state.spot = pickOption(state.spots, wantedSpot);
  fillSelect($("spot"), state.spots, state.spot?.slug);
  if (!state.spot) {
    showError("No locations are available for this sport yet.", false);
    return false;
  }
  return true;
}

async function init() {
  const wanted = selectionFromQuery(location.search);
  state.level = wanted.level;

  const level = $("level");
  fillSelect(level, LEVELS.map((l) => ({ slug: l, name: LEVEL_LABELS[l] })), state.level);

  const res = await getJson(catalogActivitiesUrl(CONFIG));
  if (!res.ok) {
    showError(errorMessage(res.kind ? res.kind : "http", res.status));
    return;
  }
  state.activities = res.data.activities || [];
  state.activity = pickOption(state.activities, wanted.activity);
  fillSelect($("sport"), state.activities, state.activity?.slug);
  if (!state.activity) {
    showError("No sports are available yet.", false);
    return;
  }
  if (!(await loadSpots(wanted.spot))) return;
  updateUrl();
  await loadConditions();
}

function setupControls() {
  $("sport").addEventListener("change", async () => {
    state.activity = pickOption(state.activities, $("sport").value);
    if (!(await loadSpots(null))) return;
    updateUrl();
    loadConditions();
  });
  $("spot").addEventListener("change", () => {
    state.spot = pickOption(state.spots, $("spot").value);
    updateUrl();
    loadConditions();
  });
  $("level").addEventListener("change", () => {
    state.level = $("level").value;
    updateUrl();
    loadConditions();
  });
  $("refresh").addEventListener("click", loadConditions);
}

setupControls();
init();
setInterval(() => { if (document.visibilityState === "visible") loadConditions(); }, 120000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastLoad > 60000) loadConditions();
});
