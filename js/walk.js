/* H.A.C.D — the walkthrough renderer.
   Draws the box model from js/walk-model.js with three.js: PBR materials from
   procedural textures, a sky and a sun with shadows outside, fixture-driven
   light inside, and first-person controls for mouse, keyboard and touch.
   It never computes a design number; every count it shows comes from the model. */

import * as THREE from "three";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js";
import { Sky } from "../vendor/three/Sky.js";

const EYE = 1.7;
const RADIUS = 0.32;
const WALK_SPEED = 1.6;   // m/s
const RUN_SPEED = 5.5;
const FLY_SPEED = 28;

// ---- procedural textures -----------------------------------------------------
// Every texture is drawn on a canvas from a seeded generator, so the look is
// identical on every load and nothing is fetched.

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

function tex(c, opts = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function noise(ctx, w, h, rand, base, spread, alpha = 1, count = 0) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const n = count || Math.floor((w * h) / 6);
  for (let i = 0; i < n; i++) {
    const v = Math.floor((rand() - 0.5) * spread);
    ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${(Math.abs(v) / 255) * alpha})`;
    const s = 1 + Math.floor(rand() * 2);
    ctx.fillRect(Math.floor(rand() * w), Math.floor(rand() * h), s, s);
  }
}

function makeTextures(H) {
  const T = {};
  const R = (seed) => H.rng(seed);

  // Sealed, epoxy-coated slab: light grey, faint mottling and trowel marks.
  {
    const c = canvas(512, 512), x = c.getContext("2d"), r = R(11);
    noise(x, 512, 512, r, "#8e9396", 22, 0.5);
    for (let i = 0; i < 60; i++) {
      x.fillStyle = `rgba(90,95,98,${0.03 + r() * 0.04})`;
      x.beginPath(); x.ellipse(r() * 512, r() * 512, 20 + r() * 80, 10 + r() * 40, r() * 3, 0, 7); x.fill();
    }
    x.strokeStyle = "rgba(60,60,60,0.35)"; x.lineWidth = 2; x.strokeRect(0, 0, 512, 512); // saw-cut joint
    T.floor = tex(c);
  }
  // Painted insulated wall panel with vertical seams.
  {
    const c = canvas(256, 256), x = c.getContext("2d"), r = R(12);
    noise(x, 256, 256, r, "#e4e6e4", 10, 0.4);
    x.fillStyle = "rgba(0,0,0,0.18)"; x.fillRect(0, 0, 3, 256);
    x.fillStyle = "rgba(255,255,255,0.4)"; x.fillRect(3, 0, 2, 256);
    T.wall = tex(c);
  }
  // Exterior insulated metal panel, horizontal ribs.
  {
    const c = canvas(256, 256), x = c.getContext("2d"), r = R(13);
    noise(x, 256, 256, r, "#c9ccce", 12, 0.4);
    for (let y = 0; y < 256; y += 32) {
      x.fillStyle = "rgba(0,0,0,0.22)"; x.fillRect(0, y, 256, 3);
      x.fillStyle = "rgba(255,255,255,0.35)"; x.fillRect(0, y + 3, 256, 2);
    }
    T.cladding = tex(c);
  }
  // Concrete, asphalt, gravel, grass.
  {
    const c = canvas(512, 512), x = c.getContext("2d"), r = R(14);
    noise(x, 512, 512, r, "#a6a39d", 40, 0.6);
    T.concrete = tex(c);
  }
  {
    const c = canvas(512, 512), x = c.getContext("2d"), r = R(15);
    noise(x, 512, 512, r, "#3a3b3d", 60, 0.7, 90000);
    T.asphalt = tex(c);
  }
  {
    const c = canvas(512, 512), x = c.getContext("2d"), r = R(16);
    noise(x, 512, 512, r, "#8d8a84", 140, 0.9, 120000);
    T.gravel = tex(c);
  }
  {
    const c = canvas(512, 512), x = c.getContext("2d"), r = R(17);
    x.fillStyle = "#56703a"; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 60000; i++) {
      const g = 80 + Math.floor(r() * 70);
      x.fillStyle = `rgba(${g - 30},${g + 20},${g - 50},0.5)`;
      x.fillRect(r() * 512, r() * 512, 1, 2 + r() * 3);
    }
    T.grass = tex(c);
  }

  // Server cabinet front: perforated door over a stack of server sleds, with
  // an emissive map of status LEDs that blink in the shader.
  {
    const w = 128, h = 512;
    const c = canvas(w, h), x = c.getContext("2d"), r = R(21);
    const e = canvas(w, h), ex = e.getContext("2d");
    x.fillStyle = "#121416"; x.fillRect(0, 0, w, h);
    ex.fillStyle = "#000"; ex.fillRect(0, 0, w, h);
    const top = 18, bottom = h - 26, u = (bottom - top) / 48;
    for (let i = 0; i < 48; ) {
      const span = r() < 0.25 ? 4 : (r() < 0.6 ? 2 : 1);
      const y0 = top + i * u, hh = span * u - 1;
      x.fillStyle = r() < 0.15 ? "#1d2024" : "#25292e";
      x.fillRect(10, y0, w - 20, hh);
      x.fillStyle = "rgba(255,255,255,0.05)"; x.fillRect(10, y0, w - 20, 1);
      // drive bays / bezels
      for (let b = 0; b < 10; b++) { x.fillStyle = "rgba(0,0,0,0.35)"; x.fillRect(14 + b * 9.6, y0 + 2, 7, Math.max(1, hh - 4)); }
      const col = r() < 0.75 ? "#39ff7a" : (r() < 0.6 ? "#4aa8ff" : "#ffb02e");
      ex.fillStyle = col; ex.fillRect(w - 18, y0 + 2, 3, 3);
      if (r() < 0.6) { ex.fillStyle = "#39ff7a"; ex.fillRect(w - 24, y0 + 2, 3, 3); }
      i += span;
    }
    // perforated door mesh over the sleds
    x.fillStyle = "rgba(10,10,12,0.55)";
    for (let yy = 0; yy < h; yy += 3) for (let xx = (yy / 3) % 2 ? 1 : 0; xx < w; xx += 3) x.fillRect(xx, yy, 1, 1);
    // frame, handle, label strip
    x.strokeStyle = "#2c3036"; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, h - 8);
    x.fillStyle = "#9aa0a6"; x.fillRect(w - 12, h / 2 - 30, 4, 60);
    x.fillStyle = "#d8dadc"; x.fillRect(30, 6, 68, 9);
    T.rackFront = tex(c); T.rackFrontE = tex(e);
  }
  // Cabinet back: cable bundles and PSUs.
  {
    const w = 128, h = 512;
    const c = canvas(w, h), x = c.getContext("2d"), r = R(22);
    x.fillStyle = "#15171a"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      x.strokeStyle = ["#1f6fe0", "#e8c21c", "#d23b3b", "#2a2a2a", "#1aa36b"][Math.floor(r() * 5)];
      x.lineWidth = 1 + r() * 2;
      x.beginPath(); const sx = 14 + r() * 100; x.moveTo(sx, 10); x.bezierCurveTo(sx + 20 * (r() - 0.5), 150, sx + 30 * (r() - 0.5), 350, sx, h - 10); x.stroke();
    }
    x.fillStyle = "#2b2f34"; x.fillRect(8, 20, 10, h - 40); x.fillRect(w - 18, 20, 10, h - 40); // zero-U PDUs
    x.strokeStyle = "#2c3036"; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, h - 8);
    T.rackBack = tex(c);
  }
  // Low-voltage switchgear section: ANSI 61 grey, breaker doors, indicator lamps.
  {
    const w = 128, h = 320;
    const c = canvas(w, h), x = c.getContext("2d"), r = R(31);
    const e = canvas(w, h), ex = e.getContext("2d");
    noise(x, w, h, r, "#aeb3b5", 10, 0.3);
    ex.fillStyle = "#000"; ex.fillRect(0, 0, w, h);
    const doors = [[10, 14, 108, 70], [10, 92, 108, 100], [10, 200, 108, 106]];
    doors.forEach(([dx, dy, dw, dh], i) => {
      x.strokeStyle = "rgba(40,45,48,0.8)"; x.lineWidth = 2; x.strokeRect(dx, dy, dw, dh);
      x.fillStyle = "#3a3f44"; x.fillRect(dx + dw - 14, dy + dh / 2 - 10, 5, 20);
      if (i > 0) { x.fillStyle = "#24282b"; x.fillRect(dx + 20, dy + 18, 40, 26); x.fillStyle = "#d6c300"; x.fillRect(dx + 34, dy + 50, 12, 18); }
    });
    [["#ff3b30", 30], ["#34c759", 46], ["#ffd60a", 62]].forEach(([col, xx]) => {
      x.fillStyle = "#222"; x.beginPath(); x.arc(xx, 40, 6, 0, 7); x.fill();
      ex.fillStyle = col; ex.beginPath(); ex.arc(xx, 40, 4, 0, 7); ex.fill();
    });
    x.fillStyle = "#f2f2f2"; x.fillRect(70, 22, 40, 12);
    T.swgr = tex(c); T.swgrE = tex(e);
  }
  // UPS module: dark cabinet with a touchscreen and a vented lower half.
  {
    const w = 256, h = 288;
    const c = canvas(w, h), x = c.getContext("2d"), r = R(32);
    const e = canvas(w, h), ex = e.getContext("2d");
    noise(x, w, h, r, "#2c3034", 12, 0.3);
    ex.fillStyle = "#000"; ex.fillRect(0, 0, w, h);
    x.fillStyle = "#16181a"; x.fillRect(40, 30, 90, 56);
    const g = ex.createLinearGradient(42, 32, 128, 84); g.addColorStop(0, "#1b6fd8"); g.addColorStop(1, "#47c4ff");
    ex.fillStyle = g; ex.fillRect(44, 34, 82, 48);
    ex.fillStyle = "#e8fff2"; for (let i = 0; i < 5; i++) ex.fillRect(52, 42 + i * 8, 30 + r() * 40, 2);
    ex.fillStyle = "#34c759"; ex.fillRect(150, 40, 8, 8);
    for (let y = 120; y < 270; y += 8) { x.fillStyle = "rgba(0,0,0,0.5)"; x.fillRect(20, y, w - 40, 3); }
    x.strokeStyle = "rgba(255,255,255,0.08)"; x.lineWidth = 2; x.strokeRect(128, 4, 1, h - 8);
    T.ups = tex(c); T.upsE = tex(e);
  }
  // Battery cabinet: vented door, status strip.
  {
    const w = 128, h = 288;
    const c = canvas(w, h), x = c.getContext("2d"), r = R(33);
    const e = canvas(w, h), ex = e.getContext("2d");
    noise(x, w, h, r, "#3a3f45", 12, 0.3);
    ex.fillStyle = "#000"; ex.fillRect(0, 0, w, h);
    for (let y = 40; y < 270; y += 6) { x.fillStyle = "rgba(0,0,0,0.45)"; x.fillRect(16, y, w - 32, 2); }
    for (let i = 0; i < 6; i++) { ex.fillStyle = i < 5 ? "#34c759" : "#ffd60a"; ex.fillRect(20 + i * 12, 18, 7, 7); }
    T.battery = tex(c); T.batteryE = tex(e);
  }
  // Fan-wall unit: grille and fan rings.
  {
    const w = 256, h = 512;
    const c = canvas(w, h), x = c.getContext("2d"), r = R(34);
    noise(x, w, h, r, "#c5c9cb", 10, 0.3);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 6; j++) {
      const cx = 44 + i * 84, cy = 46 + j * 80;
      x.fillStyle = "#1c1f22"; x.beginPath(); x.arc(cx, cy, 34, 0, 7); x.fill();
      x.strokeStyle = "#8b9094"; x.lineWidth = 2; for (let k = 8; k < 34; k += 6) { x.beginPath(); x.arc(cx, cy, k, 0, 7); x.stroke(); }
      x.beginPath(); x.moveTo(cx - 34, cy); x.lineTo(cx + 34, cy); x.moveTo(cx, cy - 34); x.lineTo(cx, cy + 34); x.stroke();
    }
    T.fanwall = tex(c);
  }
  // Generator enclosure: sound-attenuated louvres and access doors.
  {
    const w = 512, h = 160;
    const c = canvas(w, h), x = c.getContext("2d"), r = R(35);
    noise(x, w, h, r, "#d4cfc2", 14, 0.4);
    for (let d = 0; d < 6; d++) {
      const dx = 16 + d * 82;
      x.strokeStyle = "rgba(60,58,52,0.6)"; x.lineWidth = 2; x.strokeRect(dx, 18, 70, 124);
      for (let y = 30; y < 130; y += 7) { x.fillStyle = "rgba(0,0,0,0.25)"; x.fillRect(dx + 8, y, 54, 3); }
      x.fillStyle = "#555"; x.fillRect(dx + 60, 74, 4, 14);
    }
    T.genset = tex(c);
  }
  // Cooling tower casing and dry cooler coils.
  {
    const w = 256, h = 256;
    const c = canvas(w, h), x = c.getContext("2d"), r = R(36);
    noise(x, w, h, r, "#9ea6aa", 14, 0.4);
    for (let y = 0; y < 256; y += 10) { x.fillStyle = "rgba(0,0,0,0.3)"; x.fillRect(0, y, 256, 4); }
    T.tower = tex(c);
  }
  {
    const w = 256, h = 128;
    const c = canvas(w, h), x = c.getContext("2d"), r = R(37);
    noise(x, w, h, r, "#7f8a8f", 20, 0.4);
    for (let xx = 0; xx < 256; xx += 3) { x.fillStyle = "rgba(0,0,0,0.35)"; x.fillRect(xx, 0, 1, 128); }
    T.coil = tex(c);
  }
  // Transformer radiator fins.
  {
    const w = 256, h = 256;
    const c = canvas(w, h), x = c.getContext("2d"), r = R(38);
    noise(x, w, h, r, "#7a8178", 14, 0.4);
    for (let xx = 0; xx < 256; xx += 12) { x.fillStyle = "rgba(0,0,0,0.35)"; x.fillRect(xx, 0, 4, 256); x.fillStyle = "rgba(255,255,255,0.12)"; x.fillRect(xx + 5, 0, 2, 256); }
    T.fins = tex(c);
  }
  // A generic roughness/noise map for painted metal.
  {
    const c = canvas(256, 256), x = c.getContext("2d"), r = R(39);
    noise(x, 256, 256, r, "#8a8a8a", 50, 0.6);
    T.rough = tex(c, { data: true });
  }
  return T;
}

// ---- materials -----------------------------------------------------------------
// uv: "world" tiles the texture every `scale` metres, so seams line up across
// pieces; "unit" stretches it once over each face (equipment fronts).

function makeMaterials(T, blinkUniform) {
  const M = {};
  const std = (key, p, uv = "world", scale = 1) => {
    const m = new THREE.MeshStandardMaterial(p);
    m.userData = { uv, scale, envBase: p.envMapIntensity ?? 1 };
    M[key] = m;
    return m;
  };
  std("floor", { map: T.floor, color: 0xffffff, roughness: 0.32, metalness: 0, envMapIntensity: 0.9 }, "world", 4);
  std("wall", { map: T.wall, roughness: 0.85, metalness: 0 }, "world", 1.2);
  std("cladding", { map: T.cladding, roughness: 0.55, metalness: 0.35 }, "world", 3);
  std("roof", { color: 0x8c9094, roughness: 0.8, metalness: 0.2, roughnessMap: T.rough }, "world", 8);
  std("deck", { color: 0x2c2f33, roughness: 0.75, metalness: 0.4 }, "world", 4);
  std("concrete", { map: T.concrete, roughness: 0.92 }, "world", 6);
  std("asphalt", { map: T.asphalt, roughness: 0.95 }, "world", 8);
  std("gravel", { map: T.gravel, roughness: 1 }, "world", 3);
  std("grass", { map: T.grass, roughness: 1 }, "world", 6);
  std("paint_white", { color: 0xf3f3ee, roughness: 0.6 }, "world", 1);
  std("paint_yellow", { color: 0xf2c200, roughness: 0.5, emissive: 0x332800 }, "world", 1);
  std("steel", { color: 0x6c7176, roughness: 0.45, metalness: 0.85, roughnessMap: T.rough }, "world", 2);
  std("galv", { color: 0xb6babd, roughness: 0.35, metalness: 0.9, roughnessMap: T.rough }, "world", 2);
  std("busway", { color: 0x8a9096, roughness: 0.35, metalness: 0.8 }, "world", 2);
  std("fiber", { color: 0xf4c400, roughness: 0.5 }, "world", 2);
  std("rack_side", { color: 0x16181b, roughness: 0.5, metalness: 0.6, roughnessMap: T.rough }, "world", 1);
  const rf = std("rack_front", { map: T.rackFront, emissiveMap: T.rackFrontE, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.5, metalness: 0.55 }, "unit");
  blink(rf, blinkUniform);
  std("rack_back", { map: T.rackBack, roughness: 0.6, metalness: 0.4 }, "unit");
  std("cab_grey", { color: 0xaeb3b5, roughness: 0.45, metalness: 0.5, roughnessMap: T.rough }, "world", 1);
  std("cab_dark", { color: 0x2c3034, roughness: 0.45, metalness: 0.5, roughnessMap: T.rough }, "world", 1);
  std("swgr", { map: T.swgr, emissiveMap: T.swgrE, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.45, metalness: 0.45 }, "unit");
  std("mv_gear", { map: T.swgr, emissiveMap: T.swgrE, emissive: 0xffffff, emissiveIntensity: 1.0, color: 0xc8d0d6, roughness: 0.45, metalness: 0.45 }, "unit");
  std("ups", { map: T.ups, emissiveMap: T.upsE, emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 0.4, metalness: 0.5 }, "unit");
  std("battery", { map: T.battery, emissiveMap: T.batteryE, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.45, metalness: 0.5 }, "unit");
  std("fanwall", { map: T.fanwall, roughness: 0.5, metalness: 0.5 }, "unit");
  std("genset", { map: T.genset, roughness: 0.55, metalness: 0.35 }, "unit");
  std("tower", { map: T.tower, roughness: 0.6, metalness: 0.4 }, "world", 3);
  std("coil", { map: T.coil, roughness: 0.5, metalness: 0.6 }, "world", 2);
  std("fins", { map: T.fins, roughness: 0.6, metalness: 0.5 }, "world", 2);
  std("xfmr_green", { color: 0x55704f, roughness: 0.5, metalness: 0.4, roughnessMap: T.rough }, "world", 1);
  std("fence", { color: 0x9aa0a4, roughness: 0.4, metalness: 0.9, transparent: true, opacity: 0.35, depthWrite: false }, "world", 1);
  std("glass", { color: 0xbfd8e6, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 1.5 }, "world", 1);
  std("pipe_blue", { color: 0x2f6fb0, roughness: 0.35, metalness: 0.4 }, "world", 1);
  std("pipe_red", { color: 0xb3402f, roughness: 0.35, metalness: 0.4 }, "world", 1);
  std("black", { color: 0x111214, roughness: 0.6, metalness: 0.3 }, "world", 1);
  return M;
}

// LEDs blink in the shader: each LED cell gets its own phase, so 4,000 racks
// twinkle without touching the CPU.
function blink(material, uniform) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBlink = uniform;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uBlink;")
      .replace("#include <emissivemap_fragment>", `
        #ifdef USE_EMISSIVEMAP
          vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
          vec2 cell = floor( vEmissiveMapUv * vec2( 24.0, 96.0 ) );
          float ph = fract( sin( dot( cell + floor( gl_FragCoord.xy / 220.0 ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
          float on = step( 0.18, fract( uBlink * ( 0.6 + ph * 1.7 ) + ph ) );
          totalEmissiveRadiance *= emissiveColor.rgb * mix( 0.25, 1.0, on );
        #endif`);
  };
}

// Which material goes on each face of each kind: +x, -x, +y, -y, +z (front), -z (back).
const KIND = {
  slab:        { m: ["floor"], receive: true },
  roof:        { m: ["roof", "roof", "roof", "deck", "roof", "roof"], cast: true },
  parapet:     { m: ["cladding"], cast: true },
  wall_ext:    { m: ["cladding"], cast: true, receive: true },
  wall:        { m: ["wall"], cast: true, receive: true },
  door_frame:  { skip: true },
  canopy:      { m: ["steel"], cast: true },
  grass:       { m: ["grass"], receive: true },
  road:        { m: ["asphalt"], receive: true },
  parking:     { m: ["asphalt"], receive: true },
  gravel:      { m: ["gravel"], receive: true },
  stripe:      { m: ["paint_white"] },
  stripe_y:    { m: ["paint_yellow"] },
  fence:       { m: ["fence"] },
  rack:        { m: ["rack_side", "rack_side", "rack_side", "rack_side", "rack_front", "rack_back"], cast: true, receive: true },
  busway:      { m: ["busway"], cast: true },
  tray:        { m: ["galv"], cast: true },
  fiber_tray:  { m: ["fiber"] },
  tapbox:      { m: ["busway"] },
  pdu:         { m: ["cab_dark", "cab_dark", "cab_dark", "cab_dark", "battery", "cab_dark"], cast: true },
  cdu:         { m: ["cab_grey", "cab_grey", "cab_grey", "cab_grey", "swgr", "cab_grey"], cast: true },
  containment: { m: ["glass"] },
  containment_door: { m: ["glass"] },
  chimney:     { m: ["galv"] },
  column:      { m: ["paint_white"], cast: true },
  joist:       { m: ["steel"] },
  fanwall:     { m: ["cab_grey", "cab_grey", "cab_grey", "cab_grey", "fanwall", "fanwall"], cast: true },
  pipe_cw:     { m: ["pipe_blue"] },
  pipe_hw:     { m: ["pipe_red"] },
  swgr:        { m: ["cab_grey", "cab_grey", "cab_grey", "cab_grey", "swgr", "cab_grey"], cast: true, receive: true },
  mv_gear:     { m: ["cab_grey", "cab_grey", "cab_grey", "cab_grey", "mv_gear", "cab_grey"], cast: true, receive: true },
  ups:         { m: ["cab_dark", "cab_dark", "cab_dark", "cab_dark", "ups", "cab_dark"], cast: true, receive: true },
  battery:     { m: ["cab_dark", "cab_dark", "cab_dark", "cab_dark", "battery", "cab_dark"], cast: true, receive: true },
  pad:         { m: ["concrete"], receive: true },
  unit_xfmr:   { m: ["xfmr_green"], cast: true },
  genset:      { m: ["genset", "genset", "cab_grey", "cab_grey", "cab_grey", "cab_grey"], cast: true, receive: true },
  stack:       { m: ["steel"], cast: true },
  tower:       { m: ["tower"], cast: true, receive: true },
  tower_fan:   { m: ["steel"], cast: true },
  dry_cooler:  { m: ["coil", "coil", "steel", "steel", "coil", "coil"], cast: true },
  mv_xfmr:     { m: ["fins"], cast: true, receive: true },
  gantry:      { m: ["galv"], cast: true },
  control_bldg:{ m: ["cladding", "cladding", "roof", "roof", "cladding", "cladding"], cast: true }
};

// ---- geometry: merge every box of a kind into one mesh -------------------------

const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], s: [0, 2, 1] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], s: [0, 2, 1] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], s: [1, 0, 2] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], s: [1, 0, 2] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], s: [2, 0, 1] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], s: [2, 0, 1] }
];

