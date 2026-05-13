/**
 * Game entry point. Sets up Three.js, wires together mansion, player,
 * controls, items, ghost, audio, ui — and runs the main loop.
 */

import * as THREE from 'three';

import { Mansion, FLOORS, GRID_W, GRID_D, ROOM_SIZE } from './mansion.js';
import { Player } from './player.js';
import { Controls } from './controls.js';
import { Items } from './items.js';
import { Ghost } from './ghost.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { PuzzleRoom } from './puzzle.js';

// ----- seeded RNG (mulberry32) so each playthrough is unique but reproducible
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000);
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.6;

    this.scene = new THREE.Scene();
    // Thinner, slightly bluish fog so rooms are readable but distance still fades
    this.scene.fog = new THREE.FogExp2(0x0a0a16, 0.018);

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 100);
    this.camera.position.set(0, 1.6, 0);

    // Bright ambient so geometry is clearly visible — we trade some
    // horror-darkness for "the player can actually see and play"
    this.scene.add(new THREE.AmbientLight(0x504058, 1.6));

    // moonlight from above — cold blue, strong enough to read shapes at distance
    const moon = new THREE.DirectionalLight(0xa8c0e0, 1.4);
    moon.position.set(10, 30, 10);
    this.scene.add(moon);

    // warm hemisphere fill — keeps floors and side walls readable
    const fill = new THREE.HemisphereLight(0x8a5840, 0x303040, 0.9);
    this.scene.add(fill);

    // flashlight: spotlight attached to camera — long reach, bright cone
    this.flashlight = new THREE.SpotLight(0xfff0c0, 14, 32, Math.PI * 0.20, 0.4, 1.0);
    this.flashlight.position.set(0, 0, 0);
    this.flashlightTarget = new THREE.Object3D();
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlightTarget);
    this.flashlightTarget.position.set(0, 0, -1);
    this.flashlight.target = this.flashlightTarget;

    // Warm head-lamp halo on the camera — visible even with flashlight off so
    // the player is never standing in total black
    this.headLamp = new THREE.PointLight(0xffd49a, 1.4, 9, 2);
    this.headLamp.position.set(0, 0, 0);
    this.camera.add(this.headLamp);

    this.scene.add(this.camera);

    this.seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    this.rng = makeRng(this.seed);

    // game systems
    this.audio = new Audio();
    this.ui = new UI();
    this.mansion = new Mansion(this.scene, this.rng);
    this.player = new Player(this.camera, this.mansion);
    this.items = new Items(this.scene, this.mansion, this.audio, this.rng);
    this.ghost = new Ghost(this.scene, this.mansion, this.audio);
    this.puzzle = new PuzzleRoom(this.scene, this.rng);
    this.savedPlayerState = null;   // { position, yaw, pitch } captured on shrine entry

    this.controls = new Controls(this.player, {
      interact: () => this.tryInteract(),
      shoot:    () => this.tryShoot(),
      flashlight: () => this.player.toggleFlashlight(),
      mute:     () => this.audio.toggleMute(),
      bomb:     () => this.tryThrowBomb(),
    });

    this.state = 'menu';
    this.time = 0;
    this.lastT = performance.now();

    this._wireEvents();
    this._onResize();
    this._tick = this._tick.bind(this);
    requestAnimationFrame(this._tick);
  }

  _wireEvents() {
    window.addEventListener('resize', () => this._onResize());
    document.getElementById('btn-start').addEventListener('click', () => this.start());
    document.getElementById('btn-restart').addEventListener('click', () => this.restart());
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');

    this.audio.start();

    // Build first floor
    this.mansion.showFloor(0);
    this.items.spawnForFloor(0);
    this.player.spawnAt(this.mansion.getStartPosition());
    this.ghost.spawnOnFloor(0, this.player.position);

    // Player wakes up holding the revolver — they shouldn't be defenseless
    this.player.inventory.gun.has = true;
    this.player.inventory.gun.ammo = 6;

    this.ui.show();
    this.state = 'playing';

    setTimeout(() => {
      document.getElementById('loading').classList.add('hidden');
      this.ui.toast('You wake up. The house breathes.', true, 3.5);
      setTimeout(() => this.ui.whisper("find a way out…"), 3600);
    }, 700);
  }

  restart() {
    // Hard reload is the simplest reliable reset.
    window.location.reload();
  }

  tryInteract() {
    if (this.state !== 'playing') return;
    // Stair?
    const stair = this.mansion.nearbyStair(this.player.position);
    if (stair) {
      this._changeFloor(stair.targetFloor);
      return;
    }
    // Car?
    const car = this.mansion.getCarPosition();
    if (car && this.mansion.currentFloor === 0) {
      const dx = car.x - this.player.position.x;
      const dz = car.z - this.player.position.z;
      if (dx * dx + dz * dz < 9) {
        this._tryEscape();
        return;
      }
    }
    // Shrine? Open the puzzle room instead of picking up.
    const shrine = this.items.shrineNear(this.player.position, 2.0);
    if (shrine) {
      this._enterPuzzle();
      return;
    }
    // Item?
    const item = this.items.itemNear(this.player.position, 1.6);
    if (item) {
      this._pickup(item);
      return;
    }
    this.ui.toast('Nothing here.', false, 1.0);
  }

  _enterPuzzle() {
    this.savedPlayerState = {
      position: this.player.position.clone(),
      yaw: this.player.yaw,
      pitch: this.player.pitch,
    };
    const glyph = this.puzzle.enter();
    const spawn = this.puzzle.spawnPoint();
    this.player.position.copy(spawn);
    this.player.yaw = Math.PI;        // face the chamber center
    this.player.pitch = 0;
    this.state = 'puzzle';
    this.audio.creak();
    this.ui.showHint(glyph.hint + ' — press B to leave');
    this.ui.toast('The shrine pulls you under.', true, 2.4);
  }

  _exitPuzzle(solved) {
    this.puzzle.exit();
    this.ui.hideHint();
    if (this.savedPlayerState) {
      this.player.position.copy(this.savedPlayerState.position);
      this.player.yaw = this.savedPlayerState.yaw;
      this.player.pitch = this.savedPlayerState.pitch;
      this.savedPlayerState = null;
    }
    this.state = 'playing';
    if (solved) {
      this.player.adjustSanity(40);
      this.player.inventory.gun.ammo += 3;
      this.player.inventory.bombs += 1;
      if (this.player.hits < 3) this.player.hits += 1;
      this.audio.pickup();
      this.ui.toast('The shrine accepts your offering. You feel lighter.', false, 3);
    } else {
      this.ui.toast('You step back into the house.', true, 2);
    }
  }

  _pickup(item) {
    const inv = this.player.inventory;
    let msg = item.def.label + ' acquired.';
    let dark = false;
    switch (item.type) {
      case 'key':       inv.key = true; break;
      case 'sparkPlug': inv.sparkPlug = true; break;
      case 'engine':    inv.engine = true; break;
      case 'petrol':    inv.petrol = true; break;
      case 'tire':      inv.tire = true; break;
      case 'gun':       inv.gun.has = true; inv.gun.ammo += 6; break;
      case 'bullets':   inv.gun.ammo += 3; if (!inv.gun.has) inv.gun.has = true; break;
      case 'bomb':      inv.bombs += 1; break;
      case 'cat':       inv.cat = true; msg = 'A black cat. It follows you.'; break;
      case 'dog':       inv.dog = true; msg = 'A guard dog. It barks at the dark.'; break;
      case 'fire':      this.ui.toast("That's not safe to grab.", true, 1.5); return;
    }
    this.audio.pickup();
    this.items.consume(item);
    this.ui.toast(msg, dark, 2.0);
    // sanity boost from finding something
    this.player.adjustSanity(6);

    // ghost goes frenzy when you have 4+ essentials
    const essCount = [inv.tire, inv.petrol, inv.sparkPlug, inv.engine, inv.key].filter(Boolean).length;
    if (essCount === 4) {
      this.ghost.setFrenzy(true);
      this.audio.stinger();
      this.ui.flashGhost();
      this.ui.toast('Something just woke up.', true, 3);
    }
  }

  tryShoot() {
    if (this.state !== 'playing') return;
    if (!this.player.canShoot()) {
      if (this.player.inventory.gun.has) this.ui.toast('Click. No bullets.', true, 1.0);
      return;
    }
    this.player.shoot(this.audio);
    // raycast forward, if hits ghost within range -> stun
    const dir = this.player.forwardDirection();
    const dx = this.ghost.position.x - this.player.position.x;
    const dz = this.ghost.position.z - this.player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0 && dist < 18) {
      const ndx = dx / dist, ndz = dz / dist;
      const dot = ndx * dir.x + ndz * dir.z;
      if (dot > 0.85) {
        this.ghost.stun();
        this.ui.toast('It staggers.', true, 1.3);
        this.audio.ghostShriek();
      }
    }
  }

  tryThrowBomb() {
    // Inside the puzzle room, B is the abort key — exit with no reward.
    if (this.state === 'puzzle') { this._exitPuzzle(false); return; }
    if (this.state !== 'playing') return;
    if (this.player.inventory.bombs <= 0) return;
    this.player.inventory.bombs--;
    this.audio.bombExplode();
    // bomb effects: stun ghost if nearby AND restore some sanity (clears the dread)
    const dx = this.ghost.position.x - this.player.position.x;
    const dz = this.ghost.position.z - this.player.position.z;
    if (Math.hypot(dx, dz) < 10) {
      this.ghost.stun();
      this.ui.toast('The blast pushes it back!', true, 2.0);
    } else {
      this.ui.toast('The house shudders.', true, 1.5);
    }
    this.ui.flashDamage();
  }

  _changeFloor(target) {
    if (target < 0 || target >= FLOORS) return;
    const dir = target > this.mansion.currentFloor ? 'up' : 'down';
    this.audio.creak();
    this.ui.toast(`Going ${dir}… Floor ${target + 1}`, false, 2);
    this.mansion.showFloor(target);
    this.items.spawnForFloor(target);
    // place player at the stair we arrived through (try to find matching stair)
    const f = this.mansion.floors[target];
    let arrivalRoom = dir === 'up' ? f.stairDownRoom : f.stairUpRoom;
    if (!arrivalRoom) arrivalRoom = f.rooms[0];
    const c = this.mansion.cellCenter(arrivalRoom.gx, arrivalRoom.gz);
    this.player.position.set(c.x, 1.6, c.z + 1);
    this.ghost.spawnOnFloor(target, this.player.position);
    // floor theme atmosphere note
    this.ui.whisper(this.mansion.getFloorTheme(target).mood, 3.5);
  }

  _tryEscape() {
    if (!this.player.hasAllCarParts()) {
      const inv = this.player.inventory;
      const missing = [
        !inv.tire && 'tire',
        !inv.petrol && 'petrol',
        !inv.sparkPlug && 'spark plug',
        !inv.engine && 'engine',
        !inv.key && 'key',
      ].filter(Boolean);
      this.ui.toast('Car needs: ' + missing.join(', '), true, 3);
      return;
    }
    // Win!
    this.state = 'won';
    this.audio.carEngine();
    this.ui.toast('The engine roars to life.', false, 3);
    setTimeout(() => {
      this.ui.showEnd(true, 'You drive into the dawn. The house is gone in the rearview. Don’t stop.');
    }, 3500);
  }

  _tick(now) {
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.time += dt;

    if (this.state === 'puzzle') {
      this.controls.updateKeyboard();
      this.player.update(dt, this.audio);
      this.items.update(dt, this.time);
      const result = this.puzzle.update(dt, this.time, this.player.position);
      if (result === 'correct') {
        this.audio.stinger();
        this._exitPuzzle(true);
      } else if (result === 'wrong') {
        this.audio.ghostShriek();
        this.ui.flashDamage();
        this.player.adjustSanity(-15);
        const next = this.puzzle.reshuffle();
        this.ui.showHint(next.hint + ' — press B to leave');
      }
      this.ui.update(this.player, this.mansion, dt);
    } else if (this.state === 'playing') {
      this.controls.updateKeyboard();
      this.player.update(dt, this.audio);
      this.items.update(dt, this.time);

      // doll jumpscare proximity check
      const doll = this.items.dollNear(this.player.position, 2.5);
      if (doll) {
        doll.triggered = true;
        this.audio.stinger();
        this.ui.flashGhost();
        this.ui.flashDamage();
        this.player.adjustSanity(-25);
        this.ui.toast("A doll. Its eyes met yours.", true, 2.0);
      }

      // flashlight visibility
      this.flashlight.visible = this.player.flashlightOn;
      // subtle flicker
      if (this.player.flashlightOn) {
        const flick = 0.92 + Math.sin(this.time * 27) * 0.06 + Math.random() * 0.04;
        this.flashlight.intensity = 14 * flick;
      }

      // ghost
      const result = this.ghost.update(dt, this.time, this.player);

      // intensity based on distance
      const closeness = Math.max(0, 1 - result.distance / 16);
      this.audio.setIntensity(0.25 + closeness * 0.75);

      // ghost-near dread: pulse the red CRT overlay when within ~5 meters
      if (result.distance < 5) {
        this.ui.flashGhost();
      }

      // sanity changes
      if (this.player.flashlightOn) this.player.adjustSanity(2 * dt);
      else this.player.adjustSanity(-3 * dt);
      if (closeness > 0.6) this.player.adjustSanity(-6 * dt);

      // ghost hit
      if (result.hit) {
        if (this.player.inventory.dog) {
          // dog scares ghost once
          this.player.inventory.dog = false;
          this.ghost.repel();
          this.ui.toast('Your dog snarls — the wraith recoils!', true, 2.5);
          this.audio.ghostShriek();
        } else {
          this.player.damage(this.audio);
          this.ui.flashDamage();
          this.ui.flashGhost();
          if (!this.player.alive) {
            this.state = 'lost';
            setTimeout(() => {
              this.ui.showEnd(false, 'It found you. The house has another resident.');
            }, 1200);
          }
        }
      }

      // cat warning (cat hisses when ghost is close)
      if (this.player.inventory.cat && result.distance < 8 && Math.random() < 0.005) {
        this.ui.whisper('your cat hisses…');
      }

      // fire hazard
      const fire = this.items.fireTouching(this.player.position);
      if (fire) {
        this.player.adjustSanity(-12 * dt);
        if (Math.random() < 0.02) this.ui.flashDamage();
      }

      // sanity death
      if (this.player.sanity <= 0) {
        this.state = 'lost';
        this.audio.stinger();
        setTimeout(() => {
          this.ui.showEnd(false, 'Your mind broke before the doors did.');
        }, 1200);
      }

      // random ambient whispers
      if (Math.random() < 0.0015) this.ui.whisper();

      this.audio.update(dt);
      this.ui.update(this.player, this.mansion, dt);
    }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._tick);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
