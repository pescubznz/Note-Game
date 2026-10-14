const test = require('node:test');
const assert = require('node:assert/strict');
const { create, TILE } = require('../world.js');

test('seeds reproduce terrain, lakes, and villages, and different seeds change the world', () => {
  const a = create('notes'), b = create('notes'), c = create('different');
  let different = false;
  for (let x = 0; x < 20000; x += 73) {
    assert.equal(a.ground(x), b.ground(x));
    assert.deepEqual(a.waterAt(x), b.waterAt(x));
    if (a.ground(x) !== c.ground(x)) different = true;
  }
  assert.equal(a.villageAt(12), b.villageAt(12));
  assert.ok(different);
});

test('village spacing varies between about 800 and 1200 meters, averaging 1000', () => {
  const terrain = create('482719');
  const distances = [];
  for (let i = 1; i <= 1000; i++) {
    const gap = (terrain.villageAt(i + 1) - terrain.villageAt(i)) / 5;
    assert.ok(gap >= 796 && gap <= 1204, String(gap)); distances.push(gap);
  }
  assert.ok(new Set(distances).size > 10);
  assert.ok(Math.abs(distances.reduce((a, b) => a + b, 0) / distances.length - 1000) < 1);
});

test('villages have dry level ground and the route points to the correct next settlement', () => {
  const terrain = create('book');
  for (let i = 1; i <= 50; i++) {
    const center = terrain.villageAt(i);
    for (let x = center - 150; x <= center + 175; x += TILE) {
      assert.equal(terrain.ground(x), 416); assert.equal(terrain.waterAt(x), null);
    }
    assert.equal(terrain.route(center - 200).index, i);
    assert.equal(terrain.route(center + 50).index, i + 1);
    assert.equal(terrain.nearestVillage(center).index, i);
  }
});

test('all five biomes contain traversable terrain with mountain relief and lakes', () => {
  for (const seed of ['482719', 'mountains', 'school', '0', 'a longer world seed']) {
    const terrain = create(seed), types = new Set();
    let min = Infinity, max = -Infinity, wet = 0, biggestStep = 0;
    for (let x = 0; x < 75000; x += TILE) {
      const floor = terrain.ground(x); types.add(terrain.biome(x));
      min = Math.min(min, floor); max = Math.max(max, floor);
      biggestStep = Math.max(biggestStep, Math.abs(floor - terrain.ground(x + TILE)));
      const water = terrain.waterAt(x);
      if (water) { wet++; assert.ok(water.depth > 4 && water.depth < 100); }
    }
    assert.equal(types.size, 5); assert.ok(max - min > 250);
    assert.ok(wet > 150, 'lakes must be common enough to encounter');
    assert.ok(biggestStep <= 24, 'unclimbable terrain step: ' + biggestStep);
  }
});
