import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SITE_APP_URL, OG_IMAGE_URL, OG_TITLE, OG_DESCRIPTION, SLOT_CHOICES,
  inviteFromQuery, inviteLink, inviteMessage, waShareUrl,
} from "../session-share.js";

test("the three times are AM, PM and both, in words", () => {
  assert.deepEqual(SLOT_CHOICES.map((s) => [s.key, s.label, s.words]),
    [["am", "AM", "morning"], ["pm", "PM", "afternoon"], ["both", "AM and PM", "morning and afternoon"]]);
});

test("a shared link opens on the day and time it names, and ignores anything else", () => {
  assert.deepEqual(inviteFromQuery("?day=2026-11-24&slot=am"), { day: "2026-11-24", slot: "am" });
  assert.deepEqual(inviteFromQuery("?day=2026-11-24&slot=both"), { day: "2026-11-24", slot: "both" });
  assert.deepEqual(inviteFromQuery("?day=2026-11-24"), { day: "2026-11-24", slot: null });
  assert.deepEqual(inviteFromQuery("?slot=pm"), { day: null, slot: "pm" });
  assert.deepEqual(inviteFromQuery(""), { day: null, slot: null });
  for (const bad of ["?day=2026-13-01", "?day=2026-02-30", "?day=24-11-2026", "?day=<script>", "?day=2026-11-24T10:00", "?day=", "?day=1&day=2"])
    assert.equal(inviteFromQuery(bad).day, null, bad);
  for (const bad of ["?slot=AM", "?slot=noon", "?slot=am%20pm", "?slot=<b>", "?slot=", "?slot=__proto__"])
    assert.equal(inviteFromQuery(bad).slot, null, bad);
});

test("the invite link carries the sport, place, day and time, and never the sender's level", () => {
  const u = new URL(inviteLink({ activity: "windsurf", spot: "east-coast-parkway-carpark-e5", day: "2026-11-24", slot: "am" }));
  assert.equal(u.origin + u.pathname, SITE_APP_URL.replace(/\/$/, "") + "/");
  assert.deepEqual([...u.searchParams.entries()], [["activity", "windsurf"], ["spot", "east-coast-parkway-carpark-e5"], ["tab", "plan"], ["day", "2026-11-24"], ["slot", "am"]]);
  assert.equal(u.searchParams.has("level"), false);
});

test("the invite link drops anything that is not a plain slug, date or slot", () => {
  const u = new URL(inviteLink({ activity: "Wind Surf!", spot: "../etc", day: "tomorrow", slot: "noon" }));
  assert.deepEqual([...u.searchParams.entries()], [["tab", "plan"]]);
  const v = new URL(inviteLink({ activity: "windsurf", spot: "x", day: "2026-11-24" }));
  assert.equal(v.searchParams.has("slot"), false);
});

test("a link made by inviteLink is read back by inviteFromQuery", () => {
  for (const slot of ["am", "pm", "both"]) {
    const u = new URL(inviteLink({ activity: "windsurf", spot: "x", day: "2026-11-27", slot }));
    assert.deepEqual(inviteFromQuery(u.search), { day: "2026-11-27", slot });
  }
});

const base = { sportName: "Windsurfing", sportSlug: "windsurf", spotName: "East Coast Parkway (Carpark E5)", dayShort: "Tue 24 Nov", link: "https://www.watersportskaki.sg/app/?x=1" };

test("the message for a morning, as agreed", () => {
  assert.equal(inviteMessage({ ...base, slot: "am" }),
    "Windsurfing at East Coast Parkway (Carpark E5), Tue 24 Nov, morning. Who's in? For people who can already windsurf. Check the latest forecast and tide before you go: https://www.watersportskaki.sg/app/?x=1");
});

test("thundery showers are mentioned only for the periods the invitation covers", () => {
  const t = { am: false, pm: true };
  assert.doesNotMatch(inviteMessage({ ...base, slot: "am", thundery: t }), /Thundery/);
  assert.match(inviteMessage({ ...base, slot: "pm", thundery: t }), /Windsurfing at East Coast Parkway \(Carpark E5\), Tue 24 Nov, afternoon\. Thundery showers are forecast for the afternoon\. Who's in\?/);
  assert.match(inviteMessage({ ...base, slot: "both", thundery: t }), /morning and afternoon\. Thundery showers are forecast for the afternoon\./);
  assert.match(inviteMessage({ ...base, slot: "both", thundery: { am: true, pm: true } }), /forecast for the morning and afternoon\./);
});

test("the message has no wind or tide numbers, no verdict and no advice beyond checking", () => {
  const m = inviteMessage({ ...base, slot: "both", thundery: { pm: true } });
  assert.doesNotMatch(m, /\bkn\b|km\/h|\bm\)|\d\.\d|rising|falling|gust/i);
  assert.doesNotMatch(m, /\bsafe\b|great|perfect|ideal|good conditions|recommend/i);
  assert.match(m, /Check the latest forecast and tide before you go/);
});

test("a sport with no agreed wording gets the general line, and never claims a skill it does not know", () => {
  const m = inviteMessage({ ...base, sportName: "Kayaking", sportSlug: "kayak", slot: "am" });
  assert.match(m, /For people who have done this before\./);
  assert.doesNotMatch(m, /can already/);
  for (const slug of ["__proto__", "toString", undefined]) assert.match(inviteMessage({ ...base, sportSlug: slug, slot: "am" }), /have done this before/);
});

test("the message refuses to be built from missing parts", () => {
  for (const missing of ["sportName", "spotName", "dayShort", "link"]) assert.equal(inviteMessage({ ...base, [missing]: "", slot: "am" }), null, missing);
  for (const slot of ["", "noon", undefined, "AM"]) assert.equal(inviteMessage({ ...base, slot }), null, String(slot));
});

test("the WhatsApp address opens a chat chooser with the message ready, encoded", () => {
  const m = inviteMessage({ ...base, slot: "am" });
  const url = waShareUrl(m);
  assert.ok(url.startsWith("https://wa.me/?text="));
  assert.equal(new URL(url).searchParams.get("text"), m);
  assert.ok(!url.includes(" "));
  assert.equal(new URL(waShareUrl("a & b?c=d")).searchParams.get("text"), "a & b?c=d");
});

test("the preview card text, the image address and the page's tags stay in step", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const tag = (prop) => new RegExp(`<meta property="${prop}" content="([^"]*)"`).exec(html)?.[1];
  assert.equal(tag("og:title"), OG_TITLE);
  assert.equal(tag("og:description"), OG_DESCRIPTION);
  assert.equal(tag("og:image"), OG_IMAGE_URL);
  assert.equal(tag("og:url"), SITE_APP_URL);
  assert.ok(OG_TITLE.length > 0 && OG_DESCRIPTION.length > 0 && OG_DESCRIPTION.length <= 200);
  assert.ok(OG_IMAGE_URL.startsWith("https://") && OG_IMAGE_URL.endsWith(".png"));
});
