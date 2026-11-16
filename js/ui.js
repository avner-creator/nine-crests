// Nine Crests - the flat 2D layer on top of the 3D picture: HUD, menus, banners, toasts, damage numbers, power icons.
(function () {
  'use strict';
  var SC = window.SC;
  var UI = SC.ui = { buttons: [], slots: [], u: 1, W: 1100, H: 650 };
  var cv, g, pr = 1;
  var FONT = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';

  UI.init = function () {
    cv = document.getElementById('ui');
    g = cv.getContext('2d');
    UI.resize();
    window.addEventListener('resize', UI.resize);
    SC.initMouse(cv);
  };
  UI.resize = function () {
    pr = Math.min(window.devicePixelRatio || 1, 1.5);
    cv.width = Math.round(window.innerWidth * pr); cv.height = Math.round(window.innerHeight * pr);
    cv.style.width = window.innerWidth + 'px'; cv.style.height = window.innerHeight + 'px';
    UI.u = SC.clamp(Math.min(window.innerWidth / 1100, window.innerHeight / 650), 0.55, 2);
    UI.W = window.innerWidth / UI.u; UI.H = window.innerHeight / UI.u;
  };
  UI.toLogical = function (x, y) { return { x: x / UI.u, y: y / UI.u }; };

  // ---------- drawing helpers ----------
  function rr(x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function panel(x, y, w, h, alpha, r) { rr(x, y, w, h, r || 14); g.fillStyle = 'rgba(25,20,50,' + (alpha || 0.72) + ')'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.25)'; g.stroke(); }
  function text(s, x, y, size, color, align, outline, weight) {
    g.font = (weight || 'bold') + ' ' + size + 'px ' + FONT;
    g.textAlign = align || 'center'; g.textBaseline = 'middle';
    if (outline !== false) { g.lineJoin = 'round'; g.lineWidth = Math.max(3, size / 5); g.strokeStyle = outline || 'rgba(20,10,40,0.9)'; g.strokeText(s, x, y); }
    g.fillStyle = color || '#fff'; g.fillText(s, x, y);
  }
  UI.text = text;
  function heartPath(x, y, s) {
    g.beginPath();
    g.moveTo(x, y + s * 0.35);
    g.bezierCurveTo(x - s * 0.1, y + s * 0.25, x - s * 0.55, y + s * 0.0, x - s * 0.5, y - s * 0.22);
    g.bezierCurveTo(x - s * 0.45, y - s * 0.5, x - s * 0.08, y - s * 0.5, x, y - s * 0.22);
    g.bezierCurveTo(x + s * 0.08, y - s * 0.5, x + s * 0.45, y - s * 0.5, x + s * 0.5, y - s * 0.22);
    g.bezierCurveTo(x + s * 0.55, y + s * 0.0, x + s * 0.1, y + s * 0.25, x, y + s * 0.35);
    g.closePath();
  }
  function drawHeart(x, y, s, fill) { // fill 0, 0.5, 1
    heartPath(x, y, s); g.fillStyle = '#4a3050'; g.fill();
    if (fill > 0) {
      g.save(); heartPath(x, y, s); g.clip();
      g.fillStyle = '#ff3a5a'; g.fillRect(x - s, y - s, fill >= 1 ? 2 * s : s, 2 * s);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x - s * 0.22, y - s * 0.2, s * 0.1, 0, 7); g.fill();
      g.restore();
    }
    heartPath(x, y, s); g.lineWidth = 2.5; g.strokeStyle = '#1a0a20'; g.stroke();
  }
  UI.drawHeart = function (ctx, x, y, s, f) { var o = g; g = ctx; drawHeart(x, y, s, f); g = o; };
  function gemIcon(x, y, s) {
    g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.7, y - s * 0.2); g.lineTo(x, y + s); g.lineTo(x - s * 0.7, y - s * 0.2); g.closePath();
    g.fillStyle = '#3affb0'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#0a4a30'; g.stroke();
    g.beginPath(); g.moveTo(x, y - s); g.lineTo(x - s * 0.25, y - s * 0.2); g.lineTo(x, y + s); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill();
  }

  // ---------- the nine power icons ----------
  SC.drawPowerIcon = function (ctx, id, x, y, s, big) {
    var o = g; g = ctx;
    g.save();
    g.lineJoin = 'round'; g.lineCap = 'round';
    var ol = '#1a1030', lw = Math.max(2, s * 0.12);
    switch (id) {
      case 'fire':
        g.beginPath(); g.moveTo(x, y - s);
        g.quadraticCurveTo(x + s * 0.95, y - s * 0.05, x + s * 0.6, y + s * 0.55); g.quadraticCurveTo(x, y + s * 1.05, x - s * 0.6, y + s * 0.55);
        g.quadraticCurveTo(x - s * 0.95, y - s * 0.05, x, y - s); g.fillStyle = '#ff6a10'; g.fill(); g.lineWidth = lw; g.strokeStyle = ol; g.stroke();
        g.beginPath(); g.moveTo(x, y - s * 0.3); g.quadraticCurveTo(x + s * 0.5, y + s * 0.2, x + s * 0.3, y + s * 0.55); g.quadraticCurveTo(x, y + s * 0.8, x - s * 0.3, y + s * 0.55);
        g.quadraticCurveTo(x - s * 0.5, y + s * 0.2, x, y - s * 0.3); g.fillStyle = '#ffe14a'; g.fill();
        break;
      case 'water':
        g.beginPath(); g.moveTo(x, y - s); g.quadraticCurveTo(x + s * 0.2, y - s * 0.5, x + s * 0.65, y + s * 0.2);
        g.arc(x, y + s * 0.3, s * 0.66, -0.15, Math.PI + 0.15); g.quadraticCurveTo(x - s * 0.2, y - s * 0.5, x, y - s);
        g.fillStyle = '#2f8cff'; g.fill(); g.lineWidth = lw; g.strokeStyle = ol; g.stroke();
        g.beginPath(); g.arc(x - s * 0.25, y + s * 0.2, s * 0.17, 0, 7); g.fillStyle = 'rgba(255,255,255,0.75)'; g.fill();
        break;
      case 'surface':
        g.beginPath(); g.arc(x, y, s * 0.85, 0, 7); g.fillStyle = 'rgba(120,230,245,0.55)'; g.fill(); g.lineWidth = lw; g.strokeStyle = ol; g.stroke();
        g.beginPath(); g.arc(x, y, s * 0.85, 0, 7); g.lineWidth = lw * 0.6; g.strokeStyle = '#e6fdff'; g.stroke();
        g.beginPath(); g.arc(x - s * 0.3, y - s * 0.3, s * 0.2, 0, 7); g.fillStyle = '#fff'; g.fill();
        g.beginPath(); g.arc(x + s * 0.35, y + s * 0.35, s * 0.1, 0, 7); g.fill();
        // tiny water-strider legs
        g.strokeStyle = '#1a5060'; g.lineWidth = lw * 0.5;
        g.beginPath(); g.moveTo(x - s * 0.25, y + s * 0.1); g.lineTo(x + s * 0.25, y + s * 0.1);
        g.moveTo(x - s * 0.15, y + s * 0.1); g.lineTo(x - s * 0.4, y - s * 0.1); g.moveTo(x + s * 0.15, y + s * 0.1); g.lineTo(x + s * 0.4, y - s * 0.1);
        g.moveTo(x - s * 0.1, y + s * 0.1); g.lineTo(x - s * 0.35, y + s * 0.35); g.moveTo(x + s * 0.1, y + s * 0.1); g.lineTo(x + s * 0.35, y + s * 0.35); g.stroke();
        break;
      case 'ice':
        for (var pass = 0; pass < 2; pass++) {
          g.strokeStyle = pass ? '#bff4ff' : ol; g.lineWidth = pass ? lw * 0.9 : lw * 2;
          for (var k = 0; k < 3; k++) {
            var a = k * Math.PI / 3, cx = Math.cos(a) * s, cy = Math.sin(a) * s;
            g.beginPath(); g.moveTo(x - cx, y - cy); g.lineTo(x + cx, y + cy);
            for (var sgn = -1; sgn <= 1; sgn += 2) {
              var bx = x + cx * 0.55 * sgn, by = y + cy * 0.55 * sgn;
              g.moveTo(bx, by); g.lineTo(bx + Math.cos(a + 2.4 * sgn) * s * 0.3 * sgn, by + Math.sin(a + 2.4 * sgn) * s * 0.3 * sgn);
              g.moveTo(bx, by); g.lineTo(bx + Math.cos(a - 2.4 * sgn) * s * 0.3 * sgn, by + Math.sin(a - 2.4 * sgn) * s * 0.3 * sgn);
            }
            g.stroke();
          }
        }
        break;
      case 'earth':
        var spikes = [[-0.55, 0.55, 0.9], [0, 0.65, 1.5], [0.55, 0.55, 1.0]];
        spikes.forEach(function (sp, i) {
          var bx = x + sp[0] * s, w = sp[1] * s * 0.6, top = y + s * 0.65 - sp[2] * s;
          g.beginPath(); g.moveTo(bx - w, y + s * 0.65); g.lineTo(bx - w * 0.2, top); g.lineTo(bx + w, y + s * 0.65); g.closePath();
          g.fillStyle = i === 1 ? '#c08a4a' : '#a0703a'; g.fill(); g.lineWidth = lw; g.strokeStyle = ol; g.stroke();
          g.beginPath(); g.moveTo(bx - w * 0.2, top); g.lineTo(bx + w * 0.3, y + s * 0.6); g.lineTo(bx + w, y + s * 0.65); g.fillStyle = 'rgba(255,220,160,0.4)'; g.fill();
        });
        g.fillStyle = '#6a4a2a'; g.fillRect(x - s, y + s * 0.62, s * 2, s * 0.25); g.strokeStyle = ol; g.lineWidth = lw * 0.7; g.strokeRect(x - s, y + s * 0.62, s * 2, s * 0.25);
        break;
      case 'lightning':
        g.beginPath(); g.moveTo(x + s * 0.2, y - s); g.lineTo(x - s * 0.55, y + s * 0.1); g.lineTo(x - s * 0.05, y + s * 0.1);
        g.lineTo(x - s * 0.3, y + s); g.lineTo(x + s * 0.6, y - s * 0.2); g.lineTo(x + s * 0.08, y - s * 0.2); g.lineTo(x + s * 0.45, y - s); g.closePath();
        g.fillStyle = '#ffe14a'; g.fill(); g.lineWidth = lw; g.strokeStyle = ol; g.stroke();
        break;
      case 'wind':
        for (var pz = 0; pz < 2; pz++) {
          g.strokeStyle = pz ? '#dffff0' : ol; g.lineWidth = pz ? lw * 0.9 : lw * 2.1;
          g.beginPath(); g.moveTo(x - s * 0.9, y - s * 0.35); g.lineTo(x + s * 0.35, y - s * 0.35); g.arc(x + s * 0.35, y - s * 0.62, s * 0.27, Math.PI / 2, -Math.PI * 0.9, true); g.stroke();
          g.beginPath(); g.moveTo(x - s * 0.9, y + s * 0.05); g.lineTo(x + s * 0.6, y + s * 0.05); g.arc(x + s * 0.6, y - s * 0.22, s * 0.27, Math.PI / 2, -Math.PI * 0.9, true); g.stroke();
          g.beginPath(); g.moveTo(x - s * 0.7, y + s * 0.45); g.lineTo(x + s * 0.2, y + s * 0.45); g.arc(x + s * 0.2, y + s * 0.7, s * 0.25, -Math.PI / 2, Math.PI * 0.9, false); g.stroke();
        }
        break;
      case 'life':
        g.save(); g.translate(x, y + s * 0.05); var hs = s * 1.9;
        g.beginPath(); g.moveTo(0, hs * 0.35); g.bezierCurveTo(-hs * 0.1, hs * 0.25, -hs * 0.55, 0, -hs * 0.5, -hs * 0.22); g.bezierCurveTo(-hs * 0.45, -hs * 0.5, -hs * 0.08, -hs * 0.5, 0, -hs * 0.22);
        g.bezierCurveTo(hs * 0.08, -hs * 0.5, hs * 0.45, -hs * 0.5, hs * 0.5, -hs * 0.22); g.bezierCurveTo(hs * 0.55, 0, hs * 0.1, hs * 0.25, 0, hs * 0.35); g.closePath();
        g.fillStyle = '#45d65a'; g.fill(); g.lineWidth = lw; g.strokeStyle = ol; g.stroke();
        g.fillStyle = '#fff'; g.fillRect(-s * 0.1, -s * 0.45, s * 0.2, s * 0.6); g.fillRect(-s * 0.3, -s * 0.25, s * 0.6, s * 0.2);
        g.restore();
        break;
      case 'death':
        g.beginPath(); g.arc(x, y - s * 0.15, s * 0.75, 0, 7); g.fillStyle = '#b07aff'; g.fill(); g.lineWidth = lw; g.strokeStyle = ol; g.stroke();
        rr(x - s * 0.42, y + s * 0.3, s * 0.84, s * 0.45, s * 0.12); g.fill(); g.stroke();
        g.fillStyle = '#2a103a';
        g.beginPath(); g.ellipse(x - s * 0.28, y - s * 0.15, s * 0.2, s * 0.24, 0, 0, 7); g.fill();
        g.beginPath(); g.ellipse(x + s * 0.28, y - s * 0.15, s * 0.2, s * 0.24, 0, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x - s * 0.23, y - s * 0.22, s * 0.07, 0, 7); g.arc(x + s * 0.33, y - s * 0.22, s * 0.07, 0, 7); g.fill();
        g.strokeStyle = '#2a103a'; g.lineWidth = lw * 0.6;
        g.beginPath(); g.moveTo(x - s * 0.15, y + s * 0.38); g.lineTo(x - s * 0.15, y + s * 0.7); g.moveTo(x + s * 0.15, y + s * 0.38); g.lineTo(x + s * 0.15, y + s * 0.7); g.stroke();
        break;
      case 'heart': drawHeart(x, y, s * 1.8, 1); break;
      case 'star':
        g.beginPath();
        for (var i = 0; i < 10; i++) { var ra = i % 2 ? s * 0.45 : s, aa = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(x + Math.cos(aa) * ra, y + Math.sin(aa) * ra); }
        g.closePath(); g.fillStyle = '#ffe14a'; g.fill(); g.lineWidth = lw; g.strokeStyle = ol; g.stroke();
        break;
      case 'sword':
        g.translate(x, y); g.rotate(-0.8);
        g.fillStyle = '#dfe9f5'; g.strokeStyle = ol; g.lineWidth = lw * 0.8;
        g.beginPath(); g.moveTo(-s * 0.12, s * 0.35); g.lineTo(-s * 0.12, -s * 0.8); g.lineTo(0, -s * 1.0); g.lineTo(s * 0.12, -s * 0.8); g.lineTo(s * 0.12, s * 0.35); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#ffc83a'; g.fillRect(-s * 0.4, s * 0.32, s * 0.8, s * 0.14); g.strokeRect(-s * 0.4, s * 0.32, s * 0.8, s * 0.14);
        g.fillStyle = '#6a4020'; g.fillRect(-s * 0.08, s * 0.46, s * 0.16, s * 0.4);
        break;
      case 'dragon':
        g.fillStyle = '#c8342a'; g.strokeStyle = ol; g.lineWidth = lw;
        g.beginPath(); g.ellipse(x, y + s * 0.1, s * 0.7, s * 0.6, 0, 0, 7); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(x - s * 0.45, y - s * 0.35); g.lineTo(x - s * 0.65, y - s * 0.95); g.lineTo(x - s * 0.15, y - s * 0.5); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(x + s * 0.45, y - s * 0.35); g.lineTo(x + s * 0.65, y - s * 0.95); g.lineTo(x + s * 0.15, y - s * 0.5); g.fill(); g.stroke();
        g.fillStyle = '#ffe14a'; g.beginPath(); g.arc(x - s * 0.28, y - s * 0.02, s * 0.14, 0, 7); g.arc(x + s * 0.28, y - s * 0.02, s * 0.14, 0, 7); g.fill();
        g.fillStyle = '#ffc86a'; g.beginPath(); g.ellipse(x, y + s * 0.4, s * 0.35, s * 0.18, 0, 0, 7); g.fill();
        break;
    }
    g.restore();
    g = o;
  };

  // ---------- frame ----------
  UI.begin = function () {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(pr * UI.u, 0, 0, pr * UI.u, 0, 0);
    UI.buttons.length = 0;
  };

  function button(id, label, x, y, w, h, selected, idx) {
    UI.buttons.push({ id: id, x: x, y: y, w: w, h: h, idx: idx });
    var bob = selected ? Math.sin(SC.G.realT * 6) * 2 : 0;
    rr(x, y + bob, w, h, h / 2);
    var gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, selected ? '#ffe36a' : '#7a6ad8'); gr.addColorStop(1, selected ? '#ffa81a' : '#4a3aa8');
    g.fillStyle = gr; g.fill();
    g.lineWidth = selected ? 5 : 3; g.strokeStyle = selected ? '#fff' : 'rgba(255,255,255,0.5)'; g.stroke();
    text(label, x + w / 2, y + h / 2 + bob + 1, h * 0.46, selected ? '#3a1a00' : '#fff', 'center', selected ? false : undefined);
  }
  UI.hitButton = function (cx, cy) {
    var p = UI.toLogical(cx, cy);
    for (var i = 0; i < UI.buttons.length; i++) {
      var b = UI.buttons[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
    }
    return null;
  };
  UI.portraits = [];
  UI.superBtn = null;
  function inBox(p, s) { return s && p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h; }
  UI.hudClick = function (cx, cy) {
    var p = UI.toLogical(cx, cy);
    for (var i = 0; i < UI.slots.length; i++) if (inBox(p, UI.slots[i])) { SC.selectSlot(i); return true; }
    for (var j = 0; j < UI.portraits.length; j++) if (inBox(p, UI.portraits[j])) { SC.swapHero(UI.portraits[j].id); return true; }
    if (inBox(p, UI.superBtn)) { SC.useSuper(); return true; }
    return false;
  };

  function logo(cx, cy, scale) {
    var t = SC.G.realT;
    // power icons circle behind the words, so they never cover a letter
    for (var i = 0; i < 9; i++) {
      var a = i / 9 * Math.PI * 2 + t * 0.5;
      SC.drawPowerIcon(g, SC.POWERS[i].id, cx + Math.cos(a) * 330 * scale, cy + 10 + Math.sin(a) * 60 * scale, 13 * scale);
    }
    g.save(); g.translate(cx, cy); g.scale(scale, scale);
    g.rotate(Math.sin(t * 1.3) * 0.02);
    g.font = 'bold 86px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 16; g.strokeStyle = '#2a1050'; g.strokeText('Nine Crests', 0, 0);
    var gr = g.createLinearGradient(0, -40, 0, 40); gr.addColorStop(0, '#fff6a0'); gr.addColorStop(0.5, '#ffc83a'); gr.addColorStop(1, '#ff7a1a');
    g.fillStyle = gr; g.fillText('Nine Crests', 0, 0);
    g.restore();
    text('Beat the Dragon!', cx, cy + 62 * scale, 34 * scale, '#ffffff', 'center', '#a02a2a');
  }

  // the keys for two players on one keyboard (title, pause, start of a 2-player game)
  var KEYS2 = [['', 'Player 1', 'Player 2'], ['Move', 'W A S D', 'Arrow keys'], ['Sword', 'Space', 'L  or  Num 0'], ['Power', 'F', 'K  or  Num 1'], ['Super', 'R', 'O  or  Num 2'],
    ['Dash', 'Left Shift', ';  or  Num 3'], ['Switch hero', 'Tab', 'I  or  Num 4'], ['Fly / glide', 'G', 'J  or  Num 5'], ['Up / down', 'Space / Shift', 'L / ;'], ['Talk', 'E or Enter', 'Enter']];
  function controlsBox2(x, y, w, fs) {
    fs = fs || 15; var lh = fs + 7, h = 26 + KEYS2.length * lh;
    panel(x, y, w, h, 0.72);
    var c1 = x + fs * 7.2, c2 = x + fs * 7.2 + (w - fs * 7.2) / 2;
    for (var i = 0; i < KEYS2.length; i++) {
      var r = KEYS2[i], yy = y + 22 + i * lh;
      if (i === 0) { text(r[1], c1, yy, fs + 1, SC.PCOLOR[0], 'left', false); text(r[2], c2, yy, fs + 1, SC.PCOLOR[1], 'left', false); continue; }
      text(r[0], x + 14, yy, fs, '#ffe36a', 'left', false);
      text(r[1], c1, yy, fs, '#ffffff', 'left', false, 'normal'); text(r[2], c2, yy, fs, '#ffffff', 'left', false, 'normal');
    }
    return h;
  }
  UI.controlsBox2 = controlsBox2;
  function controlsBox(x, y, w, fs) {
    fs = fs || 17; var lh = fs + 7;
    var lines = [['Move', 'WASD or Arrow keys'], ['Sword', 'Space or J  (or left click)'], ['Power', 'F or K  (or right click)'], ['Super', 'R  (then it charges up)'], ['Switch hero', 'Tab / T, or 1 - 9, or click a face'], ['Fly / glide', 'G  (flying: Space up, Shift down)'], ['Dash', 'Shift'], ['Talk / trade', 'Enter  (next to a person)'],
      ['View', 'V change,  Z / C turn'], ['Pause', 'P or Esc  (Player 2 joins here)'], ['Sound', 'M']];
    var h = 26 + lines.length * lh;
    panel(x, y, w, h, 0.7);
    for (var i = 0; i < lines.length; i++) {
      text(lines[i][0], x + 16, y + 22 + i * lh, fs, '#ffe36a', 'left', false);
      text(lines[i][1], x + fs * 8.2, y + 22 + i * lh, fs, '#ffffff', 'left', false, 'normal');
    }
    return h;
  }
  UI.controlsBox = controlsBox;

  // ---------- screens ----------
  UI.drawTitle = function (items, sel) {
    var W = UI.W, H = UI.H;
    logo(W / 2, H * 0.2, Math.min(1, W / 900));
    text('Nine planets. Nine powers. One dragon.', W / 2, H * 0.2 + 100, 20, '#d8f0ff', 'center');
    var bw = 260, bh = 56;
    for (var i = 0; i < items.length; i++) button(items[i].id, items[i].label, W / 2 - bw / 2, H * 0.45 + i * 70, bw, bh, i === sel, i);
    var lines = 11, ch = 26 + lines * 19;
    controlsBox(14, H - ch - 10, 330, 12);
    if (W > 900) { var ch2 = 26 + KEYS2.length * 19; text('Two players? Share the keyboard!', W - 14 - 175, H - ch2 - 26, 14, '#d8f0ff', 'center'); controlsBox2(W - 14 - 350, H - ch2 - 10, 350, 12); }
    text('Sound: ' + (SC.audio.muted ? 'off' : 'on') + ' (M)', W - 16, H - 18, 15, '#fff', 'right');
  };

  UI.drawMode = function (sel) {
    var W = UI.W, H = UI.H, t = SC.G.realT;
    g.fillStyle = 'rgba(10,5,30,0.35)'; g.fillRect(0, 0, W, H);
    text('How do you want to play?', W / 2, 52, 40, '#ffe36a');
    var cards = [
      { title: 'Adventure', color: '#ffd23f', icon: 'star', lines: ['Do little tasks to earn powers.', 'Powers grow as you use them.', 'Find blocks to open portals.', 'Travel to nine planets!'] },
      { title: 'Free Play', color: '#7dffcf', icon: 'heart', lines: ["You can't get hurt.", 'Every power, fully grown.', 'Fly any time with G.', 'Every portal is open.'] },
      { title: 'Glide', color: '#9fd8ff', icon: 'wind', lines: ['Like Adventure, but...', 'Nobody can fly.', 'Everyone has a glider!', 'Jump off high places!'] }
    ];
    var n = cards.length, gap = 22, cw = Math.min(300, (W - 60 - gap * (n - 1)) / n), chh = Math.min(290, H - 300), x0 = W / 2 - (n * cw + (n - 1) * gap) / 2, y0 = 96;
    var fs = cw < 250 ? 16 : 18;
    for (var i = 0; i < n; i++) {
      var c = cards[i], x = x0 + i * (cw + gap), on = i === sel, yy = y0 - (on ? 8 + Math.sin(t * 5) * 3 : 0);
      UI.buttons.push({ id: 'modeCard', x: x, y: y0, w: cw, h: chh, idx: i });
      rr(x, yy, cw, chh, 22);
      g.fillStyle = on ? 'rgba(255,240,180,0.96)' : 'rgba(30,24,60,0.85)'; g.fill();
      g.lineWidth = on ? 6 : 3; g.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.35)'; g.stroke();
      SC.drawPowerIcon(g, c.icon, x + cw / 2, yy + 50, 24);
      text(c.title, x + cw / 2, yy + 100, 34, on ? '#3a1a00' : c.color, 'center', on ? false : undefined);
      for (var k = 0; k < c.lines.length; k++) text(c.lines[k], x + cw / 2, yy + 144 + k * 28, fs, on ? '#4a2a00' : '#fff', 'center', false, 'normal');
    }
    // one or two players (same keyboard)
    var np = SC.G.newPlayers || 1, py = y0 + chh + 24, bw = 190, bh = 50;
    text('How many players?', W / 2, py + 4, 22, '#ffe36a');
    for (var pk = 1; pk <= 2; pk++) {
      var bx = W / 2 + (pk === 1 ? -bw - 12 : 12), by = py + 22, onp = np === pk;
      UI.buttons.push({ id: 'players', x: bx, y: by, w: bw, h: bh, idx: pk });
      rr(bx, by, bw, bh, 25); g.fillStyle = onp ? 'rgba(255,240,180,0.96)' : 'rgba(30,24,60,0.85)'; g.fill();
      g.lineWidth = onp ? 5 : 2; g.strokeStyle = onp ? '#fff' : 'rgba(255,255,255,0.35)'; g.stroke();
      for (var f = 0; f < pk; f++) { var fx = bx + 30 + f * 22; g.beginPath(); g.arc(fx, by + 18, 8, 0, 7); g.arc(fx, by + 40, 12, Math.PI, 0); g.fillStyle = SC.PCOLOR[f]; g.fill(); }
      text(pk === 1 ? '1 player' : '2 players', bx + bw / 2 + 22, by + bh / 2 + 1, 22, onp ? '#3a1a00' : '#fff', 'center', onp ? false : undefined);
    }
    if (np === 2) text('Player 1: WASD + Space F R Shift Tab G.   Player 2: arrows + L K O ; I J (or the number pad).', W / 2, py + bh + 46, 15, '#ffffff', 'center');
    button('back', 'Back', 20, H - 58, 120, 40, false, -2);
    text('Left / right: mode.  Up / down: players.  Enter to pick', W - 20, H - 36, 15, '#fff', 'right');
  };

  UI.drawSelect = function (sel) {
    var W = UI.W, H = UI.H, G = SC.G, n = SC.HEROES.length;
    var st2 = G.selStage === 2, twoSel = (G.newPlayers || 1) === 2;
    text(st2 ? 'Player 2: who do you play?' : twoSel ? 'Player 1: who starts first?' : 'Who starts first?', W / 2, 34, 38, st2 ? SC.PCOLOR[1] : twoSel ? SC.PCOLOR[0] : '#ffe36a');
    text(twoSel ? 'All nine are one team. A hero can only be played by one player at a time.' : 'All nine are on your team. Switch any time with Tab or 1 - 9!', W / 2, 66, 17, '#fff');
    var hs = SC.HEROES[sel], pw = SC.powerById(hs.powers[0]);
    panel(W / 2 - 300, 84, 600, 64, 0.8);
    SC.drawPowerIcon(g, pw.id, W / 2 - 266, 116, 16);
    text(hs.name + ' ' + hs.title, W / 2 - 238, 102, 21, hs.color, 'left');
    text(hs.desc + '  Power: ' + pw.name + '.', W / 2 - 238, 130, 16, '#fff', 'left', false, 'normal');
    // 3 x 3 cards (fits a small window)
    var cols = 3, rows = Math.ceil(n / cols), gap = 10, cw = Math.min(250, (W - 60 - gap * (cols - 1)) / cols);
    var avail = H - 160 - 74, chh = Math.min(96, (avail - gap * (rows - 1)) / rows);
    var x0 = W / 2 - (cols * cw + (cols - 1) * gap) / 2, y0 = 160;
    for (var i = 0; i < n; i++) {
      var h = SC.HEROES[i], x = x0 + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (chh + gap), on = i === sel;
      UI.buttons.push({ id: 'hero', x: x, y: y, w: cw, h: chh, idx: i });
      rr(x, y, cw, chh, 14);
      g.fillStyle = on ? 'rgba(255,230,120,0.96)' : 'rgba(30,24,60,0.85)'; g.fill();
      g.lineWidth = on ? 5 : 2; g.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.35)'; g.stroke();
      heroBadge(x + 30, y + chh / 2, 20, h, st2 && h.id === G.p1Pick);
      if (st2 && h.id === G.p1Pick) { rr(x + cw - 46, y + 6, 40, 22, 11); g.fillStyle = SC.PCOLOR[0]; g.fill(); text('P1', x + cw - 26, y + 18, 14, '#3a1a00', 'center', false); }
      text((i + 1) + '  ' + h.name, x + 58, y + 20, 21, on ? '#3a1a00' : '#fff', 'left', on ? false : undefined);
      text(h.title, x + 58, y + 40, 13, on ? '#5a3a10' : '#d8d0ff', 'left', false);
      var pips = [['Speed', h.pips.speed], ['Sword', h.pips.sword], ['Hearts', h.pips.hearts], ['Magic', h.pips.magic]];
      if (chh >= 80) for (var k = 0; k < 4; k++) {
        var px = x + 58 + (k % 2) * ((cw - 66) / 2), py = y + 58 + Math.floor(k / 2) * 15;
        text(pips[k][0], px, py, 11, on ? '#3a1a00' : '#fff', 'left', false);
        for (var d = 0; d < 5; d++) {
          g.beginPath(); g.arc(px + 42 + d * 9, py, 3.3, 0, 7);
          g.fillStyle = d < pips[k][1] ? (on ? '#d0400a' : '#ffd23f') : (on ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'); g.fill();
        }
      }
    }
    if (G.newMode === 'free') text('FREE PLAY', W - 20, 34, 16, '#7dffcf', 'right');
    else if (G.newMode === 'glide') text('GLIDE', W - 20, 34, 16, '#9fd8ff', 'right');
    button('go', 'Play!', W / 2 - 100, H - 58, 200, 46, false, -1);
    button('back', 'Back', 20, H - 58, 120, 40, false, -2);
    text('Arrows or 1-9, Space to play', W - 20, H - 36, 15, '#fff', 'right');
  };
  // a round face badge: hero colour + their element symbol
  function heroBadge(x, y, r, h, dim) {
    g.save(); g.globalAlpha = dim ? 0.45 : 1;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = h.color; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#2a1050'; g.stroke();
    g.beginPath(); g.arc(x, y, r * 0.72, 0, 7); g.fillStyle = 'rgba(20,10,40,0.55)'; g.fill();
    SC.drawPowerIcon(g, h.powers[0], x, y, r * 0.45);
    g.restore();
  }
  UI.heroBadge = function (ctx, x, y, r, h, dim) { var o = g; g = ctx; heroBadge(x, y, r, h, dim); g = o; };
  UI.drawOverlayCard = function (title, lines, items, sel, color) {
    var W = UI.W, H = UI.H;
    lines = lines.filter(function (l) { return !!l; });
    g.fillStyle = 'rgba(10,5,30,0.55)'; g.fillRect(0, 0, W, H);
    var w = 560, h = 150 + lines.length * 32 + items.length * 66;
    var x = W / 2 - w / 2, y = H / 2 - h / 2;
    panel(x, y, w, h, 0.88, 22);
    text(title, W / 2, y + 52, 42, color || '#ffe36a');
    for (var i = 0; i < lines.length; i++) text(lines[i], W / 2, y + 108 + i * 32, 21, '#fff', 'center', false, 'normal');
    var by = y + 120 + lines.length * 32;
    for (var k = 0; k < items.length; k++) button(items[k].id, items[k].label, W / 2 - 130, by + k * 66, 260, 52, k === sel, k);
    return y + h;
  };
  UI.drawPause = function (items, sel, note) {
    var W = UI.W, H = UI.H;
    g.fillStyle = 'rgba(10,5,30,0.55)'; g.fillRect(0, 0, W, H);
    text('Paused', W / 2, H * 0.08, 50, '#ffe36a');
    var two = SC.G.players && SC.G.players.length > 1;
    var ch = two ? controlsBox2(W / 2 - 260, H * 0.14, 520, 14) : controlsBox(W / 2 - 240, H * 0.14, 480, 15), bh = items.length > 3 ? 40 : items.length > 2 ? 44 : 50, gap = items.length > 3 ? 46 : items.length > 2 ? 52 : 60, y0 = H * 0.14 + ch + 14;
    for (var k = 0; k < items.length; k++) button(items[k].id, items[k].label, W / 2 - 130, y0 + k * gap, 260, bh, k === sel, k);
    if (note) text(note, W / 2, y0 + items.length * gap + 8, 15, '#ffd0a0', 'center', false);
    text('Sound: ' + (SC.audio.muted ? 'off' : 'on') + ' (M)', W / 2, H - 16, 15, '#fff');
  };

  // ---------- which place on a planet? (after walking into a planet portal at the Home Base) ----------
  UI.drawPicker = function (pk, sel) {
    var G = SC.G, W = UI.W, H = UI.H, items = pk.items, pl = null;
    SC.PLANETS.forEach(function (p) { if (p.name === pk.planet) pl = p; });
    g.fillStyle = 'rgba(10,5,30,0.55)'; g.fillRect(0, 0, W, H);
    var w = 520, bh = 50, h = 150 + items.length * (bh + 12), x = W / 2 - w / 2, y = Math.max(10, H / 2 - h / 2);
    panel(x, y, w, h, 0.92, 22);
    if (pl) {
      var gr = g.createRadialGradient(x + 52, y + 44, 3, x + 56, y + 48, 26);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, pl.color); gr.addColorStop(1, '#1a1030');
      g.beginPath(); g.arc(x + 56, y + 48, 24, 0, 7); g.fillStyle = gr; g.fill();
    }
    text('Planet ' + pk.planet, x + 92, y + 46, 34, pl ? pl.color : '#ffe36a', 'left');
    text(pk.msg || '', W / 2, y + 96, 19, '#dff8ff', 'center', false, 'normal');
    for (var k = 0; k < items.length; k++) {
      var it = items[k], bx = x + 40, by = y + 124 + k * (bh + 12), bw = w - 80, on = k === sel;
      button(it.id, it.label, bx, by, bw, bh, on, k);
      var yy = by + (on ? Math.sin(G.realT * 6) * 2 : 0);
      if (!it.ok) {
        rr(bx, yy, bw, bh, bh / 2); g.fillStyle = 'rgba(20,10,40,0.5)'; g.fill();
        lockIcon(bx + 30, yy + bh / 2, 9);
      } else if (it.done) star(bx + 30, yy + bh / 2, 11, true);
      if (it.done) text('done', bx + bw - 22, yy + bh / 2 + 1, 14, on ? '#5a3a10' : '#ffe36a', 'right', false);
    }
    text('Arrows + Enter.  Esc to stay here.', W / 2, Math.min(H - 12, y + h + 18), 14, '#fff');
  };
  function lockIcon(x, y, s) {
    g.fillStyle = '#d8c070'; rr(x - s, y - s * 0.2, s * 2, s * 1.5, s * 0.3); g.fill();
    g.lineWidth = s * 0.35; g.strokeStyle = '#c8c8d8'; g.beginPath(); g.arc(x, y - s * 0.2, s * 0.65, Math.PI, 0); g.stroke();
    g.fillStyle = '#3a2a10'; g.fillRect(x - s * 0.12, y + s * 0.2, s * 0.24, s * 0.5);
  }
  UI.lockIcon = function (ctx, x, y, s) { var o = g; g = ctx; lockIcon(x, y, s); g = o; };

  // ---------- the shop (trader / blacksmith) ----------
  UI.drawShop = function (shop, items, sel) {
    var G = SC.G, W = UI.W, H = UI.H, smith = shop.role === 'smith';
    g.fillStyle = 'rgba(10,5,30,0.55)'; g.fillRect(0, 0, W, H);
    var w = 560, bh = 44, h = 168 + items.length * (bh + 8), x = W / 2 - w / 2, y = Math.max(10, H / 2 - h / 2);
    panel(x, y, w, h, 0.92, 22);
    SC.drawPowerIcon(g, smith ? 'sword' : 'star', x + 46, y + 42, 20);
    text(smith ? 'Blacksmith' : 'Trader', x + 80, y + 40, 34, smith ? '#ffd0a0' : '#ffe36a', 'left');
    gemIcon(x + w - 110, y + 40, 12); text(String(G.prog.gems), x + w - 92, y + 41, 24, '#fff', 'left');
    text(shop.msg || '', W / 2, y + 84, 19, '#dff8ff', 'center', false, 'normal');
    if (smith) {
      var sc = G.prog.swordCrest[G.hero.id];
      text(G.hero.name + "'s sword: " + (G.prog.swordLevel >= 2 ? 'Crystal' : G.prog.swordLevel >= 1 ? 'Iron' : 'Wood') + ' blade' + (sc ? ' + ' + SC.powerById(sc).name + ' crest' : ''), W / 2, y + 112, 17, '#ffe36a', 'center', false);
    } else text('Prices go up a little each time.', W / 2, y + 112, 15, '#c8c0e8', 'center', false, 'normal');
    for (var k = 0; k < items.length; k++) {
      var it = items[k], bx = x + 30, by = y + 136 + k * (bh + 8), bw = w - 60, on = k === sel;
      var label = it.label + (it.price > 0 ? '   ' + it.price + ' gems' : (it.id.indexOf('crest:') === 0 && it.power ? '   free' : ''));
      button(it.id, label, bx, by, bw, bh, on, k);
      if (!it.ok || (it.price > G.prog.gems)) { rr(bx, by + (on ? Math.sin(G.realT * 6) * 2 : 0), bw, bh, bh / 2); g.fillStyle = 'rgba(20,10,40,0.45)'; g.fill(); }
      if (it.power) SC.drawPowerIcon(g, it.power, bx + 26, by + bh / 2, 11);
      if (on && it.tip) text(it.tip, W / 2, y + h - 14, 15, '#c8ffe8', 'center', false, 'normal');
    }
    text('Arrows + Enter.  Esc to leave.', W / 2, Math.min(H - 12, y + h + 18), 14, '#fff');
  };

  // ---------- the trip between levels: a star map ----------
  UI.drawTravel = function (tr) {
    var W = UI.W, H = UI.H, t = tr.t, G = SC.G;
    var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a0624'); bg.addColorStop(1, '#22104a');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (var s = 0; s < 140; s++) {
      var sx = SC.hash(s, 3) * W, sy = SC.hash(s, 7) * H, tw = 0.5 + 0.5 * Math.sin(G.realT * 3 + s);
      g.fillStyle = 'rgba(255,255,255,' + (0.25 + tw * 0.6) + ')'; g.fillRect(sx, sy, 2, 2);
    }
    // the Home Base is a little floating island in the middle of the map, the nine planets sit around it in order
    // (1 on the left, over the top, 9 on the right) and Pyros below; tr.from / tr.to are level indexes or 'base'
    var HOME = { name: 'Home Base', r: 24, home: true }, cxm = W / 2, cym = H * 0.53, rxm = Math.min(W * 0.4, H * 0.78), rym = H * 0.33;
    SC.PLANETS.forEach(function (pl, i) {
      var ang = i < 9 ? Math.PI * 0.9 + i * Math.PI * 0.15 : Math.PI / 2;
      pl.sx = cxm + Math.cos(ang) * rxm; pl.sy = cym + Math.sin(ang) * rym + (i < 9 ? -18 : 0);
    });
    var from = tr.from === 'base' ? HOME : SC.planetOf(tr.from), to = tr.to === 'base' ? HOME : SC.planetOf(tr.to);
    function pos(pl) { return pl.home ? { x: cxm, y: cym + 10 } : { x: pl.sx, y: pl.sy }; }
    function isOpen(pl) { return !SC.portalInfo || !SC.G.prog || SC.portalInfo(pl.name).open; }
    var hq = pos(HOME);
    // dotted lines from the Home Base to every planet (bright when its portal is open)
    SC.PLANETS.forEach(function (pl) {
      var q = pos(pl), op = isOpen(pl), dx = q.x - hq.x, dy = q.y - hq.y, dl = Math.sqrt(dx * dx + dy * dy) || 1;
      g.setLineDash([6, 10]); g.lineWidth = 3; g.strokeStyle = op ? 'rgba(255,240,160,0.55)' : 'rgba(255,255,255,0.15)';
      g.beginPath(); g.moveTo(hq.x + dx / dl * 40, hq.y + dy / dl * 30); g.lineTo(q.x - dx / dl * pl.r, q.y - dy / dl * pl.r); g.stroke();
    });
    g.setLineDash([]);
    // the Home Base island with its ring of ten portals
    g.beginPath(); g.moveTo(hq.x - 34, hq.y - 4); g.lineTo(hq.x + 34, hq.y - 4); g.lineTo(hq.x, hq.y + 26); g.closePath(); g.fillStyle = '#6a6488'; g.fill();
    rr(hq.x - 38, hq.y - 12, 76, 12, 6); g.fillStyle = '#62c060'; g.fill();
    SC.PLANETS.forEach(function (pl, pk) {
      var ang = pk < 9 ? Math.PI + pk * Math.PI / 8 : Math.PI / 2, px = hq.x + Math.cos(ang) * 30, py = hq.y - 12 + Math.sin(ang) * 11;
      g.beginPath(); g.arc(px, py, 4, 0, 7); g.lineWidth = 2.5; g.strokeStyle = pl.color; g.stroke();
    });
    text('Home Base', hq.x, hq.y + 40, to === HOME ? 21 : 16, to === HOME ? '#ffe36a' : '#d8d0ff');
    SC.PLANETS.forEach(function (pl, pi) {
      var q = pos(pl), r = pl.r, op = isOpen(pl);
      g.save(); if (!op) g.globalAlpha = 0.45;
      var gr = g.createRadialGradient(q.x - r * 0.35, q.y - r * 0.35, r * 0.1, q.x, q.y, r);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, pl.color); gr.addColorStop(1, '#1a1030');
      g.beginPath(); g.arc(q.x, q.y, r, 0, 7); g.fillStyle = gr; g.fill();
      if (pl.ring) { g.save(); g.translate(q.x, q.y); g.rotate(-0.35); g.scale(1, 0.3); g.beginPath(); g.arc(0, 0, r * 1.5, 0, 7); g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,0.45)'; g.stroke(); g.restore(); }
      g.restore();
      if (!op) lockIcon(q.x, q.y, 10);
      else if (SC.G.prog && SC.planetLevels(pl.name).every(SC.isDone)) star(q.x + r * 0.75, q.y - r * 0.75, 9, true);
      var here = pl === to;
      text((pi < 9 ? (pi + 1) + ' ' : '') + pl.name, q.x, q.y + r + 16, here ? 21 : 16, here ? '#ffe36a' : '#d8d0ff');
      text(op ? 'open' : 'locked', q.x, q.y + r + 33, 12, op ? '#9ff0a0' : '#c8b8d8', 'center', false);
    });    // portal swirl at the start
    var a = pos(from), b = pos(to);
    for (var k = 0; k < 4; k++) {
      g.beginPath(); g.arc(a.x, a.y - from.r - 10, 10 + k * 4, G.realT * (3 + k) , G.realT * (3 + k) + 4);
      g.lineWidth = 4; g.strokeStyle = ['#9ff0ff', '#ffffff', '#b07aff', '#7dffcf'][k]; g.stroke();
    }
    // the hero flies along a curve
    var f = SC.ease(Math.min(1, t / 2.6)), hx, hy;
    if (from === to) { var ang = -Math.PI / 2 + f * Math.PI * 2; hx = a.x + Math.cos(ang) * (from.r + 26); hy = a.y + Math.sin(ang) * (from.r + 26); }
    else { var mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 60; hx = (1 - f) * (1 - f) * a.x + 2 * (1 - f) * f * mx + f * f * b.x; hy = (1 - f) * (1 - f) * (a.y - from.r) + 2 * (1 - f) * f * my + f * f * (b.y - to.r); }
    for (var tr2 = 1; tr2 < 8; tr2++) { g.globalAlpha = 0.5 - tr2 * 0.06; g.beginPath(); g.arc(hx - tr2 * 5 * (b.x >= a.x ? 1 : -1), hy + tr2 * 2, 8 - tr2 * 0.7, 0, 7); g.fillStyle = '#fff6a0'; g.fill(); }
    g.globalAlpha = 1;
    g.beginPath(); g.arc(hx, hy, 15, 0, 7); g.fillStyle = G.hero.color || '#fff'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
    text(G.hero.name.charAt(0), hx, hy + 1, 16, '#2a1050', 'center', false);
    if (to === HOME) {
      text('Back to Home Base!', W / 2, 34, 30, '#ffe36a');
      text(SC.G.prog && SC.G.prog.carried > 0 ? 'You bring ' + SC.G.prog.carried + ' portal block' + (SC.G.prog.carried === 1 ? '' : 's') + ' with you.' : 'Time for a rest at home.', W / 2, 66, 18, '#fff', 'center', false, 'normal');
    } else {
      var def = SC.LEVELS[tr.to];
      text(from === to ? 'Next stop on ' + to.name + ': ' + def.name + '!' : 'Through the portal to planet ' + to.name + '!', W / 2, 34, 30, '#ffe36a');
      text(from === to ? '' : to.name + ' is ' + to.desc + '. Next: ' + def.name, W / 2, 66, 18, '#fff', 'center', false, 'normal');
    }
    text('Space to skip', W - 16, H - 18, 15, '#fff', 'right');
  };

  // ---------- HUD ----------
  var tmpP = { x: 0, y: 0, vis: true };
  function proj3(x, h, y) { SC.gfx.project(x, h, y, tmpP); return tmpP.vis ? { x: tmpP.x / UI.u, y: tmpP.y / UI.u } : null; }
  function planetColor(name) { var c = '#ffffff'; SC.PLANETS.forEach(function (pl) { if (pl.name === name) c = pl.color; }); return c; }
  function blockIcon(x, y, s) {
    g.save(); g.translate(x, y); g.rotate(0.15);
    rr(-s, -s, 2 * s, 2 * s, s * 0.3); g.fillStyle = '#7fe8ff'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#0a3a50'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-s * 0.6, -s * 0.6, s * 0.5, s * 0.5);
    g.restore();
  }
  function star(x, y, s, on) {
    g.beginPath();
    for (var i = 0; i < 10; i++) { var ra = i % 2 ? s * 0.45 : s, aa = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(x + Math.cos(aa) * ra, y + Math.sin(aa) * ra); }
    g.closePath(); g.fillStyle = on ? '#ffe14a' : 'rgba(255,255,255,0.18)'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#2a1050'; g.stroke();
  }
  function pill(s, x, y, col) {
    g.font = 'bold 14px ' + FONT; var w = g.measureText(s).width + 16;
    rr(x - w / 2, y - 11, w, 22, 11); g.fillStyle = col; g.fill(); g.lineWidth = 2; g.strokeStyle = '#2a1050'; g.stroke();
    text(s, x, y + 1, 14, '#2a1050', 'center', false);
  }
  // a little "P1" / "P2" tag over each hero, and (Behind view) an arrow at the screen edge toward player 2
  function heroTags(G, t, two) {
    if (!two) return;
    G.players.forEach(function (pl, i) {
      var q = pl.p; if (q.dead) return;
      var hp0 = SC.gfx.project(q.x, (SC.gfx.getView() === 'behind' ? 1.45 : 2.25) + q.flyH + (q.gliding ? 0.5 : 0), q.y, { x: 0, y: 0 }), sx = hp0.x / UI.u, sy = hp0.y / UI.u;
      var off = !hp0.vis || sx < 10 || sy < 10 || sx > UI.W - 10 || sy > UI.H - 10;
      if (!off) { pill('P' + (i + 1), sx, sy + Math.sin(t * 4 + i) * 2, SC.PCOLOR[i]); return; }
      // off screen: an arrow at the edge pointing toward that player
      var c = SC.gfx.project(G.players[0].p.x, 1, G.players[0].p.y, { x: 0, y: 0 }), cx = UI.W / 2, cy = UI.H / 2;
      var dx = sx - cx, dy = sy - cy; if (!hp0.vis) { dx = -dx; dy = -dy; }
      var a = Math.atan2(dy, dx), ex = cx + Math.cos(a) * (UI.W / 2 - 40), ey = cy + Math.sin(a) * (UI.H / 2 - 40);
      ex = SC.clamp(ex, 60, UI.W - 60); ey = SC.clamp(ey, 90, UI.H - 170);
      g.save(); g.translate(ex, ey); g.rotate(a);
      g.beginPath(); g.moveTo(20, 0); g.lineTo(-10, -15); g.lineTo(-4, 0); g.lineTo(-10, 15); g.closePath();
      g.fillStyle = SC.PCOLOR[i]; g.fill(); g.lineWidth = 3; g.strokeStyle = '#2a1050'; g.stroke(); g.restore();
      pill('P' + (i + 1), ex - Math.cos(a) * 30, ey - Math.sin(a) * 30, SC.PCOLOR[i]);
      c = null;
    });
  }
  // player 2's own panel: hero, hearts, energy, power and super (bottom right corner)
  function drawP2Panel(pl, W, H, t) {
    var G = SC.G, q = pl.p, h = pl.hero, col = SC.PCOLOR[1], pw = 290, ph = 132, x = W - pw - 12, y = H - ph - 12;
    panel(x, y, pw, ph, 0.78, 16);
    g.lineWidth = 3; rr(x, y, pw, ph, 16); g.strokeStyle = col; g.stroke();
    pill('P2', x + 26, y + 20, col);
    heroBadge(x + 66, y + 22, 15, h, q.dead);
    text(h.name, x + 88, y + 21, 19, h.color || '#fff', 'left');
    if (q.dead && q.waiting) { text('Resting... a flag or Fern wakes a friend', x + pw / 2, y + 62, 14, '#d8d8ff', 'center', false); return; }
    var mx = SC.maxHp(h.id), hs = 17;
    for (var k = 0; k < mx; k++) { var f = q.hp >= k + 1 ? 1 : q.hp >= k + 0.5 ? 0.5 : 0; drawHeart(x + 22 + (k % 12) * (hs + 2), y + 50 + Math.floor(k / 12) * (hs + 1), hs, f); }
    var eY = y + 50 + Math.ceil(mx / 12) * (hs + 1) - 2, mE = SC.maxEnergy(h.id), ew = 150;
    rr(x + 12, eY, ew + 6, 12, 6); g.fillStyle = 'rgba(20,10,40,0.75)'; g.fill();
    rr(x + 15, eY + 2, Math.max(1, ew * (q.energy / mE)), 8, 4); g.fillStyle = '#5ab8ff'; g.fill();
    // the power slot (whatever this hero has picked) and the super
    var keep = G.pi || 0; SC.useCtx(1);
    var cur = SC.currentPowerId(), unl = SC.superUnlocked(h.id), scd = SC.superCd(h.id), ready = unl && scd <= 0;
    SC.useCtx(keep);
    var bx = x + pw - 104, by = y + 44, bs = 44;
    rr(bx, by, bs, bs, 10); g.fillStyle = cur ? 'rgba(40,30,80,0.9)' : 'rgba(30,30,40,0.6)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.4)'; g.stroke();
    if (cur) {
      SC.drawPowerIcon(g, cur, bx + bs / 2, by + bs / 2 - 3, 12);
      var cd = (q.powerCd[cur] || 0) / SC.powerCdMax(cur);
      if (cd > 0) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(bx + 2, by + 2 + (bs - 4) * (1 - cd), bs - 4, (bs - 4) * cd); }
      for (var s2 = 0; s2 < 3; s2++) star(bx + bs / 2 - 10 + s2 * 10, by + bs - 8, 4, s2 < SC.powerLevel(cur));
    } else { g.globalAlpha = 0.3; SC.drawPowerIcon(g, h.powers[0], bx + bs / 2, by + bs / 2, 12); g.globalAlpha = 1; }
    text('K', bx + 8, by + 9, 12, '#fff', 'center');
    var scx = x + pw - 30, scy = by + bs / 2, sr = 22;
    g.beginPath(); g.arc(scx, scy, sr, 0, 7); g.fillStyle = ready ? 'rgba(255,200,60,0.95)' : 'rgba(25,20,50,0.85)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = ready ? '#fff' : 'rgba(255,255,255,0.35)'; g.stroke();
    if (unl && !ready) { var fr2 = 1 - Math.min(1, scd / SC.superCdMax()); g.beginPath(); g.arc(scx, scy, sr - 4, -Math.PI / 2, -Math.PI / 2 + fr2 * Math.PI * 2); g.lineWidth = 5; g.strokeStyle = '#ffb83a'; g.stroke(); }
    else if (ready) { star(scx, scy - 3, 10, true); text('O', scx, scy + 13, 11, '#3a1a00', 'center', false); }
    else { g.fillStyle = '#c8c8d8'; rr(scx - 7, scy - 2, 14, 11, 2); g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#c8c8d8'; g.beginPath(); g.arc(scx, scy - 3, 5, Math.PI, 0); g.stroke(); }
    if (q.flying) text('Flying! L up, ; down, J land', x + pw / 2, y + ph - 12, 13, '#dfffe8', 'center', false);
    else if (q.gliding) text('Gliding!', x + pw / 2, y + ph - 12, 13, '#dfffe8', 'center', false);
    else text('Arrows, L sword, K power, I switch', x + pw / 2, y + ph - 12, 13, '#d8f0ff', 'center', false, 'normal');
  }
  UI.drawHUD = function () {
    var G = SC.G, p = G.player, W = UI.W, H = UI.H, t = G.realT, L = G.L, i, q;
    // world-space texts first (under the HUD)
    for (i = 0; i < G.texts.length; i++) {
      var tx = G.texts[i], f = tx.t / tx.dur;
      q = proj3(tx.x, tx.h + f * 0.9, tx.y); if (!q) continue;
      g.globalAlpha = Math.min(1, (1 - f) * 2.5);
      text(tx.text, q.x, q.y, (tx.big ? 30 : 22) * (f < 0.15 ? 0.6 + f / 0.15 * 0.4 : 1), tx.color);
      g.globalAlpha = 1;
    }
    for (var e = 0; e < G.enemies.length; e++) {
      var en = G.enemies[e];
      if (!en.alive || en.hidden) continue;
      var wind = en.state === 'windup' || en.state === 'chargeWind' || en.state === 'breathWind' || en.state === 'tailWind';
      if (wind && Math.abs(en.x - p.x) < 14 && Math.abs(en.y - p.y) < 10) {
        q = proj3(en.x, en.h + (en.isBoss ? (en.type === 'dragon' ? 4.2 : 2.2) : 1.0), en.y);
        if (q) text('!', q.x, q.y + Math.sin(t * 20) * 2, 30, '#ff3a3a', 'center', '#fff');
      }
      if (en.guardian && !en.aggro && Math.abs(en.x - p.x) < 14 && Math.abs(en.y - p.y) < 10) {   // a sleeping temple guardian
        q = proj3(en.x, en.h + 2.0, en.y);
        if (q) { var zz = (t * 0.8) % 1; g.globalAlpha = 1 - zz; text('Zzz', q.x + zz * 14, q.y - zz * 16, 18, '#d8d8ff', 'center', '#2a1050'); g.globalAlpha = 1; }
      }
      if (!en.isBoss && en.hp < en.maxHp && Math.abs(en.x - p.x) < 14 && Math.abs(en.y - p.y) < 10) {
        q = proj3(en.x, en.h + (en.def.big ? 1.45 : 0.95), en.y);
        if (q) {
          g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(q.x - 19, q.y - 1, 38, 6);
          g.fillStyle = '#ff5a5a'; g.fillRect(q.x - 18, q.y, 36 * Math.max(0, en.hp / en.maxHp), 4);
        }
      }
    }
    // crest task tags above crests
    for (i = 0; i < G.pickups.length; i++) {
      var k = G.pickups[i];
      if (k.kind !== 'crest' || Math.abs(k.x - p.x) > 16 || Math.abs(k.y - p.y) > 11) continue;
      q = proj3(k.x, 2.0, k.y); if (!q) continue;
      var pw = SC.powerById(k.power), owner = SC.heroById(pw.owner);
      var gEnt = k.temple && k.temple.ent && k.temple.ent.alive ? k.temple.ent : null;
      var s1 = !k.sealed ? 'Free! Pick it up for ' + owner.name : (k.trialDone && gEnt ? 'Beat ' + SC.guardianShort(gEnt) + ' to free it!' : SC.trialText(k.trial, true));
      g.font = 'bold 15px ' + FONT;
      var tw = g.measureText(s1).width + 28;
      panel(q.x - tw / 2, q.y - 30, tw, 46, 0.78, 12);
      text(pw.name + ' Crest' + (k.sealed ? ' (sealed)' : ''), q.x, q.y - 18, 13, pw.color, 'center', false);
      text(s1, q.x, q.y, 15, k.sealed ? '#fff' : '#ffe36a', 'center', false);
    }
    // friendly people: name tags (the 3D drawing comes from the world side)
    G.npcs.forEach(function (n) {
      if (Math.abs(n.x - p.x) > 16 || Math.abs(n.y - p.y) > 11) return;
      var smith = n.role === 'smith';
      if (!SC.gfx.npcsDrawn) {   // little stand-in marker on the ground when the world does not draw people
        var qb = proj3(n.x, 0.6, n.y);
        if (qb) { g.beginPath(); g.arc(qb.x, qb.y, 12, 0, 7); g.fillStyle = smith ? '#e0904a' : '#5ad06a'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke(); }
      }
      q = proj3(n.x, 2.2 + Math.sin(t * 3) * 0.05, n.y); if (!q) return;
      panel(q.x - 46, q.y - 13, 92, 26, 0.7, 13);
      text(smith ? 'Smith' : 'Trader', q.x + 8, q.y, 15, smith ? '#ffd0a0' : '#ffe36a', 'center', false);
      if (smith) SC.drawPowerIcon(g, 'sword', q.x - 32, q.y, 7); else gemIcon(q.x - 32, q.y, 7);
    });
    // Home Base: a status tag over each planet portal (the name is on the 3D board)
    var baseGoalT = L.isBase ? SC.goal() : null;
    (L.portals || []).forEach(function (po) {
      var pf = po.face || [0, 1], fx2 = po.tx + 0.5 + pf[0] * 2.1, fy2 = po.ty + 0.5 + pf[1] * 2.1;
      if (Math.abs(po.tx - p.x) > 18 || Math.abs(po.ty - p.y) > 14 || SC.dist(p.x, p.y, fx2, fy2) < 1.6) return;
      // ten portals: show the tags close by, and always the one the goal points at (so the screen stays tidy)
      if (SC.dist(p.x, p.y, fx2, fy2) > 8.5 && !(baseGoalT && baseGoalT.x === po.tx + 0.5 && baseGoalT.y === po.ty + 0.5)) return;
      q = proj3(fx2, 0.4, fy2); if (!q) return;   // on the ground in front: seen in both views
      var nx = SC.nextLockedPortal && SC.nextLockedPortal(), s2, col2, pnum = SC.PLANET_ORDER.indexOf(po.planet), pname = po.planet === 'Pyros' ? 'Dragon gate' : (pnum >= 0 ? (pnum + 1) + '. ' : '') + po.planet;
      if (po.open) { s2 = pname + ': open!'; col2 = '#9ff0a0'; }
      else if (nx && nx.planet === po.planet) { s2 = pname + ': needs ' + (po.need - po.fitted) + ' block' + (po.need - po.fitted === 1 ? '' : 's'); col2 = '#9ff0ff'; }
      else { s2 = pname + ': locked'; col2 = '#c8b8d8'; }
      g.font = 'bold 15px ' + FONT;
      var tw2 = g.measureText(s2).width + 26;
      panel(q.x - tw2 / 2, q.y - 13, tw2, 26, 0.75, 13);
      text(s2, q.x, q.y, 15, col2, 'center', false);
    });
    // crest temples: a name tag on the paved square in front of each one (seen in both views), with what to do there
    (L.temples || []).forEach(function (tp) {
      var dr = tp.door[1], gx = dr.tx + 0.5 - tp.f[0] * 3.3, gy = dr.ty + 0.5 - tp.f[1] * 3.3;
      if (Math.abs(gx - p.x) > 16 || Math.abs(gy - p.y) > 11 || SC.dist(p.x, p.y, gx, gy) < 1.3 || (SC.inTemple && SC.inTemple(tp, p.x, p.y))) return;
      q = proj3(gx, 0.35, gy); if (!q) return;
      var kc = null; for (var ki = 0; ki < G.pickups.length; ki++) if (G.pickups[ki].kind === 'crest' && G.pickups[ki].power === tp.power) kc = G.pickups[ki];
      var alive = tp.ent && tp.ent.alive, s3;
      if (!tp.open) s3 = kc && kc.trial ? SC.trialText(kc.trial, true) + ' to open' : 'Shut';
      else if (alive) s3 = kc ? 'Open! Beat ' + SC.guardianShort(tp.ent) + '!' : 'Open! A guardian waits inside';
      else s3 = kc ? 'The crest is free!' : 'Guardian beaten!';
      var tc = SC.powerById(tp.power).color;
      g.font = 'bold 15px ' + FONT;
      var tw3 = Math.max(g.measureText(s3).width, 120) + 40;
      panel(q.x - tw3 / 2, q.y - 30, tw3, 46, 0.8, 12);
      SC.drawPowerIcon(g, tp.power, q.x - tw3 / 2 + 16, q.y - 7, 9);
      text(tp.name, q.x + 8, q.y - 18, 15, tc, 'center', false);
      text(s3, q.x + 8, q.y, 14, tp.open ? '#ffe36a' : '#fff', 'center', false);
    });
    // compass arrow around the hero
    var goal = SC.goal();
    if (goal.x !== undefined && !p.dead) {
      var gd = SC.dist(p.x, p.y, goal.x, goal.y);
      if (gd > 2.5) {
        var a3 = Math.atan2(goal.y - p.y, goal.x - p.x);
        var hp0 = SC.gfx.project(p.x, 0.6 + p.flyH, p.y, { x: 0, y: 0 });
        var hp1 = SC.gfx.project(p.x + Math.cos(a3), 0.6 + p.flyH, p.y + Math.sin(a3), { x: 0, y: 0 });
        var sa = Math.atan2(hp1.y - hp0.y, hp1.x - hp0.x);
        var rad = 62 + Math.sin(t * 5) * 5;
        var ax = hp0.x / UI.u + Math.cos(sa) * rad, ay = hp0.y / UI.u + Math.sin(sa) * rad;
        g.save(); g.translate(ax, ay); g.rotate(sa);
        g.beginPath(); g.moveTo(16, 0); g.lineTo(-8, -12); g.lineTo(-3, 0); g.lineTo(-8, 12); g.closePath();
        g.fillStyle = goal.color || '#ffe14a'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#2a1050'; g.stroke();
        g.restore();
      }
    }
    // ---- active hero: name, hearts, energy, gems, sword ----
    text(G.hero.name, 16, 18, 18, G.hero.color || '#fff', 'left');
    // extra lives: a golden heart with a count
    var lvX = 30 + g.measureText(G.hero.name).width + 18, nLives = G.prog.lives || 0;
    heartPath(lvX, 18, 18); g.fillStyle = nLives ? '#ffd23f' : '#6a5a40'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#5a3a00'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(lvX - 12, 15, 6, 3, -0.4, 0, 7); g.ellipse(lvX + 12, 15, 6, 3, 0.4, 0, 7); g.fill();
    text('x' + nLives, lvX + 20, 19, 16, nLives ? '#ffe36a' : '#aaa', 'left');
    if (G.players && G.players.length > 1) pill('P1', lvX + 62, 18, SC.PCOLOR[0]);
    var maxH = SC.maxHp(), per = 10, hs = 26;
    for (var hk = 0; hk < maxH; hk++) {
      var fill = p.hp >= hk + 1 ? 1 : p.hp >= hk + 0.5 ? 0.5 : 0;
      var pulse = (p.hp <= 1.5 && fill > 0) ? 1 + Math.sin(t * 10) * 0.08 : 1;
      drawHeart(26 + (hk % per) * (hs + 3), 44 + Math.floor(hk / per) * (hs + 2), hs * pulse, fill);
    }
    var yb = 44 + Math.ceil(maxH / per) * (hs + 2) - 6;
    var mE = SC.maxEnergy(), ew = 190 * (mE / 100);
    rr(14, yb, ew + 6, 16, 8); g.fillStyle = 'rgba(20,10,40,0.75)'; g.fill();
    rr(17, yb + 3, Math.max(1, ew * (p.energy / mE)), 10, 5); var eg = g.createLinearGradient(0, yb, 0, yb + 13); eg.addColorStop(0, '#9fe8ff'); eg.addColorStop(1, '#2f8cff'); g.fillStyle = eg; g.fill();
    text('Energy', 22 + ew + 6, yb + 8, 13, '#bfe8ff', 'left');
    gemIcon(26, yb + 32, 10);
    text(String(G.prog.gems), 42, yb + 33, 20, '#fff', 'left');
    var swx = 42 + g.measureText(String(G.prog.gems)).width + 22;
    SC.drawPowerIcon(g, 'sword', swx, yb + 33, 10);
    var crestIn = SC.swordCrestOf(G.hero.id);
    text(G.prog.swordLevel >= 2 ? 'Crystal' : G.prog.swordLevel >= 1 ? 'Iron' : 'Wood', swx + 14, yb + 33, 14, G.prog.swordLevel >= 2 ? '#8ff8ff' : '#eaf4ff', 'left');
    if (crestIn) SC.drawPowerIcon(g, crestIn, swx + 14 + g.measureText(G.prog.swordLevel >= 2 ? 'Crystal' : G.prog.swordLevel >= 1 ? 'Iron' : 'Wood').width + 14, yb + 33, 8);
    // ---- team portraits: 3 x 3 small cards (click, Tab or 1-9 to switch) ----
    UI.portraits.length = 0;
    var py0 = yb + 50, pcw = 68, pch = 40;
    G.team.forEach(function (m, idx) {
      var h = SC.heroById(m.id), on = m.id === G.hero.id, x = 10 + (idx % 3) * (pcw + 3), y = py0 + Math.floor(idx / 3) * (pch + 3);
      var hp = on ? p.hp : m.hp, mx = SC.maxHp(m.id);
      UI.portraits.push({ id: m.id, x: x, y: y, w: pcw, h: pch });
      rr(x, y, pcw, pch, 10); g.fillStyle = on ? 'rgba(255,230,120,0.92)' : 'rgba(25,20,50,0.72)'; g.fill();
      g.lineWidth = on ? 3 : 1.5; g.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.3)'; g.stroke();
      heroBadge(x + 16, y + 16, 12, h, m.out);
      var other = G.players && G.players.length > 1 && G.players[1].hero.id === m.id && !G.players[1].p.waiting;   // player 2 has this hero
      if (other) { rr(x, y, pcw, pch, 10); g.lineWidth = 3; g.strokeStyle = SC.PCOLOR[1]; g.stroke(); text('P2', x + 52, y + 11, 11, SC.PCOLOR[1], 'center'); }
      text(String(idx + 1), x + 36, y + 11, 12, on ? '#3a1a00' : '#fff', 'left', false);
      if (m.out) text('Zzz', x + 50, y + 16, 12, '#c8c8ff', 'center', false);
      else if (SC.superReady(m.id)) star(x + 58, y + 10, 5, true);
      // little hearts bar
      var bw2 = pcw - 10;
      rr(x + 5, y + pch - 9, bw2, 5, 2.5); g.fillStyle = 'rgba(20,10,40,0.85)'; g.fill();
      if (hp > 0) { rr(x + 5, y + pch - 9, Math.max(4, bw2 * hp / mx), 5, 2.5); g.fillStyle = hp / mx < 0.34 ? '#ff7a5a' : '#ff3a5a'; g.fill(); }
      heartPath(x + 44, y + 24, 9); g.fillStyle = '#ff3a5a'; g.fill();
      text(String(Math.ceil(hp)), x + 52, y + 25, 11, on ? '#3a1a00' : '#fff', 'left', false);
    });
    text('Tab or 1-9: switch hero', 14, py0 + 3 * (pch + 3) + 6, 13, '#fff', 'left');    // ---- level, planet and goal ----
    text(L.isBase ? 'Home Base' : 'Planet ' + SC.planetOf(L.index).name + '  -  ' + L.def.name, W / 2, 20, 18, '#ffe36a');
    text(goal.text, W / 2, 46, 24, '#fff');
    // boss bar
    var b = G.boss;
    if (b && (b.alive || G.dragonDeadT > 0) && b.aggro) {
      var bw = Math.min(520, W - 520), bx2 = W / 2 - bw / 2, by2 = 72;
      text(b.def.name + (b.type === 'dragon' ? '  (part ' + b.phase + ' of 3)' : ''), W / 2, by2 + 2, 19, '#ffb0a0');
      rr(bx2, by2 + 14, bw, 18, 9); g.fillStyle = 'rgba(20,10,40,0.85)'; g.fill();
      var fr = Math.max(0, b.hp / b.maxHp);
      if (fr > 0) { rr(bx2 + 3, by2 + 17, (bw - 6) * fr, 12, 6); g.fillStyle = b.type === 'dragon' ? '#ff5a2a' : '#ff3a7a'; g.fill(); }
      if (b.type === 'dragon') { g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(bx2 + bw / 3, by2 + 15, 2, 16); g.fillRect(bx2 + bw * 2 / 3, by2 + 15, 2, 16); }
    }
    // ---- minimap, blocks, mode tag ----
    var mm = SC.gfx.minimap, rightY = 12;
    if (mm) {
      if (SC.gfx.minimapDirty) SC.gfx.buildMinimap(L);
      var ms = Math.min(190 / mm.width, 130 / mm.height), mw = mm.width * ms, mh = mm.height * ms, mx2 = W - mw - 14, my = 12;
      g.fillStyle = 'rgba(20,10,40,0.6)'; g.fillRect(mx2 - 4, my - 4, mw + 8, mh + 8);
      g.globalAlpha = 0.9; g.drawImage(mm, mx2, my, mw, mh); g.globalAlpha = 1;
      var sc2 = mw / L.w;
      for (var c = 0; c < G.pickups.length; c++) {
        var pk = G.pickups[c];
        if (pk.kind === 'crest') { g.fillStyle = pk.sealed ? '#ffb84a' : '#ffd23f'; g.fillRect(mx2 + pk.x * sc2 - 3, my + pk.y * sc2 - 3, 6, 6); }
        else if (pk.kind === 'block') { g.fillStyle = '#7fe8ff'; g.fillRect(mx2 + pk.x * sc2 - 2.5, my + pk.y * sc2 - 2.5, 5, 5); }
      }
      G.npcs.forEach(function (n) { g.fillStyle = n.role === 'smith' ? '#ffb070' : '#7dff8a'; g.beginPath(); g.arc(mx2 + n.x * sc2, my + n.y * sc2, 3, 0, 7); g.fill(); });
      if (G.bossEnt && G.bossEnt.alive) { g.fillStyle = '#ff3a3a'; g.beginPath(); g.arc(mx2 + G.bossEnt.x * sc2, my + G.bossEnt.y * sc2, 4, 0, 7); g.fill(); }
      if (L.gate) { g.fillStyle = L.gateOpen ? '#9ff0ff' : '#ffffff'; g.fillRect(mx2 + L.gate.tx * sc2 - 1, my + L.gate.ty * sc2 - 1, sc2 + 2, sc2 + 2); }
      (L.portals || []).forEach(function (po) {
        var px2 = mx2 + (po.tx + 0.5) * sc2, py2 = my + (po.ty + 0.5) * sc2;
        g.beginPath(); g.arc(px2, py2, 5.5, 0, 7); g.fillStyle = '#2a1050'; g.fill();
        g.beginPath(); g.arc(px2, py2, 4, 0, 7); g.fillStyle = planetColor(po.planet); g.fill();
        if (!po.open) { g.fillStyle = 'rgba(20,10,40,0.6)'; g.beginPath(); g.arc(px2, py2, 4, 0, 7); g.fill(); }
      });
      g.fillStyle = '#fff'; g.beginPath(); g.arc(mx2 + p.x * sc2, my + p.y * sc2, 4.5, 0, 7); g.fill();
      g.fillStyle = '#ff3a5a'; g.beginPath(); g.arc(mx2 + p.x * sc2, my + p.y * sc2, 3, 0, 7); g.fill();
      rightY = my + mh + 22;
    }
    if (L.isBase && !SC.isFree()) {
      // at the Home Base: blocks carried, and how full the next locked planet portal is
      var nxp = SC.nextLockedPortal(), carriedN = G.prog.carried || 0;
      if (carriedN > 0 || nxp) {
        panel(W - 200, rightY - 14, 186, nxp ? 50 : 30, 0.7, 15);
        blockIcon(W - 180, rightY + 1, 8);
        text('Carrying ' + carriedN, W - 164, rightY + 1, 17, carriedN ? '#9ff0ff' : '#fff', 'left', false);
        if (nxp) text(nxp.planet + ' portal: ' + nxp.fitted + '/' + nxp.need, W - 107, rightY + 22, 14, '#ffe36a', 'center', false);
        if (L.fitT > 0) { g.fillStyle = '#9ff0ff'; g.fillRect(W - 196, rightY + 32, 178 * Math.min(1, L.fitT), 3); }
        rightY += nxp ? 56 : 36;
      }
    } else if (L.portalNeed > 0 && !L.replay) {
      var have = L.blocksGot || 0;
      panel(W - 180, rightY - 14, 166, 30, 0.7, 15);
      blockIcon(W - 160, rightY + 1, 8);
      text('Blocks ' + have + '/' + L.portalNeed, W - 144, rightY + 1, 17, L.gateOpen || have >= L.portalNeed ? '#9ff0ff' : '#fff', 'left', false);
      rightY += 36;
    } else if (L.replay) {
      panel(W - 180, rightY - 14, 166, 30, 0.7, 15);
      star(W - 160, rightY + 1, 9, true);
      text('Done! Play for fun', W - 146, rightY + 1, 15, '#ffe36a', 'left', false);
      rightY += 36;
    }
    if (SC.isFree()) {
      rr(W - 120, rightY - 12, 106, 26, 13); g.fillStyle = '#2ad8a0'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
      text('FREE PLAY', W - 67, rightY + 1, 15, '#fff', 'center', '#0a4a30');
      rightY += 32;
    } else if (SC.glideMode && SC.glideMode()) {
      rr(W - 120, rightY - 12, 106, 26, 13); g.fillStyle = '#3a9ae8'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
      text('GLIDE', W - 67, rightY + 1, 15, '#fff', 'center', '#0a2a50');
      rightY += 32;
    }
    // ---- power slots of the active hero ----
    var plist = G.hero.powers, n = plist.length, sw = 62, gap = 10, sx0 = W / 2 - (n * sw + (n - 1) * gap) / 2 - 40, sy0 = H - sw - 22;
    UI.slots.length = 0;
    var curId = SC.currentPowerId();
    if (curId) { var cp = SC.powerById(curId); text(cp.name + '  Lv ' + SC.powerLevel(curId) + '  (F)', sx0 + (n * sw + (n - 1) * gap) / 2 - 30, sy0 - 18, 18, cp.color); }
    else text(G.hero.name + ' has no powers yet', sx0 + (n * sw + (n - 1) * gap) / 2 - 30, sy0 - 18, 16, '#fff');
    for (var s = 0; s < n; s++) {
      var pid = plist[s], pwr = SC.powerById(pid), x = sx0 + s * (sw + gap), has = SC.canUse(pid), on = pid === curId;
      UI.slots.push({ x: x, y: sy0, w: sw, h: sw });
      var yy = sy0 - (on ? 6 : 0);
      rr(x, yy, sw, sw, 12);
      g.fillStyle = on ? 'rgba(255,240,170,0.95)' : has ? 'rgba(40,30,80,0.82)' : 'rgba(30,30,40,0.6)'; g.fill();
      g.lineWidth = on ? 4 : 2; g.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.3)'; g.stroke();
      if (has) {
        SC.drawPowerIcon(g, pid, x + sw / 2, yy + sw / 2 - 5, sw * 0.27);
        var cdm = SC.powerCdMax(pid), cd = (p.powerCd[pid] || 0) / cdm;
        if (cd > 0) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x + 2, yy + 2 + (sw - 4) * (1 - cd), sw - 4, (sw - 4) * cd); }
        if (p.energy < pwr.cost) { g.fillStyle = 'rgba(0,0,40,0.35)'; rr(x, yy, sw, sw, 12); g.fill(); }
        var lvn = SC.powerLevel(pid);
        for (var st = 0; st < 3; st++) star(x + sw / 2 - 14 + st * 14, yy + sw - 11, 6, st < lvn);
        // bar to the next evolution
        rr(x + 4, yy + sw + 3, sw - 8, 5, 2.5); g.fillStyle = 'rgba(20,10,40,0.8)'; g.fill();
        var xf = SC.powerXpFrac(pid);
        if (xf > 0) { rr(x + 4, yy + sw + 3, Math.max(5, (sw - 8) * xf), 5, 2.5); g.fillStyle = lvn >= 3 ? '#ffe14a' : '#7dff8a'; g.fill(); }
      } else {
        g.globalAlpha = 0.25; SC.drawPowerIcon(g, pid, x + sw / 2, yy + sw / 2, sw * 0.27); g.globalAlpha = 1;
        g.fillStyle = '#c8c8d8'; rr(x + sw / 2 - 9, yy + sw / 2 - 2, 18, 14, 3); g.fill();
        g.lineWidth = 3; g.strokeStyle = '#c8c8d8'; g.beginPath(); g.arc(x + sw / 2, yy + sw / 2 - 3, 6, Math.PI, 0); g.stroke();
      }
      text('F', x + 9, yy + 10, 14, on ? '#3a1a00' : '#fff', 'center', on ? false : undefined);
    }
    // ---- super meter (round) ----
    var scx = sx0 + n * (sw + gap) + 34, scy = sy0 + sw / 2, sr = 30, unl = SC.superUnlocked(G.hero.id), scd = SC.superCd(G.hero.id), smax = SC.superCdMax();
    UI.superBtn = { x: scx - sr, y: scy - sr, w: sr * 2, h: sr * 2 };
    var ready = unl && scd <= 0;
    g.beginPath(); g.arc(scx, scy, sr, 0, 7); g.fillStyle = ready ? 'rgba(255,200,60,0.95)' : 'rgba(25,20,50,0.85)'; g.fill();
    g.lineWidth = 3; g.strokeStyle = ready ? '#fff' : 'rgba(255,255,255,0.35)'; g.stroke();
    if (unl && !ready) {
      var fr2 = 1 - Math.min(1, scd / smax);
      g.beginPath(); g.arc(scx, scy, sr - 5, -Math.PI / 2, -Math.PI / 2 + fr2 * Math.PI * 2); g.lineWidth = 7; g.strokeStyle = '#ffb83a'; g.stroke();
      text(String(Math.ceil(scd)), scx, scy + 1, 20, '#fff');
    } else if (ready) {
      var pul = 1 + Math.sin(t * 6) * 0.08;
      g.save(); g.translate(scx, scy); g.scale(pul, pul); star(0, -4, 13, true); g.restore();
      text('R', scx, scy + 18, 13, '#3a1a00', 'center', false);
    } else {
      g.fillStyle = '#c8c8d8'; rr(scx - 9, scy - 2, 18, 14, 3); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#c8c8d8'; g.beginPath(); g.arc(scx, scy - 3, 6, Math.PI, 0); g.stroke();
    }
    text('Super', scx, scy - sr - 9, 13, ready ? '#ffe36a' : '#fff');
    if (G.superPing && t - G.superPing < 1) { var pf = (t - G.superPing); g.beginPath(); g.arc(scx, scy, sr + pf * 40, 0, 7); g.lineWidth = 4; g.strokeStyle = 'rgba(255,230,120,' + (1 - pf) + ')'; g.stroke(); }
    // ---- flight bar ----
    if (p.flying && !SC.isFree() && p.flyMax > 0) {
      var fw = 200, fx = W / 2 - fw / 2, fy = sy0 - 52;
      rr(fx, fy, fw, 14, 7); g.fillStyle = 'rgba(20,10,40,0.8)'; g.fill();
      rr(fx + 2, fy + 2, Math.max(4, (fw - 4) * (p.flyT / p.flyMax)), 10, 5); g.fillStyle = p.flyT < 1.6 ? '#ff9a5a' : '#a8f0c8'; g.fill();
      text('Wind Ride', W / 2, fy - 10, 15, '#dfffe8');
    } else if (p.flying) text('Flying!  Hold Space to go up, Shift to go down, G to land', W / 2, sy0 - 46, 15, '#dfffe8');
    else if (p.gliding) text(p.glideStrong ? 'Super glide! Steer with the arrows' : 'Gliding! Steer where you want to land', W / 2, sy0 - 46, 15, '#dfffe8');
    // ---- flying: how high (feature: Space up / Shift down) ----
    if (p.flying) {
      var hx0 = sx0 + n * (sw + gap) + 80, hy1 = sy0 + sw, hh = 76, hy0 = hy1 - hh, fr3 = SC.clamp((SC.world.heightAt(p.x, p.y) + p.flyH) / SC.FLY_CEIL, 0, 1);
      rr(hx0, hy0, 16, hh, 8); g.fillStyle = 'rgba(20,10,40,0.75)'; g.fill();
      rr(hx0 + 3, hy1 - 3 - (hh - 6) * fr3, 10, Math.max(6, (hh - 6) * fr3), 5); g.fillStyle = '#bff5ff'; g.fill();
      text('Up', hx0 + 8, hy0 - 10, 12, '#dfffe8');
    }
    // ---- two players: player 2's panel (bottom right), P1 / P2 tags ----
    var two = G.players && G.players.length > 1;
    if (two) drawP2Panel(G.players[1], W, H, t);
    if (two || G.players && G.players.length) heroTags(G, t, two);
    if (two && p.dead && p.waiting) text('Player 1 is resting. A flag, the trader or Fern can wake a friend!', W / 2, H - 120, 17, SC.PCOLOR[0], 'center');
    // ---- talk prompt ----
    if (G.nearNpc && G.screen === 'play') {
      var msg = (two ? 'Player ' + ((G.nearNpcPi || 0) + 1) + ': ' : '') + (G.nearNpc.role === 'smith' ? 'Press Enter to upgrade your sword' : 'Press Enter to trade');
      g.font = 'bold 22px ' + FONT; var mw2 = g.measureText(msg).width + 40;
      panel(W / 2 - mw2 / 2, H - 250, mw2, 40, 0.85, 20);
      text(msg, W / 2, H - 230, 22, '#ffe36a', 'center', false);
    }
    // toasts
    for (var tq = 0; tq < G.toasts.length; tq++) {
      var to = G.toasts[tq], al = Math.min(1, to.t * 2, to.age * 5);
      g.globalAlpha = al;
      g.font = 'bold 22px ' + FONT;
      var tw2 = g.measureText(to.text).width + 40;
      panel(W / 2 - tw2 / 2, H - 196 - tq * 48, tw2, 42, 0.78, 21);
      text(to.text, W / 2, H - 196 - tq * 48 + 22, 22, '#fff', 'center', false);
      g.globalAlpha = 1;
    }
    // banner
    var bn = G.banner;
    if (bn) {
      var bf = bn.t / bn.dur, pop = bn.t < 0.25 ? SC.ease(bn.t / 0.25) : 1, fade = bf > 0.85 ? (1 - bf) / 0.15 : 1;
      g.save(); g.globalAlpha = Math.max(0, fade);
      g.translate(W / 2, Math.max(190, H * 0.3)); g.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
      g.font = 'bold 22px ' + FONT;
      var bw3 = Math.max(480, g.measureText(bn.sub).width + 80);
      g.font = 'bold 38px ' + FONT;
      bw3 = Math.max(bw3, g.measureText(bn.title).width + (bn.icon ? 160 : 60));
      panel(-bw3 / 2, -70, bw3, 140, 0.88, 26);
      for (var r = 0; r < 12; r++) { var ra = r / 12 * Math.PI * 2 + t; g.fillStyle = 'rgba(255,230,120,0.5)'; g.beginPath(); g.arc(Math.cos(ra) * (bw3 / 2 + 6), Math.sin(ra) * 76, 4, 0, 7); g.fill(); }
      if (bn.icon) SC.drawPowerIcon(g, bn.icon, -bw3 / 2 + 60, -14, 30);
      text(bn.title, bn.icon ? 30 : 0, -22, 38, '#ffe36a');
      text(bn.sub, 0, 32, 22, '#fff', 'center', false);
      g.restore();
    }
    // screen flash
    if (G.flash && G.flash.t > 0) {
      var fc = new THREE.Color(G.flash.color);
      g.fillStyle = 'rgba(' + Math.round(fc.r * 255) + ',' + Math.round(fc.g * 255) + ',' + Math.round(fc.b * 255) + ',' + (0.35 * G.flash.t / G.flash.dur) + ')';
      g.fillRect(0, 0, W, H);
    }
    if (p.hp <= 1 && !p.dead) { g.fillStyle = 'rgba(255,0,40,' + (0.08 + Math.sin(t * 6) * 0.05) + ')'; g.fillRect(0, 0, W, 8); g.fillRect(0, H - 8, W, 8); }
    if (SC.audio.muted) text('Sound off (M)', W - 14, H - 14, 13, '#fff', 'right');
  };
})();
