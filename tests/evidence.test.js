// Site Evidence Record (ADR-001, action item 1): the contract, the sample dossier,
// and how evidence folds into the Scenario's provenance.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { validate } = require("./schema-lite");

const ROOT = path.join(__dirname, "..");
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, "contracts/site-evidence-record.schema.json"), "utf8"));

// Loads the scripts in index.html order, model -> evidence -> engine.
function load() {
  const sandbox = { window: {}, console };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  for (const f of ["js/model.js", "js/evidence.js", "js/engine.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
  }
  return sandbox.window.HACD;
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const H = load();

// A complete, reviewed, on-site record that is allowed to fill an input.
function goodRecord(over = {}) {
  return Object.assign({
    id: "ev-test-survey",
    source_type: "survey",
    source_ref: { title: "Boundary survey", locator: "sheet 1" },
    captured_at: "2026-04-10T15:00:00Z",
    crs: "EPSG:4326",
    location: { lat: 27.8621, lon: -97.3184 },
    accuracy: { kind: "measured", horizontal_m: 0.05, note: "RTK GNSS" },
    licence: "Owner's survey; internal use",
    chain_of_custody: [{ at: "2026-04-10T15:00:00Z", actor: "Surveyor", action: "captured" }],
    confidence: "high",
    review: { state: "reviewed", reviewer: "Geospatial lead", reviewed_at: "2026-04-12T10:00:00Z" },
    revalidate_by: "2027-04-10",
    permitted_uses: ["context", "scenario_input"],
    facts: [{ path: "site.lat", value: 27.8621, unit: "deg" }, { path: "site.lon", value: -97.3184, unit: "deg" }]
  }, over);
}

const statusOf = (findings, rec, p) => plain(findings.filter((f) => f.record === rec && f.path === p).map((f) => f.status));

// ---- the contract ------------------------------------------------------

test("every sample record satisfies the Site Evidence Record schema", () => {
  assert.ok(H.SITE_EVIDENCE.length >= 1);
  for (const rec of H.SITE_EVIDENCE) assert.deepEqual(validate(SCHEMA, plain(rec)), [], rec.id);
});

test("the schema rejects records that break the contract", () => {
  const cases = {
    "missing licence": (r) => { delete r.licence; },
    "bad crs": (r) => { r.crs = "WGS84"; },
    "bad id": (r) => { r.id = "Survey 1"; },
    "reviewed without a reviewer": (r) => { r.review.reviewer = null; },
    "unknown source type": (r) => { r.source_type = "rumour"; },
    "no permitted use": (r) => { r.permitted_uses = []; },
    "fact with no unit field": (r) => { delete r.facts[0].unit; },
    "private link in a public repo field": (r) => { r.source_ref.uri = "file:///C:/survey.pdf"; },
    "extra field": (r) => { r.colour = "blue"; },
    "date in the wrong shape": (r) => { r.captured_at = "April 10"; }
  };
  assert.deepEqual(validate(SCHEMA, goodRecord()), []);
  for (const [name, mutate] of Object.entries(cases)) {
    const r = plain(goodRecord());
    mutate(r);
    assert.notDeepEqual(validate(SCHEMA, r), [], name);
  }
});

test("the console's required fields are the schema's required fields", () => {
  assert.deepEqual([...H.EVIDENCE_REQUIRED].sort(), [...SCHEMA.required].sort());
});

test("the console's own check flags each missing required field", () => {
  assert.deepEqual(plain(H.validateEvidence(goodRecord())), []);
  for (const k of H.EVIDENCE_REQUIRED) {
    const r = plain(goodRecord());
    delete r[k];
    assert.ok(H.validateEvidence(r).includes("missing " + k), k);
  }
});

// ---- folding evidence into provenance -----------------------------------

test("applying evidence changes neither the Scenario nor the declared provenance", () => {
  const demo = plain(H.DEMO), prov = plain(H.DEMO_PROV);
  const a = H.applyEvidence(H.DEMO, H.DEMO_PROV, H.SITE_EVIDENCE);
  const b = H.applyEvidence(H.DEMO, H.DEMO_PROV, H.SITE_EVIDENCE);
  assert.deepEqual(plain(H.DEMO), demo);
  assert.deepEqual(plain(H.DEMO_PROV), prov);
  assert.deepEqual(plain(a), plain(b), "same dossier, same answer");
});

test("evidence never overwrites a declared basis or source", () => {
  for (const [p, decl] of Object.entries(H.DEMO_PROV)) {
    assert.equal(H.PROV[p].basis, decl.basis, p);
    assert.equal(H.PROV[p].source, decl.source, p);
  }
});

test("evidence does not move any number the engine computes", () => {
  for (const b of H.BRANCHES) {
    const s = b.apply(H.clone(H.DEMO));
    const without = H.evaluate(s, H.DEMO_PROV), withEv = H.evaluate(s, H.PROV);
    for (const k of ["d", "checks", "score", "verdict", "cost", "schedule", "carbon", "risk", "runId"]) {
      assert.deepEqual(plain(withEv[k]), plain(without[k]), `${b.id}.${k}`);
    }
  }
});

test("a complete, reviewed, on-site record sources an input that had none", () => {
  const { prov, findings } = H.applyEvidence(H.DEMO, H.DEMO_PROV, [goodRecord()]);
  assert.equal(H.DEMO_PROV["site.lat"], undefined);
  assert.equal(prov["site.lat"].basis, "given");
  assert.match(prov["site.lat"].source, /Boundary survey · sheet 1 \[ev-test-survey\]/);
  assert.equal(prov["site.lat"].evidence[0].id, "ev-test-survey");
  assert.equal(prov["site.lat"].review, "reviewed");
  assert.deepEqual(statusOf(findings, "ev-test-survey", "site.lon"), ["sources"]);
});

test("evidence that is not fit to source an input only gives context", () => {
  const cases = {
    "a model output": goodRecord({ source_type: "model_output" }),
    "context-only permission": goodRecord({ permitted_uses: ["context"] }),
    "incomplete metadata": (() => { const r = plain(goodRecord()); delete r.licence; return r; })(),
    "a point 270 km away": goodRecord({ location: { lat: 30.26, lon: -97.79 }, facts: [{ path: "site.acres", value: 280, unit: "ac" }, { path: "space.staff_per_100mw", value: 45, unit: null }] })
  };
  for (const [name, rec] of Object.entries(cases)) {
    const { prov, findings } = H.applyEvidence(H.DEMO, H.DEMO_PROV, [rec]);
    const p = rec.facts[rec.facts.length - 1].path;
    assert.equal(prov[p], undefined, name);
    assert.deepEqual(statusOf(findings, rec.id, p), ["context_only"], name);
  }
});

test("a rejected record is ignored and an expired one only checks when asked", () => {
  const rejected = goodRecord({ review: { state: "rejected", reviewer: "Geospatial lead", reviewed_at: "2026-05-01T00:00:00Z" } });
  const r1 = H.applyEvidence(H.DEMO, H.DEMO_PROV, [rejected]);
  assert.equal(r1.prov["site.lat"], undefined);
  assert.deepEqual(plain(r1.findings.map((f) => f.status)), ["rejected"]);

  const stale = goodRecord({ revalidate_by: "2026-06-01" });
  assert.equal(H.applyEvidence(H.DEMO, H.DEMO_PROV, [stale]).prov["site.lat"].basis, "given", "no clock read without asOf");
  const r2 = H.applyEvidence(H.DEMO, H.DEMO_PROV, [stale], { asOf: "2026-11-22" });
  assert.equal(r2.prov["site.lat"], undefined);
  assert.ok(r2.findings.some((f) => f.status === "expired"));
});

test("values match only to the precision the evidence states", () => {
  assert.equal(H.evidenceMatches(1.2201, 1.22), true);
  assert.equal(H.evidenceMatches(1.226, 1.22), false);
  assert.equal(H.evidenceMatches(2.1, 2.1), true);
  assert.equal(H.evidenceMatches(27.8621, 30.26), false);
  assert.equal(H.evidenceMatches("N+1", "N+1"), true);
  assert.equal(H.evidenceMatches(true, "yes"), false);
});

// ---- what the sample dossier says about the demo campus ---------------

test("the sample dossier points about 270 km from the Scenario's site", () => {
  const mism = H.EVIDENCE_FINDINGS.filter((f) => f.status === "location_mismatch");
  assert.equal(mism.length, H.SITE_EVIDENCE.length);
  const km = H.distanceKm({ lat: 30.26, lon: -97.79 }, H.DEMO.site);
  assert.ok(km > 260 && km < 280, String(km));
});

test("the sample dossier cannot fill the missing coordinates; it contradicts them", () => {
  for (const p of ["site.lat", "site.lon"]) {
    assert.equal(H.PROV[p], undefined, p);
    assert.deepEqual(statusOf(H.EVIDENCE_FINDINGS, "ev-cb-workbook-inputs", p), ["conflict"], p);
  }
});

test("the sample dossier sources nothing, corroborates the brief, and flags the conflicts", () => {
  const F = H.EVIDENCE_FINDINGS;
  assert.equal(F.filter((f) => f.status === "sources").length, 0);
  for (const p of ["site.acres", "demand.target_mw", "power.poi_available_mw", "cooling.pue", "water.available_mgy"]) {
    assert.deepEqual(statusOf(F, "ev-cb-workbook-inputs", p), ["corroborates"], p);
    assert.equal(H.PROV[p].evidence[0].status, "corroborates", p);
  }
  for (const p of ["demand.rack_kw", "cooling.wue", "time.phases"]) {
    assert.deepEqual(statusOf(F, "ev-cb-workbook-outputs", p), ["conflict"], p);
  }
  assert.equal(H.PROV["demand.rack_kw"].evidence[0].value, 120);
  for (const p of ["space.staff_per_100mw", "space.parking_per_100_staff", "identity.currency"]) {
    assert.deepEqual(statusOf(F, "ev-cb-workbook-outputs", p), ["context_only"], p);
  }
  assert.deepEqual(statusOf(F, "ev-cb-usgs-3dep-elevation", "site.elevation_ft"), ["not_in_scenario"]);
});

test("the workbook's water figure sits outside the declared tolerance band", () => {
  const [lo, hi] = H.DEMO_PROV["cooling.wue"].tol;
  const wue = H.SITE_EVIDENCE.find((r) => r.id === "ev-cb-workbook-outputs").facts.find((f) => f.path === "cooling.wue").value;
  assert.ok(wue < lo || wue > hi, `${wue} vs ${lo}-${hi}`);
});

test("the sample cites the private workbook by name and links only public sources", () => {
  for (const rec of H.SITE_EVIDENCE) {
    const uri = rec.source_ref.uri;
    if (uri) assert.match(uri, /^https:\/\/(apps\.nationalmap\.gov|ecos\.fws\.gov)\//, rec.id);
    assert.doesNotMatch(JSON.stringify(rec), /drive\.google|docs\.google|@/, rec.id);
  }
});
