const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:3000');
  if (process.env.SCREENSHOTS) await page.screenshot({ path: process.env.SCREENSHOTS + '/start.png' });
  assert.equal(await page.locator('#journalBtn').isDisabled(), true);
  await page.keyboard.press('r');
  await page.waitForTimeout(60);
  assert.equal(await page.locator('#notebook').evaluate(el => el.open), false);
  await page.evaluate(() => openJournal());
  assert.equal(await page.locator('#notebook').evaluate(el => el.open), false);
  console.log('PASS: journal locked in the wilderness for both entry paths');
  await page.keyboard.down('p');
  await page.waitForTimeout(70);
  assert.ok(await page.evaluate(() => bullets.length > 0 || player.shotCooldown > 0));
  await page.keyboard.up('p');
  await page.keyboard.down('e');
  await page.waitForTimeout(70);
  assert.ok(await page.evaluate(() => player.roll > 0 && player.rollCooldown > 0));
  await page.keyboard.up('e');
  await page.waitForTimeout(1150);
  console.log('PASS: P and E keyboard events fire the rifle and start a roll');

  await page.evaluate(() => { paused = true; player.invincible = 0; });
  const physics = await page.evaluate(() => {
    player.x = 80; player.y = 376; player.vx = player.vy = 0; player.ground = true; player.rollCooldown = 0; player.roll = 0; for (let id = 0; id < 20; id++) defeated.add(id);
    keys.add('d'); update(.05); const accelerated = player.vx > 0 && player.vx < 245;
    keys.clear(); update(.05); const stopped = player.vx === 0;
    pressed.add('e'); update(.016); const roll = player.roll > 0 && player.invincible > 0 && player.vx === 470;
    const cooldown = player.rollCooldown; pressed.add('e'); update(.016);
    const noRepeat = player.rollCooldown < cooldown;
    for (let i = 0; i < 75; i++) update(.016);
    const recovered = player.roll === 0 && player.rollCooldown === 0 && player.invincible === 0;
    return { accelerated, stopped, roll, noRepeat, recovered };
  });
  assert.ok(Object.values(physics).every(Boolean), JSON.stringify(physics));
  console.log('PASS: acceleration, braking, dodge window, cooldown, and recovery');
  const combat = await page.evaluate(() => {
    // Put an enemy at the same height and within rifle range on the starting flat.
    loadWorld(createWorld('Combat test', '482719')); paused = true; time = 0;
    player.invincible = 0; player.x = 100; player.y = 376; player.ground = true;
    keys.add('p'); update(.016); const spawned = bullets.length > 0;
    for (let i = 0; i < 30; i++) update(.016);
    keys.clear(); const rangedHit = defeated.has(0);
    defeated.delete(0); world.defeated = [];
    Object.assign(enemies.get(0), {hp:1, x:230, y:391, state:'idle', cooldown:10, alert:0, vy:0});
    time = 0; player.x = 210; player.y = ground(222) - 40; player.hp = 5; player.invincible = 0;
    player.ground = true; player.vx = 0; player.roll = 0; player.rollCooldown = 0; bullets = [];
    pressed.add('e'); update(.016); const dodged = player.hp === 5;
    player.roll = 0; player.invincible = 0; player.x = enemies.get(0).x - 12; player.y = ground(player.x + 12) - 40;
    keys.clear(); update(.016); const damage = player.hp === 4;
    return { spawned, rangedHit, dodged, damage };
  });
  assert.ok(Object.values(combat).every(Boolean), JSON.stringify(combat));
  console.log('PASS: rifle projectile hits at range; rolling prevents contact damage; damage returns afterward');
  const waterAndShots = await page.evaluate(() => {
    loadWorld(createWorld('Water and cover', '482719')); paused = true;
    let lakeX = 500;
    while (!terrain.waterAt(lakeX) || terrain.waterAt(lakeX).depth < 45) lakeX += 8;
    const lake = terrain.waterAt(lakeX);
    player.invincible = 10;
    player.x = lakeX - 12; player.y = lake.level + 15; player.vy = 0; player.ground = false;
    for (let i = 0; i < 240; i++) update(1 / 60);
    const floats = Math.abs(player.y - (lake.level - 24)) < 5;
    player.x = 400; player.y = ground(412) - 40; player.vx = player.vy = 0; player.ground = true;
    // Fire a shot into solid terrain; it must disappear rather than pass through it.
    bullets = [{x:player.x, y:ground(player.x) + 10, direction:1, life:.8}]; updateBullets(.016);
    const cover = bullets.length === 0;
    player.x = 80; player.y = 376; player.shotCooldown = 0; keys.clear(); keys.add('f'); update(.016); keys.clear();
    const oldKeyInactive = bullets.length === 0;
    return {floats, cover, oldKeyInactive};
  });
  assert.ok(Object.values(waterAndShots).every(Boolean), JSON.stringify(waterAndShots));
  console.log('PASS: swimming floats safely, terrain blocks bullets, and F no longer attacks');

  // Restore a persisted world before exercising UI save flows.
  await page.reload();
  await page.evaluate(() => {
    player.x = terrain.villageAt(1) + 14; player.y = 376; player.vx = player.vy = 0;
    player.roll = 0; player.ground = true;
  });
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#journalBtn').isEnabled(), true);
  await page.keyboard.press('r');
  await page.locator('#subject').fill('History');
  await page.locator('#noteBody').fill('Preserve this entry across terrain updates and reloads.');
  await page.locator('#noteForm button[type=submit]').click();
  await page.reload();
  await page.keyboard.press('r');
  await page.locator('#noteList button').click();
  assert.equal(await page.locator('#noteBody').inputValue(), 'Preserve this entry across terrain updates and reloads.');
  if (process.env.SCREENSHOTS) await page.screenshot({ path: process.env.SCREENSHOTS + '/journal.png' });
  await page.locator('#notebook [data-close]').click();
  await page.evaluate(() => { player.x -= 400; player.y = ground(player.x + 12) - 40; });
  await page.waitForTimeout(60);
  assert.equal(await page.locator('#journalBtn').isDisabled(), true);
  console.log('PASS: R opens at a scriptorium; saved notes survive reload; journal locks after leaving');
  await page.locator('#worldsBtn').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportBtn').click();
  const backupPath = await (await downloadPromise).path();
  await page.locator('#worldName').fill('A second journey');
  await page.locator('#worldSeed').fill('second-seed');
  await page.locator('#newWorldForm button').click();
  assert.equal(await page.locator('#worldLabel').textContent(), 'A second journey');
  await page.reload();
  assert.equal(await page.locator('#worldLabel').textContent(), 'A second journey');
  await page.locator('#worldsBtn').click();
  await page.locator('#importFile').setInputFiles(backupPath);
  await page.waitForFunction(() => worlds.length === 3);
  await page.locator('#worldList button').last().click();
  assert.equal(await page.evaluate(() => world.notes[0].body), 'Preserve this entry across terrain updates and reloads.');
  console.log('PASS: multiple worlds, backup export/import, and world switching retain notes');

  const traversal = await page.evaluate(() => {
    paused = true;
    const results = [];
    for (const seed of ['482719', 'school', '0']) {
      loadWorld(createWorld('Traversal', seed)); paused = true;
      let deepestWater = 0, highest = 1000, stalled = false;
      keys.add('d'); keys.add(' ');
      for (let i = 0; i < 22000 && player.x < 16000; i++) {
        player.invincible = 10;
        if (i % 25 === 0) pressed.add(' ');
        const before = player.x;
        update(1 / 60);
        if (i > 21900 && Math.abs(before - player.x) < .001) stalled = true;
        if (player.swimming) deepestWater++;
        highest = Math.min(highest, player.y);
      }
      results.push({ seed, x: player.x, swimmingFrames: deepestWater, highest, stalled });
      keys.clear();
    }
    return results;
  });
  for (const result of traversal) assert.ok(result.x >= 16000 && result.swimmingFrames > 0 && result.highest < 200, JSON.stringify(result));
  console.log('PASS: traverse over 3,000 meters through all five biomes, lakes, and mountains on three seeds', traversal);
  const screens = [];
  for (const [name, target] of [['lake', 1350], ['snow', 7850], ['wetlands', 10300], ['volcanic', 13200]]) {
    await page.evaluate(x => { loadWorld(createWorld('View', '482719')); paused = true; player.x = x; player.y = ground(x + 12) - 40; camera = Math.max(0, x - 330); cameraY = Math.max(-260, Math.min(110, player.y + 40 - 400)); paused = false; updateHud(); }, target);
    await page.waitForTimeout(70);
    if (process.env.SCREENSHOTS) await page.screenshot({ path: process.env.SCREENSHOTS + '/' + name + '.png' }); screens.push(name);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.SCREENSHOTS) await page.screenshot({ path: process.env.SCREENSHOTS + '/mobile.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  for (const key of ['p', 'e', 'r']) assert.equal(await page.locator('[data-key="' + key + '"]').isVisible(), true);
  await page.evaluate(() => { player.shotCooldown = 0; bullets = []; player.roll = 0; player.ground = true; player.y = ground(player.x + 12) - 40; });
  await page.locator('[data-key="p"]').tap();
  await page.waitForTimeout(60);
  assert.ok(await page.evaluate(() => bullets.length > 0 || player.shotCooldown > 0));
  await page.evaluate(() => { player.rollCooldown = 0; player.ground = true; player.y = ground(player.x + 12) - 40; });
  await page.locator('[data-key="e"]').tap();
  await page.waitForTimeout(60);
  assert.ok(await page.evaluate(() => player.roll > 0));
  console.log('PASS: mobile taps fire and roll');

  const legacy = {id:'old-world',name:'Old notes',seed:'482719',x:910,maxX:1900,hp:4,checkpoint:926,notes:[{id:'note1',subject:'Biology',body:'Keep me',village:1,updated:10000}],defeated:[0]};
  await page.addInitScript(w => localStorage.setItem('scriptoria-worlds-v1', JSON.stringify({worlds:[w], activeId:w.id})), legacy);
  await page.reload();
  const migrated = await page.evaluate(() => ({ notes:world.notes, maxX:world.maxX, checkpoint:world.checkpoint, version:world.terrainVersion, x:player.x }));
  assert.equal(migrated.notes[0].body,'Keep me'); assert.equal(migrated.maxX,1900); assert.equal(migrated.checkpoint,80); assert.equal(migrated.version,2); assert.equal(migrated.x,910);
  console.log('PASS: mobile layout and controls; legacy notes and exploration progress preserved');
  assert.deepEqual(errors, []);
  console.log('PASS: no browser JavaScript errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
