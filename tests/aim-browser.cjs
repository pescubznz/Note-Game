const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:3000');
    const box=await page.locator('#game').boundingBox();
    await page.mouse.click(box.x+box.width*.5,box.y+box.height*.25);
    await page.waitForTimeout(50);
    assert.ok(await page.evaluate(()=>bullets.some(b=>b.vx>0&&b.vy<0)));
    await page.evaluate(()=>{player.shotCooldown=0;bullets=[];});
    await page.keyboard.press('p'); await page.waitForTimeout(50);
    assert.ok(await page.evaluate(()=>bullets.some(b=>b.vx>0&&b.vy<0)));
    console.log('PASS: mouse click and P both fire toward the cursor');
    await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
    assert.ok(await page.evaluate(()=>bullets.length>=2));
    await page.evaluate(()=>{paused=true;bullets=[];player.shotCooldown=0;});
    await page.mouse.click(box.x+box.width*.6,box.y+100);
    assert.equal(await page.evaluate(()=>mouseAim.firing),false);
    await page.evaluate(()=>{paused=false;player.shotCooldown=0;});
    await page.locator('#helpBtn').click();
    assert.equal(await page.evaluate(()=>mouseAim.firing),false);
    assert.equal(await page.evaluate(()=>bullets.length),0);
    await page.locator('#help [data-close]').first().click();
    for (const width of [1440,390]) {
      await page.setViewportSize({width,height:1000}); await page.waitForTimeout(80);
      const accuracy=await page.evaluate(()=>{
        paused=true;player.x=7800;player.y=100;camera=7500;cameraY=-123;
        const r=canvas.getBoundingClientRect();
        const results=[];
        for (const [dx,dy] of [[160,-100],[-140,-100],[100,60],[-100,60]]) {
          const tx=player.x+12+dx,ty=player.y+22+dy;
          mouseAim.active=true; mouseAim.clientX=r.left+(tx-camera)/viewWidth*r.width;
          mouseAim.clientY=r.top+(ty-Math.round(cameraY))/canvas.height*r.height;
          bullets=[];player.shotCooldown=0;player.roll=0;fire();
          const shot=bullets[0];
          results.push(!!shot&&Math.abs(shot.vx*dy-shot.vy*dx)<.001);
        }
        mouseAim.active=false;player.facing=-1;bullets=[];player.shotCooldown=0;fire();
        results.push(bullets[0].vx===-820&&bullets[0].vy===0);
        return results;
      });
      assert.ok(accuracy.every(Boolean),JSON.stringify(accuracy));
    }
    console.log('PASS: all aim quadrants, camera elevation, responsive scaling, and mobile fallback');
    assert.equal(await page.evaluate(()=>{
      loadWorld(createWorld('Air target','482719')); paused=true;
      let bat; for(let id=1;id<100&&!bat;id++){const e=enemies.get(id);if(e?.type==='bat')bat=e;}
      player.x=bat.x-110;player.y=bat.y+55;player.roll=0;player.shotCooldown=0;
      camera=Math.max(0,player.x-100);cameraY=0;
      const r=canvas.getBoundingClientRect();mouseAim.active=true;
      mouseAim.clientX=r.left+(bat.x-camera)/viewWidth*r.width;
      mouseAim.clientY=r.top+(bat.y+10)/canvas.height*r.height;
      fire();for(let i=0;i<30;i++)updateBullets(1/60);
      return defeated.has(bat.id);
    }),true);
    console.log('PASS: an angled rifle shot hits an airborne enemy');

    await page.evaluate(()=>{paused=false;player.shotCooldown=0;player.y=ground(player.x+12)-40;mouseAim.active=true;});
    await page.locator('[data-key="p"]').tap(); await page.waitForTimeout(50);
    assert.equal(await page.evaluate(()=>mouseAim.active),false);
    assert.ok(await page.evaluate(()=>player.shotCooldown>0));
    assert.deepEqual(errors,[]);
    console.log('PASS: touch fire still works; no browser errors');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
