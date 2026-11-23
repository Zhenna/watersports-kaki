import test from "node:test";
import assert from "node:assert/strict";
import { createAnalytics, isTrackedHost, cleanValue, cleanParams, readConsent, idKind, sourcePage, placementFor, EVENTS, ANALYTICS_ID } from "../analytics.js";

const GA = "G-ABCDE12345";

// ---- a small fake page
function node(tag) {
  const n = { tag, children: [], attrs: {}, listeners: {}, className: "", _t: "", parentNode: null };
  Object.defineProperty(n, "textContent", { get: () => n._t + n.children.map((c) => c.textContent || c._t || "").join(""), set: (v) => { n._t = v; } });
  n.setAttribute = (k, v) => { n.attrs[k] = v; };
  n.appendChild = (c) => { c.parentNode = n; n.children.push(c); return c; };
  n.append = (...cs) => cs.forEach((c) => n.appendChild(c));
  n.removeChild = (c) => { n.children = n.children.filter((x) => x !== c); c.parentNode = null; };
  n.addEventListener = (type, fn) => { (n.listeners[type] ||= []).push(fn); };
  n.click = () => (n.listeners.click || []).forEach((fn) => fn({ target: n }));
  return n;
}
function find(n, pred, out = []) {
  if (pred(n)) out.push(n);
  for (const c of n.children) find(c, pred, out);
  return out;
}
function env({ host = "www.watersportskaki.sg", search = "", store = {}, gpc, throwStorage = false, cookies = "", id = GA, now = 1_800_000_000_000 } = {}) {
  const head = node("head"), body = node("body"), sets = [];
  const doc = {
    head, body, listeners: {},
    createElement: node, createTextNode: (t) => ({ tag: "#text", _t: t, children: [], textContent: t }),
    getElementById: (id) => find(head, (n) => n.id === id)[0] || find(body, (n) => n.id === id)[0] || null,
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
  };
  Object.defineProperty(doc, "cookie", { get: () => cookies, set: (v) => sets.push(v) });
  const storage = throwStorage ? { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } }
    : { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
  const win = { location: { hostname: host, search }, navigator: gpc === undefined ? {} : { globalPrivacyControl: gpc } };
  const a = createAnalytics({ win, doc, storage, now: () => now, id });
  return { a, win, doc, head, body, store, sets, now };
}
const scripts = (e) => find(e.head, (n) => n.tag === "script");
const bar = (e) => find(e.body, (n) => n.id === "wsk-an-bar")[0];
const buttons = (e) => (bar(e) ? find(bar(e), (n) => n.tag === "button") : []);
const click = (e, label) => buttons(e).find((b) => b.textContent === label).click();

test("only watersportskaki.sg and its www address are tracked", () => {
  for (const h of ["www.watersportskaki.sg", "watersportskaki.sg", "WWW.WATERSPORTSKAKI.SG"]) assert.equal(isTrackedHost(h), true, h);
  for (const h of ["localhost", "127.0.0.1", "watersports-kaki-landing.vercel.app", "watersportskaki.sg.evil.com", "evil-watersportskaki.sg", "watersportskaki.com", "", undefined, null])
    assert.equal(isTrackedHost(h), false, String(h));
});

test("event fields are plain words only", () => {
  for (const ok of ["windsurf", "east-coast-parkway-carpark-e5", "never_tried", "a", "x".repeat(40)]) assert.equal(cleanValue(ok), ok);
  for (const bad of ["", "x".repeat(41), "Zhenna", "a b", "a@b.sg", "https://x.sg", "+65 8323 3395", "81234567", "name123456", 5, null, undefined, {}, ["a"]])
    assert.equal(cleanValue(bad), null, String(bad));
});

