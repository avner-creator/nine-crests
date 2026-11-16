// Nine Crests - the little people: making them, their brains, getting hit, going poof, and their thrown things.
(function () {
  'use strict';
  var SC = window.SC, W = SC.world;

  SC.makeEnemy = function (type, x, y, opts) {
    var G = SC.G, def = SC.ENEMIES[type], li = G.L && G.L.def && typeof G.L.def.tier === 'number' ? G.L.def.tier : (G.L ? Math.max(0, G.L.index) : 0);
    var hpMul = def.boss ? 1 : 1 + 0.1 * li;   // tier 0 (planet 1) .. 9 (Pyros): baddies get a little tougher planet by planet
    var e = {
      id: ++G.nextId, type: type, def: def, x: x, y: y, r: def.r, hp: def.hp * hpMul, maxHp: def.hp * hpMul,
      speed: def.speed * (def.boss ? 1 : 1 + 0.025 * li), face: Math.PI / 2, state: 'idle', st: 0, atkCd: SC.rand(0.6, 2.2),
      kx: 0, ky: 0, flash: 0, burnT: 0, burnTick: 0, frozenT: 0, bubbleT: 0, stunT: 0, slowT: 0, spinT: 0, spinA: 0,
      alive: true, isBoss: !!def.boss, aggro: false, spawnX: x, spawnY: y, lastSwing: -1, anim: Math.random() * 10,
      h: 0, vh: 0, hidden: false, alpha: 1, summoned: !!(opts && opts.summoned), moving: false, wanderA: Math.random() * 6.3, wanderT: 0,
      stuckT: 0, detourT: 0, detourA: 0, phase: 1, windT: 0, strafe: Math.random() < 0.5 ? 1 : -1, trailT: 0,
      // camps: a home spot and a leash. camp = number from the map (enemies with the same number wake together)
      homeX: x, homeY: y, camp: (opts && opts.camp !== undefined && opts.camp !== null) ? opts.camp : null, returning: false
    };
    if (opts && opts.aggro) e.aggro = true;
    return e;
  };

  function weakList(def) { return def.weak || []; }

  // how far a sleeping baddie can see you, and how far it follows you from home
  function noticeR() { var L = SC.G.L; return L && L.index === 0 ? 4.5 : 5.5; }
  function leashR() { var L = SC.G.L; return L && L.index === 0 ? 9 : 11; }
  SC.noticeRadius = noticeR; SC.leashRadius = leashR;
  // wake one baddie and the whole camp it belongs to
  SC.wakeEnemy = function (e) {
    var G = SC.G;
    if (e.isBoss) { if (!e.aggro) SC.wakeBoss(e); return; }
    var was = e.aggro;
    e.aggro = true; e.returning = false;
    if (e.camp === null || e.camp === undefined) return;
    for (var i = 0; i < G.enemies.length; i++) {
      var o = G.enemies[i];
      if (o !== e && o.alive && !o.isBoss && o.camp === e.camp && !o.aggro) { o.aggro = true; o.returning = false; o.atkCd = Math.max(o.atkCd, SC.rand(0.4, 1.2)); }
    }
    if (!was) G.stats.campsWoken = (G.stats.campsWoken || 0) + 1;
  };

  SC.hurtEnemy = function (e, amount, elem, opts) {
    var G = SC.G;
    opts = opts || {};
    if (!e.alive || e.hidden || (e.h > 1.5 && !opts.air)) return 0;
    if (e.invulT > 0) return 0;
    var mult = 1, label = null;
    var pid = elem === 'burn' ? 'fire' : elem;
    if (SC.powerById(pid)) {
      e.lastPower = pid; e.lastPowerT = G.simT;
      if (e.isBoss) SC.addPowerXp(pid, elem === 'burn' ? 0.1 : 0.34);
    }
    if (weakList(e.def).indexOf(elem) >= 0) { mult *= 2; label = 'SUPER!'; }
    else if (e.def.resist.indexOf(elem) >= 0) { mult *= 0.5; label = 'Resist!'; }
    if (opts.sword && e.frozenT > 0) { mult *= 2; label = label || 'Shatter!'; }
    var dmg = amount * mult;
    if (elem !== 'burn' && G.hero) e.lastHeroId = G.hero.id;   // who hit it (counts for "beat N as ..." tasks, with two players too)
    e.hp -= dmg;
    e.flash = 0.13;
    if (!e.aggro || e.returning) SC.wakeEnemy(e);
    if (opts.kx !== undefined) {
      var kb = e.isBoss ? 0.15 : (e.def.big ? 0.45 : 1);
      e.kx += opts.kx * kb; e.ky += opts.ky * kb;
    }
    if (elem !== 'burn') {
      SC.popText(e.x, e.y, Math.max(1, Math.round(dmg)), label === 'SUPER!' ? '#ffe14a' : '#ffffff', label === 'SUPER!');
      if (label === 'SUPER!') SC.popText(e.x, e.y - 0.2, 'SUPER!', '#ffcf1a', true);
      else if (label === 'Resist!') SC.popText(e.x, e.y - 0.2, 'Resist!', '#c0c0c0');
    }
    if (e.hp <= 0) SC.killEnemy(e);
    return dmg;
  };

  SC.killEnemy = function (e) {
    var G = SC.G;
    if (!e.alive) return;
    e.alive = false; e.hp = 0;
    G.stats.beaten++;
    var big = e.isBoss || e.def.big;
    SC.fx.burst(e.x, 0.5 + e.h, e.y, 'smoke', big ? 26 : 14);
    SC.fx.burst(e.x, 0.7 + e.h, e.y, 'star', big ? 22 : 9);
    SC.audio.play('poof');
    // the power that hit it last (in the last 4 seconds) gets the credit and grows
    if (e.lastPower && G.simT - e.lastPowerT < 4) SC.addPowerXp(e.lastPower, e.isBoss ? 3 : 1);
    if (e.guardian && SC.guardianDefeated) { SC.guardianDefeated(e); return; }
    if (!e.isBoss && G.lv) {
      G.lv.beat++;
      var hid = e.lastHeroId || G.hero.id;
      G.lv.beatAs[hid] = (G.lv.beatAs[hid] || 0) + 1;
    }
    if (e.type === 'dragon') { SC.dragonDefeated(e); return; }
    if (e.isBoss) {
      G.L.bossDefeated = true;
      SC.fx.shake(0.6);
      for (var i = 0; i < 12; i++) SC.spawnPickup('gem', e.x, e.y, i < 3 ? 5 : 1, { vh: SC.rand(4, 8), spread: SC.rand(1, 3) });
      SC.spawnPickup('heart', e.x, e.y); SC.spawnPickup('heart', e.x, e.y);
      var drop = !SC.isFree() && G.L.portalNeed > 0 && !G.L.replay;
      if (drop) SC.spawnPickup('block', e.x, e.y, 1, { vh: 7, spread: 0.5 });
      SC.banner('You beat ' + e.def.name + '!', drop ? 'It dropped a portal block! Grab it!' : 'Hooray!', 'star', 3);
      SC.audio.play('levelup');
      // summoned helpers go poof too
      for (var j = 0; j < G.enemies.length; j++) { var m = G.enemies[j]; if (m.summoned && m.alive) SC.killEnemy(m); }
      return;
    }
    if (e.trialGem) { for (var tg = 0; tg < 2; tg++) SC.spawnPickup('gem', e.x, e.y, 1); }
    else if (Math.random() < e.def.gem) { var n = SC.randInt(1, 2); for (var g = 0; g < n; g++) SC.spawnPickup('gem', e.x, e.y, 1); }
    if (Math.random() < 0.28) SC.spawnPickup('heart', e.x, e.y);
  };

  SC.popBubble = function (e, dmg) {
    var G = SC.G, t = SC.POWER_TABLE.surface, lv = e.bubbleLvl || 1;
    e.bubbleT = 0;
    SC.audio.play('pop');
    SC.fx.burst(e.x, 0.9, e.y, 'water', 14 + lv * 4);
    SC.popText(e.x, e.y - 0.3, 'POP!', '#bff6ff', true);
    e.lastPower = 'surface'; e.lastPowerT = G.simT;
    SC.hurtEnemy(e, dmg + t.pop[lv], 'sword', { kx: 0, ky: 0, air: true });
    G.effects.push({ kind: 'ring', x: e.x, y: e.y, r0: 0.3, r1: t.splashR[lv], color: 0x9fe8ff, t: 0, dur: 0.35, lvl: lv, scale: t.scale[lv] });
    for (var i = 0; i < G.enemies.length; i++) {
      var o = G.enemies[i];
      if (o === e || !o.alive) continue;
      var d = SC.dist(e.x, e.y, o.x, o.y);
      if (d < t.splashR[lv]) SC.hurtEnemy(o, t.splash[lv], 'surface', { kx: (o.x - e.x) / (d || 1) * 6, ky: (o.y - e.y) / (d || 1) * 6 });
    }
  };

  function moveToward(e, tx, ty, sp, dt) {
    var dx = tx - e.x, dy = ty - e.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var a = Math.atan2(dy, dx);
    if (e.detourT > 0) { e.detourT -= dt; a = e.detourA; }
    var who = e.type === 'ember' ? 'hot' : 'enemy';
    var ox = e.x, oy = e.y;
    W.move(e, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt, e.r * 0.9, who);
    var moved = SC.dist(ox, oy, e.x, e.y);
    if (moved < sp * dt * 0.3) { e.stuckT += dt; if (e.stuckT > 0.35) { e.stuckT = 0; e.detourT = 0.7; e.detourA = a + (Math.random() < 0.5 ? 1.6 : -1.6); } }
    else e.stuckT = 0;
    e.moving = true;
    return d;
  }
  SC.moveToward = moveToward;
  function moveAway(e, tx, ty, sp, dt) {
    var a = Math.atan2(e.y - ty, e.x - tx);
    W.move(e, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt, e.r * 0.9, 'enemy');
    e.moving = true;
  }
  function faceTo(e, tx, ty, rate, dt) {
    var a = Math.atan2(ty - e.y, tx - e.x);
    if (!rate) { e.face = a; return; }
    var d = SC.angDiff(e.face, a);
    e.face += SC.clamp(d, -rate * dt, rate * dt);
  }
  SC.faceTo = faceTo;

  SC.enemyShoot = function (e, kind, ang, speed, extra) {
    var G = SC.G;
    var pr = { kind: kind, x: e.x + Math.cos(ang) * (e.r + 0.15), y: e.y + Math.sin(ang) * (e.r + 0.15), vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      r: 0.18, life: 3, dmg: 0.5, h: 0.6, id: ++G.nextId };
    if (extra) for (var k in extra) pr[k] = extra[k];
    if (G.eprojs.length < 80) G.eprojs.push(pr);
    return pr;
  };

  function strike(e, p, range, dmg) {
    var d = SC.dist(e.x, e.y, p.x, p.y);
    var a = Math.atan2(p.y - e.y, p.x - e.x);
    e.kx += Math.cos(a) * 3; e.ky += Math.sin(a) * 3;
    if (d < range + e.r + p.r + 0.25) SC.hurtPlayer(dmg, e.x, e.y, { ground: true });
  }

  var AI = {
    melee: function (e, p, d, dt) {
      var def = e.def;
      if (e.state === 'windup') {
        e.st -= dt;
        faceTo(e, p.x, p.y, def.shield ? 2.5 : 0, dt);
        if (e.st <= 0) { strike(e, p, def.range, def.dmg); e.state = 'recover'; e.st = 1.0; }
        return;
      }
      if (e.state === 'recover') { e.st -= dt; if (e.st <= 0) e.state = 'chase'; return; }
      faceTo(e, p.x, p.y, def.shield ? 2.2 : 0, dt);
      if (d < def.range + e.r + 0.15) { e.state = 'windup'; e.st = 0.7 - Math.min(0.15, (SC.G.L.def.tier || 0) * 0.02); return; }
      moveToward(e, p.x, p.y, e.speed * (def.shield ? 0.9 : 1), dt);
    },
    ranged: function (e, p, d, dt) {
      var def = e.def;
      faceTo(e, p.x, p.y, 0, dt);
      if (e.state === 'windup') {
        e.st -= dt;
        if (e.st <= 0) {
          var a = Math.atan2(p.y - e.y, p.x - e.x);
          var sp = def.proj === 'pebble' ? 6.5 : def.proj === 'snow' ? 6 : 5.5;
          SC.enemyShoot(e, def.proj, a, sp, def.proj === 'snow' ? { slow: 1.2 } : null);
          SC.audio.play(def.proj === 'pebble' ? 'pebble' : 'spit');
          e.state = 'chase'; e.atkCd = def.rate * SC.rand(0.8, 1.25);
        }
        return;
      }
      e.atkCd -= dt;
      if (d < def.keep - 1) moveAway(e, p.x, p.y, e.speed, dt);
      else if (d > def.keep + 1.5) moveToward(e, p.x, p.y, e.speed, dt);
      else {
        e.wanderT -= dt;
        if (e.wanderT <= 0) { e.wanderT = SC.rand(1.2, 2.4); e.strafe = -e.strafe; }
        var sa = Math.atan2(p.y - e.y, p.x - e.x) + e.strafe * Math.PI / 2;
        W.move(e, Math.cos(sa) * e.speed * 0.6 * dt, Math.sin(sa) * e.speed * 0.6 * dt, e.r * 0.9, 'enemy');
        e.moving = true;
      }
      if (e.atkCd <= 0 && d < 9 && W.lineClear(e.x, e.y, p.x, p.y)) { e.state = 'windup'; e.st = 0.5; }
    },
    brute: function (e, p, d, dt) {
      if (e.state === 'windup') { e.st -= dt; return; }
      if (e.state === 'recover') { e.st -= dt; if (e.st <= 0) e.state = 'chase'; return; }
      faceTo(e, p.x, p.y, 3, dt);
      if (d < 2.2) {
        e.state = 'windup'; e.st = 1.0;
        var cx = e.x + Math.cos(e.face) * 0.7, cy = e.y + Math.sin(e.face) * 0.7;
        SC.audio.play('warn');
        SC.addWarn({ kind: 'circle', x: cx, y: cy, r: 1.7, dur: 1.0, owner: e, onDone: function () {
          if (!e.alive || e.frozenT > 0 || e.bubbleT > 0 || e.stunT > 0) { e.state = 'chase'; return; }
          SC.eachPlayer(function (pl) { if (SC.dist(cx, cy, pl.x, pl.y) < 1.7 + pl.r) SC.hurtPlayer(1, cx, cy, { ground: true }); });
          SC.fx.shake(0.4); SC.fx.burst(cx, 0.2, cy, 'rock', 14); SC.fx.ring(cx, cy, 0xd8c8a8, 1.7);
          SC.audio.play('slam');
          e.state = 'recover'; e.st = 1.1;
        } });
        return;
      }
      moveToward(e, p.x, p.y, e.speed, dt);
    },
    zig: function (e, p, d, dt) {
      e.st -= dt;
      if (e.state === 'dash') {
        W.move(e, Math.cos(e.dashA) * 7 * dt, Math.sin(e.dashA) * 7 * dt, e.r * 0.9, 'enemy');
        e.moving = true; e.face = e.dashA;
        if (!e.dashHit && d < e.r + p.r + 0.15) { e.dashHit = true; SC.hurtPlayer(e.def.dmg, e.x, e.y, { ground: true }); }
        if (Math.random() < 0.5) SC.fx.burst(e.x, 0.4, e.y, 'spark', 1);
        if (e.st <= 0) { e.state = 'pause'; e.st = SC.rand(0.45, 0.7); }
        return;
      }
      faceTo(e, p.x, p.y, 0, dt);
      if (e.st <= 0) {
        e.state = 'dash'; e.st = 0.32; e.dashHit = false; e.zz = -(e.zz || 1);
        e.dashA = Math.atan2(p.y - e.y, p.x - e.x) + e.zz * SC.rand(0.4, 0.8);
      }
    },
    blink: function (e, p, d, dt) {
      var def = e.def;
      e.st -= dt;
      switch (e.state) {
        case 'fadeOut':
          e.alpha = Math.max(0, e.st / 0.3);
          if (e.st <= 0) {
            var placed = false;
            for (var tries = 0; tries < 12 && !placed; tries++) {
              var a = Math.random() * Math.PI * 2, nx = p.x + Math.cos(a) * 1.5, ny = p.y + Math.sin(a) * 1.5;
              if (!W.blocked(nx, ny, e.r, 'enemy')) { e.x = nx; e.y = ny; placed = true; }
            }
            e.state = 'fadeIn'; e.st = 0.3; e.hidden = true;
            SC.fx.burst(e.x, 0.5, e.y, 'shadow', 10);
          }
          if (e.alpha < 0.3) e.hidden = true;
          return;
        case 'fadeIn':
          e.alpha = 1 - Math.max(0, e.st / 0.3);
          if (e.alpha > 0.4) e.hidden = false;
          if (e.st <= 0) { e.hidden = false; e.alpha = 1; e.state = 'windup'; e.st = 0.5; }
          return;
        case 'windup':
          faceTo(e, p.x, p.y, 0, dt);
          if (e.st <= 0) { strike(e, p, def.range, def.dmg); e.state = 'recover'; e.st = 0.6; }
          return;
        case 'recover':
          if (e.st <= 0) { e.state = 'drift'; e.st = SC.rand(1.6, 2.6); }
          return;
        default:
          faceTo(e, p.x, p.y, 0, dt);
          if (d < def.range + e.r + 0.15) { e.state = 'windup'; e.st = 0.5; return; }
          moveToward(e, p.x, p.y, e.speed * 0.7, dt);
          if (e.st <= 0 && d > 2) { e.state = 'fadeOut'; e.st = 0.3; SC.fx.burst(e.x, 0.5, e.y, 'shadow', 10); }
          else if (e.st <= 0) e.st = 1;
      }
    },
    ember: function (e, p, d, dt) {
      AI.melee(e, p, d, dt);
      e.trailT -= dt;
      if (e.moving && e.trailT <= 0) {
        e.trailT = 0.4;
        var G = SC.G;
        if (G.hazards.length < 40) G.hazards.push({ kind: 'flame', x: e.x, y: e.y, r: 0.32, t: 0, dur: 2.6 });
      }
    }
  };
  SC.AI = AI;

  SC.updateEnemies = function (dt) {
    var G = SC.G, p = G.player, list = G.enemies, two = G.players && G.players.length > 1;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e.alive) continue;
      // two players: each baddie deals with the hero nearest to it (that hero is the "context" while it thinks)
      if (two) { SC.useCtx(SC.nearestPlayer(e.x, e.y)); p = G.player; }
      var d = SC.dist(e.x, e.y, p.x, p.y);
      if (!e.aggro && !e.returning && !e.isBoss && d > 13) continue; // asleep far away
      e.anim += dt;
      e.moving = false;
      e.flash = Math.max(0, e.flash - dt);
      if (e.invulT > 0) e.invulT -= dt;
      // statuses
      if (e.burnT > 0) {
        e.burnT -= dt; e.burnTick -= dt;
        if (e.burnTick <= 0) { e.burnTick = 0.5; SC.hurtEnemy(e, e.burnDmg || 0.5, 'burn'); SC.fx.burst(e.x, 0.6 + e.h, e.y, 'fire', 3); if (!e.alive) continue; }
      }
      if (e.frozenT > 0) { e.frozenT -= dt; if (e.frozenT <= 0) SC.fx.burst(e.x, 0.5, e.y, 'ice', 10); }
      if (e.stunT > 0) e.stunT -= dt;
      if (e.slowT > 0) e.slowT -= dt;
      if (e.bubbleT > 0) {
        e.bubbleT -= dt;
        e.h = SC.lerp(e.h, 0.9 + Math.sin(e.anim * 3) * 0.12, Math.min(1, dt * 4));
        e.x += Math.sin(e.anim * 1.3) * 0.15 * dt;
        if (e.bubbleT <= 0) { SC.audio.play('pop'); SC.fx.burst(e.x, 0.9, e.y, 'water', 10); }
      } else if (e.spinT > 0) {
        e.spinT -= dt; e.spinA += dt * 18;
        e.h = SC.lerp(e.h, 1.3, Math.min(1, dt * 6));
        if (e.spinBy) { e.x = SC.lerp(e.x, e.spinBy.x, Math.min(1, dt * 8)); e.y = SC.lerp(e.y, e.spinBy.y, Math.min(1, dt * 8)); }
        if (e.spinT <= 0) {
          var ta = Math.random() * Math.PI * 2;
          e.kx = Math.cos(ta) * 12; e.ky = Math.sin(ta) * 12; e.vh = 4; e.spinBy = null;
          var tl = e.tossLvl || 1;
          e.kx *= 1 + (tl - 1) * 0.25; e.ky *= 1 + (tl - 1) * 0.25;
          SC.hurtEnemy(e, e.tossDmg || 3, 'wind', {});
          if (!e.alive) continue;
          e.stunT = Math.max(e.stunT, 0.6);
        }
      } else if (e.h > 0 || e.vh !== 0) {
        if (!(e.type === 'dragon')) {
          e.vh -= 18 * dt; e.h += e.vh * dt;
          if (e.h <= 0) { e.h = 0; e.vh = 0; }
        }
      }
      // knockback
      if (e.kx !== 0 || e.ky !== 0) {
        W.move(e, e.kx * dt, e.ky * dt, e.r * 0.9, e.type === 'ember' ? 'hot' : 'enemy');
        e.kx *= Math.pow(0.002, dt); e.ky *= Math.pow(0.002, dt);
        if (Math.abs(e.kx) < 0.05) e.kx = 0;
        if (Math.abs(e.ky) < 0.05) e.ky = 0;
      }
      var helpless = e.frozenT > 0 || e.bubbleT > 0 || e.stunT > 0 || e.spinT > 0;
      if (helpless) {
        if (e.state === 'windup' && !e.isBoss) e.state = 'recover', e.st = 0.4;
        continue;
      }
      // temple guardians sleep at the back of their temple until the hero walks into their chamber
      if (e.guardian && !e.aggro) {
        if (SC.guardianNotice && SC.guardianNotice(e, p)) { e.returning = false; SC.wakeBoss(e); continue; }
        if (!e.returning) { e.state = 'sleep'; continue; }
      }
      if (e.returning) {
        // walking back home after the hero ran away
        var hd = SC.dist(e.x, e.y, e.homeX, e.homeY);
        if (hd < 0.6) { e.returning = false; e.state = 'idle'; }
        else { moveToward(e, e.homeX, e.homeY, e.speed * 1.1, dt); faceTo(e, e.homeX, e.homeY, 0, dt); if (e.stuckT > 0.3 && hd < 2) e.returning = false; }
        e.returnT = (e.returnT || 0) + dt;
        if (e.returnT > 12) { e.returning = false; e.homeX = e.x; e.homeY = e.y; }
        continue;
      }
      if (!e.aggro) {
        if (e.isBoss) { if (d < 7.5) SC.wakeBoss(e); continue; }
        if (d < noticeR() && !p.dead) SC.wakeEnemy(e);
        else {
          e.wanderT -= dt;
          if (e.wanderT <= 0) {
            e.wanderT = SC.rand(1.5, 3); e.wanderGo = Math.random() < 0.6;
            e.wanderA = SC.dist(e.x, e.y, e.homeX, e.homeY) > 2.2 ? Math.atan2(e.homeY - e.y, e.homeX - e.x) + SC.rand(-0.5, 0.5) : Math.random() * Math.PI * 2;
          }
          if (e.wanderGo) {
            W.move(e, Math.cos(e.wanderA) * e.speed * 0.35 * dt, Math.sin(e.wanderA) * e.speed * 0.35 * dt, e.r * 0.9, e.type === 'ember' ? 'hot' : 'enemy');
            e.face = e.wanderA; e.moving = true;
          }
          continue;
        }
      }
      // leash: if the hero runs far from the camp (or the baddie got dragged far away), walk home
      if (!e.isBoss && !e.summoned) {
        var leash = leashR(), fromHome = SC.dist(e.x, e.y, e.homeX, e.homeY), heroFromHome = SC.dist(p.x, p.y, e.homeX, e.homeY);
        if (p.dead || heroFromHome > leash + 4 || fromHome > leash + 6) {
          e.aggro = false; e.returning = true; e.returnT = 0; e.state = 'idle';
          G.stats.leashed = (G.stats.leashed || 0) + 1;
          continue;
        }
      }
      if (p.dead) continue;
      var slowMul = e.slowT > 0 ? 0.5 : 1;
      var realDt = dt * slowMul;
      if (e.isBoss) SC.BOSS_AI[e.def.ai](e, p, d, realDt);
      else AI[e.def.ai](e, p, d, realDt);
      // keep out of the hero
      if (e.h < 0.5 && p.flyH < 0.5 && !p.gliding && !p.dead && !(e.type === 'dragon' && e.h > 0.3)) {
        var dd = SC.dist(e.x, e.y, p.x, p.y), minD = e.r + p.r;
        if (dd < minD && dd > 0.001) {
          var push = (minD - dd);
          if (e.isBoss) { W.move(p, (p.x - e.x) / dd * push, (p.y - e.y) / dd * push, p.r, 'player'); }
          else W.move(e, (e.x - p.x) / dd * push, (e.y - p.y) / dd * push, e.r * 0.9, 'enemy');
        }
      }
    }
    if (two) SC.useCtx(0);
    // little people do not stack on top of each other
    for (var a = 0; a < list.length; a++) {
      var A = list[a];
      if (!A.alive || A.isBoss || A.h > 0.3) continue;
      for (var b = a + 1; b < list.length; b++) {
        var B = list[b];
        if (!B.alive || B.isBoss || B.h > 0.3) continue;
        var dx = B.x - A.x, dy = B.y - A.y, md = A.r + B.r;
        if (Math.abs(dx) > md || Math.abs(dy) > md) continue;
        var dl = Math.sqrt(dx * dx + dy * dy);
        if (dl < md && dl > 0.001) {
          var o = (md - dl) * 0.5;
          W.move(A, -dx / dl * o, -dy / dl * o, A.r * 0.9, 'enemy');
          W.move(B, dx / dl * o, dy / dl * o, B.r * 0.9, 'enemy');
        }
      }
    }
    for (var r = list.length - 1; r >= 0; r--) if (!list[r].alive) list.splice(r, 1);
  };

  // ---------- enemy projectiles, ground warnings and fire trails ----------
  SC.updateEProjs = function (dt) {
    var G = SC.G;
    for (var i = G.eprojs.length - 1; i >= 0; i--) {
      var b = G.eprojs[i];
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      var gone = b.life <= 0 || W.projSolid(W.tile(Math.floor(b.x), Math.floor(b.y)));
      // shots only reach a low flyer (or a glider), not one high in the sky
      if (!gone && !b.harmless) SC.eachPlayer(function (p) {
        if (gone || p.flyH > 2.6 || SC.dist(b.x, b.y, p.x, p.y) >= b.r + p.r) return;
        SC.hurtPlayer(b.dmg, b.x - b.vx, b.y - b.vy, b.slow ? { slow: b.slow } : null);
        gone = true;
      });
      if (gone) {
        var kind = b.kind === 'blob' ? 'water' : b.kind === 'snow' ? 'ice' : b.kind === 'orb' ? 'shadow' : b.kind === 'bolt' ? 'spark' : b.kind === 'fireball' ? 'fire' :
          b.kind === 'rock' ? 'rock' : b.kind === 'bubbleball' ? 'bubble' : b.kind === 'blade' ? 'wind' : b.kind === 'seed' ? 'leaf' : 'dust';
        SC.fx.burst(b.x, b.h, b.y, kind, 6);
        G.eprojs.splice(i, 1);
      }
    }
  };
  SC.updateWarns = function (dt) {
    var G = SC.G;
    for (var i = G.warns.length - 1; i >= 0; i--) {
      var w = G.warns[i];
      w.t += dt;
      if (w.follow && w.t < w.dur * 0.6) { var fp = G.players && G.players.length > 1 ? G.players[SC.nearestPlayer(w.x, w.y)].p : G.player; w.x = SC.lerp(w.x, fp.x, Math.min(1, dt * 3)); w.y = SC.lerp(w.y, fp.y, Math.min(1, dt * 3)); }
      if (w.t >= w.dur) {
        G.warns.splice(i, 1);
        if (w.onDone) w.onDone(w);
      }
    }
  };
  SC.updateHazards = function (dt) {
    var G = SC.G;
    for (var i = G.hazards.length - 1; i >= 0; i--) {
      var hz = G.hazards[i];
      hz.t += dt;
      if (hz.t >= hz.dur) { G.hazards.splice(i, 1); continue; }
      SC.eachPlayer(function (p) { if (SC.dist(hz.x, hz.y, p.x, p.y) < hz.r + p.r * 0.7) SC.hurtPlayer(0.5, undefined, undefined, { ground: true }); });
    }
  };
})();
