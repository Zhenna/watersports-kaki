import { CONFIG } from "./config.js";
import {
  LEVELS, LEVEL_LABELS, SLOTS, selectionFromQuery, pickOption, catalogActivitiesUrl,
  catalogSpotsUrl, conditionsUrl, forecastUrl, buildView, buildForecastView, forecastDates, errorMessage,
  FAIL_CLOSED_NOTE, upcomingDays, planSummary, formHint,
} from "./lib.js";
import { createWindDiagram } from "./wind-diagram.js";
import { createTideCard } from "./tide-card.js";
import { NEVER_TRIED, STARTER_LEVEL, WHEN_OPTIONS, panesFor, entryCard, learnerForm, interestLink, countView } from "./entry-requirements.js";
import { renderEntryCard } from "./entry-card.js";

const $ = (id) => document.getElementById(id);
const windDiagram = createWindDiagram($("wind-diagram-panel"));
const tideCard = createTideCard($("tide-panel"));

// All API text goes in through textContent, never innerHTML.
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const state = {
  activities: [], spots: [], activity: null, spot: null, level: "beginner", tab: "now",
  plan: { days: [], dayIdx: 0, slots: ["AM"] },
  forecast: { key: null, status: "idle", payload: null },
  windTab: null,   // which wind sub-tab is open: null, 0 (summary) or 1 (sources and limits)
};
let lastLoad = 0;
let inflight = null;
let entryKey = null;   // which selection the "never tried" card was last shown for
let whenChoice = null; // weekend, weekday or flexible, for the card in view

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
  for (const id of ["wind-panel", "lightning-panel"]) $(id).replaceChildren();
  $("lightning-panel").className = "card";
  windDiagram.clear();
  tideCard.clear();
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
function block(title) {
  const b = el("div", "block");
  b.appendChild(el("h3", null, title));
  return b;
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

function renderWindPanel(v, ctx) {
  const s = $("wind-panel");
  s.replaceChildren();
  const tagrow = el("div", "tagrow");
  tagrow.appendChild(el("span", "chip-tag", "Wind"));
  tagrow.appendChild(el("span", "small", `${v.levelLabel} ${ctx.activityName.toLowerCase()}`));
  s.appendChild(tagrow);
  s.appendChild(el("p", "headline", v.headline || "Wind data unavailable"));
  s.appendChild(el("span", "pill", v.guidance.statusLabel));
  if (v.windLine) s.appendChild(el("p", "windline", v.windLine));
  if (v.guidance.summary) s.appendChild(el("p", "summary", v.guidance.summary));
  if (!v.wind && v.windMessage) s.appendChild(el("p", "muted", v.windMessage));

  const summaryBox = el("div");
  if (v.guidance.detail) summaryBox.appendChild(el("p", null, v.guidance.detail));
  else summaryBox.appendChild(el("p", "small", v.guidance.summary || "No assessment available."));
  if (v.guidance.flags.length) {
    const ul = el("ul", "flags");
    for (const f of v.guidance.flags) {
      const li = el("li", `flag ${f.severity}`);
      li.appendChild(el("span", "flag-label", f.label));
      li.appendChild(el("span", null, f.message));
      ul.appendChild(li);
    }
    summaryBox.appendChild(ul);
  }

  const sourceBox = el("div");
  if (v.wind) {
    sourceBox.appendChild(el("p", null, `${v.wind.source}, ${v.wind.sourceSub}`));
    const ul = el("ul", "stations");
    for (const line of v.wind.stations) ul.appendChild(el("li", "small", line));
    sourceBox.appendChild(ul);
    if (v.wind.observed) {
      const p = el("p", "small", v.wind.observed);
      if (v.wind.stale) p.appendChild(el("span", "tag", "Out of date"));
      sourceBox.appendChild(p);
    }
    if (v.wind.note) sourceBox.appendChild(el("p", "small note", v.wind.note));
  } else {
    sourceBox.appendChild(el("p", "small", v.windMessage));
  }
  if (v.guidance.limitations) sourceBox.appendChild(el("p", "small", v.guidance.limitations));
  if (v.sources.length) sourceBox.appendChild(el("p", "small", `Source: ${v.sources.join(", ")}.`));
  sourceBox.appendChild(el("p", "small", v.disclaimer));

  const wrap = el("div", "subtabs-wrap");
  s.appendChild(wrap);
  fillWindTabs(wrap, [["Conditions summary", summaryBox], ["Sources and limits", sourceBox]]);
}

// Two tabs, closed by default. Tapping the open tab again closes it.
function fillWindTabs(wrap, tabs) {
  wrap.replaceChildren();
  const row = el("div", "subtabs");
  row.setAttribute("role", "tablist");
  tabs.forEach(([label], i) => {
    const on = state.windTab === i;
    const b = el("button", on ? "subtab on" : "subtab", label);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(on));
    b.addEventListener("click", () => {
      state.windTab = on ? null : i;
      fillWindTabs(wrap, tabs);
    });
    row.appendChild(b);
  });
  wrap.appendChild(row);
  if (state.windTab !== null) {
    const body = el("div", "subtab-body");
    body.setAttribute("role", "tabpanel");
    body.appendChild(tabs[state.windTab][1]);
    wrap.appendChild(body);
  }
}

