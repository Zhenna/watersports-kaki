import test from "node:test";
import assert from "node:assert/strict";
import { renderEntryCard, ENTRY_CSS } from "../entry-card.js";
import { entryCard, NEVER_TRIED, WHEN_OPTIONS } from "../entry-requirements.js";

// ---- a small fake page
function node(tag) {
  const n = { tag, children: [], attrs: {}, listeners: {}, className: "", _t: "", href: "", target: "", rel: "", type: "" };
  Object.defineProperty(n, "textContent", { get: () => n._t + n.children.map((c) => c.textContent).join(""), set: (v) => { n._t = v; n.children = []; } });
  Object.defineProperty(n, "innerHTML", { set() { throw new Error("innerHTML must not be used"); }, get() { throw new Error("innerHTML must not be used"); } });
  n.setAttribute = (k, v) => { n.attrs[k] = v; };
  n.appendChild = (c) => { n.children.push(c); return c; };
  n.replaceChildren = (...cs) => { n.children = [...cs]; };
  n.addEventListener = (t, f) => { (n.listeners[t] ||= []).push(f); };
  n.click = () => (n.listeners.click || []).forEach((f) => f({ target: n }));
  return n;
}
const find = (n, pred, out = []) => { if (pred(n)) out.push(n); n.children.forEach((c) => find(c, pred, out)); return out; };
const byClass = (n, c) => find(n, (x) => x.className === c || x.className.split(" ").includes(c));
const byTag = (n, t) => find(n, (x) => x.tag === t);
const text = (n) => n.textContent;

function page({ head = true, svg = true } = {}) {
  const h = node("head");
  globalThis.document = {
    createElement: node,
    createElementNS: svg ? (ns, t) => node(t) : undefined,
    head: head ? h : null,
    getElementById: (id) => find(h, (n) => n.id === id)[0] || null,
  };
  return { head: h, host: node("section") };
}

const card = () => entryCard({ sportSlug: "windsurf", sportName: "Windsurfing", level: NEVER_TRIED });
function run(over = {}, hover = {}, env) {
  const p = page(env);
  const calls = { picks: [], registers: 0, switches: 0, choice: null };
  const m = { card: card(), count: null, options: WHEN_OPTIONS, selected: null, place: "East Coast Parkway (Carpark E5)", ...over };
  const h = {
    href: () => `https://form.example/?when=${calls.choice}`,
    onPick: (s) => { calls.picks.push(s); calls.choice = s; },
    onRegister: () => { calls.registers += 1; },
    onSwitch: () => { calls.switches += 1; },
    ...hover,
  };
  renderEntryCard(p.host, m, h);
  return { ...p, calls, m, h };
}

test("the card has the pieces of the design, in order", () => {
  const r = run({ count: { number: 12, asOf: "17 Nov 2026" } });
  const kids = r.host.children;
  assert.equal(kids[0].className, "wsk-ec-chip");
  assert.equal(text(kids[0]), "New to windsurfing?");
  assert.equal(kids[1].className, "wsk-ec-title");
  assert.equal(text(kids[1]), "Learn windsurfing together");
  assert.equal(kids[1].attrs.role, "heading");
  assert.equal(kids[2].className, "wsk-ec-sub");
  assert.match(text(kids[2]), /^Lessons are run by instructors at East Coast\./);
  assert.equal(kids[3].className, "wsk-ec-count");
  const classes = kids.map((k) => k.className);
  assert.ok(classes.indexOf("wsk-ec-seg") > classes.indexOf("wsk-ec-count"));
  assert.ok(classes.indexOf("wsk-ec-cta") > classes.indexOf("wsk-ec-row"));
  assert.ok(classes.indexOf("wsk-ec-note") > classes.indexOf("wsk-ec-cta"));
  assert.equal(kids[kids.length - 2].tag, "details");
  assert.equal(kids[kids.length - 1].className, "wsk-ec-foot");
});

