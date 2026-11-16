// Nine Crests - 3D models: heroes, little people, mini-bosses, friendly people, the Dragon, pickups, chests, gates,
// flags and flying things. Models face +Z; rotation.y = PI/2 - angle turns them.
// v2: rounder, more believable shapes. Static parts of every model are merged per (moving part, material) into
// shared cached geometries (few draw calls), animated parts keep their v1 names and pivots.
(function () {
  'use strict';
  var SC = window.SC, GX = SC.gfx;
  var MD = SC.models = {};
  var PI = Math.PI, TAU = Math.PI * 2;

  // ---------------- small helpers ----------------
  function part(geo, color, x, y, z, sx, sy, sz, parent, opts) {
    var m = new THREE.Mesh(geo, typeof color === 'object' ? color : GX.mat(color, opts));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.castShadow = !m.material.transparent;
    if (parent) parent.add(m);
    return m;
  }
  function group(parent, x, y, z, label) {
    var g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0);
    if (label) g.userData.kid = label;
    if (parent) parent.add(g);
    return g;
  }
  MD.part = part; MD.group = group;
  var WHITE = null;
  function collectMeshes(root) {
    var list = [];
    root.traverse(function (o) { if (o.isMesh && !o.userData.noFlash) { o.userData.baseMat = o.material; list.push(o); } });
    return list;
  }
  MD.setFlash = function (model, on) {
    if (model.flashing === on) return;
    model.flashing = on;
    if (!WHITE) WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (var i = 0; i < model.meshes.length; i++) model.meshes[i].material = on ? WHITE : model.meshes[i].userData.baseMat;
  };
  function shadowBlob(parent, r) {
    var m = new THREE.Mesh(GX.geo('blob', function () { return new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2); }),
      GX.mat(0x000000, { basic: true, transparent: true, opacity: 0.28, depthWrite: false }));
    m.scale.set(r, 1, r); m.position.y = 0.02; m.userData.noFlash = true; m.renderOrder = 1;
    if (parent) parent.add(m);
    return m;
  }
  MD.shadowBlob = shadowBlob;
  function shade(hex, dl, ds) { return new THREE.Color(hex).offsetHSL(0, ds || 0, dl).getHex(); }

  // ---------------- materials (all shared / cached) ----------------
  function flat(c, o) { var q = { flatShading: true }; if (o) for (var k in o) q[k] = o[k]; return GX.mat(c, q); }
  function glow(c, e) { return GX.mat(c, { emissive: e }); }
  function basic(c) { return GX.mat(c, { basic: true }); }
  var shinyCache = {};
  // shiny (Phong) material for metal, gems and scales; cached like GX.mat
  function shiny(c, o) {
    o = o || {};
    var key = c + '|' + JSON.stringify(o);
    if (shinyCache[key]) return shinyCache[key];
    var p = { color: c, specular: o.spec !== undefined ? o.spec : 0x8a8a8a, shininess: o.sh || 50, emissive: o.emi || 0 };
    if (o.flat) p.flatShading = true;
    if (o.opacity !== undefined) { p.transparent = true; p.opacity = o.opacity; }
    if (o.side) p.side = o.side;
    return (shinyCache[key] = new THREE.MeshPhongMaterial(p));
  }
  function steel(c) { return shiny(c || 0xc4ccd8, { spec: 0xaaaaaa, sh: 70 }); }
  function gold(c) { return shiny(c || 0xffc83a, { spec: 0xb08a40, sh: 55 }); }

  // ---------------- geometry (all shared / cached) ----------------
  function G(key, fn) { return GX.geo('md2:' + key, fn); }
  var sph = function (n) { return GX.sphere(n); };
  function V2(a) { return a.map(function (p) { return new THREE.Vector2(p[0], p[1]); }); }
  function lathe(key, pts, seg) { return G('lathe:' + key + ':' + seg, function () { return new THREE.LatheGeometry(V2(pts), seg); }); }
  // a limb: rounded, slightly tapered tube hanging from its pivot (y 0) down to y -1
  var LIMB = [[0, -1.1], [0.45, -1.07], [0.74, -0.98], [0.82, -0.8], [0.88, -0.5], [1, -0.16], [0.94, 0.02], [0.62, 0.11], [0, 0.14]];
  function limb(seg) { return lathe('limb', LIMB, seg || 6); }
  // a body: hips at y 0, shoulders at y ~0.9, top at 1
  var TORSO = [[0, 0], [0.8, 0], [0.9, 0.1], [0.86, 0.33], [0.88, 0.55], [0.97, 0.75], [1, 0.85], [0.88, 0.95], [0.55, 1.0], [0, 1.02]];
  function torso(seg) { return lathe('torso', TORSO, seg || 10); }
  // a skirt / robe: top at y 0, flared hem at y -1 (open)
  var SKIRT = [[1, -1], [0.97, -0.92], [0.9, -0.6], [0.8, -0.3], [0.7, 0]];
  function skirt(seg) { return lathe('skirt', SKIRT, seg || 10); }
  function dome(seg) { seg = seg || 14; return G('dome' + seg, function () { return new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 1 >> 1 << 1), 0, TAU, 0, PI / 2); }); }
  // open cylinder round the back and sides of a head (front left open for the face)
  function guard() { return G('guard', function () { return new THREE.CylinderGeometry(1, 1.06, 1, 16, 1, true, 0.95, TAU - 1.9); }); }
  function smile() { return G('smile', function () { return new THREE.TorusGeometry(1, 0.22, 3, 8, PI); }); }
  function halfCyl() { return G('halfCyl', function () { return new THREE.CylinderGeometry(1, 1, 1, 12, 1, false, 0, PI); }); }
  function band() { return G('band', function () { return new THREE.TorusGeometry(1, 0.12, 4, 12); }); }
  function ring() { return G('ring', function () { return new THREE.TorusGeometry(1, 0.1, 6, 24); }); }
  // a tapering tube along a path of points (horns, claws, plumes, bones, straps)
  function tube(key, pts, r0, r1, radial) {
    return G('tube:' + key, function () {
      radial = radial || 6;
      var n = pts.length, pos = [], idx = [], i, j;
      var P = pts.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); });
      var T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(1, 0, 0);
      for (i = 0; i < n; i++) {
        if (i === 0) T.subVectors(P[1], P[0]); else if (i === n - 1) T.subVectors(P[n - 1], P[n - 2]); else T.subVectors(P[i + 1], P[i - 1]);
        T.normalize();
        N.crossVectors(Math.abs(T.y) > 0.9 ? side : up, T).normalize(); B.crossVectors(T, N).normalize();
        var r = r0 + (r1 - r0) * i / (n - 1);
        for (j = 0; j < radial; j++) {
          var a = j / radial * TAU, c = Math.cos(a) * r, s = Math.sin(a) * r;
          pos.push(P[i].x + N.x * c + B.x * s, P[i].y + N.y * c + B.y * s, P[i].z + N.z * c + B.z * s);
        }
      }
      for (i = 0; i < n - 1; i++) for (j = 0; j < radial; j++) {
        var a0 = i * radial + j, a1 = i * radial + (j + 1) % radial, b0 = a0 + radial, b1 = a1 + radial;
        idx.push(a0, a1, b0, a1, b1, b0);
      }
      var c0 = pos.length / 3; pos.push(P[0].x, P[0].y, P[0].z);
      for (j = 0; j < radial; j++) idx.push(c0, (j + 1) % radial, j);
      if (r1 > 0) {
        var c1 = pos.length / 3, base = (n - 1) * radial; pos.push(P[n - 1].x, P[n - 1].y, P[n - 1].z);
        for (j = 0; j < radial; j++) idx.push(c1, base + j, base + (j + 1) % radial);
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    });
  }
  // a blade along +Z from 0 to 1, diamond cross-section; sections: [z, halfWidth, halfThick, xOffset]
  function bladeGeo(key, secs) {
    return G('blade:' + key, function () {
      var pos = [], idx = [], i, j;
      secs.forEach(function (s) {
        var xo = s[3] || 0;
        pos.push(xo + s[1], 0, s[0], xo, s[2], s[0], xo - s[1], 0, s[0], xo, -s[2], s[0]);
      });
      for (i = 0; i < secs.length - 1; i++) for (j = 0; j < 4; j++) {
        var a0 = i * 4 + j, a1 = i * 4 + (j + 1) % 4, b0 = a0 + 4, b1 = a1 + 4;
        idx.push(a0, a1, b0, a1, b1, b0);
      }
      idx.push(0, 2, 1, 0, 3, 2);
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    });
  }
  // a cut gem: table on top, girdle at y 0, point at the bottom
  function gemGeo() { return lathe('gem', [[0, -1.15], [1, 0], [0.97, 0.12], [0.62, 0.38], [0, 0.4]], 8); }

  // ---------------- merging kit: few draw calls per model ----------------
  var _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function mergeParts(parts) {
    var pos = [], nor = [];
    for (var n = 0; n < parts.length; n++) {
      var p = parts[n];
      _e.set(p[7] || 0, p[8] || 0, p[9] || 0); _q.setFromEuler(_e); _p.set(p[1], p[2], p[3]); _s.set(p[4], p[5], p[6]);
      _m4.compose(_p, _q, _s);
      var g = p[0].index ? p[0].toNonIndexed() : p[0].clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(_m4);
      var pa = g.attributes.position.array, na = g.attributes.normal.array, flip = _m4.determinant() < 0;
      for (var i = 0; i + 8 < pa.length; i += 9) {
        var o0 = i, o1 = flip ? i + 6 : i + 3, o2 = flip ? i + 3 : i + 6;
        pos.push(pa[o0], pa[o0 + 1], pa[o0 + 2], pa[o1], pa[o1 + 1], pa[o1 + 2], pa[o2], pa[o2 + 1], pa[o2 + 2]);
        nor.push(na[o0], na[o0 + 1], na[o0 + 2], na[o1], na[o1 + 1], na[o1 + 2], na[o2], na[o2 + 1], na[o2 + 2]);
      }
      g.dispose();
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.computeBoundingSphere();
    return out;
  }
  function Kit(key) { this.key = key; this.list = []; this.idx = {}; }
  function matOf(m) { return typeof m === 'number' ? GX.mat(m) : m; }
  // add(group, geometry, material|color, x, y, z, sx, sy, sz, rx, ry, rz)
  Kit.prototype.add = function (g, geo, m, x, y, z, sx, sy, sz, rx, ry, rz) {
    m = matOf(m);
    var id = (g.userData.kid || 'g') + '|' + m.uuid;
    var b = this.idx[id];
    if (!b) { b = this.idx[id] = { g: g, m: m, id: id, parts: [] }; this.list.push(b); }
    b.parts.push([geo, x, y, z, sx, sy, sz, rx, ry, rz]);
    return this;
  };
  // the same part on both sides (x and -x, mirrored rotations y and z)
  Kit.prototype.pair = function (g, geo, m, x, y, z, sx, sy, sz, rx, ry, rz) {
    this.add(g, geo, m, x, y, z, sx, sy, sz, rx, ry, rz);
    return this.add(g, geo, m, -x, y, z, sx, sy, sz, rx, -(ry || 0), -(rz || 0));
  };
  Kit.prototype.build = function () {
    for (var i = 0; i < this.list.length; i++) {
      var b = this.list[i];
      var geo = GX.geo('kit:' + this.key + ':' + b.id, mergeParts.bind(null, b.parts));
      var mesh = new THREE.Mesh(geo, b.m);
      mesh.castShadow = !b.m.transparent;
      b.g.add(mesh); b.mesh = mesh;
    }
    return this;
  };
  Kit.prototype.mesh = function (g, m) { var b = this.idx[(g.userData.kid || 'g') + '|' + matOf(m).uuid]; return b ? b.mesh : null; };

  // ---------------- heroes ----------------
  // look (colours, face) and build (proportions) per hero id; unknown ids fall back to Nate
  var HERO_LOOK = {
    nate: { skin: 0xf2c49b, cloth: 0x2f6fe0, pants: 0x3a3a5a, boots: 0x5a3a2a, iris: 0x2a5aa8, brow: 0x6a3a1a, hand: 0x7a5030 },
    zen: { skin: 0xe8b88a, cloth: 0x2b2f45, pants: 0x23263a, boots: 0x1a1a24, iris: 0x3a2412, brow: 0x1a1a1a, hand: 0x1e1e2a, face: { brow: false, ey: 0.016, wy: 0.033, nose: false, mouth: false, ears: false } },
    mira: { skin: 0xf6d2b0, cloth: 0x8e44ec, pants: 0x6a2ab8, boots: 0x4a2a6a, iris: 0x2a9a5a, brow: 0xc0602a, hair: 0xff8a3a },
    koda: { skin: 0xe0a878, cloth: 0x3f8f3f, pants: 0x6a4a2a, boots: 0x4a3020, iris: 0x5a3a1a, brow: 0x7a4a2a, hair: 0x7a4a2a, face: { mouth: false, browH: 0.022 } },
    pip: { skin: 0xf8d2aa, cloth: 0x2ab8b0, pants: 0x1a6a78, boots: 0x8a5a2a, iris: 0x2a6aa0, brow: 0x7a3a12, hair: 0x7a3a12, hand: 0x8a5a2a, face: { wy: 0.048 } },
    rokko: { skin: 0xc8946a, cloth: 0x5e7e34, pants: 0x5a4028, boots: 0x3a2a1a, iris: 0x4a3a1a, brow: 0x3a2a1a, hair: 0x3a2a1a, face: { browH: 0.022 } },
    wren: { skin: 0xf4cfa8, cloth: 0xf2f6fa, pants: 0x5aa8e8, boots: 0x8a6a4a, iris: 0x3a8ad8, brow: 0xc89040, hair: 0xf0c050 },
    fern: { skin: 0xf0c8a0, cloth: 0x38a860, pants: 0x2a7a48, boots: 0x6a4a2a, iris: 0x3a8a3a, brow: 0x7a3a18, hair: 0x9a4a22 },
    vex: { skin: 0xd8c0e8, cloth: 0x2a1c40, pants: 0x221832, boots: 0x1a1424, iris: 0xc08aff, brow: 0x1a1424, hand: 0x3a2a5a, face: { none: true, ears: false } }
  };
  var HERO_BUILD = {
    nate: { hip: 0.36, legX: 0.088, legR: 0.066, tw: 0.165, td: 0.11, sh: 0.225, armR: 0.054, scale: 1 },
    zen: { hip: 0.37, legX: 0.085, legR: 0.07, tw: 0.15, td: 0.1, sh: 0.21, armR: 0.052, scale: 0.95 },
    mira: { hip: 0.36, legX: 0.078, legR: 0.058, tw: 0.145, td: 0.1, sh: 0.2, armR: 0.05, scale: 0.95 },
    koda: { hip: 0.36, legX: 0.108, legR: 0.082, tw: 0.2, td: 0.13, sh: 0.265, armR: 0.07, scale: 1.22 },
    pip: { hip: 0.33, legX: 0.078, legR: 0.06, tw: 0.145, td: 0.1, sh: 0.2, armR: 0.05, scale: 0.88 },
    rokko: { hip: 0.35, legX: 0.11, legR: 0.085, tw: 0.205, td: 0.135, sh: 0.27, armR: 0.072, scale: 1.12 },
    wren: { hip: 0.37, legX: 0.08, legR: 0.06, tw: 0.145, td: 0.098, sh: 0.205, armR: 0.05, scale: 0.95 },
    fern: { hip: 0.36, legX: 0.078, legR: 0.058, tw: 0.145, td: 0.1, sh: 0.2, armR: 0.05, scale: 0.95 },
    vex: { hip: 0.37, legX: 0.092, legR: 0.07, tw: 0.175, td: 0.115, sh: 0.235, armR: 0.058, scale: 1.05 }
  };
  // a friendly face: eyes with iris and shine, brows, nose, smile
  function heroFace(k, head, C) {
    var o = C.face || {}, ex = 0.068, ey = o.ey || 0.005, wy = o.wy || 0.044;
    k.pair(head, sph(6), 0xffffff, ex, ey, 0.155, 0.034, wy, 0.026);
    k.pair(head, sph(4), C.iris, ex, ey - 0.003, 0.172, 0.021, wy * 0.66, 0.012);
    k.pair(head, GX.oct(), 0xffffff, ex - 0.007, ey + 0.012, 0.183, 0.007, 0.008, 0.005);
    if (o.brow !== false) k.pair(head, GX.box(), C.brow, 0.07, ey + 0.062, 0.168, 0.056, o.browH || 0.013, 0.02, 0, 0, -0.12);
    if (o.nose !== false) k.add(head, sph(4), C.skin, 0, ey - 0.045, 0.185, 0.022, 0.025, 0.02);
    if (o.mouth !== false) k.add(head, smile(), C.brow, 0, ey - 0.098, 0.166, 0.03, 0.022, 0.02, 0, 0, PI);
  }
  var HERO_PARTS = {};
  MD.hero = function (id, tier) {
    var lid = HERO_LOOK[id] ? id : 'nate';
    var C = HERO_LOOK[lid], B = HERO_BUILD[lid], h = SC.heroById(id);
    if (!h || h.id !== id) h = { scale: B.scale, arc: 2.0, reach: 1.3 };
    var sc = h.scale || B.scale;
    var root = new THREE.Group();
    var model = { root: root, id: id, kind: 'hero' };
    model.shadow = shadowBlob(root, 0.38 * sc);
    var body = model.body = group(root, 0, 0, 0, 'body');
    body.scale.setScalar(sc);
    var k = new Kit('hero:' + lid);
    var hand = C.hand || C.skin;
    // legs (pivot at the hip)
    model.legL = group(body, -B.legX, B.hip, 0, 'legL'); model.legR = group(body, B.legX, B.hip, 0, 'legR');
    [model.legL, model.legR].forEach(function (lg) {
      var y0 = -B.hip;
      k.add(lg, limb(5), C.pants, 0, 0, 0, B.legR, B.hip - 0.1, B.legR * 1.08);
      k.add(lg, GX.cyl(1, 0.92, 8), C.boots, 0, y0 + 0.1, 0, B.legR * 1.12, 0.15, B.legR * 1.16);
      k.add(lg, sph(6), C.boots, 0, y0 + 0.048, 0.034, B.legR * 1.15, 0.05, B.legR * 1.95);
      k.add(lg, GX.box(), 0x2a1c14, 0, y0 + 0.013, 0.03, B.legR * 2.15, 0.026, B.legR * 3.4);
    });
    // body
    k.add(body, torso(8), C.cloth, 0, 0.38, 0, B.tw, 0.36, B.td);
    k.add(body, GX.cyl(1, 1, 6), C.skin, 0, 0.775, 0, 0.05, 0.07, 0.05);
    // arms (pivot at the shoulder)
    model.armL = group(body, -B.sh, 0.71, 0, 'armL'); model.armR = group(body, B.sh, 0.71, 0, 'armR');
    [model.armL, model.armR].forEach(function (a, i) {
      var s = i ? 1 : -1, r = B.armR;
      k.add(a, limb(5), C.cloth, 0, 0, 0, r, 0.25, r * 1.05);
      k.add(a, sph(6), hand, 0, -0.29, 0.012, r * 0.85, r * 0.98, r * 0.9);
      k.add(a, sph(4), hand, -s * r * 0.6, -0.27, r * 0.6, r * 0.38, r * 0.5, r * 0.38);
    });
    // head
    var head = model.head = group(body, 0, 0.94, 0, 'head');
    k.add(head, sph(10), C.skin, 0, 0, 0, 0.19, 0.2, 0.185);
    k.add(head, sph(6), C.skin, 0, -0.075, 0.025, 0.15, 0.115, 0.15);
    if (!(C.face && C.face.none)) heroFace(k, head, C);
    if (!(C.face && C.face.ears === false)) k.pair(head, sph(4), C.skin, 0.186, -0.01, 0, 0.028, 0.05, 0.035);
    (HERO_PARTS[lid])(k, model, body, head, C, B);
    k.build();
    model.torso = k.mesh(body, C.cloth);
    if (lid === 'mira') model.hat = k.mesh(head, C.cloth);
    // sword
    model.swordG = group(root, 0, 0.55, 0);
    MD.setHeroSword(model, tier || 0);
    // swing trail
    var arc = h.arc || 2.0, reach = h.reach || 1.3;
    var trailGeo = GX.geo('trail_' + id + '_' + arc + '_' + reach, function () { return new THREE.RingGeometry(0.35, reach + 0.1, 20, 1, -Math.PI / 2 - arc / 2, arc).rotateX(-Math.PI / 2); });
    model.trailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    model.trail = new THREE.Mesh(trailGeo, model.trailMat);
    model.trail.position.y = 0.5; model.trail.userData.noFlash = true;
    root.add(model.trail);
    model.meshes = collectMeshes(root);
    return model;
  };
  // a cape hanging from the shoulders (model.cape, rotated by view.js)
  function addCape(k, model, body, mat, len, wide) {
    model.cape = group(body, 0, 0.745, 0, 'cape');
    var capeGeo = G('capeGeo', function () { return new THREE.CylinderGeometry(0.9, 1.25, 1, 10, 2, true, PI - 1.05, 2.1); });
    k.add(model.cape, capeGeo, mat, 0, -len / 2, 0.0, 0.195 * (wide || 1), len, 0.15 * (wide || 1));
    return model.cape;
  }

  HERO_PARTS.nate = function (k, model, body, head, C, B) {
    var ST = steel(0xc8d2e0), GD = gold(), RED = 0xd63a3a;
    k.add(body, skirt(8), C.cloth, 0, 0.47, 0, B.tw * 1.08, 0.17, B.td * 1.18);
    k.add(body, torso(8), ST, 0, 0.5, 0.004, B.tw * 1.07, 0.255, B.td * 1.13);
    k.add(body, GX.box(), ST, 0, 0.64, B.td * 1.1, 0.016, 0.16, 0.01);
    k.add(body, GX.cyl(1, 1, 10), GD, 0, 0.47, 0, B.tw * 1.06, 0.04, B.td * 1.16);
    k.add(body, GX.box(), GD, 0, 0.47, B.td * 1.17, 0.05, 0.048, 0.016);
    k.pair(body, dome(8), ST, B.sh - 0.02, 0.715, 0, 0.088, 0.075, 0.092, 0, 0, -0.4);
    k.pair(body, sph(4), GD, 0.1, 0.738, 0.075, 0.018, 0.018, 0.012);
    addCape(k, model, body, GX.mat(RED, { side: THREE.DoubleSide }), 0.44);
    [model.armL, model.armR].forEach(function (a) { k.add(a, GX.cyl(1, 1.12, 8), ST, 0, -0.2, 0, B.armR * 1.12, 0.09, B.armR * 1.18); });
    [model.legL, model.legR].forEach(function (lg) {
      k.add(lg, GX.cyl(1, 1.05, 8), ST, 0, -B.hip + 0.2, 0.004, B.legR * 1.16, 0.1, B.legR * 1.22);
      k.add(lg, sph(4), ST, 0, -0.15, 0.04, 0.048, 0.042, 0.04);
    });
    k.add(head, dome(12), ST, 0, 0.03, 0, 0.212, 0.2, 0.208);
    k.add(head, guard(), ST, 0, -0.04, 0, 0.21, 0.14, 0.206);
    k.add(head, GX.box(), ST, 0, 0.005, 0.203, 0.022, 0.075, 0.016);
    k.add(head, GX.box(), GD, 0, 0.13, 0.05, 0.03, 0.15, 0.3);
    k.add(head, tube('plume', [[0, 0.22, 0.02], [0, 0.3, -0.03], [0, 0.32, -0.12], [0, 0.27, -0.22], [0, 0.17, -0.28], [0, 0.06, -0.29]], 0.055, 0.02, 6), 0xff3a3a, 0, 0, 0, 1, 1, 1);
  };
  HERO_PARTS.zen = function (k, model, body, head, C, B) {
    var RED = 0xe53935, WRAP = 0x666c86, DK = 0x1e2030;
    k.add(body, skirt(8), C.cloth, 0, 0.47, 0, B.tw * 1.06, 0.12, B.td * 1.15);
    k.pair(body, GX.box(), WRAP, 0.034, 0.66, B.td * 0.98, 0.022, 0.15, 0.012, 0, 0, 0.45);
    k.add(body, GX.cyl(1, 1, 10), RED, 0, 0.47, 0, B.tw * 1.06, 0.055, B.td * 1.14);
    k.add(body, sph(4), RED, -0.075, 0.47, 0.105, 0.032, 0.03, 0.025);
    k.add(body, GX.box(), RED, -0.085, 0.395, 0.11, 0.03, 0.12, 0.012, 0, 0, 0.15);
    k.add(body, GX.box(), RED, -0.06, 0.4, 0.112, 0.028, 0.1, 0.012, 0, 0, -0.12);
    k.add(body, dome(8), steel(0x3a3f52), -B.sh + 0.02, 0.715, 0, 0.08, 0.07, 0.085, 0, 0, 0.4);
    k.add(body, GX.cyl(1, 1, 6), DK, 0.0, 0.57, -B.td - 0.03, 0.026, 0.56, 0.02, 0, 0, 0.75);
    [model.armL, model.armR].forEach(function (a) { k.add(a, GX.cyl(1, 1.1, 8), WRAP, 0, -0.205, 0, B.armR * 1.08, 0.1, B.armR * 1.12); });
    [model.legL, model.legR].forEach(function (lg) { k.add(lg, GX.cyl(1, 1.05, 8), WRAP, 0, -B.hip + 0.2, 0, B.legR * 1.08, 0.1, B.legR * 1.12); });
    k.add(head, dome(12), C.cloth, 0, 0.035, 0, 0.21, 0.21, 0.207);
    k.add(head, guard(), C.cloth, 0, -0.05, 0, 0.21, 0.17, 0.206);
    k.add(head, sph(8), C.cloth, 0, -0.092, 0.035, 0.162, 0.094, 0.158);
    k.add(head, GX.cyl(1, 1, 12), RED, 0, 0.05, 0, 0.218, 0.04, 0.214);
    k.add(head, GX.box(), WRAP, 0, 0.05, 0.214, 0.08, 0.03, 0.01);
    model.tails = group(head, 0, 0.05, -0.212, 'tails');
    k.add(model.tails, sph(4), RED, 0, 0, 0, 0.032, 0.03, 0.025);
    k.add(model.tails, GX.box(), RED, -0.035, -0.035, -0.11, 0.045, 0.012, 0.22, 0.3, 0, 0.2);
    k.add(model.tails, GX.box(), RED, 0.04, -0.055, -0.1, 0.045, 0.012, 0.2, 0.45, 0, -0.2);
  };
  HERO_PARTS.mira = function (k, model, body, head, C, B) {
    var GD = gold(), DP = 0x6a2ab8, HAIR = C.hair;
    k.add(body, skirt(10), C.cloth, 0, 0.48, 0, 0.2, 0.42, 0.165);
    k.add(body, band(), GD, 0, 0.075, 0, 0.2, 0.165, 0.15, PI / 2, 0, 0);
    k.add(body, GX.box(), DP, 0, 0.27, 0.146, 0.05, 0.4, 0.012, -0.118, 0, 0);
    k.add(body, GX.cyl(1, 1, 10), GD, 0, 0.48, 0, B.tw * 1.0, 0.045, B.td * 1.22);
    k.add(body, GX.oct(), GD, 0, 0.48, B.td * 1.25, 0.03, 0.035, 0.015);
    k.add(body, sph(8), 0xa86af0, 0, 0.705, 0, B.tw * 1.38, 0.075, B.td * 1.55);
    k.add(body, sph(4), GD, 0, 0.72, B.td * 1.25, 0.022, 0.022, 0.014);
    [model.armL, model.armR].forEach(function (a) { k.add(a, GX.cyl(0.55, 1, 8), C.cloth, 0, -0.215, 0, B.armR * 1.65, 0.1, B.armR * 1.65); });
    k.add(head, dome(12), HAIR, 0, 0.035, -0.005, 0.21, 0.215, 0.207);
    k.add(head, sph(8), HAIR, 0, -0.1, -0.09, 0.19, 0.26, 0.12);
    k.add(head, sph(6), HAIR, 0, 0.105, 0.135, 0.15, 0.06, 0.075, 0.4, 0, 0);
    k.pair(head, limb(4), HAIR, 0.165, 0.0, 0.05, 0.036, 0.2, 0.036, 0, 0, 0.08);
    k.add(head, GX.cyl(1, 1, 14), DP, 0, 0.165, 0, 0.36, 0.016, 0.36);
    k.add(head, tube('mirahat', [[0, 0, 0], [0, 0.18, -0.02], [0, 0.34, -0.08], [0, 0.44, -0.19], [0, 0.47, -0.3]], 0.2, 0, 10), C.cloth, 0, 0.165, 0, 1, 1, 1);
    k.add(head, band(), GD, 0, 0.19, 0, 0.19, 0.19, 0.2, PI / 2, 0, 0);
    k.add(head, GX.oct(), glow(0xffd23f, 0x6a5a00), 0, 0.26, 0.17, 0.055, 0.06, 0.025);
  };
  HERO_PARTS.koda = function (k, model, body, head, C, B) {
    var FUR = flat(0x8a6a4a), LEA = 0x5a3a1a, BR = gold(0xd0a040), HORN = shiny(0xf2ead8, { spec: 0x555555, sh: 30 }), HELM = shiny(0x8a6a4a, { spec: 0x5a5040, sh: 35 });
    k.add(body, skirt(8), C.cloth, 0, 0.47, 0, B.tw * 1.07, 0.16, B.td * 1.15);
    k.add(body, GX.cyl(1, 1, 10), LEA, 0, 0.47, 0, B.tw * 1.07, 0.07, B.td * 1.12);
    k.add(body, GX.box(), BR, 0, 0.47, B.td * 1.13, 0.07, 0.065, 0.016);
    k.add(body, GX.box(), LEA, 0, 0.6, B.td * 1.0, 0.04, 0.4, 0.014, 0, 0, 0.72);
    k.add(body, GX.box(), LEA, 0, 0.6, -B.td * 1.0, 0.04, 0.4, 0.014, 0, 0, -0.72);
    k.add(body, sph(8), FUR, 0, 0.73, 0, 0.27, 0.09, 0.18);
    k.pair(body, sph(6), FUR, 0.2, 0.735, 0, 0.1, 0.08, 0.11);
    [model.armL, model.armR].forEach(function (a) { k.add(a, GX.cyl(1, 1.1, 8), LEA, 0, -0.205, 0, B.armR * 1.12, 0.1, B.armR * 1.15); });
    [model.legL, model.legR].forEach(function (lg) { k.add(lg, sph(6), FUR, 0, -B.hip + 0.17, 0, B.legR * 1.35, 0.04, B.legR * 1.4); });
    k.add(head, dome(12), HELM, 0, 0.035, 0, 0.205, 0.185, 0.205);
    k.add(head, GX.box(), HELM, 0, 0.13, 0, 0.03, 0.15, 0.36);
    var hornGeo = tube('kodahorn', [[0.17, 0.08, 0], [0.26, 0.12, 0.01], [0.33, 0.2, -0.01], [0.36, 0.31, -0.05]], 0.048, 0, 6);
    k.add(head, hornGeo, HORN, 0, 0, 0, 1, 1, 1);
    k.add(head, hornGeo, HORN, 0, 0, 0, -1, 1, 1);
    k.add(head, sph(8), C.hair, 0, -0.12, 0.1, 0.165, 0.14, 0.11);
    k.add(head, sph(6), C.hair, 0, -0.22, 0.1, 0.1, 0.1, 0.08);
    k.pair(head, sph(4), C.hair, 0.045, -0.058, 0.178, 0.06, 0.024, 0.03, 0, 0, 0.3);
    k.add(head, sph(6), C.hair, 0, -0.07, -0.12, 0.17, 0.17, 0.1);
  };
  // Pip the Bubble Tinker: goggles, messy hair, tool belt, bubble tank on the back
  HERO_PARTS.pip = function (k, model, body, head, C, B) {
    var LEA = 0x7a4a22, BR = gold(0xd8a040), GLASS = GX.mat(0x8ff0ff, { transparent: true, opacity: 0.55, emissive: 0x1a6070 });
    k.add(body, skirt(8), C.pants, 0, 0.46, 0, B.tw * 1.08, 0.16, B.td * 1.16);
    k.pair(body, GX.box(), C.pants, 0.06, 0.6, B.td * 0.98, 0.025, 0.28, 0.012);
    k.pair(body, GX.box(), C.pants, 0.06, 0.6, -B.td * 0.98, 0.025, 0.28, 0.012);
    k.add(body, GX.cyl(1, 1, 10), LEA, 0, 0.45, 0, B.tw * 1.1, 0.045, B.td * 1.2);
    k.pair(body, GX.box(), LEA, 0.105, 0.41, 0.07, 0.06, 0.07, 0.045, 0, 0.5, 0);
    k.add(body, GX.box(), steel(0xb8c0c8), 0.15, 0.38, 0.03, 0.016, 0.13, 0.012, 0, 0, 0.2);
    k.add(body, GX.cyl(1, 1, 8), GLASS, 0, 0.6, -B.td - 0.07, 0.075, 0.24, 0.075);
    k.add(body, GX.cyl(1, 1, 8), BR, 0, 0.73, -B.td - 0.07, 0.08, 0.03, 0.08);
    k.add(body, GX.cyl(1, 1, 8), BR, 0, 0.47, -B.td - 0.07, 0.08, 0.03, 0.08);
    k.add(body, tube('piphose', [[0, 0.75, -0.17], [0.08, 0.8, -0.12], [0.16, 0.76, -0.04]], 0.014, 0.014, 4), 0x3a3a48, 0, 0, 0, 1, 1, 1);
    k.add(head, dome(10), C.hair, 0, 0.03, -0.01, 0.21, 0.215, 0.208);
    for (var i = 0; i < 6; i++) {
      var a = -1.2 + i * 0.48;
      k.add(head, GX.cone(4), flat(C.hair), Math.sin(a) * 0.14, 0.17 + (i % 2) * 0.02, Math.cos(a) * 0.08 - 0.06, 0.045, 0.12, 0.045, -0.5 + Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.7);
    }
    k.add(head, GX.cyl(1, 1, 12), 0x2a2a34, 0, 0.1, 0, 0.214, 0.03, 0.21);
    k.pair(head, GX.cyl(1, 1, 8), BR, 0.065, 0.11, 0.19, 0.052, 0.04, 0.05, PI / 2 - 0.3, 0, 0);
    k.pair(head, GX.cyl(1, 1, 8), glow(0x7ff6ff, 0x1a7a8a), 0.065, 0.113, 0.21, 0.04, 0.01, 0.038, PI / 2 - 0.3, 0, 0);
  };
  // Rokko the Stone Guard: stone shoulders and helm with moss, broad and sturdy
  HERO_PARTS.rokko = function (k, model, body, head, C, B) {
    var STONE = flat(0x8a8478), MOSS = flat(0x5a8a2a), LEA = 0x4a3020;
    k.add(body, skirt(8), C.cloth, 0, 0.47, 0, B.tw * 1.08, 0.17, B.td * 1.16);
    k.add(body, torso(8), STONE, 0, 0.5, 0.004, B.tw * 1.08, 0.25, B.td * 1.15);
    k.add(body, GX.cyl(1, 1, 10), LEA, 0, 0.47, 0, B.tw * 1.1, 0.07, B.td * 1.18);
    k.add(body, GX.dodec(), STONE, 0, 0.47, B.td * 1.2, 0.045, 0.04, 0.025);
    k.pair(body, GX.dodec(), STONE, B.sh - 0.01, 0.73, 0, 0.13, 0.095, 0.13, 0.3, 0.4, 0);
    k.pair(body, GX.dodec(), STONE, B.sh + 0.02, 0.81, -0.02, 0.07, 0.06, 0.07, 0, 0.9, 0);
    k.pair(body, GX.ico(), MOSS, B.sh - 0.04, 0.8, 0.04, 0.06, 0.03, 0.06);
    k.add(body, GX.ico(), MOSS, 0.06, 0.62, B.td * 1.15, 0.05, 0.04, 0.02);
    [model.armL, model.armR].forEach(function (a) { k.add(a, GX.cyl(1, 1.1, 6), STONE, 0, -0.205, 0, B.armR * 1.18, 0.1, B.armR * 1.2); });
    [model.legL, model.legR].forEach(function (lg) { k.add(lg, GX.dodec(), STONE, 0, -0.14, 0.05, 0.055, 0.05, 0.045); });
    k.add(head, dome(8), STONE, 0, 0.03, 0, 0.218, 0.165, 0.212);
    k.add(head, GX.cyl(1, 1, 8), STONE, 0, 0.035, 0.005, 0.226, 0.035, 0.222);
    for (var i = 0; i < 3; i++) k.add(head, GX.dodec(), i === 1 ? MOSS : STONE, 0, 0.18 - Math.abs(i - 1) * 0.03, 0.06 - i * 0.09, 0.045, 0.04, 0.05);
    k.add(head, sph(6), C.hair, 0, -0.12, 0.1, 0.15, 0.09, 0.09);
  };
  // Wren the Sky Scout: white feathered cloak, long sky-blue scarf, blue cap with feathers
  HERO_PARTS.wren = function (k, model, body, head, C, B) {
    var SKY = 0x5aa8e8, FE1 = flat(0xd8ecfa), FE2 = flat(0x6ab0e8), LEA = 0x8a6a4a;
    k.add(body, skirt(8), C.cloth, 0, 0.47, 0, B.tw * 1.06, 0.15, B.td * 1.15);
    k.add(body, GX.cyl(1, 1, 10), SKY, 0, 0.47, 0, B.tw * 1.06, 0.05, B.td * 1.14);
    k.add(body, GX.cyl(1, 1, 10), SKY, 0, 0.77, 0, 0.095, 0.05, 0.09);
    [model.armL, model.armR].forEach(function (a) { k.add(a, GX.cyl(1, 1.1, 8), LEA, 0, -0.21, 0, B.armR * 1.1, 0.08, B.armR * 1.12); });
    var cape = addCape(k, model, body, GX.mat(0xf2f6fa, { side: THREE.DoubleSide }), 0.42, 1.05);
    for (var r = 0; r < 2; r++) for (var i = 0; i < 5; i++) {
      var x = (i - 2) * 0.07, y = r ? -0.4 : -0.28, d = 0.15 * 1.05 * (0.9 + 0.35 * (-y / 0.42)), rr = 0.195 * 1.05 * (0.9 + 0.35 * (-y / 0.42));
      var z = -d * Math.sqrt(Math.max(0, 1 - (x / rr) * (x / rr))) - 0.008;
      k.add(cape, GX.cone(4), r ? FE2 : FE1, x, y, z, 0.035, 0.13, 0.01, -0.15, 0, PI);
    }
    k.add(cape, tube('wrenscarf', [[0.05, 0.02, -0.08], [0.09, -0.04, -0.18], [0.12, -0.16, -0.27], [0.14, -0.32, -0.32], [0.15, -0.46, -0.34]], 0.032, 0.022, 5), SKY, 0, 0, 0, 1, 1, 1);
    k.add(head, dome(10), C.hair, 0, 0.0, -0.01, 0.205, 0.2, 0.2);
    k.add(head, dome(10), SKY, 0, 0.05, -0.005, 0.214, 0.17, 0.21);
    k.add(head, sph(6), SKY, 0, 0.06, 0.19, 0.12, 0.016, 0.07);
    k.add(head, sph(6), C.hair, 0.05, 0.05, 0.17, 0.09, 0.035, 0.05, 0.3, 0, -0.2);
    var feather = tube('wrenfeather', [[0.17, 0.12, -0.04], [0.22, 0.2, -0.12], [0.24, 0.26, -0.24]], 0.03, 0, 4);
    k.add(head, feather, FE1, 0, 0, 0, 1, 1, 1);
    k.add(head, feather, FE2, 0.02, -0.03, 0.02, 1, 0.9, 0.9);
  };
  // Fern the Healer: leaf crown, long braid, green dress with gold, leaf mantle
  HERO_PARTS.fern = function (k, model, body, head, C, B) {
    var GD = gold(), LEAF = flat(0x6ad860), LEAF2 = flat(0x3a9a48);
    k.add(body, skirt(10), C.cloth, 0, 0.48, 0, 0.19, 0.34, 0.16);
    k.add(body, band(), GD, 0, 0.145, 0, 0.19, 0.16, 0.15, PI / 2, 0, 0);
    k.add(body, GX.cyl(1, 1, 10), GD, 0, 0.48, 0, B.tw * 1.0, 0.04, B.td * 1.22);
    for (var i = 0; i < 6; i++) {
      var a = -PI / 2 + (i - 2.5) * 0.55;
      k.add(body, GX.cone(4), i % 2 ? LEAF : LEAF2, Math.cos(a) * 0.15, 0.7, Math.sin(a) * -0.1 + 0.0, 0.06, 0.13, 0.015, 0.2, -a - PI / 2, PI + Math.cos(a) * 0.4);
    }
    [model.armL, model.armR].forEach(function (a) { k.add(a, GX.cyl(1, 1, 8), GD, 0, -0.24, 0, B.armR * 1.05, 0.025, B.armR * 1.05); });
    k.add(head, dome(10), C.hair, 0, 0.03, -0.01, 0.208, 0.215, 0.206);
    k.add(head, sph(6), C.hair, 0, -0.04, -0.1, 0.17, 0.2, 0.11);
    k.add(head, tube('fernbraid', [[0, -0.02, -0.17], [0, -0.14, -0.21], [0, -0.28, -0.2], [0, -0.42, -0.17], [0, -0.52, -0.15]], 0.05, 0.025, 5), C.hair, 0, 0, 0, 1, 1, 1);
    k.add(head, sph(4), GD, 0, -0.5, -0.155, 0.032, 0.03, 0.032);
    k.add(head, band(), GD, 0, 0.1, 0, 0.212, 0.212, 0.18, PI / 2, 0, 0);
    for (var j = 0; j < 7; j++) {
      var b = (j - 3) * 0.45;
      k.add(head, GX.cone(4), j % 2 ? LEAF2 : LEAF, Math.sin(b) * 0.21, 0.15, Math.cos(b) * 0.2, 0.04, 0.11, 0.012, Math.cos(b) * 0.4, b, -Math.sin(b) * 0.4);
    }
    k.add(head, sph(4), glow(0xff8ab0, 0x5a1a30), 0, 0.12, 0.215, 0.03, 0.03, 0.02);
  };
  // Vex the Shadow Knight: dark purple armour, hooded cloak, glowing violet eyes
  HERO_PARTS.vex = function (k, model, body, head, C, B) {
    var ARM = shiny(0x4a3a6a, { spec: 0x8a7aaa, sh: 60 }), GEM = glow(0xb07aff, 0x6a2aaa), EYE = basic(0xd0a0ff), SL = steel(0xb8b0d0);
    k.add(body, skirt(8), C.cloth, 0, 0.47, 0, B.tw * 1.08, 0.17, B.td * 1.16);
    k.add(body, torso(8), ARM, 0, 0.5, 0.004, B.tw * 1.07, 0.255, B.td * 1.13);
    k.add(body, GX.oct(), GEM, 0, 0.64, B.td * 1.17, 0.035, 0.045, 0.02);
    k.add(body, GX.cyl(1, 1, 10), 0x1a1424, 0, 0.47, 0, B.tw * 1.08, 0.045, B.td * 1.16);
    k.add(body, GX.box(), SL, 0, 0.47, B.td * 1.17, 0.045, 0.045, 0.014);
    k.pair(body, dome(8), ARM, B.sh - 0.02, 0.72, 0, 0.095, 0.08, 0.1, 0, 0, -0.4);
    k.pair(body, GX.cone(4), ARM, B.sh, 0.8, 0, 0.025, 0.08, 0.025, 0, 0, -0.35);
    addCape(k, model, body, GX.mat(0x2a1c40, { side: THREE.DoubleSide }), 0.6, 1.08);
    [model.armL, model.armR].forEach(function (a) { k.add(a, GX.cyl(1, 1.12, 8), ARM, 0, -0.2, 0, B.armR * 1.15, 0.1, B.armR * 1.2); });
    [model.legL, model.legR].forEach(function (lg) { k.add(lg, GX.cyl(1, 1.05, 8), ARM, 0, -B.hip + 0.2, 0.004, B.legR * 1.16, 0.12, B.legR * 1.22); });
    k.add(head, sph(10), ARM, 0, 0.0, 0.0, 0.2, 0.205, 0.2);
    k.add(head, GX.box(), basic(0x120a1a), 0, 0.0, 0.19, 0.16, 0.035, 0.02);
    k.pair(head, sph(4), EYE, 0.055, 0.0, 0.198, 0.03, 0.016, 0.01);
    k.add(head, dome(10), C.cloth, 0, 0.02, -0.01, 0.228, 0.23, 0.225);
    k.add(head, guard(), C.cloth, 0, -0.08, -0.01, 0.228, 0.2, 0.225);
    k.add(head, tube('vexhood', [[0, 0.17, -0.14], [0, 0.18, -0.24], [0, 0.1, -0.3]], 0.07, 0, 6), C.cloth, 0, 0, 0, 1, 1, 1);
  };

  // ---------------- hero swords (starter, Iron, Crystal) ----------------
  // c1/c2: Iron and Crystal blade colours (default steel-blue and cyan); gm: 'gold' | 'steel' | 'stone' guard
  var SWORD = {
    nate: { len: 0.62, wid: 0.09, th: 0.026, grip: 0.15, guard: 0.26, style: 'cross', blade: 0xcfd8e3, grp: 0x6a4020, gc: 0xffc83a },
    zen: { len: 0.7, wid: 0.05, th: 0.022, grip: 0.19, guard: 0.1, style: 'tsuba', blade: 0xe8eef5, grp: 0x1a1a1a, gc: 0x2a2a2a, gm: 'steel' },
    mira: { len: 0.78, wid: 0.04, th: 0.02, grip: 0.14, guard: 0.07, style: 'ring', blade: 0xc8a8ff, grp: 0x4a2a6a, gc: 0xffc83a, emi: 0x3a1a6a },
    koda: { len: 0.88, wid: 0.17, th: 0.034, grip: 0.22, guard: 0.36, style: 'great', blade: 0xb8b8c0, grp: 0x6a4020, gc: 0xffc83a },
    pip: { len: 0.48, wid: 0.075, th: 0.024, grip: 0.12, guard: 0.16, style: 'short', blade: 0xdff4f4, grp: 0x2a6a70, gc: 0xd8a040 },
    rokko: { len: 0.72, wid: 0.2, th: 0.036, grip: 0.2, guard: 0.3, style: 'cleaver', blade: 0xa8a098, grp: 0x4a3020, gc: 0x8a8478, gm: 'stone', c2: 0xffc870, e2: 0x7a4a10 },
    wren: { len: 0.66, wid: 0.055, th: 0.02, grip: 0.15, guard: 0.09, style: 'saber', blade: 0xe8f4ff, grp: 0x5aa8e8, gc: 0xd8e0e8, gm: 'steel', c2: 0xd8f8ff, e2: 0x3a7a9a },
    fern: { len: 0.62, wid: 0.075, th: 0.02, grip: 0.14, guard: 0.14, style: 'leaf', blade: 0xe0f4d0, grp: 0x6a4a2a, gc: 0xffc83a, emi: 0x1a3a10, c2: 0x9affb0, e2: 0x1a8a3a },
    vex: { len: 0.7, wid: 0.09, th: 0.028, grip: 0.16, guard: 0.24, style: 'crystal', blade: 0x5a2a8a, grp: 0x1a1424, gc: 0x2a2240, gm: 'steel', emi: 0x2a0a4a, c1: 0x8a7ab0, e1: 0x2a1a4a, c2: 0xb07aff, e2: 0x5a1a9a }
  };
  var BLADES = {
    cross: [[0, 1, 1], [0.8, 0.92, 0.95], [0.93, 0.55, 0.7], [1, 0, 0.15]],
    short: [[0, 1, 1], [0.7, 0.95, 0.95], [0.88, 0.6, 0.7], [1, 0, 0.15]],
    tsuba: [[0, 1, 1], [0.88, 0.96, 0.9], [1, 0, 0.3, 0.7]],
    ring: [[0, 1, 1], [0.9, 0.6, 0.85], [1, 0, 0.2]],
    great: [[0, 1, 1], [0.82, 0.95, 0.95], [0.94, 0.5, 0.6], [1, 0, 0.15]],
    cleaver: [[0, 1, 1], [0.5, 1.05, 1], [0.86, 1.1, 0.95], [1, 0.25, 0.45, -0.6]],
    saber: [[0, 1, 1, 0], [0.45, 0.95, 0.9, 0.35], [0.8, 0.85, 0.8, 1.1], [1, 0, 0.2, 2.2]],
    leaf: [[0, 0.55, 0.8], [0.3, 1, 1], [0.7, 0.85, 0.85], [1, 0, 0.2]],
    crystal: [[0, 1, 1], [0.35, 1.2, 1], [0.5, 0.85, 0.9], [0.75, 1.05, 0.9], [0.88, 0.7, 0.7], [1, 0, 0.2]]
  };
  MD.setHeroSword = function (model, tier) {
    var g = model.swordG;
    while (g.children.length) g.remove(g.children[0]);
    g.userData.kid = 'sw';
    model.tier = tier;
    var id = SWORD[model.id] ? model.id : 'nate', S = SWORD[id];
    var k = new Kit('sword:' + id + ':' + tier);
    var bladeCol = S.blade, emi = S.emi || 0x343a44, op;
    if (tier === 1) { bladeCol = S.c1 || 0xeaf4ff; emi = S.e1 || 0x1a3050; }
    if (tier === 2) { bladeCol = S.c2 || 0x8ff8ff; emi = S.e2 || 0x1a8a9a; op = 0.88; }
    var bladeMat = shiny(bladeCol, { spec: 0xffffff, sh: 90, emi: emi, flat: true, opacity: op });
    var guardMat = tier === 2 ? shiny(S.c2 ? shade(S.c2, -0.1) : 0x5ae0ff, { emi: S.e2 || 0x0a5a6a, sh: 80, spec: 0xffffff }) : tier === 1 ? steel(0x8aa0c0) :
      (S.gm === 'stone' ? flat(S.gc) : S.gm === 'steel' ? steel(S.gc) : gold(S.gc));
    var gripMat = GX.mat(S.grp), wrapMat = GX.mat(id === 'zen' ? 0xe8e0d0 : shade(S.grp, 0.12));
    var gr = S.wid > 0.15 ? 0.028 : 0.022;
    // grip, wrap and pommel
    k.add(g, GX.cyl(1, 1, 6), gripMat, 0, 0, -S.grip / 2 - 0.01, gr, S.grip, gr, PI / 2, 0, 0);
    for (var i = 0; i < 2; i++) k.add(g, GX.cyl(1, 1, 6), wrapMat, 0, 0, -0.045 - i * (S.grip - 0.04) / 2, gr * 1.15, 0.012, gr * 1.15, PI / 2, 0, 0);
    if (id === 'zen') k.add(g, GX.cyl(1, 1, 6), guardMat, 0, 0, -S.grip - 0.015, gr * 1.2, 0.02, gr * 1.2, PI / 2, 0, 0);
    else k.add(g, sph(6), guardMat, 0, 0, -S.grip - 0.03, gr * 1.6, gr * 1.6, gr * 1.6);
    // guard
    var st = S.style;
    if (st === 'cross' || st === 'short' || st === 'crystal') {
      k.add(g, GX.box(), guardMat, 0, 0, 0.05, S.guard, 0.035, 0.04);
      k.pair(g, st === 'crystal' ? GX.oct() : sph(4), guardMat, S.guard / 2, 0, 0.055, 0.026, st === 'crystal' ? 0.05 : 0.026, 0.026);
      k.add(g, sph(4), guardMat, 0, 0, 0.05, 0.04, 0.03, 0.035);
    } else if (st === 'tsuba') {
      k.add(g, GX.cyl(1, 1, 10), guardMat, 0, 0, 0.05, 0.055, 0.016, 0.045, PI / 2, 0, 0);
    } else if (st === 'ring' || st === 'saber') {
      k.add(g, band(), guardMat, 0, 0, 0.06, 0.07, 0.07, 0.07);
      k.add(g, GX.box(), guardMat, 0, 0, 0.055, st === 'saber' ? 0.12 : 0.16, 0.022, 0.025);
    } else if (st === 'leaf') {
      k.pair(g, sph(4), flat(0x5ad06a), 0.06, 0, 0.055, 0.06, 0.012, 0.03, 0, 0.3, 0);
      k.add(g, sph(4), guardMat, 0, 0, 0.05, 0.035, 0.03, 0.03);
    } else {
      k.add(g, GX.box(), guardMat, 0, 0, 0.055, S.guard * 0.6, 0.045, 0.055);
      k.pair(g, GX.box(), guardMat, S.guard * 0.36, 0, 0.07, S.guard * 0.28, 0.04, 0.045, 0, 0.45, 0);
    }
    // blade and fuller
    k.add(g, bladeGeo(st, BLADES[st]), bladeMat, 0, 0, 0.065, S.wid / 2, S.th / 2, S.len + 0.1);
    var fullMat = tier === 2 ? GX.mat(0xffffff, { emissive: 0x88ffff }) : tier === 1 ? shiny(0x9ab8e0, { emi: 0x10203a, sh: 60 }) : shiny(shade(bladeCol, -0.18), { sh: 40 });
    if (st === 'tsuba' || st === 'saber') k.add(g, GX.box(), fullMat, 0.012, 0, 0.1 + S.len * 0.3, 0.004, S.th * 0.7, S.len * 0.5);
    else k.add(g, GX.box(), fullMat, 0, 0, 0.1 + S.len * 0.35, S.wid * 0.13, S.th * 1.06, S.len * 0.6);
    if (tier >= 1) {
      var gem = tier === 2 ? glow(S.c2 || 0x5affff, S.e2 || 0x00a0a0) : glow(0x6aa8ff, 0x2050a0);
      k.add(g, GX.oct(), gem, 0, 0, 0.055, 0.04, 0.04, 0.04);
      k.add(g, GX.oct(), gem, 0, 0, -S.grip - 0.03, 0.03, 0.03, 0.03);
    }
    k.build();
    model.blade = k.mesh(g, bladeMat);
    if (model.meshes) model.meshes = collectMeshes(model.root);
  };

  // ---------------- little people: baddies, mini-bosses and friendly people ----------------
  var POINTY = { grump: 1, shield: 1, brute: 1, chief: 1, spark: 1, ember: 1 };
  var NO_EARS = { hood: 1, cloak: 1, knight: 1, pom: 1, shadehelm: 1, windturban: 1, shellhelm: 1, umbrella: 1, bloomhead: 1 };
  // builds a little person; spec: {type, size, look:{skin, cloth, hat, gear}, r, boss, friendly}
  function person(spec) {
    var L = spec.look, type = spec.type, size = spec.size;
    var root = new THREE.Group();
    var model = { root: root, kind: spec.friendly ? 'npc' : 'enemy', type: type };
    model.shadow = shadowBlob(root, spec.r * 1.15);
    var body = model.body = group(root, 0, 0, 0, 'body');
    body.scale.setScalar(size);
    var k = new Kit('person:' + type);
    var cloth = L.cloth, skin = L.skin;
    var pants = L.pants || shade(cloth, -0.18), bootC = L.boots || 0x4a3a2a, handC = L.hands || skin;
    // feet with little legs (their z is moved for walking)
    model.footL = group(body, -0.085, 0, 0.02, 'footL'); model.footR = group(body, 0.085, 0, 0.02, 'footR');
    [model.footL, model.footR].forEach(function (f) {
      k.add(f, GX.cyl(1, 0.85, 6), pants, 0, 0.11, 0, 0.042, 0.14, 0.044);
      k.add(f, sph(5), bootC, 0, 0.045, 0.025, 0.062, 0.05, 0.088);
      k.add(f, GX.box(), bootC, 0, 0.008, 0.022, 0.11, 0.016, 0.16);
    });
    // body
    var belly = spec.belly || 1;
    k.add(body, torso(6), cloth, 0, 0.1, 0, 0.17 * belly, 0.3, 0.15 * belly);
    k.add(body, skirt(6), cloth, 0, 0.22, 0, 0.185 * belly, 0.12, 0.162 * belly);
    if (L.belt !== false) {
      k.add(body, GX.cyl(1, 1, 8), L.belt || 0x5a3a20, 0, 0.21, 0, 0.176 * belly, 0.032, 0.156 * belly);
    }
    // head
    var head = model.head = group(body, 0, 0.5, 0, 'head');
    k.add(head, sph(10), skin, 0, 0, 0, 0.19, 0.18, 0.18);
    k.add(head, sph(6), skin, 0, -0.06, 0.03, 0.15, 0.11, 0.14);
    var DKF = L.brow || 0x2a1a10;
    var glowEye = L.glowEye || ((L.hat === 'cloak' || L.hat === 'wizard') ? 0xff6aff : 0);
    if (!NO_EARS[L.hat]) {
      if (POINTY[type]) k.pair(head, GX.cone(4), skin, 0.21, 0.02, -0.01, 0.045, 0.12, 0.028, 0, 0, -PI / 2 + 0.25);
      else if (L.hat === 'drop') k.pair(head, GX.cone(4), flat(0x4ab0f0), 0.2, 0.0, -0.02, 0.06, 0.11, 0.02, 0, 0, -PI / 2 + 0.4);
      else k.pair(head, sph(6), skin, 0.182, 0.0, 0, 0.03, 0.045, 0.03);
    }
    var eyeY = 0.02;
    k.pair(head, sph(5), 0xffffff, 0.068, eyeY, 0.15, 0.05, 0.055, 0.03);
    if (glowEye) k.pair(head, sph(4), basic(glowEye), 0.064, eyeY - 0.005, 0.176, 0.026, 0.032, 0.014);
    else k.pair(head, sph(4), DKF, 0.064, eyeY - 0.005, 0.176, 0.026, 0.032, 0.014);
    k.pair(head, GX.oct(), 0xffffff, 0.058, eyeY + 0.01, 0.189, 0.009, 0.01, 0.005);
    var browC = DKF;
    if (spec.friendly) k.pair(head, GX.box(), browC, 0.07, 0.09, 0.158, 0.075, 0.02, 0.022, 0, 0, -0.15);
    else k.pair(head, GX.box(), browC, 0.07, 0.085, 0.16, 0.08, 0.022, 0.022, 0, 0, 0.4);
    k.add(head, sph(4), skin, 0, -0.03, 0.18, 0.04, 0.035, 0.035);
    if (spec.friendly) {
      k.add(head, smile(), DKF, 0, -0.085, 0.158, 0.05, 0.035, 0.03, 0, 0, PI);
      
    } else {
      k.add(head, smile(), DKF, 0, -0.112, 0.162, 0.04, 0.026, 0.03);
      if (POINTY[type]) k.add(head, GX.cone(4), 0xffffff, 0.025, -0.095, 0.168, 0.012, 0.022, 0.01, PI, 0, 0);
    }
    // arms (hand at about (0, -0.12, 0.03) in the arm group)
    model.armL = group(body, -0.19, 0.335, 0, 'armL'); model.armR = group(body, 0.19, 0.335, 0, 'armR');
    [model.armL, model.armR].forEach(function (a) {
      k.add(a, GX.cyl(1, 0.8, 6), L.sleeve || cloth, 0, -0.05, 0, 0.048, 0.12, 0.05);
      k.add(a, sph(5), handC, 0, -0.12, 0.03, 0.052, 0.052, 0.052);
    });
    hat(k, L.hat, head, model, type);
    gear(k, L.gear, model);
    if (EXTRA[type]) EXTRA[type](k, model, body, head, L);
    k.build();
    model.torso = k.mesh(body, cloth);
    if (model.shieldWood) model.shieldMesh = k.mesh(model.armL, model.shieldWood);
    // status extras (not flashed)
    model.ice = part(GX.geo('md2:iceGeo', function () { return new THREE.IcosahedronGeometry(1, 0); }), 0x9fe8ff, 0, 0.36 * size, 0, 0.5 * size, 0.62 * size, 0.5 * size, root,
      { transparent: true, opacity: 0.5, depthWrite: false, flatShading: true, emissive: 0x1a4a5a });
    model.ice.visible = false; model.ice.userData.noFlash = true;
    model.bubble = part(sph(12), 0xbff6ff, 0, 0.35 * size, 0, 0.48 * size, 0.48 * size, 0.48 * size, root, { transparent: true, opacity: 0.32, depthWrite: false });
    var shine = part(sph(4), 0xffffff, -0.4, 0.45, 0.6, 0.12, 0.08, 0.05, model.bubble, { basic: true, transparent: true, opacity: 0.7 });
    shine.userData.noFlash = true;
    model.bubble.visible = false; model.bubble.userData.noFlash = true;
    model.stars = group(root, 0, 0.82 * size, 0);
    for (var s = 0; s < 3; s++) {
      var st = part(GX.oct(), 0xffe14a, Math.cos(s * 2.1) * 0.22, 0, Math.sin(s * 2.1) * 0.22, 0.05, 0.05, 0.05, model.stars, { emissive: 0x806000 });
      st.userData.noFlash = true;
    }
    model.stars.visible = false;
    model.size = size;
    model.meshes = collectMeshes(root);
    return model;
  }
  MD.enemy = function (type) {
    var def = SC.ENEMIES[type];
    return person({ type: type, look: def.look, r: def.r, size: def.size || (def.boss ? def.r * 3 : def.big ? 1.7 : 1), belly: BELLY[type] });
  };
  var BELLY = { brute: 1.15, chief: 1.2, brr: 1.15, g_fire: 1.18, g_surface: 1.32, g_earth: 1.22, g_water: 1.12, drizzle: 1.3, boulderback: 1.25, sparkhorn: 1.05 };

  function hat(k, kind, head, model, type) {
    var cone = GX.cone(8);
    switch (kind) {
      case 'none':
        k.add(head, GX.cone(5), 0x3a2a1a, 0, 0.2, 0, 0.05, 0.12, 0.05, -0.2, 0, 0);
        k.add(head, GX.cone(5), 0x3a2a1a, 0.05, 0.18, -0.02, 0.035, 0.09, 0.035, 0, 0, -0.5);
        k.add(head, GX.cone(5), 0x3a2a1a, -0.05, 0.18, -0.03, 0.035, 0.09, 0.035, 0, 0, 0.5);
        break;
      case 'hood':
        k.add(head, sph(8), 0xd23b3b, 0, 0.03, -0.06, 0.215, 0.205, 0.2);
        k.add(head, band(), shade(0xd23b3b, -0.08), 0, 0.01, 0.1, 0.19, 0.19, 0.3);
        k.add(head, tube('hoodtip', [[0, 0.15, -0.12], [0, 0.22, -0.2], [0, 0.2, -0.32], [0, 0.12, -0.38]], 0.09, 0, 8), 0xd23b3b, 0, 0, 0, 1, 1, 1);
        break;
      case 'helmet':
        k.add(head, dome(8), steel(0x4a6fd1), 0, 0.04, 0, 0.205, 0.17, 0.205);
        k.add(head, band(), gold(0xffd23f), 0, 0.04, 0, 0.207, 0.207, 0.2, PI / 2, 0, 0);
        k.add(head, GX.box(), gold(0xffd23f), 0, 0.17, -0.01, 0.03, 0.09, 0.24);
        k.add(head, GX.box(), steel(0x4a6fd1), 0, 0.0, 0.2, 0.024, 0.07, 0.016);
        break;
      case 'drop':
        k.add(head, tube('drop', [[0, 0.14, 0], [0, 0.23, 0], [0, 0.32, -0.02], [0, 0.4, -0.06]], 0.12, 0, 10), GX.mat(0x5ac8ff, { transparent: true, opacity: 0.85 }), 0, 0, 0, 1, 1, 1);
        k.add(head, sph(8), GX.mat(0x5ac8ff, { transparent: true, opacity: 0.85 }), 0, 0.15, 0, 0.12, 0.08, 0.12);
        break;
      case 'pom':
        k.add(head, dome(8), 0x7ab8ff, 0, 0.05, -0.005, 0.2, 0.2, 0.2);
        k.add(head, band(), 0xffffff, 0, 0.06, 0, 0.2, 0.2, 0.45, PI / 2, 0, 0);
        k.add(head, sph(8), flat(0xffffff), 0, 0.27, -0.01, 0.07, 0.07, 0.07);
        k.add(head, band(), 0xff5a5a, 0, -0.16, 0.0, 0.15, 0.14, 0.6, PI / 2, 0, 0);
        k.add(head, GX.box(), 0xff5a5a, 0.09, -0.22, 0.11, 0.05, 0.12, 0.02, 0.2, 0, 0.15);
        break;
      case 'horns':
        var hg = tube('ehorn', [[0.15, 0.1, 0], [0.22, 0.16, 0.0], [0.25, 0.25, 0.02], [0.23, 0.33, 0.05]], 0.045, 0, 7);
        var hm = shiny(0xf2ead8, { spec: 0x444444, sh: 30 });
        k.add(head, hg, hm, 0, 0, 0, 1, 1, 1); k.add(head, hg, hm, 0, 0, 0, -1, 1, 1);
        break;
      case 'spiky':
        var sm = glow(0xffc81a, 0x6a4a00);
        for (var i = 0; i < 7; i++) {
          var a = i / 7 * TAU;
          k.add(head, GX.cone(5), sm, Math.cos(a) * 0.1, 0.17, Math.sin(a) * 0.1 - 0.03, 0.05, 0.17, 0.05, Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
        }
        k.add(head, GX.cone(5), sm, 0, 0.21, -0.02, 0.055, 0.2, 0.055);
        break;
      case 'cloak':
        k.add(head, sph(8), 0x2c1f4a, 0, 0.03, -0.055, 0.225, 0.215, 0.215);
        k.add(head, band(), 0x3c2c60, 0, 0.0, 0.1, 0.2, 0.2, 0.35);
        k.add(head, tube('cloaktip', [[0, 0.16, -0.12], [0, 0.26, -0.18], [0, 0.3, -0.28], [0, 0.26, -0.36]], 0.1, 0, 8), 0x2c1f4a, 0, 0, 0, 1, 1, 1);
        break;
      case 'flame':
        var f1 = glow(0xff7a1a, 0xc04000), f2 = glow(0xffd23f, 0xa07000);
        k.add(head, GX.cone(6), f1, -0.08, 0.2, -0.02, 0.07, 0.2, 0.07, 0, 0, 0.3);
        k.add(head, GX.cone(6), f1, 0.08, 0.2, -0.02, 0.07, 0.2, 0.07, 0, 0, -0.3);
        k.add(head, GX.cone(6), f1, 0, 0.22, -0.07, 0.08, 0.24, 0.08, -0.3, 0, 0);
        k.add(head, GX.cone(6), f2, 0, 0.25, 0.0, 0.07, 0.26, 0.07);
        break;
      case 'crown':
        var cm = gold(0xffc83a);
        k.add(head, GX.cyl(1, 1.05, 12), cm, 0, 0.18, 0, 0.135, 0.08, 0.135);
        for (var c = 0; c < 6; c++) {
          var ca = c / 6 * TAU;
          k.add(head, GX.cone(4), cm, Math.cos(ca) * 0.125, 0.25, Math.sin(ca) * 0.125, 0.03, 0.08, 0.03);
          k.add(head, sph(6), glow(0xff3a5a, 0x600010), Math.sin(ca) * 0.137, 0.17, Math.cos(ca) * 0.137, 0.017, 0.017, 0.012, 0, ca, 0);
        }
        break;
      case 'captain':
        k.add(head, sph(10), 0x1a1a3a, 0, 0.17, 0, 0.31, 0.11, 0.12);
        k.add(head, band(), gold(0xffd23f), 0, 0.165, 0, 0.3, 0.1, 0.15);
        k.add(head, GX.oct(), 0xffffff, 0, 0.19, 0.115, 0.04, 0.045, 0.015);
        break;
      case 'knight':
        k.add(head, sph(12), steel(0x9a9ab8), 0, 0.02, 0, 0.215, 0.205, 0.215);
        k.add(head, GX.box(), basic(0xfff27a), 0, 0.02, 0.2, 0.25, 0.03, 0.04);
        k.add(head, GX.box(), steel(0x7a7a98), 0, -0.07, 0.19, 0.12, 0.04, 0.04);
        k.add(head, tube('kplume', [[0, 0.2, 0.04], [0, 0.29, -0.02], [0, 0.3, -0.12], [0, 0.22, -0.24], [0, 0.1, -0.3]], 0.05, 0.02, 7), glow(0xffe14a, 0x605000), 0, 0, 0, 1, 1, 1);
        break;
      case 'wizard':
        k.add(head, GX.cyl(1, 1, 16), 0x3a1f6a, 0, 0.15, 0, 0.3, 0.02, 0.3);
        k.add(head, tube('gloomohat', [[0, 0, 0], [0, 0.2, -0.02], [0, 0.38, -0.08], [0, 0.5, -0.2], [0, 0.53, -0.32]], 0.17, 0, 10), 0x3a1f6a, 0, 0.15, 0, 1, 1, 1);
        k.add(head, band(), 0x6a3aaa, 0, 0.17, 0, 0.165, 0.165, 0.25, PI / 2, 0, 0);
        k.add(head, GX.oct(), glow(0xffe14a, 0x806000), 0, 0.3, 0.12, 0.045, 0.045, 0.02);
        break;
      case 'traveller':
        var TH = 0x4a7a3a;
        k.add(head, GX.cyl(1, 1, 16), TH, 0, 0.13, 0, 0.3, 0.018, 0.3);
        k.add(head, GX.cyl(0.8, 1, 12), TH, 0, 0.2, 0, 0.16, 0.13, 0.16);
        k.add(head, GX.cyl(1, 1, 12), 0xd8a040, 0, 0.165, 0, 0.165, 0.035, 0.165);
        k.add(head, tube('feather', [[0.12, 0.17, -0.02], [0.17, 0.25, -0.08], [0.19, 0.33, -0.17]], 0.025, 0.0, 5), 0xff5a5a, 0, 0, 0, 1, 1, 1);
        k.add(head, sph(8), 0x6a3a1a, 0, -0.02, -0.1, 0.18, 0.13, 0.1);
        break;
      case 'smith':
        k.add(head, sph(10), 0x2a1a10, 0, 0.06, -0.03, 0.19, 0.16, 0.17);
        k.add(head, band(), 0xd23b3b, 0, 0.1, 0, 0.19, 0.18, 0.4, PI / 2.3, 0, 0);
        break;
      // ---- the new mini-bosses ----
      case 'umbrella':    // King Drizzle: frog eyes on top, a little gold crown and a rain umbrella
        k.pair(head, sph(8), 0x6ac87a, 0.09, 0.15, 0.04, 0.075, 0.075, 0.075);
        k.pair(head, sph(6), 0xffffff, 0.09, 0.17, 0.095, 0.048, 0.048, 0.03);
        k.pair(head, sph(4), 0x1a1a2a, 0.09, 0.17, 0.122, 0.024, 0.024, 0.01);
        var ucm = gold(0xffd23f);
        k.add(head, GX.cyl(1, 1.05, 10), ucm, 0, 0.21, -0.05, 0.08, 0.04, 0.08);
        for (var uc = 0; uc < 5; uc++) { var uca = uc / 5 * TAU; k.add(head, GX.cone(4), ucm, Math.cos(uca) * 0.075, 0.26, -0.05 + Math.sin(uca) * 0.075, 0.02, 0.06, 0.02); }
        k.add(head, GX.cyl(1, 1, 6), 0x6a4a2a, -0.18, 0.38, -0.08, 0.012, 0.62, 0.012, 0, 0, 0.25);
        k.add(head, GX.cone(12), flat(0x3a8ad8), -0.26, 0.72, -0.08, 0.42, 0.16, 0.42, 0, 0, 0.25);
        k.add(head, GX.cone(12), flat(0xffd23f), -0.255, 0.735, -0.08, 0.2, 0.08, 0.2, 0, 0.3, 0.25);
        break;
      case 'ramhorns':    // Sparkhorn: big curly ram horns with sparks, a woolly top
        var rh = tube('ramhorn', [[0.13, 0.1, 0], [0.23, 0.17, -0.04], [0.29, 0.07, -0.12], [0.24, -0.04, -0.07], [0.21, 0.0, 0.03]], 0.055, 0.022, 8);
        var rhm = shiny(0xd8c8a0, { spec: 0x444444, sh: 30 });
        k.add(head, rh, rhm, 0, 0, 0, 1, 1, 1); k.add(head, rh, rhm, 0, 0, 0, -1, 1, 1);
        k.add(head, sph(8), 0xf8f0e0, 0, 0.14, 0.0, 0.17, 0.08, 0.15);
        k.pair(head, sph(5), glow(0xfff27a, 0x806000), 0.21, 0.02, 0.04, 0.03, 0.03, 0.03);
        break;
      case 'rockhat':     // Boulderback: red boulders on top with moss and a tiny cactus
        k.add(head, GX.dodec(), flat(0xa85a3a), 0, 0.16, -0.03, 0.2, 0.11, 0.18);
        k.add(head, GX.dodec(), flat(0x8a4a30), -0.1, 0.24, -0.02, 0.09, 0.08, 0.09, 0.4, 0, 0);
        k.add(head, sph(6), flat(0x6a9a3a), 0.06, 0.25, -0.05, 0.1, 0.03, 0.08);
        k.add(head, GX.cyl(1, 1, 6), flat(0x4a9a4a), 0.12, 0.3, 0.0, 0.025, 0.1, 0.025);
        k.add(head, GX.ico(), flat(0xff6a8a), 0.12, 0.36, 0.0, 0.02, 0.02, 0.02);
        break;
      case 'bloomhead':   // Snapjaw: a big flower face
        for (var bp = 0; bp < 8; bp++) { var bpa = bp / 8 * TAU; k.add(head, sph(6), flat(bp % 2 ? 0xff5ab0 : 0xff8ad8), Math.cos(bpa) * 0.25, Math.sin(bpa) * 0.25, -0.06, 0.15, 0.075, 0.04, 0, 0, bpa); }
        k.add(head, sph(8), flat(0xffd23f), 0, 0.2, -0.03, 0.07, 0.04, 0.07);
        k.add(head, GX.cone(5), flat(0x3a9a3a), 0, 0.27, -0.05, 0.03, 0.1, 0.03);
        break;
      // ---- temple guardians ----
      case 'lavacrown':   // a ring of hot rocks with flames
        for (var lc = 0; lc < 7; lc++) {
          var la = lc / 7 * TAU;
          k.add(head, GX.dodec(), flat(0x3a2a26), Math.cos(la) * 0.15, 0.16, Math.sin(la) * 0.15, 0.06, 0.08, 0.06, la, la, 0);
          k.add(head, GX.cone(5), glow(lc % 2 ? 0xff7a1a : 0xffc83a, lc % 2 ? 0xc04000 : 0xa07000), Math.cos(la) * 0.12, 0.27, Math.sin(la) * 0.12, 0.05, 0.17, 0.05);
        }
        k.add(head, GX.cone(6), glow(0xffe060, 0xa08000), 0, 0.33, 0, 0.07, 0.24, 0.07);
        break;
      case 'stormhorns':  // zig-zag lightning horns and a spiky tuft
        var yb = glow(0xffe14a, 0x806000);
        [-1, 1].forEach(function (s) {
          k.add(head, GX.box(), yb, s * 0.12, 0.19, 0, 0.04, 0.12, 0.04, 0, 0, -s * 0.5);
          k.add(head, GX.box(), yb, s * 0.17, 0.27, 0, 0.04, 0.1, 0.04, 0, 0, s * 0.6);
          k.add(head, GX.cone(4), yb, s * 0.16, 0.35, 0, 0.035, 0.09, 0.035, 0, 0, -s * 0.3);
        });
        for (var st = 0; st < 5; st++) k.add(head, GX.cone(4), 0x3a3a68, (st - 2) * 0.05, 0.19, -0.04, 0.04, 0.12, 0.04, -0.3, 0, (st - 2) * 0.3);
        break;
      case 'shellhelm':   // a little turtle-shell helmet
        k.add(head, dome(10), flat(0x3a7a4a), 0, 0.05, -0.01, 0.215, 0.17, 0.215);
        for (var sh = 0; sh < 6; sh++) { var sa = sh / 6 * TAU; k.add(head, GX.cyl(1, 1, 6), flat(0x5aa86a), Math.cos(sa) * 0.12, 0.17, Math.sin(sa) * 0.12, 0.05, 0.02, 0.05, Math.sin(sa) * 0.6, 0, -Math.cos(sa) * 0.6); }
        k.add(head, GX.cyl(1, 1, 6), flat(0x6ac87a), 0, 0.22, 0, 0.06, 0.02, 0.06);
        break;
      case 'icecrown':    // a crown of ice crystals
        var icm = shiny(0xbff4ff, { emi: 0x2a6a8a, flat: true, spec: 0xffffff, sh: 90 });
        for (var ic = 0; ic < 6; ic++) { var ia = ic / 6 * TAU; k.add(head, GX.oct(), icm, Math.cos(ia) * 0.13, 0.22, Math.sin(ia) * 0.13, 0.04, ic % 2 ? 0.12 : 0.17, 0.04, Math.sin(ia) * 0.3, 0, -Math.cos(ia) * 0.3); }
        k.add(head, GX.oct(), icm, 0, 0.3, -0.02, 0.05, 0.2, 0.05);
        k.add(head, band(), steel(0xd8e8f8), 0, 0.15, 0, 0.17, 0.17, 0.35, PI / 2, 0, 0);
        break;
      case 'bubblecrown': // a golden crown with bubbles on top
        var bcm = gold(0xffd23f);
        k.add(head, GX.cyl(1, 1.05, 12), bcm, 0, 0.18, 0, 0.14, 0.07, 0.14);
        for (var bc = 0; bc < 5; bc++) { var ba = bc / 5 * TAU; k.add(head, GX.cone(4), bcm, Math.cos(ba) * 0.13, 0.24, Math.sin(ba) * 0.13, 0.03, 0.07, 0.03); }
        var bub = GX.mat(0xdffcff, { transparent: true, opacity: 0.55, emissive: 0x1a4a5a });
        k.add(head, sph(10), bub, 0, 0.32, 0, 0.08, 0.08, 0.08); k.add(head, sph(8), bub, 0.07, 0.42, 0.02, 0.05, 0.05, 0.05); k.add(head, sph(8), bub, -0.04, 0.48, -0.02, 0.035, 0.035, 0.035);
        k.add(head, tube('foambeard', [[0, -0.07, 0.13], [0, -0.15, 0.15], [0, -0.23, 0.12]], 0.1, 0.02, 8), 0xf4ffff, 0, 0, 0, 1, 1, 1);
        break;
      case 'mossrock':    // a craggy rock head-top with moss and a little flower
        var rk = flat(0x8a7a62);
        k.add(head, GX.dodec(), rk, 0, 0.15, -0.02, 0.2, 0.12, 0.19);
        k.add(head, GX.dodec(), rk, 0.12, 0.1, -0.05, 0.08, 0.07, 0.08, 0.5, 0, 0);
        k.add(head, sph(8), flat(0x5a9a3a), 0, 0.23, -0.03, 0.15, 0.04, 0.13);
        k.add(head, GX.ico(), flat(0xffd23f), 0.06, 0.27, 0.02, 0.025, 0.025, 0.025);
        break;
      case 'windturban':  // a white turban with a feather and a jewel
        k.add(head, sph(10), 0xf4f8ff, 0, 0.12, -0.02, 0.21, 0.14, 0.2);
        k.add(head, band(), 0xd8eef8, 0, 0.12, 0, 0.2, 0.2, 0.6, PI / 2, 0, 0);
        k.add(head, GX.oct(), glow(0x7affc8, 0x2a8a5a), 0, 0.15, 0.2, 0.035, 0.045, 0.02);
        k.add(head, tube('wfeather', [[0.05, 0.2, 0.15], [0.09, 0.32, 0.1], [0.14, 0.42, 0.0]], 0.035, 0.0, 5), 0xa8f0c8, 0, 0, 0, 1, 1, 1);
        break;
      case 'leafcrown':   // a crown of leaves with a pink flower
        for (var lf = 0; lf < 8; lf++) { var lfa = lf / 8 * TAU; k.add(head, sph(5), flat(lf % 2 ? 0x4ab03a : 0x7ad84a), Math.cos(lfa) * 0.16, 0.16, Math.sin(lfa) * 0.16, 0.035, 0.1, 0.06, Math.sin(lfa) * 0.6, lfa, -Math.cos(lfa) * 0.6); }
        k.add(head, sph(8), glow(0xff8ad8, 0x6a1a4a), 0.1, 0.2, 0.1, 0.05, 0.05, 0.05);
        k.add(head, sph(6), glow(0xfff27a, 0x806000), 0.1, 0.2, 0.14, 0.02, 0.02, 0.02);
        k.add(head, tube('briarhair', [[0, 0.12, -0.12], [0, 0.0, -0.2], [0, -0.15, -0.22], [0, -0.3, -0.18]], 0.12, 0.05, 8), 0x2a6a2a, 0, 0, 0, 1, 1, 1);
        break;
      case 'shadehelm':   // a dark knight helmet with a violet visor and small horns
        k.add(head, sph(12), steel(0x3a2a52), 0, 0.02, 0, 0.215, 0.21, 0.215);
        k.add(head, GX.box(), basic(0xc08aff), 0, 0.02, 0.2, 0.22, 0.03, 0.04);
        var hm2 = tube('shorn', [[0.15, 0.12, 0], [0.22, 0.2, -0.02], [0.24, 0.3, -0.06]], 0.035, 0, 6);
        k.add(head, hm2, steel(0x241a38), 0, 0, 0, 1, 1, 1); k.add(head, hm2, steel(0x241a38), 0, 0, 0, -1, 1, 1);
        break;
    }
  }

  var H = [0, -0.12, 0.03]; // hand position inside an arm group
  function gear(k, kind, model) {
    var a = model.armR, b = model.armL, wood = 0x8a5a2b;
    switch (kind) {
      case 'stick':
        k.add(a, GX.cyl(0.8, 1, 6), flat(wood), 0, H[1] + 0.12, H[2] + 0.05, 0.025, 0.4, 0.025, 0.4, 0, 0);
        k.add(a, sph(6), flat(shade(wood, -0.08)), 0, H[1] + 0.27, H[2] + 0.12, 0.035, 0.035, 0.035);
        break;
      case 'sling':
        k.add(a, tube('sling', [[0, 0, 0], [0, -0.05, 0.05], [0, -0.04, 0.12], [0, 0.0, 0.17]], 0.01, 0.01, 4), 0x6a4a2a, 0, H[1], H[2], 1, 1, 1);
        k.add(a, sph(8), 0x8a6a42, 0, H[1], H[2] + 0.18, 0.045, 0.035, 0.04);
        k.add(a, GX.dodec(), flat(0x9a9a9a), 0, H[1] + 0.02, H[2] + 0.18, 0.03, 0.03, 0.03);
        k.add(model.body, sph(8), 0x8a6a42, 0.13, 0.17, 0.08, 0.05, 0.06, 0.04);
        break;
      case 'shield':
        model.shieldWood = flat(0x8a5a2b);
        k.add(b, GX.cyl(1, 1, 12), model.shieldWood, 0.04, -0.06, 0.16, 0.17, 0.03, 0.17, PI / 2, 0, 0);
        k.add(b, band(), steel(0x8a8a9a), 0.04, -0.06, 0.16, 0.17, 0.17, 0.25);
        k.add(b, GX.box(), steel(0x8a8a9a), 0.04, -0.06, 0.177, 0.3, 0.025, 0.01);
        k.add(b, GX.box(), steel(0x8a8a9a), 0.04, -0.06, 0.177, 0.025, 0.3, 0.01);
        k.add(b, sph(10), gold(0xffd23f), 0.04, -0.06, 0.18, 0.06, 0.06, 0.04);
        model.armL.position.set(-0.1, 0.32, 0.11);
        k.add(a, GX.cyl(1, 1, 6), flat(wood), 0, H[1] + 0.1, H[2] + 0.05, 0.022, 0.36, 0.022, 0.4, 0, 0);
        k.add(a, GX.cone(4), steel(), 0, H[1] + 0.29, H[2] + 0.13, 0.03, 0.08, 0.02, 0.4, 0, 0);
        break;
      case 'snowball':
        k.add(a, GX.ico(), flat(0xffffff), 0, H[1] + 0.02, H[2] + 0.06, 0.07, 0.07, 0.07);
        break;
      case 'sparks':
        model.orbit = group(model.body, 0, 0.3, 0, 'orbit');
        for (var i = 0; i < 3; i++) {
          k.add(model.orbit, sph(8), glow(0xfff27a, 0xffd000), Math.cos(i * 2.1) * 0.3, 0, Math.sin(i * 2.1) * 0.3, 0.04, 0.04, 0.04);
          k.add(model.orbit, GX.oct(), basic(0xffffff), Math.cos(i * 2.1 + 0.4) * 0.3, 0.05, Math.sin(i * 2.1 + 0.4) * 0.3, 0.025, 0.05, 0.025);
        }
        break;
      case 'dagger':
        k.add(a, bladeGeo('dagger', [[0, 1, 1], [0.7, 0.9, 0.9], [1, 0, 0.2]]), shiny(0xcfd8e3, { spec: 0xffffff, sh: 90, flat: true }), 0, H[1], H[2] + 0.07, 0.02, 0.008, 0.16);
        k.add(a, GX.box(), 0x6a3aa0, 0, H[1], H[2] + 0.06, 0.07, 0.015, 0.018);
        break;
      case 'ember':
        k.add(a, sph(8), glow(0xffb03a, 0xff6000), 0, H[1], H[2] + 0.04, 0.06, 0.06, 0.06);
        k.add(b, sph(8), glow(0xffb03a, 0xff6000), 0, H[1], H[2] + 0.04, 0.06, 0.06, 0.06);
        break;
      case 'club':
        k.add(a, GX.cyl(1, 0.45, 8), flat(0x7a4a2a), 0, H[1] + 0.15, H[2] + 0.06, 0.07, 0.44, 0.07, 0.4, 0, 0);
        for (var c = 0; c < 4; c++) k.add(a, GX.cone(4), steel(0x9a9aa8), Math.cos(c * 1.57) * 0.07, H[1] + 0.3, H[2] + 0.13 + Math.sin(c * 1.57) * 0.07, 0.022, 0.05, 0.022, 0.4 + Math.sin(c * 1.57) * 1.4, 0, -Math.cos(c * 1.57) * 1.4);
        break;
      case 'trident':
        var gm = gold(0xffd23f);
        k.add(a, GX.cyl(1, 1, 6), gm, 0, H[1] + 0.2, H[2], 0.02, 0.62, 0.02);
        k.add(a, GX.box(), gm, 0, H[1] + 0.5, H[2], 0.16, 0.025, 0.025);
        for (var t = -1; t <= 1; t++) k.add(a, GX.cone(4), gm, t * 0.07, H[1] + 0.56 + (t ? 0 : 0.03), H[2], 0.025, 0.12, 0.025);
        break;
      case 'icicle':
        k.add(a, GX.cone(6), shiny(0x9fe8ff, { emi: 0x1a4a5a, flat: true, opacity: 0.9, spec: 0xffffff, sh: 90 }), 0, H[1], H[2] + 0.2, 0.065, 0.36, 0.065, PI / 2, 0, 0);
        k.add(a, GX.cone(5), shiny(0xdff8ff, { emi: 0x1a4a5a, flat: true }), 0.04, H[1] + 0.03, H[2] + 0.08, 0.03, 0.12, 0.03, PI / 2 - 0.4, 0.3, 0);
        break;
      case 'lance':
        k.add(a, GX.cone(10), steel(0xd8d8e8), 0, H[1], H[2] + 0.38, 0.06, 0.62, 0.06, PI / 2, 0, 0);
        k.add(a, GX.cone(10), gold(0xffe14a), 0, H[1], H[2] + 0.09, 0.09, 0.1, 0.09, -PI / 2, 0, 0);
        k.add(a, GX.cyl(1, 1, 6), 0x5a3a2a, 0, H[1], H[2] - 0.02, 0.025, 0.14, 0.025, PI / 2, 0, 0);
        break;
      case 'staff':
        k.add(a, GX.cyl(0.8, 1, 6), flat(0x5a3a2a), 0, H[1] + 0.2, H[2], 0.022, 0.64, 0.022);
        k.add(a, sph(10), glow(0xb07aff, 0x6a2aaa), 0, H[1] + 0.56, H[2], 0.07, 0.07, 0.07);
        for (var s = 0; s < 3; s++) k.add(a, GX.cone(4), flat(0x5a3a2a), Math.cos(s * 2.1) * 0.05, H[1] + 0.54, H[2] + Math.sin(s * 2.1) * 0.05, 0.015, 0.1, 0.015, Math.sin(s * 2.1) * 0.5, 0, -Math.cos(s * 2.1) * 0.5);
        break;
      case 'hammer':
        k.add(a, GX.cyl(1, 1, 6), 0x7a5030, 0, H[1] + 0.05, H[2] + 0.04, 0.018, 0.26, 0.018, 0.4, 0, 0);
        k.add(a, GX.box(), steel(0x6a6a78), 0, H[1] + 0.16, H[2] + 0.09, 0.12, 0.06, 0.06, 0.4, 0, 0);
        break;
      // ---- temple guardians ----
      case 'lavafists':
      case 'rockfists':
        var lava = kind === 'lavafists';
        [a, b].forEach(function (arm) {
          k.add(arm, GX.dodec(), flat(lava ? 0x3a2622 : 0x8a7a62), 0, H[1] - 0.01, H[2] + 0.02, 0.1, 0.1, 0.1);
          k.add(arm, GX.box(), lava ? glow(0xff7a1a, 0xff4a00) : flat(0x5a9a3a), 0, H[1] + 0.03, H[2] + 0.1, 0.07, 0.025, 0.03, 0.3, 0, 0.4);
          k.add(arm, GX.dodec(), flat(lava ? 0x4a302a : 0x7a6a52), 0, -0.02, 0, 0.075, 0.06, 0.075);
        });
        break;
      case 'stormrod':
        k.add(a, GX.cyl(0.8, 1, 6), steel(0x5a5a78), 0, H[1] + 0.2, H[2], 0.022, 0.62, 0.022);
        k.add(a, sph(10), glow(0xfff27a, 0xffd000), 0, H[1] + 0.54, H[2], 0.07, 0.07, 0.07);
        k.add(a, GX.box(), glow(0xffe14a, 0x806000), 0.06, H[1] + 0.5, H[2], 0.03, 0.12, 0.02, 0, 0, 0.6);
        k.add(a, GX.box(), glow(0xffe14a, 0x806000), -0.06, H[1] + 0.58, H[2], 0.03, 0.12, 0.02, 0, 0, -0.6);
        break;
      case 'tidestaff':
        var cor = flat(0xff8a7a);
        k.add(a, GX.cyl(0.8, 1, 6), flat(0xe8d8b0), 0, H[1] + 0.2, H[2], 0.022, 0.62, 0.022);
        for (var tc = -1; tc <= 1; tc++) k.add(a, GX.cone(5), cor, tc * 0.07, H[1] + 0.56 + (tc ? 0 : 0.04), H[2], 0.03, 0.14, 0.03, 0, 0, -tc * 0.3);
        k.add(a, sph(8), GX.mat(0x6ad0ff, { emissive: 0x1a5a8a, transparent: true, opacity: 0.85 }), 0, H[1] + 0.48, H[2], 0.05, 0.05, 0.05);
        break;
      case 'iceblade':
        var ib = shiny(0xbff4ff, { emi: 0x2a6a8a, flat: true, opacity: 0.92, spec: 0xffffff, sh: 100 });
        k.add(a, bladeGeo('iceblade', [[0, 1, 1], [0.6, 0.95, 0.9], [0.9, 0.6, 0.5], [1, 0, 0.2]]), ib, 0, H[1], H[2] + 0.07, 0.04, 0.012, 0.42);
        k.add(a, GX.box(), steel(0xd8e8f8), 0, H[1], H[2] + 0.06, 0.13, 0.02, 0.025);
        break;
      case 'bubblewand':
        k.add(a, GX.cyl(0.8, 1, 6), gold(0xffd23f), 0, H[1] + 0.15, H[2] + 0.04, 0.018, 0.4, 0.018, 0.3, 0, 0);
        k.add(a, band(), gold(0xffd23f), 0, H[1] + 0.36, H[2] + 0.11, 0.08, 0.08, 0.25, 0.3, 0, 0);
        k.add(a, sph(12), GX.mat(0xdffcff, { transparent: true, opacity: 0.5, emissive: 0x1a4a5a }), 0, H[1] + 0.36, H[2] + 0.11, 0.07, 0.07, 0.07);
        break;
      case 'windfan':
        var fanM = GX.mat(0xe8fff4, { side: THREE.DoubleSide });
        k.add(a, GX.cyl(1, 1, 6), 0x6a5a4a, 0, H[1] + 0.08, H[2] + 0.04, 0.015, 0.2, 0.015, 0.3, 0, 0);
        for (var fn = 0; fn < 5; fn++) k.add(a, GX.box(), fn % 2 ? fanM : GX.mat(0xa8f0c8, { side: THREE.DoubleSide }), (fn - 2) * 0.05, H[1] + 0.25, H[2] + 0.09, 0.05, 0.24, 0.008, 0.3, 0, (fn - 2) * 0.28);
        break;
      case 'thornwhip':
        k.add(a, tube('thornwhip', [[0, 0, 0], [0.02, 0.05, 0.12], [0.0, 0.0, 0.26], [-0.05, -0.08, 0.36], [-0.04, -0.18, 0.42]], 0.018, 0.008, 5), flat(0x3a7a2a), 0, H[1], H[2], 1, 1, 1);
        for (var th2 = 0; th2 < 4; th2++) k.add(a, GX.cone(4), flat(0x8a3a6a), 0.02, H[1] + 0.02 - th2 * 0.02, H[2] + 0.1 + th2 * 0.08, 0.012, 0.04, 0.012, 0, 0, 1.2);
        k.add(b, sph(8), glow(0xff8ad8, 0x6a1a4a), 0, H[1], H[2] + 0.04, 0.05, 0.05, 0.05);
        break;
      case 'shadeblade':
        k.add(a, bladeGeo('shadeblade', [[0, 1, 1], [0.7, 0.9, 0.9], [1, 0, 0.2]]), shiny(0x6a4aaa, { emi: 0x3a1a7a, flat: true, spec: 0xc08aff, sh: 80 }), 0, H[1], H[2] + 0.07, 0.045, 0.012, 0.44);
        k.add(a, GX.box(), steel(0x241a38), 0, H[1], H[2] + 0.06, 0.14, 0.022, 0.025);
        k.add(a, sph(6), basic(0xc08aff), 0, H[1], H[2] - 0.02, 0.025, 0.025, 0.025);
        break;
    }
  }

  // type-specific clothes and details
  var EXTRA = {
    grump: function (k, m, body) { k.add(body, GX.box(), 0xa8783a, -0.08, 0.3, 0.14, 0.06, 0.06, 0.01, 0, 0, 0.3); },
    slinger: function (k, m, body) { k.add(body, skirt(10), 0xd23b3b, 0, 0.42, 0, 0.21, 0.12, 0.19); },
    splash: function (k, m, body, head) {
      k.add(body, sph(8), 0xbfe8ff, 0, 0.25, 0.12, 0.09, 0.1, 0.05);
      k.add(head, GX.cone(4), flat(0x4ab0f0), 0, 0.13, -0.16, 0.02, 0.1, 0.06, -0.6, 0, 0);
    },
    frost: function (k, m) { },
    brute: function (k, m, body, head) {
      k.pair(body, dome(8), steel(0x6a6a7a), 0.17, 0.38, 0, 0.1, 0.07, 0.1, 0, 0, -0.45);
      k.pair(head, GX.cone(5), 0xffffff, 0.06, -0.09, 0.15, 0.018, 0.05, 0.018, 0, 0, 0);
      k.add(head, sph(8), flat(0x3a3040), 0, 0.15, -0.04, 0.12, 0.06, 0.12);
      [m.armL, m.armR].forEach(function (a) { k.add(a, GX.cyl(1, 1, 8), 0x5a3a20, 0, -0.07, 0.01, 0.055, 0.05, 0.055); });
    },
    spark: function (k, m, body) {
      k.add(body, GX.box(), glow(0xfff27a, 0x806000), 0, 0.3, 0.15, 0.03, 0.09, 0.01, 0, 0, 0.5);
    },
    shadow: function (k, m, body) {
      var cape = G('scape', function () { return new THREE.CylinderGeometry(0.85, 1.3, 1, 10, 1, true, PI - 1.3, 2.6); });
      k.add(body, cape, GX.mat(0x2c1f4a, { side: THREE.DoubleSide }), 0, 0.22, 0, 0.19, 0.36, 0.17);
    },
    ember: function (k, m, body) {
      k.add(body, sph(8), glow(0xff8a2a, 0xc04000), 0, 0.3, 0.135, 0.05, 0.05, 0.03);
    },
    chief: function (k, m, body, head) {
      var cape = G('fcape', function () { return new THREE.CylinderGeometry(0.85, 1.25, 1, 10, 1, true, PI - 1.2, 2.4); });
      k.add(body, cape, flat(0x7a5a3a, { side: THREE.DoubleSide }), 0, 0.22, 0, 0.21, 0.34, 0.19);
      k.add(body, sph(10), flat(0x8a6a4a), 0, 0.4, 0, 0.21, 0.06, 0.17);
      for (var i = 0; i < 7; i++) {
        var a = (i - 3) * 0.3;
        k.add(body, i % 2 ? GX.cone(4) : sph(6), 0xfff4d8, Math.sin(a) * 0.15, 0.36 - Math.abs(i - 3) * -0.01, Math.cos(a) * 0.15, 0.02, i % 2 ? 0.04 : 0.02, 0.02, PI, 0, 0);
      }
      k.pair(head, GX.box(), 0xd84a3a, 0.11, -0.04, 0.13, 0.05, 0.012, 0.01, 0, 0.6, 0);
    },
    captain: function (k, m, body, head) {
      k.add(body, skirt(10), 0x1f4fa8, 0, 0.22, 0, 0.2, 0.18, 0.18);
      for (var i = 0; i < 3; i++) k.add(body, sph(6), gold(0xffd23f), 0, 0.27 + i * 0.05, 0.155, 0.014, 0.014, 0.01);
      k.pair(body, GX.cyl(1, 1, 10), gold(0xffd23f), 0.15, 0.39, 0, 0.06, 0.02, 0.06, 0, 0, -0.3);
      k.add(body, sph(8), 0xffffff, 0, 0.38, 0.11, 0.06, 0.05, 0.04);
      k.pair(head, sph(8), 0x1a2a5a, 0.04, -0.075, 0.17, 0.05, 0.016, 0.02, 0, 0, 0.3);
    },
    brr: function (k, m, body, head) {
      var FUR = flat(0xffffff);
      k.add(body, sph(10), FUR, 0, 0.36, 0, 0.21, 0.08, 0.18);
      for (var i = 0; i < 5; i++) k.add(body, GX.ico(), FUR, Math.cos(i * 1.3) * 0.15, 0.13 + (i % 2) * 0.03, Math.sin(i * 1.3) * 0.13, 0.06, 0.05, 0.06);
      k.pair(body, GX.cone(5), shiny(0x9fe8ff, { emi: 0x1a4a5a, flat: true }), 0.16, 0.42, -0.02, 0.03, 0.12, 0.03, 0, 0, -0.5);
      k.add(head, sph(10), FUR, 0, 0.11, -0.03, 0.16, 0.08, 0.15);
    },
    zap: function (k, m, body) {
      var ST = steel(0x8a8aa8);
      k.add(body, torso(10), ST, 0, 0.2, 0.004, 0.18, 0.21, 0.16);
      k.pair(body, dome(8), ST, 0.17, 0.38, 0, 0.1, 0.08, 0.1, 0, 0, -0.45);
      k.add(body, GX.box(), glow(0xffe14a, 0x806000), 0, 0.33, 0.165, 0.03, 0.1, 0.01, 0, 0, 0.5);
      [m.footL, m.footR].forEach(function (f) { k.add(f, sph(6), ST, 0, 0.11, 0.035, 0.05, 0.04, 0.04); });
    },
    gloomo: function (k, m, body, head) {
      k.add(body, skirt(12), 0x3a1f6a, 0, 0.25, 0, 0.22, 0.25, 0.2);
      k.add(body, GX.cyl(1, 0.8, 12), 0x5a2f9a, 0, 0.41, -0.02, 0.17, 0.08, 0.15);
      for (var i = 0; i < 5; i++) k.add(body, GX.oct(), glow(0xffe14a, 0x806000), Math.cos(i * 1.4) * 0.19, 0.06 + i * 0.03, Math.sin(i * 1.4) * 0.17, 0.018, 0.018, 0.018);
      k.add(head, tube('gbeard', [[0, -0.06, 0.13], [0, -0.15, 0.15], [0, -0.25, 0.13], [0, -0.32, 0.1]], 0.1, 0.0, 8), 0xe8e0f0, 0, 0, 0, 1, 1, 1);
    },
    // ---- the new mini-bosses ----
    drizzle: function (k, m, body) {
      k.add(body, sph(10), 0xd8f0a0, 0, 0.22, 0.07, 0.16, 0.17, 0.1);
      var dcape = G('dcape', function () { return new THREE.CylinderGeometry(0.85, 1.3, 1, 10, 1, true, PI - 1.3, 2.6); });
      k.add(body, dcape, GX.mat(0x2a6ab8, { side: THREE.DoubleSide }), 0, 0.22, 0, 0.21, 0.36, 0.19);
      k.pair(body, sph(8), gold(0xffd23f), 0.16, 0.4, 0.02, 0.05, 0.04, 0.05);
      [m.footL, m.footR].forEach(function (f) { k.add(f, sph(6), 0x5ab86a, 0, 0.01, 0.06, 0.09, 0.025, 0.11); });
      m.orbit = group(body, 0, 1.0, 0, 'orbit');
      for (var i = 0; i < 3; i++) k.add(m.orbit, sph(6), GX.mat(0x6ad0ff, { transparent: true, opacity: 0.85, emissive: 0x1a5a8a }), Math.cos(i * 2.1) * 0.32, 0, Math.sin(i * 2.1) * 0.32, 0.035, 0.055, 0.035);
    },
    sparkhorn: function (k, m, body) {
      var ST = steel(0x6a6a88);
      k.add(body, torso(10), ST, 0, 0.2, 0.004, 0.18, 0.21, 0.16);
      k.pair(body, dome(8), ST, 0.17, 0.38, 0, 0.1, 0.08, 0.1, 0, 0, -0.45);
      k.add(body, GX.box(), glow(0xffe14a, 0x806000), 0, 0.3, 0.165, 0.035, 0.12, 0.01, 0, 0, 0.5);
      k.add(body, GX.box(), glow(0xffe14a, 0x806000), 0.03, 0.22, 0.165, 0.035, 0.08, 0.01, 0, 0, -0.5);
      k.add(body, sph(8), 0xf8f0e0, 0, 0.43, -0.06, 0.2, 0.08, 0.15);
      [m.footL, m.footR].forEach(function (f) { k.add(f, GX.cyl(1, 1, 6), 0x2a2a30, 0, 0.03, 0.02, 0.07, 0.05, 0.08); });
      m.orbit = group(body, 0, 0.3, 0, 'orbit');
      for (var i = 0; i < 3; i++) k.add(m.orbit, GX.oct(), basic(0xfff27a), Math.cos(i * 2.1) * 0.33, 0.05 * i, Math.sin(i * 2.1) * 0.33, 0.03, 0.06, 0.03);
    },
    boulderback: function (k, m, body, head) {
      var rk = flat(0xa85a3a), rk2 = flat(0x8a4a30);
      k.pair(body, GX.dodec(), rk, 0.19, 0.42, 0, 0.12, 0.1, 0.12, 0.3, 0.5, 0);
      k.add(body, GX.dodec(), rk2, 0, 0.32, -0.16, 0.17, 0.17, 0.09, 0.2, 0, 0);
      k.add(body, GX.dodec(), rk, 0.06, 0.46, -0.14, 0.09, 0.08, 0.07);
      k.add(body, sph(6), flat(0x6a9a3a), -0.05, 0.48, -0.14, 0.08, 0.03, 0.06);
      k.add(head, GX.box(), flat(0x5a2a10), 0, -0.08, 0.17, 0.12, 0.03, 0.03);
      k.pair(head, GX.cone(4), 0xfff8e8, 0.06, -0.1, 0.165, 0.02, 0.05, 0.02, PI, 0, 0);
    },
    snapjaw: function (k, m, body) {
      for (var i = 0; i < 9; i++) { var a = i / 9 * TAU; k.add(body, sph(6), flat(i % 2 ? 0x3a9a3a : 0x6ad04a), Math.sin(a) * 0.19, 0.12, Math.cos(a) * 0.17, 0.07, 0.17, 0.035, 0.4 * Math.cos(a), a, 0); }
      k.add(body, tube('snapvine', [[-0.15, 0.4, 0.1], [0, 0.32, 0.16], [0.15, 0.22, 0.1]], 0.02, 0.02, 5), flat(0x2a6a2a), 0, 0, 0, 1, 1, 1);
      [m.armL, m.armR].forEach(function (a2) { k.add(a2, sph(6), flat(0x4ab03a), 0, -0.13, 0.05, 0.08, 0.04, 0.1); });
      m.orbit = group(body, 0, 0.55, 0, 'orbit');
      for (var j = 0; j < 3; j++) k.add(m.orbit, sph(6), glow(0xfff27a, 0x806000), Math.cos(j * 2.1) * 0.36, 0.06 * j, Math.sin(j * 2.1) * 0.36, 0.035, 0.035, 0.035);
    },
    // ---- temple guardians ----
    g_fire: function (k, m, body) {
      var hot = glow(0xff7a1a, 0xff4a00), rk = flat(0x4a302a);
      [[-0.07, 0.28, 0.16, 0.4], [0.06, 0.2, 0.16, -0.5], [0.0, 0.35, 0.165, 0.1], [0.12, 0.3, 0.12, 1.1], [-0.12, 0.18, 0.12, -1.2]].forEach(function (c) { k.add(body, GX.box(), hot, c[0], c[1], c[2], 0.018, 0.09, 0.012, 0, 0, c[3]); });
      k.pair(body, GX.dodec(), rk, 0.17, 0.4, 0, 0.11, 0.09, 0.11, 0.4, 0.2, 0);
      k.pair(body, GX.cone(5), glow(0xffb03a, 0xff6a00), 0.17, 0.5, 0, 0.04, 0.12, 0.04);
      k.add(body, GX.dodec(), rk, 0, 0.36, -0.13, 0.13, 0.12, 0.08);
    },
    g_lightning: function (k, m, body) {
      var wing = GX.mat(0x4a4a8a, { side: THREE.DoubleSide, flatShading: true });
      k.pair(body, GX.cone(3), wing, 0.16, 0.4, -0.12, 0.05, 0.24, 0.12, 0.2, 0.6, -0.9);
      k.add(body, GX.box(), glow(0xffe14a, 0x806000), 0, 0.3, 0.155, 0.035, 0.12, 0.012, 0, 0, 0.5);
      k.add(body, GX.box(), glow(0xffe14a, 0x806000), 0.03, 0.22, 0.155, 0.035, 0.08, 0.012, 0, 0, -0.5);
      k.add(body, tube('imptail', [[0, 0.15, -0.12], [0, 0.1, -0.25], [0.05, 0.16, -0.36], [0.05, 0.26, -0.4]], 0.025, 0.01, 5), 0x3a3a68, 0, 0, 0, 1, 1, 1);
      k.add(body, GX.cone(4), glow(0xffe14a, 0x806000), 0.05, 0.27, -0.42, 0.04, 0.07, 0.02, 0.5, 0, 0);
      m.orbit = group(body, 0, 0.3, 0, 'orbit');
      for (var i = 0; i < 3; i++) k.add(m.orbit, GX.oct(), basic(0xfff27a), Math.cos(i * 2.1) * 0.32, 0.05 * i, Math.sin(i * 2.1) * 0.32, 0.03, 0.06, 0.03);
    },
    g_water: function (k, m, body) {
      var shell = flat(0x2f7a4a), rim = flat(0xd8c890);
      k.add(body, dome(10), shell, 0, 0.18, -0.06, 0.24, 0.3, 0.2, -PI / 2, 0, 0);
      for (var i = 0; i < 5; i++) k.add(body, GX.cyl(1, 1, 6), flat(0x4aa86a), (i - 2) * 0.08, 0.2 + (i % 2) * 0.08, -0.25, 0.05, 0.02, 0.05, PI / 2, 0, 0);
      k.add(body, GX.box(), rim, 0, 0.25, 0.155, 0.2, 0.22, 0.012);
      for (var j = 0; j < 3; j++) k.add(body, GX.box(), flat(0xb8a870), 0, 0.17 + j * 0.07, 0.163, 0.18, 0.008, 0.006);
    },
    g_ice: function (k, m, body) {
      var ice = shiny(0xbff4ff, { emi: 0x2a6a8a, flat: true, spec: 0xffffff, sh: 90 });
      k.add(body, torso(10), steel(0xd8e8f8), 0, 0.2, 0.004, 0.18, 0.21, 0.16);
      k.pair(body, GX.oct(), ice, 0.17, 0.44, 0, 0.05, 0.13, 0.05, 0, 0, -0.5);
      k.pair(body, GX.oct(), ice, 0.2, 0.4, -0.04, 0.035, 0.09, 0.035, 0, 0, -0.9);
      var cape = G('icecape', function () { return new THREE.CylinderGeometry(0.85, 1.3, 1, 10, 1, true, PI - 1.3, 2.6); });
      k.add(body, cape, GX.mat(0xf4fbff, { side: THREE.DoubleSide }), 0, 0.22, 0, 0.2, 0.36, 0.18);
      k.add(body, GX.oct(), basic(0x8fe8ff), 0, 0.32, 0.17, 0.035, 0.05, 0.015);
    },
    g_surface: function (k, m, body) {
      k.add(body, sph(10), 0xc8f8ff, 0, 0.2, 0.06, 0.17, 0.16, 0.13);
      var cape = G('bubcape', function () { return new THREE.CylinderGeometry(0.85, 1.3, 1, 10, 1, true, PI - 1.4, 2.8); });
      k.add(body, cape, GX.mat(0x2a7ab8, { side: THREE.DoubleSide }), 0, 0.22, 0, 0.23, 0.36, 0.21);
      k.pair(body, sph(8), gold(0xffd23f), 0.17, 0.4, 0, 0.06, 0.04, 0.06);
      m.orbit = group(body, 0, 0.35, 0, 'orbit');
      var bub = GX.mat(0xdffcff, { transparent: true, opacity: 0.45, emissive: 0x1a4a5a });
      for (var i = 0; i < 4; i++) k.add(m.orbit, sph(10), bub, Math.cos(i * 1.57) * 0.36, 0.08 * (i % 2), Math.sin(i * 1.57) * 0.36, 0.06 + (i % 2) * 0.03, 0.06 + (i % 2) * 0.03, 0.06 + (i % 2) * 0.03);
    },
    g_earth: function (k, m, body, head) {
      var rk = flat(0x7a6a52), moss = flat(0x5a9a3a);
      k.pair(body, GX.dodec(), rk, 0.18, 0.42, 0, 0.13, 0.11, 0.13, 0.3, 0.5, 0);
      k.pair(body, sph(6), moss, 0.18, 0.5, 0, 0.1, 0.03, 0.09);
      k.add(body, GX.dodec(), rk, 0, 0.3, -0.15, 0.15, 0.16, 0.08, 0.2, 0, 0);
      k.add(body, sph(8), moss, 0.05, 0.36, 0.15, 0.07, 0.05, 0.02);
      for (var i = 0; i < 3; i++) k.add(body, GX.ico(), flat(0xffd23f), -0.08 + i * 0.03, 0.42 + i * 0.01, 0.13, 0.015, 0.015, 0.015);
      k.add(head, GX.box(), flat(0x6a5a40), 0, -0.08, 0.17, 0.12, 0.03, 0.03);
    },
    g_wind: function (k, m, body) {
      var mist = GX.mat(0xe8fff8, { transparent: true, opacity: 0.6, depthWrite: false });
      k.add(body, GX.cone(10), mist, 0, 0.0, 0, 0.18, 0.3, 0.18, PI, 0, 0);
      k.add(body, GX.torus(), GX.mat(0xbff5ff, { transparent: true, opacity: 0.7, depthWrite: false }), 0, 0.1, 0, 0.2, 0.2, 0.5, PI / 2, 0, 0);
      k.add(body, GX.torus(), GX.mat(0xffffff, { transparent: true, opacity: 0.6, depthWrite: false }), 0, -0.02, 0, 0.14, 0.14, 0.5, PI / 2, 0, 0);
      k.add(body, band(), 0xa8f0c8, 0, 0.42, 0, 0.16, 0.16, 0.6, PI / 2.2, 0, 0);
      k.add(body, tube('gscarf', [[0.1, 0.42, -0.1], [0.18, 0.4, -0.25], [0.3, 0.44, -0.36]], 0.04, 0.01, 6), 0xa8f0c8, 0, 0, 0, 1, 1, 1);
      [m.footL, m.footR].forEach(function (f) { f.visible = false; });
    },
    g_life: function (k, m, body) {
      for (var i = 0; i < 9; i++) { var a = i / 9 * TAU; k.add(body, sph(6), flat(i % 2 ? 0x3a9a3a : 0x6ad04a), Math.sin(a) * 0.19, 0.15, Math.cos(a) * 0.17, 0.06, 0.16, 0.03, 0.4 * Math.cos(a), a, 0); }
      for (var j = 0; j < 4; j++) { var b2 = j / 4 * TAU + 0.4; k.add(body, sph(6), glow(j % 2 ? 0xff8ad8 : 0xfff27a, j % 2 ? 0x6a1a4a : 0x806000), Math.sin(b2) * 0.18, 0.3 + j * 0.03, Math.cos(b2) * 0.15, 0.03, 0.03, 0.03); }
      k.add(body, tube('vinesash', [[-0.15, 0.4, 0.1], [0, 0.32, 0.16], [0.15, 0.22, 0.1]], 0.02, 0.02, 5), flat(0x2a6a2a), 0, 0, 0, 1, 1, 1);
    },
    g_death: function (k, m, body) {
      var cape = G('shadecape', function () { return new THREE.CylinderGeometry(0.85, 1.35, 1, 10, 1, true, PI - 1.4, 2.8); });
      k.add(body, cape, GX.mat(0x1a1228, { side: THREE.DoubleSide }), 0, 0.2, 0, 0.21, 0.4, 0.19);
      k.add(body, torso(10), steel(0x3a2a52), 0, 0.2, 0.004, 0.18, 0.21, 0.16);
      k.pair(body, dome(8), steel(0x2a1c40), 0.17, 0.38, 0, 0.1, 0.08, 0.1, 0, 0, -0.45);
      k.pair(body, GX.cone(4), steel(0x241a38), 0.2, 0.46, 0, 0.03, 0.1, 0.03, 0, 0, -0.5);
      k.add(body, GX.oct(), basic(0xc08aff), 0, 0.32, 0.17, 0.03, 0.05, 0.012);
      m.orbit = group(body, 0, 0.3, 0, 'orbit');
      for (var i = 0; i < 3; i++) k.add(m.orbit, sph(8), GX.mat(0x9b4dff, { additive: true, basic: true, opacity: 0.7 }), Math.cos(i * 2.1) * 0.34, 0.06 * i, Math.sin(i * 2.1) * 0.34, 0.045, 0.045, 0.045);
    },
    trader: function (k, m, body, head) {
      // big backpack full of goods, coin pouch, scarf
      var PACK = 0x9a6a3a;
      k.add(body, GX.box(), PACK, 0, 0.33, -0.21, 0.28, 0.32, 0.16);
      k.add(body, halfCyl(), shade(PACK, 0.06), 0, 0.49, -0.21, 0.08, 0.28, 0.14, 0, 0, PI / 2);
      k.add(body, GX.box(), shade(PACK, -0.1), 0, 0.27, -0.295, 0.2, 0.12, 0.02);
      k.add(body, GX.cyl(1, 1, 10), 0x3aa0d8, 0, 0.6, -0.21, 0.07, 0.24, 0.07, 0, 0, PI / 2);
      k.add(body, GX.cyl(1, 1, 8), 0xd8483a, 0.17, 0.5, -0.24, 0.05, 0.12, 0.05);
      k.add(body, GX.cyl(1, 1, 8), 0x8a5a2b, -0.15, 0.55, -0.22, 0.025, 0.3, 0.025, 0, 0, 0.2);
      k.add(body, sph(8), 0xffd23f, -0.17, 0.72, -0.2, 0.05, 0.05, 0.05);
      k.add(body, band(), 0x7a4a2a, 0, 0.13, -0.21, 0.08, 0.06, 0.3, 0, PI / 2, 0);
      k.pair(body, GX.box(), 0x6a4020, 0.1, 0.3, 0.0, 0.025, 0.3, 0.33, 0, 0, 0.05);
      k.add(body, sph(6), 0xc8963a, -0.13, 0.15, 0.1, 0.06, 0.07, 0.05);
      k.add(body, GX.cyl(1, 1, 8), gold(0xffd23f), -0.13, 0.21, 0.1, 0.03, 0.015, 0.03);
      k.add(body, GX.cyl(1, 1, 8), gold(0xffd23f), -0.06, 0.12, 0.13, 0.025, 0.008, 0.025, PI / 2, 0, 0);
      k.add(body, band(), 0xf0c040, 0, 0.4, 0, 0.13, 0.12, 0.5, PI / 2, 0, 0);
    },
    smith: function (k, m, body, head) {
      // leather apron, rolled sleeves, beard
      var APR = 0x6a4428;
      k.add(body, GX.box(), APR, 0, 0.22, 0.158, 0.22, 0.32, 0.012);
      k.add(body, GX.box(), shade(APR, -0.08), 0, 0.3, 0.166, 0.08, 0.06, 0.008);
      k.pair(body, GX.box(), APR, 0.09, 0.36, 0.0, 0.02, 0.012, 0.3, 0, 0, 0);
      [m.armL, m.armR].forEach(function (a) { k.add(a, band(), 0xe8d8b8, 0, -0.05, 0.0, 0.05, 0.05, 0.4, PI / 2, 0, 0); });
      k.add(head, sph(10), 0x6a3a1a, 0, -0.1, 0.1, 0.13, 0.08, 0.07);
      k.add(head, sph(8), 0x6a3a1a, 0, -0.045, 0.17, 0.07, 0.02, 0.025);
    }
  };

  // ---------------- friendly people (trader, smith) ----------------
  var NPC = {
    trader: { skin: 0xf2c49b, cloth: 0x3a9a5a, pants: 0x6a4a2a, boots: 0x5a3a20, hat: 'traveller', gear: 'none', brow: 0x6a3a1a, belt: 0x6a4020 },
    smith: { skin: 0xd8a070, cloth: 0xe8d8b8, sleeve: 0xd89a6a, pants: 0x4a4a5a, boots: 0x3a2a1a, hat: 'smith', gear: 'hammer', brow: 0x4a2a10, belt: 0x5a3a20 }
  };
  MD.npc = function (role) {
    var r = NPC[role] ? role : 'trader';
    var L = NPC[r];
    if (r === 'smith') L.hands = L.skin;
    return person({ type: r, look: L, r: 0.3, size: 1.45, friendly: true });
  };

  // ---------------- the Dragon ----------------
  MD.dragon = function () {
    var root = new THREE.Group();
    var model = { root: root, kind: 'dragon' };
    model.shadow = shadowBlob(root, 1.9);
    var body = model.body = group(root, 0, 0, 0, 'body');
    var RED = 0xc8342a, DARK = 0x8a1a1a, BELLY = 0xffc86a, HORN = 0xf2ead8;
    var SC_ = shiny(RED, { spec: 0x3a2020, sh: 18 }), SC2 = shiny(0xb52e26, { spec: 0x3a2020, sh: 18 });
    var DK = flat(DARK), BL = shiny(BELLY, { spec: 0x332a10, sh: 15 }), HN = shiny(HORN, { spec: 0x666655, sh: 30 }), CL = flat(0x3a2a2a);
    var k = new Kit('dragon');
    // torso (view.js scales this group to 1 x 0.8 x 1.25 and breathes it)
    var T = model.torso = group(body, 0, 1.2, 0, 'torso');
    T.scale.set(1, 0.8, 1.25);
    k.add(T, sph(14), SC_, 0, 0, 0, 1, 1, 1);
    k.add(T, sph(10), SC_, 0, 0.0, 0.42, 0.86, 0.86, 0.68);
    k.pair(T, sph(10), SC_, 0.5, 0.1, 0.45, 0.42, 0.48, 0.42);
    k.pair(T, sph(10), SC_, 0.54, 0.04, -0.45, 0.44, 0.52, 0.48);
    k.add(T, sph(10), BL, 0, -0.24, 0.12, 0.8, 0.8, 0.9);
    for (var p = 0; p < 8; p++) {
      var pa = -0.5 + p * 0.26, w = 0.5 - Math.abs(p - 3.5) * 0.04;
      k.add(T, sph(6), shiny(shade(BELLY, -0.05), { spec: 0x332a10, sh: 15 }), 0, -0.24 - 0.8 * Math.cos(pa), 0.12 + 0.9 * Math.sin(pa), w, 0.045, 0.14, -pa, 0, 0);
    }
    for (var s = 0; s < 8; s++) {
      var b = 0.85 - s * 0.27;
      k.add(T, GX.cone(5), DK, 0, Math.cos(b) * 0.97, Math.sin(b) * 0.97, 0.09, 0.34 - Math.abs(s - 3) * 0.02, 0.12, b, 0, 0);
    }
    // legs: 0 front-left, 1 front-right, 2 back-left, 3 back-right
    model.legs = [];
    [[-0.72, 0.6, 0], [0.72, 0.6, 0], [-0.74, -0.55, 1], [0.74, -0.55, 1]].forEach(function (q, i) {
      var lg = group(body, q[0], 0.72, q[1], 'leg' + i), side = q[0] < 0 ? -1 : 1, hind = q[2];
      k.add(lg, sph(10), SC_, side * 0.05, -0.05, hind ? -0.05 : 0, hind ? 0.36 : 0.3, hind ? 0.42 : 0.38, hind ? 0.42 : 0.32);
      k.add(lg, limb(8), SC2, 0, -0.25, hind ? -0.05 : 0.02, 0.17, 0.4, 0.18, hind ? -0.15 : 0.08, 0, 0);
      k.add(lg, sph(8), DK, side * 0.02, -0.3, hind ? -0.02 : 0.15, 0.1, 0.09, 0.07);
      k.add(lg, sph(10), SC2, 0, -0.64, 0.1, 0.23, 0.1, 0.28);
      for (var c = -1; c <= 1; c++) {
        k.add(lg, sph(4), SC2, c * 0.11, -0.66, 0.3, 0.07, 0.07, 0.09);
        k.add(lg, GX.cone(5), CL, c * 0.12, -0.68, 0.42, 0.04, 0.13, 0.04, PI / 2 + 0.35, 0, 0);
      }
      model.legs.push(lg);
    });
    // neck: segments (separate meshes) with a spine and a belly plate each
    model.neck = [];
    for (var n = 0; n < 5; n++) {
      var t = n / 4, r = 0.42 - n * 0.03;
      var seg = part(sph(10), n % 2 ? SC_ : SC2, 0, 1.62 + t * 0.85 + Math.sin(t * PI) * 0.08, 0.95 + t * 0.95, r, r, r * 1.1, body);
      part(GX.cone(5), DK, 0, 0.92, -0.1, 0.22, 0.6, 0.28, seg).rotation.x = -0.35;
      var pl = part(sph(6), BL, 0, -0.55, 0.78, 0.65, 0.12, 0.42, seg); pl.rotation.x = -0.7;
      model.neck.push(seg);
    }
    // head
    var head = model.head = group(body, 0, 2.6, 2.1, 'head');
    k.add(head, sph(14), SC_, 0, 0.04, -0.05, 0.46, 0.38, 0.5);
    k.add(head, sph(12), SC_, 0, -0.02, 0.4, 0.3, 0.18, 0.48);
    k.add(head, sph(10), SC_, 0, 0.02, 0.76, 0.22, 0.14, 0.14);
    k.pair(head, sph(8), SC2, 0.11, 0.1, 0.8, 0.07, 0.06, 0.07);
    k.pair(head, sph(6), basic(0x2a0a0a), 0.11, 0.1, 0.86, 0.035, 0.03, 0.02);
    k.pair(head, GX.box(), DK, 0.23, 0.25, 0.3, 0.24, 0.07, 0.13, 0.15, 0, -0.38);
    k.pair(head, sph(8), basic(0x2a0808), 0.25, 0.13, 0.3, 0.12, 0.1, 0.08);
    k.pair(head, GX.box(), basic(0x1a0505), 0.255, 0.13, 0.4, 0.015, 0.07, 0.01);
    var hornA = tube('dhornA', [[0.22, 0.25, -0.15], [0.32, 0.42, -0.4], [0.4, 0.52, -0.7], [0.38, 0.5, -1.0]], 0.11, 0, 8);
    var hornB = tube('dhornB', [[0.36, 0.0, -0.1], [0.5, -0.02, -0.3], [0.58, 0.04, -0.52]], 0.065, 0, 6);
    k.add(head, hornA, HN, 0, 0, 0, 1, 1, 1); k.add(head, hornA, HN, 0, 0, 0, -1, 1, 1);
    k.add(head, hornB, HN, 0, 0, 0, 1, 1, 1); k.add(head, hornB, HN, 0, 0, 0, -1, 1, 1);
    for (var hs = 0; hs < 3; hs++) k.add(head, GX.cone(5), DK, 0, 0.36 - hs * 0.04, -0.15 - hs * 0.18, 0.06, 0.2, 0.08, -0.6, 0, 0);
    k.pair(head, GX.cone(4), DK, 0.42, 0.12, -0.2, 0.12, 0.3, 0.03, -0.9, 0, -0.9);
    // upper teeth
    for (var u = 0; u < 4; u++) k.pair(head, GX.cone(5), 0xffffff, 0.2 - u * 0.03, -0.15, 0.36 + u * 0.12, u === 3 ? 0.03 : 0.025, u === 3 ? 0.1 : 0.07, 0.025, PI, 0, 0);
    k.add(head, sph(10), basic(0x5a1010), 0, -0.14, 0.4, 0.22, 0.05, 0.36);
    model.jaw = group(head, 0, -0.18, 0.2, 'jaw');
    k.add(model.jaw, sph(12), SC_, 0, -0.03, 0.26, 0.27, 0.1, 0.42);
    k.add(model.jaw, sph(10), BL, 0, -0.08, 0.24, 0.22, 0.06, 0.36);
    k.add(model.jaw, sph(8), 0xe0505a, 0, 0.03, 0.26, 0.15, 0.035, 0.28);
    for (var lt = 0; lt < 4; lt++) k.pair(model.jaw, GX.cone(5), 0xffffff, 0.19 - lt * 0.03, 0.06, 0.2 + lt * 0.12, 0.024, 0.07, 0.024);
    k.pair(model.jaw, GX.cone(4), DK, 0.2, -0.06, -0.02, 0.04, 0.12, 0.04, PI * 0.75, 0, 0);
    // glowing eyes with slit pupils (separate meshes: view.js recolours them)
    model.eyes = [];
    var eyeMat = GX.mat(0xffe14b, { emissive: 0xffa000 });
    [-1, 1].forEach(function (sd) {
      var e = part(sph(10), eyeMat, sd * 0.255, 0.135, 0.33, 0.085, 0.07, 0.07, head);
      e.rotation.y = sd * 0.3;
      model.eyes.push(e);
    });
    // tail: chain of segments with spines, belly plates and a spade tip
    model.tail = [];
    var prev = body;
    for (var q = 0; q < 7; q++) {
      var tg = group(prev, 0, q === 0 ? 1.0 : 0, q === 0 ? -1.1 : -0.42, 'tail' + q);
      var tr = 0.36 - q * 0.042;
      k.add(tg, sph(8), q % 2 ? SC_ : SC2, 0, 0, -0.2, tr, tr * 0.9, 0.36);
      k.add(tg, GX.cone(5), DK, 0, tr * 0.82, -0.22, 0.06, 0.24 - q * 0.02, 0.09, -0.45, 0, 0);
      k.add(tg, sph(6), BL, 0, -tr * 0.72, -0.2, tr * 0.7, 0.06, 0.24);
      if (q === 6) {
        k.add(tg, GX.oct(), DK, 0, 0, -0.62, 0.26, 0.05, 0.36);
        k.pair(tg, GX.cone(4), DK, 0.15, 0, -0.45, 0.04, 0.18, 0.03, -PI / 2, 0, -0.8);
      }
      model.tail.push(tg);
      prev = tg;
    }
    // wings: arm bone, fingers and membranes (one shared geometry, mirrored for the left wing)
    var Wp = { S: [0, 0, 0], E: [1.1, 0.45, 0.15], W: [2.1, 0.75, -0.05], F1: [3.6, 0.5, 0.05], F2: [3.3, 0.05, -1.0], F3: [2.55, -0.15, -1.7], F4: [1.55, -0.15, -1.85], T: [0.15, -0.05, -1.1] };
    var memGeo = GX.geo('md2:dwingMem', function () {
      function mid(a, b, f, dy) { return [(a[0] + b[0]) / 2 * (1 - f) + Wp.W[0] * f, (a[1] + b[1]) / 2 * (1 - f) + Wp.W[1] * f + dy, (a[2] + b[2]) / 2 * (1 - f) + Wp.W[2] * f]; }
      var ring = [Wp.F1, mid(Wp.F1, Wp.F2, 0.22, -0.12), Wp.F2, mid(Wp.F2, Wp.F3, 0.25, -0.12), Wp.F3, mid(Wp.F3, Wp.F4, 0.25, -0.1), Wp.F4, mid(Wp.F4, Wp.T, 0.12, -0.1), Wp.T, Wp.S, Wp.E];
      var pos = [];
      for (var i = 0; i < ring.length - 1; i++) pos.push.apply(pos, Wp.W.concat(ring[i], ring[i + 1]));
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      return g;
    });
    var memMat = GX.mat(0xa02a3a, { side: THREE.DoubleSide });
    var boneGeo = GX.geo('md2:dwingBone', function () {
      var parts = [[tube('warm', [Wp.S, Wp.E, Wp.W], 0.11, 0.07, 7), 0, 0, 0, 1, 1, 1]];
      ['F1', 'F2', 'F3', 'F4'].forEach(function (f, i) { parts.push([tube('wf' + i, [Wp.W, [(Wp.W[0] + Wp[f][0]) / 2, (Wp.W[1] + Wp[f][1]) / 2 + 0.05, (Wp.W[2] + Wp[f][2]) / 2], Wp[f]], 0.055, 0.012, 5), 0, 0, 0, 1, 1, 1]); });
      parts.push([sph(8), Wp.E[0], Wp.E[1], Wp.E[2], 0.12, 0.12, 0.12]);
      parts.push([sph(8), Wp.W[0], Wp.W[1], Wp.W[2], 0.1, 0.1, 0.1]);
      return mergeParts(parts);
    });
    var clawGeo = GX.geo('md2:dwingClaw', function () { return mergeParts([[GX.cone(5), Wp.W[0] + 0.05, Wp.W[1] + 0.12, Wp.W[2] + 0.12, 0.04, 0.2, 0.04, 0.6, 0, 0], [GX.cone(5), Wp.E[0], Wp.E[1] + 0.1, Wp.E[2] - 0.05, 0.035, 0.16, 0.035, -0.4, 0, 0]]); });
    model.wingL = group(body, -0.55, 1.75, 0.2, 'wingL'); model.wingR = group(body, 0.55, 1.75, 0.2, 'wingR');
    [[model.wingL, -1], [model.wingR, 1]].forEach(function (wq) {
      var sub = group(wq[0], 0, 0, 0); sub.scale.set(wq[1] * 1.05, 1.05, 1.05);
      [[memGeo, memMat], [boneGeo, DK], [clawGeo, HN]].forEach(function (gm) {
        var mm = new THREE.Mesh(gm[0], gm[1]); mm.castShadow = true; sub.add(mm);
      });
    });
    k.build();
    model.meshes = collectMeshes(root);
    return model;
  };

  // ---------------- pickups and props ----------------
  var heartGeo = null;
  function getHeartGeo() {
    if (heartGeo) return heartGeo;
    var s = new THREE.Shape();
    s.moveTo(0, -0.5); s.bezierCurveTo(-0.15, -0.35, -0.55, -0.1, -0.5, 0.18); s.bezierCurveTo(-0.45, 0.45, -0.1, 0.5, 0, 0.25);
    s.bezierCurveTo(0.1, 0.5, 0.45, 0.45, 0.5, 0.18); s.bezierCurveTo(0.55, -0.1, 0.15, -0.35, 0, -0.5);
    heartGeo = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 4, curveSegments: 10 });
    heartGeo.translate(0, 0, -0.1);
    return heartGeo;
  }
  var GEM_COLORS = [0x3affb0, 0x5ab8ff, 0xff5ac8, 0xffd23f];
  // portal block: rune-carved stone with glowing runes
  var blockMat = null;
  function getBlockMat() {
    if (blockMat) return blockMat;
    function canvas(fn) { var c = document.createElement('canvas'); c.width = c.height = 64; fn(c.getContext('2d')); return new THREE.CanvasTexture(c); }
    function rune(g, col, w) {
      g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.arc(32, 32, 13, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(32, 12); g.lineTo(32, 52); g.moveTo(22, 22); g.lineTo(42, 42); g.moveTo(42, 22); g.lineTo(36, 28); g.stroke();
      g.beginPath(); g.moveTo(10, 10); g.lineTo(16, 10); g.moveTo(54, 54); g.lineTo(48, 54); g.stroke();
    }
    var map = canvas(function (g) {
      g.fillStyle = '#6a6f8c'; g.fillRect(0, 0, 64, 64);
      for (var i = 0; i < 90; i++) { g.fillStyle = (i % 2) ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,30,0.12)'; g.fillRect(SC.hash(i, 3) * 64, SC.hash(i, 7) * 64, 2 + SC.hash(i, 9) * 3, 2); }
      g.strokeStyle = '#454a64'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, 59, 59);
      rune(g, '#2a3a5a', 6); rune(g, '#bffcff', 3);
    });
    var emi = canvas(function (g) { g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64); rune(g, '#3fd8ff', 5); rune(g, '#d8ffff', 2); });
    blockMat = new THREE.MeshLambertMaterial({ map: map, emissive: 0xffffff, emissiveMap: emi });
    return blockMat;
  }
  MD.pickup = function (k) {
    var root = new THREE.Group(), model = { root: root, kind: 'pickup' };
    model.shadow = shadowBlob(root, 0.2);
    var spin = model.spin = group(root, 0, 0.35, 0, 'spin');
    var kit;
    if (k.kind === 'gem') {
      var c = k.val >= 5 ? GEM_COLORS[1 + (k.id % 3)] : GEM_COLORS[0];
      var sc = k.val >= 5 ? 1.4 : 1;
      var gm = shiny(c, { emi: new THREE.Color(c).multiplyScalar(0.35).getHex(), spec: 0xffffff, sh: 100, flat: true });
      part(gemGeo(), gm, 0, 0.04 * sc, 0, 0.14 * sc, 0.19 * sc, 0.14 * sc, spin);
      var sp = part(GX.oct(), 0xffffff, 0.06 * sc, 0.1 * sc, 0.06 * sc, 0.02, 0.05, 0.02, spin, { basic: true });
      sp.userData.noFlash = true;
    } else if (k.kind === 'heart' || k.kind === 'heartUp') {
      var big = k.kind === 'heartUp', hs = big ? 0.6 : 0.36;
      part(getHeartGeo(), shiny(0xff3a5a, { emi: 0x5a0010, spec: 0xffc0c8, sh: 60 }), 0, 0, 0, hs, hs, hs, spin);
      part(sph(8), 0xffffff, -0.2 * hs, 0.17 * hs, 0.22 * hs, 0.09 * hs, 0.06 * hs, 0.03 * hs, spin, { basic: true, transparent: true, opacity: 0.8 });
      part(sph(8), 0xffffff, -0.2 * hs, 0.17 * hs, -0.22 * hs, 0.09 * hs, 0.06 * hs, 0.03 * hs, spin, { basic: true, transparent: true, opacity: 0.8 });
      if (big) {
        var r = part(band(), gold(0xffd23f), 0, 0, 0, 0.42, 0.42, 0.42, spin); r.userData.noFlash = true;
        for (var w = 0; w < 6; w++) part(GX.oct(), 0xfff4a0, Math.cos(w * PI / 3) * 0.42, Math.sin(w * PI / 3) * 0.42, 0, 0.04, 0.04, 0.04, spin, { emissive: 0x806000 });
        model.beam = beam(root, 0xff6b8a);
      }
    } else if (k.kind === 'life') {
      // extra life: a golden heart with little white wings and a soft glow
      var ls = 0.42;
      part(getHeartGeo(), shiny(0xf0a820, { emi: 0x4a3000, spec: 0xfff0b0, sh: 80 }), 0, 0, 0, ls, ls, ls, spin);
      part(sph(8), 0xffffff, -0.2 * ls, 0.17 * ls, 0.22 * ls, 0.09 * ls, 0.06 * ls, 0.03 * ls, spin, { basic: true, transparent: true, opacity: 0.85 });
      part(sph(8), 0xffffff, -0.2 * ls, 0.17 * ls, -0.22 * ls, 0.09 * ls, 0.06 * ls, 0.03 * ls, spin, { basic: true, transparent: true, opacity: 0.85 });
      kit = new Kit('lifeWings');
      var wing = group(spin, 0, 0, 0, 'wings'), FE = shiny(0xffffff, { emi: 0x40403a, spec: 0x888888, sh: 30 });
      for (var f = 0; f < 4; f++) kit.pair(wing, sph(8), FE, 0.24 + f * 0.05, 0.08 + f * 0.035, 0, 0.09 - f * 0.012, 0.035, 0.03, 0, 0, 0.35 + f * 0.25);
      kit.build();
      model.wings = wing;
      model.glow = part(sph(12), 0xffd060, 0, 0, 0, 0.36, 0.36, 0.36, spin, { additive: true, basic: true, opacity: 0.14 });
      model.glow.userData.noFlash = true;
      for (var st2 = 0; st2 < 4; st2++) part(GX.oct(), 0xfff4a0, Math.cos(st2 * PI / 2 + 0.4) * 0.34, Math.sin(st2 * PI / 2 + 0.4) * 0.34, 0, 0.03, 0.05, 0.03, spin, { emissive: 0x806000 });
      model.beam = beam(root, 0xffd23f);
    } else if (k.kind === 'sword') {
      var fake = { id: 'nate', root: spin, swordG: group(spin, 0, 0, 0) };
      MD.setHeroSword(fake, k.val);
      fake.swordG.rotation.x = -Math.PI / 2; fake.swordG.position.y = -0.3;
      fake.swordG.scale.setScalar(1.3);
      model.beam = beam(root, k.val >= 2 ? 0x8ff8ff : 0xeaf4ff);
    } else if (k.kind === 'crest') {
      var pw = SC.powerById(k.power);
      spin.position.y = 0.75;
      kit = new Kit('crest:' + k.power);
      var GD = gold(0xffc83a), GD2 = gold(0xe0a020);
      kit.add(spin, GX.cyl(1, 1, 24), GD, 0, 0, 0, 0.42, 0.07, 0.42, PI / 2, 0, 0);
      kit.add(spin, band(), GD2, 0, 0, 0.035, 0.4, 0.4, 0.25);
      kit.add(spin, band(), GD2, 0, 0, -0.035, 0.4, 0.4, 0.25);
      kit.add(spin, GX.cyl(1, 1, 24), glow(pw.hex, new THREE.Color(pw.hex).multiplyScalar(0.4).getHex()), 0, 0, 0, 0.34, 0.09, 0.34, PI / 2, 0, 0);
      for (var p = 0; p < 8; p++) {
        kit.add(spin, GX.cone(4), GD, Math.cos(p * PI / 4) * 0.5, Math.sin(p * PI / 4) * 0.5, 0, 0.055, p % 2 ? 0.1 : 0.15, 0.04, 0, 0, p * PI / 4 - PI / 2);
        kit.add(spin, sph(6), GD2, Math.cos(p * PI / 4 + PI / 8) * 0.45, Math.sin(p * PI / 4 + PI / 8) * 0.45, 0, 0.03, 0.03, 0.03);
      }
      kit.add(spin, GX.oct(), shiny(pw.hex, { emi: new THREE.Color(pw.hex).multiplyScalar(0.5).getHex(), flat: true, spec: 0xffffff, sh: 90 }), 0, 0.62, 0, 0.06, 0.08, 0.06);
      kit.build();
      var tex = MD.iconTexture(k.power);
      var iconMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
      var icon = new THREE.Mesh(GX.geo('iconPlane', function () { return new THREE.PlaneGeometry(0.56, 0.56); }), iconMat);
      icon.position.z = 0.051; spin.add(icon);
      var icon2 = new THREE.Mesh(icon.geometry, iconMat); icon2.position.z = -0.051; icon2.rotation.y = Math.PI; spin.add(icon2);
      model.beam = beam(root, pw.hex);
      model.shadow.scale.set(0.45, 1, 0.45);
      // sealed shell (B may toggle model.shell.visible = !!k.sealed each frame)
      model.shell = group(spin, 0, 0, 0);
      var sh = part(sph(16), pw.hex, 0, 0, 0, 0.66, 0.66, 0.66, model.shell, { transparent: true, opacity: 0.22, depthWrite: false, emissive: new THREE.Color(pw.hex).multiplyScalar(0.5).getHex() });
      var sh2 = part(GX.ico(), 0xffffff, 0, 0, 0, 0.7, 0.7, 0.7, model.shell, { additive: true, basic: true, opacity: 0.12, wireframe: true });
      var lockG = group(model.shell, 0, -0.1, 0.5);
      part(GX.box(), gold(0xffc83a), 0, 0, 0, 0.18, 0.15, 0.06, lockG);
      part(GX.torus(PI), steel(), 0, 0.075, 0, 0.065, 0.08, 0.1, lockG);
      part(sph(6), 0x2a1a0a, 0, 0.005, 0.031, 0.02, 0.025, 0.005, lockG);
      [sh, sh2].forEach(function (o) { o.userData.noFlash = true; });
      model.shell.visible = !!k.sealed;
    } else if (k.kind === 'block') {
      model.shadow.scale.set(0.3, 1, 0.3);
      var cube = part(GX.box(), getBlockMat(), 0, 0, 0, 0.34, 0.34, 0.34, spin);
      cube.rotation.set(0.35, 0, 0.35);
      kit = new Kit('block');
      var eg = group(spin, 0, 0, 0, 'edges'); eg.rotation.copy(cube.rotation);
      var EM = basic(0x9ffcff), e = 0.17, th = 0.028;
      for (var ax = 0; ax < 3; ax++) for (var i1 = -1; i1 <= 1; i1 += 2) for (var i2 = -1; i2 <= 1; i2 += 2) {
        var pp = [0, 0, 0], ss = [th, th, th];
        pp[(ax + 1) % 3] = i1 * e; pp[(ax + 2) % 3] = i2 * e; ss[ax] = 0.36;
        kit.add(eg, GX.box(), EM, pp[0], pp[1], pp[2], ss[0], ss[1], ss[2]);
      }
      kit.build();
      model.glow = part(sph(12), 0x5af0ff, 0, 0, 0, 0.36, 0.36, 0.36, spin, { additive: true, basic: true, opacity: 0.22 });
      model.glow.userData.noFlash = true;
    }
    model.meshes = collectMeshes(root);
    return model;
  };
  function beam(root, color) {
    var m = new THREE.Mesh(GX.cyl(0.6, 1, 12), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.scale.set(0.35, 7, 0.35); m.position.y = 3.5; m.userData.noFlash = true;
    var core = new THREE.Mesh(GX.cyl(1, 1, 8), GX.mat(0xffffff, { additive: true, basic: true, opacity: 0.18 }));
    core.scale.set(0.25, 1, 0.25); core.userData.noFlash = true; m.add(core);
    root.add(m);
    return m;
  }
  var iconTex = {};
  MD.iconTexture = function (power) {
    if (iconTex[power]) return iconTex[power];
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d');
    SC.drawPowerIcon(g, power, 64, 64, 46, true);
    var t = new THREE.CanvasTexture(c);
    return (iconTex[power] = t);
  };

  MD.chest = function () {
    var root = new THREE.Group(), model = { root: root, kind: 'chest' };
    shadowBlob(root, 0.5);
    var k = new Kit('chest'), base = group(root, 0, 0, 0, 'base');
    var WOOD = flat(0x9a5a2a), WOOD2 = flat(0x7a4420), GD = gold(0xffc83a), IR = steel(0x6a6a78);
    k.add(base, GX.box(), WOOD, 0, 0.24, 0, 0.78, 0.46, 0.56);
    for (var i = 0; i < 2; i++) { k.add(base, GX.box(), WOOD2, 0, 0.15 + i * 0.16, 0.282, 0.7, 0.015, 0.01); k.add(base, GX.box(), WOOD2, 0, 0.15 + i * 0.16, -0.282, 0.7, 0.015, 0.01); }
    k.add(base, GX.box(), GD, 0, 0.03, 0, 0.82, 0.06, 0.6);
    k.add(base, GX.box(), GD, 0, 0.45, 0, 0.82, 0.04, 0.6);
    k.pair(base, GX.box(), GD, 0.3, 0.24, 0, 0.08, 0.48, 0.6);
    k.pair(base, GX.box(), IR, 0.395, 0.24, 0.285, 0.03, 0.46, 0.03);
    k.pair(base, GX.box(), IR, 0.395, 0.24, -0.285, 0.03, 0.46, 0.03);
    k.add(base, GX.box(), GD, 0, 0.36, 0.29, 0.12, 0.14, 0.02);
    k.add(base, GX.box(), basic(0x1a1008), 0, 0.35, 0.302, 0.025, 0.05, 0.005);
    for (var c = 0; c < 9; c++) k.add(base, GX.cyl(1, 1, 8), GD, -0.24 + (c % 3) * 0.24 + SC.hash(c, 1) * 0.05, 0.43 + SC.hash(c, 2) * 0.03, -0.14 + Math.floor(c / 3) * 0.14, 0.06, 0.015, 0.06, SC.hash(c, 3) * 0.6, 0, 0);
    model.lid = group(root, 0, 0.47, -0.28, 'lid');
    k.add(model.lid, halfCyl(), flat(0xb06a32), 0, 0.0, 0.28, 0.17, 0.8, 0.29, 0, 0, PI / 2);
    k.add(model.lid, GX.box(), WOOD2, 0, 0.005, 0.28, 0.79, 0.012, 0.57);
    k.pair(model.lid, halfCyl(), GD, 0.3, 0.0, 0.28, 0.18, 0.08, 0.3, 0, 0, PI / 2);
    k.add(model.lid, GX.box(), gold(0xffe27a), 0, -0.02, 0.585, 0.12, 0.13, 0.03);
    k.build();
    model.inside = part(GX.box(), 0xfff2a0, 0, 0.45, 0, 0.66, 0.04, 0.44, root, { emissive: 0xffc000 });
    model.inside.visible = false;
    model.meshes = collectMeshes(root);
    return model;
  };
  MD.gate = function (alongZ, theme) {
    var root = new THREE.Group(), model = { root: root, kind: 'gate' };
    var inner = group(root, 0, 0, 0, 'inner');
    if (alongZ) inner.rotation.y = Math.PI / 2;
    var stone = theme === 'shadow' ? 0x6a5a8a : theme === 'frost' ? 0xb8c8e0 : theme === 'storm' ? 0x7a7e88 : 0xc8b898;
    var k = new Kit('gate:' + stone), S1 = flat(stone), S2 = flat(shade(stone, -0.08));
    for (var b = 0; b < 4; b++) {
      k.pair(inner, GX.box(), b % 2 ? S1 : S2, 0.62, 0.25 + b * 0.5, 0, 0.36 - (b % 2) * 0.03, 0.48, 0.52);
    }
    k.pair(inner, GX.box(), S2, 0.62, 2.04, 0, 0.42, 0.1, 0.58);
    k.add(inner, GX.torus(PI), S1, 0, 1.95, 0, 0.62, 0.62, 2.0);
    k.add(inner, GX.oct(), glow(0xffd23f, 0x806000), 0, 2.6, 0.2, 0.14, 0.18, 0.08);
    k.build();
    model.bars = group(inner, 0, 0, 0, 'bars');
    var kb = new Kit('gatebars'), IR = steel(0x5a5a6a);
    for (var i = -2; i <= 2; i++) { kb.add(model.bars, GX.cyl(1, 1, 6), IR, i * 0.2, 1.05, 0, 0.04, 2.1, 0.04); kb.add(model.bars, GX.cone(4), IR, i * 0.2, 2.15, 0, 0.05, 0.12, 0.05); }
    kb.add(model.bars, GX.box(), IR, 0, 1.6, 0, 0.9, 0.06, 0.06); kb.add(model.bars, GX.box(), IR, 0, 0.6, 0, 0.9, 0.06, 0.06);
    kb.build();
    model.portal = new THREE.Mesh(GX.geo('portal', function () { return new THREE.CircleGeometry(0.62, 24); }),
      new THREE.MeshBasicMaterial({ color: 0x9ff0ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    model.portal.position.set(0, 1.25, 0); model.portal.scale.set(1, 1.6, 1); model.portal.userData.noFlash = true;
    inner.add(model.portal);
    model.meshes = collectMeshes(root);
    return model;
  };
  MD.flag = function () {
    var root = new THREE.Group(), model = { root: root, kind: 'flag' };
    shadowBlob(root, 0.2);
    var k = new Kit('flag'), pole = group(root, 0, 0, 0, 'pole');
    k.add(pole, GX.cyl(1, 1, 8), shiny(0xdcdcdc, { sh: 60 }), 0, 0.82, 0, 0.035, 1.6, 0.035);
    k.add(pole, sph(10), gold(0xffd23f), 0, 1.64, 0, 0.07, 0.07, 0.07);
    k.add(pole, GX.cyl(0.85, 1, 10), flat(0x8a8a8a), 0, 0.06, 0, 0.3, 0.12, 0.3);
    k.add(pole, GX.cyl(0.9, 1, 10), flat(0x9a9a9a), 0, 0.15, 0, 0.16, 0.08, 0.16);
    k.build();
    model.cloth = group(root, 0, 1.4, 0);
    var clothGeo = GX.geo('md2:flagCloth', function () {
      var g = new THREE.BoxGeometry(0.5, 0.32, 0.03, 8, 2, 1), pa = g.attributes.position;
      for (var i = 0; i < pa.count; i++) { var x = pa.getX(i) + 0.25; pa.setX(i, x); pa.setZ(i, pa.getZ(i) + Math.sin(x * 9) * 0.035 * (x / 0.5)); pa.setY(i, pa.getY(i) - x * x * 0.12); }
      g.computeVertexNormals();
      return g;
    });
    model.clothMesh = part(clothGeo, 0x9a9a9a, 0.02, 0, 0, 1, 1, 1, model.cloth);
    model.meshes = collectMeshes(root);
    return model;
  };

  // ---------------- flying things ----------------
  MD.proj = function (kind) {
    var root = new THREE.Group(), m = { root: root, kind: kind };
    var s10 = sph(10);
    function fx(c, op) { return GX.mat(c, { additive: true, basic: true, opacity: op }); }
    switch (kind) {
      case 'fireball':
        part(s10, 0xfff2a0, 0, 0, 0, 0.13, 0.13, 0.13, root, { basic: true });
        part(s10, 0xffb020, 0, 0, 0, 0.2, 0.2, 0.2, root, { additive: true, basic: true, opacity: 0.8 });
        part(s10, 0xff5a10, 0, 0, -0.03, 0.3, 0.28, 0.32, root, { additive: true, basic: true, opacity: 0.55 });
        for (var f = 0; f < 3; f++) {
          var fc = part(GX.cone(6), f ? 0xff6a10 : 0xffa020, Math.cos(f * 2.1) * 0.07, Math.sin(f * 2.1) * 0.07, -0.25, 0.11, 0.42, 0.11, root, { additive: true, basic: true, opacity: 0.5 });
          fc.rotation.x = -PI / 2;
        }
        break;
      case 'shard':
        var s = m.spinPart = group(root, 0, 0, 0);
        var im = shiny(0xbff4ff, { emi: 0x3a8aaa, flat: true, spec: 0xffffff, sh: 100, opacity: 0.92 });
        part(GX.oct(), im, 0, 0, 0, 0.07, 0.07, 0.32, s);
        part(GX.oct(), im, 0.05, 0.02, -0.08, 0.035, 0.035, 0.14, s).rotation.y = 0.5;
        part(GX.oct(), im, -0.04, -0.03, -0.1, 0.03, 0.03, 0.12, s).rotation.y = -0.5;
        part(GX.oct(), 0xffffff, 0, 0, 0, 0.1, 0.1, 0.36, s, { additive: true, basic: true, opacity: 0.25 });
        break;
      case 'bubble':
        part(sph(16), 0xbff6ff, 0, 0, 0, 0.26, 0.26, 0.26, root, { transparent: true, opacity: 0.35, depthWrite: false, emissive: 0x204050 });
        part(sph(16), 0x9ff0ff, 0, 0, 0, 0.275, 0.275, 0.275, root, { additive: true, basic: true, opacity: 0.18, side: THREE.BackSide });
        part(sph(8), 0xffffff, -0.09, 0.1, 0.17, 0.055, 0.04, 0.02, root, { basic: true });
        part(sph(6), 0xffffff, 0.06, -0.08, 0.2, 0.02, 0.02, 0.01, root, { basic: true });
        break;
      case 'skull':
        m.spinPart = group(root, 0, 0, 0);
        var SK = GX.mat(0xb07aff, { emissive: 0x4a1a8a });
        part(sph(14), SK, 0, 0.03, -0.02, 0.34, 0.32, 0.34, m.spinPart);
        part(sph(10), SK, 0, -0.14, 0.1, 0.26, 0.16, 0.22, m.spinPart);
        part(GX.box(), SK, 0, -0.25, 0.14, 0.24, 0.07, 0.14, m.spinPart);
        for (var t = -2; t <= 2; t++) part(GX.box(), 0xf0e0ff, t * 0.045, -0.2, 0.25, 0.035, 0.05, 0.02, m.spinPart, { emissive: 0x3a2a5a });
        [-1, 1].forEach(function (sd) {
          part(sph(8), 0x1a0a2a, sd * 0.12, 0.0, 0.25, 0.09, 0.1, 0.07, m.spinPart, { basic: true });
          part(sph(6), 0xff8aff, sd * 0.12, 0.0, 0.3, 0.035, 0.035, 0.02, m.spinPart, { basic: true });
        });
        part(GX.cone(3), 0x1a0a2a, 0, -0.1, 0.31, 0.03, 0.05, 0.02, m.spinPart, { basic: true }).rotation.x = PI;
        part(s10, 0x7a3aff, 0, 0, 0, 0.5, 0.5, 0.5, root, { additive: true, basic: true, opacity: 0.25 });
        for (var wsp = 0; wsp < 3; wsp++) {
          var wc = part(GX.cone(6), 0x9b4dff, (wsp - 1) * 0.15, 0.05 - Math.abs(wsp - 1) * 0.08, -0.4, 0.12, 0.5, 0.12, root, { additive: true, basic: true, opacity: 0.35 });
          wc.rotation.x = -PI / 2;
        }
        break;
      case 'wave':
        m.spinPart = group(root, 0, 0, 0);
        var wg = GX.geo('waveGeo', function () { return new THREE.CylinderGeometry(1, 1.15, 1, 18, 1, true, -1.0, 2.0); });
        var wmesh = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: 0x2a8cff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, emissive: 0x0a2a5a }));
        wmesh.position.y = 0.45; m.spinPart.add(wmesh); m.mat = wmesh.material;
        var inner = new THREE.Mesh(wg, GX.mat(0x7fd0ff, { transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
        inner.position.y = 0.4; inner.scale.set(0.93, 0.85, 0.93); m.spinPart.add(inner);
        var foam = new THREE.Mesh(wg, GX.mat(0xffffff, { transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
        foam.position.y = 0.95; foam.scale.set(1.02, 0.14, 1.02); m.spinPart.add(foam);
        for (var fb = 0; fb < 7; fb++) {
          var fa = -0.9 + fb * 0.3;
          part(sph(6), 0xffffff, Math.sin(fa) * 1.03, 1.0, Math.cos(fa) * 1.03, 0.09, 0.07, 0.09, m.spinPart, { transparent: true, opacity: 0.9 });
        }
        break;
      case 'twister':
      case 'tornado':
        var big = kind === 'tornado';
        m.spinPart = group(root, 0, 0, 0);
        var layers = big ? 6 : 4;
        for (var i = 0; i < layers; i++) {
          var cm = new THREE.Mesh(GX.geo('twCone', function () { return new THREE.CylinderGeometry(1, 0.25, 1, 10, 1, true); }),
            GX.mat(big ? (i % 2 ? 0x9ab8b0 : 0xd8e8f0) : (i % 2 ? 0x8fd8c0 : 0xd8f8ff), { transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
          var sc2 = big ? 1.6 : 1;
          cm.position.y = (0.3 + i * 0.42) * sc2; cm.scale.set((0.3 + i * 0.2) * sc2, 0.45 * sc2, (0.3 + i * 0.2) * sc2); cm.rotation.y = i;
          m.spinPart.add(cm);
        }
        var inner2 = new THREE.Mesh(GX.geo('twCone', null), GX.mat(0xffffff, { additive: true, basic: true, opacity: 0.25, side: THREE.DoubleSide }));
        inner2.position.y = big ? 1.6 : 1.0; inner2.scale.set(big ? 0.9 : 0.55, big ? 3.2 : 2.0, big ? 0.9 : 0.55); m.spinPart.add(inner2);
        for (var d = 0; d < (big ? 8 : 5); d++) {
          var da = d * 2.4, dr = (0.35 + (d % 3) * 0.2) * (big ? 1.5 : 1);
          part(d % 2 ? GX.cone(3) : GX.dodec(), d % 2 ? 0x5aaa3a : 0x8a7a6a, Math.cos(da) * dr, 0.3 + d * (big ? 0.35 : 0.22), Math.sin(da) * dr, 0.05, 0.05, 0.05, m.spinPart, { flatShading: true });
        }
        break;
      case 'pebble': part(GX.dodec(), 0x9a9088, 0, 0, 0, 0.1, 0.09, 0.1, root, { flatShading: true }); break;
      // guardian throws
      case 'rock':
        part(GX.dodec(), 0x8a7a62, 0, 0, 0, 0.22, 0.2, 0.22, root, { flatShading: true });
        part(GX.dodec(), 0x5a9a3a, 0.05, 0.12, 0, 0.1, 0.05, 0.1, root, { flatShading: true });
        break;
      case 'bubbleball':
        part(sph(12), 0xdffcff, 0, 0, 0, 0.24, 0.24, 0.24, root, { transparent: true, opacity: 0.45, depthWrite: false, emissive: 0x1a4a5a });
        part(sph(6), 0xffffff, -0.08, 0.1, 0.12, 0.05, 0.04, 0.02, root, { basic: true });
        break;
      case 'blade':
        var bm = part(GX.torus(Math.PI), 0xeafff4, 0, 0, 0, 0.26, 0.26, 0.6, root, { additive: true, basic: true, opacity: 0.8 });
        bm.rotation.x = -Math.PI / 2;
        part(GX.oct(), 0xa8f0c8, 0, 0, 0.1, 0.06, 0.04, 0.12, root, { basic: true });
        break;
      case 'seed':
        part(sph(8), 0x6a4a2a, 0, 0, 0, 0.1, 0.08, 0.13, root, {});
        for (var sd = 0; sd < 4; sd++) part(GX.cone(4), 0x9a5a3a, Math.cos(sd * 1.57) * 0.09, Math.sin(sd * 1.57) * 0.09, 0, 0.025, 0.08, 0.025, root, {}).rotation.z = sd * 1.57 - 1.57;
        part(sph(6), 0x7ae05a, 0, 0.07, -0.06, 0.05, 0.03, 0.07, root, {});
        break;
      case 'blob':
        part(sph(12), 0x4ab0ff, 0, 0, 0, 0.17, 0.17, 0.17, root, { transparent: true, opacity: 0.8, emissive: 0x0a3060 });
        part(sph(6), 0xffffff, -0.06, 0.07, 0.1, 0.04, 0.03, 0.02, root, { basic: true });
        break;
      case 'snow':
        part(GX.geo('md2:snowGeo', function () { return new THREE.IcosahedronGeometry(1, 1); }), 0xffffff, 0, 0, 0, 0.16, 0.16, 0.16, root, { flatShading: true, emissive: 0x303a48 });
        break;
      case 'orb':
        part(s10, 0x7a3aff, 0, 0, 0, 0.2, 0.2, 0.2, root, { emissive: 0x4a0aaa });
        part(s10, 0xb07aff, 0, 0, 0, 0.32, 0.32, 0.32, root, { additive: true, basic: true, opacity: 0.35 });
        part(ring(), 0xe0c0ff, 0, 0, 0, 0.3, 0.3, 0.3, root, { additive: true, basic: true, opacity: 0.6 }).rotation.x = 1.2;
        break;
      case 'bolt':
        part(GX.oct(), 0xffffff, 0, 0, 0, 0.12, 0.12, 0.12, root, { basic: true });
        part(GX.oct(), 0xfff27a, 0, 0, 0, 0.2, 0.2, 0.2, root, { additive: true, basic: true, opacity: 0.6 });
        break;
      case 'meteor':
        part(GX.dodec(), 0x8a3010, 0, 0, 0, 0.26, 0.26, 0.26, root, { flatShading: true, emissive: 0x902a00 });
        part(s10, 0xffd23f, 0, 0, 0, 0.32, 0.32, 0.32, root, { additive: true, basic: true, opacity: 0.6 });
        part(s10, 0xff5a10, 0, 0, 0, 0.52, 0.52, 0.52, root, { additive: true, basic: true, opacity: 0.45 });
        break;
      case 'spike':
        m.spinPart = group(root, 0, 0, 0);
        var R1 = GX.mat(0x9a7a5a, { flatShading: true }), R2 = GX.mat(0xb08a62, { flatShading: true }), R3 = GX.mat(0x7a5a40, { flatShading: true });
        part(GX.cone(5), R1, 0, 0.45, 0, 0.26, 0.9, 0.26, m.spinPart);
        part(GX.cone(5), R2, 0.2, 0.28, 0.1, 0.15, 0.56, 0.15, m.spinPart).rotation.z = -0.3;
        part(GX.cone(5), R3, -0.18, 0.25, -0.08, 0.14, 0.5, 0.14, m.spinPart).rotation.z = 0.35;
        part(GX.cone(4), R2, 0.02, 0.2, -0.2, 0.1, 0.4, 0.1, m.spinPart).rotation.x = -0.35;
        for (var rb = 0; rb < 4; rb++) part(GX.dodec(), R3, Math.cos(rb * 1.7) * 0.3, 0.03, Math.sin(rb * 1.7) * 0.3, 0.08, 0.06, 0.08, m.spinPart);
        break;
      case 'boltSeg': part(GX.box(), 0xfffbd0, 0, 0, 0.5, 1, 1, 1, root, { basic: true }); part(GX.box(), 0xffe14a, 0, 0, 0.5, 3, 3, 1, root, { additive: true, basic: true, opacity: 0.45 }); break;
      case 'ringFx':
        var rm = new THREE.Mesh(GX.geo('fxRing', function () { return new THREE.TorusGeometry(1, 0.06, 6, 36).rotateX(Math.PI / 2); }),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false }));
        root.add(rm); m.mat = rm.material;
        var band = new THREE.Mesh(GX.geo('md2:fxBand', function () { return new THREE.CylinderGeometry(1, 1, 0.1, 36, 1, true).translate(0, 0.05, 0); }), rm.material);
        band.material.side = THREE.DoubleSide; root.add(band);
        break;
    }
    m.meshes = [];
    return m;
  };
})();
