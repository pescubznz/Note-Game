# Scriptoria

A student note-taking adventure: a 2D pixel platformer with deterministic, endless terrain, forest/desert/snow biomes, villages, scriptoriums, wildlife, and fictional bandits.

## Run

Node.js 18+ is required. No package installation is necessary.

```sh
npm run check
npm run dev
```

The server listens on port 3000. Set `PORT` to override it.

## Play

- A/D or arrow keys: move
- Space/W/up arrow: jump
- F: attack
- E: enter a nearby scriptorium
- Escape: pause

Villages occur every 180 meters. Resting restores health and establishes a checkpoint. Journals can be read anywhere, but notes can only be written or edited at a scriptorium. Worlds have independent seeds, progress, enemies, and notes. Mobile players have touch controls.

## Saving

Worlds and notes are saved in the browser's localStorage every three seconds, when the window loses focus, and when notes/worlds change. Closing and reopening the website in the same browser profile and origin restores your adventure. Clearing browser data erases local saves; use Worlds → Export worlds & notes for backups. Import merges backups as additional worlds rather than replacing existing progress. There are no accounts or cloud synchronization yet. If browser storage is unavailable, the UI reports it and export remains available.

## Validation

`npm run check` validates JavaScript syntax. Browser smoke checks during development verified movement, writing notes at a scriptorium, note persistence after reload, creating and restoring a second world, and pausing. Terrain/combat are an initial prototype; no quizzes, multiplayer, or backend database is included yet.

Google Fonts enhance the UI when available; system fonts are used otherwise. Game artwork is drawn locally using Canvas, with no external asset dependencies.
