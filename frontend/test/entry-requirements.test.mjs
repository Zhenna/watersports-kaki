import test from "node:test";
import assert from "node:assert/strict";
import { NEVER_TRIED, STARTER_LEVEL, ENTRY_REQUIREMENTS, WHEN_OPTIONS, MIN_COUNT_SHOWN, panesFor, entryCard, learnerForm, interestLink, cleanText, countView } from "../entry-requirements.js";
import { LEVELS } from "../lib.js";

const strings = (c) => [c.chip, c.heading, c.intro, c.noCount, c.registeredLabel, c.registeredText, c.countNote, c.detailsTitle, ...c.requirements, c.provisionalNote, c.cta, c.note, c.footerQuestion, c.footerLink];

test("never tried hides the conditions and shows the card; every other level is the reverse", () => {
  assert.deepEqual(panesFor(NEVER_TRIED), { conditions: false, entry: true });
  for (const level of LEVELS.filter((l) => l !== NEVER_TRIED)) assert.deepEqual(panesFor(level), { conditions: true, entry: false }, level);
  for (const odd of [undefined, null, "", "expert", 5]) assert.deepEqual(panesFor(odd), { conditions: true, entry: false }, String(odd));
});

test("the level names match the ones the page offers", () => {
  assert.ok(LEVELS.includes(NEVER_TRIED));
  assert.ok(LEVELS.includes(STARTER_LEVEL));
  assert.notEqual(STARTER_LEVEL, NEVER_TRIED);
});

test("only the never tried level gets a card", () => {
  for (const level of LEVELS.filter((l) => l !== NEVER_TRIED)) assert.equal(entryCard({ sportSlug: "windsurf", sportName: "Windsurfing", level }), null, level);
  assert.equal(entryCard({ sportSlug: "windsurf", sportName: "Windsurfing", level: undefined }), null);
});

test("windsurfing has one requirement, a certificate, marked provisional until an instructor signs it", () => {
  const c = entryCard({ sportSlug: "windsurf", sportName: "Windsurfing", level: NEVER_TRIED });
  assert.equal(c.chip, "New to windsurfing?");
  assert.equal(c.heading, "Learn windsurfing together");
  assert.deepEqual(c.requirements, ["Hold a recognised windsurfing proficiency certificate."]);
  assert.equal(c.detailsTitle, "Before you go out on your own");
  assert.match(c.provisionalNote, /Provisional/);
});

test("the footer and the requirement agree: both are about being certified", () => {
  const c = entryCard({ sportSlug: "windsurf", sportName: "Windsurfing", level: NEVER_TRIED });
  assert.equal(c.footerQuestion, "Already certified to try windsurfing?");
  assert.equal(c.footerLink, "View conditions");
  assert.match(c.requirements[0], /certificate/);
  assert.doesNotMatch(c.requirements[0], /competence/);                    // no second route that the footer would not match
});

