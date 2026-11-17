// Google Analytics for watersportskaki.sg, loaded only after a visitor says yes.
//
//   <script type="module" src="analytics.js"></script>      (or /app/analytics.js from the landing pages)
//
// Nothing from Google loads, and no cookie is set, until the visitor presses Accept. Decline, and Global Privacy
// Control, mean nothing loads at all. It does nothing on other addresses (localhost, Vercel previews), and nothing in
// a browser where you have visited any page with ?notrack=1 (that is how you keep your own visits out of the numbers).
//
// wskTrack(name, params) sends one of a short list of events with a short list of plain fields, so a name, an email
// address or a phone number cannot be sent by accident. Events need a Google tag with a GA4 measurement ID inside
// the property (G-...), or a Tag Manager container (GTM-...) that holds a Google tag.

// Paste your GA4 Measurement ID here: Analytics, Admin, Data streams, your web stream, top right (G-...).
// It is public (it appears in the page source), so it is fine to commit. While this is empty, or still the
// placeholder, nothing loads and no notice is shown.
export const ANALYTICS_ID = "G-ZYYFMB2K0B";
export const PRIVACY_URL = "/privacy.html";
const HOST = /(^|\.)watersportskaki\.sg$/i;
const KEY = "wsk_consent_analytics";
const NOTRACK = "wsk_no_track";
const ASK_AGAIN_AFTER_MS = 365 * 24 * 3600e3;

// Event name -> the only fields it may carry.
export const EVENTS = {
  conditions_view: ["sport", "location", "skill_level", "view_mode"],
  skill_changed: ["sport", "location", "skill_level"],
  plan_ahead_opened: ["sport", "location"],
  conditions_details_opened: ["detail_type", "sport", "location"],
  whatsapp_join_clicked: ["source_page", "placement"],
  conditions_cta_clicked: ["source_page", "placement"],
  early_access_form_clicked: ["source_page", "placement"],
  interest_card_viewed: ["sport", "location", "skill_level"],
  interest_card_clicked: ["sport", "location", "skill_level", "when"],
};

// "ga4" for a G- Measurement ID, "gtm" for a Tag Manager container, null for anything else (including the placeholder).
export function idKind(id) {
  if (typeof id !== "string") return null;
  if (/^G-[A-Z0-9]{6,12}$/.test(id) && !/^G-X+$/.test(id)) return "ga4";
  if (/^GTM-[A-Z0-9]{4,10}$/.test(id) && !/^GTM-X+$/.test(id)) return "gtm";
  return null;
}

export function isTrackedHost(hostname) {
  return typeof hostname === "string" && HOST.test(hostname);
}

// Plain lowercase words, numbers, dashes and underscores only. Nothing that looks like an email, a link or a phone number.
export function cleanValue(v) {
  if (typeof v !== "string" || !/^[a-z0-9_-]{1,40}$/.test(v)) return null;
  if (/\d{6,}/.test(v)) return null;
  return v;
}

export function cleanParams(name, params) {
  if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(EVENTS, name)) return null;   // own entries only
  const allowed = EVENTS[name];
  const out = {};
  for (const k of allowed) {
    const v = params && Object.prototype.hasOwnProperty.call(params, k) ? cleanValue(params[k]) : null;
    if (v !== null) out[k] = v;
  }
  return out;
}

export function readConsent(storage, nowMs) {
  try {
    const raw = storage && storage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if ((c.v !== "granted" && c.v !== "denied") || typeof c.t !== "number") return null;
    if (nowMs - c.t > ASK_AGAIN_AFTER_MS || c.t > nowMs + 60e3) return null;
    return c.v;
  } catch (e) {
    return null;
  }
}

const CSS = `
#wsk-an-bar{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:640px;margin:0 auto;background:#fff;color:#0d2c5b;border:1px solid #c9d6ea;border-radius:14px;padding:14px 16px;box-shadow:0 6px 24px rgba(13,44,91,.18);font:14px/1.45 Inter,system-ui,sans-serif}
#wsk-an-bar p{margin:0 0 10px}
#wsk-an-bar a{color:#0b5fb8;text-decoration:underline}
#wsk-an-bar .wsk-an-row{display:flex;gap:10px;flex-wrap:wrap}
#wsk-an-bar button{flex:1 1 120px;font:inherit;font-weight:600;color:#0d2c5b;background:#fff;border:1.5px solid #0d2c5b;border-radius:999px;padding:8px 16px;cursor:pointer}
#wsk-an-bar button:focus-visible,#wsk-an-bar a:focus-visible{outline:3px solid #2a6fdb;outline-offset:2px}
`;

