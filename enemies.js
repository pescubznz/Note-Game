/* Persistent actors: spawn eligibility is decided at their seeded home, never at a moving position. */
(function (root) {
  'use strict';
  const TYPES = {
    boar: { name: 'Wild boar', hp: 1, width: 38, height: 25, speed: 90, range: 125, damage: 1 },
    wolf: { name: 'Ridge wolf', hp: 2, width: 38, height: 28, speed: 165, range: 165, damage: 1 },
    bandit: { name: 'Outlaw gunner', hp: 2, width: 26, height: 44, speed: 85, range: 245, damage: 1 },
    bat: { name: 'Duskwing', hp: 1, width: 32, height: 20, speed: 115, range: 185, damage: 1 },
    stoneback: { name: 'Stoneback', hp: 4, width: 48, height: 36, speed: 48, range: 135, damage: 1 }
  };
  const LEASH = 650, PRELOAD = 1000, RETAIN = 2200;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const states = new Set(['idle', 'chase', 'return', 'windup', 'charge', 'pounce', 'dive', 'recover']);
  function create(terrain, world, defeated = new Set(world.defeated)) {
    const actors = new Map();
    const rejected = new Set();
    if (!world.enemyStates || typeof world.enemyStates !== 'object' || Array.isArray(world.enemyStates)) world.enemyStates = {};
    let view = { left: 0, width: 1200 };
    const safe = x => Math.abs(x - terrain.nearestVillage(x).x) <= 250;
    function clearSight(x, y, tx, ty) {
      const steps = Math.max(1, Math.ceil(Math.hypot(tx - x, ty - y) / 8));
      for (let i = 1; i < steps; i++) {
        const ratio = i / steps;
        if (y + (ty - y) * ratio >= terrain.ground(x + (tx - x) * ratio) - 2) return false;
      }
      return true;
    }
    function get(id) {
      if (actors.has(id)) return actors.get(id);
      if (id < 0 || rejected.has(id) || defeated.has(id)) return null;
      const home = id * 210 + 230;
      const type = id === 0 ? 'boar' : Object.keys(TYPES)[Math.min(4, Math.floor(terrain.random(id, 5) * 5))];
      const spec = TYPES[type];
      if (safe(home) || (type !== 'bat' && (terrain.waterAt(home - spec.width / 2) || terrain.waterAt(home + spec.width / 2)))) {
        rejected.add(id); return null;
      }
      const e = { id, type, home, x: home, y: terrain.ground(home) - spec.height - (type === 'bat' ? 90 : 0),
        hp: spec.hp, dir: terrain.random(id, 6) > .5 ? 1 : -1, state: 'idle', stateTime: 0, cooldown: .6,
        alert: 0, age: 0, vy: 0, grounded: type !== 'bat', flash: 0, muzzle: 0, aimX: home, aimY: 0 };
      const saved = world.enemyStates[id];
      if (saved && typeof saved === 'object') {
        for (const key of ['x', 'y', 'hp', 'stateTime', 'cooldown', 'alert', 'age', 'vy', 'aimX', 'aimY']) {
          if (Number.isFinite(saved[key])) e[key] = saved[key];
        }
        e.x = clamp(e.x, Math.max(24, home - LEASH), home + LEASH);
        e.y = clamp(e.y, -300, terrain.ground(e.x) - spec.height);
        e.hp = clamp(e.hp, 1, spec.hp); e.stateTime = clamp(e.stateTime, 0, 3);
        e.cooldown = clamp(e.cooldown, 0, 3); e.alert = clamp(e.alert, 0, 4);
        e.vy = clamp(e.vy, -400, 600); e.dir = saved.dir === -1 ? -1 : 1;
        e.state = states.has(saved.state) ? saved.state : 'idle';
        e.grounded = Math.abs(e.y + spec.height - terrain.ground(e.x)) < 2;
      }
      actors.set(id, e); return e;
    }
    function persist(e) {
      if (defeated.has(e.id)) { delete world.enemyStates[e.id]; return; }
      world.enemyStates[e.id] = { x: e.x, y: e.y, hp: e.hp, dir: e.dir, state: e.state,
        stateTime: e.stateTime, cooldown: e.cooldown, alert: e.alert, age: e.age, vy: e.vy, aimX: e.aimX, aimY: e.aimY };
    }
    function sync(left, width) {
      view = { left, width };
      const first = Math.max(0, Math.floor((left - PRELOAD - 230) / 210));
      const last = Math.ceil((left + width + PRELOAD - 230) / 210);
      for (let id = first; id <= last; id++) get(id);
      // Unload only far beyond BOTH the actor's current location and its home.
      // The full camera width is considered, including narrow/mobile viewports.
      for (const [id, e] of actors) {
        const outside = x => x < left - RETAIN || x > left + width + RETAIN;
        if (outside(e.x) && outside(e.home)) { persist(e); actors.delete(id); }
      }
      for (const id of rejected) if (id < first - 8 || id > last + 8) rejected.delete(id);
    }
    function active() { return [...actors.values()].filter(e => e.hp > 0 && !defeated.has(e.id)); }
    function moveGround(e, vx, dt) {
      const spec = TYPES[e.type], distance = vx * dt;
      const steps = Math.max(1, Math.ceil(Math.abs(distance) / 4));
      let blocked = false;
      for (let i = 0; i < steps; i++) {
        const nx = e.x + distance / steps, edge = nx + Math.sign(vx) * spec.width / 2;
        if (nx < 24 || Math.abs(nx - e.home) > LEASH || safe(edge) || terrain.waterAt(edge)) { blocked = true; break; }
        const floor = terrain.ground(nx), rise = e.y + spec.height - floor;
        if (rise > 0) {
          if (e.grounded && rise <= 24) e.y = floor - spec.height;
          else { blocked = true; if (e.grounded && rise < 90 && e.type !== 'stoneback') { e.vy = -330; e.grounded = false; } break; }
        }
        e.x = nx;
      }
      e.vy += 950 * dt; e.y += e.vy * dt;
      const floor = terrain.ground(e.x);
      if (e.y + spec.height >= floor && e.vy >= 0) { e.y = floor - spec.height; e.vy = 0; e.grounded = true; }
      else e.grounded = false;
      return blocked;
    }
    function moveFly(e, tx, ty, speed, dt) {
      const distance = Math.hypot(tx - e.x, ty - e.y) || 1;
      const ratio = Math.min(1, speed * dt / distance);
      const nx = clamp(e.x + (tx - e.x) * ratio, Math.max(24, e.home - LEASH), e.home + LEASH);
      if (!safe(nx)) e.x = nx;
      e.y = Math.min(e.y + (ty - e.y) * ratio, terrain.ground(e.x) - TYPES.bat.height - 4);
    }
    function update(dt, target) {
      const shots = [], strikes = [];
      const targetX = target.x + 12, targetY = target.y + 22;
      for (const e of active()) {
        if (e.x < view.left - 400 || e.x > view.left + view.width + 400) continue;
        const spec = TYPES[e.type]; e.age += dt;
        for (const key of ['stateTime', 'cooldown', 'alert', 'flash', 'muzzle']) e[key] = Math.max(0, e[key] - dt);
        const dx = targetX - e.x, distance = Math.hypot(dx, targetY - (e.y + spec.height / 2));
        const visible = !safe(targetX) && clearSight(e.x, e.y + spec.height / 2, targetX, targetY);
        if (distance < spec.range && visible) e.alert = 3;
        const engaged = e.alert > 0 && !safe(targetX) && Math.abs(targetX - e.home) < LEASH - 30;
        if (!engaged && e.state === 'windup') { e.state = 'return'; e.stateTime = 0; }
        if (e.type === 'bat') {
          if (e.state === 'windup') {
            if (e.stateTime <= 0) { e.state = 'dive'; e.stateTime = .62; }
          } else if (e.state === 'dive') {
            moveFly(e, e.aimX, e.aimY, 285, dt);
            if (e.stateTime <= 0 || Math.hypot(e.aimX - e.x, e.aimY - e.y) < 5) { e.state = 'recover'; e.stateTime = .75; e.cooldown = 1.5; }
          } else if (e.state === 'recover') {
            moveFly(e, e.x, terrain.ground(e.x) - 115, 100, dt);
            if (e.stateTime <= 0) e.state = 'idle';
          } else if (engaged) {
            e.state = 'chase'; e.dir = Math.sign(dx) || e.dir;
            moveFly(e, targetX - e.dir * 65, target.y - 75, spec.speed, dt);
            if (distance < 150 && e.cooldown <= 0 && visible) {
              e.state = 'windup'; e.stateTime = .4; e.aimX = targetX; e.aimY = target.y + 14;
            }
          } else {
            e.state = Math.abs(e.x - e.home) > 60 ? 'return' : 'idle';
            moveFly(e, e.home + Math.sin(e.age * .65) * 38, terrain.ground(e.home) - 110 + Math.sin(e.age * 2) * 10, 60, dt);
          }
          continue;
        }
        let vx = 0;
        if (e.state === 'windup') {
          if (e.stateTime <= 0) {
            if (e.type === 'bandit') {
              const sx = e.x + e.dir * 22, sy = e.y + 22;
              if (!safe(targetX) && clearSight(sx, sy, e.aimX, e.aimY)) {
                const length = Math.hypot(e.aimX - sx, e.aimY - sy) || 1;
                shots.push({ x: sx, y: sy, vx: (e.aimX - sx) / length * 290, vy: (e.aimY - sy) / length * 290, life: 2.2 });
                e.muzzle = .1;
              }
              e.state = 'recover'; e.stateTime = .35; e.cooldown = 1.6;
            } else if (e.type === 'stoneback') {
              strikes.push({ x: e.x + e.dir * 24, y: e.y + spec.height, radius: 58, damage: 2 });
              e.state = 'recover'; e.stateTime = .85; e.cooldown = 1.8;
            } else {
              e.state = e.type === 'wolf' ? 'pounce' : 'charge';
              e.stateTime = e.type === 'wolf' ? .55 : .42;
              if (e.type === 'wolf') { e.vy = -280; e.grounded = false; }
            }
          }
        } else if (e.state === 'charge' || e.state === 'pounce') {
          vx = e.dir * (e.type === 'wolf' ? 230 : 330);
          if (e.stateTime <= 0) { e.state = 'recover'; e.stateTime = .5; e.cooldown = 1.5; vx = 0; }
        } else if (e.state === 'recover') {
          if (e.stateTime <= 0) e.state = 'idle';
        } else if (engaged) {
          e.state = 'chase'; e.dir = Math.sign(dx) || e.dir;
          const attackRange = { boar: 105, wolf: 88, stoneback: 64, bandit: 265 }[e.type];
          if (distance < attackRange && e.cooldown <= 0 && visible && e.grounded) {
            e.state = 'windup'; e.stateTime = e.type === 'wolf' ? .2 : e.type === 'boar' ? .45 : .65;
            // Aimed attacks lock their target during the visible windup, allowing a dodge.
            e.aimX = targetX; e.aimY = targetY;
          } else if (e.type === 'bandit' && visible && Math.abs(dx) < 185) {
            vx = Math.abs(dx) < 90 ? -e.dir * spec.speed : 0;
          } else vx = e.dir * spec.speed;
        } else {
          e.state = Math.abs(e.x - e.home) > 65 ? 'return' : 'idle';
          const goal = e.state === 'return' ? e.home : e.home + Math.sin(e.age * .45 + e.id) * 45;
          vx = clamp((goal - e.x) * 2, -spec.speed * .4, spec.speed * .4);
          if (Math.abs(vx) > 1) e.dir = Math.sign(vx);
        }
        if (moveGround(e, vx, dt) && (e.state === 'charge' || e.state === 'pounce')) {
          e.state = 'recover'; e.stateTime = .5; e.cooldown = 1.5;
        }
      }
      return { shots, strikes };
    }
    function hit(id, damage = 1) {
      const e = actors.get(id);
      if (!e || defeated.has(id) || e.hp <= 0) return null;
      e.hp -= damage; e.flash = .14; e.alert = 3;
      if (e.hp <= 0) {
        defeated.add(id); if (!world.defeated.includes(id)) world.defeated.push(id);
        delete world.enemyStates[id];
      }
      return { killed: e.hp <= 0, enemy: e };
    }
    function save() { for (const e of actors.values()) persist(e); }
    return { get, sync, active, update, hit, save, safe, clearSight };
  }
  const api = { create, TYPES };
  root.ScriptoriaEnemies = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