// Lightning is real time only, so it has its own panel and never appears in the forecast.
function renderLightningPanel(v) {
  const s = $("lightning-panel");
  const c = v.lightningCard;
  s.replaceChildren();
  s.className = c.kind === "alert" ? "card alert" : c.kind === "unavailable" ? "card unavailable" : "card";

  const tagrow = el("div", "tagrow");
  tagrow.appendChild(el("span", "chip-tag", "Lightning"));
  tagrow.appendChild(el("span", "small", "Live"));
  s.appendChild(tagrow);
  s.appendChild(el("p", "headline", c.headline));
  s.appendChild(el("span", "pill", c.pill));
  if (c.line) s.appendChild(el("p", "windline", c.line));
  if (c.kind !== "quiet") {
    const link = advisoryLink(v);
    if (link) s.appendChild(link);
  }

  const d = el("details");
  d.appendChild(el("summary", null, "Details"));
  const b = el("div", "block");
  for (const line of c.detail) b.appendChild(el("p", "small", line));
  d.appendChild(b);
  s.appendChild(d);
}

function renderAboutShort() {
  const s = $("about");
  const p = el("p", "small", "For information only. Not safety advice. ");
  const link = el("a", null, "Privacy");
  link.href = "https://www.watersportskaki.sg/privacy.html";
  link.target = "_blank";
  link.rel = "noopener";
  p.appendChild(link);
  s.replaceChildren(p);
}

function renderNow(v, ctx) {
  setNowStatus(null);
  hideBanner();
  $("context").textContent = `Conditions at ${ctx.spotName}`;
  $("updated").textContent = v.updated ? `Updated ${v.updated} SGT` : "";
  renderWindPanel(v, ctx);
  renderLightningPanel(v);
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
  const v = buildForecastView(f.payload, day, state.plan.slots);
  if (v.state === "none") {
    wrap.appendChild(el("p", "muted", v.message));
    return wrap;
  }
  wrap.appendChild(el("p", "label", `Forecast for ${day.label}`));
  if (v.thunderNotice) {
    const n = el("div", "notice");
    n.appendChild(el("p", "strong", v.thunderNotice));
    n.appendChild(el("p", "small", "Check updated forecasts and official warnings on the day."));
    wrap.appendChild(n);
  }
  for (const line of v.weatherLines) wrap.appendChild(el("p", null, line));
  if (v.headline) wrap.appendChild(el("p", "headline", v.headline));
  wrap.appendChild(el("span", "pill", v.pill));
  if (v.windLine) wrap.appendChild(el("p", "windline", v.windLine));
  if (v.summary) wrap.appendChild(el("p", "summary", v.summary));
  if (v.stale) wrap.appendChild(el("p", "small", "This forecast is out of date."));

  const d = el("details");
  d.appendChild(el("summary", null, "Details"));
  const b = el("div", "block");
  if (v.small) b.appendChild(el("p", "small", v.small));
  b.appendChild(el("p", "small", "Lightning is checked live on the day. See Right now."));
  d.appendChild(b);
  wrap.appendChild(d);
  return wrap;
}

function toggleSlot(key) {
  const on = state.plan.slots.includes(key);
  if (on && state.plan.slots.length === 1) return;   // keep at least one selected
  state.plan.slots = SLOTS.map((x) => x.key).filter((k) => (k === key ? !on : state.plan.slots.includes(k)));
  renderPlan();
}

function renderPlan() {
  const s = $("plan");
  s.replaceChildren();
  s.appendChild(el("h2", null, "Find your next Water Day"));
  const where = state.activity && state.spot ? `${state.activity.name} \u00b7 ${state.spot.name}` : null;
  if (where) s.appendChild(el("p", "plan-sub", `${where} \u00b7 ${LEVEL_LABELS[state.level] ?? state.level}`));
  s.appendChild(el("p", "ask", "When would you like to go?"));

  const withForecast = state.forecast.status === "ok" ? forecastDates(state.forecast.payload) : new Set();
  const chips = el("div", "chips");
  state.plan.days.forEach((d, i) => {
    const has = withForecast.has(d.iso);
    const b = el("button", `chip${i === state.plan.dayIdx ? " on" : ""}${has ? " has-forecast" : ""}`);
    b.type = "button";
    b.setAttribute("aria-label", has ? `${d.label}, forecast available` : d.label);
    b.setAttribute("aria-pressed", String(i === state.plan.dayIdx));
    b.appendChild(el("span", "chip-dow", d.short));
    b.appendChild(el("span", "chip-num", String(d.num)));
    b.addEventListener("click", () => { state.plan.dayIdx = i; renderPlan(); });
    chips.appendChild(b);
  });
  s.appendChild(chips);
  if (withForecast.size) s.appendChild(el("p", "small legend", "A dot marks days with a forecast."));

  const slots = el("div", "slots");
  for (const sl of SLOTS) {
    const on = state.plan.slots.includes(sl.key);
    const b = el("button", on ? "slot on" : "slot");
    b.type = "button";
    b.setAttribute("aria-pressed", String(on));
    b.appendChild(el("span", "slot-name", sl.key));
    b.appendChild(el("span", "slot-sub", sl.sub));
    b.addEventListener("click", () => toggleSlot(sl.key));
    slots.appendChild(b);
  }
  s.appendChild(slots);
  s.appendChild(el("p", "small", "Pick AM, PM or both."));

  s.appendChild(renderForecastBlock());

  const day = state.plan.days[state.plan.dayIdx];
  const session = el("div", "session");
  session.appendChild(el("p", "label", "Your selection"));
  session.appendChild(el("p", "session-title", planSummary(day, state.plan.slots)));
  session.appendChild(el("p", "small", formHint(day, state.plan.slots)));
  s.appendChild(session);

  const link = el("a", "cta wide", "I'm interested \u2192");
  link.href = CONFIG.INTEREST_URL;
  link.target = "_blank";
  link.rel = "noopener";
  s.appendChild(link);
  s.appendChild(el("p", "small centered", "Interest only. Nothing is booked. We'll email you when others with similar plans sign up."));
}

