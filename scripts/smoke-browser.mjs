/**
 * Browser smoke test for the built dist/index.html. Unit tests render into a fake
 * DOM and therefore cannot catch real layout/CSS failures (e.g. a shell class not
 * being applied). This loads the actual bundle in Chromium, seeds example data,
 * visits every route, and asserts: no console/page errors, the sidebar is a left
 * column that does not overlap the content, and each page renders cards + text.
 *
 * Run:  node scripts/smoke-browser.mjs
 * Requires Playwright's Chromium (already provisioned in this environment).
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Resolve Playwright the normal way (a devDependency). After `npm install`, run
// `npx playwright install chromium` once so a browser is available. An explicit
// binary can be forced with the CHROMIUM_PATH env var if needed.
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const EXE = process.env.CHROMIUM_PATH || undefined;
const root = resolve(new URL("..", import.meta.url).pathname);
const file = resolve(root, "dist/index.html");
if (!existsSync(file)) {
  console.error("dist/index.html not found — run `npm run build:preview` first.");
  process.exit(1);
}
const url = "file://" + file;
const ROUTES = ["today", "fitness", "diet", "sleep", "routines", "reading", "goals", "tasks", "projects", "journal", "settings"];

const fail = (msg) => {
  console.error("SMOKE FAIL: " + msg);
  process.exitCode = 1;
};

const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
p.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await p.goto(url, { waitUntil: "load" });
await p.waitForTimeout(200);

const shell = await p.evaluate(() => {
  const r = (s) => document.querySelector(s).getBoundingClientRect();
  return { sb: r(".sidebar"), mc: r(".maincol"), app: getComputedStyle(document.querySelector("#app")).display };
});
if (shell.app !== "grid") fail(`#app display is "${shell.app}", expected "grid"`);
if (!(shell.sb.x === 0 && shell.sb.width <= 260)) fail("sidebar is not a fixed-width left column");
if (!(shell.mc.x >= 230)) fail("main column does not sit beside the sidebar");

await p.click('[data-action="seed-example"]');
await p.waitForTimeout(300);

for (const route of ROUTES) {
  await p.click(`.nav-item[data-route="${route}"]`);
  await p.waitForTimeout(150);
  const info = await p.evaluate(() => {
    const content = document.querySelector(".content");
    const sb = document.querySelector(".sidebar").getBoundingClientRect();
    const cr = content.getBoundingClientRect();
    return {
      cards: document.querySelectorAll(".card").length,
      textLen: (content.textContent || "").trim().length,
      overlap: sb.right > cr.x + 5,
    };
  });
  if (info.cards === 0) fail(`${route}: no cards rendered`);
  if (info.textLen < 50) fail(`${route}: content text too short (${info.textLen})`);
  if (info.overlap) fail(`${route}: sidebar overlaps content`);
  console.log(`  ${route.padEnd(9)} cards=${info.cards} textLen=${info.textLen} overlap=${info.overlap}`);
}

if (errors.length > 0) {
  for (const e of errors) console.error("  runtime error: " + e);
  fail(`${errors.length} console/page error(s)`);
}

await b.close();
if (process.exitCode) console.error("\nSMOKE: FAILED");
else console.log(`\nSMOKE OK — ${ROUTES.length} routes, 0 errors, layout verified.`);
