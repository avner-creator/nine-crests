// Nine Crests - game data: heroes, the nine powers (with their 3 levels), crest trials, planets, enemies and bosses.
// Distances are in tiles, times in seconds.
(function () {
  'use strict';
  var SC = window.SC;

  // Each hero owns their own powers (only they can use them).
  // Nine heroes, one element each. sym = the element icon drawn on their portrait.
  SC.HEROES = [
    { id: 'nate', name: 'Nate', title: 'the Knight', desc: 'Brave and balanced.', hearts: 6, speed: 4.0, dmg: 2, cd: 0.3, reach: 1.3, arc: 2.1, swingT: 0.22,
      dashCd: 1.0, energy: 100, regen: 15, fav: 'fire', powers: ['fire'], color: '#ff8a3a', scale: 1, pips: { speed: 3, sword: 3, hearts: 3, magic: 3 } },
    { id: 'zen', name: 'Zen', title: 'the Ninja', desc: 'The fastest of all!', hearts: 5, speed: 5.0, dmg: 1.5, cd: 0.17, reach: 1.2, arc: 1.9, swingT: 0.15,
      dashCd: 0.55, energy: 100, regen: 15, fav: 'lightning', powers: ['lightning'], color: '#ffe14a', scale: 0.95, pips: { speed: 5, sword: 2, hearts: 2, magic: 3 } },
    { id: 'mira', name: 'Mira', title: 'the Mage', desc: 'Lots of magic power.', hearts: 5, speed: 4.0, dmg: 1.5, cd: 0.28, reach: 1.55, arc: 1.8, swingT: 0.22,
      dashCd: 1.0, energy: 140, regen: 24, fav: 'water', powers: ['water'], color: '#5ab8ff', scale: 0.95, pips: { speed: 3, sword: 2, hearts: 2, magic: 5 } },
    { id: 'koda', name: 'Koda', title: 'the Giant', desc: 'Big, strong and tough.', hearts: 8, speed: 3.35, dmg: 3, cd: 0.48, reach: 1.6, arc: 2.7, swingT: 0.32,
      dashCd: 1.1, energy: 100, regen: 15, fav: 'ice', powers: ['ice'], color: '#9fe8ff', scale: 1.22, pips: { speed: 2, sword: 5, hearts: 5, magic: 2 } },
    { id: 'pip', name: 'Pip', title: 'the Bubble Tinker', desc: 'Quick little inventor. Walks on water!', hearts: 5, speed: 4.6, dmg: 1.4, cd: 0.18, reach: 1.15, arc: 1.9, swingT: 0.15,
      dashCd: 0.6, energy: 115, regen: 19, fav: 'surface', powers: ['surface'], color: '#3ad8c8', scale: 0.85, pips: { speed: 4, sword: 2, hearts: 2, magic: 4 } },
    { id: 'rokko', name: 'Rokko', title: 'the Stone Guard', desc: 'Slow, strong and steady.', hearts: 7, speed: 3.5, dmg: 2.8, cd: 0.42, reach: 1.5, arc: 2.5, swingT: 0.3,
      dashCd: 1.05, energy: 100, regen: 15, fav: 'earth', powers: ['earth'], color: '#b08a4a', scale: 1.15, pips: { speed: 2, sword: 4, hearts: 4, magic: 2 } },
    { id: 'wren', name: 'Wren', title: 'the Sky Scout', desc: 'Light and nimble. Can fly!', hearts: 5, speed: 4.8, dmg: 1.6, cd: 0.2, reach: 1.3, arc: 2.0, swingT: 0.17,
      dashCd: 0.6, energy: 105, regen: 16, fav: 'wind', powers: ['wind'], color: '#d8f4ff', scale: 0.95, pips: { speed: 4, sword: 2, hearts: 2, magic: 3 } },
    { id: 'fern', name: 'Fern', title: 'the Healer', desc: 'Keeps the whole team going.', hearts: 6, speed: 4.0, dmg: 1.6, cd: 0.26, reach: 1.4, arc: 1.9, swingT: 0.2,
      dashCd: 0.9, energy: 125, regen: 21, fav: 'life', powers: ['life'], color: '#7dd65a', scale: 0.95, pips: { speed: 3, sword: 2, hearts: 3, magic: 4 } },
    { id: 'vex', name: 'Vex', title: 'the Shadow Knight', desc: 'Cool, strong and mysterious.', hearts: 6, speed: 3.9, dmg: 2.4, cd: 0.34, reach: 1.45, arc: 2.2, swingT: 0.25,
      dashCd: 0.95, energy: 100, regen: 15, fav: 'death', powers: ['death'], color: '#a070ff', scale: 1.05, pips: { speed: 3, sword: 4, hearts: 3, magic: 3 } }
  ];
  SC.heroById = function (id) { for (var i = 0; i < SC.HEROES.length; i++) if (SC.HEROES[i].id === id) return SC.HEROES[i]; return SC.HEROES[0]; };
  SC.heroIndex = function (id) { for (var i = 0; i < SC.HEROES.length; i++) if (SC.HEROES[i].id === id) return i; return 0; };

  // owner = the only hero who can use it. lv = what each level (1-3) adds, shown in the evolve banner.
  SC.POWERS = [
    { id: 'fire', owner: 'nate', name: 'Fire', color: '#ff7a1a', glow: '#ffd23f', hex: 0xff7a1a, cost: 16, cd: 0.35, tip: 'Throw a fireball! Burns thorns.',
      lv: ['A big fireball!', 'Two fireballs, bigger boom!', 'Three fireballs and a fire ring!'] },
    { id: 'water', owner: 'mira', name: 'Water', color: '#2f8cff', glow: '#9fdcff', hex: 0x2f8cff, cost: 25, cd: 0.8, tip: 'A big wave pushes baddies away.',
      lv: ['A wave pushes baddies!', 'A wider wave that washes shots away!', 'A double wave that slows baddies!'] },
    { id: 'surface', owner: 'pip', name: 'Surface Tension', short: 'Bubble', color: '#56d8e8', glow: '#e6fdff', hex: 0x56d8e8, cost: 20, cd: 0.6, tip: 'Bubble traps! Pip can walk on water!',
      lv: ['Bubble traps! Pop them with your sword.', 'Two bubbles, bigger pops!', 'Three bubbles that chase baddies!'] },
    { id: 'ice', owner: 'koda', name: 'Ice', color: '#8fe8ff', glow: '#ffffff', hex: 0x8fe8ff, cost: 22, cd: 0.55, tip: 'Ice shards freeze baddies.',
      lv: ['Ice shards freeze baddies!', 'Five shards that fly through!', 'Seven shards and a frost blast!'] },
    { id: 'earth', owner: 'rokko', name: 'Earth', color: '#b07a3a', glow: '#ffd59a', hex: 0xb07a3a, cost: 23, cd: 0.7, tip: 'Rock spikes! Breaks cracked rocks.',
      lv: ['A line of rock spikes!', 'Longer, bigger spikes!', 'Three lines of spikes!'] },
    { id: 'lightning', owner: 'zen', name: 'Lightning', color: '#ffe14a', glow: '#ffffff', hex: 0xffe14a, cost: 25, cd: 0.7, tip: 'Zap! It jumps to more baddies.',
      lv: ['Zap! It jumps to 5 baddies.', 'Jumps to 7 baddies and stuns longer!', 'Jumps to 10 and calls a sky bolt!'] },
    { id: 'wind', owner: 'wren', name: 'Wind', color: '#a8f0c8', glow: '#ffffff', hex: 0xbff5d8, cost: 20, cd: 0.7, tip: 'Tornadoes! And Wren can fly with G.',
      lv: ['Tornado! Press G to fly.', 'A bigger tornado, longer flying!', 'A giant tornado that grabs big baddies!'] },
    { id: 'life', owner: 'fern', name: 'Life', color: '#45d65a', glow: '#c8ffb8', hex: 0x45d65a, cost: 36, cd: 5, tip: 'Heals hearts and pushes baddies.',
      lv: ['Heals 2 hearts!', 'Heals the whole team!', 'Heals more and wakes a resting friend!'] },
    { id: 'death', owner: 'vex', name: 'Death', color: '#9b4dff', glow: '#e2c8ff', hex: 0x9b4dff, cost: 34, cd: 1.1, tip: 'A shadow skull flies through baddies.',
      lv: ['A shadow skull flies through baddies!', 'A bigger skull that chases baddies!', 'Two skulls that give you energy!'] }
  ];
  SC.powerIndex = {};
  SC.POWERS.forEach(function (p, i) { SC.powerIndex[p.id] = i; });
  SC.powerById = function (id) { return SC.POWERS[SC.powerIndex[id]]; };

  // Evolving: xp needed to reach level 2 and level 3 (kid friendly: 6 baddies, then 18 more).
  SC.EVOLVE_AT = [0, 6, 24];
  // Power damage multiplier vs v1 (all powers are now earned, so they hit harder).
  SC.POWER_BOOST = 1.3;

  // Wind Ride flight time per Wind level (seconds) and energy to take off.
  SC.FLY_TIME = [0, 5, 7, 10];
  SC.FLY_COST = 25;

  // Crest trials ("do stuff" to unseal a crest). type: beatAs (beat N baddies as a hero), beat (N baddies in this level),
  // gems (collect N gems in this level), chest (open a treasure chest), flag (touch a checkpoint flag).
  // alt = what to use instead when the level has no chest / no flag.
  // (in planet order: the tasks grow a little planet by planet)
  SC.TRIALS = {
    fire: { type: 'beatAs', hero: 'nate', n: 3 },
    water: { type: 'beatAs', hero: 'mira', n: 3 },
    lightning: { type: 'beatAs', hero: 'zen', n: 4 },
    ice: { type: 'beatAs', hero: 'koda', n: 4 },
    surface: { type: 'beatAs', hero: 'pip', n: 4 },
    earth: { type: 'chest', n: 1, alt: { type: 'beatAs', hero: 'rokko', n: 5 } },
    wind: { type: 'beatAs', hero: 'wren', n: 5 },
    life: { type: 'flag', n: 1, alt: { type: 'beatAs', hero: 'fern', n: 5 } },
    death: { type: 'beatAs', hero: 'vex', n: 6 }
  };
  // Planets: nine planets with one place (and one temple) each, then Pyros with the Dragon (def.planet wins when the level has it).
  // a = where it sits on the star map (angle around the Home Base, in degrees), r = how big it is drawn there.
  SC.PLANETS = [
    { id: 'Verdia', name: 'Verdia', color: '#5ad06a', ring: false, r: 30, desc: 'the green planet' },
    { id: 'Aquaria', name: 'Aquaria', color: '#4ab8ff', ring: false, r: 28, desc: 'the rainy ocean planet' },
    { id: 'Voltara', name: 'Voltara', color: '#ffd84a', ring: true, r: 28, desc: 'the thunder planet' },
    { id: 'Glacira', name: 'Glacira', color: '#bfe8ff', ring: true, r: 28, desc: 'the ice planet' },
    { id: 'Bubblon', name: 'Bubblon', color: '#56e0d8', ring: false, r: 27, desc: 'the bubble planet' },
    { id: 'Terrok', name: 'Terrok', color: '#d8784a', ring: false, r: 29, desc: 'the rocky planet' },
    { id: 'Zephyra', name: 'Zephyra', color: '#a8f0c8', ring: true, r: 27, desc: 'the windy planet' },
    { id: 'Floria', name: 'Floria', color: '#ff8ad8', ring: false, r: 28, desc: 'the flower planet' },
    { id: 'Umbra', name: 'Umbra', color: '#8a5ad0', ring: false, r: 28, desc: 'the shadow planet' },
    { id: 'Pyros', name: 'Pyros', color: '#ff6a2a', ring: true, r: 36, desc: 'the fire planet of the Dragon' }
  ];
  SC.LEVEL_PLANET = ['Verdia', 'Aquaria', 'Voltara', 'Glacira', 'Bubblon', 'Terrok', 'Zephyra', 'Floria', 'Umbra', 'Pyros'];
  SC.planetOf = function (index) {
    var def = SC.LEVELS && SC.LEVELS[index], id = (def && def.planet) || SC.LEVEL_PLANET[index] || 'Verdia';
    for (var i = 0; i < SC.PLANETS.length; i++) if (SC.PLANETS[i].id.toLowerCase() === String(id).toLowerCase()) return SC.PLANETS[i];
    return SC.PLANETS[0];
  };

  // ai: melee | ranged | brute | zig | blink | ember | boss names
  SC.ENEMIES = {
    grump: { name: 'Grumpling', hp: 4, speed: 1.5, r: 0.3, ai: 'melee', range: 0.85, dmg: 0.5, weak: ['fire'], resist: [], gem: 0.7, look: { skin: 0x9bd36a, cloth: 0x8a5a2b, hat: 'none', gear: 'stick' } },
    slinger: { name: 'Slinger', hp: 3, speed: 1.7, r: 0.28, ai: 'ranged', proj: 'pebble', rate: 2.4, keep: 4.2, dmg: 0.5, weak: ['wind'], resist: [], gem: 0.8, look: { skin: 0xf0c27a, cloth: 0xd23b3b, hat: 'hood', gear: 'sling' } },
    shield: { name: 'Shield Grumpling', hp: 6, speed: 1.35, r: 0.32, ai: 'melee', range: 0.85, dmg: 0.5, shield: true, weak: ['earth'], resist: [], gem: 0.9, look: { skin: 0x9bd36a, cloth: 0x4a6fd1, hat: 'helmet', gear: 'shield' } },
    splash: { name: 'Splashling', hp: 5, speed: 1.6, r: 0.3, ai: 'ranged', proj: 'blob', rate: 2.2, keep: 3.8, dmg: 0.5, weak: ['lightning'], resist: ['water'], gem: 0.8, look: { skin: 0x7fd3ff, cloth: 0x2d7fd8, hat: 'drop', gear: 'none' } },
    frost: { name: 'Frostling', hp: 6, speed: 1.5, r: 0.3, ai: 'ranged', proj: 'snow', rate: 2.3, keep: 3.8, dmg: 0.5, weak: ['fire'], resist: ['ice'], gem: 0.9, look: { skin: 0xdff4ff, cloth: 0x7ab8ff, hat: 'pom', gear: 'snowball' } },
    brute: { name: 'Brute', hp: 18, speed: 1.15, r: 0.5, ai: 'brute', dmg: 1, weak: ['ice'], resist: ['wind'], gem: 1, big: true, look: { skin: 0xa0a6b8, cloth: 0x6a4a8a, hat: 'horns', gear: 'club' } },
    spark: { name: 'Sparkling', hp: 6, speed: 3.0, r: 0.28, ai: 'zig', dmg: 0.5, weak: ['earth'], resist: ['lightning'], gem: 0.9, look: { skin: 0xffe46b, cloth: 0xff9d1c, hat: 'spiky', gear: 'sparks' } },
    shadow: { name: 'Shadowling', hp: 8, speed: 1.7, r: 0.3, ai: 'blink', range: 0.85, dmg: 0.5, weak: ['life'], resist: ['death'], gem: 1, look: { skin: 0x7a5ab0, cloth: 0x2c1f4a, hat: 'cloak', gear: 'dagger' } },
    ember: { name: 'Emberling', hp: 8, speed: 1.8, r: 0.3, ai: 'ember', range: 0.85, dmg: 0.5, weak: ['water'], resist: ['fire'], gem: 1, look: { skin: 0xff8a4a, cloth: 0x8a2a1a, hat: 'flame', gear: 'ember' } },
    // mini-bosses and the dragon
    // (in planet order; health grows planet by planet)
    chief: { name: 'Chief Grump', hp: 55, speed: 1.4, r: 0.65, ai: 'chief', dmg: 1, boss: true, weak: ['fire'], resist: [], look: { skin: 0x8cc85a, cloth: 0x9a5a2a, hat: 'crown', gear: 'club' } },
    drizzle: { name: 'King Drizzle', hp: 60, speed: 1.55, r: 0.64, ai: 'drizzle', dmg: 1, boss: true, weak: ['lightning', 'fire'], resist: ['water'],
      look: { skin: 0x6ac87a, cloth: 0x2a6ab8, hat: 'umbrella', gear: 'none', belt: 0xffd23f, glowEye: 0xfff27a } },
    sparkhorn: { name: 'Sparkhorn', hp: 66, speed: 1.9, r: 0.62, ai: 'sparkhorn', dmg: 1, boss: true, weak: ['earth', 'water'], resist: ['lightning'],
      look: { skin: 0xf0e0b0, cloth: 0x4a4a6a, hat: 'ramhorns', gear: 'none', belt: 0xffe14a, brow: 0x5a4a30 } },
    brr: { name: 'Big Brr', hp: 72, speed: 1.3, r: 0.72, ai: 'brr', dmg: 1, boss: true, weak: ['fire'], resist: ['ice'], look: { skin: 0xe8f6ff, cloth: 0x5a9ae0, hat: 'horns', gear: 'icicle' } },
    captain: { name: 'Captain Splash', hp: 78, speed: 1.9, r: 0.6, ai: 'captain', dmg: 1, boss: true, weak: ['lightning'], resist: ['water'], look: { skin: 0x6fc6ff, cloth: 0x1f4fa8, hat: 'captain', gear: 'trident' } },
    boulderback: { name: 'Boulderback', hp: 85, speed: 1.25, r: 0.74, ai: 'boulderback', dmg: 1, boss: true, weak: ['water', 'ice'], resist: ['earth', 'lightning'],
      look: { skin: 0xc8805a, cloth: 0x7a4a2a, hat: 'rockhat', gear: 'rockfists', belt: 0x4a3020, brow: 0x5a2a10 } },
    zap: { name: 'Sir Zap', hp: 90, speed: 2.0, r: 0.6, ai: 'zap', dmg: 1, boss: true, weak: ['earth'], resist: ['lightning'], look: { skin: 0xffe46b, cloth: 0x5a5a78, hat: 'knight', gear: 'lance' } },
    snapjaw: { name: 'Snapjaw', hp: 95, speed: 1.5, r: 0.64, ai: 'snapjaw', dmg: 1, boss: true, weak: ['fire'], resist: ['life', 'water'],
      look: { skin: 0x7ad04a, cloth: 0x2a8a3a, hat: 'bloomhead', gear: 'none', belt: 0xffd860, glowEye: 0xffffff, brow: 0x2a4a1a } },
    gloomo: { name: 'Gloomo', hp: 100, speed: 1.6, r: 0.6, ai: 'gloomo', dmg: 1, boss: true, weak: ['life'], resist: ['death'], look: { skin: 0x9a7ad0, cloth: 0x3a1f6a, hat: 'wizard', gear: 'staff' } },
    dragon: { name: 'The Dragon', hp: 220, speed: 2.0, r: 1.5, ai: 'dragon', dmg: 1, boss: true, weak: ['ice', 'water'], resist: ['fire'] },
    // temple guardians (one per crest). g = how it fights: atks (attack ids, used in turn), proj (thrown thing), fx (particles),
    // tele (telegraph time multiplier: bigger = slower and easier), rest (pause between attacks), n (how many shots / strikes)
    g_fire: { name: 'Magmo the Lava Golem', short: 'Magmo', size: 2.4, hp: 38, speed: 1.25, r: 0.6, ai: 'guardian', guardian: 'fire', dmg: 0.5, boss: true, weak: ['water'], resist: ['fire'],
      look: { skin: 0x5a3a34, cloth: 0x3a2624, hat: 'lavacrown', gear: 'lavafists', glowEye: 0xffb03a, belt: 0xff6a1a, brow: 0x2a1a14 },
      g: { atks: ['slam', 'volley'], proj: 'fireball', n: 3, fx: 'fire', color: '#ff7a1a', tele: 1.4, rest: 1.7, trail: true } },
    g_lightning: { name: 'Volty the Thunder Imp', short: 'Volty', size: 2.2, hp: 48, speed: 1.9, r: 0.55, ai: 'guardian', guardian: 'lightning', dmg: 0.5, boss: true, weak: ['earth'], resist: ['lightning'],
      look: { skin: 0xffe46b, cloth: 0x3a3a68, hat: 'stormhorns', gear: 'stormrod', glowEye: 0xffffff, belt: 0xffe14a },
      g: { atks: ['strikes', 'charge'], n: 2, fx: 'spark', color: '#ffe14a', tele: 1.3, rest: 1.6 } },
    g_water: { name: 'Shellby the Tide Turtle', short: 'Shellby', size: 2.4, hp: 44, speed: 1.4, r: 0.62, ai: 'guardian', guardian: 'water', dmg: 0.5, boss: true, weak: ['lightning'], resist: ['water'],
      look: { skin: 0x6ad0b0, cloth: 0x2a7ab8, hat: 'shellhelm', gear: 'tidestaff', belt: 0xf0e0b0 },
      g: { atks: ['volley', 'charge'], proj: 'blob', n: 3, fx: 'water', color: '#2f8cff', tele: 1.35, rest: 1.7 } },
    g_ice: { name: 'Glacius the Ice Knight', short: 'Glacius', size: 2.4, hp: 54, speed: 1.3, r: 0.62, ai: 'guardian', guardian: 'ice', dmg: 0.5, boss: true, weak: ['fire'], resist: ['ice'],
      look: { skin: 0xd8f0ff, cloth: 0x7ab8e8, hat: 'icecrown', gear: 'iceblade', glowEye: 0x8fe8ff, belt: 0xffffff },
      g: { atks: ['strikes', 'nova'], n: 3, fx: 'ice', color: '#8fe8ff', tele: 1.25, rest: 1.55, slow: 1.0 } },
    g_surface: { name: 'King Bubblor', short: 'Bubblor', size: 2.6, hp: 68, speed: 1.5, r: 0.66, ai: 'guardian', guardian: 'surface', dmg: 1, boss: true, weak: ['lightning'], resist: ['water', 'surface'],
      look: { skin: 0x8ae8f0, cloth: 0x2aa8b0, hat: 'bubblecrown', gear: 'bubblewand', belt: 0xffd23f },
      g: { atks: ['volley', 'leap', 'nova'], proj: 'bubbleball', n: 5, fx: 'bubble', color: '#56d8e8', tele: 1.15, rest: 1.4 } },
    g_earth: { name: 'Grumbolt the Rock Giant', short: 'Grumbolt', size: 2.8, hp: 80, speed: 1.15, r: 0.7, ai: 'guardian', guardian: 'earth', dmg: 1, boss: true, weak: ['water', 'ice'], resist: ['earth', 'lightning'],
      look: { skin: 0x9a8a72, cloth: 0x6a5a40, hat: 'mossrock', gear: 'rockfists', belt: 0x5a8a3a },
      g: { atks: ['quake', 'volley', 'slam'], proj: 'rock', n: 3, fx: 'rock', color: '#d8a050', tele: 1.1, rest: 1.3 } },
    g_wind: { name: 'Gale the Wind Djinn', short: 'Gale', size: 2.4, hp: 90, speed: 2.0, r: 0.6, ai: 'guardian', guardian: 'wind', dmg: 1, boss: true, weak: ['earth'], resist: ['wind'],
      look: { skin: 0xc8f0e8, cloth: 0x8ad0f0, hat: 'windturban', gear: 'windfan', glowEye: 0xffffff, belt: 0xa8f0c8 },
      g: { atks: ['cone', 'volley', 'charge'], proj: 'blade', n: 5, fx: 'wind', color: '#a8f0c8', tele: 1.05, rest: 1.2, float: true } },
    g_life: { name: 'Briar the Thorn Queen', short: 'Briar', size: 2.4, hp: 98, speed: 1.45, r: 0.62, ai: 'guardian', guardian: 'life', dmg: 1, boss: true, weak: ['fire'], resist: ['life'],
      look: { skin: 0x9ad87a, cloth: 0x3a8a4a, hat: 'leafcrown', gear: 'thornwhip', glowEye: 0xfff27a, belt: 0xffd860 },
      g: { atks: ['lines', 'nova', 'volley'], proj: 'seed', n: 5, fx: 'leaf', color: '#45d65a', tele: 1.0, rest: 1.2 } },
    g_death: { name: 'Nox the Shade Knight', short: 'Nox', size: 2.5, hp: 108, speed: 1.6, r: 0.62, ai: 'guardian', guardian: 'death', dmg: 1, boss: true, weak: ['life', 'lightning'], resist: ['death'],
      look: { skin: 0x5a4a7a, cloth: 0x241a38, hat: 'shadehelm', gear: 'shadeblade', glowEye: 0xc08aff, belt: 0x9b4dff },
      g: { atks: ['blink', 'volley', 'slam'], proj: 'orb', n: 3, fx: 'shadow', color: '#b07aff', tele: 1.0, rest: 1.2 } }
  };
  // which guardian keeps which crest, and what each temple is called
  SC.GUARDIAN_OF = { fire: 'g_fire', lightning: 'g_lightning', water: 'g_water', ice: 'g_ice', surface: 'g_surface', earth: 'g_earth', wind: 'g_wind', life: 'g_life', death: 'g_death' };
  SC.TEMPLE_NAME = { fire: 'Fire Temple', lightning: 'Lightning Temple', water: 'Water Temple', ice: 'Ice Temple', surface: 'Bubble Temple', earth: 'Earth Temple',
    wind: 'Wind Temple', life: 'Life Temple', death: 'Shadow Temple' };
  SC.templeName = function (power) { return SC.TEMPLE_NAME[power] || 'Temple'; };

  SC.ENEMY_CHARS = { a: 'grump', s: 'slinger', x: 'shield', q: 'splash', f: 'frost', R: 'brute', z: 'spark', o: 'shadow', e: 'ember' };
})();
