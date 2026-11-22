/* H.A.C.D — site evidence (ADR-001, action item 1).
   Evidence is context with a date, an accuracy, a licence and a review state.
   It never overwrites a Scenario value. It can only:
     - source an input that has no provenance (complete, permitted, matching evidence only),
     - corroborate an input that already has provenance, or
     - flag a conflict.
   The contract is contracts/site-evidence-record.schema.json. */

window.HACD = window.HACD || {};

(function (H) {
  "use strict";

  // IUGG mean Earth radius. Used only to say whether evidence points at the site.
  var EARTH_RADIUS_KM = 6371.0088;
  // One degree of latitude, to turn a coordinate's last decimal into a distance.
  var KM_PER_DEG_LAT = 111.32;

  H.EVIDENCE_REQUIRED = [
    "id", "source_type", "source_ref", "captured_at", "crs", "location", "accuracy",
    "licence", "chain_of_custody", "confidence", "review", "revalidate_by", "permitted_uses", "facts"
  ];

  function blank(v) {
    return v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
  }

  // Contract checks the console relies on. The full schema is checked in tests.
  // A record with any issue renders as incomplete evidence and sources nothing.
  H.validateEvidence = function (rec) {
    var issues = [];
    if (!rec || typeof rec !== "object") return ["not a record"];
    H.EVIDENCE_REQUIRED.forEach(function (k) {
      if (blank(rec[k])) issues.push("missing " + k);
    });
    if (rec.source_ref && blank(rec.source_ref.title)) issues.push("missing source_ref.title");
    if (rec.accuracy && (blank(rec.accuracy.kind) || blank(rec.accuracy.note))) issues.push("accuracy needs kind and note");
    if (rec.review) {
      if (blank(rec.review.state)) issues.push("missing review.state");
      if (rec.review.state !== "unreviewed" && (!rec.review.reviewer || !rec.review.reviewed_at)) {
        issues.push("review." + rec.review.state + " needs reviewer and reviewed_at");
      }
    }
    (rec.facts || []).forEach(function (f, i) {
      if (!f || blank(f.path) || f.value === undefined || f.value === null || f.unit === undefined) {
        issues.push("fact " + i + " needs path, value and unit");
      }
    });
    return issues;
  };

  function decimals(n) {
    var s = String(n);
    var i = s.indexOf(".");
    return i < 0 ? 0 : s.length - i - 1;
  }

  // Equal at the precision the evidence states, and no finer:
  // 1.22 matches 1.2201, but 30.26 never matches 27.8621.
  H.evidenceMatches = function (scenarioValue, evidenceValue) {
    if (typeof scenarioValue === "number" && typeof evidenceValue === "number") {
      var halfStep = 0.5 * Math.pow(10, -decimals(evidenceValue));
      return Math.abs(scenarioValue - evidenceValue) <= halfStep + 1e-12;
    }
    return scenarioValue === evidenceValue;
  };

  H.distanceKm = function (a, b) {
    var rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad;
    var dLon = (b.lon - a.lon) * rad;
    var h = Math.pow(Math.sin(dLat / 2), 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.pow(Math.sin(dLon / 2), 2);
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  };

  // How far evidence may sit from the Scenario's point and still describe this site:
  // the radius of a circle of the site's area, plus the evidence's own stated
  // accuracy, plus the rounding of its coordinates.
  H.siteToleranceKm = function (scenario, rec) {
    var areaKm2 = H.convert(scenario.site.acres, "ac", "km2");
    var radius = Math.sqrt(areaKm2 / Math.PI);
    var acc = rec.accuracy && typeof rec.accuracy.horizontal_m === "number" ? H.convert(rec.accuracy.horizontal_m, "m", "km") : 0;
    var dp = Math.min(decimals(rec.location.lat), decimals(rec.location.lon));
    var rounding = 0.5 * Math.pow(10, -dp) * KM_PER_DEG_LAT;
    return radius + acc + rounding;
  };

  function sourceLabel(rec, fact) {
    var where = fact.locator || rec.source_ref.locator;
    return rec.source_ref.title + (where ? " · " + where : "") + " [" + rec.id + "]";
  }

  // Fold a dossier into the provenance map. Returns a new map and the findings;
  // neither the Scenario nor the given map is changed.
  // opts.asOf ("YYYY-MM-DD") turns on the revalidation check; without it, no clock is read.
  H.applyEvidence = function (scenario, prov, records, opts) {
    var out = H.clone(prov);
    var findings = [];
    var asOf = opts && opts.asOf;

    function note(entry) { findings.push(entry); }

    function annotate(path, rec, fact, status) {
      out[path].evidence = (out[path].evidence || []).concat([{
        id: rec.id, status: status, value: fact.value, unit: fact.unit
      }]);
    }

    (records || []).forEach(function (rec) {
      var issues = H.validateEvidence(rec);
      var blocked = [];
      if (issues.length) {
        note({ record: rec && rec.id, status: "incomplete_evidence", detail: issues.join("; ") });
        blocked.push("incomplete evidence");
      }
      if (rec.review && rec.review.state === "rejected") {
        note({ record: rec.id, status: "rejected", detail: "Rejected by " + rec.review.reviewer + "; ignored." });
        return;
      }
      if (asOf && rec.revalidate_by && rec.revalidate_by < asOf) {
        note({ record: rec.id, status: "expired", detail: "Revalidate by " + rec.revalidate_by + " has passed." });
        blocked.push("past its revalidation date");
      }
      if (rec.location && scenario.site && typeof scenario.site.lat === "number" && typeof scenario.site.lon === "number") {
        var km = H.distanceKm(rec.location, scenario.site);
        var tol = H.siteToleranceKm(scenario, rec);
        if (km > tol) {
          note({
            record: rec.id, status: "location_mismatch",
            detail: "Evidence point " + rec.location.lat + ", " + rec.location.lon + " is " + km.toFixed(1) +
              " km from the Scenario's site (tolerance " + tol.toFixed(2) + " km)."
          });
          blocked.push("points somewhere else");
        }
      }
      if (rec.source_type === "model_output") blocked.push("a model output cannot source an input");
      if ((rec.permitted_uses || []).indexOf("scenario_input") < 0) blocked.push("not permitted as a scenario input");

      (rec.facts || []).forEach(function (fact) {
        if (!fact || !fact.path) return;
        var current = H.get(scenario, fact.path);
        var base = { record: rec.id, path: fact.path, evidence_value: fact.value, unit: fact.unit, scenario_value: current };
        if (current === undefined) {
          note(Object.assign(base, { status: "not_in_scenario", detail: "Kept as evidence; the Scenario has no such input." }));
          return;
        }
        var match = H.evidenceMatches(current, fact.value);
        var has = Object.prototype.hasOwnProperty.call(out, fact.path);
        if (!match) {
          if (has) annotate(fact.path, rec, fact, "conflict");
          note(Object.assign(base, { status: "conflict", detail: "Evidence says " + fact.value + (fact.unit ? " " + fact.unit : "") + "; the Scenario says " + current + "." }));
        } else if (has) {
          annotate(fact.path, rec, fact, "corroborates");
          note(Object.assign(base, { status: "corroborates", detail: "Matches; existing provenance kept." }));
        } else if (blocked.length) {
          note(Object.assign(base, { status: "context_only", detail: "Matches, but cannot source it: " + blocked.join("; ") + "." }));
        } else {
          out[fact.path] = {
            basis: "given",
            source: sourceLabel(rec, fact),
            evidence: [{ id: rec.id, status: "sources", value: fact.value, unit: fact.unit }],
            review: rec.review.state,
            confidence: rec.confidence
          };
          note(Object.assign(base, { status: "sources", detail: "Supplies provenance for an input that had none." }));
        }
      });
    });
    return { prov: out, findings: findings };
  };

  // ---- the sample dossier --------------------------------------------------
  // Transcribed from the owner's Oct 18 feasibility export of this campus
  // (hacd-package.xlsx). The file itself is private, so it is cited by name, not link.
  // Every record is unreviewed until a person signs it off.

  var EXPORT = { at: "2026-10-18T14:34:31Z", actor: "H.A.C.D. web export (hacd-package.xlsx)", action: "exported" };
  var TRANSCRIBED = { at: "2026-11-22T20:30:00Z", actor: "Claude (H.A.C.D. agent)", action: "transcribed" };
  var UNREVIEWED = { state: "unreviewed", reviewer: null, reviewed_at: null };
  var WORKBOOK = "hacd-package.xlsx (H.A.C.D. feasibility export, 2026-10-18)";
  var POINT = { lat: 30.26, lon: -97.79 };

  H.SITE_EVIDENCE = [
    {
      id: "ev-cb-workbook-inputs",
      source_type: "document",
      source_ref: { title: WORKBOOK, locator: "Inputs tab" },
      captured_at: EXPORT.at,
      crs: "EPSG:4326",
      location: POINT,
      accuracy: {
        kind: "unknown", horizontal_m: null,
        note: "Two-decimal coordinates (about 1 km) with no survey basis; WGS 84 is assumed, the file does not say."
      },
      licence: "Owner's working file; internal use",
      chain_of_custody: [EXPORT, TRANSCRIBED],
      confidence: "low",
      review: UNREVIEWED,
      revalidate_by: "2027-02-20",
      permitted_uses: ["context", "scenario_input"],
      facts: [
        { path: "identity.name", value: "Coastal Bend AI Campus", unit: null },
        { path: "identity.jurisdiction", value: "Nueces County, TX", unit: null, locator: "jurisdiction, read as 'Nueces County, TX (ERCOT)'" },
        { path: "identity.iso", value: "ERCOT", unit: null, locator: "jurisdiction, the '(ERCOT)' suffix" },
        { path: "site.acres", value: 280, unit: "ac" },
        { path: "site.lat", value: 30.26, unit: "deg" },
        { path: "site.lon", value: -97.79, unit: "deg" },
        { path: "site.zip", value: "78401", unit: null },
        { path: "site.flood_zone", value: "X", unit: null },
        { path: "site.setback_ft", value: 120, unit: "ft" },
        { path: "site.zoning_ok", value: true, unit: null, locator: "zoning ok = yes" },
        { path: "demand.target_mw", value: 180, unit: "MW" },
        { path: "power.poi_available_mw", value: 220, unit: "MW", locator: "available mw at poii" },
        { path: "power.poi_distance_mi", value: 2.1, unit: "mi", locator: "poii distance mi" },
        { path: "power.redundancy", value: "N+1", unit: null },
        { path: "cooling.dry_cooling", value: false, unit: null, locator: "dry cooling = no" },
        { path: "cooling.pue", value: 1.22, unit: null },
        { path: "water.available_mgy", value: 520, unit: "MGY" },
        { path: "network.fiber_distance_mi", value: 4.4, unit: "mi" },
        { path: "network.fiber_routes", value: 2, unit: null, locator: "fiber carriers = 2 (Fiber tab: 2 laterals)" },
        { path: "env.noise_db_at_boundary", value: 57, unit: "dBA" }
      ],
      notes: "Internally inconsistent: the coordinates fall near Austin (Travis County), while the jurisdiction and ZIP 78401 are Nueces County / Corpus Christi."
    },
    {
      id: "ev-cb-workbook-outputs",
      source_type: "model_output",
      source_ref: { title: WORKBOOK, locator: "Program, Phasing and Cost tabs" },
      captured_at: EXPORT.at,
      crs: "EPSG:4326",
      location: POINT,
      accuracy: { kind: "unknown", horizontal_m: null, note: "Computed by an earlier H.A.C.D. build from the Inputs tab; no independent measurement." },
      licence: "Owner's working file; internal use",
      chain_of_custody: [EXPORT, TRANSCRIBED],
      confidence: "low",
      review: UNREVIEWED,
      revalidate_by: "2027-02-20",
      permitted_uses: ["context"],
      facts: [
        { path: "demand.rack_kw", value: 120, unit: "kW", locator: "Program tab, density profile ai_liquid_dlc" },
        { path: "cooling.wue", value: 0.25, unit: "L/kWh", locator: "Program tab, wue l per kwh" },
        { path: "space.staff_per_100mw", value: 45, unit: "staff/100 MW", locator: "Program tab: staff 81 at 180 MW (81 / 180 x 100)" },
        { path: "space.parking_per_100_staff", value: 0.8, unit: "ac/100 staff", locator: "Program tab: parking 0.648 ac for 81 staff (0.648 / 81 x 100)" },
        { path: "time.phases", value: 2, unit: null, locator: "Phasing tab: 100 MW then 80 MW" },
        { path: "identity.currency", value: "USD", unit: null, locator: "Cost tab, figures in musd" }
      ],
      notes: "The tool's own earlier answer. It can show agreement or disagreement, never be the source of an input."
    },
    {
      id: "ev-cb-usgs-3dep-elevation",
      source_type: "public_dataset",
      source_ref: { title: "USGS Elevation Point Query Service (3DEP)", locator: "Point query at 30.26, -97.79", uri: "https://apps.nationalmap.gov/epqs/" },
      captured_at: "2026-10-18T14:34:00Z",
      crs: "EPSG:4326",
      location: POINT,
      accuracy: { kind: "nominal", horizontal_m: null, note: "Five samples within 1,970 ft; a coarse screen, not a topographic survey." },
      licence: "Public domain (U.S. Geological Survey)",
      chain_of_custody: [
        { at: "2026-10-18T14:34:00Z", actor: "H.A.C.D. web export screening lookup", action: "queried" },
        EXPORT, TRANSCRIBED
      ],
      confidence: "medium",
      review: UNREVIEWED,
      revalidate_by: "2027-04-18",
      permitted_uses: ["context", "screening"],
      facts: [
        { path: "site.elevation_ft", value: 590, unit: "ft" },
        { path: "site.relief_ft", value: 96, unit: "ft", locator: "relief across 5 samples within 1,970 ft" }
      ]
    },
    {
      id: "ev-cb-usfws-ecos-critical-habitat",
      source_type: "public_dataset",
      source_ref: { title: "USFWS ECOS Critical Habitat (final layer 0, proposed layer 2)", locator: "Within 1 mi of 30.26, -97.79", uri: "https://ecos.fws.gov/ecp/report/table/critical-habitat.html" },
      captured_at: "2026-10-18T14:34:00Z",
      crs: "EPSG:4326",
      location: POINT,
      accuracy: { kind: "unknown", horizontal_m: null, note: "Desktop layer; not a field determination." },
      licence: "Public domain (U.S. Fish and Wildlife Service)",
      chain_of_custody: [
        { at: "2026-10-18T14:34:00Z", actor: "H.A.C.D. web export screening lookup", action: "queried" },
        EXPORT, TRANSCRIBED
      ],
      confidence: "medium",
      review: UNREVIEWED,
      revalidate_by: "2027-04-18",
      permitted_uses: ["context", "screening"],
      facts: [
        { path: "env.critical_habitat_within_1mi", value: 2, unit: "designations", locator: "Austin blind salamander (E); bracted twistflower (T)" }
      ],
      notes: "Both species are central Texas listings, which fits the queried point and not Nueces County."
    }
  ];

  // The console starts from this map: the declared provenance plus what the evidence adds.
  var applied = H.applyEvidence(H.DEMO, H.DEMO_PROV, H.SITE_EVIDENCE);
  H.PROV = applied.prov;
  H.EVIDENCE_FINDINGS = applied.findings;
})(window.HACD);
