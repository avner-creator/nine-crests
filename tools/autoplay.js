// Nine Crests - automatic play-tester. Loaded only when the page is opened as index.html#test=NAME.
// It drives the game through window.__game (press/release/step + helper hooks), checks results,
// writes them to <pre id="testlog"> (read with --dump-dom) and a short summary box (visible in screenshots).
// It never uses fixed tile coordinates: everything is found from the level data, and walking uses path finding over W.blocked.
(function () {
  'use strict';
  var g = window.__game, SC = window.SC, G = SC.G, W = SC.world;
  var name = SC.testName;
  var logEl = document.getElementById('testlog'), sumEl = document.getElementById('testsum');
  var lines = [], pass = 0, fail = 0, DT = 1 / 60;
  SC.testNoSave = false;
  function log(s) { lines.push(s); logEl.textContent = lines.join('\n'); }
  function check(c, label) { if (c) { pass++; log('PASS ' + label); } else { fail++; log('FAIL ' + label); } return c; }
  function st() { return g.getState(); }
  function brief() {
    var s = st();
    return 'screen=' + s.screen + ' lvl=' + s.levelIndex + ' hero=' + s.hero + ' hp=' + s.hp + '/' + s.maxHp + ' pos=' + (s.player ? s.player.x + ',' + s.player.y : '-') +
      ' crests=' + s.crests.join('+') + ' gems=' + s.gems + ' blocks=' + s.blocks.carried + '/' + s.blocks.fitted + '/' + s.blocks.need +
      ' boss=' + (s.boss ? s.boss.name + ':' + s.boss.hp : '-') + ' gate=' + s.gateOpen + ' goal=' + s.goalText;
  }
  function finish() {
    g.releaseAll();
    check(g.errors.length === 0, 'no JS errors [' + g.errors.join(' | ') + ']');
    var v = g.validate();
    check(v.length === 0, 'map check empty [' + v.join('; ') + ']');
    log('STATE ' + brief());
    log('RESULT ' + name + ' pass=' + pass + ' fail=' + fail);
    sumEl.style.display = 'block';
    sumEl.textContent = 'TEST ' + name + ': ' + pass + ' pass, ' + fail + ' fail' + (fail ? '\n' + lines.filter(function (l) { return l.indexOf('FAIL') === 0; }).join('\n').slice(0, 600) : '');
    g.render();
    document.title = 'DONE ' + name;
  }
  function steps(sec) { g.step(sec); }
  function tap(code) { g.press(code); g.step(DT); g.release(code); g.step(DT); }
  function until(cond, maxSec, each) {
    var n = Math.round(maxSec / DT);
    for (var i = 0; i < n; i++) { if (cond()) return true; if (each) each(i); g.step(DT); }
    return cond();
  }
  function spawn(type, x, y, opts) { var e = SC.makeEnemy(type, x, y, opts); e.aggro = true; G.enemies.push(e); return e; }
  function clearEnemies() { G.enemies.forEach(function (e) { if (!e.isBoss) e.alive = false; }); G.enemies = G.enemies.filter(function (e) { return e.alive; }); }
  function face(angle) { G.player.face = angle; }
  function findTile(ch) { var L = G.L; for (var y = 0; y < L.h; y++) for (var x = 0; x < L.w; x++) if (L.tiles[y * L.w + x] === ch) return { x: x, y: y }; return null; }
  function free(x, y, r) { return !W.blocked(x, y, r || 0.3, 'player') && !W.blocked(x, y, r || 0.3, 'enemy'); }
  // a spot with an open square around it, reachable from the start
  function openArea(minR) {
    var L = G.L, best = null;
    for (var y = 2; y < L.h - 2 && !best; y++) for (var x = 2; x < L.w - 2; x++) {
      if (L.district && SC.dist(x, y, L.district.x, L.district.y) < 14) continue;   // not among the tall buildings
      var ok = true;
      for (var dy = -minR; dy <= minR && ok; dy++) for (var dx = -minR; dx <= minR && ok; dx++) { if (!free(x + dx + 0.5, y + dy + 0.5, 0.45)) ok = false; }
      if (ok) { best = { x: x, y: y }; break; }
    }
    return best;
  }
  function pickItem(role, id) { G.menuSel = SC.shopItems(role).map(function (i) { return i.id; }).indexOf(id); }
  function crestPick(power) { return G.pickups.filter(function (k) { return k.kind === 'crest' && (!power || k.power === power); })[0]; }
  function member(id) { return st().team.filter(function (m) { return m.id === id; })[0]; }

  // ---------------- path finding auto-player ----------------
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function cost(tx, ty, fx, fy, goalKey) {
    var t = W.tile(tx, ty);
    if (W.canStep && !W.canStep(fx, fy, tx, ty)) return 0;   // TEST PATCH (B)
    if (tx + ',' + ty === goalKey) return 1;
    if (t === 'b') return 3;
    if (t === 't') return SC.hasPower('fire') ? 4 : 0;
    if (t === 'k') return SC.hasPower('earth') ? 4 : 0;
    if (W.blocked(tx + 0.5, ty + 0.5, 0.3, 'player')) return 0;
    if (W.blocked((tx + fx) / 2 + 0.5, (ty + fy) / 2 + 0.5, 0.3, 'player')) return 0;   // the step between tiles (cliff edges)
    if (t === 'l') return 12;
    return 1;
  }
  function findPath(gx, gy, adjacentOk) {
    var L = G.L, p = G.player, sx = Math.floor(p.x), sy = Math.floor(p.y);
    var N = L.w * L.h, dist = new Float32Array(N).fill(1e9), prev = new Int32Array(N).fill(-1);
    var goalKey = gx + ',' + gy, open = [[0, sx, sy]];
    dist[sy * L.w + sx] = 0;
    var found = -1;
    while (open.length) {
      var bi = 0; for (var i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      var cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      var cx = cur[1], cy = cur[2], ci = cy * L.w + cx;
      if (cur[0] > dist[ci]) continue;
      if ((cx === gx && cy === gy) || (adjacentOk && Math.abs(cx - gx) + Math.abs(cy - gy) === 1)) { found = ci; break; }
      for (var d = 0; d < 4; d++) {
        var nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
        var c = cost(nx, ny, cx, cy, goalKey);
        if (!c) continue;
        var ni = ny * L.w + nx, nd = dist[ci] + c;
        if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = ci; open.push([nd, nx, ny]); }
      }
    }
    if (found < 0) return null;
    var path = [];
    for (var k = found; k >= 0; k = prev[k]) path.unshift([k % L.w, Math.floor(k / L.w)]);
    return path;
  }
  // some places only some heroes can reach (Mira on water): find a hero who has a path
  function heroWithPath(gx, gy, adj) {
    var keep = G.hero, out = null;
    for (var i = 0; i < SC.HEROES.length && !out; i++) {
      var m = SC.member(SC.HEROES[i].id);
      if (!m || m.out || SC.HEROES[i] === keep) continue;
      G.hero = SC.HEROES[i];
      if (findPath(gx, gy, adj)) out = SC.HEROES[i].id;
    }
    G.hero = keep;
    return out;
  }
  var KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  function releaseMove() { KEYS.forEach(function (k) { g.release(k); }); }
  function steerTo(x, y) {
    var p = G.player, dx = x - p.x, dy = y - p.y;
    (dx > 0.08 ? g.press : g.release)('KeyD'); (dx < -0.08 ? g.press : g.release)('KeyA');
    (dy > 0.08 ? g.press : g.release)('KeyS'); (dy < -0.08 ? g.press : g.release)('KeyW');
  }
  function usePowerOn(id, angle) {
    if (!SC.hasPower(id)) return false;
    g.selectPower(id);
    G.player.face = angle;
    G.player.energy = SC.maxEnergy();
    g.release('KeyF'); g.press('KeyF');
    return true;
  }
  // is a tile about to be hurt by a trap (glowing, firing, or a shot coming down its lane)?
  var DV4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  function shotNear(t, x, y) { return (G.L.trapShots || []).some(function (s) { return s.trap === t && SC.dist(s.x, s.y, x, y) < 2.6; }); }
  function trapDanger(tx, ty) {
    var L = G.L, x = tx + 0.5, y = ty + 0.5;
    if (!L || !L.traps) return false;
    for (var i = 0; i < L.traps.length; i++) {
      var t = L.traps[i], cx = t.tx + 0.5, cy = t.ty + 0.5;
      if (Math.abs(cx - x) > 11 || Math.abs(cy - y) > 11 || t.kind === 'plate') continue;
      var hot = (t.warnF || 0) > 0 || t.active;
      if (t.kind === 'darts' || t.kind === 'roller') {
        var d = DV4[t.dir], along = (x - cx) * d[0] + (y - cy) * d[1], side = Math.abs(-(x - cx) * d[1] + (y - cy) * d[0]);
        if (side < 0.95 && along > -0.6 && along < (t.len || 8) + 0.6 && (hot || shotNear(t, x, y))) return true;
      } else if (t.kind === 'rod') { if (hot && SC.dist(x, y, cx, cy) < (t.r || 1.7) + 0.5) return true; }
      else if (SC.dist(x, y, cx, cy) < 1.25 && (hot || shotNear(t, x, y))) return true;
    }
    return false;
  }
  var nav = { path: null, i: 0, replan: 0, lastX: 0, lastY: 0, stuck: 0 };
  function navTick(gx, gy, adjacentOk) {
    var p = G.player;
    g.release('Space'); g.release('KeyF');
    nav.replan -= DT;
    if (!nav.path || nav.replan <= 0 || nav.goal !== gx + ',' + gy) {
      nav.path = findPath(gx, gy, adjacentOk); nav.i = 1; nav.replan = 0.6; nav.goal = gx + ',' + gy;
      if (!nav.path) {
        var who = heroWithPath(gx, gy, adjacentOk);
        if (who) { g.swapHero(who); nav.path = findPath(gx, gy, adjacentOk); nav.i = 1; }
        if (!nav.path) { releaseMove(); return 'nopath'; }
      }
    }
    var near = null, nd = 1.7;
    for (var i = 0; i < G.enemies.length; i++) { var e = G.enemies[i]; if (!e.alive || e.hidden || e.h > 0.8) continue; var d = SC.dist(p.x, p.y, e.x, e.y) - e.r; if (d < nd) { nd = d; near = e; } }
    if (near && Math.random() < 0.5) { face(Math.atan2(near.y - p.y, near.x - p.x)); g.press('Space'); }
    while (nav.i < nav.path.length && SC.dist(p.x, p.y, nav.path[nav.i][0] + 0.5, nav.path[nav.i][1] + 0.5) < 0.3) nav.i++;
    if (nav.i >= nav.path.length) { releaseMove(); return 'arrived'; }
    var nt = nav.path[nav.i], t = W.tile(nt[0], nt[1]);
    var ang = Math.atan2(nt[1] + 0.5 - p.y, nt[0] + 0.5 - p.x);
    var isGoal = nt[0] === gx && nt[1] === gy;
    if (!isGoal && (t === 'b' || t === 't' || t === 'k') && SC.dist(p.x, p.y, nt[0] + 0.5, nt[1] + 0.5) < 1.35) {
      releaseMove();
      if (t === 'b') { face(ang); if (G.player.swingT <= 0) g.press('Space'); }
      else if (t === 't') usePowerOn('fire', ang);
      else usePowerOn('earth', ang);
      return 'clearing';
    }
    // traps: wait on a safe tile while the next one glows or hurts
    if (!G.god && trapDanger(nt[0], nt[1]) && !trapDanger(Math.floor(p.x), Math.floor(p.y))) { releaseMove(); nav.lastX = p.x; nav.lastY = p.y; return 'waiting'; }
    steerTo(nt[0] + 0.5, nt[1] + 0.5);
    if (SC.dist(p.x, p.y, nav.lastX, nav.lastY) < 0.002) { nav.stuck += DT; if (nav.stuck > 1.2) { nav.stuck = 0; nav.replan = 0; g.press('ShiftLeft'); } }
    else nav.stuck = 0;
    g.release('ShiftLeft');
    nav.lastX = p.x; nav.lastY = p.y;
    return 'walking';
  }
  function nearestEnemy(filter) {
    var p = G.player, best = null, bd = 1e9;
    var list = G.enemies.filter(function (e) { return e.alive && !e.isBoss && !(e.botSkip > G.simT) && (!filter || filter(e)); });
    list.sort(function (a, b) { return SC.dist(p.x, p.y, a.x, a.y) - SC.dist(p.x, p.y, b.x, b.y); });
    for (var i = 0; i < list.length && i < 6; i++) { if (findPath(Math.floor(list[i].x), Math.floor(list[i].y), true)) return list[i]; list[i].botSkip = G.simT + 10; }
    return list[0] || null;
  }
  function needHero(id) { if (G.hero.id !== id && SC.member(id) && !SC.member(id).out) { G.player.swapCd = 0; SC.swapHero(id, { quiet: true }) || g.swapHero(id); } }
  // what to do next in this level
  function nextTarget() {
    var p = G.player, L = G.L;
    var crests = G.pickups.filter(function (k) { return k.kind === 'crest'; });
    var open = crests.filter(function (k) { return !k.sealed; });
    if (open.length) { var c = open[0]; return { kind: 'pickup', x: Math.floor(c.x), y: Math.floor(c.y), ref: c }; }
    // an open temple: go in and beat its guardian
    for (var ti = 0; ti < crests.length; ti++) {
      var tk = crests[ti].temple;
      if (tk && tk.open && tk.ent && tk.ent.alive) return { kind: 'boss', ref: tk.ent };
    }
    crests = crests.filter(function (k) { return !k.trialDone; });
    for (var i = 0; i < crests.length; i++) {
      var tr = crests[i].trial;
      if (tr.type === 'beatAs') needHero(tr.hero);
      if (tr.type === 'beatAs' || tr.type === 'beat') { var e = nearestEnemy(); if (e) return { kind: 'enemy', ref: e }; }
      if (tr.type === 'gems') {
        var gm = G.pickups.filter(function (k) { return k.kind === 'gem' && !(k.botSkip > G.simT); }).filter(function (k, i) { if (i > 4) return false; if (findPath(Math.floor(k.x), Math.floor(k.y), false)) return true; k.botSkip = G.simT + 15; return false; })[0];
        if (gm) return { kind: 'pickup', x: Math.floor(gm.x), y: Math.floor(gm.y), ref: gm };
        var e2 = nearestEnemy(); if (e2) return { kind: 'enemy', ref: e2 };
        var ch0 = L.chests.filter(function (c) { return W.tile(c.tx, c.ty) === 'T' && !c.skip; })[0];
        if (ch0) return { kind: 'chest', x: ch0.tx, y: ch0.ty, adj: true, ref: ch0 };
      }
      if (tr.type === 'chest') { var ch = L.chests.filter(function (c) { return W.tile(c.tx, c.ty) === 'T' && !c.skip; })[0]; if (ch) return { kind: 'chest', x: ch.tx, y: ch.ty, adj: true, ref: ch }; }
      if (tr.type === 'flag') { var fl = G.flags.filter(function (f) { return !f.active; })[0] || G.flags[0]; if (fl) return { kind: 'pickup', x: Math.floor(fl.x), y: Math.floor(fl.y), ref: fl }; }
    }
    var other = G.pickups.filter(function (k) { return k.kind === 'block' || k.kind === 'sword' || k.kind === 'heartUp'; });
    if (other.length) {
      var bk = other.sort(function (a, b) { return SC.dist(p.x, p.y, a.x, a.y) - SC.dist(p.x, p.y, b.x, b.y); })[0];
      return { kind: 'pickup', x: Math.floor(bk.x), y: Math.floor(bk.y), ref: bk };
    }
    var chs = L.chests.filter(function (c) { return W.tile(c.tx, c.ty) === 'T' && !c.skip; })[0];
    if (chs) return { kind: 'chest', x: chs.tx, y: chs.ty, adj: true, ref: chs };
    var b = G.bossEnt;
    if (b && b.alive) return { kind: 'boss', ref: b };
    if (L.gate) return { kind: 'gate', x: L.gate.tx, y: L.gate.ty, adj: !L.gateOpen };
    return null;
  }
  function fight(e, info) {
    var p = G.player, d = SC.dist(p.x, p.y, e.x, e.y) - e.r;
    e.botT = (e.botT || 0) + DT;
    if (e.botT > 15 && !e.isBoss) { e.botSkip = G.simT + 20; e.botT = 0; }
    // shield baddies: walk around to their back first
    if (e.def.shield && d < 2.2 && e.frozenT <= 0 && e.stunT <= 0 && Math.abs(SC.angDiff(e.face, Math.atan2(p.y - e.y, p.x - e.x))) < 1.6) {
      var bx = e.x - Math.cos(e.face) * 1.0, by = e.y - Math.sin(e.face) * 1.0, side = e.face + Math.PI / 2;
      if (SC.dist(p.x, p.y, bx, by) > 0.4) { var sx2 = e.x + Math.cos(side) * 1.2, sy2 = e.y + Math.sin(side) * 1.2; steerTo(Math.abs(SC.angDiff(e.face, Math.atan2(p.y - e.y, p.x - e.x))) < 0.8 ? sx2 : bx, Math.abs(SC.angDiff(e.face, Math.atan2(p.y - e.y, p.x - e.x))) < 0.8 ? sy2 : by); g.release('Space'); return; }
    }
    if (d < 1.0 && e.h < 0.8) {
      releaseMove(); g.release('Space'); g.release('KeyF');
      var a = Math.atan2(e.y - p.y, e.x - p.x);
      face(a);
      if (p.swingT <= 0) g.press('Space');
      info.fightT = (info.fightT || 0) + DT;
      if (info.fightT > 1.2) {
        info.fightT = 0;
        var weak = (e.def.weak || []).filter(function (w) { return SC.canUse(w); })[0] || SC.currentPowerId();
        if (weak && SC.canUse(weak)) usePowerOn(weak, a);
        if (SC.superReady()) g.useSuper();
      }
    } else {
      g.release('KeyF');
      var r = navTick(Math.floor(e.x), Math.floor(e.y), true);
      if (r === 'arrived' || r === 'nopath') steerTo(e.x, e.y);
      if (r === 'nopath') info.nopath++;
    }
  }
  function playLevel(maxSec, each) {
    var n = Math.round(maxSec / DT), tgt = null, retarget = 0, info = { boss: 0, nopath: 0 };
    for (var i = 0; i < n; i++) {
      if (G.screen === 'levelDone' || G.screen === 'win') { releaseMove(); return { ok: true, sec: i * DT, info: info }; }
      if (G.screen === 'oops') { tap('Enter'); continue; }
      retarget -= DT;
      if (!tgt || retarget <= 0 || (tgt.ref && tgt.ref.alive === false)) { tgt = nextTarget(); retarget = 0.5; }
      if (!tgt) { g.step(DT); continue; }
      if (tgt.kind === 'boss') { info.boss += DT; fight(tgt.ref, info); }
      else if (tgt.kind === 'enemy') fight(tgt.ref, info);
      else {
        var res = navTick(tgt.x, tgt.y, tgt.adj);
        if (res === 'nopath') { info.nopath++; if (tgt.kind === 'chest') tgt.ref.skip = true; retarget = 0; }
        if (res === 'arrived') {
          if (tgt.kind === 'chest') steerTo(tgt.x + 0.5, tgt.y + 0.5);
          else if (tgt.kind === 'pickup') steerTo(tgt.ref.x, tgt.ref.y);
          else if (tgt.kind === 'gate') { if (G.L.gateOpen) steerTo(tgt.x + 0.5, tgt.y + 0.5); else releaseMove(); }
        }
      }
      if (each) each(i);
      g.step(DT);
    }
    releaseMove();
    return { ok: false, sec: maxSec, info: info };
  }

  // ---------------- power test helpers ----------------
  function powerSetup(id, lvl) {
    g.start('nate', 0); g.god(true); clearEnemies();
    if (G.bossEnt) { G.bossEnt.alive = false; G.enemies = []; }
    g.setPowerLevel(id, lvl || 1);
    var a = openArea(3);
    g.teleport(a.x, a.y); steps(0.2);
    g.selectPower(id);
    G.player.face = 0;
    return a;
  }
  function castF() { G.player.energy = SC.maxEnergy(); G.player.powerCd = {}; tap('KeyF'); }
  function projCount(kind) { return G.projs.filter(function (o) { return !kind || o.kind === kind || (kind === 'tornado' && o.tornado); }).length; }
  // damage a power level does to a fresh grumpling in front (no weak/resist): spawn, cast, measure
  function dmgOf(id, lvl, type) {
    var a = powerSetup(id, lvl);
    var e = spawn(type || 'brute', a.x + 2.2, a.y + 0.5); e.hp = e.maxHp = 500; e.atkCd = 99; e.state = 'recover'; e.st = 99;
    castF(); steps(1.3);
    return 500 - e.hp;
  }

  var S = {
    // ---------- menus and modes ----------
    title: function () { check(st().screen === 'title', 'title screen shows'); },
    mode: function () {
      tap('Enter'); check(st().screen === 'mode', 'New Game asks Adventure or Free Play');
      tap('ArrowRight'); check(G.modeSel === 1, 'arrow picks Free Play');
    },
    select: function () {
      tap('Enter'); tap('Enter'); check(st().screen === 'select', 'after the mode comes the hero choice');
      tap('ArrowRight'); tap('ArrowRight');
      check(G.selHero === 2, 'arrows move the choice to Mira');
    },
    modestart: function () {
      tap('Enter'); tap('Enter'); tap('ArrowRight'); tap('ArrowRight'); tap('ArrowRight'); tap('Space');
      var s = st();
      check(s.screen === 'play' && s.hero === 'koda' && s.mode === 'adventure', 'Adventure starts as Koda');
      check(s.crests.length === 0, 'nobody starts with a power');
      check(s.team.length === 9 && s.team.every(function (m) { return m.hp === m.maxHp; }), 'all nine heroes are on the team with full hearts');
      check(s.npcs === 2, 'a trader and a smith are in the level (' + s.npcs + ')');
      steps(1);
    },
    freestart: function () {
      tap('Enter'); tap('ArrowRight'); tap('Enter'); tap('Space');
      var s = st();
      check(s.screen === 'play' && s.mode === 'free', 'Free Play starts');
      check(SC.POWERS.every(function (pw) { return s.powers[pw.id].owned && s.powers[pw.id].level === 3; }), 'Free Play: every power owned at level 3');
      check(s.place === 'base' && SC.PLANET_ORDER.every(function (pl) { return s.portals[pl].open; }), 'Free Play starts at the Home Base with all ten portals open');
      check(G.pickups.filter(function (k) { return k.kind === 'crest' || k.kind === 'block'; }).length === 0, 'Free Play: no crests or blocks to collect');
      G.player.inv = 0; SC.hurtPlayer(5, G.player.x + 1, G.player.y);
      check(st().hp === st().maxHp, 'Free Play: cannot be hurt');
      g.swapHero('koda'); G.player.flyCd = 0; tap('KeyG');
      check(G.player.flying, 'Free Play: Koda can fly with G');
      steps(15);
      check(G.player.flying && G.player.flyH > 1.4, 'Free Play: flying has no time limit (15 s later still up)');
      tap('KeyG'); steps(1);
      check(!G.player.flying && G.player.flyH === 0, 'G again lands');
      g.render();
    },
    // ---------- team ----------
    swap: function () {
      g.start('nate', 0); g.god(true); steps(0.5);
      G.player.hp = 2; SC.storeActive();
      tap('Tab'); check(st().hero === 'zen', 'Tab switches to the next hero (Zen)');
      check(st().hp === st().maxHp, 'Zen has his own full hearts');
      tap('Tab'); check(st().hero === 'zen', 'switching has a short cooldown');
      steps(0.7); tap('KeyT'); check(st().hero === 'mira', 'T also switches (to Mira)');
      var keys = { 5: 'pip', 6: 'rokko', 7: 'wren', 8: 'fern', 9: 'vex', 4: 'koda' }, okAll = true;
      Object.keys(keys).forEach(function (d) { steps(0.7); tap('Digit' + d); if (st().hero !== keys[d]) okAll = false; });
      check(okAll, 'number keys 1-9 pick each hero directly (5 Pip ... 9 Vex)');
      steps(0.7); tap('Digit1');
      check(st().hero === 'nate' && st().hp === 2, 'back to Nate with 1, his hurt hearts were kept');
      var x0 = G.player.x; steps(0.7);
      SC.swapHero('koda');
      check(st().hero === 'koda' && Math.abs(G.player.x - x0) < 0.01, 'clicking a portrait (swapHero) switches in the same spot');
      check(st().maxHp === 8, 'Koda keeps his own stats (8 hearts)');
      var ids = SC.HEROES.map(function (h) { return h.id; }).join(',');
      check(ids === 'nate,zen,mira,koda,pip,rokko,wren,fern,vex', 'nine heroes (' + ids + ')');
      check(SC.HEROES.every(function (h) { return h.powers.length === 1 && SC.powerOwner(h.powers[0]) === h.id; }), 'each hero has exactly one power of their own');
      var sp = SC.HEROES.map(function (h) { return h.speed + '/' + h.hearts + '/' + h.dmg; });
      check(sp.filter(function (v, i) { return sp.indexOf(v) === i; }).length === 9, 'all nine have different stats');
    },    rest: function () {
      g.start('nate', 0); steps(0.3); clearEnemies();
      var order = [];
      var NH = SC.HEROES.length;
      for (var k = 0; k < NH; k++) {
        G.player.inv = 0; G.player.dashT = 0;
        var who = st().hero;
        SC.hurtPlayer(99, G.player.x + 1, G.player.y);
        order.push(who);
        steps(0.1);
        if (k < NH - 1) {
          check(st().screen === 'play' && st().hero !== who && member(who).out, who + ' rests and ' + st().hero + ' jumps in by itself');
        }
      }
      steps(2);
      check(st().screen === 'oops', 'Oops only when all nine rest (' + order.join(',') + ')');
      tap('Enter'); steps(0.2);
      check(st().screen === 'play' && st().team.every(function (m) { return !m.out && m.hp === m.maxHp; }), 'Try again wakes everyone with full hearts');
    },
    lives: function () {
      g.start('nate', 0); steps(0.3); clearEnemies();
      check(st().lives === 0, 'start with no extra lives');
      // a chest with an extra life inside (pretend the first chest holds one)
      var c = G.L.chests[0]; c.content = 'life';
      SC.openChest(c.tx, c.ty); steps(0.2);
      var lp = G.pickups.filter(function (k) { return k.kind === 'life'; })[0];
      check(!!lp, 'a life chest pops out an extra life pickup');
      g.teleport(Math.floor(lp.x), Math.floor(lp.y)); steps(1.5);
      until(function () { return st().lives === 1; }, 2, function () { steerTo(lp.x, lp.y); }); releaseMove();
      check(st().lives === 1, 'picking it up gives 1 extra life');
      g.giveLife(); check(st().lives === 2, 'giveLife hook adds one');
      steps(1);
      var x0 = G.player.x, y0 = G.player.y;
      for (var k = 0; k < SC.HEROES.length; k++) { G.player.inv = 0; G.player.dashT = 0; SC.hurtPlayer(99, G.player.x + 1, G.player.y); steps(0.05); }
      steps(2);
      var s = st();
      check(s.screen === 'play' && s.lives === 1 && s.team.every(function (m) { return !m.out && m.hp === m.maxHp; }), 'when everyone is knocked out a life is used: all wake with full hearts');
      check(SC.dist(G.player.x, G.player.y, x0, y0) < 2.5 && G.player.inv > 0, 'right where they were, with a few safe seconds');
      check(G.stats.deaths === 0, 'no Oops screen');
      G.prog.lives = 0;
      G.prog.gems = 500; g.openTrade('trader');
      var it = SC.shopItems('trader').filter(function (i) { return i.id === 'life'; })[0];
      pickItem('trader', 'life'); tap('Enter');
      check(st().lives === 1 && st().gems === 500 - it.price && it.price >= 50, 'the trader sells an extra life for a high price (' + it.price + ')');
      tap('Escape');
      SC.save(); var sv = SC.store.get('save4');
      check(sv && sv.lives === 1, 'lives are saved');
      G.prog.lives = 0; steps(0.6);
      for (var j = 0; j < SC.HEROES.length; j++) { G.player.inv = 0; G.player.dashT = 0; SC.hurtPlayer(99, G.player.x + 1, G.player.y); steps(0.05); }
      steps(2);
      check(st().screen === 'oops', 'with no lives left, Oops as before');
      g.clearSave();
    },
    flagwake: function () {
      g.start('mira', 0); steps(0.3); clearEnemies();
      G.player.inv = 0; SC.hurtPlayer(99, G.player.x + 1, G.player.y); steps(0.1);
      check(member('mira').out && st().hero !== 'mira', 'Mira is resting');
      var f = G.flags[0];
      g.teleport(Math.floor(f.x), Math.floor(f.y)); steps(0.4);
      check(f.active && !member('mira').out && member('mira').hp === member('mira').maxHp, 'a checkpoint flag wakes Mira and fills her hearts');
      var hk = G.pickups.filter(function (k) { return k.kind === 'heart'; })[0];
      G.player.hp = 1;
      if (hk) { g.teleport(Math.floor(hk.x), Math.floor(hk.y)); steps(0.5); check(G.player.hp === 2, 'a heart pickup heals the active hero'); }
    },
    // ---------- crests and trials ----------
    crest: function () {
      g.start('zen', 0); g.god(true);
      var k = crestPick(), pw = k.power, owner = SC.powerOwner(pw);
      check(k.sealed && k.trial && k.trial.type === 'beatAs' && k.trial.hero === owner && k.trial.n === 3, 'level 1 crest ' + pw + ' is sealed with "beat 3 baddies as ' + owner + '"');
      g.teleport(Math.floor(k.x), Math.floor(k.y)); steps(0.6);
      check(!SC.hasPower(pw) && crestPick(pw), 'a sealed crest cannot be picked up');
      clearEnemies();
      var a = openArea(2); g.teleport(a.x, a.y); steps(0.1);
      var other = 'rokko';   // owns no crest on this level, so his wins unseal nothing
      g.swapHero(other);
      for (var i = 0; i < 3; i++) SC.killEnemy(spawn('grump', a.x + 1, a.y));
      steps(0.2);
      check(crestPick(pw).sealed, 'beating baddies as ' + other + ' does not count');
      check(st().goalText.indexOf('baddies as ') >= 0, 'the goal line shows a crest task (' + st().goalText + ')');
      var tp = SC.templeOf(pw);
      check(tp && !tp.open, 'the ' + (tp && tp.name) + ' is shut before the task');
      g.swapHero(owner);
      for (var j = 0; j < 3; j++) SC.killEnemy(spawn('grump', a.x + 1, a.y));
      steps(0.2);
      check(tp.open && crestPick(pw).sealed, 'beating 3 as ' + owner + ' opens the ' + tp.name + ' (the crest is still sealed)');
      check(G.banner && G.banner.title === 'The ' + tp.name + ' is open!', 'banner: ' + (G.banner && G.banner.title));
      g.beatGuardian(pw); steps(0.2);
      check(!crestPick(pw).sealed, 'beating the guardian unseals the crest');
      g.swapHero('mira');
      g.teleport(Math.floor(k.x), Math.floor(k.y)); steps(0.8);
      check(SC.hasPower(pw) && st().powers[pw].level === 1, 'Mira picked it up and ' + owner + ' owns ' + pw);
      check(!SC.canUse(pw), 'Mira cannot use ' + pw);
      var e0 = G.player.energy; tap('KeyF');
      check(G.projs.length === 0 && G.effects.filter(function (x) { return x.kind === 'bolt'; }).length === 0, 'F as Mira does nothing');
      g.swapHero(owner); castF(); steps(0.05);
      check(G.projs.length > 0 || G.effects.length > 0, owner + ' can cast ' + pw);
    },
    trials: function () {
      // gems (surface), chest (earth), flag (life), beat (death), beatAs (wind) - found on whatever level has those crests
      var types = {};
      for (var li = 0; li < SC.LEVELS.length; li++) {
        g.start('nate', li); g.god(true);
        G.pickups.filter(function (k) { return k.kind === 'crest'; }).forEach(function (k) {
          var tr = k.trial;
          if (types[tr.type]) return;
          var before = k.sealed;
          if (tr.type === 'gems') { for (var i = 0; i < tr.n; i++) { G.lv.gems++; } }
          else if (tr.type === 'chest') { var c = G.L.chests[0]; g.teleport(c.tx, c.ty + 1); var ok = until(function () { return W.tile(c.tx, c.ty) === 'O'; }, 2, function () { steerTo(c.tx + 0.5, c.ty + 0.4); }); releaseMove(); if (!ok) SC.openChest(c.tx, c.ty); }
          else if (tr.type === 'flag') { var f = G.flags[0]; g.teleport(Math.floor(f.x), Math.floor(f.y)); }
          else if (tr.type === 'beat') { for (var j = 0; j < tr.n; j++) SC.killEnemy(spawn('grump', G.player.x + 3, G.player.y)); }
          else if (tr.type === 'beatAs') { g.swapHero(tr.hero); for (var m = 0; m < tr.n; m++) SC.killEnemy(spawn('grump', G.player.x + 3, G.player.y)); }
          steps(0.4);
          var opened = !!(k.trialDone && k.temple && k.temple.open);
          types[tr.type] = before && opened;
          check(before && opened, 'trial "' + SC.trialText(tr) + '" for ' + k.power + ' on level ' + (li + 1) + ' opens its temple');
        });
      }
      ['gems', 'beat', 'flag', 'beatAs'].forEach(function (ty) {
        if (types[ty]) return;
        g.start('nate', 0); g.god(true);
        var kk = crestPick(); kk.trial = ty === 'beatAs' ? { type: 'beatAs', hero: 'nate', n: 3 } : { type: ty, n: ty === 'gems' ? 15 : ty === 'beat' ? 5 : 1 };
        if (ty === 'gems') G.lv.gems += 15;
        else if (ty === 'flag') { var f2 = G.flags[0]; g.teleport(Math.floor(f2.x), Math.floor(f2.y)); }
        else for (var q = 0; q < kk.trial.n; q++) SC.killEnemy(spawn('grump', G.player.x + 3, G.player.y));
        steps(0.4);
        types[ty] = !!kk.trialDone;
        check(kk.trialDone && kk.temple.open, 'trial "' + SC.trialText(kk.trial) + '" opens a temple');
      });      if (!types.chest) {   // these maps hide every chest behind a power, so the chest task falls back; test it on a reachable chest
        g.start('nate', 0); g.god(true);
        var k2 = crestPick(); k2.trial = { type: 'chest', n: 1 };
        var c2 = G.L.chests[0]; SC.openChest(c2.tx, c2.ty); steps(0.3);
        types.chest = !!k2.trialDone;
        check(k2.trialDone && k2.temple.open, 'trial "Open a treasure chest" opens a temple');
      }
      ['beatAs', 'gems', 'chest', 'flag', 'beat'].forEach(function (t) { check(types[t] === true, 'trial type ' + t + ' tested'); });
      var ns = ['fire', 'water', 'lightning', 'ice', 'surface', 'earth', 'wind', 'life', 'death'].map(function (pw) { var t = SC.TRIALS[pw]; return (t.alt ? t.alt : t).n; });
      check(ns.every(function (n, i) { return i === 0 || n >= ns[i - 1]; }), 'crest tasks grow gently planet by planet (' + ns.join(' ') + ')');
    },
    trialspawn: function () {
      g.start('nate', 0); g.god(true);
      var k = crestPick();
      var hero = k.trial.hero === 'koda' ? 'zen' : 'koda';
      g.swapHero(hero); g.killAll(); steps(0.1);
      check(st().enemiesAlive === 0, 'all baddies beaten by the wrong hero');
      steps(3);
      check(st().enemiesAlive >= 3, 'more baddies show up so the task can still be done (' + st().enemiesAlive + ')');
    },
    // ---------- evolving and power strength ----------
    evolve: function () {
      SC.POWERS.forEach(function (pw) {
        var a = powerSetup(pw.id, 1);
        var e = spawn('grump', a.x + 2, a.y + 0.5); e.hp = 0.3; e.atkCd = 99;
        if (pw.id === 'life') { e.x = a.x + 1.4; }
        castF(); steps(pw.id === 'surface' ? 0.6 : 1.4);
        if (pw.id === 'surface' && e.alive) { e.hp = 0.1; face(Math.atan2(e.y - G.player.y, e.x - G.player.x)); G.player.swordCd = 0; g.teleport(Math.floor(e.x) - 1, Math.floor(e.y)); steps(0.05); face(0); tap('Space'); steps(0.3); }
        var xp = st().powers[pw.id].xp;
        check(!e.alive && xp >= 1, pw.name + ': beating a baddie with it gives progress (xp ' + xp + ')');
        SC.addPowerXp(pw.id, SC.EVOLVE_AT[1] - xp);
        check(st().powers[pw.id].level === 2, pw.name + ' evolves to level 2 at ' + SC.EVOLVE_AT[1]);
        SC.addPowerXp(pw.id, SC.EVOLVE_AT[2] - SC.EVOLVE_AT[1]);
        check(st().powers[pw.id].level === 3, pw.name + ' evolves to level 3 at ' + SC.EVOLVE_AT[2]);
      });
      check(G.banner && G.banner.title.indexOf('evolved') > 0, 'an "evolved!" banner shows (' + (G.banner && G.banner.title) + ')');
    },
    levels: function () {
      // each level looks/behaves different: more projectiles, bigger scale, lvl set
      var rows = { fire: 'fireball', surface: 'bubble', ice: 'shard', death: 'skull', wind: 'tornado', water: 'wave' };
      Object.keys(rows).forEach(function (id) {
        var counts = [], scales = [];
        for (var l = 1; l <= 3; l++) { powerSetup(id, l); castF(); counts.push(projCount(rows[id])); var o = G.projs.filter(function (q) { return q.lvl === l; })[0]; scales.push(o ? o.scale : 0); }
        check(scales[0] < scales[1] && scales[1] < scales[2], id + ': projectiles get bigger (scale ' + scales.join(' / ') + ') and carry lvl');
        if (id !== 'wind') check(counts[2] > counts[0], id + ': level 3 makes more projectiles (' + counts.join(' / ') + ')');
      });
      var ch = [];
      for (var l = 1; l <= 3; l++) {
        var a = powerSetup('lightning', l);
        for (var i = 0; i < 10; i++) { var e = spawn('slinger', a.x + 2 + (i % 4) * 0.9, a.y - 1.5 + Math.floor(i / 4) * 1.4); e.atkCd = 99; e.hp = e.maxHp = 100; }
        castF(); ch.push(G.enemies.filter(function (en) { return en.hp < 100; }).length);
      }
      check(ch[0] < ch[1] && ch[1] < ch[2], 'lightning jumps to more baddies each level (' + ch.join(' / ') + ')');
      var sp = [];
      for (var k = 1; k <= 3; k++) { powerSetup('earth', k); castF(); steps(1.2); sp.push(G.effects.filter(function (x) { return x.kind === 'spike'; }).length + (G.stats.spk || 0)); }
      var ef = [];
      for (var m = 1; m <= 3; m++) { powerSetup('earth', m); castF(); steps(0.7); ef.push(G.effects.filter(function (x) { return x.kind === 'spike'; }).length); }
      check(ef[2] > ef[0], 'earth: more spikes each level (' + ef.join(' / ') + ')');
      var hl = [];
      for (var n = 1; n <= 3; n++) { powerSetup('life', n); G.player.hp = 1; G.team.forEach(function (tm) { tm.hp = 1; }); castF(); hl.push(G.player.hp + '/' + SC.member('zen').hp); }
      check(hl[0] !== hl[1] && hl[1] !== hl[2], 'life heals more and heals the team (' + hl.join(' , ') + ')');
    },
    stronger: function () {
      var v1 = { fire: 3, water: 2.5, ice: 1.5 * 3, earth: 3, lightning: 3, death: 6, wind: 1, life: 1, surface: 2 };   // measured on a Brute (it resists wind: v1 did 2 x 0.5)
      Object.keys(v1).forEach(function (id) {
        var d1 = dmgOf(id, 1), d3 = dmgOf(id, 3);
        if (id === 'ice') { d1 = dmgOf(id, 1); }
        check(d1 >= v1[id] * 1.25 - 0.01, id + ' level 1 hits about 30% harder than v1 (' + d1.toFixed(1) + ' vs ' + v1[id] + ')');
        check(d3 > d1, id + ' level 3 hits harder than level 1 (' + d3.toFixed(1) + ')');
      });
    },
    // ---------- wind ----------
    tornado: function () {
      var a = powerSetup('wind', 1);
      var e = spawn('grump', a.x + 3, a.y + 1), x0 = e.x, y0 = e.y;
      castF();
      check(G.projs.some(function (o) { return o.tornado; }), 'Wind makes a tornado (drawn as ' + G.projs[0].kind + ' here)');
      check(until(function () { return e.spinT > 0; }, 1.5), 'tornado pulls in and spins the baddie');
      until(function () { return e.spinT <= 0; }, 1.5); steps(0.4);
      check(SC.dist(x0, y0, e.x, e.y) > 0.8 && (e.hp < e.maxHp || !e.alive), 'tornado throws the baddie and hurts it');
      var s = spawn('slinger', a.x + 4, a.y + 0.5); s.atkCd = 99;
      var pr = SC.enemyShoot(s, 'pebble', Math.PI, 6);
      castF(); check(until(function () { return pr.harmless; }, 1), 'tornado knocks a pebble away');
      var b3 = powerSetup('wind', 3), br = spawn('brute', b3.x + 3, b3.y + 0.5); br.state = 'recover'; br.st = 99;
      castF(); check(until(function () { return br.spinT > 0; }, 2), 'level 3 tornado even grabs a big Brute');
      var b1 = powerSetup('wind', 1), br1 = spawn('brute', b1.x + 3, b1.y + 0.5); br1.state = 'recover'; br1.st = 99;
      castF(); steps(1.5); check(!(br1.spinT > 0) && !br1.spinBy, 'level 1 tornado cannot lift a Brute');
    },
    windride: function () {
      g.start('nate', 0); clearEnemies();
      var a = openArea(2); g.teleport(a.x, a.y); steps(0.2);
      G.player.flyCd = 0; tap('KeyG'); check(!G.player.flying, 'Nate cannot fly');
      g.swapHero('wren'); tap('KeyG'); check(!G.player.flying, 'Wren without Wind cannot fly');
      g.giveCrest('wind'); G.player.flyCd = 0; G.player.energy = SC.maxEnergy(); tap('KeyG');
      check(G.player.flying, 'Wren with Wind flies with G (Wind Ride)');
      steps(1.2); check(Math.abs(G.player.flyH - 1.6) < 0.05, 'hover height eases to 1.6 (' + G.player.flyH + ')');
      var e = spawn('grump', G.player.x + 0.6, G.player.y); e.state = 'windup'; e.st = 0.01; G.player.inv = 0;
      var hp0 = G.player.hp; steps(0.1);
      check(G.player.hp === hp0, 'ground melee cannot hit a flying hero');
      e.alive = false;
      G.player.swordCd = 0; tap('Space'); check(G.player.swingT <= 0, 'no sword while flying');
      G.player.inv = 0; var s = spawn('slinger', G.player.x + 3, G.player.y); var pr = SC.enemyShoot(s, 'pebble', Math.PI, 7); s.alive = false;
      steps(0.6); check(G.player.hp < hp0, 'shots can still hit a flyer');
      g.setPowerLevel('wind', 1); G.player.flyT = 0.5; steps(2.5);
      check(!G.player.flying && G.player.flyH === 0, 'Wind Ride ends by itself');
      var tL = [];
      for (var l = 1; l <= 3; l++) { g.setPowerLevel('wind', l); G.player.flyCd = 0; G.player.energy = SC.maxEnergy(); tap('KeyG'); tL.push(G.player.flyT); tap('KeyG'); steps(2); }
      check(tL[0] < tL[1] && tL[1] < tL[2], 'flying lasts longer when Wind evolves (' + tL.map(Math.round).join(' / ') + ' s)');
      // safe landing: end the flight over a place nobody can stand (a wall/water tile next to safe ground)
      var L = G.L, spot = null;
      for (var y = 1; y < L.h - 1 && !spot; y++) for (var x = 1; x < L.w - 1; x++) {
        if (W.blocked(x + 0.5, y + 0.5, 0.3, 'player') && !W.blocked(x + 1.5, y + 0.5, 0.3, 'player') && W.tile(x, y) !== 'G' && findPathFrom(x + 1, y)) { spot = { x: x, y: y }; break; }
      }
      g.teleport(spot.x + 1, spot.y); steps(0.2);
      var safeX = G.player.x;
      G.player.flyCd = 0; G.player.energy = SC.maxEnergy(); tap('KeyG'); steps(0.8);
      G.player.x = spot.x + 0.5; G.player.y = spot.y + 0.5;    // the world side lets flyers over this; in the old world we put the hero there
      g.fly(false); steps(1.5);
      check(!W.blocked(G.player.x, G.player.y, 0.3, 'player') && G.stats.safeLandings >= 1, 'landing on a bad spot pops Wren back to safe ground');
    },
    // ---------- portal blocks (in a level: they light the exit portal and travel home with the team) ----------
    blocks: function () {
      g.start('nate', 0); g.god(true);
      var L = G.L, bl = G.pickups.filter(function (k) { return k.kind === 'block'; });
      check(bl.length === (L.blocks && L.blocks.length ? L.blocks.length : 3), 'block pickups are on the map (' + bl.length + ')');
      check(L.portalNeed === bl.length + 1, 'portal needs map blocks + 1 from the mini-boss (' + L.portalNeed + ')');
      var k = bl[0]; g.teleport(Math.floor(k.x), Math.floor(k.y)); steps(0.5);
      check(st().blocks.got === 1 && st().blocks.carried === 1 && st().blocks.fitted === 1, 'walking onto a block picks it up, it is carried and lights one exit slot');
      g.hurtBoss(9999); steps(0.2);
      var bb = G.pickups.filter(function (q) { return q.kind === 'block'; }).length;
      check(bb === bl.length, 'the mini-boss drops a block');
      g.giveBlocks();
      steps(0.3);
      check(st().blocks.got === L.portalNeed && !st().gateOpen, 'all blocks found, but the portal stays shut while a crest is still lying around');
      var gt = L.gate, nb = adjacentFree(gt.tx, gt.ty);
      G.pickups.filter(function (q) { return q.kind === 'crest'; }).forEach(function (q) { g.earnCrest(q.power); g.teleport(Math.floor(q.x), Math.floor(q.y)); steps(1.8); });
      g.teleport(nb.x, nb.y); steps(0.2);
      check(st().gateOpen, 'portal opens with all crests + all blocks (no fitting in the level)');
      until(function () { return st().screen === 'levelDone'; }, 3, function () { steerTo(gt.tx + 0.5, gt.ty + 0.5); });
      releaseMove();
      check(st().screen === 'levelDone' && st().done.indexOf(0) >= 0, 'walking into the open portal finishes Sunny Meadow');
      check(G.prog.carried === L.portalNeed, 'its ' + L.portalNeed + ' blocks are now carried (' + G.prog.carried + ')');
      check(SC.menuItems()[0].label === 'Back to Home Base', 'one place per planet: the exit leads back to Home Base (' + SC.menuItems()[0].label + ')');
      steps(0.6); tap('Enter');
      check(st().screen === 'travel' && st().travel.to === 'base', 'it shows the travel star map');
      steps(1); tap('Space'); steps(0.1);
      check(st().screen === 'play' && st().place === 'base' && st().blocks.carried === L.portalNeed, 'Space skips the trip, home with the blocks (' + st().blocks.carried + ')');
    },
    travelpic: function () {
      g.start('nate', 'base'); G.prog.done = [0, 1, 2]; ['Aquaria', 'Voltara', 'Glacira'].forEach(function (pl) { G.prog.fitted[pl] = SC.portalNeedFor(pl); });
      g.enterPlanet('Glacira'); steps(1.6);
      check(st().screen === 'travel' && st().travel.to === 3, 'star map picture (Home Base to Glacira, Frosty Peaks)');
    },
    travelhome: function () {
      g.start('nate', 1); G.L.gateOpen = true; SC.levelComplete(); steps(0.6); tap('Enter'); steps(1.6);
      check(st().screen === 'travel' && st().travel.to === 'base', 'travel screen back to Home Base');
    },
    travelauto: function () {
      g.start('nate', 'base'); G.prog.done = [0, 1, 2, 3, 4, 5, 6, 7]; SC.PLANET_ORDER.slice(0, 9).forEach(function (pl) { G.prog.fitted[pl] = SC.portalNeedFor(pl); });
      g.enterPlanet('Umbra'); steps(3.4);
      check(st().screen === 'play' && st().levelIndex === 8 && st().planet === 'Umbra', 'the trip ends by itself and Shadow Woods is on Umbra');
    },
    // ---------- the Home Base ----------
    basestart: function () {
      g.clearSave();
      tap('Enter'); tap('Enter'); tap('Space'); steps(0.3);
      var s = st(), need = {};
      check(s.screen === 'play' && s.place === 'base' && s.levelName === 'Home Base', 'New Game starts at the Home Base');
      check(G.banner && G.banner.title === 'Home Base', 'the banner says Home Base');
      check(SC.PLANET_ORDER.length === 10 && SC.PLANET_ORDER[9] === 'Pyros', 'ten portals: nine planets and the Dragon (' + SC.PLANET_ORDER.join(',') + ')');
      check(s.portals.Verdia.open && SC.PLANET_ORDER.slice(1).every(function (pl) { return !s.portals[pl].open; }), 'Verdia is open, every other portal is locked');
      SC.PLANET_ORDER.forEach(function (pl, k) { need[pl] = k === 0 ? 0 : SC.levelBlockCount(k - 1); });
      check(SC.PLANET_ORDER.every(function (pl) { return s.portals[pl].need === need[pl]; }), 'each portal needs exactly the blocks of the planet before it (' + SC.PLANET_ORDER.map(function (pl) { return pl + ' ' + s.portals[pl].need; }).join(', ') + ')');
      check(SC.LEVELS.slice(0, 9).every(function (d, i) { return SC.levelBlockCount(i) === 5 && SC.planetLevels(SC.PLANET_ORDER[i]).join() === String(i); }), 'every planet has one place that gives 5 blocks (4 on the map + 1 from its mini-boss)');
      check(s.npcs === 2 && G.flags.length >= 1 && s.enemiesAlive === 0 && !G.bossEnt, 'a trader, a smith and a flag; no baddies');
      check(s.goalText === 'Jump into portal 1, Verdia!', 'goal: ' + s.goalText);
      check(SC.view.portalCount() === 10, 'ten portals are drawn (' + SC.view.portalCount() + ')');
      var c = G.L.def.center, okFace = G.L.portals.every(function (po) { var fx = po.face[0], fy = po.face[1], vx = c.x - (po.tx + 0.5), vy = c.y - (po.ty + 0.5); return fx * vx + fy * vy > 0; });
      check(okFace, 'every portal faces the plaza');
      g.validate().forEach(function (pr) { log('  map: ' + pr); });
      // walk into Verdia: straight to the star map, then Sunny Meadow
      var r = walkIntoPortal('Verdia', 40);
      check(r && st().screen === 'travel' && st().travel.to === 0, 'walking into the Verdia portal goes to Sunny Meadow (' + st().screen + ')');
      skipTrip();
      check(st().screen === 'play' && st().levelIndex === 0, 'Sunny Meadow starts');
    },
    baseflow: function () {
      g.start('nate', 'base'); g.god(true);
      g.enterPlanet('Verdia', 0);
      var need0 = G.L.portalNeed;
      finishQuick();
      check(st().screen === 'levelDone' && G.prog.carried === need0, 'Sunny Meadow done, carrying ' + G.prog.carried);
      check(SC.menuItems()[0].label === 'Back to Home Base', 'the exit leads home (' + SC.menuItems()[0].label + ')');
      steps(0.6); tap('Enter'); skipTrip();
      check(st().place === 'base' && G.prog.carried === need0, 'back at base carrying ' + G.prog.carried);
      var po = basePortal('Verdia');
      check(SC.dist(G.player.x, G.player.y, po.tx + 0.5, po.ty + 0.5) < 3.5, 'the hero arrives in front of the Verdia portal');
      check(st().goalText === 'Bring your blocks to portal 2, Aquaria!', 'goal: ' + st().goalText);
      // fit carried blocks into Aquaria, one by one
      var ap = basePortal('Aquaria'), nb = adjacentFree(ap.tx, ap.ty);
      g.teleport(nb.x, nb.y); var t0 = G.simT; steps(0.4);
      check(st().portals.Aquaria.fitted === 0, 'fitting a block takes a moment');
      until(function () { return st().portals.Aquaria.open; }, 12);
      var took = G.simT - t0;
      check(st().portals.Aquaria.open && G.prog.carried === 0 && st().portals.Aquaria.fitted === need0 && took > 0.6 * need0, need0 + ' blocks fitted one by one (' + took.toFixed(1) + ' s) and Aquaria opens');
      check(!st().portals.Voltara.open, 'Voltara stays locked');
      check(st().goalText === 'Jump into portal 2, Aquaria! Find 5 blocks for Voltara.', 'goal: ' + st().goalText);
      g.render();
      walkIntoPortal('Aquaria', 30);
      check(st().screen === 'travel' && st().travel.to === 1, 'one place on Aquaria: no picker, straight to the trip');
      skipTrip();
      check(st().levelName === 'Rainy Isles' && st().planet === 'Aquaria', 'Rainy Isles on Aquaria');
      g.giveBlocks(2); steps(0.1);
      tap('KeyP');
      var items = SC.menuItems().map(function (i) { return i.id; });
      check(items.join(',') === 'resume,p2in,home,quit' && SC.pauseNote().length > 0, 'pause has "Player 2 joins", "Back to Home Base" and says blocks stay behind');
      G.menuSel = items.indexOf('home'); tap('Enter'); skipTrip();
      check(st().place === 'base' && G.prog.carried === 0 && st().done.indexOf(1) < 0, 'back at base: the Isles blocks were dropped');
      check(SC.dist(G.player.x, G.player.y, ap.tx + 0.5, ap.ty + 0.5) < 3.5, 'the hero arrives in front of the Aquaria portal');
    },
    portalcount: function () {
      g.start('nate', 'base'); g.god(true);
      var ok = 0, notes = [];
      SC.PLANET_ORDER.slice(1).forEach(function (pl, k) {
        var n = SC.portalNeedFor(pl), po = basePortal(pl), nb = adjacentFree(po.tx, po.ty);
        var prev = SC.PLANET_ORDER[k], prevNeed = SC.levelBlockCount(SC.planetLevels(prev)[0]);
        g.giveBlocks(n - 1); g.teleport(nb.x, nb.y);
        until(function () { return G.prog.carried === 0; }, n + 3); steps(1);
        var shutWithOneLess = !st().portals[pl].open && st().portals[pl].fitted === n - 1;
        g.giveBlocks(1); until(function () { return st().portals[pl].open; }, 3);
        if (shutWithOneLess && st().portals[pl].open && n === prevNeed) ok++; else notes.push(pl);
        log('  ' + pl + ': needs ' + n + ' (the blocks of ' + prev + ')');
      });
      check(ok === 9, 'all nine locked portals (Aquaria ... Umbra and the Dragon gate) stay shut with one block less and open with exactly the blocks of the planet before (' + notes.join(',') + ')');
      // a locked portal that is not next does not take blocks
      g.start('nate', 'base'); g.giveBlocks(3);
      var up = basePortal('Voltara'), nb2 = adjacentFree(up.tx, up.ty); g.teleport(nb2.x, nb2.y); steps(3);
      check(G.prog.carried === 3 && st().portals.Voltara.fitted === 0, 'Voltara does not take blocks before Aquaria is open');
    },
    replay: function () {
      g.start('nate', 'base'); g.god(true); G.prog.done = [0, 1]; ['Aquaria', 'Voltara'].forEach(function (pl) { G.prog.fitted[pl] = SC.portalNeedFor(pl); });
      g.giveAllCrests();
      g.enterPlanet('Verdia', 0); steps(0.2);
      var s = st();
      check(G.L.replay && s.gateOpen, 'replaying Sunny Meadow: the exit portal is open from the start');
      check(G.pickups.filter(function (k) { return k.kind === 'block' || k.kind === 'crest'; }).length === 0, 'no blocks and no crests appear again');
      check(G.bossEnt && G.bossEnt.alive, 'the mini-boss is back');
      g.hurtBoss(9999); steps(0.3);
      check(G.pickups.filter(function (k) { return k.kind === 'block'; }).length === 0, 'it drops no block in a replay');
      var gt = G.L.gate, nb = adjacentFree(gt.tx, gt.ty); g.teleport(nb.x, nb.y);
      until(function () { return st().screen === 'levelDone'; }, 4, function () { steerTo(gt.tx + 0.5, gt.ty + 0.5); }); releaseMove();
      check(st().screen === 'levelDone' && G.prog.carried === 0 && SC.menuItems()[0].label === 'Back to Home Base', 'the replay ends back at Home Base, no blocks gained');
    },
    freebase: function () {
      g.start('nate', 'base', 'free');
      var s = st();
      check(SC.PLANET_ORDER.every(function (pl) { return s.portals[pl].open; }), 'Free Play: all ten portals open');
      walkIntoPortal('Glacira', 40);
      check(st().screen === 'travel' && st().travel.to === 3, 'Free Play: walking into portal 4 goes to Frosty Peaks (' + st().screen + ')');
      skipTrip();
      check(st().levelIndex === 3 && st().gateOpen, 'Frosty Peaks starts with its portal open');
    },
    pyros: function () {
      g.start('nate', 'base'); g.god(true); g.giveAllCrests();
      G.prog.done = [0, 1, 2, 3, 4, 5, 6, 7]; SC.PLANET_ORDER.forEach(function (pl) { G.prog.fitted[pl] = SC.portalNeedFor(pl); });
      check(st().goalText.indexOf('Umbra') >= 0, 'goal points at Umbra: ' + st().goalText);
      G.prog.done.push(8);
      check(st().goalText.indexOf("Dragon's gate") >= 0, 'then at the Dragon gate: ' + st().goalText);
      walkIntoPortal('Pyros', 50); skipTrip();
      check(st().levelIndex === 9 && st().planet === 'Pyros', 'the Dragon gate leads to Pyros');
      g.hurtBoss(9999); steps(3.2);
      check(st().screen === 'win', 'beating the Dragon wins');
      tap('Enter');
      check(st().screen === 'title', 'Play again goes to the title');
    },
    // ---------- pictures ----------
    basepic: function () { g.start('nate', 'base'); G.prog.fitted.Aquaria = 2; G.prog.carried = 3; G.L.blocksCarried = 3; g.teleport(24, 18); G.player.face = -Math.PI / 2; steps(1.2); settle(); check(st().place === 'base', 'Home Base picture (top view)'); },
    basebehind: function () { g.start('nate', 'base'); SC.gfx.setView('behind', 0); g.teleport(25, 26); G.player.face = -Math.PI / 2; steps(1.5); settle(); check(SC.gfx.getView() === 'behind', 'Home Base picture (behind view)'); },
    basepic2: function () { g.start('nate', 'base'); G.prog.done = [0, 1, 2, 3, 4, 5, 6, 7, 8]; SC.PLANET_ORDER.forEach(function (pl) { G.prog.fitted[pl] = SC.portalNeedFor(pl); }); g.teleport(24, 28); G.player.face = Math.PI / 2; SC.gfx.setView('behind', 0); SC.gfx.viewState.heading = Math.PI / 2; steps(2.5); settle(); check(st().portals.Pyros.open, 'Home Base picture: the Dragon gate open (Behind view)'); },
    baseopen: function () { g.start('nate', 'base'); G.prog.fitted.Aquaria = SC.portalNeedFor('Aquaria'); G.prog.fitted.Voltara = 3; G.prog.done = [0, 1]; g.teleport(12, 14); steps(2.5); settle(); check(st().portals.Aquaria.open, 'portals open / half full picture'); },
    pausepic: function () { g.start('nate', 1); steps(0.3); tap('KeyP'); check(st().screen === 'pause', 'pause picture'); },    // ---------- baddie camps ----------
    leash: function () {
      g.start('nate', 0); g.god(true); clearEnemies();
      var a = openArea(2);
      var e1 = spawn('grump', a.x + 0.5, a.y + 0.5, { camp: 7 }), e2 = spawn('grump', a.x + 1.5, a.y + 0.5, { camp: 7 }), e3 = spawn('grump', a.x + 0.5, a.y + 1.5, { camp: 8 });
      [e1, e2, e3].forEach(function (e) { e.aggro = false; e.wanderT = 99; e.wanderGo = false; });
      var far = farSpot(a, 12);
      g.teleport(far.x, far.y); steps(0.5);
      check(!e1.aggro && !e2.aggro, 'baddies far away do not notice the hero');
      g.teleport(Math.floor(e1.x) + 3, Math.floor(e1.y)); steps(0.1);
      check(e1.aggro && e2.aggro, 'the whole camp wakes together');
      check(!e3.aggro || SC.dist(e3.x, e3.y, G.player.x, G.player.y) < SC.noticeRadius(), 'another camp stays asleep');
      var far2 = farSpot(a, 16);
      g.teleport(far2.x, far2.y); steps(0.3);
      check(e1.returning || !e1.aggro, 'when the hero runs far away they walk home');
      steps(8);
      check(SC.dist(e1.x, e1.y, e1.homeX, e1.homeY) < 1.5, 'baddie is back home');
    },
    // ---------- friendly people ----------
    trade: function () {
      g.start('nate', 0); g.god(true); clearEnemies();
      var tr = G.npcs.filter(function (n) { return n.role === 'trader'; })[0];
      check(!!tr && G.npcs.length === 2, 'trader and smith are placed');
      g.teleport(Math.floor(tr.x) + 1, Math.floor(tr.y)); steps(0.2);
      check(G.nearNpc === tr, 'standing next to the trader shows the prompt');
      tap('Enter');
      check(st().screen === 'shop' && G.shop.role === 'trader', 'Enter opens the trade menu (game paused)');
      var t0 = G.levelT; steps(0.5); check(G.levelT === t0, 'the game is paused while trading');
      G.prog.gems = 200;
      var items = SC.shopItems('trader'), hp = items.filter(function (i) { return i.id === 'heart'; })[0];
      var mh = st().maxHp; pickItem('trader', 'heart'); tap('Enter');
      check(st().maxHp === mh + 1 && st().gems === 200 - hp.price, '+1 heart for the team costs ' + hp.price + ' gems');
      check(st().team.every(function (m) { return m.maxHp === SC.heroById(m.id).hearts + 1; }), 'every hero got the heart');
      var hp2 = SC.shopItems('trader').filter(function (i) { return i.id === 'heart'; })[0];
      check(hp2.price > hp.price, 'the price goes up a little (' + hp.price + ' -> ' + hp2.price + ')');
      var en = SC.shopItems('trader').filter(function (i) { return i.id === 'energy'; })[0]; pickItem('trader', 'energy'); var me = SC.maxEnergy(); tap('Enter');
      check(SC.maxEnergy() === me + 20, 'bigger energy bar (' + me + ' -> ' + SC.maxEnergy() + ', sel ' + G.menuSel + ', msg ' + G.shop.msg + ', screen ' + G.screen + ')');
      G.prog.gems = 0; G.player.hp = 1; SC.storeActive();
      var fl = SC.shopItems('trader').filter(function (i) { return i.id === 'fill'; })[0]; pickItem('trader', 'fill'); tap('Enter');
      check(G.player.hp === 1 && G.shop.msg.indexOf('more gems') >= 0, 'without enough gems nothing happens (' + G.shop.msg + ')');
      g.render();
      tap('Escape'); check(st().screen === 'play', 'Esc leaves the shop');
      check(G.prog.gemHearts === 0, 'no free hearts for gems any more');
    },
    smith: function () {
      g.start('nate', 0); g.god(true); clearEnemies(); g.giveCrest('fire');
      g.openTrade('smith');
      check(st().screen === 'shop' && G.shop.role === 'smith', 'openTrade(smith) opens the blacksmith');
      G.prog.gems = 150;
      var bl = SC.shopItems('smith')[0]; G.menuSel = 0; tap('Enter');
      check(st().swordLevel === 1 && st().gems === 150 - bl.price, 'Iron Blade for ' + bl.price + ' gems');
      var it = SC.shopItems('smith').filter(function (i) { return i.power === 'fire'; })[0];
      check(!SC.shopItems('smith').some(function (i) { return i.power === 'ice'; }), 'Nate can only pick his own crests');
      pickItem('smith', it.id); tap('Enter');
      check(st().swordCrest.nate === 'fire', 'Fire crest put in Nate\'s sword');
      g.render();
      tap('Escape');
      check(SC.swordCrestOf('zen') === null, "Zen's sword has no crest");
    },
    swordcrest: function () {
      var want = {
        fire: function (e) { return e.burnT > 0; }, ice: function (e) { return e.slowT > 0; }, lightning: function (e, o) { return o.hp < o.maxHp; },
        water: function (e, o, x0) { return e.x - x0 > 1.0; }, surface: function (e) { return true; }, earth: function (e) { return e.stunT > 0; },
        wind: function (e, o, x0) { return e.x - x0 > 1.2; }, life: function (e, o, x0, hp) { return G.player.hp > hp; }, death: function (e, o, x0, hp, en) { return G.player.energy > en; }
      };
      Object.keys(want).forEach(function (pid) {
        var a = powerSetup(pid, 1);
        var hero = SC.powerOwner(pid);
        g.swapHero(hero); g.setSwordCrest(hero, pid);
        var e = spawn('shield', a.x + 1.2, a.y + 0.5), o = spawn('grump', a.x + 2.4, a.y + 0.5);
        [e, o].forEach(function (q) { q.hp = q.maxHp = 50; q.state = 'recover'; q.st = 99; q.face = 0; });
        G.player.hp = 1; G.player.energy = 10; var hp = G.player.hp, en = G.player.energy, x0 = e.x;
        face(0); G.player.swordCd = 0; tap('Space'); steps(0.3);
        var dmg = 50 - e.hp;
        check(dmg >= G.hero.dmg + G.prog.swordLevel + SC.SWORD_CREST_BONUS - 0.01 && want[pid](e, o, x0, hp, en), pid + ' sword: ' + SC.SWORD_CREST_TIP[pid] + ' (dmg ' + dmg.toFixed(1) + ')');
      });
    },
    // ---------- super attack ----------
    super: function () {
      g.start('nate', 0); g.god(true); clearEnemies();
      if (G.bossEnt) { G.bossEnt.alive = false; G.enemies = []; }
      var a = openArea(3); g.teleport(a.x, a.y); steps(0.2);
      check(!st().superReady && !g.useSuper(), 'no super before the hero has a power');
      SC.HEROES.map(function (hh) { return hh.id; }).forEach(function (h) {
        g.giveCrest(SC.heroById(h).powers[0]);
        g.swapHero(h); g.teleport(a.x, a.y); steps(0.05);
        var es = [];
        for (var i = 0; i < 4; i++) { var e = spawn('brute', a.x + 0.5 + Math.cos(i * 1.57) * 1.8, a.y + 0.5 + Math.sin(i * 1.57) * 1.8); e.hp = e.maxHp = 200; e.state = 'recover'; e.st = 99; es.push(e); }
        check(st().superReady, h + ': super unlocked with first power');
        check(g.useSuper(), h + ': R super goes off (' + SC.SUPER_NAME[h] + ')');
        steps(1.5);
        var hit = es.filter(function (e) { return e.hp < 200; }).length;
        check(hit >= 2, h + ': super hurts baddies around (' + hit + ' of 4)');
        check(!g.useSuper() && st().superCd > 20, h + ': cooldown blocks a second use (' + st().superCd + ' s)');
        es.forEach(function (e) { e.alive = false; });
      });
      g.swapHero('nate'); var c0 = st().superCd; g.swapHero('vex'); steps(5); g.swapHero('nate');
      check(c0 - st().superCd > 4.5, 'super cooldown keeps counting while another hero plays');
      steps(25);
      check(st().superReady && G.stats.superReadyPings >= 1, '"Super ready!" after about 25 s');
      g.press('KeyR'); steps(0.05); g.release('KeyR');
      check(st().superCd > 20, 'key R uses the super');
      g.setMode('free'); G.superCd = {}; g.useSuper();
      check(st().superCd <= 5.01 && st().superCd > 4, 'Free Play super cooldown is about 5 s');
    },
    // ---------- saving ----------
    savecontinue: function () {
      g.clearSave();
      g.start('mira', 2); g.god(true);
      g.giveCrest('water'); g.setPowerLevel('water', 2); G.prog.powers.water.xp = 9; G.prog.gems = 57; G.prog.swordLevel = 1; G.prog.bonusHearts = 1;
      g.setSwordCrest('mira', 'water'); G.player.hp = 3;
      g.swapHero('koda');
      SC.save();
      G.screen = 'title'; G.menuSel = 0; steps(0.1);
      tap('ArrowDown'); tap('Enter'); steps(0.5);
      var s = st();
      check(s.screen === 'play' && s.place === 'base' && s.hero === 'koda' && s.mode === 'adventure', 'Continue (saved in level 3) starts at the Home Base as Koda in Adventure');
      check(s.done.join(',') === '0,1' && s.portals.Voltara.open && !s.portals.Glacira.open, 'finished places and filled portals come back (' + s.done.join(',') + ')');
      check(s.powers.water.owned && s.powers.water.level === 2 && s.powers.water.xp === 9, 'powers come back with level and progress');
      check(s.gems === 57 && s.swordLevel === 1 && s.swordCrest.mira === 'water', 'gems, sword and sword crest come back');
      check(member('mira').hp === 3 && member('koda').maxHp === 9, "each hero's hearts and heart bonuses come back");
      g.clearSave(); SC.store.set('save3', { v: 3, heroId: 'nate', powers: {}, levelIndex: 3, done: [0, 1], fitted: {} }); G.screen = 'title'; G.menuSel = 0; steps(0.1);
      check(SC.menuItems().length === 1, 'an old (v3, four planets) save is ignored: no Continue');
      SC.store.del('save3');
      g.clearSave();
      g.start('zen', 0, 'free'); SC.save();
      G.screen = 'title'; G.menuSel = 0; steps(0.1); tap('ArrowDown'); tap('Enter'); steps(0.3);
      check(st().mode === 'free', 'Continue remembers Free Play');
      g.clearSave();
    },
    savelevel: function () {
      g.clearSave();
      g.start('zen', 0); g.god(true);
      G.pickups.filter(function (k) { return k.kind === 'crest'; }).forEach(function (k) { g.earnCrest(k.power); g.teleport(Math.floor(k.x), Math.floor(k.y)); steps(1.8); });
      g.hurtBoss(9999); steps(0.2); g.giveBlocks();
      var gt = G.L.gate, nb = adjacentFree(gt.tx, gt.ty); g.teleport(nb.x, nb.y);
      until(function () { return st().screen === 'levelDone'; }, 8, function () { if (G.L.gateOpen) steerTo(gt.tx + 0.5, gt.ty + 0.5); });
      releaseMove();
      var sv = SC.store.get('save4');
      check(!!sv && sv.v === 4 && sv.heroId === 'zen' && sv.done.join(',') === '0' && sv.carried === G.L.portalNeed, 'finishing a level saves progress (save v4: done ' + (sv && sv.done) + ', carried ' + (sv && sv.carried) + ')');
      steps(0.6); tap('Enter'); skipTrip(); g.enterPlanet('Aquaria', 1); g.giveBlocks(2); SC.saveMid();
      sv = SC.store.get('save4');
      check(sv.carried === SC.levelBlockCount(0), 'a save in the middle of a level does not keep its blocks (' + sv.carried + ')');
      G.screen = 'title'; G.menuSel = 0; steps(0.1); tap('ArrowDown'); tap('Enter'); steps(0.3);
      check(st().place === 'base' && G.prog.carried === SC.levelBlockCount(0), 'Continue: at the base carrying ' + G.prog.carried);
      g.clearSave();
    },
    // ---------- whole game ----------
    full: function () {
      // the whole Adventure by the auto-player: base -> planet 1 -> base -> planet 2 -> ... -> planet 9 -> base -> Pyros -> win
      g.clearSave();
      g.start('nate', 'base'); g.god(true);
      var route = [];
      for (var guard = 0; guard < 24; guard++) {
        var s = st();
        if (s.screen === 'win') break;
        route.push(s.place);
        if (s.place === 'base') {
          var ok = playBase(150);
          check(ok, 'auto-player left the base by a portal (' + brief() + ')');
          if (!ok) return;
          steps(0.5); tap('Enter'); steps(0.3);
          continue;
        }
        var lv = s.levelIndex, r = playLevel(420);
        check(r.ok, 'auto-player finished level ' + (lv + 1) + ' in ' + Math.round(r.sec) + 's (boss ' + Math.round(r.info.boss) + 's, nopath ' + r.info.nopath + ')');
        log('  after level ' + (lv + 1) + ': ' + brief() + ' swaps=' + (G.stats.swaps || 0));
        if (!r.ok) { G.enemies.forEach(function (e) { if (e.alive && SC.dist(e.x, e.y, G.player.x, G.player.y) < 12) log('  near: ' + e.type + ' at ' + e.x.toFixed(1) + ',' + e.y.toFixed(1) + ' aggro=' + e.aggro + ' state=' + e.state + ' hp=' + e.hp.toFixed(1)); }); return; }
        if (st().screen === 'win') break;
        steps(0.6); tap('Enter'); check(st().screen === 'travel', 'travel screen after level ' + (lv + 1)); steps(0.5); tap('Enter'); steps(0.3);
      }
      log('  route: ' + route.join(' > '));
      check(route.join(',') === 'base,0,base,1,base,2,base,3,base,4,base,5,base,6,base,7,base,8,base,9', 'route base > planet 1 > base > planet 2 ... > planet 9 > base > Pyros (' + route.join(',') + ')');
      check(st().screen === 'win', 'reached the win screen');
      check(G.prog.crests.length === 9, 'all nine powers earned (' + G.prog.crests.join(',') + ')');
      check(G.stats.templesOpened === 9 && G.stats.guardians === 9, 'through all nine temples: ' + G.stats.templesOpened + ' doors opened, ' + G.stats.guardians + ' guardians beaten');
      check(SC.PLANET_ORDER.every(function (pl) { return SC.portalInfo(pl).open; }) && G.prog.carried === 0, 'every portal was opened with all the blocks');
      check((G.stats.swaps || 0) > 3, 'the auto-player had to switch heroes (' + G.stats.swaps + ')');
      g.clearSave();
    },
    nogod: function () {
      g.clearSave();
      g.start('nate', 0);
      var r = playLevel(500);
      check(r.ok, 'without god mode: level 1 done in ' + Math.round(r.sec) + 's, ' + G.stats.hits + ' hits, ' + (G.stats.rests || 0) + ' rests, ' + G.stats.deaths + ' oops');
      g.clearSave();
    },
    // ---------- v1 checks kept ----------
    // ---------- crest temples ----------
    // every temple: door shut before the task, open after; guidance at each step; guardian wakes; crest sealed until it falls
    temples: function () {
      POWERS9.forEach(function (pw) {
        var t = templeStart(pw), k = crestPick(pw), tag = t.name + ': ';
        g.god(true); clearEnemies(); steps(0.1);
        var shut = t.door.every(function (d) { return W.tile(d.tx, d.ty) === 'Q'; });
        check(shut && !t.open && st().temples[pw] && !st().temples[pw].open, tag + 'door is shut before the task');
        check(k && k.sealed && k.temple === t && t.ent && t.ent.alive && !t.ent.aggro, tag + 'crest sealed on the altar, ' + (t.ent && t.ent.def.name) + ' asleep');
        check(W.blocked(t.guard.tx + 0.5, t.guard.ty + 0.5, 0.3, 'flyer') && !findPathFrom(t.guard.tx, t.guard.ty), tag + 'nobody gets in: not on foot, not flying');
        var gt0 = st().goalText;
        check(/Beat \d+ baddies|Touch a|Open a|Collect/.test(gt0), tag + 'goal before: ' + gt0);
        var front = tspot(t, 0, 0); g.teleport(front.x, front.y); steps(0.2);
        check(G.toasts.some(function (q) { return q.text.indexOf(t.name + ' is shut') >= 0; }), tag + 'walking up to the shut door says what to do [' + G.toasts.map(function (q) { return q.text; }).join(' | ') + '] hint ' + (G.templeHintT || 0).toFixed(1));
        g.finishTrial(pw); steps(0.2);
        check(t.open && t.door.every(function (d) { return W.tile(d.tx, d.ty) === ';'; }) && st().temples[pw].open, tag + 'the task opens the door');
        check(G.banner && G.banner.title === 'The ' + t.name + ' is open!', tag + 'banner "' + (G.banner && G.banner.title) + '"');
        check(st().goalText.indexOf('Go into the ' + t.name + '!') === 0, tag + 'goal: ' + st().goalText);
        var hall = tspot(t, 0, 5); g.teleport(hall.x, hall.y); steps(0.1);
        check(st().goalText.indexOf('Beat ' + t.ent.def.short + '!') === 0 && !t.ent.aggro, tag + 'inside: ' + st().goalText + ' (still asleep in the hall)');
        var ch = tspot(t, 0, 10); g.teleport(ch.x, ch.y);
        var woke = until(function () { return t.ent.aggro; }, 1);
        check(woke && t.ent.state === 'wake' && G.banner && G.banner.title.indexOf('wakes up') > 0 && st().boss && st().boss.name === t.ent.def.name, tag + 'walking into the chamber wakes it: "' + (G.banner && G.banner.title) + '", health bar ' + (st().boss && st().boss.name));
        steps(3);
        check(crestPick(pw).sealed, tag + 'the crest stays sealed while the guardian stands');
        g.beatGuardian(pw); steps(0.3);
        check(!crestPick(pw).sealed && !st().temples[pw].guardianAlive, tag + 'beating the guardian frees the crest');
        check(G.banner && G.banner.title.indexOf('You beat') === 0 && G.pickups.filter(function (q) { return q.kind === 'gem'; }).length >= 5, tag + 'big moment: "' + (G.banner && G.banner.title) + '" and gems');
        var pwd = SC.powerById(pw);
        check(st().goalText.indexOf('Get the ' + pwd.name + ' Crest for ' + SC.heroById(pwd.owner).name + '!') === 0, tag + 'goal: ' + st().goalText);
        g.teleport(t.altar.tx, t.altar.ty); steps(1.2);
        check(SC.hasPower(pw), tag + 'crest picked up, ' + SC.heroById(pwd.owner).name + ' owns ' + pwd.name);
      });
    },
    // each temple's traps: glow before they hurt, half a heart, and a flying hero is safe
    templetraps: function () {
      POWERS9.forEach(function (pw) {
        var t = templeStart(pw), L = G.L, tag = t.name + ': ';
        var mine = L.traps.filter(function (q) { return W.inBox(t.rect, q.tx + 0.5, q.ty + 0.5, 0); });
        check(mine.length >= 2, tag + mine.length + ' traps in the hall (' + mine.map(function (q) { return q.kind + (q.style || q.what ? ':' + (q.style || q.what) : ''); }).join(', ') + ')');
        g.openTemple(pw); clearEnemies(); G.banner = null;
        checkTraps(mine, tag);
      });
    },
    // the traps out in the four new places: they glow first, then hurt (half a heart), and a flying hero is safe
    newtraps: function () {
      ['Rainy Isles', 'Thunder Plains', 'Stone Canyon', 'Bloom Jungle'].forEach(function (nm) {
        var li = levelByName(nm); g.start('nate', li); G.banner = null;
        if (G.bossEnt) { G.bossEnt.alive = false; } clearEnemies(); G.enemies = [];
        var L = G.L, mine = L.traps.filter(function (q) { return q.kind !== 'plate' && !W.templeAt(q.tx + 0.5, q.ty + 0.5, 0); });
        var styles = {}; mine.forEach(function (q) { styles[q.kind + (q.style || q.what ? ':' + (q.style || q.what) : '')] = 1; });
        check(mine.length >= 4, nm + ': ' + mine.length + ' traps outside the temple (' + Object.keys(styles).join(', ') + ')');
        checkTraps(mine, nm + ': ');
      });
    }
  };
  function checkTraps(mine, tag) {
    var L = G.L;
        var okWarn = 0, okHurt = 0, okFly = 0, half = 0, notes = [];
        mine.forEach(function (tr) {
          var spot = trapSpot(tr), per = tr.period > 0 ? tr.period : 2;
          var plateArm = function (i) { if (!(tr.period > 0) && i % 90 === 20 && !(tr.armT > 0) && !(tr.coolT > 0)) tr.armT = 0.9; };   // a plate dart: as if someone steps on its plate
          L.traps.forEach(function (o) { if (o !== tr) { o.saveP = o.period; o.savePh = o.phase || 0; o.period = 9999; o.phase = 0; o.last = undefined; } });
          L.trapShots = [];
          // standing in it (step in while it is calm, like a player would); no storm, no extra baddies
          G.stormT = 1e9; G.trialSpawned = 99; clearEnemies();
          until(function () { return !G.player.flying && G.player.flyH === 0; }, 3);
          g.step(DT);   // fresh trap state first
          var calm = until(function () { return !tr.active && !(tr.warnF > 0) && !L.trapShots.some(function (s) { return s.trap === tr; }) && (tr.c === undefined || tr.c < 0.4); }, per + 1);
          var c0 = tr.c, scr = G.screen;
          g.god(false); g.swapHero('koda'); G.player.inv = 0; G.player.hp = SC.maxHp();
          g.teleport(spot.x, spot.y);
          if (!calm) notes.push('not calm c=' + c0 + ' ' + scr);
          var firstWarn = -1, firstHit = -1, hits0 = G.stats.hits, hp0 = G.player.hp, n = Math.round(per * 2.3 / DT);
          for (var i = 0; i < n && firstHit < 0; i++) {
            if (firstWarn < 0 && ((tr.warnF || 0) > 0 || L.trapShots.some(function (s) { return s.trap === tr; }))) firstWarn = i;
            if (G.stats.hits > hits0) { firstHit = i; half = G.player.hp === hp0 - 0.5 ? half + 1 : half; break; }
            G.player.x = spot.x + 0.5; G.player.y = spot.y + 0.5; G.player.vx = G.player.vy = G.player.kx = G.player.ky = 0;
            plateArm(i); g.step(DT);
          }
          if (firstWarn >= 0 && firstHit > firstWarn) okWarn++;
          else notes.push(tr.kind + ' warn ' + firstWarn + ' hit ' + firstHit + ' c=' + (tr.c || 0).toFixed(2) + ' en=' + G.enemies.filter(function (e) { return e.alive && SC.dist(e.x, e.y, G.player.x, G.player.y) < 3; }).length +
            ' near=' + L.traps.filter(function (o) { return o !== tr && SC.dist(o.tx, o.ty, spot.x, spot.y) < 2.5; }).map(function (o) { return o.kind + ':' + (o.active ? 'A' : '') + (o.warnF > 0 ? 'W' : ''); }).join(','));
          if (firstHit >= 0) okHurt++;
          // flying over it
          g.giveCrest('wind'); g.swapHero('wren'); G.player.flyCd = 0; G.player.energy = SC.maxEnergy(); g.fly(true); steps(1.0);
          var hitsF = G.stats.hits, flown = G.player.flyH > 0.5;
          g.teleport(spot.x, spot.y);
          for (var j = 0; j < Math.round(per * 2.1 / DT); j++) { G.player.flyT = 5; G.player.inv = 0; G.player.x = spot.x + 0.5; G.player.y = spot.y + 0.5; plateArm(j); g.step(DT); }
          if (flown && G.stats.hits === hitsF) okFly++; else notes.push(tr.kind + ' hit a flyer');
          g.fly(false); steps(0.8);
          L.traps.forEach(function (o) { if (o.saveP) { o.period = o.saveP; o.phase = o.savePh; o.last = undefined; delete o.saveP; } });
        });
        check(okWarn === mine.length, tag + 'every trap glows first, then hurts (' + okWarn + '/' + mine.length + ') ' + notes.join('; '));
        check(okHurt === mine.length && half === okHurt, tag + 'each one hurts, half a heart (' + half + '/' + mine.length + ')');
        check(okFly === mine.length, tag + 'a flying hero is safe from all of them (' + okFly + '/' + mine.length + ')');
  }
  var S2 = {
    // every guardian: wakes up, shows each attack on the ground before it hurts, uses 2-3 different attacks, and can be beaten
    guardians: function () {
      POWERS9.forEach(function (pw) {
        var t = templeStart(pw), e = t.ent, tag = e.def.name + ': ';
        clearEnemies(); g.openTemple(pw); G.banner = null;
        g.god(false); g.swapHero('koda');
        var ch = tspot(t, 0, 10); g.teleport(ch.x, ch.y);
        var warned = false, hitOk = true, hits0 = G.stats.hits, kinds = {}, firstHit = false;
        for (var i = 0; i < Math.round(16 / DT); i++) {
          if (G.warns.some(function (w) { return w.owner === e; })) warned = true;
          if (G.stats.hits > hits0 && !firstHit) { firstHit = true; if (!warned) hitOk = false; }
          if (e.state === 'windup' || e.state === 'chargeWind' || e.state === 'blinkOut' || e.state === 'leapUp') kinds[e.def.g.atks[((e.atkI || 1) - 1) % e.def.g.atks.length]] = 1;
          G.player.inv = Math.min(G.player.inv, 0.3); if (G.player.hp < 2) G.player.hp = SC.maxHp();
          g.step(DT);
        }
        var nk = Object.keys(kinds).length;
        check(e.aggro && warned, tag + 'woke up and showed warnings');
        check(firstHit && hitOk, tag + 'its first hit came after a warning');
        check(nk >= 2, tag + nk + ' different attacks (' + Object.keys(kinds).join(', ') + ')');
        var gsz = e.def.size || e.def.r * 3; check(gsz > 1.7 && gsz < 3.2 && e.r < SC.ENEMIES.dragon.r, tag + 'bigger than little baddies (1 to 1.7), smaller than the Dragon (size ' + gsz.toFixed(2) + ')');
        if (t.idx >= 0 && SC.LEVELS.indexOf(G.L.def) > 0) check((e.def.weak || []).length > 0, tag + 'weak to ' + e.def.weak.join(' and '));
        // and beat it (the auto-player with sword and powers; god mode so the test is quick)
        g.god(true); var info = { nopath: 0 };
        var ok = until(function () { return !e.alive; }, 150, function () { fight(e, info); });
        releaseMove();
        check(ok, tag + 'beaten by the auto-player in ' + Math.round(G.levelT) + ' s');
      });
    },
    // the guardians of planets 1 to 4: swords plus only the powers the team has by then, no god mode
    swordsonly: function () {
      ['fire', 'water', 'lightning', 'ice'].forEach(function (pw) {
        var t = templeStart(pw), e = t.ent;
        clearEnemies(); g.openTemple(pw); G.banner = null;
        g.god(false);
        var a = tspot(t, 0, 9); g.teleport(a.x, a.y);
        var h0 = G.stats.hits, d0 = G.stats.deaths, r0 = G.stats.rests || 0, t0 = G.simT, info = { nopath: 0 };
        var ok = until(function () { return !e.alive || G.screen === 'oops'; }, 180, function () { fight(e, info); });
        releaseMove();
        check(ok && !e.alive && G.stats.deaths === d0, e.def.name + ' (planet ' + (levelOf(pw) + 1) + ', powers: ' + (G.prog.crests.join('+') || 'none') + '): beaten in ' + Math.round(G.simT - t0) + ' s, ' + (G.stats.hits - h0) + ' hits taken, ' + ((G.stats.rests || 0) - r0) + ' heroes rested, no Oops');
      });
    },
    // Free Play: doors open, guardians there for fun, no crests
    templefree: function () {
      [0, 8].forEach(function (li) {
        g.start('nate', li, 'free');
        var ts = st().temples, keys = Object.keys(ts);
        check(keys.length === SC.LEVELS[li].crests.length && keys.every(function (k) { return ts[k].open && ts[k].guardianAlive; }), 'Free Play ' + SC.LEVELS[li].name + ': every temple open, guardians there (' + keys.join(',') + ')');
        check(!crestPick(), 'Free Play: no crests to earn');
        var pw = keys[0], t = SC.templeOf(pw), ch = tspot(t, 0, 10); g.teleport(ch.x, ch.y);
        until(function () { return t.ent.aggro; }, 1);
        check(t.ent.aggro && G.banner && G.banner.sub.indexOf('for fun') >= 0, 'Free Play: the guardian wakes for a fun fight ("' + (G.banner && G.banner.sub) + '")');
        g.beatGuardian(pw); steps(0.3);
        check(!crestPick() && G.pickups.some(function (q) { return q.kind === 'gem'; }), 'Free Play: beating it gives gems, no crest');
      });
    },
    // replaying a finished place: doors open, guardians back for fun, no crests
    templereplay: function () {
      g.start('nate', 'base'); g.god(true); G.prog.done = [0, 1]; G.prog.fitted.Glacira = SC.portalNeedFor('Glacira');
      g.giveAllCrests();
      g.enterPlanet('Verdia', 0); steps(0.2);
      var ts = st().temples;
      check(G.L.replay && Object.keys(ts).join() === 'fire' && ts.fire.open && ts.fire.guardianAlive, 'replaying Sunny Meadow: its one temple (Fire) is open, the guardian is back');
      check(!crestPick() && st().goalText.indexOf('Temple') < 0, 'no crests in a replay (goal: ' + st().goalText + ')');
      // a place not finished yet, but its crest already earned: the temple is open and the crest gone
      g.start('nate', 1);
      check(st().temples.water.open === false && Object.keys(st().temples).join() === 'water', 'Rainy Isles has one temple (Water), shut at first');
      g.giveCrest('water'); SC.startLevel(1); G.banner = null;
      check(st().temples.water.open && !crestPick('water'), 'with Water already earned, its temple is open and its crest gone');
    },
    // earned crests are saved; Continue then opens their temples
    templesave: function () {
      g.clearSave();
      g.start('zen', 2); g.god(true);
      var t = SC.templeOf('lightning');
      g.earnCrest('lightning'); g.teleport(t.altar.tx, t.altar.ty); steps(1.2);
      check(SC.hasPower('lightning'), 'Lightning earned through its temple');
      SC.save();
      G.screen = 'title'; G.menuSel = 0; steps(0.1); tap('ArrowDown'); tap('Enter'); steps(0.3);
      check(st().place === 'base' && st().powers.lightning.owned, 'Continue: Lightning is still owned');
      g.enterPlanet('Voltara', 2); steps(0.2);
      var ts = st().temples;
      check(ts.lightning.open && !crestPick('lightning'), 'back in Thunder Plains: the Lightning Temple is open, no crest to earn again');
      g.clearSave();
    },
    // a text picture of every map (tiles + heights) in the log, for checking maps by eye
    // a small picture of every map (2 x 2 tiles per letter): height digit = open ground, # solid, ~ water, T temple, P start, G portal
    mapinfo: function () {
      for (var i = 0; i < SC.LEVELS.length; i++) {
        var L = W.parse(i), out = [];
        for (var y = 0; y < L.h; y += 2) {
          var s = '';
          for (var x = 0; x < L.w; x += 2) {
            var best = null;
            for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
              var xx = x + dx, yy = y + dy; if (xx >= L.w || yy >= L.h) continue;
              var ch = L.tiles[yy * L.w + xx], c;
              if (L.start.tx === xx && L.start.ty === yy) c = 'P';
              else if (L.gate && L.gate.tx === xx && L.gate.ty === yy) c = 'G';
              else if (L.inTemple[yy * L.w + xx]) c = 'T';
              else if (L.towerAt && L.towerAt[yy * L.w + xx]) c = 'Z';
              else if (ch === 'w' || ch === 'v' || ch === 'l') c = '~';
              else if (W.isSolidScenery(ch) || ch === '#') c = '#';
              else c = String(L.hgt[yy * L.w + xx]);
              if (!best || 'PGTZ'.indexOf(c) >= 0 || (best === '#' && c !== '#')) best = c;
            }
            s += best;
          }
          out.push(s);
        }
        log('MAP ' + i + ' ' + L.def.name + ' ' + L.w + 'x' + L.h + ' start ' + L.start.tx + ',' + L.start.ty + '\n' + out.join('\n'));
      }
      check(true, 'map info');
    },
    mapdump: function () {
      for (var i = 0; i < SC.LEVELS.length; i++) log('MAP ' + i + ' ' + SC.LEVELS[i].name + '\n' + W.dump(i));
      log('MAP base Home Base\n' + W.dump('base'));
      check(true, 'maps dumped');
    },
    lvl10: function () { g.start('zen', 9); steps(1.2); check(st().levelName === "Dragon's Volcano" && st().planet === 'Pyros', 'level 10 loads on Pyros'); check(st().blocks.need === 0 && st().npcs === 0, 'dragon arena: no blocks, no shop'); },
    hud: function () {
      g.start('mira', 1); steps(0.2);
      g.giveCrest('water'); g.setPowerLevel('water', 2); G.prog.powers.water.xp = 14; g.giveCrest('surface'); g.giveCrest('fire');
      G.player.hp = 3; g.swapHero('zen'); G.player.hp = 2; g.swapHero('mira');
      G.player.inv = 0; G.prog.gems = 33; G.L.blocksCarried = 1; G.L.portalFitted = 1;
      G.superCd = { mira: 11 };
      steps(1.5);
      check(true, 'HUD picture');
    },
    hudfree: function () { g.start('koda', 0, 'free'); g.fly(true); steps(1.6); check(st().flying, 'free play HUD picture, Koda flying'); },
    shoppic: function () { g.start('nate', 0); g.giveCrest('fire'); g.giveCrest('death'); G.prog.gems = 64; g.openTrade('smith'); G.menuSel = 1; steps(0.2); check(st().screen === 'shop', 'smith picture'); },
    tradepic: function () { g.start('nate', 0); G.prog.gems = 31; g.openTrade('trader'); steps(0.2); check(st().screen === 'shop', 'trader picture'); },
    crestpic: function () { g.start('koda', 0); var k = crestPick(); g.teleport(Math.floor(k.x), Math.floor(k.y) + 3); steps(1); check(true, 'sealed crest picture'); },
    modepic: function () { tap('Enter'); steps(0.3); check(st().screen === 'mode', 'mode picture'); },
    selectpic: function () { tap('Enter'); tap('Enter'); steps(0.3); check(st().screen === 'select', 'select picture'); },
    pause: function () { g.start('nate', 0); steps(0.5); tap('KeyP'); check(st().screen === 'pause', 'P pauses'); },
    win: function () {
      g.start('mira', 9); steps(0.2);
      g.hurtBoss(9999); steps(3.2);
      check(st().screen === 'win', 'beating the dragon shows the win screen');
    },
    dragonfight: function () {
      g.start('nate', 9); g.god(true); g.giveAllCrests();
      var r = playLevel(400);
      check(r.ok && st().screen === 'win', 'auto-player beats the dragon (' + Math.round(r.sec) + 's)');
    },
    thorns: function () {
      g.start('nate', 3); g.god(true); clearEnemies(); g.giveCrest('fire');
      var t = findTile('t');
      if (!t) { check(true, 'no thorns on this map'); return; }
      var sp = adjacentFree(t.x, t.y);
      g.teleport(sp.x, sp.y); steps(0.1);
      g.selectPower('fire'); face(Math.atan2(t.y - sp.y, t.x - sp.x)); castF(); steps(2);
      check(W.tile(t.x, t.y) !== 't', 'fireball burned the thorn wall');
    }
  };
  for (var k2 in S2) S[k2] = S2[k2];

  // ======================= new: fly higher, Glide mode, tall buildings, two players =======================
  function alt() { return W.heightAt(G.player.x, G.player.y) + G.player.flyH; }
  function hold(code, sec) { g.press(code); steps(sec); g.release(code); }
  function districtOf(L) { return L.towers.filter(function (t) { return t.climb; })[0]; }
  // a spot on the roof of the climbable building, and the open plaza next to it
  function roofSpot() { var tw = districtOf(G.L); return { x: tw.roof.tx, y: tw.roof.ty, tw: tw }; }
  function flatSpot(minR) { var a = openArea(minR || 4); return a; }
  // ---------- 1. flying higher with Space / lower with Shift ----------
  S.flyheight = function () {
    g.start('koda', 0, 'free'); clearEnemies(); G.banner = null;
    var a = flatSpot(4); g.teleport(a.x, a.y); steps(0.3);
    var g0 = W.heightAt(G.player.x, G.player.y);
    G.player.swordCd = 0; tap('Space'); check(G.player.swingT > 0, 'on the ground Space still swings the sword');
    steps(0.6); G.player.dashCd = 0; g.press('ShiftLeft'); g.step(DT); var dashing = G.player.dashT > 0; g.release('ShiftLeft'); steps(0.3);
    check(dashing, 'on the ground Shift still dashes');
    steps(0.5); tap('KeyG'); steps(1.2);
    check(G.player.flying && Math.abs(G.player.flyH - SC.FLY_H) < 0.1, 'G takes off to the usual hover (' + G.player.flyH.toFixed(2) + ')');
    check(until(function () { return G.toasts.some(function (q) { return q.text.indexOf('Hold Space to go up') === 0; }); }, 4), 'a first-time hint: "Hold Space to go up, Shift to go down"');
    var h1 = G.player.flyH; hold('Space', 1.5);
    check(G.player.flyH > h1 + 4, 'holding Space climbs smoothly (' + h1.toFixed(1) + ' -> ' + G.player.flyH.toFixed(1) + ')');
    var hk = G.player.flyH; steps(1.5);
    check(Math.abs(G.player.flyH - hk) < 0.3 && G.player.flying, 'letting go keeps the height (' + G.player.flyH.toFixed(1) + ')');
    hold('Space', 6);
    check(alt() <= SC.FLY_CEIL + 0.05 && alt() > SC.FLY_CEIL - 0.3, 'it stops at the high ceiling (' + alt().toFixed(2) + ' of ' + SC.FLY_CEIL + ')');
    check(SC.FLY_CEIL > Math.max.apply(null, [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return Math.max.apply(null, W.parse(i).towers.map(function (t) { return t.top; })); })) + 1.5, 'the ceiling is well above the tallest building');
    var shotHp = G.player.hp; G.player.inv = 0;
    var s = spawn('slinger', G.player.x + 3, G.player.y); var pr = SC.enemyShoot(s, 'pebble', Math.PI, 7); s.alive = false; g.god(false); G.prog.mode = 'adventure'; steps(0.8); G.prog.mode = 'free';
    check(G.player.hp === shotHp, 'baddie shots do not reach a flyer high up');
    hold('ShiftLeft', 1.5);
    check(G.player.flyH < hk && G.player.flying, 'holding Shift sinks (' + G.player.flyH.toFixed(1) + ')');
    hold('ShiftLeft', 5);
    check(Math.abs(G.player.flyH - SC.FLY_MIN) < 0.08, 'it stops at the low hover, not on the ground (' + G.player.flyH.toFixed(2) + ')');
    check(G.player.swingT <= 0, 'no sword swing while flying (Space goes up instead)');
    // landing from high up eases down
    hold('Space', 4); var hh = G.player.flyH; tap('KeyG');
    var t0 = G.simT, mid = null;
    until(function () { if (mid === null && G.simT - t0 > 0.5) mid = G.player.flyH; return G.player.flyH === 0; }, 8);
    check(!G.player.flying && G.player.flyH === 0 && mid > 0.5 && mid < hh, 'G lands from ' + hh.toFixed(1) + ' high, easing down (' + (mid || 0).toFixed(1) + ' after half a second) in ' + (G.simT - t0).toFixed(1) + ' s');
    check(!W.blocked(G.player.x, G.player.y, 0.3, 'player'), 'landed on safe ground');
    // the camera follows the height in both views
    g.render(); var cy0 = SC.gfx.camera.position.y; G.player.flyCd = 0; tap('KeyG'); hold('Space', 3); for (var r = 0; r < 60; r++) g.render();
    check(SC.gfx.camera.position.y > cy0 + 2, 'top view camera rises with the flyer (' + cy0.toFixed(1) + ' -> ' + SC.gfx.camera.position.y.toFixed(1) + ')');
    var v = SC.gfx.project(G.player.x, G.player.flyH + 0.8, G.player.y, { x: 0, y: 0 }), gp = SC.gfx.project(G.player.x, 0, G.player.y, { x: 0, y: 0 });
    check(v.vis && v.y > 0 && v.y < innerHeight && gp.y < innerHeight, 'top view: the hero and the ground under them are both on screen');
    SC.gfx.setView('behind', 0); SC.gfx.viewState.heading = G.player.face; for (var r2 = 0; r2 < 60; r2++) g.render();
    v = SC.gfx.project(G.player.x, G.player.flyH + 0.8, G.player.y, { x: 0, y: 0 });
    check(v.vis && v.y > 0 && v.y < innerHeight && SC.gfx.camera.position.y > alt(), 'behind view: the camera is above the high flyer and sees them (' + SC.gfx.camera.position.y.toFixed(1) + ')');
    SC.gfx.setView('top', 0);
    // Wren's Wind Ride in Adventure goes up too
    g.start('wren', 6); clearEnemies(); g.giveCrest('wind'); g.god(true); a = flatSpot(3); g.teleport(a.x, a.y); steps(0.2);
    G.player.flyCd = 0; G.player.energy = SC.maxEnergy(); tap('KeyG'); steps(0.5); hold('Space', 1.2);
    check(G.player.flying && G.player.flyH > 4, 'Wren\'s Wind Ride also climbs with Space (' + G.player.flyH.toFixed(1) + ')');
  };
  // a tall building is a wall for a low flyer, and a high flyer goes over it
  S.flywall = function () {
    g.start('koda', 0, 'free'); clearEnemies(); G.banner = null;
    var L = G.L, tw = L.towers.filter(function (t) { return t.topper === 'dome'; })[0];
    // stand south of it on the plaza and fly north into it
    var x = Math.floor((tw.x0 + tw.x1) / 2), y = tw.y1 + 3;
    g.teleport(x, y); steps(0.2); tap('KeyG'); steps(1);
    g.press('KeyW'); steps(1.5); g.release('KeyW');
    check(G.player.y > tw.y1 + 0.9, 'a low flyer bumps into a tall building (y ' + G.player.y.toFixed(2) + ', wall at ' + (tw.y1 + 1) + ')');
    hold('Space', 3.5); g.press('KeyW'); steps(0.6); g.release('KeyW');
    check(G.player.y < tw.y1, 'up high the flyer goes over it (y ' + G.player.y.toFixed(1) + ', height ' + alt().toFixed(1) + ' over a ' + tw.top + ' tall building)');
    var on = W.heightAt(G.player.x, G.player.y);
    check(G.player.flyH > 0.3, 'still in the air over the roof (' + G.player.flyH.toFixed(1) + ' above ' + on.toFixed(1) + ')');
  };
  // pictures: flying low and very high, both views
  S.flylowpic = function () { g.start('koda', 0, 'free'); G.banner = null; var tw = districtOf(G.L); g.teleport(tw.x0 - 5, tw.y1 + 3); W.unstick(G.player, 0.3, 'player'); G.player.face = -0.6; tap('KeyG'); steps(1.5); settle(); check(G.player.flying, 'picture: flying low near the tall buildings (top view)'); };
  S.flyhighpic = function () { g.start('koda', 0, 'free'); G.banner = null; var tw = districtOf(G.L); g.teleport(tw.x0 - 5, tw.y1 + 3); W.unstick(G.player, 0.3, 'player'); G.player.face = -0.6; tap('KeyG'); steps(0.5); hold('Space', 4); G.toasts.length = 0; settle(); check(alt() > 9, 'picture: flying very high (top view, height ' + alt().toFixed(1) + ')'); };
  S.flyhighbeh = function () { g.start('koda', 0, 'free'); G.banner = null; var tw = districtOf(G.L); g.teleport(tw.x0 - 8, tw.y1 + 6); G.player.face = -0.7; SC.gfx.setView('behind', 0); SC.gfx.viewState.heading = -0.7; tap('KeyG'); steps(0.5); hold('Space', 4); G.toasts.length = 0; settle(); check(alt() > 9, 'picture: flying very high (behind view)'); };
  S.flylowbeh = function () { g.start('koda', 0, 'free'); G.banner = null; var tw = districtOf(G.L); g.teleport(tw.x0 - 8, tw.y1 + 6); G.player.face = -0.7; SC.gfx.setView('behind', 0); SC.gfx.viewState.heading = -0.7; tap('KeyG'); steps(1.5); G.toasts.length = 0; settle(); check(G.player.flying, 'picture: flying low (behind view)'); };

  // ---------- 2. Glide mode ----------
  S.glide = function () {
    g.clearSave();
    // pick it on the mode screen: three modes now
    tap('Enter'); check(SC.menuItems().length === 3 && SC.menuItems()[2].id === 'glide', 'the mode screen offers Adventure, Free Play and Glide');
    tap('ArrowRight'); tap('ArrowRight'); check(G.modeSel === 2, 'arrows pick Glide');
    tap('Enter'); tap('ArrowRight'); tap('ArrowRight'); tap('ArrowRight'); tap('Enter');
    var s = st();
    check(s.screen === 'play' && s.mode === 'glide' && s.hero === 'koda' && s.crests.length === 0, 'Glide mode starts like Adventure (Koda, no powers yet)');
    check(!SC.isFree() && SC.glideMode(), 'Glide is not Free Play');
    G.player.inv = 0; var hp0 = G.player.hp; SC.hurtPlayer(1, G.player.x + 1, G.player.y); check(G.player.hp < hp0, 'heroes can get hurt in Glide mode');
    g.start('koda', 0, 'glide'); clearEnemies(); G.banner = null;
    var a = flatSpot(5); g.teleport(a.x, a.y); steps(0.3); G.player.face = 0;
    // nobody flies: G opens the glider
    tap('KeyG');
    check(G.player.gliding && !G.player.flying, 'G opens the glider (no flying)');
    steps(0.25); check(G.player.flyH > 0.5, 'a little hop up first (' + G.player.flyH.toFixed(2) + ')');
    var e = spawn('grump', G.player.x + 0.5, G.player.y); e.state = 'windup'; e.st = 0.01; G.player.inv = 0; hp0 = G.player.hp; steps(0.1);
    check(G.player.hp === hp0, 'ground attacks cannot hit a glider'); e.alive = false;
    G.player.swordCd = 0; tap('Space'); check(G.player.swingT <= 0, 'no sword while gliding');
    var x0 = G.player.x, y0 = G.player.y;
    g.press('KeyD'); var ok = until(function () { return !G.player.gliding; }, 6); g.release('KeyD');
    var flat = SC.dist(x0, y0, G.player.x, G.player.y);
    check(ok && G.player.flyH === 0 && flat > 3, 'it floats forward and sinks slowly to the ground (' + flat.toFixed(1) + ' tiles from flat ground)');
    tap('KeyG'); check(!G.player.gliding, 'a short wait after landing');
    steps(0.6); tap('KeyG'); check(G.player.gliding, 'then the glider opens again'); g.glide(false); steps(0.6);
    // from a high roof the glide is much longer
    var r = roofSpot(); g.teleport(r.x, r.y); steps(0.3);
    check(W.heightAt(G.player.x, G.player.y) >= 7.9, 'standing on the tall roof');
    G.player.face = Math.PI / 2; x0 = G.player.x; y0 = G.player.y; G.player.glideCd = 0; tap('KeyG');
    var far = 0;
    g.press('KeyS'); ok = until(function () { if (G.player.gliding) far = Math.max(far, SC.dist(x0, y0, G.player.x, G.player.y)); return !G.player.gliding; }, 20); g.release('KeyS');
    check(ok && far > flat * 2.5, 'from the roof the glide goes much further (' + far.toFixed(1) + ' tiles)');
    // walking off a ledge opens the glider by itself
    g.teleport(r.x, r.y); steps(0.6); G.player.glideCd = 0;
    var tw = r.tw, used = G.stats.glides || 0;
    g.press('KeyD'); var auto = until(function () { return G.player.gliding; }, 3); g.release('KeyD');
    check(auto && (G.stats.glides || 0) > used, 'walking off the roof edge opens the glider by itself');
    until(function () { return !G.player.gliding; }, 20); steps(0.3);
    check(!W.blocked(G.player.x, G.player.y, 0.3, 'player') && W.reachable(Math.floor(G.player.x), Math.floor(G.player.y)), 'landed somewhere the hero can walk back from');
    // Adventure: the same roof edge is a wall
    g.start('koda', 0); clearEnemies(); r = roofSpot(); g.teleport(r.x, r.y); steps(0.3);
    g.press('KeyD'); steps(2); g.release('KeyD');
    check(!G.player.gliding && W.heightAt(G.player.x, G.player.y) >= 7.9, 'in Adventure the edge stops you (no glider)');
    G.player.flyCd = 0; tap('KeyG'); check(!G.player.gliding && !G.player.flying, 'in Adventure Koda has no glider and cannot fly');
    // safe landing: a glide that ends over water pops back to the start of the glide
    g.start('koda', 0, 'glide'); clearEnemies(); G.banner = null;
    var L = G.L, spot = null;
    for (var y = 2; y < L.h - 2 && !spot; y++) for (var x = 2; x < L.w - 2; x++) if (W.tile(x, y) === 'w' && W.tile(x + 1, y) === 'w' && !W.blocked(x - 1.5, y + 0.5, 0.3, 'player') && W.reachable(x - 2, y)) { spot = { x: x, y: y }; break; }
    g.teleport(spot.x - 2, spot.y); steps(0.3);
    var sl = G.stats.safeLandings || 0; G.player.glideCd = 0; tap('KeyG'); steps(0.15);
    G.player.x = spot.x + 1.5; G.player.y = spot.y + 0.5; G.player.glideA = 0; G.player.flyH = 0.05; G.player.glideVz = -1;
    until(function () { return !G.player.gliding; }, 6); steps(0.2);
    check((G.stats.safeLandings || 0) > sl && !W.blocked(G.player.x, G.player.y, 0.3, 'player'), 'landing on water pops the hero back to safe ground');
    // Wren with Wind: a stronger glide
    a = flatSpot(5);
    function glideDist(hero) { g.swapHero(hero); g.teleport(a.x - 4, a.y); steps(0.7); G.player.face = 0; G.player.glideCd = 0; var gx = G.player.x, mx = 0; tap('KeyG'); g.press('KeyD'); until(function () { if (G.player.gliding) mx = Math.max(mx, G.player.x - gx); return !G.player.gliding; }, 10); g.release('KeyD'); steps(0.6); return mx; }
    var dK = glideDist('koda'); g.giveCrest('wind'); var dW = glideDist('wren');
    check(dW > dK * 1.5, 'Wren with Wind glides much further (' + dW.toFixed(1) + ' vs ' + dK.toFixed(1) + ' tiles)');
    G.player.glideCd = 0; G.player.flyCd = 0; tap('KeyG'); check(G.player.gliding && !G.player.flying, 'even Wren glides instead of flying in Glide mode'); g.glide(false);
    // Free Play still flies
    g.start('koda', 0, 'free'); tap('KeyG'); check(G.player.flying && !G.player.gliding, 'Free Play still flies with G');
    // the mode is saved
    g.start('mira', 0, 'glide'); SC.save(); G.screen = 'title'; G.menuSel = 0; steps(0.1); tap('ArrowDown'); tap('Enter'); steps(0.3);
    check(st().mode === 'glide' && st().place === 'base', 'Continue remembers Glide mode (at the Home Base)');
    g.clearSave();
  };
  // Glide mode cannot leave a child stuck: every glide landing is a spot you can walk back from
  S.glidesafe = function () {
    var bad = 0, tries = 0, pops = 0;
    [0, 1, 4, 6].forEach(function (li) {
      g.start('pip', li, 'glide'); clearEnemies(); g.god(true); G.banner = null;
      var L = G.L, tw = districtOf(L);
      for (var k = 0; k < 6; k++) {
        g.teleport(tw.roof.tx, tw.roof.ty); steps(0.2);
        var ang = k / 6 * Math.PI * 2; G.player.glideCd = 0; tap('KeyG'); G.player.glideA = ang;
        var s0 = G.stats.safeLandings || 0;
        until(function () { return !G.player.gliding; }, 25);
        steps(0.1); tries++;
        if ((G.stats.safeLandings || 0) > s0) pops++;
        if (!W.reachable(Math.floor(G.player.x), Math.floor(G.player.y)) || W.blocked(G.player.x, G.player.y, 0.3, 'player')) bad++;
      }
    });
    check(bad === 0, 'glides from the roofs in 6 directions on 4 planets always end on ground you can walk back from (' + tries + ' glides, ' + pops + ' popped back)');
  };
  S.glidepic = function () { g.start('rokko', 0, 'glide'); G.banner = null; clearEnemies(); var r = roofSpot(); g.teleport(r.x, r.y); steps(0.3); G.player.face = Math.PI * 0.75; tap('KeyG'); steps(0.8); G.toasts.length = 0; settle(); check(G.player.gliding, 'picture: gliding from the roof with the glider open'); };
  S.glidebeh = function () { g.start('fern', 2, 'glide'); G.banner = null; clearEnemies(); var r = roofSpot(); g.teleport(r.x, r.y); steps(0.3); G.player.face = Math.PI * 0.75; SC.gfx.setView('behind', 0); SC.gfx.viewState.heading = Math.PI * 0.75; tap('KeyG'); steps(0.9); G.toasts.length = 0; settle(); check(G.player.gliding, 'picture: gliding (behind view)'); };

  // ---------- 3. tall buildings ----------
  S.towers = function () {
    for (var li = 0; li < 9; li++) {
      g.start('nate', li); G.banner = null;
      var L = G.L, tw = districtOf(L), tag = L.def.name + ': ';
      var normal = 0; for (var i = 0; i < L.w * L.h; i++) if (!L.towerAt[i]) normal = Math.max(normal, L.hgt[i]);
      var tops = L.towers.map(function (t) { return t.top; });
      check(L.towers.length >= 5 && tw && Math.min.apply(null, tops) >= normal + 3, tag + L.towers.length + ' tall buildings (' + tops.join(',') + ' storeys; normal ground only up to ' + normal + ')');
      var d = SC.dist(L.start.tx, L.start.ty, L.district.x, L.district.y);
      check(d > 45, tag + 'the district is far from the start (' + Math.round(d) + ' tiles)');
      check(L.hgt[tw.roof.ty * L.w + tw.roof.tx] >= normal + 5 && W.tile(tw.chest.tx, tw.chest.ty) === 'T', tag + 'the climbable roof is ' + L.hgt[tw.roof.ty * L.w + tw.roof.tx] + ' high with a treasure chest');
      var path = findPathFrom(tw.roof.tx, tw.roof.ty);
      check(!!path, tag + 'the auto-player can find a way on foot from the start to the roof (' + (path ? path.length : 0) + ' steps)');
      var guards = L.enemies.filter(function (en) { return L.towerAt && SC.dist(en.tx, en.ty, L.district.x, L.district.y) < 10; }).length;
      var traps = L.traps.filter(function (tr) { return SC.dist(tr.tx, tr.ty, L.district.x, L.district.y) < 10; }).length;
      check(guards >= 2 && traps >= 1, tag + guards + ' baddies and ' + traps + ' traps guard the district');
    }
    check(W.parse('base').towers.length === 0 && W.parse(9).towers.length === 0, 'no tall buildings at the Home Base or in the Dragon\'s Volcano');
  };
  // climb a roof on foot with the auto-player and open the treasure
  S.climb = function () {
    [0, 5].forEach(function (li) {
      g.start('nate', li); g.god(true); G.banner = null;
      var L = G.L, tw = districtOf(L);
      g.teleport(L.district.x - 9, L.district.y + 5); steps(0.2);
      clearEnemies();
      var gems0 = G.prog.gems;
      nav.path = null;
      var ok = until(function () { return W.tile(tw.chest.tx, tw.chest.ty) === 'O'; }, 60, function () { var r = navTick(tw.chest.tx, tw.chest.ty, true); if (r === 'arrived') steerTo(tw.chest.tx + 0.5, tw.chest.ty + 0.5); });
      releaseMove(); steps(2);
      check(ok && W.heightAt(G.player.x, G.player.y) >= 7.9, L.def.name + ': walked up the steps to the roof and opened the chest');
      check(G.prog.gems > gems0, L.def.name + ': the roof treasure gives gems (' + gems0 + ' -> ' + G.prog.gems + ')');
    });
  };
  // the hero stays visible next to a building: a building between camera and hero fades
  S.towerfade = function () {
    g.start('nate', 0); g.god(true); clearEnemies(); G.banner = null;
    var L = G.L, tw = L.towers.filter(function (t) { return !t.climb && t.top >= 7; })[0], idx = L.towers.indexOf(tw);
    // stand just north of it: the top-view camera looks from the south, through the building
    var x = Math.floor((tw.x0 + tw.x1) / 2), y = tw.y0 - 1;
    g.teleport(x, y); SC.gfx.setView('top', 0); steps(0.5); settle(); settle();
    var f = SC.gfx.towerFade();
    check(f[idx] < 0.5, 'top view: the building between the camera and the hero fades (' + f.join(',') + ')');
    g.teleport(x, tw.y1 + 2); steps(0.5); settle(); settle(); f = SC.gfx.towerFade();
    check(f[idx] > 0.95, 'with the hero in front of it, it is solid again (' + f[idx] + ')');
    G.player.face = -Math.PI / 2; SC.gfx.setView('behind', 0); SC.gfx.viewState.heading = Math.PI / 2;
    g.teleport(x, tw.y1 + 1); steps(0.3); settle(); settle(); f = SC.gfx.towerFade();
    check(f[idx] < 0.5, 'behind view: it fades too (' + f.join(',') + ')');
    SC.gfx.setView('top', 0);
  };
  // pictures: each planet's district from far away (Behind view, from near the start) and from the roof
  for (var tli = 0; tli < 9; tli++) (function (li) {
    S['tfar' + li] = function () {
      g.start('nate', li); g.god(true); G.banner = null; clearEnemies();
      var L = G.L, d = L.district, s = L.start;
      // a bit along the way from the start toward the district, looking at it
      var a = Math.atan2(d.y - s.ty, d.x - s.tx), px = Math.floor(s.tx + Math.cos(a) * 10), py = Math.floor(s.ty + Math.sin(a) * 10);
      var sp = farSpot({ x: px, y: py }, 0); g.teleport(sp.x, sp.y); G.player.face = a;
      SC.gfx.setView('behind', 0); SC.gfx.viewState.heading = a; steps(0.5); settle();
      check(true, L.def.name + ': the tall buildings on the skyline (behind view, ' + Math.round(SC.dist(sp.x, sp.y, d.x, d.y)) + ' tiles away)');
    };
    S['troof' + li] = function () {
      g.start('nate', li); g.god(true); G.banner = null; clearEnemies();
      var r = roofSpot(); g.teleport(r.x, r.y + 1); G.player.face = Math.PI * 0.8; SC.gfx.setView('top', 0); steps(0.6); settle();
      check(W.heightAt(G.player.x, G.player.y) >= 7.9, G.L.def.name + ': on the roof (top view)');
    };
  })(tli);

  // ---------- 4. two players ----------
  function P(i) { return g.playerRec(i).p; }
  function H(i) { return g.playerRec(i).hero.id; }
  S.twop = function () {
    // choose it on the mode screen
    tap('Enter'); tap('ArrowDown'); check(G.newPlayers === 2, 'the mode screen: down picks 2 players');
    tap('Enter'); check(st().screen === 'select' && G.selStage === 1, 'player 1 picks a hero first');
    tap('Enter'); check(G.selStage === 2, 'then player 2 picks');
    G.selHero = 0; tap('Enter'); check(st().screen === 'select', 'player 2 cannot take player 1\'s hero');
    G.selHero = 4; tap('Enter');
    var s = st();
    check(s.screen === 'play' && s.numPlayers === 2 && s.players[0].hero === 'nate' && s.players[1].hero === 'pip', 'a 2-player game starts at the Home Base: P1 Nate, P2 Pip');
    check(G.banner && G.banner.title === 'Two players!' && G.banner.sub.indexOf('Player 2') >= 0, 'the keys are shown at the start (' + (G.banner && G.banner.sub) + ')');
    // both move at the same time with their own keys
    g.start('nate', 0, 'adventure', 2, 'zen'); g.god(true); clearEnemies(); G.banner = null;
    var a = flatSpot(5); g.teleport(a.x, a.y); P(1).x = a.x + 1.5; P(1).y = a.y + 0.5; steps(0.2);
    var x1 = P(0).x, x2 = P(1).x, y2 = P(1).y;
    g.press('KeyD'); g.press('ArrowUp'); steps(0.5); g.release('KeyD'); g.release('ArrowUp');
    check(P(0).x > x1 + 1 && Math.abs(P(1).x - x2) < 0.2 && P(1).y < y2 - 1, 'WASD moves player 1, the arrows move player 2, at the same time');
    check(H(0) !== H(1), 'two different heroes (' + H(0) + ', ' + H(1) + ')');
    steps(0.6); tap('KeyL'); check(P(1).swingT > 0 && P(0).swingT <= 0, 'L swings player 2\'s sword only');
    steps(0.5); tap('Space'); check(P(0).swingT > 0, 'Space swings player 1\'s sword');
    steps(0.7); tap('Tab'); check(H(0) === 'mira', 'player 1 Tab skips Zen (player 2 has him): ' + H(0));
    steps(0.7); tap('KeyI'); check(H(1) !== 'mira' && H(1) !== 'zen', 'player 2 switches with I and skips player 1\'s hero: ' + H(1));
    var p2h = H(1); steps(0.7); tap('Digit' + (SC.heroIndex(p2h) + 1)); check(H(0) === 'mira', 'player 1 cannot pick player 2\'s hero with a number key');
    // the shared camera keeps both on screen; a soft leash stops them drifting apart
    P(1).x = P(0).x + 9; P(1).y = P(0).y; W.unstick(P(1), 0.3, 'player'); for (var r = 0; r < 80; r++) { g.step(DT); g.render(); }
    var on = [0, 1].every(function (i) { var v = SC.gfx.project(P(i).x, 1, P(i).y, { x: 0, y: 0 }); return v.vis && v.x > 0 && v.x < innerWidth && v.y > 0 && v.y < innerHeight; });
    check(on, 'the camera keeps both heroes on screen (' + SC.dist(P(0).x, P(0).y, P(1).x, P(1).y).toFixed(1) + ' apart)');
    g.press('KeyA'); g.press('ArrowRight'); steps(3); g.release('KeyA'); g.release('ArrowRight');
    check(SC.dist(P(0).x, P(0).y, P(1).x, P(1).y) <= SC.LEASH + 0.3, 'they cannot run apart past the leash (' + SC.dist(P(0).x, P(0).y, P(1).x, P(1).y).toFixed(1) + ')');
    // pickups go to the team, hearts heal whoever takes them
    var gm0 = G.prog.gems; SC.spawnPickup('gem', P(1).x, P(1).y, 3, { still: true }); steps(0.6);
    check(G.prog.gems === gm0 + 3, 'player 2 picks up gems for the team');
    P(1).hp = 1; SC.spawnPickup('heart', P(1).x, P(1).y, 1, { still: true }); steps(0.6);
    check(P(1).hp === 2, 'a heart heals player 2');
    // flying and gliding per player
    g.setMode('free'); tap('KeyJ'); check(P(1).flying && !P(0).flying, 'player 2 flies with J (Free Play), player 1 stays on the ground');
    hold('KeyL', 1); check(P(1).flyH > 3 && P(0).swingT <= 0, 'player 2 goes up with L');
    tap('KeyJ'); steps(3); G.prog.mode = 'glide'; P(1).glideCd = 0; tap('KeyJ'); check(P(1).gliding && !P(0).gliding, 'player 2 glides with J in Glide mode');
    until(function () { return !P(1).gliding; }, 6); G.prog.mode = 'adventure';
    // the trader belongs to whoever opened it
    var tr = G.npcs.filter(function (n) { return n.role === 'smith'; })[0];
    P(1).x = tr.x; P(1).y = tr.y + 1; P(0).x = tr.x + 6; P(0).y = tr.y + 3; steps(0.2);
    tap('Enter'); check(st().screen === 'shop' && G.shop.pi === 1, 'Enter next to the smith opens the shop for player 2');
    var its = SC.shopItems('smith').map(function (i) { return i.label; }).join(' / '), p2pw = SC.powerById(SC.heroById(H(1)).powers[0]).name, p1pw = SC.powerById(SC.heroById(H(0)).powers[0]).name;
    check(its.indexOf(p2pw) >= 0 && its.indexOf(p1pw) < 0, 'the smith works on player 2\'s sword (' + its + ')');
    tap('Escape'); check(st().screen === 'play', 'the shop closes');
  };
  // a crest task counts the kills of either player's hero
  S.twotask = function () {
    g.start('nate', 0, 'adventure', 2, 'mira'); g.god(true); clearEnemies(); G.banner = null;
    var k = crestPick(), need = k.trial.hero;
    if (H(0) === need) g.swapHero('zen');
    SC.useCtx(1); SC.swapHero(need, { force: true, quiet: true }); SC.useCtx(0);
    check(H(1) === need, 'player 2 plays ' + need + ', who owns the crest task');
    var a = flatSpot(3); g.teleport(a.x, a.y); P(1).x = a.x + 0.5; P(1).y = a.y + 0.5; steps(0.1);
    for (var i = 0; i < k.trial.n; i++) {
      var e = spawn('grump', P(1).x + 0.9, P(1).y); e.hp = 0.2; e.atkCd = 99; e.state = 'recover'; e.st = 99;
      P(1).face = 0; P(1).swordCd = 0; P(1).swingT = 0; tap('KeyL'); steps(0.4);
    }
    steps(0.3);
    check(k.trialDone, 'player 2\'s sword wins count for the "' + SC.trialText(k.trial) + '" task (' + SC.trialProgress(k.trial) + ')');
  };
  // knock-outs: the next free hero jumps in; a player with nobody left waits; Oops / extra life only when the whole team rests
  S.twoko = function () {
    g.start('nate', 0, 'adventure', 2, 'zen'); clearEnemies(); G.banner = null;
    var order = [];
    function ko(i) { SC.useCtx(i); G.player.inv = 0; G.player.dashT = 0; SC.hurtPlayer(99, G.player.x + 1, G.player.y); SC.useCtx(0); steps(0.1); }
    for (var k = 0; k < 7; k++) { ko(0); order.push(H(0)); }
    check(order.indexOf('zen') < 0 && st().screen === 'play' && !P(0).dead, 'player 1\'s heroes rest one by one, never taking Zen (' + order.join(',') + ')');
    ko(0);
    check(P(0).dead && P(0).waiting && !P(1).dead && st().screen === 'play', 'with no free hero left, player 1 waits while player 2 plays on');
    steps(2); check(st().screen === 'play', 'no Oops while player 2 still plays');
    // a flag wakes everybody: player 1 comes back
    SC.healTeam(); steps(0.2);
    check(!P(0).dead && !P(0).waiting && SC.dist(P(0).x, P(0).y, P(1).x, P(1).y) < 3, 'a flag wakes the team and player 1 jumps back in next to player 2 (' + H(0) + ')');
    // everyone down with an extra life: both wake up
    g.giveLife(1);
    for (var j = 0; j < 30 && !(G.stats.livesUsed > 0); j++) ko(j % 2);
    check(G.stats.livesUsed === 1 && !P(0).dead && !P(1).dead && st().screen === 'play', 'when the whole team rests an extra life wakes both players');
    for (var m = 0; m < 30 && st().screen === 'play'; m++) { ko(m % 2); steps(0.3); }
    steps(2);
    check(st().screen === 'oops', 'with no lives left, Oops when the whole team rests');
    tap('Enter'); steps(0.2);
    check(st().screen === 'play' && !P(0).dead && !P(1).dead && st().team.every(function (t) { return !t.out; }), 'Try again brings both players back with full hearts');
  };
  // baddies, a mini-boss and traps deal with both heroes; a boss fight with two heroes
  S.twoboss = function () {
    g.start('nate', 0, 'adventure', 2, 'koda'); clearEnemies(); G.banner = null; G.stormT = 1e9;
    var b = G.bossEnt; b.atkCd = 99;
    var sp = spotNear(b, 3); g.teleport(sp.x, sp.y); P(1).x = sp.x + 0.5; P(1).y = sp.y + 1.5; W.unstick(P(1), 0.3, 'player');
    until(function () { return b.aggro; }, 2);
    // a slam circle on player 2 hurts player 2
    P(0).x = b.x + 9; P(0).y = b.y; W.unstick(P(0), 0.3, 'player');
    var hp2 = P(1).hp; P(1).inv = 0;
    SC.bossKit.circle(b, P(1).x, P(1).y, 1.2, 0.2, '#ff3b30', 'rock');
    steps(0.4);
    check(P(1).hp < hp2, 'a boss attack on player 2 hurts player 2 (' + hp2 + ' -> ' + P(1).hp + ')');
    // both fight it (god mode so the test is quick): player 1 by the auto-player, player 2 with L
    g.god(true); g.teleport(Math.floor(b.x) - 2, Math.floor(b.y)); var info = { nopath: 0 }, p2hits = 0;
    var ok = until(function () { return !b.alive; }, 120, function (i) {
      fight(b, info);
      var q = P(1); if (SC.dist(q.x, q.y, b.x, b.y) > 1.6) { g.release('KeyL'); var aa = Math.atan2(b.y - q.y, b.x - q.x); (Math.cos(aa) > 0.3 ? g.press : g.release)('ArrowRight'); (Math.cos(aa) < -0.3 ? g.press : g.release)('ArrowLeft'); (Math.sin(aa) > 0.3 ? g.press : g.release)('ArrowDown'); (Math.sin(aa) < -0.3 ? g.press : g.release)('ArrowUp'); }
      else { ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].forEach(function (c) { g.release(c); }); q.face = Math.atan2(b.y - q.y, b.x - q.x); if (i % 20 === 0) { g.release('KeyL'); g.press('KeyL'); } }
      if (b.lastHeroId === H(1)) p2hits++;
    });
    releaseMove(); ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'KeyL'].forEach(function (c) { g.release(c); });
    check(ok, 'two heroes beat ' + b.def.name + ' together');
    check(p2hits > 0, 'player 2 hit the boss too');
    // a trap hurts player 2
    var L = G.L, tr = L.traps.filter(function (q) { return q.kind === 'spikes'; })[0];
    if (tr) {
      g.god(false); P(1).inv = 0; hp2 = P(1).hp; var hits = G.stats.hits;
      until(function () { P(1).x = tr.tx + 0.5; P(1).y = tr.ty + 0.5; P(1).inv = 0; return G.stats.hits > hits; }, 8);
      check(P(1).hp < hp2, 'spike traps hurt player 2 too');
    }
  };
  // player 2 drops in and out from the pause menu; travelling through a portal takes both
  S.twojoin = function () {
    g.start('nate', 'base'); G.banner = null;
    check(st().numPlayers === 1, 'a 1-player game');
    tap('KeyP'); var items = SC.menuItems().map(function (i) { return i.id; });
    check(items.indexOf('p2in') >= 0, 'the pause menu has "Player 2 joins"');
    G.menuSel = items.indexOf('p2in'); tap('Enter');
    check(st().screen === 'play' && st().numPlayers === 2 && H(1) !== H(0), 'player 2 drops in as ' + H(1));
    steps(0.5);
    // travel through the Verdia portal together
    var po = basePortal('Verdia'); nav.path = null;
    var ok = until(function () { return G.screen !== 'play'; }, 40, function () { var r = navTick(po.tx, po.ty, true); if (r === 'arrived' || SC.dist(G.player.x, G.player.y, po.tx + 0.5, po.ty + 0.5) < 1.6) steerTo(po.tx + 0.5, po.ty + 0.5); if (SC.dist(P(0).x, P(0).y, P(1).x, P(1).y) > 2) { P(1).x = P(0).x - 0.6; P(1).y = P(0).y + 0.6; } });
    releaseMove();
    check(ok && (st().screen === 'travel' || st().screen === 'picker'), 'player 1 walks into the Verdia portal');
    if (st().screen === 'picker') tap('Enter');
    skipTrip(); steps(0.3);
    check(st().screen === 'play' && st().levelIndex === 0 && st().numPlayers === 2 && SC.dist(P(0).x, P(0).y, P(1).x, P(1).y) < 3, 'both arrive in Sunny Meadow together');
    tap('KeyP'); items = SC.menuItems().map(function (i) { return i.id; });
    G.menuSel = items.indexOf('p2out'); tap('Enter');
    check(st().numPlayers === 1 && st().screen === 'play', 'player 2 leaves from the pause menu');
    tap('ArrowLeft'); steps(0.3);
    check(true, 'after that the arrow keys move player 1 again');
    var x0 = G.player.x; g.press('ArrowRight'); steps(0.4); g.release('ArrowRight');
    check(G.player.x > x0 + 0.5 || W.blocked(G.player.x + 0.4, G.player.y, 0.3, 'player'), 'in 1-player mode the arrows move player 1 as before');
    SC.save(); var sv = SC.store.get('save4'); check(sv && sv.players === 1, 'the player count is saved');
    g.setPlayers(2); SC.save(); G.screen = 'title'; G.menuSel = 0; steps(0.1); tap('ArrowDown'); tap('Enter'); steps(0.3);
    check(st().numPlayers === 2 && st().place === 'base', 'Continue brings back the 2-player game at the Home Base');
    g.clearSave();
  };
  // 1-player mode is unchanged: the new player-2 keys do nothing, the old keys still work
  S.solo = function () {
    g.start('nate', 0); g.god(true); clearEnemies(); G.banner = null;
    var a = flatSpot(4); g.teleport(a.x, a.y); steps(0.2);
    check(st().numPlayers === 1 && !g.playerRec(1), 'one player');
    tap('KeyL'); tap('KeyO'); tap('Semicolon'); tap('KeyI'); steps(0.2);
    check(st().hero === 'nate' && G.player.swingT <= 0, 'player-2 keys do nothing with one player');
    tap('KeyJ'); check(G.player.swingT > 0, 'J still swings the sword');
    steps(0.6); tap('KeyT'); check(st().hero === 'zen', 'T still switches heroes');
    steps(0.7); tap('Numpad3'); check(st().hero === 'mira', 'the number pad still picks heroes');
  };
  // the auto-player finishes a place in Glide mode, and with two players (player 2 walks after player 1 with the arrows)
  S.glidelevel = function () {
    g.start('nate', 0, 'glide'); g.god(true);
    var r = playLevel(420);
    check(r.ok && st().mode === 'glide', 'Glide mode: the auto-player finished Sunny Meadow in ' + Math.round(r.sec) + ' s (glides ' + (G.stats.glides || 0) + ')');
  };
  S.twolevel = function () {
    g.start('nate', 1, 'adventure', 2, 'rokko'); g.god(true);
    var follow = function () {
      var q = P(1), p = P(0), d = SC.dist(q.x, q.y, p.x, p.y);
      ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].forEach(function (c) { g.release(c); });
      if (d > 7) { q.x = p.x - 0.7; q.y = p.y + 0.4; W.unstick(q, q.r, 'player'); }   // a real player 2 would walk over
      else if (d > 2.5) { (p.x > q.x + 0.3 ? g.press : g.release)('ArrowRight'); (p.x < q.x - 0.3 ? g.press : g.release)('ArrowLeft'); (p.y > q.y + 0.3 ? g.press : g.release)('ArrowDown'); (p.y < q.y - 0.3 ? g.press : g.release)('ArrowUp'); }
    };
    var r = playLevel(420, follow);
    check(r.ok, 'two players: the auto-player finished Rainy Isles with player 2 along (' + Math.round(r.sec) + ' s)');
    check(st().numPlayers === 2, 'still two players at the end');
  };
  S.twopic = function () {
    g.start('nate', 0, 'adventure', 2, 'pip'); G.banner = null;
    var a = flatSpot(4); g.teleport(a.x, a.y); P(1).x = a.x + 3.5; P(1).y = a.y + 1.5; W.unstick(P(1), 0.3, 'player');
    G.player.hp = 3; P(1).hp = 4; g.giveCrest('fire'); g.giveCrest('surface'); G.prog.gems = 21;
    spawn('grump', a.x + 2, a.y - 3).aggro = false;
    steps(1.2); settle();
    check(st().numPlayers === 2, 'picture: two players with both HUDs');
  };
  S.twobeh = function () {
    g.start('nate', 0, 'adventure', 2, 'pip'); G.banner = null;
    var a = flatSpot(4); g.teleport(a.x, a.y); P(1).x = a.x - 6; P(1).y = a.y; W.unstick(P(1), 0.3, 'player');
    SC.gfx.setView('behind', 0); SC.gfx.viewState.heading = 0; G.player.face = 0; steps(1); settle();
    check(GX0().getView() === 'behind', 'picture: behind view follows player 1, an arrow points to player 2');
  };
  function GX0() { return SC.gfx; }
  S.twomodepic = function () { tap('Enter'); tap('ArrowRight'); tap('ArrowRight'); tap('ArrowDown'); steps(0.3); check(st().screen === 'mode' && G.newPlayers === 2, 'picture: the mode screen with three modes and 2 players'); };
  S.twoselpic = function () { tap('Enter'); tap('ArrowDown'); tap('Enter'); tap('ArrowRight'); tap('Enter'); steps(0.3); check(G.selStage === 2, 'picture: player 2 picks a hero'); };
  S.twopause = function () { g.start('nate', 0, 'adventure', 2, 'zen'); steps(0.3); tap('KeyP'); check(st().screen === 'pause', 'picture: pause with both players\' keys'); };
  // ---------- temple helpers and pictures ----------
  var POWERS9 = ['fire', 'lightning', 'water', 'ice', 'surface', 'earth', 'wind', 'life', 'death'];
  function levelOf(pw) { for (var i = 0; i < SC.LEVELS.length; i++) if (SC.LEVELS[i].crests.indexOf(pw) >= 0) return i; return 0; }
  function templeStart(pw, mode) { g.start('nate', levelOf(pw), mode); G.banner = null; return SC.templeOf(pw); }
  function tspot(t, u, v) { return { x: t.ex + t.a[0] * u + t.f[0] * v, y: t.ey + t.a[1] * u + t.f[1] * v }; }
  function yawFor(t) { var yaw = Math.atan2(-t.f[0], -t.f[1]); return ((Math.round(-yaw / (Math.PI / 2)) % 4) + 4) % 4; }
  function trapSpot(tr) {
    var d = DV4[tr.dir || 0];
    if (tr.kind === 'darts' || tr.kind === 'roller') return { x: tr.tx + d[0] * 3, y: tr.ty + d[1] * 3 };
    if (tr.kind === 'rod') { for (var i = 0; i < 4; i++) { var x = tr.tx + DV4[i][0], y = tr.ty + DV4[i][1]; if (!W.blocked(x + 0.5, y + 0.5, 0.3, 'player')) return { x: x, y: y }; } }
    return { x: tr.tx, y: tr.ty };
  }
  function settle() { for (var i = 0; i < 40; i++) g.render(); }   // let the camera, fading walls and signs catch up before the picture
  function lookInto(t, behind) {
    face(Math.atan2(t.f[1], t.f[0]));
    if (behind) { SC.gfx.setView('behind', 0); SC.gfx.viewState.heading = G.player.face; }
    else SC.gfx.setView('top', yawFor(t));
  }
  POWERS9.forEach(function (pw) {
    // outside, door shut (top view looking into the temple)
    S['tout_' + pw] = function () { var t = templeStart(pw); g.god(true); clearEnemies(); var s = tspot(t, 0, -4); g.teleport(s.x, s.y); lookInto(t); steps(1.5); settle(); check(!t.open, t.name + ' from outside, door shut'); };
    // outside in the Behind view
    S['tbeh_' + pw] = function () { var t = templeStart(pw); g.god(true); clearEnemies(); var s = tspot(t, 0, -4); g.teleport(s.x, s.y); lookInto(t, true); steps(1.5); settle(); check(SC.gfx.getView() === 'behind', t.name + ' in the Behind view'); };
    // just opened: the door sinking
    S['topen_' + pw] = function () { var t = templeStart(pw); g.god(true); clearEnemies(); var s = tspot(t, 0, -2); g.teleport(s.x, s.y); lookInto(t); steps(1); g.finishTrial(pw); steps(0.7); settle(); check(t.open, t.name + ' opening'); };
    // inside the trap hall (traps going), guardian asleep at the back
    S['tin_' + pw] = function () { var t = templeStart(pw); g.god(true); clearEnemies(); g.openTemple(pw); G.banner = null; var s = tspot(t, 0, 4); g.teleport(s.x, s.y); lookInto(t); steps(2.6); settle(); var lw = SC.gfx.level().lowered, lk = Object.keys(lw); check(lk.length > 0, 'walls between camera and hero squash down (' + lk.length + ' tiles: ' + lk.slice(0, 6).map(function (k) { return k + '=' + lw[k].toFixed(2); }).join(' ') + ' hero ' + Math.floor(G.player.x) + ',' + Math.floor(G.player.y) + ' cam ' + SC.gfx.camera.position.x.toFixed(1) + ',' + SC.gfx.camera.position.z.toFixed(1) + ')'); check(t.ent && !t.ent.aggro, t.name + ' trap hall, guardian asleep'); };
    // the guardian awake and attacking
    S['tguard_' + pw] = function () {
      var t = templeStart(pw); g.god(true); clearEnemies(); g.openTemple(pw); G.banner = null;
      var s = tspot(t, 0, 10); g.teleport(s.x, s.y); lookInto(t);
      until(function () { return t.ent.aggro && t.ent.state !== 'wake' && G.warns.some(function (w) { return w.owner === t.ent; }) && G.warns[0].t > 0.4; }, 8);
      G.banner = null; settle();
      check(t.ent.aggro, t.ent.def.name + ' awake and attacking (' + t.ent.state + ')');
    };
  });
  // ---------- the ten places ----------
  var PLACES = [
    { name: 'Sunny Meadow', planet: 'Verdia', crest: 'fire', boss: 'chief' },
    { name: 'Rainy Isles', planet: 'Aquaria', crest: 'water', boss: 'drizzle' },
    { name: 'Thunder Plains', planet: 'Voltara', crest: 'lightning', boss: 'sparkhorn' },
    { name: 'Frosty Peaks', planet: 'Glacira', crest: 'ice', boss: 'brr' },
    { name: 'Bubble Lagoon', planet: 'Bubblon', crest: 'surface', boss: 'captain' },
    { name: 'Stone Canyon', planet: 'Terrok', crest: 'earth', boss: 'boulderback' },
    { name: 'Storm Cliffs', planet: 'Zephyra', crest: 'wind', boss: 'zap' },
    { name: 'Bloom Jungle', planet: 'Floria', crest: 'life', boss: 'snapjaw' },
    { name: 'Shadow Woods', planet: 'Umbra', crest: 'death', boss: 'gloomo' }
  ];
  function levelByName(nm) { for (var i = 0; i < SC.LEVELS.length; i++) if (SC.LEVELS[i].name === nm) return i; return 0; }
  PLACES.forEach(function (P, i) {
    S['lvl' + (i + 1)] = function () {
      g.start('nate', i); steps(1.2);
      var s = st(), L = G.L, camps = {}, outside = L.traps.filter(function (q) { return !W.templeAt(q.tx + 0.5, q.ty + 0.5, 0); });
      Object.keys(L.def.camps || {}).forEach(function (k) { camps[L.def.camps[k]] = 1; });
      check(s.levelName === P.name && s.planet === P.planet, 'level ' + (i + 1) + ' is ' + s.levelName + ' on planet ' + s.planet + ' (' + L.w + ' x ' + L.h + ')');
      check(L.temples.length === 1 && L.temples[0].power === P.crest && L.def.crests.join() === P.crest, 'exactly one temple: the ' + (L.temples[0] && L.temples[0].name));
      check(L.boss && L.boss.type === P.boss && G.bossEnt && G.bossEnt.alive, 'mini-boss: ' + (G.bossEnt && G.bossEnt.def.name));
      check(L.blocks.length === 4 && L.portalNeed === 5, '4 portal blocks on the map + 1 from the mini-boss');
      check(L.checkpoints.length === 2 && s.npcs === 2, 'two checkpoints, a trader and a smith');
      check(L.chests.filter(function (c) { return c.content === 'life'; }).length === 1, 'one extra-life chest (chests: ' + L.chests.map(function (c) { return c.content; }).join(', ') + ')');
      check(Object.keys(camps).length >= 2 && outside.length >= 3, Object.keys(camps).length + ' camps, ' + outside.length + ' traps outside the temple, ' + L.enemies.length + ' baddies');
      var hi = 0; for (var q = 0; q < L.w * L.h; q++) hi = Math.max(hi, L.hgt[q]);
      var nst = 0; for (var z = 0; z < L.stair.length; z++) if (L.stair[z] >= 0) nst++;
      check(hi >= 1 && nst >= 2, 'heights up to ' + hi + ', ' + nst + ' step tiles');
    };
  });
  // the whole set: order, difficulty and treasure spread
  S.places = function () {
    var tiers = SC.LEVELS.map(function (d) { return d.tier; });
    check(tiers.join() === '0,1,2,3,4,5,6,7,8,9', 'each place is one step harder than the last (tiers ' + tiers.join(',') + ')');
    var bh = SC.LEVELS.slice(0, 9).map(function (d) { return SC.ENEMIES[d.boss].hp; });
    check(bh.every(function (h, i) { return i === 0 || h > bh[i - 1]; }), 'mini-boss health grows planet by planet (' + bh.join(' ') + ')');
    var gh = PLACES.map(function (P) { return SC.ENEMIES[SC.GUARDIAN_OF[P.crest]].hp; });
    check(gh.every(function (h, i) { return i === 0 || h > gh[i - 1]; }), 'guardian health grows planet by planet (' + gh.join(' ') + ')');
    var gd = PLACES.map(function (P) { return SC.ENEMIES[SC.GUARDIAN_OF[P.crest]].dmg; });
    check(gd.slice(0, 4).every(function (d) { return d <= 0.5; }), 'guardians of planets 1 to 4 only do half a heart (' + gd.join(' ') + ')');
    g.start('nate', 0); var e0 = SC.makeEnemy('grump', 5, 5); g.start('nate', 8); var e8 = SC.makeEnemy('grump', 5, 5);
    check(e8.maxHp > e0.maxHp * 1.6 && e8.maxHp < e0.maxHp * 2, 'baddies get tougher: a Grumpling has ' + e0.maxHp.toFixed(1) + ' hp on planet 1, ' + e8.maxHp.toFixed(1) + ' on planet 9');
    var where = {};
    SC.LEVELS.forEach(function (d, i) { var L = W.parse(i); L.chests.forEach(function (c) { (where[c.content] = where[c.content] || []).push(i + 1); }); });
    check(where.iron && where.iron.join() === '3' && where.crystal && where.crystal.join() === '7', 'sword chests: Iron Blade on planet ' + where.iron + ', Crystal Blade on planet ' + where.crystal);
    check(where.heartUp && where.heartUp.length >= 2 && where.life.length === 10, 'heart containers on planets ' + where.heartUp + '; an extra life in every place (' + where.life + ')');
    var sizes = SC.LEVELS.map(function (d, i) { var L = W.parse(i); return d.name + ' ' + L.w + 'x' + L.h; });
    log('  sizes: ' + sizes.join(', '));
  };
  // a free spot about r tiles from the boss, in its sight
  function spotNear(e, r) {
    for (var rr = r; rr < r + 4; rr += 0.5) for (var k = 0; k < 16; k++) {
      var a = k / 16 * Math.PI * 2 + Math.PI / 2, x = Math.floor(e.x + Math.cos(a) * rr), y = Math.floor(e.y + Math.sin(a) * rr);
      if (free(x + 0.5, y + 0.5, 0.4) && W.lineClear(e.x, e.y, x + 0.5, y + 0.5)) return { x: x, y: y };
    }
    return { x: Math.floor(e.x), y: Math.floor(e.y) + r };
  }
  // the four new mini-bosses: wake up, warn before every hit, use their different attacks, and can be beaten
  S.minibosses = function () {
    ['drizzle', 'sparkhorn', 'boulderback', 'snapjaw'].forEach(function (type) {
      var li = 0; SC.LEVELS.forEach(function (d, i) { if (d.boss === type) li = i; });
      g.start('koda', li); clearEnemies(); G.banner = null; G.stormT = 1e9;
      var e = G.bossEnt, tag = e.def.name + ' (' + SC.LEVELS[li].name + '): ';
      check(!e.aggro, tag + 'asleep at first');
      var sp = spotNear(e, 4); g.teleport(sp.x, sp.y);
      var woke = until(function () { return e.aggro; }, 2);
      check(woke && st().boss && st().boss.name === e.def.name, tag + 'wakes up when the hero comes close, the health bar shows');
      g.god(false); G.player.hp = SC.maxHp();
      var warned = false, hitOk = true, hits0 = G.stats.hits, kinds = {}, firstHit = false;
      for (var i = 0; i < Math.round(20 / DT); i++) {
        if (G.warns.some(function (w) { return w.owner === e; })) warned = true;
        if (G.stats.hits > hits0 && !firstHit) { firstHit = true; if (!warned) hitOk = false; }
        if (e.state === 'windup' && e.atk) kinds[e.atk] = 1;
        G.player.inv = Math.min(G.player.inv, 0.3); if (G.player.hp < 2) G.player.hp = SC.maxHp();
        if (SC.dist(G.player.x, G.player.y, e.x, e.y) > 7) { G.player.x = sp.x + 0.5; G.player.y = sp.y + 0.5; }
        g.step(DT);
      }
      var nk = Object.keys(kinds).length, gsz = e.def.size || e.def.r * 3;
      check(e.aggro && warned, tag + 'shows warnings on the ground');
      check(firstHit && hitOk, tag + 'its first hit came after a warning');
      check(nk >= 3, tag + nk + ' different attacks (' + Object.keys(kinds).join(', ') + ')');
      check(gsz > 1.7 && gsz < 3.2, tag + 'mini-boss size ' + gsz.toFixed(2) + ', weak to ' + e.def.weak.join(' and '));
      g.god(true); var info = { nopath: 0 };
      var ok = until(function () { return !e.alive; }, 150, function () { fight(e, info); });
      releaseMove(); steps(0.3);
      check(ok && G.pickups.some(function (k) { return k.kind === 'block'; }), tag + 'beaten by the auto-player in ' + Math.round(G.levelT) + ' s, it dropped the last block');
    });
  };
  // pictures: each new place in the Top view and the Behind view, and each new mini-boss
  [['isles', 'Rainy Isles'], ['plains', 'Thunder Plains'], ['canyon', 'Stone Canyon'], ['jungle', 'Bloom Jungle']].forEach(function (pc) {
    function look(behind) {
      var li = levelByName(pc[1]); g.start('nate', li); g.god(true); G.banner = null;
      var t = G.L.temples[0], s = tspot(t, 0, -4);
      g.teleport(s.x, s.y); face(Math.atan2(t.f[1], t.f[0]));
      if (behind) { SC.gfx.setView('behind', 0); SC.gfx.viewState.heading = G.player.face; } else SC.gfx.setView('top', 0);
      steps(1.5); settle();
      check(st().levelName === pc[1], pc[1] + (behind ? ' (Behind view)' : ' (Top view)') + ' picture');
    }
    S['pic_' + pc[0]] = function () { look(false); };
    S['beh_' + pc[0]] = function () { look(true); };
    S['start_' + pc[0]] = function () { var li = levelByName(pc[1]); g.start('nate', li); G.banner = null; steps(1.5); settle(); check(true, pc[1] + ' start picture'); };
  });
  ['drizzle', 'sparkhorn', 'boulderback', 'snapjaw'].forEach(function (type) {
    S['boss_' + type] = function () {
      var li = 0; SC.LEVELS.forEach(function (d, i) { if (d.boss === type) li = i; });
      g.start('nate', li); g.god(true); clearEnemies(); G.banner = null; G.stormT = 1e9;
      var e = G.bossEnt, sp = spotNear(e, 4); g.teleport(sp.x, sp.y);
      until(function () { return e.aggro && e.state === 'windup' && G.warns.some(function (w) { return w.owner === e && w.t > 0.35; }); }, 10);
      G.banner = null; settle();
      check(e.aggro, e.def.name + ' attacking picture (' + e.state + ' ' + e.atk + ')');
    };
  });
  function findPathFrom(x, y) { var p = G.player, ox = p.x, oy = p.y; p.x = G.L.start.tx + 0.5; p.y = G.L.start.ty + 0.5; var r = findPath(x, y, false); p.x = ox; p.y = oy; return r; }
  function adjacentFree(tx, ty) {
    var c = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (var i = 0; i < c.length; i++) { var x = tx + c[i][0], y = ty + c[i][1]; if (free(x + 0.5, y + 0.5) && findPathFrom(x, y)) return { x: x, y: y }; }
    return { x: tx, y: ty + 1 };
  }
  // ---------- Home Base helpers ----------
  function skipTrip() { steps(0.5); tap('Space'); steps(0.2); }
  function basePortal(pl) { return (G.L.portals || []).filter(function (po) { return po.planet === pl; })[0]; }
  // walk (path finding) up to a planet portal and into it, until a picker or the star map shows
  function walkIntoPortal(pl, maxSec) {
    var po = basePortal(pl); if (!po) return false;
    nav.path = null;
    var ok = until(function () { return G.screen !== 'play'; }, maxSec, function () {
      var r = navTick(po.tx, po.ty, true);
      if (r === 'arrived' || SC.dist(G.player.x, G.player.y, po.tx + 0.5, po.ty + 0.5) < 1.6) steerTo(po.tx + 0.5, po.ty + 0.5);
    });
    releaseMove();
    return ok;
  }
  // finish the current level fast: free and pick up its crests, get its blocks, walk into the exit portal
  function finishQuick() {
    G.pickups.filter(function (q) { return q.kind === 'crest'; }).forEach(function (q) { g.earnCrest(q.power); g.teleport(Math.floor(q.x), Math.floor(q.y)); steps(1.8); });
    g.giveBlocks(); steps(0.2);
    var gt = G.L.gate, nb = adjacentFree(gt.tx, gt.ty); g.teleport(nb.x, nb.y);
    until(function () { return G.screen === 'levelDone'; }, 5, function () { if (G.L.gateOpen) steerTo(gt.tx + 0.5, gt.ty + 0.5); });
    releaseMove();
  }
  // the auto-player at the Home Base: fit carried blocks into the next locked portal, then jump into the planet to play
  function planetToPlay() {
    for (var i = 0; i < SC.PLANET_ORDER.length; i++) {
      var pl = SC.PLANET_ORDER[i];
      if (!SC.portalInfo(pl).open) return null;
      if (SC.planetLevels(pl).some(function (li) { return !SC.isDone(li); })) return pl;
    }
    return null;
  }
  function playBase(maxSec) {
    nav.path = null;
    var n = Math.round(maxSec / DT);
    for (var i = 0; i < n; i++) {
      if (G.screen === 'travel') { releaseMove(); return true; }
      if (G.screen === 'picker') {
        var its = G.picker.items, pick = 0;
        for (var k = 0; k < its.length; k++) if (its[k].ok && !its[k].done && its[k].level !== undefined) { pick = k; break; }
        G.menuSel = pick; tap('Enter'); continue;
      }
      if (G.screen !== 'play') { g.step(DT); continue; }
      var nx = SC.nextLockedPortal(), po;
      if (nx && G.prog.carried > 0) {
        po = basePortal(nx.planet);
        if (navTick(po.tx, po.ty, true) === 'arrived') releaseMove();
      } else {
        var pl = planetToPlay(); if (!pl) { g.step(DT); continue; }
        po = basePortal(pl);
        var r = navTick(po.tx, po.ty, true);
        if (r === 'arrived' || SC.dist(G.player.x, G.player.y, po.tx + 0.5, po.ty + 0.5) < 1.6) steerTo(po.tx + 0.5, po.ty + 0.5);
      }
      g.step(DT);
    }
    releaseMove();
    return false;
  }
  function farSpot(a, d) {
    var L = G.L;
    for (var r = d; r < d + 20; r++) for (var k = 0; k < 24; k++) {
      var x = Math.floor(a.x + Math.cos(k / 24 * 6.283) * r), y = Math.floor(a.y + Math.sin(k / 24 * 6.283) * r);
      if (x > 0 && y > 0 && x < L.w && y < L.h && free(x + 0.5, y + 0.5)) return { x: x, y: y };
    }
    return { x: L.start.tx, y: L.start.ty };
  }

  function run() {
    log('TEST ' + name);
    if (!S[name]) { check(false, 'unknown test ' + name); finish(); return; }
    try { S[name](); } catch (e) { check(false, 'exception: ' + e.message + ' ' + String(e.stack).split('\n')[1]); }
    finish();
  }
  setTimeout(run, 400);
})();
