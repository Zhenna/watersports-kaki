import test from "node:test";
import assert from "node:assert/strict";
import { renderPlanCard, PLAN_CSS } from "../plan-card.js";
import { OG_TITLE, OG_DESCRIPTION, waShareUrl } from "../session-share.js";

// ---- a small fake page
function node(tag) {
  const n = { tag, children: [], attrs: {}, listeners: {}, className: "", _t: "", href: "", target: "", rel: "", type: "", open: false };
  Object.defineProperty(n, "textContent", { get: () => n._t + n.children.map((c) => c.textContent).join(""), set: (v) => { n._t = v; n.children = []; } });
  Object.defineProperty(n, "innerHTML", { set() { throw new Error("innerHTML must not be used"); }, get() { throw new Error("innerHTML must not be used"); } });
  n.setAttribute = (k, v) => { n.attrs[k] = v; };
  n.appendChild = (c) => { n.children.push(c); return c; };
  n.replaceChildren = (...cs) => { n.children = [...cs]; };
  n.addEventListener = (t, f) => { (n.listeners[t] ||= []).push(f); };
  n.click = () => (n.listeners.click || []).forEach((f) => f({ target: n }));
  n.fire = (t) => (n.listeners[t] || []).forEach((f) => f({ target: n }));
  n.focus = () => { focused.push(n.attrs["data-k"]); };
  n.querySelector = (sel) => {
    const m = /\[data-k="(.+)"\]/.exec(sel);
    return m ? (find(n, (x) => x.attrs["data-k"] === m[1])[0] || null) : null;
  };
  return n;
}
let focused = [];
const find = (n, pred, out = []) => { if (pred(n)) out.push(n); n.children.forEach((c) => find(c, pred, out)); return out; };
const byClass = (n, c) => find(n, (x) => x.className.split(" ").includes(c));
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

const DAYS = [["2026-11-24", "Tue", 24, "Tue, 24 Nov", true], ["2026-11-25", "Wed", 25, "Wed, 25 Nov", true], ["2026-11-29", "Sun", 29, "Sun, 29 Nov", false]]
  .map(([iso, short, num, label, has]) => ({ iso, short, num, label, has }));
const VIEW = {
  state: "ok", thunderNotice: "Thundery showers forecast for the afternoon.",
  wind: { range: "5.4 to 10.8 kn", direction: "NNE", deg: 22.5 },
  periods: [
    { key: "am", label: "AM", sub: "morning", hours: "6am \u2013 12pm", title: "Partly cloudy", icon: "partly", thundery: false, tide: "Rising" },
    { key: "pm", label: "PM", sub: "afternoon", hours: "12pm \u2013 6pm", title: "Thundery showers", icon: "thunder", thundery: true, tide: "Falling" },
  ],
  assessment: { headline: "Light breeze to moderate breeze", pill: "Within provisional range" },
  summary: "Summary text.", small: "Small print.", stale: false,
  tide: { hourly: [{ time: "06:00", height_m: 1.7, state: "rising" }, { time: "12:00", height_m: 2.5, state: "falling" }], extremes: [{ kind: "high", time: "10:01", height_m: 3.1 }] },
  tideNote: "Predicted, not measured.",
};
const MSG = "Windsurfing at East Coast Parkway (Carpark E5), Tue 24 Nov, morning. Who's in? Link";
const model = (over = {}) => ({
  sub: "Windsurfing \u00b7 East Coast Parkway (Carpark E5) \u00b7 Beginner", days: DAYS, selected: 0, status: "ok", errorText: "Forecast unavailable right now. Note.",
  view: VIEW, dayLabel: "Tue, 24 Nov", invited: null,
  session: { open: false, slot: "am", message: MSG, shareUrl: waShareUrl(MSG) },
  hourlyOpen: false, interest: { href: "https://forms.gle/x", text: "Prefer to be matched with others? Register your interest \u203a", hint: "Weekday times aren't in the form yet." },
  focus: null, ...over,
});
function run(over = {}, hover = {}, env) {
  focused = [];
  const p = page(env);
  const calls = { day: [], session: 0, slot: [], share: 0, copy: 0, hourly: 0, details: 0, interest: 0 };
  const h = {
    onDay: (i) => calls.day.push(i), onSession: () => { calls.session += 1; }, onSlot: (k) => calls.slot.push(k),
    onShare: () => { calls.share += 1; }, onCopy: () => { calls.copy += 1; return Promise.resolve(true); },
    onHourly: () => { calls.hourly += 1; }, onDetailsOpened: () => { calls.details += 1; }, onInterest: () => { calls.interest += 1; }, ...hover,
  };
  const m = model(over);
  renderPlanCard(p.host, m, h);
  return { ...p, calls, m, h };
}

