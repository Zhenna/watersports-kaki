import { CONFIG } from "./config.js";
import {
  LEVELS, LEVEL_LABELS, SLOTS, selectionFromQuery, pickOption, catalogActivitiesUrl,
  catalogSpotsUrl, conditionsUrl, forecastUrl, buildView, buildForecastView, errorMessage,
  FAIL_CLOSED_NOTE, upcomingDays, planSummary, formHint,
} from "./lib.js";

const $ = (id) => document.getElementById(id);

// All API text goes in through textContent, never innerHTML.
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const state = {
  activities: [], spots: [], activity: null, spot: null, level: "beginner", tab: "now",
  plan: { days: [], dayIdx: 0, slot: "AM" },
  forecast: { key: null, status: "idle", payload: null },
};
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
  if (state.tab === "plan") url.searchParams.set("tab", "plan");
  else url.searchParams.delete("tab");
  history.replaceState(null, "", url);
}

function clearNow() {
  for (const id of ["headline", "lightning-alert", "details-body"]) $(id).replaceChildren();
  $("lightning-alert").hidden = true;
  $("details").hidden = true;
}

function showBanner(message, kind, withNote = false) {
  const b = $("banner");
  b.hidden = false;
  b.className = `banner ${kind}`;
  b.replaceChildren(el("p", kind === "error" ? "strong" : null, message));
  if (withNote) b.appendChild(el("p", null, FAIL_CLOSED_NOTE));
}

function hideBanner() {
  const b = $("banner");
  b.hidden = true;
  b.replaceChildren();
}

function setNowStatus(message, kind) {
  const s = $("now-status");
  if (!message) {
    s.hidden = true;
    s.replaceChildren();
    return;
  }
  s.hidden = false;
  s.className = `banner ${kind}`;
  s.replaceChildren(el("p", kind === "error" ? "strong" : null, message));
  if (kind === "error") s.appendChild(el("p", null, FAIL_CLOSED_NOTE));
}

// A problem with the sport or location lists blocks everything.
function showFatal(message, withNote = true) {
  clearNow();
  $("plan").replaceChildren();
  $("updated").textContent = "";
  setNowStatus(null);
  showBanner(message, "error", withNote);
  renderAboutShort();
}

function advisoryLink(v) {
  const a = v.advisories[0];
  if (!a) return null;
  const link = el("a", null, a.label);
  link.href = a.url;
  link.target = "_blank";
  link.rel = "noopener";
  const p = el("p", "small", "Official advisories: ");
  p.appendChild(link);
  return p;
}

// ---------- tabs ----------
function setTab(tab) {
  state.tab = tab;
  $("tab-now").className = tab === "now" ? "tab on" : "tab";
  $("tab-plan").className = tab === "plan" ? "tab on" : "tab";
  $("tab-now").setAttribute("aria-selected", String(tab === "now"));
  $("tab-plan").setAttribute("aria-selected", String(tab === "plan"));
  $("pane-now").hidden = tab !== "now";
  $("pane-plan").hidden = tab !== "plan";
  updateUrl();
  if (tab === "plan") ensureForecast();
}

// ---------- right now ----------
function renderHeadline(v, ctx) {
  const s = $("headline");
  s.replaceChildren();
  const tagrow = el("div", "tagrow");
  tagrow.appendChild(el("span", "chip-tag", "Right now"));
  tagrow.appendChild(el("span", "small", `${v.levelLabel} ${ctx.activityName.toLowerCase()}`));
  s.appendChild(tagrow);
  s.appendChild(el("p", "headline", v.headline || "Wind data unavailable"));
  s.appendChild(el("span", "pill", v.guidance.statusLabel));
  if (v.windLine) s.appendChild(el("p", "windline", v.windLine));
  if (v.guidance.summary) s.appendChild(el("p", "summary", v.guidance.summary));
  if (!v.wind && v.windMessage) s.appendChild(el("p", "muted", v.windMessage));
}

// Only when there is something to act on. Quiet lightning data lives in the details.
function renderLightningAlert(v) {
  const s = $("lightning-alert");
  const c = v.lightningCard;
  s.replaceChildren();
  if (c.kind === "quiet") {
    s.hidden = true;
    return;
  }
  s.hidden = false;
  s.className = c.kind === "alert" ? "alert-box" : "alert-box unavailable";
  s.appendChild(el("h2", null, c.pill));
  s.appendChild(el("p", c.kind === "alert" ? "strong" : null, c.text));
  if (c.sub) s.appendChild(el("p", "small", c.sub));
  const link = advisoryLink(v);
  if (link) s.appendChild(link);
}

function block(title) {
  const b = el("div", "block");
  b.appendChild(el("h3", null, title));
  return b;
}

