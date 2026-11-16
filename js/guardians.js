// Nine Crests - temples and their guardians. Every crest sits on an altar at the back of its temple. The temple door stays
// shut until the crest's little task is done; inside are a trap hall and a guardian (a boss) who keeps the crest sealed
// until it is beaten. Here: setting the temples up when a level starts, opening doors, the guardians' brains (every attack
// is shown on the ground first), going home when the hero leaves the temple, and what happens when a guardian is beaten.
(function () {
  'use strict';
  var SC = window.SC, W = SC.world;

  function crestOf(power) {
    var ps = SC.G.pickups;
    for (var i = 0; i < ps.length; i++) if (ps[i].kind === 'crest' && ps[i].power === power) return ps[i];
    return null;
  }
  SC.templeOf = function (power) { var L = SC.G.L; return L && L.temples ? L.temples.filter(function (t) { return t.power === power; })[0] || null : null; };
  SC.guardianShort = function (e) { return (e && (e.def.short || e.def.name)) || 'the guardian'; };
  SC.templeGuardianAlive = function (t) { return !!(t && t.ent && t.ent.alive); };
  // the hero is inside the temple walls
  SC.inTemple = function (t, x, y) { return !!t && W.inBox(t.rect, x, y, 0); };

  // ---------------- level start ----------------
  // doors: open in Free Play, in a replay, or when the crest is already earned; shut otherwise. Guardians are always there.
  SC.setupTemples = function (L) {
    var G = SC.G;
    G.templeHintT = 0;
    (L.temples || []).forEach(function (t) {
      t.open = false; t.ent = null; t.beaten = false; t.toldShut = 0;
      if (SC.isFree() || L.replay || SC.hasPower(t.power)) {
        t.open = true;
        t.door.forEach(function (d) { L.tiles[d.ty * L.w + d.tx] = ';'; });
      }
      var type = SC.GUARDIAN_OF[t.power];
      if (type && SC.ENEMIES[type]) {
        var e = SC.makeEnemy(type, t.guard.tx + 0.5, t.guard.ty + 0.5);
        e.guardian = t.power; e.temple = t; e.state = 'sleep';
        e.face = Math.atan2(-t.f[1], -t.f[0]);      // looking at the door
        t.ent = e;
        G.enemies.push(e);
      }
      var k = crestOf(t.power);
      if (k) k.temple = t;
    });
  };

  // the crest task is done: the door opens with a big moment
  SC.openTemple = function (t, quiet) {
    if (!t || t.open) return false;
    W.openTempleDoor(t);
    var G = SC.G, d = t.door[1], e = t.ent;
    G.stats.templesOpened = (G.stats.templesOpened || 0) + 1;
    t.openT = 0;
    if (!quiet) {
      SC.banner('The ' + t.name + ' is open!', e && e.alive ? 'Go in and beat ' + SC.guardianShort(e) + '!' : 'Go in and get the crest!', t.power, 3.4);
      SC.audio.play('gate');
    }
    SC.fx.burst(d.tx + 0.5, 1.2, d.ty + 0.5, 'star', 24);
    SC.fx.burst(d.tx + 0.5, 0.4, d.ty + 0.5, 'dust', 20);
    SC.fx.shake(0.3);
    return true;
  };

  // ---------------- every simulation step (from main.js) ----------------
  SC.updateTemples = function (dt) {
    var G = SC.G, L = G.L, p = G.player;
    if (!L || !L.temples || !L.temples.length || !p) return;
    G.templeHintT = (G.templeHintT || 0) - dt;
    for (var i = 0; i < L.temples.length; i++) {
      var t = L.temples[i], d = t.door[1];
      // walking up to a shut door says what to do
      if (!t.open && G.templeHintT <= 0 && SC.dist(p.x, p.y, d.tx + 0.5, d.ty + 0.5) < 2.6) {
        G.templeHintT = 4;
        var k = crestOf(t.power);
        SC.toast('The ' + t.name + ' is shut. ' + (k && k.trial ? SC.trialText(k.trial, true) + ' to open it!' : 'It opens later!'), 3.5);
      }
      // the first steps inside
      if (t.open && !t.toldIn && SC.inTemple(t, p.x, p.y)) {
        t.toldIn = true;
        if (!SC.isFree() && t.ent && t.ent.alive) SC.toast('Careful! Traps in the hall, ' + SC.guardianShort(t.ent) + ' at the back.', 3.5);
      }
    }
  };
  // should a sleeping guardian wake up? (the hero walked into its chamber)
  SC.guardianNotice = function (e, p) {
    var t = e.temple;
    if (!t || !t.open || p.dead) return false;
    return W.inBox(t.chamber, p.x, p.y, 0.3) || (SC.inTemple(t, p.x, p.y) && SC.dist(p.x, p.y, e.x, e.y) < 3.2);
  };

  // ---------------- waking up ----------------
  SC.guardianWake = function (e) {
    var G = SC.G, t = e.temple, k = t ? crestOf(t.power) : null, pw = SC.powerById(e.guardian);
    e.aggro = true; e.returning = false; e.state = 'wake'; e.st = 1.5; e.invulT = 1.3; e.atkCd = 0.8; e.atkI = 0; e.awayT = 0;
    G.boss = e;
    SC.audio.play('roar');
    SC.fx.shake(0.45);
    SC.fx.burst(e.x, 1.0, e.y, e.def.g.fx || 'star', 30);
    SC.fx.ring(e.x, e.y, pw ? pw.hex : 0xffffff, 3);
    SC.banner(SC.guardianShort(e) + ' wakes up!', k && k.sealed ? 'Beat ' + SC.guardianShort(e) + ' to free the ' + pw.name + ' Crest!' : 'A guardian! Beat it just for fun!', e.guardian, 2.8);
    G.stats.guardiansWoken = (G.stats.guardiansWoken || 0) + 1;
  };
  // the hero left the temple: the guardian walks back to its spot and waits (it keeps its hurt)
  function calm(e) {
    var G = SC.G;
    e.aggro = false; e.returning = true; e.returnT = 0; e.state = 'sleep'; e.awayT = 0; e.h = 0; e.alpha = 1; e.hidden = false;
    clearWarns(e);
    if (G.boss === e) G.boss = null;
  }
  function clearWarns(e) { var ws = SC.G.warns; for (var i = ws.length - 1; i >= 0; i--) if (ws[i].owner === e) ws.splice(i, 1); }

  // ---------------- beaten! ----------------
  SC.guardianDefeated = function (e) {
    var G = SC.G, t = e.temple, pw = SC.powerById(e.guardian);
    if (G.boss === e) G.boss = null;
    clearWarns(e);
    if (t) t.beaten = true;
    G.stats.guardians = (G.stats.guardians || 0) + 1;
    SC.fx.shake(0.7);
    SC.fx.burst(e.x, 1.0, e.y, e.def.g.fx || 'star', 30);
    for (var i = 0; i < 10; i++) SC.spawnPickup('gem', e.x, e.y, i < 3 ? 5 : 1, { vh: SC.rand(4, 8), spread: SC.rand(1, 3) });
    SC.spawnPickup('heart', e.x, e.y);
    var k = crestOf(e.guardian);
    if (k && k.sealed) {
      SC.unsealCrest(k, true);
      var owner = SC.heroById(pw.owner);
      SC.banner('You beat ' + SC.guardianShort(e) + '!', 'The ' + pw.name + ' Crest is free! Get it for ' + owner.name + '!', e.guardian, 3.6);
      SC.audio.play('unseal');
      if (t) { SC.fx.ring(t.altar.tx + 0.5, t.altar.ty + 0.5, pw.hex, 3); SC.fx.burst(t.altar.tx + 0.5, 1.5, t.altar.ty + 0.5, 'star', 30); }
    } else SC.banner('You beat ' + SC.guardianShort(e) + '!', 'Hooray! What a fight!', 'star', 3);
    SC.audio.play('levelup');
  };

  // ---------------- the guardians' brains ----------------
  var DIRS8 = [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, 3.14];
  function T(e) { return e.def.g.tele || 1; }
  function dmg(e) { return e.def.dmg || 1; }
  function fxKind(e) { return e.def.g.fx || 'star'; }
  function hex(e) { var pw = SC.powerById(e.guardian); return pw ? pw.hex : 0xffffff; }
  function warnCol(e) { return e.def.g.color || '#ff3b30'; }
  function hit(e, x, y, r, opts) {
    SC.eachPlayer(function (p) { if (SC.dist(x, y, p.x, p.y) < r + p.r) SC.hurtPlayer(dmg(e), x, y, opts); });
  }
  // inside its own temple? (guardians never chase the hero out of it)
  function okSpot(e, x, y) { return !W.blocked(x, y, e.r * 0.9, 'enemy') && (!e.temple || W.inBox(e.temple.rect, x, y, -0.6)); }

  var ATK = {
    // a big slam in front: a circle on the ground first
    slam: function (e, p) {
      var r = e.def.dmg < 1 ? 1.6 : 1.9, dur = 1.0 * T(e), cx = e.x + Math.cos(e.face) * 1.0, cy = e.y + Math.sin(e.face) * 1.0;
      e.state = 'windup'; e.st = dur; e.track = 0;
      SC.audio.play('warn');
      SC.addWarn({ kind: 'circle', x: cx, y: cy, r: r, dur: dur, owner: e, color: warnCol(e), onDone: function () {
        if (!e.alive) return;
        hit(e, cx, cy, r, { ground: true });
        SC.fx.shake(0.45); SC.fx.burst(cx, 0.3, cy, fxKind(e), 18); SC.fx.burst(cx, 0.2, cy, 'rock', 8); SC.fx.ring(cx, cy, hex(e), r);
        SC.audio.play('slam');
        e.state = 'recover'; e.st = 1.0;
      } });
    },
    // a ring all around itself
    nova: function (e, p) {
      var r = 2.5, dur = 1.15 * T(e), cx = e.x, cy = e.y;
      e.state = 'windup'; e.st = dur;
      SC.audio.play('warn');
      SC.addWarn({ kind: 'circle', x: cx, y: cy, r: r, dur: dur, owner: e, color: warnCol(e), onDone: function () {
        if (!e.alive) return;
        hit(e, cx, cy, r, { ground: true, slow: e.def.g.slow });
        SC.fx.shake(0.4); SC.fx.ring(cx, cy, hex(e), r);
        for (var i = 0; i < 8; i++) { var a = i / 8 * Math.PI * 2; SC.fx.burst(cx + Math.cos(a) * r * 0.8, 0.3, cy + Math.sin(a) * r * 0.8, fxKind(e), 4); }
        SC.audio.play(e.guardian === 'ice' ? 'ice' : e.guardian === 'surface' ? 'pop' : 'slam');
        e.state = 'recover'; e.st = 1.0;
      } });
    },
    // throws a fan of things; the fan is shown on the ground first
    volley: function (e, p) {
      var g = e.def.g, n = g.n || 3, spread = n > 3 ? 0.28 : 0.36, dur = 0.8 * T(e);
      e.aimA = Math.atan2(p.y - e.y, p.x - e.x); e.face = e.aimA;
      e.state = 'windup'; e.st = dur; e.track = 0;
      SC.addWarn({ kind: 'cone', x: e.x, y: e.y, ang: e.aimA, len: 4.5, half: spread * (n - 1) / 2 + 0.12, dur: dur, owner: e, color: warnCol(e), onDone: function () {
        if (!e.alive) return;
        var sp = e.def.dmg < 1 ? 4.3 : 5.2, extra = { dmg: dmg(e) };
        if (g.proj === 'blob' || g.proj === 'bubbleball') extra.slow = 0.8;
        if (g.proj === 'orb' || g.proj === 'bubbleball') { extra.r = 0.24; extra.life = 4; sp *= 0.8; }
        if (g.proj === 'rock') { extra.r = 0.24; extra.h = 0.7; }
        for (var i = 0; i < n; i++) SC.enemyShoot(e, g.proj || 'pebble', e.aimA + (i - (n - 1) / 2) * spread, sp, extra);
        SC.audio.play(g.proj === 'fireball' ? 'fire' : g.proj === 'blob' || g.proj === 'bubbleball' ? 'bubble' : g.proj === 'orb' ? 'death' : g.proj === 'blade' ? 'wind' : 'spit');
        e.state = 'recover'; e.st = 0.8;
      } });
    },
    // circles on the ground, then something falls from the sky (lightning bolts, icicles)
    strikes: function (e, p) {
      var n = e.def.g.n || 2, base = 1.25 * T(e);
      e.state = 'windup'; e.st = 0.6; e.track = 3;
      SC.audio.play('warn');
      for (var k = 0; k < n; k++) {
        var x = k === 0 ? p.x : p.x + SC.rand(-2, 2), y = k === 0 ? p.y : p.y + SC.rand(-2, 2);
        if (k && !okSpot(e, x, y)) { x = p.x + SC.rand(-1, 1); y = p.y + SC.rand(-1, 1); }
        (function (x, y, dur) {
          SC.addWarn({ kind: 'circle', x: x, y: y, r: 1.0, dur: dur, owner: e, color: warnCol(e), onDone: function () {
            if (!e.alive) return;
            if (e.guardian === 'lightning') { SC.G.effects.push({ kind: 'bolt', pts: [x, y, x, y], sky: true, t: 0, dur: 0.3, h: 0 }); SC.fx.burst(x, 0.3, y, 'spark', 16); SC.audio.play('thunder'); }
            else { SC.fx.burst(x, 0.3, y, 'ice', 18); SC.audio.play('ice'); SC.fx.shake(0.15); }
            hit(e, x, y, 1.0, e.def.g.slow ? { slow: e.def.g.slow } : null);
          } });
        })(x, y, base + k * 0.3);
      }
      e.after = 'recover'; e.afterT = 1.0;
    },
    // a dash along a line shown on the ground; afterwards it is dizzy for a moment (a good time to hit it!)
    charge: function (e, p) {
      var dur = 0.95 * T(e);
      e.chargeA = Math.atan2(p.y - e.y, p.x - e.x); e.face = e.chargeA;
      e.state = 'chargeWind'; e.st = dur;
      SC.addWarn({ kind: 'line', x: e.x, y: e.y, ang: e.chargeA, len: 7, width: 1.2, dur: dur, owner: e, color: warnCol(e) });
      SC.audio.play('warn');
    },
    // a line of rock spikes walking toward the hero
    quake: function (e, p) {
      var a = Math.atan2(p.y - e.y, p.x - e.x), base = 0.95 * T(e);
      e.face = a; e.state = 'windup'; e.st = 0.7; e.track = 0;
      SC.audio.play('earth');
      for (var i = 0; i < 6; i++) {
        var x = e.x + Math.cos(a) * (1.3 + i * 1.15), y = e.y + Math.sin(a) * (1.3 + i * 1.15);
        if (W.projSolid(W.tile(Math.floor(x), Math.floor(y)))) break;
        (function (x, y, dur) {
          SC.addWarn({ kind: 'circle', x: x, y: y, r: 0.85, dur: dur, owner: e, color: warnCol(e), onDone: function () {
            if (!e.alive) return;
            SC.G.effects.push({ kind: 'spike', x: x, y: y, t: 0, dur: 0.7, s: 1.1, rot: Math.random() * 6, lvl: 2, scale: 1 });
            SC.fx.burst(x, 0.2, y, 'rock', 8); SC.fx.shake(0.12);
            hit(e, x, y, 0.85, { ground: true });
          } });
        })(x, y, base + i * 0.16);
      }
      e.after = 'recover'; e.afterT = 1.2;
    },
    // a big gust in a cone: pushes the hero away
    cone: function (e, p) {
      var a = Math.atan2(p.y - e.y, p.x - e.x), dur = 0.95 * T(e), len = 5.2, half = 0.5;
      e.face = a; e.state = 'windup'; e.st = dur; e.track = 0;
      SC.audio.play('warn');
      SC.addWarn({ kind: 'cone', x: e.x, y: e.y, ang: a, len: len, half: half, dur: dur, owner: e, color: warnCol(e), onDone: function () {
        if (!e.alive) return;
        var hitOne = function (pl) { var d = SC.dist(e.x, e.y, pl.x, pl.y), pa = Math.atan2(pl.y - e.y, pl.x - e.x);
        for (var i = 0; i < 14; i++) { var r = SC.rand(0.5, len), aa = a + SC.rand(-half, half); SC.fx.burst(e.x + Math.cos(aa) * r, 0.6, e.y + Math.sin(aa) * r, 'wind', 2); }
        SC.audio.play('wind');
        if (d < len + pl.r && Math.abs(SC.angDiff(a, pa)) < half + 0.15 && SC.hurtPlayer(dmg(e), e.x, e.y)) { pl.kx = Math.cos(a) * 12; pl.ky = Math.sin(a) * 12; } };
        SC.eachPlayer(hitOne);
        e.state = 'recover'; e.st = 0.9;
      } });
    },
    // three thorny vines shoot out along lines
    lines: function (e, p) {
      var a = Math.atan2(p.y - e.y, p.x - e.x), dur = 1.05 * T(e), len = 6.5, wd = 0.9;
      e.face = a; e.state = 'windup'; e.st = dur; e.track = 0;
      SC.audio.play('warn');
      [-0.65, 0, 0.65].forEach(function (o) {
        var aa = a + o;
        SC.addWarn({ kind: 'line', x: e.x, y: e.y, ang: aa, len: len, width: wd, dur: dur, owner: e, color: warnCol(e), onDone: function () {
          if (!e.alive) return;
          var hitOne = function (pl) { var dx = pl.x - e.x, dy = pl.y - e.y, along = dx * Math.cos(aa) + dy * Math.sin(aa), side = Math.abs(-dx * Math.sin(aa) + dy * Math.cos(aa));
          for (var i = 1; i < 6; i++) SC.fx.burst(e.x + Math.cos(aa) * i * 1.1, 0.3, e.y + Math.sin(aa) * i * 1.1, 'leaf', 3);
          if (along > 0 && along < len && side < wd / 2 + pl.r) SC.hurtPlayer(dmg(e), e.x, e.y, { ground: true }); };
          SC.eachPlayer(hitOne);
        } });
      });
      SC.audio.play('life');
      e.after = 'recover'; e.afterT = 0.9;
    },
    // vanishes and pops up next to the hero, then a quick (shown) slash
    blink: function (e, p) {
      e.state = 'blinkOut'; e.st = 0.45;
      SC.fx.burst(e.x, 0.8, e.y, 'shadow', 16); SC.audio.play('death');
    },
    // jumps high and lands where the hero was (the landing spot glows first)
    leap: function (e, p) {
      e.state = 'leapUp'; e.st = 0.45; e.leapX = p.x; e.leapY = p.y; e.leapFromX = e.x; e.leapFromY = e.y;
      if (!okSpot(e, e.leapX, e.leapY)) { e.leapX = e.x + (p.x - e.x) * 0.6; e.leapY = e.y + (p.y - e.y) * 0.6; }
      SC.addWarn({ kind: 'circle', x: e.leapX, y: e.leapY, r: 1.8, dur: 1.15 * T(e), owner: e, color: warnCol(e) });
      SC.audio.play('bubble');
    }
  };
  SC.GUARDIAN_ATTACKS = ATK;

  SC.BOSS_AI.guardian = function (e, p, d, dt) {
    var g = e.def.g, t = e.temple, G = SC.G;
    // the hero left the temple: go home and wait
    if (t && !W.inBox(t.rect, p.x, p.y, 0.6)) { e.awayT = (e.awayT || 0) + dt; if (e.awayT > 2.5) { calm(e); return; } }
    else e.awayT = 0;
    e.st -= dt; e.atkCd -= dt;
    switch (e.state) {
      case 'wake':
        e.h = 0;
        if (Math.random() < 0.3) SC.fx.burst(e.x + SC.rand(-0.5, 0.5), 0.5, e.y + SC.rand(-0.5, 0.5), fxKind(e), 1);
        if (e.st <= 0) { e.state = 'move'; e.st = 0.7; }
        return;
      case 'windup':
        if (e.track) SC.faceTo(e, p.x, p.y, e.track, dt);
        if (e.after && e.st <= 0) { e.state = e.after; e.st = e.afterT; e.after = null; }
        else if (e.st < -3) { e.state = 'move'; e.st = 0.5; }   // never stuck winding up
        return;
      case 'chargeWind':
        if (e.st <= 0) { e.state = 'charge'; e.st = 0.62; e.chargeHit = false; }
        return;
      case 'charge':
        var sp = e.def.dmg < 1 ? 7.5 : 9, ox = e.x, oy = e.y;
        var wall = W.move(e, Math.cos(e.chargeA) * sp * dt, Math.sin(e.chargeA) * sp * dt, e.r * 0.9, 'enemy');
        if (t && !W.inBox(t.rect, e.x, e.y, -0.5)) { e.x = ox; e.y = oy; wall = true; }
        e.moving = true; e.face = e.chargeA; e.spinA += dt * (e.guardian === 'water' ? 20 : 0);
        if (!e.chargeHit && SC.dist(e.x, e.y, p.x, p.y) < e.r + p.r + 0.1) { e.chargeHit = true; SC.hurtPlayer(dmg(e), e.x, e.y, { ground: true }); }
        if (Math.random() < 0.6) SC.fx.burst(e.x, 0.3, e.y, fxKind(e), 1);
        if (wall || e.st <= 0) { e.state = 'dizzy'; e.st = 1.4; SC.fx.burst(e.x, 1.2, e.y, 'star', 8); }
        return;
      case 'blinkOut':
        e.alpha = Math.max(0, e.st / 0.45); e.hidden = e.alpha < 0.3;
        if (e.st <= 0) {
          var placed = false;
          for (var k = 0; k < DIRS8.length && !placed; k++) {
            var a = Math.atan2(e.y - p.y, e.x - p.x) + DIRS8[k], nx = p.x + Math.cos(a) * 2.0, ny = p.y + Math.sin(a) * 2.0;
            if (okSpot(e, nx, ny)) { e.x = nx; e.y = ny; placed = true; }
          }
          SC.fx.burst(e.x, 0.8, e.y, 'shadow', 16);
          e.state = 'blinkIn'; e.st = 0.4;
        }
        return;
      case 'blinkIn':
        e.alpha = 1 - Math.max(0, e.st / 0.4); e.hidden = e.alpha < 0.3;
        if (e.st <= 0) {
          e.alpha = 1; e.hidden = false;
          SC.faceTo(e, p.x, p.y, 0, dt);
          var cx = e.x + Math.cos(e.face) * 0.8, cy = e.y + Math.sin(e.face) * 0.8, dur = 0.85 * T(e);
          e.state = 'windup'; e.st = dur; e.track = 0;
          SC.audio.play('warn');
          SC.addWarn({ kind: 'circle', x: cx, y: cy, r: 1.35, dur: dur, owner: e, color: warnCol(e), onDone: function () {
            if (!e.alive) return;
            hit(e, cx, cy, 1.35, { ground: true });
            SC.fx.burst(cx, 0.5, cy, 'shadow', 14); SC.audio.play('swing');
            e.state = 'recover'; e.st = 1.0;
          } });
        }
        return;
      case 'leapUp':
        e.h = Math.min(2.6, e.h + dt * 8);
        if (e.st <= 0) { e.state = 'leapAir'; e.st = 1.15 * T(e) - 0.45 - 0.15; }
        return;
      case 'leapAir':
        e.h = 2.6;
        e.x = SC.lerp(e.x, e.leapX, Math.min(1, dt * 5)); e.y = SC.lerp(e.y, e.leapY, Math.min(1, dt * 5));
        if (e.st <= 0) { e.state = 'leapDown'; e.st = 0.2; }
        return;
      case 'leapDown':
        e.h = Math.max(0, e.h - dt * 16);
        if (e.h <= 0) {
          W.unstick(e, e.r, 'enemy');
          hit(e, e.leapX, e.leapY, 1.8, { ground: true });
          SC.fx.shake(0.6); SC.fx.burst(e.x, 0.3, e.y, fxKind(e), 24); SC.fx.burst(e.x, 0.3, e.y, 'water', 16); SC.fx.ring(e.x, e.y, hex(e), 1.8);
          SC.audio.play('slam');
          e.state = 'dizzy'; e.st = 1.3;
        }
        return;
      case 'recover': case 'dizzy':
        if (e.st <= 0) { e.state = 'move'; e.st = (g.rest || 1.4) * SC.rand(0.8, 1.2); }
        return;
      default:
        // walk around the hero at a good distance, then the next attack
        e.state = 'move';
        var next = g.atks[(e.atkI || 0) % g.atks.length], want = next === 'slam' ? 1.6 : next === 'charge' || next === 'cone' || next === 'lines' ? 3.2 : 2.6;
        if (d > want + 0.8) SC.moveToward(e, p.x, p.y, e.speed, dt);
        else if (d < want - 1.2 && next !== 'slam') { var aw = Math.atan2(e.y - p.y, e.x - p.x); W.move(e, Math.cos(aw) * e.speed * 0.6 * dt, Math.sin(aw) * e.speed * 0.6 * dt, e.r * 0.9, 'enemy'); e.moving = true; }
        SC.faceTo(e, p.x, p.y, 4, dt);
        if (e.st <= 0 && (d < want + 1.6 || e.st < -2.5)) {
          e.atkI = (e.atkI || 0) + 1;
          ATK[next](e, p);
        }
    }
  };
})();