test("a count shows the number, the word registered, and the date", () => {
  const r = run({ count: { number: 12, asOf: "17 Nov 2026" } });
  const box = byClass(r.host, "wsk-ec-count")[0];
  assert.equal(text(find(box, (n) => n.tag === "b")[0]), "12");
  assert.match(text(box), /registered/);
  assert.match(text(box), /have registered interest in a beginner windsurfing session/);
  assert.match(text(box), /As of 17 Nov 2026\. Counts only, from our sign-up form\./);
  assert.equal(byClass(r.host, "wsk-ec-first").length, 0);
});

test("with no count it says Be one of the first, and shows no number", () => {
  const r = run({ count: null });
  assert.equal(text(byClass(r.host, "wsk-ec-first")[0]), "Be one of the first to register your interest.");
  assert.equal(byClass(r.host, "wsk-ec-count").length, 0);
  assert.equal(find(r.host, (n) => n.tag === "b").length, 0);
});

test("the three times appear only when options are given", () => {
  const withOptions = run();
  const group = byClass(withOptions.host, "wsk-ec-seg")[0];
  assert.deepEqual(byTag(group, "button").map(text), ["Weekend", "Weekday", "Flexible"]);
  assert.equal(group.attrs.role, "radiogroup");
  assert.deepEqual(byTag(group, "button").map((b) => b.attrs.role), ["radio", "radio", "radio"]);
  assert.match(text(withOptions.host), /When would you prefer to learn\?/);
  assert.match(text(withOptions.host), /Flexible means either works for you\./);

  const without = run({ options: [] });
  assert.equal(byClass(without.host, "wsk-ec-seg").length, 0);
  assert.doesNotMatch(text(without.host), /When would you prefer|Flexible means/);
});

test("picking a time marks it, tells the page, and updates the button's link", () => {
  const r = run();
  const buttons = byTag(byClass(r.host, "wsk-ec-seg")[0], "button");
  const cta = byClass(r.host, "wsk-ec-cta")[0];
  assert.equal(cta.href, "https://form.example/?when=null");
  buttons[1].click();
  assert.deepEqual(r.calls.picks, ["weekday"]);
  assert.deepEqual(buttons.map((b) => b.className), ["", "on", ""]);
  assert.deepEqual(buttons.map((b) => b.attrs["aria-checked"]), ["false", "true", "false"]);
  assert.equal(cta.href, "https://form.example/?when=weekday");
  buttons[2].click();
  assert.deepEqual(r.calls.picks, ["weekday", "flexible"]);
  assert.deepEqual(buttons.map((b) => b.className), ["", "", "on"]);
  assert.equal(cta.href, "https://form.example/?when=flexible");
});

test("a time that was already chosen starts selected", () => {
  const r = run({ selected: "weekend" });
  const buttons = byTag(byClass(r.host, "wsk-ec-seg")[0], "button");
  assert.deepEqual(buttons.map((b) => b.className), ["on", "", ""]);
  assert.deepEqual(buttons.map((b) => b.attrs["aria-checked"]), ["true", "false", "false"]);
});

test("the button opens the form in a new tab and tells the page when it is pressed", () => {
  const r = run();
  const cta = byClass(r.host, "wsk-ec-cta")[0];
  assert.equal(cta.tag, "a");
  assert.equal(text(cta), "I'm interested \u2192");
  assert.equal(cta.target, "_blank");
  assert.equal(cta.rel, "noopener");
  cta.click();
  assert.equal(r.calls.registers, 1);
});

test("the place shows, with a pin when the page can draw one, and without it when not", () => {
  const r = run();
  const row = byClass(r.host, "wsk-ec-row")[0];
  assert.equal(text(row), "East Coast Parkway (Carpark E5)");
  assert.equal(byTag(row, "svg").length, 1);
  const plain = run({}, {}, { svg: false });
  assert.equal(byTag(byClass(plain.host, "wsk-ec-row")[0], "svg").length, 0);
  assert.equal(text(byClass(plain.host, "wsk-ec-row")[0]), "East Coast Parkway (Carpark E5)");
  assert.equal(byClass(run({ place: null }).host, "wsk-ec-row").length, 0);
  assert.equal(byClass(run({ place: "" }).host, "wsk-ec-row").length, 0);
});

