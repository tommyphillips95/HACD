// The detail pass makes the walkthrough read as real equipment. It must never
// change what the drawing says: no new counts, nothing you could bump into,
// and the same parts every time. The quality presets and the frame-rate
// governor live beside it so they can be held without a GPU.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadHACD, scenarios } = require("./load.js");

const H = loadHACD({ fixedClock: true });
const run = (s) => H.evaluate(H.clone(s), H.clone(H.DEMO_PROV));
const snapshot = (x) => JSON.parse(JSON.stringify(x));

for (const { id, scenario } of scenarios(H)) {
  const m = H.WALK.build(run(scenario));

  test(`${id}: detail parts leave the model, its counts and its colliders alone`, () => {
    const before = snapshot(m);
    const cols = H.WALK.colliders(m).length;
    const d = H.WALK.details(m);
    assert.ok(d.length > m.counts.racks.value, "every rack gets dressed");
    assert.deepEqual(snapshot(m), before);
    assert.equal(H.WALK.colliders(m).length, cols);
    for (const p of d) assert.ok(!p.solid, `${p.kind} must not be solid`);
  });

  test(`${id}: every detail part has a material and a real size`, () => {
    for (const p of H.WALK.details(m)) {
      assert.ok(H.WALK.DETAIL_KIND[p.kind], `no material for ${p.kind}`);
      for (const k of ["x", "y", "z", "w", "h", "d"]) assert.ok(Number.isFinite(p[k]), `${p.kind}.${k}`);
      assert.ok(p.w > 0 && p.h > 0 && p.d > 0, `${p.kind} has no volume`);
    }
  });

  test(`${id}: details are the same on every build`, () => {
    assert.deepEqual(snapshot(H.WALK.details(m)), snapshot(H.WALK.details(H.WALK.build(run(scenario)))));
  });
}

test("each rack gets one handle on its front face, whichever way the row faces", () => {
  const m = H.WALK.build(run(H.DEMO));
  const d = H.WALK.details(m);
  const handles = d.filter((p) => p.kind === "d_chrome");
  for (const r of m.boxes.filter((b) => b.kind === "rack").slice(0, 200)) {
    const front = [[0, 1], [1, 0], [0, -1], [-1, 0]][r.rot || 0];
    const fx = r.x + front[0] * r.w / 2, fz = r.z + front[1] * r.d / 2;
    const near = handles.filter((h) => Math.abs(h.y - (r.y - r.h / 2 + r.h * 0.52)) < 0.01 &&
      (front[0] ? Math.abs(h.x - fx) < 0.05 && Math.abs(h.z - r.z) < r.d / 2 : Math.abs(h.z - fz) < 0.05 && Math.abs(h.x - r.x) < r.w / 2));
    assert.equal(near.length, 1, `rack at ${r.x},${r.z} rot ${r.rot}`);
  }
});

test("quality presets get cheaper step by step, and only ultra is never picked for you", () => {
  const order = H.WALK.QUALITY_ORDER;
  assert.deepEqual([...order], ["low", "medium", "high", "ultra"]);
  for (let i = 1; i < order.length; i++) {
    const a = H.WALK.QUALITY[order[i - 1]], b = H.WALK.QUALITY[order[i]];
    assert.ok(a.pixelRatio <= b.pixelRatio && a.shadow <= b.shadow && a.pool <= b.pool && a.msaa <= b.msaa, order[i]);
  }
  assert.equal(H.WALK.QUALITY.low.post, false);
  const envs = [{ coarse: true }, { coarse: true, memory: 8 }, { minSide: 400 }, { memory: 4, cores: 8 }, { cores: 4 }, { memory: 16, cores: 12, minSide: 1080 }, {}];
  const picks = envs.map(H.WALK.pickQuality);
  assert.deepEqual(picks, ["low", "medium", "low", "medium", "medium", "high", "high"]);
  assert.equal(H.WALK.stepDown("ultra"), "high");
  assert.equal(H.WALK.stepDown("low"), "low");
});

test("the governor steps down only after a sustained drop, then waits", () => {
  const g = H.WALK.governor({ floor: 28, hold: 3, warmup: 2, cooldown: 4 });
  const feed = (fps, secs) => { const out = []; for (let i = 0; i < Math.round(fps * secs); i++) { const r = g.sample(1 / fps); if (r) out.push(r); } return out; };
  assert.deepEqual(feed(10, 2), [], "warm-up ignores slow first frames");
  assert.deepEqual(feed(60, 5), [], "fast frames never step down");
  assert.deepEqual(feed(20, 2), [], "a short dip is not enough");
  assert.deepEqual(feed(60, 1), []);
  assert.deepEqual(feed(20, 3.5), ["down"], "three slow seconds step down once");
  assert.deepEqual(feed(20, 3.4), [], "then it waits out the cool-down");
  assert.deepEqual(feed(20, 4), ["down"], "and steps again if it is still slow");
  assert.ok(g.fps > 19 && g.fps < 21);
  assert.equal(g.sample(0), null);
});
