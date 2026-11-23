// Draws the Plan ahead card: day chips, the AM and PM cards, the "Create a session" box with its share panel,
// the details, and the interest line. What it shows comes from lib.js (planDayView) and session-share.js.
//
// Everything is set with textContent, never innerHTML. It carries its own stylesheet, scoped to #plan.
// It makes no network requests. All state (open panels, chosen time) is kept by the page and handed in.

import { OG_DESCRIPTION, OG_IMAGE_URL, OG_TITLE, SLOT_CHOICES } from "./session-share.js";

export const PLAN_CSS = `
#plan .wsk-pc-chips{display:flex;gap:8px;margin:12px 0 8px}
#plan .wsk-pc-chip{flex:1;min-width:0;text-align:center;border:1.5px solid #dbe3f0;border-radius:14px;padding:8px 2px;font:inherit;font-size:.8rem;color:#42557a;position:relative;background:#fff;cursor:pointer}
#plan .wsk-pc-chip span{display:block}
#plan .wsk-pc-chip b{display:block;font-size:1.2rem;color:#0d2c5b;line-height:1.15}
#plan .wsk-pc-chip.on{border-color:#0d2c5b;background:#d8ecfb}
#plan .wsk-pc-chip i{position:absolute;top:5px;right:6px;width:7px;height:7px;border-radius:50%;background:#1e7fe0}
#plan .wsk-pc-dt{font-weight:700;font-size:1.1rem;margin:14px 0 8px;color:#0d2c5b}
#plan .wsk-pc-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:480px){#plan .wsk-pc-two{grid-template-columns:1fr}}
#plan .wsk-pc-per{border:1px solid #dbe3f0;border-radius:16px;overflow:hidden;background:#fff}
#plan .wsk-pc-per.invited{border-color:#1565c0;box-shadow:0 0 0 1px #1565c0}
#plan .wsk-pc-per header{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#d8ecfb;font-weight:700;font-size:1.05rem;color:#0d2c5b}
#plan .wsk-pc-per.pm header{background:#fdebd2}
#plan .wsk-pc-per header small{font-weight:500;color:#5b6b86;font-size:.8rem}
#plan .wsk-pc-tag{margin-left:auto;font-size:.7rem;font-weight:600;color:#1565c0;border:1px solid #1565c0;border-radius:999px;padding:0 7px}
#plan .wsk-pc-b{padding:10px 12px}
#plan .wsk-pc-wx{display:flex;align-items:center;gap:10px;margin-bottom:6px}
#plan .wsk-pc-ic{width:42px;height:42px;border-radius:50%;background:#dbeafb;display:flex;align-items:center;justify-content:center;flex:none}
#plan .wsk-pc-wt{font-weight:700;font-size:1rem;line-height:1.2;color:#0d2c5b}
#plan .wsk-pc-wt.mute{font-weight:500;color:#5b6b86}
#plan .wsk-pc-wt small{display:block;font-weight:400;font-size:.78rem;color:#5b6b86;margin-top:2px}
#plan .wsk-pc-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid #edf1f7;font-size:.88rem;color:#0d2c5b}
#plan .wsk-pc-row svg{flex:none;color:#2a6fdb}
#plan .wsk-pc-l{color:#5b6b86;width:40px;flex:none}
#plan .wsk-pc-v{font-weight:600;margin-left:auto;text-align:right;display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
#plan .wsk-pc-v small{font-weight:400;color:#5b6b86;font-size:.78rem}
#plan .wsk-pc-v.mute{font-weight:500;color:#5b6b86}
#plan .wsk-pc-note{display:flex;gap:10px;margin-top:10px;padding:10px 12px;border-radius:14px;background:#fff6e0;border:1px solid #f1dba5;font-size:.88rem;align-items:center;color:#3d2e00}
#plan .wsk-pc-note b{display:block}
#plan .wsk-pc-assess{margin:10px 0 0;font-size:.9rem;color:#0d2c5b}
#plan .wsk-pc-none{margin:10px 0 0;color:#5b6b86}
#plan .wsk-pc-session{display:flex;align-items:center;gap:12px;width:100%;margin-top:12px;font:inherit;cursor:pointer;color:#0d2c5b;text-align:left;background:#eaf3ff;border:1px solid #c5dbf5;border-radius:14px;padding:11px 12px}
#plan .wsk-pc-session .wsk-pc-pic{width:34px;height:34px;border-radius:50%;background:#1565c0;display:flex;align-items:center;justify-content:center;flex:none}
#plan .wsk-pc-session .wsk-pc-tx{flex:1;line-height:1.25}
#plan .wsk-pc-session .wsk-pc-tx b{display:block;font-size:1rem}
#plan .wsk-pc-session .wsk-pc-tx small{font-size:.78rem;color:#4b5d7c}
#plan .wsk-pc-panel{margin-top:10px;border:1px solid #dbe3f0;border-radius:14px;padding:12px;background:#fff}
#plan .wsk-pc-panel h3{margin:0 0 8px;font-size:1rem;color:#0d2c5b}
#plan .wsk-pc-seg{display:flex;background:#e8eef8;border-radius:12px;padding:3px;gap:3px;margin-bottom:10px}
#plan .wsk-pc-seg button{flex:1;font:inherit;font-size:.85rem;font-weight:600;color:#42557a;background:transparent;border:none;border-radius:9px;padding:7px 4px;cursor:pointer}
#plan .wsk-pc-seg button.on{background:#fff;color:#0d2c5b;box-shadow:0 1px 3px rgba(13,44,91,.15)}
#plan .wsk-pc-wa{background:#e7efe3;border-radius:12px;padding:10px}
#plan .wsk-pc-bub{background:#fff;border-radius:10px;padding:8px;box-shadow:0 1px 1px rgba(0,0,0,.08)}
#plan .wsk-pc-card{border-radius:8px;overflow:hidden;background:#f1f5fb}
#plan .wsk-pc-img{display:block;width:100%;height:auto;aspect-ratio:1200/630;object-fit:cover;background:#e8eef8}
#plan .wsk-pc-ct{padding:8px 10px}
#plan .wsk-pc-ct b{display:block;font-size:.88rem;line-height:1.25;color:#0d2c5b}
#plan .wsk-pc-ct span{display:block;font-size:.78rem;color:#4b5d7c;margin-top:2px}
#plan .wsk-pc-ct i{display:block;font-style:normal;font-size:.75rem;color:#7b8aa3;margin-top:3px}
#plan .wsk-pc-msg{font-size:.85rem;margin:8px 4px 2px;color:#243b5e;overflow-wrap:anywhere}
#plan .wsk-pc-acts{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
#plan .wsk-pc-share{flex:2 1 150px;text-align:center;text-decoration:none;font:inherit;font-weight:700;color:#0d2c5b;background:#25d366;border:none;border-radius:12px;padding:11px;cursor:pointer}
#plan .wsk-pc-copy{flex:1 1 90px;font:inherit;font-weight:600;color:#0d2c5b;background:#fff;border:1.5px solid #0d2c5b;border-radius:12px;padding:11px;cursor:pointer}
#plan .wsk-pc-fn{font-size:.78rem;color:#5b6b86;margin:8px 0 0}
#plan .wsk-pc-interest{margin:14px 0 0;padding-top:12px;border-top:1px solid #e6ecf5;font-size:.88rem}
#plan .wsk-pc-interest a{color:#0b5fb8;text-decoration:underline;text-underline-offset:3px}
#plan .wsk-pc-interest span{display:block;margin-top:2px;font-size:.78rem;color:#5b6b86}
#plan .wsk-pc-chip:focus-visible,#plan .wsk-pc-session:focus-visible,#plan .wsk-pc-seg button:focus-visible,#plan .wsk-pc-share:focus-visible,#plan .wsk-pc-copy:focus-visible{outline:3px solid #2a6fdb;outline-offset:2px}
`;

