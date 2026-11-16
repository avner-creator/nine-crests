// Nine Crests - the game flow: screens, modes, starting levels, crest trials, portal blocks, friendly people (trader + smith),
// travelling between planets, saving, the main loop, and the window.__game test hooks.
(function () {
  'use strict';
  var SC = window.SC, W = SC.world, I = SC.input;

  var G = SC.G = {
    screen: 'title', realT: 0, simT: 0, menuSel: 0, selHero: 0, modeSel: 0, newMode: 'adventure', newPlayers: 1, selStage: 1, p1Pick: null, prog: null, hero: SC.HEROES[0], L: null, player: null, players: null, pi: 0,
    enemies: [], projs: [], eprojs: [], pickups: [], effects: [], warns: [], hazards: [], texts: [], toasts: [], flags: [], npcs: [], team: null,
    banner: null, boss: null, bossEnt: null, powerIdx: 0, slotBy: {}, swingCounter: 0, nextId: 0, freezeT: 0, hitstop: 0, god: false,
    stats: null, hintT: 0, gateHintT: 0, energyHintT: 0, dragonDeadT: 0, flash: null, lv: null, fitT: 0, travel: null, shop: null, nearNpc: null
  };

  // save version 4: nine planets with one place each. Older saves (save3 and before) are ignored.
  var SAVE_KEY = 'save4', SAVE_V = 4;
  function newStats() { return { time: 0, gems: 0, beaten: 0, deaths: 0, hits: 0, chests: 0, powers: {} }; }
  function newLv() { return { beat: 0, beatAs: {}, gems: 0, chests: 0, flags: 0 }; }
  // done: finished level indexes; carried: portal blocks the team carries home; fitted: {planet: blocks fitted into its portal at the base}
  SC.newProgress = function (heroId, mode) {
    var h = SC.heroById(heroId);
    var pr = { v: SAVE_V, mode: mode === 'free' || mode === 'glide' ? mode : 'adventure', players: 1, p2Hero: null, heroId: h.id, levelIndex: 0, powers: {}, crests: [], gems: 0, swordLevel: 0,
      bonusHearts: 0, gemHearts: 0, energyBonus: 0, lives: 0, shop: {}, swordCrest: {}, hearts: null, time: 0, done: [], carried: 0, fitted: {}, place: 'base' };
    SC.HEROES.forEach(function (hh) { pr.swordCrest[hh.id] = null; });
    SC.POWERS.forEach(function (pw) { pr.powers[pw.id] = { owned: false, level: 1, xp: 0 }; });
    if (pr.mode === 'free') SC.POWERS.forEach(function (pw) { pr.powers[pw.id] = { owned: true, level: 3, xp: SC.EVOLVE_AT[2] }; });
    pr.crests = SC.POWERS.filter(function (pw) { return pr.powers[pw.id].owned; }).map(function (pw) { return pw.id; });
    return pr;
  };
  function teamHearts() {
    var out = {};
    if (!G.team) return null;
    SC.storeActive();
    G.team.forEach(function (m) { out[m.id] = m.out ? 0 : m.hp; });
    return out;
  }
  SC.save = function () { if (!G.prog) return; G.prog.hearts = teamHearts() || G.prog.hearts; SC.store.set(SAVE_KEY, G.prog); };
  // save in the middle of a level (powers, gems, hearts); Continue starts this level again from its beginning
  SC.saveMid = function () { if (G.prog && G.L && G.screen === 'play' && !SC.testNoSave) SC.save(); };
  SC.loadSave = function () {
    var s = SC.store.get(SAVE_KEY);
    if (!s || s.v !== SAVE_V || !s.heroId || !s.powers) return null;
    // fill in anything missing
    s.mode = s.mode === 'free' || s.mode === 'glide' ? s.mode : 'adventure';
    s.players = s.players === 2 ? 2 : 1; s.p2Hero = s.p2Hero && SC.heroById(s.p2Hero) && s.p2Hero !== s.heroId ? s.p2Hero : null;
    s.levelIndex = typeof s.levelIndex === 'number' ? s.levelIndex : 0;
    s.done = (s.done || []).filter(function (i) { return typeof i === 'number' && i >= 0 && i < SC.LEVELS.length; });
    s.carried = Math.max(0, s.carried || 0); s.fitted = s.fitted || {}; s.place = 'base';
    s.shop = s.shop || {}; s.swordCrest = s.swordCrest || {}; s.energyBonus = s.energyBonus || 0; s.lives = s.lives || 0; s.bonusHearts = s.bonusHearts || 0; s.gemHearts = s.gemHearts || 0;
    SC.POWERS.forEach(function (pw) { if (!s.powers[pw.id]) s.powers[pw.id] = { owned: false, level: 1, xp: 0 }; });
    SC.HEROES.forEach(function (h) { if (s.swordCrest[h.id] === undefined) s.swordCrest[h.id] = null; });
    s.crests = SC.POWERS.filter(function (pw) { return s.powers[pw.id].owned; }).map(function (pw) { return pw.id; });
    return s;
  };
  // every crest of this level picked up?
  SC.allCrestsOwned = function () {
    var L = G.L; if (!L) return false;
    for (var j = 0; j < G.pickups.length; j++) if (G.pickups[j].kind === 'crest') return false;
    for (var i = 0; i < L.def.crests.length; i++) if (!SC.hasPower(L.def.crests[i])) return false;
    return true;
  };

  function clearLists() {
    G.enemies = []; G.projs = []; G.eprojs = []; G.pickups = []; G.effects = []; G.warns = []; G.hazards = []; G.npcs = [];
    G.texts = []; G.toasts = []; G.flags = []; G.banner = null; G.boss = null; G.bossEnt = null; G.dragonDeadT = 0;
    G.freezeT = 0; G.hitstop = 0; G.flash = null; G.gateAnim = 0; G.fitT = 0; G.shop = null; G.nearNpc = null;
  }

  // ---------------- crest trials ----------------
  function resolveTrial(power, L) {
    var t = SC.TRIALS[power] || { type: 'beat', n: 5 };
    // a chest / flag task only works if one can be reached with the powers the team has now
    if ((t.type === 'chest' || t.type === 'flag') && t.alt) {
      var reach = {};
      if (L.start) reachTiles(L).forEach(function (r) { reach[r.tx + ',' + r.ty] = 1; });
      var near = function (o) { for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if (reach[(o.tx + dx) + ',' + (o.ty + dy)]) return true; return false; };
      var list = t.type === 'chest' ? (L.chests || []) : (L.checkpoints || []);
      if (!list.some(near)) t = t.alt;
    }
    var o = {}; for (var k in t) if (k !== 'alt') o[k] = t[k];
    return o;
  }
  SC.trialProgress = function (tr) {
    var lv = G.lv || newLv(), cur = 0;
    if (tr.type === 'beatAs') cur = lv.beatAs[tr.hero] || 0;
    else if (tr.type === 'beat') cur = lv.beat;
    else if (tr.type === 'gems') cur = lv.gems;
    else if (tr.type === 'chest') cur = lv.chests;
    else if (tr.type === 'flag') cur = lv.flags;
    return Math.min(cur, tr.n);
  };
  SC.trialText = function (tr, withProgress) {
    var s;
    if (tr.type === 'beatAs') s = 'Beat ' + tr.n + ' baddies as ' + SC.heroById(tr.hero).name;
    else if (tr.type === 'beat') s = 'Beat ' + tr.n + ' baddies here';
    else if (tr.type === 'gems') s = 'Collect ' + tr.n + ' gems here';
    else if (tr.type === 'chest') s = 'Open a treasure chest';
    else s = 'Touch a checkpoint flag';
    if (withProgress && tr.n > 1) s += ' (' + SC.trialProgress(tr) + '/' + tr.n + ')';
    return s;
  };
  function unseal(k, quiet) {
    if (!k.sealed) return;
    k.sealed = false;
    var pw = SC.powerById(k.power), owner = SC.heroById(pw.owner);
    G.stats.unsealed = (G.stats.unsealed || 0) + 1;
    if (!quiet) {
      SC.banner('The ' + pw.name + ' Crest is free!', 'Pick it up for ' + owner.name + '!', k.power, 3);
      SC.audio.play('unseal');
    }
    SC.fx.burst(k.x, 1, k.y, 'star', 20);
    SC.fx.ring(k.x, k.y, pw.hex, 2.5);
  }
  SC.unsealCrest = unseal;
  SC.trialDone = function (k) { return !!(k.trialDone || SC.trialProgress(k.trial) >= k.trial.n); };
  function updTrials(dt) {
    var p = G.player;
    var sealed = G.pickups.filter(function (k) { return k.kind === 'crest' && k.sealed; });
    sealed.forEach(function (k) {
      if (!SC.trialDone(k)) return;
      k.trialDone = true;
      // a crest in a temple: the task opens the temple door; beating the guardian frees the crest
      if (k.temple) {
        if (!k.temple.open) SC.openTemple(k.temple);
        else if (!SC.templeGuardianAlive(k.temple)) unseal(k);   // never stuck, even if the guardian is gone
        return;
      }
      unseal(k);
    });
    sealed = sealed.filter(function (k) { return !k.trialDone; });
    // never get stuck: if there are not enough baddies (or gems) left for a task, a few more show up near the crest
    G.trialCheckT = (G.trialCheckT || 0) - dt;
    if (G.trialCheckT > 0 || SC.isFree()) return;
    G.trialCheckT = 2;
    var alive = 0, gemsLying = 0;
    G.enemies.forEach(function (e) { if (e.alive && !e.isBoss && !e.summoned) alive++; });
    G.pickups.forEach(function (k) { if (k.kind === 'gem') gemsLying += k.val; });
    var need = 0, beatMax = 0, where = null;
    sealed.forEach(function (k) {
      var tr = k.trial, rem = tr.n - SC.trialProgress(tr);
      if (rem <= 0) return;
      if (tr.type === 'beatAs') { need += rem; where = where || k; }
      else if (tr.type === 'beat') { beatMax = Math.max(beatMax, rem); where = where || k; }
      else if (tr.type === 'gems') { var g = Math.ceil(Math.max(0, rem - gemsLying) / 2); if (g > 0) { need += g; where = where || k; } }
    });
    need = Math.max(need, beatMax);
    if (!where || alive >= need || (G.trialSpawned || 0) >= 18) return;
    if (where.temple) { var tt = where.temple; where = { x: tt.entry.tx + 0.5 - tt.f[0] * 2, y: tt.entry.ty + 0.5 - tt.f[1] * 2 }; }   // outside, in front of the temple
    var n = Math.min(3, need - alive), made = 0;
    for (var tries = 0; tries < 40 && made < n; tries++) {
      var a = Math.random() * Math.PI * 2, r = SC.rand(2.5, 5), x = where.x + Math.cos(a) * r, y = where.y + Math.sin(a) * r;
      if (W.blocked(x, y, 0.4, 'enemy') || SC.dist(x, y, p.x, p.y) < 3.5 || !W.lineClear(where.x, where.y, x, y)) continue;
      var e = SC.makeEnemy(trialType(), x, y, { camp: 'trial' });
      e.trialGem = true;
      G.enemies.push(e);
      SC.fx.burst(x, 0.5, y, 'smoke', 12);
      made++;
    }
    if (made) { G.trialSpawned = (G.trialSpawned || 0) + made; SC.toast('More baddies came to test you!', 2.5); }
  }
  function trialType() {
    var L = G.L, count = {}, best = 'grump', bn = 0;
    L.enemies.forEach(function (s) { if (SC.ENEMIES[s.type] && !SC.ENEMIES[s.type].big) count[s.type] = (count[s.type] || 0) + 1; });
    for (var k in count) if (count[k] > bn) { bn = count[k]; best = k; }
    return best;
  }

  // ---------------- portal blocks ----------------
  // reachable floor spots far apart (used when the level has no L.blocks, like the old maps)
  function reachTiles(L) {
    var seen = new Int32Array(L.w * L.h).fill(-1), q = [L.start.tx, L.start.ty], out = [];
    seen[L.start.ty * L.w + L.start.tx] = 0;
    for (var qi = 0; qi < q.length; qi += 2) {
      var x = q[qi], y = q[qi + 1], d = seen[y * L.w + x];
      out.push({ tx: x, ty: y, d: d });
      var nb = [1, 0, -1, 0, 0, 1, 0, -1];
      for (var i = 0; i < 8; i += 2) {
        var nx = x + nb[i], ny = y + nb[i + 1];
        if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h || seen[ny * L.w + nx] >= 0) continue;
        if (W.solid(W.tile(nx, ny), 'player')) continue;
        seen[ny * L.w + nx] = d + 1; q.push(nx, ny);
      }
    }
    return out;
  }
  function openTile(t) { return !W.blocked(t.tx + 0.5, t.ty + 0.5, 0.45, 'player') && !W.blocked(t.tx + 0.5, t.ty + 0.5, 0.45, 'enemy'); }
  function fallbackBlockSpots(L, n) {
    if (!L.start) return [];
    var cand = reachTiles(L).filter(function (t) {
      if (t.d < 6 || !openTile(t)) return false;
      var near = function (o) { return Math.abs(o.tx - t.tx) + Math.abs(o.ty - t.ty) < 3; };
      if (L.gate && near(L.gate)) return false;
      if (L.crests.some(near) || L.chests.some(near) || L.checkpoints.some(near)) return false;
      return true;
    });
    var picked = [];
    for (var k = 0; k < n && cand.length; k++) {
      var best = null, bs = -1;
      for (var i = 0; i < cand.length; i++) {
        var c = cand[i], md = SC.dist(c.tx, c.ty, L.start.tx, L.start.ty) * 0.6;
        for (var j = 0; j < picked.length; j++) md = Math.min(md, SC.dist(c.tx, c.ty, picked[j].tx, picked[j].ty));
        if (md > bs) { bs = md; best = c; }
      }
      picked.push({ tx: best.tx, ty: best.ty });
    }
    return picked;
  }
  SC.fallbackBlockSpots = fallbackBlockSpots;
  function fallbackNpcs(L) {
    if (!L.start || L.def.arena) return [];
    var cand = reachTiles(L).filter(function (t) {
      if (t.d < 3 || t.d > 9) return false;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if (W.solid(W.tile(t.tx + dx, t.ty + dy), 'player')) return false;
      return true;
    });
    var out = [];
    if (cand.length) out.push({ tx: cand[0].tx, ty: cand[0].ty, role: 'trader' });
    for (var i = 1; i < cand.length; i++) if (SC.dist(cand[i].tx, cand[i].ty, cand[0].tx, cand[0].ty) >= 2.5) { out.push({ tx: cand[i].tx, ty: cand[i].ty, role: 'smith' }); break; }
    return out;
  }
  // ---------------- planets, the Home Base and its ten portals ----------------
  // SC.PLANET_ORDER (the nine planets, then Pyros) is set in levels.js, next to the Home Base
  SC.planetLevels = function (pl) {
    var out = [];
    for (var i = 0; i < SC.LEVELS.length; i++) if (SC.planetOf(i).name === pl) out.push(i);
    return out;
  };
  var blockCount = {};
  // portal blocks a level gives: its map spots + 1 from its mini-boss (the dragon arena gives none)
  SC.levelBlockCount = function (i) {
    if (blockCount[i] === undefined) {
      var L = W.parse(i);
      blockCount[i] = L.def.arena || !L.gate ? 0 : (L.blocks.length || 3) + (L.boss ? 1 : 0);
    }
    return blockCount[i];
  };
  // a planet portal needs every block from the planet before it (Verdia needs none)
  SC.portalNeedFor = function (pl) {
    var k = SC.PLANET_ORDER.indexOf(pl), n = 0;
    if (k <= 0) return 0;
    SC.planetLevels(SC.PLANET_ORDER[k - 1]).forEach(function (i) { n += SC.levelBlockCount(i); });
    return n;
  };
  SC.isDone = function (i) { return !!(G.prog && G.prog.done && G.prog.done.indexOf(i) >= 0); };
  SC.portalInfo = function (pl) {
    var pr = G.prog, need = SC.portalNeedFor(pl), free = pr && pr.mode === 'free';
    var fitted = free ? need : Math.min(need, (pr && pr.fitted && pr.fitted[pl]) || 0);
    return { planet: pl, need: need, fitted: fitted, open: free || fitted >= need };
  };
  SC.nextLockedPortal = function () {
    for (var i = 0; i < SC.PLANET_ORDER.length; i++) { var inf = SC.portalInfo(SC.PLANET_ORDER[i]); if (!inf.open) return inf; }
    return null;
  };
  // may the player go to level i? (its planet portal is open, and the place before it on the same planet is finished)
  SC.placeOpen = function (i) {
    if (SC.isFree()) return true;
    var pl = SC.planetOf(i).name, list = SC.planetLevels(pl), k = list.indexOf(i);
    if (!SC.portalInfo(pl).open) return false;
    return k <= 0 || SC.isDone(list[k - 1]);
  };
  // where a level's exit portal leads: the next unfinished place on the same planet, or home
  SC.nextPlaceAfter = function (i) {
    var list = SC.planetLevels(SC.planetOf(i).name);
    for (var k = list.indexOf(i) + 1; k < list.length; k++) if (!SC.isDone(list[k])) return list[k];
    return 'base';
  };
  SC.placeName = function (pl) { return pl === 'base' ? 'Home Base' : SC.LEVELS[pl].name; };
  function syncBasePortals(L) {
    (L.portals || []).forEach(function (po) { var inf = SC.portalInfo(po.planet); po.need = inf.need; po.fitted = inf.fitted; po.open = inf.open; });
  }
  function basePortal(pl) { var L = G.L; return L && L.portals ? L.portals.filter(function (po) { return po.planet === pl; })[0] : null; }
  // the planet to play next: the first open planet that still has an unfinished place
  function planetToPlay() {
    for (var i = 0; i < SC.PLANET_ORDER.length; i++) {
      var pl = SC.PLANET_ORDER[i];
      if (!SC.portalInfo(pl).open) return null;
      if (SC.planetLevels(pl).some(function (li) { return !SC.isDone(li); })) return pl;
    }
    return null;
  }
  // in a level: the exit portal opens when all of the level's crests are picked up and all of its blocks are collected
  function updPortal(dt) {
    var L = G.L;
    if (L.isBase) { updBasePortals(dt); return; }
    if (!L.gate || L.def.arena) return;
    if (!L.gateOpen && !L.toldBlocks && L.portalNeed > 0 && (L.blocksGot || 0) >= L.portalNeed && !SC.allCrestsOwned()) { L.toldBlocks = true; SC.toast('All blocks found! Now get the crests.', 3); }
    if (!L.gateOpen && (L.blocksGot || 0) >= L.portalNeed && SC.allCrestsOwned()) {
      L.gateOpen = true;
      var nx = SC.nextPlaceAfter(L.index);
      SC.banner('The portal is open!', nx === 'base' ? 'Jump in to go back to Home Base!' : 'Jump in to go to ' + SC.placeName(nx) + '!', 'star', 2.6);
      SC.audio.play('gate');
    }
  }
  // at the Home Base: walking near the next locked planet portal fits the carried blocks into it, one by one
  function updBasePortals(dt) {
    var L = G.L, p = G.player, pr = G.prog;
    syncBasePortals(L);
    L.blocksCarried = SC.isFree() ? 0 : pr.carried;
    var nx = SC.nextLockedPortal(), po = nx ? basePortal(nx.planet) : null;
    if (po && G.players && G.players.length > 1) G.players.forEach(function (pl) { if (!pl.p.dead && SC.dist(pl.p.x, pl.p.y, po.tx + 0.5, po.ty + 0.5) < SC.dist(p.x, p.y, po.tx + 0.5, po.ty + 0.5)) p = pl.p; });   // whoever is nearer
    if (po && pr.carried > 0 && !p.dead && SC.dist(p.x, p.y, po.tx + 0.5, po.ty + 0.5) < 3.0) {
      var gx = po.tx + 0.5, gy = po.ty + 0.5;
      G.fitT += dt; L.fitT = G.fitT / 0.7;
      if (Math.random() < 0.4) SC.fx.burst(SC.lerp(p.x, gx, Math.random()), 1, SC.lerp(p.y, gy, Math.random()), 'gem', 1);
      if (G.fitT >= 0.7) {
        G.fitT = 0; L.fitT = 0;
        pr.carried--; pr.fitted[po.planet] = (pr.fitted[po.planet] || 0) + 1;
        L.blocksCarried = pr.carried;
        syncBasePortals(L);
        SC.audio.play('fit', Math.min(12, po.fitted));
        SC.fx.burst(gx, 1.8, gy, 'gem', 12);
        SC.popText(gx, gy, po.fitted + ' / ' + po.need, '#9ff0ff', true);
        G.stats.fitted = (G.stats.fitted || 0) + 1;
        if (po.open) {
          SC.banner(po.planet === 'Pyros' ? "The Dragon's gate is open!" : 'Portal ' + (SC.PLANET_ORDER.indexOf(po.planet) + 1) + ' is open!', po.planet === 'Pyros' ? 'Jump in to fly to Pyros!' : 'Jump in to visit planet ' + po.planet + '!', 'star', 3);
          SC.audio.play('gate');
          SC.fx.ring(gx, gy, 0x9ff0ff, 3);
        } else if (pr.carried === 0) SC.toast('Find ' + (po.need - po.fitted) + ' more blocks for ' + po.planet + '!', 3.5);
        SC.saveMid();
      }
    } else { G.fitT = 0; L.fitT = 0; }
  }
  // the hero touches a portal tile (called by player.js)
  SC.touchPortal = function (tx, ty) {
    var L = G.L;
    if (!L.isBase) {
      if (L.gateOpen) { SC.levelComplete(); return true; }
      if (G.gateHintT <= 0) { G.gateHintT = 4; SC.toast('The portal is shut. ' + SC.goal().text); }
      return false;
    }
    var po = (L.portals || []).filter(function (q) { return q.tx === tx && q.ty === ty; })[0];
    if (!po) return false;
    syncBasePortals(L);
    if (po.open) { SC.enterPlanet(po.planet); return true; }
    if (G.gateHintT <= 0) {
      G.gateHintT = 3.5;
      var nx = SC.nextLockedPortal();
      if (nx && nx.planet !== po.planet) SC.toast('This portal is locked. Open ' + portalName(nx.planet) + ' first!', 3.5);
      else if (G.prog.carried > 0) SC.toast('Stay close: your blocks are going in!', 2.5);
      else SC.toast('The ' + po.planet + ' portal needs ' + (po.need - po.fitted) + ' more blocks!', 3.5);
    }
    return false;
  };
  function travelTo(to) {
    var L = G.L;
    G.travel = { from: L && !L.isBase ? L.index : 'base', to: to, t: 0 };
    G.screen = 'travel'; G.picker = null;
    SC.audio.play('travel');
    I.clear();
  }
  // jump into an open planet portal: pick a place when there is more than one, then the star map, then the level
  SC.enterPlanet = function (pl, li) {
    if (li !== undefined) { travelTo(li); return; }
    var list = SC.planetLevels(pl), avail = list.filter(SC.placeOpen);
    if (!avail.length) { SC.toast('Nothing to visit there yet!'); return; }
    if (avail.length > 1) {
      var items = list.map(function (i) {
        var k = list.indexOf(i), ok = SC.placeOpen(i);
        return { id: 'go:' + i, level: i, label: SC.LEVELS[i].name, ok: ok, done: SC.isDone(i), why: ok ? '' : 'Finish ' + SC.LEVELS[list[k - 1]].name + ' first!' };
      });
      items.push({ id: 'back', label: 'Not now', ok: true });
      G.picker = { planet: pl, items: items, msg: 'Where do you want to go?' };
      var first = 0; for (var q = 0; q < items.length; q++) if (items[q].ok && !items[q].done) { first = q; break; }
      G.screen = 'picker'; G.menuSel = first;
      SC.audio.play('confirm');
      I.clear();
      return;
    }
    travelTo(avail[0]);
  };
  function closePicker() {
    var p = G.player, po = G.picker && basePortal(G.picker.planet);
    G.screen = 'play'; G.picker = null; I.clear();
    if (po && p) SC.eachPlayer(function (q, i) { var pf = po.face || [0, 1]; q.x = po.tx + 0.5 + pf[0] * (2.3 + i * 0.9); q.y = po.ty + 0.5 + pf[1] * (2.3 + i * 0.9); W.unstick(q, q.r, 'player'); G.gateHintT = 1; }, true);   // step back from the portal
  }
  function updPicker() {
    var pk = G.picker;
    if (I.wasHit('Escape', 'KeyP', 'Backspace')) { closePicker(); return; }
    var id = menuNav(pk.items);
    if (!id) return;
    if (id === 'back') { SC.audio.play('select'); closePicker(); return; }
    var it = pk.items.filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    if (!it.ok) { pk.msg = it.why; SC.audio.play('nope'); return; }
    SC.audio.play('confirm');
    travelTo(it.level);
  }

  // ---------------- starting a level ----------------
  // opts.keepHearts: use the saved hearts (Continue); otherwise everyone starts fresh
  // index 'base' = the Home Base; opts.fromPlanet: arrive in front of that planet's portal
  SC.startLevel = function (index, opts) {
    opts = opts || {};
    var pr = G.prog, isBase = index === 'base' || index === -1;
    if (!isBase) pr.levelIndex = index;
    pr.place = isBase ? 'base' : index;
    SC.useCtx(0);
    G.players = null; G.pi = 0;
    G.hero = SC.heroById(pr.heroId);
    var L = W.parse(isBase ? 'base' : index);
    W.L = L; G.L = L; L.bossDefeated = false;
    L.replay = !isBase && pr.mode !== 'free' && SC.isDone(index);
    clearLists();
    G.lv = newLv(); G.trialSpawned = 0; G.trialCheckT = 1;
    if (!G.team || opts.keepHearts) SC.makeTeam(opts.keepHearts ? pr.hearts : null);
    else SC.healTeam();
    G.player = SC.makePlayer(L.start.tx + 0.5, L.start.ty + 0.5);
    SC.healTeam();
    if (opts.keepHearts) { SC.makeTeam(pr.hearts); G.player.hp = SC.member(G.hero.id).hp; }
    G.player.face = -Math.PI / 2;
    if (isBase && opts.fromPlanet) {   // back home: stand in front of the portal you came through
      var fp = L.portals.filter(function (q) { return q.planet === opts.fromPlanet; })[0];
      if (fp) { var ff = fp.face || [0, 1]; G.player.x = fp.tx + 0.5 + ff[0] * 2.6; G.player.y = fp.ty + 0.5 + ff[1] * 2.6; G.player.face = Math.atan2(ff[1], ff[0]); W.unstick(G.player, G.player.r, 'player'); }
    }
    G.players = [{ p: G.player, hero: G.hero }]; G.pi = 0;
    if (pr.players === 2) addPlayer2(true);
    G.checkpoint = { x: G.player.x, y: G.player.y };
    L.checkpoints.forEach(function (c) { G.flags.push({ x: c.tx + 0.5, y: c.ty + 0.5, active: false }); });
    L.enemies.forEach(function (s) { G.enemies.push(SC.makeEnemy(s.type, s.tx + 0.5, s.ty + 0.5, { camp: s.camp })); });
    if (L.boss) {
      var b = SC.makeEnemy(L.boss.type, L.boss.tx + 0.5, L.boss.ty + 0.5);
      b.face = Math.PI / 2;
      G.enemies.push(b); G.bossEnt = b;
    }
    L.items.forEach(function (it) { SC.spawnPickup(it.kind, it.tx + 0.5, it.ty + 0.5, 1, { still: true }); });
    var free = pr.mode === 'free';
    L.crests.forEach(function (c) {
      if (free || SC.hasPower(c.power)) return;   // already earned (Continue) or Free Play
      SC.spawnPickup('crest', c.tx + 0.5, c.ty + 0.5, 1, { still: true, power: c.power, sealed: true, trial: resolveTrial(c.power, L) });
    });
    // crest temples: doors and their guardians
    if (SC.setupTemples) SC.setupTemples(L);
    // portal blocks: a level's own blocks light its exit portal and are carried home; the base fits them into planet portals
    L.fitT = 0; L.blocksGot = 0;
    L.blocksCarried = free ? 0 : (pr.carried || 0);
    if (isBase) {
      L.blockSpots = []; L.portalNeed = 0; L.portalFitted = 0;
      syncBasePortals(L);
    } else {
      var spots = L.def.arena ? [] : (L.blocks && L.blocks.length ? L.blocks : fallbackBlockSpots(L, 3));
      L.blockSpots = spots;
      L.portalNeed = L.def.arena || !L.gate ? 0 : spots.length + (L.boss ? 1 : 0);
      L.portalFitted = 0;
      if (free || L.replay) { L.portalFitted = L.portalNeed; if (L.gate) L.gateOpen = true; }
      else spots.forEach(function (s) { SC.spawnPickup('block', s.tx + 0.5, s.ty + 0.5, 1, { still: true }); });
    }
    // friendly people
    var np = (L.npcs && L.npcs.length) ? L.npcs : fallbackNpcs(L);
    np.forEach(function (n) { G.npcs.push({ id: ++G.nextId, x: n.tx + 0.5, y: n.ty + 0.5, role: n.role, face: Math.PI / 2 }); });
    SC.syncPowerIdx();
    G.screen = 'play';
    G.levelT = 0; G.stormT = 5; G.teach = 0; G.snapCam = true; G.hintT = 2; G.lastHint = null;
    if (SC.view && SC.gfx.ok) { SC.view.leaveMenu(); SC.view.buildLevel(L); }
    SC.audio.music(L.def.music);
    if (isBase) { SC.banner('Home Base', SC.goal().text, 'star', 3.4); return; }
    var planet = SC.planetOf(index);
    SC.banner('Level ' + (index + 1) + ': ' + L.def.name, 'Planet ' + planet.name + '. ' + levelSub(L), null, 3.4);
  };
  // ---------------- player 2 joins / leaves (same keyboard) ----------------
  function freeHeroFor2(want) {
    var p1 = G.players[0].hero.id;
    var ok = function (id) { var m = SC.member(id); return id && id !== p1 && m && !m.out; };
    if (ok(want)) return want;
    var i0 = SC.heroIndex(p1);
    for (var k = 1; k < SC.HEROES.length; k++) { var id = SC.HEROES[(i0 + k) % SC.HEROES.length].id; if (ok(id)) return id; }
    return null;
  }
  function addPlayer2(quiet) {
    SC.useCtx(0);
    if (!G.players) G.players = [{ p: G.player, hero: G.hero }];
    if (G.players.length > 1) return true;
    var id = freeHeroFor2(G.prog.p2Hero);
    if (!id) { SC.toast('Nobody is awake to play as player 2. Find a flag!'); SC.audio.play('nope'); return false; }
    var p1 = G.player, q = SC.makePlayer(p1.x, p1.y);
    q.pi = 1; q.face = p1.face;
    // stand next to player 1
    var spots = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]];
    var keepHero = G.hero; G.hero = SC.heroById(id);
    for (var s = 0; s < spots.length; s++) { var x = p1.x + spots[s][0], y = p1.y + spots[s][1]; if (!W.blocked(x, y, q.r, 'player')) { q.x = x; q.y = y; break; } }
    W.unstick(q, q.r, 'player');
    G.hero = keepHero;
    q.safeX = q.x; q.safeY = q.y; q.glideFromX = q.x; q.glideFromY = q.y;
    var m = SC.member(id); q.hp = m.hp > 0 ? m.hp : SC.maxHp(id); q.energy = m.energy; q.inv = 1.5;
    G.players.push({ p: q, hero: SC.heroById(id) });
    G.prog.players = 2; G.prog.p2Hero = id;
    if (!quiet) {
      SC.fx.burst(q.x, 0.8, q.y, 'star', 20);
      SC.audio.play('swap');
      SC.banner('Player 2 joins!', 'Arrows to move. L sword, K power, O super, ; dash, I switch, J ' + (SC.isFree() ? 'fly' : SC.glideMode() ? 'glide' : 'fly'), 'star', 4);
    }
    G.snapCam = true;
    return true;
  }
  function removePlayer2() {
    SC.useCtx(0);
    if (!G.players || G.players.length < 2) return;
    SC.storeActive();
    var q = G.players[1].p;
    G.prog.p2Hero = G.players[1].hero.id;
    if (G.players[0].p.dead && !q.dead) {   // player 1 was sitting out: player 1 carries on with player 2's hero
      G.players[0] = G.players[1]; q.pi = 0; G.prog.heroId = G.players[0].hero.id; G.prog.p2Hero = null;
      G.player = q; G.hero = G.players[0].hero;
    }
    G.players.length = 1; G.prog.players = 1;
    SC.fx.burst(q.x, 0.8, q.y, 'smoke', 14);
    SC.toast('Player 2 left. See you soon!', 3);
  }
  SC.addPlayer2 = addPlayer2; SC.removePlayer2 = removePlayer2;
  SC.goBase = function (fromPlanet) { SC.startLevel('base', { fromPlanet: fromPlanet }); };
  function levelSub(L) {
    if (L.def.arena) return 'The Dragon waits at the top!';
    if (SC.isFree()) return 'Free Play: go anywhere!';
    if (L.replay) return 'You finished this place. Play for fun!';
    var n = G.pickups.filter(function (k) { return k.kind === 'crest'; }).length;
    return (n ? 'Earn ' + n + ' crest' + (n > 1 ? 's' : '') + ' and ' : 'Find ') + L.portalNeed + ' portal blocks!';
  }

  SC.respawn = function () {
    SC.useCtx(0);
    var p = G.player;
    SC.eachPlayer(function (q, i) {
      q.x = G.checkpoint.x + (i ? 0.9 : 0); q.y = G.checkpoint.y;
      q.flying = false; q.gliding = false; q.flyH = 0; q.flyT = 0;
      W.unstick(q, q.r, 'player');
      q.dead = false; q.waiting = false; q.deadT = 0; q.inv = 2.5; q.blinkT = 2.5; q.vx = q.vy = q.kx = q.ky = 0;
      q.swingT = 0; q.dashT = 0; q.slowT = 0; q.powerCd = {};
      q.safeX = q.x; q.safeY = q.y;
    }, true);
    SC.healTeam();
    G.eprojs.length = 0; G.warns.length = 0; G.hazards.length = 0; G.projs.length = 0;
    for (var i = G.enemies.length - 1; i >= 0; i--) {
      var e = G.enemies[i];
      if (e.summoned) { G.enemies.splice(i, 1); continue; }
      if (e.isBoss && e.alive) SC.resetBoss(e);
      else if (SC.dist(e.x, e.y, p.x, p.y) < 6 || e.aggro) { e.x = e.homeX; e.y = e.homeY; e.aggro = false; e.returning = false; e.state = 'idle'; }
    }
    G.boss = null;
    G.screen = 'play'; G.snapCam = true;
    SC.toast('Everyone is rested. You can do it!');
  };

  // the hero jumped into an open exit portal: the place is finished, its blocks go home with the team
  SC.levelComplete = function () {
    if (G.screen !== 'play' || !G.L || G.L.isBase) return;
    var pr = G.prog, L = G.L, i = L.index;
    pr.time += G.levelT;
    G.doneGot = (!SC.isFree() && !L.replay) ? (L.blocksGot || 0) : 0;
    pr.carried = (pr.carried || 0) + G.doneGot;
    G.doneFirst = pr.done.indexOf(i) < 0;
    if (G.doneFirst) pr.done.push(i);
    G.nextPlace = SC.nextPlaceAfter(i);
    if (typeof G.nextPlace === 'number') pr.levelIndex = G.nextPlace;
    SC.healTeam();
    SC.save();
    G.screen = 'levelDone'; G.menuSel = 0; G.doneT = 0;
    SC.audio.play('levelup');
  };

  // ---------------- what to do next (goal line + compass arrow) ----------------
  function nearest(list, p) {
    var best = null, bd = 1e9;
    list.forEach(function (o) { var d = SC.dist(p.x, p.y, o.x, o.y); if (d < bd) { bd = d; best = o; } });
    return best;
  }
  SC.goal = function () {
    var L = G.L, p = G.player;
    if (!L || !p) return { text: '' };
    if (L.isBase) return baseGoal(L, p);
    if (L.def.arena) {
      var dr = G.bossEnt;
      if (dr && dr.alive) return { text: 'Beat the Dragon!', x: dr.x, y: dr.y, color: '#ff5a5a' };
      return { text: 'You did it!' };
    }
    if (SC.isFree() && L.gate) return { text: 'Free Play! Explore, or jump into the portal.', x: L.gate.tx + 0.5, y: L.gate.ty + 0.5, color: '#9ff0ff' };
    var crests = G.pickups.filter(function (k) { return k.kind === 'crest'; });
    var open = crests.filter(function (k) { return !k.sealed; });
    var more = crests.length > 1 ? '  (' + crests.length + ' crests)' : '';
    if (open.length) {
      var oc = nearest(open, p), pw = SC.powerById(oc.power);
      return { text: 'Get the ' + pw.name + ' Crest for ' + SC.heroById(pw.owner).name + '!' + more, x: oc.x, y: oc.y, color: '#ffe14a' };
    }
    // a temple is open: go in, then beat its guardian
    var ready = crests.filter(function (k) { return k.temple && k.temple.open && SC.templeGuardianAlive(k.temple); });
    if (ready.length) {
      var inside = ready.filter(function (k) { return SC.inTemple(k.temple, p.x, p.y); })[0];
      if (inside) { var ge = inside.temple.ent; return { text: 'Beat ' + SC.guardianShort(ge) + '!' + more, x: ge.x, y: ge.y, color: '#ff5a5a', temple: inside.temple }; }
      var rt = nearest(ready.map(function (k) { var d = k.temple.door[1]; return { x: d.tx + 0.5, y: d.ty + 0.5, t: k.temple }; }), p);
      return { text: 'Go into the ' + rt.t.name + '!' + more, x: rt.x, y: rt.y, color: '#ffd23f', temple: rt.t };
    }
    crests = crests.filter(function (k) { return !k.trialDone; });
    if (crests.length) {
      var sc = nearest(crests, p), tr = sc.trial, tgt = sc;
      if (sc.temple) { var dd = sc.temple.door[1]; tgt = { x: dd.tx + 0.5, y: dd.ty + 0.5 - sc.temple.f[1] * 3, temple: sc.temple }; }
      var trialTgt = tgt;
      if (tr.type === 'beatAs' || tr.type === 'beat' || tr.type === 'gems') {
        if (tr.type === 'gems') tgt = nearest(G.pickups.filter(function (k) { return k.kind === 'gem'; }), p) || tgt;
        if (tgt === trialTgt) tgt = nearest(G.enemies.filter(function (e) { return e.alive && !e.isBoss && !e.hidden; }), p) || trialTgt;
      } else if (tr.type === 'chest') {
        var chs = L.chests.filter(function (c) { return W.tile(c.tx, c.ty) === 'T'; }).map(function (c) { return { x: c.tx + 0.5, y: c.ty + 0.5 }; });
        tgt = nearest(chs, p) || trialTgt;
      } else if (tr.type === 'flag') tgt = nearest(G.flags, p) || trialTgt;
      var txt = SC.trialText(tr, true);
      if (tr.type === 'beatAs' && G.hero.id !== tr.hero) txt += SC.heroInUse(tr.hero) ? '  - player 2 has ' + SC.heroById(tr.hero).name + '!' : '  - press ' + (SC.heroIndex(tr.hero) + 1) + '!';
      return { text: txt + more, x: tgt.x, y: tgt.y, color: '#ffb84a', crest: sc };
    }
    var blocks = G.pickups.filter(function (k) { return k.kind === 'block'; });
    var have = L.blocksGot || 0;
    if (blocks.length) {
      var bk = nearest(blocks, p);
      return { text: 'Find portal blocks! (' + have + ' of ' + L.portalNeed + ')', x: bk.x, y: bk.y, color: '#9ff0ff' };
    }
    var b = G.bossEnt;
    if (b && b.alive && !L.replay) return { text: 'Beat ' + b.def.name + '! It has the last block.', x: b.x, y: b.y, color: '#ff5a5a' };
    if (L.gate) {
      var nx = SC.nextPlaceAfter(L.index), where = nx === 'base' ? 'go back to Home Base' : 'go to ' + SC.placeName(nx);
      if (L.replay && b && b.alive) return { text: 'Play for fun! Or jump into the portal to ' + where + '.', x: L.gate.tx + 0.5, y: L.gate.ty + 0.5, color: '#9ff0ff' };
      return { text: L.gateOpen ? 'Jump into the portal to ' + where + '!' : 'Go to the portal!', x: L.gate.tx + 0.5, y: L.gate.ty + 0.5, color: '#9ff0ff' };
    }
    return { text: '' };
  };
  // "portal 2, Aquaria" (the portals at the Home Base carry their numbers); Pyros is the Dragon's gate
  function portalName(pl) { var i = SC.PLANET_ORDER.indexOf(pl); return pl === 'Pyros' ? "the Dragon's gate" : 'portal ' + (i + 1) + ', ' + pl; }
  SC.portalName = portalName;
  function baseGoal(L, p) {
    var pr = G.prog;
    function at(pl, text, color) { var po = basePortal(pl); return po ? { text: text, x: po.tx + 0.5, y: po.ty + 0.5, color: color || '#9ff0ff' } : { text: text }; }
    if (SC.isFree()) return at(planetToPlay() || 'Verdia', 'Free Play! Every portal is open. Pick one!', '#7dffcf');
    var nx = SC.nextLockedPortal();
    if (nx && pr.carried > 0) {
      var rem = nx.need - nx.fitted;
      return at(nx.planet, pr.carried >= rem ? 'Bring your blocks to ' + portalName(nx.planet) + '!' : 'Put your ' + pr.carried + ' blocks in ' + portalName(nx.planet) + '!');
    }
    var pl = planetToPlay();
    if (!pr.done.length) return at('Verdia', 'Jump into ' + portalName('Verdia') + '!');
    if (pl === 'Pyros') return at(pl, "Jump into the Dragon's gate and beat the Dragon!", '#ffb06a');
    if (pl && nx) return at(pl, 'Jump into ' + portalName(pl) + '! Find ' + (nx.need - nx.fitted) + ' blocks for ' + nx.planet + '.');
    if (pl) return at(pl, 'Jump into ' + portalName(pl) + '!');
    if (pr.done.indexOf(SC.LEVELS.length - 1) >= 0) return at('Pyros', 'You won! Visit any planet for fun.', '#ffe36a');
    if (nx) return at(nx.planet, nx.planet + ' needs ' + (nx.need - nx.fitted) + ' more blocks.');
    return at('Verdia', 'Jump into ' + portalName('Verdia') + '!');
  }
  // ---------------- friendly people: trader and blacksmith ----------------
  function bought(id) { return (G.prog.shop && G.prog.shop[id]) || 0; }
  function anyResting() { return G.team && G.team.some(function (m) { return m.out; }); }
  function anyHurt() { SC.storeActive(); return G.team.some(function (m) { return m.out || m.hp < SC.maxHp(m.id); }); }
  // the trader / smith menu belongs to the player who opened it (their hero, their sword)
  function asShopOwner(fn) { var keep = G.pi || 0, own = G.shop && G.shop.pi ? G.shop.pi : 0; if (own === keep || !G.players || !G.players[own]) return fn(); SC.useCtx(own); try { return fn(); } finally { SC.useCtx(keep); } }
  SC.shopItems = function (role) { return asShopOwner(function () { return shopItems(role); }); };
  function shopItems(role) {
    var pr = G.prog, items = [];
    if (role === 'trader') {
      items.push({ id: 'fill', label: 'Fill all hearts', price: 6 + 2 * bought('fill'), ok: anyHurt(), why: 'Everyone is full!' });
      items.push({ id: 'heart', label: '+1 heart for the team', price: 25 + 15 * bought('heart'), ok: bought('heart') < 6, why: 'Sold out!' });
      items.push({ id: 'energy', label: 'Bigger energy bar', price: 20 + 12 * bought('energy'), ok: bought('energy') < 4, why: 'Sold out!' });
      items.push({ id: 'potion', label: 'Energy for everyone', price: 5 + bought('potion'), ok: true });
      items.push({ id: 'life', label: 'Extra life', price: 60 + 30 * bought('life'), ok: true });
      items.push({ id: 'wake', label: 'Wake resting friends', price: 8 + 2 * bought('wake'), ok: anyResting(), why: 'Nobody is resting.' });
    } else {
      if (pr.swordLevel < 2) items.push({ id: 'blade', label: pr.swordLevel === 0 ? 'Iron Blade' : 'Crystal Blade', price: pr.swordLevel === 0 ? 30 : 70, ok: true });
      else items.push({ id: 'blade', label: 'Best blade already!', price: 0, ok: false, why: 'Your blade is the best!' });
      var cur = pr.swordCrest[G.hero.id] || null;
      G.hero.powers.forEach(function (pid) {
        if (!SC.hasPower(pid)) return;
        var pw = SC.powerById(pid);
        items.push({ id: 'crest:' + pid, power: pid, label: (cur === pid ? pw.name + ' is in the sword' : 'Put ' + pw.name + ' in the sword'), price: 0, ok: cur !== pid, why: 'Already in!' , tip: SC.SWORD_CREST_TIP[pid] });
      });
      if (cur) items.push({ id: 'crest:none', power: null, label: 'Take the crest out', price: 0, ok: true });
      if (!G.hero.powers.some(function (pid) { return SC.hasPower(pid); })) items.push({ id: 'nocrest', label: G.hero.name + ' has no crest yet', price: 0, ok: false, why: 'Earn a crest first!' });
    }
    items.push({ id: 'leave', label: 'Bye!', price: 0, ok: true });
    return items;
  }
  SC.openShop = function (role, npc) {
    G.shop = { role: role, npc: npc || null, pi: G.pi || 0, msg: role === 'trader' ? 'Hello! Gems for goodies?' : 'Hi! Let me make your sword better.', msgT: 0 };
    G.screen = 'shop'; G.menuSel = 0;
    G.stats.shops = (G.stats.shops || 0) + 1;
    SC.audio.play('confirm');
    I.clear();
  };
  function closeShop() { G.screen = 'play'; G.shop = null; I.clear(); }
  SC.buy = function (id) { return asShopOwner(function () { return buy(id); }); };
  function buy(id) {
    var pr = G.prog, sh = G.shop, items = shopItems(sh.role), it = null;
    for (var i = 0; i < items.length; i++) if (items[i].id === id) it = items[i];
    if (!it) return false;
    if (id === 'leave') { closeShop(); return true; }
    if (!it.ok) { sh.msg = it.why || 'Not now!'; SC.audio.play('nope'); return false; }
    if (pr.gems < it.price) { sh.msg = 'You need ' + (it.price - pr.gems) + ' more gems.'; SC.audio.play('nope'); return false; }
    pr.gems -= it.price;
    var p = G.player;
    if (it.price > 0) pr.shop[id] = bought(id) + 1;
    switch (id) {
      case 'fill': SC.healTeam(); sh.msg = 'All hearts are full!'; break;
      case 'heart': pr.bonusHearts++; SC.healTeam(); sh.msg = 'Everyone has one more heart!'; break;
      case 'energy': pr.energyBonus = (pr.energyBonus || 0) + 20; p.energy = SC.maxEnergy(); sh.msg = 'Your energy bar is bigger!'; break;
      case 'potion': SC.storeActive(); G.team.forEach(function (m) { m.energy = SC.maxEnergy(m.id); }); p.energy = SC.maxEnergy(); sh.msg = 'Full of energy!'; break;
      case 'life': pr.lives = (pr.lives || 0) + 1; sh.msg = 'An extra life! You have ' + pr.lives + '.'; break;
      case 'wake': G.team.forEach(function (m) { if (m.out) { m.out = false; m.hp = SC.maxHp(m.id); } }); sh.msg = 'Everyone is awake!'; break;
      case 'blade': pr.swordLevel = Math.min(2, pr.swordLevel + 1); sh.msg = pr.swordLevel >= 2 ? 'A Crystal Blade! Super sharp!' : 'An Iron Blade! Much better!'; break;
      default:
        if (id.indexOf('crest:') === 0) {
          var pid = it.power;
          pr.swordCrest[G.hero.id] = pid;
          sh.msg = pid ? G.hero.name + "'s sword has " + SC.powerById(pid).name + '! ' + SC.SWORD_CREST_TIP[pid] : 'The crest is out.';
          if (pid) SC.fx.burst(p.x, 1, p.y, 'star', 16);
        }
    }
    SC.audio.play(id === 'blade' || id.indexOf('crest:') === 0 ? 'forge' : 'buy');
    if (SC.loadOthers) SC.loadOthers();
    SC.saveMid();
    return true;
  }
  function updShop() {
    var items = SC.shopItems(G.shop.role);
    if (I.wasHit('Escape', 'KeyP', 'Backspace')) { closeShop(); return; }
    var id = menuNav(items);
    if (id) SC.buy(id);
  }
  function npcTick(dt) {
    var p = G.player, best = null, bd = 1.7, who = 0, list = G.players && G.players.length > 1 ? G.players : [{ p: p }];
    G.npcs.forEach(function (n) {
      list.forEach(function (pl, i) {
        var q = pl.p, d = SC.dist(q.x, q.y, n.x, n.y);
        if (q.dead) return;
        if (d < 4) n.face = SC.lerp(n.face, Math.atan2(q.y - n.y, q.x - n.x), Math.min(1, dt * 5)); // gently turn to the hero
        if (d < bd && q.flyH < 0.5 && !q.gliding) { bd = d; best = n; who = i; }
      });
    });
    G.nearNpc = best; G.nearNpcPi = who;
    // Enter: whoever stands next to the person; E: player 1
    if (best && (I.wasHit('Enter', 'NumpadEnter') || (who === 0 && I.wasHit('KeyE')))) { SC.useCtx(who); SC.openShop(best.role, best); SC.useCtx(0); return true; }
    // clicking a friendly person
    for (var c = 0; c < I.clicks.length; c++) {
      var wp = SC.gfx && SC.gfx.groundAt && SC.gfx.groundAt(I.clicks[c].x, I.clicks[c].y);
      if (!wp) continue;
      for (var i = 0; i < G.npcs.length; i++) {
        var n = G.npcs[i];
        if (SC.dist(wp.x, wp.y, n.x, n.y) < 0.9 && SC.dist(p.x, p.y, n.x, n.y) < 3.5) { I.clicks.splice(c, 1); SC.openShop(n.role, n); return true; }
      }
    }
    return false;
  }

  // ---------------- menus ----------------
  function titleItems() {
    var items = [{ id: 'new', label: 'New Game' }];
    if (SC.loadSave()) items.push({ id: 'continue', label: 'Continue' });
    return items;
  }
  var MODE_ITEMS = [{ id: 'adventure', label: 'Adventure' }, { id: 'free', label: 'Free Play' }, { id: 'glide', label: 'Glide' }];
  function pauseItems() {
    var items = [{ id: 'resume', label: 'Keep playing' }];
    items.push(G.players && G.players.length > 1 ? { id: 'p2out', label: 'Player 2 leaves' } : { id: 'p2in', label: 'Player 2 joins' });
    if (G.L && !G.L.isBase) items.push({ id: 'home', label: 'Back to Home Base' });
    items.push({ id: 'quit', label: 'Quit to title' });
    return items;
  }
  // "going home drops this place's blocks" note for the pause menu (only when it matters)
  SC.pauseNote = function () {
    var L = G.L;
    if (!L || L.isBase || SC.isFree() || L.replay || !L.portalNeed) return '';
    return 'Going home leaves the blocks you found here behind.';
  };
  var OOPS_ITEMS = [{ id: 'retry', label: 'Try again' }];
  function doneItems() { return [{ id: 'next', label: G.nextPlace === 'base' || G.nextPlace === undefined ? 'Back to Home Base' : 'On to ' + SC.placeName(G.nextPlace) }]; }
  var WIN_ITEMS = [{ id: 'again', label: 'Play again' }];
  SC.menuItems = function () {
    switch (G.screen) {
      case 'title': return titleItems();
      case 'mode': return MODE_ITEMS;
      case 'pause': return pauseItems();
      case 'oops': return OOPS_ITEMS;
      case 'levelDone': return doneItems();
      case 'win': return WIN_ITEMS;
      case 'shop': return G.shop ? SC.shopItems(G.shop.role) : [];
      case 'picker': return G.picker ? G.picker.items : [];
    }
    return [];
  };
  function menuNav(items) {
    if (I.wasHit('ArrowUp', 'KeyW')) { G.menuSel = (G.menuSel + items.length - 1) % items.length; SC.audio.play('select'); }
    if (I.wasHit('ArrowDown', 'KeyS')) { G.menuSel = (G.menuSel + 1) % items.length; SC.audio.play('select'); }
    G.menuSel = SC.clamp(G.menuSel, 0, Math.max(0, items.length - 1));
    if (I.mouseMoved && SC.ui) {
      I.mouseMoved = false;
      var hb = SC.ui.hitButton(I.mx, I.my);
      if (hb && hb.idx >= 0 && hb.idx < items.length && hb.idx !== G.menuSel) { G.menuSel = hb.idx; SC.audio.play('select'); }
    }
    for (var c = 0; c < I.clicks.length; c++) {
      var b = SC.ui && SC.ui.hitButton(I.clicks[c].x, I.clicks[c].y);
      if (b) { if (b.idx >= 0) G.menuSel = b.idx; return b.id; }
    }
    if (I.wasHit('Enter', 'Space', 'NumpadEnter') && items[G.menuSel]) return items[G.menuSel].id;
    return null;
  }
  function act(id) {
    if (!id) return;
    SC.audio.play('confirm');
    switch (id) {
      case 'new': G.screen = 'mode'; G.modeSel = 0; G.menuSel = 0; break;
      case 'continue':
        var s = SC.loadSave();
        if (!s) break;
        G.prog = s; G.stats = newStats(); G.team = null; G.slotBy = {};
        SC.makeTeam(s.hearts);
        SC.startLevel('base', { keepHearts: true });   // Continue always starts at the Home Base
        break;
      case 'resume': G.screen = 'play'; break;
      case 'p2in': G.screen = 'play'; addPlayer2(); break;
      case 'p2out': G.screen = 'play'; removePlayer2(); break;
      case 'home': travelTo('base'); break;          // blocks found in this unfinished place are left behind (never added to prog.carried)
      case 'quit': goTitle(); break;
      case 'retry': SC.respawn(); break;
      case 'next': travelTo(G.nextPlace === undefined ? 'base' : G.nextPlace); break;
      case 'again': goTitle(); break;
    }
  }
  function goTitle() { G.screen = 'title'; G.menuSel = 0; SC.audio.music(6); }

  function updMode() {
    var nM = MODE_ITEMS.length;
    if (I.wasHit('ArrowLeft', 'KeyA')) { G.modeSel = (G.modeSel + nM - 1) % nM; SC.audio.play('select'); }
    if (I.wasHit('ArrowRight', 'KeyD')) { G.modeSel = (G.modeSel + 1) % nM; SC.audio.play('select'); }
    // how many players: up / down (or 1 / 2)
    if (I.wasHit('ArrowUp', 'KeyW', 'ArrowDown', 'KeyS')) { G.newPlayers = G.newPlayers === 2 ? 1 : 2; SC.audio.play('select'); }
    if (I.wasHit('Digit1', 'Numpad1')) { G.newPlayers = 1; SC.audio.play('select'); }
    if (I.wasHit('Digit2', 'Numpad2')) { G.newPlayers = 2; SC.audio.play('select'); }
    if (I.mouseMoved && SC.ui) {
      I.mouseMoved = false;
      var hb = SC.ui.hitButton(I.mx, I.my);
      if (hb && hb.id === 'modeCard' && hb.idx !== G.modeSel) { G.modeSel = hb.idx; SC.audio.play('select'); }
    }
    var go = I.wasHit('Enter', 'Space', 'NumpadEnter');
    for (var c = 0; c < I.clicks.length; c++) {
      var b = SC.ui && SC.ui.hitButton(I.clicks[c].x, I.clicks[c].y);
      if (!b) continue;
      if (b.id === 'modeCard') { G.modeSel = b.idx; go = true; }
      if (b.id === 'players') { G.newPlayers = b.idx; SC.audio.play('select'); }
      if (b.id === 'back') { goTitle(); return; }
    }
    if (I.wasHit('Escape')) { goTitle(); return; }
    if (go) { G.newMode = MODE_ITEMS[G.modeSel].id; G.screen = 'select'; G.selHero = 0; G.selStage = 1; G.p1Pick = null; SC.audio.play('confirm'); }
  }

  function updSelect() {
    var nH = SC.HEROES.length;
    if (I.wasHit('ArrowLeft', 'KeyA')) { G.selHero = (G.selHero + nH - 1) % nH; SC.audio.play('select'); }
    if (I.wasHit('ArrowRight', 'KeyD')) { G.selHero = (G.selHero + 1) % nH; SC.audio.play('select'); }
    if (I.wasHit('ArrowUp', 'KeyW')) { G.selHero = (G.selHero + nH - 3) % nH; SC.audio.play('select'); }
    if (I.wasHit('ArrowDown', 'KeyS')) { G.selHero = (G.selHero + 3) % nH; SC.audio.play('select'); }
    for (var dk = 1; dk <= nH && dk <= 9; dk++) if (I.wasHit('Digit' + dk, 'Numpad' + dk)) { G.selHero = dk - 1; SC.audio.play('select'); }
    if (I.mouseMoved && SC.ui) {
      I.mouseMoved = false;
      var hb = SC.ui.hitButton(I.mx, I.my);
      if (hb && hb.id === 'hero' && hb.idx !== G.selHero) { G.selHero = hb.idx; SC.audio.play('select'); }
    }
    var go = I.wasHit('Enter', 'Space', 'NumpadEnter');
    for (var c = 0; c < I.clicks.length; c++) {
      var b = SC.ui && SC.ui.hitButton(I.clicks[c].x, I.clicks[c].y);
      if (!b) continue;
      if (b.id === 'hero') { if (b.idx === G.selHero) go = true; G.selHero = b.idx; }
      if (b.id === 'go') go = true;
      if (b.id === 'back') { selBack(); return; }
    }
    if (I.wasHit('Escape')) { selBack(); return; }
    if (go) {
      var pick = SC.HEROES[G.selHero].id;
      // two players: player 1 picks, then player 2 picks someone else
      if (G.newPlayers === 2 && G.selStage === 1) { G.p1Pick = pick; G.selStage = 2; G.selHero = (G.selHero + 1) % nH; SC.audio.play('confirm'); return; }
      if (G.selStage === 2 && pick === G.p1Pick) { SC.audio.play('nope'); return; }
      SC.audio.play('confirm');
      if (G.selStage === 2) newGame(G.p1Pick, G.newMode, 2, pick); else newGame(pick, G.newMode, 1);
      SC.startLevel('base');
      if (G.prog.players === 2) { G.banner = null; SC.banner('Two players!', 'Player 1: WASD, Space, F, R, Shift, Tab, G.   Player 2: arrows, L, K, O, ;, I, J', 'star', 5); }
    }
  }
  function selBack() { if (G.selStage === 2) { G.selStage = 1; G.selHero = SC.heroIndex(G.p1Pick); return; } G.screen = 'mode'; }
  function newGame(heroId, mode, players, p2Hero) {
    G.prog = SC.newProgress(heroId, mode);
    G.prog.players = players === 2 ? 2 : 1; G.prog.p2Hero = p2Hero || null;
    G.players = null; G.pi = 0;
    G.stats = newStats();
    G.slotBy = {}; G.superCd = {};
    G.hero = SC.heroById(heroId);
    G.team = null;
    SC.makeTeam(null);
  }

  function updTravel(dt) {
    var tr = G.travel;
    tr.t += dt;
    var skip = tr.t > 0.4 && (I.wasHit('Enter', 'Space', 'NumpadEnter', 'Escape') || I.clicks.length > 0);
    if (tr.t >= 3.2 || skip) {
      G.travel = null;
      if (tr.to === 'base') SC.startLevel('base', { fromPlanet: tr.from === 'base' ? null : SC.planetOf(tr.from).name });
      else SC.startLevel(tr.to);
    }
  }

  // ---------------- play ----------------
  function tickTimers(dt) {
    for (var i = G.toasts.length - 1; i >= 0; i--) { G.toasts[i].t -= dt; G.toasts[i].age += dt; if (G.toasts[i].t <= 0) G.toasts.splice(i, 1); }
    if (G.banner) { G.banner.t += dt; if (G.banner.t >= G.banner.dur) G.banner = null; }
    for (var j = G.texts.length - 1; j >= 0; j--) { G.texts[j].t += dt; if (G.texts[j].t >= G.texts[j].dur) G.texts.splice(j, 1); }
    if (G.flash) { G.flash.t -= dt; if (G.flash.t <= 0) G.flash = null; }
    G.energyHintT -= dt;
  }
  function teach(dt) {
    // the first steps are taught at the Home Base of a brand-new game, and again in Sunny Meadow
    if (G.L.index !== 0 && !(G.L.isBase && G.prog.done.length === 0 && !SC.isFree())) return;
    var p = G.player;
    var two = G.players && G.players.length > 1;
    if (G.teach === 0 && G.levelT > 0.8) { G.teach = 1; SC.toast(two ? 'Player 1 walks with WASD, player 2 with the arrows!' : 'Walk with WASD or the arrow keys!', 4); }
    else if (G.teach === 1 && SC.dist(p.x, p.y, G.L.start.tx + 0.5, G.L.start.ty + 0.5) > 3) { G.teach = 2; SC.toast(two ? 'Swords: Space (player 1) and L (player 2)!' : 'Swing your sword with Space!', 4); }
    else if (G.teach === 2 && G.levelT > 8) { G.teach = 3; SC.toast('Press Tab or 1-9 to switch heroes! Each has a power.', 4.5); }
    else if (G.teach === 3 && G.levelT > 15) { G.teach = 4; SC.toast('Follow the arrow to your next task!', 4); }
    else if (G.teach === 4 && G.levelT > 22) { G.teach = 5; SC.toast(G.npcs.length ? 'Friendly people! Walk up and press Enter.' : 'Press Shift to dash out of danger!', 4); }
    else if (G.teach === 5 && G.levelT > 30) { G.teach = 6; SC.toast('Press Shift to dash out of danger!', 4); }
    else if (G.teach === 6 && SC.currentPowerId() && G.levelT > 34) { G.teach = 7; SC.toast('Press F to use your power!', 4); }
  }
  function updPlay(dt) {
    if (I.wasHit('KeyP', 'Escape')) { G.screen = 'pause'; G.menuSel = 0; return; }
    tickTimers(dt);
    if (G.freezeT > 0) { G.freezeT -= dt; return; }
    if (G.hitstop > 0) { G.hitstop -= dt; return; }
    if (npcTick(dt)) return;
    G.levelT += dt; G.stats.time += dt;
    SC.updatePlayer(dt);
    if (G.screen !== 'play') return;
    SC.updateEnemies(dt);
    SC.updateProjs(dt);
    SC.updateEProjs(dt);
    SC.updateWarns(dt);
    SC.updateHazards(dt);
    SC.updatePickups(dt);
    W.update(dt);
    teach(dt);
    updTrials(dt);
    if (SC.updateTemples) SC.updateTemples(dt);
    updPortal(dt);
    var L = G.L;
    if (L.def.storm && !(G.players || [{ p: G.player }]).every(function (pl) { return pl.p.dead; })) {
      G.stormT -= dt;
      if (G.stormT <= 0) {
        G.stormT = SC.rand(3, 4.5);
        var p = G.player;
        if (G.players && G.players.length > 1) { var alive = G.players.filter(function (pl) { return !pl.p.dead; }); if (alive.length) p = alive[Math.floor(Math.random() * alive.length)].p; }
        SC.stormStrike(p.x + SC.rand(-1.2, 1.2) + p.vx * 0.4, p.y + SC.rand(-1.2, 1.2) + p.vy * 0.4, 0.9, 1.25);
        if (!G.toldStorm) { G.toldStorm = true; SC.toast('Lightning! Step out of yellow circles!'); }
      }
    }
    if (G.dragonDeadT > 0) {
      G.dragonDeadT += dt;
      if (G.dragonDeadT > 2.8) {
        G.screen = 'win'; G.menuSel = 0;
        G.prog.time += G.levelT; G.prog.won = true;
        if (G.prog.done.indexOf(G.L.index) < 0) G.prog.done.push(G.L.index);
        SC.save();
        SC.audio.play('win');
      }
    }
  }

  function update(dt) {
    G.simT += dt;
    if (I.wasHit('KeyM')) { SC.audio.unlock(); SC.audio.toggleMute(); }
    switch (G.screen) {
      case 'title': act(menuNav(titleItems())); break;
      case 'mode': updMode(); break;
      case 'select': updSelect(); break;
      case 'play': updPlay(dt); break;
      case 'shop': tickTimers(dt); updShop(); break;
      case 'picker': tickTimers(dt); updPicker(); break;
      case 'travel': updTravel(dt); break;
      case 'pause':
        tickTimers(0);
        if (I.wasHit('KeyP', 'Escape')) { G.screen = 'play'; break; }
        act(menuNav(pauseItems())); break;
      case 'oops': G.player.deadT += dt; act(menuNav(OOPS_ITEMS)); break;
      case 'levelDone': G.doneT += dt; if (G.doneT > 0.5) act(menuNav(doneItems())); break;
      case 'win': G.doneT = (G.doneT || 0) + dt; act(menuNav(WIN_ITEMS)); break;
    }
    I.endTick();
  }
  SC.update = function (dt) { SC.safe(function () { update(dt); }, 'update'); };

  // ---------------- drawing ----------------
  function fmtTime(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function render(dt) {
    var GX = SC.gfx, UI = SC.ui, scr = G.screen;
    if (GX.ok) {
      if (scr === 'title' || scr === 'mode' || scr === 'select') SC.view.menu(scr === 'select' ? 'select' : 'title', G.selHero, G.realT, dt);
      else if (G.L && scr !== 'travel') {
        var L = G.L;
        while (L.changes.length) { var ty = L.changes.pop(), tx = L.changes.pop(); GX.tileChanged(tx, ty); }
        SC.view.update(scr === 'play' ? dt : 0.0001, G.realT);
        GX.updateParticles(scr === 'play' ? dt : 0);
        GX.updateLights(dt);
      }
      GX.render();
    }
    UI.begin();
    if (scr === 'title') UI.drawTitle(titleItems(), G.menuSel);
    else if (scr === 'mode') UI.drawMode(G.modeSel);
    else if (scr === 'select') UI.drawSelect(G.selHero);
    else if (scr === 'travel' && G.travel) UI.drawTravel(G.travel);
    else if (G.L && G.player) {
      UI.drawHUD();
      if (scr === 'pause') UI.drawPause(pauseItems(), G.menuSel, SC.pauseNote());
      else if (scr === 'shop' && G.shop) UI.drawShop(G.shop, SC.shopItems(G.shop.role), G.menuSel);
      else if (scr === 'picker' && G.picker) UI.drawPicker(G.picker, G.menuSel);
      else if (scr === 'oops') UI.drawOverlayCard('Oops! Try again?', ['Everyone on the team needs a rest.', 'You start at the last flag with full hearts.'], OOPS_ITEMS, G.menuSel, '#ff9a8a');
      else if (scr === 'levelDone') {
        var nx = G.nextPlace;
        UI.drawOverlayCard(G.doneFirst ? 'Place finished!' : 'Well played!', [G.L.def.name + ' is done!', 'Gems: ' + G.prog.gems + '    Powers: ' + G.prog.crests.length + ' of 9',
          G.doneGot ? 'You carry ' + G.prog.carried + ' portal block' + (G.prog.carried === 1 ? '' : 's') + ' now!' : '',
          nx === 'base' || nx === undefined ? 'The portal takes you back to Home Base.' : 'Next stop: ' + SC.placeName(nx) + '!'], doneItems(), G.menuSel);
      }
      else if (scr === 'win') UI.drawOverlayCard('You beat the Dragon!', ['YOU WIN!  Hooray, team!', 'You saved all nine planets and Pyros!',
        'Time: ' + fmtTime(G.prog.time) + '    Gems: ' + G.prog.gems + '    Powers: ' + G.prog.crests.length + ' of 9', SC.isFree() ? '(Free Play)' : ''], WIN_ITEMS, G.menuSel, '#ffe36a');
    }
  }
  SC.render = function (dt) { SC.safe(function () { render(dt || 0.016); }, 'render'); };

  // ---------------- main loop ----------------
  var acc = 0, last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var rd = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
    last = now;
    G.realT += rd;
    if (!SC.testMode) {
      acc += rd;
      var n = 0;
      while (acc >= SC.STEP && n < 6) { SC.update(SC.STEP); acc -= SC.STEP; n++; }
      if (n >= 6) acc = 0;
    }
    SC.audio.update();
    SC.render(rd);
  }
  window.addEventListener('blur', function () { if (G.screen === 'play' && !SC.testMode) { G.screen = 'pause'; G.menuSel = 0; } });

  // ---------------- test hooks ----------------
  function crestsBefore(levelIndex) {
    var list = [];
    for (var i = 0; i < levelIndex; i++) SC.LEVELS[i].crests.forEach(function (c) { if (list.indexOf(c) < 0) list.push(c); });
    return list;
  }
  function applyFree() {
    var L = G.L;
    SC.POWERS.forEach(function (pw) { SC.ownPower(pw.id, 3); });
    G.pickups = G.pickups.filter(function (k) { return k.kind !== 'crest' && k.kind !== 'block'; });
    if (L) { L.blocksCarried = 0; L.portalFitted = L.portalNeed; if (L.gate) L.gateOpen = true; (L.temples || []).forEach(function (t) { if (!t.open) SC.openTemple(t, true); }); }
    SC.syncPowerIdx();
  }
  function blocksState(L) {
    if (!L) return { carried: 0, fitted: 0, need: 0 };
    if (L.isBase) { var nx = SC.nextLockedPortal(); return { carried: G.prog.carried || 0, fitted: nx ? nx.fitted : 0, need: nx ? nx.need : 0, got: 0 }; }
    return { carried: L.blocksCarried || 0, fitted: L.portalFitted || 0, need: L.portalNeed || 0, got: L.blocksGot || 0 };
  }
  function templesState(L) {
    var out = {};
    if (L && L.temples) L.temples.forEach(function (t) {
      out[t.power] = { open: !!t.open, guardianAlive: !!(t.ent && t.ent.alive), guardianName: t.ent ? t.ent.def.name : null, awake: !!(t.ent && t.ent.alive && t.ent.aggro), name: t.name };
    });
    return out;
  }
  function portalsState() {
    if (!G.prog) return {};
    var out = {};
    SC.PLANET_ORDER.forEach(function (pl) { var inf = SC.portalInfo(pl); out[pl] = { need: inf.need, fitted: inf.fitted, open: inf.open }; });
    return out;
  }
  window.__game = {
    errors: SC.errors,
    getState: function () {
      SC.syncCtx();
      var p = G.players && G.players[0] ? G.players[0].p : G.player, b = G.boss || (G.bossEnt && G.bossEnt.aggro ? G.bossEnt : null), alive = 0, L = G.L;
      for (var i = 0; i < G.enemies.length; i++) if (G.enemies[i].alive && !G.enemies[i].isBoss) alive++;
      var powers = {};
      if (G.prog) SC.POWERS.forEach(function (pw) { var s = G.prog.powers[pw.id]; powers[pw.id] = { owned: !!s.owned, level: s.owned ? s.level : 0, xp: Math.round(s.xp * 100) / 100 }; });
      return {
        screen: G.screen, levelIndex: L ? L.index : -1, levelName: L ? L.def.name : '', hero: G.prog ? G.prog.heroId : null,
        mode: G.prog ? G.prog.mode : null, planet: L ? (L.isBase ? 'Home Base' : SC.planetOf(L.index).name) : '',
        hp: p ? p.hp : 0, maxHp: G.prog ? SC.maxHp() : 0, energy: p ? Math.round(p.energy) : 0, crests: G.prog ? G.prog.crests.slice() : [],
        team: G.prog && G.team ? SC.teamState() : [], powers: powers,
        blocks: blocksState(L),
        place: L ? (L.isBase ? 'base' : L.index) : null, done: G.prog ? G.prog.done.slice() : [], portals: portalsState(),
        picker: G.picker ? G.picker.items.map(function (it) { return it.label + (it.ok ? '' : ' (locked)'); }) : null,
        travel: G.travel ? { from: G.travel.from, to: G.travel.to } : null,
        flying: !!(p && (p.flying || p.flyH > 0)), flyH: p ? Math.round(p.flyH * 100) / 100 : 0,
        view: (SC.gfx && (SC.gfx.viewName || SC.gfx.view)) || 'top',
        npcs: G.npcs ? G.npcs.length : 0, lives: G.prog ? (G.prog.lives || 0) : 0, superCd: G.prog ? Math.round(SC.superCd() * 10) / 10 : 0, superReady: G.prog ? SC.superReady() : false, swordCrest: G.prog ? G.prog.swordCrest : null,
        currentPower: G.prog ? SC.currentPowerId() : null, gems: G.prog ? G.prog.gems : 0, swordLevel: G.prog ? G.prog.swordLevel : 0, enemiesAlive: alive,
        boss: b ? { name: b.def.name, hp: Math.max(0, Math.round(b.hp * 10) / 10), maxHp: b.maxHp, phase: b.phase || 1, alive: b.alive, state: b.state, h: b.h } : null,
        gateOpen: L ? L.gateOpen : false, player: p ? { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, dead: p.dead } : null,
        goalText: L ? SC.goal().text : '', bossDefeated: L ? !!L.bossDefeated : false, temples: templesState(L),
        gliding: !!(p && p.gliding), numPlayers: G.players ? G.players.length : (G.prog ? G.prog.players || 1 : 1),
        players: G.players ? G.players.map(function (pl, i) { var q = pl.p; return { hero: pl.hero.id, hp: q.hp, dead: !!q.dead, waiting: !!q.waiting, flying: !!(q.flying || q.flyH > 0), gliding: !!q.gliding, flyH: Math.round(q.flyH * 100) / 100, x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 }; }) : []
      };
    },
    // start(hero, levelIndex | 'base', mode): a new game straight into a level (earlier places count as finished,
    // their planet portals as filled) or at the Home Base of a brand-new game
    start: function (heroId, levelIndex, mode, players, p2Hero) {
      levelIndex = levelIndex || 0;
      newGame(heroId || 'nate', mode || 'adventure', players, p2Hero);
      if (levelIndex === 'base') { SC.startLevel('base'); G.banner = null; return this.getState(); }
      if (G.prog.mode !== 'free') crestsBefore(levelIndex).forEach(function (c) { SC.ownPower(c, 1); });
      G.prog.swordLevel = (levelIndex > 2 ? 1 : 0) + (levelIndex > 6 ? 1 : 0);   // the iron blade is on planet 3, the crystal blade on planet 7
      for (var i = 0; i < levelIndex; i++) G.prog.done.push(i);
      var upTo = SC.PLANET_ORDER.indexOf(SC.planetOf(levelIndex).name);
      SC.PLANET_ORDER.forEach(function (pl, k) { if (k <= upTo) G.prog.fitted[pl] = SC.portalNeedFor(pl); });
      SC.startLevel(levelIndex);
      G.banner = null;
      return this.getState();
    },
    goBase: function (fromPlanet) { SC.startLevel('base', { fromPlanet: fromPlanet }); G.banner = null; return this.getState(); },
    // enterPlanet(name): like walking into its portal (picker / star map); enterPlanet(name, i): start level i right away
    enterPlanet: function (name, levelIndex) {
      if (levelIndex === undefined) SC.enterPlanet(name);
      else { SC.startLevel(levelIndex); G.banner = null; }
      return this.getState();
    },
    giveAllCrests: function () { SC.POWERS.forEach(function (pw) { if (!SC.hasPower(pw.id)) SC.ownPower(pw.id, 1); }); SC.syncPowerIdx(); },
    giveCrest: function (name) { if (SC.powerById(name) && !SC.hasPower(name)) SC.ownPower(name, 1); SC.syncPowerIdx(); },
    setPowerLevel: function (name, lvl) { SC.ownPower(name, lvl); var s = G.prog.powers[name]; s.level = lvl; s.xp = SC.EVOLVE_AT[lvl - 1]; },
    // select a power; switches to its owner first if needed (test helper)
    selectPower: function (id) {
      var ow = SC.powerOwner(id);
      if (ow && ow !== G.hero.id) SC.swapHero(ow, { force: true, quiet: true });
      if (G.player) G.player.swapCd = 0;
      return SC.selectPower(id);
    },
    swapHero: function (id) { var m = SC.member(id); if (m && m.out) return false; var r = SC.swapHero(id, { force: true, quiet: true }); G.player.swapCd = 0; return r; },
    setMode: function (m) { G.prog.mode = m === 'free' || m === 'glide' ? m : 'adventure'; if (G.prog.mode === 'free') applyFree(); },
    // two players on one keyboard: setPlayers(2) adds player 2 next to player 1 (with a free hero), setPlayers(1) removes them
    setPlayers: function (n) { if (n === 2) addPlayer2(true); else removePlayer2(); G.banner = null; return G.players ? G.players.length : 1; },
    // player i's hero object (for tests): { p, hero }
    playerRec: function (i) { SC.syncCtx(); return G.players ? G.players[i] : null; },
    // glide(true): open the glider now (Glide mode rules), glide(false): land at once
    glide: function (on) { var p = G.player; if (on === false) { if (p.gliding) { p.gliding = false; p.flyH = 0; } return false; } return SC.startGlide(true); },
    // fly to a height in the world (tests), e.g. flyTo(9)
    flyTo: function (alt) { var p = G.player; if (!p.flying) { p.flyCd = 0; SC.startFlight(); } p.flyAlt = alt; },
    // the crest's little task is done (for a crest in a temple this opens the temple door; the guardian still keeps it sealed)
    finishTrial: function (power) {
      var done = false;
      G.pickups.forEach(function (k) {
        if (k.kind !== 'crest' || k.power !== power || !k.sealed) return;
        k.trialDone = true; done = true;
        if (k.temple) SC.openTemple(k.temple); else unseal(k);
      });
      return done;
    },
    openTemple: function (power) { var t = SC.templeOf(power); return t ? (SC.openTemple(t) || t.open) : false; },
    // beat a temple's guardian right away (opens its door first)
    beatGuardian: function (power) {
      var t = SC.templeOf(power); if (!t) return false;
      if (!t.open) SC.openTemple(t, true);
      var e = t.ent; if (!e || !e.alive) return false;
      if (!e.aggro) SC.wakeBoss(e);
      e.invulT = 0; e.h = 0; SC.killEnemy(e);
      return true;
    },
    guardian: function (power) { var t = SC.templeOf(power); return t ? t.ent : null; },
    // finish a crest completely: task done, guardian beaten (the crest is then free to pick up)
    earnCrest: function (power) { this.finishTrial(power); this.beatGuardian(power); },
    // in a level: as if n of its blocks were picked up (default: all still missing); at the base: n more carried blocks
    giveBlocks: function (n) {
      var L = G.L;
      if (L.isBase) { var nx = SC.nextLockedPortal(); G.prog.carried += n === undefined ? (nx ? nx.need - nx.fitted : 0) : n; L.blocksCarried = G.prog.carried; return; }
      if (n === undefined) n = Math.max(0, L.portalNeed - (L.blocksGot || 0));
      L.blocksGot = (L.blocksGot || 0) + n; L.blocksCarried = (L.blocksCarried || 0) + n; L.portalFitted = Math.min(L.portalNeed, L.blocksGot);
    },
    fly: function (on) { var p = G.player; if (on === false) SC.endFlight(); else { p.flyCd = 0; SC.startFlight(); } },
    setSwordCrest: function (heroId, power) { G.prog.swordCrest[heroId] = power || null; },
    giveLife: function (n) { G.prog.lives = (G.prog.lives || 0) + (n || 1); return G.prog.lives; },
    useSuper: function () { return SC.useSuper(); },
    openTrade: function (role) { var n = null; G.npcs.forEach(function (x) { if (x.role === role && !n) n = x; }); SC.openShop(role || 'trader', n); },
    god: function (on) { G.god = on !== false; },
    teleport: function (tx, ty) { var p = G.player; p.x = tx + 0.5; p.y = ty + 0.5; p.vx = p.vy = p.kx = p.ky = 0; G.snapCam = true; },
    killAll: function () { G.enemies.forEach(function (e) { if (e.alive && !e.isBoss) SC.killEnemy(e); }); },
    hurtBoss: function (n) { var b = G.bossEnt; if (b && b.alive) { if (!b.aggro) SC.wakeBoss(b); b.h = 0; b.hp -= n; b.flash = 0.1; if (b.hp <= 0) SC.killEnemy(b); } },
    press: function (code) { I.press(code); },
    release: function (code) { I.release(code); },
    releaseAll: function () { I.down = {}; },
    step: function (dt) { var n = Math.max(1, Math.round((dt || SC.STEP) / SC.STEP)); for (var i = 0; i < n; i++) SC.update(SC.STEP); },
    render: function () { SC.render(0.016); },
    validate: function () { return W.validate(); },
    respawn: function () { if (G.screen === 'oops') SC.respawn(); },
    clearSave: function () { SC.store.del(SAVE_KEY); },
    internals: SC
  };

  // ---------------- start ----------------
  function boot() {
    SC.ui.init();
    SC.gfx.init();
    SC.audio.music(6);
    var probs = W.validate();
    if (probs.length) SC.showErr('Map check: ' + probs.join('; '));
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
