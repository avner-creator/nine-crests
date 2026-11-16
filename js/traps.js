// Nine Crests - traps: spike plates, dart shooters (on a rhythm or from a pressure plate), rolling logs/boulders/snowballs,
// falling icicles, lightning rods, shadow puffs, fire vents and bubble geysers. Every trap glows and shows a warning on the
// ground before it hurts, does half a heart, and ignores a flying hero. The rules run in update() (called from
// SC.world.update every simulation step); build() and draw() make and move the 3D parts.
(function () {
  'use strict';
  var SC = window.SC;
  var TR = SC.traps = {};
  var DIRV = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  // when in its cycle (0..1) each kind warns and when it hurts
  var TIMING = {
    spikes: { warn: 0.55, hit: 0.8 }, darts: { warn: 0.72, hit: 1 }, roller: { warn: 0.72, hit: 1 },
    icicle: { warn: 0.6, hit: 1 }, rod: { warn: 0.6, hit: 0.92 }, puff: { warn: 0.6, hit: 0.85 },
    vent: { warn: 0.6, hit: 0.85 }, geyser: { warn: 0.65, hit: 0.88 }
  };
  var COLOR = { spikes: '#ff3b30', darts: '#ff3b30', roller: '#ff8a1a', icicle: '#7fd8ff', rod: '#ffe14a', puff: '#b06aff', vent: '#ff6a1a', geyser: '#4ab8ff', plate: '#ff3b30',
    'darts:water': '#3a9aff', 'darts:shadow': '#b06aff', 'spikes:vine': '#5ad04a', 'spikes:rock': '#ff8a3a', 'puff:spore': '#9ae04a', 'roller:gust': '#bff5ff', 'roller:boulder': '#ff8a1a',
    'icicle:coconut': '#ffb84a', 'icicle:rock': '#ff8a3a', 'roller:wave': '#4ab8ff', 'roller:spark': '#ffe14a', 'darts:thorn': '#5ad04a' };
  var TIP = { spikes: 'Spike plates! Wait until they go down, then cross.', darts: 'Dart shooters! Watch the red line, then run past.', roller: 'Rolling logs! Cross when the lane is clear.',
    icicle: 'Icicles fall where the blue circle grows!', rod: 'Lightning rods! Stay out of the yellow ring when it sparks.', puff: 'Shadow puffs! Step off the purple circles.',
    vent: 'Fire vents! Step off the orange circles.', geyser: 'Bubble geysers toss you up! Step around them.', plate: 'A pressure plate! Something will shoot. Keep moving!',
    'darts:water': 'Water jets! Watch the blue line, then run past.', 'darts:shadow': 'Shadow darts! Watch the purple line, then run past.',
    'spikes:vine': 'Thorny vines pop up where the green circle glows!', 'spikes:rock': 'Rock spikes! Wait until they go down, then cross.',
    'puff:spore': 'Spore puffs! Step off the green circles.', 'roller:gust': 'Wind gusts blow across the hall! Cross when the lane is clear.',
    'roller:boulder': 'Rolling boulders! Cross when the lane is clear.', 'roller:snowball': 'Rolling snowballs! Cross when the lane is clear.',
    'icicle:coconut': 'Coconuts fall where the circle grows! Step away.', 'icicle:rock': 'Falling rocks! Step out of the orange circle.',
    'roller:wave': 'Big waves roll across! Cross when the lane is clear.', 'roller:spark': 'Ball lightning rolls by! Cross when the lane is clear.',
    'darts:thorn': 'Thorn shooters! Watch the green line, then run past.' };
  function styleKey(t) {
    if (t._sk) return t._sk;
    var s = t.style || (t.kind === 'roller' ? t.what : null);
    return (t._sk = s ? t.kind + ':' + s : t.kind);
  }
  function colorOf(t) { return COLOR[styleKey(t)] || COLOR[t.kind]; }
  TR.tipOf = function (t) { return TIP[styleKey(t)] || TIP[t.kind]; };

  function player() { var G = SC.G; return G && G.player; }
  function flying(p) { return p && (p.flyH > 0.5 || p.gliding); }
  function canHurt(p) { return p && !p.dead && !flying(p) && SC.G.screen === 'play'; }
  function hurt(x, y, extra) {
    var p = player();
    if (!canHurt(p)) return false;
    var ok = SC.hurtPlayer(0.5, x + (p.x === x ? 0.01 : 0), y);
    if (ok && extra) { p.kx *= extra; p.ky *= extra; }
    return ok;
  }
  function cyc(t, L) { return (((L.trapClock || 0) / t.period + (t.phase || 0)) % 1 + 1) % 1; }

  // ---------------- rules ----------------
  TR.update = function (dt) {
    var G = SC.G, L = G && G.L, p = player();
    if (!L || !L.traps || !L.traps.length || !p) return;
    L.trapClock = (L.trapClock || 0) + dt;
    L.trapShots = L.trapShots || [];
    for (var i = 0; i < L.traps.length; i++) {
      var t = L.traps[i], cx = t.tx + 0.5, cy = t.ty + 0.5;
      // first-time tip
      if (!G.toldTraps && Math.abs(p.x - cx) < 5 && Math.abs(p.y - cy) < 5) { G.toldTraps = true; SC.toast('Watch out, traps! They glow before they hurt.', 4); }
      var sk = styleKey(t);
      if (!t.told && Math.abs(p.x - cx) < 3.5 && Math.abs(p.y - cy) < 3.5 && G.toldTraps && !(G.trapTips && G.trapTips[sk])) {
        G.trapTips = G.trapTips || {}; G.trapTips[sk] = true; t.told = true;
        if (G.levelT > 1) SC.toast(TR.tipOf(t) || 'A trap!', 3.6);
      }
      if (t.kind === 'plate') {
        var on = false;
        SC.eachPlayer(function (q) { if (canHurt(q) && Math.abs(q.x - cx) < 0.55 && Math.abs(q.y - cy) < 0.55) on = true; });
        if (on && !t.down) { var sh = L.traps[t.link]; if (sh && !(sh.armT > 0) && !(sh.coolT > 0)) { sh.armT = 0.9; SC.audio.play('warn'); } }
        t.down = on;
        continue;
      }
      if (t.kind === 'darts') {
        t.coolT = Math.max(0, (t.coolT || 0) - dt);
        if (t.period > 0) {
          var c = cyc(t, L);
          if (t.last !== undefined && c < t.last) fireDart(t, L);
          t.warnF = c > TIMING.darts.warn ? (c - TIMING.darts.warn) / (1 - TIMING.darts.warn) : 0;
          t.last = c;
        } else if (t.armT > 0) {
          t.armT -= dt; t.warnF = 1 - t.armT / 0.9;
          if (t.armT <= 0) { fireDart(t, L); t.coolT = 1.2; t.warnF = 0; }
        } else t.warnF = 0;
        continue;
      }
      var c2 = cyc(t, L), tm = TIMING[t.kind];
      var wrapped = t.last !== undefined && c2 < t.last, crossed = t.last !== undefined && t.last < tm.hit && c2 >= tm.hit;
      t.warnF = c2 >= tm.warn && c2 < tm.hit ? (c2 - tm.warn) / (tm.hit - tm.warn) : 0;
      t.active = c2 >= tm.hit;
      t.c = c2;
      switch (t.kind) {
        case 'spikes':
          if (crossed) SC.audio.play('slam');
          if (t.active) SC.eachPlayer(function (p) { if (Math.abs(p.x - cx) < 0.5 + p.r * 0.6 && Math.abs(p.y - cy) < 0.5 + p.r * 0.6) hurt(cx, cy); });
          break;
        case 'roller':
          if (wrapped) { L.trapShots.push({ kind: 'roll', what: t.what || 'log', trap: t, x: cx, y: cy, dx: DIRV[t.dir][0], dy: DIRV[t.dir][1], d: 0, len: t.len || 8, sp: t.sp || 3.8, a: 0 }); SC.audio.play(t.what === 'gust' ? 'wind' : 'slam'); }
          break;
        case 'icicle':
          if (wrapped) L.trapShots.push({ kind: 'icicle', what: t.style || '', trap: t, x: cx, y: cy, fall: 0 });
          break;
        case 'rod':
          if (crossed) {
            G.effects.push({ kind: 'bolt', pts: [cx, cy], sky: true, t: 0, dur: 0.3, h: 0.6 });
            SC.fx.ring(cx, cy, 0xffe14a, t.r || 1.7); SC.fx.burst(cx, 1.8, cy, 'spark', 16); SC.audio.play('zap');
            SC.eachPlayer(function (p) { if (SC.dist(p.x, p.y, cx, cy) < (t.r || 1.7) + p.r * 0.5) hurt(cx, cy); });
          }
          break;
        case 'puff': case 'vent': case 'geyser':
          var rr = t.kind === 'puff' ? 0.9 : t.kind === 'vent' ? 0.62 : 0.7;
          if (crossed) {
            SC.audio.play(t.kind === 'puff' ? (t.style === 'spore' ? 'life' : 'death') : t.kind === 'vent' ? 'fire' : 'water');
            if (t.kind === 'geyser') SC.fx.burst(cx, 0.4, cy, 'water', 24);
            if (t.kind === 'puff') SC.fx.burst(cx, 0.5, cy, t.style === 'spore' ? 'leaf' : 'puff', 18);
          }
          if (t.active) SC.eachPlayer(function (p) { if (SC.dist(p.x, p.y, cx, cy) < rr + p.r * 0.5) hurt(cx, cy, t.kind === 'geyser' ? 1.6 : 0); });
          break;
      }
      t.last = c2;
    }
    // things in flight
    var W = SC.world;
    for (var j = L.trapShots.length - 1; j >= 0; j--) {
      var s = L.trapShots[j], gone = false;
      if (s.kind === 'dart') {
        s.x += s.dx * 8 * dt; s.y += s.dy * 8 * dt; s.d += 8 * dt;
        if (s.d > s.len || (s.d > 0.8 && W.projSolid(W.tile(Math.floor(s.x), Math.floor(s.y))))) gone = true;
        else SC.eachPlayer(function (p) { if (!gone && canHurt(p) && SC.dist(s.x, s.y, p.x, p.y) < 0.18 + p.r) { hurt(s.x - s.dx, s.y - s.dy); gone = true; } });
        if (gone) SC.fx.burst(s.x, 0.5, s.y, s.what === 'water' ? 'water' : s.what === 'shadow' ? 'shadow' : s.what === 'thorn' ? 'leaf' : 'dust', 5);
      } else if (s.kind === 'roll') {
        s.x += s.dx * s.sp * dt; s.y += s.dy * s.sp * dt; s.d += s.sp * dt; s.a += s.sp * dt / 0.4;
        var gust = s.what === 'gust';
        var wave = s.what === 'wave', ball = s.what === 'spark';
        if (Math.random() < (gust || wave ? 0.7 : 0.3)) SC.fx.burst(s.x, gust || ball ? 0.5 : 0.1, s.y, s.what === 'snowball' ? 'ice' : gust ? 'wind' : wave ? 'water' : ball ? 'spark' : 'dust', 1);
        SC.eachPlayer(function (p) { if (canHurt(p) && SC.dist(s.x, s.y, p.x, p.y) < (gust ? 0.6 : 0.45) + p.r) hurt(s.x - s.dx, s.y - s.dy, gust ? 2.0 : 1.2); });
        if (s.d >= s.len) { gone = true; SC.fx.burst(s.x, 0.4, s.y, s.what === 'snowball' ? 'ice' : s.what === 'log' ? 'leaf' : gust ? 'wind' : wave ? 'water' : ball ? 'spark' : 'rock', 12); }
      } else if (s.kind === 'icicle') {
        s.fall += dt / 0.28;
        if (s.fall >= 1) {
          gone = true;
          var ist = s.trap.style;
          SC.fx.burst(s.x, 0.3, s.y, ist === 'rock' ? 'rock' : ist === 'coconut' ? 'dust' : 'ice', 16); SC.audio.play(ist ? 'crack' : 'ice'); SC.fx.shake(ist === 'rock' ? 0.2 : 0.12);
          if (ist === 'coconut') SC.fx.burst(s.x, 0.4, s.y, 'leaf', 6);
          SC.eachPlayer(function (p) { if (SC.dist(s.x, s.y, p.x, p.y) < 0.75 + p.r * 0.5) hurt(s.x, s.y); });
        }
      }
      if (gone) L.trapShots.splice(j, 1);
    }
  };
  function fireDart(t, L) {
    var d = DIRV[t.dir];
    L.trapShots.push({ kind: 'dart', what: t.style || '', trap: t, x: t.tx + 0.5 + d[0] * 0.5, y: t.ty + 0.5 + d[1] * 0.5, dx: d[0], dy: d[1], d: 0, len: (t.len || 8) + 0.5 });
    SC.audio.play(t.style === 'water' ? 'water' : t.style === 'thorn' ? 'cut' : 'swing');
  }

  // ---------------- 3D parts ----------------
  var GX = SC.gfx, vis = [], shotPool = {};
  function part(geo, color, x, y, z, sx, sy, sz, parent, opts) { var m = new THREE.Mesh(geo, typeof color === 'object' ? color : GX.mat(color, opts)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = !(opts && (opts.additive || opts.basic)); parent.add(m); return m; }
  var warnMat = null;
  TR.build = function (L) {
    vis = []; shotPool = {};
    if (!GX.ok || !L.traps) return;
    var th = L.theme, W = SC.world;
    warnMat = warnMat || { red: GX.mat(0xff5a4a, { emissive: 0xaa1a10 }), metal: GX.mat(0x8a8c96), dark: GX.mat(0x2a2a30) };
    L.traps.forEach(function (t) {
      var g = new THREE.Group(), cx = t.tx + 0.5, cy = t.ty + 0.5, h = W.heightIn(L, cx, cy), v = { t: t, g: g };
      g.position.set(cx, h, cy);
      var box = GX.box();
      switch (t.kind) {
        case 'spikes':
          var SPC = t.style === 'vine' ? [0x3a5a2a, 0x5ac83a, 0x2a4a1a] : t.style === 'rock' ? [0x7a6a58, 0xa08a6a, 0x3a3028] : [0x8a8c96, 0xd8dce8, 0x2a2a30];
          v.plate = part(box, SPC[0], 0, 0.02, 0, 0.92, 0.06, 0.92, g);
          v.cold = v.plate.material;
          v.spikes = new THREE.Group(); g.add(v.spikes);
          for (var i = 0; i < 9; i++) {
            var sp = part(t.style === 'rock' ? GX.cone(4) : GX.cone(5), SPC[1], ((i % 3) - 1) * 0.28, 0.22, (Math.floor(i / 3) - 1) * 0.28, t.style === 'rock' ? 0.11 : 0.07, 0.44, t.style === 'rock' ? 0.11 : 0.07, v.spikes, t.style ? { flatShading: true } : null);
            if (t.style === 'vine') { sp.rotation.z = (i % 2 ? 0.25 : -0.25); part(GX.sphere(5), 0x7ae05a, sp.position.x + 0.05, 0.15, sp.position.z, 0.07, 0.03, 0.05, v.spikes); }
          }
          for (var k = 0; k < 9; k++) part(GX.cyl(1, 1, 6), SPC[2], ((k % 3) - 1) * 0.28, 0.055, (Math.floor(k / 3) - 1) * 0.28, 0.06, 0.01, 0.06, g);
          break;
        case 'darts':
          var stoneC = t.style === 'water' ? 0x6a9ac0 : t.style === 'shadow' ? 0x3a2a52 : t.style === 'thorn' ? 0x5a7a3a : th.stone;
          part(box, stoneC, 0, 0.5, 0, 0.92, 1.0, 0.92, g);
          part(box, new THREE.Color(stoneC).multiplyScalar(0.85).getHex(), 0, 1.05, 0, 0.98, 0.12, 0.98, g);
          v.face = new THREE.Group(); v.face.rotation.y = Math.PI / 2 - Math.atan2(DIRV[t.dir][1], DIRV[t.dir][0]); g.add(v.face);
          if (t.style === 'water') {   // a fish-head water spout
            part(GX.cyl(0.6, 1, 10), 0x2a5a8a, 0, 0.5, 0.5, 0.16, 0.16, 0.16, v.face).rotation.x = Math.PI / 2;
            part(GX.sphere(8), 0x1a3a6a, 0, 0.5, 0.58, 0.1, 0.1, 0.03, v.face);
          } else if (t.style === 'thorn') {   // a big flower bud that spits thorns
            part(GX.sphere(8), 0xd84a8a, 0, 0.55, 0.42, 0.24, 0.24, 0.16, v.face);
            part(GX.cyl(0.6, 1, 8), 0x2a5a1a, 0, 0.55, 0.58, 0.1, 0.1, 0.1, v.face).rotation.x = Math.PI / 2;
            for (var tp2 = 0; tp2 < 4; tp2++) part(GX.cone(4), 0x7ad84a, Math.cos(tp2 * 1.57) * 0.28, 1.12, Math.sin(tp2 * 1.57) * 0.28, 0.08, 0.22, 0.08, g);
          } else part(box, 0x1a1a20, 0, 0.5, 0.47, 0.22, 0.22, 0.04, v.face);
          v.eyes = [part(GX.sphere(6), 0x5a2a2a, -0.2, 0.78, 0.47, 0.07, 0.07, 0.03, v.face), part(GX.sphere(6), 0x5a2a2a, 0.2, 0.78, 0.47, 0.07, 0.07, 0.03, v.face)];
          v.hot = t.style === 'water' ? GX.mat(0x6ad0ff, { emissive: 0x2a8aff }) : t.style === 'shadow' ? GX.mat(0xc08aff, { emissive: 0x9b4dff }) : t.style === 'thorn' ? GX.mat(0xb8ff6a, { emissive: 0x4aaa1a }) : GX.mat(0xff3a2a, { emissive: 0xff2a10 });
          v.cold = t.style === 'water' ? GX.mat(0x2a4a6a) : GX.mat(0x5a2a2a);
          break;
        case 'plate':
          v.top = part(GX.cyl(1, 1, 14), 0xc8a050, 0, 0.04, 0, 0.36, 0.06, 0.36, g, { emissive: 0x3a2a00 });
          part(GX.cyl(1, 1, 14), 0x5a4a3a, 0, 0.01, 0, 0.44, 0.03, 0.44, g);
          break;
        case 'roller':
          var dv = DIRV[t.dir], len = t.len || 8;
          var lane = new THREE.Group(); lane.position.set(dv[0] * len / 2, 0, dv[1] * len / 2); lane.rotation.y = Math.PI / 2 - Math.atan2(dv[1], dv[0]); g.add(lane);
          var railC = t.what === 'gust' ? 0xbfe8f0 : t.what === 'wave' ? 0x6ab8d8 : t.what === 'spark' ? 0x8a8ca0 : 0x5a4030;
          part(box, railC, -0.42, 0.012, 0, 0.06, 0.02, len, lane); part(box, railC, 0.42, 0.012, 0, 0.06, 0.02, len, lane);
          if (t.what === 'gust') {   // a wind fan in the wall behind the start of the lane
            var fan = new THREE.Group(); fan.position.set(0, 0, -len / 2 - 0.45); lane.add(fan);
            part(GX.cyl(1, 1, 12), 0x8ab8c8, 0, 0.6, 0, 0.42, 0.08, 0.42, fan).rotation.x = Math.PI / 2;
            v.fan = new THREE.Group(); v.fan.position.set(0, 0.6, 0.06); fan.add(v.fan);
            for (var fb = 0; fb < 4; fb++) { var bl = part(box, 0xf0fbff, 0, 0, 0, 0.1, 0.36, 0.02, v.fan); bl.position.set(Math.cos(fb * 1.57) * 0.17, Math.sin(fb * 1.57) * 0.17, 0); bl.rotation.z = fb * 1.57 + 1.57; }
          }
          v.waiting = makeRoller(t.what, g);
          break;
        case 'icicle':
          v.cloud = new THREE.Group(); v.cloud.position.y = 2.8; g.add(v.cloud);
          if (t.style === 'coconut') {   // a tuft of palm leaves up high, the coconut hangs under it
            for (var c = 0; c < 6; c++) { var lf = part(box, c % 2 ? 0x3fb05a : 0x4fc06a, Math.cos(c * 1.05) * 0.35, 0.05, Math.sin(c * 1.05) * 0.35, 0.7, 0.03, 0.2, v.cloud, { flatShading: true }); lf.rotation.y = -c * 1.05; lf.rotation.z = -0.35; }
            v.ice = part(GX.sphere(8), 0x7a5232, 0, -0.18, 0, 0.17, 0.17, 0.17, v.cloud);
          } else if (t.style === 'rock') {   // a crumbly rock ledge with a loose rock
            part(GX.dodec(), th.rockCol || 0x9a6a4a, 0, 0.1, 0, 0.42, 0.18, 0.38, v.cloud, { flatShading: true });
            part(GX.dodec(), 0x8a7a6a, 0.2, 0.15, 0.1, 0.2, 0.12, 0.2, v.cloud, { flatShading: true, transparent: true, opacity: 0.55, depthWrite: false });
            v.ice = part(GX.dodec(), 0x8a6a52, 0, -0.18, 0, 0.2, 0.18, 0.2, v.cloud, { flatShading: true });
          } else {
            for (var c2 = 0; c2 < 4; c2++) part(GX.sphere(8), 0xf0f8ff, (c2 - 1.5) * 0.2, Math.sin(c2 * 2) * 0.06, Math.cos(c2 * 3) * 0.09, 0.24, 0.17, 0.22, v.cloud, { transparent: true, opacity: 0.6, depthWrite: false });
            v.ice = part(GX.cone(6), 0xbff0ff, 0, -0.3, 0, 0.1, 0.5, 0.1, v.cloud, { emissive: 0x1a4a5a });
            v.ice.rotation.x = Math.PI;
          }
          v.iceS = v.ice.scale.clone();
          v.cloud.traverse(function (o) { o.castShadow = false; });
          break;
        case 'rod':
          part(GX.dodec(), th.rockCol || 0x8a8a8a, 0, 0.12, 0, 0.35, 0.2, 0.35, g);
          part(GX.cyl(0.05, 0.07, 6), 0x9a9aa8, 0, 1.1, 0, 1, 2.0, 1, g);
          v.ball = part(GX.sphere(10), 0xd88a4a, 0, 2.15, 0, 0.16, 0.16, 0.16, g, { emissive: 0x3a1a00 });
          v.hot = GX.mat(0xfff27a, { emissive: 0xffe14a }); v.cold = GX.mat(0xd88a4a, { emissive: 0x3a1a00 });
          break;
        case 'puff':
          var spore = t.style === 'spore';
          part(GX.cyl(1, 1, 16), spore ? 0x1a2a0e : 0x1a0e2a, 0, 0.015, 0, 0.42, 0.02, 0.42, g);
          v.rim = part(GX.torus(), spore ? 0x6aaa3a : 0x7a4aba, 0, 0.03, 0, 0.46, 0.46, 0.3, g, { emissive: spore ? 0x1a4a0a : 0x3a1a6a }); v.rim.rotation.x = Math.PI / 2;
          if (spore) for (var mu = 0; mu < 4; mu++) { var ma = mu * 1.57 + 0.4; part(GX.sphere(8), 0xd8e86a, Math.cos(ma) * 0.5, 0.12, Math.sin(ma) * 0.5, 0.13, 0.08, 0.13, g, { emissive: 0x3a4a0a }); }
          v.cloud = new THREE.Group(); g.add(v.cloud);
          for (var pc = 0; pc < 5; pc++) part(GX.sphere(8), spore ? 0xb8e05a : 0x2a1640, Math.cos(pc * 1.3) * 0.35, 0.4 + (pc % 2) * 0.3, Math.sin(pc * 1.3) * 0.35, 0.45, 0.4, 0.45, v.cloud, { transparent: true, opacity: spore ? 0.7 : 0.85 });
          break;
        case 'vent':
          part(box, 0x2a2224, 0, 0.02, 0, 0.8, 0.05, 0.8, g);
          for (var b = -1; b <= 1; b++) part(box, 0x5a4a44, b * 0.22, 0.06, 0, 0.06, 0.04, 0.78, g);
          v.glow = part(box, 0xff6a10, 0, 0.03, 0, 0.7, 0.02, 0.7, g, { basic: true, transparent: true, opacity: 0.2 });
          v.flame = new THREE.Group(); g.add(v.flame);
          part(GX.cone(8), 0xff7a1a, 0, 0.9, 0, 0.42, 1.8, 0.42, v.flame, { additive: true, basic: true, opacity: 0.85 });
          part(GX.cone(8), 0xffe060, 0, 0.7, 0, 0.22, 1.4, 0.22, v.flame, { additive: true, basic: true, opacity: 0.9 });
          break;
        case 'geyser':
          for (var s = 0; s < 8; s++) { var a = s / 8 * Math.PI * 2; part(GX.dodec(), th.rockCol || 0x9a9a9a, Math.cos(a) * 0.48, 0.06, Math.sin(a) * 0.48, 0.13, 0.1, 0.13, g); }
          part(GX.cyl(1, 1, 14), 0x6ad0ff, 0, 0.03, 0, 0.4, 0.02, 0.4, g, { emissive: 0x0a4a6a });
          v.jet = new THREE.Group(); g.add(v.jet);
          part(GX.cyl(0.3, 0.45, 10), 0x9fe8ff, 0, 0.9, 0, 1, 1.8, 1, v.jet, { transparent: true, opacity: 0.6, depthWrite: false });
          part(GX.sphere(8), 0xffffff, 0, 1.8, 0, 0.45, 0.3, 0.45, v.jet, { transparent: true, opacity: 0.7, depthWrite: false });
          break;
      }
      GX.addToLevel(g);
      vis.push(v);
    });
  };
  function makeRoller(what, parent) {
    var g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
    if (what === 'log') {
      var log = part(GX.cyl(1, 1, 10), 0x8a5a32, 0, 0, 0, 0.32, 0.9, 0.32, inner); log.rotation.z = Math.PI / 2;
      var e1 = part(GX.cyl(1, 1, 10), 0xd8b080, 0.455, 0, 0, 0.27, 0.02, 0.27, inner); e1.rotation.z = Math.PI / 2;
      var e2 = part(GX.cyl(1, 1, 10), 0xd8b080, -0.455, 0, 0, 0.27, 0.02, 0.27, inner); e2.rotation.z = Math.PI / 2;
    } else if (what === 'snowball') part(GX.sphere(12), 0xf4f8ff, 0, 0, 0, 0.4, 0.4, 0.4, inner);
    else if (what === 'gust') {   // a little whirl of wind
      for (var w = 0; w < 4; w++) {
        var ring = part(GX.torus(), w % 2 ? 0xffffff : 0xbff5ff, 0, (w - 1.5) * 0.18, 0, 0.42 - w * 0.06, 0.42 - w * 0.06, 0.6, inner, { transparent: true, opacity: 0.55, depthWrite: false });
        ring.rotation.x = Math.PI / 2; ring.castShadow = false;
      }
      part(GX.sphere(8), 0xeafff4, 0, 0, 0, 0.22, 0.32, 0.22, inner, { transparent: true, opacity: 0.35, depthWrite: false }).castShadow = false;
    }
    else if (what === 'wave') {   // a rolling wave with foam on top
      var wv = part(GX.cyl(1, 1, 12), 0x3a9ad8, 0, 0, 0, 0.42, 0.95, 0.42, inner, { transparent: true, opacity: 0.85 }); wv.rotation.z = Math.PI / 2;
      var fm = part(GX.cyl(1, 1, 10), 0xeafcff, 0, 0.3, 0, 0.18, 0.98, 0.18, inner); fm.rotation.z = Math.PI / 2;
    } else if (what === 'spark') {   // a ball of lightning
      part(GX.sphere(10), 0xfff27a, 0, 0, 0, 0.3, 0.3, 0.3, inner, { basic: true });
      part(GX.sphere(10), 0xffe14a, 0, 0, 0, 0.46, 0.46, 0.46, inner, { additive: true, basic: true, opacity: 0.45 });
      for (var sk = 0; sk < 4; sk++) part(GX.box(), 0xffffff, 0, 0, 0, 0.05, 0.75, 0.05, inner, { basic: true }).rotation.set(sk * 0.8, sk * 1.3, sk * 0.5);
    }
    else part(GX.dodec(), 0x6a5a52, 0, 0, 0, 0.42, 0.42, 0.42, inner);
    inner.position.y = 0.38;
    g.userData.inner = inner;
    parent.add(g);
    return g;
  }

  // move the 3D parts and collect ground warnings (out: decal requests)
  TR.draw = function (dt, t, out) {
    var G = SC.G, L = G && G.L, p = player();
    if (!L || !p) return;
    var W = SC.world;
    for (var i = 0; i < vis.length; i++) {
      var v = vis[i], tr = v.t, cx = tr.tx + 0.5, cy = tr.ty + 0.5;
      var near = Math.abs(cx - p.x) < 15 && Math.abs(cy - p.y) < 12;
      v.g.visible = near || tr.kind === 'roller';
      if (!near) continue;
      var wf = tr.warnF || 0, pulse = 0.55 + 0.45 * Math.abs(Math.sin(t * (wf > 0.6 ? 20 : 10)));
      switch (tr.kind) {
        case 'spikes':
          var y = tr.active ? 0 : wf > 0 ? -0.33 + wf * 0.1 : -0.46;
          v.spikes.position.y = SC.lerp(v.spikes.position.y, y, Math.min(1, dt * (tr.active ? 30 : 10)));
          v.plate.material = wf > 0 || tr.active ? warnMat.red : v.cold;
          if (wf > 0) out.push({ shape: 'circle', x: cx, y: cy, r: 0.62, color: colorOf(tr), fill: wf, alpha: pulse });
          break;
        case 'darts':
          v.eyes.forEach(function (e) { e.material = wf > 0 ? v.hot : v.cold; });
          if (wf > 0) out.push({ shape: 'line', x: cx + DIRV[tr.dir][0] * 0.5, y: cy + DIRV[tr.dir][1] * 0.5, ang: Math.atan2(DIRV[tr.dir][1], DIRV[tr.dir][0]), len: tr.len || 8, width: 0.7, color: colorOf(tr), fill: wf, alpha: pulse });
          break;
        case 'plate':
          v.top.position.y = tr.down ? 0.0 : 0.04;
          break;
        case 'roller':
          var rolling = (L.trapShots || []).some(function (s) { return s.trap === tr; });
          v.waiting.visible = true;
          var sh = wf > 0 ? Math.sin(t * 40) * 0.03 * wf : 0;
          v.waiting.position.set(sh, 0, 0);
          v.waiting.scale.setScalar(Math.min(1, (tr.c || 0) * 6 + 0.01));
          var dv = DIRV[tr.dir];
          v.waiting.rotation.y = Math.PI / 2 - Math.atan2(dv[1], dv[0]);
          if (v.fan) v.fan.rotation.z += dt * (wf > 0 ? 6 + wf * 20 : 2);
          if (tr.what === 'gust') v.waiting.userData.inner.rotation.y += dt * 4;
          if (wf > 0) out.push({ shape: 'line', x: cx, y: cy, ang: Math.atan2(dv[1], dv[0]), len: tr.len || 8, width: 1.0, color: colorOf(tr), fill: wf, alpha: pulse });
          if (rolling && wf <= 0) { /* lane busy */ }
          break;
        case 'icicle':
          v.cloud.position.x = Math.sin(t * 0.8 + i) * 0.05;
          v.ice.visible = !((L.trapShots || []).some(function (s) { return s.trap === tr; }));
          v.ice.position.x = wf > 0 ? Math.sin(t * 50) * 0.03 * wf : 0;
          var grow = Math.min(1, (tr.c || 0) * 3 + 0.2);
          if (tr.style) v.ice.scale.copy(v.iceS).multiplyScalar(grow); else v.ice.scale.set(0.1, 0.5 * grow, 0.1);
          if (wf > 0) out.push({ shape: 'circle', x: cx, y: cy, r: 0.75, color: colorOf(tr), fill: wf, alpha: pulse });
          break;
        case 'rod':
          v.ball.material = wf > 0 && Math.sin(t * 30) > 0 ? v.hot : v.cold;
          if (wf > 0 && Math.random() < 0.4) GX.emit(cx + SC.rand(-0.1, 0.1), v.g.position.y + 2.2, cy + SC.rand(-0.1, 0.1), 'spark', SC.rand(-1, 1), SC.rand(0, 1.5), SC.rand(-1, 1));
          if (wf > 0) out.push({ shape: 'circle', x: cx, y: cy, r: tr.r || 1.7, color: COLOR.rod, fill: wf, alpha: pulse });
          else out.push({ shape: 'ring', x: cx, y: cy, r: tr.r || 1.7, color: '#c8b04a', fill: 0, alpha: 0.25 });
          break;
        case 'puff':
          var ps = tr.active ? 1 : wf * 0.25;
          v.cloud.visible = ps > 0.02; v.cloud.scale.setScalar(Math.max(0.01, ps) * (1 + Math.sin(t * 6) * 0.05));
          v.cloud.rotation.y += dt;
          if (wf > 0 && Math.random() < 0.3) GX.emit(cx + SC.rand(-0.3, 0.3), v.g.position.y + 0.1, cy + SC.rand(-0.3, 0.3), tr.style === 'spore' ? 'life' : 'shadow', 0, 0.8, 0);
          if (wf > 0) out.push({ shape: 'circle', x: cx, y: cy, r: 0.9, color: colorOf(tr), fill: wf, alpha: pulse });
          break;
        case 'vent':
          v.flame.visible = tr.active;
          if (tr.active) { v.flame.scale.set(1 + Math.sin(t * 30) * 0.08, 0.85 + Math.sin(t * 23) * 0.15, 1 + Math.cos(t * 27) * 0.08); if (Math.random() < 0.6) GX.emit(cx, v.g.position.y + 1.2, cy, 'fire', SC.rand(-0.5, 0.5), 2.5, SC.rand(-0.5, 0.5)); }
          v.glow.material.opacity = 0.15 + wf * 0.6 + (tr.active ? 0.6 : 0);
          if (wf > 0 && Math.random() < 0.25) GX.emit(cx + SC.rand(-0.3, 0.3), v.g.position.y + 0.1, cy + SC.rand(-0.3, 0.3), 'smoke', 0, 1, 0);
          if (wf > 0) out.push({ shape: 'circle', x: cx, y: cy, r: 0.65, color: COLOR.vent, fill: wf, alpha: pulse });
          break;
        case 'geyser':
          v.jet.visible = tr.active;
          if (tr.active) { var jf = Math.min(1, ((tr.c || 0) - TIMING.geyser.hit) / 0.04); v.jet.scale.set(1 + Math.sin(t * 20) * 0.06, Math.max(0.05, jf) * (1.6 + Math.sin(t * 15) * 0.1), 1 + Math.cos(t * 20) * 0.06); }
          if (wf > 0 && Math.random() < 0.5) GX.emit(cx + SC.rand(-0.3, 0.3), v.g.position.y + 0.05, cy + SC.rand(-0.3, 0.3), 'bubble', 0, 0.8, 0);
          if (wf > 0) out.push({ shape: 'circle', x: cx, y: cy, r: 0.7, color: COLOR.geyser, fill: wf, alpha: pulse });
          break;
      }
    }
    // things in flight
    var used = { dart: 0, roll: 0, icicle: 0 };
    (L.trapShots || []).forEach(function (s) {
      var pool = shotPool[s.kind + (s.what || '')] || (shotPool[s.kind + (s.what || '')] = []);
      var key = s.kind + (s.what || ''), n = used[key] || 0; used[key] = n + 1;
      var m = pool[n];
      if (!m) {
        m = new THREE.Group();
        if (s.kind === 'dart' && s.what === 'water') {
          part(GX.sphere(10), 0x4ab0ff, 0, 0, 0, 0.2, 0.2, 0.26, m, { transparent: true, opacity: 0.85, emissive: 0x0a3060 });
          part(GX.sphere(8), 0xbfe8ff, 0, 0, -0.22, 0.12, 0.12, 0.2, m, { transparent: true, opacity: 0.6 });
          part(GX.sphere(6), 0xffffff, -0.06, 0.08, 0.1, 0.05, 0.04, 0.03, m, { basic: true });
        } else if (s.kind === 'dart') {
          var dc = s.what === 'shadow' ? 0x3a2a5a : s.what === 'thorn' ? 0x3a7a2a : 0x6a4a2a, fc = s.what === 'shadow' ? 0xc08aff : s.what === 'thorn' ? 0x9ae04a : 0xff5a5a;
          var d = part(GX.cyl(0.03, 0.03, 5), dc, 0, 0, 0, 1, 0.45, 1, m); d.rotation.x = Math.PI / 2; var tip = part(GX.cone(5), s.what === 'shadow' ? 0xb07aff : 0xc8c8d8, 0, 0, 0.27, 0.05, 0.12, 0.05, m, s.what === 'shadow' ? { emissive: 0x5a2aaa } : null); tip.rotation.x = Math.PI / 2; part(GX.box(), fc, 0, 0, -0.2, 0.1, 0.02, 0.08, m);
        }
        else if (s.kind === 'roll') { var r = makeRoller(s.what, m); m.userData.inner = r.userData.inner; m.userData.root = r; }
        else if (s.trap && s.trap.style === 'coconut') part(GX.sphere(8), 0x7a5232, 0, 0, 0, 0.2, 0.2, 0.2, m);
        else if (s.trap && s.trap.style === 'rock') part(GX.dodec(), 0x8a6a52, 0, 0, 0, 0.26, 0.24, 0.26, m, { flatShading: true });
        else { var ic = part(GX.cone(6), 0xbff0ff, 0, 0, 0, 0.12, 0.6, 0.12, m, { emissive: 0x1a4a5a }); ic.rotation.x = Math.PI; }
        GX.addToLevel(m); pool.push(m);
      }
      m.visible = true;
      var gh = W.heightAt(s.x, s.y);
      if (s.kind === 'dart') { m.position.set(s.x, gh + 0.55, s.y); m.rotation.y = Math.PI / 2 - Math.atan2(s.dy, s.dx); }
      else if (s.kind === 'roll') {
        m.position.set(s.x, gh, s.y);
        var root = m.userData.root, inner = root.userData.inner;
        root.rotation.y = Math.PI / 2 - Math.atan2(s.dy, s.dx);
        if (s.what === 'gust') { inner.rotation.y = s.a * 1.5; inner.position.y = 0.5; } else inner.rotation.x = s.a;
        var fade = Math.min(1, (s.len - s.d) / 0.6);
        m.scale.setScalar(Math.max(0.05, fade));
      } else { var fh = 3.0 * (1 - s.fall * s.fall); m.position.set(s.x, gh + 0.3 + fh, s.y); }
    });
    for (var k in shotPool) for (var q = used[k] || 0; q < shotPool[k].length; q++) shotPool[k][q].visible = false;
  };
})();
