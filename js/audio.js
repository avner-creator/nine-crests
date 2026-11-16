// Nine Crests - all sound is made here with WebAudio (no sound files). Little sound effects + one looping tune per level.
(function () {
  'use strict';
  var SC = window.SC;
  var A = SC.audio = { muted: !!SC.store.get('muted') };
  var ctx = null, master = null, sfx = null, mus = null, noiseBuf = null;
  var lastPlayed = {};
  var VOL = 0.55;

  A.unlock = function () {
    if (SC.testMode) return;
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = A.muted ? 0 : VOL; master.connect(ctx.destination);
        sfx = ctx.createGain(); sfx.gain.value = 0.8; sfx.connect(master);
        mus = ctx.createGain(); mus.gain.value = 0.16; mus.connect(master);
        var len = ctx.sampleRate;
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        musicNext = ctx.currentTime + 0.1;
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
  };
  A.toggleMute = function () {
    A.muted = !A.muted;
    SC.store.set('muted', A.muted);
    if (master) master.gain.setTargetAtTime(A.muted ? 0 : VOL, ctx.currentTime, 0.03);
    return A.muted;
  };

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function tone(f, dur, type, vol, f2, delay, dest) {
    var t = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfx);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, ftype, f, f2, delay) {
    var t = ctx.currentTime + (delay || 0);
    var s = ctx.createBufferSource(); s.buffer = noiseBuf;
    var fl = ctx.createBiquadFilter(); fl.type = ftype || 'lowpass';
    fl.frequency.setValueAtTime(f || 1000, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }
  function arp(notes, step, type, vol, len) {
    for (var i = 0; i < notes.length; i++) tone(mtof(notes[i]), len || 0.18, type || 'square', vol || 0.12, 0, i * step);
  }

  var S = {
    swing: function () { noise(0.13, 0.22, 'bandpass', 2400, 700); },
    hit: function () { tone(320, 0.09, 'square', 0.14, 120); noise(0.06, 0.18, 'lowpass', 2500); },
    block: function () { tone(1200, 0.12, 'triangle', 0.14, 900); tone(1800, 0.08, 'square', 0.05); },
    poof: function () { noise(0.3, 0.25, 'lowpass', 1800, 200); tone(600, 0.15, 'sine', 0.08, 1200, 0.05); },
    gem: function () { tone(1320, 0.08, 'square', 0.07); tone(1760, 0.12, 'square', 0.07, 0, 0.06); },
    heart: function () { arp([72, 76, 79], 0.06, 'triangle', 0.16); },
    crest: function () { arp([60, 64, 67, 72, 76, 79, 84], 0.08, 'square', 0.11, 0.3); arp([48, 55, 60], 0.24, 'triangle', 0.18, 0.5); },
    chest: function () { arp([67, 71, 74, 79], 0.07, 'triangle', 0.18); },
    gate: function () { arp([55, 62, 67, 74, 79], 0.1, 'sawtooth', 0.06, 0.4); },
    hurt: function () { tone(400, 0.25, 'sawtooth', 0.14, 110); },
    dash: function () { noise(0.18, 0.18, 'highpass', 800, 3000); },
    fire: function () { noise(0.35, 0.25, 'lowpass', 900, 200); tone(140, 0.25, 'sawtooth', 0.08, 60); },
    boom: function () { noise(0.45, 0.35, 'lowpass', 700, 80); tone(90, 0.35, 'sine', 0.25, 40); },
    water: function () { noise(0.5, 0.25, 'bandpass', 500, 2400); },
    ice: function () { tone(2000, 0.2, 'sine', 0.08, 3000); tone(2600, 0.25, 'sine', 0.06, 0, 0.05); tone(3100, 0.2, 'triangle', 0.05, 0, 0.1); },
    zap: function () { for (var i = 0; i < 4; i++) tone(200 + Math.random() * 900, 0.06, 'sawtooth', 0.09, 60, i * 0.035); noise(0.2, 0.15, 'highpass', 3000); },
    life: function () { arp([60, 64, 67, 72, 76], 0.06, 'sine', 0.16, 0.4); },
    death: function () { tone(220, 0.6, 'triangle', 0.18, 70); tone(233, 0.6, 'sine', 0.1, 75); },
    bubble: function () { tone(400, 0.12, 'sine', 0.15, 1200); tone(700, 0.1, 'sine', 0.08, 1600, 0.07); },
    pop: function () { tone(900, 0.07, 'sine', 0.18, 250); noise(0.08, 0.12, 'highpass', 2000); },
    earth: function () { noise(0.5, 0.4, 'lowpass', 300, 60); tone(70, 0.4, 'square', 0.12, 40); },
    crack: function () { noise(0.35, 0.4, 'lowpass', 1200, 100); tone(110, 0.3, 'square', 0.12, 50); },
    wind: function () { noise(0.7, 0.22, 'bandpass', 400, 1600); noise(0.5, 0.12, 'bandpass', 1200, 500, 0.15); },
    burn: function () { noise(0.6, 0.2, 'bandpass', 800, 300); },
    cut: function () { noise(0.12, 0.2, 'highpass', 1500, 4000); },
    nope: function () { tone(180, 0.12, 'square', 0.08); tone(150, 0.14, 'square', 0.08, 0, 0.1); },
    select: function () { tone(880, 0.07, 'square', 0.08); },
    confirm: function () { arp([72, 79], 0.07, 'square', 0.1); },
    checkpoint: function () { arp([67, 72, 76, 79], 0.07, 'triangle', 0.15); },
    pebble: function () { tone(700, 0.06, 'square', 0.05, 400); },
    spit: function () { noise(0.15, 0.12, 'bandpass', 900, 400); },
    slam: function () { noise(0.5, 0.45, 'lowpass', 400, 50); tone(60, 0.4, 'sine', 0.3, 30); },
    warn: function () { tone(660, 0.1, 'square', 0.06); tone(660, 0.1, 'square', 0.06, 0, 0.15); },
    thunder: function () { noise(0.9, 0.4, 'lowpass', 1500, 60); },
    roar: function () { tone(110, 0.9, 'sawtooth', 0.2, 55); noise(0.9, 0.25, 'bandpass', 300, 120); },
    breath: function () { noise(1.2, 0.3, 'bandpass', 600, 250); },
    levelup: function () { arp([60, 64, 67, 72, 67, 72, 76, 79, 84], 0.09, 'square', 0.1, 0.25); },
    win: function () { arp([60, 64, 67, 72, 76, 79, 84, 88, 91, 96], 0.1, 'square', 0.1, 0.4); arp([36, 43, 48, 55], 0.25, 'triangle', 0.2, 0.6); },
    oops: function () { arp([67, 63, 60, 55], 0.15, 'triangle', 0.16, 0.3); },
    swap: function () { noise(0.22, 0.2, 'bandpass', 600, 2400); tone(500, 0.12, 'sine', 0.12, 1000, 0.04); },
    rest: function () { arp([72, 67, 64], 0.1, 'triangle', 0.14, 0.25); },
    fly: function () { noise(0.6, 0.22, 'bandpass', 300, 1800); arp([60, 67, 72], 0.07, 'sine', 0.1, 0.25); },
    land: function () { noise(0.3, 0.18, 'lowpass', 900, 200); },
    unseal: function () { arp([64, 68, 71, 76, 80], 0.07, 'triangle', 0.14, 0.3); noise(0.4, 0.1, 'highpass', 3000); },
    evolve: function () { arp([60, 64, 67, 72, 76, 79, 84, 88], 0.06, 'square', 0.1, 0.25); arp([48, 60], 0.2, 'triangle', 0.2, 0.6); },
    blockget: function () { arp([76, 83, 88], 0.06, 'square', 0.09, 0.15); },
    fit: function (n) { var b = 60 + (n || 1) * 3; tone(mtof(b), 0.25, 'triangle', 0.18, mtof(b + 7)); tone(mtof(b + 12), 0.2, 'sine', 0.1, 0, 0.08); },
    travel: function () { noise(1.5, 0.15, 'bandpass', 200, 3000); arp([55, 62, 67, 74, 79, 86], 0.15, 'sine', 0.12, 0.5); },
    buy: function () { arp([79, 84], 0.06, 'square', 0.09); tone(2000, 0.1, 'sine', 0.06, 0, 0.1); },
    forge: function () { tone(900, 0.2, 'triangle', 0.16, 600); tone(1400, 0.25, 'triangle', 0.1, 900, 0.18); noise(0.1, 0.15, 'highpass', 4000); },
    super: function () { noise(0.8, 0.35, 'lowpass', 2500, 100); arp([48, 55, 60, 67, 72], 0.05, 'sawtooth', 0.1, 0.3); },
    extraLife: function () { arp([60, 64, 67, 72, 76, 79, 84], 0.07, 'triangle', 0.16, 0.35); arp([72, 76, 79, 84], 0.12, 'sine', 0.12, 0.5); },
    superReady: function () { arp([72, 79, 84], 0.08, 'triangle', 0.15, 0.25); }
  };
  A.play = function (name, arg) {
    if (!ctx || A.muted || !S[name]) return;
    var now = ctx.currentTime;
    if (lastPlayed[name] && now - lastPlayed[name] < 0.045) return;
    lastPlayed[name] = now;
    try { S[name](arg); } catch (e) { /* ignore sound problems */ }
  };

  // ---------- music: tiny step sequencer (eighth notes) ----------
  function P(str) { return str.split(' ').map(function (s) { return s === '.' ? null : +s; }); }
  var TRACKS = [
    { root: 60, bpm: 132, wave: 'square', mel: P('0 4 7 4 9 7 4 . 5 9 12 9 7 . . . 4 7 12 7 9 12 14 12 11 7 5 2 0 . . .'), bass: [-12, -12, -7, -5, -3, -7, -5, -12] },
    { root: 65, bpm: 112, wave: 'triangle', mel: P('0 . 4 7 . 4 9 . 7 . 4 . 2 4 . . 0 . 4 7 . 9 12 . 11 . 9 7 5 . 4 .'), bass: [-12, -12, -7, -7, -10, -10, -5, -5] },
    { root: 62, bpm: 96, wave: 'sine', mel: P('12 . 7 . 10 . 7 . 12 . 14 . 15 . 14 . 12 . 7 . 5 . 3 . 5 . 7 . . . . .'), bass: [-12, -12, -9, -9, -14, -14, -7, -7] },
    { root: 57, bpm: 144, wave: 'square', mel: P('0 0 3 . 7 . 3 . 5 5 8 . 7 . 3 . 0 0 3 . 7 . 10 . 8 7 5 3 2 . . .'), bass: [-12, -12, -12, -9, -7, -7, -5, -5] },
    { root: 57, bpm: 100, wave: 'triangle', mel: P('0 . 3 . 6 . 3 . 7 . 6 . 3 . . . 0 . 3 . 8 . 7 . 6 . 3 . 2 . . .'), bass: [-12, -12, -15, -15, -11, -11, -13, -13] },
    { root: 52, bpm: 152, wave: 'sawtooth', mel: P('0 . 0 3 . 5 6 . 7 . 6 5 3 . . . 0 . 0 3 . 5 6 . 10 . 8 7 6 . 5 .'), bass: [-12, -12, -12, -12, -7, -7, -9, -10] },
    { root: 60, bpm: 120, wave: 'triangle', mel: P('0 . 4 . 7 . 12 . 11 . 7 . 4 . 7 . 5 . 9 . 12 . 9 . 7 . 4 . 2 . . .'), bass: [-12, -12, -7, -7, -15, -15, -17, -17] },
    // 7: Home Base (calm and dreamy)
    { root: 64, bpm: 88, wave: 'sine', mel: P('0 . 7 . 4 . 11 . 9 . 7 . 4 . . . 2 . 7 . 5 . 12 . 11 . 7 . 9 . . .'), bass: [-12, -12, -15, -15, -20, -20, -17, -17] },
    // 8: Rainy Isles (bouncy island tune)
    { root: 62, bpm: 116, wave: 'triangle', mel: P('0 . 4 7 9 . 7 4 . 2 4 . 0 . . . 5 . 9 12 14 . 12 9 . 7 9 . 7 . . .'), bass: [-12, -12, -7, -7, -10, -10, -5, -5] },
    // 9: Thunder Plains (marching, a bit stormy)
    { root: 55, bpm: 126, wave: 'square', mel: P('0 0 . 3 5 . 7 . 5 3 . 0 . . -2 . 0 0 . 3 5 . 8 . 7 5 . 3 2 . . .'), bass: [-12, -12, -12, -12, -9, -9, -7, -7] },
    // 10: Stone Canyon (cowboy trot)
    { root: 57, bpm: 120, wave: 'triangle', mel: P('0 . 3 . 5 7 . 5 3 . 0 . . . -2 . 0 . 3 . 5 . 7 10 . 7 5 . 3 . . .'), bass: [-12, -5, -12, -5, -10, -3, -12, -5] },
    // 11: Bloom Jungle (happy and busy)
    { root: 64, bpm: 132, wave: 'sine', mel: P('0 4 7 . 9 7 4 . 5 9 12 . 9 . 7 . 4 7 11 . 12 11 7 . 9 . 7 4 2 . 0 .'), bass: [-12, -12, -8, -8, -7, -7, -5, -5] }
  ];
  var cur = -1, step = 0, musicNext = 0;
  A.music = function (i) {
    if (cur === i) return;
    cur = i; step = 0;
    if (ctx) musicNext = ctx.currentTime + 0.15;
  };
  A.update = function () {
    if (!ctx || cur < 0 || A.muted || ctx.state !== 'running') return;
    var tr = TRACKS[cur]; if (!tr) return;
    var spb = 60 / tr.bpm / 2;
    if (musicNext < ctx.currentTime - 0.3) musicNext = ctx.currentTime + 0.05;
    while (musicNext < ctx.currentTime + 0.2) {
      var n = tr.mel[step % tr.mel.length];
      var delay = Math.max(0, musicNext - ctx.currentTime);
      if (n !== null) tone(mtof(tr.root + n), spb * 1.6, tr.wave, tr.wave === 'sawtooth' ? 0.12 : 0.2, 0, delay, mus);
      if (step % 4 === 0) tone(mtof(tr.root + tr.bass[(step / 4) % tr.bass.length]), spb * 3.6, 'triangle', 0.35, 0, delay, mus);
      if (step % 2 === 1 && cur === 5) noise(0.05, 0.05, 'highpass', 5000, 0, delay);
      step++;
      musicNext += spb;
    }
  };
})();