function renderDetails(v) {
  const body = $("details-body");
  body.replaceChildren();

  const summary = block("Conditions summary");
  if (v.guidance.detail) summary.appendChild(el("p", null, v.guidance.detail));
  else summary.appendChild(el("p", "small", v.guidance.summary || "No assessment available."));
  if (v.guidance.flags.length) {
    const ul = el("ul", "flags");
    for (const f of v.guidance.flags) {
      const li = el("li", `flag ${f.severity}`);
      li.appendChild(el("span", "flag-label", f.label));
      li.appendChild(el("span", null, f.message));
      ul.appendChild(li);
    }
    summary.appendChild(ul);
  }
  body.appendChild(summary);

  const source = block("Source and limits");
  if (v.wind) {
    source.appendChild(el("p", null, `${v.wind.source}, ${v.wind.sourceSub}`));
    const ul = el("ul", "stations");
    for (const line of v.wind.stations) ul.appendChild(el("li", "small", line));
    source.appendChild(ul);
    if (v.wind.observed) {
      const p = el("p", "small", v.wind.observed);
      if (v.wind.stale) p.appendChild(el("span", "tag", "Out of date"));
      source.appendChild(p);
    }
    if (v.wind.note) source.appendChild(el("p", "small note", v.wind.note));
  } else {
    source.appendChild(el("p", "small", v.windMessage));
  }
  if (v.guidance.limitations) source.appendChild(el("p", "small", v.guidance.limitations));
  if (v.sources.length) source.appendChild(el("p", "small", `Source: ${v.sources.join(", ")}.`));
  body.appendChild(source);

  const c = v.lightningCard;
  const lightning = block("Lightning");
  if (c.kind === "quiet") {
    lightning.appendChild(el("p", null, `${c.pill}. ${c.text}`));
    if (c.sub) lightning.appendChild(el("p", "small", c.sub));
    lightning.appendChild(el("p", "small", "Lightning data can lag by a few minutes."));
  } else {
    lightning.appendChild(el("p", "small", c.sub || "See the notice above."));
  }
  body.appendChild(lightning);

  body.appendChild(el("p", "small", v.disclaimer));
  $("details").hidden = false;
}

function renderAboutShort() {
  const s = $("about");
  s.replaceChildren(el("p", "small", "For information only. Not safety advice."));
}

function renderNow(v, ctx) {
  setNowStatus(null);
  hideBanner();
  $("context").textContent = `Conditions at ${ctx.spotName}`;
  $("updated").textContent = v.updated ? `Updated ${v.updated} SGT` : "";
  renderLightningAlert(v);
  renderHeadline(v, ctx);
  renderDetails(v);
  renderAboutShort();
}

// ---------- plan ahead ----------
function renderForecastBlock() {
  const wrap = el("div", "forecast");
  const f = state.forecast;
  const day = state.plan.days[state.plan.dayIdx];
  if (f.status === "idle" || f.status === "loading") {
    wrap.appendChild(el("p", "muted", "Loading forecast..."));
    return wrap;
  }
  if (f.status === "error") {
    wrap.appendChild(el("p", "muted", `Forecast unavailable right now. ${FAIL_CLOSED_NOTE}`));
    return wrap;
  }
  const v = buildForecastView(f.payload, day, state.plan.slot);
  if (v.state === "none") {
    wrap.appendChild(el("p", "muted", v.message));
    return wrap;
  }
  wrap.appendChild(el("p", "label", "Forecast"));
  if (v.headline) wrap.appendChild(el("p", "headline", v.headline));
  wrap.appendChild(el("span", "pill", v.pill));
  if (v.windLine) wrap.appendChild(el("p", "windline", v.windLine));
  if (v.weatherLine) wrap.appendChild(el("p", null, v.weatherLine));
  if (v.thundery) wrap.appendChild(el("p", "strong", "Thundery showers in the forecast."));
  if (v.summary) wrap.appendChild(el("p", "summary", v.summary));
  if (v.stale) wrap.appendChild(el("p", "small", "This forecast is out of date."));
  if (v.limits) wrap.appendChild(el("p", "small", v.limits));
  if (v.note) wrap.appendChild(el("p", "small", v.note));
  return wrap;
}

function renderPlan() {
  const s = $("plan");
  s.replaceChildren();
  s.appendChild(el("h2", null, "Find your Kakis"));
  s.appendChild(el("p", "plan-sub", "When would you like to get on the water?"));

  const chips = el("div", "chips");
  state.plan.days.forEach((d, i) => {
    const b = el("button", i === state.plan.dayIdx ? "chip on" : "chip", d.label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(i === state.plan.dayIdx));
    b.addEventListener("click", () => { state.plan.dayIdx = i; renderPlan(); });
    chips.appendChild(b);
  });
  s.appendChild(chips);

  const slots = el("div", "slots");
  for (const sl of SLOTS) {
    const b = el("button", sl.key === state.plan.slot ? "slot on" : "slot");
    b.type = "button";
    b.setAttribute("aria-pressed", String(sl.key === state.plan.slot));
    b.appendChild(el("span", "slot-name", sl.key));
    b.appendChild(el("span", "slot-sub", sl.sub));
    b.addEventListener("click", () => { state.plan.slot = sl.key; renderPlan(); });
    slots.appendChild(b);
  }
  s.appendChild(slots);

  s.appendChild(renderForecastBlock());

  const day = state.plan.days[state.plan.dayIdx];
  const foot = el("div", "plan-foot");
  const left = el("div");
  left.appendChild(el("p", "summary-line", planSummary(day, state.plan.slot)));
  left.appendChild(el("p", "small", `Interest only. Nothing is booked. ${formHint(day, state.plan.slot)}`));
  foot.appendChild(left);
  const link = el("a", "cta", "I'm interested \u2192");
  link.href = CONFIG.INTEREST_URL;
  link.target = "_blank";
  link.rel = "noopener";
  foot.appendChild(link);
  s.appendChild(foot);
}

