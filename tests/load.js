// Loads the browser scripts into an isolated context, the way index.html does,
// so the tests exercise the shipped files with no build step and no dependencies.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const FILES = ["js/model.js", "js/engine.js", "js/sheets.js", "js/walk-model.js"];

// A frozen clock, so anything that stamps a date renders the same on every run.
const FIXED_NOW = Date.parse("2026-01-01T00:00:00Z");
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [FIXED_NOW])); }
  static now() { return FIXED_NOW; }
}

function loadHACD(opts = {}) {
  const sandbox = { window: {}, console };
  if (opts.fixedClock) sandbox.Date = FixedDate;
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  for (const f of FILES) {
    const code = fs.readFileSync(path.join(ROOT, f), "utf8");
    vm.runInContext(code, sandbox, { filename: f });
  }
  return sandbox.window.HACD;
}

// Every scenario a person can reach in the console: the demo pack under each branch.
function scenarios(H) {
  return H.BRANCHES.map((b) => ({ id: b.id, scenario: b.apply(H.clone(H.DEMO)) }));
}

module.exports = { loadHACD, scenarios, ROOT };
