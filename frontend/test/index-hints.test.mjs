import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const dir = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", dir), "utf8");

// Every module the page loads, found by following the imports from app.js.
function moduleGraph(entry) {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(new URL(file, dir), "utf8");
    for (const m of src.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)) walk(m[1]);
  };
  walk(entry);
  return seen;
}

test("every module the page loads is preloaded, so the browser fetches them together and not one after another", () => {
  const preloaded = new Set([...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]));
  const needed = moduleGraph("app.js");
  assert.ok(needed.size >= 8, `found ${[...needed]}`);
  for (const file of needed) assert.ok(preloaded.has(file), `${file} is not preloaded`);
});

test("nothing is preloaded that the page does not use, or that does not exist", () => {
  const needed = moduleGraph("app.js");
  for (const m of html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)) {
    assert.ok(needed.has(m[1]), `${m[1]} is preloaded but not imported`);
    assert.ok(existsSync(new URL(m[1], dir)), `${m[1]} does not exist`);
  }
});

test("each file is preloaded once, with the same address the page imports it by", () => {
  const hrefs = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.ok(hrefs.every((h) => /^[a-z-]+\.js$/.test(h)), "a relative address, like the page's own script tag");
  assert.match(html, /<script type="module" src="app\.js"><\/script>/);
});

test("the browser connects to the API early, in the way fetch will use it", () => {
  const m = /<link rel="preconnect" href="(https:\/\/api\.[^"]+)"( crossorigin)?>/.exec(html);
  assert.ok(m, "a preconnect to the API");
  assert.ok(m[2], "crossorigin, because the page reads the API with CORS");
  const config = readFileSync(new URL("config.js", dir), "utf8");
  assert.ok(config.includes(m[1]), "it names the same address as config.js");
});

test("the hints go in the head", () => {
  const head = html.slice(0, html.indexOf("</head>"));
  assert.equal([...head.matchAll(/rel="modulepreload"/g)].length, [...html.matchAll(/rel="modulepreload"/g)].length);
  assert.match(head, /rel="preconnect" href="https:\/\/api\./);
});
