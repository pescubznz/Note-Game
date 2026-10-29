'use strict';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
let viewWidth = 1200;
const STORAGE = 'scriptoria-worlds-v1';
const TILE = ScriptoriaTerrain.TILE;
const ROLL_DURATION = .32;
const ROLL_INVULNERABILITY = .28;
const ROLL_COOLDOWN = 1.1;
let worlds = [], activeId, storageOK = true;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
  if (saved && Array.isArray(saved.worlds)) { worlds = saved.worlds; activeId = saved.activeId; }
} catch { storageOK = false; }

function createWorld(name, seed) {
  return { id: crypto.randomUUID(), name, seed: seed || String(Math.floor(Math.random() * 999999)),
    terrainVersion: 2, x: 80, maxX: 80, hp: 5, notes: [], defeated: [], checkpoint: 80 };
}
if (!worlds.length) {
  const initial = createWorld("Wanderer's world", '482719');
  worlds.push(initial); activeId = initial.id;
}
let world = worlds.find(w => w.id === activeId) || worlds[0];
let terrain, player, defeated, enemies;
let camera = 0, cameraY = 0, paused = false, lastTime = 0, time = 0;
let atVillage = false, selectedNote = null, sound = false, audio;
let bullets = [], hostileBullets = [], particles = [];
const keys = new Set();
const pressed = new Set();
const mouseAim = { active: false, clientX: 0, clientY: 0, firing: false };
const palette = [
  { name: 'The Emerald Wilds', desc: 'Woodland trails and hidden lakes.', sky: '#8ecbc0', haze: '#b3dac3', far: '#6fa799', mount: '#4e8d7d', grass: '#8fb965', edge: '#547c3a', soil: '#694d3b', deep: '#433d32', tree: '#407349', leaf: '#54854b', water: '#407f99', icon: '♧' },
  { name: 'The Amber Expanse', desc: 'Climb the dunes. Find an oasis.', sky: '#e4c999', haze: '#eee0ac', far: '#cbb37c', mount: '#bfa168', grass: '#e9cd87', edge: '#bf9c58', soil: '#ad7b4d', deep: '#775340', tree: '#697e45', leaf: '#849955', water: '#479aa2', icon: '☀' },
  { name: 'The Frostbound Peaks', desc: 'High passes above glacial lakes.', sky: '#a9c5d5', haze: '#d3e1dc', far: '#92afbc', mount: '#738eab', grass: '#e0eee4', edge: '#91b9bd', soil: '#6c747b', deep: '#424c5c', tree: '#456b66', leaf: '#648a7b', water: '#579dbd', icon: '❄' },
  { name: 'The Whispering Wetlands', desc: 'Reeds, willows, and misty waters.', sky: '#93b7a8', haze: '#bbc9a6', far: '#748f86', mount: '#566f6d', grass: '#92a975', edge: '#596e49', soil: '#66634c', deep: '#3b4b43', tree: '#465f4b', leaf: '#6c8960', water: '#548b89', icon: '≈' },
  { name: 'The Ember Highlands', desc: 'Basalt ridges beneath a copper sky.', sky: '#b58f88', haze: '#d4aa8f', far: '#967d82', mount: '#6f6574', grass: '#a89689', edge: '#706a68', soil: '#655d62', deep: '#3e3c49', tree: '#655058', leaf: '#9d7363', water: '#657f9e', icon: '▲' }
];
const ground = x => terrain.ground(x);
const rand = (n, salt = 0) => terrain.random(n, salt);
const biome = x => terrain.biome(x);
const nearestVillage = x => terrain.nearestVillage(x);
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const approach = (value, target, amount) => value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);