// Small pictures, drawn as SVG. Each is [width/height box, list of shapes].
const ICONS = {
  pin: ["0 0 24 24", [["path", { d: "M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z", fill: "#1565c0" }], ["circle", { cx: 12, cy: 10, r: 2.6, fill: "#fff" }]]],
  am: ["0 0 26 26", [["path", { d: "M5 19a8 8 0 0 1 16 0M2 22h22M13 5v3M5 9l2 2M21 9l-2 2", stroke: "#0d2c5b", "stroke-width": 1.6, "stroke-linecap": "round", fill: "none" }]]],
  pm: ["0 0 26 26", [["circle", { cx: 13, cy: 13, r: 4.5, stroke: "#e08a00", "stroke-width": 1.6, fill: "none" }], ["path", { d: "M13 3v3M13 20v3M3 13h3M20 13h3M6 6l2 2M18 18l2 2M6 20l2-2M18 8l2-2", stroke: "#e08a00", "stroke-width": 1.6, "stroke-linecap": "round", fill: "none" }]]],
  partly: ["0 0 26 26", [["circle", { cx: 10, cy: 10, r: 4, fill: "#f5a623" }], ["path", { d: "M8 20h11a4 4 0 0 0 .5-8 5 5 0 0 0-9.4 1.5A3.4 3.4 0 0 0 8 20Z", fill: "#fff", stroke: "#9fb6d6" }]]],
  thunder: ["0 0 26 26", [["path", { d: "M7 15h12a4 4 0 0 0 .5-8 5 5 0 0 0-9.4 1.5A3.4 3.4 0 0 0 7 15Z", fill: "#5b6b86" }], ["path", { d: "M13 13l-3 5h3l-1 4 4-6h-3l1-3Z", fill: "#f5a623" }]]],
  rain: ["0 0 26 26", [["path", { d: "M7 14h12a4 4 0 0 0 .5-8 5 5 0 0 0-9.4 1.5A3.4 3.4 0 0 0 7 14Z", fill: "#8aa0c2" }], ["path", { d: "M9 17l-1 3M13 17l-1 3M17 17l-1 3", stroke: "#2a6fdb", "stroke-width": 1.6, "stroke-linecap": "round" }]]],
  cloud: ["0 0 26 26", [["path", { d: "M7 18h12a4 4 0 0 0 .5-8 5 5 0 0 0-9.4 1.5A3.4 3.4 0 0 0 7 18Z", fill: "#fff", stroke: "#9fb6d6" }]]],
  sun: ["0 0 26 26", [["circle", { cx: 13, cy: 13, r: 5, fill: "#f5a623" }]]],
  none: ["0 0 26 26", [["path", { d: "M8 13h10", stroke: "#9fb6d6", "stroke-width": 2, "stroke-linecap": "round" }]]],
  wind: ["0 0 20 20", [["path", { d: "M2 8h9a2.5 2.5 0 1 0-2.5-2.5M2 12h13a2.5 2.5 0 1 1-2.5 2.5M2 16h6", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round", fill: "none" }]]],
  tide: ["0 0 20 20", [["path", { d: "M2 8c2-2 4-2 6 0s4 2 6 0 3-1.5 4-1M2 13c2-2 4-2 6 0s4 2 6 0 3-1.5 4-1", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round", fill: "none" }]]],
  bolt: ["0 0 30 30", [["circle", { cx: 15, cy: 15, r: 14, fill: "#fbe6a8" }], ["path", { d: "M16 6l-6 10h4l-1 8 7-11h-4l1-7Z", fill: "#e08a00" }]]],
  chev: ["0 0 16 16", [["path", { d: "M6 3l5 5-5 5", stroke: "#1565c0", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", fill: "none" }]]],
  people: ["0 0 20 20", [["circle", { cx: 8, cy: 7, r: 2.6, stroke: "#fff", "stroke-width": 1.6, fill: "none" }], ["path", { d: "M3 16c0-2.6 2.2-4.2 5-4.2s5 1.6 5 4.2M15 5v5M12.5 7.5h5", stroke: "#fff", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round", fill: "none" }]]],
  arrow: ["0 0 18 18", [["path", { d: "M9 1l5 14-5-3-5 3Z", fill: "#1e7fe0" }]]],
};

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// An icon, or null if the page cannot draw SVG. The page works without its pictures.
function icon(name, size) {
  try {
    const def = ICONS[name];
    if (!def || typeof document.createElementNS !== "function") return null;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    for (const [k, v] of [["width", String(size)], ["height", String(size)], ["viewBox", def[0]], ["fill", "none"], ["aria-hidden", "true"]]) svg.setAttribute(k, v);
    for (const [tag, attrs] of def[1]) {
      const s = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, String(v));
      svg.appendChild(s);
    }
    return svg;
  } catch (e) {
    return null;
  }
}

function addIcon(parent, name, size) {
  const i = icon(name, size);
  if (i) parent.appendChild(i);
  return i;
}

function injectCss() {
  const head = typeof document !== "undefined" ? document.head : null;
  if (!head || document.getElementById("wsk-pc-css")) return;
  const st = document.createElement("style");
  st.id = "wsk-pc-css";
  st.textContent = PLAN_CSS;
  head.appendChild(st);
}

function btn(cls, key, text) {
  const b = el("button", cls, text);
  b.type = "button";
  b.setAttribute("data-k", key);
  return b;
}

function periodCard(p, wind, invited) {
  const card = el("div", `wsk-pc-per${p.key === "pm" ? " pm" : ""}${invited ? " invited" : ""}`);
  const head = el("header");
  addIcon(head, p.key === "am" ? "am" : "pm", 26);
  head.appendChild(el("span", null, p.label));
  head.appendChild(el("small", null, p.hours));
  if (invited) head.appendChild(el("span", "wsk-pc-tag", "Invited"));
  card.appendChild(head);

  const body = el("div", "wsk-pc-b");
  const wx = el("div", "wsk-pc-wx");
  const ic = el("div", "wsk-pc-ic");
  addIcon(ic, p.icon, 26);
  wx.appendChild(ic);
  const title = p.title ? el("div", "wsk-pc-wt", p.title) : el("div", "wsk-pc-wt mute", "No detail for this time");
  if (p.title && p.scope === "day") title.appendChild(el("small", null, "Day forecast"));
  wx.appendChild(title);
  body.appendChild(wx);

  const windRow = el("div", "wsk-pc-row");
  addIcon(windRow, "wind", 20);
  windRow.appendChild(el("span", "wsk-pc-l", "Wind"));
  if (wind) {
    const v = el("span", "wsk-pc-v");
    v.appendChild(el("span", null, wind.direction ? `${wind.range} ${wind.direction}` : wind.range));
    if (wind.deg != null) {
      const a = icon("arrow", 18);
      if (a) { a.setAttribute("style", `transform:rotate(${wind.deg + 180}deg)`); v.appendChild(a); }
    }
    v.appendChild(el("small", null, "all day"));
    windRow.appendChild(v);
  } else {
    windRow.appendChild(el("span", "wsk-pc-v mute", "Not available"));
  }
  body.appendChild(windRow);

  const tideRow = el("div", "wsk-pc-row");
  addIcon(tideRow, "tide", 20);
  tideRow.appendChild(el("span", "wsk-pc-l", "Tide"));
  tideRow.appendChild(p.tide ? el("span", "wsk-pc-v", p.tide) : el("span", "wsk-pc-v mute", "Not available"));
  body.appendChild(tideRow);
  card.appendChild(body);
  return card;
}

function sessionPanel(m, h) {
  const s = m.session;
  const panel = el("div", "wsk-pc-panel");
  panel.appendChild(el("h3", null, `Create a session \u00b7 ${m.dayLabel}`));

  const seg = el("div", "wsk-pc-seg");
  seg.setAttribute("role", "radiogroup");
  seg.setAttribute("aria-label", "Which time");
  for (const c of SLOT_CHOICES) {
    const b = btn(s.slot === c.key ? "on" : "", `slot-${c.key}`, c.label);
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(s.slot === c.key));
    b.addEventListener("click", () => h.onSlot(c.key));
    seg.appendChild(b);
  }
  panel.appendChild(seg);

  // What WhatsApp will show for the link. It is the same for every share, because the link goes to one page.
  const wa = el("div", "wsk-pc-wa");
  const bub = el("div", "wsk-pc-bub");
  const card = el("div", "wsk-pc-card");
  const img = el("img", "wsk-pc-img");
  img.src = OG_IMAGE_URL;                  // the brand picture you already have, so the preview is the real one
  img.alt = "WaterSports Kaki";
  const ct = el("div", "wsk-pc-ct");
  ct.appendChild(el("b", null, OG_TITLE));
  ct.appendChild(el("span", null, OG_DESCRIPTION));
  ct.appendChild(el("i", null, "watersportskaki.sg"));
  card.appendChild(img);
  card.appendChild(ct);
  bub.appendChild(card);
  bub.appendChild(el("p", "wsk-pc-msg", s.message));
  wa.appendChild(bub);
  panel.appendChild(wa);

  const acts = el("div", "wsk-pc-acts");
  const share = el("a", "wsk-pc-share", "Share to WhatsApp");
  share.href = s.shareUrl;
  share.target = "_blank";
  share.rel = "noopener";
  share.setAttribute("data-k", "share");
  share.addEventListener("click", () => h.onShare());
  const copy = btn("wsk-pc-copy", "copy", "Copy message");
  copy.addEventListener("click", () => {
    Promise.resolve(h.onCopy()).then((ok) => { copy.textContent = ok ? "Copied" : "Couldn't copy"; }, () => { copy.textContent = "Couldn't copy"; });
  });
  acts.appendChild(share);
  acts.appendChild(copy);
  panel.appendChild(acts);
  panel.appendChild(el("p", "wsk-pc-fn", "WSK doesn't book sessions or keep a list of who joins. The message has no wind or tide numbers, because they change. WhatsApp may show a preview like this. On WhatsApp Web, wait a few seconds for the preview to appear before you send."));
  return panel;
}

// m = { sub, days:[{iso,short,num,label,has}], selected, status, errorText, view, dayLabel, invited, session:{open,slot,message,shareUrl},
//       interest:{href,text,hint}, focus }
// h = { onDay(i), onSession(), onSlot(key), onShare(), onCopy(), onDetailsOpened() }
export function renderPlanCard(host, m, h) {
  injectCss();
  host.replaceChildren();
  host.appendChild(el("h2", null, "Find your next Water Day"));
  if (m.sub) host.appendChild(el("p", "plan-sub", m.sub));
  host.appendChild(el("p", "ask", "When would you like to go?"));

  const chips = el("div", "wsk-pc-chips");
  m.days.forEach((d, i) => {
    const b = btn(`wsk-pc-chip${i === m.selected ? " on" : ""}`, `day-${i}`);
    b.setAttribute("aria-label", d.has ? `${d.label}, forecast available` : d.label);
    b.setAttribute("aria-pressed", String(i === m.selected));
    if (d.has) b.appendChild(el("i"));
    b.appendChild(el("span", null, d.short));
    b.appendChild(el("b", null, String(d.num)));
    b.addEventListener("click", () => h.onDay(i));
    chips.appendChild(b);
  });
  host.appendChild(chips);
  if (m.days.some((d) => d.has)) host.appendChild(el("p", "small legend", "A dot marks days with a forecast."));

  host.appendChild(el("p", "wsk-pc-dt", `Forecast for ${m.dayLabel}`));
  const v = m.view;
  const ok = m.status === "ok" && v && v.state === "ok";
  if (m.status === "idle" || m.status === "loading") host.appendChild(el("p", "wsk-pc-none", "Loading forecast..."));
  else if (m.status === "error") host.appendChild(el("p", "wsk-pc-none", m.errorText));
  else if (!ok) host.appendChild(el("p", "wsk-pc-none", v ? v.message : ""));
  else {
    const two = el("div", "wsk-pc-two");
    for (const p of v.periods) two.appendChild(periodCard(p, v.wind, m.invited === "both" || m.invited === p.key));
    host.appendChild(two);
    if (v.thunderNotice) {
      const note = el("div", "wsk-pc-note");
      addIcon(note, "bolt", 30);
      const tx = el("div");
      tx.appendChild(el("b", null, v.thunderNotice));
      tx.appendChild(el("span", null, "Conditions can change. Check updated forecasts and official warnings on the day."));
      note.appendChild(tx);
      host.appendChild(note);
    }
    if (v.assessment) {
      const a = el("p", "wsk-pc-assess");
      if (v.assessment.headline) a.appendChild(el("strong", null, `${v.assessment.headline} `));
      if (v.assessment.pill) a.appendChild(el("span", "pill", v.assessment.pill));
      host.appendChild(a);
    }
    if (v.tidePredicted) host.appendChild(el("p", "wsk-pc-fn", "Tide is predicted by NEA, not measured."));
    if (v.stale) host.appendChild(el("p", "small", "This forecast is out of date."));
  }

  if (m.session) {   // null until the sport and place are known: there is nothing to invite people to yet
    const session = btn("wsk-pc-session", "session");
    session.setAttribute("aria-expanded", String(!!m.session.open));
    const pic = el("span", "wsk-pc-pic");
    addIcon(pic, "people", 20);
    session.appendChild(pic);
    const tx = el("span", "wsk-pc-tx");
    tx.appendChild(el("b", null, "Create a session"));
    tx.appendChild(el("small", null, "Invite others to this day and time"));
    session.appendChild(tx);
    addIcon(session, "chev", 16);
    session.addEventListener("click", () => h.onSession());
    host.appendChild(session);
    if (m.session.open) host.appendChild(sessionPanel(m, h));
  }

  if (ok && (v.summary || v.small || v.tideNote)) {
    const d = document.createElement("details");
    d.appendChild(el("summary", null, "Details"));
    const b = el("div", "block");
    if (v.summary) b.appendChild(el("p", null, v.summary));
    if (v.small) b.appendChild(el("p", "small", v.small));
    if (v.tideNote) b.appendChild(el("p", "small", v.tideNote));
    b.appendChild(el("p", "small", "Lightning is checked live on the day. See Right now."));
    d.appendChild(b);
    if (typeof h.onDetailsOpened === "function" && typeof d.addEventListener === "function") d.addEventListener("toggle", () => { if (d.open) h.onDetailsOpened(); });
    host.appendChild(d);
  }

  const interest = el("p", "wsk-pc-interest");
  const link = el("a", null, m.interest.text);
  link.href = m.interest.href;
  link.target = "_blank";
  link.rel = "noopener";
  link.setAttribute("data-k", "interest");
  link.addEventListener("click", () => { if (typeof h.onInterest === "function") h.onInterest(); });
  interest.appendChild(link);
  if (m.interest.hint) interest.appendChild(el("span", null, m.interest.hint));
  host.appendChild(interest);

  if (m.focus && typeof host.querySelector === "function") {
    const target = host.querySelector(`[data-k="${m.focus}"]`);
    if (target && typeof target.focus === "function") target.focus();
  }
}
