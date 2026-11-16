// Nine Crests - the team and the hero on screen: switching heroes, resting, moving, dashing, flying, sword,
// picking things up, crests, chests, checkpoints, the portal, getting hurt.
(function () {
  'use strict';
  var SC = window.SC, W = SC.world, I = SC.input;

  // ---------------- powers: who owns what ----------------
  SC.isFree = function () { var G = SC.G; return !!(G && G.prog && G.prog.mode === 'free'); };
  function pState(id) { var G = SC.G; return G && G.prog && G.prog.powers ? G.prog.powers[id] : null; }
  // The TEAM owns this power (somebody has it). The world file uses this for water walking.
  SC.hasPower = function (id) { var s = pState(id); return !!(s && s.owned); };
  SC.powerLevel = function (id) { var s = pState(id); return s && s.owned ? s.level : 0; };
  SC.powerOwner = function (id) { var pw = SC.powerById(id); return pw ? pw.owner : null; };
  // The hero on screen can use this power right now.
  SC.canUse = function (id) { var G = SC.G; return SC.hasPower(id) && G.hero && SC.powerOwner(id) === G.hero.id; };
  SC.syncCrests = function () {
    var pr = SC.G.prog; pr.crests = [];
    SC.POWERS.forEach(function (pw) { if (pr.powers[pw.id] && pr.powers[pw.id].owned) pr.crests.push(pw.id); });
  };
  SC.ownPower = function (id, level) {
    var pr = SC.G.prog, s = pr.powers[id] || (pr.powers[id] = { owned: false, level: 1, xp: 0 });
    s.owned = true; s.level = Math.max(s.level || 1, level || 1);
    if (s.level >= 3) s.xp = Math.max(s.xp, SC.EVOLVE_AT[2]); else if (s.level === 2) s.xp = Math.max(s.xp, SC.EVOLVE_AT[1]);
    SC.syncCrests();
  };
  // the power the hero on screen has picked (null = none yet)
  SC.currentPowerId = function () {
    var G = SC.G; if (!G.hero) return null;
    var want = G.slotBy && G.slotBy[G.hero.id];
    if (want && SC.canUse(want)) return want;
    for (var i = 0; i < G.hero.powers.length; i++) if (SC.canUse(G.hero.powers[i])) return G.hero.powers[i];
    return null;
  };
  function setCurrent(id) {
    var G = SC.G;
    G.slotBy = G.slotBy || {};
    G.slotBy[G.hero.id] = id;
    G.powerIdx = SC.powerIndex[id];
  }
  SC.syncPowerIdx = function () { var id = SC.currentPowerId(); if (id) SC.G.powerIdx = SC.powerIndex[id]; };

  // ---------------- hearts ----------------
  SC.maxHp = function (heroId) {
    var G = SC.G, h = heroId ? SC.heroById(heroId) : G.hero;
    return h.hearts + (G.prog ? G.prog.bonusHearts + G.prog.gemHearts : 0);
  };
  SC.maxEnergy = function (heroId) {
    var G = SC.G, h = heroId ? SC.heroById(heroId) : G.hero;
    return h.energy + (G.prog && G.prog.energyBonus ? G.prog.energyBonus : 0);
  };
  SC.makeTeam = function (saved) {
    var G = SC.G;
    G.team = SC.HEROES.map(function (h) {
      var mx = SC.maxHp(h.id), hp = mx;
      if (saved && typeof saved[h.id] === 'number') hp = SC.clamp(saved[h.id], 0, mx);
      if (hp <= 0) hp = mx;   // resting heroes come back rested
      return { id: h.id, hp: hp, energy: SC.maxEnergy(h.id), out: false };
    });
  };
  SC.member = function (id) { var G = SC.G; if (!G.team) return null; for (var i = 0; i < G.team.length; i++) if (G.team[i].id === id) return G.team[i]; return null; };

  // ---------------- one or two players ----------------
  // G.players = [{ p, hero }, ...]; G.player / G.hero are always the player being worked on right now ("context").
  // Outside a per-player loop the context is player 1, so everything written for one player keeps working.
  SC.numPlayers = function () { var G = SC.G; return G.players ? G.players.length : 1; };
  SC.useCtx = function (i) {
    var G = SC.G;
    if (!G.players || !G.players[i]) return;
    var cur = G.players[G.pi || 0];
    if (cur && cur.p === G.player) cur.hero = G.hero;
    G.pi = i; G.player = G.players[i].p; G.hero = G.players[i].hero;
  };
  SC.syncCtx = function () { var G = SC.G; if (G.players && G.players[G.pi || 0] && G.players[G.pi || 0].p === G.player) G.players[G.pi || 0].hero = G.hero; };
  // run fn(p, i) for every player (skips players sitting out, unless all = true), then go back to the context we had
  SC.eachPlayer = function (fn, all) {
    var G = SC.G;
    if (!G.players || G.players.length < 2) { if (G.player && (all || !G.player.dead)) fn(G.player, 0); return; }
    var keep = G.pi || 0;
    for (var i = 0; i < G.players.length; i++) {
      if (!all && G.players[i].p.dead) continue;
      SC.useCtx(i); fn(G.player, i);
    }
    SC.useCtx(keep);
  };
  // the player nearest to a spot (only players in the game), for baddies choosing who to chase
  SC.nearestPlayer = function (x, y) {
    var G = SC.G;
    if (!G.players || G.players.length < 2) return 0;
    var best = 0, bd = 1e9;
    for (var i = 0; i < G.players.length; i++) {
      var q = G.players[i].p; if (q.dead) continue;
      var d = SC.dist(x, y, q.x, q.y) + (q.flyH > 2.5 ? 6 : 0);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  // the hero another player has right now (a hero can only be played by one player at a time)
  SC.heroInUse = function (id) {
    var G = SC.G; if (!G.players || G.players.length < 2) return false;
    SC.syncCtx();
    for (var i = 0; i < G.players.length; i++) if (i !== (G.pi || 0) && G.players[i].hero.id === id && !G.players[i].p.waiting) return i + 1;
    return 0;
  };
  SC.PCOLOR = ['#ffd23f', '#5ad8ff'];   // player 1 gold, player 2 sky blue
  // copy the on-screen heroes' hearts/energy into the team list
  SC.storeActive = function () {
    var G = SC.G;
    SC.syncCtx();
    if (G.players && G.players.length > 1) { G.players.forEach(function (pl) { var m = SC.member(pl.hero.id); if (m && !pl.p.waiting) { m.hp = pl.p.hp; m.energy = pl.p.energy; } }); return; }
    var m = SC.member(G.hero.id), p = G.player;
    if (m && p) { m.hp = p.hp; m.energy = p.energy; }
  };
  // after the team list changed (heals, wake-ups): give the other on-screen hero their new hearts
  SC.loadOthers = function () {
    var G = SC.G; if (!G.players || G.players.length < 2) return;
    SC.syncCtx();
    G.players.forEach(function (pl, i) { if (i === (G.pi || 0) || pl.p.waiting) return; var m = SC.member(pl.hero.id); if (m) { pl.p.hp = m.hp; pl.p.energy = m.energy; } });
  };
  SC.teamState = function () {
    var G = SC.G; if (!G.team) return [];
    SC.storeActive();
    return G.team.map(function (m) { return { id: m.id, hp: m.hp, maxHp: SC.maxHp(m.id), out: m.out }; });
  };
  // wake everybody up and fill all hearts (checkpoint flags, new level, try again)
  SC.healTeam = function () {
    var G = SC.G, p = G.player;
    G.team.forEach(function (m) { m.hp = SC.maxHp(m.id); m.out = false; m.energy = SC.maxEnergy(m.id); });
    if (G.players && G.players.length > 1) { SC.syncCtx(); G.players.forEach(function (pl) { pl.p.hp = SC.maxHp(pl.hero.id); pl.p.energy = SC.maxEnergy(pl.hero.id); }); return; }
    if (p) { p.hp = SC.maxHp(); p.energy = SC.maxEnergy(); }
  };
  SC.nextHeroId = function () {
    var G = SC.G, i0 = SC.heroIndex(G.hero.id);
    for (var k = 1; k < SC.HEROES.length; k++) {
      var h = SC.HEROES[(i0 + k) % SC.HEROES.length], m = SC.member(h.id);
      if (m && !m.out && !SC.heroInUse(h.id)) return h.id;
    }
    return null;
  };

  SC.toast = function (text, dur) {
    var G = SC.G;
    for (var i = 0; i < G.toasts.length; i++) if (G.toasts[i].text === text) { G.toasts[i].t = dur || 3.2; return; }
    G.toasts.push({ text: text, t: dur || 3.2, age: 0 });
    if (G.toasts.length > 3) G.toasts.shift();
  };
  SC.banner = function (title, sub, icon, dur) { SC.G.banner = { title: title, sub: sub || '', icon: icon || null, t: 0, dur: dur || 3.2 }; };
  SC.popText = function (x, y, text, color, big) {
    var G = SC.G;
    if (G.texts.length > 40) G.texts.shift();
    G.texts.push({ x: x + SC.rand(-0.15, 0.15), y: y, h: 1.2, text: String(text), color: color || '#fff', big: !!big, t: 0, dur: big ? 1.1 : 0.8 });
  };
  // A ground warning (circle / cone / line). When its time is up, onDone runs.
  SC.addWarn = function (w) {
    w.t = 0; w.color = w.color || '#ff3b30';
    SC.G.warns.push(w);
    return w;
  };

  SC.makePlayer = function (x, y) {
    var G = SC.G;
    return {
      x: x, y: y, r: 0.3, vx: 0, vy: 0, kx: 0, ky: 0, face: Math.PI / 2, walkT: 0, moving: false,
      hp: SC.maxHp(), inv: 1.0, dashT: 0, dashCd: 0, dvx: 0, dvy: 0, swingT: 0, swingDur: 0.2, swingAng: 0, swingId: 0, swordCd: 0,
      energy: SC.maxEnergy(), powerCd: {}, slowT: 0, dead: false, deadT: 0, rippleT: 0, onWater: false, castT: 0, hurtT: 0, dustT: 0,
      flyH: 0, flying: false, flyT: 0, flyMax: 0, flyCd: 0, flyWarned: false, safeX: x, safeY: y, swapCd: 0, swapT: 0,
      flyAlt: 0, gliding: false, glideVz: 0, glideA: Math.PI / 2, glideCd: 0, glideStrong: false, glideFromX: x, glideFromY: y, waiting: false, pi: 0
    };
  };

  // ---------------- switching heroes ----------------
  function standOk(p) { return !W.blocked(p.x, p.y, p.r, 'player'); }
  // opts.auto: a resting hero is being replaced (always works)
  SC.swapHero = function (id, opts) {
    var G = SC.G, p = G.player;
    opts = opts || {};
    if (!p || !G.team || !id || id === G.hero.id) return false;
    var to = SC.member(id);
    if (!to || to.out) { if (!opts.quiet) { SC.toast(SC.heroById(id).name + ' is resting. Find a flag!'); SC.audio.play('nope'); } return false; }
    var usedBy = SC.heroInUse(id);
    if (usedBy) { if (!opts.quiet) { SC.toast('Player ' + usedBy + ' is playing ' + SC.heroById(id).name + '!'); SC.audio.play('nope'); } return false; }
    if (!opts.auto && !opts.force) {
      if (p.dead) return false;
      if (p.swapCd > 0) return false;
    }
    var oldHero = G.hero;
    // would the new hero be standing somewhere they can't (like Pip on water)?
    var airborne = p.flying || p.gliding || p.flyH > 0.3;
    if (!airborne && !opts.auto && !opts.force) {
      G.hero = SC.heroById(id);
      var ok = standOk(p);
      G.hero = oldHero;
      if (!ok) { SC.toast(SC.heroById(id).name + " can't stand here. Get to land first!"); SC.audio.play('nope'); return false; }
    }
    SC.storeActive();
    G.hero = SC.heroById(id);
    if (!G.pi) G.prog.heroId = id; else G.prog.p2Hero = id;
    SC.syncCtx();
    p.hp = to.hp; p.energy = Math.min(to.energy, SC.maxEnergy(id));
    p.swingT = 0; p.castT = 0; p.hurtT = 0; p.dashT = 0; p.dead = false; p.deadT = 0;
    p.swapCd = 0.6; p.swapT = 0.35; p.inv = Math.max(p.inv, opts.auto ? 2.0 : 0.4); p.blinkT = Math.max(p.blinkT || 0, opts.auto ? 2.0 : 0);
    if (p.flying && !SC.isFree() && id !== 'wren') endFlight(p);
    if (p.gliding && id === 'wren' && SC.canUse('wind')) p.glideStrong = true;
    if (!airborne && !standOk(p)) {
      W.unstick(p, p.r, 'player');
      if (!standOk(p)) { p.x = p.safeX; p.y = p.safeY; if (!standOk(p)) { p.x = G.checkpoint.x; p.y = G.checkpoint.y; W.unstick(p, p.r, 'player'); } }
    }
    SC.syncPowerIdx();
    SC.fx.burst(p.x, 0.6 + p.flyH, p.y, 'smoke', 12);
    SC.fx.burst(p.x, 0.9 + p.flyH, p.y, 'star', 8);
    SC.audio.play('swap');
    G.stats.swaps = (G.stats.swaps || 0) + 1;
    if (!opts.auto && !opts.quiet) SC.popText(p.x, p.y, G.hero.name + '!', G.hero.color || '#fff');
    return true;
  };
  SC.switchNext = function () {
    var id = SC.nextHeroId();
    if (!id) { SC.toast(SC.numPlayers() > 1 ? 'Nobody else is free to play!' : 'Everyone else is resting!'); SC.audio.play('nope'); return false; }
    return SC.swapHero(id);
  };

  SC.aimAt = function (range, cone) {
    var G = SC.G, p = G.player, best = null, bs = 1e9;
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (!e.alive || e.hidden || e.h > 1.5) continue;
      var d = SC.dist(p.x, p.y, e.x, e.y) - e.r;
      if (d > range) continue;
      var a = Math.atan2(e.y - p.y, e.x - p.x), ad = Math.abs(SC.angDiff(p.face, a));
      if (ad > cone && d > 1.2) continue;
      var s = d + ad * 2.2;
      if (s < bs) { bs = s; best = a; }
    }
    return best === null ? p.face : best;
  };

  // opts.ground: a ground attack (melee, slam, fire on the floor, lava) - it can't reach a flying hero
  SC.hurtPlayer = function (dmg, sx, sy, opts) {
    var G = SC.G, p = G.player;
    if (!p || p.dead || p.inv > 0 || p.dashT > 0 || G.god || SC.isFree() || G.screen !== 'play') return false;
    if (opts && opts.ground && (p.flyH > 0.5 || p.gliding)) return false;
    p.hp = Math.max(0, p.hp - dmg);
    p.inv = 1.5; p.hurtT = 0.35; p.blinkT = 1.5;
    if (sx !== undefined) {
      var a = Math.atan2(p.y - sy, p.x - sx);
      p.kx = Math.cos(a) * 7; p.ky = Math.sin(a) * 7;
    }
    if (opts && opts.slow) { p.slowT = Math.max(p.slowT, opts.slow); SC.popText(p.x, p.y, 'Brrr!', '#bfefff'); }
    SC.fx.shake(0.35);
    SC.fx.burst(p.x, 0.7 + p.flyH, p.y, 'star', 8);
    SC.audio.play('hurt');
    G.stats.hits++;
    if (p.hp <= 0) heroRests(p);
    return true;
  };
  function heroRests(p) {
    var G = SC.G, me = SC.member(G.hero.id), name = G.hero.name;
    SC.fx.burst(p.x, 0.6 + p.flyH, p.y, 'smoke', 20);
    SC.fx.burst(p.x, 0.8 + p.flyH, p.y, 'star', 16);
    if (me) { me.hp = 0; me.out = true; }
    G.stats.rests = (G.stats.rests || 0) + 1;
    var next = SC.nextHeroId();
    if (next) {
      if (p.flying || p.gliding || p.flyH > 0) { endFlight(p); p.gliding = false; p.flyH = 0; land(p); }
      SC.swapHero(next, { auto: true });
      SC.toast(name + ' needs a rest! ' + G.hero.name + ' jumps in!', 3.5);
      SC.audio.play('rest');
      p.kx *= 0.5; p.ky *= 0.5;
      return;
    }
    // two players: while the other player still plays, this one sits out until a friend wakes up (a flag, the trader, Fern)
    var other = null;
    if (G.players && G.players.length > 1) G.players.forEach(function (pl) { if (pl.p !== p && !pl.p.dead) other = pl; });
    if (other) {
      if (p.flying || p.gliding || p.flyH > 0) { endFlight(p); p.gliding = false; p.flyH = 0; }
      p.dead = true; p.deadT = 0; p.waiting = true;
      SC.toast(name + ' needs a rest! Player ' + ((G.pi || 0) + 1) + ' waits for a friend to wake up.', 4);
      SC.audio.play('rest');
      return;
    }
    if (G.prog.lives > 0) { useLife(p); return; }
    p.dead = true; p.deadT = 0; p.flying = false; p.gliding = false; p.waiting = false;
    SC.audio.play('oops');
    G.stats.deaths++;
  }
  // a player who sat out comes back as soon as a hero is free again (next to the other player)
  function tryRejoin(p) {
    var G = SC.G;
    if (!p.waiting) return false;
    var me = SC.member(G.hero.id), id = null;
    if (me && !me.out) id = G.hero.id;
    else {
      for (var k = 0; k < SC.HEROES.length && !id; k++) { var h = SC.HEROES[k], m = SC.member(h.id); if (m && !m.out && !SC.heroInUse(h.id)) id = h.id; }
      if (!id) return false;
      G.hero = SC.heroById(id); if (!G.pi) G.prog.heroId = id; else G.prog.p2Hero = id;
      SC.syncCtx();
    }
    var m2 = SC.member(id), o = null;
    G.players.forEach(function (pl) { if (pl.p !== p && !pl.p.dead) o = pl.p; });
    p.dead = false; p.waiting = false; p.deadT = 0; p.hp = m2.hp; p.energy = m2.energy;
    p.inv = 2; p.blinkT = 2; p.vx = p.vy = p.kx = p.ky = 0; p.flyH = 0; p.flying = false; p.gliding = false;
    if (o) { p.x = o.x + 0.8; p.y = o.y + 0.4; W.unstick(p, p.r, 'player'); if (!standOk(p)) { p.x = o.x; p.y = o.y; } }
    p.safeX = p.x; p.safeY = p.y;
    SC.fx.burst(p.x, 0.8, p.y, 'star', 16);
    SC.audio.play('swap');
    SC.toast('Player ' + ((G.pi || 0) + 1) + ' is back as ' + G.hero.name + '!', 3);
    return true;
  }
  SC.tryRejoin = function () { return tryRejoin(SC.G.player); };

  // ---------------- sword + crest (set at the blacksmith) ----------------
  SC.SWORD_CREST_BONUS = 0.5;
  SC.SWORD_CREST_TIP = {
    fire: 'Burns baddies.', ice: 'Chills baddies (slow).', lightning: 'Zaps one more baddie.', water: 'Big splash push.',
    surface: 'Traps small baddies in a bubble.', earth: 'Stuns baddies.', wind: 'Blows baddies far away.',
    life: 'Heals you a little.', death: 'Gives you energy and hits harder.'
  };
  SC.swordCrestOf = function (heroId) {
    var G = SC.G, sc = G.prog && G.prog.swordCrest ? G.prog.swordCrest[heroId] : null;
    if (!sc || !SC.hasPower(sc) || SC.powerOwner(sc) !== heroId) return null;
    return sc;
  };
  function swordCrestHit(pid, e, a, p) {
    var G = SC.G;
    G.stats.crestHits = (G.stats.crestHits || 0) + 1;
    if (!e.alive) return;
    switch (pid) {
      case 'fire':
        if (e.def.resist.indexOf('fire') < 0) { e.burnT = Math.max(e.burnT, 2); e.burnDmg = Math.max(e.burnDmg || 0, 0.5); e.frozenT = 0; }
        SC.fx.burst(e.x, 0.6, e.y, 'fire', 8); break;
      case 'ice':
        e.slowT = Math.max(e.slowT, 2); SC.fx.burst(e.x, 0.6, e.y, 'ice', 8); break;
      case 'lightning':
        var best = null, bd = 3;
        for (var i = 0; i < G.enemies.length; i++) {
          var o = G.enemies[i];
          if (o === e || !o.alive || o.hidden || o.h > 1.5) continue;
          var d = SC.dist(e.x, e.y, o.x, o.y);
          if (d < bd) { bd = d; best = o; }
        }
        if (best) {
          G.effects.push({ kind: 'bolt', pts: [e.x, e.y, best.x, best.y], t: 0, dur: 0.25, h: 0.6, lvl: 1, scale: 0.7 });
          SC.hurtEnemy(best, 1.5, 'sword', { kx: 0, ky: 0 });
          best.stunT = Math.max(best.stunT, 0.3);
        }
        SC.fx.burst(e.x, 0.6, e.y, 'spark', 8); break;
      case 'water':
        e.kx += Math.cos(a) * 6; e.ky += Math.sin(a) * 6; e.burnT = 0;
        SC.fx.burst(e.x, 0.5, e.y, 'water', 10); break;
      case 'surface':
        if (!e.isBoss && !e.def.big && e.bubbleT <= 0 && Math.random() < 0.35) { e.bubbleT = 1.6; e.bubbleLvl = 1; e.state = 'idle'; }
        SC.fx.burst(e.x, 0.6, e.y, 'water', 6); break;
      case 'earth':
        if (!e.isBoss) e.stunT = Math.max(e.stunT, 0.6); else e.slowT = Math.max(e.slowT, 0.6);
        SC.fx.burst(e.x, 0.2, e.y, 'rock', 6); break;
      case 'wind':
        var kb = e.isBoss ? 0.3 : 1;
        e.kx += Math.cos(a) * 9 * kb; e.ky += Math.sin(a) * 9 * kb;
        SC.fx.burst(e.x, 0.6, e.y, 'wind', 8); break;
      case 'life':
        p.hp = Math.min(SC.maxHp(), p.hp + 0.25);
        SC.fx.burst(p.x, 0.8, p.y, 'life', 5); break;
      case 'death':
        p.energy = Math.min(SC.maxEnergy(), p.energy + 5);
        SC.hurtEnemy(e, 0.5, 'sword', {});
        SC.fx.burst(e.x, 0.6, e.y, 'shadow', 8); break;
    }
  }

  // an extra life: everyone wakes up right here with full hearts and a few safe seconds
  function useLife(p) {
    var G = SC.G;
    G.prog.lives--;
    G.stats.livesUsed = (G.stats.livesUsed || 0) + 1;
    SC.healTeam();
    p.dead = false; p.inv = 4; p.blinkT = 4; p.kx = p.ky = 0;
    if (p.flying || p.gliding || p.flyH > 0) { p.flying = false; p.gliding = false; p.flyH = 0; land(p); }
    // two players: the other one wakes up right here too
    if (G.players && G.players.length > 1) G.players.forEach(function (pl) {
      var q = pl.p; if (q === p) return;
      if (q.dead) { q.dead = false; q.waiting = false; q.deadT = 0; q.x = p.x + 0.8; q.y = p.y + 0.4; W.unstick(q, q.r, 'player'); q.flyH = 0; q.flying = false; q.gliding = false; }
      q.inv = 4; q.blinkT = 4; q.hp = SC.maxHp(pl.hero.id);
    });
    G.warns.length = 0; G.eprojs.length = 0;
    SC.fx.burst(p.x, 1, p.y, 'heart', 30); SC.fx.burst(p.x, 1, p.y, 'star', 30); SC.fx.ring(p.x, p.y, 0xffd23f, 3.5); SC.fx.flash(0xfff0a0, 0.4);
    SC.banner('Extra life!', 'Everyone is back with full hearts!' + (G.prog.lives ? ' (' + G.prog.lives + ' left)' : ''), 'heart', 3);
    SC.audio.play('extraLife');
    if (SC.saveMid) SC.saveMid();
  }

  function swing(p, ang) {
    var G = SC.G, hero = G.hero;
    if (p.swordCd > 0 || p.swingT > 0 || p.dashT > 0) return;
    if (p.flying || p.gliding || p.flyH > 0.5) return;   // no sword while flying or gliding (powers still work)
    p.swingDur = p.swingT = hero.swingT;
    p.swingAng = ang; p.face = ang;
    p.swordCd = hero.cd + hero.swingT * 0.5;
    p.swingId = ++G.swingCounter;
    p.bushDone = false;
    SC.audio.play('swing');
  }

  function swordHits(p) {
    var G = SC.G, hero = G.hero;
    var prog = 1 - p.swingT / p.swingDur;
    if (prog < 0.08 || prog > 0.85) return;
    var reach = hero.reach, dmg = hero.dmg + G.prog.swordLevel, half = hero.arc / 2;
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (!e.alive || e.hidden || e.lastSwing === p.swingId || (e.h > 0.8 && e.bubbleT <= 0) || e.h > 1.6) continue;
      var d = SC.dist(p.x, p.y, e.x, e.y) - e.r;
      if (d > reach) continue;
      var a = Math.atan2(e.y - p.y, e.x - p.x);
      if (Math.abs(SC.angDiff(p.swingAng, a)) > half && d > 0.3) continue;
      e.lastSwing = p.swingId;
      if (e.bubbleT > 0) { SC.popBubble(e, dmg); continue; }
      if (e.def.shield && e.frozenT <= 0 && e.stunT <= 0 && e.spinT <= 0 && Math.abs(SC.angDiff(e.face, a + Math.PI)) < 1.15) {
        SC.popText(e.x, e.y, 'Block!', '#cfe3ff');
        SC.audio.play('block');
        SC.fx.burst(e.x - Math.cos(a) * 0.3, 0.5, e.y - Math.sin(a) * 0.3, 'spark', 8);
        e.kx += Math.cos(a) * 3; e.ky += Math.sin(a) * 3;
        p.kx -= Math.cos(a) * 3; p.ky -= Math.sin(a) * 3;
        if (!G.toldShield) { G.toldShield = true; SC.toast('Shield! Hit it from behind, or use a power!'); }
        if (!e.aggro) SC.wakeEnemy && SC.wakeEnemy(e);
        continue;
      }
      var sc = SC.swordCrestOf(hero.id);
      SC.hurtEnemy(e, dmg + (sc ? SC.SWORD_CREST_BONUS : 0), 'sword', { kx: Math.cos(a) * 6, ky: Math.sin(a) * 6, sword: true });
      if (sc) swordCrestHit(sc, e, a, p);
      SC.fx.burst(e.x, 0.5 + e.h, e.y, 'hit', 10);
      G.hitstop = Math.max(G.hitstop, 0.045);
      SC.audio.play('hit');
    }
    // cut bushes in the arc
    if (!p.bushDone && prog > 0.3) {
      p.bushDone = true;
      var x0 = Math.floor(p.x - reach - 0.5), x1 = Math.floor(p.x + reach + 0.5), y0 = Math.floor(p.y - reach - 0.5), y1 = Math.floor(p.y + reach + 0.5);
      for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) {
        if (W.tile(tx, ty) !== 'b') continue;
        var cx = tx + 0.5, cy = ty + 0.5, dd = SC.dist(p.x, p.y, cx, cy);
        if (dd > reach + 0.45) continue;
        if (dd > 0.8 && Math.abs(SC.angDiff(p.swingAng, Math.atan2(cy - p.y, cx - p.x))) > half + 0.25) continue;
        W.cutBush(tx, ty);
      }
    }
  }

  // ---------------- picking a power ----------------
  function lockedMsg(id) {
    var pw = SC.powerById(id), owner = SC.heroById(pw.owner);
    if (SC.hasPower(id)) return 'Only ' + owner.name + ' can use ' + pw.name + '.';
    return pw.name + ' is locked. Find its crest and do the task!';
  }
  // n = 0, 1, 2: the active hero's slots
  SC.selectSlot = function (n) {
    var G = SC.G, id = G.hero.powers[n];
    if (!id) return false;
    if (!SC.canUse(id)) { SC.toast(lockedMsg(id)); SC.audio.play('nope'); return false; }
    setCurrent(id);
    SC.audio.play('select');
    return true;
  };
  // by power index (old hook) or id
  SC.selectPower = function (i) {
    var pw = typeof i === 'string' ? SC.powerById(i) : SC.POWERS[i];
    if (!pw) return false;
    if (!SC.canUse(pw.id)) { SC.toast(lockedMsg(pw.id)); SC.audio.play('nope'); return false; }
    setCurrent(pw.id);
    SC.audio.play('select');
    return true;
  };
  function cyclePower(dir) {
    var G = SC.G, list = G.hero.powers.filter(function (id) { return SC.canUse(id); });
    if (!list.length) { SC.toast(G.hero.name + ' has no powers yet. Do a crest task!'); SC.audio.play('nope'); return; }
    var cur = SC.currentPowerId(), i = list.indexOf(cur);
    setCurrent(list[(i + dir + list.length * 3) % list.length]);
    SC.audio.play('select');
  }

  // ---------------- flying (Free Play, Wren's Wind Ride) ----------------
  // p.flyH is the height above the ground under the hero. While flying, the hero keeps a height in the world
  // (p.flyAlt): Space (or player 2's sword key) goes up, Shift (dash key) goes down, between a low hover and a high
  // ceiling over the tall buildings. Ground higher than the hero's feet (a tall building) is a wall.
  SC.FLY_H = 1.6;      // take-off hover
  SC.FLY_MIN = 1.0;    // the lowest hover above the ground
  SC.FLY_CEIL = 12.5;  // the highest a flyer can go (world height; the tallest buildings with their roofs stay under it)
  SC.FLY_UP = 4.2;     // how fast holding Space climbs
  function flyMode() { return SC.world.flyerOK === true ? 'flyer' : 'player'; }
  SC.flyMode = flyMode;
  function startFlight(p) {
    var G = SC.G, free = SC.isFree();
    p.flying = true; p.flyWarned = false;
    p.flyMax = p.flyT = free ? 1e9 : SC.FLY_TIME[Math.max(1, SC.powerLevel('wind'))];
    p.flyAlt = W.heightAt(p.x, p.y) + Math.max(SC.FLY_H, p.flyH);
    SC.fx.burst(p.x, 0.3, p.y, 'wind', 18);
    SC.fx.burst(p.x, 0.2, p.y, 'dust', 10);
    SC.audio.play('fly');
    if (!G.toldFly) { G.toldFly = true; SC.toast(free ? 'Flying! Press G again to land.' : 'Wind Ride! Fly over anything. G to land.', 3.5); }
    if (!G.toldHeight) G.heightHintT = 2.2;   // the "Space to go up" hint shows a moment later
  }
  SC.startFlight = function () { var p = SC.G.player; if (p && !p.dead && !p.flying) { p.gliding = false; startFlight(p); } };
  function endFlight(p) {
    if (!p.flying) return;
    p.flying = false; p.flyT = 0;
    p.flyCd = SC.isFree() ? 0.2 : 1.2;
    SC.audio.play('land');
  }
  SC.endFlight = function () { var p = SC.G.player; if (p) endFlight(p); };
  // called when the hero touches the ground again. Gliders also need ground they could walk back from.
  function land(p, needReach) {
    var G = SC.G;
    var bad = !standOk(p) || (needReach && W.reachable && !W.reachable(Math.floor(p.x), Math.floor(p.y)));
    if (bad) {
      SC.fx.burst(p.x, 0.5, p.y, 'smoke', 14);
      if (needReach) { p.x = p.glideFromX; p.y = p.glideFromY; } else { p.x = p.safeX; p.y = p.safeY; }
      if (!standOk(p)) { p.x = p.safeX; p.y = p.safeY; }
      if (!standOk(p)) { p.x = G.checkpoint.x; p.y = G.checkpoint.y; W.unstick(p, p.r, 'player'); }
      p.vx = p.vy = p.kx = p.ky = 0;
      SC.fx.burst(p.x, 0.5, p.y, 'smoke', 14);
      SC.fx.burst(p.x, 0.8, p.y, 'star', 10);
      SC.audio.play('swap');
      SC.toast('Poof! Back to safe ground.');
      if (!G.players || G.players.length < 2 || G.pi === 0) G.snapCam = true;
      G.stats.safeLandings = (G.stats.safeLandings || 0) + 1;
    }
    SC.fx.burst(p.x, 0.15, p.y, 'dust', 8);
  }
  SC.glideMode = function () { var G = SC.G; return !!(G && G.prog && G.prog.mode === 'glide'); };
  function tryFly(p) {
    var G = SC.G, hero = G.hero;
    if (SC.glideMode()) { tryGlide(p, true); return; }
    if (p.flying) { endFlight(p); return; }
    if (SC.isFree()) { if (p.flyCd <= 0) startFlight(p); return; }
    if (hero.id !== 'wren') {
      SC.toast(SC.hasPower('wind') ? 'Only Wren can fly! Press 7 to switch.' : 'Wren can fly once she has the Wind Crest.');
      SC.audio.play('nope'); return;
    }
    if (!SC.canUse('wind')) { SC.toast('Wren needs the Wind Crest to fly!'); SC.audio.play('nope'); return; }
    if (p.flyCd > 0 || p.flyH > 0.05) return;
    if (p.energy < SC.FLY_COST) { SC.toast('Not enough energy to fly. Wait a moment!'); SC.audio.play('nope'); return; }
    p.energy -= SC.FLY_COST;
    G.stats.flights = (G.stats.flights || 0) + 1;
    startFlight(p);
  }
  // hold the up key to climb, the down key to sink (only while flying)
  function steerHeight(p, dt, K) {
    var g = W.heightAt(p.x, p.y);
    if (keyDown(K.sword)) { p.flyAlt = Math.min(SC.FLY_CEIL, Math.max(p.flyAlt, g + p.flyH) + SC.FLY_UP * dt); SC.G.usedHeight = true; }
    if (keyDown(K.dash)) { p.flyAlt = Math.max(g + SC.FLY_MIN, Math.min(p.flyAlt, g + p.flyH) - SC.FLY_UP * dt); SC.G.usedHeight = true; }
    p.flyAlt = Math.min(SC.FLY_CEIL, p.flyAlt);
  }
  function updateFlight(p, dt) {
    var G = SC.G, g = W.heightAt(p.x, p.y);
    if (p.flying) {
      var want = Math.max(p.flyAlt, g + SC.FLY_MIN) - g;
      p.flyH = SC.approach(p.flyH, want, (want > p.flyH ? 5 : 4) * dt);
      if (!SC.isFree()) {
        p.flyT -= dt;
        if (p.flyT <= 1.6 && !p.flyWarned) { p.flyWarned = true; SC.toast('Wind Ride is ending!', 1.6); SC.audio.play('warn'); }
        if (p.flyT <= 0) endFlight(p);
      }
      if (Math.random() < 0.5) SC.fx.burst(p.x + SC.rand(-0.3, 0.3), p.flyH * 0.5, p.y + SC.rand(-0.3, 0.3), 'wind', 1);
    } else if (p.flyH > 0 && !p.gliding) {
      // landing eases down from any height (faster when high)
      p.flyH = SC.approach(p.flyH, 0, Math.max(3.6, p.flyH * 1.6) * dt);
      if (p.flyH <= 0) { p.flyH = 0; land(p); }
    }
  }

  // ---------------- gliding (Glide mode: everybody has a glider) ----------------
  // G: a little hop, the glider opens, the hero floats forward where they steer and sinks slowly to the ground.
  // Starting higher means a longer glide. Wren with the Wind Crest has a stronger glide.
  SC.GLIDE_SINK = 1.0; SC.GLIDE_SINK_WREN = 0.5; SC.GLIDE_HOP = 4.4; SC.GLIDE_CD = 0.5;
  function tryGlide(p, hop) {
    var G = SC.G;
    if (p.gliding || p.dead || p.glideCd > 0 || p.flyH > 0.05) return false;
    p.gliding = true; p.flying = false;
    p.glideStrong = G.hero.id === 'wren' && SC.canUse('wind');
    p.glideVz = hop ? SC.GLIDE_HOP * (p.glideStrong ? 1.15 : 1) : 0;
    p.glideA = p.moving ? Math.atan2(p.vy, p.vx) : p.face;
    p.glideFromX = p.safeX; p.glideFromY = p.safeY;
    if (standOk(p) && W.reachable && W.reachable(Math.floor(p.x), Math.floor(p.y))) { p.glideFromX = p.x; p.glideFromY = p.y; }
    if (!hop) p.flyH = 0.02;
    SC.fx.burst(p.x, 0.4, p.y, 'wind', 14);
    SC.audio.play('fly');
    G.stats.glides = (G.stats.glides || 0) + 1;
    if (!G.toldGlide) { G.toldGlide = true; SC.toast(p.glideStrong ? 'Super glide! Steer where you want to go.' : 'Gliding! Steer where you want to go. Jump off high places to glide far!', 4); }
    return true;
  }
  SC.startGlide = function (hop) { var p = SC.G.player; if (p) { p.glideCd = 0; return tryGlide(p, hop !== false); } return false; };
  function updateGlide(p, dt, ix, iy, il) {
    var G = SC.G, hero = G.hero, sink = p.glideStrong ? SC.GLIDE_SINK_WREN : SC.GLIDE_SINK;
    p.glideVz = Math.max(-sink, p.glideVz - 9 * dt);
    if (il > 0) p.glideA += SC.clamp(SC.angDiff(p.glideA, Math.atan2(iy, ix)), -3.2 * dt, 3.2 * dt);
    var sp = hero.speed * (p.glideStrong ? 1.45 : 1.2) * (p.slowT > 0 ? 0.7 : 1);
    p.vx = Math.cos(p.glideA) * sp; p.vy = Math.sin(p.glideA) * sp;
    p.face = p.glideA;
    var g0 = W.heightAt(p.x, p.y), alt = g0 + p.flyH;
    W.flyAlt = alt;
    W.move(p, (p.vx + p.kx) * dt, (p.vy + p.ky) * dt, p.r, 'flyer');
    W.flyAlt = null;
    var g1 = W.heightAt(p.x, p.y);
    p.flyH = alt - g1 + p.glideVz * dt;
    p.moving = true; p.walkT += dt * 3;
    if (Math.random() < 0.35) SC.fx.burst(p.x + SC.rand(-0.4, 0.4), p.flyH + 0.6, p.y + SC.rand(-0.4, 0.4), 'wind', 1);
    if (p.flyH <= 0 && p.glideVz <= 0) {
      p.flyH = 0; p.gliding = false; p.glideCd = SC.GLIDE_CD; p.vx *= 0.4; p.vy *= 0.4;
      SC.audio.play('land');
      land(p, true);
    }
  }
  // Glide mode: walking off a ledge opens the glider by itself
  function ledgeAhead(p, dx, dy) {
    var l = Math.sqrt(dx * dx + dy * dy); if (l < 0.01) return false;
    var ax = p.x + dx / l * (p.r + 0.35), ay = p.y + dy / l * (p.r + 0.35), h0 = W.heightAt(p.x, p.y), h1 = W.heightAt(ax, ay);
    if (h0 - h1 < 0.45) return false;
    if (W.solid(W.tile(Math.floor(ax), Math.floor(ay)), 'player') && W.tile(Math.floor(ax), Math.floor(ay)) !== 'w') return false;
    W.flyAlt = h0 + 0.1;
    var ok = !W.blocked(ax, ay, p.r, 'flyer');
    W.flyAlt = null;
    return ok;
  }

  // ---------------- keys: one player, or two on one keyboard ----------------
  // 1 player: everything as before (WASD or arrows, Space/J, F/K, Tab/T, 1-9 ...).
  // 2 players: player 1 has the left side, player 2 the arrows plus a cluster for the right hand (J K L ; I O, or the numpad).
  SC.KEYS_SOLO = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], sword: ['Space', 'KeyJ'], power: ['KeyF', 'KeyK'],
    sup: ['KeyR'], dash: ['ShiftLeft', 'ShiftRight'], swap: ['Tab', 'KeyT'], fly: ['KeyG'], digits: ['Digit', 'Numpad'] };
  SC.KEYS_P1 = { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], sword: ['Space'], power: ['KeyF'], sup: ['KeyR'], dash: ['ShiftLeft'], swap: ['Tab', 'KeyT'], fly: ['KeyG'], digits: ['Digit'] };
  SC.KEYS_P2 = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], sword: ['KeyL', 'Numpad0'], power: ['KeyK', 'Numpad1'], sup: ['KeyO', 'Numpad2'],
    dash: ['Semicolon', 'Numpad3'], swap: ['KeyI', 'Numpad4'], fly: ['KeyJ', 'Numpad5'], digits: [] };
  SC.keysFor = function (i) { return SC.numPlayers() < 2 ? SC.KEYS_SOLO : i ? SC.KEYS_P2 : SC.KEYS_P1; };
  // short names for hints ("Space", "L") for the current player
  SC.keyName = function (what) {
    var k = SC.keysFor(SC.G.pi || 0)[what][0];
    return k === 'Space' ? 'Space' : k.indexOf('Shift') === 0 ? 'Shift' : k === 'Semicolon' ? ';' : k.replace(/^Key|^Digit|^Numpad/, '');
  };
  function keyDown(list) { for (var i = 0; i < list.length; i++) if (I.down[list[i]]) return true; return false; }
  function keyHit(list) { for (var i = 0; i < list.length; i++) if (I.hit[list[i]]) return true; return false; }

  // ---------------- the main hero update (every player in turn) ----------------
  SC.updatePlayer = function (dt) {
    var G = SC.G;
    SC.tickSupers(dt);
    if (!G.players || !G.players.length || G.players[0].p !== G.player && G.players.length === 1) { G.players = [{ p: G.player, hero: G.hero }]; G.pi = 0; }
    var n = G.players.length;
    // resting team members (not on screen) get their energy back
    SC.syncCtx();
    for (var tm = 0; tm < G.team.length; tm++) {
      var m = G.team[tm], onScreen = false;
      for (var q = 0; q < n; q++) if (G.players[q].hero.id === m.id && !G.players[q].p.waiting) onScreen = true;
      if (!onScreen) { var hd = SC.heroById(m.id); m.energy = Math.min(SC.maxEnergy(m.id), m.energy + hd.regen * dt); }
    }
    for (var i = 0; i < n; i++) {
      SC.useCtx(i);
      G.player.pi = i;
      updateOne(dt, i, n);
      if (G.screen !== 'play') break;
    }
    SC.useCtx(0);
    if (n > 1 && G.screen === 'play' && G.players.every(function (pl) { return pl.p.dead && pl.p.waiting; })) {
      // (cannot normally happen) nobody left playing: the last one is out for real
      G.players[0].p.waiting = false;
    }
  };

  function updateOne(dt, pi, np) {
    var G = SC.G, p = G.player, hero = G.hero, K = SC.keysFor(pi), two = np > 1;
    if (p.dead) {
      if (p.waiting) { if (two) tryRejoin(p); return; }
      p.deadT += dt;
      if (p.deadT > 1.3 && G.screen === 'play' && G.players.every(function (pl) { return pl.p.dead; })) { G.screen = 'oops'; G.menuSel = 0; }
      return;
    }
    p.inv = Math.max(0, p.inv - dt); p.swordCd = Math.max(0, p.swordCd - dt); p.dashCd = Math.max(0, p.dashCd - dt);
    p.blinkT = Math.max(0, (p.blinkT || 0) - dt); p.slowT = Math.max(0, p.slowT - dt); p.hurtT = Math.max(0, p.hurtT - dt); p.castT = Math.max(0, p.castT - dt);
    p.swapCd = Math.max(0, p.swapCd - dt); p.swapT = Math.max(0, p.swapT - dt); p.flyCd = Math.max(0, p.flyCd - dt); p.glideCd = Math.max(0, p.glideCd - dt);
    for (var k in p.powerCd) p.powerCd[k] = Math.max(0, p.powerCd[k] - dt);
    p.energy = Math.min(SC.maxEnergy(), p.energy + hero.regen * dt);

    var ix = (keyDown(K.right) ? 1 : 0) - (keyDown(K.left) ? 1 : 0);
    var iy = (keyDown(K.down) ? 1 : 0) - (keyDown(K.up) ? 1 : 0);
    var il = Math.sqrt(ix * ix + iy * iy);
    if (il > 0) {
      ix /= il; iy /= il;
      // two players in the Behind view: player 2 steers by the screen (player 1's keys turn the camera)
      if (SC.gfx && SC.gfx.inputToWorld) { var wv = SC.gfx.inputToWorld(ix, iy, two && pi > 0); if (wv) { ix = wv.x; iy = wv.y; } }
      il = Math.sqrt(ix * ix + iy * iy);
    }
    var ox = p.x, oy = p.y;
    if (p.gliding) {
      updateGlide(p, dt, ix, iy, il);
    } else {
      var air = p.flying || p.flyH > 0;
      var mode = air ? flyMode() : 'player';
      if (air) steerHeight(p, dt, K);
      var gBefore = W.heightAt(p.x, p.y);
      if (air) W.flyAlt = gBefore + p.flyH;
      if (p.dashT > 0) {
        p.dashT -= dt;
        W.move(p, p.dvx * dt, p.dvy * dt, p.r, mode);
        p.dustT -= dt;
        if (p.dustT <= 0) { p.dustT = 0.03; SC.fx.burst(p.x, 0.15 + p.flyH, p.y, air ? 'wind' : 'dust', 2); }
        p.moving = true;
      } else {
        var sp = hero.speed * (p.slowT > 0 ? 0.55 : 1) * (p.swingT > 0 ? 0.6 : 1) * (p.flying ? 1.15 : 1);
        p.vx = SC.approach(p.vx, ix * sp, 45 * dt);
        p.vy = SC.approach(p.vy, iy * sp, 45 * dt);
        if (il > 0) { if (p.swingT <= 0) p.face = Math.atan2(iy, ix); }
        var mdx = (p.vx + p.kx) * dt, mdy = (p.vy + p.ky) * dt;
        var hitWall = W.move(p, mdx, mdy, p.r, mode);
        // Glide mode: a ledge does not stop you, the glider opens and off you go
        if (hitWall && !air && il > 0 && SC.glideMode() && p.glideCd <= 0 && ledgeAhead(p, ix, iy)) { tryGlide(p, false); p.glideA = Math.atan2(iy, ix); }
        p.moving = Math.abs(p.vx) + Math.abs(p.vy) > 0.3;
        if (p.moving) p.walkT += dt * (2 + Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 1.6);
      }
      W.flyAlt = null;
      // in the air the hero keeps their height in the world: over lower ground they are higher above it
      if (air && !p.gliding) p.flyH = Math.max(0, gBefore + p.flyH - W.heightAt(p.x, p.y));
    }
    // two players: a soft leash keeps them on one screen
    if (two && !p.dead) {
      var o = G.players[1 - pi] && G.players[1 - pi].p;
      if (o && !o.dead) {
        var d1 = SC.dist(p.x, p.y, o.x, o.y), d0 = SC.dist(ox, oy, o.x, o.y);
        if (d1 > SC.LEASH && d1 > d0) {
          p.x = ox; p.y = oy;
          if (p.gliding) p.glideA += Math.PI * dt * 2;
          if (!G.toldLeash) { G.toldLeash = true; SC.toast('Stay together! The camera keeps you both on screen.', 3.5); }
        }
      }
    }
    p.kx *= Math.pow(0.0005, dt); p.ky *= Math.pow(0.0005, dt);
    if (Math.abs(p.kx) < 0.05) p.kx = 0;
    if (Math.abs(p.ky) < 0.05) p.ky = 0;
    updateFlight(p, dt);
    if (!p.flying && !p.gliding && p.flyH <= 0 && standOk(p)) { p.safeX = p.x; p.safeY = p.y; }
    // the height hint, the first time someone flies
    if (p.flying && G.heightHintT !== undefined && !G.toldHeight) {
      G.heightHintT -= dt;
      if (G.heightHintT <= 0) { G.toldHeight = true; SC.toast('Hold ' + SC.keyName('sword') + ' to go up, ' + SC.keyName('dash') + ' to go down', 4.5); }
    }

    // ----- actions -----
    var flyingNow = p.flying;   // while flying, the sword key goes up and the dash key goes down (no sword, no dash)
    if (!flyingNow && !p.gliding && keyHit(K.dash) && p.dashCd <= 0 && p.dashT <= 0) {
      var air2 = p.flyH > 0;
      var da = il > 0 ? Math.atan2(iy, ix) : p.face;
      p.dashT = 0.2; p.dashCd = hero.dashCd;
      p.dvx = Math.cos(da) * hero.speed * 3.1; p.dvy = Math.sin(da) * hero.speed * 3.1;
      p.face = da;
      SC.audio.play('dash');
      SC.fx.burst(p.x, 0.2 + p.flyH, p.y, air2 ? 'wind' : 'dust', 8);
      G.usedDash = true;
    }
    if (!flyingNow && keyHit(K.sword)) swing(p, SC.aimAt(hero.reach + 1.4, 1.2));
    if (keyHit(K.power)) SC.usePower(SC.aimAt(8, 0.9));
    if (keyHit(K.swap)) SC.switchNext();
    // number keys 1-9 pick that hero directly (player 1)
    for (var n = 1; n <= SC.HEROES.length && n <= 9; n++) {
      var dg = false; for (var di = 0; di < K.digits.length; di++) if (I.hit[K.digits[di] + n]) dg = true;
      if (dg) { var hid = SC.HEROES[n - 1].id; if (hid !== G.hero.id) SC.swapHero(hid); }
    }
    if (keyHit(K.fly)) tryFly(p);
    if (keyHit(K.sup)) SC.useSuper();
    if (pi === 0) {
      if (I.wasHit('KeyV') && SC.gfx && SC.gfx.nextView) SC.gfx.nextView();
      if (I.wasHit('KeyZ') && SC.gfx && SC.gfx.turnView) SC.gfx.turnView(-1);
      if (I.wasHit('KeyC') && SC.gfx && SC.gfx.turnView) SC.gfx.turnView(1);
      for (var c = 0; c < I.clicks.length; c++) {
        var cl = I.clicks[c];
        if (SC.ui && SC.ui.hudClick(cl.x, cl.y)) continue;
        var wp = SC.gfx && SC.gfx.groundAt && SC.gfx.groundAt(cl.x, cl.y);
        if (!wp) continue;
        var ma = Math.atan2(wp.y - p.y, wp.x - p.x);
        if (cl.b === 0) swing(p, ma);
        else if (cl.b === 2) { p.face = ma; SC.usePower(ma); }
      }
    }
    if (G.screen !== 'play' || p.dead) return;

    if (p.swingT > 0) { p.swingT = Math.max(0, p.swingT - dt); swordHits(p); }

    // ----- what am I standing on / touching -----
    var tx = Math.floor(p.x), ty = Math.floor(p.y), under = W.tile(tx, ty), low = p.flyH < 0.3 && !p.gliding;
    p.onWater = under === 'w' && low;
    if (p.onWater && p.moving) {
      p.rippleT -= dt;
      if (p.rippleT <= 0) { p.rippleT = 0.22; SC.fx.ripple(p.x, p.y); }
    }
    if (under === 'l' && p.dashT <= 0 && low) {
      if (SC.hurtPlayer(0.5, undefined, undefined, { ground: true })) { SC.fx.burst(p.x, 0.3, p.y, 'fire', 10); if (!G.toldLava) { G.toldLava = true; SC.toast('Hot hot hot! Stay off the lava!'); } }
    }
    var rr = p.r + 0.12;
    for (var yy = Math.floor(p.y - rr); yy <= Math.floor(p.y + rr); yy++) {
      for (var xx = Math.floor(p.x - rr); xx <= Math.floor(p.x + rr); xx++) {
        var t = W.tile(xx, yy);
        if (t === 'T') SC.openChest(xx, yy);
        else if (t === 'G') {
          if (SC.touchPortal) { if (SC.touchPortal(xx, yy)) return; }
          else if (G.L.gateOpen) { SC.levelComplete(); return; }
        }
      }
    }
    if (pi === 0) G.gateHintT -= dt;
    // checkpoints: the first touch saves your spot; every touch wakes resting heroes and fills hearts
    for (var f = 0; f < G.flags.length; f++) {
      var fl = G.flags[f];
      if (pi === 0) fl.cd = Math.max(0, (fl.cd || 0) - dt);
      if (SC.dist(p.x, p.y, fl.x, fl.y) >= 0.9 || fl.cd > 0) continue;
      var anyHurt = false;
      SC.storeActive();
      G.team.forEach(function (mm) { if (mm.out || mm.hp < SC.maxHp(mm.id)) anyHurt = true; });
      if (!fl.active) {
        fl.active = true; fl.t = 0; fl.cd = 4;
        G.checkpoint = { x: fl.x, y: fl.y + 0.6 };
        G.lv.flags++;
        SC.healTeam();
        SC.toast('Checkpoint! Everyone is fresh again.');
        SC.audio.play('checkpoint');
        SC.fx.burst(fl.x, 1.2, fl.y, 'star', 14);
        SC.save && SC.saveMid && SC.saveMid();
      } else if (anyHurt) {
        fl.cd = 4;
        SC.healTeam();
        SC.toast('Hearts filled up!');
        SC.audio.play('checkpoint');
        SC.fx.burst(fl.x, 1.2, fl.y, 'heart', 10);
      }
    }
    if (pi === 0) hints(p, dt);
  }
  SC.LEASH = 13;

  // friendly little tips when the hero walks near something special
  function hints(p, dt) {
    var G = SC.G;
    G.hintT -= dt;
    if (G.hintT > 0) return;
    var tx = Math.floor(p.x), ty = Math.floor(p.y);
    for (var yy = ty - 2; yy <= ty + 2; yy++) for (var xx = tx - 2; xx <= tx + 2; xx++) {
      var t = W.tile(xx, yy), msg = null;
      if (t === 't') msg = SC.hasPower('fire') ? (SC.canUse('fire') ? 'Thorns! Burn them with Fire (F).' : 'Thorns! Nate can burn them with Fire.') : 'Thorns! Only fire can burn them.';
      else if (t === 'k') msg = SC.hasPower('earth') ? (SC.canUse('earth') ? 'A cracked rock! Smash it with Earth.' : 'A cracked rock! Koda can smash it with Earth.') : 'A cracked rock! Earth power can break it.';
      else if (t === 'w' && !SC.hasPower('surface') && !p.flying) msg = 'Too deep to swim! A crest will help.';
      else if (t === 'w' && SC.hasPower('surface') && G.hero.id !== 'pip' && !p.flying && !G.toldPipWater) { G.toldPipWater = true; msg = 'Pip can walk on water! Press 5 to switch.'; }
      else if (t === 'b' && !G.toldBush) { G.toldBush = true; msg = 'Bushes! Cut them with your sword.'; }
      if (msg && G.lastHint !== msg) { G.lastHint = msg; G.hintT = 8; SC.toast(msg); return; }
    }
    G.hintT = 0.5;
  }

  // ---------------- pickups ----------------
  SC.spawnPickup = function (kind, x, y, val, opts) {
    var G = SC.G;
    if (G.pickups.length > 160) {
      for (var i = 0; i < G.pickups.length; i++) if (G.pickups[i].kind === 'gem') { G.pickups.splice(i, 1); break; }
    }
    var a = Math.random() * Math.PI * 2, s = (opts && opts.spread) || SC.rand(0.6, 1.8);
    var pk = { id: ++G.nextId, kind: kind, x: x, y: y, h: 0.3, vh: (opts && opts.vh) || SC.rand(3, 5), vx: Math.cos(a) * s, vy: Math.sin(a) * s, val: val || 1, t: 0, power: opts && opts.power, still: !!(opts && opts.still) };
    if (opts && opts.sealed) { pk.sealed = true; pk.trial = opts.trial; }
    else if (kind === 'crest') pk.sealed = false;
    if (pk.still) { pk.vx = pk.vy = 0; pk.vh = 0; pk.h = 0; }
    G.pickups.push(pk);
    return pk;
  };

  SC.updatePickups = function (dt) {
    var G = SC.G, p = G.player;
    for (var i = G.pickups.length - 1; i >= 0; i--) {
      var k = G.pickups[i];
      k.t += dt;
      if (!k.still) {
        k.vh -= 16 * dt; k.h += k.vh * dt;
        if (k.h <= 0) { k.h = 0; k.vh = Math.abs(k.vh) > 1.5 ? -k.vh * 0.4 : 0; k.vx *= 0.6; k.vy *= 0.6; }
        W.move(k, k.vx * dt, k.vy * dt, 0.15, 'proj');
        k.vx *= Math.pow(0.2, dt); k.vy *= Math.pow(0.2, dt);
        // when it settles somewhere nobody can stand (water, a ledge), slide it to the nearest spot the hero can reach
        if (k.h === 0 && k.vh === 0 && k.t > 0.6) {
          k.still = true;
          if (W.blocked(k.x, k.y, 0.2, 'player')) { var keep = G.hero; G.hero = SC.heroById('koda'); W.unstick(k, 0.3, 'player'); G.hero = keep; }
        }
      }
      if (k.sealed) continue;
      // two players: the nearest one gets it (pickups go to the team; a heart heals whoever takes it)
      var who = G.players && G.players.length > 1 ? SC.nearestPlayer(k.x, k.y) : 0;
      if (who !== (G.pi || 0)) SC.useCtx(who);
      p = G.player;
      if (p.dead) { SC.useCtx(0); p = G.player; continue; }
      var d = SC.dist(p.x, p.y, k.x, k.y) + (p.flyH > 2.5 && k.kind !== 'gem' ? 9 : 0);
      var wants = k.kind === 'gem' || (k.kind === 'heart' && p.hp < SC.maxHp());
      if (wants && k.t > 0.35 && d < 1.7) {
        var sp = 9 * dt;
        k.x += (p.x - k.x) / d * Math.min(sp, d); k.y += (p.y - k.y) / d * Math.min(sp, d);
      }
      var need = k.kind === 'gem' || k.kind === 'heart' ? 0.5 : 0.65;
      if (d < need && k.t > 0.3 && (k.kind !== 'heart' || p.hp < SC.maxHp())) { G.pickups.splice(i, 1); collect(k); }
      if (who) { SC.useCtx(0); p = G.player; }
    }
  };

  function collect(k) {
    var G = SC.G, p = G.player, pr = G.prog;
    if (k.kind === 'gem') {
      pr.gems += k.val; G.stats.gems += k.val; G.lv.gems += k.val;
      SC.audio.play('gem');
      SC.fx.burst(k.x, 0.5, k.y, 'gem', 5);
      if (!G.toldMoney && pr.gems >= 15) { G.toldMoney = true; SC.toast('Gems are money! Trade them with the trader.', 3.5); }
    } else if (k.kind === 'heart') {
      p.hp = Math.min(SC.maxHp(), p.hp + 1);
      SC.popText(p.x, p.y, '+1', '#ff6b8a');
      SC.audio.play('heart');
      SC.fx.burst(k.x, 0.5, k.y, 'heart', 6);
    } else if (k.kind === 'heartUp') {
      pr.bonusHearts++; SC.healTeam();
      SC.banner('Heart Container!', 'Everyone has one more heart now!', 'heart');
      SC.audio.play('levelup'); G.freezeT = 1.0;
      SC.fx.burst(k.x, 0.8, k.y, 'heart', 16);
    } else if (k.kind === 'life') {
      pr.lives = (pr.lives || 0) + 1;
      SC.banner('Extra life!', 'If the whole team gets knocked out, it brings you back!', 'heart', 3);
      SC.audio.play('levelup'); G.freezeT = 0.8;
      SC.fx.burst(k.x, 0.8, k.y, 'heart', 20); SC.fx.burst(k.x, 0.8, k.y, 'star', 14);
      if (SC.saveMid) SC.saveMid();
    } else if (k.kind === 'sword') {
      pr.swordLevel = Math.max(pr.swordLevel, k.val);
      SC.banner(k.val >= 2 ? 'Crystal Sword!' : 'Iron Sword!', 'Every sword on the team hits harder now!', 'sword');
      SC.audio.play('levelup'); G.freezeT = 1.2;
      SC.fx.burst(k.x, 0.8, k.y, 'star', 20);
    } else if (k.kind === 'crest') {
      SC.gainCrest(k.power, k);
    } else if (k.kind === 'block') {
      var L = G.L;
      // the block lights one slot of this level's exit portal and is carried home (circling the hero)
      L.blocksCarried = (L.blocksCarried || 0) + 1;
      L.blocksGot = (L.blocksGot || 0) + 1;
      L.portalFitted = Math.min(L.portalNeed || 0, L.blocksGot);
      G.stats.blocks = (G.stats.blocks || 0) + 1;
      SC.toast('Portal block! (' + L.blocksGot + ' of ' + L.portalNeed + ')', 3);
      SC.audio.play('blockget');
      SC.fx.burst(k.x, 0.6, k.y, 'gem', 14);
      SC.fx.ring(k.x, k.y, 0x9ff0ff, 1.4);
    }
  }

  SC.gainCrest = function (power, k) {
    var G = SC.G, pr = G.prog, p = G.player, pw = SC.powerById(power), owner = SC.heroById(pw.owner);
    if (SC.hasPower(power)) {
      pr.bonusHearts++; p.hp = Math.min(SC.maxHp(), p.hp + 1);
      SC.banner(pw.name + ' Crest!', owner.name + ' has ' + pw.name + ' already, so everyone gets +1 heart!', power);
    } else {
      SC.ownPower(power, 1);
      if (!G.slotBy[owner.id] || !SC.canUse(G.slotBy[owner.id])) G.slotBy[owner.id] = power;
      SC.syncPowerIdx();
      var sub;
      if (G.hero.id === owner.id) {
        setCurrent(power);
        sub = 'Press F to use it!';
        if (power === 'surface') sub = 'Press F for bubbles. Pip can walk on water now!';
        if (power === 'earth') sub = 'Press F for rock spikes! They break cracked rocks.';
        if (power === 'wind') sub = 'Press F for a tornado and G to fly!';
      } else sub = 'Press ' + (SC.heroIndex(owner.id) + 1) + ' or Tab to play as ' + owner.name + '.';
      SC.banner(owner.name + ' learned ' + pw.name + '!', sub, power, 3.8);
      G.stats.crests = (G.stats.crests || 0) + 1;
    }
    G.freezeT = 1.3;
    SC.audio.play('crest');
    if (k) { SC.fx.burst(k.x, 1, k.y, 'star', 26); SC.fx.ring(k.x, k.y, pw.hex, 3); }
    if (SC.saveMid) SC.saveMid();
  };

  SC.openChest = function (tx, ty) {
    var G = SC.G, L = G.L;
    W.setTile(tx, ty, 'O');
    var ch = null;
    for (var i = 0; i < L.chests.length; i++) if (L.chests[i].tx === tx && L.chests[i].ty === ty) ch = L.chests[i];
    if (ch) ch.openT = 0;
    var x = tx + 0.5, y = ty + 0.5, p = G.player;
    var ox = SC.clamp(p.x - x, -1, 1) * 0.6, oy = SC.clamp(p.y - y, -1, 1) * 0.6;
    var c = ch ? ch.content : 'gems';
    SC.audio.play('chest');
    SC.fx.burst(x, 0.8, y, 'star', 14);
    G.stats.chests++; G.lv.chests++;
    if (c === 'gems') {
      for (var g = 0; g < 8; g++) SC.spawnPickup('gem', x + ox * 0.5, y + oy * 0.5, g < 2 ? 5 : 1, { vh: SC.rand(4, 7) });
      SC.toast('Treasure! Lots of gems!');
    } else if (c === 'life') {
      SC.spawnPickup('life', x + ox, y + oy, 1, { vh: 6, spread: 0.3 });
      SC.toast('An extra life!');
    } else if (c === 'heartUp') {
      SC.spawnPickup('heartUp', x + ox, y + oy, 1, { vh: 6, spread: 0.3 });
    } else if (c === 'iron') {
      SC.spawnPickup('sword', x + ox, y + oy, 1, { vh: 6, spread: 0.3 });
    } else if (c === 'crystal') {
      SC.spawnPickup('sword', x + ox, y + oy, 2, { vh: 6, spread: 0.3 });
    }
  };
})();
