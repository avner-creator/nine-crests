// Nine Crests - keeps the 3D picture in step with the game: one model per hero/enemy/pickup/projectile/friendly person,
// procedural animation, the portal, carried portal blocks, effects, ground warnings, weather, and the 3D stage behind the menus.
// Every height is "ground height + how high the thing is above the ground".
(function () {
  'use strict';
  var SC = window.SC, GX = SC.gfx, MD = SC.models;
  var V = SC.view = {};
  GX.npcsDrawn = true;   // tells the rules side not to draw its own 2D markers for the friendly people
  var live = {}, pools = {}, frame = 0, vid = 0;
  var levelProps = null, portals = [], carried = [], heroModels = [], heroGlow = null;
  var tmpV = new THREE.Vector3();
  function W() { return SC.world; }
  function gh(x, y) { return SC.world.L ? SC.world.heightAt(x, y) : 0; }

  // every mesh of a model casts a real shadow (except glows, blobs and see-through bits)
  function shadows(root) {
    root.traverse(function (o) {
      if (!o.isMesh) return;
      var m = o.material;
      o.castShadow = !(o.userData.noFlash || (m && (m.transparent || m.blending === THREE.AdditiveBlending || m.isMeshBasicMaterial)));
    });
  }
  function addToGroup(m, grp) { if (m.root.parent !== grp) grp.add(m.root); m.root.visible = true; }
  function get(key, kind, maker, grp) {
    var r = live[key];
    if (!r) {
      var pool = pools[kind];
      var model = (pool && pool.length) ? pool.pop() : maker();

      r = live[key] = { model: model, kind: kind, mark: 0, t: 0, fresh: true };
      addToGroup(model, grp || GX.entityGroup);
    }
    r.mark = frame;
    return r;
  }
  function sweep() {
    for (var k in live) {
      var r = live[k];
      if (r.mark === frame) { r.fresh = false; continue; }
      r.model.root.visible = false;
      if (r.model.shadow && r.model.shadow.parent && r.model.shadow.parent !== r.model.root) r.model.shadow.parent.remove(r.model.shadow);
      if (r.model.icon && r.model.icon.parent) r.model.icon.parent.remove(r.model.icon);
      if (r.kind.charAt(0) === '!') { if (r.model.root.parent) r.model.root.parent.remove(r.model.root); }
      else (pools[r.kind] || (pools[r.kind] = [])).push(r.model);
      delete live[k];
    }
  }
  V.clearAll = function () {
    for (var k in live) { var r = live[k]; if (r.model.root.parent) r.model.root.parent.remove(r.model.root); if (r.model.shadow && r.model.shadow.parent && r.model.shadow.parent !== r.model.root) r.model.shadow.parent.remove(r.model.shadow); if (r.model.icon && r.model.icon.parent) r.model.icon.parent.remove(r.model.icon); }
    live = {};
    for (var p in pools) pools[p].forEach(function (m) { if (m.root.parent) m.root.parent.remove(m.root); });
    pools = {};
    heroModels.forEach(function (hm) { if (hm && hm.root.parent) hm.root.parent.remove(hm.root); });
    heroModels = []; heroGlow = null;
    if (levelProps) levelProps.forEach(function (m) { if (m.root.parent) m.root.parent.remove(m.root); });
    levelProps = null;
    if (SC.templeView) SC.templeView.clear();
    portals.forEach(function (pm) { if (pm.root.parent) pm.root.parent.remove(pm.root); pm.own.forEach(function (o) { o.dispose(); }); });
    portals = [];
    carried.forEach(function (c) { if (c.parent) c.parent.remove(c); });
    carried = [];
    GX.clearParticles();
    GX.hideDecals();
  };

  // ---------- portals (stone ring with block slots; swirls open). A level has one exit portal; the Home Base has ten planet portals ----------
  var swirlTex = {};
  function css(hex) { return '#' + new THREE.Color(hex).getHexString(); }
  function getSwirl(c1, c2) {
    var key = (c1 === undefined ? 'blue' : c1 + '_' + c2);
    if (swirlTex[key]) return swirlTex[key];
    var a1 = c1 === undefined ? '#9ff0ff' : css(new THREE.Color(c1).lerp(new THREE.Color(0xffffff), 0.45).getHex()), a2 = c1 === undefined ? '#5a7aff' : css(c2);
    var tex = swirlTex[key] = GX.canvasTex(128, 128, function (g, w, h) {
      var gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, a1); gr.addColorStop(0.75, a2); gr.addColorStop(1, 'rgba(60,40,200,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3;
      for (var a = 0; a < 5; a++) { g.beginPath(); for (var r = 4; r < 60; r += 2) { var an = a / 5 * Math.PI * 2 + r * 0.09; g.lineTo(64 + Math.cos(an) * r, 64 + Math.sin(an) * r); } g.stroke(); }
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }
  // a name board over a planet portal
  function nameBoard(text, color) {
    var tex = GX.canvasTex(256, 64, function (g, w, h) {
      g.fillStyle = 'rgba(30,22,60,0.92)'; g.beginPath();
      if (g.roundRect) g.roundRect(4, 4, w - 8, h - 8, 18); else g.rect(4, 4, w - 8, h - 8);
      g.fill(); g.lineWidth = 5; g.strokeStyle = color; g.stroke();
      g.font = 'bold 40px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = '#1a1030'; g.strokeText(text, w / 2, h / 2 + 2);
      g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 2);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    var m = new THREE.Mesh(GX.geo('boardPlane', function () { return new THREE.PlaneGeometry(1, 1); }), mat);
    m.scale.set(1.9, 0.475, 1); m.userData.noFlash = true; m.renderOrder = 3;
    return { mesh: m, own: [tex, mat] };
  }
  // spot {tx, ty}; look (planet portals): {ring, glow, c2, name, nameCss, scale}; st() -> {need, fitted, open}
  function buildPortal(spot, look, st) {
    var gx = spot.tx, gy = spot.ty, th = SC.world.L.theme;
    var root = new THREE.Group(), inner = new THREE.Group();
    root.add(inner);
    root.position.set(gx + 0.5, gh(gx + 0.5, gy + 0.5), gy + 0.5);
    if (look && look.scale) root.scale.setScalar(look.scale);
    // face toward the open side
    var Wd = W(), dirs = [[0, 1, 0], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2], [0, -1, Math.PI]];
    if (look && look.face) inner.rotation.y = Math.atan2(look.face[0], look.face[1]);   // planet portals at the Home Base face the plaza
    else {
      // the side with the most open ground in front (ties: south, east, west, north)
      var best = -2, bi = 0;
      for (var i = 0; i < 4; i++) {
        var n = 0;
        for (var k = 1; k <= 4; k++) for (var sd = -1; sd <= 1; sd++) {
          if (Wd.isFloor(Wd.tile(gx + dirs[i][0] * k + (dirs[i][0] ? 0 : sd), gy + dirs[i][1] * k + (dirs[i][1] ? 0 : sd)))) n++;
        }
        if (!Wd.isFloor(Wd.tile(gx + dirs[i][0], gy + dirs[i][1]))) n = -1;
        if (n > best) { best = n; bi = i; }
      }
      inner.rotation.y = dirs[bi][2];
    }
    var stone = th.stone, part = MD.part, ringCol = look ? look.ring : stone, glow = look ? look.glow : 0x9ff0ff, own = [];
    part(GX.cyl(1, 1.1, 16), new THREE.Color(stone).multiplyScalar(0.85).getHex(), 0, 0.1, 0, 1.25, 0.2, 1.25, inner);
    part(GX.cyl(1, 1, 16), look ? ringCol : stone, 0, 0.24, 0, 1.0, 0.1, 1.0, inner);
    var ring = part(GX.geo('portalRing', function () { return new THREE.TorusGeometry(1.0, 0.16, 8, 32); }), ringCol, 0, 1.45, 0, 1, 1, 1, inner, look ? { emissive: new THREE.Color(ringCol).multiplyScalar(0.22).getHex() } : undefined);
    part(GX.box(), stone, -1.05, 0.7, 0, 0.28, 1.0, 0.36, inner); part(GX.box(), stone, 1.05, 0.7, 0, 0.28, 1.0, 0.36, inner);
    part(GX.oct(), glow, 0, 2.62, 0, 0.16, 0.22, 0.08, inner, { emissive: new THREE.Color(glow).multiplyScalar(0.4).getHex() });
    if (look && look.dragon) {   // the Dragon's gate: dark horns on the ring and two fire bowls
      [-1, 1].forEach(function (sd) {
        part(GX.cone(6), 0x3a2622, sd * 0.78, 2.45, 0, 0.13, 0.55, 0.13, inner, { flatShading: true }).rotation.z = -sd * 0.55;
        part(GX.cyl(1, 0.7, 8), 0x4a3a36, sd * 1.05, 1.28, 0, 0.2, 0.12, 0.2, inner);
        part(GX.cone(6), 0xff7a1a, sd * 1.05, 1.5, 0, 0.13, 0.36, 0.13, inner, { additive: true, basic: true, opacity: 0.85 });
      });
    }
    var filmMat = new THREE.MeshBasicMaterial({ map: look ? getSwirl(look.glow, look.c2) : getSwirl(), transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    var film = new THREE.Mesh(GX.geo('portalDisc', function () { return new THREE.CircleGeometry(0.88, 32); }), filmMat);
    film.position.y = 1.45; inner.add(film);
    var beamMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    var light = new THREE.Mesh(GX.cyl(0.6, 1, 14), beamMat);
    light.scale.set(0.9, 6, 0.9); light.position.y = 3; inner.add(light);
    own.push(filmMat, beamMat);
    var lock = null;
    if (look && look.name) {
      var nb = nameBoard(look.name, look.nameCss);
      nb.mesh.position.set(0, 3.0, 0.05); inner.add(nb.mesh); own = own.concat(nb.own);
      // a little padlock in the middle while the portal is shut
      lock = new THREE.Group(); lock.position.set(0, 1.45, 0.02); inner.add(lock);
      part(GX.box(), 0xd8c070, 0, -0.08, 0, 0.36, 0.3, 0.1, lock, { emissive: 0x3a2a00 });
      part(GX.torus(Math.PI), 0xb8b8c8, 0, 0.07, 0, 0.13, 0.15, 0.4, lock);
      part(GX.box(), 0x3a2a10, 0, -0.1, 0.05, 0.05, 0.1, 0.02, lock);
    }
    var model = { root: root, inner: inner, ring: ring, film: film, beam: light, slots: [], need: -1, st: st, anim: 0, own: own, lock: lock, base: !!look };
    shadows(root); film.castShadow = false; light.castShadow = false;
    GX.entityGroup.add(root);
    return model;
  }
  function portalSlots(pm, need) {
    pm.slots.forEach(function (s) { pm.inner.remove(s.g); });
    pm.slots = [];
    for (var i = 0; i < need; i++) {
      var a = Math.PI / 2 + (i - (need - 1) / 2) * (Math.PI * 1.5 / Math.max(need, 2)) * (need > 1 ? 1 : 0);
      var sz = need > 7 ? 0.75 : 1;   // many slots (planet portals need up to 10): smaller sockets
      var g = new THREE.Group(); g.position.set(Math.cos(a) * 1.0, 1.45 + Math.sin(a) * 1.0, 0.12); g.rotation.z = a; g.scale.setScalar(sz);
      var sock = MD.part(GX.box(), 0x2a2238, 0, 0, 0, 0.26, 0.26, 0.12, g);
      var cube = MD.part(GX.box(), 0x7dfcff, 0, 0, 0.05, 0.2, 0.2, 0.2, g, { emissive: 0x2ab8d8 });
      var glow = MD.part(GX.sphere(8), 0x7dfcff, 0, 0, 0.08, 0.26, 0.26, 0.26, g, { additive: true, basic: true, opacity: 0.5 });
      sock.castShadow = true;
      pm.inner.add(g);
      pm.slots.push({ g: g, cube: cube, glow: glow, fit: 0 });
    }
    pm.need = need;
  }
  function animPortal(pm, t, dt) {
    var s0 = pm.st() || {}, need = s0.need || 0, open = !!s0.open, fitted = typeof s0.fitted === 'number' ? s0.fitted : (open ? need : 0);
    if (need !== pm.need) portalSlots(pm, need);
    for (var i = 0; i < pm.slots.length; i++) {
      var s = pm.slots[i], want = i < fitted ? 1 : 0;
      s.fit = SC.approach(s.fit, want, dt * 2.5);
      s.cube.visible = s.fit > 0.01; s.cube.scale.setScalar(0.2 * SC.ease(s.fit)); s.cube.rotation.z += dt * 2;
      s.glow.visible = s.fit > 0.5; s.glow.material.opacity = 0.35 + Math.sin(t * 4 + i) * 0.15;
      if (s.fit > 0 && s.fit < 1 && Math.random() < 0.3) { s.g.getWorldPosition(tmpV); GX.emit(tmpV.x, tmpV.y, tmpV.z, 'gem', SC.rand(-1, 1), 1, SC.rand(-1, 1)); }
    }
    if (pm.lock) { pm.lock.visible = !open; pm.lock.rotation.y = Math.sin(t * 1.5) * 0.3; }
    if (open) {
      pm.anim = Math.min(1, pm.anim + dt * 0.7);
      pm.film.material.opacity = 0.2 + 0.75 * pm.anim;
      pm.film.rotation.z -= dt * 2.5;
      pm.film.scale.setScalar(0.7 + 0.3 * pm.anim + Math.sin(t * 3) * 0.02);
      pm.beam.material.opacity = 0.14 * pm.anim + Math.sin(t * 3) * 0.03;
      if (Math.random() < (pm.base ? 0.2 : 0.4)) { pm.inner.getWorldPosition(tmpV); var a = Math.random() * 6.28, sc = pm.root.scale.x; GX.emit(tmpV.x + Math.cos(a) * 0.9 * sc, tmpV.y + (1.45 + Math.sin(a) * 0.9) * sc, tmpV.z, 'gem', -Math.cos(a) * 0.8, -Math.sin(a) * 0.8, 0); }
    } else {
      pm.anim = 0;
      var full = need > 0 && fitted >= need;
      pm.film.material.opacity = (full ? 0.35 : 0.08) + Math.sin(t * 2) * 0.04;
      pm.film.rotation.z -= dt * 0.4;
      pm.film.scale.setScalar(full ? 0.8 : 0.5);
      pm.beam.material.opacity = 0;
    }
    return pm.anim;
  }
  V.portalCount = function () { return portals.length; };

  // build the 3D level (ground, scenery, traps, static props)
  V.buildLevel = function (L) {
    V.clearAll();
    GX.buildLevel(L);
    if (SC.traps) SC.traps.build(L);
    if (SC.templeView) SC.safe(function () { SC.templeView.build(L); }, 'temples');
    levelProps = [];
    L.chests.forEach(function (c) {
      var m = MD.chest(); m.root.position.set(c.tx + 0.5, gh(c.tx + 0.5, c.ty + 0.5), c.ty + 0.5); shadows(m.root); GX.entityGroup.add(m.root); c.model = m; levelProps.push(m);
      m.baseY = m.root.position.y;
    });
    if (L.gate) portals.push(buildPortal(L.gate, null, function () { return { need: L.portalNeed || 0, fitted: L.portalFitted, open: L.gateOpen }; }));
    (L.portals || []).forEach(function (po) {
      var P = (SC.PLANET_LOOK || {})[String(po.planet).toLowerCase()] || { color: 0x9ff0ff, color2: 0x5a7aff };
      var look = { ring: new THREE.Color(P.color).lerp(new THREE.Color(0xffffff), 0.15).getHex(), glow: P.color, c2: P.color2, name: (P.num ? P.num + ' ' : '') + (P.name || po.planet),
        nameCss: css(P.color), scale: P.dragon ? 1.55 : 1.3, face: po.face, dragon: !!P.dragon };
      portals.push(buildPortal(po, look, function () { return po; }));
    });
    SC.G.flags.forEach(function (f) { var m = MD.flag(); m.root.position.set(f.x, gh(f.x, f.y), f.y); shadows(m.root); GX.entityGroup.add(m.root); f.model = m; levelProps.push(m); });
  };

  // ---------- hero ----------
  function makeHero(id, tier) {
    var m = null;
    try { m = MD.hero(id, tier); } catch (e) { m = null; }
    if (!m || !m.root || !m.body) m = MD.hero('nate', tier);
    m.id = id;
    return m;
  }
  // one hero model per player (player 2 gets their own)
  function ensureHero(i, heroId) {
    var G = SC.G, hm = heroModels[i];
    if (!hm || hm.id !== heroId) {
      if (hm && hm.root.parent) hm.root.parent.remove(hm.root);
      hm = heroModels[i] = makeHero(heroId, G.prog.swordLevel);
      shadows(hm.root);
      GX.entityGroup.add(hm.root);
    }
    if (hm.tier !== G.prog.swordLevel) { MD.setHeroSword(hm, G.prog.swordLevel); hm.glowM = null; }
    hm.root.visible = true;
    return hm;
  }
  // the glider (Glide mode): a bright kite wing over the hero's head with a little frame, opened while gliding
  function ensureGlider(m, hero) {
    if (m.glider) return m.glider;
    var g = new THREE.Group(), col = new THREE.Color(hero.color || '#ffd23f').getHex();
    var wing = new THREE.Shape(); wing.moveTo(0, 0.55); wing.lineTo(1.15, -0.25); wing.lineTo(0.35, -0.12); wing.lineTo(0, -0.32); wing.lineTo(-0.35, -0.12); wing.lineTo(-1.15, -0.25); wing.closePath();
    var wg = new THREE.ShapeGeometry(wing); wg.rotateX(-Math.PI / 2);
    var mat = new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide, emissive: new THREE.Color(col).multiplyScalar(0.25) });
    var w = new THREE.Mesh(wg, mat); w.castShadow = true; g.add(w);
    var stripe = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })); stripe.scale.set(0.45, 1, 0.45); stripe.position.y = 0.01; g.add(stripe);
    var bar = new THREE.Mesh(GX.cyl ? GX.cyl(1, 1, 6) : new THREE.CylinderGeometry(1, 1, 1, 6), GX.mat(0x5a4030));
    bar.scale.set(0.025, 0.55, 0.025); bar.position.set(0, -0.28, 0.05); g.add(bar);
    var bar2 = bar.clone(); bar2.rotation.z = Math.PI / 2; bar2.scale.set(0.022, 1.1, 0.022); bar2.position.set(0, -0.55, 0.05); g.add(bar2);
    g.position.set(0, 1.55 * (hero.scale || 1) + 0.25, 0);
    g.visible = false;
    m.root.add(g); m.glider = g;
    return g;
  }
  function swordCrestColor(G, heroId) {
    var sc = G.prog && G.prog.swordCrest, id = sc && heroId && sc[heroId];
    if (!id) return null;
    var pw = SC.powerById(id);
    return pw ? pw.hex : null;
  }
  function animHero(m, p, hero, t, dt, inMenu) {
    var root = m.root, G = SC.G;
    var fly = inMenu ? 0 : (p.flyH || 0), ground = inMenu ? 0 : gh(p.x, p.y);
    var hover = fly > 0.05 ? Math.sin(t * 3) * 0.08 * Math.min(1, fly) : 0;
    root.position.set(p.x, ground + fly + hover, p.y);
    root.rotation.y = Math.PI / 2 - p.face;
    root.visible = !p.dead && !(p.blinkT > 0 && Math.floor(t * 18) % 3 === 0);
    var sc = hero.scale;
    var walk = p.moving ? Math.sin(p.walkT) : 0;
    m.legL.rotation.x = walk * 0.7; m.legR.rotation.x = -walk * 0.7;
    m.armL.rotation.x = -walk * 0.6; m.armR.rotation.x = walk * 0.6;
    m.armL.rotation.z = 0; m.armR.rotation.z = 0;
    m.body.position.y = p.moving ? Math.abs(Math.cos(p.walkT)) * 0.05 : Math.sin(t * 2.5) * 0.012;
    var sq = 1;
    m.body.rotation.x = 0; m.body.rotation.z = 0;
    if (fly > 0.3) {   // flying pose: lean forward, legs trailing, arms out
      var k = Math.min(1, fly / 1.2);
      m.body.rotation.x = 0.35 * k + (p.moving ? 0.15 : 0);
      m.legL.rotation.x = 0.7 * k + Math.sin(t * 4) * 0.1; m.legR.rotation.x = 0.45 * k - Math.sin(t * 4) * 0.1;
      m.armL.rotation.z = 0.9 * k; m.armR.rotation.z = -0.9 * k; m.armL.rotation.x = -0.3; m.armR.rotation.x = -0.3;
      if (Math.random() < 0.25) GX.emit(p.x + SC.rand(-0.3, 0.3), ground + fly * 0.5, p.y + SC.rand(-0.3, 0.3), 'wind', SC.rand(-0.5, 0.5), -0.6, SC.rand(-0.5, 0.5));
    }
    // gliding: hold the glider bar with both hands, legs trailing
    var gliding = !inMenu && !!p.gliding;
    if (gliding || m.glider) {
      var gd = ensureGlider(m, hero);
      gd.visible = gliding;
      if (gliding) {
        m.body.rotation.x = 0.3; m.armL.rotation.x = -2.8; m.armR.rotation.x = -2.8; m.armL.rotation.z = 0.25; m.armR.rotation.z = -0.25;
        m.legL.rotation.x = 0.55 + Math.sin(t * 5) * 0.12; m.legR.rotation.x = 0.4 - Math.sin(t * 5) * 0.12;
        gd.rotation.z = Math.sin(t * 2.2) * 0.07; gd.rotation.x = 0.12 + (p.glideVz > 0 ? -0.2 : 0);
        gd.scale.setScalar(p.glideStrong ? 1.55 : 1.3);
      }
    }
    if (p.dashT > 0) { m.body.rotation.x = 0.55; sq = 0.85; m.legL.rotation.x = -1; m.legR.rotation.x = 1; }
    if (p.hurtT > 0) { m.body.rotation.x = -0.3; sq = 0.9; }
    m.body.scale.set(sc / Math.sqrt(sq), sc * sq, sc / Math.sqrt(sq));
    if (m.cape) m.cape.rotation.x = fly > 0.3 ? 0.9 : p.moving ? 0.25 + Math.abs(walk) * 0.15 : 0.08;
    if (m.tails) m.tails.rotation.x = p.moving ? 0.4 + walk * 0.2 : 0.1 + Math.sin(t * 3) * 0.05;
    if (MD.setFlash) MD.setFlash(m, p.hurtT > 0.22);
    // sword (and the colour of the crest set into it)
    var sw = m.swordG, cc = inMenu ? null : swordCrestColor(G, hero.id), heroGlow = m.glowM || null;
    if (m.trailMat) {
      if (m.trailBase === undefined) m.trailBase = m.trailMat.color.getHex();
      m.trailMat.color.setHex(cc !== null ? cc : m.trailBase);
    }
    if (cc !== null) {
      if (!heroGlow || heroGlow.parent !== sw) {
        heroGlow = new THREE.Mesh(GX.sphere(10), new THREE.MeshBasicMaterial({ color: cc, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
        heroGlow.userData.noFlash = true; heroGlow.position.set(0, 0, 0.55); heroGlow.scale.set(0.12, 0.12, 0.5); sw.add(heroGlow); m.glowM = heroGlow;
      }
      heroGlow.visible = true; heroGlow.material.color.setHex(cc); heroGlow.material.opacity = 0.35 + Math.sin(t * 5) * 0.12;
      if (Math.random() < 0.12) { heroGlow.getWorldPosition(tmpV); GX.emit(tmpV.x, tmpV.y, tmpV.z, 'gem', 0, 0.5, 0); }
    } else if (heroGlow) heroGlow.visible = false;
    if (p.swingT > 0) {
      var prog = 1 - p.swingT / p.swingDur, e = 1 - Math.pow(1 - prog, 2.2);
      var a = p.swingAng - hero.arc / 2 + hero.arc * e;
      sw.position.set(0, 0.5 * sc, 0);
      sw.rotation.set(0, p.face - a, 0);
      m.armR.rotation.x = -1.5; m.armR.rotation.y = 0;
      if (m.trailMat) m.trailMat.opacity = (cc !== null ? 0.8 : 0.6) * (1 - prog);
      if (m.trail) m.trail.scale.set(1, 1, 1);
      m.body.rotation.y = (e - 0.5) * 0.6;
    } else {
      if (m.trailMat) m.trailMat.opacity = 0;
      m.body.rotation.y = 0;
      sw.position.set(0.3 * sc, (0.4 + (p.moving ? walk * 0.02 : 0)) * sc, 0.1 * sc);
      sw.rotation.set(-1.0 + (p.moving ? walk * 0.15 : 0), 0, 0);
    }
    if (p.castT > 0) { m.armL.rotation.x = -1.5; m.armR.rotation.x = -1.5; }
    if (m.shadow) {
      m.shadow.position.y = -(fly + hover) + 0.03;
      var shs = Math.max(0.3, 1 / (1 + fly * 0.32));   // smaller the higher you are
      m.shadow.scale.set(0.38 * sc * shs, 1, 0.38 * sc * shs);
    }
  }
  // portal blocks the team carries circle the hero
  function animCarried(L, p, t) {
    var n = typeof L.blocksCarried === 'number' ? L.blocksCarried : 0;
    while (carried.length < n) {
      var g = new THREE.Group();
      MD.part(GX.box(), 0x7dfcff, 0, 0, 0, 0.2, 0.2, 0.2, g, { emissive: 0x2ab8d8 });
      MD.part(GX.sphere(8), 0x7dfcff, 0, 0, 0, 0.25, 0.25, 0.25, g, { additive: true, basic: true, opacity: 0.35 });
      GX.entityGroup.add(g); carried.push(g);
    }
    var base = gh(p.x, p.y) + (p.flyH || 0) + 1.05;
    for (var i = 0; i < carried.length; i++) {
      var c = carried[i];
      c.visible = i < n && !p.dead;
      if (!c.visible) continue;
      var a = t * 2.2 + i / Math.max(1, n) * Math.PI * 2;
      c.position.set(p.x + Math.cos(a) * 0.72, base + Math.sin(t * 3 + i) * 0.1, p.y + Math.sin(a) * 0.72);
      c.rotation.set(t * 1.5 + i, t * 2 + i, 0);
    }
  }

  function animEnemy(m, e, t, dt) {
    var root = m.root, ground = gh(e.x, e.y);
    root.position.set(e.x, ground + e.h, e.y);
    root.rotation.y = Math.PI / 2 - e.face + (e.spinT > 0 || (e.guardian === 'water' && e.state === 'charge') ? e.spinA : 0);
    m.shadow.position.y = -e.h + 0.03;
    var sh = Math.max(0.3, 1 - e.h * 0.3);
    var baseR = e.def.r * 1.15;
    m.shadow.scale.set(baseR * sh, 1, baseR * sh);
    var helpless = e.frozenT > 0;
    var at = helpless ? 0 : e.anim;
    var bob = e.moving ? Math.abs(Math.sin(at * 9)) * 0.05 : Math.sin(at * 3) * 0.015;
    var size = m.size;
    m.body.position.y = bob * size;
    m.footL.position.z = e.moving ? Math.sin(at * 9) * 0.07 : 0.02;
    m.footR.position.z = e.moving ? -Math.sin(at * 9) * 0.07 : 0.02;
    var ar = 0, lean = 0, sq = 1;
    var st = e.state;
    if (!helpless) {
      if (st === 'windup' || st === 'chargeWind' || st === 'throw' || st === 'spit' || st === 'orbs' || st === 'cast' || st === 'summon') { ar = -2.6; lean = -0.25; sq = 0.92 + Math.sin(t * 40) * 0.03; }
      else if (st === 'recover' || st === 'strike') { ar = 0.9; lean = 0.2; }
      else if (st === 'charge' || st === 'dash') { lean = 0.45; ar = -0.8; }
      else if (st === 'dizzy') { lean = Math.sin(t * 6) * 0.2; }
      else if (e.moving) { ar = Math.sin(at * 9) * 0.5; }
    }
    if (e.guardian) {
      // a temple guardian: asleep (head bowed, slow breathing) until the hero comes in, then it rises up
      if (!e.aggro && !e.returning) { lean = 0.45; ar = 0.35; sq = 0.9 + Math.sin(t * 1.6) * 0.025; }
      else if (st === 'wake') { var wk = SC.clamp(e.st / 1.5, 0, 1); lean = 0.45 * wk; ar = -2.8 * (1 - wk) * (1 - wk) + 0.35 * wk; sq = 1 + (1 - wk) * 0.08; }
      if (e.def.g && e.def.g.float) m.body.position.y += (0.28 + Math.sin(t * 2.5) * 0.08) * size;
      if (Math.random() < (e.aggro ? 0.12 : 0.04)) GX.emit(e.x + SC.rand(-0.35, 0.35), gh(e.x, e.y) + e.h + SC.rand(0.4, 1.4) * size * 0.6, e.y + SC.rand(-0.35, 0.35), e.def.g.fx === 'rock' ? 'dust' : e.def.g.fx, 0, 0.6, 0);
    }
    m.armR.rotation.x = ar; m.armL.rotation.x = e.def.shield ? 0 : -ar * 0.4;
    if (e.flash > 0) sq *= 0.82;
    m.body.rotation.x = lean;
    var al = e.alpha === undefined ? 1 : e.alpha;
    m.body.scale.set(size * al / Math.sqrt(sq), size * sq * al, size * al / Math.sqrt(sq));
    root.visible = al > 0.05;
    if (m.orbit) m.orbit.rotation.y += dt * 6;
    m.ice.visible = e.frozenT > 0;
    m.bubble.visible = e.bubbleT > 0;
    if (e.bubbleT > 0) { var bs = 1 + Math.sin(t * 6) * 0.05; m.bubble.scale.set(0.48 * size * bs, 0.48 * size / bs, 0.48 * size * bs); }
    m.stars.visible = e.stunT > 0 && e.frozenT <= 0 && e.bubbleT <= 0;
    if (m.stars.visible) m.stars.rotation.y += dt * 6;
    MD.setFlash(m, e.flash > 0.06);
    var y0 = ground + e.h;
    if (e.burnT > 0 && Math.random() < 0.35) GX.emit(e.x + SC.rand(-0.15, 0.15), y0 + 0.5 * size, e.y + SC.rand(-0.15, 0.15), 'fire', 0, 1.5, 0);
    if (e.type === 'ember' && Math.random() < 0.15) GX.emit(e.x, y0 + 0.7, e.y, 'ember', 0, 1, 0);
    if (e.type === 'spark' && Math.random() < 0.1) GX.emit(e.x, y0 + 0.5, e.y, 'spark', SC.rand(-1, 1), 1, SC.rand(-1, 1));
  }

  function animDragon(m, e, t, dt) {
    var G = SC.G, root = m.root, ground = gh(e.x, e.y);
    // when flying, the body is drawn a bit to the north and higher so it never covers the hero; the shadow marks the landing spot
    var off = Math.min(1, e.h / 3.6) * 2.6;
    root.position.set(e.x, ground + e.h * 1.25, e.y - off);
    var spin = e.state === 'tail' ? (e.spinA || 0) : 0;
    root.rotation.y = Math.PI / 2 - e.face + spin;
    if (m.shadow.parent === root) GX.entityGroup.add(m.shadow);
    m.shadow.position.set(e.x, ground + 0.04, e.y);
    m.shadow.visible = root.visible;
    var DS = 1.25;
    var shs = 1.9 * DS * (1 - Math.min(0.5, e.h * 0.06));
    m.shadow.scale.set(shs, 1, shs * 1.3);
    var flying = e.h > 0.2 || e.state === 'flyUp';
    var flap = flying ? t * 9 : t * 2.2;
    var amp = flying ? 0.7 : 0.18;
    m.wingL.rotation.z = Math.sin(flap) * amp - (flying ? 0 : 0.35);
    m.wingR.rotation.z = -Math.sin(flap) * amp + (flying ? 0 : 0.35);
    var breathe = 1 + Math.sin(t * 2) * 0.025;
    m.torso.scale.set(1.0 * breathe, 0.8 * breathe, 1.25);
    for (var i = 0; i < m.tail.length; i++) {
      var sway = Math.sin(t * 2.4 - i * 0.6) * 0.18;
      if (e.state === 'tailWind') sway = 0.35;
      m.tail[i].rotation.y = sway;
      m.tail[i].rotation.x = flying ? 0.08 : (i === 0 ? 0.25 : 0.05);
    }
    var jaw = 0.05;
    if (e.state === 'breathWind') jaw = 0.25 + Math.sin(t * 20) * 0.05;
    if (e.state === 'breath' || e.state === 'roar' || e.state === 'summon' || e.state === 'rain') jaw = 0.55;
    m.jaw.rotation.x = jaw;
    m.head.rotation.x = e.state === 'roar' ? -0.4 : e.state === 'breath' ? 0.15 : Math.sin(t * 1.5) * 0.05;
    m.body.rotation.x = e.state === 'slamWarn' ? 0.3 : e.state === 'landed' ? -0.05 : 0;
    var legSwing = (e.moving && !flying) ? Math.sin(t * 7) * 0.35 : 0;
    m.legs[0].rotation.x = legSwing; m.legs[3].rotation.x = legSwing; m.legs[1].rotation.x = -legSwing; m.legs[2].rotation.x = -legSwing;
    if (flying) m.legs.forEach(function (l) { l.rotation.x = 0.5; });
    m.eyes.forEach(function (ey) { if (ey.material.emissive) ey.material.emissive.setHex(e.phase === 3 ? 0xff2000 : 0xffa000); });
    MD.setFlash(m, e.flash > 0.06);
    var dying = G.dragonDeadT > 0;
    if (dying) {
      var k = Math.min(1, G.dragonDeadT / 2.4);
      root.position.x += (Math.random() - 0.5) * 0.2;
      var s = DS * Math.max(0.01, 1 - k * k);
      root.scale.set(s, s, s);
      if (Math.random() < 0.6) GX.burst(e.x + SC.rand(-1.5, 1.5), ground + SC.rand(0.5, 3), e.y + SC.rand(-1.5, 1.5), Math.random() < 0.5 ? 'star' : 'fire', 4);
    } else root.scale.set(DS, DS, DS);
    if (e.state === 'breath' && !dying) {
      m.head.getWorldPosition(tmpV);
      var a = e.curBreathA !== undefined ? e.curBreathA : e.face;
      for (var n = 0; n < 12; n++) {
        var sp = SC.rand(6, 10), da = a + SC.rand(-0.38, 0.38);
        GX.emit(tmpV.x + Math.cos(a) * 0.6, tmpV.y - 0.2, tmpV.z + Math.sin(a) * 0.6, n % 4 ? 'breath' : 'ember', Math.cos(da) * sp, SC.rand(-2.6, -0.6), Math.sin(da) * sp);
      }
      if (Math.random() < 0.5) GX.light(tmpV.x + Math.cos(a) * 2, tmpV.z + Math.sin(a) * 2, 0xff7a1a, 0.15);
    }
    if (e.state === 'breathWind' && Math.random() < 0.5) { m.head.getWorldPosition(tmpV); GX.emit(tmpV.x, tmpV.y, tmpV.z, 'ember', SC.rand(-0.5, 0.5), 0.8, SC.rand(-0.5, 0.5)); }
  }

  // ---------- pickups (gems, hearts, crests, portal blocks, extra lives ...) ----------
  function makePickup(k) {
    var m = MD.pickup(k);
    var empty = m.spin && m.spin.children.length === 0;
    if (k.kind === 'block' && empty) {
      MD.part(GX.box(), 0x7dfcff, 0, 0, 0, 0.34, 0.34, 0.34, m.spin, { emissive: 0x2ab8d8 });
      MD.part(GX.box(), 0xffffff, 0, 0, 0, 0.36, 0.08, 0.36, m.spin, { emissive: 0x6ad8f8 });
      MD.part(GX.sphere(10), 0x7dfcff, 0, 0, 0, 0.42, 0.42, 0.42, m.spin, { additive: true, basic: true, opacity: 0.3 });
      m.blockBeam = MD.part(GX.cyl(0.6, 1, 12), 0x7dfcff, 0, 3.5, 0, 0.3, 7, 0.3, m.root, { additive: true, basic: true, opacity: 0.18 });
    }
    if (k.kind === 'life' && empty) {
      var hm = MD.pickup({ kind: 'heartUp', id: k.id, h: 0 });
      while (hm.spin.children.length) m.spin.add(hm.spin.children[0]);
      MD.part(GX.box(), 0xffe27a, -0.32, 0.08, 0, 0.3, 0.06, 0.14, m.spin, { emissive: 0x806000 }).rotation.z = 0.5;
      MD.part(GX.box(), 0xffe27a, 0.32, 0.08, 0, 0.3, 0.06, 0.14, m.spin, { emissive: 0x806000 }).rotation.z = -0.5;
    }
    if (k.kind === 'crest' && !m.shell) {
      m.shell = MD.part(GX.sphere(16), 0xd8f0ff, 0, 0, 0, 0.62, 0.62, 0.62, m.spin, { transparent: true, opacity: 0.32, depthWrite: false, emissive: 0x4a6a9a });
      m.shell.userData.noFlash = true;
      m.shellRing = MD.part(GX.torus(), 0xb8e0ff, 0, 0, 0, 0.66, 0.66, 0.66, m.spin, { additive: true, basic: true, opacity: 0.5 });
      m.lock = new THREE.Group(); m.spin.add(m.lock);
      MD.part(GX.box(), 0xc8c8d8, 0, -0.08, 0.66, 0.2, 0.16, 0.06, m.lock); MD.part(GX.torus(Math.PI), 0xc8c8d8, 0, 0.02, 0.66, 0.08, 0.08, 0.3, m.lock);
    }
    if (m.meshes) m.meshes = m.meshes.filter(function (x) { return !x.userData.noFlash; });
    return m;
  }
  function animPickup(m, k, t, dt) {
    var ground = gh(k.x, k.y);
    m.root.position.set(k.x, ground, k.y);
    var base = k.kind === 'crest' ? 0.75 : k.kind === 'block' ? 0.55 : 0.35;
    m.spin.position.y = base + k.h + Math.sin(t * 3 + k.id) * 0.08;
    m.spin.rotation.y += dt * (k.kind === 'crest' ? 1.8 : 3);
    if (m.shadow) m.shadow.position.y = 0.03;
    if (m.beam) { m.beam.material.opacity = 0.16 + Math.sin(t * 3) * 0.06; }
    if (m.blockBeam) m.blockBeam.material.opacity = 0.14 + Math.sin(t * 3) * 0.05;
    if (k.kind === 'block') { m.spin.rotation.x = Math.sin(t * 1.3) * 0.3; if (Math.random() < 0.1) GX.emit(k.x + SC.rand(-0.3, 0.3), ground + 0.3, k.y + SC.rand(-0.3, 0.3), 'gem', 0, 1, 0); }
    if (k.kind === 'crest') {
      var sealed = !!k.sealed;
      if (m.shell) m.shell.visible = sealed; if (m.shellRing) m.shellRing.visible = sealed; if (m.lock) m.lock.visible = sealed;
      if (sealed) {
        if (m.shell) m.shell.scale.setScalar((m.shellBase || (m.shellBase = m.shell.scale.x)) * (1 + Math.sin(t * 2.5) * 0.04));
        if (m.shellRing) { m.shellRing.rotation.x = t * 1.3; m.shellRing.rotation.y = t * 0.7; }
        m.spin.rotation.y -= dt * 1.2;
        if (m.beam) m.beam.material.opacity *= 0.4;
        if (Math.random() < 0.08) GX.emit(k.x + SC.rand(-0.5, 0.5), ground + 0.8 + SC.rand(-0.4, 0.4), k.y + SC.rand(-0.5, 0.5), 'ice', 0, 0.3, 0);
      } else if (Math.random() < 0.2) GX.emit(k.x + SC.rand(-0.4, 0.4), ground + 0.3, k.y + SC.rand(-0.4, 0.4), 'gem', 0, 1.2, 0);
    }
  }

  // ---------- friendly people ----------
  function friendlyFigure(role) {
    // a simple friendly person with the same part names as the baddie models
    var root = new THREE.Group(), m = { root: root, kind: 'npc', size: 1 }, part = MD.part, sph = GX.sphere(10), box = GX.box();
    m.shadow = MD.shadowBlob ? MD.shadowBlob(root, 0.32) : part(GX.cyl(1, 1, 12), 0x000000, 0, 0.02, 0, 0.32, 0.01, 0.32, root, { basic: true, transparent: true, opacity: 0.25 });
    m.body = new THREE.Group(); root.add(m.body);
    var cloth = role === 'smith' ? 0x6a4a3a : 0x3a9a5a, skin = 0xf2c49b;
    part(box, 0x4a3a2a, -0.08, 0.1, 0, 0.12, 0.2, 0.12, m.body); part(box, 0x4a3a2a, 0.08, 0.1, 0, 0.12, 0.2, 0.12, m.body);
    m.footL = new THREE.Group(); m.footR = new THREE.Group(); m.body.add(m.footL); m.body.add(m.footR);
    part(box, cloth, 0, 0.38, 0, 0.36, 0.36, 0.26, m.body);
    if (role === 'smith') part(box, 0x3a2a22, 0, 0.36, 0.14, 0.3, 0.34, 0.03, m.body);
    else { part(box, 0x9a6a3a, 0, 0.45, -0.2, 0.3, 0.4, 0.18, m.body); part(GX.sphere(8), 0xffd23f, 0.2, 0.25, 0.1, 0.07, 0.08, 0.07, m.body, { emissive: 0x403000 }); }
    part(sph, skin, 0, 0.74, 0, 0.2, 0.2, 0.2, m.body);
    part(sph, 0x2a2a2a, -0.07, 0.77, 0.17, 0.03, 0.035, 0.02, m.body); part(sph, 0x2a2a2a, 0.07, 0.77, 0.17, 0.03, 0.035, 0.02, m.body);
    part(box, 0xd84a5a, 0, 0.69, 0.18, 0.08, 0.02, 0.02, m.body);
    if (role === 'smith') part(GX.cyl(1, 1, 10), 0x3a2a22, 0, 0.88, 0, 0.18, 0.06, 0.18, m.body);
    else { part(GX.cyl(1, 1, 12), 0xc8a050, 0, 0.88, 0, 0.32, 0.03, 0.32, m.body); part(GX.cyl(0.7, 1, 10), 0xc8a050, 0, 0.97, 0, 0.17, 0.16, 0.17, m.body); }
    m.armL = new THREE.Group(); m.armL.position.set(-0.22, 0.52, 0); m.body.add(m.armL); part(box, role === 'smith' ? skin : cloth, 0, -0.14, 0, 0.09, 0.3, 0.09, m.armL);
    m.armR = new THREE.Group(); m.armR.position.set(0.22, 0.52, 0); m.body.add(m.armR); part(box, role === 'smith' ? skin : cloth, 0, -0.14, 0, 0.09, 0.3, 0.09, m.armR);
    if (role === 'smith') { part(GX.cyl(1, 1, 6), 0x6a4a2a, 0, -0.3, 0.06, 0.025, 0.28, 0.025, m.armR); part(box, 0x5a5a64, 0, -0.42, 0.06, 0.16, 0.08, 0.08, m.armR); }
    m.meshes = [];
    root.traverse(function (o) { if (o.isMesh && o !== m.shadow) { o.userData.baseMat = o.material; m.meshes.push(o); } });
    return m;
  }
  function npcIcon(role) {
    var g = new THREE.Group(), part = MD.part;
    if (role === 'smith') {
      part(GX.cyl(1, 1, 6), 0x8a5a32, 0, -0.1, 0, 0.035, 0.36, 0.035, g);
      part(GX.box(), 0x9aa0b0, 0, 0.1, 0, 0.3, 0.12, 0.12, g, { emissive: 0x2a2a3a });
    } else {
      part(GX.sphere(10), 0xffc83a, 0, 0, 0, 0.18, 0.16, 0.18, g, { emissive: 0x6a4a00 });
      part(GX.cyl(0.6, 1, 8), 0xffc83a, 0, 0.16, 0, 0.08, 0.08, 0.08, g, { emissive: 0x6a4a00 });
      part(GX.cyl(1, 1, 10), 0xffe27a, 0.14, -0.08, 0.12, 0.08, 0.02, 0.08, g, { emissive: 0x806000 }).rotation.x = 1.2;
    }
    part(GX.sphere(8), role === 'smith' ? 0xffa04a : 0x7dff8a, 0, 0, 0, 0.3, 0.3, 0.3, g, { additive: true, basic: true, opacity: 0.2 });
    return g;
  }
  function animNpc(m, n, t, dt, p) {
    var ground = gh(n.x, n.y), root = m.root;
    root.position.set(n.x, ground, n.y);
    var d = p ? SC.dist(n.x, n.y, p.x, p.y) : 99;
    var want = d < 4.5 && p ? Math.atan2(p.y - n.y, p.x - n.x) : (n.face !== undefined ? n.face : Math.PI / 2);
    m.faceA = m.faceA === undefined ? want : m.faceA + SC.angDiff(m.faceA, want) * Math.min(1, dt * 5);
    root.rotation.y = Math.PI / 2 - m.faceA;
    var size = m.size || 1;
    if (m.body) { m.body.position.y = Math.abs(Math.sin(t * 2 + n.x)) * 0.02 * size; m.body.rotation.x = 0; m.body.rotation.z = Math.sin(t * 1.3 + n.y) * 0.04; }
    if (m.armR) m.armR.rotation.x = d < 2.5 ? -1.6 + Math.sin(t * 8) * 0.5 : n.role === 'smith' ? Math.max(0, Math.sin(t * 3)) * -1.2 : Math.sin(t * 1.5) * 0.15;
    if (m.armL) m.armL.rotation.x = Math.sin(t * 1.5 + 1) * 0.12;
    if (m.ice) m.ice.visible = false; if (m.bubble) m.bubble.visible = false; if (m.stars) m.stars.visible = false;
    if (m.shadow) m.shadow.position.y = 0.03;
    if (!m.icon) m.icon = npcIcon(n.role);
    if (m.icon.parent !== GX.entityGroup) GX.entityGroup.add(m.icon);
    m.icon.position.set(n.x, ground + 1.55 * Math.max(1, size) + Math.sin(t * 2.5 + n.x) * 0.08, n.y);
    m.icon.rotation.y = t * 1.6;
    m.icon.visible = true;
    if (n.role === 'smith' && Math.sin(t * 3) > 0.97 && Math.random() < 0.5) GX.burst(n.x + Math.cos(m.faceA) * 0.4, ground + 0.6, n.y + Math.sin(m.faceA) * 0.4, 'spark', 3);
  }

  // ---------- main per-frame update while playing ----------
  V.update = function (dt, t) {
    var G = SC.G, L = G.L, p = G.player;
    if (!GX.ok || !L || !p) return;
    frame++;
    SC.syncCtx && SC.syncCtx();
    var plist = G.players && G.players.length ? G.players : [{ p: p, hero: G.hero }];
    for (var hi = 0; hi < plist.length; hi++) animHero(ensureHero(hi, plist[hi].hero.id), plist[hi].p, plist[hi].hero, t, dt);
    for (var hx = plist.length; hx < heroModels.length; hx++) if (heroModels[hx]) heroModels[hx].root.visible = false;
    animCarried(L, p, t);
    // two players: the nearest of them decides what is close enough to draw
    var p2 = plist.length > 1 && !plist[1].p.dead ? plist[1].p : null;
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (!e.alive) continue;
      var dist = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
      if ((Math.abs(e.x - p.x) > 17 || Math.abs(e.y - p.y) > 14) && e.type !== 'dragon' && !(p2 && Math.abs(e.x - p2.x) < 17 && Math.abs(e.y - p2.y) < 14)) continue;
      if (e.type === 'dragon') { var dr = get('!d' + e.id, '!dragon', MD.dragon); animDragon(dr.model, e, t, dt); }
      else { var er = get('!e' + e.id, '!enemy', function () { return MD.enemy(e.type); }); animEnemy(er.model, e, t, dt); }
    }
    if (G.dragonDeadT > 0 && G.boss && !G.boss.alive) { var dd = get('!d' + G.boss.id, '!dragon', MD.dragon); animDragon(dd.model, G.boss, t, dt); }
    // friendly people (A builds SC.G.npcs; without it they are drawn where the map puts them)
    var npcs = G.npcs || (L.npcs || []).map(function (n, idx) { return { id: 'm' + idx, x: n.tx + 0.5, y: n.ty + 0.5, role: n.role, face: Math.PI / 2 }; });
    for (var ni = 0; ni < npcs.length; ni++) {
      var n = npcs[ni];
      if (Math.abs(n.x - p.x) > 24 || Math.abs(n.y - p.y) > 18) continue;
      var nr = get('!n' + n.id + n.role, '!npc', function () { return MD.npc ? MD.npc(n.role) : friendlyFigure(n.role); });
      animNpc(nr.model, n, t, dt, p);
    }
    for (var j = 0; j < G.pickups.length; j++) {
      var k = G.pickups[j];
      var pr = get('!p' + k.id, '!pickup', function () { return makePickup(k); });
      animPickup(pr.model, k, t, dt);
    }
    GX.checkMinimap();
    // player projectiles (scale and lvl make them bigger and brighter)
    for (var q = 0; q < G.projs.length; q++) {
      var o = G.projs[q];
      if (o.kind === 'quake') continue;
      var kind = o.kind;
      var r = get('j' + o.id, kind, function () {
        var mm0 = MD.proj(kind);
        if (kind === 'tornado' && mm0.root.children.length === 0) { mm0 = MD.proj('twister'); mm0.big = true; }
        return mm0;
      }, GX.fxGroup);
      var mm = r.model, sc = (o.scale || 1) * (mm.big ? 2.0 : 1), lvl = o.lvl || 1;
      var ground = gh(o.x, o.y);
      mm.root.position.set(o.x, ground + (kind === 'wave' || kind === 'twister' || kind === 'tornado' ? 0 : o.h + Math.sin(o.t * 12) * (kind === 'skull' ? 0.06 : 0)), o.y);
      mm.root.rotation.y = Math.PI / 2 - o.ang;
      mm.root.scale.setScalar(sc);
      if (kind === 'fireball') { var f = sc * (1 + Math.sin(t * 40) * 0.12); mm.root.scale.set(f, f, f); }
      if (kind === 'bubble') { var bw = 1 + Math.sin(o.t * 14) * 0.08; mm.root.scale.set(bw * sc, sc / bw, bw * sc); }
      if (kind === 'shard' && mm.spinPart) mm.spinPart.rotation.z += dt * 14;
      if (kind === 'wave' && mm.spinPart) {
        var R = (o.hw || 1.1) * 1.19 / sc, life = o.life / o.maxLife;
        mm.spinPart.position.z = -R; mm.spinPart.scale.set(R, 0.6 + life * 0.7, R);
        mm.mat.opacity = 0.65 * Math.min(1, life * 2.5);
      }
      if ((kind === 'twister' || kind === 'tornado') && mm.spinPart) { mm.spinPart.rotation.y += dt * (kind === 'tornado' ? 18 : 14); var tw = 1 + Math.sin(o.t * 9) * 0.08; mm.spinPart.scale.set(tw, 1, tw); if (kind === 'tornado' && Math.random() < 0.6) GX.emit(o.x + SC.rand(-0.8, 0.8), ground + SC.rand(0.2, 2.5), o.y + SC.rand(-0.8, 0.8), 'wind', SC.rand(-2, 2), 1, SC.rand(-2, 2)); }
      if (lvl >= 2 && Math.random() < 0.15 * lvl) GX.emit(o.x, ground + (o.h || 0.5), o.y, lvl >= 3 ? 'star' : 'spark', SC.rand(-0.5, 0.5), 0.6, SC.rand(-0.5, 0.5));
    }
    for (var b = 0; b < G.eprojs.length; b++) {
      var ep = G.eprojs[b];
      var rr = get('x' + ep.id, ep.kind, function () { return MD.proj(ep.kind); }, GX.fxGroup);
      rr.model.root.position.set(ep.x, gh(ep.x, ep.y) + ep.h, ep.y);
      rr.model.root.scale.setScalar(ep.scale || 1);
    }
    // effects
    var segN = 0;
    for (var c = 0; c < G.effects.length; c++) {
      var ef = G.effects[c], ft = ef.t / ef.dur;
      if (!ef.vid) ef.vid = ++vid;
      if (ef.kind === 'bolt') segN = drawBolt(ef, segN);
      else if (ef.kind === 'ring' || ef.kind === 'ripple') {
        var rg = get('r' + ef.vid, 'ringFx', function () { return MD.proj('ringFx'); }, GX.fxGroup);
        var rad = ef.kind === 'ripple' ? SC.lerp(0.15, 0.75, ft) : SC.lerp(ef.r0, ef.r1, Math.sqrt(ft));
        rg.model.root.position.set(ef.x, gh(ef.x, ef.y) + (ef.kind === 'ripple' ? 0.0 : 0.1), ef.y);
        rg.model.root.scale.set(rad, ef.kind === 'ripple' ? 0.5 : 2.5, rad);
        rg.model.mat.color.setHex(ef.kind === 'ripple' ? 0xdff8ff : ef.color);
        rg.model.mat.opacity = (1 - ft) * (ef.kind === 'ripple' ? 0.8 : 1) * Math.min(1, (ef.lvl || 1) * 0.5 + 0.5);
      } else if (ef.kind === 'spike') {
        var sp = get('s' + ef.vid, 'spike', function () { return MD.proj('spike'); }, GX.fxGroup);
        var rise = ef.t < 0.1 ? ef.t / 0.1 : ef.t > ef.dur - 0.25 ? Math.max(0, (ef.dur - ef.t) / 0.25) : 1;
        sp.model.root.position.set(ef.x, gh(ef.x, ef.y), ef.y);
        var es = ef.s * (ef.scale || 1);
        sp.model.spinPart.scale.set(es, es * (rise * 1.1), es);
        sp.model.spinPart.rotation.y = ef.rot;
      } else if (ef.kind === 'meteor') {
        // a falling thing: the Dragon's meteors, or a thrown boulder / seed pod / big raindrop (ef.model, ef.fx)
        var mk = ef.model || 'meteor';
        var mt = get('m' + ef.vid, mk, function () { return MD.proj(mk); }, GX.fxGroup);
        var hgt = (ef.model ? 9 : 12) * (1 - ft * ft) + gh(ef.x, ef.y);
        mt.model.root.position.set(ef.x + (1 - ft) * (ef.fromX || 2), hgt, ef.y - (1 - ft) * (ef.fromY || 1.5));
        if (ef.model) mt.model.root.scale.setScalar(ef.scale || 2.2);
        if (Math.random() < 0.5) GX.emit(mt.model.root.position.x, hgt, mt.model.root.position.z, ef.fx || 'fire', 0, 1, 0);
      }
    }
    for (var s2 = segN; s2 < boltPool.length; s2++) boltPool[s2].root.visible = false;
    for (var h = 0; h < G.hazards.length; h++) {
      var hz = G.hazards[h];
      if (Math.random() < 0.45) GX.emit(hz.x + SC.rand(-0.2, 0.2), gh(hz.x, hz.y) + 0.1, hz.y + SC.rand(-0.2, 0.2), Math.random() < 0.7 ? 'fire' : 'ember', 0, 1.2, 0);
    }
    // ground warnings (attacks first, then traps)
    var dec = [];
    for (var w = 0; w < G.warns.length && dec.length < 30; w++) {
      var wn = G.warns[w], fr = SC.clamp(wn.t / wn.dur, 0, 1);
      var al = 0.55 + 0.45 * Math.abs(Math.sin(wn.t * (fr > 0.6 ? 22 : 10)));
      if (wn.kind === 'circle') dec.push({ shape: 'circle', x: wn.x, y: wn.y, r: wn.r, color: wn.color, fill: fr, alpha: al });
      else if (wn.kind === 'cone') dec.push({ shape: 'cone', x: wn.x, y: wn.y, ang: wn.ang, half: wn.half, len: wn.len, color: wn.color, fill: fr, alpha: al });
      else if (wn.kind === 'line') dec.push({ shape: 'line', x: wn.x, y: wn.y, ang: wn.ang, len: wn.len, width: wn.width, color: wn.color, fill: fr, alpha: al });
    }
    if (SC.traps) { var td = []; SC.traps.draw(dt, t, td); td.sort(function (a2, b2) { return SC.dist(a2.x, a2.y, p.x, p.y) - SC.dist(b2.x, b2.y, p.x, p.y); }); dec = dec.concat(td.slice(0, 44 - dec.length)); }
    GX.drawDecals(dec);
    // chests, portal, flags
    L.chests.forEach(function (ch) {
      if (!ch.model) return;
      var open = SC.world.tile(ch.tx, ch.ty) === 'O', by = ch.model.baseY || 0;
      if (open) { ch.openT = (ch.openT || 0) + dt; ch.model.lid.rotation.x = -1.9 * SC.ease(ch.openT / 0.4); ch.model.inside.visible = ch.openT < 3; ch.model.root.position.y = by; }
      else ch.model.root.position.y = by + Math.abs(Math.sin(t * 2 + ch.tx)) * 0.03;
      if (!open && Math.random() < 0.04) GX.emit(ch.tx + 0.5 + SC.rand(-0.4, 0.4), by + 0.6, ch.ty + 0.5 + SC.rand(-0.3, 0.3), 'gem', 0, 0.8, 0);
    });
    for (var pi = 0; pi < portals.length; pi++) { var an = animPortal(portals[pi], t, dt); if (L.gate && pi === 0) G.gateAnim = an; }
    G.flags.forEach(function (fl) {
      if (!fl.model) return;
      fl.model.cloth.rotation.y = Math.sin(t * 4 + fl.x) * 0.3;
      var want = fl.active ? GX.mat(0x3adf5a, { emissive: 0x0a4010 }) : GX.mat(0x9a9a9a);
      if (fl.model.clothMesh.material !== want) { fl.model.clothMesh.material = want; fl.model.clothMesh.userData.baseMat = want; }
    });
    sweep();
    weather(L, p, dt);
    GX.animateTiles(t, dt);
    if (SC.templeView) SC.templeView.update(dt, t);
    // camera
    var far = false, cx = p.x, cy = p.y;
    if (L.def.arena && L.boss) far = SC.dist(p.x, p.y, L.boss.tx + 0.5, L.boss.ty + 0.5) < 15;
    if (far && G.boss && G.boss.alive && G.boss.aggro) { cx = SC.lerp(p.x, G.boss.x, 0.3); cy = SC.lerp(p.y, G.boss.y, 0.3); }
    var flyN = (G.boss && G.boss.type === 'dragon' && G.boss.alive) ? Math.min(1, G.boss.h / 3.6) * 2.2 : 0;
    GX.camNorth = SC.lerp(GX.camNorth || 0, flyN, Math.min(1, dt * 3));
    // is a big baddie standing between the camera and the hero? then the hero ring shows through
    var cam = GX.camera.position, blocked = false, vx = cam.x - p.x, vz = cam.z - p.y, vl = Math.sqrt(vx * vx + vz * vz) || 1;
    for (var oi = 0; oi < G.enemies.length && !blocked; oi++) {
      var oe = G.enemies[oi];
      if (!oe.alive || oe.hidden) continue;
      var ox = oe.x - p.x, oz = oe.y - p.y, along = (ox * vx + oz * vz) / vl;
      if (along <= 0.2 || along > 4) continue;
      var side = Math.abs(ox * vz - oz * vx) / vl, size = (oe.def.r || 0.3) * (oe.isBoss ? 1.6 : 1.2);
      if (side < size + 0.15 && (GX.getView() === 'behind' || along < 1.6)) blocked = true;
    }
    // two players: the camera looks at the middle of both and lifts out as they move apart (Top view);
    // the Behind view follows player 1 (the HUD shows an arrow to player 2)
    var spread = 0, others = [], focusH, heroFly = p.flyH || 0;
    if (p2 || (plist.length > 1 && p.dead)) {
      var q = plist[1].p;
      if (p.dead) { p = q; cx = q.x; cy = q.y; heroFly = q.flyH || 0; }
      else if (GX.getView() !== 'behind') {
        cx = (p.x + q.x) / 2; cy = (p.y + q.y) / 2; spread = SC.dist(p.x, p.y, q.x, q.y);
        focusH = (SC.world.heightAt(p.x, p.y) + SC.world.heightAt(q.x, q.y)) / 2; heroFly = Math.max(p.flyH || 0, q.flyH || 0) * 0.7;
      }
      if (q !== p) others.push({ x: q.x, y: q.y, h: SC.world.heightAt(q.x, q.y) + (q.flyH || 0) });
    }
    GX.updateCamera({ x: cx, y: cy, far: far, heroX: p.x, heroY: p.y, heroFly: heroFly, dt: Math.max(dt, 0.001), snap: G.snapCam, blocked: blocked, spread: spread, focusH: focusH, others: others });
    G.snapCam = false;
  };

  var boltPool = [];
  function drawBolt(ef, n) {
    var pts = ef.pts, segs = [];
    if (ef.sky) {
      var x = pts[0], y = pts[1], g0 = gh(x, y), prevX = x + SC.rand(-1, 1), prevH = 10 + g0, prevY = y + SC.rand(-1, 1);
      for (var s = 1; s <= 6; s++) {
        var f = s / 6, nx = SC.lerp(prevX, x, f) + (s < 6 ? SC.rand(-0.4, 0.4) : 0), ny = SC.lerp(prevY, y, f) + (s < 6 ? SC.rand(-0.4, 0.4) : 0), nh = g0 + 10 * (1 - f);
        segs.push([prevX, prevH, prevY, nx, nh, ny]); prevX = nx; prevH = nh; prevY = ny;
      }
    } else {
      for (var i = 0; i + 3 < pts.length; i += 2) {
        var ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3], px = ax, py = ay, ph = 0.6 + gh(ax, ay);
        for (var k = 1; k <= 4; k++) {
          var ff = k / 4, qx = SC.lerp(ax, bx, ff) + (k < 4 ? SC.rand(-0.25, 0.25) : 0), qy = SC.lerp(ay, by, ff) + (k < 4 ? SC.rand(-0.25, 0.25) : 0), qh = 0.6 + gh(qx, qy) + (k < 4 ? SC.rand(-0.15, 0.3) : 0);
          segs.push([px, ph, py, qx, qh, qy]); px = qx; py = qy; ph = qh;
        }
      }
    }
    var fade = 1 - ef.t / ef.dur;
    for (var j = 0; j < segs.length && n < 60; j++, n++) {
      var m = boltPool[n];
      if (!m) { m = MD.proj('boltSeg'); boltPool.push(m); GX.fxGroup.add(m.root); }
      var sg = segs[j];
      m.root.visible = true;
      m.root.position.set(sg[0], sg[1], sg[2]);
      tmpV.set(sg[3], sg[4], sg[5]);
      var len = m.root.position.distanceTo(tmpV);
      m.root.lookAt(tmpV);
      var th = 0.05 * (0.5 + fade) * (ef.lvl ? 0.8 + ef.lvl * 0.3 : 1);
      m.root.scale.set(th, th, len);
    }
    return n;
  }

  // ambient motes: pollen and falling leaves, snow, rain, fireflies, embers and ash
  function weather(L, p, dt) {
    var th = L.def.theme, n = 0, ph = gh(p.x, p.y);
    if (th === 'frost') n = 2; else if (th === 'storm' || th === 'isles') n = th === 'isles' ? 4 : 5; else if (th === 'volcano') n = 2; else if (th === 'shadow' || th === 'plains') n = 1;
    else if (th === 'jungle') n = 2; else n = Math.random() < 0.5 ? 1 : 0;
    // Thunder Plains: far-away lightning now and then (only a flash and a rumble)
    if (L.def.thunder && SC.G.screen === 'play') {
      SC.G.thunderT = (SC.G.thunderT === undefined ? 6 : SC.G.thunderT) - dt;
      if (SC.G.thunderT <= 0) {
        SC.G.thunderT = SC.rand(7, 12);
        var ba = Math.random() * Math.PI * 2;
        SC.G.effects.push({ kind: 'bolt', pts: [p.x + Math.cos(ba) * 14, p.y + Math.sin(ba) * 10], sky: true, t: 0, dur: 0.3, h: 0 });
        SC.fx.flash(0xfff8d0, 0.08); SC.audio.play('thunder');
      }
    }
    for (var i = 0; i < n; i++) {
      var x = p.x + SC.rand(-13, 13), y = p.y + SC.rand(-10, 8), g0 = gh(x, y);
      if (th === 'frost') GX.emit(x, ph + 7, y, 'snow', SC.rand(-0.3, 0.3), -1.2, 0);
      else if (th === 'storm' || th === 'isles') GX.emit(x, ph + 8, y, 'rain', th === 'isles' ? -0.4 : -1, -16, 0.5);
      else if (th === 'plains') { if (Math.random() < 0.5) GX.emit(x, g0 + SC.rand(0.2, 1.2), y, 'spark', SC.rand(-0.3, 0.3), 0.3, 0); else GX.emit(x, g0 + SC.rand(2.5, 4), y, 'fallleaf', SC.rand(-0.8, 0.8), -0.4, SC.rand(-0.3, 0.3)); }
      else if (th === 'canyon') GX.emit(x, g0 + SC.rand(0.1, 0.8), y, 'dust', SC.rand(0.4, 1.2), 0.1, SC.rand(-0.2, 0.2));
      else if (th === 'jungle') GX.emit(x, g0 + SC.rand(0.3, 2.2), y, Math.random() < 0.6 ? 'pollen' : 'firefly', SC.rand(-0.3, 0.3), 0.15, SC.rand(-0.3, 0.3));
      else if (th === 'volcano') GX.emit(x, g0 + 0.2, y, Math.random() < 0.5 ? 'ash' : 'ember', SC.rand(-0.3, 0.3), 1.2, 0);
      else if (th === 'shadow' || th === 'base') GX.emit(x, g0 + SC.rand(0.3, 1.5), y, 'firefly', SC.rand(-0.4, 0.4), 0.1, SC.rand(-0.4, 0.4));
      else if (Math.random() < 0.35) GX.emit(x, g0 + SC.rand(2.5, 4), y, 'fallleaf', SC.rand(-0.6, 0.6), -0.4, SC.rand(-0.3, 0.3));
      else GX.emit(x, g0 + SC.rand(0.2, 1.2), y, 'pollen', SC.rand(-0.3, 0.3), 0.15, 0);
    }
  }

  // ---------- menu stage (title and hero select) ----------
  var menu = null;
  function buildMenu() {
    menu = { heroes: [], g: GX.menuGroup };
    var g = GX.menuGroup, th = SC.THEMES.meadow, part = MD.part;
    // the island: grassy top, earth sides, a sandy path, water around it
    var top = new THREE.Mesh(new THREE.CylinderGeometry(9, 8.4, 0.6, 40, 1), new THREE.MeshLambertMaterial({ color: 0x74c454 }));
    top.position.y = -0.3; top.receiveShadow = true; g.add(top);
    var cliffG = new THREE.CylinderGeometry(8.4, 5.5, 3.2, 40, 3), cp = cliffG.attributes.position;
    for (var i = 0; i < cp.count; i++) { var f = 1 + (SC.hash(Math.round(cp.getX(i) * 10), Math.round(cp.getZ(i) * 10)) - 0.5) * 0.12; cp.setX(i, cp.getX(i) * f); cp.setZ(i, cp.getZ(i) * f); }
    cliffG.computeVertexNormals();
    var cliff = new THREE.Mesh(cliffG, new THREE.MeshLambertMaterial({ color: 0x9a8070, flatShading: true })); cliff.position.y = -2.2; g.add(cliff);
    part(GX.cyl(1, 1, 32), 0xd9c38a, 0, 0.01, 0.9, 3.8, 0.03, 1.9, g).receiveShadow = true;
    var sea = new THREE.Mesh(new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3aa8e0, transparent: true, opacity: 0.9 }));
    sea.position.y = -1.6; g.add(sea); menu.sea = sea;
    var shape = SC.scenery && SC.scenery.shape;
    var vc = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    var trees = [[-6, -3, 'broad0'], [-4.5, -5.5, 'broad1'], [5.5, -3.5, 'broad0'], [3.5, -6, 'pine0'], [-7, 1, 'broad1'], [7, 0.5, 'broad0'], [0, -7, 'broad0'], [-2.5, -6.8, 'pine0'], [6.3, -5.8, 'broad1'], [-7.4, -2, 'pine0'], [7.6, -2.3, 'pine1']];
    trees.forEach(function (tp, i) {
      var tm = new THREE.Mesh(shape ? shape(tp[2], th) : GX.ico(), vc);
      var s = 1.0 + SC.hash(i, 4) * 0.4; tm.scale.set(s, s, s); tm.position.set(tp[0], 0, tp[1]); tm.rotation.y = i * 1.7; tm.castShadow = true; g.add(tm);
    });
    [[-4.2, 2.6, 0.7], [4.6, 2.8, 0.55], [-8, 3.5, 0.9], [8.2, 3.2, 0.8], [2.2, -4.5, 0.6]].forEach(function (r, i) {
      var rm = new THREE.Mesh(shape ? shape('rock' + (i % 2), th) : GX.dodec(), new THREE.MeshLambertMaterial({ color: th.rockCol, vertexColors: true }));
      rm.scale.setScalar(r[2] * 1.3); rm.position.set(r[0], 0, r[1]); rm.rotation.y = i; rm.castShadow = true; g.add(rm);
    });
    for (var f2 = 0; f2 < 60; f2++) part(GX.sphere(6), th.flowers[f2 % th.flowers.length], Math.cos(f2 * 2.4) * (2 + (f2 % 7)), 0.07, Math.sin(f2 * 2.4) * (2 + (f2 % 7)) * 0.8, 0.08, 0.06, 0.08, g);
    // a little portal on the island
    var pg = new THREE.Group(); pg.position.set(0, 0, -4.2); g.add(pg);
    part(GX.cyl(1, 1.1, 16), 0xc8c0b0, 0, 0.1, 0, 1.1, 0.2, 1.1, pg);
    part(GX.geo('portalRing', function () { return new THREE.TorusGeometry(1.0, 0.16, 8, 32); }), 0xd8d0c0, 0, 1.4, 0, 1, 1, 1, pg).castShadow = true;
    menu.portalFilm = new THREE.Mesh(GX.geo('portalDisc', function () { return new THREE.CircleGeometry(0.88, 32); }), new THREE.MeshBasicMaterial({ map: getSwirl(), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    menu.portalFilm.position.y = 1.4; pg.add(menu.portalFilm);
    menu.crests = [];
    SC.POWERS.forEach(function (pw, i) {
      var m = MD.pickup({ kind: 'crest', power: pw.id, id: i, h: 0 });
      if (m.beam) m.beam.visible = false; if (m.shadow) m.shadow.visible = false;
      g.add(m.root); menu.crests.push(m);
    });
    SC.HEROES.forEach(function (h, i) {
      var m = makeHero(h.id, 0);
      shadows(m.root);
      g.add(m.root); menu.heroes.push(m);
    });
    menu.dragon = MD.dragon();
    menu.dragon.root.scale.setScalar(0.8);
    g.add(menu.dragon.root);
  }
  V.menu = function (mode, sel, t, dt) {
    if (!GX.ok) return;
    if (!menu) { buildMenu(); GX.menuSky(); }
    if (!menu.skyOn) { GX.menuSky(); menu.skyOn = true; }
    GX.showWorld(false);
    GX.setSky(0x9fdcff, 0xc8ecff, 30, 90);
    GX.setHemi(0xffffff, 0x7fbf5f, 0.62);
    var cam = GX.camera;
    if (Math.abs(cam.fov - 42) > 0.01) { cam.fov = 42; cam.updateProjectionMatrix(); }
    var N = menu.heroes.length, many = N > 5, sp = many ? 1.12 : 1.6;
    menu.heroes.forEach(function (m, i) {
      var chosen = mode === 'select' && i === sel;
      var hx = (i - (N - 1) / 2) * sp, hz = 0.8 - Math.abs(hx) * (many ? 0.22 : 0) + (chosen ? 0.7 : 0);
      var p = { x: hx, y: hz, face: Math.PI / 2, moving: false, walkT: 0, inv: 0, dashT: 0, hurtT: 0, swingT: 0, swingDur: 0.3, castT: 0, dead: false };
      if (chosen) {
        p.face = Math.PI / 2 + Math.sin(t * 1.5) * 0.8;
        var ph = (t * 1.6) % 2;
        if (ph < 0.35) { p.swingT = 0.35 - ph; p.swingDur = 0.35; p.swingAng = p.face; }
      }
      animHero(m, p, SC.HEROES[i], t, dt, true);
      m.root.position.y = chosen ? Math.abs(Math.sin(t * 5)) * 0.25 : 0;
      var s = chosen ? (many ? 1.15 : 1.25) : (mode === 'select' ? (many ? 0.82 : 0.9) : (many ? 0.85 : 1));
      m.root.scale.set(s, s, s);
    });
    menu.crests.forEach(function (m, i) {
      var a = t * 0.4 + i / 9 * Math.PI * 2;
      m.root.position.set(Math.cos(a) * 4.6, 1.4 + Math.sin(t * 2 + i) * 0.2, Math.sin(a) * 2.2 - (mode === 'select' ? 3.2 : 1.4));
      m.spin.rotation.y += dt * 2;
      m.root.scale.setScalar(0.7);
    });
    if (menu.portalFilm) menu.portalFilm.rotation.z -= dt * 2;
    var da = t * 0.35;
    var dm = menu.dragon;
    dm.root.position.set(Math.cos(da) * 7, 3.6 + Math.sin(t * 1.3) * 0.3, Math.sin(da) * 2.5 - 9);
    dm.root.rotation.y = -da;
    animDragonMenu(dm, t);
    if (Math.random() < 0.2) GX.emit(SC.rand(-8, 8), SC.rand(0.2, 2), SC.rand(-6, 3), 'pollen', SC.rand(-0.3, 0.3), 0.15, 0);
    if (mode === 'title') {
      cam.position.set(Math.sin(t * 0.1) * 1.5, 3.0, many ? 9.6 : 8.5);
      cam.lookAt(0, 1.3, 0);
    } else {
      cam.position.set(0, many ? 3.0 : 2.6, many ? 9.0 : 7.2);
      cam.lookAt(0, 0.45, 0.5);
    }
    GX.sunAt(0, 0, 0);
    GX.updateParticles(dt);
  };
  function animDragonMenu(m, t) {
    var flap = t * 6;
    m.wingL.rotation.z = Math.sin(flap) * 0.6; m.wingR.rotation.z = -Math.sin(flap) * 0.6;
    for (var i = 0; i < m.tail.length; i++) m.tail[i].rotation.y = Math.sin(t * 2.4 - i * 0.6) * 0.2;
    m.jaw.rotation.x = 0.1 + Math.max(0, Math.sin(t * 0.8)) * 0.4;
    m.legs.forEach(function (l) { l.rotation.x = 0.5; });
    m.shadow.visible = false;
  }
  V.leaveMenu = function () { GX.showWorld(true); if (menu) menu.skyOn = false; };
})();
