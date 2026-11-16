// Nine Crests - drawing the crest temples. Each temple is themed for its element: coloured walls with trim and a little
// decoration on top, two big entrance pillars under a lintel with the element's glowing symbol and the temple's name,
// a door that sinks into the floor when it opens, braziers with element flames, an inlaid floor and an altar.
// All walls are instanced through GX.inst() with tall = true, so walls between the camera and the hero squash down.
// Only temples near the hero are animated. Everything belongs to the level and is thrown away with it.
(function () {
  'use strict';
  var SC = window.SC, GX = SC.gfx;
  var TV = SC.templeView = {};
  var M = function () { return GX.M.apply(null, arguments); };
  var LOOK = {
    fire: { wall: 0x9a4e3a, wall2: 0x6a3428, trim: 0xe8a850, accent: 0xff6a1a, floor: 0x7a5648, inlay: 0xff8a2a, flame: [0xff7a1a, 0xffd23f], fx: 'fire', name: '#ffb070', deco: 'lava' },
    lightning: { wall: 0x5e6688, wall2: 0x454c6a, trim: 0xffe14a, accent: 0xfff27a, floor: 0x6c7290, inlay: 0xffe14a, flame: [0xfff27a, 0xffffff], fx: 'spark', name: '#fff27a', deco: 'rods' },
    water: { wall: 0x5a92c4, wall2: 0x3e6e9e, trim: 0xf4f0e4, accent: 0x2f8cff, floor: 0x80a6c6, inlay: 0x3aa0ff, flame: [0x3a9aff, 0xbfe8ff], fx: 'water', name: '#8fd0ff', deco: 'shells' },
    ice: { wall: 0xcfe8fa, wall2: 0x9cc4e2, trim: 0xffffff, accent: 0x8fe8ff, floor: 0xdcecf8, inlay: 0x7fd8ff, flame: [0x8fe8ff, 0xffffff], fx: 'ice', name: '#c8f4ff', deco: 'crystals' },
    surface: { wall: 0x4abab2, wall2: 0x2f8e88, trim: 0xe6fdff, accent: 0x56d8e8, floor: 0x8ad8d0, inlay: 0x9ff4ff, flame: [0x9ff0ff, 0xffffff], fx: 'bubble', name: '#9ff4ff', deco: 'bubbles' },
    earth: { wall: 0xae8a5c, wall2: 0x84663e, trim: 0x6a9a3a, accent: 0xd8a050, floor: 0x9c8266, inlay: 0xffd59a, flame: [0xffb040, 0xffe080], fx: 'rock', name: '#ffd59a', deco: 'boulders' },
    wind: { wall: 0xeef3f6, wall2: 0xc6d4de, trim: 0x7ac8ec, accent: 0xa8f0c8, floor: 0xe2eaee, inlay: 0x7ac8ec, flame: [0xbff5d8, 0xffffff], fx: 'wind', name: '#bff5ff', deco: 'banners' },
    life: { wall: 0x7c9c6a, wall2: 0x587a46, trim: 0xffd860, accent: 0x45d65a, floor: 0x8ca27a, inlay: 0x8ae05a, flame: [0x7dff8a, 0xfff27a], fx: 'life', name: '#b8ff9a', deco: 'vines' },
    death: { wall: 0x4a3a66, wall2: 0x30244a, trim: 0x9b4dff, accent: 0xb07aff, floor: 0x4c4064, inlay: 0xa86aff, flame: [0x9b4dff, 0xe2c8ff], fx: 'shadow', name: '#d8b8ff', deco: 'spikes' }
  };
  TV.LOOK = LOOK;
  var mats = {};
  function vc() { return mats.vc || (mats.vc = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true })); }
  function glowM() { return mats.glow || (mats.glow = new THREE.MeshBasicMaterial({ color: 0xffffff })); }
  function waterM() { return mats.water || (mats.water = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, emissive: 0x0a2a4a })); }
  function bubM() { return mats.bub || (mats.bub = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false, emissive: 0x1a4a5a })); }
  function G(key, make) { return GX.geo('tpl:' + key, make); }
  function shade(c, l) { return new THREE.Color(c).offsetHSL(0, 0, l).getHex(); }

  // ---------------- shapes (standing on y = 0, one tile wide) ----------------
  var WH = 1.5;   // wall height
  function wallGeo(pw, lk) {
    return G('wall:' + pw, function () {
      return GX.mergeColored([
        { geo: GX.box(), m: M(0, 0.1, 0, 1.02, 0.2, 1.02), c: lk.wall2 },
        { geo: GX.box(), m: M(0, 0.2 + (WH - 0.2) / 2, 0, 0.96, WH - 0.2, 0.96), c: lk.wall },
        { geo: GX.box(), m: M(0, 0.62, 0, 0.98, 0.06, 0.98), c: shade(lk.wall, -0.06) },
        { geo: GX.box(), m: M(0, WH - 0.08, 0, 1.0, 0.1, 1.0), c: lk.trim },
        { geo: GX.box(), m: M(0, WH + 0.04, 0, 1.06, 0.12, 1.06), c: lk.wall2 },
        { geo: GX.box(), m: M(0, WH + 0.22, 0, 0.42, 0.24, 0.42), c: lk.wall }
      ]);
    });
  }
  function pillarGeo(pw, lk) {
    return G('pillar:' + pw, function () {
      return GX.mergeColored([
        { geo: GX.box(), m: M(0, 0.15, 0, 1.12, 0.3, 1.12), c: lk.wall2 },
        { geo: GX.box(), m: M(0, 1.05, 0, 1.0, 1.6, 1.0), c: lk.wall },
        { geo: GX.box(), m: M(0, 1.6, 0, 1.04, 0.1, 1.04), c: lk.trim },
        { geo: GX.box(), m: M(0, 1.95, 0, 1.12, 0.14, 1.12), c: lk.wall2 },
        { geo: GX.cyl(0.35, 0.5, 8), m: M(0, 2.12, 0, 1, 0.22, 1), c: lk.trim }
      ]);
    });
  }
  function orbGeo() { return G('orb', function () { return GX.mergeColored([{ geo: GX.sphere(10), m: M(0, 2.45, 0, 0.2, 0.2, 0.2), c: 0xffffff }]); }); }
  // the two big pillars by the door
  function bigPillarGeo(pw, lk) {
    return G('bigpillar:' + pw, function () {
      return GX.mergeColored([
        { geo: GX.box(), m: M(0, 0.15, 0, 0.9, 0.3, 0.9), c: lk.wall2 },
        { geo: GX.cyl(0.3, 0.34, 12), m: M(0, 1.5, 0, 1, 2.4, 1), c: lk.wall },
        { geo: GX.cyl(0.36, 0.36, 12), m: M(0, 0.55, 0, 1, 0.12, 1), c: lk.trim },
        { geo: GX.cyl(0.36, 0.36, 12), m: M(0, 2.35, 0, 1, 0.12, 1), c: lk.trim },
        { geo: GX.box(), m: M(0, 2.82, 0, 0.86, 0.22, 0.86), c: lk.wall2 }
      ]);
    });
  }
  // the beam across the top of the entrance (5 tiles wide, along local x)
  function lintelGeo(pw, lk) {
    return G('lintel:' + pw, function () {
      return GX.mergeColored([
        { geo: GX.box(), m: M(0, 3.08, 0, 5.2, 0.34, 0.9), c: lk.wall },
        { geo: GX.box(), m: M(0, 2.9, 0, 5.3, 0.08, 0.95), c: lk.trim },
        { geo: GX.box(), m: M(0, 3.3, 0, 5.4, 0.12, 1.0), c: lk.wall2 },
        { geo: GX.cone(4), m: M(0, 3.62, 0, 1.6, 0.5, 0.55, 0, Math.PI / 4, 0), c: lk.wall2 },
        { geo: GX.box(), m: M(-2.4, 3.48, 0, 0.3, 0.3, 0.3), c: lk.trim }, { geo: GX.box(), m: M(2.4, 3.48, 0, 0.3, 0.3, 0.3), c: lk.trim }
      ]);
    });
  }
  function slabGeo() { return G('slab', function () { return GX.mergeColored([{ geo: GX.box(), m: M(0, 0.03, 0, 0.96, 0.06, 0.96), c: 0xffffff }]); }); }
  function stripGeo() { return G('strip', function () { return GX.mergeColored([{ geo: GX.box(), m: M(0, 0.07, 0, 0.36, 0.03, 1.0), c: 0xffffff }]); }); }
  function braGeo(pw, lk) {
    return G('brazier:' + pw, function () {
      return GX.mergeColored([
        { geo: GX.cyl(0.26, 0.32, 8), m: M(0, 0.1, 0, 1, 0.2, 1), c: lk.wall2 },
        { geo: GX.cyl(0.13, 0.17, 8), m: M(0, 0.55, 0, 1, 0.75, 1), c: lk.wall },
        { geo: GX.cyl(0.38, 0.2, 10), m: M(0, 1.0, 0, 1, 0.24, 1), c: lk.trim },
        { geo: GX.cyl(0.3, 0.3, 10), m: M(0, 1.11, 0, 1, 0.03, 1), c: 0x2a1a14 }
      ]);
    });
  }
  function altarGeo(pw, lk) {
    return G('altar:' + pw, function () {
      return GX.mergeColored([
        { geo: GX.box(), m: M(0, 0.2, 0, 1.0, 0.4, 0.9), c: lk.wall2 },
        { geo: GX.box(), m: M(0, 0.62, 0, 0.8, 0.5, 0.7), c: lk.wall },
        { geo: GX.box(), m: M(0, 0.92, 0, 0.94, 0.1, 0.84), c: lk.trim },
        { geo: GX.box(), m: M(0, 1.4, -0.2, 0.7, 0.9, 0.16), c: lk.wall },
        { geo: GX.box(), m: M(0, 1.88, -0.2, 0.8, 0.1, 0.22), c: lk.trim }
      ]);
    });
  }
  function daisGeo(pw, lk) {
    return G('dais:' + pw, function () {
      return GX.mergeColored([{ geo: GX.cyl(0.62, 0.7, 16), m: M(0, 0.05, 0, 1, 0.1, 1), c: lk.trim }, { geo: GX.cyl(0.5, 0.5, 16), m: M(0, 0.11, 0, 1, 0.02, 1), c: lk.inlay }]);
    });
  }
  // decoration on top of some wall tiles (built on top of the wall height, so it squashes with the wall)
  function decoGeo(pw, lk) {
    return G('deco:' + pw, function () {
      var p = [], y = WH + 0.1;
      switch (lk.deco) {
        case 'lava': p.push({ geo: GX.dodec(), m: M(0, y + 0.2, 0, 0.3, 0.26, 0.3), c: 0x4a2a22, flat: true }, { geo: GX.cone(5), m: M(0, y + 0.55, 0, 0.14, 0.4, 0.14), c: 0xff8a2a, flat: true }); break;
        case 'rods': p.push({ geo: GX.cyl(0.04, 0.05, 6), m: M(0, y + 0.6, 0, 1, 1.2, 1), c: 0x9a9aa8 }, { geo: GX.box(), m: M(0.08, y + 0.9, 0, 0.05, 0.3, 0.05, 0, 0, 0.6), c: lk.trim }); break;
        case 'shells': p.push({ geo: GX.sphere(8), m: M(0, y + 0.18, 0, 0.3, 0.2, 0.26), c: 0xffb0a0 }, { geo: GX.cone(6), m: M(0.12, y + 0.3, 0.05, 0.08, 0.24, 0.08, 0, 0, -0.5), c: 0xff8a7a }); break;
        case 'crystals': p.push({ geo: GX.oct(), m: M(0, y + 0.45, 0, 0.18, 0.55, 0.18), c: 0xdff8ff, flat: true }, { geo: GX.oct(), m: M(0.18, y + 0.25, 0.05, 0.1, 0.3, 0.1, 0, 0, -0.5), c: 0xbfeeff, flat: true }, { geo: GX.oct(), m: M(-0.16, y + 0.22, -0.06, 0.09, 0.26, 0.09, 0, 0, 0.5), c: 0xffffff, flat: true }); break;
        case 'bubbles': p.push({ geo: GX.cyl(0.2, 0.26, 8), m: M(0, y + 0.1, 0, 1, 0.2, 1), c: lk.trim }); break;
        case 'boulders': p.push({ geo: GX.dodec(), m: M(0, y + 0.2, 0, 0.32, 0.28, 0.3), c: 0x8a7a62, flat: true }, { geo: GX.sphere(7), m: M(0.05, y + 0.42, 0, 0.26, 0.08, 0.24), c: 0x5a9a3a }); break;
        case 'banners': p.push({ geo: GX.cyl(0.03, 0.04, 6), m: M(0, y + 0.7, 0, 1, 1.4, 1), c: 0x8a7a6a }, { geo: GX.box(), m: M(0.24, y + 1.15, 0, 0.44, 0.3, 0.03), c: lk.accent }, { geo: GX.box(), m: M(0.24, y + 0.95, 0, 0.3, 0.12, 0.03), c: lk.trim }); break;
        case 'vines': p.push({ geo: GX.sphere(7), m: M(0, y + 0.1, 0, 0.42, 0.22, 0.42), c: 0x4aa83a, flat: true }, { geo: GX.sphere(6), m: M(0.2, y + 0.24, 0.1, 0.09, 0.09, 0.09), c: 0xff8ad8 }, { geo: GX.box(), m: M(0.5, y - 0.5, 0, 0.06, 1.0, 0.1), c: 0x3a8a2a }); break;
        case 'spikes': p.push({ geo: GX.cone(4), m: M(0, y + 0.4, 0, 0.16, 0.8, 0.16), c: 0x7a4ab8, flat: true }, { geo: GX.cone(4), m: M(0.18, y + 0.22, 0.06, 0.1, 0.44, 0.1, 0, 0, -0.4), c: 0x5a3a8a, flat: true }); break;
      }
      return GX.mergeColored(p);
    });
  }

  // ---------------- signs ----------------
  function nameTex(text, color, accent) {
    return GX.canvasTex(512, 128, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(24,16,48,0.88)'; g.beginPath();
      if (g.roundRect) g.roundRect(6, 10, w - 12, h - 20, 30); else g.rect(6, 10, w - 12, h - 20);
      g.fill(); g.lineWidth = 7; g.strokeStyle = accent; g.stroke();
      g.font = 'bold 62px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 9; g.strokeStyle = '#140a28'; g.strokeText(text, w / 2, h / 2 + 3);
      g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 3);
    });
  }
  function css(hex) { return '#' + new THREE.Color(hex).getHexString(); }

  // ---------------- building ----------------
  var vis = [];
  TV.clear = function () { vis = []; };
  TV.count = function () { return vis.length; };
  TV.build = function (L) {
    vis = [];
    if (!GX.ok || !L.temples || !L.temples.length) return;
    var W = SC.world, T = W.TIER, items = {}, shapes = {};
    function add(key, shape, mat, it, opts) { if (!items[key]) { items[key] = []; shapes[key] = { geo: shape, mat: mat, opts: opts || {} }; } items[key].push(it); }
    L.temples.forEach(function (t) {
      var lk = LOOK[t.power] || LOOK.fire, pw = t.power, hIn = (t.t0 + 1) * T, ry = Math.atan2(-t.f[0], -t.f[1]);
      var v0 = { t: t, lk: lk, flames: [], near: false, doorT: W.tile(t.door[1].tx, t.door[1].ty) === 'Q' ? 0 : 1, sprites: [] };
      var R = t.rect;
      for (var ty = R.y0; ty <= R.y1; ty++) for (var tx = R.x0; tx <= R.x1; tx++) {
        var ch = W.tile(tx, ty), dx = tx - t.ex, dy = ty - t.ey, u = dx * t.a[0] + dy * t.a[1], v = dx * t.f[0] + dy * t.f[1];
        var h = GX.drawH(L, tx, ty), x = tx + 0.5, z = ty + 0.5;
        var it = { x: x, y: h, z: z, sx: 1, sy: 1, sz: 1, ry: ry, tall: true, c: 0xffffff };
        if (ch === 'W') {
          var junction = Math.abs(u) === 5 && (v === 2 || v === 9 || v === 17) || (v === 9 && Math.abs(u) === 2);
          if (junction) { add('pillar:' + pw, pillarGeo(pw, lk), vc(), it); add('orb', orbGeo(), glowM(), { x: x, y: h, z: z, sx: 1, sy: 1, sz: 1, ry: 0, tall: true, c: lk.accent }, { cast: false }); }
          else {
            add('wall:' + pw, wallGeo(pw, lk), vc(), { x: x, y: h, z: z, sx: 1, sy: 1, sz: 1, ry: ry, tall: true, c: SC.hash(tx * 3, ty * 7) < 0.5 ? 0xffffff : 0xf0f0f0 });
            if (((u + v) % 3 + 3) % 3 === 0 && lk.deco) {
              add('deco:' + pw, decoGeo(pw, lk), vc(), { x: x, y: h, z: z, sx: 1, sy: 1, sz: 1, ry: ry + (SC.hash(tx, ty) - 0.5) * 0.6, tall: true, c: 0xffffff });
              if (lk.deco === 'bubbles') add('bubble', G('bubble', function () { return GX.mergeColored([{ geo: GX.sphere(12), m: M(0, WH + 0.55, 0, 0.3, 0.3, 0.3), c: 0xffffff }]); }), bubM(), { x: x, y: h, z: z, sx: 1, sy: 1, sz: 1, ry: 0, tall: true, c: 0xdffcff }, { cast: false });
              if (lk.deco === 'rods') add('orb', orbGeo(), glowM(), { x: x, y: h - 0.4, z: z, sx: 0.6, sy: 1, sz: 0.6, ry: 0, tall: true, c: lk.trim }, { cast: false });
            }
          }
          continue;
        }
        if (ch === 'Y' && v === 1) { add('bigpillar:' + pw, bigPillarGeo(pw, lk), vc(), it); continue; }
        if (ch === 'Y') { add('brazier:' + pw, braGeo(pw, lk), vc(), { x: x, y: h, z: z, sx: 1, sy: 1, sz: 1, ry: 0, c: 0xffffff }); v0.flames.push(flame(x, h + 1.12, z, lk)); continue; }
        if (ch === 'J') {
          add('slab', slabGeo(), vc(), { x: x, y: h, z: z, sx: 1, sy: 1, sz: 1, ry: 0, c: lk.floor }, { cast: false, receive: true });
          add('altar:' + pw, altarGeo(pw, lk), vc(), { x: x, y: h, z: z, sx: 1, sy: 1, sz: 1, ry: ry, c: 0xffffff });
          continue;
        }
        if (ch === 'S' || W.isSolidScenery(ch) && ch !== 'Q') continue;   // steps and trap blocks are drawn elsewhere
        // floor: a checker of two shades, the path down the middle inlaid, a dais under the crest
        var fc = ((Math.floor(u) + Math.floor(v)) & 1) ? lk.floor : shade(lk.floor, -0.05);
        add('slab', slabGeo(), vc(), { x: x, y: h, z: z, sx: 1, sy: 1, sz: 1, ry: 0, c: fc }, { cast: false, receive: true });
        if (u === 0 && v >= 3 && v <= 14 && v !== 9) add('strip', stripGeo(), glowM(), { x: x, y: h, z: z, sx: 1, sy: 1, sz: 1, ry: ry, c: shade(lk.inlay, -0.05) }, { cast: false });
        if (Math.abs(u) === 4 && v >= 3 && v <= 8 && (lk.deco === 'lava' || lk.deco === 'shells' || lk.deco === 'bubbles')) add(lk.deco === 'lava' ? 'strip' : 'water', lk.deco === 'lava' ? stripGeo() : stripGeo(), lk.deco === 'lava' ? glowM() : waterM(), { x: x, y: h + 0.005, z: z, sx: 1.8, sy: 1, sz: 1, ry: ry, c: lk.deco === 'lava' ? 0xff7a1a : 0x4ab0ff }, { cast: false });
        if (tx === t.altar.tx && ty === t.altar.ty) add('dais:' + pw, daisGeo(pw, lk), vc(), { x: x, y: h, z: z, sx: 1, sy: 1, sz: 1, ry: 0, c: 0xffffff }, { cast: false, receive: true });
      }
      // the lintel over the entrance and the signs
      var mid = { x: t.ex + t.f[0] * 1 + 0.5, z: t.ey + t.f[1] * 1 + 0.5 }, hOut = t.t0 * T;
      add('lintel:' + pw, lintelGeo(pw, lk), vc(), { x: mid.x, y: hOut + 0.02, z: mid.z, sx: 1, sy: 1, sz: 1, ry: ry, tall: true, c: 0xffffff });
      var icon = SC.models && SC.models.iconTexture ? SC.models.iconTexture(pw) : null;
      if (icon) {
        var sm = GX.own(new THREE.SpriteMaterial({ map: icon, transparent: true, depthWrite: false }));
        var emb = new THREE.Sprite(sm); emb.position.set(mid.x - t.f[0] * 0.7, hOut + 3.75, mid.z - t.f[1] * 0.7); emb.scale.set(1.25, 1.25, 1); emb.renderOrder = 4; GX.addToLevel(emb); v0.emblem = emb;
        var am = GX.own(new THREE.SpriteMaterial({ map: icon, transparent: true, depthWrite: false }));
        var alt = new THREE.Sprite(am); alt.position.set(t.altarBlock.tx + 0.5 - t.f[0] * 0.2, hIn + 2.5, t.altarBlock.ty + 0.5 - t.f[1] * 0.2); alt.scale.set(0.9, 0.9, 1); GX.addToLevel(alt); v0.altarIcon = alt;
      }
      var nt = GX.own(nameTex(t.name, lk.name, css(lk.accent)));
      nt.wrapS = nt.wrapT = THREE.ClampToEdgeWrapping;
      var nm = GX.own(new THREE.SpriteMaterial({ map: nt, transparent: true, depthWrite: false }));
      var board = new THREE.Sprite(nm); board.position.set(mid.x - t.f[0] * 0.7, hOut + 4.75, mid.z - t.f[1] * 0.7); board.scale.set(3.4, 0.85, 1); board.renderOrder = 5; GX.addToLevel(board); v0.board = board;
      // the door: one slab with a trim frame and the element symbol, sinks into the floor when it opens
      var dg = new THREE.Group(), dc = t.door[1];
      dg.position.set(dc.tx + 0.5, hIn, dc.ty + 0.5); dg.rotation.y = ry;
      var dm = GX.mat(shade(lk.wall2, -0.04)), tm = GX.mat(lk.trim);
      var slab = new THREE.Mesh(GX.box(), dm); slab.scale.set(2.96, 1.9, 0.32); slab.position.y = 0.95; slab.castShadow = true; dg.add(slab);
      [[-1.42, 0.95, 0.12, 1.9], [1.42, 0.95, 0.12, 1.9], [0, 1.86, 2.96, 0.12], [0, 0.5, 2.9, 0.08], [0, 1.4, 2.9, 0.08]].forEach(function (b) { var fr = new THREE.Mesh(GX.box(), tm); fr.scale.set(b[2], b[3], 0.38); fr.position.set(b[0], b[1], 0); dg.add(fr); });
      if (icon) {
        var em = GX.own(new THREE.MeshBasicMaterial({ map: icon, transparent: true, depthWrite: false }));
        [-1, 1].forEach(function (sd) { var pl = new THREE.Mesh(GX.geo('tplPlane', function () { return new THREE.PlaneGeometry(1, 1); }), em); pl.scale.set(1.0, 1.0, 1); pl.position.set(0, 0.97, sd * 0.2); if (sd < 0) pl.rotation.y = Math.PI; dg.add(pl); });
      }
      GX.addToLevel(dg); v0.door = dg; dg.visible = v0.doorT < 1;
      vis.push(v0);
    });
    for (var k in items) GX.inst(shapes[k].geo, shapes[k].mat, items[k], shapes[k].opts);
  };
  // a brazier flame: two glowing cones (only animated when near)
  function flame(x, y, z, lk) {
    var g = new THREE.Group();
    g.position.set(x, y, z);
    var a = new THREE.Mesh(GX.cone(7), GX.mat(lk.flame[0], { additive: true, basic: true, opacity: 0.85 })); a.scale.set(0.26, 0.7, 0.26); a.position.y = 0.32; g.add(a);
    var b = new THREE.Mesh(GX.cone(7), GX.mat(lk.flame[1], { additive: true, basic: true, opacity: 0.9 })); b.scale.set(0.14, 0.48, 0.14); b.position.y = 0.24; g.add(b);
    GX.addToLevel(g);
    return g;
  }

  // ---------------- every frame ----------------
  TV.update = function (dt, time) {
    if (!vis.length) return;
    var G = SC.G, p = G.player, W = SC.world;
    if (!p) return;
    for (var i = 0; i < vis.length; i++) {
      var v = vis[i], t = v.t, cx = t.door[1].tx + 0.5 + t.f[0] * 7, cy = t.door[1].ty + 0.5 + t.f[1] * 7;
      var near = Math.abs(cx - p.x) < 24 && Math.abs(cy - p.y) < 20;
      if (near !== v.near) { v.near = near; v.flames.forEach(function (f) { f.visible = near; }); }
      // the door sinks when the temple opens
      var shut = W.tile(t.door[1].tx, t.door[1].ty) === 'Q';
      if (!shut && v.doorT < 1) {
        v.doorT = Math.min(1, v.doorT + dt / 1.3);
        v.door.position.y = (t.t0 + 1) * W.TIER - 2.0 * v.doorT * v.doorT;
        v.door.position.x = t.door[1].tx + 0.5 + Math.sin(time * 40) * 0.03 * (1 - v.doorT);
        if (Math.random() < 0.6) GX.emit(t.door[1].tx + 0.5 + SC.rand(-1.4, 1.4), (t.t0 + 1) * W.TIER + 0.1, t.door[1].ty + 0.5, 'dust', SC.rand(-1, 1), 1, SC.rand(-1, 1));
        if (v.doorT >= 1) v.door.visible = false;
      }
      // the name board and the symbol over the door fade away when the hero is at the door or inside (never in the way)
      var dd = t.door[1], atDoor = SC.dist(p.x, p.y, dd.tx + 0.5, dd.ty + 0.5) < 2.6 || W.inBox(t.rect, p.x, p.y, 0.5);
      v.signA = SC.approach(v.signA === undefined ? 1 : v.signA, atDoor ? 0 : 1, dt * 3);
      if (v.board) { v.board.material.opacity = v.signA; v.board.visible = v.signA > 0.02; }
      if (v.emblem) { v.emblem.material.opacity = v.signA; v.emblem.visible = v.signA > 0.02; }
      if (!near) continue;
      if (v.emblem) { var s = 1.1 + Math.sin(time * 2.2 + i) * 0.06; v.emblem.scale.set(s, s, 1); }
      if (v.altarIcon) v.altarIcon.position.y = (t.t0 + 1) * W.TIER + 2.5 + Math.sin(time * 1.8 + i) * 0.08;
      for (var f = 0; f < v.flames.length; f++) {
        var fl = v.flames[f], k = 0.85 + Math.sin(time * 11 + f * 2.1 + i) * 0.1 + Math.sin(time * 6.7 + f) * 0.08;
        fl.scale.set(0.95 + Math.sin(time * 8 + f) * 0.06, k, 0.95 + Math.cos(time * 7 + f) * 0.06);
        fl.rotation.y = time * 1.5 + f;
        if (Math.random() < 0.06) GX.emit(fl.position.x + SC.rand(-0.1, 0.1), fl.position.y + 0.5, fl.position.z + SC.rand(-0.1, 0.1), v.lk.fx === 'rock' ? 'ember' : v.lk.fx, 0, 1.2, 0);
      }
      // a little element sparkle in the air inside
      if (Math.random() < dt * 3) {
        var R = t.rect;
        GX.emit(SC.rand(R.x0 + 1, R.x1), (t.t0 + 1) * W.TIER + SC.rand(0.3, 1.6), SC.rand(R.y0 + 1, R.y1), v.lk.fx === 'rock' ? 'dust' : v.lk.fx === 'water' ? 'bubble' : v.lk.fx, 0, 0.4, 0);
      }
    }
  };
})();