test("each event keeps only its own fields, and unknown events are refused", () => {
  assert.deepEqual(cleanParams("conditions_view", { sport: "windsurf", location: "east-coast", skill_level: "beginner", view_mode: "now", email: "a@b.sg", extra: "x" }),
    { sport: "windsurf", location: "east-coast", skill_level: "beginner", view_mode: "now" });
  assert.deepEqual(cleanParams("whatsapp_join_clicked", { source_page: "home", placement: "nav", link: "https://chat.whatsapp.com/abc" }), { source_page: "home", placement: "nav" });
  assert.deepEqual(cleanParams("plan_ahead_opened", {}), {});
  assert.equal(cleanParams("purchase", { sport: "x" }), null);
  assert.equal(cleanParams("__proto__", {}), null);
  assert.equal(cleanParams("toString", {}), null);
  for (const [name, fields] of Object.entries(EVENTS)) for (const f of fields) assert.ok(/^[a-z_]+$/.test(f), `${name}.${f}`);
});

test("stored choices are read, and stale or odd ones are ignored", () => {
  const now = 1_800_000_000_000;
  const s = (v) => ({ getItem: () => v });
  assert.equal(readConsent(s(JSON.stringify({ v: "granted", t: now - 1000 })), now), "granted");
  assert.equal(readConsent(s(JSON.stringify({ v: "denied", t: now - 1000 })), now), "denied");
  assert.equal(readConsent(s(JSON.stringify({ v: "granted", t: now - 400 * 24 * 3600e3 })), now), null);   // over a year old
  assert.equal(readConsent(s(JSON.stringify({ v: "granted", t: now + 9e9 })), now), null);                 // from the future
  for (const bad of [null, "", "x", "{}", JSON.stringify({ v: "maybe", t: now }), JSON.stringify({ v: "granted" })]) assert.equal(readConsent(s(bad), now), null);
  assert.equal(readConsent({ getItem() { throw new Error("x"); } }, now), null);
  assert.equal(readConsent(null, now), null);
});