function forecastKey() {
  return `${state.activity?.slug}|${state.spot?.slug}|${state.level}`;
}

async function loadForecast() {
  if (!state.activity || !state.spot) return;
  const key = forecastKey();
  state.forecast = { key, status: "loading", payload: null };
  renderPlan();
  const res = await getJson(forecastUrl(CONFIG, {
    spot: state.spot.slug, activity: state.activity.slug, level: state.level,
  }));
  if (state.forecast.key !== key) return;   // the selection changed while this was loading
  state.forecast = res.ok ? { key, status: "ok", payload: res.data } : { key, status: "error", payload: null };
  renderPlan();
}

function ensureForecast() {
  if (state.forecast.key !== forecastKey()) loadForecast();
}

// ---------- loading ----------
async function loadConditions() {
  if (!state.activity || !state.spot) return;
  if (inflight) inflight.abort();
  const ctrl = new AbortController();
  inflight = ctrl;
  const timer = setTimeout(() => ctrl.abort("timeout"), 25000);
  $("updated").textContent = "Loading conditions...";
  setNowStatus("Fetching the latest readings. This can take a few seconds.", "info");
  try {
    const res = await fetch(
      conditionsUrl(CONFIG, { spot: state.spot.slug, activity: state.activity.slug, level: state.level }),
      { signal: ctrl.signal, headers: { Accept: "application/json" } },
    );
    if (!res.ok) {
      clearNow();
      $("updated").textContent = "";
      setNowStatus(errorMessage("http", res.status), "error");
      return;
    }
    const payload = await res.json();
    renderNow(buildView(payload), { activityName: state.activity.name, spotName: state.spot.name });
    lastLoad = Date.now();
  } catch (e) {
    if (inflight !== ctrl) return;  // replaced by a newer request
    clearNow();
    $("updated").textContent = "";
    setNowStatus(errorMessage(ctrl.signal.reason === "timeout" ? "timeout" : "network"), "error");
  } finally {
    clearTimeout(timer);
    if (inflight === ctrl) inflight = null;
  }
}

async function loadSpots(wantedSpot) {
  const res = await getJson(catalogSpotsUrl(CONFIG, state.activity.slug));
  if (!res.ok) {
    showFatal(errorMessage(res.kind ? res.kind : "http", res.status));
    return false;
  }
  state.spots = res.data.spots || [];
  state.spot = pickOption(state.spots, wantedSpot);
  fillSelect($("spot"), state.spots, state.spot?.slug);
  if (!state.spot) {
    showFatal("No locations are available for this sport yet.", false);
    return false;
  }
  return true;
}

function refreshAll() {
  updateUrl();
  state.forecast = { key: null, status: "idle", payload: null };
  if (state.tab === "plan") ensureForecast();
  else renderPlan();
  loadConditions();
}

async function init() {
  const wanted = selectionFromQuery(location.search);
  state.level = wanted.level;
  state.plan.days = upcomingDays();
  fillSelect($("level"), LEVELS.map((l) => ({ slug: l, name: LEVEL_LABELS[l] })), state.level);
  renderAboutShort();

  const res = await getJson(catalogActivitiesUrl(CONFIG));
  if (!res.ok) {
    showFatal(errorMessage(res.kind ? res.kind : "http", res.status));
    return;
  }
  state.activities = res.data.activities || [];
  state.activity = pickOption(state.activities, wanted.activity);
  fillSelect($("sport"), state.activities, state.activity?.slug);
  if (!state.activity) {
    showFatal("No sports are available yet.", false);
    return;
  }
  if (!(await loadSpots(wanted.spot))) return;
  setTab(wanted.tab);
  renderPlan();
  await loadConditions();
}

function setupControls() {
  $("sport").addEventListener("change", async () => {
    state.activity = pickOption(state.activities, $("sport").value);
    if (!(await loadSpots(null))) return;
    refreshAll();
  });
  $("spot").addEventListener("change", () => {
    state.spot = pickOption(state.spots, $("spot").value);
    refreshAll();
  });
  $("level").addEventListener("change", () => {
    state.level = $("level").value;
    refreshAll();
  });
  $("refresh").addEventListener("click", loadConditions);
  $("tab-now").addEventListener("click", () => setTab("now"));
  $("tab-plan").addEventListener("click", () => setTab("plan"));
}

setupControls();
init();
setInterval(() => { if (document.visibilityState === "visible") loadConditions(); }, 120000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastLoad > 60000) loadConditions();
});
