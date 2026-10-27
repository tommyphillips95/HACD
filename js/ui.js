/* H.A.C.D — the console.
   Every panel is a view of the Scenario. Every figure opens its provenance. */

(function (H) {
  "use strict";

  var esc = H.esc;
  var STORE = "hacd.state.v2";

  var state = {
    base: H.clone(H.DEMO),
    prov: H.clone(H.DEMO_PROV),
    branch: "baseline",
    view: "overview",
    sheet: 0,
    theme: "dark"
  };

  var feas = null;

  // ---- persistence ------------------------------------------------------

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        base: state.base, prov: state.prov, branch: state.branch, theme: state.theme
      }));
    } catch (e) { /* private window, blocked storage: the console still works */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o && o.base) { state.base = o.base; state.prov = o.prov || state.prov; }
      if (o && o.branch) state.branch = o.branch;
      if (o && o.theme) state.theme = o.theme;
    } catch (e) { /* ignore */ }
  }

  // ---- scenario assembly ------------------------------------------------

  function branchDef(id) {
    return H.BRANCHES.filter(function (b) { return b.id === id; })[0] || H.BRANCHES[0];
  }

  function current() {
    return branchDef(state.branch).apply(H.clone(state.base));
  }

  function recompute() {
    feas = H.evaluate(current(), state.prov);
  }

  // ---- small component helpers (the design system vocabulary) ----------

  function chip(status, word) {
    var map = { pass: "ontrack", warn: "watch", fail: "breach" };
    var cls = map[status] || "idle";
    return '<span class="chip ' + cls + ' eyebrow-sm"><span class="dot"></span>' + esc(word) + '</span>';
  }

  function provTag(path) {
    var p = state.prov[path];
    var d = feas.d[path];
    var basis = p ? p.basis : (d ? "derived" : null);
    if (!basis) return "";
    return '<button class="ptag mono-xs ' + basis + '" data-prov="' + esc(path) + '" type="button" title="Open provenance">' + basis + '</button>';
  }

  function metricCard(hue, eyebrow, value, basis, path) {
    var empty = value === "—";
    return '<article class="card metric">' +
      '<span class="rule ' + hue + '"></span>' +
      '<span class="eyebrow faint">' + esc(eyebrow) + '</span>' +
      '<div class="metric-xl ' + (empty ? "faint" : hue.replace("r-", "f-")) + '">' + esc(value) + '</div>' +
      '<div class="basis body-sm">' +
      '<span>' + esc(basis) + '</span>' +
      (path ? provTag(path) : "") +
      '</div></article>';
  }

  function panel(eyebrow, title, inner, tools) {
    return '<section class="card panel">' +
      '<header class="phead"><div><span class="eyebrow faint">' + esc(eyebrow) + '</span>' +
      '<h2 class="title-lg">' + esc(title) + '</h2>' +
      '<span class="caption faint">Reflects run ' + feas.runId + ' · ' + feas.rate_book + '</span></div>' +
      '<div class="ptools">' + (tools || "") + '</div></header>' +
      '<div class="pbody">' + inner + '</div></section>';
  }

  // ---- views ------------------------------------------------------------

  function overview() {
    var d = feas.d;
    var cards =
      metricCard("r-cyan", "IT LOAD", H.fmt(feas.site.demand.target_mw, "MW"), "Target capacity", "demand.target_mw") +
      metricCard("r-lime", "DESIGN PUE", feas.site.cooling.pue.toFixed(2), "Facility " + H.fmt(d["power.facility_mw"].value, "MW", 1), "cooling.pue") +
      metricCard("r-violet", "RESIDUAL LAND", H.fmt(d["space.residual_ac"].value, "ac", 1), "After setbacks and program", "space.residual_ac") +
      metricCard("r-amber", "FIRST ENERGISATION", "Q" + feas.schedule.energisation.gate_q + " '" + String(feas.schedule.energisation.gate_year).slice(2), "Phase 01 of " + feas.schedule.phases.length, null);

    var verdictPanel = panel("VERDICT", feas.verdict,
      '<div class="verdict-row">' +
      '<div class="score-wrap"><div class="metric-xl f-cyan">' + feas.score + '</div><span class="caption faint">/100</span></div>' +
      '<div class="vstats">' +
      stat("Program", H.fmt(d["space.program_ac"].value, "ac", 1), "space.program_ac") +
      stat("Water", H.fmt(d["water.demand_mgy"].value, "MGY"), "water.demand_mgy") +
      stat("Capex P50", H.money(feas.risk.p50), null) +
      stat("Capex P80", H.money(feas.risk.p80), null) +
      '</div></div>');

    var failing = feas.checks.filter(function (c) { return c.status !== "pass"; });
    var checksPanel = panel("ASSURANCE",
      failing.length === 0 ? "All " + feas.checks.length + " checks pass"
        : failing.length === 1 ? "1 check needs attention"
        : failing.length + " checks need attention",
      feas.checks.map(checkRow).join(""));

    var phasePanel = panel("DELIVERY", "Phasing plan", phaseBar());

    return '<div class="metric-row">' + cards + '</div>' +
      '<div class="grid-8-4">' + verdictPanel + phasePanel + '</div>' +
      checksPanel;
  }

  function stat(label, value, path) {
    return '<div class="stat"><div class="caption faint">' + esc(label) + '</div>' +
      '<div class="statline"><strong class="metric-md">' + esc(value) + '</strong>' + (path ? provTag(path) : "") + '</div></div>';
  }

  function checkRow(c) {
    return '<div class="check-row">' +
      '<div class="cmain"><strong class="title-md">' + esc(c.label) + '</strong>' +
      '<div class="body-sm muted">' + esc(c.detail) + '</div>' +
      '<div class="refs">' + c.refs.map(function (r) { return provTag(r) || '<span class="ptag mono-xs derived">' + esc(r) + '</span>'; }).join("") + '</div></div>' +
      '<div class="cside">' + chip(c.status, c.status === "pass" ? "ON TRACK" : c.status === "warn" ? "AT RISK" : "BREACHED") +
      '<div class="mono-sm">' + esc(c.value) + '</div></div></div>';
  }

  function phaseBar() {
    var ph = feas.schedule.phases;
    var s = '<div class="phase-lede"><div class="count"><strong class="metric-xl">' + ph.length + '</strong>' +
      '<span class="body-sm muted">phases to full buildout</span></div>' +
      '<div class="year metric-md">' + ph[ph.length - 1].gate_year + '</div></div>';
    s += '<div class="chart">';
    ph.forEach(function (p, i) {
      s += '<div class="pcol"><span class="pct body-sm">' + p.pct + '%</span>' +
        '<div class="bar" style="height:' + p.pct + '%"></div>' +
        '<span class="gate mono-xs">Q' + p.gate_q + " '" + String(p.gate_year).slice(2) + '</span></div>';
    });
    s += '</div><div class="pfoot caption faint"><span>Cumulative IT capacity energised</span><span>' +
      Math.round(feas.schedule.total_months) + ' months total</span></div>';
    return s;
  }

  function brief() {
    function field(path, label, type, attrs) {
      var v = H.get(state.base, path);
      var p = state.prov[path] || {};
      var input = type === "checkbox"
        ? '<input type="checkbox" data-field="' + path + '"' + (v ? " checked" : "") + ">"
        : '<input type="' + type + '" data-field="' + path + '" value="' + esc(v) + '"' + (attrs || "") + ">";
      return '<label class="field' + (type === "checkbox" ? " check" : "") + '">' +
        '<span class="flabel"><span class="label">' + esc(label) + '</span>' + provTag(path) + '</span>' +
        input +
        (p.source ? '<span class="caption faint src">' + esc(p.source) + '</span>' : "") +
        '</label>';
    }

    var inputs =
      field("identity.name", "Campus", "text") +
      field("identity.jurisdiction", "Market", "text") +
      '<div class="split">' + field("site.acres", "Acres", "number", ' min="1"') + field("site.setback_ft", "Setback ft", "number", ' min="0"') + '</div>' +
      '<div class="split">' + field("demand.target_mw", "MW IT", "number", ' min="1"') + field("demand.rack_kw", "kW / rack", "number", ' min="1"') + '</div>' +
      '<div class="split">' + field("power.poi_available_mw", "POI MW", "number", ' min="1"') + field("power.poi_distance_mi", "POI mi", "number", ' step="0.1"') + '</div>' +
      '<div class="split">' + field("cooling.pue", "PUE", "number", ' step="0.01"') + field("water.available_mgy", "Water MGY", "number", ' min="0"') + '</div>' +
      '<div class="split">' + field("network.fiber_routes", "Fiber routes", "number", ' min="1"') + field("time.phases", "Phases", "number", ' min="1" max="6"') + '</div>' +
      field("cooling.dry_cooling", "Dry cooling", "checkbox");

    var reg = feas.assumptions.map(function (a) {
      return '<div class="check-row"><div class="cmain"><strong class="mono-sm">' + esc(a.path) + '</strong>' +
        '<div class="body-sm muted">' + esc(a.why || "") + '</div>' +
        '<div class="caption faint">' + esc(a.owner) + '</div></div>' +
        '<div class="cside">' + chip("warn", "ASSUMED") +
        '<div class="mono-sm">' + (typeof a.value === "number" ? a.value.toFixed(2) : esc(a.value)) +
        (a.tol ? ' <span class="faint">(' + a.tol[0] + "–" + a.tol[1] + ')</span>' : "") + '</div></div></div>';
    }).join("");

    return '<div class="grid-4-8">' +
      panel("CUSTOMER BRIEF", "What they already told us", inputs + '<p class="caption faint fine">Schematic issue. Not for construction. Not sealed.</p>') +
      panel("ASSUMPTION REGISTER", feas.assumptions.length + " open assumptions", reg ||
        '<p class="body-sm muted">No open assumptions.</p>') +
      '</div>';
  }

  function drawings() {
    var rail = H.SHEETS.map(function (s, i) {
      return '<button type="button" class="ghost label' + (i === state.sheet ? " on" : "") + '" data-sheet="' + i + '">' + s[0] + '</button>';
    }).join("");
    return panel("DRAWING SET", H.SHEETS[state.sheet][0] + " " + H.SHEETS[state.sheet][1],
      '<div class="sheetrail">' + rail + '</div><div class="sheetwrap">' + H.drawSheet(state.sheet, feas) + '</div>',
      '<button class="tool label" data-act="print" type="button">Print set</button>');
  }

  function commercial() {
    var c = feas.cost;
    var rows = c.lines.map(function (l) {
      return '<tr><td class="body-sm">' + esc(l.label) + '</td>' +
        '<td class="mono-sm num">' + H.fmt(l.qty, l.unit, 0) + '</td>' +
        '<td class="mono-sm num faint">' + H.money(l.rate) + '</td>' +
        '<td class="mono-sm num">' + H.money(l.amount) + '</td></tr>';
    }).join("");
    var tail = [["Direct", c.direct], ["Soft costs", c.soft], ["Escalation to midpoint", c.escalation], ["Contingency", c.contingency]]
      .map(function (r) { return '<tr><td class="body-sm" colspan="3">' + r[0] + '</td><td class="mono-sm num">' + H.money(r[1]) + '</td></tr>'; }).join("");

    var table = '<table class="cost"><thead><tr><th class="eyebrow-sm">LINE</th><th class="eyebrow-sm num">QTY</th><th class="eyebrow-sm num">RATE</th><th class="eyebrow-sm num">AMOUNT</th></tr></thead>' +
      '<tbody>' + rows + tail +
      '<tr class="total"><td class="title-md" colspan="3">Total</td><td class="metric-md num">' + H.money(c.total) + '</td></tr>' +
      '</tbody></table><p class="caption faint">' + esc(c.rate_source) + '</p>';

    var drivers = feas.risk.drivers.slice(0, 5).map(function (dr) {
      var max = feas.risk.drivers[0].swing || 1;
      return '<div class="driver"><div class="dmeta"><strong class="mono-sm">' + esc(dr.path) + '</strong>' +
        '<span class="caption faint">' + esc(dr.why || "") + '</span></div>' +
        '<div class="dbar"><span style="width:' + Math.max(3, (dr.swing / max) * 100) + '%"></span></div>' +
        '<span class="mono-sm num">± ' + H.money(dr.swing / 2) + '</span></div>';
    }).join("");

    var risk = '<div class="riskrow">' +
      stat("P10", H.money(feas.risk.p10)) + stat("P50", H.money(feas.risk.p50)) +
      stat("P80", H.money(feas.risk.p80)) + stat("P90", H.money(feas.risk.p90)) +
      '</div><p class="caption faint">' + feas.risk.iterations + ' iterations over the assumption register, seed ' +
      feas.risk.seed + '. Same inputs, same answer.</p>' + drivers;

    return '<div class="metric-row">' +
      metricCard("r-cyan", "CAPEX P50", H.money(feas.risk.p50), "Schematic accuracy", null) +
      metricCard("r-violet", "COST / MW", H.money(c.per_mw), "All-in, escalated", null) +
      metricCard("r-lime", "EMBODIED CARBON", H.fmt(feas.carbon.embodied_t, "t"), "Shell and core", null) +
      metricCard("r-amber", "OPERATIONAL", H.fmt(feas.carbon.operational_t_yr / 1000, "kt/yr", 1), "At " + H.CARBON.grid_kgco2e_mwh + " kg/MWh", null) +
      '</div>' +
      '<div class="grid-8-4">' + panel("ESTIMATE", "Bottom-up capex", table) + panel("RISK", "P50 / P80 range", risk) + '</div>';
  }

  var VIEWS = { overview: overview, brief: brief, drawings: drawings, commercial: commercial };

  var NAV = [
    ["overview", "Overview", "M2.5 6 8 2.5 13.5 6v7h-11z"],
    ["brief", "Brief", "M3 13V3h6l4 4v6zM9 3v4h4"],
    ["drawings", "Drawings", "M2.5 2.5h11v11h-11zM2.5 6h11M6 2.5v11"],
    ["commercial", "Commercial", "M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z"]
  ];

  // ---- shell ------------------------------------------------------------

  function render() {
    recompute();
    document.documentElement.setAttribute("data-theme", state.theme);

    document.getElementById("nav").innerHTML = NAV.map(function (n) {
      return '<a class="item label' + (state.view === n[0] ? ' on" aria-current="page"' : '"') + ' href="#" data-view="' + n[0] + '">' +
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="' + n[2] + '"/></svg>' +
        n[1] + '</a>';
    }).join("");

    document.getElementById("branches").innerHTML = H.BRANCHES.map(function (b) {
      return '<button class="opt label" role="tab" data-branch="' + b.id + '" aria-selected="' + (state.branch === b.id) + '">' + esc(b.name) + '</button>';
    }).join("");
    document.getElementById("branch-note").textContent = branchDef(state.branch).note;
    document.getElementById("rev").textContent = "run " + feas.runId + " · " + feas.assumptions.length + " assumptions open";

    document.getElementById("campus").textContent = feas.site.identity.name;
    document.getElementById("campus-mini").textContent = feas.site.identity.name;
    document.getElementById("sub").textContent =
      H.fmt(feas.site.site.acres, "ac") + " · " + H.fmt(feas.site.demand.target_mw, "MW") + " IT · " +
      feas.site.identity.jurisdiction + " (" + feas.site.identity.iso + ")";

    document.getElementById("main").innerHTML = (VIEWS[state.view] || overview)();
    document.getElementById("theme").textContent = state.theme === "dark" ? "Deliverable" : "Console";
  }

  // ---- provenance drawer ------------------------------------------------

  function openProv(path) {
    var p = state.prov[path];
    var d = feas.d[path];
    var rows = "";
    var title = path;
    var value = "—";

    if (d) {
      value = H.fmt(d.value, d.unit, 1);
      rows += line("method", d.method + (d.note ? " · " + d.note : ""));
      (d.inputs || []).forEach(function (inp) {
        var iv = feas.d[inp] ? H.fmt(feas.d[inp].value, feas.d[inp].unit, 1) : String(H.get(feas.site, inp));
        var ip = state.prov[inp];
        rows += line(ip ? ip.basis : "derived", inp + " = " + iv + (ip && ip.source ? "  ·  " + ip.source : ""));
      });
    } else if (p) {
      var raw = H.get(feas.site, path);
      value = typeof raw === "number" ? String(raw) : String(raw);
      rows += line(p.basis, p.source);
      if (p.tol) rows += line("tolerance", p.tol[0] + " to " + p.tol[1]);
      if (p.why) rows += line("why", p.why);
    }

    function line(k, v) {
      return '<div class="pline"><b class="mono-xs">' + esc(k) + '</b><span class="mono-sm">' + esc(v) + '</span></div>';
    }

    var conf = d ? "Derived. Confidence follows its weakest input." : (p && p.basis === "assumed" ? "Assumed. Narrowing the tolerance narrows P80." : "Given. Traced to a document.");
    document.getElementById("prov-body").innerHTML =
      '<span class="eyebrow faint">PROVENANCE</span>' +
      '<h3 class="title-lg">' + esc(title) + '</h3>' +
      '<div class="metric-md">' + esc(value) + '</div>' +
      '<div class="plines">' + rows + '</div>' +
      '<p class="caption faint">' + esc(conf) + '</p>';
    document.getElementById("prov").classList.add("open");
  }

  function closeProv() { document.getElementById("prov").classList.remove("open"); }

  // ---- command bar ------------------------------------------------------

  function cmdItems() {
    var items = [];
    NAV.forEach(function (n) { items.push({ group: "VIEW", label: n[1], run: function () { state.view = n[0]; render(); } }); });
    H.BRANCHES.forEach(function (b) { items.push({ group: "BRANCH", label: b.name, meta: b.id, run: function () { state.branch = b.id; save(); render(); } }); });
    H.SHEETS.forEach(function (s, i) { items.push({ group: "SHEET", label: s[0] + " " + s[1], meta: s[0], run: function () { state.view = "drawings"; state.sheet = i; render(); } }); });
    Object.keys(feas.d).forEach(function (p) {
      items.push({ group: "MODEL", label: p, meta: H.fmt(feas.d[p].value, feas.d[p].unit, 1), run: function () { openProv(p); } });
    });
    Object.keys(state.prov).forEach(function (p) {
      items.push({ group: "MODEL", label: p, meta: String(H.get(feas.site, p)), run: function () { openProv(p); } });
    });
    return items;
  }

  var cmdMatches = [], cmdIndex = 0;

  function renderCmd(q) {
    var all = cmdItems();
    var needle = (q || "").toLowerCase();
    cmdMatches = (needle ? all.filter(function (i) { return (i.label + " " + (i.meta || "")).toLowerCase().indexOf(needle) >= 0; }) : all).slice(0, 12);
    cmdIndex = Math.min(cmdIndex, Math.max(0, cmdMatches.length - 1));
    var lastGroup = null, html = "";
    cmdMatches.forEach(function (m, i) {
      if (m.group !== lastGroup) { html += '<span class="ghead eyebrow-sm">' + m.group + "</span>"; lastGroup = m.group; }
      html += '<div class="opt body-sm' + (i === cmdIndex ? " on" : "") + '" data-cmd="' + i + '">' + esc(m.label) +
        '<span class="meta mono-xs">' + esc(m.meta || "") + "</span></div>";
    });
    document.getElementById("cmd-list").innerHTML = html || '<div class="opt body-sm muted">No match.</div>';
  }

  function openCmd() {
    document.getElementById("cmd").classList.add("open");
    var i = document.getElementById("cmd-input");
    i.value = ""; cmdIndex = 0; renderCmd(""); i.focus();
  }
  function closeCmd() { document.getElementById("cmd").classList.remove("open"); }

  // ---- export -----------------------------------------------------------

  function exportJson() {
    var payload = {
      generated: new Date().toISOString(),
      runId: feas.runId,
      branch: state.branch,
      rate_book: feas.rate_book,
      methods: feas.methods,
      scenario: feas.site,
      provenance: state.prov,
      derived: Object.keys(feas.d).reduce(function (a, k) { a[k] = feas.d[k]; return a; }, {}),
      checks: feas.checks,
      score: feas.score,
      verdict: feas.verdict,
      cost: feas.cost,
      risk: feas.risk,
      schedule: feas.schedule,
      carbon: feas.carbon,
      disclaimer: "Schematic issue. Not for construction. Not sealed. No survey. No calculations."
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hacd-" + feas.runId + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function printSet() {
    var all = H.SHEETS.map(function (s, i) { return '<div class="psheet">' + H.drawSheet(i, feas) + "</div>"; }).join("");
    document.getElementById("printarea").innerHTML = all;
    window.print();
  }

  // ---- events -----------------------------------------------------------

  function onField(e) {
    var path = e.target.dataset.field;
    if (!path) return;
    var v = e.target.type === "checkbox" ? e.target.checked
      : e.target.type === "number" ? Number(e.target.value)
      : e.target.value;
    if (e.target.type === "number" && !isFinite(v)) return;
    H.set(state.base, path, v);
    state.prov[path] = { basis: "given", source: "you · " + new Date().toISOString().slice(0, 16).replace("T", " ") };
    save();
    var active = document.activeElement, sel = active && active.selectionStart;
    render();
    var again = document.querySelector('[data-field="' + path + '"]');
    if (again) { again.focus(); if (sel != null && again.setSelectionRange) { try { again.setSelectionRange(sel, sel); } catch (x) {} } }
  }

  document.addEventListener("input", onField);
  document.addEventListener("change", function (e) { if (e.target.type === "checkbox") onField(e); });

  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-view],[data-branch],[data-sheet],[data-prov],[data-act],[data-cmd]") : null;
    if (!el) return;
    if (el.dataset.view !== undefined) { e.preventDefault(); state.view = el.dataset.view; render(); }
    else if (el.dataset.branch) { state.branch = el.dataset.branch; save(); render(); }
    else if (el.dataset.sheet !== undefined) { state.sheet = Number(el.dataset.sheet); render(); }
    else if (el.dataset.prov) { openProv(el.dataset.prov); }
    else if (el.dataset.cmd !== undefined) { var m = cmdMatches[Number(el.dataset.cmd)]; closeCmd(); if (m) m.run(); }
    else if (el.dataset.act === "print") printSet();
    else if (el.dataset.act === "export") exportJson();
    else if (el.dataset.act === "theme") { state.theme = state.theme === "dark" ? "light" : "dark"; save(); render(); }
    else if (el.dataset.act === "reset") { state.base = H.clone(H.DEMO); state.prov = H.clone(H.DEMO_PROV); save(); render(); }
    else if (el.dataset.act === "close-prov") closeProv();
    else if (el.dataset.act === "cmd") openCmd();
  });

  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openCmd(); return; }
    if (e.key === "Escape") { closeCmd(); closeProv(); return; }
    if (!document.getElementById("cmd").classList.contains("open")) return;
    if (e.key === "ArrowDown") { e.preventDefault(); cmdIndex = Math.min(cmdIndex + 1, cmdMatches.length - 1); renderCmd(document.getElementById("cmd-input").value); }
    if (e.key === "ArrowUp") { e.preventDefault(); cmdIndex = Math.max(cmdIndex - 1, 0); renderCmd(document.getElementById("cmd-input").value); }
    if (e.key === "Enter") { e.preventDefault(); var m = cmdMatches[cmdIndex]; closeCmd(); if (m) m.run(); }
  });

  document.getElementById("cmd-input").addEventListener("input", function (e) { cmdIndex = 0; renderCmd(e.target.value); });
  document.getElementById("cmd").addEventListener("click", function (e) { if (e.target.id === "cmd") closeCmd(); });
  document.getElementById("prov").addEventListener("click", function (e) { if (e.target.id === "prov") closeProv(); });

  load();
  render();
})(window.HACD);
