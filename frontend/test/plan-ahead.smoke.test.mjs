// Smoke tests for the Plan ahead tab: the real app.js, run against a small fake page and a fake forecast.
// These replace the ten older plan tests in app.smoke.test.mjs, which checked the old layout (AM/PM toggles, one forecast block).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { upcomingDays } from "../lib.js";

const HTML = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const find = (n, p, out = []) => { if (p(n)) out.push(n); n.children.forEach((c) => find(c, p, out)); return out; };
const byClass = (n, c) => find(n, (x) => String(x.className).split(" ").includes(c));
const byTag = (n, t) => find(n, (x) => x.tag === t);
const text = (n) => n.textContent;

function mk(tag) {
  const n = { tag, children: [], attrs: {}, listeners: {}, className: "", _t: "", hidden: false, value: "", href: "", target: "", rel: "", type: "", open: false, style: {}, classList: { add() {}, remove() {} } };
  Object.defineProperty(n, "textContent", { get: () => n._t + n.children.map((c) => c.textContent).join(""), set: (v) => { n._t = v; n.children = []; } });
  Object.defineProperty(n, "innerHTML", { set() { throw new Error("innerHTML must not be used"); }, get() { throw new Error("innerHTML must not be used"); } });
  n.setAttribute = (k, v) => { n.attrs[k] = v; };
  n.appendChild = (c) => { n.children.push(c); return c; };
  n.append = (...cs) => cs.forEach((c) => n.appendChild(c));
  n.replaceChildren = (...cs) => { n.children = [...cs]; };
  n.addEventListener = (t, f) => { (n.listeners[t] ||= []).push(f); };
  n.click = () => (n.listeners.click || []).forEach((f) => f({ target: n }));
  n.fire = (t) => (n.listeners[t] || []).forEach((f) => f({ target: n }));
  n.focus = () => {};
  n.querySelector = (sel) => { const m = /\[data-k="(.+)"\]/.exec(sel); return m ? (find(n, (x) => x.attrs["data-k"] === m[1])[0] || null) : null; };
  return n;
}

const DAYS = upcomingDays();
const slot = (text, thundery = false, source = "nea_24h") => ({ text, thundery, source });
const fday = (d, over = {}) => ({
  date: d.iso, stale: false, wind: { knots_low: 5.4, knots_high: 10.8, direction: "NNE" },
  slots: { AM: slot("Partly Cloudy (Day)"), PM: slot("Thundery Showers", true) }, guidance: {},
  tide: { am: "Rising", pm: "Falling", hourly: [{ time: "06:00", height_m: 1.7, state: "rising" }, { time: "12:00", height_m: 2.5, state: "falling" }], extremes: [{ kind: "high", time: "10:01", height_m: 3.1 }] },
  ...over,
});
const forecastPayload = (days = DAYS.slice(0, 4).map((d, i) => (i === 1 ? fday(d, { slots: { AM: slot("Showers"), PM: slot("Showers") } }) : fday(d)))) =>
  ({ available: true, horizon_days: 4, note: "NEA outlook", tide_note: "Predicted, not measured.", days });
const conditions = () => ({ spot: { slug: "east-coast-parkway-carpark-e5", name: "East Coast Parkway (Carpark E5)" }, activity: "windsurf", level: "beginner", generated_at: new Date().toISOString(),
  observations: { wind: null, wind_message: "x", gusts: null, lightning: null }, guidance: { status: "not_published", summary: "x", flags: [], review_status: "unreviewed" }, sources: [], official_advisories: [], disclaimer: "Information only." });

let runNo = 0;
const realInterval = globalThis.setInterval;
const realTimeout = globalThis.setTimeout;
// The app puts a 25 second timeout on each request. A test that leaves a request pending (to check the Loading state)
// would make the whole run wait for it, so long timers are told not to keep the process alive.
globalThis.setTimeout = (fn, ms, ...rest) => {
  const t = realTimeout(fn, ms, ...rest);
  if (ms >= 1000 && t && typeof t.unref === "function") t.unref();
  return t;
};
test.after(() => { globalThis.setInterval = realInterval; globalThis.setTimeout = realTimeout; });

