# Scriptoria

A student note-taking adventure: a 2D pixel platformer with seeded terrain, scriptoriums, wildlife, and fictional bandits. Play in a browser, including on GitHub Pages. No backend or runtime package installation is required.

## Run locally

Use Node.js 18+:

```sh
npm run dev
```

The server listens on port 3000. Set `PORT` to override it. GitHub Pages serves `index.html`, `style.css`, `world.js`, `enemies.js`, and `game.js` directly.

## Play

- A/D or left/right arrows: accelerate, move, and change facing direction.
- Space/W/up arrow: jump. Hold for a higher jump; release for a short hop. Hold in water to paddle and jump toward the shore.
- Mouse: aim the rifle at the cursor, independently of walking direction.
- Left-click in the game or P: fire toward the cursor. Hold either for repeated shots. Mobile fire controls retain direction-based shooting. Bullets collide with terrain and enemies.
- E: dodge roll on land. A roll lasts 0.32 seconds, grants 0.28 seconds of invulnerability, and has a 1.1-second cooldown. Hold does not retrigger it.
- R: enter a nearby scriptorium.
- Escape: pause.

**The journal is available only at scriptoriums**, for both reading and writing. Its toolbar button is disabled elsewhere. All gameplay actions also have mobile controls.

Villages appear roughly 800–1,200 meters apart, averaging 1,000 meters; the world seed determines their exact positions. Villages restore health and set a respawn checkpoint. The journey includes forest, desert, snowy peaks, wetlands, and volcanic highlands. Mountains have climbable slopes and lakes can be crossed by swimming. The camera follows elevation as well as horizontal travel.

## Enemies

Enemies notice nearby players, pursue them, and return toward their home after losing interest. Terrain blocks their sight and bullets. Villages remain safe.

| Enemy | Behavior | Rifle hits to defeat |
| --- | --- | --- |
| Wild boar | Warns, then charges quickly in a straight line | 1 |
| Ridge wolf | Fast pursuit and a leaping pounce | 2 |
| Duskwing | Flies over water, hovers, then dives toward your position | 1 |
| Stoneback | Slow armored creature with a telegraphed, two-heart slam | 4 |
| Outlaw gunner | Keeps some distance, visibly aims, and fires dodgable bullets | 2 |

A yellow warning signals an attack windup; gunners also show an aiming line. Enemy bullets are orange. Wounded or alerted enemies show a health bar. Use rolls, jumps, or terrain cover to avoid attacks.

Enemy positions and health persist instead of being recalculated each frame. Spawn locations are selected once from the world seed. Ground enemies stop at water and village boundaries; flying enemies can cross lakes. Actors are generated beyond the camera and only unloaded well outside the view, with their state retained for when you return. Defeated enemies stay defeated.

## Saving and upgrading

Each world has its own seed, progress, enemies, and notes. Living enemy positions, health, and attack state are included in saves and backups. Projectiles are transient and clear when switching worlds or respawning. Saves use browser localStorage every three seconds, when the window loses focus, and when notes/worlds change. Reopening the same site in the same browser profile restores the adventure. Clearing browser data erases local saves; use Worlds → Export worlds & notes for backups. Import adds worlds and preserves existing ones. There are no accounts or cloud synchronization.

Version 0.2 preserves existing notes, distance, and player position while regenerating terrain with the new features. Old respawn checkpoints are mapped to a valid earlier village or the starting point. Players load on the new ground or water surface. Old exported backups can still be imported. Version 0.3 adds persistent enemy state automatically; existing notes, terrain, checkpoints, and defeated-enemy records are retained.

If browser storage is unavailable, the UI reports it and export remains available. Google Fonts are optional; system fonts are used otherwise. All game artwork is drawn locally with Canvas.

## Development checks

```sh
npm run check
npm test
```

The built-in Node tests cover repeatable terrain generation, village spacing, dry village plateaus, all five biomes, lake depth, and traversable terrain steps across multiple seeds. Enemy tests cover all five behaviors, detection, telegraphed attacks, gunner sight lines, armor, safe villages, stable camera transitions, boundary movement, unloading, and saved enemy state.

For the browser suite, install the locked development dependency and a Chromium browser:

```sh
npm ci
npx playwright install chromium
npm run dev
```

In a second terminal:

```sh
npm run test:browser
```

The browser tests cover journal access, real P/E key events, acceleration, roll immunity and cooldown, rifle hits, terrain collision, floating, note persistence, cross-biome traversal, mobile layout, and migration of old saves. The aiming browser suite verifies click/P firing, held fire, cursor coordinates at multiple camera positions and screen sizes, airborne hits, and touch fallback. The hostile-combat browser suite verifies gunner projectiles, player damage, rolling through enemy fire, terrain and village protection, multi-hit enemies, wound persistence, and permanent defeats. Tests use a fresh browser profile and do not touch your normal browser saves.

In the cloud workspace, Chromium is already installed. Run with `BROWSER_PATH=/usr/bin/chromium`. Set `BASE_URL` if the server uses a different port and optionally set `SCREENSHOTS` to an existing output directory.
