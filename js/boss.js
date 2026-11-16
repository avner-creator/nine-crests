// Nine Crests - mini-boss brains and the Dragon. Every attack shows a warning on the ground first.
(function () {
  'use strict';
  var SC = window.SC, W = SC.world;

  SC.wakeBoss = function (e) {
    var G = SC.G;
    if (e.aggro) return;
    if (e.guardian && SC.guardianWake) { SC.guardianWake(e); return; }
    e.aggro = true; e.state = 'idle'; e.st = 1.0; e.atkCd = 1.2; e.summonT = 6;
    G.boss = e;
    SC.audio.play('roar');
    SC.fx.shake(0.4);
    if (e.type === 'dragon') { SC.banner('The Dragon!', 'Ice and Water hurt it the most!', 'dragon', 3); }
    else SC.toast(e.def.name + ' wants to fight!', 2.6);
  };
  SC.resetBoss = function (e) {
    e.hp = e.maxHp; e.x = e.spawnX; e.y = e.spawnY; e.aggro = false; e.state = 'idle'; e.st = 0; e.h = 0; e.vh = 0;
    e.kx = e.ky = 0; e.acting = false; e.phase = 1; e.burnT = 0; e.slowT = 0; e.hidden = false; e.alpha = 1; e.invulT = 0;
    if (e.guardian) { e.state = 'sleep'; e.returning = false; e.awayT = 0; e.after = null; e.atkI = 0; }
  };

  function summon(e, type, n) {
    var G = SC.G, count = 0;
    for (var i = 0; i < G.enemies.length; i++) if (G.enemies[i].summoned && G.enemies[i].alive) count++;
    for (var k = 0; k < n && count < 4; k++) {
      var a = Math.random() * Math.PI * 2, x = e.x + Math.cos(a) * 1.6, y = e.y + Math.sin(a) * 1.6;
      if (W.blocked(x, y, 0.3, type === 'ember' ? 'hot' : 'enemy')) continue;
      var m = SC.makeEnemy(type, x, y, { summoned: true, aggro: true });
      m.hp = m.maxHp = SC.ENEMIES[type].hp * 0.8;
      G.enemies.push(m);
      SC.fx.burst(x, 0.5, y, type === 'shadow' ? 'shadow' : type === 'ember' ? 'fire' : 'smoke', 12);
      count++;
    }
  }
  function slamWarn(e, x, y, r, dur, dmg) {
    SC.audio.play('warn');
    SC.addWarn({ kind: 'circle', x: x, y: y, r: r, dur: dur, owner: e, onDone: function () {
      if (!e.alive) return;
      SC.eachPlayer(function (p) { if (SC.dist(x, y, p.x, p.y) < r + p.r) SC.hurtPlayer(dmg || 1, x, y, { ground: true }); });
      SC.fx.shake(0.5); SC.fx.burst(x, 0.2, y, 'rock', 16); SC.fx.ring(x, y, 0xe0d0b0, r);
      SC.audio.play('slam');
    } });
  }
  function lineWarn(e, ang, len, dur) {
    SC.addWarn({ kind: 'line', x: e.x, y: e.y, ang: ang, len: len, width: 1.1, dur: dur, owner: e });
    SC.audio.play('warn');
  }
  function charge(e, p, dt, speed) {
    var hitWall = W.move(e, Math.cos(e.chargeA) * speed * dt, Math.sin(e.chargeA) * speed * dt, e.r * 0.9, 'enemy');
    e.moving = true; e.face = e.chargeA;
    if (!e.chargeHit && SC.dist(e.x, e.y, p.x, p.y) < e.r + p.r + 0.1) { e.chargeHit = true; SC.hurtPlayer(1, e.x, e.y, { ground: true }); }
    if (Math.random() < 0.6) SC.fx.burst(e.x, 0.15, e.y, 'dust', 1);
    return hitWall;
  }
  function circleAround(e, p, want, dt, sp) {
    var d = SC.dist(e.x, e.y, p.x, p.y);
    var a = Math.atan2(e.y - p.y, e.x - p.x) + e.strafe * 0.5;
    var tx = p.x + Math.cos(a) * want, ty = p.y + Math.sin(a) * want;
    SC.moveToward(e, tx, ty, sp, dt);
    SC.faceTo(e, p.x, p.y, 0, dt);
    return d;
  }

  // shared attack helpers (the temple guardians in guardians.js use them too)
  SC.bossKit = { summon: summon, slamWarn: slamWarn, lineWarn: lineWarn, charge: charge, circleAround: circleAround };
  var B = SC.BOSS_AI = {};

  B.chief = function (e, p, d, dt) {
    e.st -= dt; e.atkCd -= dt; e.summonT -= dt;
    if (e.state === 'windup' || e.state === 'recover') { if (e.st <= 0) { e.state = e.state === 'windup' ? 'recover' : 'chase'; e.st = 1.0; } return; }
    SC.faceTo(e, p.x, p.y, 3, dt);
    if (e.summonT <= 0) { e.summonT = 9; summon(e, 'grump', 2); SC.toast('Chief Grump calls his friends!'); return; }
    if (d < 2.6 && e.atkCd <= 0) {
      e.state = 'windup'; e.st = 0.95; e.atkCd = 1.6;
      var cx = e.x + Math.cos(e.face) * 1.0, cy = e.y + Math.sin(e.face) * 1.0;
      slamWarn(e, cx, cy, 1.5, 0.95, 1);
      return;
    }
    SC.moveToward(e, p.x, p.y, e.speed, dt);
  };

  B.captain = function (e, p, d, dt) {
    e.st -= dt;
    switch (e.state) {
      case 'spit':
        SC.faceTo(e, p.x, p.y, 0, dt);
        if (e.st <= 0) {
          var a = Math.atan2(p.y - e.y, p.x - e.x);
          for (var i = -1; i <= 1; i++) SC.enemyShoot(e, 'blob', a + i * 0.32, 5.5);
          SC.audio.play('spit');
          e.state = 'move'; e.st = SC.rand(1.6, 2.4); e.next = 'charge';
        }
        return;
      case 'chargeWind':
        if (e.st <= 0) { e.state = 'charge'; e.st = 0.6; e.chargeHit = false; }
        return;
      case 'charge':
        if (charge(e, p, dt, 9) || e.st <= 0) { e.state = 'dizzy'; e.st = 1.0; }
        return;
      case 'dizzy':
        if (e.st <= 0) { e.state = 'move'; e.st = 1.8; e.next = 'spit'; }
        return;
      default:
        circleAround(e, p, 4, dt, e.speed);
        if (e.st <= 0) {
          if (e.next === 'charge') { e.state = 'chargeWind'; e.st = 0.85; e.chargeA = Math.atan2(p.y - e.y, p.x - e.x); e.face = e.chargeA; lineWarn(e, e.chargeA, 8, 0.85); }
          else { e.state = 'spit'; e.st = 0.5; }
        }
    }
  };

  B.brr = function (e, p, d, dt) {
    e.st -= dt; e.atkCd -= dt;
    if (e.state === 'windup' || e.state === 'recover' || e.state === 'throw') {
      if (e.state === 'throw' && e.st <= 0) {
        var a = Math.atan2(p.y - e.y, p.x - e.x);
        for (var i = -2; i <= 2; i++) SC.enemyShoot(e, 'snow', a + i * 0.28, 5.5, { slow: 1.2 });
        SC.audio.play('spit');
        e.state = 'recover'; e.st = 0.8;
      } else if (e.st <= 0) { e.state = e.state === 'windup' ? 'recover' : 'chase'; e.st = 1.0; }
      return;
    }
    SC.faceTo(e, p.x, p.y, 2.5, dt);
    if (e.atkCd <= 0) {
      e.atkCd = 2.2;
      if (d < 2.8) { e.state = 'windup'; e.st = 1.0; slamWarn(e, e.x, e.y, 2.1, 1.0, 1); return; }
      if (d < 9) { e.state = 'throw'; e.st = 0.55; return; }
    }
    SC.moveToward(e, p.x, p.y, e.speed, dt);
  };

  B.zap = function (e, p, d, dt) {
    e.st -= dt;
    switch (e.state) {
      case 'cast':
        if (e.st <= 0) {
          var spots = [[p.x, p.y], [p.x + SC.rand(-2, 2), p.y + SC.rand(-2, 2)], [p.x + SC.rand(-2, 2), p.y + SC.rand(-2, 2)]];
          spots.forEach(function (s, k) { SC.stormStrike(s[0], s[1], 1.0, 1.1 + k * 0.2, e); });
          e.state = 'move'; e.st = 2.0; e.next = 'charge';
        }
        return;
      case 'chargeWind':
        if (e.st <= 0) { e.state = 'charge'; e.st = 0.55; e.chargeHit = false; }
        return;
      case 'charge':
        if (Math.random() < 0.5) SC.fx.burst(e.x, 0.6, e.y, 'spark', 1);
        if (charge(e, p, dt, 10) || e.st <= 0) { e.state = 'dizzy'; e.st = 0.9; }
        return;
      case 'dizzy':
        if (e.st <= 0) { e.state = 'move'; e.st = 1.6; e.next = 'cast'; }
        return;
      default:
        circleAround(e, p, 3.6, dt, e.speed);
        if (e.st <= 0) {
          if (e.next === 'charge') { e.state = 'chargeWind'; e.st = 0.8; e.chargeA = Math.atan2(p.y - e.y, p.x - e.x); e.face = e.chargeA; lineWarn(e, e.chargeA, 9, 0.8); }
          else { e.state = 'cast'; e.st = 0.5; SC.audio.play('warn'); }
        }
    }
  };

  B.gloomo = function (e, p, d, dt) {
    e.st -= dt;
    switch (e.state) {
      case 'orbs':
        SC.faceTo(e, p.x, p.y, 0, dt);
        if (e.st <= 0) {
          var a = Math.atan2(p.y - e.y, p.x - e.x);
          for (var i = -1; i <= 1; i++) SC.enemyShoot(e, 'orb', a + i * 0.4, 3.8, { r: 0.25, life: 4 });
          SC.audio.play('death');
          e.state = 'float'; e.st = 2.0;
        }
        return;
      case 'fadeOut':
        e.alpha = Math.max(0, e.st / 0.4); e.hidden = e.alpha < 0.3;
        if (e.st <= 0) {
          for (var t = 0; t < 14; t++) {
            var ang = Math.random() * Math.PI * 2, r = SC.rand(3, 5), nx = p.x + Math.cos(ang) * r, ny = p.y + Math.sin(ang) * r;
            if (!W.blocked(nx, ny, e.r, 'enemy')) { e.x = nx; e.y = ny; break; }
          }
          SC.fx.burst(e.x, 0.8, e.y, 'shadow', 16);
          e.state = 'fadeIn'; e.st = 0.4;
        }
        return;
      case 'fadeIn':
        e.alpha = 1 - Math.max(0, e.st / 0.4); e.hidden = e.alpha < 0.3;
        if (e.st <= 0) { e.alpha = 1; e.hidden = false; e.state = 'orbs'; e.st = 0.6; }
        return;
      case 'summon':
        if (e.st <= 0) { summon(e, Math.random() < 0.5 ? 'shadow' : 'grump', 2); e.state = 'float'; e.st = 2.2; }
        return;
      default:
        circleAround(e, p, 4.2, dt, e.speed);
        if (e.st <= 0) {
          var roll = Math.random();
          var helpers = 0;
          for (var k = 0; k < SC.G.enemies.length; k++) if (SC.G.enemies[k].summoned && SC.G.enemies[k].alive) helpers++;
          if (roll < 0.3 && helpers < 3) { e.state = 'summon'; e.st = 0.8; SC.toast('Gloomo calls shadow friends!'); SC.fx.burst(e.x, 1.2, e.y, 'shadow', 20); }
          else if (roll < 0.6) { e.state = 'fadeOut'; e.st = 0.4; SC.fx.burst(e.x, 0.8, e.y, 'shadow', 16); }
          else { e.state = 'orbs'; e.st = 0.6; }
        }
    }
  };

  // ---------------- the mini-bosses of the new places ----------------
  // They walk around the hero, then pick their next attack in turn. Every attack first shows its warning on the ground
  // (state 'windup', the red "!" over the head), then strikes; some attacks then move for a moment (state cfg.atks[x].state).
  // cfg: { want: distance to keep, rest: pause between attacks, order: [attack names], atks: { name: { tele, warn(e, p), go(e, p),
  //        tick(e, p, dt) -> true when done, dur, state, rec, dizzy, near } } }
  function miniBoss(e, p, d, dt, cfg) {
    e.st -= dt;
    var A = cfg.atks[e.atk];
    if (e.state === 'windup') {
      if (A.track) SC.faceTo(e, p.x, p.y, 2.5, dt);
      if (e.st <= 0) {
        if (A.go) A.go(e, p);
        if (A.tick) { e.state = A.state || 'act'; e.acting = true; e.st = A.dur || 0.6; }
        else { e.state = 'recover'; e.st = A.rec || 0.9; }
      }
      return;
    }
    if (e.acting) {
      if (A.tick(e, p, dt) || e.st <= 0) { e.acting = false; e.h = 0; e.state = A.dizzy ? 'dizzy' : 'recover'; e.st = A.rec || 0.9; }
      return;
    }
    if (e.state === 'recover' || e.state === 'dizzy') { if (e.st <= 0) { e.state = 'move'; e.st = cfg.rest * SC.rand(0.8, 1.2); } return; }
    if (e.state !== 'move') { e.state = 'move'; e.st = Math.max(e.st, 0.6); }
    circleAround(e, p, cfg.want, dt, e.speed);
    if (e.st > 0) return;
    for (var tries = 0; tries < cfg.order.length; tries++) {
      e.atkI = (e.atkI || 0) + 1;
      e.atk = cfg.order[(e.atkI - 1) % cfg.order.length];
      A = cfg.atks[e.atk];
      if (!A.near || d < A.near) break;
    }
    e.state = 'windup'; e.st = A.tele;
    SC.faceTo(e, p.x, p.y, 0, dt);
    A.warn(e, p);
    SC.audio.play('warn');
  }
  // a warning circle that hurts (1 heart) when it fills, with a little effect
  function bossCircle(e, x, y, r, dur, color, fx, sound, extra) {
    SC.addWarn({ kind: 'circle', x: x, y: y, r: r, dur: dur, owner: e, color: color, onDone: function () {
      if (!e.alive) return;
      SC.eachPlayer(function (pl) { if (SC.dist(x, y, pl.x, pl.y) < r + pl.r) SC.hurtPlayer(1, x, y, { ground: true }); });
      SC.fx.burst(x, 0.3, y, fx, 14); if (sound) SC.audio.play(sound);
      if (extra) extra();
    } });
  }
  // a warning line from the boss that hurts along its length when it fills
  function bossLine(e, ang, len, width, dur, color, fx) {
    var x0 = e.x, y0 = e.y;
    SC.addWarn({ kind: 'line', x: x0, y: y0, ang: ang, len: len, width: width, dur: dur, owner: e, color: color, onDone: function () {
      if (!e.alive) return;
      SC.eachPlayer(function (pl) {
        var dx = pl.x - x0, dy = pl.y - y0, along = dx * Math.cos(ang) + dy * Math.sin(ang), side = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
        if (along > -0.3 && along < len + 0.3 && side < width / 2 + pl.r) SC.hurtPlayer(1, x0, y0, { ground: true });
      });
      for (var s = 1; s <= len; s += 1.1) {
        var sx = x0 + Math.cos(ang) * s, sy = y0 + Math.sin(ang) * s;
        if (fx === 'rock' || fx === 'leaf') SC.G.effects.push({ kind: 'spike', x: sx, y: sy, t: 0, dur: 0.7, s: 0.9, rot: Math.random() * 6, lvl: 1, scale: 1 });
        SC.fx.burst(sx, 0.3, sy, fx, 4);
      }
      SC.audio.play(fx === 'rock' ? 'earth' : 'cut');
    } });
  }
  SC.bossKit.circle = bossCircle; SC.bossKit.line = bossLine;

  // King Drizzle (Rainy Isles): rain clouds drop big drops, a belly-flop hop, a fan of water blobs
  var DRIZZLE = { want: 3.8, rest: 1.5, order: ['rain', 'hop', 'spit'], atks: {
    rain: { tele: 1.25, rec: 0.6, warn: function (e, p) {
      var spots = [[p.x, p.y]];
      for (var i = 0; i < 3; i++) { var a = Math.random() * Math.PI * 2, r = SC.rand(1.6, 2.8); spots.push([p.x + Math.cos(a) * r, p.y + Math.sin(a) * r]); }
      spots.forEach(function (s, k) { var dur = 1.25 + k * 0.15; SC.G.effects.push({ kind: 'meteor', model: 'blob', fx: 'water', x: s[0], y: s[1], t: 0, dur: dur, scale: 2.4, fromX: 0.01, fromY: 0.01 }); bossCircle(e, s[0], s[1], 0.95, dur, '#4ab8ff', 'water', 'water'); });
      SC.toast('King Drizzle makes it rain!', 2);
    } },
    hop: { tele: 1.0, dur: 0.42, state: 'leap', rec: 1.0, warn: function (e, p) {
      e.leapTo = { x: p.x, y: p.y };
      bossCircle(e, p.x, p.y, 1.7, 1.42, '#4ab8ff', 'water', 'slam', function () { SC.fx.shake(0.4); SC.fx.ring(e.x, e.y, 0x9fdcff, 1.7); });
    }, go: function (e) { e.leapFrom = { x: e.x, y: e.y }; }, tick: function (e, p, dt) {
      var f = 1 - Math.max(0, e.st) / 0.42;
      e.x = SC.lerp(e.leapFrom.x, e.leapTo.x, f); e.y = SC.lerp(e.leapFrom.y, e.leapTo.y, f); e.h = Math.sin(f * Math.PI) * 2.2;
      if (e.st <= 0) { e.x = e.leapTo.x; e.y = e.leapTo.y; e.h = 0; W.unstick(e, e.r * 0.9, 'enemy'); return true; }
      return false;
    } },
    spit: { tele: 0.7, rec: 0.8, track: true, warn: function (e, p) {
      e.aimA = Math.atan2(p.y - e.y, p.x - e.x);
      for (var i = -1; i <= 1; i++) SC.addWarn({ kind: 'line', x: e.x, y: e.y, ang: e.aimA + i * 0.35, len: 6, width: 0.6, dur: 0.7, owner: e, color: '#4ab8ff' });
    }, go: function (e) { for (var i = -1; i <= 1; i++) SC.enemyShoot(e, 'blob', e.aimA + i * 0.35, 5.5); SC.audio.play('spit'); } }
  } };
  B.drizzle = function (e, p, d, dt) { miniBoss(e, p, d, dt, DRIZZLE); };

  // Sparkhorn (Thunder Plains): three lightning bolts in a row, a charge, a stomp ring
  var SPARKHORN = { want: 3.6, rest: 1.3, order: ['bolts', 'charge', 'stomp'], atks: {
    bolts: { tele: 0.55, rec: 0.9, warn: function (e, p) {
      var a = Math.atan2(p.y - e.y, p.x - e.x);
      for (var k = 0; k < 3; k++) SC.stormStrike(p.x + Math.cos(a) * (k - 1) * 1.7, p.y + Math.sin(a) * (k - 1) * 1.7, 0.95, 1.15 + k * 0.25, e);
    } },
    charge: { tele: 0.85, dur: 0.6, state: 'charge', dizzy: true, rec: 1.0, warn: function (e, p) {
      e.chargeA = Math.atan2(p.y - e.y, p.x - e.x); e.face = e.chargeA;
      SC.addWarn({ kind: 'line', x: e.x, y: e.y, ang: e.chargeA, len: 9, width: 1.1, dur: 0.85, owner: e, color: '#ffe14a' });
    }, go: function (e) { e.chargeHit = false; }, tick: function (e, p, dt) {
      if (Math.random() < 0.5) SC.fx.burst(e.x, 0.6, e.y, 'spark', 1);
      return charge(e, p, dt, 9.5);
    } },
    stomp: { tele: 1.0, near: 4.5, rec: 0.9, warn: function (e) {
      bossCircle(e, e.x, e.y, 2.6, 1.0, '#ffe14a', 'spark', 'zap', function () { SC.fx.shake(0.45); SC.fx.ring(e.x, e.y, 0xffe14a, 2.6); });
    } }
  } };
  B.sparkhorn = function (e, p, d, dt) { miniBoss(e, p, d, dt, SPARKHORN); };

  // Boulderback (Stone Canyon): lobs a boulder, a line of rock spikes, a ground slam
  var BOULDERBACK = { want: 3.1, rest: 1.5, order: ['lob', 'line', 'slam'], atks: {
    lob: { tele: 0.5, rec: 1.0, warn: function (e, p) {
      var x = p.x, y = p.y;
      SC.G.effects.push({ kind: 'meteor', model: 'rock', fx: 'dust', x: x, y: y, t: 0, dur: 1.25, scale: 3.2, fromX: (e.x - x) * 0.6, fromY: (y - e.y) * 0.6 });
      bossCircle(e, x, y, 1.4, 1.25, '#ff8a3a', 'rock', 'slam', function () { SC.fx.shake(0.4); SC.fx.burst(x, 0.3, y, 'dust', 12); });
    } },
    line: { tele: 1.0, rec: 0.9, track: false, warn: function (e, p) {
      var a = Math.atan2(p.y - e.y, p.x - e.x); e.face = a;
      bossLine(e, a, 7, 1.2, 1.0, '#ff8a3a', 'rock');
    } },
    slam: { tele: 0.95, near: 3.8, rec: 1.0, warn: function (e) {
      slamWarn(e, e.x + Math.cos(e.face) * 1.1, e.y + Math.sin(e.face) * 1.1, 1.8, 0.95, 1);
    } }
  } };
  B.boulderback = function (e, p, d, dt) { miniBoss(e, p, d, dt, BOULDERBACK); };

  // Snapjaw (Bloom Jungle): spore clouds pop up around it, a fan of seeds, a vine lash
  var SNAPJAW = { want: 4.0, rest: 1.3, order: ['spores', 'seeds', 'vine'], atks: {
    spores: { tele: 1.1, rec: 0.7, warn: function (e, p) {
      var spots = [[p.x, p.y]];
      for (var i = 0; i < 4; i++) { var a = i / 4 * Math.PI * 2 + Math.random(); spots.push([e.x + Math.cos(a) * 2.6, e.y + Math.sin(a) * 2.6]); }
      spots.forEach(function (s) { bossCircle(e, s[0], s[1], 0.95, 1.1, '#9ae04a', 'leaf', 'life', function () { SC.fx.burst(s[0], 0.5, s[1], 'puff', 8); }); });
    } },
    seeds: { tele: 0.75, rec: 0.8, track: true, warn: function (e, p) {
      e.aimA = Math.atan2(p.y - e.y, p.x - e.x);
      for (var i = -2; i <= 2; i++) SC.addWarn({ kind: 'line', x: e.x, y: e.y, ang: e.aimA + i * 0.3, len: 6, width: 0.5, dur: 0.75, owner: e, color: '#9ae04a' });
    }, go: function (e) { for (var i = -2; i <= 2; i++) SC.enemyShoot(e, 'seed', e.aimA + i * 0.3, 5.2, { dmg: 1 }); SC.audio.play('spit'); } },
    vine: { tele: 0.9, rec: 0.9, warn: function (e, p) {
      var a = Math.atan2(p.y - e.y, p.x - e.x); e.face = a;
      bossLine(e, a, 6.5, 1.1, 0.9, '#5ad04a', 'leaf');
    } }
  } };
  B.snapjaw = function (e, p, d, dt) { miniBoss(e, p, d, dt, SNAPJAW); };

  // A lightning strike from the sky with a warning circle first (storm level hazard and Sir Zap).
  SC.stormStrike = function (x, y, r, dur, owner) {
    SC.addWarn({ kind: 'circle', x: x, y: y, r: r, dur: dur, color: '#ffe14a', owner: owner, onDone: function () {
      var G = SC.G;
      if (owner && !owner.alive) return;
      G.effects.push({ kind: 'bolt', pts: [x, y, x, y], sky: true, t: 0, dur: 0.3, h: 0 });
      SC.fx.flash(0xffffff, 0.15);
      SC.fx.burst(x, 0.3, y, 'spark', 16);
      SC.audio.play('thunder');
      SC.eachPlayer(function (p) { if (SC.dist(x, y, p.x, p.y) < r + p.r && p.flyH < 2.6) SC.hurtPlayer(1, x, y); });
    } });
  };

  // ---------------- THE DRAGON ----------------
  // States: idle, breathWind, breath, tailWind, tail, summon, flyUp, flyFollow, slamWarn, slam, landed, rain, roar
  B.dragon = function (e, p, d, dt) {
    var G = SC.G;
    var fast = e.phase === 3 ? 1.35 : 1;
    e.st -= dt * fast;
    e.atkCd -= dt * fast;
    // phase changes
    var frac = e.hp / e.maxHp;
    if (e.phase === 1 && frac <= 2 / 3 && e.h < 0.1) { e.phase = 2; e.state = 'roar'; e.st = 1.2; SC.audio.play('roar'); SC.fx.shake(0.6); SC.banner('The Dragon takes flight!', 'Watch its shadow and dodge!', 'dragon', 2.6); return; }
    if (e.phase === 2 && frac <= 1 / 3 && e.h < 0.1) { e.phase = 3; e.state = 'roar'; e.st = 1.2; SC.audio.play('roar'); SC.fx.shake(0.7); SC.banner('The Dragon is ANGRY!', 'It is faster now. You can do it!', 'dragon', 2.6); return; }
    var headX = e.x + Math.cos(e.face) * 1.7, headY = e.y + Math.sin(e.face) * 1.7;
    e.headX = headX; e.headY = headY;
    switch (e.state) {
      case 'roar':
        if (e.st <= 0) { e.state = 'idle'; e.st = 0.6; }
        return;
      case 'breathWind':
        if (e.st <= 0) { e.state = 'breath'; e.st = 1.3; e.breathT = 0; SC.audio.play('breath'); }
        return;
      case 'breath':
        e.breathT += dt * fast;
        var ba = e.breathA;
        if (e.sweep) ba = e.breathA + SC.lerp(-0.8, 0.8, SC.clamp(e.breathT / 1.3, 0, 1)) * e.sweep;
        e.face = ba; e.curBreathA = ba;
        var pd = SC.dist(headX, headY, p.x, p.y), pa = Math.atan2(p.y - headY, p.x - headX);
        if (pd < 6.2 && Math.abs(SC.angDiff(ba, pa)) < 0.42 + 0.25 / Math.max(1, pd)) SC.hurtPlayer(1, headX, headY);
        if (e.st <= 0) { e.state = 'idle'; e.st = 1.1; }
        return;
      case 'tailWind':
        if (e.st <= 0) {
          e.state = 'tail'; e.st = 0.35;
          if (SC.dist(e.x, e.y, p.x, p.y) < 3.2 + p.r) SC.hurtPlayer(1, e.x, e.y, { ground: true });
          SC.fx.shake(0.35); SC.fx.burst(e.x, 0.3, e.y, 'dust', 20); SC.fx.ring(e.x, e.y, 0xffc080, 3.2);
          SC.audio.play('slam');
        }
        return;
      case 'tail':
        e.spinA += dt * 14;
        if (e.st <= 0) { e.state = 'idle'; e.st = 0.9; }
        return;
      case 'summon':
        if (e.st <= 0) { summon(e, 'ember', 2); e.state = 'idle'; e.st = 1.0; }
        return;
      case 'flyUp':
        e.h = Math.min(3.6, e.h + dt * 7 * fast);
        if (e.st <= 0) { e.state = 'flyFollow'; e.st = 2.4; }
        return;
      case 'flyFollow':
        e.h = 3.6;
        SC.moveToward(e, p.x, p.y, 4.6 * fast, dt);
        if (e.st <= 0) {
          e.state = 'slamWarn'; e.st = 0.9;
          e.slamX = p.x; e.slamY = p.y;
          SC.addWarn({ kind: 'circle', x: p.x, y: p.y, r: 2.2, dur: 0.9 / fast, owner: e });
          SC.audio.play('warn');
        }
        return;
      case 'slamWarn':
        e.x = SC.lerp(e.x, e.slamX, Math.min(1, dt * 6)); e.y = SC.lerp(e.y, e.slamY, Math.min(1, dt * 6));
        if (e.st <= 0) { e.state = 'slam'; e.st = 0.18; }
        return;
      case 'slam':
        e.h = Math.max(0, e.h - dt * 40);
        if (e.h <= 0) {
          W.unstick(e, 1.0, 'enemy');
          if (SC.dist(e.slamX, e.slamY, p.x, p.y) < 2.2 + p.r) SC.hurtPlayer(1, e.slamX, e.slamY, { ground: true });
          SC.fx.shake(0.9); SC.fx.burst(e.x, 0.2, e.y, 'rock', 26); SC.fx.burst(e.x, 0.3, e.y, 'dust', 20); SC.fx.ring(e.x, e.y, 0xffb070, 2.4);
          SC.audio.play('slam');
          e.state = 'landed'; e.st = 1.8;
        }
        return;
      case 'landed':
        if (e.st <= 0) { e.state = 'idle'; e.st = 0.5; }
        return;
      case 'rain':
        if (e.st <= 0) { e.state = 'idle'; e.st = 1.6; }
        return;
      default: // idle: walk to a good spot and pick the next attack
        SC.faceTo(e, p.x, p.y, 3 * fast, dt);
        if (d > 5.5) SC.moveToward(e, p.x, p.y, e.speed * fast, dt);
        else if (d < 3.5 && e.phase > 1 && Math.random() < 0.01) SC.moveToward(e, e.spawnX, e.spawnY, e.speed, dt);
        if (e.st > 0) return;
        var choice;
        if (d < 3.2) choice = 'tail';
        else {
          var r = Math.random(), minions = 0;
          for (var i = 0; i < G.enemies.length; i++) if (G.enemies[i].summoned && G.enemies[i].alive) minions++;
          if (e.phase === 1) choice = r < 0.65 ? 'breath' : (minions < 3 ? 'summon' : 'breath');
          else if (e.phase === 2) choice = r < 0.35 ? 'fly' : r < 0.6 ? 'rain' : r < 0.85 ? 'breath' : (minions < 2 ? 'summon' : 'breath');
          else choice = r < 0.3 ? 'fly' : r < 0.55 ? 'rain' : r < 0.9 ? 'breath' : (minions < 3 ? 'summon' : 'fly');
        }
        if (e.forceNext) { choice = e.forceNext; e.forceNext = null; }
        startDragon(e, p, choice);
    }
  };

  function startDragon(e, p, choice) {
    var G = SC.G, fast = e.phase === 3 ? 1.35 : 1;
    e.lastAttack = choice;
    if (choice === 'tail') {
      e.state = 'tailWind'; e.st = 0.75;
      SC.addWarn({ kind: 'circle', x: e.x, y: e.y, r: 3.2, dur: 0.75 / fast, owner: e, follow: false, color: '#ff8a1a' });
      SC.audio.play('warn');
    } else if (choice === 'breath') {
      e.state = 'breathWind'; e.st = 1.0;
      e.breathA = Math.atan2(p.y - e.y, p.x - e.x); e.face = e.breathA;
      e.sweep = e.phase === 3 ? (Math.random() < 0.5 ? 1 : -1) : 0;
      var hx = e.x + Math.cos(e.face) * 1.7, hy = e.y + Math.sin(e.face) * 1.7;
      SC.addWarn({ kind: 'cone', x: hx, y: hy, ang: e.breathA, len: 6.2, half: e.sweep ? 1.2 : 0.45, dur: 1.0 / fast, owner: e, color: '#ff6a00' });
      SC.audio.play('roar');
    } else if (choice === 'summon') {
      e.state = 'summon'; e.st = 0.8; SC.audio.play('roar');
      SC.toast('The Dragon calls Emberlings!');
    } else if (choice === 'fly') {
      e.state = 'flyUp'; e.st = 0.7; SC.audio.play('wind');
      SC.fx.burst(e.x, 0.3, e.y, 'dust', 24);
    } else if (choice === 'rain') {
      e.state = 'rain'; e.st = 1.2; SC.audio.play('roar');
      var n = e.phase === 3 ? 9 : 6;
      for (var i = 0; i < n; i++) {
        var x = p.x + SC.rand(-3.5, 3.5), y = p.y + SC.rand(-3.5, 3.5);
        if (i === 0) { x = p.x; y = p.y; }
        (function (x, y, delay) {
          var dur = 1.25 + delay;
          G.effects.push({ kind: 'meteor', x: x, y: y, t: 0, dur: dur });
          SC.addWarn({ kind: 'circle', x: x, y: y, r: 0.95, dur: dur, owner: e, color: '#ff5a1a', onDone: function () {
            SC.eachPlayer(function (pl) { if (SC.dist(x, y, pl.x, pl.y) < 0.95 + pl.r) SC.hurtPlayer(1, x, y); });
            SC.fx.burst(x, 0.3, y, 'fire', 14); SC.fx.burst(x, 0.5, y, 'smoke', 4);
            SC.audio.play('boom');
          } });
        })(x, y, i * 0.12);
      }
    }
  }
  SC.startDragon = startDragon;

  SC.dragonDefeated = function (e) {
    var G = SC.G;
    G.boss = e;
    G.dragonDeadT = 0.001;
    G.winX = e.x; G.winY = e.y;
    SC.fx.shake(1);
    SC.audio.play('roar');
    G.warns.length = 0; G.eprojs.length = 0; G.hazards.length = 0;
    for (var j = 0; j < G.enemies.length; j++) { var m = G.enemies[j]; if (m.alive && m !== e) SC.killEnemy(m); }
    for (var i = 0; i < 20; i++) SC.spawnPickup('gem', e.x, e.y, i < 6 ? 5 : 1, { vh: SC.rand(5, 9), spread: SC.rand(1, 4) });
  };
})();
