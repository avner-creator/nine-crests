// Nine Crests - the nine powers (each with 3 levels), evolving them, and the hero's flying things
// (fireballs, waves, bubbles, shards, spikes, tornadoes, skulls). Projectiles and effects carry lvl (1-3) and scale.
(function () {
  'use strict';
  var SC = window.SC, W = SC.world;

  // ---------------- the numbers for each power level (index 1..3) ----------------
  // Level 1 is about 30% stronger than the old v1 power; levels 2 and 3 are clearly stronger and look different.
  var T = SC.POWER_TABLE = {
    fire: { dmg: [0, 4, 4.5, 5], rad: [0, 1.35, 1.6, 1.9], burn: [0, 3, 4, 5], tick: [0, 0.65, 0.65, 0.9], n: [0, 1, 2, 3], spread: [0, 0, 0.13, 0.2], scale: [0, 1, 1.25, 1.5] },
    water: { dmg: [0, 3.3, 4, 4.5], hw: [0, 1.1, 1.5, 1.8], grow: [0, 0.9, 1.1, 1.2], kb: [0, 13, 14, 15], life: [0, 0.6, 0.75, 0.8], waves: [0, 1, 1, 2], slow: [0, 0, 0, 2], scale: [0, 1, 1.3, 1.6] },
    surface: { trap: [0, 5, 6, 7], bigDmg: [0, 2.6, 3.2, 4], dmg: [0, 1.3, 1.3, 1.6], pop: [0, 3, 3.5, 4], splash: [0, 2.6, 3, 4], splashR: [0, 2, 2.5, 3], n: [0, 1, 2, 3], home: [0, 0, 0, 2.2], scale: [0, 1, 1.25, 1.5] },
    ice: { dmg: [0, 2, 2.4, 2.8], freeze: [0, 3.5, 4, 5], n: [0, 3, 5, 7], spread: [0, 0.2, 0.18, 0.15], pierce: [0, 1, 2, 2], nova: [0, 0, 0, 2.4], scale: [0, 1, 1.25, 1.5] },
    earth: { dmg: [0, 4, 5, 5.5], spikes: [0, 8, 10, 10], stun: [0, 1.5, 1.8, 2], hitR: [0, 0.6, 0.8, 0.85], lines: [0, 1, 1, 3], scale: [0, 1, 1.3, 1.5] },
    lightning: { n: [0, 5, 7, 10], first: [0, 4, 4.8, 5.5], next: [0, 3.3, 4, 4.8], jump: [0, 4.2, 4.6, 5.5], stun: [0, 0.5, 0.8, 1.2], sky: [0, 0, 0, 3], scale: [0, 1, 1.3, 1.6] },
    wind: { r: [0, 0.8, 1.0, 1.25], pull: [0, 2.6, 3.2, 4], life: [0, 2.0, 2.6, 3.2], speed: [0, 4.8, 4.4, 4.0], toss: [0, 3, 4, 5], spin: [0, 0.8, 0.9, 1.0], big: [0, 0, 0, 1], scale: [0, 1, 1.35, 1.7] },
    life: { heal: [0, 2, 3, 4], team: [0, 0, 1, 2], r: [0, 3, 3.5, 4], dmg: [0, 1.5, 2, 3], cd: [0, 5, 4.5, 4], wake: [0, 0, 0, 1], scale: [0, 1, 1.2, 1.4] },
    death: { dmg: [0, 8, 9, 10], r: [0, 0.45, 0.6, 0.7], life: [0, 2.3, 2.8, 3.0], home: [0, 0, 2, 2.5], n: [0, 1, 1, 2], drain: [0, 0, 0, 6], scale: [0, 1, 1.3, 1.6] }
  };
  function lvOf(id) { return Math.max(1, Math.min(3, SC.powerLevel(id) || 1)); }

  // ---------------- evolving ----------------
  SC.addPowerXp = function (id, amt) {
    var G = SC.G;
    if (id === 'burn') id = 'fire';
    if (!id || !SC.powerById(id) || !G.prog || SC.isFree()) return;
    var s = G.prog.powers[id];
    if (!s || !s.owned || s.level >= 3) return;
    s.xp += amt;
    while (s.level < 3 && s.xp >= SC.EVOLVE_AT[s.level]) {
      s.level++;
      var pw = SC.powerById(id), p = G.player;
      SC.banner(pw.name + ' evolved!', 'Level ' + s.level + ': ' + pw.lv[s.level - 1], id, 3.4);
      SC.audio.play('evolve');
      if (p) { SC.fx.burst(p.x, 1, p.y, 'star', 24); G.effects.push({ kind: 'ring', x: p.x, y: p.y, r0: 0.3, r1: 3, color: pw.hex, t: 0, dur: 0.6, lvl: s.level, scale: 1 }); }
      G.stats.evolves = (G.stats.evolves || 0) + 1;
      if (SC.saveMid) SC.saveMid();
    }
  };
  // 0..1 progress to the next level (1 when maxed)
  SC.powerXpFrac = function (id) {
    var s = SC.G.prog.powers[id];
    if (!s || !s.owned) return 0;
    if (s.level >= 3) return 1;
    var a = SC.EVOLVE_AT[s.level - 1], b = SC.EVOLVE_AT[s.level];
    return SC.clamp((s.xp - a) / (b - a), 0, 1);
  };

  // ---------------- casting ----------------
  SC.usePower = function (ang) {
    var G = SC.G, p = G.player, id = SC.currentPowerId();
    if (p.dead || p.dashT > 0) return false;
    if (!id) {
      var any = G.hero.powers.filter(function (x) { return SC.hasPower(x); });
      SC.toast(any.length ? G.hero.name + ' has no powers yet.' : G.hero.name + ' has no powers yet. Do a crest task!');
      SC.audio.play('nope');
      return false;
    }
    var pw = SC.powerById(id), lv = lvOf(id);
    if ((p.powerCd[id] || 0) > 0) return false;
    if (p.energy < pw.cost) {
      if (G.energyHintT <= 0) { SC.toast('Not enough energy. Wait a moment!'); G.energyHintT = 3; }
      SC.audio.play('nope');
      return false;
    }
    p.energy -= pw.cost;
    p.powerCd[id] = id === 'life' ? T.life.cd[lv] : pw.cd;
    p.face = ang; p.castT = 0.25;
    G.stats.powers[id] = (G.stats.powers[id] || 0) + 1;
    CAST[id](p, ang, lv);
    return true;
  };
  SC.powerCdMax = function (id) { return id === 'life' ? T.life.cd[lvOf(id)] : SC.powerById(id).cd; };

  function proj(kind, p, ang, speed, r, life, extra) {
    var G = SC.G;
    var o = { id: ++G.nextId, kind: kind, x: p.x + Math.cos(ang) * 0.45, y: p.y + Math.sin(ang) * 0.45, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      ang: ang, r: r, life: life, maxLife: life, hit: {}, h: 0.6 + Math.min(p.flyH || 0, 2) * 0.5, t: 0, lvl: 1, scale: 1, owner: G.pi || 0 };
    if (extra) for (var k in extra) o[k] = extra[k];
    G.projs.push(o);
    return o;
  }
  // the 'tornado' drawing only exists in the new world/drawing files; the old ones know 'twister'
  function tornadoKind() { return (SC.world.flyerOK === true || (SC.gfx && SC.gfx.tornadoOK)) ? 'tornado' : 'twister'; }

  var CAST = {
    fire: function (p, a, lv) {
      var t = T.fire, n = t.n[lv];
      for (var i = 0; i < n; i++) {
        var off = n === 1 ? 0 : (i - (n - 1) / 2) * t.spread[lv] * (n === 2 ? 2 : 1);
        proj('fireball', p, a + off, 11, 0.22 * t.scale[lv], 0.85, { lvl: lv, scale: t.scale[lv] });
      }
      SC.audio.play('fire');
    },
    water: function (p, a, lv) {
      var t = T.water;
      proj('wave', p, a, 8, 0.5, t.life[lv], { lvl: lv, scale: t.scale[lv] });
      if (t.waves[lv] > 1) proj('wave', p, a, 6.2, 0.5, t.life[lv] * 1.15, { lvl: lv, scale: t.scale[lv] * 0.9, second: true });
      SC.audio.play('water');
      SC.fx.burst(p.x + Math.cos(a) * 0.6, 0.3, p.y + Math.sin(a) * 0.6, 'water', 12 + lv * 6);
    },
    surface: function (p, a, lv) {
      var t = T.surface, n = t.n[lv];
      for (var i = 0; i < n; i++) {
        var off = n === 1 ? 0 : (i - (n - 1) / 2) * 0.22;
        proj('bubble', p, a + off, 7.5, 0.26 * t.scale[lv], 1.2 + (lv - 1) * 0.3, { lvl: lv, scale: t.scale[lv] });
      }
      SC.audio.play('bubble');
    },
    ice: function (p, a, lv) {
      var t = T.ice, n = t.n[lv];
      for (var i = 0; i < n; i++) proj('shard', p, a + (i - (n - 1) / 2) * t.spread[lv], 11, 0.18 * t.scale[lv], 0.7 + (lv - 1) * 0.1, { lvl: lv, scale: t.scale[lv], pierce: t.pierce[lv] });
      if (t.nova[lv] > 0) {
        var G = SC.G, R = t.nova[lv];
        G.effects.push({ kind: 'ring', x: p.x, y: p.y, r0: 0.3, r1: R, color: 0xbff4ff, t: 0, dur: 0.45, lvl: lv, scale: t.scale[lv] });
        SC.fx.burst(p.x, 0.4, p.y, 'ice', 20);
        for (var j = 0; j < G.enemies.length; j++) {
          var e = G.enemies[j];
          if (!e.alive || e.hidden || e.h > 1.5) continue;
          if (SC.dist(p.x, p.y, e.x, e.y) < R + e.r) { e.slowT = Math.max(e.slowT, 2.5); SC.hurtEnemy(e, 1, 'ice', {}); }
        }
      }
      SC.audio.play('ice');
    },
    earth: function (p, a, lv) {
      var t = T.earth, n = t.lines[lv], shared = {};   // the lines share one hit list: a baddie is hurt once per cast
      for (var i = 0; i < n; i++) {
        var la = a + (n === 1 ? 0 : (i - (n - 1) / 2) * 0.38);
        proj('quake', p, la, 0, 0, 1.2, { n: 0, next: 0, x0: p.x, y0: p.y, stopped: false, lvl: lv, scale: t.scale[lv], hit: shared });
      }
      SC.audio.play('earth');
      SC.fx.shake(0.2 + lv * 0.06);
    },
    lightning: function (p, a, lv) {
      var G = SC.G, t = T.lightning, hit = {}, pts = [p.x, p.y], cx = p.x, cy = p.y, first = true, firstE = null;
      for (var n = 0; n < t.n[lv]; n++) {
        var best = null, bd = first ? 7.5 : t.jump[lv];
        for (var i = 0; i < G.enemies.length; i++) {
          var e = G.enemies[i];
          if (!e.alive || e.hidden || hit[e.id] || e.h > 1.5) continue;
          var d = SC.dist(cx, cy, e.x, e.y);
          if (first) { var ad = Math.abs(SC.angDiff(a, Math.atan2(e.y - p.y, e.x - p.x))); if (ad > 1.0 && d > 2) continue; d += ad * 1.5; }
          if (d < bd) { bd = d; best = e; }
        }
        if (!best) break;
        hit[best.id] = 1;
        pts.push(best.x, best.y);
        if (first) firstE = { x: best.x, y: best.y };
        SC.hurtEnemy(best, first ? t.first[lv] : t.next[lv], 'lightning', { kx: 0, ky: 0 });
        best.stunT = Math.max(best.stunT, t.stun[lv]);
        SC.fx.burst(best.x, 0.6, best.y, 'spark', 8 + lv * 3);
        cx = best.x; cy = best.y; first = false;
      }
      if (pts.length === 2) pts.push(p.x + Math.cos(a) * 3, p.y + Math.sin(a) * 3);
      G.effects.push({ kind: 'bolt', pts: pts, t: 0, dur: 0.32 + lv * 0.04, h: 0.6, lvl: lv, scale: t.scale[lv] });
      if (t.sky[lv] > 0 && firstE) {
        var sx = firstE.x, sy = firstE.y;
        G.effects.push({ kind: 'bolt', pts: [sx, sy, sx, sy], sky: true, t: 0, dur: 0.35, h: 0, lvl: lv, scale: t.scale[lv] });
        G.effects.push({ kind: 'ring', x: sx, y: sy, r0: 0.2, r1: 1.5, color: 0xffe14a, t: 0, dur: 0.35, lvl: lv, scale: t.scale[lv] });
        SC.fx.burst(sx, 0.3, sy, 'spark', 18);
        for (var k = 0; k < G.enemies.length; k++) {
          var en = G.enemies[k];
          if (en.alive && !en.hidden && en.h < 1.5 && SC.dist(sx, sy, en.x, en.y) < 1.5 + en.r) SC.hurtEnemy(en, t.sky[lv], 'lightning', { kx: 0, ky: 0 });
        }
        SC.audio.play('thunder');
      }
      SC.fx.flash(0xfff6a0, 0.12 + lv * 0.03);
      SC.audio.play('zap');
    },
    wind: function (p, a, lv) {
      var t = T.wind;
      proj(tornadoKind(), p, a, t.speed[lv], t.r[lv], t.life[lv], { caught: {}, tornado: true, lvl: lv, scale: t.scale[lv], tickT: 0 });
      SC.audio.play('wind');
      SC.fx.burst(p.x + Math.cos(a), 0.4, p.y + Math.sin(a), 'wind', 10 + lv * 4);
    },
    life: function (p, a, lv) {
      var G = SC.G, t = T.life;
      var before = p.hp;
      p.hp = Math.min(SC.maxHp(), p.hp + t.heal[lv]);
      SC.popText(p.x, p.y, before < p.hp ? '+' + (Math.round((p.hp - before) * 2) / 2) + ' hearts' : 'Full!', '#7dff8a', true);
      var woke = null;
      G.team.forEach(function (m) {
        if (m.id === G.hero.id) return;
        if (m.out) {
          if (t.wake[lv] && !woke) { m.out = false; m.hp = Math.min(SC.maxHp(m.id), 2); woke = SC.heroById(m.id).name; }
          return;
        }
        if (t.team[lv] > 0) m.hp = Math.min(SC.maxHp(m.id), m.hp + t.team[lv]);
      });
      if (woke) SC.toast(woke + ' woke up!');
      else if (t.team[lv] > 0) SC.toast('The whole team got hearts!', 2);
      var R = t.r[lv];
      G.effects.push({ kind: 'ring', x: p.x, y: p.y, r0: 0.4, r1: R, color: 0x45d65a, t: 0, dur: 0.5 + lv * 0.1, lvl: lv, scale: t.scale[lv] });
      SC.fx.burst(p.x, 0.4, p.y, 'life', 20 + lv * 8);
      for (var i = 0; i < G.enemies.length; i++) {
        var e = G.enemies[i];
        if (!e.alive || e.hidden) continue;
        var d = SC.dist(p.x, p.y, e.x, e.y);
        if (d < R + e.r) {
          var ang = Math.atan2(e.y - p.y, e.x - p.x);
          SC.hurtEnemy(e, t.dmg[lv], 'life', { kx: Math.cos(ang) * 10, ky: Math.sin(ang) * 10 });
        }
      }
      SC.audio.play('life');
    },
    death: function (p, a, lv) {
      var t = T.death, n = t.n[lv];
      for (var i = 0; i < n; i++) proj('skull', p, a + (n === 1 ? 0 : (i - 0.5) * 0.5), 4.8, t.r[lv], t.life[lv], { lvl: lv, scale: t.scale[lv] });
      SC.audio.play('death');
    }
  };
  SC.CAST = CAST;

  function explode(o) {
    var G = SC.G, x = o.x, y = o.y, lv = o.dmgLvl || o.lvl || 1, t = T.fire, R = t.rad[lv];
    G.effects.push({ kind: 'ring', x: x, y: y, r0: 0.2, r1: R, color: 0xff8a1a, t: 0, dur: 0.3, lvl: lv, scale: o.scale });
    if (lv >= 3) G.effects.push({ kind: 'ring', x: x, y: y, r0: R * 0.6, r1: R * 1.35, color: 0xffd23f, t: 0, dur: 0.5, lvl: lv, scale: o.scale });
    SC.fx.burst(x, 0.5, y, 'fire', 16 + lv * 6);
    SC.fx.burst(x, 0.7, y, 'smoke', 4 + lv * 2);
    SC.fx.light(x, y, 0xff8a2a, 0.3);
    SC.audio.play('boom');
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (!e.alive) continue;
      var d = SC.dist(x, y, e.x, e.y);
      if (d < R + e.r) {
        var a = Math.atan2(e.y - y, e.x - x);
        SC.hurtEnemy(e, t.dmg[lv], 'fire', { kx: Math.cos(a) * 4, ky: Math.sin(a) * 4 });
        if (e.alive && e.def.resist.indexOf('fire') < 0) { e.burnT = t.burn[lv]; e.burnDmg = t.tick[lv]; e.frozenT = 0; }
      }
    }
    var rr = Math.ceil(R);
    for (var ty = Math.floor(y - rr); ty <= Math.floor(y + rr); ty++) for (var tx = Math.floor(x - rr); tx <= Math.floor(x + rr); tx++) {
      var tt = W.tile(tx, ty);
      if ((tt === 't' || tt === 'b') && SC.dist(x, y, tx + 0.5, ty + 0.5) < Math.max(1.3, R)) W.burnFrom(tx, ty);
    }
  }

  function enemyHitBy(o, onHit, limit) {
    var G = SC.G, n = 0;
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (!e.alive || e.hidden || o.hit[e.id]) continue;
      if (e.h > 1.5) continue;
      if (SC.dist(o.x, o.y, e.x, e.y) < o.r + e.r) {
        o.hit[e.id] = 1;
        onHit(e);
        n++;
        if (limit && n >= limit) return true;
      }
    }
    return false;
  }
  // gently steer a projectile toward the nearest baddie
  function home(o, rate, range, dt) {
    var G = SC.G, best = null, bd = range;
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (!e.alive || e.hidden || o.hit[e.id] || e.h > 1.5) continue;
      var d = SC.dist(o.x, o.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    var sp = Math.sqrt(o.vx * o.vx + o.vy * o.vy), a = Math.atan2(o.vy, o.vx), want = Math.atan2(best.y - o.y, best.x - o.x);
    a += SC.clamp(SC.angDiff(a, want), -rate * dt, rate * dt);
    o.vx = Math.cos(a) * sp; o.vy = Math.sin(a) * sp; o.ang = a;
  }

  SC.updateProjs = function (dt) {
    var G = SC.G;
    var two = G.players && G.players.length > 1;
    for (var i = G.projs.length - 1; i >= 0; i--) {
      var o = G.projs[i];
      if (two) SC.useCtx(G.players[o.owner || 0] ? o.owner || 0 : 0);   // a shot belongs to the player who made it
      o.t += dt; o.life -= dt;
      var dead = o.life <= 0, lv = o.dmgLvl || o.lvl || 1;
      if (o.tornado) { dead = updTornado(o, dt) || dead; }
      else switch (o.kind) {
        case 'fireball':
          o.x += o.vx * dt; o.y += o.vy * dt;
          if (Math.random() < 0.8) SC.fx.burst(o.x, o.h, o.y, 'ember', lv);
          var ft = W.tile(Math.floor(o.x), Math.floor(o.y));
          if (W.projSolid(ft) || enemyHitBy(o, function () {}, 1) || dead) {
            if (W.projSolid(ft)) { o.x -= o.vx * dt * 1.5; o.y -= o.vy * dt * 1.5; }
            explode(o); dead = true;
          }
          break;
        case 'shard':
          o.x += o.vx * dt; o.y += o.vy * dt;
          if (Math.random() < 0.5) SC.fx.burst(o.x, o.h, o.y, 'ice', 1);
          if (W.projSolid(W.tile(Math.floor(o.x), Math.floor(o.y)))) { dead = true; SC.fx.burst(o.x, o.h, o.y, 'ice', 6); break; }
          enemyHitBy(o, function (e) {
            var t = T.ice;
            SC.hurtEnemy(e, t.dmg[lv], 'ice', { kx: o.vx * 0.2, ky: o.vy * 0.2 });
            if (e.alive) {
              if (e.isBoss) e.slowT = Math.max(e.slowT, 1.5 + lv * 0.3);
              else if (e.def.resist.indexOf('ice') < 0) { e.frozenT = t.freeze[lv]; e.burnT = 0; e.bubbleT = 0; }
              else e.slowT = 1.5 + lv * 0.3;
            }
            SC.fx.burst(e.x, 0.6, e.y, 'ice', 10);
            o.pierce = (o.pierce || 1) - 1;
            if (o.pierce <= 0) dead = true;
          }, o.pierce || 1);
          break;
        case 'bubble':
          if (T.surface.home[lv] > 0) home(o, T.surface.home[lv], 4, dt);
          o.x += o.vx * dt; o.y += o.vy * dt;
          o.vx *= Math.pow(0.6, dt); o.vy *= Math.pow(0.6, dt);
          if (W.projSolid(W.tile(Math.floor(o.x), Math.floor(o.y)))) { dead = true; SC.fx.burst(o.x, o.h, o.y, 'water', 8); SC.audio.play('pop'); break; }
          if (enemyHitBy(o, function (e) {
            var t = T.surface;
            if (e.isBoss || e.def.big) SC.hurtEnemy(e, t.bigDmg[lv], 'surface', { kx: o.vx * 0.3, ky: o.vy * 0.3 });
            else {
              SC.hurtEnemy(e, t.dmg[lv], 'surface', {});
              if (e.alive) { e.bubbleT = t.trap[lv]; e.bubbleLvl = lv; e.frozenT = 0; e.state = 'idle'; if (!G.toldBubble) { G.toldBubble = true; SC.toast('Bubbled! Pop it with your sword!'); } }
            }
            SC.audio.play('bubble');
          }, 1)) dead = true;
          break;
        case 'skull':
          if (T.death.home[lv] > 0) home(o, T.death.home[lv], 5, dt);
          o.x += o.vx * dt; o.y += o.vy * dt;
          if (Math.random() < 0.9) SC.fx.burst(o.x, o.h, o.y, 'shadow', lv);
          if (W.projSolid(W.tile(Math.floor(o.x), Math.floor(o.y)))) { dead = true; SC.fx.burst(o.x, o.h, o.y, 'shadow', 14); break; }
          enemyHitBy(o, function (e) {
            SC.hurtEnemy(e, T.death.dmg[lv], 'death', { kx: o.vx * 0.5, ky: o.vy * 0.5 });
            SC.fx.burst(e.x, 0.6, e.y, 'shadow', 12);
            if (T.death.drain[lv] > 0) { var pl = G.player; pl.energy = Math.min(SC.maxEnergy(), pl.energy + T.death.drain[lv]); }
          }, 0);
          break;
        case 'wave':
          o.x += o.vx * dt; o.y += o.vy * dt;
          var wt = T.water, hw = wt.hw[lv] + wt.grow[lv] * (o.t / o.maxLife);
          o.hw = hw;
          var c = Math.cos(o.ang), s = Math.sin(o.ang);
          for (var j = 0; j < G.enemies.length; j++) {
            var e = G.enemies[j];
            if (!e.alive || e.hidden || o.hit[e.id] || e.h > 1.5) continue;
            var dx = e.x - o.x, dy = e.y - o.y, along = dx * c + dy * s, perp = -dx * s + dy * c;
            if (Math.abs(along) < 0.55 + e.r && Math.abs(perp) < hw + e.r) {
              o.hit[e.id] = 1;
              SC.hurtEnemy(e, wt.dmg[lv] * (o.second ? 0.7 : 1), 'water', { kx: c * wt.kb[lv], ky: s * wt.kb[lv] });
              if (e.alive) { e.burnT = 0; if (wt.slow[lv]) e.slowT = Math.max(e.slowT, wt.slow[lv]); }
              SC.fx.burst(e.x, 0.5, e.y, 'water', 8);
            }
          }
          for (var hz = G.hazards.length - 1; hz >= 0; hz--) {
            var hh = G.hazards[hz];
            if (SC.dist(hh.x, hh.y, o.x, o.y) < hw) { G.hazards.splice(hz, 1); SC.fx.burst(hh.x, 0.3, hh.y, 'smoke', 3); }
          }
          if (lv >= 2) {   // level 2+: washes enemy shots away
            for (var q = G.eprojs.length - 1; q >= 0; q--) {
              var ep = G.eprojs[q], ex = ep.x - o.x, ey = ep.y - o.y;
              if (Math.abs(ex * c + ey * s) < 0.8 && Math.abs(-ex * s + ey * c) < hw) { SC.fx.burst(ep.x, ep.h, ep.y, 'water', 5); G.eprojs.splice(q, 1); }
            }
          }
          if (Math.random() < 0.7) SC.fx.burst(o.x - s * SC.rand(-hw, hw), 0.5, o.y + c * SC.rand(-hw, hw), 'water', lv);
          if (W.projSolid(W.tile(Math.floor(o.x), Math.floor(o.y)))) dead = true;
          break;
        case 'quake':
          var et = T.earth;
          o.next -= dt;
          while (!o.stopped && o.next <= 0 && o.n < et.spikes[lv]) {
            o.next += 0.05;
            o.n++;
            var dist = 0.7 + o.n * 0.6;
            var sx = o.x0 + Math.cos(o.ang) * dist, sy = o.y0 + Math.sin(o.ang) * dist;
            var st = W.tile(Math.floor(sx), Math.floor(sy));
            if (st === 'k') { W.breakBoulder(Math.floor(sx), Math.floor(sy)); }
            else if (st === '#' || st === 'T' || st === 'O' || st === 'G' || st === 't') { o.stopped = true; break; }
            G.effects.push({ kind: 'spike', x: sx, y: sy, t: 0, dur: 0.75 + lv * 0.1, s: SC.rand(0.85, 1.2) * o.scale, rot: Math.random() * 6, lvl: lv, scale: o.scale });
            SC.fx.burst(sx, 0.2, sy, 'rock', 3 + lv);
            for (var qq = 0; qq < G.enemies.length; qq++) {
              var en = G.enemies[qq];
              if (!en.alive || en.hidden || o.hit[en.id] || en.h > 1.5) continue;
              if (SC.dist(sx, sy, en.x, en.y) < et.hitR[lv] + en.r) {
                o.hit[en.id] = 1;
                SC.hurtEnemy(en, et.dmg[lv], 'earth', { kx: Math.cos(o.ang) * 3, ky: Math.sin(o.ang) * 3 });
                if (en.alive && !en.isBoss) { en.stunT = Math.max(en.stunT, et.stun[lv]); en.vh = 5; en.bubbleT = 0; }
                else if (en.alive) en.slowT = Math.max(en.slowT, 1 + lv * 0.3);
              }
            }
          }
          if (o.n >= et.spikes[lv] || o.stopped) { if (o.life > 0.1) o.life = Math.min(o.life, 0.1); }
          break;
      }
      if (dead) {
        G.projs.splice(i, 1);
        if (o.tornado) {
          // anyone still spinning gets tossed now
          for (var z = 0; z < G.enemies.length; z++) if (G.enemies[z].spinBy === o) G.enemies[z].spinBy = null;
          SC.fx.burst(o.x, 0.6, o.y, 'wind', 10 + lv * 4);
        }
        if (o.kind === 'bubble' && o.life <= 0) SC.fx.burst(o.x, o.h, o.y, 'water', 6);
      }
    }
    if (two) SC.useCtx(0);
    for (var k = G.effects.length - 1; k >= 0; k--) { var ef = G.effects[k]; ef.t += dt; if (ef.t >= ef.dur) G.effects.splice(k, 1); }
  };

  // The tornado: moves slowly, pulls baddies in, spins them up and throws them. Bigger with each level.
  function updTornado(o, dt) {
    var G = SC.G, t = T.wind, lv = o.dmgLvl || o.lvl || 1, dead = false;
    o.x += o.vx * dt; o.y += o.vy * dt;
    if (W.projSolid(W.tile(Math.floor(o.x), Math.floor(o.y)))) { o.x -= o.vx * dt; o.y -= o.vy * dt; o.vx *= -0.3; o.vy *= -0.3; }
    var nP = lv + (Math.random() < 0.6 ? 1 : 0);
    for (var pp = 0; pp < nP; pp++) SC.fx.burst(o.x + SC.rand(-0.4, 0.4) * o.scale, SC.rand(0.2, 1.4) * o.scale, o.y + SC.rand(-0.4, 0.4) * o.scale, 'wind', 1);
    o.tickT -= dt;
    var bossTick = o.tickT <= 0;
    if (bossTick) o.tickT = 0.5;
    var pullR = t.pull[lv], catchR = 0.45 + o.r;
    for (var m = 0; m < G.enemies.length; m++) {
      var en = G.enemies[m];
      if (!en.alive || en.hidden || o.caught[en.id]) continue;
      var d = SC.dist(o.x, o.y, en.x, en.y);
      var heavy = en.isBoss || (en.def.big && !t.big[lv]);
      if (heavy) {
        if (d < 0.5 + o.r + en.r) {
          if (!o.hitBig) o.hitBig = {};
          if (!o.hitBig[en.id]) { o.hitBig[en.id] = 1; SC.hurtEnemy(en, t.toss[lv], 'wind', { kx: o.vx, ky: o.vy }); }
          else if (lv >= 3 && bossTick) SC.hurtEnemy(en, 1.5, 'wind', { kx: o.vx * 0.3, ky: o.vy * 0.3 });
        }
        continue;
      }
      if (d < pullR && d > 0.01) {
        en.kx += (o.x - en.x) / d * (14 + lv * 4) * dt; en.ky += (o.y - en.y) / d * (14 + lv * 4) * dt;
        if (!en.aggro && SC.wakeEnemy) SC.wakeEnemy(en);
      }
      if (d < catchR + en.r) {
        o.caught[en.id] = 1;
        en.spinT = t.spin[lv]; en.spinBy = o; en.bubbleT = 0; en.frozenT = 0; en.tossDmg = t.toss[lv]; en.tossLvl = lv;
      }
    }
    for (var b = 0; b < G.eprojs.length; b++) {
      var ep = G.eprojs[b];
      if (ep.harmless) continue;
      var d3 = SC.dist(o.x, o.y, ep.x, ep.y);
      if (d3 < 0.8 + o.r * 0.8) {
        var aa = Math.atan2(ep.y - o.y, ep.x - o.x);
        var spd = Math.sqrt(ep.vx * ep.vx + ep.vy * ep.vy) + 2;
        ep.vx = Math.cos(aa) * spd; ep.vy = Math.sin(aa) * spd; ep.harmless = true; ep.life = Math.min(ep.life, 0.6);
        SC.fx.burst(ep.x, 0.6, ep.y, 'wind', 4);
      }
    }
    return dead;
  }

  // ---------------- SUPER ATTACK (key R) ----------------
  // One per hero, in their own style. Unlocks with the hero's first power, grows with their power levels.
  // Long cooldown per hero (keeps counting while another hero plays). Free Play: short cooldown.
  SC.SUPER_CD = 25; SC.SUPER_CD_FREE = 5;
  SC.SUPER_NAME = { nate: 'Flame Ring', zen: 'Storm Dash', mira: 'Tidal Wave', koda: 'Frost Blast', pip: 'Bubble Storm', rokko: 'Mega Slam', wren: 'Four Winds', fern: 'Healing Bloom', vex: 'Shadow Swarm' };
  SC.superUnlocked = function (heroId) {
    var h = SC.heroById(heroId || SC.G.hero.id);
    if (SC.isFree()) return true;
    for (var i = 0; i < h.powers.length; i++) if (SC.hasPower(h.powers[i])) return true;
    return false;
  };
  SC.superCd = function (heroId) { var G = SC.G; return (G.superCd && G.superCd[heroId || G.hero.id]) || 0; };
  SC.superReady = function (heroId) { return SC.superUnlocked(heroId) && SC.superCd(heroId) <= 0; };
  SC.superCdMax = function () { return SC.isFree() ? SC.SUPER_CD_FREE : SC.SUPER_CD; };
  // count down every hero's super, and ping when the active hero's is ready again
  SC.tickSupers = function (dt) {
    var G = SC.G;
    if (!G.superCd) G.superCd = {};
    for (var id in G.superCd) {
      if (G.superCd[id] <= 0) continue;
      G.superCd[id] = Math.max(0, G.superCd[id] - dt);
      if (G.superCd[id] <= 0) {
        if (id === G.hero.id) { SC.toast('Super ready! Press R!', 2.5); SC.audio.play('superReady'); G.superPing = G.realT; }
        G.stats.superReadyPings = (G.stats.superReadyPings || 0) + 1;
      }
    }
  };
  function heroStrength(h) {   // levels of the hero's owned powers, e.g. 1..9
    var n = 0;
    h.powers.forEach(function (id) { n += SC.powerLevel(id); });
    return Math.max(1, n);
  }
  SC.useSuper = function () {
    var G = SC.G, p = G.player, h = G.hero;
    if (!p || p.dead || G.screen !== 'play') return false;
    if (!SC.superUnlocked(h.id)) { SC.toast(h.name + "'s super unlocks with the " + SC.powerById(h.powers[0]).name + ' Crest!'); SC.audio.play('nope'); return false; }
    var cd = SC.superCd(h.id);
    if (cd > 0) { SC.toast('Super is charging: ' + Math.ceil(cd) + 's'); SC.audio.play('nope'); return false; }
    G.superCd = G.superCd || {};
    G.superCd[h.id] = SC.superCdMax();
    G.stats.supers = (G.stats.supers || 0) + 1;
    var a = p.face, str = heroStrength(h);
    p.castT = 0.5; p.inv = Math.max(p.inv, 0.8);
    SC.fx.shake(0.8); SC.fx.flash(0xffffff, 0.2);
    SC.audio.play('super');
    SC.banner(SC.SUPER_NAME[h.id] + '!', '', h.powers[0], 1.4);
    SUPER[h.id](p, a, str);
    return true;
  };
  function lvl(id) { return Math.max(1, SC.powerLevel(id)); }
  function ringFx(p, r, color) { SC.G.effects.push({ kind: 'ring', x: p.x, y: p.y, r0: 0.3, r1: r, color: color, t: 0, dur: 0.6, lvl: 3, scale: 2 }); }
  // str = the hero's power level (1-3): bigger and more of everything as it grows
  var SUPER = {
    // Nate: a ring of big fireballs all around
    nate: function (p, a, str) {
      var n = 8 + str * 3;
      for (var i = 0; i < n; i++) proj('fireball', p, a + i / n * Math.PI * 2, 9, 0.3, 0.7, { lvl: 3, scale: 1.6, dmgLvl: str });
      ringFx(p, 3.2, 0xff7a1a); SC.fx.burst(p.x, 0.6, p.y, 'fire', 40);
    },
    // Zen: a lightning storm on every baddie nearby, and a dash forward
    zen: function (p, a, str) {
      var G = SC.G, R = 4.5 + str, pts = [p.x, p.y], dmg = 3 + str * 1.5;
      G.enemies.forEach(function (e) {
        if (!e.alive || e.hidden || e.h > 1.5 || SC.dist(p.x, p.y, e.x, e.y) > R) return;
        G.effects.push({ kind: 'bolt', pts: [e.x, e.y, e.x, e.y], sky: true, t: 0, dur: 0.4, h: 0, lvl: 3, scale: 1.6 });
        pts.push(e.x, e.y);
        SC.hurtEnemy(e, dmg, 'lightning', { kx: 0, ky: 0 });
        if (e.alive) e.stunT = Math.max(e.stunT, 1 + str * 0.3);
        SC.fx.burst(e.x, 0.5, e.y, 'spark', 12);
      });
      if (pts.length > 2) G.effects.push({ kind: 'bolt', pts: pts, t: 0, dur: 0.5, h: 0.6, lvl: 3, scale: 1.6 });
      p.dashT = 0.3; p.dvx = Math.cos(a) * G.hero.speed * 3.4; p.dvy = Math.sin(a) * G.hero.speed * 3.4;
      SC.audio.play('thunder');
    },
    // Mira: giant waves in every direction, and a little heal for the whole team
    mira: function (p, a, str) {
      var G = SC.G;
      for (var i = 0; i < 6 + str; i++) proj('wave', p, a + i / (6 + str) * Math.PI * 2, 7.5, 0.5, 0.75, { lvl: 3, scale: 1.8, dmgLvl: str });
      teamHeal(1);
      ringFx(p, 4, 0x2f8cff); SC.fx.burst(p.x, 0.5, p.y, 'water', 40);
    },
    // Koda: a freezing blast and a ring of ice shards
    koda: function (p, a, str) {
      var G = SC.G, R = 3 + str * 0.5;
      G.enemies.forEach(function (e) {
        if (!e.alive || e.hidden || e.h > 1.5 || SC.dist(p.x, p.y, e.x, e.y) > R + e.r) return;
        SC.hurtEnemy(e, 2 + str, 'ice', {});
        if (e.alive) { if (e.isBoss || e.def.resist.indexOf('ice') >= 0) e.slowT = Math.max(e.slowT, 3); else e.frozenT = 2 + str; }
      });
      for (var i = 0; i < 12; i++) proj('shard', p, a + i / 12 * Math.PI * 2, 10, 0.25, 0.8, { lvl: 3, scale: 1.6, dmgLvl: str, pierce: 3 });
      ringFx(p, R, 0xbff4ff); SC.fx.burst(p.x, 0.4, p.y, 'ice', 30); SC.fx.shake(0.9);
    },
    // Pip: a burst of bubbles all around that trap every small baddie near
    pip: function (p, a, str) {
      var G = SC.G;
      for (var i = 0; i < 10; i++) proj('bubble', p, a + i / 10 * Math.PI * 2, 6, 0.4, 1.6, { lvl: 3, scale: 1.6, dmgLvl: str });
      G.enemies.forEach(function (e) {
        if (!e.alive || e.hidden || SC.dist(p.x, p.y, e.x, e.y) > 3.5 + str * 0.5) return;
        if (e.isBoss || e.def.big) SC.hurtEnemy(e, 3 + str, 'surface', {});
        else { SC.hurtEnemy(e, 1 + str * 0.5, 'surface', {}); if (e.alive) { e.bubbleT = 3 + str; e.bubbleLvl = str; e.state = 'idle'; } }
      });
      ringFx(p, 4, 0x56d8e8); SC.fx.burst(p.x, 0.6, p.y, 'water', 40);
    },
    // Rokko: a huge slam with rock spikes in 8 directions
    rokko: function (p, a, str) {
      var shared = {};
      for (var i = 0; i < 8; i++) proj('quake', p, a + i / 8 * Math.PI * 2, 0, 0, 1.2, { n: 0, next: 0, x0: p.x, y0: p.y, stopped: false, lvl: 3, scale: 1.6, dmgLvl: str, hit: shared });
      ringFx(p, 3, 0xb07a3a); SC.fx.shake(1.1); SC.fx.burst(p.x, 0.2, p.y, 'rock', 30);
    },
    // Wren: four tornadoes spin out in a cross
    wren: function (p, a, str) {
      for (var i = 0; i < 4; i++) proj(tornadoKind(), p, a + i * Math.PI / 2, 4.2, T.wind.r[3], 2.2 + str * 0.4, { caught: {}, tornado: true, lvl: 3, scale: 1.8, dmgLvl: Math.max(2, str), tickT: 0 });
      ringFx(p, 3.5, 0xbff5d8); SC.fx.burst(p.x, 0.6, p.y, 'wind', 40);
      SC.audio.play('wind');
    },
    // Fern: a big healing bloom for the whole team (wakes a resting friend) that pushes baddies away
    fern: function (p, a, str) {
      var G = SC.G, R = 3.5 + str * 0.5;
      teamHeal(1 + str, true);
      G.enemies.forEach(function (e) {
        if (!e.alive || e.hidden || SC.dist(p.x, p.y, e.x, e.y) > R + e.r) return;
        var ang = Math.atan2(e.y - p.y, e.x - p.x);
        SC.hurtEnemy(e, 2 + str * 1.5, 'life', { kx: Math.cos(ang) * 14, ky: Math.sin(ang) * 14 });
      });
      ringFx(p, R, 0x45d65a); SC.fx.burst(p.x, 0.6, p.y, 'life', 50);
    },
    // Vex: a ring of shadow skulls that chase baddies
    vex: function (p, a, str) {
      var n = 4 + str * 2;
      for (var i = 0; i < n; i++) proj('skull', p, a + i / n * Math.PI * 2, 5, 0.6, 2.4, { lvl: 3, scale: 1.6, dmgLvl: Math.max(2, str) });
      ringFx(p, 3, 0x9b4dff); SC.fx.burst(p.x, 0.6, p.y, 'shadow', 40);
    }
  };
  function teamHeal(n, wake) {
    var G = SC.G, p = G.player, woke = false;
    p.hp = Math.min(SC.maxHp(), p.hp + n);
    SC.storeActive();
    G.team.forEach(function (m) {
      if (m.id === G.hero.id) return;
      if (m.out) { if (wake && !woke) { woke = true; m.out = false; m.hp = Math.min(SC.maxHp(m.id), 3); SC.toast(SC.heroById(m.id).name + ' woke up!'); } return; }
      m.hp = Math.min(SC.maxHp(m.id), m.hp + n);
    });
    if (SC.loadOthers) SC.loadOthers();
    SC.popText(p.x, p.y, '+' + n + ' for everyone', '#7dff8a', true);
  }
})();