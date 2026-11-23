// Draws the "never tried" card. The words and the rules come from entry-requirements.js. This file only builds the page.
//
// Everything is set with textContent, never innerHTML. It carries its own small stylesheet, so it looks the same
// whatever else is in styles.css. Nothing here makes a network request.

export const ENTRY_CSS = `
#entry-panel .wsk-ec-chip{display:inline-block;background:#eef2f8;color:#42557a;font-size:11px;letter-spacing:.06em;text-transform:uppercase;font-weight:600;padding:3px 10px;border-radius:999px}
#entry-panel .wsk-ec-title{margin:12px 0 4px;font-family:'Nunito',Inter,system-ui,sans-serif;font-weight:900;font-size:1.5rem;line-height:1.2;color:#0d2c5b}
#entry-panel .wsk-ec-sub{margin:0;color:#4b5d7c;font-size:.95rem;line-height:1.5}
#entry-panel .wsk-ec-count{display:flex;gap:16px;align-items:center;margin:16px 0 4px;padding:12px 0;border-top:1px solid #e6ecf5;border-bottom:1px solid #e6ecf5}
#entry-panel .wsk-ec-num{text-align:center;min-width:56px}
#entry-panel .wsk-ec-num b{display:block;font-size:2rem;line-height:1;color:#1f5fd6}
#entry-panel .wsk-ec-num span{font-size:.78rem;color:#5b6b86}
#entry-panel .wsk-ec-first{margin:16px 0 4px;padding:12px 0;border-top:1px solid #e6ecf5;border-bottom:1px solid #e6ecf5;font-weight:600;color:#0d2c5b}
#entry-panel .wsk-ec-strong{font-weight:600;color:#0d2c5b}
#entry-panel .wsk-ec-small{font-size:.8rem;color:#5b6b86;margin:2px 0 0}
#entry-panel .wsk-ec-lbl{margin:14px 0 6px;font-size:.82rem;font-weight:600;color:#5b6b86}
#entry-panel .wsk-ec-seg{display:flex;background:#e8eef8;border-radius:14px;padding:4px;gap:4px}
#entry-panel .wsk-ec-seg button{flex:1;font:inherit;font-size:.9rem;font-weight:600;color:#42557a;background:transparent;border:none;border-radius:11px;padding:9px 6px;cursor:pointer}
#entry-panel .wsk-ec-seg button.on{background:#fff;color:#0d2c5b;box-shadow:0 1px 3px rgba(13,44,91,.15)}
#entry-panel .wsk-ec-row{display:flex;align-items:center;gap:8px;margin:12px 0 0;font-size:.9rem;color:#243b5e}
#entry-panel .wsk-ec-cta{display:block;margin-top:16px;text-align:center;text-decoration:none;font-weight:700;font-size:.95rem;color:#fff;background:#0d2c5b;border-radius:999px;padding:13px 16px}
#entry-panel .wsk-ec-note{text-align:center;margin:10px 0 0;font-size:.8rem;color:#5b6b86}
#entry-panel details{margin-top:14px;border-top:1px solid #e6ecf5;padding-top:10px}
#entry-panel summary{cursor:pointer;font-size:.9rem;font-weight:600;color:#0d2c5b;list-style:none;display:flex;justify-content:space-between;align-items:center}
#entry-panel summary::-webkit-details-marker{display:none}
#entry-panel summary::after{content:"";width:7px;height:7px;border-right:2px solid #0d2c5b;border-bottom:2px solid #0d2c5b;transform:rotate(45deg);margin:-3px 4px 0 0;transition:transform .15s}
#entry-panel details[open] summary::after{transform:rotate(225deg);margin-top:3px}
#entry-panel details ul{margin:8px 0 0 18px;padding:0;font-size:.9rem}
#entry-panel .wsk-ec-foot{text-align:center;margin:14px 0 0;font-size:.85rem;color:#5b6b86}
#entry-panel .wsk-ec-lnk{color:#0b5fb8;text-decoration:underline;background:none;border:none;font:inherit;padding:0;cursor:pointer}
#entry-panel .wsk-ec-seg button:focus-visible,#entry-panel .wsk-ec-cta:focus-visible,#entry-panel summary:focus-visible,#entry-panel .wsk-ec-lnk:focus-visible{outline:3px solid #2a6fdb;outline-offset:2px}
`;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function injectCss() {
  const head = typeof document !== "undefined" ? document.head : null;
  if (!head || document.getElementById("wsk-ec-css")) return;
  const st = document.createElement("style");
  st.id = "wsk-ec-css";
  st.textContent = ENTRY_CSS;
  head.appendChild(st);
}

