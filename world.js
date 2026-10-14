/* Seeded world geometry shared by the game and terrain tests. Units are pixels (5 = 1 meter). */
(function (root) {
  'use strict';
  const TILE = 16;
  const VILLAGE_SPACING = 5000;
  const BIOME_WIDTH = 3000;
  const FEATURE_WIDTH = 1800;
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const smooth = n => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };
  function hash(value) {
    let n = 2166136261;
    for (const c of String(value)) { n ^= c.charCodeAt(0); n = Math.imul(n, 16777619); }
    return n >>> 0;
  }
  function create(seed) {
    const heights = new Map();
    const features = new Map();
    const random = (n, salt = 0) => hash(seed + ':' + n + ':' + salt) / 4294967295;
    const biome = x => Math.floor(Math.max(0, x) / BIOME_WIDTH) % 5;
    function villageAt(index) {
      if (index < 1) return 80;
      return 80 + index * VILLAGE_SPACING + Math.round((random(index, 'village') - .5) * 1000 / TILE) * TILE;
    }
    function nearbyVillages(x, radius = 1200) {
      const first = Math.max(1, Math.floor((x - radius - 80) / VILLAGE_SPACING) - 1);
      const last = Math.max(first, Math.ceil((x + radius - 80) / VILLAGE_SPACING) + 1);
      const result = [];
      for (let index = first; index <= last; index++) {
        const position = villageAt(index);
        if (Math.abs(position - x) <= radius + 500) result.push({ index, x: position });
      }
      return result;
    }
    function nearestVillage(x) {
      const index = Math.max(1, Math.round((x - 80) / VILLAGE_SPACING));
      let closest = { index, x: villageAt(index) };
      for (let i = Math.max(1, index - 1); i <= index + 1; i++) {
        const position = villageAt(i);
        if (Math.abs(position - x) < Math.abs(closest.x - x)) closest = { index: i, x: position };
      }
      return closest;
    }
    function route(x) {
      let index = Math.max(1, Math.floor((x - 80) / VILLAGE_SPACING));
      while (villageAt(index) + 26 <= x) index++;
      while (index > 1 && villageAt(index - 1) + 26 > x) index--;
      return { next: villageAt(index) + 26, previous: index > 1 ? villageAt(index - 1) + 26 : 80, index };
    }
    function featureAt(index) {
      if (features.has(index)) return features.get(index);
      const start = index * FEATURE_WIDTH;
      const mountainX = start + 520 + random(index, 'peak-x') * 160;
      const lakeX = start + 1320 + random(index, 'lake-x') * 120;
      const type = biome(lakeX);
      const feature = {
        mountainX, mountainRadius: 430 + random(index, 'peak-width') * 110,
        mountainHeight: (biome(mountainX) === 2 || biome(mountainX) === 4 ? 190 : 95) + random(index, 'peak-height') * 70,
        lakeX, lakeRadius: 180 + random(index, 'lake-width') * 70,
        waterLevel: type === 3 ? 432 : 440,
        lakeDepth: 56 + random(index, 'lake-depth') * 30,
        hasLake: type === 3 || random(index, 'lake') > (type === 1 ? .55 : .15)
      };
      if (features.size > 256) features.clear();
      features.set(index, feature);
      return feature;
    }
    function lakeAt(x) {
      const feature = featureAt(Math.floor(Math.max(0, x) / FEATURE_WIDTH));
      if (!feature.hasLake || Math.abs(x - feature.lakeX) >= feature.lakeRadius) return null;
      return feature;
    }
    function ground(x) {
      const col = Math.floor(x / TILE);
      if (heights.has(col)) return heights.get(col);
      const wx = col * TILE + TILE / 2;
      const feature = featureAt(Math.floor(Math.max(0, wx) / FEATURE_WIDTH));
      let height = 405 + Math.sin(wx / 160 + random(0, 'phase') * 6) * 22 + Math.sin(wx / 71) * 9;
      const peakDistance = Math.abs(wx - feature.mountainX) / feature.mountainRadius;
      if (peakDistance < 1) height -= feature.mountainHeight * (1 + Math.cos(peakDistance * Math.PI)) / 2;
      const lake = lakeAt(wx);
      if (lake) {
        const t = Math.abs(wx - lake.lakeX) / lake.lakeRadius;
        // Smooth ramps into the basin keep both shores traversable.
        const basin = lake.waterLevel - 42 + (lake.lakeDepth + 42) * (1 - t * t) ** 2;
        height = Math.max(height, height + (basin - height) * smooth((1 - t) / .35));
      }
      const settlement = nearestVillage(wx);
      const flatWeight = 1 - smooth((Math.abs(wx - (settlement.x + 16)) - 190) / 330);
      height = height * (1 - flatWeight) + 416 * flatWeight;
      const spawnWeight = 1 - smooth((wx - 180) / 220);
      height = height * (1 - spawnWeight) + 416 * spawnWeight;
      height = Math.round(clamp(height, 120, 536) / 8) * 8;
      if (heights.size > 8192) heights.clear();
      heights.set(col, height);
      return height;
    }
    function waterAt(x) {
      const lake = lakeAt(x);
      if (!lake || ground(x) <= lake.waterLevel + 4) return null;
      return { level: lake.waterLevel, depth: ground(x) - lake.waterLevel };
    }
    return { random, biome, ground, waterAt, villageAt, nearestVillage, nearbyVillages, route };
  }
  const api = { create, TILE, VILLAGE_SPACING, BIOME_WIDTH };
  root.ScriptoriaTerrain = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
