#!/usr/bin/env node
/**
 * Builds a single, self-contained, offline index.html preview.
 *
 * No bundler is available (and none is wanted for the Phase 1 core). Instead:
 *   1. tsc compiles the whole app to ONE SystemJS-format file (tsc handles every
 *      import/export form correctly — we don't hand-roll a bundler).
 *   2. A ~40-line dependency-free System runtime (embedded below) loads it.
 *   3. We inline the runtime + bundle + CSS into one HTML file.
 *
 * The result opens with a double-click — no server, no network. The strict
 * typecheck remains the pure-ESM `tsc --noEmit`; this bundle is only the preview.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsc = resolve(root, "node_modules/typescript/bin/tsc");

// Minimal SystemJS-format runtime. Acyclic module graph (the app is layered),
// so a depth-first "ensure" that wires setters before execute is sufficient.
const SYSTEM_RUNTIME = `(function (global) {
  var registry = {};
  global.System = {
    register: function (name, deps, declare) {
      registry[name] = { name: name, deps: deps, declare: declare, exports: {}, started: false };
    }
  };
  function ensure(name) {
    var m = registry[name];
    if (!m) throw new Error("System module not found: " + name);
    if (m.started) return m;
    m.started = true;
    var setExport = function (a, b) {
      if (typeof a === "string") { m.exports[a] = b; }
      else { for (var k in a) m.exports[k] = a[k]; }
      return b;
    };
    var decl = m.declare(setExport, { id: name });
    var setters = decl.setters || [];
    for (var i = 0; i < m.deps.length; i++) {
      var dep = ensure(m.deps[i]);
      if (setters[i]) setters[i](dep.exports);
    }
    (decl.execute || function () {})();
    return m;
  }
  global.__systemImport = function (name) { return ensure(name).exports; };
})(typeof globalThis !== "undefined" ? globalThis : this);`;

const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

console.log("• Compiling System bundle (tsconfig.build.json)…");
run(`node ${JSON.stringify(tsc)} -p tsconfig.build.json`);

const bundle = readFileSync(resolve(root, "dist/app.system.js"), "utf8");
const css = readFileSync(resolve(root, "src/ui/styles.css"), "utf8");

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="dark light" />
  <title>Life OS — Today</title>
  <style>
${css}
  </style>
</head>
<body>
  <div id="app"></div>
  <script>${SYSTEM_RUNTIME}</script>
  <script>${bundle}</script>
  <script>
    try { __systemImport("ui/main"); }
    catch (e) { document.getElementById("app").textContent = "Failed to start: " + e.message; }
  </script>
</body>
</html>
`;

mkdirSync(resolve(root, "dist"), { recursive: true });
const out = resolve(root, "dist/index.html");
writeFileSync(out, html, "utf8");
const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`✓ Wrote ${out} (${kb} KB, self-contained, offline)`);