// A small map pin. Skipped if the page cannot draw SVG, which loses nothing.
function pin() {
  try {
    if (typeof document.createElementNS !== "function") return null;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    for (const [k, v] of [["width", "16"], ["height", "16"], ["viewBox", "0 0 16 16"], ["fill", "none"], ["aria-hidden", "true"]]) svg.setAttribute(k, v);
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", "M8 14s5-4.2 5-8A5 5 0 0 0 3 6c0 3.8 5 8 5 8Z");
    path.setAttribute("stroke", "#5b6b86");
    path.setAttribute("stroke-width", "1.4");
    const dot = document.createElementNS(NS, "circle");
    for (const [k, v] of [["cx", "8"], ["cy", "6"], ["r", "1.8"], ["stroke", "#5b6b86"], ["stroke-width", "1.4"]]) dot.setAttribute(k, v);
    svg.appendChild(path);
    svg.appendChild(dot);
    return svg;
  } catch (e) {
    return null;
  }
}

// m: what to show. h: what to do.
//   m = { card, count: null | { number, asOf }, options: [] | [{ slug, label }], selected, place }
//   h = { href(), onPick(slug), onRegister(), onSwitch() }
export function renderEntryCard(host, m, h) {
  injectCss();
  host.replaceChildren();
  const c = m.card;

  host.appendChild(el("span", "wsk-ec-chip", c.chip));
  const title = el("p", "wsk-ec-title", c.heading);
  title.setAttribute("role", "heading");
  title.setAttribute("aria-level", "2");
  host.appendChild(title);
  host.appendChild(el("p", "wsk-ec-sub", c.intro));

  if (m.count) {
    const box = el("div", "wsk-ec-count");
    const num = el("div", "wsk-ec-num");
    num.appendChild(el("b", null, String(m.count.number)));
    num.appendChild(el("span", null, c.registeredLabel));
    const text = el("div");
    text.appendChild(el("div", "wsk-ec-strong", c.registeredText));
    text.appendChild(el("p", "wsk-ec-small", `As of ${m.count.asOf}. ${c.countNote}`));
    box.appendChild(num);
    box.appendChild(text);
    host.appendChild(box);
  } else {
    host.appendChild(el("div", "wsk-ec-first", c.noCount));
  }

  const link = el("a", "wsk-ec-cta", c.cta);
  link.target = "_blank";
  link.rel = "noopener";
  link.href = h.href();
  link.addEventListener("click", () => h.onRegister());

  if (m.options && m.options.length) {
    host.appendChild(el("p", "wsk-ec-lbl", c.whenLabel));
    const group = el("div", "wsk-ec-seg");
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", c.whenLabel);
    const buttons = [];
    for (const o of m.options) {
      const b = el("button", m.selected === o.slug ? "on" : "", o.label);
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(m.selected === o.slug));
      b.addEventListener("click", () => {
        h.onPick(o.slug);
        for (const [slug, btn] of buttons) {
          btn.className = slug === o.slug ? "on" : "";
          btn.setAttribute("aria-checked", String(slug === o.slug));
        }
        link.href = h.href();
      });
      buttons.push([o.slug, b]);
      group.appendChild(b);
    }
    host.appendChild(group);
    host.appendChild(el("p", "wsk-ec-small", c.whenHelp));
  }

  if (m.place) {
    const row = el("div", "wsk-ec-row");
    const icon = pin();
    if (icon) row.appendChild(icon);
    row.appendChild(el("span", null, m.place));
    host.appendChild(row);
  }

  host.appendChild(link);
  host.appendChild(el("p", "wsk-ec-note", c.note));

  if (c.requirements.length) {
    const d = document.createElement("details");
    d.appendChild(el("summary", null, c.detailsTitle));
    const ul = el("ul");
    for (const r of c.requirements) ul.appendChild(el("li", null, r));
    d.appendChild(ul);
    if (c.provisionalNote) d.appendChild(el("p", "wsk-ec-small", c.provisionalNote));
    if (typeof h.onDetailsOpened === "function" && typeof d.addEventListener === "function") d.addEventListener("toggle", () => { if (d.open) h.onDetailsOpened(); });
    host.appendChild(d);
  }

  const foot = el("p", "wsk-ec-foot");
  foot.appendChild(el("span", null, `${c.footerQuestion} `));
  const sw = el("button", "wsk-ec-lnk", c.footerLink);
  sw.type = "button";
  sw.addEventListener("click", () => h.onSwitch());
  foot.appendChild(sw);
  host.appendChild(foot);
}
