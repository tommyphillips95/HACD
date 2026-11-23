/* H.A.C.D — walkthrough equipment detail.
   Dresses the schematic boxes from js/walk-model.js with the parts that make
   them read as real equipment: door handles and nameplates, cable drops and
   busway whips, ladder tray with a cable bed, containment framing, and soft
   contact shadows under everything that stands on the slab.

   Pure and deterministic: it reads the model and returns new boxes. It adds
   nothing solid, so collision, zones and every count stay exactly as the
   model has them. It sizes nothing; each part hangs off a box the model placed.

   Also here: the render quality presets and the frame-rate governor, kept out
   of js/walk.js so the tests can hold them without a GPU. These are renderer
   settings, not design numbers; nothing in a run or a sheet reads them. */

(function (H) {
"use strict";

// Local frame of a box: x to its right, y up from its base, z out of its front.
// rot is quarter turns, 0 = front faces +z, 1 = +x, 2 = -z, 3 = -x (as walk-model.js).
function frame(b) {
  const rot = b.rot || 0, odd = rot % 2 === 1;
  const yaw = rot * Math.PI / 2;
  return { rot, odd, cs: Math.cos(yaw), sn: Math.sin(yaw), W: odd ? b.d : b.w, D: odd ? b.w : b.d, H: b.h, base: b.y - b.h / 2 };
}

// A part at local (lx, ly, lz), sized lw x lh x ld in the local frame.
function part(b, f, kind, lx, ly, lz, lw, lh, ld) {
  const r = (n) => Math.round(n * 1e4) / 1e4;
  return {
    kind,
    x: r(b.x + lx * f.cs + lz * f.sn), y: r(f.base + ly), z: r(b.z - lx * f.sn + lz * f.cs),
    w: r(f.odd ? ld : lw), h: r(lh), d: r(f.odd ? lw : ld), rot: f.rot
  };
}

// Cabinets set in lineups: their contact shadow is soft only front-to-back,
// so neighbours tile into one continuous shadow under the row.
const LINEUP = new Set(["rack", "swgr", "mv_gear", "ups", "battery"]);
const STANDALONE = new Set(["pdu", "cdu", "fanwall", "genset", "unit_xfmr", "mv_xfmr", "tower", "dry_cooler", "control_bldg", "column"]);

function details(model) {
  const out = [];
  const push = (p) => { out.push(p); };

  for (const b of model.boxes) {
    const f = frame(b);
    switch (b.kind) {
      case "rack": {
        // Door handle on the front, a brush grommet on the roof, and a bundle
        // of patch cable rising from the back of the roof into the ladder tray.
        push(part(b, f, "d_chrome", f.W / 2 - 0.07, f.H * 0.52, f.D / 2 + 0.015, 0.022, 0.32, 0.03));
        push(part(b, f, "d_black", 0, f.H + 0.006, -f.D * 0.18, f.W * 0.6, 0.012, 0.14));
        push(part(b, f, "d_cable", 0.1, f.H + 0.82, -0.27, 0.09, 1.64, 0.05));
        break;
      }
      case "swgr":
      case "mv_gear": {
        // Three breaker doors per section: a handle on each, matching the door
        // art in the texture; an engraved nameplate; a roof hood; a dark seam
        // between sections.
        const hs = [0.847, 0.556, 0.21];
        for (const h of hs) push(part(b, f, "d_chrome", f.W * 0.33, f.H * h, f.D / 2 + 0.025, 0.035, 0.2, 0.05));
        push(part(b, f, "d_plate", f.W * 0.2, f.H * 0.912, f.D / 2 + 0.006, f.W * 0.3, 0.055, 0.012));
        push(part(b, f, "d_cap_grey", 0, f.H + 0.04, 0, f.W, 0.08, f.D + 0.06));
        push(part(b, f, "d_black", -f.W / 2 + 0.006, f.H / 2, f.D / 2 + 0.004, 0.012, f.H - 0.04, 0.01));
        break;
      }
      case "ups": {
        push(part(b, f, "d_chrome", -0.04, f.H * 0.45, f.D / 2 + 0.02, 0.03, 0.3, 0.04));
        push(part(b, f, "d_chrome", 0.04, f.H * 0.45, f.D / 2 + 0.02, 0.03, 0.3, 0.04));
        push(part(b, f, "d_cap_dark", 0, f.H + 0.05, -0.05, f.W, 0.1, f.D - 0.1));
        push(part(b, f, "d_plate", -f.W * 0.32, f.H * 0.93, f.D / 2 + 0.006, f.W * 0.22, 0.05, 0.012));
        break;
      }
      case "battery":
      case "pdu":
      case "cdu": {
        push(part(b, f, "d_chrome", f.W / 2 - 0.08, f.H * 0.5, f.D / 2 + 0.018, 0.025, 0.26, 0.035));
        push(part(b, f, "d_black", -f.W / 2 + 0.006, f.H / 2, f.D / 2 + 0.004, 0.012, f.H - 0.04, 0.01));
        break;
      }
      case "fanwall": {
        push(part(b, f, "d_cap_grey", 0, f.H + 0.05, 0, f.W + 0.02, 0.1, f.D + 0.02));
        push(part(b, f, "d_chrome", f.W / 2 - 0.1, f.H * 0.5, -f.D / 2 - 0.02, 0.03, 0.3, 0.04));
        break;
      }
      case "tapbox": {
        // Flexible whip from the busway tap-off box down to the cabinet roof.
        const drop = b.y - b.h / 2;
        push({ kind: "d_black", x: b.x + 0.06, y: drop - 0.25, z: b.z, w: 0.045, h: 0.5, d: 0.045, rot: 0 });
        break;
      }
      case "tray": {
        // Ladder tray: two side rails, rungs (an alpha-tested ladder texture on
        // a thin floor) and a bed of cable lying along the run.
        const alongZ = b.d >= b.w;
        const len = alongZ ? b.d : b.w, wid = alongZ ? b.w : b.d;
        const railH = 0.1, y0 = b.y - b.h / 2;
        for (const s of [-1, 1]) {
          const off = s * (wid / 2 - 0.015);
          push(alongZ
            ? { kind: "d_rail", x: b.x + off, y: y0 + railH / 2, z: b.z, w: 0.03, h: railH, d: len, rot: 0 }
            : { kind: "d_rail", x: b.x, y: y0 + railH / 2, z: b.z + off, w: len, h: railH, d: 0.03, rot: 0 });
        }
        push({ kind: alongZ ? "d_ladder_z" : "d_ladder_x", x: b.x, y: y0 + 0.01, z: b.z, w: alongZ ? wid - 0.03 : len, h: 0.02, d: alongZ ? len : wid - 0.03, rot: 0 });
        push({ kind: alongZ ? "d_bed_z" : "d_bed_x", x: b.x, y: y0 + 0.045, z: b.z, w: alongZ ? wid * 0.72 : len - 0.1, h: 0.05, d: alongZ ? len - 0.1 : wid * 0.72, rot: 0 });
        break;
      }
      case "containment_door": {
        // Aluminium frame around a pair of sliding glass doors, with a pull.
        const t = 0.05, alongX = b.w >= b.d;
        const W = alongX ? b.w : b.d, y0 = b.y - b.h / 2;
        const at = (u, y, w, h) => alongX
          ? { kind: "d_alu", x: b.x + u, y: y0 + y, z: b.z, w, h, d: 0.07, rot: 0 }
          : { kind: "d_alu", x: b.x, y: y0 + y, z: b.z + u, w: 0.07, h, d: w, rot: 0 };
        push(at(-W / 2 + t / 2, b.h / 2, t, b.h));
        push(at(W / 2 - t / 2, b.h / 2, t, b.h));
        push(at(0, b.h - t / 2, W, t));
        push(at(0, b.h / 2, 0.03, b.h - t));
        push(at(0, 0.03, W, 0.06));
        push(alongX
          ? { kind: "d_chrome", x: b.x - 0.08, y: y0 + b.h * 0.48, z: b.z, w: 0.025, h: 0.4, d: 0.11, rot: 0 }
          : { kind: "d_chrome", x: b.x, y: y0 + b.h * 0.48, z: b.z - 0.08, w: 0.11, h: 0.4, d: 0.025, rot: 0 });
        break;
      }
      case "containment": {
        // Roof panel framing: edge rails and a cross member every 1.2 m.
        const alongZ = b.d >= b.w, len = alongZ ? b.d : b.w, wid = alongZ ? b.w : b.d;
        const y = b.y + b.h / 2 + 0.02;
        for (const s of [-1, 1]) {
          const off = s * (wid / 2 - 0.03);
          push(alongZ ? { kind: "d_alu", x: b.x + off, y, z: b.z, w: 0.06, h: 0.05, d: len, rot: 0 }
                      : { kind: "d_alu", x: b.x, y, z: b.z + off, w: len, h: 0.05, d: 0.06, rot: 0 });
        }
        const n = Math.max(1, Math.round(len / 1.2));
        for (let i = 0; i <= n; i++) {
          const u = -len / 2 + i * len / n;
          push(alongZ ? { kind: "d_alu", x: b.x, y, z: b.z + u, w: wid, h: 0.04, d: 0.04, rot: 0 }
                      : { kind: "d_alu", x: b.x + u, y, z: b.z, w: 0.04, h: 0.04, d: wid, rot: 0 });
        }
        break;
      }
      default: break;
    }

    // Contact shadow on the slab, so equipment sits on the floor instead of
    // floating on it. Lineups get a front-to-back falloff that tiles along the row.
    const onFloor = Math.abs(b.y - b.h / 2) < 0.05;
    if (onFloor && LINEUP.has(b.kind)) {
      push(part(b, f, "d_shadow_strip", 0, 0.012, 0, f.W, 0.002, f.D + 0.7));
    } else if (onFloor && STANDALONE.has(b.kind)) {
      const m = b.kind === "column" ? 0.35 : Math.min(1.2, 0.25 + 0.12 * Math.max(f.W, f.D));
      push(part(b, f, "d_shadow_soft", 0, 0.012, 0, f.W + 2 * m, 0.002, f.D + 2 * m));
    }
  }
  return out;
}

// Material for each detail kind, as KIND in js/walk.js. Only the parts big
// enough to throw a visible shadow cast one; the rest would only cost fill.
const DETAIL_KIND = {
  d_chrome:       { m: ["chrome"] },
  d_black:        { m: ["black"] },
  d_cable:        { m: ["cable_v"] },
  d_plate:        { m: ["plate"] },
  d_cap_grey:     { m: ["cab_grey"], cast: true },
  d_cap_dark:     { m: ["cab_dark"], cast: true },
  d_rail:         { m: ["galv"] },
  d_ladder_z:     { m: ["ladder_z"], cast: true },
  d_ladder_x:     { m: ["ladder_x"], cast: true },
  d_bed_z:        { m: ["cable_z"] },
  d_bed_x:        { m: ["cable_x"] },
  d_alu:          { m: ["alu"] },
  d_shadow_strip: { m: ["shadow_strip"], receive: false, decal: true },
  d_shadow_soft:  { m: ["shadow_soft"], receive: false, decal: true }
};

// ---- quality presets ------------------------------------------------------
// Each step trades a cost for a look. pixelRatio caps the device pixel ratio;
// shadow is the sun's shadow-map size (0 = off); msaa is the sample count of
// the offscreen target the post chain renders into; pool is how many real
// point lights follow you around a hall; lite drops the smallest parts.
const QUALITY = {
  low:    { label: "Low",    pixelRatio: 1,    shadow: 0,    post: false, bloom: false, ao: false, msaa: 0, pool: 4,  lite: true },
  medium: { label: "Medium", pixelRatio: 1.25, shadow: 1024, post: true,  bloom: true,  ao: false, msaa: 2, pool: 6,  lite: false },
  high:   { label: "High",   pixelRatio: 1.5,  shadow: 2048, post: true,  bloom: true,  ao: true,  msaa: 4, pool: 10, lite: false, aoSamples: 12 },
  ultra:  { label: "Ultra",  pixelRatio: 2,    shadow: 4096, post: true,  bloom: true,  ao: true,  msaa: 4, pool: 14, lite: false, aoSamples: 16 }
};
const ORDER = ["low", "medium", "high", "ultra"];
const LITE_SKIP = new Set(["d_cable", "d_plate", "d_chrome", "d_bed_z", "d_bed_x", "d_shadow_strip"]);

// Where a session starts when the person has not picked: phones and small
// tablets start low (medium on a well-equipped one), laptops with little
// memory or few cores start medium, everything else high. Ultra is opt-in.
function pickQuality(env) {
  const e = env || {};
  const mem = e.memory || 0, cores = e.cores || 0, side = e.minSide || 9999;
  if (e.coarse || side < 600) return mem >= 8 ? "medium" : "low";
  if ((mem && mem <= 4) || (cores && cores <= 4)) return "medium";
  return "high";
}

function stepDown(q) {
  const i = ORDER.indexOf(q);
  return i > 0 ? ORDER[i - 1] : "low";
}

// Watches frame time and asks for one step down when the walk stays under
// `floor` fps for `hold` seconds. It waits out a warm-up first (shaders and
// textures compile on the first frames) and a cool-down after each change.
function governor(o) {
  const opt = Object.assign({ floor: 28, hold: 3, warmup: 2, cooldown: 4, window: 1 }, o || {});
  let t = 0, quiet = opt.warmup, below = 0, acc = 0, frames = 0, fps = 0;
  return {
    get fps() { return fps; },
    // dt in seconds; returns "down" when the preset should drop one step.
    sample(dt) {
      if (!(dt > 0)) return null;
      t += dt; acc += dt; frames++;
      if (acc < opt.window) return null;
      fps = frames / acc; acc = 0; frames = 0;
      if (quiet > 0) { quiet -= opt.window; below = 0; return null; }
      below = fps < opt.floor ? below + opt.window : 0;
      if (below >= opt.hold) { below = 0; quiet = opt.cooldown; return "down"; }
      return null;
    },
    reset() { quiet = opt.warmup; below = 0; acc = 0; frames = 0; }
  };
}

H.WALK.details = details;
H.WALK.DETAIL_KIND = DETAIL_KIND;
H.WALK.QUALITY = QUALITY;
H.WALK.QUALITY_ORDER = ORDER;
H.WALK.LITE_SKIP = LITE_SKIP;
H.WALK.pickQuality = pickQuality;
H.WALK.stepDown = stepDown;
H.WALK.governor = governor;
})(window.HACD);
