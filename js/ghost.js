/**
 * Ghost: a wraith that roams the current floor, senses the player, chases when
 * close, and attacks on contact.
 *
 * Visual: a tall, semi-transparent silhouette with glowing red eyes and a
 * trailing fog particle effect. It "phases" through walls (no collision)
 * because — well, ghost.
 *
 * Behavior states:
 *   - idle:    drifting between random points
 *   - hunt:    moves toward player if player is in line of sight or "sensed"
 *   - frenzy:  triggered when player has 4+ car parts → faster, screams
 *   - stunned: gun shot temporarily stuns it (3 sec backoff)
 *
 * On contact with player, player.damage(); ghost retreats briefly.
 */

import * as THREE from 'three';
import { GRID_W, GRID_D, ROOM_SIZE } from './mansion.js';

const SENSE_RADIUS = 14;
const ATTACK_RADIUS = 1.4;
const NORMAL_SPEED = 2.2;
const HUNT_SPEED = 3.4;
const FRENZY_SPEED = 4.6;
const RESPAWN_DELAY = 8;
const DOG_REPEL_TIME = 12;

export class Ghost {
  constructor(scene, mansion, audio) {
    this.scene = scene;
    this.mansion = mansion;
    this.audio = audio;

    this.group = new THREE.Group();
    this._build();
    this.scene.add(this.group);

    this.state = 'idle';
    this.position = new THREE.Vector3(0, 0, 0);
    this.target = new THREE.Vector3();
    this.cooldown = 0;
    this.stunTimer = 0;
    this.repelTimer = 0;          // dog effect
    this.frenzy = false;
    this.respawnTimer = 0;
    this.visible = true;
  }

  _build() {
    // tall stretched silhouette
    const bodyGeo = new THREE.ConeGeometry(0.9, 3.2, 8);
    bodyGeo.translate(0, 1.6, 0);
    const bodyMat = new THREE.MeshBasicMaterial({
      color: 0xeeeeee,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.group.add(this.body);

    // wisp shell - second outer layer
    const shellGeo = new THREE.ConeGeometry(1.4, 3.8, 8);
    shellGeo.translate(0, 1.9, 0);
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0x6a0000,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.shell = new THREE.Mesh(shellGeo, shellMat);
    this.group.add(this.shell);

    // glowing eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    this.eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
    this.eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
    this.eyeL.position.set(-0.15, 2.4, 0.4);
    this.eyeR.position.set(0.15, 2.4, 0.4);
    this.group.add(this.eyeL, this.eyeR);

    // ambient red glow that follows ghost
    this.glow = new THREE.PointLight(0xff0a0a, 0.0, 7, 2);
    this.glow.position.set(0, 1.5, 0);
    this.group.add(this.glow);
  }

  spawnOnFloor(floorIndex, awayFrom) {
    const floor = this.mansion.floors[floorIndex];
    // pick a random room far from the player
    let bestRoom = floor.rooms[0];
    let bestDist = -1;
    for (const r of floor.rooms) {
      const c = this.mansion.cellCenter(r.gx, r.gz);
      const d = awayFrom ? c.distanceTo(awayFrom) : Math.random();
      if (d > bestDist) { bestDist = d; bestRoom = r; }
    }
    const c = this.mansion.cellCenter(bestRoom.gx, bestRoom.gz);
    this.position.set(c.x, 0, c.z);
    this.group.position.copy(this.position);
    this.target.copy(this.position);
    this.state = 'idle';
    this.cooldown = 0;
    this.respawnTimer = 0;
    this.visible = true;
    this.group.visible = true;
  }

  /** When player has many parts, ghost goes frenzy mode */
  setFrenzy(on) {
    this.frenzy = on;
    if (on) {
      this.body.material.opacity = 0.32;
      this.shell.material.color.setHex(0xb00000);
      this.shell.material.opacity = 0.18;
      this.glow.intensity = 1.4;
    }
  }

  stun() {
    this.stunTimer = 3.0;
    this.state = 'stunned';
  }

  /** Dog uses temporarily scare the ghost away */
  repel() {
    this.repelTimer = DOG_REPEL_TIME;
    this.state = 'idle';
    // teleport to far corner of floor
    const floor = this.mansion.floors[this.mansion.currentFloor];
    const room = floor.rooms[floor.rooms.length - 1];
    const c = this.mansion.cellCenter(room.gx, room.gz);
    this.position.set(c.x, 0, c.z);
    this.group.position.copy(this.position);
  }

  /** Vanish after killing player or being killed: hold position offscreen */
  hide() {
    this.visible = false;
    this.group.visible = false;
    this.respawnTimer = RESPAWN_DELAY;
  }

  update(dt, time, player) {
    if (!this.visible) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.spawnOnFloor(this.mansion.currentFloor, player.position);
      return { hit: false, distance: Infinity };
    }

    // floating bob
    this.group.position.y = Math.sin(time * 1.5) * 0.15;

    // eyes glint
    const glint = 0.6 + Math.sin(time * 8) * 0.3;
    this.eyeL.scale.setScalar(glint);
    this.eyeR.scale.setScalar(glint);

    // cool down repel
    if (this.repelTimer > 0) {
      this.repelTimer -= dt;
      // wander far away — don't hunt
      this._wander(dt);
      this.group.position.x = this.position.x;
      this.group.position.z = this.position.z;
      return { hit: false, distance: this.position.distanceTo(player.position) };
    }

    // distance to player
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);

    // state transitions
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      if (this.stunTimer <= 0) this.state = 'idle';
    } else if (dist < SENSE_RADIUS || this.frenzy) {
      this.state = this.frenzy ? 'frenzy' : 'hunt';
    } else {
      this.state = 'idle';
    }

