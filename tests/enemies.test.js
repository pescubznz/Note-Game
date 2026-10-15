const test = require('node:test');
const assert = require('node:assert/strict');
const { create, TYPES } = require('../enemies');
const Terrain = require('../world');

function fixture(type, overrides = {}) {
  const index = Object.keys(TYPES).indexOf(type);
  const terrain = {
    random: () => (index + .1) / 5, ground: () => 416, waterAt: () => null,
    nearestVillage: () => ({ x: 100000 }), ...overrides
  };
  const world = { defeated: [] }, defeated = new Set();
  const director = create(terrain, world, defeated);
  director.sync(0, 1200);
  // Keep just one live actor in the arena; unrelated spawns cannot affect assertions.
  const enemy = director.get(1);
  for (const other of director.active()) if (other.id !== 1) defeated.add(other.id);
  return { terrain, world, defeated, director, enemy };
}
function advance(director, seconds, target) {
  const shots = [], strikes = [];
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    const events = director.update(1 / 60, target);
    shots.push(...events.shots); strikes.push(...events.strikes);
  }
  return { shots, strikes };
}

test('all five species occur deterministically in real seeded terrain', () => {
  const terrain = Terrain.create('482719'), world = { defeated: [] };
  const a = create(terrain, world), b = create(terrain, { defeated: [] });
  const kinds = new Set();
  for (let id = 0; id < 250; id++) {
    const first = a.get(id), second = b.get(id);
    assert.deepEqual(first, second);
    if (first) kinds.add(first.type);
  }
  assert.equal(kinds.size, 5);
});

test('enemies patrol at a distance, detect nearby players, and pursue them', () => {
  const { director, enemy } = fixture('wolf');
  advance(director, 1, { x: 50, y: 376 });
  assert.equal(enemy.alert, 0); assert.equal(enemy.state, 'idle');
  const before = enemy.x;
  advance(director, .3, { x: before + 125, y: 376 });
  assert.ok(enemy.alert > 0); assert.ok(enemy.x > before + 20);
  assert.equal(enemy.state, 'chase');
});

test('boars telegraph and charge; wolves pounce into the air', () => {
  for (const type of ['boar', 'wolf']) {
    const { director, enemy } = fixture(type);
    enemy.cooldown = 0;
    const target = { x: enemy.x + 50, y: 376 };
    advance(director, .05, target); assert.equal(enemy.state, 'windup');
    const before = enemy.x;
    advance(director, type === 'boar' ? .5 : .25, target);
    assert.equal(enemy.state, type === 'boar' ? 'charge' : 'pounce');
    assert.ok(enemy.x > before);
    if (type === 'wolf') assert.ok(enemy.y + TYPES.wolf.height < 400);
  }
});

test('stonebacks move slowly, survive three hits, and telegraph a heavy slam', () => {
  const { director, enemy, world } = fixture('stoneback');
  assert.ok(TYPES.stoneback.speed < TYPES.wolf.speed / 2);
  for (let i = 0; i < 3; i++) assert.equal(director.hit(enemy.id).killed, false);
  assert.equal(enemy.hp, 1);
  enemy.cooldown = 0;
  const events = advance(director, .8, { x: enemy.x + 45, y: 376 });
  assert.equal(events.strikes.length, 1); assert.equal(events.strikes[0].damage, 2);
  assert.equal(director.hit(enemy.id).killed, true); assert.ok(world.defeated.includes(enemy.id));
  assert.equal(director.active().some(e => e.id === enemy.id), false);
});

test('duskwings hover, telegraph, and dive toward the locked player position', () => {
  const { director, enemy } = fixture('bat');
  assert.ok(enemy.y + TYPES.bat.height < 350);
  enemy.cooldown = 0;
  const target = { x: enemy.x + 45, y: 376 };
  advance(director, .1, target); assert.equal(enemy.state, 'windup');
  const before = enemy.y;
  advance(director, .6, target);
  assert.ok(enemy.y > before + 40); assert.equal(enemy.state, 'dive');
});

test('gunners aim before shooting, fire toward the player, and respect terrain cover', () => {
  const { director, enemy } = fixture('bandit');
  enemy.cooldown = 0;
  const target = { x: enemy.x - 150, y: 376 };
  assert.equal(advance(director, .2, target).shots.length, 0);
  assert.equal(enemy.state, 'windup');
  const shots = advance(director, .6, target).shots;
  assert.equal(shots.length, 1); assert.ok(shots[0].vx < 0); assert.ok(Math.abs(shots[0].vy) < 50);
  assert.equal(advance(director, .3, target).shots.length, 0, 'shots require a cooldown');
  const blocked = fixture('bandit', { ground: x => x > 350 && x < 390 ? 250 : 416 });
  blocked.enemy.cooldown = 0;
  assert.equal(advance(blocked.director, 2, { x: 300, y: 376 }).shots.length, 0);
});

test('water and village boundaries stop movement without making a visible actor disappear', () => {
  for (const edge of ['lake', 'village']) {
    const config = edge === 'lake' ? { waterAt: x => x >= 510 ? { level: 440 } : null } : { nearestVillage: () => ({ x: 780 }) };
    const { director, enemy } = fixture('boar', config);
    const identity = enemy;
    enemy.cooldown = 0;
    for (let frame = 0; frame < 600; frame++) {
      director.sync(0, 1200);
      director.update(1 / 60, { x: edge === 'lake' ? 535 : 510, y: 376 });
      assert.strictEqual(director.get(enemy.id), identity);
      assert.ok(director.active().includes(identity));
    }
    assert.ok(enemy.x < (edge === 'lake' ? 510 : 530));
  }
});

test('visible actors retain position and damage across camera changes, unloading, and save restoration', () => {
  const { director, enemy, world, terrain, defeated } = fixture('stoneback');
  enemy.x += 140; enemy.y = 380; director.hit(enemy.id);
  const position = enemy.x;
  // The home may leave the viewport while a chasing actor is still visible.
  for (const width of [520, 1200, 1600]) {
    director.sync(510, width);
    assert.strictEqual(director.get(enemy.id), enemy); assert.equal(enemy.x, position);
  }
  director.sync(15000, 520);
  assert.equal(director.active().some(e => e.id === enemy.id), false);
  director.sync(0, 1200);
  assert.equal(director.get(enemy.id).x, position); assert.equal(director.get(enemy.id).hp, 3);
  director.save();
  const restored = create(terrain, JSON.parse(JSON.stringify(world)), defeated);
  restored.sync(0, 1200);
  assert.equal(restored.get(enemy.id).x, position); assert.equal(restored.get(enemy.id).hp, 3);
  for (let i = 0; i < 3; i++) restored.hit(enemy.id);
  restored.sync(15000, 520); restored.sync(0, 1200);
  assert.equal(restored.get(enemy.id), null, 'defeated enemies must never respawn');
});

test('villages are sanctuaries: no acquisition or fire at a sheltered player', () => {
  const { director, enemy } = fixture('bandit', { nearestVillage: () => ({ x: 780 }) });
  enemy.cooldown = 0;
  const events = advance(director, 3, { x: 550, y: 376 });
  assert.equal(events.shots.length, 0); assert.equal(enemy.alert, 0);
});