function forecastKey() {
  return `${state.activity?.slug}|${state.spot?.slug}|${state.level}`;
}

async function loadForecast() {
  if (!state.activity || !state.spot || state.level === NEVER_TRIED) return;
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

// ---------- never tried ----------
// A first-timer sees a card, not conditions: a wind range could read as "go". See entry-requirements.js.
function track(name, extra) {
  try {
    if (typeof window !== "undefined" && typeof window.wskTrack === "function") {
      window.wskTrack(name, { sport: state.activity && state.activity.slug, location: state.spot && state.spot.slug, skill_level: state.level, ...extra });
    }
  } catch (e) { /* counting a click must never break the page */ }
}

function renderEntry() {
  const host = $("entry-panel");
  if (!host) return;
  host.replaceChildren();
  const card = entryCard({ sportSlug: state.activity && state.activity.slug, sportName: state.activity && state.activity.name, level: state.level });
  if (!card) return;
  const key = `${state.activity && state.activity.slug}|${state.spot && state.spot.slug}|${state.level}`;
  const fresh = entryKey !== key;
  if (fresh) whenChoice = null;   // a new selection starts with no answer
  const form = learnerForm(CONFIG.LEARNER_FORM);

  renderEntryCard(host, {
    card,
    count: countView(CONFIG.INTEREST_COUNTS, state.activity && state.activity.slug, Date.now()),
    options: form ? WHEN_OPTIONS : [],   // shown only when the choice can reach the form
    selected: whenChoice,
    place: state.spot && state.spot.name,
  }, {
    href: () => interestLink(form, CONFIG.INTEREST_URL, whenChoice, {
      sport: state.activity && state.activity.name, place: state.spot && state.spot.name,
    }),
    onPick: (slug) => { whenChoice = slug; },
    onRegister: () => track("interest_card_clicked", { when: whenChoice || "none" }),
    onSwitch: () => {
      state.level = STARTER_LEVEL;
      $("level").value = STARTER_LEVEL;
      refreshAll();
    },
  });
  if (fresh) {   // count a view once per selection, not on every redraw
    entryKey = key;
    track("interest_card_viewed");
  }
}

// The hidden attribute loses to a stylesheet rule such as display:flex, which kept the tabs on screen. So hide with both.
function setShown(id, shown) {
  const e = $(id);
  if (!e) return;
  e.hidden = !shown;
  e.setAttribute("style", shown ? "" : "display:none");
}

function applyLevelMode() {
  const panes = panesFor(state.level);
  const entry = $("entry-panel");
  if (panes.entry) {
    if (inflight) { inflight.abort(); inflight = null; }   // a late reply must not draw conditions for a first-timer
    for (const id of ["context", "tabs", "pane-now", "pane-plan"]) setShown(id, false);
    hideBanner();
    clearNow();
    setShown("entry-panel", true);
    renderEntry();
  } else {
    entryKey = null;
    setShown("entry-panel", false);
    if (entry) entry.replaceChildren();
    for (const id of ["context", "tabs"]) setShown(id, true);
    setShown("pane-now", state.tab === "now");
    setShown("pane-plan", state.tab === "plan");
  }
}

// ---------- loading ----------
async function loadConditions() {
  if (!state.activity || !state.spot || state.level === NEVER_TRIED) return;   // first-timers get the card, not conditions
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
    windDiagram.update(payload.observations && payload.observations.wind, payload.spot && payload.spot.launch_point,
      payload.guidance && payload.guidance.direction);
    const obs = payload.observations || {};
    tideCard.update("tide" in obs ? obs.tide : undefined, obs.tide_message, payload.generated_at);
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
  applyLevelMode();
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
  $("more-sports").href = CONFIG.INTEREST_URL;

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
  applyLevelMode();
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
  $("go-plan").addEventListener("click", () => setTab("plan"));
  $("go-now").addEventListener("click", () => setTab("now"));
}

setupControls();
init();
setInterval(() => { if (document.visibilityState === "visible") loadConditions(); }, 120000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastLoad > 60000) loadConditions();
});