function loadWorld(next) {
  world = next;
  terrain = ScriptoriaTerrain.create(world.seed);
  if (world.terrainVersion !== 2) {
    // Keep old notes, distance, and position; relocate obsolete checkpoints to a valid resting place.
    const oldCheckpoint = Number.isFinite(world.checkpoint) ? world.checkpoint : 80;
    world.checkpoint = terrain.route(oldCheckpoint).previous;
    world.terrainVersion = 2;
  }
  player = { x: world.x, y: ground(world.x + 12) - 40, vx: 0, vy: 0, hp: world.hp || 5,
    ground: true, facing: 1, invincible: 1, roll: 0, rollCooldown: 0, rollDirection: 1,
    shotCooldown: 0, muzzle: 0, swimming: false, coyote: .1, jumpBuffer: 0, swimKick: 0 };
  const water = terrain.waterAt(player.x + 12);
  if (water) { player.y = water.level - 24; player.ground = false; player.swimming = true; }
  defeated = new Set(world.defeated);
  enemies = ScriptoriaEnemies.create(terrain, world, defeated);
  bullets = []; hostileBullets = []; particles = []; keys.clear(); pressed.clear(); mouseAim.firing = false;
  camera = Math.max(0, player.x - Math.min(330, viewWidth * .3));
  cameraY = clamp(player.y + 40 - 400, -260, 110);
  enemies.sync(camera, viewWidth);
  atVillage = isAtScriptorium();
  paused = false;
  $('pauseBtn').textContent = 'Ⅱ';
}
function isAtScriptorium() {
  const settlement = nearestVillage(player.x);
  return Math.abs(player.x + 12 - (settlement.x + 26)) < 58 &&
    Math.abs(player.y + 40 - 416) < 12 && player.roll <= 0;
}
function toast(message) {
  $('toast').textContent = message; $('toast').style.display = 'block';
  clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').style.display = 'none', 3000);
}
function save() {
  enemies.save();
  world.x = player.x; world.hp = player.hp; world.maxX = Math.max(world.maxX, player.x); activeId = world.id;
  try {
    localStorage.setItem(STORAGE, JSON.stringify({ worlds, activeId }));
    storageOK = true; $('saveStatus').textContent = 'Saved locally';
  } catch { storageOK = false; $('saveStatus').textContent = 'Saving unavailable'; }
  $('gameStatus').textContent = storageOK ? 'Your adventure is saved automatically' : 'Storage unavailable — export a backup from Worlds';
}
function rect(x, y, w, h, color) {
  ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h);
}
function tree(x,y,size,p,pine=false){rect(x-5*size,y-72*size,10*size,72*size,'#6b5140');if(pine){for(let k=0;k<3;k++){ctx.fillStyle=p.leaf;ctx.beginPath();ctx.moveTo(x,y-(135-k*26)*size);ctx.lineTo(x-(35-k*3)*size,y-(60-k*17)*size);ctx.lineTo(x+(35-k*3)*size,y-(60-k*17)*size);ctx.fill();rect(x-(24-k*2)*size,y-(94-k*23)*size,34*size,6*size,p.grass);}}else{rect(x-38*size,y-123*size,76*size,42*size,p.tree);rect(x-49*size,y-108*size,95*size,35*size,p.tree);rect(x-28*size,y-140*size,52*size,45*size,p.leaf);rect(x-39*size,y-124*size,72*size,30*size,p.leaf);rect(x-26*size,y-134*size,26*size,8*size,'#79a15e');}}
function building(x,y,library=false){const w=library?112:62,h=library?104:66;rect(x,y-h,w,h,'#bda784');rect(x+5,y-h+8,w-10,h-8,'#ceb990');for(let n=0;n<4;n++)rect(x+n*w/4,y-h,4,h,'#665b47');rect(x,y-8,w,8,'#786547');ctx.fillStyle=library?'#566762':'#8a6650';ctx.beginPath();ctx.moveTo(x-10,y-h+5);ctx.lineTo(x+w/2,y-h-45);ctx.lineTo(x+w+10,y-h+5);ctx.fill();for(let n=0;n<4;n++)rect(x-4+n*9,y-h-n*7,12,4,'#9eac8c');rect(x+w/2-12,y-40,24,40,'#3c4236');rect(x+w/2+5,y-20,3,3,'#e8cb7a');rect(x+13,y-62,14,20,'#edd78e');rect(x+w-27,y-62,14,20,'#edd78e');if(library){rect(x+3,y-h+9,w-6,18,'#5a4a37');ctx.fillStyle='#f3e2b9';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.fillText('SCRIPTORIUM',x+w/2,y-h+22);ctx.textAlign='left';rect(x+w/2-6,y-h-20,12,14,'#e7d5a9');rect(x+w/2-2,y-h-18,2,10,'#70684b');}}

function character(x, y) {
  ctx.save(); ctx.translate(Math.round(x + 12), Math.round(y + 24));
  if (player.roll > 0) {
    ctx.translate(0, 4);
    ctx.rotate(player.rollDirection * (1 - player.roll / ROLL_DURATION) * Math.PI * 2);
    rect(-11, -9, 22, 20, '#576744'); rect(-8, -13, 13, 10, '#604638');
    rect(-6, -9, 12, 9, '#e0b08a'); rect(4, 4, 8, 7, '#b18c50');
    ctx.restore(); return;
  }
  ctx.translate(-12, -24);
  if (player.facing < 0) { ctx.translate(24, 0); ctx.scale(-1, 1); }
  const stride = (player.ground || player.swimming) && Math.abs(player.vx) > 20 ? Math.sin(time * 16) * 4 : 0;
  rect(4, 28 + stride, 6, 12 - stride, '#414c38'); rect(14, 28 - stride, 6, 12 + stride, '#414c38');
  rect(3, 37, 8, 4, '#473f32'); rect(14, 37, 8, 4, '#473f32');
  rect(3, 15, 18, 15, '#b18c50'); rect(0, 17, 7, 14, '#576744'); rect(8, 16, 7, 14, '#d1b879');
  rect(6, 4, 17, 13, '#e0b08a'); rect(3, 3, 20, 6, '#604638'); rect(7, 0, 13, 5, '#604638');
  rect(18, 9, 2, 3, '#292f29'); rect(10, 16, 13, 4, '#63806a');
  ctx.restore();
  // Rotate the rifle independently of walking direction, keeping its stock upright.
  const aim = rifleAim();
  ctx.save(); ctx.translate(x + 12, y + 22); ctx.rotate(aim.angle);
  if (aim.dx < 0) ctx.scale(1, -1);
  const recoil = player.muzzle > 0 ? -2 : 0;
  ctx.translate(recoil, 0);
  rect(-5, 0, 15, 5, '#70523a'); rect(8, -2, 20, 4, '#414c50');
  rect(22, -4, 3, 2, '#252d30'); rect(5, 3, 4, 6, '#554531'); rect(1, 4, 6, 4, '#e0b08a');
  if (player.muzzle > 0) { rect(28, -5, 9, 10, '#f7d777'); rect(31, -2, 12, 4, '#fff1b3'); }
  ctx.restore();
}