test("the card keeps the page's own heading, sub line and question, then the day chips", () => {
  const r = run();
  assert.equal(text(r.host.children[0]), "Find your next Water Day");
  assert.equal(r.host.children[1].className, "plan-sub");
  assert.match(text(r.host.children[1]), /Windsurfing . East Coast Parkway \(Carpark E5\) . Beginner/);
  assert.equal(text(r.host.children[2]), "When would you like to go?");
  assert.equal(r.host.children[3].className, "wsk-pc-chips");
});

test("the day heading reads Forecast for the chosen day, without a dash", () => {
  const r = run();
  assert.equal(text(byClass(r.host, "wsk-pc-dt")[0]), "Forecast for Tue, 24 Nov");
  assert.equal(text(byClass(run({ dayLabel: "Wed, 25 Nov" }).host, "wsk-pc-dt")[0]), "Forecast for Wed, 25 Nov");
});

test("each day is a chip, the chosen one is pressed, and forecast days carry a dot", () => {
  const r = run({ selected: 1 });
  const chips = byClass(r.host, "wsk-pc-chip");
  assert.equal(chips.length, 3);
  assert.deepEqual(chips.map((c) => c.attrs["aria-pressed"]), ["false", "true", "false"]);
  assert.deepEqual(chips.map((c) => byTag(c, "i").length), [1, 1, 0]);
  assert.deepEqual(chips.map((c) => c.attrs["aria-label"]), ["Tue, 24 Nov, forecast available", "Wed, 25 Nov, forecast available", "Sun, 29 Nov"]);
  assert.match(text(chips[0]), /Tue.*24/);
  assert.match(text(r.host), /A dot marks days with a forecast\./);
  chips[2].click();
  assert.deepEqual(r.calls.day, [2]);
});

test("no legend when no day has a forecast", () => {
  const r = run({ days: DAYS.map((d) => ({ ...d, has: false })) });
  assert.doesNotMatch(text(r.host), /A dot marks/);
});

test("both periods show their hours, weather, wind for the day and tide", () => {
  const r = run();
  const per = byClass(r.host, "wsk-pc-per");
  assert.equal(per.length, 2);
  assert.match(text(per[0]), /AM.*6am . 12pm/);
  assert.match(text(per[1]), /PM.*12pm . 6pm/);
  assert.equal(per[1].className.includes("pm"), true);
  assert.deepEqual(byClass(r.host, "wsk-pc-wt").map(text), ["Partly cloudy", "Thundery showers"]);
  for (const p of per) {
    assert.match(text(p), /Wind\s*5\.4 to 10\.8 kn NNE.*all day/);
    assert.equal(byTag(p, "svg").some((s) => /rotate\(202\.5deg\)/.test(s.attrs.style || "")), true);   // blowing from 22.5 degrees, arrow turned 180 more
  }
  assert.match(text(per[0]), /Tide\s*Rising/);
  assert.match(text(per[1]), /Tide\s*Falling/);
});

test("a period whose text is for the whole day carries a small Day forecast label, and others do not", () => {
  const view = { ...VIEW, periods: [{ ...VIEW.periods[0], scope: "day" }, { ...VIEW.periods[1], scope: null }] };
  const per = byClass(run({ view }).host, "wsk-pc-per");
  assert.match(text(per[0]), /Partly cloudy\s*Day forecast/);
  assert.doesNotMatch(text(per[1]), /Day forecast/);
  const none = byClass(run({ view: { ...VIEW, periods: [{ ...VIEW.periods[0], title: null, scope: "day" }, VIEW.periods[1]] } }).host, "wsk-pc-per")[0];
  assert.doesNotMatch(text(none), /Day forecast/);                         // with no text there is nothing to label
});