    // movement
    let speed = NORMAL_SPEED;
    if (this.state === 'hunt') speed = HUNT_SPEED;
    if (this.state === 'frenzy') speed = FRENZY_SPEED;
    if (this.state === 'stunned') speed = 0;

    if (this.state === 'idle' || this.state === 'stunned') {
      this._wander(dt, speed);
    } else {
      // move toward player (ignores walls — ghost phases)
      const len = Math.max(0.001, dist);
      this.position.x += (dx / len) * speed * dt;
      this.position.z += (dz / len) * speed * dt;
    }

    // contain to current floor footprint (don't drift off into nothingness)
    const margin = 2;
    this.position.x = Math.max(-margin, Math.min(GRID_W * ROOM_SIZE + margin, this.position.x));
    this.position.z = Math.max(-margin, Math.min(GRID_D * ROOM_SIZE + margin, this.position.z));

    this.group.position.x = this.position.x;
    this.group.position.z = this.position.z;
    this.group.rotation.y = Math.atan2(dx, dz);

    // attack on contact
    let hit = false;
    if (dist < ATTACK_RADIUS && this.cooldown <= 0 && this.state !== 'stunned') {
      hit = true;
      this.cooldown = 2.0;
      // bounce away a bit
      const len = Math.max(0.001, dist);
      this.position.x -= (dx / len) * 3;
      this.position.z -= (dz / len) * 3;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);

    // intensify ambient red glow when close
    const closeness = Math.max(0, 1 - dist / SENSE_RADIUS);
    this.glow.intensity = closeness * (this.frenzy ? 2.4 : 1.4);

    return { hit, distance: dist };
  }

  _wander(dt, speed = NORMAL_SPEED) {
    if (this.target.distanceTo(this.position) < 1.0) {
      // pick a new wander point in the floor
      const floor = this.mansion.floors[this.mansion.currentFloor];
      const r = floor.rooms[Math.floor(Math.random() * floor.rooms.length)];
      const c = this.mansion.cellCenter(r.gx, r.gz);
      this.target.set(c.x, 0, c.z);
    }
    const dx = this.target.x - this.position.x;
    const dz = this.target.z - this.position.z;
    const len = Math.max(0.001, Math.hypot(dx, dz));
    this.position.x += (dx / len) * speed * dt;
    this.position.z += (dz / len) * speed * dt;
  }
}
