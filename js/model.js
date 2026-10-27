/* H.A.C.D — the Scenario spine.
   One source of truth. Every panel is a view of it, every sheet a render of it,
   and nothing on screen holds its own copy of a number. */

window.HACD = window.HACD || {};

(function (H) {
  "use strict";

  // ---- typed quantities -------------------------------------------------
  // basis: "given"   came from a document or the user, with a citation
  //        "derived" a method computed it from named inputs
  //        "assumed" somebody decided it; it carries a tolerance and an owner

  H.q = function (value, unit, basis, source, extra) {
    return Object.assign({ value: value, unit: unit, basis: basis, source: source }, extra || {});
  };

  H.derived = function (value, unit, inputs, method, note) {
    return { value: value, unit: unit, basis: "derived", inputs: inputs, method: method, source: method, note: note };
  };

  // Unit conversion is a library call, never inline arithmetic.
  var CONV = {
    "sf>ac": function (v) { return v / 43560; },
    "ac>sf": function (v) { return v * 43560; },
    "mi>ft": function (v) { return v * 5280; },
    "gal>Mgal": function (v) { return v / 1e6; },
    "kW>MW": function (v) { return v / 1000; },
    "MW>kW": function (v) { return v * 1000; },
    "t>kt": function (v) { return v / 1000; }
  };

  H.convert = function (value, from, to) {
    if (from === to) return value;
    var fn = CONV[from + ">" + to];
    if (!fn) throw new Error("no conversion " + from + " to " + to);
    return fn(value);
  };

  H.fmt = function (value, unit, dp) {
    if (value === null || value === undefined || !isFinite(value)) return "—";
    var d = dp === undefined ? 0 : dp;
    var n = Number(value).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    return unit ? n + " " + unit : n;
  };

  H.money = function (value) {
    if (!isFinite(value)) return "—";
    if (Math.abs(value) >= 1e9) return "$" + (value / 1e9).toFixed(2) + "B";
    if (Math.abs(value) >= 1e6) return "$" + (value / 1e6).toFixed(1) + "M";
    return "$" + Math.round(value).toLocaleString("en-US");
  };

  // ---- the rate book ----------------------------------------------------
  // Every rate carries a source. A rate with no source cannot be used.

  H.RATE_BOOK = {
    id: "rb-2026.2",
    source: "Internal rate book rb-2026.2 (Gulf Coast, 2026 Q3 basis)",
    shell_psf: 285,
    fitout_per_mw: 5_600_000,
    cooling_per_mw_evap: 1_250_000,
    cooling_per_mw_dry: 1_690_000,
    substation_per_mva: 310_000,
    interconnect_per_mi: 4_200_000,
    fiber_per_mi: 190_000,
    sitework_per_ac: 62_000,
    soft_cost_pct: 0.11
  };

  H.CARBON = {
    source: "EC3 median EPDs, 2026 Q1 pull",
    shell_kgco2e_psf: 46,
    grid_kgco2e_mwh: 371, // ERCOT 2025 average
    pue_ref: 1.4
  };

  // ---- the default pack -------------------------------------------------
  // In the product these atoms arrive from Intake with page citations.
  // Here the demo pack carries the same shape so provenance is real, not decorative.

  H.DEMO = {
    identity: {
      name: "Coastal Bend AI Campus",
      jurisdiction: "Nueces County, TX",
      iso: "ERCOT",
      currency: "USD"
    },
    site: { acres: 280, setback_ft: 120, flood_zone: "X", zoning_ok: true, lat: 27.8621, lon: -97.3184 },
    demand: { target_mw: 180, rack_kw: 42, diversity: 0.82 },
    power: { poi_available_mw: 220, poi_distance_mi: 2.1, redundancy: "N+1", xfmr_mva: 75 },
    cooling: { dry_cooling: false, pue: 1.22, wue: 0.4 },
    water: { available_mgy: 520 },
    network: { fiber_distance_mi: 4.4, fiber_routes: 2 },
    env: { noise_db_at_boundary: 57, noise_limit_db: 60 },
    space: { density_w_sf: 150, cooling_ratio: 0.35, parking_per_100_staff: 0.8, staff_per_100mw: 45 },
    commercial: { escalation_pct: 4.2, contingency_pct: 12 },
    time: { start_year: 2027, start_quarter: 1, phases: 4 }
  };

  // Provenance for every given and assumed input, keyed by path.
  H.DEMO_PROV = {
    "identity.name":          { basis: "given",   source: "ITT A-3, cover" },
    "identity.jurisdiction":  { basis: "given",   source: "ITT A-3 §1.2" },
    "identity.iso":           { basis: "given",   source: "ITT A-3 §1.2" },
    "site.acres":             { basis: "given",   source: "Site pack p.3, survey 2026-04" },
    "site.setback_ft":        { basis: "given",   source: "Nueces Co. zoning ord. §18-4" },
    "site.flood_zone":        { basis: "given",   source: "FEMA FIRM 48355C0410J" },
    "site.zoning_ok":         { basis: "given",   source: "Pre-application letter 2026-05-11" },
    "demand.target_mw":       { basis: "given",   source: "ITT A-3 §2.1" },
    "demand.rack_kw":         { basis: "given",   source: "ITT A-3 §2.4" },
    "demand.diversity":       { basis: "assumed", source: "owner: unassigned", tol: [0.76, 0.88], why: "No measured profile in the pack. Drives IT load and therefore cost." },
    "power.poi_available_mw": { basis: "given",   source: "Utility letter 2026-06-02 p.1" },
    "power.poi_distance_mi":  { basis: "given",   source: "Utility letter 2026-06-02 p.2" },
    "power.redundancy":       { basis: "given",   source: "ITT A-3 §3.1" },
    "power.xfmr_mva":         { basis: "assumed", source: "owner: unassigned", tol: [60, 90], why: "Standard frame not confirmed with the utility." },
    "cooling.dry_cooling":    { basis: "given",   source: "ITT A-3 §4.2 (option)" },
    "cooling.pue":            { basis: "assumed", source: "owner: unassigned", tol: [1.16, 1.3], why: "Design target, not a measured annualised figure." },
    "cooling.wue":            { basis: "assumed", source: "owner: unassigned", tol: [0.32, 0.5], why: "Climate-dependent; no TMY run yet." },
    "water.available_mgy":    { basis: "given",   source: "Utility letter 2026-06-02 p.3" },
    "network.fiber_distance_mi": { basis: "given", source: "Carrier desktop study 2026-05" },
    "network.fiber_routes":   { basis: "given",   source: "Carrier desktop study 2026-05" },
    "env.noise_db_at_boundary": { basis: "assumed", source: "owner: unassigned", tol: [54, 63], why: "Modelled from equipment schedules, not measured." },
    "env.noise_limit_db":     { basis: "given",   source: "Nueces Co. noise ord. §22-9" },
    "space.density_w_sf":     { basis: "assumed", source: "owner: unassigned", tol: [130, 175], why: "Hall density band for this rack class." },
    "space.cooling_ratio":    { basis: "assumed", source: "owner: unassigned", tol: [0.3, 0.42], why: "Plant footprint as a fraction of hall area." },
    "commercial.escalation_pct": { basis: "assumed", source: "owner: unassigned", tol: [2.8, 6.0], why: "Gulf Coast construction escalation to midpoint." },
    "commercial.contingency_pct": { basis: "given", source: "Practice standard, schematic stage" },
    "time.start_year":        { basis: "given",   source: "ITT A-3 §6.1" }
  };

  // ---- branches ---------------------------------------------------------
  // Each is a full Scenario, so options compare on identical bases.

  H.BRANCHES = [
    {
      id: "baseline",
      name: "Baseline",
      note: "The pack as received.",
      apply: function (s) { return s; }
    },
    {
      id: "accelerated",
      name: "Accelerated",
      note: "Three phases instead of four, premium procurement, same load.",
      apply: function (s) {
        s.time.phases = 3;
        s.commercial.escalation_pct = s.commercial.escalation_pct + 1.6;
        s.commercial.contingency_pct = s.commercial.contingency_pct + 3;
        return s;
      }
    },
    {
      id: "constrained",
      name: "Constrained",
      note: "Dry cooling and a trimmed load to live inside the POI and the water letter.",
      apply: function (s) {
        s.cooling.dry_cooling = true;
        s.cooling.pue = 1.31;
        s.demand.target_mw = Math.round(s.demand.target_mw * 0.82);
        return s;
      }
    }
  ];

  H.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  H.get = function (obj, path) {
    return path.split(".").reduce(function (a, k) { return a == null ? a : a[k]; }, obj);
  };

  H.set = function (obj, path, value) {
    var keys = path.split(".");
    var last = keys.pop();
    var tgt = keys.reduce(function (a, k) { return a[k]; }, obj);
    tgt[last] = value;
  };

  // Seeded PRNG so a replay with identical inputs produces an identical result.
  H.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
})(window.HACD);
