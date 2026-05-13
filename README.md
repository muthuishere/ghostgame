# THE LAST HOUSE

A first-person horror escape game built with Three.js. You wake in a sealed
mansion. The car in the driveway is missing five parts. They are scattered
across ten floors. Something else lives here.

Plays in any modern browser. Mobile-first. No build step. No external assets.

## Play

Open `index.html` in a modern browser, or visit the GitHub Pages deployment.

### Controls

**Desktop**
- `WASD` / arrows — move
- Mouse — look (click canvas to lock pointer)
- `Shift` — sprint
- `E` — interact / pick up / use stairs / start the car
- `F` — flashlight toggle
- `B` — throw bomb
- Click — fire pistol
- `M` — mute audio

**Mobile**
- Left joystick — move
- Drag right side of screen — look
- `USE` — interact
- `LIGHT` — flashlight toggle
- `FIRE` — fire pistol

## Concept

- **Procedural mansion**: 10 floors × ~12 rooms each, generated fresh every
  playthrough. Each floor has its own theme (Foyer, Parlor, Library, Servants’
  Quarters, Nursery, Gallery, Chapel, Attic, Basement, The Crypt).
- **Goal**: collect five car parts — tire, petrol, spark plug, engine, key —
  then return to the car on the ground floor and escape.
- **Threats**: a roaming wraith that drifts through walls. Fire hazards. A
  sanity meter that drops in darkness and proximity. Three hits before you
  break.
- **Tools**: revolver (stuns the ghost briefly), bombs (push it back, crack
  the silence). A black cat hisses when the ghost is near. A guard dog will
  scare it off — once.
- **Atmosphere**: layered ambient drone, dynamic heartbeat, random whispered
  warnings, jump-scare stingers, no music files — all synthesized live via the
  Web Audio API.

## Tech

- [Three.js 0.160](https://threejs.org/) loaded via CDN (importmap)
- Plain ES modules, no bundler
- Web Audio API for procedural audio
- Single HTML entry, deployable to any static host

## Deploy to GitHub Pages

See [`docs/DEPLOY.md`](docs/DEPLOY.md). Short version: **Settings → Pages →
Deploy from branch → main → / (root)**, save, wait a few seconds.

## Project layout

```
index.html          entry point + HUD markup
css/style.css       black/blood aesthetic, mobile-safe layout
js/
  main.js           Three.js scene, game loop, win/lose flow
  mansion.js        procedural 10-floor generator
  player.js         movement, sanity, inventory, hits
  controls.js       desktop + mobile input
  items.js          car parts, weapons, pets, fire — pickup logic
  ghost.js          AI: idle / hunt / frenzy / stunned / repelled
  ui.js             HUD: sanity bar, inventory, toasts, whispers
  audio.js          synthesized ambient + stingers + SFX
```

Stay quiet. Find the parts. Don’t look back.
