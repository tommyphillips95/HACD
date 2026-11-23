/* H.A.C.D — the walkthrough model.
   Turns an evaluated Scenario into a building you can walk: halls, rack rows,
   electrical rooms, galleries, yards and the substation, all as plain boxes.
   No DOM and no WebGL here, so the layout is a deterministic function that the
   tests can hold to the same promises as the engine. js/walk.js renders it.

   Building types plug in through H.WALK.TYPES. Data centers are the first;
   a hospital or a school adds its own builder with the same output shape. */

(function (H) {
  "use strict";

  var METHOD = "walk/v1";

  // ---- layout conventions -------------------------------------------------
  // Geometry the Scenario does not carry. Each one is declared, with a band,
  // an owner and a reason, exactly like an assumption in DEMO_PROV. They shape
  // what you see; none of them feeds cost, risk or the run id.

  function conv(value, unit, tol, why) {
    return { value: value, unit: unit, basis: "assumed", source: "owner: unassigned", tol: tol, why: why };
  }

  var CONVENTIONS = {
    rack_w_m:            conv(0.6, "m", [0.6, 0.8], "Hyperscale 48U cabinet width."),
    rack_d_m:            conv(1.2, "m", [1.07, 1.4], "Cabinet depth incl. rear door."),
    rack_h_m:            conv(2.3, "m", [2.0, 2.6], "48U plus plinth."),
    cold_aisle_m:        conv(1.8, "m", [1.2, 2.4], "Two floor tiles wide."),
    hot_aisle_m:         conv(1.2, "m", [0.9, 1.8], "Contained hot aisle."),
    racks_per_row_max:   conv(30, "racks", [20, 40], "Row length before a cross aisle."),
    data_hall_mw:        conv(9, "MW", [6, 15], "IT load per data hall room inside a hall module."),
    whitespace_frac:     conv(0.40, "", [0.32, 0.5], "Share of a hall module that is IT white space."),
    electrical_frac:     conv(0.30, "", [0.22, 0.38], "Share given to UPS, batteries and LV switchgear."),
    gallery_frac:        conv(0.18, "", [0.12, 0.24], "Fan-wall / CRAH gallery share."),
    corridor_m:          conv(4, "m", [3, 5], "Main corridor width, equipment moves."),
    clear_height_m:      conv(8, "m", [6, 10], "Wall height to roof deck."),
    ups_module_mw:       conv(1.5, "MW", [1.0, 2.5], "UPS module rating."),
    battery_per_ups:     conv(3, "cabinets", [2, 6], "Li-ion cabinets per UPS module for ~5 min."),
    gen_mw:              conv(3, "MW", [2.5, 3.5], "Standby diesel genset rating."),
    tower_cell_mw:       conv(4, "MW", [3, 6], "Heat rejected per cooling tower cell."),
    dry_cooler_mw:       conv(1.2, "MW", [0.8, 1.6], "Heat rejected per adiabatic dry cooler."),
    liquid_cooling_kw:   conv(30, "kW/rack", [25, 40], "Above this rack density, rows get CDUs for direct-to-chip liquid."),
    working_clear_m:     conv(1.5, "m", [1.2, 1.8], "Clear space in front of gear (NEC 110.26 is the floor).")
  };

  function C(key) { return CONVENTIONS[key].value; }

  // ---- small helpers -------------------------------------------------------

  function count(value, unit, inputs, note) {
    return H.derived(value, unit, inputs, METHOD, note);
  }

  // A box is centred at (x, y, z) with world-axis sizes (w, h, d) along x, y, z,
  // in metres. rot only says which way the front faces, in quarter turns:
  // 0 = +z, 1 = +x, 2 = -z, 3 = -x. Footprints never depend on it.
  function Builder() {
    this.boxes = [];
    this.signs = [];
    this.fixtures = [];
    this.zones = [];
    this.spawns = [];
  }

  Builder.prototype.box = function (kind, x, y, z, w, h, d, extra) {
    var b = { kind: kind, x: r3(x), y: r3(y), z: r3(z), w: r3(w), h: r3(h), d: r3(d) };
    if (extra) for (var k in extra) b[k] = extra[k];
    this.boxes.push(b);
    return b;
  };

  // A box resting on the floor at y = 0.
  Builder.prototype.floorBox = function (kind, x, z, w, h, d, extra) {
    return this.box(kind, x, h / 2, z, w, h, d, extra);
  };

  // A wall along x or z between two points, with door openings cut out.
  // openings: [{at, width, height}] measured along the wall from its start.
  Builder.prototype.wall = function (kind, x0, z0, x1, z1, height, thick, openings) {
    var alongX = Math.abs(z1 - z0) < 1e-6;
    var len = alongX ? x1 - x0 : z1 - z0;
    var cuts = (openings || []).slice().sort(function (a, b) { return a.at - b.at; });
    var cursor = 0;
    var self = this;
    function piece(a, b, y0, y1) {
      if (b - a < 0.05 || y1 - y0 < 0.05) return;
      var mid = (a + b) / 2, h = y1 - y0;
      if (alongX) self.box(kind, x0 + mid, y0 + h / 2, z0, b - a, h, thick, { solid: y0 < 2 });
      else self.box(kind, x0, y0 + h / 2, z0 + mid, thick, h, b - a, { solid: y0 < 2 });
    }
    cuts.forEach(function (c) {
      var a = c.at - c.width / 2, b = c.at + c.width / 2;
      piece(cursor, a, 0, height);
      piece(a, b, c.height, height); // header over the door
      var fx = alongX ? x0 + c.at : x0, fz = alongX ? z0 : z0 + c.at;
      self.box("door_frame", fx, c.height / 2, fz, alongX ? c.width + 0.16 : thick + 0.04, c.height + 0.08, alongX ? thick + 0.04 : c.width + 0.16, { opening: true });
      cursor = b;
    });
    piece(cursor, len, 0, height);
  };

  Builder.prototype.sign = function (text, x, y, z, rot, w) {
    this.signs.push({ text: text, x: r3(x), y: r3(y), z: r3(z), rot: rot || 0, w: w || Math.max(1.2, text.length * 0.16) });
  };

  Builder.prototype.zone = function (z) {
    z.x0 = r3(z.x0); z.z0 = r3(z.z0); z.x1 = r3(z.x1); z.z1 = r3(z.z1);
    this.zones.push(z);
    return z;
  };

  // yaw 0 looks toward -z; positive yaw turns left (toward -x).
  Builder.prototype.spawn = function (id, label, x, z, yaw, y, pitch) {
    this.spawns.push({ id: id, label: label, x: r3(x), y: y === undefined ? 1.7 : y, z: r3(z), yaw: r3(yaw || 0), pitch: r3(pitch || 0), fly: y !== undefined && y > 3 });
  };

  function r3(v) { return Math.round(v * 1000) / 1000; }

  // Redundancy turns N working units into the installed count.
  function withRedundancy(n, redundancy) {
    if (redundancy === "2N") return n * 2;
    if (redundancy === "N+1") return n + 1;
    if (redundancy === "N+2") return n + 2;
    return n;
  }

  // ---- the data center -----------------------------------------------------

  function dataCenter(feas) {
    var s = feas.site, d = feas.d;
    var b = new Builder();

    var halls = d["space.hall_count"].value;
    var hallSf = d["space.hall_sf"].value / halls;
    var hallM2 = H.convert(hallSf, "sf", "m2");
    var itMw = s.demand.target_mw;
    var mwPerHall = itMw / halls;
    var facMwPerHall = d["power.facility_mw"].value / halls;
    var racksTotal = Math.round((itMw * 1000) / s.demand.rack_kw);
    var redundancy = s.power.redundancy;

    // Rooms inside each hall module.
    var roomsPerHall = Math.max(1, Math.ceil(mwPerHall / C("data_hall_mw")));
    var mwPerRoom = mwPerHall / roomsPerHall;

    // Footprint: depth bands along z, rooms side by side along x.
    var aspect = 1.7;
    var D = Math.sqrt(hallM2 / aspect);
    var W = hallM2 / D;
    var corridor = C("corridor_m");
    var galleryD = D * C("gallery_frac");
    var elecD = D * C("electrical_frac");
    var hallD = D - galleryD - elecD - corridor;
    var roomW = W / roomsPerHall;
    var wallH = C("clear_height_m");

    var counts = {};
    counts.halls = count(halls, "halls", ["space.hall_count"], "One building per hall module.");
    counts.rooms = count(halls * roomsPerHall, "data halls", ["space.hall_count", "demand.target_mw"],
      roomsPerHall + " per module at up to " + C("data_hall_mw") + " MW each (layout convention).");
    counts.racks = count(racksTotal, "racks", ["demand.target_mw", "demand.rack_kw"], "IT load over rack density, as A-101.");

    var upsPerRoomN = Math.ceil(mwPerRoom / C("ups_module_mw"));
    var upsPerRoom = withRedundancy(upsPerRoomN, redundancy);
    counts.ups = count(upsPerRoom * roomsPerHall * halls, "UPS modules", ["demand.target_mw", "power.redundancy"],
      upsPerRoomN + " working + redundancy per data hall, " + C("ups_module_mw") + " MW modules.");
    counts.batteries = count(upsPerRoom * C("battery_per_ups") * roomsPerHall * halls, "battery cabinets", ["demand.target_mw", "power.redundancy"]);
    var swgrPerRoom = upsPerRoom * 2 + 2;
    counts.switchgear = count(swgrPerRoom * roomsPerHall * halls, "LV switchgear sections", ["demand.target_mw", "power.redundancy"],
      "Two feeder sections per UPS plus main and tie per lineup.");

    var unitSubsPerHallN = upsPerRoom * roomsPerHall;
    counts.mv_switchgear = count((Math.ceil(unitSubsPerHallN / roomsPerHall) + 2) * roomsPerHall * halls, "MV switchgear sections", ["demand.target_mw", "power.redundancy"],
      "One feeder per unit substation plus two mains per lineup.");
    var genN = Math.ceil(facMwPerHall / C("gen_mw"));
    var gensPerHall = withRedundancy(genN, redundancy === "2N" ? "2N" : "N+1");
    counts.generators = count(gensPerHall * halls, "generators", ["power.facility_mw", "power.redundancy"],
      genN + " working + redundancy per hall module, " + C("gen_mw") + " MW gensets.");
    var unitSubsPerHall = upsPerRoom * roomsPerHall;
    counts.unit_subs = count(unitSubsPerHall * halls, "unit substations", ["demand.target_mw", "power.redundancy"], "One MV/LV transformer per UPS lineup.");
    counts.mv_xfmr = count(d["power.xfmr_count"].value, "units", ["power.xfmr_count"], d["power.xfmr_count"].note);

    var dry = !!s.cooling.dry_cooling;
    var rejectPerUnit = dry ? C("dry_cooler_mw") : C("tower_cell_mw");
    var coolUnitsPerHall = Math.ceil(facMwPerHall / rejectPerUnit) + 1;
    counts.heat_rejection = count(coolUnitsPerHall * halls, dry ? "dry coolers" : "tower cells",
      ["power.facility_mw", "cooling.dry_cooling"], "Facility heat over unit rating, N+1.");

    var liquid = s.demand.rack_kw >= C("liquid_cooling_kw");

    // ---- campus arrangement ----
    var genRowD = 14, xfmrRowD = 6, coolRowD = dry ? 10 : 9;
    var moduleD = coolRowD + 6 + D + 4 + xfmrRowD + 4 + genRowD + 16; // + road
    var cols = Math.min(halls, 3);
    var gridRows = Math.ceil(halls / cols);
    var gapX = 36;
    var subW = 70, subD = 60;
    var originX = subW + 40;
    var devW = originX + cols * (W + gapX);
    var devD = gridRows * moduleD + 60;

    var siteSide = Math.sqrt(H.convert(s.site.acres, "ac", "m2"));
    var setback = H.convert(s.site.setback_ft, "ft", "m");
    var siteMinX = devW / 2 - siteSide / 2, siteMinZ = devD / 2 - siteSide / 2;

    b.box("grass", devW / 2, -0.06, devD / 2, siteSide + 400, 0.1, siteSide + 400, {});
    b.box("fence", devW / 2, 1.2, siteMinZ, siteSide, 2.4, 0.06, { solid: true });
    b.box("fence", devW / 2, 1.2, siteMinZ + siteSide, siteSide, 2.4, 0.06, { solid: true });
    b.box("fence", siteMinX, 1.2, devD / 2, 0.06, 2.4, siteSide, { solid: true });
    b.box("fence", siteMinX + siteSide, 1.2, devD / 2, 0.06, 2.4, siteSide, { solid: true });
    b.zone({ id: "site", name: "Site boundary", kind: "site", x0: siteMinX, z0: siteMinZ, x1: siteMinX + siteSide, z1: siteMinZ + siteSide,
      facts: [["Site", H.fmt(s.site.acres, "ac")], ["Setback", s.site.setback_ft + " ft (" + setback.toFixed(1) + " m)"]] });

    // Spine road along z at the west of the hall grid, and one per module row.
    b.box("road", originX - 18, 0.02, devD / 2, 12, 0.04, devD + 40, {});

    // ---- substation (west) ----
    var subX = 20 + subW / 2, subZ = 30 + subD / 2;
    b.box("gravel", subX, 0.03, subZ, subW, 0.06, subD, {});
    b.box("fence", subX, 1.2, subZ - subD / 2, subW, 2.4, 0.06, { solid: true });
    b.box("fence", subX, 1.2, subZ + subD / 2, subW, 2.4, 0.06, { solid: true });
    b.box("fence", subX - subW / 2, 1.2, subZ, 0.06, 2.4, subD, { solid: true });
    b.wall("fence", subX + subW / 2, subZ - subD / 2, subX + subW / 2, subZ + subD / 2, 2.4, 0.06, [{ at: subD / 2, width: 6, height: 2.4 }]);
    var nX = d["power.xfmr_count"].value;
    var perRow = Math.max(1, Math.floor((subW - 10) / 11));
    for (var t = 0; t < nX; t++) {
      var tr = Math.floor(t / perRow), tc = t % perRow;
      var tx = subX - subW / 2 + 9 + tc * 11, tz = subZ - subD / 2 + 12 + tr * 16;
      b.floorBox("mv_xfmr", tx, tz, 6, 6.5, 7, { solid: true, tag: "T" + (t + 1) });
      // Dead-end gantry: two posts and a beam, open so the yard reads through it.
      b.floorBox("gantry", tx - 3.3, tz + 6.5, 0.4, 12, 0.4, { solid: true });
      b.floorBox("gantry", tx + 3.3, tz + 6.5, 0.4, 12, 0.4, { solid: true });
      b.box("gantry", tx, 11.6, tz + 6.5, 7, 0.4, 0.4, {});
    }
    b.floorBox("control_bldg", subX + subW / 2 - 14, subZ + subD / 2 - 10, 18, 4.5, 10, { solid: true });
    b.sign("SUBSTATION · " + H.fmt(d["power.substation_mva"].value, "MVA", 0), subX + subW / 2 + 0.2, 3.2, subZ - 6, 1, 7);
    b.zone({ id: "substation", name: "Campus substation", kind: "substation", x0: subX - subW / 2, z0: subZ - subD / 2, x1: subX + subW / 2, z1: subZ + subD / 2,
      facts: [["MV transformers", counts.mv_xfmr.value + " × " + s.power.xfmr_mva + " MVA"], ["Substation", H.fmt(d["power.substation_mva"].value, "MVA", 1)], ["POI", s.power.poi_distance_mi.toFixed(1) + " mi"]],
      counts: ["mv_xfmr"] });
    b.spawn("substation", "Substation", subX + subW / 2 - 4, subZ + 4, Math.PI / 2 - 0.42, undefined, 0.1);

    // Parking near the first hall.
    var parkM2 = H.convert(d["space.parking_ac"].value, "ac", "m2");
    var parkW = Math.min(90, Math.sqrt(parkM2 * 1.6)), parkD = parkM2 / parkW;
    var parkX = subX, parkZ = subZ + subD / 2 + 30 + parkD / 2;
    b.box("parking", parkX, 0.025, parkZ, parkW, 0.05, parkD, {});
    for (var ps = 0; ps < Math.floor(parkW / 2.7); ps++) b.box("stripe", parkX - parkW / 2 + 1.35 + ps * 2.7, 0.055, parkZ - parkD / 2 + 2.7, 0.12, 0.01, 5.2, {});

    // ---- hall modules ----
    for (var hIdx = 0; hIdx < halls; hIdx++) {
      var gc = hIdx % cols, gr = Math.floor(hIdx / cols);
      var bx = originX + gc * (W + gapX);             // building min x
      var bz = 20 + gr * moduleD + coolRowD + 6;      // building min z
      var tag = "B" + (hIdx + 1);
      buildHall(b, {
        tag: tag, bx: bx, bz: bz, W: W, D: D, wallH: wallH, galleryD: galleryD, hallD: hallD, corridor: corridor,
        elecD: elecD, roomW: roomW, rooms: roomsPerHall, mwPerRoom: mwPerRoom, racksTotal: racksTotal,
        racksHere: Math.round(racksTotal * (hIdx + 1) / halls) - Math.round(racksTotal * hIdx / halls),
        upsPerRoom: upsPerRoom, swgrPerRoom: swgrPerRoom, redundancy: redundancy, liquid: liquid, rackKw: s.demand.rack_kw,
        gens: gensPerHall, unitSubs: unitSubsPerHall, dry: dry, coolUnits: coolUnitsPerHall, coolRowD: coolRowD,
        xfmrRowD: xfmrRowD, genRowD: genRowD, hIdx: hIdx
      }, counts);
      // Module road along x, south of the generator yard.
      b.box("road", bx + W / 2, 0.02, bz + D + 4 + xfmrRowD + 4 + genRowD + 8, W + gapX, 0.04, 10, {});
    }

    var first = b.spawns.filter(function (sp) { return sp.id === "B1-entrance"; })[0];
    // An elevated overview, in fly mode, looking across the campus.
    b.spawn("overview", "Campus overview", -40, devD + 120, Math.atan2(-(devW / 2 + 40), devD / 2 + 120), 140, -0.42);

    return {
      type: "data_center",
      method: METHOD,
      runId: feas.runId,
      units: "m",
      bounds: { x0: r3(Math.min(siteMinX, 0)), z0: r3(Math.min(siteMinZ, 0)), x1: r3(Math.max(siteMinX + siteSide, devW)), z1: r3(Math.max(siteMinZ + siteSide, devD)) },
      hall: { w: r3(W), d: r3(D), rooms: roomsPerHall, room_w: r3(roomW), hall_d: r3(hallD), gallery_d: r3(galleryD), elec_d: r3(elecD), wall_h: wallH },
      liquid: liquid,
      cooling: dry ? "dry" : "evaporative",
      counts: counts,
      conventions: CONVENTIONS,
      boxes: b.boxes,
      signs: b.signs,
      fixtures: b.fixtures,
      zones: b.zones,
      spawns: b.spawns,
      start: first ? first.id : b.spawns[0].id
    };
  }

  function buildHall(b, o, counts) {
    var bx = o.bx, bz = o.bz, W = o.W, D = o.D, H_ = o.wallH;
    var zGal0 = bz, zGal1 = bz + o.galleryD;
    var zHall0 = zGal1, zHall1 = zHall0 + o.hallD;
    var zCor0 = zHall1, zCor1 = zCor0 + o.corridor;
    var zEl0 = zCor1, zEl1 = bz + D;
    var ext = 0.4, inner = 0.25;
    // The module's own apron, so the HUD names the building from outside it.
    b.zone({ id: o.tag + "-apron", name: o.tag + " · hall module " + (o.hIdx + 1), kind: "apron", building: o.tag,
      x0: bx - 40, z0: bz - 40, x1: bx + W + 40, z1: bz + D + 40,
      facts: [["Data halls", o.rooms + " × " + H.fmt(o.mwPerRoom, "MW", 1) + " IT"], ["Racks here", o.racksHere.toLocaleString("en-US")],
        ["Footprint", Math.round(W) + " × " + Math.round(D) + " m"], ["Clear height", C("clear_height_m") + " m"]],
      counts: ["racks"] });

    // Slab, roof and exterior walls. Doors: both ends of the corridor.
    b.box("slab", bx + W / 2, 0.01, bz + D / 2, W, 0.02, D, {});
    b.box("roof", bx + W / 2, H_ + 0.35, bz + D / 2, W + 0.8, 0.7, D + 0.8, { building: o.tag });
    b.box("parapet", bx + W / 2, H_ + 1.0, bz - 0.2, W + 0.8, 0.6, 0.3, {});
    b.box("parapet", bx + W / 2, H_ + 1.0, bz + D + 0.2, W + 0.8, 0.6, 0.3, {});
    var corMid = (zCor0 + zCor1) / 2 - bz;
    b.wall("wall_ext", bx, bz, bx + W, bz, H_, ext, []);
    b.wall("wall_ext", bx, bz + D, bx + W, bz + D, H_, ext, []);
    b.wall("wall_ext", bx, bz, bx, bz + D, H_, ext, [{ at: corMid, width: 3.2, height: 3.4 }]);
    b.wall("wall_ext", bx + W, bz, bx + W, bz + D, H_, ext, [{ at: corMid, width: 3.2, height: 3.4 }]);
    b.sign(o.tag + " · HALL MODULE " + (o.hIdx + 1), bx - 0.25, 6.0, bz + corMid, 3, 6);
    b.box("canopy", bx - 1.6, 3.9, bz + corMid, 3.2, 0.25, 5, {});
    b.spawn(o.tag + "-entrance", o.tag + " entrance", bx - 19, bz + corMid + 11, -1.02, undefined, 0.1);

    // Corridor walls with one door to each data hall and each electrical room.
    var hallDoors = [], elecDoors = [];
    for (var r = 0; r < o.rooms; r++) {
      hallDoors.push({ at: (r + 0.5) * o.roomW, width: 2.6, height: 3.2 });
      elecDoors.push({ at: (r + 0.5) * o.roomW, width: 2.2, height: 3.0 });
    }
    b.wall("wall", bx, zCor0, bx + W, zCor0, H_, inner, hallDoors);
    b.wall("wall", bx, zCor1, bx + W, zCor1, H_, inner, elecDoors);
    // Gallery wall: one door per room, at the room's west side.
    var galDoors = [];
    for (r = 0; r < o.rooms; r++) galDoors.push({ at: r * o.roomW + 3, width: 1.4, height: 2.4 });
    b.wall("wall", bx, zGal1, bx + W, zGal1, H_, inner, galDoors);
    // Room dividers.
    for (r = 1; r < o.rooms; r++) {
      var xr = bx + r * o.roomW;
      b.wall("wall", xr, zGal0, xr, zHall1, H_, inner, []);
      b.wall("wall", xr, zEl0, xr, zEl1, H_, inner, []);
    }
    b.zone({ id: o.tag + "-corridor", name: o.tag + " main corridor", kind: "corridor", building: o.tag, x0: bx, z0: zCor0, x1: bx + W, z1: zCor1, facts: [["Width", o.corridor + " m"]] });
    b.spawn(o.tag + "-corridor", o.tag + " corridor", bx + 4, (zCor0 + zCor1) / 2, -Math.PI / 2);
    fixturesAlong(b, bx + 3, bx + W - 3, (zCor0 + zCor1) / 2, H_ - 0.6, 6, "x");

    for (r = 0; r < o.rooms; r++) {
      var rx0 = bx + r * o.roomW, rx1 = rx0 + o.roomW;
      var roomTag = o.tag + "-H" + (r + 1);
      var racksRoom = Math.round(o.racksHere * (r + 1) / o.rooms) - Math.round(o.racksHere * r / o.rooms);
      dataHall(b, o, roomTag, rx0, rx1, zHall0, zHall1, racksRoom);
      gallery(b, o, o.tag + "-M" + (r + 1), rx0, rx1, zGal0, zGal1);
      electricalRoom(b, o, o.tag + "-E" + (r + 1), rx0, rx1, zEl0, zEl1);
    }

    // ---- outside, south: unit substations then the generator yard ----
    var zX = bz + D + 4 + o.xfmrRowD / 2;
    var span = W - 8;
    for (var t = 0; t < o.unitSubs; t++) {
      var tx = bx + 4 + (t + 0.5) * span / o.unitSubs;
      b.floorBox("pad", tx, zX, 3.6, 0.15, 3.6, {});
      b.floorBox("unit_xfmr", tx, zX, 2.6, 2.4, 2.4, { solid: true });
    }
    var zG = zX + o.xfmrRowD / 2 + 4 + o.genRowD / 2;
    b.box("gravel", bx + W / 2, 0.03, zG, W, 0.06, o.genRowD + 6, {});
    var gPitch = Math.min(6, (W - 6) / o.gens);
    for (var g = 0; g < o.gens; g++) {
      var gx = bx + 3 + (g + 0.5) * (W - 6) / o.gens;
      var gw = Math.min(3.2, gPitch - 1.2);
      b.floorBox("genset", gx, zG, gw, 4.0, 12.5, { solid: true, tag: o.tag + "-G" + (g + 1) });
      b.box("stack", gx, 5.2, zG - 4.5, 0.5, 2.4, 0.5, {});
    }
    b.zone({ id: o.tag + "-genyard", name: o.tag + " generator yard", kind: "yard", building: o.tag, x0: bx, z0: zG - o.genRowD / 2 - 3, x1: bx + W, z1: zG + o.genRowD / 2 + 3,
      facts: [["Gensets", o.gens + " × " + C("gen_mw") + " MW"], ["Unit substations", String(o.unitSubs)]], counts: ["generators", "unit_subs"] });
    b.spawn(o.tag + "-genyard", o.tag + " generator yard", bx + 1.2, zG - 6.25 - 1.6, -Math.PI / 2 - 0.3, undefined, 0.04);

    // ---- outside, north: heat rejection ----
    var zC = bz - 6 - o.coolRowD / 2;
    b.box("gravel", bx + W / 2, 0.03, zC, W, 0.06, o.coolRowD + 4, {});
    var cw = (W - 6) / o.coolUnits;
    for (var c = 0; c < o.coolUnits; c++) {
      var cx = bx + 3 + (c + 0.5) * cw;
      if (o.dry) b.floorBox("dry_cooler", cx, zC, Math.min(2.4, cw - 0.6), 2.8, o.coolRowD - 1, { solid: true });
      else {
        b.floorBox("tower", cx, zC, Math.min(7.2, cw - 0.4), 7.5, 7.2, { solid: true });
        b.box("tower_fan", cx, 7.9, zC, Math.min(5.4, cw - 1.2), 0.8, 5.4, {});
      }
    }
    b.zone({ id: o.tag + "-coolyard", name: o.tag + (o.dry ? " dry cooler yard" : " cooling tower yard"), kind: "yard", building: o.tag,
      x0: bx, z0: zC - o.coolRowD / 2 - 2, x1: bx + W, z1: zC + o.coolRowD / 2 + 2,
      facts: [[o.dry ? "Dry coolers" : "Tower cells", String(o.coolUnits)]], counts: ["heat_rejection"] });
  }

  // Linear LED fixtures in a line, spaced `pitch` metres apart.
  function fixturesAlong(b, a0, a1, other, y, pitch, axis) {
    var n = Math.max(1, Math.floor((a1 - a0) / pitch));
    for (var i = 0; i <= n; i++) {
      var a = a0 + (a1 - a0) * (n ? i / n : 0.5);
      if (axis === "x") b.fixtures.push({ x: r3(a), y: y, z: r3(other), axis: "x" });
      else b.fixtures.push({ x: r3(other), y: y, z: r3(a), axis: "z" });
    }
  }

  // Rows run along z (from the fan wall toward the corridor). Pairs of rows
  // back onto a contained hot aisle; cold aisles sit between pairs.
  function rowPlan(racks, availW, availD) {
    var rw = C("rack_w_m"), rd = C("rack_d_m"), cold = C("cold_aisle_m"), hot = C("hot_aisle_m");
    var pitch = rd * 2 + hot + cold;
    var maxPairs = Math.max(1, Math.floor((availW + cold) / pitch));
    var maxPerRow = Math.min(C("racks_per_row_max"), Math.max(1, Math.floor(availD / rw)));
    var best = null;
    for (var p = 1; p <= maxPairs; p++) {
      var perRow = Math.ceil(racks / (2 * p));
      if (perRow > maxPerRow) continue;
      var blockW = p * pitch - cold, blockD = perRow * rw;
      var score = Math.abs(Math.log((blockD / blockW) / (availD / availW)));
      if (!best || score < best.score) best = { pairs: p, perRow: perRow, score: score, pitch: pitch, blockW: blockW, blockD: blockD };
    }
    if (!best) {
      // Does not fit in one row segment: use every pair and let rows run long.
      var perRow2 = Math.ceil(racks / (2 * maxPairs));
      best = { pairs: maxPairs, perRow: perRow2, pitch: pitch, blockW: maxPairs * pitch - cold, blockD: perRow2 * rw, overflow: perRow2 > maxPerRow };
    }
    return best;
  }

  function dataHall(b, o, tag, x0, x1, z0, z1, racks) {
    var H_ = o.wallH;
    var rw = C("rack_w_m"), rd = C("rack_d_m"), rh = C("rack_h_m"), hot = C("hot_aisle_m");
    var margin = 4;
    var availW = x1 - x0 - 2 * margin, availD = z1 - z0 - 2 * margin - (o.liquid ? 2.4 : 0);
    var plan = rowPlan(racks, availW, availD);
    var bx0 = (x0 + x1) / 2 - plan.blockW / 2;
    var bz0 = (z0 + z1) / 2 - plan.blockD / 2 + (o.liquid ? 1.2 : 0);
    var placed = 0, rowN = 0;

    for (var p = 0; p < plan.pairs && placed < racks; p++) {
      var px = bx0 + p * plan.pitch;           // west row's west face
      var hotX = px + rd + hot / 2;            // hot aisle centreline
      for (var side = 0; side < 2 && placed < racks; side++) {
        var cx = side === 0 ? px + rd / 2 : px + rd + hot + rd / 2;
        // Racks face away from the hot aisle: west row faces -x (rot 3), east row +x (rot 1).
        var rot = side === 0 ? 3 : 1;
        var inRow = Math.min(plan.perRow, racks - placed);
        rowN++;
        for (var k = 0; k < inRow; k++) {
          b.floorBox("rack", cx, bz0 + (k + 0.5) * rw, rd, rh, rw, { solid: true, rot: rot, room: tag, row: rowN });
        }
        placed += inRow;
        var rowLen = inRow * rw;
        // Overhead busway runs above each row; 2N gets an A and a B feed.
        var feeds = o.redundancy === "2N" ? 2 : 1;
        for (var f = 0; f < feeds; f++) {
          b.box("busway", cx + (f === 0 ? -0.15 : 0.15), rh + 0.9 + f * 0.25, bz0 + rowLen / 2, 0.14, 0.2, rowLen + 1.2, { feed: f === 0 ? "A" : "B" });
        }
        b.box("tray", cx, rh + 1.7, bz0 + rowLen / 2, 0.6, 0.1, rowLen + 1.2, {});
        b.box("fiber_tray", cx + (side === 0 ? -0.35 : 0.35), rh + 2.05, bz0 + rowLen / 2, 0.3, 0.1, rowLen + 1.2, {});
        // Busway tap-off boxes, one per two racks.
        for (k = 0; k < inRow; k += 2) b.box("tapbox", cx, rh + 0.55, bz0 + (k + 0.5) * rw, 0.22, 0.3, 0.24, {});
        // Row-end PDU / RPP cabinet on the corridor side.
        b.floorBox("pdu", cx, bz0 + rowLen + 0.6, rd, 2.0, 0.8, { solid: true, room: tag });
        if (o.liquid) b.floorBox("cdu", cx, bz0 - 1.0, rd, 2.0, 1.2, { solid: true, room: tag });
      }
      // Hot aisle containment: roof panel and end doors, between the two rows of this pair.
      var pairLen = plan.perRow * rw;
      b.box("containment", hotX, rh + 0.05, bz0 + pairLen / 2, hot + 0.02, 0.06, pairLen, {});
      b.box("containment_door", hotX, rh / 2, bz0 - 0.03, hot, rh, 0.05, { solid: true });
      b.box("containment_door", hotX, rh / 2, bz0 + pairLen + 0.03, hot, rh, 0.05, { solid: true });
      b.box("chimney", hotX, (rh + H_ - 0.6) / 2 + 0.1, bz0 + pairLen / 2, hot, H_ - 0.6 - rh, pairLen, { open: true });
    }

    // Cold-aisle and perimeter lighting over the hall.
    for (var lx = x0 + 2.5; lx < x1 - 2; lx += 4.5) fixturesAlong(b, z0 + 2, z1 - 2, lx, H_ - 0.9, 5, "z");
    // Floor safety striping at the perimeter of the rack block.
    b.box("stripe_y", (x0 + x1) / 2, 0.025, bz0 - (o.liquid ? 2.3 : 1.0), plan.blockW + 2, 0.005, 0.1, {});
    b.box("stripe_y", (x0 + x1) / 2, 0.025, bz0 + plan.blockD + 1.4, plan.blockW + 2, 0.005, 0.1, {});
    // Structural columns on the 30 ft grid, clear of the rack block.
    // Kept clear: the rack block, the door from the gallery, the door from
    // the corridor, and the spot a visitor starts on.
    var spX = bx0 - 2.2, spZ = bz0 + plan.blockD + 2.2, midX = (x0 + x1) / 2;
    columns(b, x0, x1, z0, z1, H_, [
      { x0: bx0 - 1.0, x1: bx0 + plan.blockW + 1.0, z0: bz0 - (o.liquid ? 2.6 : 1.2), z1: bz0 + plan.blockD + 1.6 },
      { x0: x0 + 1.0, x1: x0 + 5.0, z0: z0 - 1, z1: z0 + 3.0 },
      { x0: midX - 2.8, x1: midX + 2.8, z0: z1 - 3.5, z1: z1 + 1 },
      { x0: spX - 1.5, x1: spX + 1.5, z0: spZ - 1.5, z1: spZ + 1.5 }
    ]);
    // Roof joists overhead.
    for (var jx = x0 + 1.5; jx < x1; jx += 3) b.box("joist", jx, H_ - 0.35, (z0 + z1) / 2, 0.12, 0.6, z1 - z0, {});
    b.sign("DATA HALL " + tag, (x0 + x1) / 2, 4.2, z1 - 0.15, 2, 5);

    b.zone({ id: tag, name: "Data hall " + tag, kind: "data_hall", building: o.tag, x0: x0, z0: z0, x1: x1, z1: z1,
      racks: placed, rows: rowN, overflow: !!plan.overflow,
      facts: [["IT load", H.fmt(o.mwPerRoom, "MW", 1)], ["Racks", placed + " at " + o.rackKw + " kW"], ["Rows", rowN + " in " + Math.ceil(rowN / 2) + " contained pairs"],
        ["Cooling", (o.liquid ? "Fan wall + direct-to-chip CDUs" : "Fan wall, hot aisle containment")], ["Busway", o.redundancy === "2N" ? "A + B feeds per row" : "One feed per row"]],
      counts: ["racks"] });
    b.spawn(tag, "Data hall " + tag, spX, spZ, -Math.PI / 4);
  }

  function gallery(b, o, tag, x0, x1, z0, z1) {
    var H_ = o.wallH;
    // Fan-wall units line the hall side of the gallery, blowing into the hall.
    var unitW = 2.4;
    var n = Math.max(1, Math.floor((x1 - x0 - 6) / (unitW + 0.4)));
    for (var i = 0; i < n; i++) {
      var ux = x0 + 4.5 + i * (unitW + 0.4) + unitW / 2;
      if (ux + unitW / 2 > x1 - 1) break;
      b.floorBox("fanwall", ux, z1 - 1.3, unitW, Math.min(5.4, H_ - 1.5), 2.2, { solid: true });
    }
    // Chilled water headers along the gallery.
    b.box("pipe_cw", (x0 + x1) / 2, H_ - 1.4, z0 + 1.2, x1 - x0 - 1, 0.45, 0.45, {});
    b.box("pipe_hw", (x0 + x1) / 2, H_ - 2.1, z0 + 1.2, x1 - x0 - 1, 0.45, 0.45, {});
    fixturesAlong(b, x0 + 2, x1 - 2, (z0 + z1) / 2 - 1, H_ - 0.7, 6, "x");
    b.sign("MECH GALLERY " + tag, x0 + 3, 3.4, z1 - 0.15, 2, 4);
    b.zone({ id: tag, name: "Mechanical gallery " + tag, kind: "gallery", building: o.tag, x0: x0, z0: z0, x1: x1, z1: z1,
      facts: [["Fan-wall units", String(n)], ["Heat rejection", o.dry ? "Dry coolers" : "Cooling towers"]] });
    b.spawn(tag, "Mechanical gallery " + tag, x0 + 1.6, (z0 + z1) / 2 - 1.5, -Math.PI / 2);
  }

  // UPS modules, their battery cabinets and the LV switchgear lineup, in rows
  // along x with working clearance in front of every lineup.
  function electricalRoom(b, o, tag, x0, x1, z0, z1) {
    var H_ = o.wallH, clear = C("working_clear_m");
    var usableW = x1 - x0 - 3;
    var feeders = Math.ceil(o.unitSubs / o.rooms);
    var specs = [
      { kind: "mv_gear", units: feeders + 2, unitW: 0.9, depth: 2.3, height: 2.6, label: "MV SWGR " + tag },
      { kind: "swgr", units: o.swgrPerRoom, unitW: 0.9, depth: 1.6, height: 2.3, label: "LV SWGR " + tag },
      { kind: "ups", units: o.upsPerRoom, unitW: 1.8, depth: 1.0, height: 2.0, label: "UPS " + tag },
      { kind: "battery", units: o.upsPerRoom * C("battery_per_ups"), unitW: 0.9, depth: 0.8, height: 2.0, label: "BATT " + tag }
    ];
    // Lay each lineup out, wrapping long ones, then spread the rows over the
    // room depth: working clearance in front of each, never less.
    var rows = [];
    specs.forEach(function (sp) {
      var perLine = Math.max(1, Math.floor(usableW / sp.unitW));
      for (var placed = 0, l = 0; placed < sp.units; l++) {
        var n = Math.min(perLine, sp.units - placed);
        rows.push({ sp: sp, n: n, first: placed, line: l, lines: Math.ceil(sp.units / perLine) });
        placed += n;
      }
    });
    var need = 1.8 + rows.reduce(function (a, r) { return a + clear + r.sp.depth; }, 0);
    var spare = Math.max(0, z1 - z0 - need - clear);
    var extra = Math.min(2.0, spare / rows.length);
    var z = z0 + 1.8, spawnX = null;
    rows.forEach(function (r) {
      var sp = r.sp;
      var zc = z + clear + extra + sp.depth / 2;
      var lx0 = (x0 + x1) / 2 - (r.n * sp.unitW) / 2;
      if (spawnX === null) spawnX = Math.max(x0 + 1.5, lx0 - 2.5);
      for (var i = 0; i < r.n; i++) {
        b.floorBox(sp.kind, lx0 + (i + 0.5) * sp.unitW, zc, sp.unitW - 0.02, sp.height, sp.depth, { solid: true, rot: 2, room: tag, unit: r.first + i + 1 });
      }
      b.sign(sp.label + (r.lines > 1 ? " " + (r.line + 1) : ""), lx0 + 1.6, sp.height + 0.45, zc - sp.depth / 2 - 0.02, 2, 3.2);
      // Cable tray over each lineup, and a feeder busway dropping to its top.
      b.box("tray", (x0 + x1) / 2, H_ - 1.6, zc, usableW, 0.12, 0.9, {});
      b.box("busway", lx0 + 0.6, (sp.height + H_ - 1.6) / 2, zc, 0.3, H_ - 1.6 - sp.height, 0.2, {});
      z = zc + sp.depth / 2;
    });

    var fits = z + clear <= z1;
    for (var lx = x0 + 3; lx < x1 - 2; lx += 5) fixturesAlong(b, z0 + 2, z1 - 2, lx, H_ - 0.8, 5, "z");
    for (var jx = x0 + 1.5; jx < x1; jx += 3) b.box("joist", jx, H_ - 0.35, (z0 + z1) / 2, 0.12, 0.6, z1 - z0, {});
    b.sign("ELECTRICAL " + tag, (x0 + x1) / 2, 4.0, z0 + 0.15, 0, 4.4);
    b.zone({ id: tag, name: "Electrical room " + tag, kind: "electrical", building: o.tag, x0: x0, z0: z0, x1: x1, z1: z1, fits: fits,
      facts: [["MV switchgear", (feeders + 2) + " sections"], ["LV switchgear", o.swgrPerRoom + " sections"],
        ["UPS modules", o.upsPerRoom + " × " + C("ups_module_mw") + " MW (" + o.redundancy + ")"], ["Battery cabinets", String(o.upsPerRoom * C("battery_per_ups"))],
        ["Serves", H.fmt(o.mwPerRoom, "MW", 1) + " IT"], ["Fits with clearance", fits ? "yes" : "no — room too shallow"]],
      counts: ["mv_switchgear", "switchgear", "ups", "batteries"] });
    b.spawn(tag, "Electrical room " + tag, spawnX === null ? x0 + 2.2 : spawnX, z0 + 1.8, -Math.PI * 0.62, undefined, -0.04);
  }

  function columns(b, x0, x1, z0, z1, H_, keepOut) {
    var grid = H.convert(30, "ft", "m");
    var first = Math.ceil(x0 / grid) * grid, firstZ = Math.ceil(z0 / grid) * grid;
    for (var x = first; x < x1 - 0.5; x += grid) {
      for (var z = firstZ; z < z1 - 0.5; z += grid) {
        if (x - x0 < 0.6 || z - z0 < 0.6) continue;
        if (keepOut.some(function (k) { return x > k.x0 && x < k.x1 && z > k.z0 && z < k.z1; })) continue;
        b.box("column", x, H_ / 2, z, 0.45, H_, 0.45, { solid: true });
      }
    }
  }

  // ---- the registry and the entry point ----------------------------------

  var TYPES = { data_center: dataCenter };

  H.WALK = {
    METHOD: METHOD,
    CONVENTIONS: CONVENTIONS,
    TYPES: TYPES,
    register: function (type, builder) { TYPES[type] = builder; },
    build: function (feas, type) {
      var t = type || "data_center";
      var fn = TYPES[t];
      if (!fn) throw new Error("no walkthrough builder for building type " + t);
      return fn(feas);
    },
    // Which zone a point falls in, smallest first, so a room wins over the site.
    zoneAt: function (model, x, z) {
      var hit = null, area = Infinity;
      model.zones.forEach(function (zn) {
        if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) {
          var a = (zn.x1 - zn.x0) * (zn.z1 - zn.z0);
          if (a < area) { area = a; hit = zn; }
        }
      });
      return hit;
    },
    // Axis-aligned footprints of everything you cannot walk through.
    colliders: function (model) {
      return model.boxes.filter(function (bx) { return bx.solid; }).map(function (bx) {
        return { x0: bx.x - bx.w / 2, x1: bx.x + bx.w / 2, z0: bx.z - bx.d / 2, z1: bx.z + bx.d / 2, y0: bx.y - bx.h / 2, y1: bx.y + bx.h / 2, kind: bx.kind };
      });
    }
  };
})(window.HACD);