function mergeKind(boxes, spec, M) {
  const keys = spec.m.length === 1 ? [spec.m[0], spec.m[0], spec.m[0], spec.m[0], spec.m[0], spec.m[0]] : spec.m;
  const mats = [...new Set(keys)];
  const pos = [], nor = [], uv = [], idx = mats.map(() => []);
  let vcount = 0;
  for (const b of boxes) {
    const rot = b.rot || 0, odd = rot % 2 === 1;
    const half = [(odd ? b.d : b.w) / 2, b.h / 2, (odd ? b.w : b.d) / 2];
    const yaw = rot * Math.PI / 2, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const R = (p) => [p[0] * cs + p[2] * sn, p[1], -p[0] * sn + p[2] * cs];
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], key = keys[f], mi = mats.indexOf(key), md = M[key].userData;
      const hn = half[F.s[0]], hu = half[F.s[1]], hv = half[F.s[2]];
      const wn = R(F.n);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let c = 0; c < 4; c++) {
        const [cu, cv] = corners[c];
        const l = [0, 1, 2].map((a) => F.n[a] * hn + F.u[a] * hu * cu + F.v[a] * hv * cv);
        const w = R(l);
        const wx = b.x + w[0], wy = b.y + w[1], wz = b.z + w[2];
        pos.push(wx, wy, wz); nor.push(wn[0], wn[1], wn[2]);
        if (md.uv === "unit") uv.push((cu + 1) / 2, (cv + 1) / 2);
        else {
          const s = md.scale, ax = Math.abs(wn[0]), ay = Math.abs(wn[1]);
          if (ay > 0.5) uv.push(wx / s, wz / s);
          else if (ax > 0.5) uv.push(wz / s, wy / s);
          else uv.push(wx / s, wy / s);
        }
      }
      idx[mi].push(vcount, vcount + 1, vcount + 2, vcount, vcount + 2, vcount + 3);
      vcount += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  const all = [];
  let start = 0;
  idx.forEach((list, i) => { g.addGroup(start, list.length, i); start += list.length; for (const v of list) all.push(v); });
  g.setIndex(vcount > 65535 ? new THREE.Uint32BufferAttribute(all, 1) : new THREE.Uint16BufferAttribute(all, 1));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, mats.map((k) => M[k]));
  mesh.castShadow = !!spec.cast;
  mesh.receiveShadow = spec.receive !== false;
  return mesh;
}