test("a missing weather text, wind or tide says so and never guesses", () => {
  const view = { ...VIEW, wind: null, periods: [{ ...VIEW.periods[0], title: null, tide: null, icon: "none" }, { ...VIEW.periods[1], tide: "Rising, then falling" }] };
  const r = run({ view });
  const per = byClass(r.host, "wsk-pc-per");
  assert.match(text(per[0]), /No detail for this time/);
  assert.match(text(per[0]), /Wind\s*Not available/);
  assert.match(text(per[0]), /Tide\s*Not available/);
  assert.match(text(per[1]), /Tide\s*Rising, then falling/);
  assert.equal(byClass(r.host, "mute").length >= 3, true);
});

test("a wind with no known direction shows the range and no arrow", () => {
  const r = run({ view: { ...VIEW, wind: { range: "5.0 to 9.0 kn", direction: "Variable", deg: null } } });
  const per = byClass(r.host, "wsk-pc-per")[0];
  assert.match(text(per), /5\.0 to 9\.0 kn Variable/);
  assert.equal(byTag(per, "svg").some((s) => /rotate/.test(s.attrs.style || "")), false);
});

test("the thunder note appears only when the forecast has thunder, with the old official-warnings line", () => {
  const r = run();
  const note = byClass(r.host, "wsk-pc-note")[0];
  assert.match(text(note), /Thundery showers forecast for the afternoon\./);
  assert.match(text(note), /Conditions can change\. Check updated forecasts and official warnings on the day\./);
  assert.equal(byClass(run({ view: { ...VIEW, thunderNotice: null } }).host, "wsk-pc-note").length, 0);
});

test("the wind assessment line and a stale warning show only when there is something to say", () => {
  const r = run();
  assert.match(text(byClass(r.host, "wsk-pc-assess")[0]), /Light breeze to moderate breeze\s*Within provisional range/);
  assert.equal(byClass(r.host, "pill").length, 1);
  assert.equal(byClass(run({ view: { ...VIEW, assessment: null } }).host, "wsk-pc-assess").length, 0);
  assert.doesNotMatch(text(r.host), /out of date/);
  assert.match(text(run({ view: { ...VIEW, stale: true } }).host), /This forecast is out of date\./);
});

test("while loading, on an error, or for a day with no forecast, there are no cards but the page still works", () => {
  for (const [over, expect] of [
    [{ status: "loading", view: null }, /Loading forecast\.\.\./],
    [{ status: "idle", view: null }, /Loading forecast\.\.\./],
    [{ status: "error", view: null }, /Forecast unavailable right now\. Note\./],
    [{ view: { state: "none", message: "Forecast not yet available for Sun, 29 Nov." } }, /Forecast not yet available for Sun, 29 Nov\./],
  ]) {
    const r = run(over);
    assert.equal(byClass(r.host, "wsk-pc-per").length, 0);
    assert.match(text(r.host), expect);
    assert.equal(byClass(r.host, "wsk-pc-session").length, 1);                 // you can still create a session
    assert.equal(byClass(r.host, "wsk-pc-interest").length, 1);
    assert.equal(byClass(r.host, "wsk-pc-foot").length, 0);                    // but there are no hourly details to open
  }
});

test("Create a session is a soft box, closed at first, and pressing it tells the page", () => {
  const r = run();
  const s = byClass(r.host, "wsk-pc-session")[0];
  assert.equal(s.tag, "button");
  assert.equal(s.attrs["aria-expanded"], "false");
  assert.match(text(s), /Create a session\s*Invite others to this day and time/);
  assert.equal(byClass(r.host, "wsk-pc-panel").length, 0);
  s.click();
  assert.equal(r.calls.session, 1);
});

test("with no sport or place known there is no session box", () => {
  assert.equal(byClass(run({ session: null }).host, "wsk-pc-session").length, 0);
});