// Starts the real app against a fake page. forecast: a payload, "fail", or "never" (still loading).
async function boot({ query = "?activity=windsurf&spot=east-coast-parkway-carpark-e5&level=beginner&tab=plan", forecast = forecastPayload(), clipboard = true } = {}) {
  const els = {};
  for (const m of HTML.matchAll(/id="([^"]+)"/g)) els[m[1]] = mk("el");
  const events = [], fetched = [];
  globalThis.document = { getElementById: (id) => els[id] || null, createElement: mk, head: null, body: mk("body"), addEventListener() {}, visibilityState: "visible" };
  globalThis.window = { wskTrack: (n, p) => { events.push([n, p]); return true; } };
  globalThis.location = { href: "https://www.watersportskaki.sg/app/" + query, search: query };
  globalThis.history = { replaceState() {} };
  globalThis.setInterval = () => 0;
  let copied = null;
  Object.defineProperty(globalThis, "navigator", { value: clipboard ? { clipboard: { writeText: async (t) => { copied = t; } } } : {}, configurable: true });
  globalThis.fetch = async (url) => {
    const u = String(url);
    fetched.push(u);
    if (u.includes("/catalog/activities")) return { ok: true, json: async () => ({ activities: [{ slug: "windsurf", name: "Windsurfing" }] }) };
    if (u.includes("/catalog/spots")) return { ok: true, json: async () => ({ spots: [{ slug: "east-coast-parkway-carpark-e5", name: "East Coast Parkway (Carpark E5)" }] }) };
    if (u.includes("/forecast")) {
      if (forecast === "never") return new Promise(() => {});
      if (forecast === "fail") return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => forecast };
    }
    if (u.includes("/conditions")) return { ok: true, json: async () => conditions() };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  await import(`../app.js?plan=${++runNo}`);
  const tick = () => new Promise((r) => setTimeout(r, 15));
  await tick(); await tick(); await tick();
  const plan = els.plan;
  return {
    els, plan, events, fetched, tick, copied: () => copied,
    chips: () => byClass(plan, "wsk-pc-chip"), cards: () => byClass(plan, "wsk-pc-per"),
    names: () => events.map((e) => e[0]),
  };
}

test("plan ahead: seven dates, an AM and a PM card, and thunder said once", async () => {
  const t = await boot();
  assert.equal(t.chips().length, 7);
  assert.equal(t.cards().length, 2);
  assert.deepEqual(byClass(t.plan, "wsk-pc-wt").map(text), ["Partly cloudy", "Thundery showers"]);
  assert.equal(text(t.plan).split("Thundery showers forecast for the afternoon.").length - 1, 1);
});

test("the forecast shows thunder, the wind assessment and the wind figures, with the limits tucked away", async () => {
  const t = await boot();
  assert.match(text(byClass(t.plan, "wsk-pc-note")[0]), /Thundery showers forecast for the afternoon\./);
  assert.equal(byClass(t.plan, "wsk-pc-assess").length, 1);
  assert.equal(byClass(t.plan, "pill").length, 1);
  for (const c of t.cards()) assert.match(text(c), /Wind\s*5\.4 to 10\.8 kn NNE/);
  const d = byTag(t.plan, "details")[0];
  assert.equal(d.open, false);
  assert.match(text(d), /NEA outlook/);
  assert.match(text(d), /Lightning is checked live on the day\. See Right now\./);
});

test("thunder stays visible, outside the details, when the afternoon is thundery", async () => {
  const t = await boot();
  const note = byClass(t.plan, "wsk-pc-note")[0];
  const d = byTag(t.plan, "details")[0];
  assert.equal(find(d, (n) => n === note).length, 0);
  assert.match(text(note), /Conditions can change\. Check updated forecasts and official warnings on the day\./);
  assert.doesNotMatch(text(d), /Thundery showers forecast for the afternoon\./);
});