// ---- signs ------------------------------------------------------------------------

function signMesh(s) {
  const c = canvas(512, 96), x = c.getContext("2d");
  x.fillStyle = "#14361f"; x.fillRect(0, 0, 512, 96);
  x.strokeStyle = "#e9efe9"; x.lineWidth = 4; x.strokeRect(6, 6, 500, 84);
  x.fillStyle = "#f4f6f4"; x.font = "600 40px Archivo, Arial, sans-serif"; x.textBaseline = "middle"; x.textAlign = "center";
  x.fillText(s.text, 256, 50, 480);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.w * 96 / 512), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.15 }));
  m.position.set(s.x, s.y, s.z);
  m.rotation.y = (s.rot || 0) * Math.PI / 2;
  return m;
}

// ---- collision: a spatial hash of footprints ------------------------------------

function grid(colliders, cell = 6) {
  const map = new Map();
  const key = (i, j) => i * 100003 + j;
  for (const c of colliders) {
    if (c.y0 > 1.9 || c.y1 < 0.15) continue; // overhead or flush: walk under / over
    for (let i = Math.floor(c.x0 / cell); i <= Math.floor(c.x1 / cell); i++)
      for (let j = Math.floor(c.z0 / cell); j <= Math.floor(c.z1 / cell); j++) {
        const k = key(i, j);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(c);
      }
  }
  return {
    near(x, z) {
      const out = [];
      const i0 = Math.floor((x - 1) / cell), i1 = Math.floor((x + 1) / cell), j0 = Math.floor((z - 1) / cell), j1 = Math.floor((z + 1) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = map.get(key(i, j)); if (l) out.push(...l); }
      return out;
    },
    blocked(x, z, r = RADIUS) {
      for (const c of this.near(x, z)) if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return true;
      return false;
    },
    // First box a ray from (x, z) along (dx, dz) hits within `max` metres.
    pick(x, y, z, dx, dy, dz, max, boxes) {
      let best = null, bestT = max;
      for (let t = 0; t < max; t += cell / 2) {
        for (const c of this.near(x + dx * t, z + dz * t)) {
          const hit = rayBox(x, y, z, dx, dy, dz, c);
          if (hit !== null && hit < bestT) { bestT = hit; best = c; }
        }
        if (best) break;
      }
      return best ? { box: best, t: bestT } : null;
    }
  };
}

