// Nine Crests - 3D basics: renderer, sun + shadows, sky with the other planets, the level's ground (terraces, cliffs,
// water, lava), the two camera views, pooled particles, ground warning decals, the minimap, and the SC.fx calls.
// Scenery (trees, rocks, ruins, camps ...) is built by scenery.js through GX.inst().
(function () {
  'use strict';
  var SC = window.SC;
  var GX = SC.gfx = { ok: false };
  var renderer, scene, camera, hemi, sun, worldGroup, raycaster, skyGroup;
  var matCache = {}, geoCache = {};

  // ---------------- caches and small helpers ----------------
  GX.geo = function (key, make) { return geoCache[key] || (geoCache[key] = make()); };
  GX.mat = function (color, opts) {
    var key = color + '|' + (opts ? JSON.stringify(opts) : '');
    if (matCache[key]) return matCache[key];
    var o = { color: color };
    if (opts) for (var k in opts) o[k] = opts[k];
    if (o.additive) { delete o.additive; o.blending = THREE.AdditiveBlending; o.transparent = true; o.depthWrite = false; }
    var m = o.basic ? (delete o.basic, new THREE.MeshBasicMaterial(o)) : new THREE.MeshLambertMaterial(o);
    return (matCache[key] = m);
  };
  GX.box = function () { return GX.geo('box', function () { return new THREE.BoxGeometry(1, 1, 1); }); };
  GX.sphere = function (seg) { seg = seg || 12; return GX.geo('sph' + seg, function () { return new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7))); }); };
  GX.cyl = function (rt, rb, seg) { seg = seg || 10; return GX.geo('cyl' + rt + '_' + rb + '_' + seg, function () { return new THREE.CylinderGeometry(rt, rb, 1, seg); }); };
  GX.cone = function (seg) { seg = seg || 8; return GX.geo('cone' + seg, function () { return new THREE.ConeGeometry(1, 1, seg); }); };
  GX.ico = function () { return GX.geo('ico', function () { return new THREE.IcosahedronGeometry(1, 0); }); };
  GX.dodec = function () { return GX.geo('dodec', function () { return new THREE.DodecahedronGeometry(1, 0); }); };
  GX.oct = function () { return GX.geo('oct', function () { return new THREE.OctahedronGeometry(1, 0); }); };
  GX.torus = function (arc) { arc = arc || Math.PI * 2; return GX.geo('tor' + arc.toFixed(2), function () { return new THREE.TorusGeometry(1, 0.12, 6, 20, arc); }); };
  // merge simple geometries (non-indexed) into one (positions + normals)
  GX.merge = function (parts) {
    var pos = [], nor = [];
    parts.forEach(function (p) {
      var g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      g.applyMatrix4(p.m);
      var pa = g.attributes.position.array, na = g.attributes.normal.array;
      for (var i = 0; i < pa.length; i++) { pos.push(pa[i]); nor.push(na[i]); }
      g.dispose();
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return out;
  };
  // merge with a colour per part (for vertexColors materials). part: {geo, m, c, flat}
  var tmpCol = new THREE.Color();
  GX.mergeColored = function (parts) {
    var pos = [], nor = [], col = [];
    parts.forEach(function (p) {
      var g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      g.applyMatrix4(p.m);
      if (p.flat) g.computeVertexNormals();
      var pa = g.attributes.position.array, na = g.attributes.normal.array;
      tmpCol.set(p.c);
      for (var i = 0; i < pa.length; i += 3) {
        pos.push(pa[i], pa[i + 1], pa[i + 2]); nor.push(na[i], na[i + 1], na[i + 2]);
        var v = p.shade ? 1 - p.shade * (0.5 - pa[i + 1]) : 1;
        col.push(tmpCol.r * v, tmpCol.g * v, tmpCol.b * v);
      }
      g.dispose();
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  };
  // a lumpy, faceted copy of a geometry (for rocks): the same corner always moves the same way, so there are no cracks
  GX.lumpy = function (geo, amt, seed) {
    var g = geo.index ? geo.toNonIndexed() : geo.clone();
    var p = g.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      var kx = Math.round(x * 100), ky = Math.round(y * 100), kz = Math.round(z * 100);
      var f = 1 + (SC.hash(kx * 7 + seed, ky * 13 + kz * 3) - 0.5) * 2 * amt;
      p.setXYZ(i, x * f, y * f * (y > 0 ? 1 : 0.6), z * f);
    }
    g.computeVertexNormals();
    return g;
  };
  function M(x, y, z, sx, sy, sz, rx, ry, rz) {
    var m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sx, sy, sz));
    return m;
  }
  GX.M = M;
  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (renderer) t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  GX.canvasTex = canvasTex;

  // ---------------- start-up ----------------
  GX.init = function () {
    try {
      var test = document.createElement('canvas');
      if (!(test.getContext('webgl') || test.getContext('experimental-webgl'))) throw new Error('no webgl');
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      var nb = document.getElementById('nowebgl'); if (nb) nb.style.display = 'flex';
      return false;
    }
    GX.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(GX.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.LinearEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.id = 'gl';
    document.body.insertBefore(renderer.domElement, document.body.firstChild);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fdcff);
    scene.fog = new THREE.Fog(0x9fdcff, 22, 48);
    camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 420);
    hemi = new THREE.HemisphereLight(0xffffff, 0x7fbf5f, 0.62);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff4e0, 0.8);
    sun.position.set(-6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    var sc = sun.shadow.camera; sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 50;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);
    skyGroup = new THREE.Group(); scene.add(skyGroup);
    worldGroup = new THREE.Group(); scene.add(worldGroup);
    GX.entityGroup = new THREE.Group(); scene.add(GX.entityGroup);
    GX.fxGroup = new THREE.Group(); scene.add(GX.fxGroup);
    GX.menuGroup = new THREE.Group(); scene.add(GX.menuGroup);
    raycaster = new THREE.Raycaster();
    GX.lights = [new THREE.PointLight(0xffaa55, 0, 6, 2), new THREE.PointLight(0xffaa55, 0, 6, 2)];
    GX.lights.forEach(function (l) { scene.add(l); l.userData.t = 0; });
    window.addEventListener('resize', GX.resize);
    GX.scene = scene; GX.camera = camera; GX.renderer = renderer; GX.sun = sun; GX.hemi = hemi;
    initParticles();
    initDecals();
    initMarker();
    buildSky(SC.THEMES.meadow, null);
    GX.camPos = new THREE.Vector3(0, 12, 9);
    GX.camLook = new THREE.Vector3(0, 0, 0);
    var sv = SC.store.get('view');
    if (sv && (sv.mode === 'top' || sv.mode === 'behind')) { view.mode = sv.mode; view.yawIdx = sv.yawIdx | 0; view.yaw = view.yawT = -view.yawIdx * Math.PI / 2; }
    GX.ok = true;
    return true;
  };
  GX.resize = function () {
    if (!renderer) return;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };

  // ---------------- sky: gradient dome, soft clouds, the other planets ----------------
  var sky = null;
  function buildSky(th, planetId) {
    if (sky) { skyGroup.remove(sky.root); sky.own.forEach(function (o) { o.dispose(); }); }
    sky = { root: new THREE.Group(), own: [] };
    var dg = new THREE.SphereGeometry(300, 24, 14), pos = dg.attributes.position, cols = [];
    var top = new THREE.Color(th.skyTop || th.sky), hor = new THREE.Color(th.fog), mid = new THREE.Color(th.sky), c = new THREE.Color();
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i) / 300;
      if (y < 0.08) c.copy(hor); else if (y < 0.35) c.copy(hor).lerp(mid, (y - 0.08) / 0.27); else c.copy(mid).lerp(top, Math.min(1, (y - 0.35) / 0.5));
      cols.push(c.r, c.g, c.b);
    }
    dg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    var dm = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    var dome = new THREE.Mesh(dg, dm); dome.renderOrder = -10; dome.frustumCulled = false;
    sky.root.add(dome); sky.own.push(dg, dm);
    // clouds
    var cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa0b0, fog: false, transparent: true, opacity: th.skyTop === 0x150e2e ? 0.35 : 0.92, depthWrite: false });
    sky.own.push(cloudMat);
    var cparts = [];
    for (var k = 0; k < 5; k++) cparts.push({ geo: GX.sphere(8), m: M((k - 2) * 1.1, Math.sin(k * 1.7) * 0.25, Math.cos(k * 2.3) * 0.4, 1.0 + (k % 2) * 0.4, 0.6, 0.9), c: 0xffffff });
    var cg = GX.mergeColored(cparts); sky.own.push(cg);
    sky.clouds = new THREE.Group();
    for (var n = 0; n < 9; n++) {
      var cm = new THREE.Mesh(cg, cloudMat), a = n / 9 * Math.PI * 2 + 0.3, el = 0.12 + SC.hash(n, 3) * 0.16;
      cm.position.set(Math.cos(a) * 230 * Math.cos(el), 230 * Math.sin(el), Math.sin(a) * 230 * Math.cos(el));
      cm.scale.setScalar(9 + SC.hash(n, 9) * 8); cm.lookAt(0, cm.position.y, 0); cm.renderOrder = -9;
      sky.clouds.add(cm);
    }
    sky.root.add(sky.clouds);
    if (th.stars) {   // twinkly stars all around (the Home Base floats in space)
      sky.clouds.visible = false;
      var sp = [], sc2 = [], scol = new THREE.Color();
      for (var si = 0; si < 700; si++) {
        var u = SC.hash(si, 21) * 2 - 1, ph = SC.hash(si, 37) * Math.PI * 2, rr2 = Math.sqrt(1 - u * u);
        sp.push(Math.cos(ph) * rr2 * 270, u * 270, Math.sin(ph) * rr2 * 270);
        scol.setHSL(0.55 + SC.hash(si, 5) * 0.2, 0.5, 0.6 + SC.hash(si, 9) * 0.4); sc2.push(scol.r, scol.g, scol.b);
      }
      var sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(sc2, 3));
      var sm = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false });
      var stars = new THREE.Points(sg, sm); stars.renderOrder = -9; stars.frustumCulled = false;
      sky.root.add(stars); sky.own.push(sg, sm);
    }
    // the other planets hanging in the sky (the five nearest in the planet order, so the sky stays light)
    var looks = SC.PLANET_LOOK || {}, ids = Object.keys(looks), slot = 0, here = planetId ? ids.indexOf(String(planetId).toLowerCase()) : -1;
    if (here >= 0) ids = ids.filter(function (id, i) { return i !== here; }).sort(function (a, b) { return Math.abs(ids.indexOf(a) - here) - Math.abs(ids.indexOf(b) - here); });
    ids = ids.slice(0, 5);
    ids.forEach(function (id) {
      var P = looks[id], g = new THREE.Group();
      var pm = new THREE.MeshLambertMaterial({ color: P.color, emissive: new THREE.Color(P.color2).multiplyScalar(0.55), fog: false });
      var ball = new THREE.Mesh(GX.sphere(24), pm); g.add(ball); sky.own.push(pm);
      var glowM = new THREE.MeshBasicMaterial({ color: P.color, transparent: true, opacity: 0.18, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
      var glow = new THREE.Mesh(GX.sphere(16), glowM); glow.scale.setScalar(1.25); g.add(glow); sky.own.push(glowM);
      if (P.ring) {
        var rg = new THREE.RingGeometry(1.5, 2.3, 40), rm = new THREE.MeshBasicMaterial({ color: P.color2, side: THREE.DoubleSide, transparent: true, opacity: 0.6, fog: false, depthWrite: false });
        var ring = new THREE.Mesh(rg, rm); ring.rotation.x = 1.2; ring.rotation.y = 0.3; g.add(ring); sky.own.push(rg, rm);
      }
      var a2 = [0.6, 2.2, 3.9, 1.4, 3.05][slot] || slot, el2 = [0.38, 0.22, 0.55, 0.62, 0.3][slot] || 0.3, r2 = 250;
      g.position.set(Math.cos(a2) * r2 * Math.cos(el2), r2 * Math.sin(el2), -Math.abs(Math.sin(a2)) * r2 * Math.cos(el2) - 40);
      g.scale.setScalar([16, 10, 12, 7, 8][slot] || 8);
      g.children.forEach(function (o) { o.renderOrder = -8; });
      sky.root.add(g); slot++;
    });
    skyGroup.add(sky.root);
  }
  GX.buildSky = buildSky;

  // ---------------- level building ----------------
  var level = null;
  function disposeLevel() {
    if (!level) return;
    worldGroup.remove(level.group);
    level.own.forEach(function (x) { if (x && x.dispose) x.dispose(); });
    level = null;
  }
  GX.disposeLevel = disposeLevel;
  GX.level = function () { return level; };
  GX.own = function (x) { if (level) level.own.push(x); return x; };
  GX.addToLevel = function (o) { if (level) level.group.add(o); return o; };
  GX.onAnimate = function (fn) { if (level) level.anim.push(fn); };

  // Instanced scenery, split into 16x16 chunks so off-screen chunks are skipped (also by the shadow pass).
  // items: [{x, y, z, sx, sy, sz, rx, ry, rz, c, tx, ty, tall, key}]
  var CH = 16;
  GX.inst = function (geo, mat, items, opts) {
    if (!level || !items.length) return [];
    opts = opts || {};
    var groups = {};
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    var gr = geo.boundingSphere.radius + geo.boundingSphere.center.length();
    items.forEach(function (it) { var k = Math.floor(it.x / CH) + ',' + Math.floor(it.z / CH); (groups[k] || (groups[k] = [])).push(it); });
    var made = [];
    for (var k in groups) {
      var list = groups[k], g = new THREE.BufferGeometry();
      for (var an in geo.attributes) g.setAttribute(an, geo.attributes[an]);
      if (geo.index) g.setIndex(geo.index);
      var mesh = new THREE.InstancedMesh(g, mat, list.length);
      var minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9, maxY = 0, minY = 1e9, maxS = 0;
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        var r = { mesh: mesh, i: i, x: it.x, y: it.y, z: it.z, sx: it.sx, sy: it.sy, sz: it.sz, rx: it.rx || 0, ry: it.ry || 0, rz: it.rz || 0, f: 1 };
        applyRec(r, 1);
        mesh.setColorAt(i, tmpCol.set(it.c !== undefined ? it.c : 0xffffff));   // always: every instanced mesh then uses the same shader
        if (it.key) (level.recs[it.key] || (level.recs[it.key] = [])).push(r);
        if (it.tall) { var tk = Math.floor(it.x) + ',' + Math.floor(it.z); (level.tall[tk] || (level.tall[tk] = [])).push(r); }
        minX = Math.min(minX, it.x); maxX = Math.max(maxX, it.x); minZ = Math.min(minZ, it.z); maxZ = Math.max(maxZ, it.z);
        minY = Math.min(minY, it.y); maxY = Math.max(maxY, it.y);
        maxS = Math.max(maxS, Math.max(it.sx, it.sy, it.sz));
      }
      var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
      var rad = Math.sqrt((maxX - cx) * (maxX - cx) + (maxZ - cz) * (maxZ - cz) + (maxY - cy) * (maxY - cy)) + gr * maxS + 0.5;
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), rad);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = opts.cast !== false; mesh.receiveShadow = !!opts.receive;
      if (opts.order) mesh.renderOrder = opts.order;
      level.group.add(mesh); level.own.push(g); if (opts.ownMat) level.own.push(mat);
      made.push(mesh);
    }
    return made;
  };
  var tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
  function applyRec(r, f) {
    r.f = f;
    tmpE.set(r.rx, r.ry, r.rz); tmpQ.setFromEuler(tmpE);
    var keepY = r.flatY !== undefined ? r.flatY : 0;
    tmpP.set(r.x, r.y - (1 - f) * keepY, r.z);
    tmpS.set(r.sx * (f === 0 ? 0 : 1), r.sy * f, r.sz * (f === 0 ? 0 : 1));
    tmpM.compose(tmpP, tmpQ, tmpS);
    r.mesh.setMatrixAt(r.i, tmpM);
    r.mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- ground textures ----------
  function groundTex(style) {
    return canvasTex(256, 256, function (g, w, h) {
      g.fillStyle = '#ececec'; g.fillRect(0, 0, w, h);
      var i, x, y;
      for (i = 0; i < 260; i++) {   // soft blotches
        x = Math.random() * w; y = Math.random() * h;
        var r = 6 + Math.random() * 22, v = 200 + Math.floor(Math.random() * 55);
        var gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(' + v + ',' + v + ',' + v + ',0.35)'); gr.addColorStop(1, 'rgba(' + v + ',' + v + ',' + v + ',0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      if (style === 'grass' || style === 'moss') {
        for (i = 0; i < 2600; i++) {
          x = Math.random() * w; y = Math.random() * h;
          var l = 3 + Math.random() * 6, a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9, v2 = Math.random() < 0.5 ? 255 : 175 + Math.floor(Math.random() * 40);
          g.strokeStyle = 'rgba(' + v2 + ',' + v2 + ',' + v2 + ',0.55)'; g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
        }
      } else if (style === 'sand' || style === 'snow') {
        for (i = 0; i < 5000; i++) {
          x = Math.random() * w; y = Math.random() * h; var v3 = style === 'snow' ? 225 + Math.floor(Math.random() * 30) : 190 + Math.floor(Math.random() * 65);
          g.fillStyle = 'rgba(' + v3 + ',' + v3 + ',' + v3 + ',0.7)'; g.fillRect(x, y, 1.5, 1.5);
        }
        if (style === 'sand') for (i = 0; i < 14; i++) { g.strokeStyle = 'rgba(200,200,200,0.35)'; g.lineWidth = 2; y = Math.random() * h; g.beginPath(); for (x = 0; x <= w; x += 8) { var yy = y + Math.sin(x / 20 + i) * 4; if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy); } g.stroke(); }
        if (style === 'snow') for (i = 0; i < 120; i++) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      } else { // rocky / ash
        for (i = 0; i < 40; i++) {
          g.strokeStyle = 'rgba(150,150,150,0.45)'; g.lineWidth = 1.5; x = Math.random() * w; y = Math.random() * h;
          g.beginPath(); g.moveTo(x, y); for (var s = 0; s < 4; s++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; g.lineTo(x, y); } g.stroke();
        }
        for (i = 0; i < 3000; i++) { var v4 = 170 + Math.floor(Math.random() * 85); g.fillStyle = 'rgba(' + v4 + ',' + v4 + ',' + v4 + ',0.6)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      }
    });
  }
  function cliffTex() {
    return canvasTex(256, 256, function (g, w, h) {
      g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y += 10 + Math.random() * 14) {   // layers
        var v = 170 + Math.floor(Math.random() * 70);
        g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, y, w, 6 + Math.random() * 10);
      }
      for (var i = 0; i < 70; i++) {   // cracks
        g.strokeStyle = 'rgba(90,90,90,0.55)'; g.lineWidth = 1.5;
        var x = Math.random() * w, yy = Math.random() * h;
        g.beginPath(); g.moveTo(x, yy); for (var s = 0; s < 3; s++) { x += (Math.random() - 0.5) * 16; yy += 6 + Math.random() * 14; g.lineTo(x, yy); } g.stroke();
      }
      for (var k = 0; k < 2500; k++) { var v2 = 150 + Math.floor(Math.random() * 105); g.fillStyle = 'rgba(' + v2 + ',' + v2 + ',' + v2 + ',0.5)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    });
  }
  function waveTex(lava) {
    return canvasTex(128, 128, function (g, w, h) {
      g.fillStyle = lava ? '#e0e0e0' : '#e4e4e4'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < (lava ? 26 : 60); i++) {
        var x = Math.random() * w, y = Math.random() * h, l = 10 + Math.random() * 18;
        g.strokeStyle = lava ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.85)'; g.lineWidth = lava ? 3 : 1.6;
        g.beginPath();
        for (var k = 0; k <= l; k += 2) { var px = x + k, py = y + Math.sin(k / l * Math.PI) * -3; if (k === 0) g.moveTo(px % w, py); else g.lineTo(px % w, py); }
        g.stroke();
      }
      if (lava) for (var j = 0; j < 30; j++) { g.fillStyle = 'rgba(150,150,150,0.55)'; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 7, 0, 7); g.fill(); }
    });
  }
  var STYLE = { meadow: 'grass', lagoon: 'sand', frost: 'snow', storm: 'grass', shadow: 'moss', volcano: 'rock', base: 'grass', isles: 'grass', plains: 'grass', canyon: 'rock', jungle: 'moss' };

  // ---------- the ground: terraces, cliff faces, water, lava ----------
  var MG = 8;
  function tileOf(L, x, y) { return (x < 0 || y < 0 || x >= L.w || y >= L.h) ? '#' : L.tiles[y * L.w + x]; }
  function tierOf(L, x, y) { x = x < 0 ? 0 : x >= L.w ? L.w - 1 : x; y = y < 0 ? 0 : y >= L.h ? L.h - 1 : y; return L.hgt[y * L.w + x]; }
  function isWet(t) { return t === 'w' || t === 'u'; }
  function bridgeOverChasm(L, x, y) { return tileOf(L, x + 1, y) === 'v' || tileOf(L, x - 1, y) === 'v' || tileOf(L, x, y + 1) === 'v' || tileOf(L, x, y - 1) === 'v'; }
  // a floating map (the Home Base): '#' and 'v' are open sky, far below
  function isVoid(L, t) { return !!(L.def && L.def.floating) && (t === 'v' || t === '#'); }
  function drawH(L, x, y) {
    var t = tileOf(L, x, y), base = tierOf(L, x, y) * SC.world.TIER;
    if (isVoid(L, t)) return -4.5;
    if (t === 'w' || t === 'u') return base - 0.55;
    if (t === 'l') return base - 0.4;
    if (t === 'v') return -5;
    if (t === '=') return bridgeOverChasm(L, x, y) ? -5 : base - 0.55;
    return base;
  }
  GX.drawH = drawH;

  function buildGround(L, th) {
    var T = SC.world.TIER, x, y;
    var cFloor = new THREE.Color(th.floor), cFloor2 = new THREE.Color(th.floor2), cPath = new THREE.Color(th.path), cSand = new THREE.Color(th.sand),
      cBed = new THREE.Color(th.bed), cStone = new THREE.Color(th.stone), cRock = new THREE.Color(th.rock), c = new THREE.Color();
    var W0 = -MG, H0 = -MG, GW = L.w + MG * 2, GH = L.h + MG * 2;
    var hs = new Float32Array(GW * GH), cols = [];
    for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) {
      var tx = x + W0, ty = y + H0, t = tileOf(L, tx, ty);
      hs[y * GW + x] = drawH(L, tx, ty);
      var n = SC.vnoise(tx / 5, ty / 5, 3) * 0.7 + SC.vnoise(tx / 1.7, ty / 1.7, 9) * 0.3;
      c.copy(cFloor).lerp(cFloor2, n);
      if (t === ':') c.copy(cPath).lerp(cFloor, 0.12 + n * 0.12);
      else if (t === ';') c.copy(cStone).lerp(cPath, 0.3);
      else if (t === 'i') c.setHex(0xcfeaff).lerp(cFloor, 0.15);
      else if (t === '#') c.multiplyScalar(0.82);
      else if (isWet(t) || t === '=') { c.copy(cBed).lerp(cSand, 0.25); }
      else if (t === 'l') c.setHex(0x3a1a10);
      else if (t === 'v') c.setHex(0x14101e);
      else if (t === 'm' && th === SC.THEMES.shadow) c.offsetHSL(0, 0, 0.03);
      if (tierOf(L, tx, ty) > 0 && !isWet(t)) c.offsetHSL(0, 0, tierOf(L, tx, ty) * 0.018);
      c.offsetHSL(0, 0, (SC.hash(tx * 3 + 1, ty * 5 + 2) - 0.5) * 0.03);
      cols.push(c.r, c.g, c.b);
    }
    function colAt(gx, gy) { return gx < 0 || gy < 0 || gx >= GW || gy >= GH ? null : gy * GW + gx; }
    // per chunk buffers
    var chunks = {};
    function chunk(px, pz) { var k = Math.floor(px / CH) + ',' + Math.floor(pz / CH); return chunks[k] || (chunks[k] = { top: { p: [], n: [], c: [], u: [] }, side: { p: [], n: [], c: [], u: [] } }); }
    function quad(buf, a, b, cc, d, nx, ny, nz, ca, cb, cc2, cd, ua, ub, uc, ud) {
      // a,b,c,d corners [x,y,z] counter-clockwise seen from the normal side
      buf.p.push(a[0], a[1], a[2], b[0], b[1], b[2], cc[0], cc[1], cc[2], a[0], a[1], a[2], cc[0], cc[1], cc[2], d[0], d[1], d[2]);
      for (var i = 0; i < 6; i++) buf.n.push(nx, ny, nz);
      buf.c.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc2[0], cc2[1], cc2[2], ca[0], ca[1], ca[2], cc2[0], cc2[1], cc2[2], cd[0], cd[1], cd[2]);
      buf.u.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1], ua[0], ua[1], uc[0], uc[1], ud[0], ud[1]);
    }
    // corner colour: average of the touching tiles that sit at the same height
    function cornerCol(gx, gy, h) {
      var r = 0, g = 0, b = 0, n = 0;
      for (var oy = -1; oy <= 0; oy++) for (var ox = -1; ox <= 0; ox++) {
        var i = colAt(gx + ox, gy + oy);
        if (i === null || Math.abs(hs[i] - h) > 0.01) continue;
        r += cols[i * 3]; g += cols[i * 3 + 1]; b += cols[i * 3 + 2]; n++;
      }
      return n ? [r / n, g / n, b / n] : [cols[0], cols[1], cols[2]];
    }
    var rockA = [cRock.r, cRock.g, cRock.b], rockD = [cRock.r * 0.62, cRock.g * 0.62, cRock.b * 0.62], bankA = [cSand.r, cSand.g, cSand.b], bankD = [cSand.r * 0.7, cSand.g * 0.7, cSand.b * 0.7];
    for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) {
      var tx2 = x + W0, ty2 = y + H0, t2 = tileOf(L, tx2, ty2), h = hs[y * GW + x];
      var ch = chunk(tx2 + 0.5, ty2 + 0.5);
      if (isVoid(L, t2) || towerOf(L, tx2, ty2)) continue;   // tall buildings draw their own walls and roofs
      if (t2 !== 'S') {
        var c00 = cornerCol(x, y, h), c10 = cornerCol(x + 1, y, h), c11 = cornerCol(x + 1, y + 1, h), c01 = cornerCol(x, y + 1, h);
        quad(ch.top, [tx2, h, ty2], [tx2, h, ty2 + 1], [tx2 + 1, h, ty2 + 1], [tx2 + 1, h, ty2], 0, 1, 0, c00, c01, c11, c10,
          [tx2 / 3, ty2 / 3], [tx2 / 3, (ty2 + 1) / 3], [(tx2 + 1) / 3, (ty2 + 1) / 3], [(tx2 + 1) / 3, ty2 / 3]);
      }
      // faces down to lower neighbours
      var NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var d = 0; d < 4; d++) {
        var nx = x + NB[d][0], ny = y + NB[d][1];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        var nh = hs[ny * GW + nx];
        if (t2 === 'S') continue;
        if (nh >= h - 0.01) continue;
        var drop = h - nh, cliff = drop > 0.7, buf = cliff ? ch.side : ch.top, ca = cliff ? rockA : bankA, cd = cliff ? rockD : bankD;
        var lo = nh, hi = h, ex0, ez0, ex1, ez1;
        if (d === 0) { ex0 = tx2 + 1; ez0 = ty2 + 1; ex1 = tx2 + 1; ez1 = ty2; }
        else if (d === 1) { ex0 = tx2; ez0 = ty2; ex1 = tx2; ez1 = ty2 + 1; }
        else if (d === 2) { ex0 = tx2; ez0 = ty2 + 1; ex1 = tx2 + 1; ez1 = ty2 + 1; }
        else { ex0 = tx2 + 1; ez0 = ty2; ex1 = tx2; ez1 = ty2; }
        var along0 = d < 2 ? ez0 : ex0, along1 = d < 2 ? ez1 : ex1;
        if (!cliff) { ca = (h - lo < 0.5 && t2 !== 'w') ? cornerCol(x, y, h) : bankA; }
        quad(buf, [ex0, hi, ez0], [ex0, lo, ez0], [ex1, lo, ez1], [ex1, hi, ez1], NB[d][0], 0, NB[d][1], ca, cd, cd, ca,
          [along0 / 2.5, hi / 2.5], [along0 / 2.5, lo / 2.5], [along1 / 2.5, lo / 2.5], [along1 / 2.5, hi / 2.5]);
      }
    }
    var gTex = GX.own(groundTex(STYLE[L.def.theme] || 'grass')), rTex = GX.own(cliffTex());
    var gMat = GX.own(new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, map: gTex }));
    var rMat = GX.own(new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, map: rTex }));
    for (var k in chunks) {
      ['top', 'side'].forEach(function (which) {
        var b = chunks[k][which];
        if (!b.p.length) return;
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
        g.computeBoundingSphere();
        var m = new THREE.Mesh(g, which === 'top' ? gMat : rMat);
        m.receiveShadow = true; m.castShadow = which === 'side';
        level.group.add(m); level.own.push(g);
      });
    }
    // a wide plain far around everything so the edge never shows
    if (L.def.floating) { buildLiquid(L, th); floatRocks(L, th); return; }
    var oMat = GX.own(new THREE.MeshLambertMaterial({ color: new THREE.Color(th.floor).multiplyScalar(0.7) })), oy = (L.hgt[0] || 0) * T - 0.02, BIG = 260;
    var oGeo = GX.geo('outerPlane', function () { return new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); });
    [[L.w / 2, -MG - BIG / 2, L.w + 2 * MG + 2 * BIG, BIG], [L.w / 2, L.h + MG + BIG / 2, L.w + 2 * MG + 2 * BIG, BIG],
      [-MG - BIG / 2, L.h / 2, BIG, L.h + 2 * MG], [L.w + MG + BIG / 2, L.h / 2, BIG, L.h + 2 * MG]].forEach(function (r) {
      var outer = new THREE.Mesh(oGeo, oMat); outer.scale.set(r[2], 1, r[3]); outer.position.set(r[0], oy, r[1]); outer.receiveShadow = true; level.group.add(outer);
    });
    buildLiquid(L, th);
  }

  // the rocky underside of a floating island, plus a few little rocks drifting around it (one merged mesh)
  function floatRocks(L, th) {
    var parts = [], cone = GX.geo('floatCone', function () { return GX.lumpy(new THREE.ConeGeometry(1, 1, 7, 3), 0.16, 11); });
    var ico = GX.geo('floatIco', function () { return GX.lumpy(new THREE.IcosahedronGeometry(1, 0), 0.25, 5); }), top = -4.45, c = new THREE.Color();
    for (var y = 1; y < L.h; y += 3) for (var x = 1; x < L.w; x += 3) {
      if (isVoid(L, tileOf(L, x, y))) continue;
      var e = 0;
      for (var r = 1; r <= 9 && !e; r++) for (var k = 0; k < 8; k++) { var a = k / 8 * Math.PI * 2; if (isVoid(L, tileOf(L, Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r)))) { e = r; break; } }
      var hsh = SC.hash(x * 3, y * 5), depth = 1.5 + (e || 9) * 1.5 + hsh * 2;
      c.set(th.rock).offsetHSL(0, 0, (hsh - 0.5) * 0.08);
      parts.push({ geo: cone, m: M(x + 0.5, top - depth / 2, y + 0.5, 2.6, depth, 2.6, Math.PI, hsh * 6, 0), c: c.getHex() });
    }
    for (var n = 0; n < 9; n++) {
      var ang = n / 9 * Math.PI * 2 + 0.4, rr = 0.62 + SC.hash(n, 4) * 0.12, s = 0.5 + SC.hash(n, 8) * 0.9;
      var fx = L.w / 2 + Math.cos(ang) * L.w * rr, fy = L.h / 2 + Math.sin(ang) * L.h * rr;
      parts.push({ geo: ico, m: M(fx, -1.5 - SC.hash(n, 2) * 3, fy, s * 1.3, s, s * 1.2, 0, n, 0), c: th.rockCol });
      parts.push({ geo: ico, m: M(fx, -1.5 - SC.hash(n, 2) * 3 + s * 0.7, fy, s * 1.1, s * 0.3, s * 1.0, 0, n, 0), c: th.floor });
    }
    var geo = GX.own(GX.mergeColored(parts)), mat = GX.own(new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true }));
    level.group.add(new THREE.Mesh(geo, mat));
  }

  function buildLiquid(L, th) {
    var T = SC.world.TIER;
    ['water', 'lava'].forEach(function (kind) {
      var p = [], c = [], u = [], base = [];
      var cw = new THREE.Color(kind === 'water' ? th.water : 0xff6a10).multiplyScalar(kind === 'water' ? 0.82 : 1), cf = new THREE.Color(kind === 'water' ? 0xe8fbff : 0xffe070);
      function wet(t) { return kind === 'water' ? (t === 'w' || t === 'u' || t === '=') : t === 'l'; }
      for (var y = -1; y <= L.h; y++) for (var x = -1; x <= L.w; x++) {
        var t = tileOf(L, x, y);
        if (!wet(t) || (t === '=' && bridgeOverChasm(L, x, y))) continue;
        var h = tierOf(L, x, y) * T - (kind === 'water' ? 0.13 : 0.16);
        var corners = [[x, y], [x, y + 1], [x + 1, y + 1], [x, y], [x + 1, y + 1], [x + 1, y]];
        for (var i = 0; i < 6; i++) {
          var cx = corners[i][0], cy = corners[i][1];
          // foam where the corner touches land
          var land = 0;
          for (var oy = -1; oy <= 0; oy++) for (var ox = -1; ox <= 0; ox++) if (!wet(tileOf(L, cx + ox, cy + oy))) land++;
          var f = land ? 0.55 + land * 0.1 : 0;
          p.push(cx, h, cy); base.push(h);
          var col = tmpCol.copy(cw).lerp(cf, Math.min(1, f));
          c.push(col.r, col.g, col.b);
          u.push(cx / 4, cy / 4);
        }
      }
      if (!p.length) return;
      var g = GX.own(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(p.length).fill(0).map(function (v, i) { return i % 3 === 1 ? 1 : 0; }), 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
      g.computeBoundingSphere();
      var tex = GX.own(waveTex(kind === 'lava'));
      var mat = kind === 'water'
        ? new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, map: tex, transparent: true, opacity: 0.78, depthWrite: false, emissive: 0x041822 })
        : new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, map: tex });
      GX.own(mat);
      var mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = kind === 'water';
      mesh.renderOrder = kind === 'water' ? 2 : 0;
      level.group.add(mesh);
      level[kind] = { mesh: mesh, base: base, tex: tex };
    });
  }

  // ---------- tall buildings ----------
  // Each building is one small group (walls with windows, a flat roof, something on top in the planet's style), so it can
  // fade on its own when it stands between the camera and the hero. The walls are built from the tile heights, so the
  // steps up the climbable keep line up with the stone steps drawn by the scenery.
  function towerOf(L, x, y) { return L.towerAt && x >= 0 && y >= 0 && x < L.w && y < L.h ? L.towerAt[y * L.w + x] : 0; }
  GX.towerOf = towerOf;
  var TOWER_LOOK = {
    meadow: { wall: 0xf0e2c4, trim: 0xb8503a, roof: 0xc8604a },
    isles: { wall: 0xf4f4ee, trim: 0x2f8ad8, roof: 0x3aa0e8 },
    plains: { wall: 0xe0cf98, trim: 0x8a6a2a, roof: 0xffd23f },
    frost: { wall: 0xe4f2ff, trim: 0x6aa8e0, roof: 0xffffff },
    lagoon: { wall: 0xffe2c8, trim: 0xe8785a, roof: 0x56d8e8 },
    canyon: { wall: 0xd09060, trim: 0x8a4a2a, roof: 0xe8a868 },
    storm: { wall: 0x9aa0b8, trim: 0x4a5070, roof: 0xffe14a },
    jungle: { wall: 0xa8c888, trim: 0x5a7a3a, roof: 0xff7ab0 },
    shadow: { wall: 0x6a5a8a, trim: 0x2a1a4a, roof: 0x9b4dff, glow: true }
  };
  function windowTex(glow) {
    return canvasTex(64, 64, function (g, w, h) {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, h - 6, w, 6);                    // a band at each floor
      g.fillStyle = 'rgba(0,0,0,0.06)'; for (var y = 8; y < h - 8; y += 9) g.fillRect(0, y, w, 1);
      g.fillStyle = glow ? '#ffe9a0' : '#3c5478'; g.fillRect(20, 16, 24, 30);             // one window per tile and storey
      g.fillStyle = glow ? '#fff6d0' : '#6c8ab0'; g.fillRect(22, 18, 9, 12);
      g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.strokeRect(20, 16, 24, 30); g.beginPath(); g.moveTo(32, 16); g.lineTo(32, 46); g.stroke();
    });
  }
  function buildTowers(L, th) {
    level.towers = [];
    if (!L.towers || !L.towers.length) return;
    var look = TOWER_LOOK[L.towers[0].style] || TOWER_LOOK.meadow, fog = new THREE.Color(th.fog);
    var tex = GX.own(windowTex(look.glow));
    var cone = GX.geo('twCone', function () { return new THREE.ConeGeometry(1, 1, 8); }), sph = GX.geo('twSph', function () { return new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); });
    var box = GX.geo('twBox', function () { return new THREE.BoxGeometry(1, 1, 1); }), cyl = GX.geo('twCyl', function () { return new THREE.CylinderGeometry(1, 1, 1, 6); });
    L.towers.forEach(function (tw) {
      var wall = { p: [], n: [], c: [], u: [] }, roof = { p: [], n: [], c: [] }, x, y;
      // a little haze toward the sky colour, so far buildings read as a skyline but still match the fog
      var cw = new THREE.Color(look.wall).lerp(fog, 0.12), cr = new THREE.Color(look.roof).lerp(fog, 0.08);
      for (y = tw.y0; y <= tw.y1; y++) for (x = tw.x0; x <= tw.x1; x++) {
        var t = L.tiles[y * L.w + x], h = drawH(L, x, y);
        if (t === 'S') h = tierOf(L, x, y) * SC.world.TIER;           // the steps sit on a block as high as their low end
        else {
          var shade = 0.92 + SC.hash(x, y) * 0.08;
          roof.p.push(x, h, y, x, h, y + 1, x + 1, h, y + 1, x, h, y, x + 1, h, y + 1, x + 1, h, y);
          for (var i = 0; i < 6; i++) { roof.n.push(0, 1, 0); roof.c.push(cr.r * shade, cr.g * shade, cr.b * shade); }
        }
        var NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (var d = 0; d < 4; d++) {
          var nx = x + NB[d][0], ny = y + NB[d][1], nh = towerOf(L, nx, ny) === tw.idx + 1 && tileOf(L, nx, ny) === 'S' ? tierOf(L, nx, ny) * SC.world.TIER : drawH(L, nx, ny);
          if (towerOf(L, nx, ny) && towerOf(L, nx, ny) !== tw.idx + 1) nh = Math.min(nh, h);
          if (nh >= h - 0.01) continue;
          var ex0, ez0, ex1, ez1;
          if (d === 0) { ex0 = x + 1; ez0 = y + 1; ex1 = x + 1; ez1 = y; }
          else if (d === 1) { ex0 = x; ez0 = y; ex1 = x; ez1 = y + 1; }
          else if (d === 2) { ex0 = x; ez0 = y + 1; ex1 = x + 1; ez1 = y + 1; }
          else { ex0 = x + 1; ez0 = y; ex1 = x; ez1 = y; }
          var lo = nh, hi = h, a0 = d < 2 ? ez0 : ex0, a1 = d < 2 ? ez1 : ex1;
          wall.p.push(ex0, hi, ez0, ex0, lo, ez0, ex1, lo, ez1, ex0, hi, ez0, ex1, lo, ez1, ex1, hi, ez1);
          for (var k = 0; k < 6; k++) wall.n.push(NB[d][0], 0, NB[d][1]);
          var dk = 0.78;   // darker toward the bottom
          wall.c.push(cw.r, cw.g, cw.b, cw.r * dk, cw.g * dk, cw.b * dk, cw.r * dk, cw.g * dk, cw.b * dk, cw.r, cw.g, cw.b, cw.r * dk, cw.g * dk, cw.b * dk, cw.r, cw.g, cw.b);
          wall.u.push(a0, hi, a0, lo, a1, lo, a0, hi, a1, lo, a1, hi);
        }
      }
      var grp = new THREE.Group(), mats = [];
      function mesh(b, mat, uv) {
        if (!b.p.length) return;
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
        if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
        g.computeBoundingSphere();
        var m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
        grp.add(m); level.own.push(g); mats.push(mat);
      }
      mesh(wall, GX.own(new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, map: tex, fog: false })), true);
      mesh(roof, GX.own(new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, fog: false })), false);
      // something on top (one merged mesh)
      var parts = [], cx = (tw.x0 + tw.x1 + 1) / 2, cz = (tw.y0 + tw.y1 + 1) / 2, top = tw.top * SC.world.TIER, sw = tw.x1 - tw.x0 + 1, sd = tw.y1 - tw.y0 + 1, rr = Math.min(sw, sd) / 2;
      var trim = new THREE.Color(look.trim).lerp(fog, 0.1).getHex(), extra = 0;
      if (tw.topper === 'spire') { parts.push({ geo: box, m: M(cx, top + 0.15, cz, sw + 0.2, 0.3, sd + 0.2), c: trim }); var ch = Math.min(rr * 2.4, 2.6); parts.push({ geo: cone, m: M(cx, top + 0.3 + ch / 2, cz, rr * 0.95, ch, rr * 0.95), c: look.roof }); extra = ch + 0.3; }
      else if (tw.topper === 'dome') { parts.push({ geo: box, m: M(cx, top + 0.15, cz, sw + 0.2, 0.3, sd + 0.2), c: trim }); parts.push({ geo: sph, m: M(cx, top + 0.3, cz, rr * 0.9, rr * 0.9, rr * 0.9), c: look.roof }); parts.push({ geo: cyl, m: M(cx, top + 0.3 + rr * 0.9 + 0.3, cz, 0.06, 0.6, 0.06), c: trim }); extra = rr * 0.9 + 0.9; }
      else if (tw.topper === 'crown') {
        parts.push({ geo: box, m: M(cx, top + 0.12, cz, sw + 0.16, 0.24, sd + 0.16), c: trim });
        for (var bx = 0; bx < sw; bx++) for (var bz = 0; bz < sd; bz++) if ((bx === 0 || bz === 0 || bx === sw - 1 || bz === sd - 1) && (bx + bz) % 2 === 0) parts.push({ geo: box, m: M(tw.x0 + bx + 0.5, top + 0.45, tw.y0 + bz + 0.5, 0.5, 0.5, 0.5), c: look.wall });
        extra = 0.7;
      } else if (tw.topper === 'flag') {
        // the keep: a band under the roof edge and a flag on the far corner (it sits on the outside edge, not in the way)
        var fx = tw.x1 + 0.92, fz = tw.y1 + 0.92;
        parts.push({ geo: cyl, m: M(fx, top + 1.1, fz, 0.06, 2.2, 0.06), c: 0x5a4030 });
        parts.push({ geo: box, m: M(fx - 0.45, top + 1.9, fz, 0.9, 0.5, 0.04), c: look.roof });
        extra = 2.2;
      }
      // trim bands every few storeys on the solid towers
      if (!tw.climb) for (var bh = 3; bh < tw.top; bh += 3) parts.push({ geo: box, m: M(cx, bh * SC.world.TIER, cz, sw + 0.12, 0.14, sd + 0.12), c: trim });
      if (parts.length) {
        var tm = GX.own(new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, fog: false }));
        var tg = GX.own(GX.mergeColored(parts)), tmesh = new THREE.Mesh(tg, tm); tmesh.castShadow = true;
        grp.add(tmesh); mats.push(tm);
      }
      level.group.add(grp);
      level.towers.push({ tw: tw, group: grp, mats: mats, a: 1, want: 1, top: top + extra, cx: cx, cz: cz, haze: -1 });
    });
  }
  // fade the buildings that stand between the camera and the hero (ph = height of the hero's feet)
  function updateTowers(heroes, camX, camY, camZ, dt) {
    if (!level || !level.towers || !level.towers.length) return;
    var L = level.L, i;
    for (i = 0; i < level.towers.length; i++) level.towers[i].want = 1;
    for (var hi = 0; hi < heroes.length; hi++) for (var j = 1; j <= 24; j++) {
      var px = heroes[hi].x, py = heroes[hi].y, ph = heroes[hi].h;
      var t = j / 24, lx = px + (camX - px) * t, lz = py + (camZ - py) * t, ly = ph + 0.6 + (camY - ph - 0.6) * t;
      var ti = towerOf(L, Math.floor(lx), Math.floor(lz));
      if (!ti) continue;
      var rec = level.towers[ti - 1];
      if (SC.world.heightIn(L, lx, lz) > ly - 0.1 || (!rec.tw.climb && rec.top > ly + 0.4)) rec.want = 0.28;
    }
    for (i = 0; i < level.towers.length; i++) {
      var r = level.towers[i];
      r.a = SC.approach(r.a, r.want, dt * 3);
      var see = r.a < 0.99;
      // they do not use the fog (so they show on the skyline from far away); instead they get a little hazy with distance
      var hz = SC.clamp((SC.dist(camX, camZ, r.cx, r.cz) - 26) / 80, 0, 0.55);
      if (Math.abs(hz - r.haze) > 0.01) {
        r.haze = hz;
        for (var m2 = 0; m2 < r.mats.length; m2++) { r.mats[m2].color.setScalar(1 - hz); r.mats[m2].emissive.copy(scene.fog.color).multiplyScalar(hz); }
      }
      for (var m = 0; m < r.mats.length; m++) {
        var mt = r.mats[m];
        if (mt.transparent !== see) { mt.transparent = see; mt.depthWrite = !see; mt.needsUpdate = true; }
        mt.opacity = r.a;
      }
    }
  }
  GX.towerFade = function () { return level && level.towers ? level.towers.map(function (r) { return Math.round(r.a * 100) / 100; }) : []; };

  GX.buildLevel = function (L) {
    disposeLevel();
    var th = L.theme;
    level = { group: new THREE.Group(), own: [], recs: {}, tall: {}, lowered: {}, anim: [], L: L };
    worldGroup.add(level.group);
    scene.background = new THREE.Color(th.fog);
    scene.fog.color = new THREE.Color(th.fog);
    scene.fog.near = 26; scene.fog.far = L.def.arena ? 70 : 58;
    hemi.color.setHex(th.hemi[0]); hemi.groundColor.setHex(th.hemi[1]);
    hemi.intensity = th.hemiI || 0.62;
    sun.color.setHex(th.sun || 0xffffff); sun.intensity = th.sunI || 0.75;
    buildGround(L, th);
    SC.safe(function () { buildTowers(L, th); }, 'towers');
    if (SC.scenery) SC.safe(function () { SC.scenery.build(L, th); }, 'scenery');
    buildSky(th, L.def.planet);
    GX.buildMinimap(L);
    lastBlockCount = -1;
  };

  // tile changed (bush cut, thorns burnt, boulder broken, chest opened): hide its 3D parts
  GX.tileChanged = function (tx, ty) {
    if (!level) return;
    var t = SC.world.tile(tx, ty);
    var rs = level.recs[tx + ',' + ty];
    if (rs && SC.world.isFloor(t)) { rs.forEach(function (r) { applyRec(r, 0); }); delete level.recs[tx + ',' + ty]; }
    GX.minimapDirty = true;
  };

  // ---------------- keeping the hero visible ----------------
  // tall scenery between the camera and the hero is squashed down, and when a cliff hides the hero
  // the camera tips steeper and a glowing ring shows where the hero is
  var marker = null;
  function initMarker() {
    var g = new THREE.Group();
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, fog: false }));
    var arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, fog: false }));
    arrow.position.y = 1.9;
    ring.renderOrder = 999; arrow.renderOrder = 999;
    g.add(ring); g.add(arrow); g.visible = false;
    scene.add(g);
    marker = { g: g, ring: ring, arrow: arrow, a: 0 };
  }
  function updateOccluders(px, py, ph, camX, camY, camZ, dt) {
    if (!level) return false;
    var want = {}, dx = camX - px, dz = camZ - py, dl = Math.sqrt(dx * dx + dz * dz) || 1, ux = dx / dl, uz = dz / dl;
    var reach = view.mode === 'behind' ? dl + 1.0 : 3.4;
    for (var s = 0.7; s <= reach; s += 0.45) {
      var sx = px + ux * s, sz = py + uz * s;
      for (var o = -1; o <= 1; o++) {
        var qx = Math.floor(sx - uz * o * 0.7), qz = Math.floor(sz + ux * o * 0.7), k = qx + ',' + qz;
        if (level.tall[k]) want[k] = 1;
      }
    }
    // and anything right around the hero (landing or flying in a forest)
    for (var ry = -2; ry <= 2; ry++) for (var rx = -2; rx <= 2; rx++) { var kx = Math.floor(px) + rx, kz = Math.floor(py) + ry; if (level.tall[kx + ',' + kz] && SC.dist(kx + 0.5, kz + 0.5, px, py) < 1.7) want[kx + ',' + kz] = 1; }
    for (var key in want) if (!level.lowered[key]) level.lowered[key] = 1;
    for (var k2 in level.lowered) {
      var f = level.lowered[k2], target = want[k2] ? 0.22 : 1;
      f = SC.approach(f, target, dt * 4);
      level.lowered[k2] = f;
      var rs = level.tall[k2];
      if (rs) for (var i = 0; i < rs.length; i++) if (rs[i].f !== 0) applyRec(rs[i], f);
      if (f >= 1 && !want[k2]) delete level.lowered[k2];
    }
    // does the ground hide the hero?
    var L = level.L, hidden = false;
    for (var j = 1; j < 12; j++) {
      var t = j / 12, lx = px + (camX - px) * t, lz = py + (camZ - py) * t, ly = ph + 0.7 + (camY - ph - 0.7) * t;
      if (SC.world.heightIn(L, lx, lz) > ly - 0.05 && !towerOf(L, Math.floor(lx), Math.floor(lz))) { hidden = true; break; }   // buildings fade instead
    }
    return hidden;
  }

  // ---------------- the two views ----------------
  var view = GX.viewState = { mode: 'top', yawIdx: 0, yaw: 0, yawT: 0, heading: -Math.PI / 2, steep: 0, camH: 0, fov: 42 };
  function saveView() { SC.store.set('view', { mode: view.mode, yawIdx: view.yawIdx }); }
  var SIDE = ['north', 'west', 'south', 'east'];
  GX.viewName = function () {
    if (view.mode === 'behind') return 'Behind view';
    return 'Top view' + (view.yawIdx % 4 === 0 ? '' : ' (looking ' + SIDE[((view.yawIdx % 4) + 4) % 4] + ')');
  };
  function say(text) { if (SC.toast && SC.G && SC.G.toasts) SC.toast(text, 2); }
  GX.nextView = function () {
    view.mode = view.mode === 'top' ? 'behind' : 'top';
    var p = SC.G && SC.G.player;
    if (view.mode === 'behind') view.heading = p ? p.face : -Math.PI / 2;
    saveView();
    say(view.mode === 'behind' ? 'Behind view! W walks, A and D turn.' : GX.viewName());
    return view.mode;
  };
  GX.turnView = function (dir) {
    dir = dir < 0 ? -1 : 1;
    if (view.mode === 'top') { view.yawIdx += dir; view.yawT = -view.yawIdx * Math.PI / 2; saveView(); }
    else view.heading += dir * Math.PI / 2;
    say(view.mode === 'top' ? GX.viewName() : (dir < 0 ? 'Turned left' : 'Turned right'));
  };
  GX.setView = function (mode, yawIdx) { view.mode = mode; if (yawIdx !== undefined) { view.yawIdx = yawIdx; view.yaw = view.yawT = -yawIdx * Math.PI / 2; } saveView(); };
  GX.getView = function () { return view.mode; };
  // raw key direction (ix right, iy down the screen) -> direction in the world for the current view
  // free = true (player 2 in the Behind view): steer by the screen (up = away from the camera, right = to the right)
  GX.inputToWorld = function (ix, iy, free) {
    if (view.mode === 'behind' && free) {
      var hc = Math.cos(view.heading), hs = Math.sin(view.heading), wx = hc * -iy - hs * ix, wy = hs * -iy + hc * ix, wl = Math.sqrt(wx * wx + wy * wy) || 1;
      return { x: wx / wl, y: wy / wl };
    }
    if (view.mode === 'behind') {
      if (Math.abs(iy) < 0.1) return { x: 0, y: 0 };
      var f = iy < 0 ? 1 : -1;
      return { x: Math.cos(view.heading) * f, y: Math.sin(view.heading) * f };
    }
    var c = Math.cos(view.yaw), s = Math.sin(view.yaw);
    return { x: ix * c + iy * s, y: -ix * s + iy * c };
  };

  GX.pick = function (sx, sy) {
    if (!GX.ok) return null;
    var v = new THREE.Vector2(sx / window.innerWidth * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(v, camera);
    var p = SC.G && SC.G.player, h = (p && SC.world.L) ? SC.world.heightAt(p.x, p.y) + 0.3 : 0;
    var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), hit = new THREE.Vector3();
    var ok = raycaster.ray.intersectPlane(plane, hit);
    if (!ok || (p && SC.dist(hit.x, hit.z, p.x, p.y) > 40)) {
      if (!p) return null;
      var d = raycaster.ray.direction, l = Math.sqrt(d.x * d.x + d.z * d.z) || 1;
      return { x: p.x + d.x / l * 8, y: p.y + d.z / l * 8 };
    }
    return { x: hit.x, y: hit.z };
  };
  GX.groundAt = GX.pick;
  // screen spot of a point h above the GROUND at (x, y)
  GX.project = function (x, h, y, out) {
    var v = tmpP.set(x, h + (SC.world.L ? SC.world.heightAt(x, y) : 0), y).project(camera);
    out.x = (v.x + 1) / 2 * window.innerWidth; out.y = (1 - v.y) / 2 * window.innerHeight; out.vis = v.z < 1;
    return out;
  };

  var shakeAmt = 0, lookV = new THREE.Vector3(), wantV = new THREE.Vector3();
  // opts: {x, y (focus), far (dragon arena), heroX, heroY, heroH, snap, dt}
  GX.updateCamera = function (o) {
    var dt = o.dt, k = o.snap ? 1 : 1 - Math.pow(0.002, dt), W = SC.world;
    var groundH = W.heightAt(o.heroX, o.heroY), fly = o.heroFly || 0;
    // flying high: the camera looks at a point between the hero and the ground below, and pulls back a little
    view.fly = o.snap ? fly : SC.lerp(view.fly || 0, fly, Math.min(1, dt * 4));
    var camTarget = (o.focusH !== undefined ? o.focusH : groundH) + view.fly * 0.85;
    view.camH = o.snap ? camTarget : SC.lerp(view.camH, camTarget, Math.min(1, dt * 6));
    var spread = o.spread || 0;   // two players: how far apart they are (the camera lifts out to keep both in view)
    view.spread = o.snap ? spread : SC.lerp(view.spread || 0, spread, Math.min(1, dt * 3));
    // turning in the Behind view (A / D or the arrow keys)
    var G = SC.G, I = SC.input;
    if (view.mode === 'behind' && G && G.screen === 'play' && I) {
      var two = G.players && G.players.length > 1;   // two players: only player 1's keys turn the shared camera
      var turn = (I.isDown('KeyD') || (!two && I.isDown('ArrowRight')) ? 1 : 0) - (I.isDown('KeyA') || (!two && I.isDown('ArrowLeft')) ? 1 : 0);
      view.heading += turn * 2.3 * dt;
      var p = G.player;
      if (turn && p && !p.moving && !(p.swingT > 0) && !p.dead) p.face = view.heading;
    }
    view.yaw = o.snap ? view.yawT : view.yaw + SC.angDiff(view.yaw, view.yawT) * Math.min(1, dt * 7);
    var fx = o.x, fy = o.y - (GX.camNorth || 0), cx, cy, cz, lx, ly, lz, fov;
    if (view.mode === 'behind') {
      var vf = view.fly, dist = (o.far ? 7.5 : 4.6) + vf * 0.35, up = o.far ? 4.2 : 2.7;
      var hx = Math.cos(view.heading), hy = Math.sin(view.heading), gB = W.heightAt(o.heroX, o.heroY);
      view.lift = SC.approach(view.lift || 0, o.blocked ? 1.8 : 0, dt * 2.5);
      cx = o.heroX - hx * (dist - view.lift * 0.6); cz = o.heroY - hy * (dist - view.lift * 0.6); cy = gB + up + view.lift + vf * 1.1;
      // keep above the ground between hero and camera
      for (var s = 1; s <= 6; s++) { var t = s / 6, gh = W.heightAt(o.heroX - hx * dist * t, o.heroY - hy * dist * t) + 1.3; if (gh > cy) cy = gh; }
      // high up: look down past the hero at the ground ahead, so both stay in the picture
      lx = o.heroX + hx * (2.2 + vf * 0.5); lz = o.heroY + hy * (2.2 + vf * 0.5); ly = gB + vf * 0.55 + (o.far ? 1.2 : 0.55);
      fov = 58;
    } else {
      var lift2 = view.fly * 0.55 + view.spread * 0.55;
      var oy = o.far ? 16.5 : 8.4 + view.steep * 3.2 + lift2, oz = o.far ? 12 : 7.0 - view.steep * 2.4 + lift2 * 0.62;
      var sn = Math.sin(view.yaw), cs = Math.cos(view.yaw);
      cx = fx + sn * oz; cz = fy + cs * oz; cy = view.camH + oy;
      lx = fx; lz = fy; ly = view.camH;
      fov = 42;
    }
    if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = o.snap ? fov : SC.lerp(camera.fov, fov, Math.min(1, dt * 5)); camera.updateProjectionMatrix(); }
    wantV.set(cx, cy, cz);
    GX.camPos.lerp(wantV, k);
    GX.camLook.lerp(lookV.set(lx, ly, lz), k);
    shakeAmt = Math.max(0, shakeAmt - dt * 1.8);
    var sh = shakeAmt * shakeAmt * 0.6;
    camera.position.set(GX.camPos.x + (Math.random() - 0.5) * sh, GX.camPos.y + (Math.random() - 0.5) * sh, GX.camPos.z);
    camera.lookAt(GX.camLook);
    // sun and its shadow follow the hero
    sun.position.set(o.heroX - 7, view.camH + 16, o.heroY + 6); sun.target.position.set(o.heroX, view.camH, o.heroY);
    skyGroup.position.copy(camera.position);
    if (sky && sky.clouds) sky.clouds.rotation.y += dt * 0.004;
    // hero visibility
    var hidden = updateOccluders(o.heroX, o.heroY, groundH + (o.heroFly || 0), camera.position.x, camera.position.y, camera.position.z, dt);
    updateTowers([{ x: o.heroX, y: o.heroY, h: groundH + fly }].concat(o.others || []), camera.position.x, camera.position.y, camera.position.z, dt);
    if (view.mode === 'top') view.steep = SC.approach(view.steep, hidden ? 1 : 0, dt * (hidden ? 2.5 : 0.8));
    marker.a = SC.approach(marker.a, hidden || o.blocked ? 1 : 0, dt * 4);
    marker.g.visible = marker.a > 0.02;
    if (marker.g.visible) {
      marker.g.position.set(o.heroX, groundH + 0.05 + (o.heroFly || 0), o.heroY);
      marker.ring.material.opacity = 0.85 * marker.a; marker.arrow.material.opacity = 0.9 * marker.a;
      marker.arrow.position.y = 1.9 + Math.sin(G ? G.realT * 6 : 0) * 0.1;
    }
  };
  GX.showWorld = function (v) { worldGroup.visible = v; GX.entityGroup.visible = v; GX.fxGroup.visible = v; GX.menuGroup.visible = !v; if (!v) { GX.hideDecals(); marker.g.visible = false; } };
  GX.shake = function (a) { shakeAmt = Math.min(1.2, Math.max(shakeAmt, a)); };

  // ---------------- drawing + the automatic quality drop ----------------
  var lastNow = 0, slowT = 0, okT = 0, quality = 2;
  GX.render = function () {
    var now = performance.now(), fdt = lastNow ? (now - lastNow) / 1000 : 0.016;
    lastNow = now;
    if (!SC.testMode && SC.G && SC.G.screen === 'play' && fdt < 0.5) {
      if (fdt > 1 / 42) { slowT += fdt; okT = 0; } else { okT += fdt; if (okT > 1.5) slowT = Math.max(0, slowT - fdt); }
      if (slowT > 3 && quality > 0) { GX.setQuality(quality - 1); slowT = 0; }
    }
    renderer.render(scene, camera);
  };
  // 2 = full, 1 = no real shadows, 0 = no shadows and a smaller picture
  GX.setQuality = function (q) {
    quality = q;
    sun.castShadow = q >= 2;
    renderer.setPixelRatio(q >= 1 ? GX.pixelRatio : 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  GX.quality = function () { return quality; };

  GX.setSky = function (skyCol, fog, near, far) {
    scene.background = new THREE.Color(fog); scene.fog.color = new THREE.Color(fog); scene.fog.near = near; scene.fog.far = far;
  };
  GX.setHemi = function (a, b, i) { hemi.color.setHex(a); hemi.groundColor.setHex(b); hemi.intensity = i; sun.intensity = 0.8; sun.color.setHex(0xfff4e0); };
  GX.menuSky = function () { buildSky({ sky: 0x8fd4ff, skyTop: 0x3f8fe8, fog: 0xc8ecff }, null); };
  GX.sunAt = function (x, h, y) { sun.position.set(x - 7, h + 16, y + 6); sun.target.position.set(x, h, y); skyGroup.position.copy(camera.position); };

  GX.animateTiles = function (t, dt) {
    if (!level) return;
    var lq = level.water;
    if (lq) {
      lq.tex.offset.set(t * 0.03, t * 0.05);
      var pa = lq.mesh.geometry.attributes.position, arr = pa.array, b = lq.base;
      for (var i = 0, j = 0; j < b.length; i += 3, j++) arr[i + 1] = b[j] + Math.sin(arr[i] * 1.7 + t * 1.6) * 0.035 + Math.sin(arr[i + 2] * 2.1 - t * 1.25) * 0.03;
      pa.needsUpdate = true;
    }
    if (level.lava) level.lava.tex.offset.set(Math.sin(t * 0.25) * 0.08, t * 0.03);
    for (var k = 0; k < level.anim.length; k++) level.anim[k](t, dt);
  };

  // ---------------- particles ----------------
  var PCAP = 600, psys = [];
  function makeSystem(additive) {
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(PCAP * 3), colr = new Float32Array(PCAP * 3), size = new Float32Array(PCAP), alpha = new Float32Array(PCAP);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    geo.setDrawRange(0, 0);
    var mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: window.innerHeight / 2 } },
      vertexShader: 'attribute float size; attribute vec3 color; attribute float alpha; varying vec3 vC; varying float vA; uniform float scale;' +
        'void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/-mv.z; gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c); if(d>0.5) discard; gl_FragColor=vec4(vC, vA*smoothstep(0.5,0.25,d)); }',
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    var pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; pts.renderOrder = 5;
    scene.add(pts);
    var sys = { pts: pts, geo: geo, pos: pos, col: colr, size: size, alpha: alpha, mat: mat, n: 0, P: [] };
    for (var i = 0; i < PCAP; i++) sys.P.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 0.1, s1: 0.1, r: 1, g: 1, b: 1, grav: 0, a0: 1, floor: 0 });
    return sys;
  }
  function initParticles() { psys = [makeSystem(false), makeSystem(true)]; }

  // kind: [additive, colors, size, speed, life, gravity, upward, grow]
  var KINDS = {
    hit: [1, [0xffffff, 0xfff2a0], 0.22, 4, 0.25, 0, 0.5, 0.3],
    breath: [0, [0xff6a10, 0xffa020, 0xffe040, 0xff4a00], 0.6, 1, 0.55, 0, 0.3, 2.2],
    star: [0, [0xfff27a, 0xffffff, 0xffc83a], 0.3, 3.5, 0.6, -3, 1.5, 0.5],
    smoke: [0, [0xe8e8f0, 0xcfd0d8, 0xffffff], 0.5, 1.4, 0.7, 0, 1.2, 2.2],
    dust: [0, [0xd8c8a0, 0xc8b890], 0.28, 1.2, 0.45, 0, 0.6, 1.8],
    fire: [0, [0xff8a1a, 0xffd23f, 0xff5a10], 0.38, 2.2, 0.5, 0, 2.2, 0.4],
    ember: [0, [0xffb03a, 0xff6a10], 0.2, 0.6, 0.35, 0, 1.0, 0.3],
    water: [0, [0x5ab8ff, 0xbfe8ff, 0xffffff], 0.2, 3.2, 0.55, -9, 2.5, 0.8],
    ice: [0, [0xbff4ff, 0x7fdcff, 0xffffff], 0.2, 2.6, 0.5, -2, 1, 0.6],
    spark: [1, [0xfff27a, 0xffffff, 0xffe14a], 0.16, 6, 0.3, 0, 1, 0.3],
    shadow: [0, [0x6a3ab0, 0x9b4dff, 0x2a1a4a], 0.35, 1.2, 0.6, 0, 1, 1.6],
    life: [0, [0x7dff8a, 0xd8ffb0, 0xfff27a], 0.22, 2.5, 0.9, -1, 2.5, 0.6],
    leaf: [0, [0x3faa3a, 0x6fd04a, 0x2a8a2a], 0.18, 2.6, 0.7, -7, 2.5, 1],
    rock: [0, [0x9a8a78, 0x7a6a5a, 0xb8a890], 0.2, 3.6, 0.7, -14, 4, 1],
    gem: [0, [0x7dffcf, 0xffffff, 0x8ad8ff], 0.18, 2, 0.4, 0, 1.5, 0.4],
    heart: [0, [0xff6b8a, 0xffb0c0], 0.24, 2, 0.6, -1, 2, 0.6],
    wind: [0, [0xeafff4, 0xc8f5dc, 0xffffff], 0.24, 2.4, 0.5, 0, 0.8, 1.4],
    snow: [0, [0xffffff], 0.12, 0.3, 4, -1.2, 0, 1],
    rain: [0, [0xb8c8ff], 0.08, 0.2, 0.6, -24, 0, 1],
    firefly: [1, [0x9fffd8, 0xfff27a], 0.14, 0.4, 2.5, 0, 0.2, 1],
    ash: [1, [0xff8a3a, 0xffc06a], 0.1, 0.4, 2.5, 0, 0.8, 1],
    pollen: [1, [0xffffc0, 0xffffff], 0.08, 0.3, 3, 0, 0.3, 1],
    fallleaf: [0, [0x8ac84a, 0xc8d84a, 0x6aa83a], 0.12, 0.3, 4, -0.5, 0, 1],
    puff: [0, [0x3a1a5a, 0x5a2a8a, 0x241038], 0.7, 1.6, 0.9, 0, 1.2, 1.8],
    bubble: [0, [0xdff8ff, 0xffffff], 0.14, 0.6, 0.8, 1.5, 1.2, 1.3]
  };
  var tmpC = new THREE.Color();
  function spawn(x, y, z, kind, vx, vy, vz) {
    var k = KINDS[kind] || KINDS.hit, sys = psys[k[0]];
    var p;
    if (sys.n < PCAP) p = sys.P[sys.n++];
    else p = sys.P[Math.floor(Math.random() * PCAP)];
    tmpC.setHex(k[1][Math.floor(Math.random() * k[1].length)]);
    p.r = tmpC.r; p.g = tmpC.g; p.b = tmpC.b;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.max = p.life = k[4] * (0.7 + Math.random() * 0.6);
    p.s0 = k[2] * (0.7 + Math.random() * 0.6); p.s1 = p.s0 * k[7];
    p.grav = k[5]; p.a0 = 1;
    p.floor = SC.world.L ? SC.world.heightAt(x, z) + 0.03 : 0.03;
    return p;
  }
  // absolute heights (world units)
  GX.burst = function (x, h, y, kind, n) {
    if (!GX.ok) return;
    var k = KINDS[kind] || KINDS.hit;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = k[3] * (0.3 + Math.random() * 0.8);
      spawn(x + (Math.random() - 0.5) * 0.2, h + (Math.random() - 0.5) * 0.2, y + (Math.random() - 0.5) * 0.2, kind, Math.cos(a) * s, k[6] * (0.4 + Math.random()), Math.sin(a) * s);
    }
  };
  GX.emit = function (x, h, y, kind, vx, vy, vz) { if (GX.ok) spawn(x, h, y, kind, vx, vy, vz); };
  GX.updateParticles = function (dt) {
    for (var s = 0; s < psys.length; s++) {
      var sys = psys[s];
      for (var i = sys.n - 1; i >= 0; i--) {
        var p = sys.P[i];
        p.life -= dt;
        if (p.life <= 0) { var last = sys.P[sys.n - 1]; sys.P[sys.n - 1] = p; sys.P[i] = last; sys.n--; continue; }
        p.vy += p.grav * dt;
        p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < p.floor && p.grav < 0) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; }
      }
      for (var j = 0; j < sys.n; j++) {
        var q = sys.P[j], f = q.life / q.max;
        sys.pos[j * 3] = q.x; sys.pos[j * 3 + 1] = q.y; sys.pos[j * 3 + 2] = q.z;
        sys.col[j * 3] = q.r; sys.col[j * 3 + 1] = q.g; sys.col[j * 3 + 2] = q.b;
        sys.size[j] = q.s1 + (q.s0 - q.s1) * f;
        sys.alpha[j] = Math.min(1, f * 2.2);
      }
      sys.geo.setDrawRange(0, sys.n);
      sys.geo.attributes.position.needsUpdate = true; sys.geo.attributes.color.needsUpdate = true;
      sys.geo.attributes.size.needsUpdate = true; sys.geo.attributes.alpha.needsUpdate = true;
      sys.mat.uniforms.scale.value = window.innerHeight * renderer.getPixelRatio() / 2 / Math.tan(camera.fov * Math.PI / 360);
    }
  };
  GX.clearParticles = function () { psys.forEach(function (s) { s.n = 0; s.geo.setDrawRange(0, 0); }); };
  GX.particleCount = function () { return psys[0].n + psys[1].n; };

  // ---------------- ground decals (warnings, rings) ----------------
  var decals = [];
  function initDecals() {
    var circle = new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2);
    var ring = new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2);
    var plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    GX.decalGeo = { circle: circle, ring: ring, plane: plane };
    for (var i = 0; i < 44; i++) {
      var mat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      var mat2 = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      var fill = new THREE.Mesh(circle, mat), edge = new THREE.Mesh(ring, mat2);
      var g = new THREE.Group(); g.add(fill); g.add(edge); g.visible = false;
      fill.renderOrder = 3; edge.renderOrder = 4;
      scene.add(g);
      decals.push({ g: g, fill: fill, edge: edge, used: false });
    }
  }
  var coneGeos = {};
  function coneGeo(half) {
    var k = half.toFixed(2);
    return coneGeos[k] || (coneGeos[k] = new THREE.CircleGeometry(1, 24, Math.PI / 2 - half, half * 2).rotateX(-Math.PI / 2));
  }
  var coneEdgeGeos = {};
  function coneEdge(half) {
    var k = half.toFixed(2);
    return coneEdgeGeos[k] || (coneEdgeGeos[k] = new THREE.RingGeometry(0.93, 1, 24, 1, Math.PI / 2 - half, half * 2).rotateX(-Math.PI / 2));
  }
  // draw a list of decal requests this frame: {shape:'circle'|'cone'|'line'|'ring', x,y,r,ang,half,len,width,color,fill(0..1),alpha}
  GX.drawDecals = function (list) {
    var W = SC.world;
    for (var i = 0; i < decals.length; i++) {
      var d = decals[i], q = list[i];
      if (!q) { d.g.visible = false; continue; }
      d.g.visible = true;
      d.g.position.set(q.x, (q.h !== undefined ? q.h : (W.L ? W.heightAt(q.x, q.y) : 0)) + 0.04 + i * 0.002, q.y);
      d.fill.material.color.set(q.color); d.edge.material.color.set(q.color);
      d.fill.material.opacity = q.alpha * 0.45; d.edge.material.opacity = Math.min(1, q.alpha * 1.1);
      if (q.shape === 'circle' || q.shape === 'ring') {
        d.fill.geometry = GX.decalGeo.circle; d.edge.geometry = GX.decalGeo.ring;
        d.g.rotation.set(0, 0, 0);
        d.edge.scale.set(q.r, 1, q.r);
        var f = q.shape === 'ring' ? 0 : q.fill;
        d.fill.visible = f > 0.01;
        d.fill.scale.set(q.r * f, 1, q.r * f);
      } else if (q.shape === 'cone') {
        d.fill.geometry = coneGeo(q.half); d.edge.geometry = coneEdge(q.half);
        d.g.rotation.set(0, -q.ang - Math.PI / 2, 0);
        d.edge.scale.set(q.len, 1, q.len);
        d.fill.visible = true;
        d.fill.scale.set(q.len * q.fill, 1, q.len * q.fill);
      } else if (q.shape === 'line') {
        d.fill.geometry = GX.decalGeo.plane; d.edge.geometry = GX.decalGeo.plane;
        d.g.rotation.set(0, Math.PI / 2 - q.ang, 0);
        d.edge.scale.set(q.width, 1, q.len); d.edge.material.opacity = q.alpha * 0.35;
        d.fill.visible = true;
        d.fill.scale.set(q.width * 0.6, 1, q.len * q.fill);
      }
    }
  };
  GX.hideDecals = function () { decals.forEach(function (d) { d.g.visible = false; }); };

  // point lights for fireballs and explosions
  GX.updateLights = function (dt) {
    GX.lights.forEach(function (l) { if (l.userData.t > 0) { l.userData.t -= dt; l.intensity = Math.max(0, l.userData.t / l.userData.max) * 2.2; } else l.intensity = 0; });
  };
  GX.light = function (x, y, color, dur) {
    if (!GX.ok) return;
    var l = GX.lights[0].userData.t <= GX.lights[1].userData.t ? GX.lights[0] : GX.lights[1];
    l.color.setHex(color); l.position.set(x, 1.2 + (SC.world.L ? SC.world.heightAt(x, y) : 0), y); l.userData.t = l.userData.max = dur;
  };

  // ---------------- minimap (a little 2D canvas the HUD draws) ----------------
  var lastBlockCount = -1;
  var MINI = { '#': 'rgba(30,40,30,0.9)', '^': '#2f6a34', '*': '#8a8478', '|': '#d8d0c0', '%': '#b8b0a0', '&': '#c86a3a', '$': '#ff8a2a', F: '#c83a3a', '+': '#a07a4a', '@': '#a07a4a',
    y: '#9fe8ff', d: '#6a6a7a', n: '#ffe14a', U: '#ffb03a', A: '#ff7a3a', w: '#3fa7e0', u: '#c8c0b0', '=': '#a07040', l: '#ff5a10', v: '#0e0a14', b: '#3f8a3a', t: '#8a3a6a', k: '#a89a88',
    T: '#ffd23f', O: '#a07a3a', G: '#ffffff', ':': null, ';': null, S: '#e8e0d0', W: '#f0e2b0', Q: '#ff9a2a', Y: '#ffd23f', J: '#ffe36a', Z: '#f4ecff' };
  GX.buildMinimap = function (L) {
    var c = GX.minimap || (GX.minimap = document.createElement('canvas'));
    var s = 3;
    c.width = L.w * s; c.height = L.h * s;
    var g = c.getContext('2d'), th = L.theme;
    var base = new THREE.Color(th.floor), path = new THREE.Color(th.path), stone = new THREE.Color(th.stone), cc = new THREE.Color();
    for (var y = 0; y < L.h; y++) for (var x = 0; x < L.w; x++) {
      var t = L.tiles[y * L.w + x], tier = L.hgt[y * L.w + x], col = MINI[t];
      if (isVoid(L, t)) continue;
      if (!col) {
        cc.copy(t === ':' ? path : t === ';' ? stone : base);
        if (t === 'i') cc.setHex(0xcfeaff);
        cc.offsetHSL(0, 0, tier * 0.08 - 0.04);
        col = '#' + cc.getHexString();
      }
      g.fillStyle = col;
      g.fillRect(x * s, y * s, s, s);
      // dark line along cliff tops
      g.fillStyle = 'rgba(20,10,30,0.55)';
      if (x > 0 && L.hgt[y * L.w + x - 1] < tier) g.fillRect(x * s, y * s, 1, s);
      if (x < L.w - 1 && L.hgt[y * L.w + x + 1] < tier) g.fillRect(x * s + s - 1, y * s, 1, s);
      if (y > 0 && L.hgt[(y - 1) * L.w + x] < tier) g.fillRect(x * s, y * s, s, 1);
      if (y < L.h - 1 && L.hgt[(y + 1) * L.w + x] < tier) g.fillRect(x * s, y * s + s - 1, s, 1);
    }
    var G = SC.G;
    // portal blocks still lying around
    var blocks = [];
    if (G && G.pickups && G.L === L && G.pickups.some(function (k) { return k.kind === 'block'; })) G.pickups.forEach(function (k) { if (k.kind === 'block') blocks.push([k.x, k.y]); });
    else if (!(G && G.L === L && G.blocksSeen)) L.blocks.forEach(function (b) { blocks.push([b.tx + 0.5, b.ty + 0.5]); });
    blocks.forEach(function (b) { g.fillStyle = '#2a1050'; g.fillRect(b[0] * s - 3, b[1] * s - 3, 6, 6); g.fillStyle = '#7dfcff'; g.fillRect(b[0] * s - 2, b[1] * s - 2, 4, 4); });
    // friendly people
    var npcs = (G && G.L === L && G.npcs) ? G.npcs.map(function (n) { return [n.x, n.y, n.role]; }) : L.npcs.map(function (n) { return [n.tx + 0.5, n.ty + 0.5, n.role]; });
    npcs.forEach(function (n) { g.fillStyle = '#2a1050'; g.beginPath(); g.arc(n[0] * s, n[1] * s, 3.5, 0, 7); g.fill(); g.fillStyle = n[2] === 'smith' ? '#ffa04a' : '#7dff8a'; g.beginPath(); g.arc(n[0] * s, n[1] * s, 2.3, 0, 7); g.fill(); });
    // the portal
    if (L.gate) {
      var gx = (L.gate.tx + 0.5) * s, gy = (L.gate.ty + 0.5) * s;
      g.strokeStyle = '#2a1050'; g.lineWidth = 3; g.beginPath(); g.arc(gx, gy, 5, 0, 7); g.stroke();
      g.strokeStyle = L.gateOpen ? '#9ff0ff' : '#e8d8ff'; g.lineWidth = 2; g.beginPath(); g.arc(gx, gy, 5, 0, 7); g.stroke();
    }
    GX.minimapDirty = false;
  };
  // the HUD asks for a rebuild only when dirty; the view marks it dirty when blocks are picked up
  GX.checkMinimap = function () {
    var G = SC.G; if (!G || !G.pickups) return;
    var n = 0; for (var i = 0; i < G.pickups.length; i++) if (G.pickups[i].kind === 'block') n++;
    var key = n * 2 + (G.L && G.L.gateOpen ? 1 : 0);
    if (key !== lastBlockCount) { if (n > 0) G.blocksSeen = true; lastBlockCount = key; GX.minimapDirty = true; }
  };

  // ---------------- the SC.fx interface used by the game (heights here are above the ground) ----------------
  function gh(x, y) { return SC.world.L ? SC.world.heightAt(x, y) : 0; }
  SC.fx = {
    burst: function (x, h, y, kind, n) { GX.burst(x, h + gh(x, y), y, kind, n); },
    shake: function (a) { GX.shake(a); },
    ring: function (x, y, color, r) { if (SC.G) SC.G.effects.push({ kind: 'ring', x: x, y: y, r0: r * 0.3, r1: r, color: color, t: 0, dur: 0.45 }); },
    ripple: function (x, y) { if (SC.G) SC.G.effects.push({ kind: 'ripple', x: x, y: y, t: 0, dur: 0.8 }); },
    flash: function (color, dur) { if (SC.G) SC.G.flash = { color: color, t: dur, dur: dur }; },
    light: function (x, y, color, dur) { GX.light(x, y, color, dur); }
  };
})();