test("opened, the panel offers AM, PM or both, the preview, the message and the two buttons", () => {
  const r = run({ session: { open: true, slot: "pm", message: MSG, shareUrl: waShareUrl(MSG) } });
  assert.equal(byClass(r.host, "wsk-pc-session")[0].attrs["aria-expanded"], "true");
  const panel = byClass(r.host, "wsk-pc-panel")[0];
  assert.match(text(panel), /Create a session . Tue, 24 Nov/);
  const radios = find(panel, (n) => n.attrs.role === "radio");
  assert.deepEqual(radios.map(text), ["AM", "PM", "AM and PM"]);
  assert.deepEqual(radios.map((b) => b.attrs["aria-checked"]), ["false", "true", "false"]);
  assert.deepEqual(radios.map((b) => b.className), ["", "on", ""]);
  assert.equal(find(panel, (n) => n.attrs.role === "radiogroup").length, 1);
  assert.equal(text(byClass(panel, "wsk-pc-msg")[0]), MSG);
  radios[2].click();
  assert.deepEqual(r.calls.slot, ["both"]);
});

test("the preview in the panel is the card WhatsApp will really show, the same for every share", () => {
  const r = run({ session: { open: true, slot: "am", message: MSG, shareUrl: waShareUrl(MSG) } });
  const card = byClass(r.host, "wsk-pc-card")[0];
  assert.match(text(byClass(card, "wsk-pc-img")[0]), /WaterSports Kaki.*Forecast, wind and tide for watersports in Singapore/);
  assert.equal(text(byClass(card, "wsk-pc-ct")[0]), `${OG_TITLE}${OG_DESCRIPTION}watersportskaki.sg`);
  assert.doesNotMatch(text(card), /Tue|24 Nov|morning|afternoon/);        // it does not claim to show the day, because it cannot
});

test("Share to WhatsApp is a real link that opens WhatsApp with the message, in a new tab", () => {
  const r = run({ session: { open: true, slot: "am", message: MSG, shareUrl: waShareUrl(MSG) } });
  const a = byClass(r.host, "wsk-pc-share")[0];
  assert.equal(a.tag, "a");
  assert.equal(text(a), "Share to WhatsApp");
  assert.equal(a.href, waShareUrl(MSG));
  assert.equal(new URL(a.href).searchParams.get("text"), MSG);
  assert.equal(a.target, "_blank");
  assert.equal(a.rel, "noopener");
  a.click();
  assert.equal(r.calls.share, 1);
});

test("Copy message says Copied when it worked and Couldn't copy when it did not", async () => {
  const r = run({ session: { open: true, slot: "am", message: MSG, shareUrl: waShareUrl(MSG) } });
  const b = byClass(r.host, "wsk-pc-copy")[0];
  assert.equal(text(b), "Copy message");
  b.click();
  await new Promise((res) => setTimeout(res, 5));
  assert.equal(text(b), "Copied");
  assert.equal(r.calls.copy, 1);
  const bad = run({ session: { open: true, slot: "am", message: MSG, shareUrl: "x" } }, { onCopy: () => Promise.resolve(false) });
  const b2 = byClass(bad.host, "wsk-pc-copy")[0];
  b2.click();
  await new Promise((res) => setTimeout(res, 5));
  assert.equal(text(b2), "Couldn't copy");
  const boom = run({ session: { open: true, slot: "am", message: MSG, shareUrl: "x" } }, { onCopy: () => Promise.reject(new Error("no")) });
  const b3 = byClass(boom.host, "wsk-pc-copy")[0];
  b3.click();
  await new Promise((res) => setTimeout(res, 5));
  assert.equal(text(b3), "Couldn't copy");
});

