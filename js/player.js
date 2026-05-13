/**
 * Player: first-person camera, movement, look, sanity, hits, inventory.
 *
 * Movement is unified across desktop & mobile via an input vector that lives
 * on the player. controls.js writes to it; player.js reads it.
 */

import * as THREE from 'three';

const MOVE_SPEED = 4.5;
const SPRINT_SPEED = 6.5;
const EYE_HEIGHT = 1.6;
const SANITY_MAX = 100;

export class Player {
  constructor(camera, mansion) {
    this.camera = camera;
    this.mansion = mansion;

    this.position = new THREE.Vector3(0, EYE_HEIGHT, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;

    // unified input vector populated by Controls
    this.moveInput = new THREE.Vector2();   // x = strafe (-1..1), y = forward (-1..1)
    this.lookDelta = new THREE.Vector2();   // accumulated look delta (cleared each frame)
    this.sprinting = false;

    // health & sanity
    this.sanity = SANITY_MAX;
    this.hits = 3;
    this.alive = true;

    // inventory
    this.inventory = {
      // essential car parts
      key: false,
      sparkPlug: false,
      engine: false,
      petrol: false,
      tire: false,
      // weapons
      gun: { has: false, ammo: 0 },
      bombs: 0,
      // pets
      cat: false,
      dog: false,
      // misc
      doorKeys: 0,
    };

    // state
    this.hasFlashlight = true;
    this.flashlightOn = true;
    this.flashlightBattery = 100;

    this.shootCooldown = 0;
    this.invulnTimer = 0;
    this.stepTimer = 0;
    this.lastSanityRegenRoom = -1;
  }

  spawnAt(pos) {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
  }

  update(dt, audio) {
    // apply look delta
    this.yaw -= this.lookDelta.x;
    this.pitch -= this.lookDelta.y;
    this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
    this.lookDelta.set(0, 0);

    // compute forward/right vectors from yaw only (so movement stays horizontal)
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const speed = this.sprinting ? SPRINT_SPEED : MOVE_SPEED;
    const move = new THREE.Vector3();
    move.addScaledVector(forward, this.moveInput.y);
    move.addScaledVector(right, this.moveInput.x);
    if (move.lengthSq() > 1) move.normalize();
    move.multiplyScalar(speed * dt);

    // attempt move with collision on each axis
    const trial = this.position.clone().add(new THREE.Vector3(move.x, 0, 0));
    if (!this.mansion.collides(trial)) this.position.x = trial.x;
    const trial2 = this.position.clone().add(new THREE.Vector3(0, 0, move.z));
    if (!this.mansion.collides(trial2)) this.position.z = trial2.z;
    this.position.y = EYE_HEIGHT;

    // foot steps
    if (move.length() > 0.05) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        audio?.footstep();
        this.stepTimer = this.sprinting ? 0.32 : 0.5;
      }
    }

    // apply to camera
    this.camera.position.copy(this.position);
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    // flashlight battery drain
    if (this.flashlightOn && this.hasFlashlight) {
      this.flashlightBattery -= dt * 1.2;
      if (this.flashlightBattery <= 0) {
        this.flashlightBattery = 0;
        this.flashlightOn = false;
      }
    }

    // cooldowns
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
  }

  toggleFlashlight() {
    if (!this.hasFlashlight) return;
    if (this.flashlightBattery <= 0) return;
    this.flashlightOn = !this.flashlightOn;
  }

  damage(audio) {
    if (this.invulnTimer > 0) return false;
    this.hits = Math.max(0, this.hits - 1);
    this.invulnTimer = 1.6;
    this.sanity = Math.max(0, this.sanity - 18);
    audio?.ghostShriek();
    if (this.hits <= 0) this.alive = false;
    return true;
  }

  adjustSanity(amount) {
    this.sanity = Math.max(0, Math.min(SANITY_MAX, this.sanity + amount));
  }

  hasAllCarParts() {
    const i = this.inventory;
    return i.key && i.sparkPlug && i.engine && i.petrol && i.tire;
  }

  canShoot() {
    return this.inventory.gun.has && this.inventory.gun.ammo > 0 && this.shootCooldown <= 0;
  }

  shoot(audio) {
    if (!this.canShoot()) return false;
    this.inventory.gun.ammo--;
    this.shootCooldown = 0.5;
    audio?.gunshot();
    return true;
  }

  forwardDirection() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}
