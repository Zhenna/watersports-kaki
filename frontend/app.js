import { CONFIG } from "./config.js";
import {
  LEVELS, LEVEL_LABELS, selectionFromQuery, pickOption, catalogActivitiesUrl,
  catalogSpotsUrl, conditionsUrl, forecastUrl, buildView, planDayView, forecastDates, errorMessage,
  FAIL_CLOSED_NOTE, upcomingDays, formHint,
} from "./lib.js";
import { createWindDiagram } from "./wind-diagram.js";
import { createTideCard } from "./tide-card.js";
import { NEVER_TRIED, STARTER_LEVEL, WHEN_OPTIONS, panesFor, entryCard, learnerForm, interestLink, countView } from "./entry-requirements.js";
import { renderEntryCard } from "./entry-card.js";
import { renderPlanCard } from "./plan-card.js";
import { inviteFromQuery, inviteLink, inviteMessage, waShareUrl } from "./session-share.js";

const $ = (id) => document.getElementById(id);
const windDiagram = createWindDiagram($("wind-diagram-panel"));
const tideCard = createTideCard($("tide-panel"), { onDetailsOpened: () => track("conditions_details_opened", { detail_type: "tide" }) });

// All API text goes in through textContent, never innerHTML.
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const state = {
  activities: [], spots: [], activity: null, spot: null, level: "beginner", tab: "now",
  plan: { days: [], dayIdx: 0, invite: null, slot: "am", sessionOpen: false, hourlyOpen: false, focus: null },
  forecast: { key: null, status: "idle", payload: null },
  windTab: null,   // which wind sub-tab is open: null, 0 (summary) or 1 (sources and limits)
};
let lastLoad = 0;
let inflight = null;
let entryKey = null;   // which selection the "never tried" card was last shown for
let whenChoice = null; // weekend, weekday or flexible, for the card in view
let pendingView = true; // a conditions view is counted once per page load or selection change, never for a refresh

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
      if (!on) track("conditions_details_opened", { detail_type: i === 0 ? "conditions_summary" : "sources_limits" });
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
  d.addEventListener("toggle", () => { if (d.open) track("conditions_details_opened", { detail_type: "lightning" }); });
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
function planSub() {
  return state.activity && state.spot ? `${state.activity.name} \u00b7 ${state.spot.name} \u00b7 ${LEVEL_LABELS[state.level] ?? state.level}` : "";
}

// The invitation for the chosen day and time. Null until the sport and place are known.
function currentInvite(view) {
  const day = state.plan.days[state.plan.dayIdx];
  if (!day || !state.activity || !state.spot) return null;
  const slot = state.plan.slot;
  const link = inviteLink({ activity: state.activity.slug, spot: state.spot.slug, day: day.iso, slot });
  const thundery = view && view.state === "ok" ? Object.fromEntries(view.periods.map((p) => [p.key, p.thundery])) : {};
  const message = inviteMessage({
    sportName: state.activity.name, sportSlug: state.activity.slug, spotName: state.spot.name,
    dayShort: day.label.replace(",", ""), slot, thundery, link,
  });
  return message ? { message, shareUrl: waShareUrl(message) } : null;
}

function resetPlanPanels() {
  state.plan.sessionOpen = false;
  state.plan.hourlyOpen = false;
}

async function copyText(text) {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.writeText !== "function") return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false;
  }
}

function renderPlan() {
  const s = $("plan");
  const day = state.plan.days[state.plan.dayIdx];
  const f = state.forecast;
  const withForecast = f.status === "ok" ? forecastDates(f.payload) : new Set();
  const view = f.status === "ok" ? planDayView(f.payload, day) : null;
  const invite = currentInvite(view);
  const focus = state.plan.focus;
  state.plan.focus = null;
  renderPlanCard(s, {
    sub: planSub(),
    days: state.plan.days.map((d) => ({ iso: d.iso, short: d.short, num: d.num, label: d.label, has: withForecast.has(d.iso) })),
    selected: state.plan.dayIdx,
    status: f.status,
    errorText: `Forecast unavailable right now. ${FAIL_CLOSED_NOTE}`,
    view,
    dayLabel: day ? day.label : "",
    invited: state.plan.invite,
    session: invite ? { open: state.plan.sessionOpen, slot: state.plan.slot, message: invite.message, shareUrl: invite.shareUrl } : null,
    hourlyOpen: state.plan.hourlyOpen,
    interest: {
      href: CONFIG.INTEREST_URL,
      text: "Prefer to be matched with others? Register your interest \u203a",
      hint: formHint(day, ["AM", "PM"]),
    },
    focus,
  }, {
    onDay: (i) => { state.plan.dayIdx = i; state.plan.invite = null; resetPlanPanels(); state.plan.focus = `day-${i}`; renderPlan(); },
    onSession: () => {
      state.plan.sessionOpen = !state.plan.sessionOpen;
      if (state.plan.sessionOpen) track("session_create_clicked");
      state.plan.focus = "session";
      renderPlan();
    },
    onSlot: (key) => { state.plan.slot = key; state.plan.focus = `slot-${key}`; renderPlan(); },
    onShare: () => track("session_share_clicked", { slot: state.plan.slot }),
    onCopy: async () => {
      const inv = currentInvite(view);
      const ok = inv ? await copyText(inv.message) : false;
      if (ok) track("session_copy_clicked", { slot: state.plan.slot });
      return ok;
    },
    onHourly: () => {
      state.plan.hourlyOpen = !state.plan.hourlyOpen;
      if (state.plan.hourlyOpen) track("hourly_details_opened");
      state.plan.focus = "hourly";
      renderPlan();
    },
    onDetailsOpened: () => track("conditions_details_opened", { detail_type: "forecast" }),
    onInterest: () => track("plan_interest_clicked"),
  });
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
    onDetailsOpened: () => track("conditions_details_opened", { detail_type: "requirements" }),
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
    if (pendingView && state.tab === "now") {   // one count per selection, only when they are looking at Right now
      pendingView = false;
      track("conditions_view", { view_mode: "now" });
    }
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
  pendingView = true;
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
  const invited = inviteFromQuery(location.search);       // a shared link names a day and a time
  const invitedIdx = invited.day ? state.plan.days.findIndex((d) => d.iso === invited.day) : -1;
  if (invitedIdx >= 0) {
    state.plan.dayIdx = invitedIdx;
    state.plan.invite = invited.slot;
    if (invited.slot) state.plan.slot = invited.slot;
  }
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
    track("skill_changed");
    refreshAll();
  });
  $("refresh").addEventListener("click", () => { track("refresh_clicked"); loadConditions(); });
  const openPlan = () => { if (state.tab !== "plan") track("plan_ahead_opened"); setTab("plan"); };
  $("tab-now").addEventListener("click", () => setTab("now"));
  $("tab-plan").addEventListener("click", openPlan);
  $("go-plan").addEventListener("click", openPlan);
  $("go-now").addEventListener("click", () => setTab("now"));
  $("more-sports").addEventListener("click", () => track("next_sport_link_clicked"));
  const home = $("home-link");
  if (home) home.addEventListener("click", () => track("home_link_clicked", { source_page: "app", placement: "nav" }));
}

setupControls();
init();
setInterval(() => { if (document.visibilityState === "visible") loadConditions(); }, 120000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastLoad > 60000) loadConditions();
});
