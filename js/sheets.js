/* H.A.C.D — the sheet set.
   Every sheet renders from the evaluated Scenario. Change an input and the
   linework moves, because the geometry is computed, not drawn. */

(function (H) {
  "use strict";

  H.SHEETS = [
    ["G-001", "Cover and index"],
    ["G-101", "Basis of design"],
    ["C-101", "Site plan"],
    ["A-101", "Typical IT hall"],
    ["E-101", "Electrical one-line"],
    ["M-101", "Cooling schematic"],
    ["P-101", "Process water balance"],
    ["T-101", "Phasing and gates"],
    ["Z-101", "Cost and risk"],
    ["CD-001", "Schematic transmittal"]
  ];

  var W = 1100, HT = 780, M = 18;
  var BODY = { x: 52, y: 104, w: 996, h: 500 };

  function esc(v) {
    var amp = String.fromCharCode(38);
    return String(v).replaceAll(amp, amp + "amp;").replaceAll("<", amp + "lt;").replaceAll(">", amp + "gt;").replaceAll('"', amp + "quot;");
  }
  H.esc = esc;

  function t(x, y, s, size, opts) {
    var o = opts || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + (size || 13) + '"' +
      ' fill="' + (o.fill || "currentColor") + '"' +
      (o.opacity ? ' opacity="' + o.opacity + '"' : "") +
      (o.anchor ? ' text-anchor="' + o.anchor + '"' : "") +
      (o.weight ? ' font-weight="' + o.weight + '"' : "") +
      (o.mono ? ' font-family="var(--font-mono)"' : "") +
      '>' + esc(s) + '</text>';
  }

  function box(x, y, w, h, opts) {
    var o = opts || {};
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"' +
      ' fill="' + (o.fill || "none") + '" stroke="' + (o.stroke || "currentColor") + '"' +
      ' stroke-width="' + (o.sw || 1) + '"' + (o.dash ? ' stroke-dasharray="' + o.dash + '"' : "") + '/>';
  }

  function northArrow(x, y) {
    return '<g opacity="0.8"><path d="M' + x + ' ' + (y - 20) + 'L' + (x + 8) + ' ' + (y + 8) + 'L' + x + ' ' + (y + 2) +
      'L' + (x - 8) + ' ' + (y + 8) + 'Z" fill="currentColor"/>' + t(x, y + 26, "N", 12, { anchor: "middle", weight: 600 }) + '</g>';
  }

  function scaleBar(x, y, pxPerFt) {
    var ft = 500, px = ft * pxPerFt;
    if (px > 240) { ft = 200; px = ft * pxPerFt; }
    if (px < 60) { ft = 1000; px = ft * pxPerFt; }
    var s = '<g opacity="0.85">';
    s += '<line x1="' + x + '" y1="' + y + '" x2="' + (x + px) + '" y2="' + y + '" stroke="currentColor" stroke-width="2"/>';
    s += '<line x1="' + x + '" y1="' + (y - 5) + '" x2="' + x + '" y2="' + (y + 5) + '" stroke="currentColor" stroke-width="2"/>';
    s += '<line x1="' + (x + px) + '" y1="' + (y - 5) + '" x2="' + (x + px) + '" y2="' + (y + 5) + '" stroke="currentColor" stroke-width="2"/>';
    s += t(x + px / 2, y + 18, ft + " ft", 11, { anchor: "middle", opacity: 0.8 });
    return s + '</g>';
  }

  function dim(x1, y1, x2, y2, label) {
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    return '<g opacity="0.7" stroke="currentColor" stroke-width="1">' +
      '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>' +
      '<line x1="' + x1 + '" y1="' + (y1 - 4) + '" x2="' + x1 + '" y2="' + (y1 + 4) + '"/>' +
      '<line x1="' + x2 + '" y1="' + (y2 - 4) + '" x2="' + x2 + '" y2="' + (y2 + 4) + '"/>' +
      '</g>' + t(mx, my - 6, label, 10, { anchor: "middle", opacity: 0.8 });
  }

  // ---- title block ------------------------------------------------------

  function titleBlock(id, title, f) {
    var x = 700, y = 614, w = 348, h = 148;
    var s = box(x, y, w, h, { sw: 1.5 });
    s += '<line x1="' + x + '" y1="' + (y + 34) + '" x2="' + (x + w) + '" y2="' + (y + 34) + '" stroke="currentColor"/>';
    s += '<line x1="' + x + '" y1="' + (y + 86) + '" x2="' + (x + w) + '" y2="' + (y + 86) + '" stroke="currentColor"/>';
    s += '<line x1="' + (x + 232) + '" y1="' + (y + 86) + '" x2="' + (x + 232) + '" y2="' + (y + h) + '" stroke="currentColor"/>';
    s += t(x + 12, y + 22, "H.A.C.D.", 14, { weight: 600 });
    s += t(x + w - 12, y + 22, f.site.identity.name, 11, { anchor: "end", opacity: 0.75 });
    s += t(x + 12, y + 58, id, 19, { weight: 600 });
    s += t(x + 86, y + 58, title, 14, { opacity: 0.85 });
    s += t(x + 12, y + 74, f.site.identity.jurisdiction + " · " + f.site.identity.iso, 10, { opacity: 0.6 });
    s += t(x + 12, y + 106, "SCHEMATIC — NOT FOR CONSTRUCTION", 10, { weight: 600 });
    s += t(x + 12, y + 122, "NOT SEALED · NO SURVEY · NO CALCS", 10, { opacity: 0.7 });
    s += t(x + 12, y + 138, "run " + f.runId + " · " + f.rate_book, 10, { opacity: 0.6, mono: true });
    s += t(x + 244, y + 106, "SCORE", 9, { opacity: 0.6 });
    s += t(x + 244, y + 132, f.score + "/100", 22, { weight: 600 });
    return s;
  }

  function sheetFrame(id, title, inner, f) {
    return '<svg class="sheet" viewBox="0 0 ' + W + ' ' + HT + '" role="img" aria-label="' + esc(id + " " + title) + '">' +
      box(M, M, W - M * 2, HT - M * 2, { sw: 2 }) +
      box(M + 10, M + 10, W - (M + 10) * 2, HT - (M + 10) * 2, { sw: 0.5, stroke: "currentColor" }) +
      t(44, 58, "H.A.C.D. SCHEMATIC ISSUE — NOT FOR CONSTRUCTION — NOT SEALED", 12, { weight: 600 }) +
      t(44, 78, f.site.identity.name + "  ·  " + f.site.demand.target_mw + " MW IT  ·  " + f.site.site.acres + " ac", 11, { opacity: 0.7 }) +
      t(W - 44, 58, id, 12, { anchor: "end", opacity: 0.7, mono: true }) +
      inner +
      titleBlock(id, title, f) +
      '</svg>';
  }

  // ---- individual sheets ------------------------------------------------

  function cover(f) {
    var s = t(BODY.x, 170, "H.A.C.D.", 54, { weight: 600 });
    s += t(BODY.x, 206, "Hyperscale Auto Consultation Designer", 15, { opacity: 0.75 });
    s += '<line x1="' + BODY.x + '" y1="232" x2="' + (BODY.x + 600) + '" y2="232" stroke="currentColor" opacity="0.4"/>';
    s += t(BODY.x, 264, "SHEET INDEX", 11, { weight: 600, opacity: 0.7 });
    H.SHEETS.forEach(function (sh, i) {
      var col = i < 5 ? 0 : 1;
      var row = i % 5;
      s += t(BODY.x + col * 320, 296 + row * 30, sh[0], 13, { mono: true, opacity: 0.8 });
      s += t(BODY.x + col * 320 + 76, 296 + row * 30, sh[1], 13);
    });
    s += t(BODY.x, 486, "Verdict: " + f.verdict, 15, { weight: 600 });
    s += t(BODY.x, 512, "Issued " + new Date().toISOString().slice(0, 10) + " · schematic stage · planning use only", 11, { opacity: 0.65 });
    return s;
  }

  function basis(f) {
    var s = t(BODY.x, 134, "DESIGN CHECKS", 11, { weight: 600, opacity: 0.7 });
    f.checks.forEach(function (c, i) {
      var col = i < 6 ? 0 : 1;
      var row = i % 6;
      var x = BODY.x + col * 330, y = 166 + row * 42;
      s += t(x, y, c.status.toUpperCase(), 11, { weight: 600, mono: true });
      s += t(x + 54, y, c.label, 13);
      s += t(x + 54, y + 16, c.value, 11, { opacity: 0.7, mono: true });
    });
    s += t(BODY.x, 450, "KEY QUANTITIES", 11, { weight: 600, opacity: 0.7 });
    var kv = [
      ["IT hall", H.fmt(f.d["space.hall_sf"].value, "sf")],
      ["Facility load", H.fmt(f.d["power.facility_mw"].value, "MW", 1)],
      ["Program", H.fmt(f.d["space.program_ac"].value, "ac", 1)],
      ["Residual", H.fmt(f.d["space.residual_ac"].value, "ac", 1)],
      ["Water", H.fmt(f.d["water.demand_mgy"].value, "MGY")],
      ["Capex P50", H.money(f.risk.p50)]
    ];
    kv.forEach(function (p, i) {
      s += t(BODY.x + i * 165, 478, p[0], 10, { opacity: 0.6 });
      s += t(BODY.x + i * 165, 500, p[1], 14, { weight: 600 });
    });
    return s;
  }

  function sitePlan(f) {
    // Parcel as a 1.6:1 rectangle of the stated acreage, scaled to the sheet.
    var acres = f.site.site.acres;
    var sf = H.convert(acres, "ac", "sf");
    var shortFt = Math.sqrt(sf / 1.6), longFt = shortFt * 1.6;
    var availW = 600, availH = 430;
    var px = Math.min(availW / longFt, availH / shortFt);
    var pw = longFt * px, ph = shortFt * px;
    var ox = BODY.x + 8, oy = 140;

    var s = box(ox, oy, pw, ph, { dash: "6 4" });
    s += t(ox, oy - 10, "PARCEL BOUNDARY  " + Math.round(longFt) + "' × " + Math.round(shortFt) + "'  (" + acres + " ac)", 10, { opacity: 0.75 });

    var inset = f.site.site.setback_ft * px;
    s += box(ox + inset, oy + inset, pw - inset * 2, ph - inset * 2, { dash: "3 3", stroke: "currentColor" });

    // Program blocks, shelf-packed inside the buildable box, areas to scale.
    var bx = ox + inset, by = oy + inset, bw = pw - inset * 2, bh = ph - inset * 2;
    var blocks = [
      { label: "IT HALLS", ac: f.d["space.hall_ac"].value, cls: "acc-cyan" },
      { label: "COOLING", ac: f.d["space.cooling_ac"].value, cls: "acc-lime" },
      { label: "SUBSTATION", ac: f.d["space.substation_ac"].value, cls: "acc-cyan" },
      { label: "YARD", ac: f.d["space.yard_ac"].value, cls: "acc-violet" },
      { label: "PARKING", ac: f.d["space.parking_ac"].value, cls: "acc-violet" }
    ];
    var cx = bx + 6, cy = by + 6, rowH = 0;
    blocks.forEach(function (b) {
      var areaPx = H.convert(b.ac, "ac", "sf") * px * px;
      var h = Math.max(26, Math.min(bh * 0.42, Math.sqrt(areaPx / 1.5)));
      var w = Math.max(30, areaPx / h);
      if (cx + w > bx + bw - 6) { cx = bx + 6; cy += rowH + 10; rowH = 0; }
      if (cy + h > by + bh - 6) return;
      s += '<rect class="' + b.cls + '" x="' + cx + '" y="' + cy + '" width="' + w + '" height="' + h + '" fill="none" stroke="currentColor" stroke-width="1.5"/>';
      s += t(cx + 6, cy + 16, b.label, 10, { weight: 600 });
      s += t(cx + 6, cy + 30, b.ac.toFixed(1) + " ac", 9, { opacity: 0.7 });
      cx += w + 10;
      rowH = Math.max(rowH, h);
    });

    s += dim(ox, oy + ph + 22, ox + pw, oy + ph + 22, Math.round(longFt) + " ft");
    s += northArrow(ox + pw + 70, oy + 40);
    s += scaleBar(ox + pw + 40, oy + ph - 10, px);
    s += t(ox + pw + 40, oy + 110, "RESIDUAL", 10, { opacity: 0.6 });
    s += t(ox + pw + 40, oy + 132, f.d["space.residual_ac"].value.toFixed(1) + " ac", 18, { weight: 600 });
    s += t(ox + pw + 40, oy + 164, "SETBACK", 10, { opacity: 0.6 });
    s += t(ox + pw + 40, oy + 186, f.site.site.setback_ft + " ft", 18, { weight: 600 });
    return s;
  }

  function hall(f) {
    var halls = f.d["space.hall_count"].value;
    var sfEach = f.d["space.hall_sf"].value / halls;
    var s = t(BODY.x, 134, halls + " HALL MODULES · " + H.fmt(sfEach, "sf") + " EACH · " + f.site.space.density_w_sf + " W/sf", 11, { weight: 600, opacity: 0.75 });
    var cols = 8, rows = 4;
    var gx = BODY.x, gy = 164, cw = 72, chh = 58;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        s += box(gx + c * cw, gy + r * chh, cw - 8, chh - 8, { sw: 1 });
      }
    }
    // column grid callout
    s += dim(gx, gy - 14, gx + cw, gy - 14, "30'");
    s += t(gx, gy + rows * chh + 26, "RACK ROWS · HOT AISLE CONTAINMENT · " + f.site.demand.rack_kw + " kW/RACK", 11, { opacity: 0.75 });
    s += t(gx, gy + rows * chh + 48, "MECHANICAL GALLERY", 11, { opacity: 0.6 });
    s += box(gx, gy + rows * chh + 58, cols * cw - 8, 44, { dash: "4 3" });
    s += t(BODY.x + 640, 180, "PER HALL", 10, { opacity: 0.6 });
    s += t(BODY.x + 640, 204, H.fmt(f.site.demand.target_mw / halls, "MW", 1), 20, { weight: 600 });
    s += t(BODY.x + 640, 236, "RACKS", 10, { opacity: 0.6 });
    s += t(BODY.x + 640, 260, H.fmt((f.site.demand.target_mw * 1000 / f.site.demand.rack_kw) / halls, ""), 20, { weight: 600 });
    return s;
  }

  function oneLine(f) {
    var n = f.d["power.xfmr_count"].value;
    var mva = f.d["power.substation_mva"].value;
    var s = t(BODY.x, 134, "ONE-LINE · " + f.site.power.redundancy + " · " + H.fmt(mva, "MVA", 1) + " TOTAL", 11, { weight: 600, opacity: 0.75 });
    var stages = [
      ["POI", f.site.power.poi_distance_mi.toFixed(1) + " mi"],
      ["SUBSTATION", H.fmt(mva, "MVA", 0)],
      ["MV GEAR", n + " × " + f.site.power.xfmr_mva + " MVA"],
      ["UPS", f.site.power.redundancy],
      ["IT HALLS", f.d["space.hall_count"].value + " halls"]
    ];
    stages.forEach(function (st, i) {
      var x = BODY.x + i * 196;
      s += box(x, 190, 150, 72, { sw: 1.5 });
      s += t(x + 12, 218, st[0], 13, { weight: 600 });
      s += t(x + 12, 240, st[1], 11, { opacity: 0.7 });
      if (i < stages.length - 1) {
        s += '<line x1="' + (x + 150) + '" y1="226" x2="' + (x + 196) + '" y2="226" stroke="currentColor" stroke-width="1.5"/>';
        s += '<path d="M' + (x + 190) + ' 221L' + (x + 196) + ' 226L' + (x + 190) + ' 231Z" fill="currentColor"/>';
      }
    });
    // transformer bank
    s += t(BODY.x, 318, "TRANSFORMER BANK", 11, { weight: 600, opacity: 0.7 });
    for (var i = 0; i < Math.min(n, 12); i++) {
      var tx = BODY.x + i * 62;
      s += '<circle cx="' + (tx + 16) + '" cy="368" r="14" fill="none" stroke="currentColor"/>';
      s += '<circle cx="' + (tx + 16) + '" cy="384" r="14" fill="none" stroke="currentColor"/>';
      s += t(tx + 16, 416, "T" + (i + 1), 10, { anchor: "middle", opacity: 0.7 });
    }
    s += t(BODY.x, 468, "HEADROOM AT POI", 10, { opacity: 0.6 });
    s += t(BODY.x, 492, H.fmt(f.site.power.poi_available_mw - f.d["power.facility_mw"].value, "MW", 1), 20, { weight: 600 });
    s += t(BODY.x + 240, 468, "FACILITY LOAD", 10, { opacity: 0.6 });
    s += t(BODY.x + 240, 492, H.fmt(f.d["power.facility_mw"].value, "MW", 1), 20, { weight: 600 });
    s += t(BODY.x + 480, 468, "IT LOAD", 10, { opacity: 0.6 });
    s += t(BODY.x + 480, 492, H.fmt(f.site.demand.target_mw, "MW"), 20, { weight: 600 });
    return s;
  }

  function cooling(f) {
    var dry = f.site.cooling.dry_cooling;
    var s = t(BODY.x, 134, (dry ? "DRY COOLING" : "EVAPORATIVE") + " · PUE " + f.site.cooling.pue.toFixed(2) + (dry ? "" : " · WUE " + f.site.cooling.wue.toFixed(2)), 11, { weight: 600, opacity: 0.75 });
    var chain = dry
      ? ["IT HALL", "CRAH", "DRY COOLER", "FANS", "AMBIENT"]
      : ["IT HALL", "CRAH", "CHILLER", "COOLING TOWER", "MAKEUP"];
    chain.forEach(function (c, i) {
      var x = BODY.x + i * 196;
      s += box(x, 190, 150, 66, { sw: 1.5 });
      s += t(x + 12, 228, c, 13, { weight: 600 });
      if (i < chain.length - 1) {
        s += '<line x1="' + (x + 150) + '" y1="223" x2="' + (x + 196) + '" y2="223" stroke="currentColor" stroke-width="1.5"/>';
        s += '<path d="M' + (x + 190) + ' 218L' + (x + 196) + ' 223L' + (x + 190) + ' 228Z" fill="currentColor"/>';
      }
    });
    s += '<path d="M' + (BODY.x + 75) + ' 256 L' + (BODY.x + 75) + ' 310 L' + (BODY.x + 663) + ' 310 L' + (BODY.x + 663) + ' 256" fill="none" stroke="currentColor" stroke-dasharray="5 4"/>';
    s += t(BODY.x + 320, 330, "RETURN LOOP", 11, { opacity: 0.7 });
    s += t(BODY.x, 392, "PLANT FOOTPRINT", 10, { opacity: 0.6 });
    s += t(BODY.x, 416, f.d["space.cooling_ac"].value.toFixed(1) + " ac", 20, { weight: 600 });
    s += t(BODY.x + 240, 392, "REJECTED HEAT", 10, { opacity: 0.6 });
    s += t(BODY.x + 240, 416, H.fmt(f.d["demand.expected_draw_mw"].value, "MW", 1), 20, { weight: 600 });
    s += t(BODY.x + 480, 392, "ANNUAL WATER", 10, { opacity: 0.6 });
    s += t(BODY.x + 480, 416, H.fmt(f.d["water.demand_mgy"].value, "MGY"), 20, { weight: 600 });
    s += t(BODY.x, 478, dry ? "No process water. Parasitic fan load raises PUE." : "Evaporative losses dominate the balance.", 11, { opacity: 0.7 });
    return s;
  }

  function water(f) {
    var demand = f.d["water.demand_mgy"].value;
    var avail = f.site.water.available_mgy;
    var maxV = Math.max(demand, avail, 1);
    var s = t(BODY.x, 134, "ANNUAL PROCESS WATER BALANCE", 11, { weight: 600, opacity: 0.75 });
    var barW = 620;
    [["UTILITY LETTER", avail, "acc-cyan"], ["CAMPUS DEMAND", demand, demand > avail ? "acc-breach" : "acc-lime"]].forEach(function (b, i) {
      var y = 190 + i * 96;
      s += t(BODY.x, y - 10, b[0], 10, { opacity: 0.65 });
      s += box(BODY.x, y, barW, 46, { dash: "3 3" });
      s += '<rect class="' + b[2] + '" x="' + BODY.x + '" y="' + y + '" width="' + Math.max(2, (b[1] / maxV) * barW) + '" height="46" fill="currentColor" opacity="0.26"/>';
      s += t(BODY.x + 12, y + 30, H.fmt(b[1], "MGY"), 18, { weight: 600 });
    });
    var head = avail - demand;
    s += t(BODY.x, 400, "HEADROOM", 10, { opacity: 0.6 });
    s += t(BODY.x, 426, H.fmt(head, "MGY"), 22, { weight: 600 });
    s += t(BODY.x + 260, 400, "WUE", 10, { opacity: 0.6 });
    s += t(BODY.x + 260, 426, f.site.cooling.dry_cooling ? "0.00" : f.site.cooling.wue.toFixed(2), 22, { weight: 600 });
    s += t(BODY.x + 480, 400, "STAFF", 10, { opacity: 0.6 });
    s += t(BODY.x + 480, 426, H.fmt(f.d["space.staff"].value, ""), 22, { weight: 600 });
    s += t(BODY.x, 480, head < 0 ? "Demand exceeds the letter. Reuse, storage or dry coolers required." : "Within the letter. Confirm drought-year curtailment terms.", 11, { opacity: 0.75 });
    return s;
  }

  function phasing(f) {
    var ph = f.schedule.phases;
    var s = t(BODY.x, 134, ph.length + " PHASES · " + Math.round(f.schedule.total_months) + " MONTHS TO FULL BUILDOUT", 11, { weight: 600, opacity: 0.75 });
    var trackW = 760, x0 = BODY.x, y0 = 180;
    var totalM = f.schedule.total_months;
    var cursor = f.schedule.design_months;
    s += '<rect class="acc-violet" x="' + x0 + '" y="' + y0 + '" width="' + (f.schedule.design_months / totalM) * trackW + '" height="30" fill="currentColor" opacity="0.22"/>';
    s += t(x0 + 8, y0 + 20, "DESIGN", 10, { weight: 600 });
    ph.forEach(function (p, i) {
      var y = y0 + 46 + i * 52;
      var x = x0 + (cursor / totalM) * trackW;
      var w = (p.months / totalM) * trackW;
      s += '<rect class="acc-cyan" x="' + x + '" y="' + y + '" width="' + w + '" height="34" fill="currentColor" opacity="0.26"/>';
      s += box(x, y, w, 34, { sw: 1 });
      s += t(x + 8, y + 22, "PHASE " + p.n, 11, { weight: 600 });
      s += t(x0 - 2, y + 22, "", 10);
      s += t(x + w + 10, y + 14, "Q" + p.gate_q + " " + p.gate_year, 11, { weight: 600 });
      s += t(x + w + 10, y + 30, H.fmt(p.cumulative_mw, "MW", 0) + " · " + p.pct + "%", 10, { opacity: 0.7 });
      cursor += p.months;
    });
    s += '<line x1="' + x0 + '" y1="' + (y0 + 46 + ph.length * 52 + 8) + '" x2="' + (x0 + trackW) + '" y2="' + (y0 + 46 + ph.length * 52 + 8) + '" stroke="currentColor" opacity="0.4"/>';
    s += t(x0, y0 + 46 + ph.length * 52 + 32, "FIRST ENERGISATION Q" + ph[0].gate_q + " " + ph[0].gate_year +
      "  ·  FULL BUILDOUT Q" + ph[ph.length - 1].gate_q + " " + ph[ph.length - 1].gate_year, 12, { weight: 600 });
    return s;
  }

  function costSheet(f) {
    var s = t(BODY.x, 134, "CAPEX · " + f.rate_book + " · SCHEMATIC ACCURACY", 11, { weight: 600, opacity: 0.75 });
    f.cost.lines.forEach(function (l, i) {
      var y = 170 + i * 26;
      s += t(BODY.x, y, l.label, 12);
      s += t(BODY.x + 290, y, H.fmt(l.qty, l.unit, 0), 11, { opacity: 0.7, anchor: "end", mono: true });
      s += t(BODY.x + 430, y, H.money(l.amount), 12, { anchor: "end", mono: true });
    });
    var yb = 170 + f.cost.lines.length * 26 + 14;
    s += '<line x1="' + BODY.x + '" y1="' + (yb - 14) + '" x2="' + (BODY.x + 430) + '" y2="' + (yb - 14) + '" stroke="currentColor" opacity="0.4"/>';
    [["Soft costs", f.cost.soft], ["Escalation", f.cost.escalation], ["Contingency", f.cost.contingency], ["TOTAL", f.cost.total]].forEach(function (r, i) {
      s += t(BODY.x, yb + i * 24, r[0], 12, { weight: i === 3 ? 600 : 400 });
      s += t(BODY.x + 430, yb + i * 24, H.money(r[1]), 12, { anchor: "end", weight: i === 3 ? 600 : 400, mono: true });
    });

    var px0 = BODY.x + 520;
    s += t(px0, 170, "RISK RANGE", 10, { opacity: 0.6 });
    s += t(px0, 196, "P50 " + H.money(f.risk.p50), 18, { weight: 600 });
    s += t(px0, 224, "P80 " + H.money(f.risk.p80), 18, { weight: 600 });
    s += t(px0, 248, f.risk.iterations + " runs · seed " + f.risk.seed, 10, { opacity: 0.6, mono: true });
    s += t(px0, 290, "SPREAD DRIVERS", 10, { opacity: 0.6 });
    f.risk.drivers.slice(0, 4).forEach(function (dr, i) {
      s += t(px0, 316 + i * 34, dr.path, 11, { mono: true });
      s += t(px0, 332 + i * 34, "± " + H.money(dr.swing / 2), 11, { opacity: 0.7 });
    });
    s += t(BODY.x, 520, "CARBON  embodied " + H.fmt(f.carbon.embodied_t, "tCO2e") + "  ·  operational " + H.fmt(f.carbon.operational_t_yr, "tCO2e/yr"), 11, { opacity: 0.75 });
    return s;
  }

  function transmittal(f) {
    var s = t(BODY.x, 160, "THIS IS A PLANNING SET", 26, { weight: 600 });
    s += t(BODY.x, 206, f.verdict + " · " + f.score + "/100 · " + H.SHEETS.length + " sheets", 15);
    var lines = [
      "Not a survey. Not calculations. Not issued for construction. Not sealed by a licensed engineer.",
      "Quantities are schematic and derive from the brief on the left of the console, nothing else.",
      "Every figure on every sheet traces to a given input, a named method, or a declared assumption.",
      "Assumptions carry a tolerance and an owner. Unowned assumptions are listed below and are the",
      "first thing to resolve before this set goes any further."
    ];
    lines.forEach(function (l, i) { s += t(BODY.x, 250 + i * 24, l, 12, { opacity: 0.8 }); });
    s += t(BODY.x, 400, "OPEN ASSUMPTIONS (" + f.assumptions.length + ")", 11, { weight: 600, opacity: 0.7 });
    f.assumptions.slice(0, 5).forEach(function (a, i) {
      s += t(BODY.x, 428 + i * 22, a.path, 11, { mono: true });
      s += t(BODY.x + 230, 428 + i * 22, String(typeof a.value === "number" ? a.value.toFixed(2) : a.value), 11, { mono: true, opacity: 0.8 });
      s += t(BODY.x + 310, 428 + i * 22, a.owner, 11, { opacity: 0.65 });
    });
    return s;
  }

  var RENDER = {
    "G-001": cover, "G-101": basis, "C-101": sitePlan, "A-101": hall,
    "E-101": oneLine, "M-101": cooling, "P-101": water, "T-101": phasing,
    "Z-101": costSheet, "CD-001": transmittal
  };

  H.drawSheet = function (index, f) {
    var sh = H.SHEETS[index];
    var fn = RENDER[sh[0]] || transmittal;
    return sheetFrame(sh[0], sh[1], fn(f), f);
  };
})(window.HACD);
