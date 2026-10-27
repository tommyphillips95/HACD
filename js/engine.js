/* H.A.C.D — the deterministic engine.
   Where a calculation can be a function, it is a function. Nothing here guesses.
   Every output names the inputs and the method version that produced it. */

(function (H) {
  "use strict";

  var METHOD = {
    sizer: "sizer/v3",
    power: "power/v2",
    water: "water/v2",
    cost: "estimator/v7",
    sched: "scheduler/v4",
    carbon: "impacter/v2",
    risk: "montecarlo/v3"
  };

  H.METHOD = METHOD;

  // A stable id for a run: identical inputs give an identical id, so a replay
  // can be compared against the run it claims to reproduce.
  function runId(scenario) {
    var s = JSON.stringify(scenario);
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) {
      h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 = (Math.imul(h2 ^ s.charCodeAt(i), 0x85ebca6b) >>> 0);
    }
    return (h1.toString(16) + h2.toString(16)).slice(0, 8);
  }

  // ---- sizing -----------------------------------------------------------

  function size(s) {
    var d = {};
    var hallSf = (s.demand.target_mw * 1e6) / s.space.density_w_sf;
    d["space.hall_sf"] = H.derived(hallSf, "sf", ["demand.target_mw", "space.density_w_sf"], METHOD.sizer);

    var hallAc = H.convert(hallSf, "sf", "ac");
    d["space.hall_ac"] = H.derived(hallAc, "ac", ["space.hall_sf"], METHOD.sizer);

    var halls = Math.max(1, Math.ceil(hallSf / 200000));
    d["space.hall_count"] = H.derived(halls, "halls", ["space.hall_sf"], METHOD.sizer, "200,000 sf standard hall module.");

    var coolAc = hallAc * s.space.cooling_ratio * (s.cooling.dry_cooling ? 1.35 : 1);
    d["space.cooling_ac"] = H.derived(coolAc, "ac", ["space.hall_ac", "space.cooling_ratio", "cooling.dry_cooling"], METHOD.sizer,
      s.cooling.dry_cooling ? "Dry coolers carry a 35% footprint premium." : "Evaporative plant footprint.");

    var facilityMw = s.demand.target_mw * s.cooling.pue;
    d["power.facility_mw"] = H.derived(facilityMw, "MW", ["demand.target_mw", "cooling.pue"], METHOD.power,
      "Total facility load at the meter, not IT load.");

    var mva = facilityMw / 0.95;
    d["power.substation_mva"] = H.derived(mva, "MVA", ["power.facility_mw"], METHOD.power, "0.95 power factor.");

    var nXfmr = Math.ceil(mva / s.power.xfmr_mva);
    var spare = s.power.redundancy === "2N" ? nXfmr : (s.power.redundancy === "N+1" ? 1 : 0);
    d["power.xfmr_count"] = H.derived(nXfmr + spare, "units", ["power.substation_mva", "power.xfmr_mva", "power.redundancy"], METHOD.power,
      nXfmr + " working plus " + spare + " for " + s.power.redundancy + ".");

    var subAc = 2.4 * (facilityMw / 100);
    d["space.substation_ac"] = H.derived(subAc, "ac", ["power.facility_mw"], METHOD.sizer);

    var yardAc = 1.1 * (s.demand.target_mw / 100);
    d["space.yard_ac"] = H.derived(yardAc, "ac", ["demand.target_mw"], METHOD.sizer);

    var staff = s.space.staff_per_100mw * (s.demand.target_mw / 100);
    d["space.staff"] = H.derived(staff, "people", ["demand.target_mw", "space.staff_per_100mw"], METHOD.sizer);

    var parkAc = s.space.parking_per_100_staff * (staff / 100);
    d["space.parking_ac"] = H.derived(parkAc, "ac", ["space.staff"], METHOD.sizer);

    var lossFrac = Math.min(0.22, 0.04 + (s.site.setback_ft / 100) * 0.04);
    var usable = s.site.acres * (1 - lossFrac);
    d["site.usable_ac"] = H.derived(usable, "ac", ["site.acres", "site.setback_ft"], METHOD.sizer,
      (lossFrac * 100).toFixed(0) + "% lost to setbacks and easements.");

    var program = hallAc + coolAc + subAc + yardAc + parkAc;
    d["space.program_ac"] = H.derived(program, "ac",
      ["space.hall_ac", "space.cooling_ac", "space.substation_ac", "space.yard_ac", "space.parking_ac"], METHOD.sizer);

    d["space.residual_ac"] = H.derived(usable - program, "ac", ["site.usable_ac", "space.program_ac"], METHOD.sizer);

    var drawMw = s.demand.target_mw * s.demand.diversity;
    d["demand.expected_draw_mw"] = H.derived(drawMw, "MW", ["demand.target_mw", "demand.diversity"], METHOD.power,
      "Expected draw, which is what bills and what cools.");

    var water = s.cooling.dry_cooling ? 0 : (s.cooling.wue * drawMw * 8760 * 1000 * 0.264172) / 1e6;
    d["water.demand_mgy"] = H.derived(water, "MGY", ["cooling.wue", "demand.expected_draw_mw", "cooling.dry_cooling"], METHOD.water,
      s.cooling.dry_cooling ? "Dry path draws no process water." : "WUE times annual IT energy.");

    return d;
  }

  // ---- schedule ---------------------------------------------------------

  function schedule(s, d) {
    var phases = [];
    var mwPerPhase = s.demand.target_mw / s.time.phases;
    var design = 9;
    var cursorQ = (s.time.start_year * 4) + (s.time.start_quarter - 1);
    cursorQ += Math.round(design / 3);

    var first = 20 + (mwPerPhase / 50) * 2;
    for (var i = 0; i < s.time.phases; i++) {
      var months = i === 0 ? first : 11 + (mwPerPhase / 50);
      cursorQ += Math.round(months / 3);
      phases.push({
        n: i + 1,
        mw: mwPerPhase,
        cumulative_mw: mwPerPhase * (i + 1),
        pct: Math.round(((i + 1) / s.time.phases) * 100),
        months: months,
        gate_year: Math.floor(cursorQ / 4),
        gate_q: (cursorQ % 4) + 1
      });
    }
    var total = design + phases.reduce(function (a, p) { return a + p.months; }, 0);
    return {
      design_months: design,
      phases: phases,
      total_months: total,
      midpoint_years: total / 24,
      energisation: phases[0],
      complete: phases[phases.length - 1],
      method: METHOD.sched,
      inputs: ["demand.target_mw", "time.phases", "time.start_year"]
    };
  }

  // ---- cost -------------------------------------------------------------

  function cost(s, d, sched, rb) {
    var lines = [];
    function line(label, qty, unit, rate, rateKey) {
      lines.push({ label: label, qty: qty, unit: unit, rate: rate, amount: qty * rate, rateKey: rateKey });
    }

    line("Shell and core", d["space.hall_sf"].value, "sf", rb.shell_psf, "shell_psf");
    line("IT fit-out", s.demand.target_mw, "MW", rb.fitout_per_mw, "fitout_per_mw");
    line("Cooling plant", s.demand.target_mw, "MW",
      s.cooling.dry_cooling ? rb.cooling_per_mw_dry : rb.cooling_per_mw_evap,
      s.cooling.dry_cooling ? "cooling_per_mw_dry" : "cooling_per_mw_evap");
    line("Substation", d["power.substation_mva"].value, "MVA", rb.substation_per_mva, "substation_per_mva");
    line("Interconnect", s.power.poi_distance_mi, "mi", rb.interconnect_per_mi, "interconnect_per_mi");
    line("Fiber", s.network.fiber_distance_mi * s.network.fiber_routes, "route-mi", rb.fiber_per_mi, "fiber_per_mi");
    line("Sitework", d["space.program_ac"].value, "ac", rb.sitework_per_ac, "sitework_per_ac");

    var direct = lines.reduce(function (a, l) { return a + l.amount; }, 0);
    var soft = direct * rb.soft_cost_pct;
    var escalated = (direct + soft) * Math.pow(1 + s.commercial.escalation_pct / 100, sched.midpoint_years);
    var contingency = escalated * (s.commercial.contingency_pct / 100);
    var total = escalated + contingency;

    return {
      lines: lines,
      direct: direct,
      soft: soft,
      escalation: escalated - direct - soft,
      contingency: contingency,
      total: total,
      per_mw: total / s.demand.target_mw,
      rate_book: rb.id,
      rate_source: rb.source,
      method: METHOD.cost
    };
  }

  // ---- carbon -----------------------------------------------------------

  function carbon(s, d, c) {
    var embodied = (d["space.hall_sf"].value * H.CARBON.shell_kgco2e_psf) / 1000;
    var annual = (d["power.facility_mw"].value * 8760 * H.CARBON.grid_kgco2e_mwh) / 1000;
    var avoided = (d["demand.expected_draw_mw"].value * 8760 * (H.CARBON.pue_ref - s.cooling.pue) * H.CARBON.grid_kgco2e_mwh) / 1000;
    return {
      embodied_t: embodied,
      operational_t_yr: annual,
      avoided_t_yr: avoided,
      source: H.CARBON.source,
      method: METHOD.carbon,
      inputs: ["space.hall_sf", "power.facility_mw", "cooling.pue"]
    };
  }

  // ---- risk: Monte Carlo over the assumption register -------------------
  // Not over the cost lines. Tightening an assumption's tolerance narrows P80,
  // which is the whole point of showing it.

  function risk(s, prov, rb) {
    var assumed = Object.keys(prov).filter(function (p) { return prov[p].basis === "assumed" && prov[p].tol; });
    var rand = H.rng(0x48414344); // pinned seed: replays match
    var N = 2000;
    var totals = new Array(N);

    for (var i = 0; i < N; i++) {
      var trial = H.clone(s);
      for (var j = 0; j < assumed.length; j++) {
        var path = assumed[j];
        var tol = prov[path].tol;
        // triangular around the nominal, so the band's middle is likelier than its edges
        var u = (rand() + rand()) / 2;
        H.set(trial, path, tol[0] + (tol[1] - tol[0]) * u);
      }
      var td = size(trial);
      var ts = schedule(trial, td);
      totals[i] = cost(trial, td, ts, rb).total;
    }
    totals.sort(function (a, b) { return a - b; });

    // Which assumption moves the number most, each swept alone across its band.
    var drivers = assumed.map(function (path) {
      var lo = H.clone(s), hi = H.clone(s);
      H.set(lo, path, prov[path].tol[0]);
      H.set(hi, path, prov[path].tol[1]);
      var dl = size(lo), dh = size(hi);
      var cl = cost(lo, dl, schedule(lo, dl), rb).total;
      var ch = cost(hi, dh, schedule(hi, dh), rb).total;
      return { path: path, swing: Math.abs(ch - cl), low: Math.min(cl, ch), high: Math.max(cl, ch), why: prov[path].why };
    }).sort(function (a, b) { return b.swing - a.swing; });

    return {
      p10: totals[Math.floor(N * 0.1)],
      p50: totals[Math.floor(N * 0.5)],
      p80: totals[Math.floor(N * 0.8)],
      p90: totals[Math.floor(N * 0.9)],
      iterations: N,
      seed: "0x48414344",
      drivers: drivers,
      method: METHOD.risk
    };
  }

  // ---- checks -----------------------------------------------------------

  function checks(s, d, sched) {
    var out = [];
    function add(id, label, status, value, detail, refs) {
      out.push({ id: id, label: label, status: status, value: value, detail: detail, refs: refs });
    }

    var residual = d["space.residual_ac"].value;
    add("land", "Parcel fit",
      residual >= 20 ? "pass" : residual >= 0 ? "warn" : "fail",
      H.fmt(residual, "ac"),
      residual >= 20 ? "Program fits with an expansion pad." : residual >= 0 ? "Fits, but no room to grow." : "Program overflows the parcel.",
      ["space.residual_ac", "site.usable_ac", "space.program_ac"]);

    var head = s.power.poi_available_mw - d["power.facility_mw"].value;
    add("power", "POI injection",
      head >= 25 ? "pass" : head >= 0 ? "warn" : "fail",
      H.fmt(head, "MW"),
      head >= 25 ? "Covers facility load plus contingency." : head >= 0 ? "At the POI limit with no margin." : "Short against facility load, not IT load.",
      ["power.facility_mw", "power.poi_available_mw"]);

    add("interconnect", "Interconnect run",
      s.power.poi_distance_mi <= 3 ? "pass" : s.power.poi_distance_mi <= 6 ? "warn" : "fail",
      H.fmt(s.power.poi_distance_mi, "mi", 1),
      s.power.poi_distance_mi <= 3 ? "Short tap." : "Long run; cost and easement risk.",
      ["power.poi_distance_mi"]);

    add("fiber", "Fiber diversity",
      s.network.fiber_routes >= 2 ? "pass" : "fail",
      s.network.fiber_routes + " routes",
      s.network.fiber_routes >= 2 ? "Diverse entry achievable." : "Single route is not acceptable for this class.",
      ["network.fiber_routes"]);

    var water = d["water.demand_mgy"].value;
    add("water", "Water supply",
      s.cooling.dry_cooling || s.water.available_mgy >= water * 1.15 ? "pass" : s.water.available_mgy >= water ? "warn" : "fail",
      H.fmt(water, "MGY"),
      s.cooling.dry_cooling ? "Dry coolers; no process draw." : s.water.available_mgy >= water * 1.15 ? "Letter covers the load with margin." : s.water.available_mgy >= water ? "Covered, but tight in a drought year." : "Exceeds the utility letter. Needs reuse or dry coolers.",
      ["water.demand_mgy", "water.available_mgy"]);

    add("pue", "Design PUE",
      s.cooling.pue <= 1.25 ? "pass" : s.cooling.pue <= 1.35 ? "warn" : "fail",
      s.cooling.pue.toFixed(2),
      s.cooling.pue <= 1.25 ? "Inside the efficiency target." : "Above target; drives both power and cost.",
      ["cooling.pue"]);

    add("scope", "v1 MW band",
      s.demand.target_mw >= 150 && s.demand.target_mw <= 300 ? "pass" : "warn",
      H.fmt(s.demand.target_mw, "MW"),
      s.demand.target_mw >= 150 && s.demand.target_mw <= 300 ? "Inside the 150–300 MW IT band." : "Outside the v1 band. Still scored, but the rate book is extrapolated.",
      ["demand.target_mw"]);

    add("zoning", "Zoning and setback",
      s.site.zoning_ok ? "pass" : "fail",
      s.site.setback_ft + " ft",
      s.site.zoning_ok ? "Pre-application letter on file." : "Not permitted as zoned.",
      ["site.zoning_ok", "site.setback_ft"]);

    add("noise", "Boundary noise",
      s.env.noise_db_at_boundary <= s.env.noise_limit_db - 3 ? "pass" : s.env.noise_db_at_boundary <= s.env.noise_limit_db ? "warn" : "fail",
      s.env.noise_db_at_boundary.toFixed(0) + " dBA",
      "Ordinance limit " + s.env.noise_limit_db + " dBA.",
      ["env.noise_db_at_boundary", "env.noise_limit_db"]);

    add("flood", "Flood zone",
      s.site.flood_zone === "X" ? "pass" : "warn",
      "Zone " + s.site.flood_zone,
      s.site.flood_zone === "X" ? "Outside the 500-year floodplain." : "Inside a mapped floodplain; fill and insurance apply.",
      ["site.flood_zone"]);

    var xf = d["power.xfmr_count"].value;
    add("redundancy", "Transformer build",
      xf <= 6 ? "pass" : xf <= 9 ? "warn" : "fail",
      xf + " units",
      s.power.redundancy + " at " + s.power.xfmr_mva + " MVA. " + (xf > 6 ? "Large frame count; check the yard and lead times." : "Conventional yard."),
      ["power.xfmr_count", "power.redundancy", "power.xfmr_mva"]);

    return out;
  }

  // ---- the run ----------------------------------------------------------

  H.evaluate = function (scenario, prov) {
    var s = H.clone(scenario);
    var rb = H.RATE_BOOK;
    var d = size(s);
    var sched = schedule(s, d);
    var c = cost(s, d, sched, rb);
    var cb = carbon(s, d, c);
    var r = risk(s, prov, rb);
    var ch = checks(s, d, sched);

    var score = 100;
    ch.forEach(function (x) {
      if (x.status === "warn") score -= 6;
      if (x.status === "fail") score -= 16;
    });
    score = Math.max(0, score);

    var fails = ch.filter(function (x) { return x.status === "fail"; }).length;
    var warns = ch.filter(function (x) { return x.status === "warn"; }).length;
    var verdict = "marginal — rethink program or site";
    if (fails) verdict = "not feasible as drawn";
    else if (score >= 85 && warns <= 1) verdict = "feasible";
    else if (score >= 70) verdict = "feasible with mitigations";

    var assumptions = Object.keys(prov)
      .filter(function (p) { return prov[p].basis === "assumed"; })
      .map(function (p) {
        return { path: p, value: H.get(s, p), tol: prov[p].tol, why: prov[p].why, owner: prov[p].source };
      });

    return {
      site: s, prov: prov, d: d, checks: ch, score: score, verdict: verdict,
      cost: c, schedule: sched, carbon: cb, risk: r, assumptions: assumptions,
      runId: runId(s), rate_book: rb.id,
      methods: METHOD
    };
  };
})(window.HACD);
