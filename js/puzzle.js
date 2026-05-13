/**
 * Puzzle room: a small standalone chamber the player is teleported into when
 * they interact with a shrine. Solve = warp back with reward. Abort (press B)
 * = warp back with no reward.
 *
 * Layout: 14x14 stone chamber positioned far below the mansion (y = -200) so
 * it never collides with floor geometry. Three glowing glyph pads sit in a
 * triangle. The hint UI tells the player which glyph to step on.
 */

import * as THREE from 'three';

const ROOM_W = 14;
const ROOM_H = 5;
const PAD_RADIUS = 1.0;
// Far outside the mansion footprint (≈ (-2,-2) → (58,44) for a 4×3 grid of
// 14-unit rooms) so the chamber never overlaps with any wall collider.
const ORIGIN = new THREE.Vector3(300, 0, 300);

const GLYPHS = [
  { name: 'moon', color: 0xa0b8ff, hint: 'Step onto the symbol of the moon' },
  { name: 'sun',  color: 0xffc060, hint: 'Step onto the symbol of the sun' },
  { name: 'eye',  color: 0xff5050, hint: 'Step onto the symbol of the eye' },
];

export class PuzzleRoom {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.group = new THREE.Group();
    this.group.position.copy(ORIGIN);
    this.group.visible = false;
    this.scene.add(this.group);

    this.pads = [];
    this.correctIndex = 0;
    this.active = false;
    this.cooldown = 0;       // briefly ignores pad collision right after entering

    this._build();
  }

  _build() {
    // floor
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1820, roughness: 0.95, emissive: 0x080814,
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.2, ROOM_W), floorMat);
    floor.position.y = -0.1;
    this.group.add(floor);

    // walls — four panels
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x14121c, roughness: 0.9, emissive: 0x06040a,
    });
    const mkWall = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, ROOM_H, d), wallMat);
      m.position.set(x, ROOM_H / 2, z);
      this.group.add(m);
    };
    mkWall(ROOM_W, 0.3, 0, -ROOM_W / 2);
    mkWall(ROOM_W, 0.3, 0,  ROOM_W / 2);
    mkWall(0.3, ROOM_W, -ROOM_W / 2, 0);
    mkWall(0.3, ROOM_W,  ROOM_W / 2, 0);

    // ceiling
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.2, ROOM_W), wallMat);
    ceil.position.y = ROOM_H;
    this.group.add(ceil);

    // ambient light inside the chamber — cool, otherworldly
    const ambient = new THREE.PointLight(0x6080ff, 1.4, 18, 2);
    ambient.position.set(0, ROOM_H * 0.7, 0);
    this.group.add(ambient);

    // three glyph pads in a triangle
    const radius = 4;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      const pad = this._buildPad(GLYPHS[i], x, z);
      this.group.add(pad.group);
      this.pads.push({ ...pad, x, z, glyph: GLYPHS[i] });
    }
  }

  _buildPad(glyph, x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // pad disk
    const padMat = new THREE.MeshStandardMaterial({
      color: glyph.color, emissive: glyph.color, emissiveIntensity: 0.6, roughness: 0.4,
    });
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(PAD_RADIUS, PAD_RADIUS, 0.12, 24), padMat);
    disk.position.y = 0.06;
    group.add(disk);

    // floating glyph icon
    const iconMat = new THREE.MeshBasicMaterial({ color: glyph.color });
    let icon;
    if (glyph.name === 'moon') {
      icon = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 20, Math.PI * 1.2), iconMat);
    } else if (glyph.name === 'sun') {
      icon = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), iconMat);
    } else {
      icon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), iconMat);
    }
    icon.position.y = 1.4;
    group.add(icon);

    // pillar of light
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, PAD_RADIUS * 0.9, ROOM_H - 0.2, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: glyph.color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    beam.position.y = ROOM_H / 2;
    group.add(beam);

    const light = new THREE.PointLight(glyph.color, 1.2, 8, 2);
    light.position.y = 1.4;
    group.add(light);

    return { group, disk, icon, beam, light };
  }

  /** Returns the world-space spawn point the player should be placed at. */
  spawnPoint() {
    return new THREE.Vector3(ORIGIN.x, ORIGIN.y + 1.6, ORIGIN.z + 4.5);
  }

  /** Returns the correct glyph descriptor (for hint display). */
  enter() {
    this.group.visible = true;
    this.active = true;
    this.cooldown = 0.5;
    this.correctIndex = Math.floor(this.rng() * 3);
    return this.pads[this.correctIndex].glyph;
  }

  /** Hides the chamber and clears state. */
  exit() {
    this.group.visible = false;
    this.active = false;
  }

  /** Pick a new correct glyph (used after a wrong answer). */
  reshuffle() {
    let next = Math.floor(this.rng() * 3);
    if (next === this.correctIndex) next = (next + 1) % 3;
    this.correctIndex = next;
    return this.pads[this.correctIndex].glyph;
  }

  /**
   * Returns 'correct' | 'wrong' | null based on whether the player is
   * standing on a pad this frame. Caller must clear via reshuffle() or exit()
   * after handling a result so the same pad doesn't fire repeatedly.
   */
  update(dt, time, playerWorldPos) {
    if (!this.active) return null;
    this.cooldown = Math.max(0, this.cooldown - dt);

    // spin glyphs + bob
    for (let i = 0; i < this.pads.length; i++) {
      const p = this.pads[i];
      p.icon.rotation.y += dt * (1 + i * 0.3);
      p.icon.position.y = 1.4 + Math.sin(time * 2 + i) * 0.08;
      // highlight the correct one only AFTER a wrong attempt? No — always
      // identical so the player has to read the hint. Same emissive.
    }

    if (this.cooldown > 0) return null;

    // player local position relative to chamber origin
    const lx = playerWorldPos.x - ORIGIN.x;
    const lz = playerWorldPos.z - ORIGIN.z;
    for (let i = 0; i < this.pads.length; i++) {
      const p = this.pads[i];
      const dx = lx - p.x;
      const dz = lz - p.z;
      if (dx * dx + dz * dz < PAD_RADIUS * PAD_RADIUS) {
        return i === this.correctIndex ? 'correct' : 'wrong';
      }
    }
    return null;
  }
}
