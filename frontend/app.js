import { CONFIG } from "./config.js";
import {
  LEVELS, LEVEL_LABELS, SLOTS, selectionFromQuery, pickOption, catalogActivitiesUrl,
  catalogSpotsUrl, conditionsUrl, buildView, errorMessage, FAIL_CLOSED_NOTE,
  upcomingWeekendDays, planSummary, formHint,
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
  activities: [], spots: [], activity: null, spot: null, level: "beginner",
  plan: { days: [], dayIdx: 0, slot: "AM" },
};
let lastLoad = 0;
let inflight = null;
let lastCtx = null;

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
  for (const id of ["guidance", "lightning", "plan", "about"]) $(id).replaceChildren();
  $("lightning").className = "card";
  $("context").textContent = "Conditions";
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

// ---------- rendering ----------
function renderSummary(v, ctx) {
  const s = $("guidance");
  s.replaceChildren();
  const tagrow = el("div", "tagrow");
  tagrow.appendChild(el("span", "chip-tag", "Conditions summary"));
  tagrow.appendChild(el("span", "small", `${v.levelLabel} ${ctx.activityName.toLowerCase()}`));
  s.appendChild(tagrow);

  s.appendChild(el("p", "headline", v.headline || "Wind data unavailable"));
  s.appendChild(el("span", "pill", v.guidance.statusLabel));
  s.appendChild(el("p", "summary", v.guidance.summary));

  if (v.wind) {
    const m = el("div", "metrics");
    const a = el("div");
    a.appendChild(el("p", "label", "Reported wind"));
    a.appendChild(el("p", "metric", v.wind.big));
    a.appendChild(el("p", "small", v.wind.directionShort));
    const b = el("div");
    b.appendChild(el("p", "label", "Source"));
    b.appendChild(el("p", "metric", v.wind.source));
    b.appendChild(el("p", "small", v.wind.sourceSub));
    m.appendChild(a);
    m.appendChild(b);
    s.appendChild(m);
  } else {
    s.appendChild(el("p", "muted", v.windMessage));
  }

  if (v.guidance.limitations) s.appendChild(el("p", "limits", `Limits: ${v.guidance.limitations}`));

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

  if (v.wind) {
    const d = el("details");
    d.appendChild(el("summary", null, "View observation details"));
    const block = el("div", "block");
    block.appendChild(el("p", "strong", `${v.wind.big}, ${v.wind.sub}`));
    block.appendChild(el("p", null, v.wind.directionShort));
    const ul = el("ul", "stations");
    for (const line of v.wind.stations) ul.appendChild(el("li", "small", line));
    block.appendChild(ul);
    if (v.wind.observed) {
      const p = el("p", "small", v.wind.observed);
      if (v.wind.stale) p.appendChild(el("span", "tag", "Out of date"));
      block.appendChild(p);
    }
    if (v.wind.note) block.appendChild(el("p", "small note", v.wind.note));
    d.appendChild(block);
    s.appendChild(d);
  }
}

function renderLightning(v) {
  const s = $("lightning");
  const c = v.lightningCard;
  s.replaceChildren();
  s.className = c.kind === "alert" ? "card alert" : c.kind === "unavailable" ? "card unavailable" : "card";

  const head = el("div", "lightning-head");
  head.appendChild(el("h2", null, "Lightning activity"));
  head.appendChild(el("span", "lightning-pill", c.pill));
  s.appendChild(head);
  s.appendChild(el("p", c.kind === "alert" ? "strong summary" : "summary", c.text));
  if (c.checked) s.appendChild(el("p", "small", c.checked));
  if (c.kind !== "quiet") {
    const link = advisoryLink(v);
    if (link) s.appendChild(link);
  } else {
    s.appendChild(el("p", "advice-note",
      "Follow official warnings and venue instructions. A lightning-free reading does not mean it is safe to go out."));
  }
}

function renderPlan() {
  const s = $("plan");
  const ctx = lastCtx;
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

  const day = state.plan.days[state.plan.dayIdx];
  const foot = el("div", "plan-foot");
  const left = el("div");
  left.appendChild(el("p", "summary-line", planSummary(day, state.plan.slot)));
  left.appendChild(el("p", "small",
    `Interest only. No booking or equipment reservation. ${formHint(day, state.plan.slot)}`));
  foot.appendChild(left);
  const link = el("a", "cta", "I'm interested \u2192");
  link.href = CONFIG.INTEREST_URL;
  link.target = "_blank";
  link.rel = "noopener";
  foot.appendChild(link);
  s.appendChild(foot);
  if (ctx) s.appendChild(el("p", "small", `${ctx.activityName} at ${ctx.spotName}`));
}

function renderAbout(v) {
  const s = $("about");
  s.replaceChildren();
  if (v.sources.length) s.appendChild(el("p", "small", `Source: ${v.sources.join(", ")}`));
  s.appendChild(el("p", "small", v.disclaimer));
}

function render(v, ctx) {
  hideBanner();
  lastCtx = ctx;
  $("context").textContent = `Conditions at ${ctx.spotName}`;
  $("updated").textContent = v.updated ? `Updated ${v.updated} SGT` : "";
  state.plan.days = upcomingWeekendDays();
  if (state.plan.dayIdx >= state.plan.days.length) state.plan.dayIdx = 0;
  renderSummary(v, ctx);
  renderLightning(v);
  renderPlan();
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
  fillSelect($("level"), LEVELS.map((l) => ({ slug: l, name: LEVEL_LABELS[l] })), state.level);

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