test("the panel says plainly that WSK books nothing and the message has no numbers", () => {
  const r = run({ session: { open: true, slot: "am", message: MSG, shareUrl: "x" } });
  assert.match(text(byClass(r.host, "wsk-pc-fn")[0]), /WSK doesn't book sessions or keep a list of who joins\. The message has no wind or tide numbers, because they change\./);
});

test("hourly details is a small footnote link, closed at first", () => {
  const r = run();
  const f = byClass(r.host, "wsk-pc-foot")[0];
  assert.equal(text(f), "View hourly details \u203a");
  assert.equal(f.attrs["aria-expanded"], "false");
  assert.equal(f.className, "wsk-pc-foot");
  assert.equal(byClass(r.host, "wsk-pc-hr").length, 0);
  f.click();
  assert.equal(r.calls.hourly, 1);
});

test("opened, the hourly panel lists the tide by hour, the highs and lows, and says what NEA does not publish", () => {
  const r = run({ hourlyOpen: true });
  assert.equal(text(byClass(r.host, "wsk-pc-foot")[0]), "Hide hourly details \u02c4");
  const panel = byClass(r.host, "wsk-pc-hr")[0];
  assert.match(text(panel), /High 10:01 \(3\.1 m\)/);
  const rows = byTag(byTag(panel, "tbody")[0], "tr");
  assert.deepEqual(rows.map(text), ["06:001.7 m, rising", "12:002.5 m, falling"]);
  assert.deepEqual(rows.map((x) => x.className), ["", "pmr"]);
  assert.match(text(panel), /Predicted, not measured\./);
  assert.match(text(panel), /NEA publishes no hourly wind or gust forecast\./);
  assert.match(text(panel), /not water depth/);
});

test("with no hourly tide the panel says so and still says what NEA does not publish", () => {
  const r = run({ hourlyOpen: true, view: { ...VIEW, tide: null } });
  const panel = byClass(r.host, "wsk-pc-hr")[0];
  assert.match(text(panel), /Hourly tide isn't available for this day\./);
  assert.match(text(panel), /NEA publishes no hourly wind or gust forecast\./);
  assert.equal(byTag(panel, "table").length, 0);
  const r2 = run({ hourlyOpen: true, view: { ...VIEW, tide: { hourly: null, extremes: [] } } });
  assert.match(text(byClass(r2.host, "wsk-pc-hr")[0]), /isn't available/);
});

test("the guidance summary and small print are tucked into a closed Details, and opening it tells the page", () => {
  const r = run();
  const d = byTag(r.host, "details")[0];
  assert.equal(d.attrs.open, undefined);
  assert.equal(text(d.children[0]), "Details");
  assert.match(text(d), /Summary text\./);
  assert.match(text(d), /Small print\./);
  assert.match(text(d), /Lightning is checked live on the day\. See Right now\./);
  d.open = false; d.fire("toggle");
  assert.equal(r.calls.details, 0);
  d.open = true; d.fire("toggle");
  assert.equal(r.calls.details, 1);
  assert.equal(byTag(run({ view: { ...VIEW, summary: null, small: "" } }).host, "details").length, 0);
});

test("the interest line keeps the form link and the hint about which box to tick", () => {
  const r = run();
  const p = byClass(r.host, "wsk-pc-interest")[0];
  const a = byTag(p, "a")[0];
  assert.equal(a.href, "https://forms.gle/x");
  assert.equal(a.target, "_blank");
  assert.equal(a.rel, "noopener");
  assert.equal(text(a), "Prefer to be matched with others? Register your interest \u203a");
  assert.match(text(p), /Weekday times aren't in the form yet\./);
  a.click();
  assert.equal(r.calls.interest, 1);
  assert.doesNotMatch(text(run({ interest: { href: "x", text: "t", hint: "" } }).host.children.at(-1)).replace("t", ""), /form yet/);
});

test("the time a shared link named is marked on its card, or on both", () => {
  const am = byClass(run({ invited: "am" }).host, "wsk-pc-per");
  assert.deepEqual(am.map((p) => p.className.includes("invited")), [true, false]);
  assert.match(text(am[0]), /Invited/);
  const pm = byClass(run({ invited: "pm" }).host, "wsk-pc-per");
  assert.deepEqual(pm.map((p) => p.className.includes("invited")), [false, true]);
  const both = byClass(run({ invited: "both" }).host, "wsk-pc-per");
  assert.deepEqual(both.map((p) => p.className.includes("invited")), [true, true]);
  assert.equal(byClass(run().host, "wsk-pc-tag").length, 0);
});

test("after a redraw, focus goes back to the control that was used", () => {
  assert.deepEqual((run({ focus: "session" }), focused), ["session"]);
  assert.deepEqual((run({ focus: "day-1" }), focused), ["day-1"]);
  assert.deepEqual((run({ focus: "hourly" }), focused), ["hourly"]);
  assert.deepEqual((run({ focus: "slot-pm", session: { open: true, slot: "pm", message: MSG, shareUrl: "x" } }), focused), ["slot-pm"]);
  assert.deepEqual((run({ focus: "nothing-here" }), focused), []);
  assert.deepEqual((run({ focus: null }), focused), []);
});

test("model text is shown as plain text, never as markup", () => {
  const r = run({ sub: "<b>x</b>", dayLabel: "<img src=x>", view: { ...VIEW, periods: [{ ...VIEW.periods[0], title: "<script>alert(1)</script>" }, VIEW.periods[1]] } });
  assert.match(text(r.host), /<b>x<\/b>/);
  assert.match(text(r.host), /<script>alert\(1\)<\/script>/);
  assert.equal(byTag(r.host, "script").length, 0);
  assert.equal(byTag(r.host, "img").length, 0);
});

test("drawing again replaces the card and does not stack another", () => {
  const r = run();
  renderPlanCard(r.host, r.m, r.h);
  renderPlanCard(r.host, r.m, r.h);
  assert.equal(byClass(r.host, "wsk-pc-session").length, 1);
  assert.equal(byClass(r.host, "wsk-pc-chips").length, 1);
});

test("the page still works when it cannot draw pictures, or has no head", () => {
  const r = run({}, {}, { svg: false });
  assert.equal(byTag(r.host, "svg").length, 0);
  assert.match(text(r.host), /Partly cloudy/);
  assert.match(text(r.host), /Wind\s*5\.4 to 10\.8 kn NNE/);
  assert.doesNotThrow(() => run({}, {}, { head: false }));
});

test("its style sheet is added once, only to the head, and only touches the plan section", () => {
  const r = run();
  renderPlanCard(r.host, r.m, r.h);
  const styles = byTag(r.head, "style");
  assert.equal(styles.length, 1);
  assert.equal(styles[0].id, "wsk-pc-css");
  assert.equal(styles[0].textContent, PLAN_CSS);
  assert.ok(PLAN_CSS.split("}").filter((x) => x.trim() && !x.trim().startsWith("@media")).every((rule) => rule.trim().startsWith("#plan")));
  assert.match(PLAN_CSS, /:focus-visible\{outline:3px solid/);
  assert.doesNotMatch(PLAN_CSS, /gradient/);
});

test("the card carries no wind or tide numbers in its invitation preview and no operator names anywhere", () => {
  const r = run({ session: { open: true, slot: "am", message: MSG, shareUrl: waShareUrl(MSG) }, hourlyOpen: true });
  assert.doesNotMatch(text(r.host), /PAssion|WaVe|Aloha|Constant Wind|operator|partner network/i);
});

test("the card needs only createElement, getElementById and the basics, like the smoke test's minimal page", () => {
  const h = node("head");
  const calls = [];
  globalThis.document = {                                   // no createTextNode, no createElementNS, no head
    createElement: (tag) => { calls.push(tag); return node(tag); },
    getElementById: () => null,
  };
  const host = node("section");
  assert.doesNotThrow(() => renderPlanCard(host, model({ session: { open: true, slot: "pm", message: MSG, shareUrl: waShareUrl(MSG) }, hourlyOpen: true }), {
    onDay() {}, onSession() {}, onSlot() {}, onShare() {}, onCopy: () => Promise.resolve(true), onHourly() {},
  }));
  assert.match(text(host), /Find your next Water Day/);
  assert.match(text(host), /Partly cloudy/);
  assert.match(text(host), /Thundery showers forecast for the afternoon\./);
  assert.match(text(host), /Conditions can change\. Check updated forecasts and official warnings on the day\./);
  assert.ok(h);
});