test("before a choice, nothing from Google loads and the notice is shown", () => {
  const e = env();
  assert.equal(e.a.init(), "asking");
  assert.equal(scripts(e).length, 0);
  assert.equal(e.win.dataLayer, undefined);
  assert.equal(e.win.gtag, undefined);
  assert.deepEqual(e.sets, []);                                            // no cookie written
  assert.equal(e.a.state().loaded, false);
  assert.ok(bar(e));
  assert.match(bar(e).textContent, /Google Analytics/);
  assert.match(bar(e).textContent, /We don't send names or contact details/);
});

test("Accept and Decline are the same kind of button, side by side", () => {
  const e = env();
  e.a.init();
  assert.deepEqual(buttons(e).map((b) => b.textContent), ["Accept", "Decline"]);
  assert.deepEqual(buttons(e).map((b) => b.attrs.type), ["button", "button"]);
  assert.equal(buttons(e)[0].className, buttons(e)[1].className);          // equal prominence
  assert.equal(find(bar(e), (n) => n.tag === "a")[0].attrs.href, "/privacy.html");
});

test("Accept loads the tag once, with Google's own snippet steps and signals left off", () => {
  const e = env();
  e.a.init();
  click(e, "Accept");
  assert.equal(scripts(e).length, 1);
  const s = scripts(e)[0];
  assert.equal(s.src, `https://www.googletagmanager.com/gtag/js?id=${GA}`);
  assert.equal(s.async, true);
  assert.equal(e.win.dataLayer.length, 2);
  assert.equal(e.win.dataLayer[0][0], "js");
  assert.deepEqual([...e.win.dataLayer[1]], ["config", GA, { allow_google_signals: false, allow_ad_personalization_signals: false }]);
  assert.equal(bar(e), undefined);                                         // the notice is gone
  assert.equal(JSON.parse(e.store.wsk_consent_analytics).v, "granted");
  e.a.accept();
  assert.equal(scripts(e).length, 1);                                      // never twice
  assert.deepEqual(e.a.state(), { status: "granted", loaded: true });
});

test("a Tag Manager container still works, and sends no config of its own", () => {
  const e = env({ id: "GTM-ABCD123" });
  e.a.init();
  click(e, "Accept");
  assert.equal(scripts(e)[0].src, "https://www.googletagmanager.com/gtm.js?id=GTM-ABCD123");
  assert.equal(e.win.dataLayer.length, 1);
  assert.equal(e.win.dataLayer[0][0], "js");
});

test("idKind accepts a GA4 ID or a container, and refuses the placeholder and anything odd", () => {
  assert.equal(idKind("G-ABCDE12345"), "ga4");
  assert.equal(idKind("G-1A2B3C4D5E"), "ga4");
  assert.equal(idKind("GTM-PJ4W6CDX"), "gtm");
  for (const bad of ["", "G-XXXXXXXXXX", "GTM-XXXX", "G-", "G-abc", "G-ABC", "G-ABCDEFGHIJKLM", "UA-12345-1", "GTM-", "g-abcde12345", "G-ABCDE12345 ", "G-<script>", null, undefined, 5, {}])
    assert.equal(idKind(bad), null, String(bad));
});

test("with no valid ID, nothing loads and no notice is shown", () => {
  for (const id of ["", "G-XXXXXXXXXX", "GTM-", "G-ABC DEF", "G-<script>", "UA-1234-1"]) {
    const e = env({ id });
    assert.equal(e.a.init(), "off", id);
    assert.equal(scripts(e).length, 0);
    assert.equal(bar(e), undefined);
    assert.deepEqual(e.sets, []);
    assert.equal(find(e.head, (n) => n.tag === "style").length, 0);
    assert.equal(e.a.track("conditions_view", {}), false);
  }
});

test("the ID in the file is either empty or a valid Measurement ID, so a typo cannot ship", () => {
  assert.equal(typeof ANALYTICS_ID, "string");
  assert.ok(ANALYTICS_ID === "" || idKind(ANALYTICS_ID) !== null, `ANALYTICS_ID is not a valid ID: ${JSON.stringify(ANALYTICS_ID)}`);
  assert.ok(ANALYTICS_ID === "" || /^G-[A-Z0-9]{6,12}$/.test(ANALYTICS_ID), "set the G- Measurement ID, not a Tag Manager container");
});

test("with no id given, the file's own ID decides: empty does nothing, a valid one asks first", () => {
  const e = env();
  const bare = createAnalytics({ win: e.win, doc: e.doc, storage: null });         // no id given: uses ANALYTICS_ID
  if (idKind(ANALYTICS_ID) === null) {
    assert.equal(bare.init(), "off");
    assert.equal(bar(e), undefined);
  } else {
    assert.equal(bare.init(), "asking");                                            // a notice, and still nothing from Google
    assert.equal(e.win.dataLayer, undefined);
    assert.equal(scripts(e).filter((n) => n.src).length, 0);
  }
});

test("Decline loads nothing and clears Google cookies", () => {
  const e = env({ cookies: "_ga=GA1.1.1; _ga_ABC=GS1; other=keep; _gid=1; session=s" });
  e.a.init();
  click(e, "Decline");
  assert.equal(scripts(e).length, 0);
  assert.equal(e.win.dataLayer, undefined);
  assert.equal(bar(e), undefined);
  assert.equal(JSON.parse(e.store.wsk_consent_analytics).v, "denied");
  const cleared = e.sets.map((s) => s.split("=")[0]);
  for (const n of ["_ga", "_ga_ABC", "_gid"]) assert.ok(cleared.includes(n), n);
  assert.ok(!cleared.includes("other") && !cleared.includes("session"));       // other cookies are left alone
  assert.ok(e.sets.every((s) => s.includes("expires=Thu, 01 Jan 1970")));
  assert.ok(e.sets.some((s) => s.includes("domain=.watersportskaki.sg")));
});

test("a returning visitor who accepted loads the tag without a notice", () => {
  const store = { wsk_consent_analytics: JSON.stringify({ v: "granted", t: 1_800_000_000_000 - 5000 }) };
  const e = env({ store });
  assert.equal(e.a.init(), "granted");
  assert.equal(scripts(e).length, 1);
  assert.equal(bar(e), undefined);
});

test("a returning visitor who declined gets nothing and is not asked again", () => {
  const store = { wsk_consent_analytics: JSON.stringify({ v: "denied", t: 1_800_000_000_000 - 5000 }) };
  const e = env({ store });
  assert.equal(e.a.init(), "denied");
  assert.equal(scripts(e).length, 0);
  assert.equal(bar(e), undefined);
});

test("a choice older than a year is asked again", () => {
  const store = { wsk_consent_analytics: JSON.stringify({ v: "granted", t: 1_800_000_000_000 - 400 * 24 * 3600e3 }) };
  const e = env({ store });
  assert.equal(e.a.init(), "asking");
  assert.equal(scripts(e).length, 0);
  assert.ok(bar(e));
});

test("other addresses do nothing at all", () => {
  for (const host of ["localhost", "127.0.0.1", "watersports-kaki-landing.vercel.app", "evil-watersportskaki.sg"]) {
    const e = env({ host });
    assert.equal(e.a.init(), "off");
    assert.equal(scripts(e).length, 0);
    assert.equal(find(e.head, (n) => n.tag === "style").length, 0);
    assert.equal(bar(e), undefined);
    assert.equal(e.doc.listeners.click, undefined);
  }
});

test("?notrack=1 keeps your own browser out, and ?notrack=0 puts it back", () => {
  const store = {};
  let e = env({ search: "?notrack=1", store });
  assert.equal(e.a.init(), "off");
  assert.equal(store.wsk_no_track, "1");
  assert.equal(scripts(e).length, 0);
  assert.equal(bar(e), undefined);
  e = env({ store });                                                       // a later visit, no parameter
  assert.equal(e.a.init(), "off");
  e = env({ search: "?activity=windsurf&notrack=0", store });
  assert.equal(e.a.init(), "asking");
  assert.equal("wsk_no_track" in store, false);
  e = env({ search: "?notrack=2", store });
  assert.equal(e.a.init(), "asking");                                       // only 0 and 1 mean anything
});

test("a stored consent does not override notrack", () => {
  const store = { wsk_no_track: "1", wsk_consent_analytics: JSON.stringify({ v: "granted", t: 1_800_000_000_000 - 1000 }) };
  const e = env({ store });
  assert.equal(e.a.init(), "off");
  assert.equal(scripts(e).length, 0);
});

test("Global Privacy Control means nothing loads and no notice is shown", () => {
  const e = env({ gpc: true });
  assert.equal(e.a.init(), "off");
  assert.equal(scripts(e).length, 0);
  assert.equal(bar(e), undefined);
  assert.deepEqual(e.store, {});
  const store = { wsk_consent_analytics: JSON.stringify({ v: "granted", t: 1_800_000_000_000 - 1000 }) };
  assert.equal(env({ gpc: true, store }).a.init(), "off");                 // it wins over an earlier Accept
  assert.equal(env({ gpc: false }).a.init(), "asking");
});

test("the interest card events carry only the sport, spot and level", () => {
  assert.deepEqual(cleanParams("interest_card_viewed", { sport: "windsurf", location: "east-coast-parkway-carpark-e5", skill_level: "never_tried", email: "a@b.sg" }),
    { sport: "windsurf", location: "east-coast-parkway-carpark-e5", skill_level: "never_tried" });
  assert.deepEqual(cleanParams("interest_card_clicked", { sport: undefined, location: null, skill_level: "never_tried" }), { skill_level: "never_tried" });
  assert.deepEqual(cleanParams("interest_card_clicked", { sport: "windsurf", skill_level: "never_tried", when: "weekend" }), { sport: "windsurf", skill_level: "never_tried", when: "weekend" });
  assert.deepEqual(cleanParams("interest_card_clicked", { when: "none" }), { when: "none" });
  assert.deepEqual(cleanParams("interest_card_clicked", { when: "a@b.sg" }), {});               // an address is never sent
  assert.deepEqual(cleanParams("interest_card_viewed", { when: "weekend" }), {});              // only the click carries the choice
});

test("events are refused until the visitor accepts", () => {
  const e = env();
  e.a.init();
  assert.equal(e.a.track("conditions_view", { sport: "windsurf" }), false);
  assert.equal(e.win.dataLayer, undefined);
  click(e, "Decline");
  assert.equal(e.a.track("conditions_view", { sport: "windsurf" }), false);
});

test("after Accept, events go out with only clean fields", () => {
  const e = env();
  e.a.init();
  click(e, "Accept");
  assert.equal(e.a.track("conditions_view", { sport: "windsurf", location: "east-coast-parkway-carpark-e5", skill_level: "beginner", view_mode: "now", email: "a@b.sg" }), true);
  const sent = e.win.dataLayer[e.win.dataLayer.length - 1];
  assert.deepEqual([...sent], ["event", "conditions_view", { sport: "windsurf", location: "east-coast-parkway-carpark-e5", skill_level: "beginner", view_mode: "now" }]);
  const before = e.win.dataLayer.length;
  assert.equal(e.a.track("page_purchase", {}), false);                      // unknown event
  assert.equal(e.a.track("whatsapp_join_clicked", { placement: "https://chat.whatsapp.com/E8m" }), true);
  assert.deepEqual([...e.win.dataLayer[before]][2], {});                    // the link was dropped, the event still counted
});

test("changing your mind: events stop at once, and the cookies are cleared", () => {
  const e = env({ cookies: "_ga=1" });
  e.a.init();
  click(e, "Accept");
  assert.equal(e.a.track("plan_ahead_opened", {}), true);
  e.a.reopen();
  assert.ok(bar(e));
  click(e, "Decline");
  assert.equal(e.a.track("plan_ahead_opened", {}), false);
  assert.deepEqual(e.a.state(), { status: "denied", loaded: false });
  assert.ok(e.sets.length > 0);
});

test("a link marked data-wsk-consent-settings reopens the notice", () => {
  const e = env({ store: { wsk_consent_analytics: JSON.stringify({ v: "denied", t: 1_800_000_000_000 - 1000 }) } });
  e.a.init();
  assert.equal(bar(e), undefined);
  let prevented = false;
  const link = { closest: (sel) => (sel === "[data-wsk-consent-settings]" ? link : null) };
  e.doc.listeners.click.forEach((fn) => fn({ target: link, preventDefault: () => { prevented = true; } }));
  assert.ok(bar(e));
  assert.equal(prevented, true);
  e.doc.listeners.click.forEach((fn) => fn({ target: { closest: () => null } }));   // other clicks are ignored
  assert.equal(find(e.body, (n) => n.id === "wsk-an-bar").length, 1);
});

test("blocked storage still works for the page, and nothing breaks", () => {
  const e = env({ throwStorage: true });
  assert.equal(e.a.init(), "asking");
  assert.doesNotThrow(() => click(e, "Accept"));
  assert.equal(scripts(e).length, 1);
  assert.equal(e.a.track("plan_ahead_opened", {}), true);
});

test("the notice waits for the page body when it is not there yet", () => {
  const e = env();
  const saved = e.doc.body;
  e.doc.body = null;
  e.a.init();
  assert.equal(e.doc.listeners.DOMContentLoaded.length, 1);
  e.doc.body = saved;
  e.doc.listeners.DOMContentLoaded[0]();
  assert.ok(find(saved, (n) => n.id === "wsk-an-bar")[0]);
});

test("the notice and its buttons use only plain text, never markup", () => {
  const e = env();
  e.a.init();
  const all = find(bar(e), () => true);
  assert.ok(all.every((n) => !("innerHTML" in n)));
  assert.equal(find(e.head, (n) => n.tag === "style").length, 1);
});

// ---- what people click: pages, placement, and links marked with data-wsk-event
test("the page a click happened on is a plain word", () => {
  assert.equal(sourcePage("/"), "home");
  assert.equal(sourcePage("/index.html"), "home");
  assert.equal(sourcePage("/operators.html"), "operators");
  assert.equal(sourcePage("/privacy.html"), "privacy");
  assert.equal(sourcePage("/app/"), "app");
  assert.equal(sourcePage("/app"), "app");
  assert.equal(sourcePage("/app/index.html"), "app");
  for (const odd of ["/secret/path", "/application", "", undefined, null, 5]) assert.equal(sourcePage(odd), "other", String(odd));
});

test("placement comes from the link, else from the footer, nav or header it sits in, else page", () => {
  const link = (attrs, ancestors = []) => ({ getAttribute: (k) => attrs[k] ?? null, closest: (sel) => (ancestors.includes(sel) ? {} : null) });
  assert.equal(placementFor(link({ "data-wsk-placement": "hero" })), "hero");
  assert.equal(placementFor(link({}, ["footer"])), "footer");
  assert.equal(placementFor(link({}, ["nav"])), "nav");
  assert.equal(placementFor(link({}, ["header"])), "nav");
  assert.equal(placementFor(link({})), "page");
  assert.equal(placementFor(link({ "data-wsk-placement": "<script>" }, ["footer"])), "footer");   // a bad value falls back, never sent
  assert.equal(placementFor({}), "page");
  assert.equal(placementFor(null), "page");
});

test("the new click events carry only plain, listed fields", () => {
  assert.deepEqual(cleanParams("refresh_clicked", { sport: "windsurf", location: "east-coast", email: "a@b.sg" }), { sport: "windsurf", location: "east-coast" });
  assert.deepEqual(cleanParams("next_sport_link_clicked", { sport: "windsurf" }), { sport: "windsurf" });
  assert.deepEqual(cleanParams("home_link_clicked", { source_page: "app", placement: "nav", sport: "windsurf" }), { source_page: "app", placement: "nav" });
  assert.deepEqual(cleanParams("conditions_details_opened", { detail_type: "sources_limits", sport: "windsurf" }), { detail_type: "sources_limits", sport: "windsurf" });
});

test("the landing link events carry only the page and the place", () => {
  for (const name of ["feedback_link_clicked", "partners_link_clicked", "instagram_link_clicked", "whatsapp_join_clicked", "conditions_cta_clicked", "early_access_form_clicked"]) {
    assert.deepEqual(cleanParams(name, { source_page: "home", placement: "footer", href: "https://x.sg/?a=b", sport: "windsurf" }), { source_page: "home", placement: "footer" }, name);
  }
});

test("a tagged link is counted when pressed, after Accept, with its page and place", () => {
  const e = env();
  e.a.init();
  click(e, "Accept");
  const tagged = { getAttribute: (k) => (k === "data-wsk-event" ? "whatsapp_join_clicked" : null), closest: (sel) => (sel === "[data-wsk-event]" ? tagged : sel === "footer" ? {} : null) };
  e.win.location.pathname = "/operators.html";
  e.doc.listeners.click.forEach((fn) => fn({ target: tagged }));
  const sent = e.win.dataLayer[e.win.dataLayer.length - 1];
  assert.deepEqual([...sent], ["event", "whatsapp_join_clicked", { source_page: "operators", placement: "footer" }]);
});

test("a tagged link is not counted before Accept, after Decline, or with an unlisted event name", () => {
  const tagged = (name) => ({ getAttribute: () => name, closest: (sel) => (sel === "[data-wsk-event]" ? tagged(name) : null) });
  const press = (e, name) => e.doc.listeners.click.forEach((fn) => fn({ target: tagged(name) }));
  const before = env(); before.a.init(); press(before, "whatsapp_join_clicked");
  assert.equal(before.win.dataLayer, undefined);
  const declined = env(); declined.a.init(); click(declined, "Decline"); press(declined, "whatsapp_join_clicked");
  assert.equal(declined.win.dataLayer, undefined);
  const accepted = env(); accepted.a.init(); click(accepted, "Accept");
  const n = accepted.win.dataLayer.length;
  press(accepted, "purchase"); press(accepted, "__proto__"); press(accepted, null);
  assert.equal(accepted.win.dataLayer.length, n);
});

test("clicks on things that are not tagged do nothing, and the consent link still works", () => {
  const e = env();
  e.a.init();
  click(e, "Accept");
  const n = e.win.dataLayer.length;
  e.doc.listeners.click.forEach((fn) => fn({ target: { closest: () => null } }));
  e.doc.listeners.click.forEach((fn) => fn({ target: null }));
  e.doc.listeners.click.forEach((fn) => fn({}));
  assert.equal(e.win.dataLayer.length, n);
});
