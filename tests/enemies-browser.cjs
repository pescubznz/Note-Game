const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:3000');
    await page.evaluate(() => {
      // Select a real, seeded enemy and a nearby unobstructed firing position.
      window.enemyArena = type => {
        const arena = createWorld('Enemy tests', '482719'); worlds = [arena]; loadWorld(arena); paused = true;
        let chosen, targetX;
        for (let id = 1; id < 300 && !chosen; id++) {
          const e = enemies.get(id); if (!e || e.type !== type) continue;
          for (const side of [-1, 1]) {
            const x = e.x + side * 135;
            if (!terrain.waterAt(x) && !enemies.safe(x) && enemies.clearSight(e.x, e.y + 22, x, ground(x) - 18)) {
              chosen = e; targetX = x; break;
            }
          }
        }
        if (!chosen) throw Error('No usable enemy arena for ' + type);
        for (let id = 0; id < 350; id++) if (id !== chosen.id) { defeated.add(id); world.defeated.push(id); }
        player.x = targetX - 12; player.y = ground(targetX) - 40; player.ground = true;
        player.vx = player.vy = 0; player.hp = 5; player.invincible = 0;
        chosen.cooldown = 0; chosen.state = 'idle'; chosen.alert = 0;
        camera = Math.max(0, player.x - 330); enemies.sync(camera, viewWidth);
        cameraY = clamp(player.y + 40 - 400, -260, 110);
        clearInput(); return chosen;
      };
    });
    const gunner = await page.evaluate(() => {
      const e = enemyArena('bandit');
      update(1 / 60); render();
      return { id: e.id, state: e.state, shots: hostileBullets.length };
    });
    assert.equal(gunner.state, 'windup'); assert.equal(gunner.shots, 0);
    if (process.env.SCREENSHOTS) await page.screenshot({ path: process.env.SCREENSHOTS + '/gunner-aim.png' });
    const fired = await page.evaluate(() => {
      for (let i = 0; i < 43; i++) update(1 / 60);
      return hostileBullets.length;
    });
    assert.ok(fired > 0, 'a gunner must produce an actual visible projectile');
    const hurt = await page.evaluate(() => {
      for (let i = 0; i < 100; i++) update(1 / 60);
      return player.hp < 5;
    });
    assert.equal(hurt, true);
    console.log('PASS: human AI aims, fires visible projectiles, and damages the player');

    const projectiles = await page.evaluate(() => {
      // Isolate bullet collision from contact attacks and use the level starting ground.
      player.x = 80; player.y = 376; player.vx = player.vy = 0; player.ground = true;
      player.hp = 5; player.invincible = 0; player.roll = player.rollCooldown = 0; player.facing = -1;
      hostileBullets = [{x:45,y:398,vx:290,vy:0,life:1}];
      pressed.add('e');
      for (let i = 0; i < 18; i++) update(1 / 60);
      const dodged = player.hp === 5 && hostileBullets.length === 0;
      player.x = 80; player.y = 376; player.vx = player.vy = 0; player.roll = 0; player.invincible = 0;
      hostileBullets = [{x:70,y:398,vx:290,vy:0,life:1}];
      updateHostileBullets(.1);
      const vulnerable = player.hp === 4;
      player.invincible = 0;
      hostileBullets = [{x:80,y:430,vx:290,vy:0,life:1}]; updateHostileBullets(.05);
      const cover = hostileBullets.length === 0 && player.hp === 4;
      const villageX = terrain.villageAt(1);
      player.x = villageX; player.y = 376;
      hostileBullets = [{x:villageX-20,y:398,vx:290,vy:0,life:1}]; updateHostileBullets(.1);
      const sanctuary = player.hp === 4 && hostileBullets.length === 0;
      return { dodged, vulnerable, cover, sanctuary };
    });
    assert.ok(Object.values(projectiles).every(Boolean), JSON.stringify(projectiles));
    console.log('PASS: rolls dodge enemy fire; damage resumes afterward; ground and villages block hostile shots');

    const slamDamage = await page.evaluate(() => {
      const e = enemyArena('stoneback');
      player.x = e.x + 43; player.y = ground(player.x + 12) - 40;
      player.hp = 5; player.invincible = 0;
      for (let i = 0; i < 53; i++) update(1 / 60);
      return player.hp;
    });
    assert.equal(slamDamage, 3);
    console.log('PASS: a telegraphed stoneback slam deals two hearts of damage');

    const durable = await page.evaluate(() => {
      const e = enemyArena('stoneback'); e.cooldown = 3;
      const health = [];
      for (let i = 0; i < 3; i++) {
        bullets = [{x:e.x-8,y:e.y+18,direction:1,life:.5}]; updateBullets(.01); health.push(e.hp);
      }
      const remains = enemies.active().includes(e);
      save(); return { id:e.id, health, remains, x:e.x };
    });
    assert.deepEqual(durable.health, [3,2,1]); assert.equal(durable.remains, true);
    await page.reload();
    const restored = await page.evaluate(id => { paused = true; const e = enemies.get(id); return {hp:e.hp,x:e.x}; }, durable.id);
    assert.equal(restored.hp, 1); assert.ok(Math.abs(restored.x - durable.x) < 10);
    const killed = await page.evaluate(id => {
      const e = enemies.get(id); bullets = [{x:e.x-8,y:e.y+18,direction:1,life:.5}]; updateBullets(.01);
      save(); return defeated.has(id) && !enemies.active().includes(e);
    }, durable.id);
    assert.equal(killed, true);
    await page.reload();
    assert.equal(await page.evaluate(id => enemies.get(id) === null, durable.id), true);
    console.log('PASS: armored enemies survive three rifle hits; wounds survive reload and kills stay defeated');
    assert.deepEqual(errors, []);
    console.log('PASS: no browser errors in hostile combat');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
