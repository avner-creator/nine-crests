// Nine Crests - the ten places (nine planets with one temple each, then the Dragon). Each map is grown by a small "map builder" (natural shapes from noise, then hand-placed
// shrines, camps, traps and treasure), and comes out as two text grids: def.map (what is on each tile) and
// def.hmap (how high each tile is: '0', '1', '2' ...; one height step = SC.world.TIER world units).
//
// Tiles in def.map
//   ground  . grass/ground   , flowers   : dirt path   ; paved stone   m mushrooms   i ice   S stone steps (go up toward the higher neighbour)
//   water   w water (walk on it only with Surface Tension as Mira, or flying)   u stepping stone   = bridge   v chasm   l lava
//   solid   # thick forest / rock edge   ^ tree   * boulder   | column   % broken wall   - fallen log   & tent   $ campfire
//           F banner   + signpost   @ crates   y crystals   d dart shooter (trap)   n lightning rod (trap)
//           U market stall   A forge with anvil
//   temples W wall   Q door (shut until the crest task is done)   Y big pillar / brazier   J altar   (see MB.temple)
//   people  N trader   H blacksmith (friendly, not solid)
//   special b bush (sword)   t thorns (Fire)   k cracked boulder (Earth)   T chest   G portal   X portal block
//           P start   C checkpoint   K crest   g gem   h heart   B mini-boss   D dragon   + enemy letters (see SC.ENEMY_CHARS)
// Extra data per level: def.traps (list), def.camps ({'x,y': campNo}), def.crestAt / def.chestAt ({'x,y': value}), def.planet.
(function () {
  'use strict';
  var SC = window.SC;

  function rng(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function vnoise(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, o = s * 131;
    var a = SC.hash(xi + o, yi), b = SC.hash(xi + 1 + o, yi), c = SC.hash(xi + o, yi + 1), d = SC.hash(xi + 1 + o, yi + 1);
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  SC.vnoise = vnoise;
  var DIRS = { E: [1, 0, 0], S: [0, 1, 1], W: [-1, 0, 2], N: [0, -1, 3] };
  var SOLIDS = '#^*|%-&$F+@ydnbtkTGwUAWQYJ';
  // temples: which way is "in" (f), which way is "across" (a), and which way the entrance steps climb, by the side the door faces
  var TDIR = { N: { f: [0, 1], a: [1, 0], climb: 'S' }, S: { f: [0, -1], a: [-1, 0], climb: 'N' }, W: { f: [1, 0], a: [0, -1], climb: 'E' }, E: { f: [-1, 0], a: [0, 1], climb: 'W' } };
  var DIRI = function (x, y) { return x > 0 ? 0 : y > 0 ? 1 : x < 0 ? 2 : 3; };

  // ---------------- the map builder ----------------
  function MB(w, h, seed) {
    this.w = w; this.h = h; this.seed = seed; this.r = rng(seed);
    this.t = []; this.z = []; this.stairDir = {}; this.traps = []; this.camps = {}; this.crestAt = {}; this.chestAt = {}; this.temples = [];
    for (var i = 0; i < w * h; i++) { this.t.push('.'); this.z.push(0); }
  }
  MB.prototype = {
    ok: function (x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; },
    get: function (x, y) { return this.ok(x, y) ? this.t[y * this.w + x] : '#'; },
    set: function (x, y, ch) { if (this.ok(x, y)) this.t[y * this.w + x] = ch; },
    tier: function (x, y) { return this.ok(x, y) ? this.z[y * this.w + x] : 0; },
    setTier: function (x, y, n) { if (this.ok(x, y)) this.z[y * this.w + x] = n; },
    noise: function (x, y, sc) { return vnoise(x / sc, y / sc, this.seed) * 0.65 + vnoise(x / sc * 2.3, y / sc * 2.3, this.seed + 7) * 0.35; },
    // run fn on every tile inside a noisy ellipse
    each: function (cx, cy, rx, ry, rough, fn) {
      for (var y = Math.floor(cy - ry - 3); y <= Math.ceil(cy + ry + 3); y++) for (var x = Math.floor(cx - rx - 3); x <= Math.ceil(cx + rx + 3); x++) {
        if (!this.ok(x, y)) continue;
        var dx = (x - cx) / rx, dy = (y - cy) / ry, d = Math.sqrt(dx * dx + dy * dy);
        var lim = 1 + (this.noise(x, y, 3.5) - 0.5) * rough * 2;
        if (d < lim) fn.call(this, x, y, d / lim);
      }
    },
    fill: function (cx, cy, rx, ry, ch, rough, only) { this.each(cx, cy, rx, ry, rough || 0, function (x, y) { if (!only || only.indexOf(this.get(x, y)) >= 0) this.set(x, y, ch); }); },
    raise: function (cx, cy, rx, ry, tier, rough) { this.each(cx, cy, rx, ry, rough || 0, function (x, y) { this.setTier(x, y, tier); }); },
    rect: function (x0, y0, x1, y1, ch, only) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) if (!only || only.indexOf(this.get(x, y)) >= 0) this.set(x, y, ch); },
    rectTier: function (x0, y0, x1, y1, n) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) this.setTier(x, y, n); },
    // a thick line through points: paths, streams, chasms. bridge=true turns water/chasm under a path into a bridge
    line: function (pts, ch, width, only, bridge) {
      var rad = width / 2;
      for (var i = 0; i + 1 < pts.length; i++) {
        var ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
        var len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)), n = Math.max(1, Math.ceil(len * 4));
        for (var k = 0; k <= n; k++) {
          var px = ax + (bx - ax) * k / n, py = ay + (by - ay) * k / n;
          for (var y = Math.floor(py - rad - 1); y <= Math.ceil(py + rad + 1); y++) for (var x = Math.floor(px - rad - 1); x <= Math.ceil(px + rad + 1); x++) {
            if (Math.abs(x - px) > rad || Math.abs(y - py) > rad) continue;
            var cur = this.get(x, y);
            if (cur === '#' && x > 0 && y > 0 && x < this.w - 1 && y < this.h - 1 && ch !== 'w' && ch !== 'v') { this.set(x, y, ch); continue; }
            if (cur === '#') continue;
            if (bridge && (cur === 'w' || cur === 'v' || cur === '=')) { this.set(x, y, '='); continue; }
            if (bridge && (cur === 'u' || cur === 'S' || cur === ';')) continue;
            if (!only || only.indexOf(cur) >= 0) this.set(x, y, ch);
          }
        }
      }
    },
    forest: function (cx, cy, rx, ry, dens, rough, ch) {
      ch = ch || '^';
      this.each(cx, cy, rx, ry, rough || 0.4, function (x, y, d) {
        if (this.get(x, y) !== '.') return;
        var k = dens * (0.55 + this.noise(x + 40, y + 40, 2.5) * 0.9) * (d > 0.8 ? 0.7 : 1);
        if (this.r() < k) this.set(x, y, ch);
        else if (this.r() < 0.06) this.set(x, y, this.r() < 0.5 ? ',' : 'm');
      });
    },
    scatter: function (ch, n, x0, y0, x1, y1, only) {
      only = only || '.';
      for (var i = 0, tries = 0; i < n && tries < n * 30; tries++) {
        var x = x0 + Math.floor(this.r() * (x1 - x0 + 1)), y = y0 + Math.floor(this.r() * (y1 - y0 + 1));
        if (only.indexOf(this.get(x, y)) < 0) continue;
        this.set(x, y, ch); i++;
      }
    },
    // remove solid scenery (and optionally water) in a disc, keeping heights
    clear: function (cx, cy, r, ch, water) {
      ch = ch || '.';
      this.each(cx, cy, r + 0.01, r + 0.01, 0, function (x, y) {
        var c = this.get(x, y);
        if (x <= 0 || y <= 0 || x >= this.w - 1 || y >= this.h - 1) return;
        if ((SOLIDS.indexOf(c) >= 0 && c !== 'w') || (water && (c === 'w' || c === 'v' || c === 'l'))) this.set(x, y, ch);
      });
    },
    border: function (th) {
      for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) {
        var d = Math.min(x, y, this.w - 1 - x, this.h - 1 - y);
        if (d < th + Math.floor(this.noise(x * 1.7, y * 1.7, 2) * 2.6) - (d === 0 ? 0 : 0)) this.set(x, y, '#');
        if (d === 0) this.set(x, y, '#');
      }
    },
    // stone steps: tiles at (x,y) going `width` sideways, climbing toward dir from tier `low` to low+1
    stairs: function (x, y, dir, width, low) {
      var D = DIRS[dir], px = -D[1], py = D[0];
      if (px < 0 || py < 0) { px = -px; py = -py; }
      for (var i = 0; i < width; i++) {
        var sx = x + px * i, sy = y + py * i;
        this.set(sx, sy, 'S'); this.setTier(sx, sy, low); this.stairDir[sx + ',' + sy] = D[2];
        for (var k = 1; k <= 2; k++) { var ux = sx + D[0] * k, uy = sy + D[1] * k; this.setTier(ux, uy, low + 1); if (SOLIDS.indexOf(this.get(ux, uy)) >= 0 || this.get(ux, uy) === 'S') this.set(ux, uy, '.'); }
        for (var j = 1; j <= 2; j++) { var dx = sx - D[0] * j, dy = sy - D[1] * j; this.setTier(dx, dy, low); if (SOLIDS.indexOf(this.get(dx, dy)) >= 0 || this.get(dx, dy) === 'S') this.set(dx, dy, '.'); }
      }
    },
    put: function (x, y, ch, keep) { if (!keep) this.clear(x, y, 1); this.set(x, y, ch); },
    enemy: function (x, y, ch, camp) { this.clear(x, y, 0.5); if (this.get(x, y) === 'w') this.set(x, y, '.'); this.set(x, y, ch); if (camp) this.camps[x + ',' + y] = camp; },
    crest: function (x, y, power) { this.set(x, y, 'K'); this.crestAt[x + ',' + y] = power; },
    chest: function (x, y, content) { this.clear(x, y, 1); this.set(x, y, 'T'); this.chestAt[x + ',' + y] = content; },
    // a little stone shrine (paved square, four columns) with something in the middle
    shrine: function (x, y, power, cols) {
      this.clear(x, y, 3.2);
      this.rect(x - 2, y - 2, x + 2, y + 2, ';');
      var t0 = this.tier(x, y);
      for (var yy = y - 2; yy <= y + 2; yy++) for (var xx = x - 2; xx <= x + 2; xx++) this.setTier(xx, yy, t0);
      if (cols !== false) { this.set(x - 2, y - 2, '|'); this.set(x + 2, y - 2, '|'); this.set(x - 2, y + 2, '|'); this.set(x + 2, y + 2, '|'); }
      if (power) this.crest(x, y, power);
    },
    // a round paved fighting ring with columns (skip = direction left open, e.g. 'N' toward the portal)
    arena: function (x, y, r, skip) {
      this.clear(x, y, r + 1.6, '.', true);
      var t0 = this.tier(x, y);
      this.each(x, y, r + 1.6, r + 1.6, 0, function (xx, yy) { this.setTier(xx, yy, t0); });
      this.fill(x, y, r, r, ';', 0);
      var sk = skip ? DIRS[skip] : null;
      for (var a = 0; a < 10; a++) {
        var ang = a / 10 * Math.PI * 2 + 0.31, cx = Math.round(x + Math.cos(ang) * (r + 1)), cy = Math.round(y + Math.sin(ang) * (r + 1));
        if (sk && Math.cos(ang) * sk[0] + Math.sin(ang) * sk[1] > 0.55) continue;
        if (a % 3 === 2) continue;
        this.set(cx, cy, '|');
      }
    },
    // a baddie camp: tents, a campfire, a banner, crates, and its baddies
    camp: function (x, y, id, list) {
      this.clear(x, y, 4.2);
      this.fill(x, y, 3, 2.6, ':', 0.3, '.,m');
      this.set(x - 2, y - 2, '&'); this.set(x + 2, y - 2, '&');
      this.set(x, y, '$'); this.set(x + 3, y + 1, 'F'); this.set(x - 3, y + 1, '@');
      var spots = [[-1, 1], [1, 1], [0, 2], [-2, 0], [2, 0], [-1, -1]];
      for (var i = 0; i < list.length; i++) this.enemy(x + spots[i][0], y + spots[i][1], list[i], id);
    },
    // a calm little market: the trader (N) in front of a stall (U), the blacksmith (H) in front of a forge (A); both face south
    village: function (x, y) {
      this.clear(x + 2, y, 3.6, '.', true);
      var t0 = this.tier(x, y);
      this.each(x + 2, y, 3.6, 3.6, 0, function (xx, yy) { if (xx > 0 && yy > 0 && xx < this.w - 1 && yy < this.h - 1) this.setTier(xx, yy, t0); });
      this.fill(x + 2, y, 3.2, 2.2, ':', 0.3, '.,m');
      this.set(x, y - 1, 'U'); this.set(x + 4, y - 1, 'A');
      this.set(x - 1, y - 1, '@'); this.set(x + 2, y + 2, '+');
      this.set(x, y, 'N'); this.set(x + 4, y, 'H');
    },
    trap: function (o) {
      this.traps.push(o);
      if (o.kind === 'darts') this.set(o.tx, o.ty, 'd');
      else if (o.kind === 'rod') this.set(o.tx, o.ty, 'n');
      else if (SOLIDS.indexOf(this.get(o.tx, o.ty)) >= 0) this.set(o.tx, o.ty, '.');
      return this.traps.length - 1;
    },
    // make the map bigger to the right (dw) and/or down (dh); the old part stays exactly as it was (its old edge forest
    // becomes a natural wall), the new part is open ground at height 0 with a forest edge of its own
    grow: function (dw, dh, th) {
      var ow = this.w, oh = this.h, nw = ow + dw, nh = oh + dh, t = [], z = [], x, y;
      for (y = 0; y < nh; y++) for (x = 0; x < nw; x++) {
        if (x < ow && y < oh) { t.push(this.t[y * ow + x]); z.push(this.z[y * ow + x]); } else { t.push('.'); z.push(0); }
      }
      this.t = t; this.z = z; this.w = nw; this.h = nh;
      for (y = 0; y < nh; y++) for (x = 0; x < nw; x++) {
        if (x < ow && y < oh) continue;
        var d = Math.min(x, y, nw - 1 - x, nh - 1 - y);
        if (d === 0 || d < th + Math.floor(this.noise(x * 1.7, y * 1.7, 2) * 2.6)) this.set(x, y, '#');
      }
    },
    // A crest temple. (ex, ey) = the middle of the paved square in front of it, side = the way its door faces.
    // Local spots: u = across (-5..5), v = inwards: 0 square, 1 steps (between two big pillars), 2 front wall with a door (Q),
    // 3..8 trap hall, 9 inner wall with an arch, 10..16 guardian chamber (braziers in the corners), 15 the crest, 16 its altar (J), 17 back wall.
    // traps: [{kind, u, v, dir: [du, dv] (local), ...}] for the trap hall.
    temple: function (ex, ey, power, side, traps) {
      var D = TDIR[side], self = this, u, v;
      function P(uu, vv) { return [ex + D.a[0] * uu + D.f[0] * vv, ey + D.a[1] * uu + D.f[1] * vv]; }
      function put(uu, vv, ch, tier) { var q = P(uu, vv); self.set(q[0], q[1], ch); if (tier !== undefined) self.setTier(q[0], q[1], tier); }
      function box(u0, v0, u1, v1) { var a = P(u0, v0), b = P(u1, v1); return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) }; }
      function pt(uu, vv) { var q = P(uu, vv); return { tx: q[0], ty: q[1] }; }
      var t0 = this.tier(ex, ey);
      for (v = -2; v <= 18; v++) for (u = -6; u <= 6; u++) {
        var q = P(u, v);
        if (q[0] <= 0 || q[1] <= 0 || q[0] >= this.w - 1 || q[1] >= this.h - 1) continue;
        this.set(q[0], q[1], '.'); this.setTier(q[0], q[1], t0);
      }
      for (v = -1; v <= 0; v++) for (u = -3; u <= 3; u++) put(u, v, ';', t0);
      for (v = 1; v <= 17; v++) for (u = -5; u <= 5; u++) {
        var ch = ';';
        if (Math.abs(u) === 5 || v === 2 || v === 9 || v === 17) ch = 'W';
        if (v === 9 && Math.abs(u) <= 1) ch = ';';
        put(u, v, ch, t0 + 1);
      }
      var s0 = P(-1, 1), s1 = P(1, 1);
      this.stairs(Math.min(s0[0], s1[0]), Math.min(s0[1], s1[1]), D.climb, 3, t0);
      for (u = -1; u <= 1; u++) put(u, 2, 'Q', t0 + 1);
      put(-2, 1, 'Y'); put(2, 1, 'Y');                          // the two big entrance pillars
      put(-4, 0, 'Y'); put(4, 0, 'Y');                          // braziers outside
      put(-4, 10, 'Y'); put(4, 10, 'Y'); put(-4, 16, 'Y'); put(4, 16, 'Y');   // braziers in the chamber
      put(0, 16, 'J');                                          // the altar
      var c = P(0, 15); this.crest(c[0], c[1], power);
      var self2 = this;
      (traps || []).forEach(function (o) {
        var w = P(o.u, o.v), tr = {};
        for (var k in o) if (k !== 'u' && k !== 'v' && k !== 'dir') tr[k] = o[k];
        tr.tx = w[0]; tr.ty = w[1];
        if (o.dir) tr.dir = DIRI(D.a[0] * o.dir[0] + D.f[0] * o.dir[1], D.a[1] * o.dir[0] + D.f[1] * o.dir[1]);
        if (o.link !== undefined) tr.link = self2.traps.length + o.link;
        self2.trap(tr);
      });
      this.temples.push({
        power: power, side: side, f: D.f, a: D.a, t0: t0, ex: ex, ey: ey,
        door: [pt(-1, 2), pt(0, 2), pt(1, 2)], guard: pt(0, 12), altar: pt(0, 15), entry: pt(0, -1), mid: pt(0, 6),
        rect: box(-5, 1, 5, 17), hall: box(-4, 3, 4, 8), chamber: box(-4, 10, 4, 16), arch: [pt(-1, 9), pt(0, 9), pt(1, 9)],
        pillars: [pt(-2, 1), pt(2, 1)], braziers: [pt(-4, 0), pt(4, 0), pt(-4, 10), pt(4, 10), pt(-4, 16), pt(4, 16)], altarBlock: pt(0, 16)
      });
    },
    // ---------------- tall buildings ----------------
    // A district of tall buildings far from the start: the map grows to the right, the district sits in the far top of
    // the new part, and a path is cut to ground the hero can already walk to. Four solid towers (Z tiles, their height is
    // the tile height) and one keep with steps along two sides up to a high roof with a treasure chest.
    // opts: { style (how they look), enemy (baddie letter), grow (tiles), dy (0 = top .. 1 = bottom) }
    district: function (opts) {
      var ow = this.w, gw = opts.grow || 24, self = this, x, y;
      this.grow(gw, 0, 2);
      var cx = ow + Math.floor(gw / 2), cy = Math.round(10 + (this.h - 20) * (opts.dy || 0));
      // the new land: woods, rocks and flowers like the rest of the planet
      this.forest(cx, this.h * 0.55, gw * 0.45, this.h * 0.5, 0.2, 0.5);
      this.scatter('*', Math.round(this.h / 8), ow + 2, 2, ow + gw - 3, this.h - 3);
      this.scatter(',', Math.round(this.h / 2), ow + 2, 2, ow + gw - 3, this.h - 3);
      for (y = cy - 7; y <= cy + 7; y++) for (x = cx - 9; x <= cx + 9; x++) { this.set(x, y, Math.abs(x - cx) <= 8 && Math.abs(y - cy) <= 6 ? ';' : '.'); this.setTier(x, y, 0); }
      this.towers = this.towers || [];
      function solid(x0, y0, x1, y1, top, topper) {
        for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) { self.set(xx, yy, 'Z'); self.setTier(xx, yy, top); }
        self.towers.push({ x0: x0, y0: y0, x1: x1, y1: y1, top: top, style: opts.style, topper: topper });
      }
      solid(cx - 8, cy - 6, cx - 6, cy - 4, 9, 'spire');
      solid(cx + 5, cy - 6, cx + 7, cy - 3, 7, 'dome');
      solid(cx + 5, cy + 2, cx + 8, cy + 4, 6, 'crown');
      solid(cx - 8, cy - 1, cx - 7, cy + 2, 8, 'spire');
      // the keep: 6 x 6, entrance at its bottom-left corner, steps up the west side then the east-going north side
      var x0 = cx - 3, y0 = cy - 2, R = 8, k;
      for (y = y0; y <= y0 + 5; y++) for (x = x0; x <= x0 + 5; x++) { this.set(x, y, ';'); this.setTier(x, y, R); }
      this.setTier(x0, y0 + 5, 0);                                          // the way in
      for (k = 0; k < 4; k++) { var sy = y0 + 4 - k; this.set(x0, sy, 'S'); this.setTier(x0, sy, k); this.stairDir[x0 + ',' + sy] = 3; }
      this.setTier(x0, y0, 4);                                               // a landing at the corner
      for (k = 0; k < 4; k++) { var sx = x0 + 1 + k; this.set(sx, y0, 'S'); this.setTier(sx, y0, 4 + k); this.stairDir[sx + ',' + y0] = 0; }
      this.chest(cx, cy + 1, 'gems'); this.setTier(cx, cy + 1, R);
      this.set(cx - 1, cy + 2, 'g'); this.set(cx + 1, cy, 'g'); this.set(cx - 1, cy, 'g');
      this.towers.push({ x0: x0, y0: y0, x1: x0 + 5, y1: y0 + 5, top: R, style: opts.style, climb: true, roof: { tx: cx + 2, ty: cy }, chest: { tx: cx, ty: cy + 1 }, topper: 'flag' });
      this.extraChests = (this.extraChests || 0) + 1;
      // a few guards and a trap
      this.enemy(cx + 3, cy + 6, opts.enemy || 'a'); this.enemy(cx - 4, cy - 5, opts.enemy || 'a'); this.enemy(cx + 1, cy - 5, opts.enemy2 || opts.enemy || 'a');
      this.trap({ kind: 'spikes', tx: cx + 1, ty: cy + 5, period: 3, phase: 0 });
      this.trap({ kind: 'spikes', tx: cx + 2, ty: cy + 5, period: 3, phase: 0.5 });
      this.district = { x: cx, y: cy };
      this.connect(cx - 9, cy + 5);
    },
    // cut the shortest path from (sx, sy) to ground that can be walked to from the start (no powers): it only goes
    // between tiles of the same height (or up proper steps), cuts through trees and rocks, never through water or temples
    connect: function (sx, sy) {
      var w = this.w, h = this.h, self = this, N = w * h, i, x, y;
      var FL = '.,i:=;mSuPCKghBDXNH' + 'asxqfRzoe';
      var CUT = '#^*|%-&$F+@yb';
      var inTemple = new Uint8Array(N);
      this.temples.forEach(function (t) { var R = t.rect; for (var yy = R.y0 - 1; yy <= R.y1 + 1; yy++) for (var xx = R.x0 - 1; xx <= R.x1 + 1; xx++) if (self.ok(xx, yy)) inTemple[yy * w + xx] = 1; });
      var NB = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      function eh(ix, d) {
        var ch = self.t[ix], z = self.z[ix];
        if (ch !== 'S') return z;
        var s = self.stairDir[(ix % w) + ',' + Math.floor(ix / w)];
        if (d === s) return z + 1; if (d === (s + 2) % 4) return z; return NaN;
      }
      function step(a, b, d) { var ha = eh(a, d), hb = eh(b, (d + 2) % 4); return !isNaN(ha) && !isNaN(hb) && Math.abs(ha - hb) < 0.3; }
      // 1) what can be walked to from the start
      var reach = new Uint8Array(N), q = [], start = this.t.indexOf('P');
      if (start < 0) return;
      reach[start] = 1; q.push(start);
      while (q.length) {
        var c = q.pop(), cx0 = c % w, cy0 = Math.floor(c / w);
        for (i = 0; i < 4; i++) {
          x = cx0 + NB[i][0]; y = cy0 + NB[i][1];
          if (!this.ok(x, y)) continue;
          var n = y * w + x;
          if (reach[n] || FL.indexOf(this.t[n]) < 0 || !step(c, n, i)) continue;
          reach[n] = 1; q.push(n);
        }
      }
      // 2) cheapest way from (sx, sy) to that ground (bucket queue)
      var dist = new Int32Array(N).fill(1e9), prev = new Int32Array(N).fill(-1), buckets = [[sy * w + sx]], end = -1;
      dist[sy * w + sx] = 0;
      for (var cost = 0; cost < buckets.length && end < 0; cost++) {
        var bk = buckets[cost]; if (!bk) continue;
        for (var bi = 0; bi < bk.length && end < 0; bi++) {
          var cur = bk[bi]; if (dist[cur] !== cost) continue;
          if (reach[cur]) { end = cur; break; }
          var ux = cur % w, uy = Math.floor(cur / w);
          for (i = 0; i < 4; i++) {
            x = ux + NB[i][0]; y = uy + NB[i][1];
            if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
            var m = y * w + x, ch = this.t[m];
            if (inTemple[m] || this.towerAt(x, y)) continue;
            var cc = FL.indexOf(ch) >= 0 ? 1 : CUT.indexOf(ch) >= 0 ? 4 : 0;
            if (!cc || !step(cur, m, i)) continue;
            var nd = cost + cc;
            if (nd < dist[m]) { dist[m] = nd; prev[m] = cur; (buckets[nd] = buckets[nd] || []).push(m); }
          }
        }
      }
      if (end < 0) return;
      for (var p = end; p >= 0; p = prev[p]) {
        if (CUT.indexOf(this.t[p]) >= 0) this.t[p] = ':';
        // two tiles wide where the next one down is at the same height
        var px = p % w, py = Math.floor(p / w), o = (py + 1) * w + px;
        if (py + 1 < h - 1 && CUT.indexOf(this.t[o]) >= 0 && this.z[o] === this.z[p] && !inTemple[o] && !this.towerAt(px, py + 1) && this.t[p] !== 'S') this.t[o] = ':';
      }
    },
    towerAt: function (x, y) {
      var ts = this.towers || [];
      for (var i = 0; i < ts.length; i++) if (x >= ts[i].x0 && x <= ts[i].x1 && y >= ts[i].y0 && y <= ts[i].y1) return true;
      return false;
    },
    out: function (def) {
      var rows = [], hrows = [];
      for (var y = 0; y < this.h; y++) {
        var s = '', hs = '';
        for (var x = 0; x < this.w; x++) {
          var ch = this.t[y * this.w + x];
          if (x === 0 || y === 0 || x === this.w - 1 || y === this.h - 1) ch = '#';
          s += ch; hs += String(this.z[y * this.w + x]);
        }
        rows.push(s); hrows.push(hs);
      }
      def.map = rows; def.hmap = hrows; def.stairs = this.stairDir; def.traps = this.traps; def.camps = this.camps; def.crestAt = this.crestAt; def.chestAt = this.chestAt;
      def.temples = this.temples;
      def.towers = this.towers || [];
      if (this.district) def.district = this.district;
      for (var c = 0; c < (this.extraChests || 0); c++) def.chests = def.chests.concat(['gems']);   // the roof treasure
      return def;
    }
  };
  SC.MapBuilder = MB;

  // ---------------- level 1: Sunny Meadow (gentle, teaches everything) ----------------
  function meadow() {
    var b = new MB(64, 46, 101);
    b.border(2);
    b.raise(53, 8, 16, 11.5, 1, 0.3);          // the high meadow in the north-east
    b.rectTier(44, 0, 63, 5, 1);
    b.raise(56, 12, 4.5, 3.4, 2, 0.2);          // a little hill on top of it
    b.fill(17, 20, 7.5, 5, 'w', 0.3);           // the lake
    b.fill(17, 20, 1.7, 1.3, '.', 0);           // its island
    b.line([[24, 21], [28, 25], [30, 31], [31, 37], [32, 45]], 'w', 2);   // the stream
    b.forest(10, 9, 9, 7, 0.55, 0.4);
    b.forest(22, 43, 11, 3.5, 0.5, 0.5);
    b.forest(60, 33, 5, 11, 0.6, 0.4);
    b.forest(59, 3, 5, 3, 0.45, 0.3);
    b.forest(4, 34, 3, 8, 0.55, 0.3);
    b.forest(44, 40, 5, 4, 0.35, 0.4);
    b.scatter('^', 22, 3, 3, 60, 43);
    b.forest(40, 38, 4.5, 3.5, 0.22, 0.3, '*');  // rock field
    b.scatter('*', 10, 3, 3, 60, 43);
    b.scatter(',', 70, 3, 3, 60, 43);
    b.scatter('m', 8, 3, 3, 60, 43);
    b.scatter('b', 3, 10, 30, 40, 42);
    // keep the ground under the steps and the paths at the right heights
    b.rectTier(42, 21, 48, 25, 0); b.rectTier(28, 8, 35, 13, 0);
    // paths (they cut through trees; a bridge where they cross the stream)
    b.line([[7, 40], [12, 38], [18, 35], [24, 33], [31, 31], [38, 29], [44, 26], [45, 22]], ':', 2, null, true);
    b.line([[7, 40], [6, 34], [6, 30]], ':', 2, null, true);
    b.line([[27, 15], [31, 12], [35, 11]], ':', 2, null, true);
    b.line([[24, 33], [21, 27], [17, 26]], ':', 1, null, true);
    b.stairs(44, 20, 'N', 3, 0);
    b.stairs(36, 10, 'E', 2, 0);
    b.line([[45, 18], [46, 14], [47, 11]], ':', 2, null, true);
    b.line([[38, 11], [42, 10]], ':', 2, null, true);
    b.rectTier(54, 17, 58, 19, 1);
    b.stairs(55, 16, 'N', 2, 1);
    b.line([[46, 16], [52, 18], [55, 17]], ':', 1, null, true);
    // the stepping stones to the island
    b.line([[17, 26], [17, 22]], 'u', 1, 'w');
    // old little shrines (the crests now live in the temples of the valley in the south)
    b.shrine(6, 27, null);
    b.shrine(56, 11, null);
    b.shrine(27, 14, null);
    b.shrine(42, 41, null);
    b.fill(42, 41, 4, 3, '%', 0, '*'); b.set(39, 39, '|'); b.set(45, 43, '|'); b.set(44, 38, '%');
    // the mini-boss ring and the portal
    b.arena(48, 9, 4, 'N');
    b.set(48, 9, 'B');
    b.clear(48, 3, 1.5); b.rect(47, 3, 49, 4, ';'); b.rectTier(46, 2, 50, 4, 1);
    b.set(48, 3, 'G');
    // camps
    b.camp(11, 9, 1, ['a', 'a', 's']);
    b.camp(51, 33, 2, ['a', 'x', 's']);
    b.enemy(27, 29, 'a');
    b.enemy(38, 23, 'a');
    // portal blocks
    b.set(17, 20, 'X');                               // on the island
    b.set(51, 31, 'X');                               // in the camp, between the tents
    // a little ruin with spike plates guarding a block
    b.clear(35, 20, 2.5); b.rect(33, 18, 37, 22, ';');
    b.rect(33, 18, 37, 18, '%'); b.rect(33, 19, 33, 21, '%'); b.rect(37, 19, 37, 21, '%'); b.set(33, 22, '|'); b.set(37, 22, '|');
    b.set(35, 20, 'X');
    b.trap({ kind: 'spikes', tx: 34, ty: 21, period: 3, phase: 0 });
    b.trap({ kind: 'spikes', tx: 35, ty: 21, period: 3, phase: 0.33 });
    b.trap({ kind: 'spikes', tx: 36, ty: 21, period: 3, phase: 0.66 });
    b.trap({ kind: 'spikes', tx: 35, ty: 19, period: 3, phase: 0.5 });
    // rolling logs on the high meadow guard a block
    b.clear(39, 7, 1.2); b.set(39, 7, 'X');
    b.line([[41, 3], [41, 14]], '.', 1, '^*,mb');
    b.trap({ kind: 'roller', tx: 41, ty: 3, dir: 1, len: 11, period: 3.2, phase: 0, what: 'log' });
    // a pressure plate fires darts across the path to the fire shrine
    b.trap({ kind: 'darts', tx: 3, ty: 32, dir: 0, period: 0, phase: 0, len: 7 });
    b.trap({ kind: 'plate', tx: 6, ty: 33, link: b.traps.length - 1 });
    // treasure up on the hill, checkpoints, goodies
    b.chest(59, 12, 'gems');
    b.chest(38, 5, 'life');                         // extra life behind the rolling logs
    b.put(25, 34, 'C', true); b.put(45, 24, 'C', true);
    b.village(9, 35);
    b.clear(7, 40, 1.5); b.set(7, 40, 'P');
    ['g', 'g', 'g', 'g', 'h', 'g', 'h'].forEach(function (c, i) { b.scatter(c, 1, 5 + i * 7, 10, 10 + i * 7, 40); });
    b.set(57, 13, 'g'); b.set(55, 13, 'g');
    // the Fire Temple in a little clearing south of the meadow, through a gap in the forest edge; woods and a pond on both sides
    b.grow(0, 26, 2);
    b.forest(12, 60, 9, 8, 0.5, 0.4); b.forest(53, 60, 9, 8, 0.5, 0.4);
    b.fill(48, 62, 3.2, 2.2, 'w', 0.3);
    b.clear(27, 45.5, 3.4);   // a wide gap in the forest edge
    b.line([[24, 41], [26, 47], [32, 47]], ':', 2, null, true);
    b.temple(32, 50, 'fire', 'N', [
      { kind: 'vent', u: -1, v: 4, period: 3.8, phase: 0 }, { kind: 'vent', u: 1, v: 4, period: 3.8, phase: 0 },
      { kind: 'vent', u: 0, v: 6, period: 3.8, phase: 0.5 }, { kind: 'vent', u: -2, v: 7, period: 3.8, phase: 0.25 }, { kind: 'vent', u: 2, v: 7, period: 3.8, phase: 0.25 }]);
    b.scatter(',', 18, 4, 46, 60, 69); b.scatter('m', 5, 4, 46, 60, 69); b.scatter('*', 4, 4, 46, 60, 69);
    b.district({ style: 'meadow', enemy: 'a', enemy2: 's' });   // tall buildings far from the start
    return b.out({ name: 'Sunny Meadow', theme: 'meadow', planet: 'verdia', tier: 0, music: 0, crests: ['fire'], chests: ['gems', 'life'], boss: 'chief', teach: true });
  }

  // ---------------- level 2: Bubble Lagoon ----------------
  function lagoon() {
    var b = new MB(64, 46, 202);
    b.border(2);
    b.raise(11, 12, 10, 10, 1, 0.3);            // west cliffs
    b.raise(10, 8, 4, 3.2, 2, 0.15);            // lookout
    b.fill(37, 24, 14, 11, 'w', 0.25);          // the lagoon
    b.fill(45, 24, 3.2, 2.8, '.', 0.1);         // portal island
    b.fill(31, 19, 1.4, 1.2, '.', 0);           // rocky islet
    b.fill(10, 38, 4, 2.5, 'w', 0.4);           // a tide pool
    b.forest(20, 6, 7, 3, 0.4, 0.4);
    b.forest(58, 40, 4, 4, 0.5, 0.4);
    b.forest(4, 28, 2.5, 6, 0.5, 0.3);
    b.forest(30, 42, 10, 2, 0.35, 0.4);
    b.forest(57, 8, 4, 3, 0.25, 0.5, '*');
    b.scatter('^', 22, 3, 3, 60, 43);
    b.scatter('*', 12, 3, 3, 60, 43);
    b.scatter(',', 40, 3, 3, 60, 43);
    b.scatter('b', 3, 3, 25, 25, 42);
    b.rectTier(13, 22, 20, 26, 0); b.rectTier(18, 13, 23, 17, 0);
    // paths
    b.line([[6, 40], [14, 35], [18, 30], [17, 24]], ':', 2, null, true);
    b.stairs(16, 21, 'N', 3, 0);
    b.line([[16, 19], [13, 15], [11, 13]], ':', 2, null, true);
    b.rectTier(9, 13, 12, 14, 1);
    b.stairs(10, 12, 'N', 2, 1);
    b.line([[6, 40], [20, 41], [36, 39], [50, 38], [56, 33], [57, 29]], ':', 2, null, true);
    b.line([[22, 6], [30, 6], [40, 7], [52, 8]], ':', 1, null, true);
    b.line([[52, 8], [57, 14], [57, 20]], ':', 1, null, true);
    b.line([[17, 24], [22, 22], [24, 15], [22, 7]], ':', 1, null, true);
    b.line([[31, 12], [31, 18]], 'u', 1, 'w');
    // an old shrine on the lookout (the Surface crest is in the Bubble Temple in the east), the portal on its island
    b.shrine(10, 8, null);
    b.clear(45, 24, 2); b.rect(44, 23, 46, 25, ';'); b.set(45, 24, 'G');
    b.arena(57, 24, 3.5);
    b.set(57, 24, 'B');
    // camps
    b.camp(30, 5, 1, ['q', 'q', 'x']);
    b.camp(47, 41, 2, ['a', 'q', 's']);
    b.enemy(56, 11, 'q');
    b.enemy(22, 33, 'q');
    // blocks
    b.set(30, 3, 'X');                    // camp 1
    b.set(31, 19, 'X');                   // rocky islet (stepping stones)
    // geysers guard the north-east block
    b.clear(58, 6, 1.2); b.set(58, 5, 'X');
    [[56, 8, 0], [58, 8, 0.4], [60, 8, 0.75], [57, 10, 0.2], [59, 10, 0.6]].forEach(function (g) { b.trap({ kind: 'geyser', tx: g[0], ty: g[1], period: 3.4, phase: g[2] }); });
    // darts across the cliff-top path guard a block
    b.clear(4, 15, 1); b.set(4, 15, 'X');
    b.trap({ kind: 'darts', tx: 3, ty: 17, dir: 0, period: 2.6, phase: 0, len: 12 });
    b.trap({ kind: 'darts', tx: 3, ty: 13, dir: 0, period: 2.6, phase: 0.5, len: 12 });
    // a gem chest behind spike plates
    b.chest(14, 4, 'gems');
    [[13, 6, 0], [14, 6, 0.33], [15, 6, 0.66]].forEach(function (s) { b.clear(s[0], s[1], 0.4); b.trap({ kind: 'spikes', tx: s[0], ty: s[1], period: 2.8, phase: s[2] }); });
    b.chest(60, 40, 'gems');
    b.chest(32, 19, 'life');                        // extra life on the rocky islet
    b.village(20, 36);
    b.put(16, 34, 'C', true); b.put(52, 36, 'C', true);
    b.clear(6, 40, 1.5); b.set(6, 40, 'P');
    ['g', 'g', 'h', 'g', 'g', 'h'].forEach(function (c, i) { b.scatter(c, 1, 5 + i * 9, 30, 12 + i * 9, 42); });
    // the Bubble Temple on a new shore in the east, past the mini-boss ring
    b.grow(24, 0, 2);
    b.line([[56, 34], [62, 38], [76, 38]], ':', 2, null, true);
    b.temple(76, 37, 'surface', 'S', [
      { kind: 'geyser', u: -2, v: 4, period: 3.2, phase: 0 }, { kind: 'geyser', u: 2, v: 4, period: 3.2, phase: 0.4 }, { kind: 'geyser', u: 0, v: 5, period: 3.2, phase: 0.2 },
      { kind: 'geyser', u: -2, v: 7, period: 3.2, phase: 0.6 }, { kind: 'geyser', u: 2, v: 7, period: 3.2, phase: 0.8 },
      { kind: 'darts', style: 'water', u: -5, v: 6, dir: [1, 0], period: 3.0, phase: 0.5, len: 9 }]);
    b.district({ style: 'lagoon', enemy: 'q', enemy2: 'x' });   // tall buildings far from the start
    return b.out({ name: 'Bubble Lagoon', theme: 'lagoon', planet: 'bubblon', tier: 4, music: 1, crests: ['surface'], chests: ['gems', 'gems', 'life'], boss: 'captain' });
  }

  // ---------------- level 3: Frosty Peaks ----------------
  function frost() {
    var b = new MB(64, 46, 303);
    b.border(2);
    b.raise(32, 10, 40, 17, 1, 0.25);           // the middle shelf
    b.raise(40, 5, 13, 5, 2, 0.25);             // high peaks (north)
    b.raise(13, 6, 6, 4, 2, 0.25);              // west peak
    b.rectTier(0, 0, 63, 2, 1);
    b.fill(34, 38, 7, 4, 'i', 0.3);             // frozen pond
    b.fill(9, 31, 3, 2, 'w', 0.3);              // little cold pool
    b.forest(8, 38, 6, 5, 0.5, 0.4);
    b.forest(56, 40, 5, 4, 0.5, 0.4);
    b.forest(24, 17, 6, 3, 0.4, 0.4);
    b.forest(50, 14, 5, 3, 0.3, 0.4);
    b.forest(28, 4, 5, 2, 0.3, 0.4, '*');
    b.scatter('^', 26, 3, 3, 60, 43);
    b.scatter('*', 16, 3, 3, 60, 43);
    b.scatter('y', 6, 3, 3, 60, 43);
    b.scatter(',', 18, 3, 3, 60, 43);
    b.rectTier(16, 29, 25, 33, 0); b.rectTier(47, 29, 54, 33, 0);
    b.line([[8, 41], [14, 37], [20, 33], [21, 30]], ':', 2, null, true);
    b.stairs(20, 28, 'N', 3, 0);
    b.line([[21, 26], [26, 23], [34, 22], [42, 21], [50, 20]], ':', 2, null, true);
    b.line([[8, 41], [24, 42], [40, 43], [50, 37], [51, 31]], ':', 2, null, true);
    b.stairs(50, 28, 'N', 2, 0);
    b.line([[34, 22], [34, 14]], ':', 2, null, true);
    b.rectTier(32, 12, 37, 14, 1);
    b.stairs(34, 11, 'N', 2, 1);
    b.line([[34, 8], [40, 6], [44, 5]], ':', 1, null, true);
    b.line([[26, 22], [18, 16], [13, 12]], ':', 1, null, true);
    b.rectTier(11, 11, 15, 12, 1);
    b.stairs(13, 10, 'N', 2, 1);
    // earth crest high up; the heart container on the west peak behind cracked boulders
    b.shrine(45, 5, null);
    b.chest(12, 5, 'heartUp');
    b.clear(13, 7, 1.2);
    b.rect(10, 7, 16, 7, 't', '.,:;*^y');   // frozen brambles (Fire burns them)
    b.arena(53, 19, 4, 'N');
    b.set(53, 19, 'B');
    b.clear(53, 13, 1.5); b.rect(52, 13, 54, 14, ';'); b.set(53, 13, 'G');
    b.camp(52, 38, 1, ['f', 'f', 'a']);
    b.camp(14, 20, 2, ['f', 'x', 'R']);
    b.enemy(30, 6, 'f');
    b.enemy(40, 26, 'f');
    b.enemy(28, 36, 'a');
    // blocks
    b.set(34, 38, 'X');                   // on the frozen pond
    b.set(52, 36, 'X');                   // camp 1
    b.clear(59, 5, 1); b.set(59, 5, 'X'); // the far peak
    b.clear(27, 18, 1); b.set(27, 18, 'X');
    // icicles hang over the pond and the shelf path
    [[32, 37, 0], [36, 37, 0.5], [34, 40, 0.25], [31, 39, 0.75], [37, 39, 0.1]].forEach(function (c) { b.trap({ kind: 'icicle', tx: c[0], ty: c[1], period: 3.5, phase: c[2] }); });
    [[28, 22, 0], [31, 23, 0.5]].forEach(function (c) { b.trap({ kind: 'icicle', tx: c[0], ty: c[1], period: 3.2, phase: c[2] }); });
    // rolling snowballs down a lane next to a block
    b.line([[29, 13], [29, 25]], '.', 1, '^*,y');
    b.trap({ kind: 'roller', tx: 29, ty: 13, dir: 1, len: 11, period: 3, phase: 0, what: 'snowball' });
    [[57, 6, 0], [58, 4, 0.5]].forEach(function (s) { b.trap({ kind: 'spikes', tx: s[0], ty: s[1], period: 2.6, phase: s[2] }); });
    b.village(16, 39);
    b.chest(60, 4, 'life');                         // extra life on the far peak, past the spikes
    b.put(21, 33, 'C', true); b.put(42, 22, 'C', true);
    b.clear(8, 41, 1.5); b.set(8, 41, 'P');
    ['g', 'h', 'g', 'g', 'h', 'g'].forEach(function (c, i) { b.scatter(c, 1, 5 + i * 9, 20, 12 + i * 9, 42); });
    // the Ice Temple in a snowy hollow below the peaks, between snowy pines
    b.grow(0, 26, 2);
    b.forest(14, 60, 10, 8, 0.45, 0.4); b.forest(58, 60, 7, 8, 0.45, 0.4);
    b.fill(22, 52, 3, 2, 'i', 0.3);
    b.line([[40, 43], [40, 49]], ':', 2, '.,m^*y#');
    b.temple(40, 50, 'ice', 'N', [
      { kind: 'icicle', u: -1, v: 4, period: 3.6, phase: 0 }, { kind: 'icicle', u: 1, v: 5, period: 3.6, phase: 0.5 },
      { kind: 'icicle', u: 0, v: 7, period: 3.6, phase: 0.25 }, { kind: 'icicle', u: -2, v: 6, period: 3.6, phase: 0.75 }, { kind: 'icicle', u: 2, v: 7, period: 3.6, phase: 0.6 },
      { kind: 'spikes', u: -3, v: 3, period: 3.0, phase: 0.4 }, { kind: 'spikes', u: 3, v: 3, period: 3.0, phase: 0.9 }]);
    b.scatter('y', 4, 4, 46, 60, 69); b.scatter('*', 6, 4, 46, 60, 69);
    b.district({ style: 'frost', enemy: 'f', enemy2: 'x' });   // tall buildings far from the start
    return b.out({ name: 'Frosty Peaks', theme: 'frost', planet: 'glacira', tier: 3, music: 2, crests: ['ice'], chests: ['heartUp', 'life'], boss: 'brr' });
  }

  // ---------------- level 4: Storm Cliffs ----------------
  function storm() {
    var b = new MB(64, 46, 404);
    b.border(2);
    b.line([[20, 0], [22, 14], [19, 30], [21, 46]], 'v', 4);     // west gorge
    b.line([[44, 0], [42, 20], [45, 46]], 'v', 3);               // east gorge
    b.raise(32, 21, 7, 11, 1, 0.25);            // the middle mesa
    b.raise(32, 17, 3.5, 3, 2, 0.15);           // its top
    b.raise(56, 10, 7, 8, 1, 0.3);              // east heights
    b.fill(21, 22, 1.3, 1.3, '.', 0);           // rock pillar in the gorge
    b.forest(8, 8, 5, 4, 0.45, 0.4);
    b.forest(8, 26, 4, 6, 0.3, 0.4, '*');
    b.forest(55, 40, 5, 3, 0.4, 0.4);
    b.forest(32, 40, 6, 3, 0.35, 0.4, '*');
    b.scatter('^', 18, 3, 3, 60, 43);
    b.scatter('*', 18, 3, 3, 60, 43);
    b.scatter(',', 16, 3, 3, 60, 43);
    // bridges and paths
    b.rectTier(30, 33, 34, 36, 0); b.rectTier(24, 20, 27, 24, 0); b.rectTier(53, 19, 57, 22, 0);
    b.line([[6, 40], [12, 36], [16, 34], [26, 34], [30, 34]], ':', 2, null, true);
    b.line([[10, 30], [10, 18], [14, 10], [26, 10], [30, 12]], ':', 2, null, true);
    b.line([[16, 22], [23, 22], [26, 22]], ':', 1, null, true);
    b.stairs(32, 32, 'N', 3, 0);
    b.stairs(27, 21, 'E', 2, 0);
    b.line([[33, 30], [33, 23]], ':', 2, null, true);
    b.rectTier(31, 20, 35, 22, 1);
    b.stairs(32, 20, 'N', 2, 1);
    b.line([[30, 34], [40, 36], [50, 34], [54, 31]], ':', 2, null, true);
    b.line([[38, 22], [48, 14], [52, 22]], ':', 1, null, true);
    b.rectTier(37, 20, 40, 24, 1);
    b.stairs(55, 18, 'N', 2, 0);
    b.line([[56, 16], [58, 10], [60, 6]], ':', 1, null, true);
    // the wind crest on the mesa top, the boss and the portal in the south-east
    b.shrine(32, 16, null);
    b.arena(53, 30, 4, 'S');
    b.set(53, 30, 'B');
    b.clear(53, 37, 1.5); b.rect(52, 36, 54, 37, ';'); b.set(53, 37, 'G');
    b.camp(10, 12, 1, ['s', 's', 'z']);
    b.camp(57, 7, 2, ['z', 'z', 's']);
    b.enemy(10, 32, 'R');
    b.enemy(36, 38, 'z');
    b.enemy(28, 26, 's');
    // blocks
    b.set(21, 22, 'X');                   // the gorge pillar (little bridges)
    b.set(10, 10, 'X');                   // camp 1
    b.set(28, 17, 'X');                   // mesa side, lightning rods
    // a ruin corridor with pressure-plate darts
    b.clear(40, 42, 1); b.rect(36, 41, 43, 43, ';'); b.rect(36, 40, 43, 40, '%'); b.rect(36, 44, 43, 44, '%');
    b.set(42, 42, 'X');
    var d1 = b.trap({ kind: 'darts', tx: 38, ty: 40, dir: 1, period: 0, len: 4 });
    b.trap({ kind: 'plate', tx: 38, ty: 42, link: d1 });
    var d2 = b.trap({ kind: 'darts', tx: 40, ty: 44, dir: 3, period: 0, len: 4 });
    b.trap({ kind: 'plate', tx: 40, ty: 42, link: d2 });
    // lightning rods
    [[29, 16, 0], [28, 20, 0.5], [12, 22, 0.25], [50, 26, 0.6], [60, 10, 0.1]].forEach(function (r) { b.trap({ kind: 'rod', tx: r[0], ty: r[1], period: 4, phase: r[2], r: 1.7 }); });
    b.chest(60, 4, 'crystal');
    b.chest(4, 4, 'gems');
    b.chest(21, 23, 'life');                        // extra life on the gorge pillar
    b.village(5, 34);
    b.put(16, 36, 'C', true); b.put(47, 32, 'C', true);
    b.clear(6, 40, 1.5); b.set(6, 40, 'P');
    ['g', 'g', 'h', 'g', 'h', 'g'].forEach(function (c, i) { b.scatter(c, 1, 5 + i * 9, 25, 12 + i * 9, 42); });
    // the Wind Temple on the windy plain below the cliffs
    b.grow(0, 34, 2);
    b.temple(30, 70, 'wind', 'S', [
      { kind: 'roller', what: 'gust', u: -4, v: 4, dir: [1, 0], len: 8, period: 3.0, phase: 0, sp: 5.5 },
      { kind: 'roller', what: 'gust', u: 4, v: 6, dir: [-1, 0], len: 8, period: 3.0, phase: 0.5, sp: 5.5 },
      { kind: 'spikes', u: -1, v: 8, period: 2.8, phase: 0 }, { kind: 'spikes', u: 0, v: 8, period: 2.8, phase: 0.33 }, { kind: 'spikes', u: 1, v: 8, period: 2.8, phase: 0.66 }]);
    b.line([[30, 36], [30, 48], [22, 48], [22, 71], [30, 71]], ':', 2, '.,m^*');
    b.district({ style: 'storm', enemy: 'z', enemy2: 's' });   // tall buildings far from the start
    return b.out({ name: 'Storm Cliffs', theme: 'storm', planet: 'zephyra', tier: 6, music: 3, crests: ['wind'], chests: ['crystal', 'gems', 'life'], boss: 'zap', storm: true });
  }

  // ---------------- level 5: Shadow Woods ----------------
  function shadow() {
    var b = new MB(64, 46, 505);
    b.border(2);
    b.raise(32, 18, 13, 9, 1, 0.3);             // the old temple hill
    b.raise(32, 15, 4.5, 3, 2, 0.15);           // its altar
    b.fill(12, 28, 6, 4, 'w', 0.3);             // the purple pond
    b.fill(12, 28, 1.4, 1.2, '.', 0);
    b.forest(10, 10, 8, 6, 0.55, 0.4);
    b.forest(52, 20, 6, 8, 0.55, 0.4);
    b.forest(16, 40, 8, 3, 0.45, 0.4);
    b.forest(50, 41, 8, 3, 0.45, 0.4);
    b.forest(32, 33, 6, 2, 0.35, 0.4);
    b.scatter('^', 40, 3, 3, 60, 43);
    b.scatter('m', 40, 3, 3, 60, 43);
    b.scatter('y', 10, 3, 3, 60, 43);
    b.scatter('*', 10, 3, 3, 60, 43);
    b.scatter('b', 4, 3, 3, 60, 43);
    b.rectTier(30, 29, 35, 31, 0); b.rectTier(46, 15, 49, 19, 0);
    b.line([[32, 42], [32, 34], [33, 30]], ':', 2, null, true);
    b.stairs(32, 28, 'N', 3, 0);
    b.line([[33, 26], [33, 20]], ':', 2, null, true);
    b.rectTier(31, 20, 35, 21, 1);
    b.stairs(32, 19, 'N', 2, 1);
    b.stairs(45, 17, 'W', 2, 0);
    b.line([[46, 17], [48, 12], [50, 10]], ':', 2, null, true);
    b.line([[32, 38], [20, 34], [12, 34], [8, 26], [8, 14]], ':', 2, null, true);
    b.line([[32, 38], [46, 34], [54, 30]], ':', 1, null, true);
    b.line([[12, 34], [12, 30]], 'u', 1, 'w');
    // crests: Death on the altar, Life in the west woods
    b.shrine(32, 14, null);
    b.shrine(8, 11, null);
    b.arena(50, 9, 4, 'N');
    b.set(50, 9, 'B');
    b.clear(50, 3, 1.5); b.rect(49, 3, 51, 4, ';'); b.set(50, 3, 'G');
    b.camp(16, 38, 1, ['o', 'a', 'x']);
    b.camp(52, 30, 2, ['o', 'R', 's']);
    b.enemy(22, 18, 'o');
    b.enemy(44, 38, 'o');
    // blocks
    b.set(12, 28, 'X');                   // pond island
    b.set(16, 36, 'X');                   // camp 1
    b.set(52, 28, 'X');                   // camp 2
    b.clear(24, 17, 1); b.set(24, 17, 'X');
    // shadow puffs around the temple-side block and along the pond path
    [[24, 19, 0], [26, 18, 0.5], [25, 16, 0.25], [23, 15, 0.75]].forEach(function (p) { b.trap({ kind: 'puff', tx: p[0], ty: p[1], period: 3.6, phase: p[2] }); });
    [[10, 32, 0], [14, 33, 0.5]].forEach(function (p) { b.trap({ kind: 'puff', tx: p[0], ty: p[1], period: 3.4, phase: p[2] }); });
    // spikes at the altar steps, darts across the east path
    [[32, 16, 0], [33, 16, 0.5]].forEach(function (s) { b.trap({ kind: 'spikes', tx: s[0], ty: s[1], period: 2.8, phase: s[2] }); });
    b.trap({ kind: 'darts', tx: 41, ty: 31, dir: 1, period: 2.8, phase: 0, len: 7 });
    b.chest(35, 15, 'heartUp');
    b.chest(60, 42, 'gems');
    b.chest(13, 28, 'life');                        // extra life on the pond island
    b.rect(58, 40, 61, 40, 't'); b.rect(58, 41, 58, 43, 't');
    b.village(36, 39);
    b.put(32, 31, 'C', true); b.put(46, 13, 'C', true);
    b.clear(32, 42, 1.5); b.set(32, 42, 'P');
    ['g', 'g', 'h', 'g', 'g', 'h'].forEach(function (c, i) { b.scatter(c, 1, 5 + i * 9, 20, 12 + i * 9, 42); });
    // the Shadow Temple in the deep woods south of the start
    b.grow(0, 26, 2);
    b.forest(13, 59, 9, 9, 0.55, 0.4); b.forest(52, 59, 9, 9, 0.55, 0.4);
    b.fill(15, 52, 3, 2, 'w', 0.3);
    b.line([[32, 44], [32, 49]], ':', 2, null, true);
    b.temple(32, 50, 'death', 'N', [
      { kind: 'puff', u: -2, v: 4, period: 3.0, phase: 0 }, { kind: 'puff', u: 1, v: 5, period: 3.0, phase: 0.5 },
      { kind: 'puff', u: -1, v: 7, period: 3.0, phase: 0.25 }, { kind: 'puff', u: 2, v: 7, period: 3.0, phase: 0.75 },
      { kind: 'darts', style: 'shadow', u: 5, v: 6, dir: [-1, 0], period: 2.6, phase: 0.4, len: 9 },
      { kind: 'darts', style: 'shadow', u: -5, v: 3, dir: [1, 0], period: 2.6, phase: 0.9, len: 9 }]);
    b.scatter('m', 12, 4, 47, 60, 69); b.scatter('y', 4, 4, 47, 60, 69);
    b.district({ style: 'shadow', enemy: 'o', enemy2: 'x' });   // tall buildings far from the start
    return b.out({ name: 'Shadow Woods', theme: 'shadow', planet: 'umbra', tier: 8, music: 4, crests: ['death'], chests: ['heartUp', 'gems', 'life'], boss: 'gloomo' });
  }

  // ---------------- level 6: Dragon's Volcano ----------------
  function volcano() {
    var b = new MB(50, 52, 606);
    b.border(2);
    b.raise(25, 14, 15, 11.5, 1, 0.12);         // the dragon's plateau
    b.rectTier(10, 0, 40, 4, 1);
    b.fill(25, 14, 13, 10, ';', 0.1);           // its paved floor
    b.fill(10, 38, 6, 3, 'l', 0.4);
    b.fill(40, 36, 6, 4, 'l', 0.4);
    b.line([[2, 30], [16, 32], [22, 31]], 'l', 2);
    b.line([[30, 46], [36, 43], [48, 44]], 'l', 2);
    b.forest(6, 46, 4, 3, 0.35, 0.4);
    b.forest(44, 28, 4, 4, 0.4, 0.4);
    b.forest(6, 22, 3, 6, 0.4, 0.4);
    b.forest(44, 14, 3, 6, 0.4, 0.4);
    b.scatter('*', 22, 3, 28, 46, 48);
    b.scatter('^', 14, 3, 28, 46, 48);
    b.rectTier(21, 26, 29, 30, 0);
    b.line([[8, 47], [14, 44], [20, 40], [24, 34], [25, 30]], ':', 2, null, true);
    b.line([[20, 40], [32, 40], [38, 32]], ':', 1, null, true);
    b.stairs(23, 27, 'N', 4, 0);
    b.set(25, 13, 'D');
    b.camp(14, 43, 1, ['e', 'e']);
    b.camp(34, 34, 2, ['e', 'e', 'e']);
    b.enemy(24, 37, 'e');
    // fire vents along the climb, rolling boulders across it
    [[22, 38, 0], [24, 36, 0.5], [21, 41, 0.25], [26, 33, 0.75], [18, 42, 0.6], [27, 33, 0.1]].forEach(function (v) { b.trap({ kind: 'vent', tx: v[0], ty: v[1], period: 3.2, phase: v[2] }); });
    b.line([[30, 30], [16, 30]], '.', 1, '^*,');
    b.trap({ kind: 'roller', tx: 30, ty: 30, dir: 2, len: 13, period: 3.6, phase: 0, what: 'boulder' });
    b.chest(26, 38, 'life');                        // extra life among the fire vents
    b.put(25, 30, 'C', true); b.put(18, 44, 'C', true);
    b.set(37, 44, 'h'); b.set(12, 34, 'g'); b.set(40, 30, 'g');
    b.clear(8, 47, 1.5); b.set(8, 47, 'P');
    return b.out({ name: "Dragon's Volcano", theme: 'volcano', planet: 'pyros', tier: 9, music: 5, crests: [], chests: ['life'], boss: 'dragon', arena: true });
  }

  // ---------------- planet 2: Rainy Isles (Aquaria) - palm islands in a rainy sea, joined by bridges and stepping stones ----------------
  function isles() {
    var b = new MB(74, 48, 808);
    b.border(2);
    b.rect(1, 1, 72, 46, 'w', '.');                 // the sea
    b.fill(13, 37, 11, 8, '.', 0.3, 'w');           // A: the start island (south-west)
    b.fill(12, 13, 9, 7, '.', 0.3, 'w');            // B: the north-west island with a lookout hill
    b.fill(35, 29, 8, 6, '.', 0.25, 'w');           // C: the middle island
    b.fill(60, 30, 13, 10, '.', 0.25, 'w');         // D: the temple island (east)
    b.fill(35, 9, 9, 5, '.', 0.25, 'w');            // E: the north island
    b.fill(62, 9, 8, 5, '.', 0.25, 'w');            // G: the mini-boss island (north-east)
    b.fill(23, 26, 1.7, 1.4, '.', 0, 'w');          // F: a rocky islet
    b.fill(47, 44, 3, 1.6, '.', 0.3, 'w'); b.fill(27, 43, 2.4, 1.4, '.', 0.3, 'w'); b.fill(50, 3, 2, 1.2, '.', 0.3, 'w');   // sandbars
    b.fill(43, 7, 1.6, 1.3, '.', 0, 'w'); b.fill(39, 5, 1.4, 1.2, '.', 0, 'w'); b.fill(40, 25, 1.4, 1.2, '.', 0, 'w');   // firm ground for a jet and two blocks
    b.raise(8, 10, 4.2, 3.4, 1, 0.2);               // the lookout hill
    b.rectTier(6, 12, 9, 13, 1);
    b.forest(5, 33, 3, 4, 0.5, 0.3); b.forest(20, 43, 4, 2, 0.45, 0.3); b.forest(15, 7, 5, 2, 0.4, 0.3);
    b.forest(67, 38, 5, 3, 0.45, 0.3); b.forest(66, 22, 4, 2, 0.4, 0.3); b.forest(40, 34, 3, 2, 0.4, 0.3); b.forest(28, 12, 2, 2, 0.4, 0.3);
    b.scatter('^', 12, 3, 3, 70, 44); b.scatter('*', 10, 3, 3, 70, 44); b.scatter(',', 40, 3, 3, 70, 44); b.scatter('b', 3, 3, 30, 24, 44);
    // the rolling-wave lane across the middle island (paths are drawn over it)
    b.rect(28, 27, 42, 27, '.');
    // paths, bridges (over water a path becomes a bridge) and stepping stones
    b.line([[8, 41], [14, 39], [21, 37], [23, 36]], ':', 2, null, true);
    b.line([[23, 36], [29, 32]], ':', 2, null, true);
    b.line([[11, 37], [11, 30], [11, 21], [10, 17]], ':', 2, null, true);
    b.stairs(7, 14, 'N', 2, 0);
    b.line([[29, 32], [36, 31], [42, 30]], ':', 2, null, true);
    b.line([[42, 30], [52, 30]], ':', 2, null, true);
    b.line([[35, 30], [35, 13]], ':', 2, null, true);
    b.line([[35, 13], [40, 11], [45, 10], [55, 10]], ':', 2, null, true);
    b.line([[21, 26], [28, 26]], 'u', 1, 'w');
    b.clear(23, 26, 1.2);
    // the Water Temple on the east island, its door toward the middle island
    b.temple(53, 30, 'water', 'W', [
      { kind: 'darts', style: 'water', u: -5, v: 4, dir: [1, 0], period: 3.6, phase: 0, len: 9 },
      { kind: 'darts', style: 'water', u: 5, v: 7, dir: [-1, 0], period: 3.6, phase: 0.5, len: 9 },
      { kind: 'geyser', u: 2, v: 5, period: 3.8, phase: 0.3 }, { kind: 'geyser', u: -2, v: 6, period: 3.8, phase: 0.8 }]);
    // the mini-boss ring and the portal on the north-east island
    b.arena(62, 10, 3.5, 'N');
    b.set(62, 10, 'B');
    b.clear(62, 4, 1.5); b.rect(61, 4, 63, 5, ';'); b.set(62, 4, 'G');
    // camps and baddies
    b.camp(16, 14, 1, ['q', 'q', 'a']);
    b.camp(30, 9, 2, ['a', 's', 'q']);
    b.enemy(25, 40, 'q'); b.enemy(38, 33, 'a'); b.enemy(58, 24, 's'); b.enemy(66, 34, 'q');
    // portal blocks
    b.set(23, 26, 'X');                             // on the rocky islet (stepping stones)
    b.set(16, 12, 'X');                             // in camp 1, between the tents
    b.clear(40, 25, 1); b.set(40, 25, 'X');         // past the rolling waves
    b.clear(39, 5, 1); b.set(39, 5, 'X');           // past the water jets
    b.trap({ kind: 'roller', what: 'wave', tx: 28, ty: 27, dir: 0, len: 14, period: 3.4, phase: 0, sp: 4.2 });
    b.trap({ kind: 'darts', style: 'water', tx: 44, ty: 7, dir: 2, period: 3.2, phase: 0, len: 9 });
    b.trap({ kind: 'darts', style: 'water', tx: 3, ty: 15, dir: 0, period: 3.0, phase: 0.5, len: 8 });   // across the foot of the lookout steps
    // treasure: gems on the lookout, an extra life under the coconut palms
    b.chest(7, 9, 'gems');
    b.chest(4, 37, 'life');
    [[5, 36, 0], [6, 38, 0.5], [4, 39, 0.25]].forEach(function (c) { b.trap({ kind: 'icicle', style: 'coconut', tx: c[0], ty: c[1], period: 3.4, phase: c[2] }); });
    b.village(14, 33);
    b.put(33, 32, 'C', true); b.put(49, 32, 'C', true);
    b.clear(8, 41, 1.5); b.set(8, 41, 'P');
    ['g', 'g', 'h', 'g', 'g', 'h', 'g'].forEach(function (c, i) { b.scatter(c, 1, 5 + i * 9, 6, 12 + i * 9, 42); });
    b.district({ style: 'isles', enemy: 'q', enemy2: 'a' });   // tall buildings far from the start
    return b.out({ name: 'Rainy Isles', theme: 'isles', planet: 'aquaria', tier: 1, music: 8, crests: ['water'], chests: ['gems', 'life'], boss: 'drizzle', rain: true });
  }

  // ---------------- planet 3: Thunder Plains (Voltara) - golden grass under storm clouds, metal spires, crackling crystals ----------------
  function plains() {
    var b = new MB(72, 52, 909);
    b.border(2);
    b.raise(14, 15, 9, 7, 1, 0.25);                 // west mesa
    b.rectTier(10, 19, 17, 22, 1);
    b.raise(57, 17, 9, 8, 1, 0.25);                 // east mesa
    b.rectTier(48, 15, 50, 20, 1); b.rectTier(50, 19, 64, 23, 1);
    b.raise(58, 15, 4, 3, 2, 0.15);                 // its top
    b.fill(26, 36, 4.5, 3, 'w', 0.3);               // a rain pond
    b.fill(26, 36, 1.3, 1.1, '.', 0);               // its islet
    b.forest(8, 30, 4, 6, 0.4, 0.4); b.forest(66, 42, 4, 5, 0.45, 0.4); b.forest(48, 47, 6, 2, 0.35, 0.4);
    b.forest(22, 6, 6, 3, 0.4, 0.4); b.forest(50, 4, 5, 2, 0.4, 0.4);
    b.scatter('^', 20, 3, 3, 68, 48); b.scatter('*', 12, 3, 3, 68, 48); b.scatter('y', 10, 3, 3, 68, 48); b.scatter(',', 50, 3, 3, 68, 48); b.scatter('b', 3, 3, 30, 40, 48);
    // paths
    b.line([[7, 47], [16, 44], [30, 44], [44, 44], [52, 40], [56, 38]], ':', 2, null, true);
    b.line([[30, 44], [33, 36], [36, 28], [36, 25]], ':', 2, null, true);
    b.line([[16, 44], [14, 34], [13, 25]], ':', 2, null, true);
    b.stairs(12, 23, 'N', 3, 0);
    b.line([[36, 28], [44, 22], [46, 18]], ':', 2, null, true);
    b.stairs(47, 17, 'E', 2, 0);
    b.stairs(58, 18, 'N', 2, 1);
    b.line([[26, 31], [26, 35]], 'u', 1, 'w');
    // the Lightning Temple on the north of the plain
    b.temple(36, 22, 'lightning', 'S', [
      { kind: 'rod', u: -2, v: 5, period: 4.0, phase: 0, r: 1.8 }, { kind: 'rod', u: 2, v: 7, period: 4.0, phase: 0.5, r: 1.8 },
      { kind: 'roller', what: 'spark', u: -4, v: 4, dir: [1, 0], len: 8, period: 3.4, phase: 0.25, sp: 4.5 }]);
    // the mini-boss ring in the south-east, the portal east of it
    b.arena(57, 38, 4, 'E');
    b.set(57, 38, 'B');
    b.clear(64, 38, 1.5); b.rect(62, 37, 63, 39, ';'); b.set(64, 38, 'G');
    // camps and baddies
    b.camp(15, 14, 1, ['z', 'z', 'a']);
    b.camp(44, 38, 2, ['s', 'x', 'z']);
    b.enemy(24, 21, 'z'); b.enemy(50, 30, 's'); b.enemy(21, 46, 'a'); b.enemy(61, 29, 'x');
    // portal blocks
    b.set(15, 12, 'X');                              // camp 1 on the west mesa
    b.set(44, 36, 'X');                              // camp 2
    b.clear(28, 26, 1); b.set(28, 26, 'X');          // in the lightning-rod field
    [[26, 24, 0], [30, 25, 0.5], [27, 28, 0.25], [31, 28, 0.75]].forEach(function (r) { b.trap({ kind: 'rod', tx: r[0], ty: r[1], period: 3.8, phase: r[2], r: 1.6 }); });
    b.line([[50, 21], [64, 21]], '.', 1, '^*,yb');
    b.trap({ kind: 'roller', what: 'spark', tx: 50, ty: 21, dir: 0, len: 14, period: 3.2, phase: 0, sp: 4.6 });   // ball lightning across the east mesa
    b.clear(63, 23, 1); b.set(63, 23, 'X');          // past the ball lightning
    // a little ruin with a pressure plate: the extra life
    b.clear(6, 38, 2.6); b.rect(4, 36, 8, 40, ';');
    b.chest(5, 38, 'life');
    b.rect(4, 36, 8, 36, '%'); b.rect(4, 37, 4, 40, '%'); b.rect(4, 40, 8, 40, '%');
    var d1 = b.trap({ kind: 'darts', tx: 6, ty: 36, dir: 1, period: 0, len: 3 });
    b.trap({ kind: 'plate', tx: 7, ty: 38, link: d1 });
    // the iron blade on top of the east mesa, gems on the pond islet
    b.chest(60, 13, 'iron');
    b.chest(26, 36, 'gems');
    b.village(13, 40);
    b.put(31, 42, 'C', true); b.put(40, 26, 'C', true);
    b.clear(7, 47, 1.5); b.set(7, 47, 'P');
    ['g', 'h', 'g', 'g', 'h', 'g', 'g'].forEach(function (c, i) { b.scatter(c, 1, 5 + i * 9, 8, 12 + i * 9, 46); });
    b.district({ style: 'plains', enemy: 'z', enemy2: 's' });   // tall buildings far from the start
    return b.out({ name: 'Thunder Plains', theme: 'plains', planet: 'voltara', tier: 2, music: 9, crests: ['lightning'], chests: ['life', 'iron', 'gems'], boss: 'sparkhorn', thunder: true });
  }

  // ---------------- planet 6: Stone Canyon (Terrok) - red rock canyon, mesas with steps, cactus, cracked boulders ----------------
  function canyon() {
    var b = new MB(72, 54, 1010);
    b.border(2);
    b.raise(16, 14, 12, 9, 1, 0.25);                // the west mesa
    b.rectTier(12, 19, 17, 22, 1);
    b.raise(13, 11, 4, 3, 2, 0.15);                 // its top
    b.raise(39, 10, 6, 7, 1, 0.2);                  // the high rim past the crack
    b.rectTier(26, 9, 37, 11, 1);
    b.raise(56, 10, 9, 6, 1, 0.25);                 // the north-east mesa
    b.raise(56, 46, 10, 6, 1, 0.25);                // the south-east mesa (the mini-boss)
    b.rectTier(46, 44, 50, 48, 1); b.rectTier(62, 44, 66, 48, 1);
    b.line([[31, 0], [30, 8], [32, 17], [30, 21]], 'v', 3);   // a deep crack
    b.forest(8, 32, 4, 5, 0.25, 0.4); b.forest(66, 26, 3, 6, 0.3, 0.4); b.forest(24, 50, 8, 2, 0.3, 0.4);
    [[26, 48, 2, 1.4], [62, 31, 2.2, 1.8], [6, 26, 1.6, 2.4], [40, 48, 1.8, 1.3], [64, 21, 1.5, 1.2]].forEach(function (h) { b.raise(h[0], h[1], h[2], h[3], 1, 0.3); });   // little hoodoo rocks
    b.scatter('^', 40, 3, 3, 68, 50); b.scatter('*', 45, 3, 3, 68, 50); b.scatter(',', 24, 3, 3, 68, 50); b.scatter('b', 3, 3, 30, 40, 50);
    // roads on the canyon floor
    b.line([[6, 49], [12, 46], [20, 44], [30, 42], [38, 36], [41, 30]], ':', 2, null, true);
    b.line([[12, 46], [10, 36], [13, 26], [14, 24]], ':', 2, null, true);
    b.stairs(13, 23, 'N', 3, 0);
    b.stairs(15, 16, 'N', 2, 1);
    b.line([[30, 42], [44, 46]], ':', 2, null, true);
    b.stairs(45, 45, 'E', 3, 0);
    b.line([[38, 36], [39, 22], [46, 20], [52, 19]], ':', 2, null, true);
    b.stairs(52, 17, 'N', 2, 0);
    b.line([[20, 12], [26, 10], [38, 10]], ':', 2, null, true);   // across the crack: a bridge on the high rim
    // the Earth Temple, its door toward the canyon road
    b.temple(45, 30, 'earth', 'W', [
      { kind: 'roller', what: 'boulder', u: -4, v: 5, dir: [1, 0], len: 8, period: 3.2, phase: 0 },
      { kind: 'spikes', style: 'rock', u: -1, v: 7, period: 2.7, phase: 0 }, { kind: 'spikes', style: 'rock', u: 0, v: 7, period: 2.7, phase: 0.33 },
      { kind: 'spikes', style: 'rock', u: 1, v: 7, period: 2.7, phase: 0.66 }, { kind: 'spikes', style: 'rock', u: -3, v: 3, period: 2.7, phase: 0.5 },
      { kind: 'spikes', style: 'rock', u: 3, v: 3, period: 2.7, phase: 0 }]);
    // the mini-boss on the south-east mesa, the portal at its far end
    b.arena(56, 46, 4, 'E');
    b.set(56, 46, 'B');
    b.clear(64, 46, 1.5); b.rect(62, 45, 63, 47, ';'); b.set(64, 46, 'G');
    // camps and baddies
    b.camp(22, 17, 1, ['x', 's', 'a']);
    b.camp(34, 27, 2, ['R', 's', 'x']);
    b.enemy(20, 47, 'a'); b.enemy(40, 41, 's'); b.enemy(60, 20, 'x'); b.enemy(8, 30, 's'); b.enemy(42, 13, 'R');
    // portal blocks
    b.set(22, 15, 'X');                              // camp 1 on the west mesa
    b.clear(40, 5, 1); b.set(40, 5, 'X');            // the high rim, under falling rocks
    [[39, 7, 0], [41, 7, 0.5], [40, 9, 0.25]].forEach(function (c) { b.trap({ kind: 'icicle', style: 'rock', tx: c[0], ty: c[1], period: 3.0, phase: c[2] }); });
    b.line([[18, 37], [31, 37]], '.', 1, '^*,mb');
    b.rect(17, 32, 32, 32, '*', '.,:mb'); b.rect(17, 33, 17, 37, '*', '.,:mb'); b.rect(32, 33, 32, 38, '*', '.,:mb');   // a rocky gully: the only way in is across the lane
    b.trap({ kind: 'roller', what: 'boulder', tx: 18, ty: 37, dir: 0, len: 13, period: 3.0, phase: 0 });   // rolling boulders across the gully
    b.clear(24, 34, 1); b.set(24, 34, 'X');          // past the rolling boulders
    b.clear(49, 8, 1); b.set(49, 8, 'X');            // the north-east mesa, past rock spikes
    [[50, 8, 0], [49, 9, 0.33], [48, 8, 0.66]].forEach(function (s) { b.trap({ kind: 'spikes', style: 'rock', tx: s[0], ty: s[1], period: 2.6, phase: s[2] }); });
    // treasure: gems on the west mesa top, an extra life on the rim, a heart container behind cracked rocks (Earth breaks them)
    b.chest(12, 9, 'gems');
    b.chest(43, 14, 'life');
    b.chest(61, 8, 'heartUp');
    b.rect(57, 2, 57, 17, 'k', '.,:;*^ybm');
    b.village(16, 40);
    b.put(30, 44, 'C', true); b.put(40, 27, 'C', true);
    b.clear(6, 49, 1.5); b.set(6, 49, 'P');
    ['g', 'g', 'h', 'g', 'g', 'h', 'g'].forEach(function (c, i) { b.scatter(c, 1, 5 + i * 9, 8, 12 + i * 9, 48); });
    b.district({ style: 'canyon', enemy: 'x', enemy2: 's' });   // tall buildings far from the start
    return b.out({ name: 'Stone Canyon', theme: 'canyon', planet: 'terrok', tier: 5, music: 10, crests: ['earth'], chests: ['gems', 'life', 'heartUp'], boss: 'boulderback' });
  }

  // ---------------- planet 8: Bloom Jungle (Floria) - giant flowers, vines, mushrooms, glowing pollen ----------------
  function jungle() {
    var b = new MB(72, 54, 1111);
    b.border(2);
    b.raise(55, 12, 12, 8, 1, 0.25);                // the ruin hill (north-east)
    b.raise(59, 11, 4, 3, 2, 0.15);                 // its top
    b.line([[0, 33], [14, 31], [28, 34], [42, 31], [56, 34], [72, 32]], 'w', 5);   // the jungle river
    b.fill(35, 32, 1.3, 1.0, '.', 0);               // a river islet
    b.forest(8, 6, 6, 3, 0.5, 0.4); b.forest(4, 22, 3, 6, 0.5, 0.4); b.forest(36, 6, 5, 4, 0.5, 0.4); b.forest(64, 26, 6, 4, 0.5, 0.4);
    b.forest(30, 50, 8, 2, 0.45, 0.4); b.forest(60, 48, 8, 4, 0.5, 0.4); b.forest(6, 40, 3, 3, 0.4, 0.4); b.forest(40, 16, 4, 3, 0.4, 0.4);
    b.scatter('^', 36, 3, 3, 68, 50); b.scatter('m', 24, 3, 3, 68, 50); b.scatter(',', 50, 3, 3, 68, 50); b.scatter('b', 5, 3, 3, 68, 50);
    // paths and bridges
    b.line([[9, 49], [14, 47], [22, 46], [32, 44], [40, 46], [50, 44], [56, 43]], ':', 2, null, true);
    b.line([[13, 46], [13, 26], [24, 25]], ':', 2, null, true);
    b.line([[46, 44], [46, 21]], ':', 2, null, true);
    b.stairs(46, 19, 'N', 2, 0);
    b.line([[24, 25], [40, 22], [46, 21]], ':', 1, null, true);
    b.stairs(60, 15, 'N', 2, 1);
    b.line([[35, 33], [35, 37]], 'u', 1, 'w');
    // the Life Temple on the north bank
    b.temple(24, 22, 'life', 'S', [
      { kind: 'spikes', style: 'vine', u: -2, v: 4, period: 2.9, phase: 0 }, { kind: 'spikes', style: 'vine', u: 0, v: 4, period: 2.9, phase: 0 }, { kind: 'spikes', style: 'vine', u: 2, v: 4, period: 2.9, phase: 0 },
      { kind: 'spikes', style: 'vine', u: -1, v: 6, period: 2.9, phase: 0.5 }, { kind: 'spikes', style: 'vine', u: 1, v: 6, period: 2.9, phase: 0.5 },
      { kind: 'spikes', style: 'vine', u: -3, v: 6, period: 2.9, phase: 0.5 }, { kind: 'spikes', style: 'vine', u: 3, v: 6, period: 2.9, phase: 0.5 },
      { kind: 'puff', style: 'spore', u: -2, v: 8, period: 3.2, phase: 0.25 }, { kind: 'puff', style: 'spore', u: 2, v: 8, period: 3.2, phase: 0.75 }]);
    // the mini-boss on the ruin hill, the portal north of it
    b.arena(50, 13, 4, 'N');
    b.set(50, 13, 'B');
    b.clear(50, 6, 1.5); b.rect(49, 6, 51, 7, ';'); b.set(50, 6, 'G');
    // camps and baddies
    b.camp(40, 42, 1, ['x', 's', 'a']);
    b.camp(9, 14, 2, ['o', 'R', 's']);
    b.enemy(22, 40, 'o'); b.enemy(58, 40, 'R'); b.enemy(36, 18, 's'); b.enemy(64, 18, 'x'); b.enemy(28, 28, 'a');
    // portal blocks
    b.set(40, 40, 'X');                              // camp 1
    b.set(9, 12, 'X');                               // camp 2
    b.clear(35, 32, 1); b.set(35, 32, 'X');          // the river islet (stepping stones)
    b.clear(61, 9, 1); b.set(61, 9, 'X');            // the ruin top, past thorny vines
    [[60, 10, 0], [61, 11, 0.33], [62, 10, 0.66]].forEach(function (s) { b.trap({ kind: 'spikes', style: 'vine', tx: s[0], ty: s[1], period: 2.6, phase: s[2] }); });
    // thorn shooters across the south path
    b.trap({ kind: 'darts', style: 'thorn', tx: 22, ty: 50, dir: 3, period: 2.8, phase: 0, len: 9 });
    b.trap({ kind: 'darts', style: 'thorn', tx: 52, ty: 50, dir: 3, period: 2.8, phase: 0.5, len: 9 });
    // treasure: an extra life among spore puffs, gems behind a thorn wall (Fire burns it)
    b.chest(36, 11, 'life');
    [[35, 12, 0], [37, 12, 0.5], [36, 13, 0.25]].forEach(function (p) { b.trap({ kind: 'puff', style: 'spore', tx: p[0], ty: p[1], period: 3.0, phase: p[2] }); });
    b.chest(4, 46, 'gems');
    b.rect(3, 43, 6, 43, 't', '.,:;^*mb'); b.rect(6, 44, 6, 51, 't', '.,:;^*mb');
    b.village(15, 40);
    b.put(28, 42, 'C', true); b.put(40, 23, 'C', true);
    b.clear(9, 49, 1.2); b.set(9, 49, 'P');
    ['g', 'g', 'h', 'g', 'g', 'h', 'g'].forEach(function (c, i) { b.scatter(c, 1, 5 + i * 9, 8, 12 + i * 9, 48); });
    b.district({ style: 'jungle', enemy: 'a', enemy2: 's' });   // tall buildings far from the start
    return b.out({ name: 'Bloom Jungle', theme: 'jungle', planet: 'floria', tier: 7, music: 11, crests: ['life'], chests: ['life', 'gems'], boss: 'snapjaw' });
  }

  // in planet order: Verdia, Aquaria, Voltara, Glacira, Bubblon, Terrok, Zephyra, Floria, Umbra, then Pyros (the Dragon)
  SC.LEVELS = [meadow(), isles(), plains(), frost(), lagoon(), canyon(), storm(), jungle(), shadow(), volcano()];

  // ---------------- the Home Base: a small calm island floating among the stars ----------------
  // Nine planet portals stand in a big ring around the plaza, in order (1 Verdia on the left, round over the top, to 9 Umbra
  // on the right), joined by a ring path; the Dragon's gate (Pyros) is at the bottom. A little market and a flag in the middle.
  // No baddies, no traps. 'v' around the island is empty space (drawn as the sky below).
  SC.PLANET_ORDER = ['Verdia', 'Aquaria', 'Voltara', 'Glacira', 'Bubblon', 'Terrok', 'Zephyra', 'Floria', 'Umbra', 'Pyros'];
  function homeBase() {
    var w = 50, h = 43, b = new MB(w, h, 707), cx = 24.5, cy = 21, rx = 23.8, ry = 20.6, x, y;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var dx = Math.abs(x + 0.5 - cx) / rx, dy = Math.abs(y + 0.5 - cy) / ry, d = Math.pow(Math.pow(dx, 4) + Math.pow(dy, 4), 0.25);
      if (d > 0.97 + (b.noise(x, y, 3) - 0.5) * 0.08) b.set(x, y, 'v');
    }
    var OX = 24, OY = 21, RX = 18, RY = 14, portalAt = {}, portalFace = {}, spots = [];
    SC.PLANET_ORDER.forEach(function (pl, i) {
      var px, py;
      if (i < 9) { var a = Math.PI + i * Math.PI / 8; px = Math.round(OX + Math.cos(a) * RX); py = Math.round(OY + Math.sin(a) * RY); }
      else { px = OX; py = OY + RY; }
      spots.push({ x: px, y: py, pl: pl });
    });
    // the ring path (inside the portals) and the plaza
    var ring = [];
    for (var k = 0; k <= 32; k++) { var ra = k / 32 * Math.PI * 2; ring.push([OX + Math.cos(ra) * (RX - 4), OY + Math.sin(ra) * (RY - 4)]); }
    b.line(ring, ':', 2);
    b.fill(OX + 1, OY + 1, 4.2, 3.2, ';', 0);
    b.set(OX - 3, OY - 1, '|'); b.set(OX + 5, OY - 1, '|');
    // each portal on a round paved pad, a short path to the ring, a crystal on each side
    spots.forEach(function (s, i) {
      var vx = OX - s.x, vy = OY - s.y, vl = Math.sqrt(vx * vx + vy * vy) || 1; vx /= vl; vy /= vl;
      b.line([[s.x + vx * 1.5, s.y + vy * 1.5], [s.x + vx * 4.5, s.y + vy * 4.5]], ':', 2);
      b.fill(s.x + vx * 0.6, s.y + vy * 0.6, 2.3, 2.3, ';', 0);
      b.set(s.x, s.y, 'G'); portalAt[s.x + ',' + s.y] = s.pl; portalFace[s.x + ',' + s.y] = [vx, vy];
      var side = i === 9 ? 2.6 : 2.2;
      b.set(Math.round(s.x - vy * side), Math.round(s.y + vx * side), 'y'); b.set(Math.round(s.x + vy * side), Math.round(s.y - vx * side), 'y');
    });
    // trees and flowers around the edge, a soft grass field (never on the pads or paths)
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      if (b.get(x, y) !== '.') continue;
      var edge = b.get(x + 1, y) === 'v' || b.get(x - 1, y) === 'v' || b.get(x, y + 1) === 'v' || b.get(x, y - 1) === 'v' ||
        b.get(x + 2, y) === 'v' || b.get(x - 2, y) === 'v' || b.get(x, y + 2) === 'v' || b.get(x, y - 2) === 'v';
      var near = false;
      spots.forEach(function (s) { if (Math.abs(s.x - x) <= 3 && Math.abs(s.y - y) <= 3) near = true; });
      var r = b.r();
      if (edge && !near && r < 0.5) b.set(x, y, '^');
      else if (r < 0.1) b.set(x, y, ',');
    }
    // the little market (trader + blacksmith), a pond, a flag, some crates and flowers
    b.village(13, 20);
    b.fill(32, 26, 2.2, 1.4, 'w', 0.15);
    b.set(30, 28, ','); b.set(36, 23, ','); b.set(31, 17, 'm'); b.set(17, 27, 'm');
    b.set(28, 17, 'C');
    b.set(19, 26, '@');
    b.set(25, 24, 'P');
    return b.out({ name: 'Home Base', theme: 'base', planet: null, music: 7, crests: [], chests: [], boss: null, base: true, floating: true, portalAt: portalAt, portalFace: portalFace, center: { x: OX + 0.5, y: OY + 0.5 } });
  }
  SC.BASE = homeBase();

  // How the worlds look in the sky of the other planets and on their portals at the Home Base (num = the number on its sign).
  SC.PLANET_LOOK = {
    verdia: { name: 'Verdia', num: 1, color: 0x58c878, color2: 0x3a8ae0, ring: false },
    aquaria: { name: 'Aquaria', num: 2, color: 0x4ab8ff, color2: 0x1a5aa8, ring: false },
    voltara: { name: 'Voltara', num: 3, color: 0xffd84a, color2: 0x6a5ab0, ring: true },
    glacira: { name: 'Glacira', num: 4, color: 0xd8f0ff, color2: 0x8ab8e8, ring: true },
    bubblon: { name: 'Bubblon', num: 5, color: 0x56e0d8, color2: 0x2a8ab8, ring: false },
    terrok: { name: 'Terrok', num: 6, color: 0xd8784a, color2: 0x7a3a2a, ring: false },
    zephyra: { name: 'Zephyra', num: 7, color: 0xa8f0c8, color2: 0x5ab8a8, ring: true },
    floria: { name: 'Floria', num: 8, color: 0xff8ad8, color2: 0x5ac85a, ring: false },
    umbra: { name: 'Umbra', num: 9, color: 0x8a5ad0, color2: 0x3a2a6a, ring: false },
    pyros: { name: 'Pyros', num: 0, color: 0xff7a3a, color2: 0x8a2a1a, ring: true, dragon: true }
  };
  // Colours and looks per level (3D world and minimap). Older fields kept for anything that still reads them.
  SC.THEMES = {
    meadow: { sky: 0x8fd4ff, skyTop: 0x3f8fe8, fog: 0xbfe6ff, floor: 0x74c454, floor2: 0x8cd25e, path: 0xc8a876, sand: 0xb89a6a, stone: 0xc8c0b0, rock: 0x9a9286,
      bed: 0x4a7a6a, water: 0x3aa0e0, trees: 'broad', leaf: [0x3f9e3a, 0x4fae44, 0x5abf4a, 0x2f8a3a], trunk: 0x7a5232, rockCol: 0xa8a294, deco: 0xffe14a,
      flowers: [0xffe14a, 0xffffff, 0xff7ab0, 0xb08aff, 0xff9a3a], tuft: 0x5aa83a, sun: 0xfff4e0, sunI: 0.8, hemi: [0xffffff, 0x7fbf5f], hemiI: 0.62, motes: 'pollen', mini: '#7ccf5a',
      wall: 'tree', wallA: 0x3fae4a, wallB: 0x7a4b2a, bush: 0x2f9a3a },
    lagoon: { sky: 0x84e0ff, skyTop: 0x2f9ae8, fog: 0xc8f4ff, floor: 0xead39a, floor2: 0xf2deaa, path: 0xd8bf88, sand: 0xd8c08a, stone: 0xd8ccb0, rock: 0xa89a86,
      bed: 0x3aa8b8, water: 0x2fc0e8, trees: 'palm', leaf: [0x3fb05a, 0x4fc06a, 0x2f9a4a], trunk: 0x9a7048, rockCol: 0xb0a490, deco: 0xff8fb0,
      flowers: [0xff8fb0, 0xffffff, 0xffd23f], tuft: 0x8ab85a, sun: 0xfff8e8, sunI: 0.85, hemi: [0xffffff, 0xd8c890], hemiI: 0.62, motes: 'pollen', mini: '#f2dc9a',
      wall: 'palm', wallA: 0x3fbf6a, wallB: 0x9a7048, bush: 0x34b06a },
    frost: { sky: 0xcae4ff, skyTop: 0x7aa8e0, fog: 0xe0eeff, floor: 0xe8f0fa, floor2: 0xd8e4f4, path: 0xc0ccdc, sand: 0xb8c4d4, stone: 0xb8c4d8, rock: 0x7a8aa8,
      bed: 0x4a8ab8, water: 0x6fc0e8, trees: 'snowpine', leaf: [0x2f6a52, 0x3a7a5a, 0x2a5a4a], trunk: 0x5a4232, rockCol: 0x8a98b4, deco: 0xa8d8ff,
      flowers: [0xa8d8ff, 0xffffff], tuft: 0xa8b8c8, sun: 0xf0f6ff, sunI: 0.7, hemi: [0xffffff, 0xa8c0e0], hemiI: 0.7, motes: 'snow', mini: '#eef6ff',
      wall: 'snowrock', wallA: 0x6a7a98, wallB: 0xffffff, bush: 0x3f8f6a },
    storm: { sky: 0x6a7690, skyTop: 0x3a4258, fog: 0x7a8498, floor: 0x8a9a7a, floor2: 0x7a8a6e, path: 0xa8a090, sand: 0x8a8478, stone: 0xa0a4ac, rock: 0x6a6e7a,
      bed: 0x2a3a5a, water: 0x4a7ab0, trees: 'pine', leaf: [0x3a5a42, 0x4a6a4a, 0x2f4a3a], trunk: 0x4a3a2e, rockCol: 0x7a7e88, deco: 0xc8e85a,
      flowers: [0xc8e85a, 0xffffff], tuft: 0x6a7a5a, sun: 0xdfe6ff, sunI: 0.55, hemi: [0xdfe6ff, 0x50586a], hemiI: 0.62, motes: 'rain', mini: '#9aa0a8',
      wall: 'pillar', wallA: 0x6a6e78, wallB: 0x50545e, bush: 0x5a8a5a },
    shadow: { sky: 0x3a2a60, skyTop: 0x150e2e, fog: 0x34285a, floor: 0x4a4070, floor2: 0x55497c, path: 0x6a5a80, sand: 0x5a4a6a, stone: 0x7a6e94, rock: 0x4a4060,
      bed: 0x3a2060, water: 0x8a5ad0, trees: 'dark', leaf: [0x5a2f8a, 0x6a3a9a, 0x4a2a7a, 0x3a5a7a], trunk: 0x3a2a3a, rockCol: 0x5a5070, deco: 0x7fffd8,
      flowers: [0x7fffd8, 0xd8a8ff, 0xff8ad8], tuft: 0x5a4a8a, sun: 0xc8b8ff, sunI: 0.5, hemi: [0xc8b8ff, 0x3a2a5a], hemiI: 0.62, motes: 'firefly', mini: '#5a4f80',
      wall: 'darktree', wallA: 0x5a2f8a, wallB: 0x3a2a3a, bush: 0x3a6a5a },
    volcano: { sky: 0x5a2420, skyTop: 0x2a0e10, fog: 0x5a2a24, floor: 0x6a4a3e, floor2: 0x5a3e34, path: 0x8a6a54, sand: 0x4a3430, stone: 0x6a5a56, rock: 0x3a2e2e,
      bed: 0x6a1a0a, water: 0xff6a1a, trees: 'basalt', leaf: [0x3a2a2a, 0x4a3430], trunk: 0x2a2020, rockCol: 0x4a3a38, deco: 0xffa040,
      flowers: [0xffa040, 0xff5a2a], tuft: 0x5a4030, sun: 0xffd0b0, sunI: 0.65, hemi: [0xffd0b0, 0x5a2a20], hemiI: 0.62, motes: 'ash', mini: '#7a4a3a',
      wall: 'basalt', wallA: 0x3a2a2a, wallB: 0xff6a1a, bush: 0x6a5a3a },
    isles: { sky: 0x9ab8d4, skyTop: 0x5a78a0, fog: 0xb4c8d8, floor: 0x7cc062, floor2: 0xd8c890, path: 0xe0c890, sand: 0xd8c890, stone: 0xc8c4b8, rock: 0x8a8a90,
      bed: 0x2a7a9a, water: 0x3aa0d8, trees: 'isle', leaf: [0x3fb05a, 0x4fc06a, 0x2f9a4a], trunk: 0x9a7048, rockCol: 0x9a9aa0, deco: 0x7fd8ff,
      flowers: [0xff8fb0, 0xffffff, 0xffd23f, 0xff6a6a], tuft: 0x6ab85a, sun: 0xe8f0ff, sunI: 0.62, hemi: [0xd8e8ff, 0x6a8a7a], hemiI: 0.72, motes: 'rain', mini: '#7cc062',
      wall: 'palm', wallA: 0x3fbf6a, wallB: 0x9a7048, bush: 0x34b06a },
    plains: { sky: 0x8a8ca8, skyTop: 0x34345a, fog: 0xb0a890, floor: 0xd8b84a, floor2: 0xc8a43a, path: 0xb89a6a, sand: 0xa88a5a, stone: 0xb8b4a8, rock: 0x7a7068,
      bed: 0x3a4a6a, water: 0x5a8ac0, trees: 'plains', leaf: [0x7a9a3a, 0x8aa84a, 0x6a8a2a], trunk: 0x6a4a2a, rockCol: 0x8a8478, deco: 0xffe14a,
      flowers: [0xffe14a, 0xffffff, 0xffa040], tuft: 0xe8c860, sun: 0xfff0c8, sunI: 0.68, hemi: [0xe8e0d0, 0x6a5a3a], hemiI: 0.66, motes: 'spark', mini: '#d8b84a',
      wall: 'tree', wallA: 0x7a9a3a, wallB: 0x6a4a2a, bush: 0x8aa84a },
    canyon: { sky: 0xffc89a, skyTop: 0x5a8ad8, fog: 0xf0c8a0, floor: 0xd88a58, floor2: 0xc87848, path: 0xecc090, sand: 0xc89a6a, stone: 0xdcb08a, rock: 0xa85a3a,
      bed: 0x5a6a8a, water: 0x4a9ad0, trees: 'canyon', leaf: [0x4a9a4a, 0x5aaa5a, 0x3a8a3a], trunk: 0x8a5a3a, rockCol: 0xb86a48, deco: 0xffb06a,
      flowers: [0xff6a8a, 0xffd23f, 0xffffff], tuft: 0xc8a868, sun: 0xfff0d8, sunI: 0.88, hemi: [0xfff0e0, 0x9a5a3a], hemiI: 0.6, motes: 'dust', mini: '#d88a58',
      wall: 'mesa', wallA: 0xb86a48, wallB: 0x8a4a30, bush: 0x6a8a3a },
    jungle: { sky: 0x9ad8b4, skyTop: 0x3a9a8a, fog: 0xa8dcb8, floor: 0x4a9a3a, floor2: 0x5aac44, path: 0xa07c4a, sand: 0x8a7a4a, stone: 0xa8b098, rock: 0x5a6a4a,
      bed: 0x2a5a4a, water: 0x3aa8a0, trees: 'jungle', leaf: [0x2f8a3a, 0x3f9a2a, 0x4fb03a, 0x2a7a4a], trunk: 0x6a4a2a, rockCol: 0x7a8a6a, deco: 0xff8ad8,
      flowers: [0xff5ab0, 0xffe14a, 0xff8a3a, 0xb06aff, 0xffffff], tuft: 0x4aa83a, sun: 0xf0ffe0, sunI: 0.72, hemi: [0xe8ffe0, 0x3a6a2a], hemiI: 0.66, motes: 'pollen', mini: '#4a9a3a',
      wall: 'tree', wallA: 0x2f8a3a, wallB: 0x6a4a2a, bush: 0x2f9a3a },    base: { sky: 0x2a2a6a, skyTop: 0x080622, fog: 0x1c1a4a, floor: 0x62c060, floor2: 0x7ad070, path: 0xdcc89a, sand: 0xc0a878, stone: 0xdcd6ec, rock: 0x6a6488,
      bed: 0x3a5a9a, water: 0x5ab8ff, trees: 'broad', leaf: [0x3faa5a, 0x4fbf6a, 0x2f9a6a, 0x5ac87a], trunk: 0x7a5232, rockCol: 0x9a94b4, deco: 0x9ff0ff,
      flowers: [0xffe14a, 0xffffff, 0xff8ad8, 0x9ff0ff, 0xb08aff], tuft: 0x5ab85a, sun: 0xeef0ff, sunI: 0.8, hemi: [0xe0e0ff, 0x5a6a8a], hemiI: 0.72, motes: 'firefly', mini: '#7ad070',
      wall: 'tree', wallA: 0x3fae4a, wallB: 0x7a4b2a, bush: 0x2f9a3a, stars: true }
  };
})();