test("windsurfing says lessons exist, without naming anyone, and offers a group session", () => {
  const c = entryCard({ sportSlug: "windsurf", sportName: "Windsurfing", level: NEVER_TRIED });
  assert.equal(c.intro, "Lessons are run by instructors at East Coast. If you'd rather learn in a small group with other first-timers, tell us when suits you and we'll let you know if we organise a session.");
  assert.doesNotMatch(c.intro, /doesn't list|no beginner course|PAssion|Aloha|Constant Wind/i);
});

test("a sport with no claim that lessons exist keeps the always-true wording, and never says lessons exist", () => {
  for (const [slug, name] of [["sup", "SUP"], ["kayak", "Kayaking"], [undefined, undefined]]) {
    const c = entryCard({ sportSlug: slug, sportName: name, level: NEVER_TRIED });
    assert.match(c.intro, /WSK doesn't list a beginner course here yet/);
    assert.match(c.intro, /If you'd like to learn in a small group with other first-timers/);
    assert.doesNotMatch(c.intro, /Lessons are run|go ahead/);
  }
});

test("a sport with no agreed requirement gets the general card, no invented line, and a plain footer", () => {
  for (const [slug, name] of [["sup", "SUP / Paddleboarding"], ["kayak", "Kayaking"], ["wingfoil", "Wing foiling"], ["", ""], [undefined, undefined], ["__proto__", "x"], ["toString", "x"]]) {
    const c = entryCard({ sportSlug: slug, sportName: name, level: NEVER_TRIED });
    assert.deepEqual(c.requirements, [], String(slug));
    assert.equal(c.provisionalNote, "");
    assert.match(c.chip, /^New to .+\?$/);
    assert.match(c.heading, /^Learn .+ together$/);
    assert.match(c.footerQuestion, /^Already tried .+\?$/);                 // no claim about certificates for a sport we know nothing about
    assert.doesNotMatch(c.footerQuestion, /certif/i);
  }
  assert.equal(entryCard({ sportSlug: "sup", sportName: "SUP / Paddleboarding", level: NEVER_TRIED }).heading, "Learn SUP / Paddleboarding together");
  assert.equal(entryCard({ sportSlug: "x", sportName: "  ", level: NEVER_TRIED }).heading, "Learn this sport together");
  assert.equal(entryCard({ sportSlug: "kayak", sportName: "Kayaking", level: NEVER_TRIED }).chip, "New to kayaking?");
  assert.equal(entryCard({ sportSlug: "wingfoil", sportName: "Wing foiling", level: NEVER_TRIED }).heading, "Learn wing foiling together");
});

test("a reviewed requirement drops the provisional note", () => {
  ENTRY_REQUIREMENTS.windsurf.never_tried.reviewed = true;
  try { assert.equal(entryCard({ sportSlug: "windsurf", sportName: "Windsurfing", level: NEVER_TRIED }).provisionalNote, ""); }
  finally { ENTRY_REQUIREMENTS.windsurf.never_tried.reviewed = false; }
});

test("the sport name is trimmed and capped, and the card cannot be changed through the returned list", () => {
  const c = entryCard({ sportSlug: "windsurf", sportName: "W".repeat(200), level: NEVER_TRIED });
  assert.ok(c.heading.length < 80);
  c.requirements.push("extra");
  assert.equal(entryCard({ sportSlug: "windsurf", sportName: "Windsurfing", level: NEVER_TRIED }).requirements.length, 1);
});

test("no operator or venue is named, and nothing reads as advice or a verdict on conditions", () => {
  for (const [slug, name] of [["windsurf", "Windsurfing"], ["sup", "SUP"]]) {
    const text = strings(entryCard({ sportSlug: slug, sportName: name, level: NEVER_TRIED })).join(" ");
    assert.doesNotMatch(text, /PAssion|WaVe|Changi|Sailing Club|operator|partner/i);
    assert.doesNotMatch(text, /\bsafe\b|good to go|recommend|ideal|dangerous|\bwind\b|\bknots?\b|km\/h|lightning|strikes/i);
  }
});

test("the card promises no booking and no sharing of details without consent", () => {
  const c = entryCard({ sportSlug: "windsurf", sportName: "Windsurfing", level: NEVER_TRIED });
  assert.match(c.note, /Nothing is booked or paid/);
  assert.match(c.note, /never share your name or contact details without your say-so/);
});

// ---- the weekend / weekday / flexible choice
const FORM = {
  url: "https://docs.google.com/forms/d/e/1FAIpQLSdExample/viewform",
  when: { param: "entry.1234567890", values: { weekend: "Weekend", weekday: "Weekday", flexible: "Flexible" } },
};

test("the three times are weekend, weekday and flexible, in that order", () => {
  assert.deepEqual(WHEN_OPTIONS.map((o) => o.slug), ["weekend", "weekday", "flexible"]);
  assert.deepEqual(WHEN_OPTIONS.map((o) => o.label), ["Weekend", "Weekday", "Flexible"]);
  const c = entryCard({ sportSlug: "windsurf", sportName: "Windsurfing", level: NEVER_TRIED });
  assert.equal(c.whenLabel, "When would you prefer to learn?");
  assert.equal(c.whenHelp, "Flexible means either works for you.");
});

test("a Google Form link with a matching answer is accepted", () => {
  const f = learnerForm(FORM);
  assert.equal(f.url, "https://docs.google.com/forms/d/e/1FAIpQLSdExample/viewform");
  assert.equal(f.param, "entry.1234567890");
  assert.deepEqual(f.values, { weekend: "Weekend", weekday: "Weekday", flexible: "Flexible" });
});

test("anything missing or odd means no choice is shown", () => {
  const bad = [
    undefined, null, {}, "x", 5,
    { ...FORM, url: "https://forms.gle/abc123" },                                   // a short link cannot carry an answer
    { ...FORM, url: "http://docs.google.com/forms/d/e/x/viewform" },                // not https
    { ...FORM, url: "https://evil.example/forms/d/e/x/viewform" },                  // not Google
    { ...FORM, url: "https://docs.google.com/document/d/x" },                       // not a form
    { ...FORM, url: "not a url" },
    { url: FORM.url },
    { url: FORM.url, when: null },
    { url: FORM.url, when: { param: "entry.12", values: FORM.when.values } },        // too short
    { url: FORM.url, when: { param: "entry.abc", values: FORM.when.values } },
    { url: FORM.url, when: { param: "q=1&entry.123", values: FORM.when.values } },
    { url: FORM.url, when: { param: FORM.when.param, values: { weekend: "Weekend", weekday: "Weekday" } } },   // flexible missing
    { url: FORM.url, when: { param: FORM.when.param, values: { weekend: "Weekend", weekday: "Weekday", flexible: "" } } },
    { url: FORM.url, when: { param: FORM.when.param, values: { weekend: "Weekend", weekday: "Weekday", flexible: 5 } } },
    { url: FORM.url, when: { param: FORM.when.param, values: { weekend: "W".repeat(61), weekday: "Weekday", flexible: "Flexible" } } },
    { url: FORM.url, when: { param: FORM.when.param, values: { weekend: "We\nekend", weekday: "Weekday", flexible: "Flexible" } } },
    { url: FORM.url, when: { param: FORM.when.param, values: Object.create({ weekend: "Weekend", weekday: "Weekday", flexible: "Flexible" }) } },
  ];
  for (const b of bad) assert.equal(learnerForm(b), null, JSON.stringify(b));
});

test("a choice fills in the answer on the form link", () => {
  const f = learnerForm(FORM);
  for (const [slug, label] of [["weekend", "Weekend"], ["weekday", "Weekday"], ["flexible", "Flexible"]]) {
    const u = new URL(interestLink(f, "https://fallback.example", slug));
    assert.equal(u.origin + u.pathname, "https://docs.google.com/forms/d/e/1FAIpQLSdExample/viewform");
    assert.equal(u.searchParams.get("usp"), "pp_url");
    assert.equal(u.searchParams.get("entry.1234567890"), label);
  }
});

test("no choice, or a choice that is not one of the three, opens the form with nothing filled in", () => {
  const f = learnerForm(FORM);
  for (const choice of [null, undefined, "", "sunday", "__proto__", "toString", 5, {}]) {
    assert.equal(interestLink(f, "https://fallback.example", choice), "https://docs.google.com/forms/d/e/1FAIpQLSdExample/viewform", String(choice));
  }
});

test("with no learner form the button goes where it always did", () => {
  assert.equal(interestLink(null, "https://forms.gle/abc", "weekend"), "https://forms.gle/abc");
  assert.equal(interestLink(learnerForm({ ...FORM, url: "https://forms.gle/x" }), "https://forms.gle/abc", "weekend"), "https://forms.gle/abc");
});

test("answers with spaces or symbols are encoded, and existing form settings are kept", () => {
  const f = learnerForm({ url: "https://docs.google.com/forms/d/e/abc/viewform?hl=en", when: { param: "entry.999", values: { weekend: "Weekend & Sat", weekday: "Weekday", flexible: "Either / flexible" } } });
  const u = new URL(interestLink(f, "x", "weekend"));
  assert.equal(u.searchParams.get("hl"), "en");
  assert.equal(u.searchParams.get("entry.999"), "Weekend & Sat");
  assert.match(interestLink(f, "x", "weekend"), /entry\.999=Weekend\+%26\+Sat|entry\.999=Weekend%20%26%20Sat/);
});

test("the choice text adds no advice or conditions words", () => {
  const c = entryCard({ sportSlug: "windsurf", sportName: "Windsurfing", level: NEVER_TRIED });
  assert.doesNotMatch(c.whenLabel + " " + c.whenHelp, /\bsafe\b|recommend|ideal|dangerous|\bwind\b|lightning|strikes/i);
});

// ---- one form for every sport: the page fills in the sport and the place
const SHARED = { ...FORM, sport: { param: "entry.2222222222" }, place: { param: "entry.3333333333" } };

test("the sport and place questions are optional, and a form without them still works", () => {
  const f = learnerForm(FORM);
  assert.equal(f.sportParam, null);
  assert.equal(f.placeParam, null);
  const u = new URL(interestLink(f, "x", "weekend", { sport: "Windsurfing", place: "East Coast" }));
  assert.equal(u.searchParams.get("entry.1234567890"), "Weekend");
  assert.equal([...u.searchParams.keys()].length, 2);                       // usp and the time only
});

test("a form with sport and place questions has them filled in from the page", () => {
  const f = learnerForm(SHARED);
  assert.equal(f.sportParam, "entry.2222222222");
  assert.equal(f.placeParam, "entry.3333333333");
  const u = new URL(interestLink(f, "x", "weekday", { sport: "Windsurfing", place: "East Coast Parkway (Carpark E5)" }));
  assert.equal(u.searchParams.get("entry.1234567890"), "Weekday");
  assert.equal(u.searchParams.get("entry.2222222222"), "Windsurfing");
  assert.equal(u.searchParams.get("entry.3333333333"), "East Coast Parkway (Carpark E5)");
  assert.equal(u.searchParams.get("usp"), "pp_url");
});

test("the sport and place are filled in even before the visitor picks a time", () => {
  const u = new URL(interestLink(learnerForm(SHARED), "x", null, { sport: "SUP / Paddleboarding", place: "East Coast" }));
  assert.equal(u.searchParams.get("entry.2222222222"), "SUP / Paddleboarding");
  assert.equal(u.searchParams.get("entry.1234567890"), null);
});

test("with nothing to fill in, the link has no answers and no usp", () => {
  const u = new URL(interestLink(learnerForm(SHARED), "x", null, {}));
  assert.equal(u.search, "");
  assert.equal(new URL(interestLink(learnerForm(SHARED), "x", null)).search, "");
});

test("odd sport or place text is dropped, not sent", () => {
  assert.equal(cleanText("  Wing   foiling "), "Wing foiling");
  assert.equal(cleanText("a\nb"), "a b");                                   // a line break is just a space
  for (const bad of ["", "   ", "x".repeat(81), "a\u0001b", "a\u0000b", null, undefined, 5, {}]) assert.equal(cleanText(bad), null, String(bad));
  const u = new URL(interestLink(learnerForm(SHARED), "x", "weekend", { sport: "x".repeat(200), place: "a\u0001b" }));
  assert.equal(u.searchParams.get("entry.2222222222"), null);
  assert.equal(u.searchParams.get("entry.3333333333"), null);
  assert.equal(u.searchParams.get("entry.1234567890"), "Weekend");
});

test("a half-set sport or place question turns the whole choice off, so no data is quietly lost", () => {
  const bad = [
    { ...FORM, sport: {} }, { ...FORM, sport: null }, { ...FORM, sport: { param: "entry.12" } }, { ...FORM, sport: { param: "q" } },
    { ...FORM, place: { param: "entry.abc" } }, { ...FORM, place: "entry.3333333333" },
    { ...FORM, sport: { param: "entry.1234567890" } },                                  // the same number as the time question
    { ...FORM, sport: { param: "entry.2222222222" }, place: { param: "entry.2222222222" } },
  ];
  for (const b of bad) assert.equal(learnerForm(b), null, JSON.stringify(b));
});

test("a sport name with symbols is encoded in the link", () => {
  const link = interestLink(learnerForm(SHARED), "x", null, { sport: "SUP / Paddleboarding & kayak" });
  assert.equal(new URL(link).searchParams.get("entry.2222222222"), "SUP / Paddleboarding & kayak");
  assert.ok(!link.includes(" "));
});

// ---- the count of people who have registered
const NOW = Date.parse("2026-11-17T10:00:00+08:00");

test("a real count shows from 2 registrations, with its date", () => {
  assert.equal(MIN_COUNT_SHOWN, 2);
  assert.deepEqual(countView({ windsurf: { count: 12, asOf: "2026-11-17" } }, "windsurf", NOW), { number: 12, asOf: "17 Nov 2026" });
  assert.deepEqual(countView({ windsurf: { count: 2, asOf: "2026-01-05" } }, "windsurf", NOW), { number: 2, asOf: "5 Jan 2026" });
});

test("below 2, or no count, the card falls back to Be one of the first", () => {
  for (const count of [0, 1, -3]) assert.equal(countView({ windsurf: { count, asOf: "2026-11-17" } }, "windsurf", NOW), null, String(count));
  assert.equal(countView(undefined, "windsurf", NOW), null);
  assert.equal(countView({}, "windsurf", NOW), null);
  assert.equal(countView({ kayak: { count: 9, asOf: "2026-11-17" } }, "windsurf", NOW), null);          // another sport's number
  assert.equal(entryCard({ sportSlug: "windsurf", sportName: "Windsurfing", level: NEVER_TRIED }).noCount, "Be one of the first to register your interest.");
});

test("a count that is not a real, dated whole number is never shown", () => {
  const bad = [
    { count: 12 }, { count: 12, asOf: "" }, { count: 12, asOf: "17 Nov 2026" }, { count: 12, asOf: "2026-13-01" },
    { count: 12, asOf: "2026-02-30" }, { count: 12, asOf: "2026-11-17T10:00" }, { count: 12, asOf: 20261117 },
    { count: 12, asOf: "2026-11-19" },                                          // from the future
    { count: "12", asOf: "2026-11-17" }, { count: 12.5, asOf: "2026-11-17" }, { count: NaN, asOf: "2026-11-17" },
    { count: Infinity, asOf: "2026-11-17" }, { count: 2_000_000, asOf: "2026-11-17" }, null, "x", 12,
  ];
  for (const e of bad) assert.equal(countView({ windsurf: e }, "windsurf", NOW), null, JSON.stringify(e));
  for (const slug of ["__proto__", "toString", "constructor", "", undefined, 5]) assert.equal(countView({ windsurf: { count: 12, asOf: "2026-11-17" } }, slug, NOW), null, String(slug));
  assert.equal(countView({ windsurf: { count: 12, asOf: "2026-11-17" } }, "windsurf", undefined), null);
  assert.equal(countView("12", "windsurf", NOW), null);
});

test("a count dated today is accepted whatever the time zone", () => {
  assert.ok(countView({ windsurf: { count: 5, asOf: "2026-11-17" } }, "windsurf", Date.parse("2026-11-16T20:00:00Z")));
});

test("the count wording says registered, and never claims distinct people", () => {
  const c = entryCard({ sportSlug: "windsurf", sportName: "Windsurfing", level: NEVER_TRIED });
  assert.equal(c.registeredLabel, "registered");
  assert.equal(c.registeredText, "have registered interest in a beginner windsurfing session");
  for (const text of [c.registeredLabel, c.registeredText, c.countNote]) assert.doesNotMatch(text, /people|verified|members/i);
});