test("the requirement is tucked into a closed row, with the provisional note inside", () => {
  const r = run();
  const d = byTag(r.host, "details")[0];
  assert.equal(d.attrs.open, undefined);
  assert.equal(text(d.children[0]), "Before you go out on your own");
  assert.equal(d.children[0].tag, "summary");
  assert.deepEqual(byTag(d, "li").map(text), ["Hold a recognised windsurfing proficiency certificate."]);
  assert.match(text(d), /Provisional: not yet reviewed by an instructor\./);
  assert.doesNotMatch(text(r.host).replace(text(d), ""), /recognised windsurfing proficiency certificate/);
});

test("a sport with no requirement has no empty collapsible row", () => {
  const generic = entryCard({ sportSlug: "sup", sportName: "SUP", level: NEVER_TRIED });
  const r = run({ card: generic });
  assert.equal(byTag(r.host, "details").length, 0);
  assert.match(text(byClass(r.host, "wsk-ec-foot")[0]), /^Already tried SUP\? View conditions$/);
});

test("the footer asks the certified question, and its link switches to conditions", () => {
  const r = run();
  const foot = byClass(r.host, "wsk-ec-foot")[0];
  assert.equal(text(foot), "Already certified to try windsurfing? View conditions");
  const b = byTag(foot, "button")[0];
  assert.equal(text(b), "View conditions");
  assert.equal(b.type, "button");
  b.click();
  assert.equal(r.calls.switches, 1);
});

test("model text is shown as plain text, never as markup", () => {
  const r = run({ place: "<img src=x onerror=alert(1)>", count: { number: 7, asOf: "<b>x</b>" } });
  assert.match(text(r.host), /<img src=x onerror=alert\(1\)>/);
  assert.match(text(r.host), /<b>x<\/b>/);
  assert.equal(byTag(r.host, "img").length, 0);
});

test("drawing again replaces the card and does not stack another", () => {
  const r = run();
  renderEntryCard(r.host, r.m, r.h);
  renderEntryCard(r.host, r.m, r.h);
  assert.equal(byClass(r.host, "wsk-ec-cta").length, 1);
  assert.equal(byClass(r.host, "wsk-ec-chip").length, 1);
});

test("its style sheet is added once, and only to the head, and it works without a head", () => {
  const r = run();
  renderEntryCard(r.host, r.m, r.h);
  const styles = byTag(r.head, "style");
  assert.equal(styles.length, 1);
  assert.equal(styles[0].id, "wsk-ec-css");
  assert.equal(styles[0].textContent, ENTRY_CSS);
  assert.doesNotThrow(() => run({}, {}, { head: false }));
});

test("the style sheet only targets the card, and sets the look the design asks for", () => {
  assert.ok(ENTRY_CSS.split("}").filter((r) => r.trim()).every((rule) => rule.trim().startsWith("#entry-panel")));
  assert.match(ENTRY_CSS, /\.wsk-ec-cta\{[^}]*background:#0d2c5b[^}]*border-radius:999px/);   // the navy pill button
  assert.match(ENTRY_CSS, /:focus-visible\{outline:3px solid/);                                // visible keyboard focus
  assert.doesNotMatch(ENTRY_CSS, /gradient/);
});

test("the card text carries no advice, no conditions words and no operator names", () => {
  const r = run({ count: { number: 12, asOf: "17 Nov 2026" } });
  const t = text(r.host);
  assert.doesNotMatch(t, /PAssion|WaVe|Aloha|Constant Wind|operator|partner/i);
  assert.doesNotMatch(t, /\bsafe\b|recommend|ideal|dangerous|\bwind\b|\bknots?\b|km\/h|lightning|strikes/i);
});
