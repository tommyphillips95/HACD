// Rule 4: math is a function. Identical inputs give an identical run id and an
// identical answer, Monte Carlo included, however many times and wherever it runs.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadHACD, scenarios } = require("./load.js");

const H = loadHACD({ fixedClock: true });

// JSON round-trip drops functions and keeps exactly what an export would carry.
const snapshot = (feas) => JSON.parse(JSON.stringify(feas));

for (const { id, scenario } of scenarios(H)) {
  test(`${id}: identical inputs give an identical run id and output`, () => {
    const a = H.evaluate(H.clone(scenario), H.clone(H.DEMO_PROV));
    const b = H.evaluate(H.clone(scenario), H.clone(H.DEMO_PROV));
    assert.match(a.runId, /^[0-9a-f]{8}$/);
    assert.equal(a.runId, b.runId);
    assert.deepEqual(snapshot(a), snapshot(b));
  });

  test(`${id}: a fresh load of the scripts reproduces the run`, () => {
    const H2 = loadHACD({ fixedClock: true });
    const a = H.evaluate(H.clone(scenario), H.clone(H.DEMO_PROV));
    const b = H2.evaluate(H2.clone(scenario), H2.clone(H2.DEMO_PROV));
    assert.equal(a.runId, b.runId);
    assert.deepEqual(snapshot(a), snapshot(b));
  });

  test(`${id}: Monte Carlo is seeded and its percentiles are ordered`, () => {
    const { risk } = H.evaluate(H.clone(scenario), H.clone(H.DEMO_PROV));
    assert.equal(risk.seed, "0x48414344");
    assert.ok(risk.iterations >= 1000);
    assert.ok(risk.p10 <= risk.p50 && risk.p50 <= risk.p80 && risk.p80 <= risk.p90);
    for (const k of ["p10", "p50", "p80", "p90"]) assert.ok(Number.isFinite(risk[k]) && risk[k] > 0, k);
  });

  test(`${id}: evaluate does not mutate its inputs`, () => {
    const s = H.clone(scenario);
    const prov = H.clone(H.DEMO_PROV);
    const before = JSON.stringify([s, prov]);
    H.evaluate(s, prov);
    assert.equal(JSON.stringify([s, prov]), before);
  });

  test(`${id}: the sheet set renders byte-identical for identical inputs`, () => {
    const a = H.evaluate(H.clone(scenario), H.clone(H.DEMO_PROV));
    const b = H.evaluate(H.clone(scenario), H.clone(H.DEMO_PROV));
    H.SHEETS.forEach((_, i) => assert.equal(H.drawSheet(i, a), H.drawSheet(i, b), `sheet ${i}`));
  });

  test(`${id}: every sheet says it is schematic (rule 5)`, () => {
    const f = H.evaluate(H.clone(scenario), H.clone(H.DEMO_PROV));
    H.SHEETS.forEach((sh, i) => assert.match(H.drawSheet(i, f), /NOT FOR CONSTRUCTION — NOT SEALED/, `sheet ${i}`));
  });
}

test("the three branches are distinct runs", () => {
  const ids = scenarios(H).map(({ scenario }) => H.evaluate(scenario, H.clone(H.DEMO_PROV)).runId);
  assert.equal(new Set(ids).size, ids.length);
});

test("changing any one input changes the run id", () => {
  const base = H.evaluate(H.clone(H.DEMO), H.clone(H.DEMO_PROV)).runId;
  for (const path of Object.keys(H.DEMO_PROV)) {
    const s = H.clone(H.DEMO);
    const v = H.get(s, path);
    H.set(s, path, typeof v === "number" ? v + 1 : typeof v === "boolean" ? !v : v + "x");
    assert.notEqual(H.evaluate(s, H.clone(H.DEMO_PROV)).runId, base, path);
  }
});

test("the seeded PRNG replays its sequence", () => {
  const a = H.rng(42), b = H.rng(42);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

// ---- known gaps: these run and report as TODO until the engine is fixed ----

test("the run id covers the assumption register, not only the Scenario", {
  todo: "runId hashes the Scenario alone, so a changed tolerance gives a different P80 under the same run id",
}, () => {
  const a = H.evaluate(H.clone(H.DEMO), H.clone(H.DEMO_PROV));
  const prov = H.clone(H.DEMO_PROV);
  prov["commercial.escalation_pct"].tol = [4.0, 4.4];
  const b = H.evaluate(H.clone(H.DEMO), prov);
  assert.notEqual(a.risk.p80, b.risk.p80);
  assert.notEqual(a.runId, b.runId);
});

test("the sheets carry no wall-clock date", {
  todo: "the title block stamps today's date, so identical inputs give a different sheet on a different day",
}, () => {
  const f1 = H.evaluate(H.clone(H.DEMO), H.clone(H.DEMO_PROV));
  const live = loadHACD(); // real clock
  const f2 = live.evaluate(live.clone(live.DEMO), live.clone(live.DEMO_PROV));
  assert.equal(live.drawSheet(0, f2), H.drawSheet(0, f1));
});
