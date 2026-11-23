import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const maker = read("og-maker.html");
const page = read("index.html");
const clean = (s) => s.replace(/<br>/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

test("both pictures say exactly what the app page's hero says", () => {
  const h1 = clean(/<h1>(.*?)<\/h1>/s.exec(page)[1]);
  const lede = clean(/<p class="lede">(.*?)<\/p>/s.exec(page)[1]);
  const h1s = [...maker.matchAll(/<h1>(.*?)<\/h1>/gs)].map((m) => clean(m[1]));
  const ledes = [...maker.matchAll(/<p class="lede">(.*?)<\/p>/gs)].map((m) => clean(m[1]));
  assert.deepEqual(h1s, [h1, h1]);
  assert.deepEqual(ledes, [lede, lede]);
  assert.equal(h1, "Learn watersports. Find your kakis.");
});

test("the hero uses the page's own markup, so its stylesheet gives the fonts, colours and underline", () => {
  assert.match(maker, /<link rel="stylesheet" href="styles\.css">/);
  assert.equal([...maker.matchAll(/<section class="hero">/g)].length, 2);
  assert.equal([...maker.matchAll(/<span class="handwrite">Find your kakis\.<\/span>/g)].length, 2);
  const fonts = /<link href="(https:\/\/fonts\.googleapis\.com[^"]+)" rel="stylesheet">/.exec(page)[1];
  assert.ok(maker.includes(`<link href="${fonts}" rel="stylesheet">`), "the same web fonts as the page");
});

test("the logo is your logo file and the name is the page's own header, with nothing drawn", () => {
  assert.equal([...maker.matchAll(/<header class="top"><img src="logo-emblem\.png" alt=""><div class="brand">WaterSports Kaki<\/div><\/header>/g)].length, 2);
  for (const bad of [/<svg/i, /<canvas/i, /<path/i, /linear-gradient|radial-gradient/i, /background-image/i, /url\(/i, /<img src="(?!logo-emblem\.png)/i]) {
    assert.doesNotMatch(maker, bad, String(bad));
  }
});

test("two pictures of the right shape, one light and one dark, each findable by its id", () => {
  assert.match(maker, /<div class="og" id="light" data-version="light">/);
  assert.match(maker, /<div class="og" id="dark" data-version="dark">/);
  assert.match(maker, /\.og\{[^}]*width:1200px;height:630px/);
  assert.equal([...maker.matchAll(/<div class="og"/g)].length, 2);                  // the pictures themselves, not the words that mention them
});

test("the dark picture takes its colours from the light one, not from new ones", () => {
  const script = /<script>([\s\S]*)<\/script>/.exec(maker)[1];
  assert.match(script, /stage\.style\.backgroundColor = navy/);               // your own heading colour
  assert.match(script, /getComputedStyle\(h1\)\.color/);
  assert.match(script, /getComputedStyle\(page\)|getComputedStyle\(document\.body\)/);   // the light picture uses the page's own background
  const hard = [...new Set([...script.matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((m) => m[0].toLowerCase()))].sort();
  assert.deepEqual(hard, ["#f5f8fd", "#fff"]);                                // white, and a fallback if the page's background is unreadable
});

test("it is a tool and a note says it is not published", () => {
  assert.match(maker, /<meta name="robots" content="noindex">/);
  assert.match(maker, /It is not copied to the live site\./);
});

test("a click on a picture selects the picture box, so Inspect finds the right element", () => {
  assert.match(maker, /\.og \*\{pointer-events:none\}/);
  assert.match(maker, /Right-click the picture itself/);
  assert.match(maker, /rename the file to <code>light\.png<\/code> or <code>dark\.png<\/code>/i);
});

test("the brand name is readable in both pictures: heading colour on the light one, white on the dark one", () => {
  const script = /<script>([\s\S]*)<\/script>/.exec(maker)[1];
  const light = /if \(stage\.dataset\.version === "light"\) \{([\s\S]*?)\} else \{/.exec(script)[1];
  const dark = /\} else \{([\s\S]*?)\n  \}\n\}/.exec(script)[1];
  assert.match(light, /\.brand"\)\.style\.color = navy/);           // your page's header is a dark bar with a white name
  assert.match(dark, /\.brand"\)\.style\.color = "#fff"/);
});
