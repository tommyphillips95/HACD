// Rule 2: no number without provenance. Every figure the engine computes names the
// inputs and the method that produced it, and every input traces to a document or
// a declared assumption.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadHACD, scenarios } = require("./load.js");

const H = loadHACD({ fixedClock: true });

// Inputs the demo pack carries with no entry in DEMO_PROV today. The strict tests
// below fail if any other input loses its source; the TODO test at the end fails
// until this list is empty. Remove a path here once it gets a DEMO_PROV entry.
const KNOWN_UNSOURCED = [
  "identity.currency",
  "site.lat",
  "site.lon",
  "space.parking_per_100_staff",
  "space.staff_per_100mw",
  "time.phases",
  "time.start_quarter",
];

function leaves(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? leaves(v, prefix + k + ".") : [prefix + k]);
}

const methods = new Set(Object.values(H.METHOD));

test("every given input cites a source", () => {
  for (const [path, p] of Object.entries(H.DEMO_PROV)) {
    assert.ok(["given", "assumed"].includes(p.basis), `${path}: basis ${p.basis}`);
    assert.equal(typeof p.source, "string", path);
    assert.ok(p.source.trim().length > 0, path);
    assert.notEqual(H.get(H.DEMO, path), undefined, `${path} is in DEMO_PROV but not in the pack`);
  }
});

test("every assumption declares a tolerance, an owner and a reason (rule 3)", () => {
  for (const [path, p] of Object.entries(H.DEMO_PROV)) {
    if (p.basis !== "assumed") continue;
    assert.ok(Array.isArray(p.tol) && p.tol.length === 2, `${path}: tol`);
    assert.ok(p.tol[0] <= p.tol[1], `${path}: tol is reversed`);
    const v = H.get(H.DEMO, path);
    assert.ok(v >= p.tol[0] && v <= p.tol[1], `${path}: nominal ${v} outside its tolerance`);
    assert.ok(p.why && p.why.length > 0, `${path}: why`);
    assert.match(p.source, /^owner:/, `${path}: owner`);
  }
});

test("no input loses its source beyond the known list", () => {
  const missing = leaves(H.DEMO).filter((p) => !H.DEMO_PROV[p]);
  assert.deepEqual(missing.filter((p) => !KNOWN_UNSOURCED.includes(p)), []);
});

for (const { id, scenario } of scenarios(H)) {
  const f = H.evaluate(H.clone(scenario), H.clone(H.DEMO_PROV));
  const resolvable = new Set([...Object.keys(H.DEMO_PROV), ...Object.keys(f.d), ...KNOWN_UNSOURCED]);

  test(`${id}: every derived figure names its unit, method and inputs`, () => {
    assert.ok(Object.keys(f.d).length > 0);
    for (const [key, q] of Object.entries(f.d)) {
      assert.equal(q.basis, "derived", key);
      assert.ok(Number.isFinite(q.value), `${key}: value ${q.value}`);
      assert.ok(q.unit, `${key}: unit`);
      assert.ok(methods.has(q.method), `${key}: method ${q.method}`);
      assert.equal(q.source, q.method, key);
      assert.ok(Array.isArray(q.inputs) && q.inputs.length > 0, `${key}: inputs`);
      for (const inp of q.inputs) assert.ok(resolvable.has(inp), `${key} cites unknown input ${inp}`);
      assert.ok(!q.inputs.includes(key), `${key} cites itself`);
    }
  });

  test(`${id}: every check cites figures that exist`, () => {
    assert.ok(f.checks.length > 0);
    for (const c of f.checks) {
      assert.ok(["pass", "warn", "fail"].includes(c.status), c.id);
      assert.ok(c.refs.length > 0, `${c.id}: refs`);
      for (const r of c.refs) assert.ok(resolvable.has(r), `${c.id} cites unknown ${r}`);
    }
  });

  test(`${id}: every cost line prices from a sourced rate book entry`, () => {
    assert.equal(f.cost.rate_book, H.RATE_BOOK.id);
    assert.equal(f.cost.rate_source, H.RATE_BOOK.source);
    assert.equal(f.cost.method, H.METHOD.cost);
    for (const l of f.cost.lines) {
      assert.ok(l.rateKey in H.RATE_BOOK, `${l.label}: rate ${l.rateKey}`);
      assert.equal(l.rate, H.RATE_BOOK[l.rateKey], l.label);
      assert.ok(Math.abs(l.amount - l.qty * l.rate) < 1e-6, l.label);
    }
    const direct = f.cost.lines.reduce((a, l) => a + l.amount, 0);
    assert.ok(Math.abs(f.cost.direct - direct) < 1e-3);
    const sum = f.cost.direct + f.cost.soft + f.cost.escalation + f.cost.contingency;
    assert.ok(Math.abs(f.cost.total - sum) / f.cost.total < 1e-9, "total is the sum of its parts");
  });

  test(`${id}: schedule, carbon and risk name their method and inputs`, () => {
    assert.equal(f.schedule.method, H.METHOD.sched);
    assert.equal(f.carbon.method, H.METHOD.carbon);
    assert.equal(f.risk.method, H.METHOD.risk);
    assert.equal(f.carbon.source, H.CARBON.source);
    for (const inp of [...f.schedule.inputs, ...f.carbon.inputs]) assert.ok(resolvable.has(inp), inp);
    for (const d of f.risk.drivers) assert.equal(H.DEMO_PROV[d.path].basis, "assumed", d.path);
  });

  test(`${id}: the assumption register lists every assumption with its tolerance`, () => {
    const assumed = Object.keys(H.DEMO_PROV).filter((p) => H.DEMO_PROV[p].basis === "assumed");
    assert.deepEqual(Array.from(f.assumptions, (a) => a.path), assumed);
    for (const a of f.assumptions) assert.ok(a.tol && a.why && a.owner, a.path);
  });
}

// ---- known gaps: these run and report as TODO until they are fixed ----

test("every input in the demo pack has provenance", {
  todo: "inputs with no DEMO_PROV entry: " + KNOWN_UNSOURCED.join(", "),
}, () => {
  assert.deepEqual(leaves(H.DEMO).filter((p) => !H.DEMO_PROV[p]), []);
});

test("schedule.inputs lists every input the schedule reads", {
  todo: "the schedule reads time.start_quarter but does not cite it",
}, () => {
  const f = H.evaluate(H.clone(H.DEMO), H.clone(H.DEMO_PROV));
  assert.ok(f.schedule.inputs.includes("time.start_quarter"));
});

test("a branch's own values survive the Monte Carlo", {
  todo: "the Monte Carlo re-samples every assumed path, so Accelerated's +1.6% escalation and Constrained's 1.31 PUE are overwritten in P10–P90",
}, () => {
  for (const { id, scenario } of scenarios(H)) {
    const f = H.evaluate(scenario, H.clone(H.DEMO_PROV));
    assert.ok(f.cost.total >= f.risk.p10 && f.cost.total <= f.risk.p90,
      `${id}: point estimate ${Math.round(f.cost.total)} outside P10–P90`);
  }
  const c = H.BRANCHES.find((b) => b.id === "constrained").apply(H.clone(H.DEMO));
  const [lo, hi] = H.DEMO_PROV["cooling.pue"].tol;
  assert.ok(c.cooling.pue >= lo && c.cooling.pue <= hi, `constrained PUE ${c.cooling.pue} outside the sampled band`);
});