function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  for (const [o, d, lo, hi] of [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

// ---- the viewer -------------------------------------------------------------------

const LABEL = {
  rack: "Server cabinet", swgr: "LV switchgear section", mv_gear: "MV switchgear section", ups: "UPS module", battery: "Battery cabinet", pdu: "Row PDU / RPP",
  cdu: "Coolant distribution unit", fanwall: "Fan-wall unit", genset: "Standby generator", unit_xfmr: "Unit substation transformer",
  mv_xfmr: "MV power transformer", tower: "Cooling tower cell", dry_cooler: "Dry cooler", column: "Structural column",
  wall: "Partition", wall_ext: "Exterior wall", containment_door: "Hot aisle containment door", control_bldg: "Substation control building", fence: "Fence"
};

export function mountWalk(host, feas, H, opts = {}) {
  const model = H.WALK.build(feas);
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  let quality = opts.quality || (coarse ? "low" : "high");

  host.innerHTML = "";
  host.classList.add("walk-host");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.preserve });
  } catch (e) {
    host.innerHTML = '<div class="walk-fallback body-sm">This browser could not start WebGL, so the walkthrough cannot draw. The drawing set still has every sheet.</div>';
    return { dispose() {}, pose() { return null; } };
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = quality === "high";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  renderer.domElement.className = "walk-canvas";
  renderer.domElement.tabIndex = 0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.08, 6000);
  camera.rotation.order = "YXZ";

  // Image-based light for reflections on metal and glass.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environment = envTex;

  // Sky and sun.
  const sky = new Sky();
  sky.scale.setScalar(5000);
  const su = sky.material.uniforms;
  su.turbidity.value = 6; su.rayleigh.value = 1.4; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.82;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(48), THREE.MathUtils.degToRad(215));
  su.sunPosition.value.copy(sunDir);
  scene.add(sky);
  scene.fog = new THREE.Fog(0xc9d6df, 400, 3800);

  const sun = new THREE.DirectionalLight(0xfff1e0, 3.2);
  sun.castShadow = quality === "high";
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 600;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b5f4a, 1.1);
  scene.add(hemi);
  const ambientIn = new THREE.AmbientLight(0xeaf1ff, 0);
  scene.add(ambientIn);

  // Textures, materials, geometry.
  const T = makeTextures(H);
  const blinkU = { value: 0 };
  const M = makeMaterials(T, blinkU);
  const byKind = new Map();
  for (const b of model.boxes) {
    if (!KIND[b.kind] || KIND[b.kind].skip) continue;
    if (!byKind.has(b.kind)) byKind.set(b.kind, []);
    byKind.get(b.kind).push(b);
  }
  const meshes = [];
  for (const [kind, list] of byKind) {
    const mesh = mergeKind(list, KIND[kind], M);
    mesh.name = kind;
    if (kind === "fence") mesh.renderOrder = 2;
    scene.add(mesh); meshes.push(mesh);
  }

  // Light fixtures: emissive linear LEDs, instanced.
  const fixGeo = new THREE.BoxGeometry(1.2, 0.06, 0.16);
  const fixMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 3.5, roughness: 0.3 });
  const fixMesh = new THREE.InstancedMesh(fixGeo, fixMat, model.fixtures.length);
  const tmp = new THREE.Object3D();
  model.fixtures.forEach((f, i) => {
    tmp.position.set(f.x, f.y, f.z);
    tmp.rotation.set(0, f.axis === "z" ? Math.PI / 2 : 0, 0);
    tmp.updateMatrix(); fixMesh.setMatrixAt(i, tmp.matrix);
  });
  scene.add(fixMesh);

  const signs = model.signs.map(signMesh);
  signs.forEach((m) => scene.add(m));

  // Interior light pool: a handful of real point lights parked on the fixtures
  // nearest the camera, so halls get local falloff without thousands of lights.
  const POOL = quality === "high" ? 10 : 5;
  const pool = [];
  for (let i = 0; i < POOL; i++) {
    const l = new THREE.PointLight(0xf2f6ff, 0, 22, 2);
    scene.add(l); pool.push(l);
  }

  const colliders = H.WALK.colliders(model);
  const hash = grid(colliders);
  const buildings = model.boxes.filter((b) => b.kind === "roof").map((b) => ({ tag: b.building, x0: b.x - b.w / 2 + 0.4, x1: b.x + b.w / 2 - 0.4, z0: b.z - b.d / 2 + 0.4, z1: b.z + b.d / 2 - 0.4 }));
  const tagged = model.boxes.filter((b) => b.solid && (b.tag || b.unit || b.room));

  // ---- HUD --------------------------------------------------------------------
  const hud = document.createElement("div");
  hud.className = "walk-hud";
  const groups = {};
  model.spawns.forEach((sp) => { const g = sp.id.split("-")[0]; (groups[g] = groups[g] || []).push(sp); });
  const options = Object.keys(groups).map((g) => {
    const items = groups[g].map((sp) => `<option value="${H.esc(sp.id)}">${H.esc(sp.label)}</option>`).join("");
    return groups[g].length > 1 ? `<optgroup label="${H.esc(g)}">${items}</optgroup>` : items;
  }).join("");
  hud.innerHTML = `
    <div class="walk-panel walk-where">
      <span class="eyebrow-sm faint">YOU ARE IN</span>
      <div class="title-md" data-w="zone">—</div>
      <div class="walk-facts mono-xs" data-w="facts"></div>
      <div class="walk-look caption" data-w="look"></div>
    </div>
    <div class="walk-panel walk-tools">
      <select class="walk-select label" data-w="go" aria-label="Go to">${options}</select>
      <button type="button" class="tool label" data-w="fly">Fly</button>
      <button type="button" class="tool label" data-w="quality">${quality === "high" ? "High" : "Fast"}</button>
      <button type="button" class="tool label" data-w="full">Full screen</button>
    </div>
    <div class="walk-cross" aria-hidden="true"></div>
    <div class="walk-start" data-w="start"><button type="button" class="ghost on label" data-w="enter">Click to walk in</button>
      <span class="caption">${coarse ? "Left thumb moves, right thumb looks." : "WASD move · mouse look · Shift run · F fly · Q/E down/up in fly · Esc frees the mouse"}</span></div>
    <div class="walk-foot caption faint">Schematic massing from run ${H.esc(feas.runId)} · ${H.esc(model.method)} · NOT FOR CONSTRUCTION — NOT SEALED</div>
    <div class="walk-stick" data-w="stick" hidden><span></span></div>`;
  host.appendChild(hud);
  const $ = (k) => hud.querySelector(`[data-w="${k}"]`);

  // ---- state & controls -------------------------------------------------------
  const keys = new Set();
  let yaw = 0, pitch = 0, fly = false, locked = false, running = true;
  const pos = new THREE.Vector3();
  const stick = { active: false, id: null, x: 0, y: 0, cx: 0, cy: 0 };
  const look = { id: null, x: 0, y: 0 };

  function goTo(id) {
    const sp = model.spawns.find((s) => s.id === id) || model.spawns.find((s) => s.id === model.start);
    pos.set(sp.x, sp.y, sp.z); yaw = sp.yaw; pitch = sp.pitch || 0; fly = !!sp.fly;
    $("fly").classList.toggle("on", fly);
    $("go").value = sp.id;
  }
  if (opts.pose && opts.pose.runId === feas.runId) { pos.fromArray(opts.pose.p); yaw = opts.pose.yaw; pitch = opts.pose.pitch; fly = opts.pose.fly; $("go").value = opts.pose.spawn || model.start; }
  else goTo(opts.spawn || model.start);

  const canvasEl = renderer.domElement;
  const onLockChange = () => { locked = document.pointerLockElement === canvasEl; $("start").hidden = locked || coarse; };
  document.addEventListener("pointerlockchange", onLockChange);
  $("enter").addEventListener("click", () => { if (!coarse && canvasEl.requestPointerLock) canvasEl.requestPointerLock(); $("start").hidden = true; canvasEl.focus(); });
  canvasEl.addEventListener("click", () => { if (!coarse && !locked && canvasEl.requestPointerLock) canvasEl.requestPointerLock(); });
  const onMouse = (e) => {
    if (!locked) return;
    yaw -= e.movementX * 0.0022; pitch -= e.movementY * 0.0022;
    pitch = Math.max(-1.45, Math.min(1.45, pitch));
  };
  document.addEventListener("mousemove", onMouse);
  const onKeyDown = (e) => {
    if (!locked && document.activeElement !== canvasEl) return;
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "q", "e", "shift", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) { keys.add(k); e.preventDefault(); }
    if (k === "f") toggleFly();
  };
  const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => keys.clear());

  function toggleFly() {
    fly = !fly;
    if (!fly) { pos.y = EYE; if (hash.blocked(pos.x, pos.z)) unstick(); }
    $("fly").classList.toggle("on", fly);
  }
  // Step out of a wall if a mode change or a branch change dropped us in one.
  function unstick() {
    for (let r = 0.5; r < 30; r += 0.5) for (let a = 0; a < 16; a++) {
      const x = pos.x + Math.cos(a * Math.PI / 8) * r, z = pos.z + Math.sin(a * Math.PI / 8) * r;
      if (!hash.blocked(x, z)) { pos.x = x; pos.z = z; return; }
    }
  }
  $("fly").addEventListener("click", toggleFly);
  $("go").addEventListener("change", (e) => { goTo(e.target.value); canvasEl.focus(); });
  $("quality").addEventListener("click", () => { if (opts.onQuality) opts.onQuality(quality === "high" ? "low" : "high"); });
  $("full").addEventListener("click", () => { if (document.fullscreenElement) document.exitFullscreen(); else if (host.requestFullscreen) host.requestFullscreen(); });

  // Touch: left third is a joystick, the rest drags the view.
  if (coarse) {
    $("stick").hidden = false; $("start").hidden = true;
    canvasEl.addEventListener("touchstart", (e) => {
      const rect = canvasEl.getBoundingClientRect();
      for (const t of e.changedTouches) {
        if (t.clientX - rect.left < rect.width * 0.4 && stick.id === null) { stick.id = t.identifier; stick.cx = t.clientX; stick.cy = t.clientY; stick.x = stick.y = 0; }
        else if (look.id === null) { look.id = t.identifier; look.x = t.clientX; look.y = t.clientY; }
      }
      e.preventDefault();
    }, { passive: false });
    canvasEl.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stick.id) {
          stick.x = Math.max(-1, Math.min(1, (t.clientX - stick.cx) / 50)); stick.y = Math.max(-1, Math.min(1, (t.clientY - stick.cy) / 50));
          const knob = $("stick").firstElementChild; knob.style.transform = `translate(${stick.x * 28}px, ${stick.y * 28}px)`;
        } else if (t.identifier === look.id) {
          yaw -= (t.clientX - look.x) * 0.005; pitch -= (t.clientY - look.y) * 0.005; pitch = Math.max(-1.45, Math.min(1.45, pitch));
          look.x = t.clientX; look.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) { if (t.identifier === stick.id) { stick.id = null; stick.x = stick.y = 0; $("stick").firstElementChild.style.transform = ""; } if (t.identifier === look.id) look.id = null; } };
    canvasEl.addEventListener("touchend", end); canvasEl.addEventListener("touchcancel", end);
  }

  // ---- sizing -----------------------------------------------------------------
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === "high" ? 2 : 1.25));
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  // ---- the loop -----------------------------------------------------------------
  let last = performance.now(), poolT = 0, hudT = 0, indoor = 0, lastIndoor = -1, zoneId = null;
  const fwd = new THREE.Vector3(), right = new THREE.Vector3();

  function step(dt) {
    let mx = 0, mz = 0, my = 0;
    if (keys.has("w") || keys.has("arrowup")) mz += 1;
    if (keys.has("s") || keys.has("arrowdown")) mz -= 1;
    if (keys.has("a") || keys.has("arrowleft")) mx -= 1;
    if (keys.has("d") || keys.has("arrowright")) mx += 1;
    if (keys.has("e") || keys.has(" ")) my += 1;
    if (keys.has("q")) my -= 1;
    mx += stick.x; mz -= stick.y;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const speed = fly ? FLY_SPEED * (keys.has("shift") ? 3 : 1) : (keys.has("shift") ? RUN_SPEED : WALK_SPEED);
    fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    if (fly) {
      const cp = Math.cos(pitch);
      const dx = (fwd.x * cp * mz + right.x * mx) * speed * dt, dz = (fwd.z * cp * mz + right.z * mx) * speed * dt;
      pos.x += dx; pos.z += dz; pos.y += (Math.sin(pitch) * mz + my) * speed * dt;
      pos.y = Math.max(EYE, Math.min(900, pos.y));
    } else {
      const dx = (fwd.x * mz + right.x * mx) * speed * dt, dz = (fwd.z * mz + right.z * mx) * speed * dt;
      if (!hash.blocked(pos.x + dx, pos.z)) pos.x += dx;
      if (!hash.blocked(pos.x, pos.z + dz)) pos.z += dz;
      // A gentle walking bob.
      const moving = Math.abs(dx) + Math.abs(dz) > 1e-4;
      pos.y = EYE + (moving ? Math.sin(performance.now() / (keys.has("shift") ? 110 : 170)) * 0.025 : 0);
    }
    camera.position.copy(pos);
    camera.rotation.set(pitch, yaw, 0);
  }

  function inside() {
    for (const b of buildings) if (pos.x > b.x0 && pos.x < b.x1 && pos.z > b.z0 && pos.z < b.z1 && pos.y < model.hall.wall_h) return b;
    return null;
  }

  function updateLights(dt) {
    const inB = inside();
    indoor += ((inB ? 1 : 0) - indoor) * Math.min(1, dt * 3);
    sun.intensity = 3.2 * (1 - indoor * 0.85);
    hemi.intensity = 1.1 * (1 - indoor * 0.9);
    ambientIn.intensity = 0.22 * indoor;
    renderer.toneMappingExposure = 1.0 - indoor * 0.2;
    if (Math.abs(indoor - lastIndoor) > 0.01) {
      lastIndoor = indoor;
      for (const k in M) M[k].envMapIntensity = M[k].userData.envBase * (1 - indoor * 0.75);
    }
    scene.fog.near = 400 - indoor * 300;
    // keep the shadow box centred on the camera
    const c = new THREE.Vector3(pos.x, 0, pos.z);
    sun.target.position.copy(c);
    sun.position.copy(c).addScaledVector(sunDir, 300);
    poolT -= dt;
    if (poolT <= 0) {
      poolT = 0.25;
      if (inB) {
        const near = model.fixtures
          .map((f) => [f, (f.x - pos.x) ** 2 + (f.z - pos.z) ** 2])
          .filter((p) => p[1] < 900)
          .sort((a, b) => a[1] - b[1]).slice(0, POOL);
        pool.forEach((l, i) => {
          const f = near[i];
          if (f) { l.position.set(f[0].x, f[0].y - 0.15, f[0].z); l.intensity = 55; } else l.intensity = 0;
        });
      } else pool.forEach((l) => { l.intensity = 0; });
    }
  }

  function updateHud(dt) {
    hudT -= dt;
    if (hudT > 0) return;
    hudT = 0.2;
    const z = H.WALK.zoneAt(model, pos.x, pos.z);
    const id = z ? z.id : "outside";
    if (id !== zoneId) {
      zoneId = id;
      $("zone").textContent = z ? z.name : "Outside the site";
      const facts = (z && z.facts) || [];
      const cnt = ((z && z.counts) || []).map((k) => model.counts[k]).filter(Boolean)
        .map((c) => `<div><b>${H.esc(c.unit.charAt(0).toUpperCase() + c.unit.slice(1))}</b><span title="${H.esc(c.method + " · from " + c.inputs.join(", ") + (c.note ? " · " + c.note : ""))}">${H.fmt(c.value, "")} campus · derived</span></div>`).join("");
      $("facts").innerHTML = facts.map((f) => `<div><b>${H.esc(f[0])}</b><span>${H.esc(f[1])}</span></div>`).join("") + cnt;
    }
    // What the crosshair is on.
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    const hit = hash.pick(pos.x, pos.y, pos.z, dir.x, dir.y, dir.z, fly ? 0 : 8);
    let label = "";
    if (hit) {
      const b = tagged.find((t) => Math.abs(t.x - (hit.box.x0 + hit.box.x1) / 2) < 0.01 && Math.abs(t.z - (hit.box.z0 + hit.box.z1) / 2) < 0.01);
      const name = LABEL[hit.box.kind] || "";
      if (name) label = name + (b && b.tag ? " " + b.tag : "") + (b && b.unit ? " #" + b.unit : "") + (b && b.room ? " · " + b.room : "") + (b && b.row ? " · row " + b.row : "") + " · " + hit.t.toFixed(1) + " m";
    }
    $("look").textContent = label;
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    blinkU.value = now / 1000;
    step(dt);
    updateLights(dt);
    updateHud(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    model,
    renderer,
    pose() { return { runId: feas.runId, p: pos.toArray(), yaw, pitch, fly, spawn: $("go").value }; },
    goTo,
    // For tests and screenshots: render one frame now.
    renderOnce() { step(0); for (let i = 0; i < 6; i++) updateLights(1); poolT = 0; updateLights(0); hudT = 0; updateHud(0); renderer.render(scene, camera); },
    dispose() {
      running = false;
      ro.disconnect();
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouse);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      if (document.pointerLockElement === canvasEl) document.exitPointerLock();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        ms.forEach((m) => { ["map", "emissiveMap", "roughnessMap"].forEach((k) => m[k] && m[k].dispose()); m.dispose(); });
      });
      envTex.dispose(); pmrem.dispose();
      renderer.dispose();
      host.innerHTML = "";
    }
  };
}
