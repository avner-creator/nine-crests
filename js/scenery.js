// Nine Crests - scenery: everything that stands on the ground of a level (trees, rocks, ruins, camps, the market,
// steps, bridges, stepping stones, flowers, grass). All of it is instanced in chunks through GX.inst(), built once per level.
(function () {
  'use strict';
  var SC = window.SC, GX = SC.gfx;
  var S = SC.scenery = {};
  var M = function () { return GX.M.apply(null, arguments); };
  var geos = {}, mats = {};
  function vc() { return mats.vc || (mats.vc = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true })); }
  function vcGlow() { return mats.glow || (mats.glow = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0x2a3a5a })); }
  function flameMat() { return mats.flame || (mats.flame = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); }
  function G(key, make) { return geos[key] || (geos[key] = make()); }
  function lump(base, amt, seed) { return GX.lumpy(base, amt, seed); }

  // ---------------- shapes (one unit tall-ish, standing on y = 0) ----------------
  function broad(th, v) {
    return G('broad' + v + th.leaf.join(), function () {
      var L = th.leaf, p = [{ geo: GX.cyl(0.1, 0.17, 7), m: M(0, 0.65, 0, 1, 1.3, 1), c: th.trunk }];
      var blob = lump(new THREE.IcosahedronGeometry(1, 0), 0.16, v * 17 + 3);
      if (v === 0) {
        p.push({ geo: blob, m: M(0, 1.75, 0, 0.9, 0.8, 0.9), c: L[0] }, { geo: blob, m: M(0.42, 1.5, 0.2, 0.62, 0.55, 0.62, 0, 1), c: L[1] },
          { geo: blob, m: M(-0.38, 1.55, -0.22, 0.64, 0.56, 0.64, 0, 2), c: L[2 % L.length] }, { geo: blob, m: M(0.05, 2.3, 0.05, 0.58, 0.5, 0.58, 0, 3), c: L[1] });
      } else {
        p[0].m = M(0, 0.5, 0, 1.1, 1.0, 1.1);
        p.push({ geo: blob, m: M(0, 1.35, 0, 1.15, 0.62, 1.1), c: L[1] }, { geo: blob, m: M(0.5, 1.2, 0.3, 0.6, 0.45, 0.6), c: L[0] },
          { geo: blob, m: M(-0.45, 1.25, -0.25, 0.65, 0.48, 0.65), c: L[2 % L.length] }, { geo: blob, m: M(0.1, 1.75, -0.1, 0.62, 0.42, 0.6), c: L[0] });
      }
      return GX.mergeColored(p);
    });
  }
  function pine(th, v, snow) {
    return G('pine' + v + (snow ? 's' : '') + th.leaf.join(), function () {
      var L = th.leaf, p = [{ geo: GX.cyl(0.08, 0.14, 6), m: M(0, 0.5, 0, 1, 1.0, 1), c: th.trunk }];
      var tiers = v === 0 ? [[0.95, 0.95, 1.2], [1.6, 0.74, 1.0], [2.15, 0.52, 0.9], [2.62, 0.3, 0.62]] : [[0.8, 0.75, 1.0], [1.3, 0.56, 0.85], [1.75, 0.36, 0.7]];
      tiers.forEach(function (t, i) {
        p.push({ geo: GX.cone(7), m: M(0, t[0], 0, t[1], t[2], t[1], 0, i * 0.4), c: L[i % L.length], flat: true });
        if (snow) p.push({ geo: GX.cone(7), m: M(0, t[0] + t[2] * 0.22, 0, t[1] * 0.72, t[2] * 0.6, t[1] * 0.72, 0, i * 0.4 + 0.2), c: 0xf4f8ff, flat: true });
      });
      return GX.mergeColored(p);
    });
  }
  function palm(th, v) {
    return G('palm' + v + th.leaf.join(), function () {
      var p = [], x = 0, y = 0, lean = 0.12 + v * 0.1;
      for (var i = 0; i < 6; i++) {
        p.push({ geo: GX.cyl(0.1, 0.13, 6), m: M(x, y + 0.25, 0, 1, 0.5, 1, 0, 0, -lean * i * 0.5), c: i % 2 ? th.trunk : new THREE.Color(th.trunk).offsetHSL(0, 0, 0.06).getHex() });
        x += Math.sin(lean * i * 0.5) * 0.48; y += Math.cos(lean * i * 0.5) * 0.48;
      }
      for (var f = 0; f < 7; f++) {
        var a = f / 7 * Math.PI * 2;
        p.push({ geo: GX.box(), m: M(x + Math.cos(a) * 0.45, y - 0.06, Math.sin(a) * 0.45, 0.92, 0.04, 0.26, 0, -a, -0.4), c: th.leaf[f % th.leaf.length], flat: true });
      }
      for (var c = 0; c < 3; c++) p.push({ geo: GX.sphere(6), m: M(x + Math.cos(c * 2.1) * 0.12, y - 0.12, Math.sin(c * 2.1) * 0.12, 0.09, 0.09, 0.09), c: 0x6a4a2a });
      return GX.mergeColored(p);
    });
  }
  function darkTree(th, v) {
    return G('dark' + v + th.leaf.join(), function () {
      var L = th.leaf, p = [{ geo: GX.cyl(0.09, 0.16, 6), m: M(0, 0.55, 0, 1, 1.1, 1, 0, 0, 0.12), c: th.trunk },
        { geo: GX.cyl(0.06, 0.09, 6), m: M(0.12, 1.3, 0, 1, 0.7, 1, 0, 0, -0.3), c: th.trunk }];
      var blob = lump(new THREE.IcosahedronGeometry(1, 0), 0.2, 41 + v);
      p.push({ geo: blob, m: M(0.15, 1.85, 0, 0.58, 0.5, 0.58), c: L[0], flat: true }, { geo: blob, m: M(-0.28, 1.45, 0.18, 0.42, 0.36, 0.42, 0, 1), c: L[1], flat: true },
        { geo: blob, m: M(0.4, 1.42, -0.22, 0.38, 0.34, 0.38, 0, 2), c: L[v % L.length], flat: true });
      if (v) p.push({ geo: GX.cone(5), m: M(-0.1, 2.35, 0.1, 0.35, 0.7, 0.35), c: L[3 % L.length], flat: true });
      return GX.mergeColored(p);
    });
  }
  function basalt(th, v) {
    return G('basalt' + v, function () {
      var p = [];
      if (v === 0) {
        [[0, 0, 1.8], [0.38, 0.1, 1.2], [-0.3, 0.25, 1.45], [0.1, -0.35, 0.9]].forEach(function (c, i) {
          p.push({ geo: GX.cyl(1, 1, 6), m: M(c[0], c[2] / 2, c[1], 0.24, c[2], 0.24, 0, i), c: 0x2e2626, flat: true });
          p.push({ geo: GX.cyl(1, 1, 6), m: M(c[0], c[2] + 0.02, c[1], 0.2, 0.04, 0.2, 0, i), c: i === 1 ? 0xff7a2a : 0x4a3a36, flat: true });
        });
      } else {
        p.push({ geo: GX.cyl(0.07, 0.14, 5), m: M(0, 0.8, 0, 1, 1.6, 1), c: 0x241c1c });
        [[0.5, 1.2, 0.6], [-0.6, 1.4, 2.4], [0.3, 1.7, 4.0]].forEach(function (b) {
          p.push({ geo: GX.cyl(0.03, 0.06, 4), m: M(Math.cos(b[2]) * 0.25, b[1], Math.sin(b[2]) * 0.25, 1, 0.7, 1, Math.sin(b[2]) * 0.9, 0, -Math.cos(b[2]) * 0.9), c: 0x241c1c });
        });
      }
      return GX.mergeColored(p);
    });
  }
  // Thunder Plains: a flat-topped savanna tree, and a metal spire with a glowing tip
  function acacia(th, v) {
    return G('acacia' + v + th.leaf.join(), function () {
      var L = th.leaf, lean = v ? -0.18 : 0.14, p = [{ geo: GX.cyl(0.07, 0.12, 6), m: M(0, 0.75, 0, 1, 1.5, 1, 0, 0, lean), c: th.trunk }];
      p.push({ geo: GX.cyl(0.04, 0.06, 5), m: M(-lean * 2.5 + 0.2, 1.45, 0.1, 1, 0.6, 1, 0.3, 0, -0.7), c: th.trunk });
      var blob = lump(new THREE.IcosahedronGeometry(1, 0), 0.12, 51 + v);
      p.push({ geo: blob, m: M(-lean * 3, 1.72, 0, 1.15, 0.22, 0.95), c: L[0], flat: true }, { geo: blob, m: M(-lean * 3 + 0.45, 1.66, 0.25, 0.6, 0.16, 0.55, 0, 1), c: L[1], flat: true },
        { geo: blob, m: M(-lean * 3 - 0.4, 1.8, -0.2, 0.55, 0.15, 0.5, 0, 2), c: L[2 % L.length], flat: true });
      return GX.mergeColored(p);
    });
  }
  function mspire() {
    return G('mspire', function () {
      return GX.mergeColored([{ geo: GX.cyl(1, 1, 6), m: M(0, 0.12, 0, 0.32, 0.24, 0.32), c: 0x6a6a78, flat: true },
        { geo: GX.cone(6), m: M(0, 1.4, 0, 0.17, 2.6, 0.17), c: 0x9a9cb0, flat: true }, { geo: GX.cyl(1, 1, 6), m: M(0, 0.9, 0, 0.13, 0.08, 0.13), c: 0xc8a050 },
        { geo: GX.cyl(1, 1, 6), m: M(0, 1.7, 0, 0.09, 0.06, 0.09), c: 0xc8a050 }, { geo: GX.oct(), m: M(0, 2.8, 0, 0.13, 0.2, 0.13), c: 0xfff27a, flat: true }]);
    });
  }
  // Stone Canyon: a cactus and a red rock pillar
  function cactus(th, v) {
    return G('cactus' + v + th.leaf.join(), function () {
      var L = th.leaf, p = [{ geo: GX.cyl(0.16, 0.18, 8), m: M(0, 0.7, 0, 1, 1.4, 1), c: L[0] }, { geo: GX.sphere(8), m: M(0, 1.4, 0, 0.16, 0.12, 0.16), c: L[1] }];
      [[1, 0.65, 0.5], [-1, 0.85, 0.35]].slice(0, v ? 1 : 2).forEach(function (a) {
        p.push({ geo: GX.cyl(0.09, 0.1, 6), m: M(a[0] * 0.24, a[1], 0, 1, 0.12, 1, 0, 0, Math.PI / 2), c: L[1] });
        p.push({ geo: GX.cyl(0.09, 0.1, 6), m: M(a[0] * 0.33, a[1] + a[2] / 2, 0, 1, a[2], 1), c: L[1] });
        p.push({ geo: GX.sphere(6), m: M(a[0] * 0.33, a[1] + a[2], 0, 0.09, 0.07, 0.09), c: L[2 % L.length] });
      });
      p.push({ geo: GX.ico(), m: M(0.04, 1.5, 0.02, 0.07, 0.05, 0.07), c: v ? 0xffd23f : 0xff6a8a, flat: true });
      return GX.mergeColored(p);
    });
  }
  function mesaPillar(th, v) {
    return G('mesa' + v + th.rockCol, function () {
      var c0 = th.rockCol, c1 = new THREE.Color(th.rockCol).offsetHSL(0, -0.05, 0.1).getHex(), c2 = new THREE.Color(th.rockCol).offsetHSL(0, 0, -0.08).getHex();
      var g = lump(new THREE.CylinderGeometry(1, 1.1, 1, 7, 2), 0.12, 61 + v), hh = v ? 1.6 : 2.4, p = [];
      p.push({ geo: g, m: M(0, hh * 0.25, 0, 0.62, hh * 0.5, 0.6), c: c2, flat: true }, { geo: g, m: M(0.02, hh * 0.62, 0, 0.55, hh * 0.28, 0.53, 0, 0.6), c: c1, flat: true },
        { geo: g, m: M(-0.02, hh * 0.86, 0.02, 0.5, hh * 0.2, 0.48, 0, 1.2), c: c0, flat: true });
      return GX.mergeColored(p);
    });
  }
  // Bloom Jungle: a tall jungle tree with hanging vines, a giant flower (stem + head), a giant mushroom
  function jtree(th, v) {
    return G('jtree' + v + th.leaf.join(), function () {
      var L = th.leaf, p = [{ geo: GX.cyl(0.11, 0.2, 7), m: M(0, 1.0, 0, 1, 2.0, 1), c: th.trunk }];
      for (var r = 0; r < 4; r++) { var ra = r * 1.57 + 0.4; p.push({ geo: GX.cone(4), m: M(Math.cos(ra) * 0.18, 0.15, Math.sin(ra) * 0.18, 0.08, 0.35, 0.08, Math.sin(ra) * 0.6, 0, -Math.cos(ra) * 0.6), c: th.trunk }); }
      var blob = lump(new THREE.IcosahedronGeometry(1, 0), 0.18, 71 + v);
      p.push({ geo: blob, m: M(0, 2.25, 0, 1.0, 0.55, 1.0), c: L[0], flat: true }, { geo: blob, m: M(0.55, 2.05, 0.3, 0.6, 0.4, 0.6, 0, 1), c: L[1], flat: true },
        { geo: blob, m: M(-0.5, 2.1, -0.3, 0.62, 0.42, 0.62, 0, 2), c: L[2 % L.length], flat: true }, { geo: blob, m: M(0.05, 2.6, -0.05, 0.55, 0.35, 0.55, 0, 3), c: L[3 % L.length], flat: true });
      [[0.6, 0.2], [-0.45, -0.45], [0.1, 0.7], [-0.6, 0.3]].forEach(function (q, i) { p.push({ geo: GX.cyl(0.018, 0.018, 4), m: M(q[0], 1.55 - (i % 2) * 0.15, q[1], 1, 0.9 + (i % 2) * 0.3, 1), c: 0x3a7a2a }); });
      if (v) p.push({ geo: GX.sphere(6), m: M(0.42, 1.2, 0.5, 0.09, 0.09, 0.09), c: 0xff5ab0 });
      return GX.mergeColored(p);
    });
  }
  function gflowerStem() {
    return G('gfstem', function () {
      return GX.mergeColored([{ geo: GX.cyl(0.05, 0.07, 6), m: M(0, 0.7, 0, 1, 1.4, 1, 0.08, 0, 0), c: 0x3a9a3a },
        { geo: GX.sphere(6), m: M(0.2, 0.35, 0, 0.26, 0.04, 0.12, 0, 0, -0.4), c: 0x4ab03a }, { geo: GX.sphere(6), m: M(-0.2, 0.6, 0.05, 0.24, 0.04, 0.11, 0, 0, 0.4), c: 0x4ab03a }]);
    });
  }
  function gflowerHead() {
    return G('gfhead', function () {
      var p = [];
      for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2; p.push({ geo: GX.sphere(6), m: M(Math.cos(a) * 0.3, 1.45, 0.12 + Math.sin(a) * 0.3, 0.22, 0.06, 0.16, 0.35, -a, 0), c: 0xffffff, flat: true }); }
      p.push({ geo: GX.sphere(8), m: M(0, 1.48, 0.14, 0.15, 0.1, 0.15, 0.35, 0, 0), c: 0xfff2a0 });
      return GX.mergeColored(p);
    });
  }
  function gmush() {
    return G('gmush', function () {
      return GX.mergeColored([{ geo: GX.cyl(0.13, 0.18, 8), m: M(0, 0.45, 0, 1, 0.9, 1), c: 0xf4ecd8 },
        { geo: GX.sphere(10), m: M(0, 0.95, 0, 0.62, 0.3, 0.62), c: 0xffffff }, { geo: GX.sphere(6), m: M(0.25, 1.15, 0.15, 0.08, 0.04, 0.08), c: 0xfff8e8 },
        { geo: GX.sphere(6), m: M(-0.2, 1.17, -0.1, 0.07, 0.04, 0.07), c: 0xfff8e8 }, { geo: GX.sphere(6), m: M(0.0, 1.2, 0.3, 0.06, 0.03, 0.06), c: 0xfff8e8 }]);
    });
  }
  function spire() {
    return G('spire', function () {
      var g = lump(new THREE.DodecahedronGeometry(1, 0), 0.25, 77);
      return GX.mergeColored([{ geo: g, m: M(0, 1.2, 0, 0.55, 1.5, 0.5), c: 0xffffff, flat: true }, { geo: g, m: M(0.35, 0.5, 0.2, 0.4, 0.6, 0.4, 0, 1), c: 0xe0e0e0, flat: true }]);
    });
  }
  function rock(v) {
    return G('rock' + v, function () {
      var g = lump(new THREE.DodecahedronGeometry(1, 0), 0.28, 11 + v * 5), p;
      if (v === 0) p = [{ geo: g, m: M(0, 0.45, 0, 0.62, 0.55, 0.55), c: 0xffffff, flat: true }];
      else if (v === 1) p = [{ geo: g, m: M(-0.15, 0.4, 0, 0.5, 0.48, 0.48), c: 0xffffff, flat: true }, { geo: g, m: M(0.32, 0.22, 0.2, 0.32, 0.28, 0.3, 0, 1), c: 0xe8e8e8, flat: true }, { geo: g, m: M(0.1, 0.15, -0.35, 0.22, 0.2, 0.22, 0, 2), c: 0xf0f0f0, flat: true }];
      else p = [{ geo: g, m: M(0, 0.18, 0, 0.7, 0.26, 0.6, 0, 0.5), c: 0xffffff, flat: true }];
      return GX.mergeColored(p);
    });
  }
  function snowCap() { return G('snowcap', function () { return GX.mergeColored([{ geo: lump(new THREE.IcosahedronGeometry(1, 0), 0.2, 5), m: M(0, 0, 0, 1, 0.35, 1), c: 0xffffff, flat: true }]); }); }
  function column(broken) {
    return G('col' + (broken ? 'b' : ''), function () {
      var p = [{ geo: GX.box(), m: M(0, 0.08, 0, 0.66, 0.16, 0.66), c: 0xe8e4dc }];
      if (broken) {
        p.push({ geo: GX.cyl(0.21, 0.23, 10), m: M(0, 0.62, 0, 1, 0.95, 1), c: 0xf4f0e8 }, { geo: GX.cyl(0.21, 0.21, 10), m: M(0.06, 1.18, 0, 1, 0.3, 1, 0, 0, 0.3), c: 0xeae6de });
        p.push({ geo: GX.cyl(0.2, 0.2, 10), m: M(0.55, 0.2, 0.25, 1, 0.75, 1, 0, 0.6, Math.PI / 2), c: 0xe2ded6 });
      } else {
        p.push({ geo: GX.cyl(0.2, 0.23, 10), m: M(0, 1.0, 0, 1, 1.7, 1), c: 0xf4f0e8 }, { geo: GX.box(), m: M(0, 1.92, 0, 0.56, 0.16, 0.56), c: 0xe8e4dc });
      }
      return GX.mergeColored(p);
    });
  }
  function wall() {
    return G('wall', function () {
      var p = [];
      [[-0.3, 0.2, 0.42], [0.22, 0.2, 0.5], [-0.05, 0.6, 0.46], [0.36, 0.58, 0.28], [-0.36, 0.95, 0.3], [0.05, 1.0, 0.36]].forEach(function (b, i) {
        p.push({ geo: GX.box(), m: M(b[0], b[1], (SC.hash(i, 3) - 0.5) * 0.06, b[2], 0.38, 0.5, 0, (SC.hash(i, 7) - 0.5) * 0.1), c: i % 2 ? 0xf0ece4 : 0xdedad2 });
      });
      return GX.mergeColored(p);
    });
  }
  function tent() {
    return G('tent', function () {
      var prism = new THREE.CylinderGeometry(0.78, 0.78, 1.5, 3, 1).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2);
      return GX.mergeColored([{ geo: prism, m: M(0, 0.33, 0, 0.85, 0.85, 0.85), c: 0xffffff, flat: true }, { geo: prism, m: M(0, 0.34, 0, 0.87, 0.18, 0.87), c: 0xd8d8d8, flat: true },
        { geo: GX.box(), m: M(0.76, 0.32, 0.0, 0.02, 0.55, 0.36), c: 0x3a2a20 },
        { geo: GX.cyl(0.03, 0.03, 5), m: M(0, 0.62, 0, 1, 1.4, 1, 0, 0, Math.PI / 2), c: 0x6a4a2a }]);
    });
  }
  function campfire() {
    return G('campfire', function () {
      var p = [];
      for (var i = 0; i < 9; i++) { var a = i / 9 * Math.PI * 2; p.push({ geo: GX.dodec(), m: M(Math.cos(a) * 0.38, 0.08, Math.sin(a) * 0.38, 0.12, 0.1, 0.12, a, a), c: 0x8a8480, flat: true }); }
      for (var k = 0; k < 3; k++) p.push({ geo: GX.cyl(0.06, 0.06, 6), m: M(0, 0.12, 0, 1, 0.6, 1, Math.PI / 2, k * 1.05, 0.25), c: 0x5a3a22 });
      return GX.mergeColored(p);
    });
  }
  function flame() {
    return G('flame', function () {
      return GX.mergeColored([{ geo: GX.cone(6), m: M(0, 0.32, 0, 0.22, 0.6, 0.22), c: 0xff7a1a }, { geo: GX.cone(6), m: M(0.02, 0.3, 0.02, 0.12, 0.45, 0.12, 0, 1), c: 0xffe060 }]);
    });
  }
  function banner() {
    return G('banner', function () {
      return GX.mergeColored([{ geo: GX.cyl(0.04, 0.05, 6), m: M(0, 0.95, 0, 1, 1.9, 1), c: 0x6a4a2a }, { geo: GX.box(), m: M(0.3, 1.55, 0, 0.55, 0.5, 0.03), c: 0xc83a3a },
        { geo: GX.box(), m: M(0.3, 1.55, 0, 0.2, 0.2, 0.05, 0, 0, 0.78), c: 0xffd23f }, { geo: GX.sphere(6), m: M(0, 1.93, 0, 0.07, 0.07, 0.07), c: 0xffd23f }]);
    });
  }
  function sign() {
    return G('sign', function () {
      return GX.mergeColored([{ geo: GX.cyl(0.05, 0.06, 6), m: M(0, 0.6, 0, 1, 1.2, 1), c: 0x7a5232 },
        { geo: GX.box(), m: M(0.18, 1.0, 0, 0.6, 0.18, 0.05, 0, 0.3), c: 0xb88a52 }, { geo: GX.box(), m: M(-0.15, 0.75, 0, 0.5, 0.16, 0.05, 0, -0.5), c: 0xa87a48 }]);
    });
  }
  function crates() {
    return G('crates', function () {
      return GX.mergeColored([{ geo: GX.box(), m: M(-0.18, 0.22, 0, 0.44, 0.44, 0.44, 0, 0.2), c: 0xb07a42 }, { geo: GX.box(), m: M(-0.12, 0.6, 0.02, 0.32, 0.32, 0.32, 0, 0.7), c: 0xc08a52 },
        { geo: GX.cyl(0.18, 0.18, 10), m: M(0.3, 0.27, 0.12, 1, 0.54, 1), c: 0x8a5a32 }, { geo: GX.cyl(0.19, 0.19, 10), m: M(0.3, 0.4, 0.12, 1, 0.05, 1), c: 0x5a5a5a }]);
    });
  }
  function crystals() {
    return G('crystals', function () {
      var p = [];
      [[0, 0, 0.9, 0], [0.22, 0.1, 0.6, 0.4], [-0.2, 0.12, 0.65, -0.35], [0.05, -0.22, 0.5, 0.25]].forEach(function (c, i) {
        p.push({ geo: GX.oct(), m: M(c[0], c[2] * 0.5, c[1], 0.14, c[2] * 0.6, 0.14, c[3], i, -c[3]), c: i % 2 ? 0xffffff : 0xd8f0ff, flat: true });
      });
      return GX.mergeColored(p);
    });
  }
  function bush() { return G('bush', function () { return GX.mergeColored([{ geo: lump(new THREE.IcosahedronGeometry(1, 0), 0.15, 9), m: M(0, 0.32, 0, 0.5, 0.4, 0.5), c: 0xffffff, flat: true }, { geo: lump(new THREE.IcosahedronGeometry(1, 0), 0.15, 2), m: M(0.2, 0.5, 0.1, 0.25, 0.22, 0.25), c: 0xe8ffe8 }]); }); }
  function thorns() {
    return G('thorns', function () {
      var parts = [];
      for (var k = 0; k < 7; k++) { var a = k / 7 * Math.PI * 2; parts.push({ geo: GX.cone(5), m: M(Math.cos(a) * 0.28, 0.35, Math.sin(a) * 0.28, 0.12, 0.8, 0.12, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5), c: 0x8a3a6a, flat: true }); }
      parts.push({ geo: GX.ico(), m: M(0, 0.25, 0, 0.36, 0.3, 0.36), c: 0x6a2a5a, flat: true });
      parts.push({ geo: GX.cone(5), m: M(0, 0.6, 0, 0.12, 0.7, 0.12), c: 0x9a4a7a, flat: true });
      return GX.mergeColored(parts);
    });
  }
  function cracked() {
    return G('cracked', function () {
      var g = lump(new THREE.DodecahedronGeometry(1, 0), 0.15, 23);
      return GX.mergeColored([{ geo: g, m: M(0, 0.42, 0, 0.52, 0.48, 0.52), c: 0xa89a88, flat: true },
        { geo: GX.box(), m: M(0, 0.45, 0.47, 0.06, 0.5, 0.06, 0, 0, 0.5), c: 0x3a2a1a }, { geo: GX.box(), m: M(0.12, 0.25, 0.49, 0.05, 0.35, 0.06, 0, 0, -0.6), c: 0x3a2a1a },
        { geo: GX.box(), m: M(0.47, 0.45, 0.05, 0.06, 0.5, 0.06, 0.6, 0, 0), c: 0x3a2a1a }, { geo: GX.box(), m: M(-0.44, 0.4, 0.1, 0.06, 0.45, 0.06, -0.5, 0, 0), c: 0x3a2a1a }]);
    });
  }
  function stall() {
    return G('stall', function () {
      var p = [{ geo: GX.box(), m: M(0, 0.4, 0, 0.95, 0.12, 0.6), c: 0xb07a42 }, { geo: GX.box(), m: M(0, 0.2, 0, 0.88, 0.4, 0.5), c: 0x8a5a32 }];
      [[-0.44, -0.27], [0.44, -0.27], [-0.44, 0.27], [0.44, 0.27]].forEach(function (q) { p.push({ geo: GX.box(), m: M(q[0], 0.7, q[1], 0.06, 1.4, 0.06), c: 0x6a4a2a }); });
      for (var s = 0; s < 5; s++) p.push({ geo: GX.box(), m: M(-0.4 + s * 0.2, 1.42, 0, 0.2, 0.05, 0.78, -0.25, 0, 0), c: s % 2 ? 0xffffff : 0xe8443a });
      [[0xff5a3a, -0.25], [0xffd23f, 0], [0x7ad84a, 0.25], [0xff8a2a, 0.12], [0x9a5ad8, -0.12]].forEach(function (g, i) { p.push({ geo: GX.sphere(6), m: M(g[1], 0.53, (i % 2) * 0.12 - 0.06, 0.08, 0.08, 0.08), c: g[0] }); });
      p.push({ geo: GX.cyl(0.12, 0.1, 8), m: M(0.36, 0.56, 0.1, 1, 0.2, 1), c: 0xffd23f });
      return GX.mergeColored(p);
    });
  }
  function forge() {
    return G('forge', function () {
      return GX.mergeColored([{ geo: GX.box(), m: M(-0.12, 0.35, 0, 0.66, 0.7, 0.66), c: 0x8a8078, flat: true }, { geo: GX.box(), m: M(-0.25, 1.05, -0.12, 0.28, 0.9, 0.28), c: 0x7a706a },
        { geo: GX.box(), m: M(-0.12, 0.72, 0, 0.5, 0.06, 0.5), c: 0x2a1a14 },
        { geo: GX.box(), m: M(0.42, 0.22, 0.2, 0.16, 0.44, 0.16), c: 0x3a3a42 }, { geo: GX.box(), m: M(0.42, 0.48, 0.2, 0.42, 0.12, 0.18), c: 0x4a4a54 }, { geo: GX.cone(4), m: M(0.68, 0.48, 0.2, 0.06, 0.16, 0.06, 0, 0, -Math.PI / 2), c: 0x4a4a54 }]);
    });
  }
  function coals() { return G('coals', function () { return GX.mergeColored([{ geo: GX.box(), m: M(-0.12, 0.77, 0, 0.42, 0.05, 0.42), c: 0xff6a1a }, { geo: GX.sphere(5), m: M(-0.12, 0.82, 0, 0.18, 0.08, 0.18), c: 0xffd060 }]); }); }
  function tuft(th) {
    return G('tuft', function () {
      var p = [];
      for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2; p.push({ geo: GX.cone(3), m: M(Math.cos(a) * 0.06, 0.12, Math.sin(a) * 0.06, 0.035, 0.26 + (i % 3) * 0.06, 0.035, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35), c: i % 2 ? 0xffffff : 0xd8e8c8, flat: true }); }
      return GX.mergeColored(p);
    });
  }
  function flower() { return G('flower', function () { return GX.mergeColored([{ geo: GX.cyl(0.012, 0.012, 3), m: M(0, 0.1, 0, 1, 0.2, 1), c: 0x3a8a2a }, { geo: GX.ico(), m: M(0, 0.21, 0, 0.06, 0.035, 0.06), c: 0xffffff, flat: true }]); }); }
  function mushroom() {
    return G('mush', function () {
      var p = [];
      [[0, 0, 1], [0.18, 0.12, 0.7], [-0.15, 0.1, 0.55]].forEach(function (m) {
        p.push({ geo: GX.cyl(0.035, 0.045, 6), m: M(m[0], 0.08 * m[2], m[1], m[2], 0.16 * m[2] / m[2], m[2]), c: 0xf4ecd8 });
        p.push({ geo: GX.sphere(8), m: M(m[0], 0.17 * m[2], m[1], 0.12 * m[2], 0.07 * m[2], 0.12 * m[2]), c: 0xffffff });
      });
      return GX.mergeColored(p);
    });
  }
  function stone() { return G('stepstone', function () { return GX.mergeColored([{ geo: lump(new THREE.CylinderGeometry(1, 1, 1, 9), 0.08, 3), m: M(0, 0, 0, 0.36, 0.2, 0.33), c: 0xffffff, flat: true }]); }); }
  function slab() { return G('slab', function () { return GX.mergeColored([{ geo: GX.box(), m: M(0, 0.025, 0, 0.93, 0.07, 0.93), c: 0xffffff }]); }); }
  function step() { return G('step', function () { return GX.mergeColored([{ geo: GX.box(), m: M(0, 0.5, 0.5, 1, 1, 1), c: 0xffffff }]); }); }

  // a named shape for other code (the menu island uses the trees and rocks)
  S.shape = function (name, th) {
    if (name === 'broad0' || name === 'broad1') return broad(th, +name.charAt(5));
    if (name === 'pine0' || name === 'pine1') return pine(th, +name.charAt(4), false);
    if (name.indexOf('rock') === 0) return rock(+name.charAt(4));
    return broad(th, 0);
  };

  // ---------------- building a level ----------------
  S.build = function (L, th) {
    var W = SC.world, T = W.TIER, items = {}, MG = 8, x, y;
    function add(key, it) { (items[key] || (items[key] = [])).push(it); }
    function h(tx, ty) { return GX.drawH(L, tx, ty); }
    function tile(tx, ty) { return (tx < 0 || ty < 0 || tx >= L.w || ty >= L.h) ? '#' : L.tiles[ty * L.w + tx]; }
    function hs(a, b) { return SC.hash(a * 7 + 13, b * 11 + 5); }
    var col = new THREE.Color();
    function tint(base, a, b, amt) { col.set(base); col.offsetHSL((hs(a, b + 3) - 0.5) * 0.03, 0, (hs(a + 9, b) - 0.5) * (amt || 0.16)); return col.getHex(); }
    var style = th.trees;
    function treeAt(tx, ty, big) {
      var r = hs(tx, ty), r2 = hs(tx + 5, ty - 3), s = (big ? 0.9 : 0.72) + r2 * (big ? 0.38 : 0.3);
      var it = { x: tx + 0.5 + (r - 0.5) * 0.35, y: h(tx, ty), z: ty + 0.5 + (r2 - 0.5) * 0.35, sx: s, sy: s * (0.92 + r * 0.2), sz: s, ry: r * 6.28, tall: true, c: tint(0xffffff, tx, ty, 0.14) };
      var key;
      if (style === 'broad') key = r < 0.15 ? 'pine0' : r < 0.6 ? 'broad0' : 'broad1';
      else if (style === 'palm') key = r < 0.25 ? 'broad1' : r < 0.35 ? 'rock1' : r < 0.7 ? 'palm0' : 'palm1';
      else if (style === 'snowpine') key = r < 0.15 ? 'rock1' : r < 0.6 ? 'spine0' : 'spine1';
      else if (style === 'pine') key = big && r < 0.35 ? 'spire' : r < 0.6 ? 'pine0' : 'pine1';
      else if (style === 'dark') key = r < 0.5 ? 'dark0' : 'dark1';
      else if (style === 'isle') key = r < 0.4 ? 'palm0' : r < 0.72 ? 'palm1' : r < 0.9 ? 'broad1' : 'rock1';
      else if (style === 'plains') key = r < 0.45 ? 'acacia0' : r < 0.65 ? 'acacia1' : r < (big ? 0.8 : 0.9) ? 'mspire' : 'rock1';
      else if (style === 'canyon') key = big ? (r < 0.45 ? 'mesa0' : r < 0.8 ? 'mesa1' : 'rock1') : (r < 0.4 ? 'cactus0' : r < 0.7 ? 'cactus1' : r < 0.85 ? 'mesa1' : 'rock0');
      else if (style === 'jungle') key = big ? (r < 0.5 ? 'jtree0' : r < 0.85 ? 'jtree1' : 'gmush') : (r < 0.3 ? 'jtree0' : r < 0.45 ? 'jtree1' : r < 0.72 ? 'gfstem' : r < 0.9 ? 'gmush' : 'broad1');
      else key = r < 0.55 ? 'basalt0' : r < 0.8 ? 'basalt1' : 'rock0';
      if (key.indexOf('rock') === 0) { it.c = tint(th.rockCol, tx, ty); it.sx *= 1.4; it.sy *= 1.2; it.sz *= 1.4; }
      if (key === 'spire') it.c = tint(th.rockCol, tx, ty);
      if (key === 'mesa0' || key === 'mesa1') { it.sx *= 1.25; it.sz *= 1.25; it.ry = r * 6.28; }
      if (key === 'gmush') { it.c = [0xff5ab0, 0xffd23f, 0xff7a3a, 0xc08aff][Math.floor(r2 * 4)]; it.sx *= 1.2; it.sy *= 1.2; it.sz *= 1.2; }
      if (key === 'gfstem') add('gfhead', { x: it.x, y: it.y, z: it.z, sx: it.sx, sy: it.sy, sz: it.sz, ry: it.ry, c: th.flowers[Math.floor(r2 * th.flowers.length) % th.flowers.length], tall: true });
      if (key === 'basalt0') { it.sy *= 1.2; }
      add(key, it);
      if (style === 'snowpine' && key === 'rock1') add('snowcap', { x: it.x - 0.1, y: it.y + 0.62 * it.sy, z: it.z, sx: 0.45 * s, sy: 0.6 * s, sz: 0.4 * s, ry: it.ry, c: 0xffffff });
    }
    var palette = [0xe8443a, 0x3a7ae8, 0x4ab85a, 0xe8a03a, 0x9a5ad8];
    // each bridge (a group of '=' tiles) gets one plank direction: across the way people walk over it
    var bridgeAcross = {};
    for (y = 0; y < L.h; y++) for (x = 0; x < L.w; x++) {
      if (tile(x, y) !== '=' || bridgeAcross[x + ',' + y] !== undefined) continue;
      var grp = [], q2 = [[x, y]], seen = {}, ex = 0, ey = 0; seen[x + ',' + y] = 1;
      while (q2.length) {
        var c2 = q2.pop(); grp.push(c2);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var nx = c2[0] + d[0], ny = c2[1] + d[1], nt = tile(nx, ny), k2 = nx + ',' + ny;
          if (nt === '=') { if (!seen[k2]) { seen[k2] = 1; q2.push([nx, ny]); } }
          else if (W.isFloor(nt)) { if (d[0]) ex++; else ey++; }
        });
      }
      grp.forEach(function (c3) { bridgeAcross[c3[0] + ',' + c3[1]] = ey > ex; });
    }
    for (y = -MG; y < L.h + MG; y++) for (x = -MG; x < L.w + MG; x++) {
      var t = tile(x, y), inside = x >= 0 && y >= 0 && x < L.w && y < L.h, gy = h(x, y), key = x + ',' + y, r = hs(x, y);
      if (t === '#') {
        if (L.def.floating) continue;   // the Home Base floats: no forest around it
        if (!inside) { var far = Math.max(-x, -y, x - L.w + 1, y - L.h + 1); if (r > (far > 4 ? 0.45 : 0.8)) continue; }
        treeAt(x, y, true);
        continue;
      }
      if (!inside) continue;
      var it = { x: x + 0.5, y: gy, z: y + 0.5, sx: 1, sy: 1, sz: 1, ry: 0 };
      switch (t) {
        case '^': treeAt(x, y, false); break;
        case '*':
          var rs = 0.75 + r * 0.45, rv = r < 0.4 ? 'rock1' : 'rock0';
          add(rv, { x: x + 0.5, y: gy, z: y + 0.5, sx: rs * 1.25, sy: rs * (0.9 + hs(x, y + 1) * 0.5), sz: rs * 1.2, ry: r * 6.28, c: tint(th.rockCol, x, y), tall: rs > 1 });
          if (style === 'snowpine') add('snowcap', { x: x + 0.5, y: gy + 0.5 * rs, z: y + 0.5, sx: 0.55 * rs, sy: 0.5, sz: 0.5 * rs, ry: r * 6, c: 0xffffff });
          break;
        case '|': add(r < 0.3 ? 'colB' : 'col', { x: x + 0.5, y: gy, z: y + 0.5, sx: 1, sy: 1, sz: 1, ry: r * 0.6, c: tint(th.stone, x, y, 0.1), tall: true }); break;
        case '%':
          var along = tile(x - 1, y) === '%' || tile(x + 1, y) === '%';
          add('wall', { x: x + 0.5, y: gy, z: y + 0.5, sx: 1, sy: 0.85 + r * 0.5, sz: 1, ry: along ? 0 : Math.PI / 2, c: tint(th.stone, x, y, 0.1), tall: true }); break;
        case '&': add('tent', { x: x + 0.5, y: gy, z: y + 0.5, sx: 1, sy: 1, sz: 1, ry: (r - 0.5) * 0.6 + Math.PI / 2, c: palette[Math.floor(r * 5)], tall: true }); break;
        case '$':
          add('campfire', it);
          add('flame', { x: x + 0.5, y: gy, z: y + 0.5, sx: 1, sy: 1, sz: 1, ry: 0, c: 0xffffff, fire: true });
          break;
        case 'F': add('banner', { x: x + 0.5, y: gy, z: y + 0.5, sx: 1, sy: 1, sz: 1, ry: r * 6, tall: true }); break;
        case '+': add('sign', { x: x + 0.5, y: gy, z: y + 0.5, sx: 1, sy: 1, sz: 1, ry: r * 3 - 1.5 }); break;
        case '@': add('crates', { x: x + 0.5, y: gy, z: y + 0.5, sx: 1, sy: 1, sz: 1, ry: r * 6 }); break;
        case 'y': add('crystals', { x: x + 0.5, y: gy, z: y + 0.5, sx: 1.1, sy: 1 + r * 0.6, sz: 1.1, ry: r * 6, c: th.deco }); break;
        case 'b': add('bush', { x: x + 0.5, y: gy, z: y + 0.5, sx: 1, sy: 1, sz: 1, ry: r * 6, c: tint(th.bush, x, y), key: key }); break;
        case 't': add('thorns', { x: x + 0.5, y: gy, z: y + 0.5, sx: 1.15, sy: 1.1, sz: 1.15, ry: r * 6, key: key }); break;
        case 'k': add('cracked', { x: x + 0.5, y: gy, z: y + 0.5, sx: 1, sy: 1, sz: 1, ry: 0.3, key: key }); break;
        case 'U': add('stall', { x: x + 0.5, y: gy, z: y + 0.5, sx: 1, sy: 1, sz: 1, ry: 0, tall: true }); break;
        case 'A': add('forge', it); add('coals', { x: x + 0.5, y: gy, z: y + 0.5, sx: 1, sy: 1, sz: 1, ry: 0, c: 0xffffff, coal: true }); break;
        case '-': add('rock2', { x: x + 0.5, y: gy, z: y + 0.5, sx: 1.2, sy: 1, sz: 0.8, ry: r * 6, c: th.trunk }); break;
        case 'u':
          var wl = (L.hgt[y * L.w + x]) * T - 0.13;
          add('stone', { x: x + 0.5 + (r - 0.5) * 0.15, y: wl + 0.02, z: y + 0.5 + (hs(x, y + 2) - 0.5) * 0.15, sx: 1.15, sy: 1, sz: 1.15, ry: r * 6, c: tint(th.stone, x, y, 0.12) });
          break;
        case ';': case 'G': if (L.inTemple && L.inTemple[y * L.w + x]) break;   // temples lay their own floor
          add('slab', { x: x + 0.5, y: gy, z: y + 0.5, sx: 1, sy: 1, sz: 1, ry: (r - 0.5) * 0.06, c: tint(th.stone, x, y, 0.12) }); break;
        case 'S':
          var d = L.stair[y * L.w + x], base = L.hgt[y * L.w + x] * T;
          for (var sI = 0; sI < 4; sI++) {
            // a box covering from f = sI/4 to the top end, sI+1 quarters tall
            var len = 1 - sI / 4, cxo = 0, czo = 0, ry2 = 0;
            if (d === 0) { ry2 = Math.PI / 2; cxo = sI / 4 - 0.5; } else if (d === 1) { ry2 = 0; czo = sI / 4 - 0.5; } else if (d === 2) { ry2 = -Math.PI / 2; cxo = 0.5 - sI / 4; } else { ry2 = Math.PI; czo = 0.5 - sI / 4; }
            add('step', { x: x + 0.5 + cxo, y: base, z: y + 0.5 + czo, sx: 1, sy: (sI + 1) / 4 * T, sz: len, ry: ry2, c: tint(th.stone, x + sI, y, 0.1) });
          }
          break;
        case ',':
          var fl = 3 + Math.floor(r * 3);
          for (var f = 0; f < fl; f++) add('flower', { x: x + 0.15 + hs(x + f, y) * 0.7, y: gy, z: y + 0.15 + hs(x, y + f * 3) * 0.7, sx: 1, sy: 0.8 + hs(f, x) * 0.5, sz: 1, ry: f, c: th.flowers[(f + x) % th.flowers.length] });
          break;
        case 'm': add('mush', { x: x + 0.3 + r * 0.4, y: gy, z: y + 0.3 + hs(x, y + 4) * 0.4, sx: 1.4, sy: 1.4, sz: 1.4, ry: r * 6, c: L.def.theme === 'shadow' ? [0x9a5aff, 0x5affd8][Math.floor(r * 2)] : L.def.theme === 'jungle' ? [0xff5ab0, 0xffd23f][Math.floor(r * 2)] : [0xe8443a, 0xd89a5a][Math.floor(r * 2)] }); break;
      }
      // grass tufts, a few flowers, pebbles by cliffs
      if (W.isFloor(t) && t !== 'S' && t !== '=' && t !== 'u' && t !== ';') {
        var dens = (style === 'broad' || style === 'dark' || style === 'pine' || style === 'jungle' || style === 'plains') ? (style === 'plains' ? 0.55 : 0.42) : style === 'palm' || style === 'isle' ? 0.2 : style === 'canyon' ? 0.05 : 0.1;
        if (t === ':') dens *= 0.15;
        if (hs(x * 3, y * 5) < dens) {
          var n = 1 + Math.floor(hs(x, y * 2) * 2);
          for (var q = 0; q < n; q++) add('tuft', { x: x + 0.15 + hs(x + q, y + 1) * 0.7, y: gy, z: y + 0.15 + hs(x - q, y + 2) * 0.7, sx: 1, sy: 0.7 + hs(q, y) * 0.6, sz: 1, ry: hs(x, q) * 6, c: tint(th.tuft, x + q, y, 0.2) });
        }
        if ((style === 'broad' || style === 'palm' || style === 'isle' || style === 'jungle') && t === '.' && hs(x * 9, y * 2) < (style === 'jungle' ? 0.09 : 0.05)) add('flower', { x: x + 0.5, y: gy, z: y + 0.5, sx: 1, sy: 1, sz: 1, ry: 0, c: th.flowers[x % th.flowers.length] });
        var nearCliff = (L.hgt[y * L.w + x] < W.tier(x + 1, y)) || (L.hgt[y * L.w + x] < W.tier(x - 1, y)) || (L.hgt[y * L.w + x] < W.tier(x, y + 1)) || (L.hgt[y * L.w + x] < W.tier(x, y - 1));
        if (nearCliff && hs(x * 5, y * 7) < 0.35 && t !== ';') add('rock2', { x: x + 0.3 + hs(x, y + 9) * 0.4, y: gy, z: y + 0.3 + hs(x + 9, y) * 0.4, sx: 0.5, sy: 0.6, sz: 0.5, ry: hs(x, y) * 6, c: tint(th.rockCol, x, y) });
      }
      // bridges
      if (t === '=') {
        var alongX = tile(x - 1, y) === '=' || W.isFloor(tile(x - 1, y)) && !W.isFloor(tile(x, y - 1)) && tile(x, y - 1) !== '=';
        var bh = L.hgt[y * L.w + x] * T;
        var acrossVert = !!bridgeAcross[key];   // true: people walk north-south, planks lie east-west
        for (var pk = 0; pk < 3; pk++) {
          var o = -0.33 + pk * 0.33;
          add('plank', acrossVert ? { x: x + 0.5, y: bh - 0.12, z: y + 0.5 + o, sx: 1.0, sy: 0.12, sz: 0.3, ry: 0, c: pk % 2 ? 0xb07a42 : 0x9a6a3a } : { x: x + 0.5 + o, y: bh - 0.12, z: y + 0.5, sx: 0.3, sy: 0.12, sz: 1.0, ry: 0, c: pk % 2 ? 0xb07a42 : 0x9a6a3a });
        }
        var sideA = acrossVert ? [tile(x - 1, y), tile(x + 1, y)] : [tile(x, y - 1), tile(x, y + 1)];
        for (var rl = 0; rl < 2; rl++) {
          if (sideA[rl] === '=') continue;
          var sgn = rl ? 0.46 : -0.46;
          add('rail', acrossVert ? { x: x + 0.5 + sgn, y: bh + 0.18, z: y + 0.5, sx: 0.07, sy: 0.07, sz: 1.0, ry: 0, c: 0x6a4020 } : { x: x + 0.5, y: bh + 0.18, z: y + 0.5 + sgn, sx: 1.0, sy: 0.07, sz: 0.07, ry: 0, c: 0x6a4020 });
          add('post', { x: x + 0.5 + (acrossVert ? sgn : 0), y: bh - 0.3, z: y + 0.5 + (acrossVert ? 0 : sgn), sx: 0.09, sy: 0.6, sz: 0.09, ry: 0, c: 0x6a4020 });
        }
        if (alongX) { /* direction is worked out above */ }
      }
    }
    // ---------- make the meshes ----------
    var shapes = {
      broad0: function () { return broad(th, 0); }, broad1: function () { return broad(th, 1); }, pine0: function () { return pine(th, 0, false); }, pine1: function () { return pine(th, 1, false); },
      spine0: function () { return pine(th, 0, true); }, spine1: function () { return pine(th, 1, true); }, palm0: function () { return palm(th, 0); }, palm1: function () { return palm(th, 1); },
      dark0: function () { return darkTree(th, 0); }, dark1: function () { return darkTree(th, 1); }, basalt0: function () { return basalt(th, 0); }, basalt1: function () { return basalt(th, 1); },
      acacia0: function () { return acacia(th, 0); }, acacia1: function () { return acacia(th, 1); }, mspire: mspire,
      cactus0: function () { return cactus(th, 0); }, cactus1: function () { return cactus(th, 1); }, mesa0: function () { return mesaPillar(th, 0); }, mesa1: function () { return mesaPillar(th, 1); },
      jtree0: function () { return jtree(th, 0); }, jtree1: function () { return jtree(th, 1); }, gfstem: gflowerStem, gfhead: gflowerHead, gmush: gmush,
      spire: spire, rock0: function () { return rock(0); }, rock1: function () { return rock(1); }, rock2: function () { return rock(2); }, snowcap: snowCap,
      col: function () { return column(false); }, colB: function () { return column(true); }, wall: wall, tent: tent, campfire: campfire, flame: flame, banner: banner, sign: sign,
      crates: crates, crystals: crystals, bush: bush, thorns: thorns, cracked: cracked, stall: stall, forge: forge, coals: coals, tuft: function () { return tuft(th); },
      flower: flower, mush: mushroom, stone: stone, slab: slab, step: step,
      plank: function () { return GX.box(); }, rail: function () { return GX.box(); }, post: function () { return GX.box(); }
    };
    var fires = [];
    for (var k in items) {
      var list = items[k], mat = vc(), opts = { receive: false };
      if (k === 'crystals') mat = vcGlow();
      if (k === 'flame' || k === 'coals') { mat = flameMat(); opts.cast = false; }
      if (k === 'plank' || k === 'rail' || k === 'post') mat = GX.mat(0xffffff);
      if (k === 'slab' || k === 'step' || k === 'stone') opts.receive = true;
      if (k === 'tuft' || k === 'flower' || k === 'slab' || k === 'mush') opts.cast = false;
      var meshes = GX.inst(shapes[k](), mat, list, opts);
      if (k === 'flame' || k === 'coals') fires.push({ meshes: meshes, list: list, coal: k === 'coals' });
    }
    // flickering campfires and forges
    if (fires.length) {
      var tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tp = new THREE.Vector3(), ts = new THREE.Vector3(), te = new THREE.Euler();
      GX.onAnimate(function (time) {
        fires.forEach(function (f) {
          f.meshes.forEach(function (m) {
            for (var i = 0; i < m.count; i++) {
              m.getMatrixAt(i, tm); tm.decompose(tp, tq, ts);
              var fl = f.coal ? 0.9 + Math.sin(time * 3 + i) * 0.1 : 0.8 + Math.sin(time * 13 + i * 3) * 0.12 + Math.sin(time * 7.3 + i) * 0.1;
              ts.set(f.coal ? 1 : 0.9 + Math.sin(time * 9 + i) * 0.1, fl, f.coal ? 1 : 0.9 + Math.cos(time * 8 + i) * 0.1);
              te.set(0, time * (f.coal ? 0 : 1.5), 0); tq.setFromEuler(te);
              tm.compose(tp, tq, ts); m.setMatrixAt(i, tm);
              if (!f.coal && Math.random() < 0.05) GX.emit(tp.x + (Math.random() - 0.5) * 0.2, tp.y + 0.5, tp.z + (Math.random() - 0.5) * 0.2, 'ember', 0, 1.2, 0);
            }
            m.instanceMatrix.needsUpdate = true;
          });
        });
      });
    }
  };
})();
