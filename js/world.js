// Nine Crests - the tile world: reading maps, ground heights (terraces, cliffs and steps), collision,
// cutting/burning/breaking tiles, and the map checker.
(function () {
  'use strict';
  var SC = window.SC;
  var W = SC.world = {};
  W.TIER = 1.0;          // one height step in world units
  var MAXSTEP = 0.45;    // the biggest bump you can walk over

  var FLOORS = { '.': 1, ',': 1, 'i': 1, ':': 1, '=': 1, ';': 1, 'm': 1, 'S': 1, 'u': 1 };
  var MARKERS = { P: 1, C: 1, K: 1, g: 1, h: 1, B: 1, D: 1, X: 1, N: 1, H: 1 };
  // temples: W wall, Q door (shut until the crest task is done), Y pillar / brazier, J altar
  // Z: the walls of a tall building (its height is the ground height of the tile; see def.towers)
  var SOLID = { '#': 1, '^': 1, '*': 1, '|': 1, '%': 1, '-': 1, '&': 1, '$': 1, F: 1, '+': 1, '@': 1, y: 1, d: 1, n: 1, b: 1, t: 1, k: 1, T: 1, O: 1, U: 1, A: 1, W: 1, Q: 1, Y: 1, J: 1, Z: 1 };
  var LOW = { '-': 1, '$': 1 };   // low things a thrown thing flies over
  W.isFloor = function (ch) { return !!FLOORS[ch]; };
  W.isSolidScenery = function (ch) { return !!SOLID[ch]; };

  function floorFor(rows, x, y) {
    var n = { ';': 0, ':': 0 };
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var r = rows[y + d[1]]; var c = r ? r.charAt(x + d[0]) : ''; if (n[c] !== undefined) n[c]++; });
    return n[';'] >= 2 ? ';' : n[':'] >= 2 ? ':' : '.';
  }

  // Parse a level definition into a fresh runtime level object.
  // index 'base' (or -1) is the Home Base: L.index = -1, L.isBase = true, L.portals = [{tx, ty, planet}] instead of L.gate
  W.parse = function (index) {
    var isBase = index === 'base' || index === -1;
    var def = isBase ? SC.BASE : SC.LEVELS[index];
    var rows = def.map, hrows = def.hmap || [], h = rows.length, w = 0, x, y;
    for (y = 0; y < h; y++) w = Math.max(w, rows[y].length);
    var L = {
      index: isBase ? -1 : index, isBase: isBase, portals: isBase ? [] : null, def: def, w: w, h: h, tiles: new Array(w * h), theme: SC.THEMES[def.theme],
      start: null, checkpoints: [], gate: null, crests: [], chests: [], boss: null, enemies: [], items: [],
      gateOpen: false, changes: [], burning: [], problems: [], blocks: [], npcs: [], traps: [],
      hgt: new Int8Array(w * h), stair: new Int8Array(w * h)
    };
    var crestN = 0, chestN = 0, camps = def.camps || {}, crestAt = def.crestAt || {}, chestAt = def.chestAt || {};
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var ch = x < rows[y].length ? rows[y].charAt(x) : '#';
        var t = ch, key = x + ',' + y;
        if (MARKERS[ch] || SC.ENEMY_CHARS[ch]) t = floorFor(rows, x, y);
        if (ch === 'P') L.start = { tx: x, ty: y };
        else if (ch === 'C') L.checkpoints.push({ tx: x, ty: y });
        else if (ch === 'G') { if (isBase) L.portals.push({ tx: x, ty: y, planet: (def.portalAt || {})[key] || 'Verdia', face: (def.portalFace || {})[key] || [0, 1] }); else L.gate = { tx: x, ty: y }; }
        else if (ch === 'K') { L.crests.push({ tx: x, ty: y, power: crestAt[key] || def.crests[crestN] }); crestN++; }
        else if (ch === 'T') { L.chests.push({ tx: x, ty: y, content: chestAt[key] || def.chests[chestN] }); chestN++; }
        else if (ch === 'B' || ch === 'D') L.boss = { tx: x, ty: y, type: def.boss };
        else if (ch === 'g') L.items.push({ tx: x, ty: y, kind: 'gem' });
        else if (ch === 'h') L.items.push({ tx: x, ty: y, kind: 'heart' });
        else if (ch === 'X') L.blocks.push({ tx: x, ty: y });
        else if (ch === 'N') L.npcs.push({ tx: x, ty: y, role: 'trader' });
        else if (ch === 'H') L.npcs.push({ tx: x, ty: y, role: 'smith' });
        else if (SC.ENEMY_CHARS[ch]) { var en = { tx: x, ty: y, type: SC.ENEMY_CHARS[ch] }; if (camps[key]) en.camp = camps[key]; L.enemies.push(en); }
        L.tiles[y * w + x] = t;
        var hc = hrows[y] ? hrows[y].charAt(x) : '0';
        L.hgt[y * w + x] = hc >= '0' && hc <= '9' ? hc.charCodeAt(0) - 48 : 0;
      }
    }
    // which way is up on each step tile
    var NB = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var i = y * w + x;
      L.stair[i] = -1;
      if (L.tiles[i] !== 'S') continue;
      var given = def.stairs && def.stairs[x + ',' + y];
      if (given !== undefined) {
        L.stair[i] = given;
        var ux = x + NB[given][0], uy = y + NB[given][1];
        if (ux < 0 || uy < 0 || ux >= w || uy >= h || L.hgt[uy * w + ux] !== L.hgt[i] + 1) L.problems.push(def.name + ': steps at ' + x + ',' + y + ' do not reach the next height');
        continue;
      }
      for (var d = 0; d < 4; d++) {
        var nx = x + NB[d][0], ny = y + NB[d][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var j = ny * w + nx;
        if (L.tiles[j] !== 'S' && L.hgt[j] === L.hgt[i] + 1) { L.stair[i] = d; break; }
      }
      if (L.stair[i] < 0) L.problems.push(def.name + ': steps at ' + x + ',' + y + ' lead nowhere');
    }
    (def.traps || []).forEach(function (o) { var c = {}; for (var k in o) c[k] = o[k]; L.traps.push(c); });
    // temples: a fresh copy each time (open = the door is open), and a mask of the tiles inside them
    L.inTemple = new Uint8Array(w * h);
    L.temples = (def.temples || []).map(function (d, ti) {
      var cp = function (o) { return { tx: o.tx, ty: o.ty }; };
      var tp = { idx: ti, power: d.power, name: SC.templeName ? SC.templeName(d.power) : d.power + ' Temple', side: d.side, f: d.f, a: d.a, t0: d.t0, ex: d.ex, ey: d.ey,
        door: d.door.map(cp), arch: d.arch.map(cp), guard: cp(d.guard), altar: cp(d.altar), entry: cp(d.entry), mid: cp(d.mid), altarBlock: cp(d.altarBlock),
        rect: d.rect, hall: d.hall, chamber: d.chamber, pillars: d.pillars.map(cp), braziers: d.braziers.map(cp), open: false, ent: null };
      for (var yy = d.rect.y0; yy <= d.rect.y1; yy++) for (var xx = d.rect.x0; xx <= d.rect.x1; xx++) if (xx >= 0 && yy >= 0 && xx < w && yy < h) L.inTemple[yy * w + xx] = ti + 1;
      return tp;
    });
    // tall buildings: a copy of each, and which building every tile belongs to (index + 1, 0 = none)
    L.towerAt = new Uint8Array(w * h);
    L.towers = (def.towers || []).map(function (d, bi) {
      var tw = { idx: bi, x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1, top: d.top, style: d.style, climb: !!d.climb, roof: d.roof ? { tx: d.roof.tx, ty: d.roof.ty } : null,
        chest: d.chest ? { tx: d.chest.tx, ty: d.chest.ty } : null, topper: d.topper || null };
      for (var yy = d.y0; yy <= d.y1; yy++) for (var xx = d.x0; xx <= d.x1; xx++) if (xx >= 0 && yy >= 0 && xx < w && yy < h) L.towerAt[yy * w + xx] = bi + 1;
      return tw;
    });
    L.district = def.district ? { x: def.district.x, y: def.district.y } : null;
    L.ver = 0;
    if (!L.start) L.problems.push(def.name + ': no start P');
    if (crestN !== def.crests.length) L.problems.push(def.name + ': ' + crestN + ' crest spots but ' + def.crests.length + ' crests listed');
    if (chestN !== def.chests.length) L.problems.push(def.name + ': ' + chestN + ' chests but ' + def.chests.length + ' contents listed');
    if (isBase) {
      var wantP = (SC.PLANET_ORDER || []).length || 10;
      if (L.portals.length !== wantP) L.problems.push(def.name + ': ' + L.portals.length + ' planet portals (want ' + wantP + ')');
      if (L.enemies.length || L.boss || L.traps.length) L.problems.push(def.name + ': baddies or traps in the Home Base');
    } else {
      if (!L.boss) L.problems.push(def.name + ': no boss');
      if (!def.arena && !L.gate) L.problems.push(def.name + ': no portal');
      if (!def.arena && (L.blocks.length < 3 || L.blocks.length > 5)) L.problems.push(def.name + ': ' + L.blocks.length + ' portal blocks (want 3 to 5)');
    }
    if (!def.arena && (L.npcs.length !== 2)) L.problems.push(def.name + ': ' + L.npcs.length + ' friendly people (want a trader and a smith)');
    return L;
  };

  W.L = null;
  W.tile = function (tx, ty) {
    var L = W.L;
    if (!L || tx < 0 || ty < 0 || tx >= L.w || ty >= L.h) return '#';
    return L.tiles[ty * L.w + tx];
  };
  W.setTile = function (tx, ty, ch) {
    var L = W.L;
    if (!L || tx < 0 || ty < 0 || tx >= L.w || ty >= L.h) return;
    L.tiles[ty * L.w + tx] = ch;
    L.changes.push(tx, ty);
    L.ver = (L.ver || 0) + 1;
  };
  W.tier = function (tx, ty) {
    var L = W.L;
    if (!L || !L.hgt) return 0;
    tx = tx < 0 ? 0 : tx >= L.w ? L.w - 1 : tx; ty = ty < 0 ? 0 : ty >= L.h ? L.h - 1 : ty;
    return L.hgt[ty * L.w + tx];
  };

  // ground height (world units) under a spot; steps are smooth ramps, water and lava sit a little lower
  function heightIn(L, x, y) {
    if (!L || !L.hgt) return 0;
    var tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0) tx = 0; else if (tx >= L.w) tx = L.w - 1;
    if (ty < 0) ty = 0; else if (ty >= L.h) ty = L.h - 1;
    var i = ty * L.w + tx, base = L.hgt[i] * W.TIER, ch = L.tiles[i];
    if (ch === 'S') {
      var d = L.stair[i], fx = x - tx, fy = y - ty, f;
      if (d === 0) f = fx; else if (d === 1) f = fy; else if (d === 2) f = 1 - fx; else if (d === 3) f = 1 - fy; else f = 0;
      return base + (f < 0 ? 0 : f > 1 ? 1 : f) * W.TIER;
    }
    if (ch === 'w' || ch === 'l') return base - 0.12;
    return base;
  }
  W.heightAt = function (x, y) { return heightIn(W.L, x, y); };
  W.heightIn = heightIn;

  // Water: only Pip can walk on it, and only once the team owns Surface Tension (read the hero at call time; the rules may swap it).
  // Without a Pip in the game (older rules) anyone with Surface Tension may.
  function walkWater() {
    if (typeof SC.canWalkWater === 'function') return !!SC.canWalkWater();
    if (!SC.hasPower || !SC.hasPower('surface')) return false;
    var hasPip = false; for (var i = 0; i < (SC.HEROES || []).length; i++) if (SC.HEROES[i].id === 'pip') hasPip = true;
    return !hasPip || !!(SC.G && SC.G.hero && SC.G.hero.id === 'pip');
  }
  W.walkWater = walkWater;
  W.flyerOK = true;
  // who: 'player' | 'enemy' | 'hot' (enemy that may walk on lava) | 'proj' | 'flyer'
  W.solid = function (ch, who) {
    if (who === 'flyer') return false;
    if (SOLID[ch]) return !(who === 'proj' && LOW[ch]);
    switch (ch) {
      case 'G': return who !== 'player' || !W.L || !W.L.gateOpen;
      case 'w': if (who === 'player') return !walkWater(); return who !== 'proj';
      case 'v': return who !== 'proj';
      case 'l': return who === 'enemy';
      default: return false;
    }
  };
  W.projSolid = function (ch) { return (SOLID[ch] && !LOW[ch]) || (ch === 'G' && !(W.L && W.L.gateOpen)); };

  // a temple with a shut door is closed from above too (nobody flies over its walls)
  function sealedAt(L, x, y, r) {
    var ts = L.temples;
    if (!ts) return false;
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i], R = t.rect;
      if (t.open) continue;
      if (x + r > R.x0 && x - r < R.x1 + 1 && y + r > R.y0 && y - r < R.y1 + 1) return true;
    }
    return false;
  }
  // the temple a spot is in (or null). pad grows the box a little.
  W.templeAt = function (x, y, pad) {
    var L = W.L, ts = L && L.temples;
    if (!ts) return null;
    pad = pad || 0;
    for (var i = 0; i < ts.length; i++) { var R = ts[i].rect; if (x >= R.x0 - pad && x < R.x1 + 1 + pad && y >= R.y0 - pad && y < R.y1 + 1 + pad) return ts[i]; }
    return null;
  };
  W.inBox = function (R, x, y, pad) { pad = pad || 0; return x >= R.x0 - pad && x < R.x1 + 1 + pad && y >= R.y0 - pad && y < R.y1 + 1 + pad; };
  // open a temple door (its tiles become floor)
  W.openTempleDoor = function (t) {
    if (!t) return;
    t.open = true;
    t.door.forEach(function (d) { if (W.tile(d.tx, d.ty) === 'Q') W.setTile(d.tx, d.ty, ';'); });
  };
  var SX = [-1, 1, -1, 1, 0, 0, -1, 1], SY = [-1, -1, 1, 1, -1, 1, 0, 0];
  // W.flyAlt: while a flying or gliding hero moves, the height of their feet in the world. Ground (a tall building,
  // a high terrace) that reaches above it is a wall for them. null = old rule (flyers pass over everything).
  W.flyAlt = null;
  function tooHigh(L, x, y, r, alt) {
    if (heightIn(L, x, y) > alt + 0.05) return true;
    for (var k = 0; k < 4; k++) if (heightIn(L, x + SX[k] * r * 0.9, y + SY[k] * r * 0.9) > alt + 0.05) return true;
    return false;
  }
  W.blocked = function (x, y, r, who) {
    var L = W.L;
    if (who === 'flyer') return !L || x - r < 0 || y - r < 0 || x + r > L.w || y + r > L.h || sealedAt(L, x, y, r) || (W.flyAlt !== null && tooHigh(L, x, y, r, W.flyAlt));
    var x0 = Math.floor(x - r), x1 = Math.floor(x + r - 1e-4), y0 = Math.floor(y - r), y1 = Math.floor(y + r - 1e-4);
    for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) if (W.solid(W.tile(tx, ty), who)) return true;
    if (who === 'proj' || !L) return false;
    // cliffs: every edge of the body must be at about the same height as its middle
    var hc = heightIn(L, x, y), rr = r * 0.98, n = r > 0.45 ? 8 : 4;
    for (var k = 0; k < n; k++) {
      var hh = heightIn(L, x + SX[k] * rr, y + SY[k] * rr);
      if (hh - hc > MAXSTEP || hc - hh > MAXSTEP) return true;
    }
    return false;
  };
  // Move an entity (needs x, y) by dx,dy with wall sliding. Returns true if something was hit.
  W.move = function (e, dx, dy, r, who) {
    var n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2));
    var sx = dx / n, sy = dy / n, hit = false;
    for (var i = 0; i < n; i++) {
      if (sx !== 0) { if (!W.blocked(e.x + sx, e.y, r, who)) e.x += sx; else { hit = true; sx = 0; } }
      if (sy !== 0) { if (!W.blocked(e.x, e.y + sy, r, who)) e.y += sy; else { hit = true; sy = 0; } }
    }
    return hit;
  };
  // If an entity ended up inside a wall or on a cliff edge (e.g. after a teleport or landing), nudge it to the nearest free spot.
  W.unstick = function (e, r, who) {
    if (!W.blocked(e.x, e.y, r, who)) return;
    for (var rad = 0.25; rad < 7; rad += 0.25) {
      for (var a = 0; a < 16; a++) {
        var nx = e.x + Math.cos(a / 16 * Math.PI * 2) * rad, ny = e.y + Math.sin(a / 16 * Math.PI * 2) * rad;
        if (!W.blocked(nx, ny, r, who)) { e.x = nx; e.y = ny; return; }
      }
    }
  };
  // can you see / throw from one spot to another? (walls stop it; so does a hill higher than both ends)
  W.lineClear = function (x0, y0, x1, y1, who) {
    var d = SC.dist(x0, y0, x1, y1), n = Math.ceil(d / 0.3);
    var L = W.L, top = Math.max(heightIn(L, x0, y0), heightIn(L, x1, y1)) + 0.6, useH = who !== 'proj' && who !== 'flyer';
    for (var i = 1; i < n; i++) {
      var t = i / n, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
      if (W.projSolid(W.tile(Math.floor(px), Math.floor(py)))) return false;
      if (useH && heightIn(L, px, py) > top) return false;
    }
    return true;
  };

  // ---------- step rules between neighbouring tiles (map checker and path finding) ----------
  var NB4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  function edgeH(L, i, d) {
    var base = L.hgt[i] * W.TIER;
    if (L.tiles[i] !== 'S') return base;
    var s = L.stair[i];
    if (s < 0) return base;
    if (d === s) return base + W.TIER;
    if (d === (s + 2) % 4) return base;
    return NaN;
  }
  function canStepIn(L, ax, ay, bx, by) {
    var d = bx > ax ? 0 : by > ay ? 1 : bx < ax ? 2 : 3;
    if (bx < 0 || by < 0 || bx >= L.w || by >= L.h) return false;
    var a = ay * L.w + ax, b = by * L.w + bx;
    var ha = edgeH(L, a, d), hb = edgeH(L, b, (d + 2) % 4);
    if (isNaN(ha) || isNaN(hb)) return L.tiles[a] === 'S' && L.tiles[b] === 'S' && L.stair[a] === L.stair[b] && L.hgt[a] === L.hgt[b];
    return Math.abs(ha - hb) < 0.3;
  }
  // true when a walker can go straight from tile (ax,ay) to the next tile (bx,by) as far as heights go (ignores walls)
  W.canStep = function (ax, ay, bx, by, who) { if (who === 'flyer') return true; return W.L ? canStepIn(W.L, ax, ay, bx, by) : true; };

  // ---------- changing tiles ----------
  W.cutBush = function (tx, ty) {
    if (W.tile(tx, ty) !== 'b') return false;
    W.setTile(tx, ty, '.');
    SC.fx.burst(tx + 0.5, 0.4, ty + 0.5, 'leaf', 14);
    SC.audio.play('cut');
    var r = Math.random();
    if (r < 0.35) SC.spawnPickup('gem', tx + 0.5, ty + 0.5, 1);
    else if (r < 0.5) SC.spawnPickup('heart', tx + 0.5, ty + 0.5);
    return true;
  };
  W.burnFrom = function (tx, ty) {
    var L = W.L, ch = W.tile(tx, ty);
    if (ch === 'b') { W.setTile(tx, ty, '.'); SC.fx.burst(tx + 0.5, 0.4, ty + 0.5, 'fire', 14); return true; }
    if (ch !== 't') return false;
    var seen = {}, queue = [[tx, ty, 0]];
    seen[tx + ',' + ty] = 1;
    while (queue.length) {
      var q = queue.shift();
      L.burning.push({ tx: q[0], ty: q[1], t: q[2] * 0.12 + 0.05 });
      for (var i = 0; i < 4; i++) {
        var nx = q[0] + NB4[i][0], ny = q[1] + NB4[i][1], k = nx + ',' + ny;
        if (!seen[k] && W.tile(nx, ny) === 't') { seen[k] = 1; queue.push([nx, ny, q[2] + 1]); }
      }
    }
    SC.audio.play('burn');
    return true;
  };
  W.breakBoulder = function (tx, ty) {
    if (W.tile(tx, ty) !== 'k') return false;
    W.setTile(tx, ty, '.');
    SC.fx.burst(tx + 0.5, 0.5, ty + 0.5, 'rock', 22);
    SC.fx.shake(0.25);
    SC.audio.play('crack');
    if (!SC.G.toldBoulder) { SC.G.toldBoulder = true; SC.toast('Crack! The rock broke!'); }
    return true;
  };
  // called by the main loop every simulation step
  W.update = function (dt) {
    var L = W.L;
    for (var i = L.burning.length - 1; i >= 0; i--) {
      var b = L.burning[i];
      b.t -= dt;
      if (b.t <= 0) {
        if (W.tile(b.tx, b.ty) === 't') { W.setTile(b.tx, b.ty, '.'); SC.fx.burst(b.tx + 0.5, 0.5, b.ty + 0.5, 'fire', 16); SC.fx.burst(b.tx + 0.5, 0.6, b.ty + 0.5, 'smoke', 6); }
        L.burning.splice(i, 1);
      }
    }
    if (SC.traps) SC.safe(function () { SC.traps.update(dt); }, 'traps');
  };

  // ---------- map checker ----------
  // Flood-fills each level the way a player could walk it (no flying) and lists anything that cannot be reached.
  W.validate = function () {
    var problems = [], owned = {};
    for (var li = 0; li < SC.LEVELS.length; li++) {
      var L = W.parse(li), def = L.def;
      problems = problems.concat(L.problems);
      if (!L.start) continue;
      problems = problems.concat(shapeProblems(L));
      var have = {}; for (var k in owned) have[k] = 1;
      var reach = null, changed = true, guard = 0;
      while (changed && guard++ < 20) {
        reach = flood(L, have);
        changed = false;
        for (var c = 0; c < L.crests.length; c++) {
          var cr = L.crests[c];
          if (reach[cr.ty * L.w + cr.tx] && !have[cr.power]) { have[cr.power] = 1; changed = true; }
        }
      }
      var name = def.name;
      var at = function (o) { return reach[o.ty * L.w + o.tx]; };
      L.crests.forEach(function (cr) { if (!at(cr)) problems.push(name + ': crest ' + cr.power + ' at ' + cr.tx + ',' + cr.ty + ' cannot be reached'); });
      L.chests.forEach(function (ch) { if (!nextTo(L, reach, ch.tx, ch.ty)) problems.push(name + ': chest at ' + ch.tx + ',' + ch.ty + ' cannot be reached'); });
      L.checkpoints.forEach(function (cp) { if (!at(cp)) problems.push(name + ': checkpoint at ' + cp.tx + ',' + cp.ty + ' cannot be reached'); });
      L.blocks.forEach(function (bl) { if (!at(bl)) problems.push(name + ': portal block at ' + bl.tx + ',' + bl.ty + ' cannot be reached'); });
      L.npcs.forEach(function (np) { if (!at(np)) problems.push(name + ': ' + np.role + ' at ' + np.tx + ',' + np.ty + ' cannot be reached'); });
      if (L.boss && !at(L.boss)) problems.push(name + ': boss cannot be reached');
      // temples: the door opens when the crest task is done (no power needed), so the checker walks through doors.
      // It also proves that with the doors shut nobody gets in (the walls really close every temple).
      var shut = L.temples.length ? flood(L, have, true) : null;
      L.temples.forEach(function (t) {
        var tn = name + ': the ' + t.name;
        if (!t.door.some(function (d) { return W.isSolidScenery(L.tiles[d.ty * L.w + d.tx]) && nextTo(L, reach, d.tx, d.ty); })) problems.push(tn + ' door cannot be reached');
        if (!at(t.guard)) problems.push(tn + ' guardian cannot be reached');
        if (!at(t.altar)) problems.push(tn + ' altar cannot be reached');
        if (!t.arch.every(function (a) { return at(a); })) problems.push(tn + ' arch to the guardian is blocked');
        if (!L.crests.some(function (c) { return c.power === t.power && c.tx === t.altar.tx && c.ty === t.altar.ty; })) problems.push(tn + ' has no ' + t.power + ' crest on its altar');
        if (shut[t.guard.ty * L.w + t.guard.tx] || shut[t.altar.ty * L.w + t.altar.tx]) problems.push(tn + ' can be entered without its door');
        if (!W.isSolidScenery(L.tiles[t.altarBlock.ty * L.w + t.altarBlock.tx])) problems.push(tn + ' altar block is missing');
      });
      def.crests.forEach(function (pw) { if (!L.temples.some(function (t) { return t.power === pw; })) problems.push(name + ': no temple for the ' + pw + ' crest'); });
      if (L.gate && !nextTo(L, reach, L.gate.tx, L.gate.ty)) problems.push(name + ': portal cannot be reached');
      // tall buildings: every planet has some, and the roof of the climbable one (and its treasure) can be reached on foot
      if (!def.arena) {
        var climb = L.towers.filter(function (t) { return t.climb; });
        if (L.towers.length < 3 || !climb.length) problems.push(name + ': ' + L.towers.length + ' tall buildings, ' + climb.length + ' to climb (want 3+ and 1+)');
        climb.forEach(function (t) {
          if (!t.roof || !at(t.roof)) problems.push(name + ': the roof of a tall building cannot be reached');
          else if (L.hgt[t.roof.ty * L.w + t.roof.tx] < 5) problems.push(name + ': a climbable roof is not high');
          if (!t.chest || !nextTo(L, reach, t.chest.tx, t.chest.ty) || L.tiles[t.chest.ty * L.w + t.chest.tx] !== 'T') problems.push(name + ': the treasure on a roof cannot be reached');
        });
      }
      for (var p in have) owned[p] = 1;
      def.crests.forEach(function (pw) { owned[pw] = 1; });
    }
    // the Home Base: every planet portal, friendly person and flag must be reachable on foot (no powers needed)
    if (SC.BASE) {
      var B = W.parse('base');
      problems = problems.concat(B.problems);
      if (B.start) {
        problems = problems.concat(shapeProblems(B));
        var rb = flood(B, {}), bn = B.def.name;
        B.portals.forEach(function (po) { if (!nextTo(B, rb, po.tx, po.ty)) problems.push(bn + ': the ' + po.planet + ' portal cannot be reached'); });
        B.npcs.forEach(function (np) { if (!rb[np.ty * B.w + np.tx]) problems.push(bn + ': ' + np.role + ' at ' + np.tx + ',' + np.ty + ' cannot be reached'); });
        B.checkpoints.forEach(function (cp) { if (!rb[cp.ty * B.w + cp.tx]) problems.push(bn + ': flag at ' + cp.tx + ',' + cp.ty + ' cannot be reached'); });
      } else problems.push('Home Base: no start P');
    }
    return problems;
  };
  function shapeProblems(L) {
    var out = [], name = L.def.name;
    var tw = L.towerAt;
    for (var y = 0; y < L.h; y++) for (var x = 0; x < L.w; x++) {
      var i = y * L.w + x;
      // tall buildings may have tall walls (they are drawn as buildings, not as cliffs)
      if (x + 1 < L.w && Math.abs(L.hgt[i] - L.hgt[i + 1]) > 1 && !(tw && (tw[i] || tw[i + 1]))) out.push(name + ': cliff too tall at ' + x + ',' + y);
      if (y + 1 < L.h && Math.abs(L.hgt[i] - L.hgt[i + L.w]) > 1 && !(tw && (tw[i] || tw[i + L.w]))) out.push(name + ': cliff too tall at ' + x + ',' + y);
    }
    L.traps.forEach(function (t) {
      var ch = L.tiles[t.ty * L.w + t.tx];
      if (t.kind === 'darts' && ch !== 'd') out.push(name + ': dart shooter at ' + t.tx + ',' + t.ty + ' is missing');
      else if (t.kind === 'rod' && ch !== 'n') out.push(name + ': lightning rod at ' + t.tx + ',' + t.ty + ' is missing');
      else if (t.kind !== 'darts' && t.kind !== 'rod' && !FLOORS[ch]) out.push(name + ': ' + t.kind + ' trap at ' + t.tx + ',' + t.ty + ' is not on open ground (' + ch + ')');
    });
    if (out.length > 12) out = out.slice(0, 12);
    return out;
  }
  function passFor(ch, have, shut) {
    if (FLOORS[ch] || ch === 'l') return true;
    if (ch === 'b') return true;
    if (ch === 'Q') return !shut;
    if (ch === 't') return !!have.fire;
    if (ch === 'k') return !!have.earth;
    if (ch === 'w') return !!have.surface;
    return false;
  }
  function flood(L, have, shut) {
    var seen = new Uint8Array(L.w * L.h), q = [L.start.tx, L.start.ty];
    seen[L.start.ty * L.w + L.start.tx] = 1;
    while (q.length) {
      var y = q.pop(), x = q.pop();
      for (var i = 0; i < 4; i++) {
        var nx = x + NB4[i][0], ny = y + NB4[i][1];
        if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
        var id = ny * L.w + nx;
        if (seen[id]) continue;
        if (passFor(L.tiles[id], have, shut) && canStepIn(L, x, y, nx, ny)) { seen[id] = 1; q.push(nx, ny); }
      }
    }
    return seen;
  }
  // Can the team walk from the start of this place to tile (tx, ty) right now (with the powers it has)?
  // Used so a glider never lands somewhere it could not walk back from.
  var reachCache = { L: null, key: '', map: null };
  W.reachable = function (tx, ty) {
    var L = W.L;
    if (!L || !L.start || tx < 0 || ty < 0 || tx >= L.w || ty >= L.h) return false;
    var have = {}, key = L.ver + '|';
    ['fire', 'earth', 'surface'].forEach(function (p) { if (SC.hasPower && SC.hasPower(p)) { have[p] = 1; key += p; } });
    if (reachCache.L !== L || reachCache.key !== key) { reachCache.L = L; reachCache.key = key; reachCache.map = flood(L, have, true); }
    return !!reachCache.map[ty * L.w + tx];
  };
  function nextTo(L, reach, tx, ty) {
    for (var i = 0; i < 4; i++) {
      var nx = tx + NB4[i][0], ny = ty + NB4[i][1];
      if (nx >= 0 && ny >= 0 && nx < L.w && ny < L.h && reach[ny * L.w + nx] && canStepIn(L, nx, ny, tx, ty)) return true;
    }
    return false;
  }

  // a text picture of a level with its heights, for checking maps by eye in tests
  W.dump = function (index) {   // index may be 'base'
    var L = W.parse(index), out = [];
    for (var y = 0; y < L.h; y++) {
      var s = '';
      for (var x = 0; x < L.w; x++) s += L.def.map[y].charAt(x);
      s += '  ';
      for (x = 0; x < L.w; x++) s += L.hgt[y * L.w + x];
      out.push(s);
    }
    return out.join('\n');
  };
})();