export function createAnalytics(env) {
  const { win, doc, storage } = env;
  const id = env.id !== undefined ? env.id : ANALYTICS_ID;
  const kind = idKind(id);
  const privacyUrl = env.privacyUrl || PRIVACY_URL;
  const now = env.now || (() => Date.now());
  let status = "idle";        // idle, off, asking, granted, denied
  let loaded = false;
  let memory = null;          // the choice, kept here too in case storage is blocked
  let bar = null;

  const store = (v) => {
    memory = v;
    try { storage && storage.setItem(KEY, JSON.stringify({ v, t: now() })); } catch (e) { /* blocked: the choice lasts for this page only */ }
  };

  function clearCookies() {
    const host = (win.location && win.location.hostname) || "";
    const parent = host.replace(/^www\./, "");
    const domains = ["", `; domain=${host}`, `; domain=.${parent}`];
    for (const part of String(doc.cookie || "").split(";")) {
      const name = part.split("=")[0].trim();
      if (!/^(_ga|_gid|_gat)/.test(name)) continue;
      for (const d of domains) doc.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
    }
  }

  function load() {
    if (loaded || !kind) return;
    loaded = true;
    win.dataLayer = win.dataLayer || [];
    win.gtag = win.gtag || function () { win.dataLayer.push(arguments); };   // the same shim Google's snippet defines
    win.gtag("js", new Date());
    if (kind === "ga4") {
      // Signals and ad personalisation stay off: this is for counting visits, not for advertising.
      win.gtag("config", id, { allow_google_signals: false, allow_ad_personalization_signals: false });
    }
    const s = doc.createElement("script");
    s.async = true;
    s.src = kind === "ga4" ? `https://www.googletagmanager.com/gtag/js?id=${id}` : `https://www.googletagmanager.com/gtm.js?id=${id}`;
    doc.head.appendChild(s);
  }

  function hideBar() {
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    bar = null;
  }

  function showBar() {
    if (bar || !doc.body) return;
    if (!doc.getElementById("wsk-an-css")) {
      const st = doc.createElement("style");
      st.id = "wsk-an-css";
      st.textContent = CSS;
      doc.head.appendChild(st);
    }
    bar = doc.createElement("div");
    bar.id = "wsk-an-bar";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Analytics choice");
    const p = doc.createElement("p");
    p.appendChild(doc.createTextNode("We'd like to use Google Analytics to count visits and see whether people come back. " +
      "It sets a cookie in your browser and sends Google the pages you view and which features you use. " +
      "We don't send names or contact details. You can change your mind at any time. "));
    const a = doc.createElement("a");
    a.setAttribute("href", privacyUrl);
    a.textContent = "Privacy notice";
    p.appendChild(a);
    const row = doc.createElement("div");
    row.className = "wsk-an-row";
    for (const [label, fn] of [["Accept", accept], ["Decline", decline]]) {
      const b = doc.createElement("button");
      b.setAttribute("type", "button");
      b.textContent = label;
      b.addEventListener("click", fn);
      row.appendChild(b);
    }
    bar.append(p, row);
    doc.body.appendChild(bar);
    status = "asking";
  }

  function accept() {
    store("granted");
    status = "granted";
    hideBar();
    load();
  }

  function decline() {
    store("denied");
    status = "denied";
    hideBar();
    loaded = false;            // stop sending events from this page; a reload loads nothing
    clearCookies();
  }

  function init() {
    if (status !== "idle") return status;
    if (!kind) return (status = "off");          // no valid ID yet: do not ask for consent for something that cannot run
    const loc = win.location || {};
    if (!isTrackedHost(loc.hostname)) return (status = "off");
    try {
      const m = /[?&]notrack=([01])\b/.exec(loc.search || "");
      if (m && storage) { if (m[1] === "1") storage.setItem(NOTRACK, "1"); else storage.removeItem(NOTRACK); }
      if (storage && storage.getItem(NOTRACK) === "1") return (status = "off");
    } catch (e) { /* no storage: carry on */ }
    if (win.navigator && win.navigator.globalPrivacyControl === true) return (status = "off");
    doc.addEventListener("click", (e) => {
      const t = e.target && e.target.closest ? e.target.closest("[data-wsk-consent-settings]") : null;
      if (t) { if (e.preventDefault) e.preventDefault(); showBar(); }
    });
    const choice = readConsent(storage, now()) || memory;
    if (choice === "granted") { status = "granted"; load(); }
    else if (choice === "denied") status = "denied";
    else {
      if (doc.body) showBar();
      else doc.addEventListener("DOMContentLoaded", showBar);
      status = "asking";
    }
    return status;
  }

  function track(name, params) {
    if (!loaded || status !== "granted") return false;
    const clean = cleanParams(name, params);
    if (!clean) return false;
    win.gtag("event", name, clean);
    return true;
  }

  return { init, accept, decline, track, reopen: showBar, state: () => ({ status, loaded }) };
}

function safeStorage() {
  try { return window.localStorage; } catch (e) { return null; }
}

export const analytics = typeof window !== "undefined" && typeof document !== "undefined"
  ? createAnalytics({ win: window, doc: document, storage: safeStorage() })
  : null;

if (analytics) {
  analytics.init();
  window.wskTrack = analytics.track;
}