test("AM and PM are both shown at once, thunder comes before the wind assessment, and the tide has its own word for each", async () => {
  const t = await boot();
  const [am, pm] = t.cards();
  assert.match(text(am), /AM.*6am . 12pm.*Partly cloudy.*Tide\s*Rising/);
  assert.match(text(pm), /PM.*12pm . 6pm.*Thundery showers.*Tide\s*Falling/);
  const order = t.plan.children.map((c) => c.className);
  assert.ok(order.indexOf("wsk-pc-note") < order.indexOf("wsk-pc-assess"), "thunder is said first");
  assert.equal(byClass(t.plan, "wsk-pc-seg").length, 0);                      // no AM/PM toggles on the page itself
});

test("the form hint follows the chosen day", async () => {
  const t = await boot();
  const weekend = DAYS.findIndex((d) => d.weekend);
  const weekday = DAYS.findIndex((d) => !d.weekend);
  t.chips()[weekend].click();
  assert.equal(text(byClass(t.plan, "wsk-pc-interest")[0]).includes(`In the form, tick ${DAYS[weekend].short} AM and ${DAYS[weekend].short} PM.`), true);
  t.chips()[weekday].click();
  assert.match(text(byClass(t.plan, "wsk-pc-interest")[0]), /Weekday times aren't in the form yet\./);
});

test("choosing another day shows that day's forecast, or says there is none yet", async () => {
  const t = await boot();
  t.chips()[1].click();
  assert.deepEqual(byClass(t.plan, "wsk-pc-wt").map(text), ["Showers", "Showers"]);
  assert.equal(byClass(t.plan, "wsk-pc-note").length, 0);                     // no thunder that day
  t.chips()[5].click();
  assert.equal(t.cards().length, 0);
  assert.match(text(t.plan), new RegExp(`Forecast not yet available for ${DAYS[5].label}`));
  assert.equal(byClass(t.plan, "wsk-pc-session").length, 1);                  // an invitation is still possible
});

test("API text is inserted as text, not markup", async () => {
  const bad = DAYS.slice(0, 4).map((d) => fday(d, { slots: { AM: slot("<img src=x onerror=alert(1)>"), PM: slot("<b>bold</b>") }, wind: { knots_low: 5, knots_high: 9, direction: "<script>alert(1)</script>" } }));
  const t = await boot({ forecast: forecastPayload(bad) });
  assert.match(text(t.plan), /<img src=x onerror=alert/);                     // shown as text; a weather title drops anything in brackets
  assert.match(text(t.plan), /<script>alert\(1\)<\/script>/);
  assert.equal(byTag(t.plan, "img").length, 0);
  assert.equal(byTag(t.plan, "script").length, 0);
  assert.equal(byTag(t.plan, "b").some((b) => text(b) === "bold" && b.className === ""), false);
});

test("a slot whose text is for the whole day is labelled Day forecast", async () => {
  const days = DAYS.slice(0, 4).map((d, i) => fday(d, i === 0 ? { slots: { AM: slot("Showers", false, "daily"), PM: slot("Showers", false, "daily") } } : {}));
  const t = await boot({ forecast: forecastPayload(days) });
  assert.deepEqual(t.cards().map((c) => /Day forecast/.test(text(c))), [true, true]);
  t.chips()[1].click();
  assert.deepEqual(t.cards().map((c) => /Day forecast/.test(text(c))), [false, false]);
});

test("a dot marks the days that have a forecast, with a one-line explanation", async () => {
  const t = await boot();
  const dots = t.chips().map((c) => byTag(c, "i").length);
  assert.deepEqual(dots, [1, 1, 1, 1, 0, 0, 0]);
  assert.match(text(t.plan), /A dot marks days with a forecast\./);
  assert.deepEqual(t.chips().map((c) => c.attrs["aria-label"]).slice(0, 2), [`${DAYS[0].label}, forecast available`, `${DAYS[1].label}, forecast available`]);
});

test("no dots are shown before the forecast has loaded, or when it fails", async () => {
  for (const [forecast, expect] of [["never", /Loading forecast\.\.\./], ["fail", /Forecast unavailable right now\./]]) {
    const t = await boot({ forecast });
    assert.equal(t.chips().filter((c) => byTag(c, "i").length).length, 0, forecast);
    assert.doesNotMatch(text(t.plan), /A dot marks/);
    assert.match(text(t.plan), expect);
    assert.equal(t.cards().length, 0);
    assert.equal(byClass(t.plan, "wsk-pc-session").length, 1, "the invite box still works");
  }
});

test("each view links to the other, and the choice of day is kept", async () => {
  const t = await boot({ query: "?activity=windsurf&spot=east-coast-parkway-carpark-e5&level=beginner" });
  assert.equal(t.els["pane-plan"].hidden, true);
  t.els["go-plan"].click();
  assert.equal(t.els["pane-plan"].hidden, false);
  assert.equal(t.els["pane-now"].hidden, true);
  await t.tick(); await t.tick();
  t.chips()[2].click();
  t.els["go-now"].click();
  assert.equal(t.els["pane-now"].hidden, false);
  t.els["go-plan"].click();
  assert.equal(t.chips().findIndex((c) => c.attrs["aria-pressed"] === "true"), 2);
});

// ---- the new parts of the tab

test("Create a session opens a panel with the message for the chosen time, and sharing is counted", async () => {
  const t = await boot();
  const box = byClass(t.plan, "wsk-pc-session")[0];
  assert.equal(byClass(t.plan, "wsk-pc-panel").length, 0);
  box.click();
  assert.deepEqual(t.names().filter((n) => n.startsWith("session")), ["session_create_clicked"]);
  const msg = () => text(byClass(t.plan, "wsk-pc-msg")[0]);
  assert.match(msg(), /^Windsurfing at East Coast Parkway \(Carpark E5\), .+, morning\. Who's in\? For people who can already windsurf\./);
  assert.doesNotMatch(msg(), /Thundery/);
  find(t.plan, (n) => n.attrs["data-k"] === "slot-pm")[0].click();
  assert.match(msg(), /afternoon\. Thundery showers are forecast for the afternoon\. Who's in\?/);
  assert.match(msg(), new RegExp(`day=${DAYS[0].iso}&slot=pm`));
  const share = byClass(t.plan, "wsk-pc-share")[0];
  assert.equal(new URL(share.href).host, "wa.me");
  assert.equal(new URL(share.href).searchParams.get("text"), msg());
  share.click();
  assert.deepEqual(t.events.filter((e) => e[0] === "session_share_clicked").map((e) => e[1].slot), ["pm"]);
});

test("Copy message copies the invitation and is counted only when it worked", async () => {
  const ok = await boot();
  byClass(ok.plan, "wsk-pc-session")[0].click();
  const message = text(byClass(ok.plan, "wsk-pc-msg")[0]);
  byClass(ok.plan, "wsk-pc-copy")[0].click();
  await ok.tick();
  assert.equal(ok.copied(), message);
  assert.deepEqual(ok.names().filter((n) => n === "session_copy_clicked"), ["session_copy_clicked"]);
  assert.equal(text(byClass(ok.plan, "wsk-pc-copy")[0]), "Copied");
  const no = await boot({ clipboard: false });
  byClass(no.plan, "wsk-pc-session")[0].click();
  byClass(no.plan, "wsk-pc-copy")[0].click();
  await no.tick();
  assert.equal(no.names().includes("session_copy_clicked"), false);
  assert.equal(text(byClass(no.plan, "wsk-pc-copy")[0]), "Couldn't copy");
});

test("the panel closes when another day is chosen, and its message names the new day", async () => {
  const t = await boot();
  byClass(t.plan, "wsk-pc-session")[0].click();
  t.chips()[1].click();
  assert.equal(byClass(t.plan, "wsk-pc-panel").length, 0);
  byClass(t.plan, "wsk-pc-session")[0].click();
  assert.match(text(byClass(t.plan, "wsk-pc-msg")[0]), new RegExp(`day=${DAYS[1].iso}&slot=am`));
});

test("a shared link opens Plan ahead on its day and time, and bad values are ignored", async () => {
  const t = await boot({ query: `?activity=windsurf&spot=east-coast-parkway-carpark-e5&tab=plan&day=${DAYS[2].iso}&slot=pm` });
  assert.equal(t.chips().findIndex((c) => c.attrs["aria-pressed"] === "true"), 2);
  assert.deepEqual(t.cards().map((c) => c.className.includes("invited")), [false, true]);
  byClass(t.plan, "wsk-pc-session")[0].click();
  assert.equal(byClass(t.plan, "wsk-pc-seg")[0].children.findIndex((b) => b.className === "on"), 1);   // PM is already chosen
  const bad = await boot({ query: "?activity=windsurf&spot=east-coast-parkway-carpark-e5&tab=plan&day=2020-01-01&slot=noon" });
  assert.equal(bad.chips().findIndex((c) => c.attrs["aria-pressed"] === "true"), 0);
  assert.deepEqual(bad.cards().map((c) => c.className.includes("invited")), [false, false]);
});

test("hourly details opens from a footnote, shows the tide by hour, and is counted once per opening", async () => {
  const t = await boot();
  const foot = byClass(t.plan, "wsk-pc-foot")[0];
  assert.equal(text(foot), "View hourly details \u203a");
  assert.equal(byClass(t.plan, "wsk-pc-hr").length, 0);
  foot.click();
  assert.match(text(byClass(t.plan, "wsk-pc-hr")[0]), /06:00\s*1\.7 m, rising/);
  assert.match(text(byClass(t.plan, "wsk-pc-hr")[0]), /NEA publishes no hourly wind or gust forecast\./);
  byClass(t.plan, "wsk-pc-foot")[0].click();                                   // close
  assert.equal(byClass(t.plan, "wsk-pc-hr").length, 0);
  byClass(t.plan, "wsk-pc-foot")[0].click();                                   // open again
  assert.equal(t.names().filter((n) => n === "hourly_details_opened").length, 2);
});

test("a day with no tide data says Not available, and the rest of the card still works", async () => {
  const days = DAYS.slice(0, 4).map((d) => fday(d, { tide: undefined }));
  const t = await boot({ forecast: forecastPayload(days) });
  for (const c of t.cards()) assert.match(text(c), /Tide\s*Not available/);
  byClass(t.plan, "wsk-pc-foot")[0].click();
  assert.match(text(byClass(t.plan, "wsk-pc-hr")[0]), /Hourly tide isn't available for this day\./);
  assert.equal(byClass(t.plan, "wsk-pc-session").length, 1);
});

test("the interest line keeps the form link and counts presses, and the invitation carries no skill level", async () => {
  const t = await boot();
  const a = byTag(byClass(t.plan, "wsk-pc-interest")[0], "a")[0];
  assert.equal(a.target, "_blank");
  a.click();
  assert.equal(t.names().includes("plan_interest_clicked"), true);
  byClass(t.plan, "wsk-pc-session")[0].click();
  assert.doesNotMatch(text(byClass(t.plan, "wsk-pc-msg")[0]), /level=/);
});

test("switching to Never tried does not break Plan ahead's next visit, and no request is made for conditions or forecast", async () => {
  const t = await boot({ query: "?activity=windsurf&spot=east-coast-parkway-carpark-e5&level=never_tried" });
  assert.equal(t.fetched.some((u) => u.includes("/conditions") || u.includes("/forecast")), false);
  assert.equal(t.els["entry-panel"].hidden, false);
});
