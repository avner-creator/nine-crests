// Nine Crests - core: shared namespace, error box, small helpers, saving, keyboard + mouse input.
(function () {
  'use strict';
  var SC = window.SC = window.SC || {};
  SC.TILE = 1;            // the simulation works in tile units (1 tile = 1 unit = 1 metre in 3D)
  SC.STEP = 1 / 60;       // fixed simulation step
  SC.errors = [];
  SC.testName = (location.hash.match(/#test=([\w-]+)/) || [])[1] || null;
  SC.testMode = !!SC.testName;

  function showErr(msg) {
    msg = String(msg);
    SC.errors.push(msg);
    var b = document.getElementById('errbox');
    if (b) { b.style.display = 'block'; b.textContent = 'Oops, a bug: ' + SC.errors.slice(-4).join('\n'); }
  }
  SC.showErr = showErr;
  window.onerror = function (msg, src, line) {
    showErr(msg + ' @' + String(src || '').split('/').pop() + ':' + line);
  };
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason; showErr('Promise: ' + (r && r.message ? r.message : r));
  });
  // run fn and turn any exception into a red-box message instead of a frozen game
  SC.safe = function (fn, label) {
    try { return fn(); } catch (e) { showErr((label || 'error') + ': ' + (e && e.message ? e.message : e) + (e && e.stack ? ' | ' + String(e.stack).split('\n')[1] : '')); }
  };

  // ---------- math helpers ----------
  SC.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  SC.lerp = function (a, b, t) { return a + (b - a) * t; };
  SC.rand = function (a, b) { return a + Math.random() * (b - a); };
  SC.randInt = function (a, b) { return a + Math.floor(Math.random() * (b - a + 1)); };
  SC.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  SC.dist = function (ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); };
  SC.angDiff = function (a, b) {
    var d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  SC.approach = function (v, target, amt) { return v < target ? Math.min(v + amt, target) : Math.max(v - amt, target); };
  SC.hash = function (x, y) {
    var h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  SC.ease = function (t) { t = SC.clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  // ---------- saving (localStorage can throw on file://) ----------
  var PREFIX = 'nineCrests.';
  SC.store = {
    get: function (k) { try { var v = window.localStorage.getItem(PREFIX + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(PREFIX + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { window.localStorage.removeItem(PREFIX + k); } catch (e) { /* ignore */ } }
  };

  // ---------- input ----------
  // down[code] = held; hit[code] = pressed since the last simulation tick (edge).
  var input = SC.input = { down: {}, hit: {}, clicks: [], mx: -1, my: -1, mouseMoved: false, lastMoveT: 0 };
  var GAME_KEYS = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1, Tab: 1 };
  input.press = function (code) { if (!input.down[code]) input.hit[code] = true; input.down[code] = true; };
  input.release = function (code) { input.down[code] = false; };
  input.isDown = function () { for (var i = 0; i < arguments.length; i++) if (input.down[arguments[i]]) return true; return false; };
  input.wasHit = function () { for (var i = 0; i < arguments.length; i++) if (input.hit[arguments[i]]) return true; return false; };
  input.endTick = function () { input.hit = {}; input.clicks.length = 0; };
  input.clear = function () { input.down = {}; input.hit = {}; input.clicks.length = 0; };

  window.addEventListener('keydown', function (e) {
    if (GAME_KEYS[e.code]) e.preventDefault();
    if (SC.audio) SC.audio.unlock();
    if (e.repeat) return;
    input.press(e.code);
  });
  window.addEventListener('keyup', function (e) { input.release(e.code); });
  window.addEventListener('blur', function () { input.down = {}; });

  SC.initMouse = function (el) {
    el.addEventListener('mousemove', function (e) { input.mx = e.clientX; input.my = e.clientY; input.mouseMoved = true; });
    el.addEventListener('mousedown', function (e) {
      if (SC.audio) SC.audio.unlock();
      input.mx = e.clientX; input.my = e.clientY;
      input.clicks.push({ x: e.clientX, y: e.clientY, b: e.button });
      e.preventDefault();
    });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('wheel', function (e) { e.preventDefault(); }, { passive: false });
  };
})();