function enemyDraw(e) {
  const spec = ScriptoriaEnemies.TYPES[e.type], x = e.x - camera;
  const feet = e.y + spec.height, stride = Math.sin(e.age * 12) * 2;
  if (e.type === 'bandit' && e.state === 'windup') {
    ctx.save(); ctx.strokeStyle = '#ed9b7c88'; ctx.lineWidth = 1; ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.moveTo(x + e.dir * 20, e.y + 22); ctx.lineTo(e.aimX - camera, e.aimY); ctx.stroke(); ctx.restore();
  }
  ctx.save(); ctx.translate(Math.round(x), Math.round(feet)); ctx.scale(e.dir, 1);
  if (e.type === 'bandit') {
    rect(-8, -29, 16, 19, '#775d4c'); rect(-6, -42, 13, 13, '#c39672');
    rect(-9, -45, 17, 7, '#574c3d'); rect(-11, -39, 24, 3, '#433e35');
    rect(-8, -31, 17, 5, '#a25d49'); rect(4, -35, 2, 3, '#242b25');
    rect(-7, -10 + stride, 5, 10 - stride, '#403f37'); rect(3, -10 - stride, 5, 10 + stride, '#403f37');
    rect(4, -24, 12, 5, '#704c32'); rect(12, -25, 18, 4, '#3d474b'); rect(9, -20, 5, 6, '#b38d6f');
    if (e.muzzle > 0) { rect(31, -28, 10, 10, '#f4bc76'); rect(34, -25, 13, 4, '#ffedb4'); }
  } else if (e.type === 'bat') {
    const wing = Math.sin(e.age * 18) * 5;
    rect(-8, -17, 16, 16, '#57465d'); rect(-6, -22, 4, 7, '#705e7d'); rect(3, -22, 4, 7, '#705e7d');
    rect(-24, -15 + wing, 17, 7, '#7c6890'); rect(-31, -21 + wing, 10, 7, '#69577e');
    rect(7, -15 - wing, 17, 7, '#7c6890'); rect(21, -21 - wing, 10, 7, '#69577e');
    rect(-5, -14, 3, 3, '#f0c879'); rect(3, -14, 3, 3, '#f0c879'); rect(-2, -5, 5, 3, '#e1d8b9');
  } else if (e.type === 'stoneback') {
    rect(-22, -23, 43, 17, '#666d61'); rect(-17, -34, 32, 21, '#83918b');
    rect(-13, -38, 12, 11, '#a6afa0'); rect(2, -35, 11, 12, '#a6afa0');
    rect(-19, -25, 15, 9, '#596b69'); rect(0, -24, 15, 9, '#596b69');
    rect(17, -21, 15, 15, '#65745e'); rect(25, -18, 3, 3, '#edbc74');
    rect(-17, -8 + stride, 8, 8 - stride, '#404e43'); rect(11, -8 - stride, 8, 8 + stride, '#404e43');
  } else if (e.type === 'wolf') {
    rect(-17, -22, 33, 15, '#8d9993'); rect(10, -27, 17, 16, '#a3afa4');
    rect(21, -18, 12, 7, '#b9bda9'); rect(14, -32, 5, 8, '#697d7b'); rect(23, -24, 3, 3, '#ebbc73');
    rect(-29, -24, 15, 7, '#a3afa4'); rect(-32, -29, 7, 8, '#a3afa4');
    rect(-13, -9 + stride, 5, 9 - stride, '#586a66'); rect(10, -9 - stride, 5, 9 + stride, '#586a66');
  } else {
    rect(-15, -22, 30, 17, '#716758'); rect(12, -19, 12, 13, '#827160');
    rect(-12, -8 + stride, 5, 8 - stride, '#3e3c34'); rect(7, -8 - stride, 5, 8 + stride, '#3e3c34');
    rect(18, -17, 3, 3, '#dfb587'); rect(21, -7, 4, 4, '#efe0b6'); rect(12, -25, 5, 8, '#564f45');
  }
  if (e.flash > 0) { ctx.globalAlpha = .45; rect(-spec.width / 2, -spec.height, spec.width, spec.height, '#fff4d8'); }
  ctx.restore();
  if (e.alert > 0 || e.hp < spec.hp || e.state === 'windup') {
    rect(x - 18, e.y - 12, 36, 4, '#292f2b'); rect(x - 17, e.y - 11, 34 * e.hp / spec.hp, 2, '#dc9875');
  }
  if (e.state === 'windup') {
    ctx.fillStyle = '#ffdb8b'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
    ctx.fillText(e.type === 'bandit' ? 'AIMING' : '!', x, e.y - 19); ctx.textAlign = 'left';
  }
}
function drawBackground(p) {
  rect(0, 0, viewWidth, 576, p.sky); rect(0, 210, viewWidth, 366, p.haze);
  rect(920 - camera * .015 % 1200, 98, 52, 52, '#eee2ae');
  for (let n = -1; n < 6; n++) {
    const x = n * 280 - (camera * .08 % 280);
    rect(x, 100 + (n % 3) * 28, 100, 16, '#e6efcf'); rect(x + 20, 89 + (n % 3) * 28, 56, 15, '#e6efcf');
  }
  for (let layer = 0; layer < 2; layer++) {
    ctx.fillStyle = layer ? p.mount : p.far; ctx.beginPath(); ctx.moveTo(0, 576);
    for (let x = -40; x <= viewWidth + 40; x += 20) {
      const wx = x + camera * (layer ? .2 : .1);
      const ridge = 1 - Math.abs((wx / 300 % 2 + 2) % 2 - 1);
      ctx.lineTo(x, 310 + layer * 60 - ridge * (biome(player.x) === 2 || biome(player.x) === 4 ? 140 : 85) - cameraY * .15);
    }
    ctx.lineTo(viewWidth, 576); ctx.fill();
  }
  if (biome(player.x) !== 4) {
    for (let n = Math.floor(camera * .35 / 180) - 1; n < Math.floor(camera * .35 / 180) + Math.ceil(viewWidth / 180) + 2; n++)
      tree(n * 180 - camera * .35, 390 - cameraY * .3, .6, p, biome(player.x) === 2);
  }
}
function drawDecoration(wx, x, y, col, p) {
  const type = biome(wx);
  if (Math.abs(wx - nearestVillage(wx).x) < 205 || terrain.waterAt(wx)) return;
  if (rand(col, 8) > .84) {
    if (type === 1) {
      rect(x + 12, y - 38, 7, 38, p.tree); rect(x + 5, y - 28, 8, 6, p.tree);
      rect(x + 5, y - 37, 5, 13, p.tree); rect(x + 18, y - 20, 8, 5, p.tree); rect(x + 23, y - 29, 4, 14, p.tree);
    } else if (type === 4) {
      rect(x, y - 18, 30, 18, p.edge); rect(x + 5, y - 31, 20, 16, p.soil);
      rect(x + 8, y - 30, 4, 20, '#bd8266'); rect(x + 18, y - 18, 3, 16, '#d59c74');
    } else {
      tree(x + 8, y, .85 + rand(col, 9) * .5, p, type === 2);
      if (type === 3) for (let n = 0; n < 4; n++) rect(x - 26 + n * 20, y - 82, 3, 45 + n % 2 * 17, '#8fa775');
    }
  } else if (col % 4 === 0) {
    rect(x + 8, y - (type === 3 ? 24 : 9), 2, type === 3 ? 24 : 9, p.edge);
    rect(x + 6, y - (type === 3 ? 26 : 10), 6, type === 3 ? 8 : 3, type === 3 ? '#baa274' : col % 2 ? '#dfcd86' : '#c2a0b0');
  }
}
function render() {
  const p = palette[biome(player.x)];
  ctx.imageSmoothingEnabled = false; drawBackground(p);
  ctx.save(); ctx.translate(0, -Math.round(cameraY));
  const first = Math.floor(camera / TILE) - 1, last = Math.ceil((camera + viewWidth) / TILE) + 1;
  for (let col = first; col <= last; col++) {
    const wx = col * TILE, x = wx - camera, g = ground(wx), t = palette[biome(wx)];
    rect(x, g, TILE, 850 - g, t.deep); rect(x, g, TILE, 48, t.soil);
    rect(x, g, TILE, 7, t.grass); rect(x, g + 7, TILE, 4, t.edge);
    for (let k = 0; k < 4; k++) rect(x + Math.floor(rand(col, k + 10) * 10), g + 20 + k * 22, 5, 4, k % 2 ? t.soil : t.edge);
    drawDecoration(wx, x, g, col, t);
  }
  for (const v of terrain.nearbyVillages(camera + viewWidth / 2, viewWidth / 2 + 250)) {
    const x = v.x - camera;
    building(x - 112, 416); building(x - 30, 416, true); building(x + 99, 416);
    rect(x - 45, 416, 180, 5, '#ae9e75'); rect(x + 91, 368, 4, 48, '#685946');
    rect(x + 83, 368, 20, 5, '#685946'); rect(x + 87, 373, 12, 17, '#efd49a');
  }
  for (const e of enemies.active()) {
    if (e.x >= camera - 70 && e.x <= camera + viewWidth + 70) enemyDraw(e);
  }
  for (const particle of particles) { ctx.globalAlpha = particle.life / particle.maxLife; rect(particle.x - camera, particle.y, particle.size, particle.size, particle.color); }
  ctx.globalAlpha = 1;
  if (player.roll > 0 || player.invincible <= 0 || Math.floor(time * 12) % 2 === 0) character(player.x - camera, player.y);
  for (const shot of bullets) {
    ctx.save(); ctx.translate(shot.x - camera, shot.y);
    ctx.rotate(Math.atan2(shot.vy || 0, shot.vx ?? shot.direction * 820));
    rect(-10, -1, 10, 3, '#f7df97'); rect(0, -1, 4, 3, '#fff4c7'); ctx.restore();
  }
  for (const shot of hostileBullets) {
    ctx.strokeStyle = '#ee9972'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(shot.x - camera - shot.vx * .025, shot.y - shot.vy * .025); ctx.lineTo(shot.x - camera, shot.y); ctx.stroke();
    rect(shot.x - camera - 2, shot.y - 2, 4, 4, '#ffe2a1');
  }
  // Water is foreground geometry: the submerged part of the traveler is tinted.
  for (let col = first; col <= last; col++) {
    const wx = col * TILE + TILE / 2, water = terrain.waterAt(wx);
    if (!water) continue;
    const x = col * TILE - camera, t = palette[biome(wx)];
    ctx.globalAlpha = .64; rect(x, water.level, TILE, ground(wx) - water.level, t.water); ctx.globalAlpha = 1;
    rect(x, water.level, TILE, 3, '#acd5cc');
    if (col % 4 === 0) rect(x + Math.sin(time * 2 + col) * 4, water.level + 8 + col % 3 * 5, 12, 2, '#93c6c4');
  }
  ctx.restore();
  if (paused || document.querySelector('dialog[open]')) {
    rect(0, 0, viewWidth, 576, '#11231b55');
    if (paused && !document.querySelector('dialog[open]')) {
      ctx.fillStyle = '#f0efd3'; ctx.textAlign = 'center'; ctx.font = '24px monospace'; ctx.fillText('A moment to rest.', viewWidth / 2, 265);
      ctx.font = '14px monospace'; ctx.fillText('Press Escape or pause to continue', viewWidth / 2, 300); ctx.textAlign = 'left';
    }
  }
}
function burst(x, y, color, count = 7) {
  for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - .5) * 110, vy: -Math.random() * 95,
    life: .3, maxLife: .3, size: 2 + i % 3, color });
}
function rifleAim() {
  if (!mouseAim.active) return { dx: player.facing, dy: 0, angle: player.facing < 0 ? Math.PI : 0 };
  const bounds = canvas.getBoundingClientRect();
  const x = (mouseAim.clientX - bounds.left) / bounds.width * viewWidth + camera;
  const y = (mouseAim.clientY - bounds.top) / bounds.height * canvas.height + Math.round(cameraY);
  const dx = x - (player.x + 12), dy = y - (player.y + 22), length = Math.hypot(dx, dy);
  if (length < 1) return { dx: player.facing, dy: 0, angle: player.facing < 0 ? Math.PI : 0 };
  return { dx: dx / length, dy: dy / length, angle: Math.atan2(dy, dx) };
}
function fire() {
  if (player.shotCooldown > 0 || player.roll > 0) return;
  player.shotCooldown = .3; player.muzzle = .065;
  const aim = rifleAim();
  // Check the path to the muzzle so a barrel poking into a slope cannot fire through it.
  for (let d = 0; d <= 28; d += 2) {
    const x = player.x + 12 + aim.dx * d, y = player.y + 22 + aim.dy * d;
    if (y >= ground(x)) { burst(x, y, '#c4ad83', 3); return; }
  }
  bullets.push({ x: player.x + 12 + aim.dx * 28, y: player.y + 22 + aim.dy * 28, vx: aim.dx * 820, vy: aim.dy * 820, life: .85 });
  player.vx -= aim.dx * 20;
  beep(100, .06);
}
function startRoll() {
  if (player.rollCooldown > 0 || !player.ground || player.swimming) return;
  player.roll = ROLL_DURATION; player.rollCooldown = ROLL_COOLDOWN;
  player.rollDirection = player.facing; player.invincible = Math.max(player.invincible, ROLL_INVULNERABILITY);
  burst(player.x + 12, player.y + 37, palette[biome(player.x)].grass, 10);
  beep(150, .045);
}
function moveHorizontal(distance) {
  // Small collision steps prevent fast rolls from passing through rising terrain.
  const steps = Math.max(1, Math.ceil(Math.abs(distance) / 4)), step = distance / steps;
  for (let i = 0; i < steps; i++) {
    const nextX = Math.max(24, player.x + step), floor = ground(nextX + 12), feet = player.y + 40;
    if (floor < feet - 1) {
      const rise = feet - floor;
      if ((player.ground || player.swimming) && rise <= 17) player.y = floor - 40;
      else { player.vx = 0; break; }
    }
    player.x = nextX;
  }
}
function updateBullets(dt) {
  for (const shot of bullets) {
    shot.life -= dt;
    shot.vx ??= shot.direction * 820; shot.vy ??= 0;
    const steps = Math.max(1, Math.ceil(Math.hypot(shot.vx, shot.vy) * dt / 5));
    for (let step = 0; step < steps && shot.life > 0; step++) {
      shot.x += shot.vx * dt / steps; shot.y += shot.vy * dt / steps;
      if (shot.y >= ground(shot.x)) { shot.life = 0; burst(shot.x, shot.y, '#c4ad83', 3); break; }
      for (const e of enemies.active()) {
        const spec = ScriptoriaEnemies.TYPES[e.type];
        if (Math.abs(shot.x - e.x) < spec.width / 2 + 2 && shot.y >= e.y && shot.y <= e.y + spec.height) {
          const hit = enemies.hit(e.id); shot.life = 0;
          if (hit.killed) player.hp = Math.min(5, player.hp + 1);
          burst(shot.x, shot.y, hit.killed ? '#d8c591' : '#b1bdb3', hit.killed ? 7 : 3); beep(hit.killed ? 340 : 220, .06); break;
        }
      }
    }
  }
  bullets = bullets.filter(shot => shot.life > 0);
}
function respawn() {
  player.x = world.checkpoint || 80; player.y = ground(player.x + 12) - 40;
  player.vx = player.vy = 0; player.hp = 5; player.invincible = 1.5;
  player.roll = 0; player.ground = true; player.swimming = false; bullets = []; hostileBullets = [];
  camera = Math.max(0, player.x - Math.min(330, viewWidth * .3)); cameraY = clamp(player.y + 40 - 400, -260, 110);
  toast('A fresh start at your last resting place. Your notes are safe.');
}
function hurtPlayer(damage, sourceX) {
  if (player.invincible > 0 || enemies.safe(player.x + 12)) return false;
  player.hp -= damage; player.invincible = 1.15; player.vy = -200;
  player.vx = sourceX > player.x + 12 ? -180 : 180;
  beep(90, .14); if (player.hp <= 0) respawn();
  return true;
}
function updateHostileBullets(dt) {
  for (const shot of hostileBullets) {
    shot.life -= dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(shot.vx, shot.vy) * dt / 4));
    for (let i = 0; i < steps && shot.life > 0; i++) {
      shot.x += shot.vx * dt / steps; shot.y += shot.vy * dt / steps;
      if (shot.y >= ground(shot.x) || enemies.safe(shot.x)) { shot.life = 0; break; }
      if (shot.x >= player.x - 2 && shot.x <= player.x + 26 && shot.y >= player.y && shot.y <= player.y + 40) {
        shot.life = 0; hurtPlayer(1, shot.x - shot.vx * .05); break;
      }
    }
  }
  hostileBullets = hostileBullets.filter(shot => shot.life > 0);
}
function update(dt) {
  time += dt;
  for (const key of ['invincible', 'roll', 'rollCooldown', 'shotCooldown', 'muzzle', 'jumpBuffer', 'swimKick']) player[key] = Math.max(0, player[key] - dt);
  const move = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const jumpHeld = keys.has(' ') || keys.has('w') || keys.has('arrowup');
  const water = terrain.waterAt(player.x + 12);
  player.swimming = !!water && player.y + 40 > water.level + 8;
  player.coyote = player.ground ? .1 : Math.max(0, player.coyote - dt);
  if (pressed.has(' ') || pressed.has('w') || pressed.has('arrowup')) player.jumpBuffer = .13;
  if (move && player.roll <= 0) player.facing = move;
  if (pressed.has('e')) startRoll();
  if (player.roll > 0) player.vx = player.rollDirection * 470;
  else player.vx = approach(player.vx, move * (player.swimming ? 155 : 245), (move ? player.ground ? 1600 : 1000 : 1850) * dt);
  if (player.swimming) {
    const targetY = water.level - 24;
    player.vy += ((targetY - player.y) * 16 - player.vy * 4) * dt;
    if (jumpHeld && player.swimKick <= 0) { player.vy = -290; player.swimKick = .36; }
  } else {
    if (player.jumpBuffer > 0 && player.coyote > 0 && player.roll <= 0) {
      player.vy = -440; player.ground = false; player.coyote = 0; player.jumpBuffer = 0;
      burst(player.x + 12, player.y + 40, palette[biome(player.x)].grass, 4);
    }
    if (!jumpHeld && player.vy < -185) player.vy = -185;
    player.vy += 1100 * dt;
  }
  moveHorizontal(player.vx * dt);
  player.y += player.vy * dt;
  const floor = ground(player.x + 12);
  if (player.y + 40 >= floor && player.vy >= 0) { player.y = floor - 40; player.vy = 0; player.ground = true; }
  else player.ground = false;
  if (keys.has('p') || pressed.has('p') || mouseAim.firing || pressed.has('mouseFire')) fire();
  enemies.sync(Math.max(0, player.x - Math.min(330, viewWidth * .3)), viewWidth);
  updateBullets(dt);
  const attacks = enemies.update(dt, player);
  hostileBullets.push(...attacks.shots);
  updateHostileBullets(dt);
  for (const strike of attacks.strikes) {
    burst(strike.x, strike.y - 4, '#b2b8a2', 12);
    if (Math.abs(player.x + 12 - strike.x) < strike.radius && Math.abs(player.y + 40 - strike.y) < 50) hurtPlayer(strike.damage, strike.x);
  }
  for (const e of enemies.active()) {
    const spec = ScriptoriaEnemies.TYPES[e.type];
    if (Math.abs(e.x - (player.x + 12)) < spec.width / 2 + 10 && player.y + 40 > e.y && player.y < e.y + spec.height) hurtPlayer(spec.damage, e.x);
  }
  for (const particle of particles) { particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 180 * dt; }
  particles = particles.filter(p => p.life > 0);
  atVillage = isAtScriptorium();
  if (atVillage) { world.checkpoint = nearestVillage(player.x).x + 14; player.hp = 5; }
  world.maxX = Math.max(world.maxX, player.x);
  camera = Math.max(0, player.x - Math.min(330, viewWidth * .3));
  cameraY += (clamp(player.y + 40 - 400, -260, 110) - cameraY) * Math.min(1, dt * 5);
  if (pressed.has('r')) openJournal();
  pressed.clear(); updateHud();
}
function updateHud() {
  const p = palette[biome(player.x)], route = terrain.route(player.x + 12);
  $('distance').textContent = Math.floor(Math.max(0, world.maxX - 80) / 5).toLocaleString();
  $('hearts').textContent = Array.from({ length: 5 }, (_, i) => i < player.hp ? '♥' : '♡').join(' ');
  $('remaining').textContent = atVillage ? 'Arrived' : Math.max(0, Math.ceil((route.next - player.x - 12) / 5)).toLocaleString() + ' m';
  $('questText').textContent = atVillage ? 'Rest. Reflect. Write a new entry.' : 'Find the next scriptorium';
  $('progress').style.width = (atVillage ? 100 : clamp((player.x + 12 - route.previous) / (route.next - route.previous) * 100, 0, 100)) + '%';
  $('biome').textContent = p.name; $('biomeDescription').textContent = player.swimming ? 'Swimming · hold Space to paddle' : p.desc; $('biomeIcon').textContent = p.icon;
  $('worldLabel').textContent = world.name; $('seedLabel').textContent = world.seed; $('noteCount').textContent = world.notes.length;
  $('prompt').hidden = !atVillage;
  $('journalBtn').disabled = !atVillage;
  $('journalBtn').title = atVillage ? 'Open the scriptorium journal' : 'Your journal is available only at a scriptorium';
  $('rollStatus').textContent = player.roll > 0 ? 'Rolling' : player.swimming ? 'Roll · on land' : player.rollCooldown > 0 ? 'Roll · ' + player.rollCooldown.toFixed(1) + 's' : 'Roll ready';
  $('rollStatus').classList.toggle('ready', player.rollCooldown <= 0 && !player.swimming);
}
function frame(stamp) {
  const dt = Math.min((stamp - lastTime) / 1000 || 0, .035); lastTime = stamp;
  if (!paused && !document.querySelector('dialog[open]')) update(dt);
  render(); requestAnimationFrame(frame);
}
function beep(freq, duration) {
  if (!sound) return;
  try {
    audio = audio || new AudioContext();
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = 'square'; osc.frequency.value = freq; gain.gain.value = .025;
    osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration);
  } catch {}
}
function clearInput() { keys.clear(); pressed.clear(); mouseAim.firing = false; }
function togglePause() { paused = !paused; $('pauseBtn').textContent = paused ? '▶' : 'Ⅱ'; clearInput(); }
function pressKey(key) { if (!keys.has(key)) pressed.add(key); keys.add(key); }
document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea')) return;
  const key = e.key.toLowerCase();
  if (key === 'escape') { if (!document.querySelector('dialog[open]')) { e.preventDefault(); togglePause(); } return; }
  if (document.querySelector('dialog[open]') || paused) return;
  if ([' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) e.preventDefault();
  if (!e.repeat) pressKey(key);
});
document.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { clearInput(); save(); });
document.addEventListener('visibilitychange', () => { clearInput(); save(); });
window.addEventListener('beforeunload', save); setInterval(save, 3000);
$('pauseBtn').onclick = togglePause;
$('soundBtn').onclick = () => { sound = !sound; $('soundBtn').textContent = sound ? 'Sound on' : 'Sound off'; beep(500, .1); };
window.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
  mouseAim.active = true; mouseAim.clientX = e.clientX; mouseAim.clientY = e.clientY;
});
canvas.addEventListener('pointerdown', e => {
  if ((e.pointerType !== 'mouse' && e.pointerType !== 'pen') || e.button !== 0 || paused || document.querySelector('dialog[open]')) return;
  e.preventDefault(); canvas.focus();
  mouseAim.active = true; mouseAim.clientX = e.clientX; mouseAim.clientY = e.clientY;
  mouseAim.firing = true; pressed.add('mouseFire');
});
window.addEventListener('pointerup', e => { if (e.button === 0) mouseAim.firing = false; });
window.addEventListener('pointercancel', () => { mouseAim.firing = false; pressed.delete('mouseFire'); });
document.addEventListener('pointerleave', () => { mouseAim.firing = false; pressed.delete('mouseFire'); });
for (const button of document.querySelectorAll('[data-key]')) {
  button.addEventListener('pointerdown', e => {
    e.preventDefault(); button.setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch') mouseAim.active = false;
    if (!paused && !document.querySelector('dialog[open]')) pressKey(button.dataset.key);
  });
  button.addEventListener('pointerup', () => keys.delete(button.dataset.key));
  button.addEventListener('pointercancel', () => keys.delete(button.dataset.key));
  button.addEventListener('lostpointercapture', () => keys.delete(button.dataset.key));
}
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => { button.closest('dialog').close(); clearInput(); };
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('close', clearInput);
function openJournal() {
  if (!isAtScriptorium()) { toast('Find a scriptorium to open your journal.'); return; }
  if (document.querySelector('dialog[open]')) return;
  clearInput(); atVillage = true; selectedNote = null;
  $('notebookTitle').textContent = 'The village scriptorium';
  $('journalHint').textContent = 'You are safe here. Read your notes or put today’s learning into words.';
  listNotes(); editNote(null); $('notebook').showModal();
}
function listNotes() {
  $('noteList').replaceChildren();
  for (const note of world.notes.slice().reverse()) {
    const button = document.createElement('button'); button.textContent = note.subject;
    button.onclick = () => editNote(note); $('noteList').append(button);
  }
}
function editNote(note) {
  if (!isAtScriptorium()) return;
  selectedNote = note?.id || null;
  $('subject').value = note?.subject || ''; $('noteBody').value = note?.body || '';
  $('noteMeta').textContent = note ? 'Village ' + note.village + ' · ' + new Date(note.updated).toLocaleDateString() : 'A new page in your journey';
  $('deleteNote').hidden = !note;
}
$('journalBtn').onclick = openJournal;
$('newNote').onclick = () => editNote(null);
$('noteForm').onsubmit = e => {
  e.preventDefault(); if (!isAtScriptorium()) return;
  const note = { id: selectedNote || crypto.randomUUID(), subject: $('subject').value.trim(), body: $('noteBody').value.trim(), village: nearestVillage(player.x).index, updated: Date.now() };
  if (!note.subject || !note.body) return;
  const index = world.notes.findIndex(n => n.id === note.id);
  if (index < 0) world.notes.push(note); else world.notes[index] = note;
  save(); listNotes(); editNote(note); updateHud();
  toast(storageOK ? 'Entry saved. A little wiser, a little further.' : 'Entry kept in memory. Export a backup to save it.');
};
$('deleteNote').onclick = () => {
  if (!isAtScriptorium()) return;
  world.notes = world.notes.filter(n => n.id !== selectedNote); save(); listNotes(); editNote(null); updateHud();
};
function listWorlds() {
  $('worldList').replaceChildren();
  for (const w of worlds) {
    const row = document.createElement('div'), info = document.createElement('div'), name = document.createElement('strong');
    const meta = document.createElement('small'), button = document.createElement('button');
    name.textContent = w.name; meta.textContent = Math.floor(Math.max(0, w.maxX - 80) / 5) + ' m explored · ' + w.notes.length + ' entries';
    info.append(name, meta); button.textContent = w.id === world.id ? 'Current world' : 'Continue ↗';
    button.onclick = () => { save(); loadWorld(w); save(); updateHud(); $('worlds').close(); };
    row.append(info, button); $('worldList').append(row);
  }
}
$('worldsBtn').onclick = () => { clearInput(); listWorlds(); $('worlds').showModal(); };
$('newWorldForm').onsubmit = e => {
  e.preventDefault(); const name = $('worldName').value.trim(); if (!name) return;
  save(); const next = createWorld(name, $('worldSeed').value.trim()); worlds.push(next); loadWorld(next);
  save(); updateHud(); $('worlds').close(); $('newWorldForm').reset(); toast('A new journey begins.');
};
$('helpBtn').onclick = () => { clearInput(); $('help').showModal(); };
$('exportBtn').onclick = () => {
  save(); const blob = new Blob([JSON.stringify({ version: 1, worlds, activeId: world.id }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'scriptoria-backup.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 5000000) throw Error();
    const data = JSON.parse(await file.text());
    if (data.version !== 1 || !Array.isArray(data.worlds) || !data.worlds.length) throw Error();
    for (const w of data.worlds) {
      if (typeof w.id !== 'string' || typeof w.name !== 'string' || typeof w.seed !== 'string' || !Number.isFinite(w.x) || w.x < 0 ||
        !Number.isFinite(w.maxX) || !Number.isFinite(w.checkpoint) || !Number.isInteger(w.hp) || w.hp < 1 || w.hp > 5 ||
        !Array.isArray(w.notes) || !Array.isArray(w.defeated) || !w.defeated.every(Number.isInteger) ||
        !w.notes.every(n => typeof n.id === 'string' && typeof n.subject === 'string' && typeof n.body === 'string' && Number.isFinite(n.updated) && Number.isFinite(n.village))) throw Error();
    }
    for (const w of data.worlds) { if (worlds.some(old => old.id === w.id)) w.id = crypto.randomUUID(); worlds.push(w); }
    save(); listWorlds(); toast('Backup imported. Choose a world to continue.');
  } catch { toast('This file is not a valid Scriptoria backup.'); }
  e.target.value = '';
};
function resizeViewport() {
  viewWidth = Math.max(320, Math.round(canvas.clientWidth / canvas.clientHeight * 576));
  canvas.width = viewWidth;
  camera = Math.max(0, player.x - Math.min(330, viewWidth * .3));
}
loadWorld(world); resizeViewport();
new ResizeObserver(resizeViewport).observe(canvas);
updateHud(); save(); requestAnimationFrame(frame);
