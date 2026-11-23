// The walkthrough is a drawing too: every rack, UPS module, genset and
// transformer in it has to trace back to the run it was built from, and a
// person has to be able to walk from the front door to every room it names.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadHACD, scenarios } = require("./load.js");

const H = loadHACD({ fixedClock: true });
const run = (s) => H.evaluate(H.clone(s), H.clone(H.DEMO_PROV));
const build = (s) => H.WALK.build(run(s));
const snapshot = (x) => JSON.parse(JSON.stringify(x));
const get = (obj, p) => p.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const C = (k) => H.WALK.CONVENTIONS[k].value;

const RADIUS = 0.32;   // the player's collision radius in js/walk.js
const EPS = 1e-6;

function overlap(a, b) {
  return a.x - a.w / 2 < b.x + b.w / 2 - EPS && b.x - b.w / 2 < a.x + a.w / 2 - EPS &&
         a.z - a.d / 2 < b.z + b.d / 2 - EPS && b.z - b.d / 2 < a.z + a.d / 2 - EPS &&
         a.y - a.h / 2 < b.y + b.h / 2 - EPS && b.y - b.h / 2 < a.y + a.h / 2 - EPS;
}

for (const { id, scenario } of scenarios(H)) {
  const feas = run(scenario);
  const m = H.WALK.build(feas);
  const n = (kind) => m.boxes.filter((b) => b.kind === kind).length;

  test(`${id}: one building per hall the engine sized, tagged with the run`, () => {
    assert.equal(m.runId, feas.runId);
    assert.equal(m.method, "walk/v1");
    assert.equal(m.units, "m");
    assert.equal(m.counts.halls.value, feas.d["space.hall_count"].value);
    assert.equal(n("roof"), feas.d["space.hall_count"].value);
  });

  test(`${id}: rack count is IT load over rack density, as A-101 draws it`, () => {
    const want = Math.round(scenario.demand.target_mw * 1000 / scenario.demand.rack_kw);
    assert.equal(m.counts.racks.value, want);
    assert.equal(n("rack"), want);
    const perRoom = m.zones.filter((z) => z.kind === "data_hall").reduce((a, z) => a + z.racks, 0);
    assert.equal(perRoom, want);
  });

  test(`${id}: substation transformers match the engine's transformer count`, () => {
    assert.equal(m.counts.mv_xfmr.value, feas.d["power.xfmr_count"].value);
    assert.equal(n("mv_xfmr"), feas.d["power.xfmr_count"].value);
  });

  test(`${id}: every electrical room carries enough UPS to serve its data hall`, () => {
    const rooms = m.counts.rooms.value;
    const mwPerRoom = scenario.demand.target_mw / rooms;
    const working = Math.ceil(mwPerRoom / C("ups_module_mw"));
    const per = m.counts.ups.value / rooms;
    assert.equal(per, Math.round(per));
    const extra = scenario.power.redundancy === "2N" ? working : 1;
    assert.equal(per, working + extra);
    assert.equal(n("ups"), m.counts.ups.value);
    assert.equal(n("battery"), m.counts.batteries.value);
    assert.equal(m.counts.batteries.value, m.counts.ups.value * C("battery_per_ups"));
    assert.equal(n("swgr"), m.counts.switchgear.value);
    assert.equal(n("mv_gear"), m.counts.mv_switchgear.value);
  });

  test(`${id}: gensets cover facility load with redundancy`, () => {
    const facility = feas.d["power.facility_mw"].value;
    assert.ok(m.counts.generators.value * C("gen_mw") >= facility, "gensets cover facility MW");
    assert.equal(n("genset"), m.counts.generators.value);
  });

  test(`${id}: each count names its inputs and method, and the inputs exist`, () => {
    for (const [k, c] of Object.entries(m.counts)) {
      assert.equal(c.method, "walk/v1", k);
      assert.equal(c.basis, "derived", k);
      assert.ok(Number.isFinite(c.value) && c.value >= 0, k);
      assert.ok(Array.isArray(c.inputs) && c.inputs.length, k);
      for (const p of c.inputs) assert.ok(get(scenario, p) !== undefined || feas.d[p] !== undefined || H.WALK.CONVENTIONS[p], `${k}: ${p}`);
    }
  });

  test(`${id}: racks sit inside their data hall and never overlap`, () => {
    const halls = new Map(m.zones.filter((z) => z.kind === "data_hall").map((z) => [z.id, z]));
    const byRoom = new Map();
    for (const r of m.boxes.filter((b) => b.kind === "rack")) {
      const z = halls.get(r.room);
      assert.ok(z, `rack in unknown room ${r.room}`);
      assert.ok(r.x - r.w / 2 >= z.x0 + 0.5 && r.x + r.w / 2 <= z.x1 - 0.5, `${r.room} rack off the room in x`);
      assert.ok(r.z - r.d / 2 >= z.z0 + 0.5 && r.z + r.d / 2 <= z.z1 - 0.5, `${r.room} rack off the room in z`);
      if (!byRoom.has(r.room)) byRoom.set(r.room, []);
      byRoom.get(r.room).push(r);
    }
    const columns = m.boxes.filter((b) => b.kind === "column");
    for (const [room, racks] of byRoom) {
      for (let i = 0; i < racks.length; i++) {
        for (let j = i + 1; j < racks.length; j++) assert.ok(!overlap(racks[i], racks[j]), `${room}: racks ${i} and ${j} overlap`);
      }
      const z = halls.get(room);
      for (const c of columns.filter((c) => c.x > z.x0 && c.x < z.x1 && c.z > z.z0 && c.z < z.z1)) {
        for (const r of racks) assert.ok(!overlap(r, c), `${room}: a column runs through a rack`);
      }
    }
  });

  test(`${id}: electrical lineups keep working clearance`, () => {
    for (const z of m.zones.filter((z) => z.kind === "electrical")) assert.equal(z.fits, true, z.id);
  });

  test(`${id}: no spawn point starts inside equipment or a wall`, () => {
    const cols = H.WALK.colliders(m);
    for (const s of m.spawns) {
      if (s.fly) continue;
      for (const c of cols) {
        const inside = s.x > c.x0 - RADIUS && s.x < c.x1 + RADIUS && s.z > c.z0 - RADIUS && s.z < c.z1 + RADIUS && c.y0 < 1.8 && c.y1 > 0.3;
        assert.ok(!inside, `${s.id} starts inside a ${c.kind}`);
      }
    }
  });

  test(`${id}: every room it names can be walked to from the front door`, () => {
    const cell = 0.25, b = m.bounds;
    const nx = Math.ceil((b.x1 - b.x0) / cell) + 1, nz = Math.ceil((b.z1 - b.z0) / cell) + 1;
    const blocked = new Uint8Array(nx * nz);
    for (const c of H.WALK.colliders(m)) {
      if (c.y0 >= 1.8 || c.y1 <= 0.3) continue;
      const i0 = Math.max(0, Math.floor((c.x0 - RADIUS - b.x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((c.x1 + RADIUS - b.x0) / cell));
      const k0 = Math.max(0, Math.floor((c.z0 - RADIUS - b.z0) / cell)), k1 = Math.min(nz - 1, Math.ceil((c.z1 + RADIUS - b.z0) / cell));
      for (let k = k0; k <= k1; k++) blocked.fill(1, k * nx + i0, k * nx + i1 + 1);
    }
    const idx = (x, z) => Math.round((z - b.z0) / cell) * nx + Math.round((x - b.x0) / cell);
    const start = m.spawns.find((s) => s.id === m.start);
    assert.ok(start, "start spawn exists");
    const seen = new Uint8Array(nx * nz);
    const q = new Int32Array(nx * nz);
    let head = 0, tail = 0;
    q[tail++] = idx(start.x, start.z); seen[q[0]] = 1;
    while (head < tail) {
      const c = q[head++], i = c % nx;
      const nb = [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, c - nx, c + nx];
      for (const v of nb) if (v >= 0 && v < nx * nz && !seen[v] && !blocked[v]) { seen[v] = 1; q[tail++] = v; }
    }
    for (const s of m.spawns) {
      if (s.fly) continue;
      assert.ok(seen[idx(s.x, s.z)], `${s.id} cannot be reached on foot from ${m.start}`);
    }
  });

  test(`${id}: the same run builds the same walkthrough, and the run is left alone`, () => {
    const before = snapshot(feas);
    const a = H.WALK.build(feas);
    const b2 = H.WALK.build(run(scenario));
    assert.deepEqual(snapshot(a), snapshot(b2));
    assert.deepEqual(snapshot(feas), before);
  });
}

test("rack density and IT load flow through to the racks", () => {
  const base = H.clone(H.DEMO);
  const dense = H.clone(H.DEMO);
  dense.demand.rack_kw = base.demand.rack_kw * 2;
  assert.equal(build(dense).counts.racks.value, Math.round(base.demand.target_mw * 1000 / dense.demand.rack_kw));
  const big = H.clone(H.DEMO);
  big.demand.target_mw = base.demand.target_mw + 60;
  assert.ok(build(big).counts.racks.value > build(base).counts.racks.value);
});

test("2N carries more UPS modules and gensets than N+1", () => {
  const n1 = H.clone(H.DEMO); n1.power.redundancy = "N+1";
  const n2 = H.clone(H.DEMO); n2.power.redundancy = "2N";
  const a = build(n1), b = build(n2);
  assert.ok(b.counts.ups.value > a.counts.ups.value);
  assert.ok(b.counts.generators.value > a.counts.generators.value);
});

test("dense racks get liquid cooling distribution, light racks do not", () => {
  const light = H.clone(H.DEMO); light.demand.rack_kw = C("liquid_cooling_kw") - 10;
  const dense = H.clone(H.DEMO); dense.demand.rack_kw = C("liquid_cooling_kw") + 10;
  assert.equal(build(light).boxes.some((b) => b.kind === "cdu"), false);
  assert.equal(build(dense).boxes.some((b) => b.kind === "cdu"), true);
});

test("every layout convention is a declared assumption with a tolerance, owner and reason", () => {
  for (const [k, c] of Object.entries(H.WALK.CONVENTIONS)) {
    assert.ok(Number.isFinite(c.value) && c.value > 0, k);
    assert.equal(c.basis, "assumed", k);
    assert.ok(Array.isArray(c.tol) && c.tol.length === 2 && c.tol[0] <= c.value && c.value <= c.tol[1], `${k} tol brackets the value`);
    assert.match(c.source, /^owner: \S/, `${k} owner`);
    assert.equal(typeof c.unit, "string", `${k} unit`);
    assert.ok(typeof c.why === "string" && c.why.length > 10, `${k} why`);
  }
});

test("an unknown building type is refused, not guessed", () => {
  const feas = run(H.DEMO);
  assert.throws(() => H.WALK.build(feas, "hospital"), /no walkthrough builder for building type hospital/);
  assert.ok(H.WALK.TYPES.data_center);
});
