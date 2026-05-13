# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"The Last House" — a first-person horror escape game built with Three.js. Plain HTML/CSS/ES-modules, no build step, no package manager, no tests. Single static site, deployable to GitHub Pages from `main` at `/` (root).

## Run / develop

The game must be served over `http://` — `file://` will break ES module imports and pointer-lock.

```sh
task serve         # live-reload dev server (live-server, port 8000) — preferred
task serve:open    # same, but opens a browser tab
task serve:python  # plain python http.server fallback (no auto-reload)
```

`task serve` runs `npx live-server` so the browser auto-refreshes on save and the pointer-lock/session behaves like a real site. Override port/host with `PORT=9000 task serve` or `HOST=0.0.0.0 task serve` (the latter exposes it on the LAN for mobile testing). There is no bundler, no lint, no test suite — the only check is the browser console.

Three.js 0.160 is **vendored locally** at `vendor/three.module.min.js` and resolved via the importmap in `index.html`. Do not reintroduce a CDN dependency.

## Architecture

`js/main.js` defines a single `Game` class that owns the renderer/scene/camera and instantiates each subsystem, wiring them together. The game loop in `Game._tick` is the only animation frame loop.

Subsystems and their responsibilities (one module each, under `js/`):

- **`mansion.js`** — procedural generator. 10 floors × 4×3 room grid, each floor themed (constants `FLOORS`, `GRID_W`, `GRID_D`, `ROOM_SIZE`). **Only the current floor's meshes are in the scene at any time**; `mansion.showFloor(n)` swaps them. Also owns colliders, stair triggers, item spawn points, and the car position.
- **`player.js`** — first-person camera holder, movement, sanity, hits, inventory (car parts, gun + ammo, bombs, pets, flashlight).
- **`controls.js`** — desktop (WASD/mouse/pointer-lock) and mobile (joystick + look-pad + action buttons) input. Both paths write to a unified `player.moveInput` / `player.lookDelta`; `player.js` reads. Don't move input handling elsewhere.
- **`items.js`** — spawns and tracks pickups (5 essential car parts + gun/bullets/bombs/cat/dog/fire) for the current floor, draws their meshes, handles "near" queries.
- **`ghost.js`** — wraith AI: `idle / hunt / frenzy / stunned / repelled`. Per-frame `update()` returns `{ hit, distance }` consumed by `main.js` for damage and ambient intensity.
- **`ui.js`** — DOM HUD: sanity bar, hearts, floor indicator, inventory, toasts, whispers, damage/ghost flashes, start/end screens.
- **`audio.js`** — entirely synthesized via Web Audio API (no audio files). Ambient drone, heartbeat, stingers, SFX, intensity-driven.

### Patterns to preserve

- **Seeded RNG.** `main.js` constructs a single mulberry32 RNG and threads it to `Mansion` and `Items`. Reuse this RNG for anything procedural — don't call `Math.random()` for world-gen.
- **Floor swap, not floor hide.** Switching floors rebuilds the active mesh/collider/stair/item-spawn lists for the new floor. Don't accumulate cross-floor state in the scene graph.
- **Win condition.** Player must collect all five parts (`key`, `sparkPlug`, `engine`, `petrol`, `tire`) and interact with the car on floor 0. When 4 of 5 are held, the ghost flips to frenzy (see `_pickup` in `main.js`).
- **Restart is a hard reload** (`window.location.reload()`). There is no in-memory reset path; don't add one halfway.

## Deploy

GitHub Pages, source = branch `main`, folder `/`. The `.github/workflows/pages.yml` content lives in `docs/DEPLOY.md` as a copy-paste recipe (not committed at the repo root because the bot user's OAuth scope can't push workflow files).
