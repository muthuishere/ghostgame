/**
 * Items: spawning, rendering, pickup detection.
 *
 * Item types:
 *   - Essential car parts (5): key, sparkPlug, engine, petrol, tire
 *     One scattered on each odd floor (1, 3, 5, 7, 9 by index 0..9).
 *   - Weapons: gun (one), bullets (a few), bombs (a few)
 *   - Pets: cat (warns), dog (one-time scare-off)
 *   - Fire (hazard, not picked up - emits light, drains sanity on touch)
 *   - Door keys (for locked doors — placeholder hooks)
 *
 * Each floor gets ~6-8 items spawned in random rooms.
 */

import * as THREE from 'three';

export const ITEM_TYPES = {
  key:       { label: 'Car Key',     color: 0xffd060, kind: 'essential', emissive: 0x664400 },
  sparkPlug: { label: 'Spark Plug',  color: 0xe0e0ff, kind: 'essential', emissive: 0x222244 },
  engine:    { label: 'Engine Part', color: 0xa07050, kind: 'essential', emissive: 0x442200 },
  petrol:    { label: 'Petrol Can',  color: 0xe04020, kind: 'essential', emissive: 0x441000 },
  tire:      { label: 'Tire',        color: 0x303030, kind: 'essential', emissive: 0x111111 },
  gun:       { label: 'Revolver',    color: 0x707080, kind: 'weapon',    emissive: 0x222222 },
  bullets:   { label: 'Bullets x3',  color: 0xb0a060, kind: 'weapon',    emissive: 0x332200 },
  bomb:      { label: 'Bomb',        color: 0x202020, kind: 'weapon',    emissive: 0x660000 },
  cat:       { label: 'Black Cat',   color: 0x101010, kind: 'pet',       emissive: 0x002a2a },
  dog:       { label: 'Guard Dog',   color: 0x402010, kind: 'pet',       emissive: 0x002020 },
  fire:      { label: 'Fire',        color: 0xff4a00, kind: 'hazard',    emissive: 0xff2200 },
  doll:      { label: 'Doll',        color: 0xf0d0c0, kind: 'hazard',    emissive: 0x440000 },
  shrine:    { label: 'Shrine',      color: 0x80a0ff, kind: 'shrine',    emissive: 0x2040a0 },
};

export class Items {
  constructor(scene, mansion, audio, rng) {
    this.scene = scene;
    this.mansion = mansion;
    this.audio = audio;
    this.rng = rng;
    this.activeItems = [];        // { type, mesh, light, position, floor }
    this.plan = this._planEssentials();
  }

  /** Distribute the 5 essential parts deterministically across floors */
  _planEssentials() {
    // The 5 essentials live on floors 1, 3, 5, 7, 9 (alternating, scaling difficulty).
    // The car-key on the highest floor so player must traverse the whole mansion.
    return {
      1: 'tire',
      3: 'petrol',
      5: 'sparkPlug',
      7: 'engine',
      9: 'key',
    };
  }

  spawnForFloor(floorIndex) {
    this._clear();
    const floor = this.mansion.floors[floorIndex];
    const rooms = floor.rooms.slice();
    // shuffle rooms
    for (let i = rooms.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [rooms[i], rooms[j]] = [rooms[j], rooms[i]];
    }

    let spawned = 0;

    // essential part for this floor
    const essentialType = this.plan[floorIndex];
    if (essentialType) {
      const r = rooms[spawned++];
      this._spawn(essentialType, r, floorIndex);
    }

    // weapons - first floor 0 always has a flashlight battery hint + maybe gun spawn later
    // distribute weapons / pets / fire / bombs randomly
    const extras = [];
    if (floorIndex === 0) extras.push('gun', 'bullets', 'cat');
    if (floorIndex === 2) extras.push('bullets', 'bomb', 'fire');
    if (floorIndex === 4) extras.push('dog', 'bullets');
    if (floorIndex === 6) extras.push('bomb', 'fire', 'bullets');
    if (floorIndex === 8) extras.push('bullets', 'fire', 'fire');
    // dolls on even-numbered floors (excluding ground floor) — porcelain jumpscare
    if (floorIndex === 2 || floorIndex === 4 || floorIndex === 6 || floorIndex === 8) {
      extras.push('doll');
    }
    // shrines on odd floors — they grant a way to bargain with the house
    if (floorIndex === 1 || floorIndex === 3 || floorIndex === 5 || floorIndex === 7) {
      extras.push('shrine');
    }
    // every floor gets a wildcard
    const wild = ['bullets', 'bomb', 'fire', 'cat'][Math.floor(this.rng() * 4)];
    extras.push(wild);

    for (const type of extras) {
      if (spawned >= rooms.length) break;
      const r = rooms[spawned++];
      this._spawn(type, r, floorIndex);
    }
  }

  _spawn(type, room, floorIndex) {
    const def = ITEM_TYPES[type];
    if (!def) return;

    const center = this.mansion.cellCenter(room.gx, room.gz);
    const px = center.x + (this.rng() - 0.5) * 6;
    const pz = center.z + (this.rng() - 0.5) * 6;

    let mesh;
    if (type === 'fire') {
      mesh = this._makeFire();
    } else if (type === 'cat' || type === 'dog') {
      mesh = this._makePet(def.color);
    } else if (type === 'tire') {
      mesh = this._makeTire();
    } else if (type === 'petrol') {
      mesh = this._makePetrol(def.color);
    } else if (type === 'gun') {
      mesh = this._makeGun();
    } else if (type === 'bomb') {
      mesh = this._makeBomb();
    } else if (type === 'key') {
      mesh = this._makeKey();
    } else if (type === 'doll') {
      mesh = this._makeDoll();
    } else if (type === 'shrine') {
      mesh = this._makeShrine();
    } else {
      // generic glowing pickup
      const geo = new THREE.IcosahedronGeometry(0.3, 0);
      const mat = new THREE.MeshStandardMaterial({
        color: def.color,
        emissive: def.emissive,
        emissiveIntensity: 1.2,
        roughness: 0.5,
        metalness: 0.4,
      });
      mesh = new THREE.Mesh(geo, mat);
    }

    const baseY = (type === 'fire' || type === 'doll' || type === 'shrine') ? 0 : 0.7;
    mesh.position.set(px, baseY, pz);
    mesh.userData.type = type;
    mesh.userData.bobOffset = this.rng() * Math.PI * 2;
    this.scene.add(mesh);

    // attach a small point light to make the item glow
    let light = null;
    if (type === 'fire') {
      light = new THREE.PointLight(0xff5a10, 2.5, 8, 2);
      light.position.set(px, 1, pz);
      this.scene.add(light);
    } else if (type === 'shrine') {
      light = new THREE.PointLight(0x80a0ff, 1.8, 9, 2);
      light.position.set(px, 1.2, pz);
      this.scene.add(light);
    } else if (type === 'doll') {
      light = new THREE.PointLight(0xff4040, 0.4, 4, 2);
      light.position.set(px, 0.4, pz);
      this.scene.add(light);
    } else if (def.kind === 'essential' || def.kind === 'pet') {
      light = new THREE.PointLight(def.emissive || 0x442200, 0.9, 5, 2);
      light.position.set(px, 1, pz);
      this.scene.add(light);
    }

    const entry = {
      type, def, mesh, light,
      position: new THREE.Vector3(px, 1, pz),
      room, floorIndex,
    };
    if (type === 'doll') {
      entry.triggered = false;
      entry.scareTime = 0;
    }
    this.activeItems.push(entry);
  }

  _makeFire() {
    const group = new THREE.Group();
    const baseGeo = new THREE.ConeGeometry(0.6, 1.2, 8);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xff4a00,
      emissive: 0xff3000,
      emissiveIntensity: 2.0,
      roughness: 0.7,
      transparent: true,
      opacity: 0.85,
    });
    const flame = new THREE.Mesh(baseGeo, baseMat);
    flame.position.y = 0.6;
    group.add(flame);
    // inner brighter cone
    const inner = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffc080, transparent: true, opacity: 0.9 })
    );
    inner.position.y = 0.4;
    group.add(inner);
    group.userData.flame = flame;
    group.userData.inner = inner;
    return group;
  }

  _makePet(color) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: 0.7, emissive: 0x111111,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 1.0), mat);
    body.position.y = 0.3;
    group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), mat);
    head.position.set(0, 0.55, 0.5);
    group.add(head);
    // glowing eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe060 });
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat);
    e1.position.set(0.15, 0.62, 0.74);
    const e2 = e1.clone(); e2.position.set(-0.15, 0.62, 0.74);
    group.add(e1, e2);
    return group;
  }

  _makeTire() {
    const geo = new THREE.TorusGeometry(0.4, 0.16, 8, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = Math.PI / 2;
    return m;
  }

  _makePetrol(color) {
    const group = new THREE.Group();
    const can = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.7, 0.35),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3, emissive: 0x331000 })
    );
    can.position.y = 0.35;
    group.add(can);
    return group;
  }

  _makeGun() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.16, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x606060, metalness: 0.7, roughness: 0.4 })
    );
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.3, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.8 })
    );
    grip.position.set(-0.2, -0.2, 0);
    group.add(body, grip);
    return group;
  }

  _makeBomb() {
    const group = new THREE.Group();
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, emissive: 0x440000 })
    );
    const fuse = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6),
      new THREE.MeshBasicMaterial({ color: 0x664422 })
    );
    fuse.position.y = 0.35;
    group.add(ball, fuse);
    return group;
  }

  _makeKey() {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.15, 0.04, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xffd060, metalness: 0.9, roughness: 0.2, emissive: 0x886600, emissiveIntensity: 0.6 })
    );
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.06, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xffd060, metalness: 0.9, roughness: 0.2, emissive: 0x886600, emissiveIntensity: 0.6 })
    );
    shaft.position.x = 0.27;
    group.add(ring, shaft);
    return group;
  }

  _makeDoll() {
    // sitting porcelain doll: round head, dress body, button eyes that catch the light
    const group = new THREE.Group();
    const porcelain = new THREE.MeshStandardMaterial({
      color: 0xf0d8c8, roughness: 0.5, metalness: 0.05, emissive: 0x110000,
    });
    const dress = new THREE.MeshStandardMaterial({
      color: 0x4a0010, roughness: 0.85, emissive: 0x200008,
    });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 10), dress);
    body.position.y = 0.27;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), porcelain);
    head.position.y = 0.65;
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3030 });
    const eL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat);
    const eR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat);
    eL.position.set(-0.07, 0.7, 0.18);
    eR.position.set(0.07, 0.7, 0.18);
    // crack across the face
    const crack = new THREE.Mesh(
      new THREE.BoxGeometry(0.005, 0.18, 0.01),
      new THREE.MeshBasicMaterial({ color: 0x100000 })
    );
    crack.position.set(0.02, 0.66, 0.21);
    crack.rotation.z = 0.3;
    group.add(body, head, eL, eR, crack);
    group.userData.head = head;
    group.userData.eyes = [eL, eR];
    return group;
  }

  _makeShrine() {
    // low ritual circle: stone ring + 3 glowing runes that float above
    const group = new THREE.Group();
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a4a, roughness: 0.7, emissive: 0x10204a, emissiveIntensity: 0.4,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 8, 32), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.04;
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 32),
      new THREE.MeshBasicMaterial({ color: 0x101830, transparent: true, opacity: 0.6 })
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.05;
    const runeMat = new THREE.MeshBasicMaterial({ color: 0x80b0ff });
    const runes = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), runeMat);
      const a = (i / 3) * Math.PI * 2;
      r.position.set(Math.cos(a) * 0.55, 0.9 + i * 0.05, Math.sin(a) * 0.55);
      runes.push(r);
      group.add(r);
    }
    group.add(ring, inner);
    group.userData.runes = runes;
    return group;
  }

  /** Returns the item under the player if within pickup range. */
  itemNear(position, radius = 1.4) {
    let best = null;
    let bestDist = radius * radius;
    for (const it of this.activeItems) {
      const dx = it.position.x - position.x;
      const dz = it.position.z - position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist) { best = it; bestDist = d2; }
    }
    return best;
  }

  /** Returns the nearest fire hazard if player is touching it. */
  fireTouching(position) {
    for (const it of this.activeItems) {
      if (it.type !== 'fire') continue;
      const dx = it.position.x - position.x;
      const dz = it.position.z - position.z;
      if (dx * dx + dz * dz < 1.2) return it;
    }
    return null;
  }

  consume(item) {
    const idx = this.activeItems.indexOf(item);
    if (idx >= 0) this.activeItems.splice(idx, 1);
    this.scene.remove(item.mesh);
    if (item.light) this.scene.remove(item.light);
    if (item.mesh.geometry) item.mesh.geometry.dispose();
  }

  update(dt, time) {
    for (const it of this.activeItems) {
      // bob + spin essentials & weapons
      if (it.type !== 'fire' && it.type !== 'cat' && it.type !== 'dog') {
        it.mesh.position.y = 0.7 + Math.sin(time * 2 + it.mesh.userData.bobOffset) * 0.08;
        it.mesh.rotation.y += dt * 1.2;
      }
      // fire animation
      if (it.type === 'fire') {
        const flame = it.mesh.userData.flame;
        const inner = it.mesh.userData.inner;
        const s = 1 + Math.sin(time * 10 + it.mesh.userData.bobOffset) * 0.15;
        flame.scale.set(s, 1 + Math.sin(time * 13) * 0.15, s);
        inner.scale.set(0.8 + Math.sin(time * 17) * 0.2, 1 + Math.cos(time * 11) * 0.2, 0.8 + Math.sin(time * 14) * 0.2);
        if (it.light) it.light.intensity = 2.0 + Math.sin(time * 22) * 1.0;
      }
      // pet idle - slight bob
      if (it.type === 'cat' || it.type === 'dog') {
        it.mesh.position.y = Math.sin(time * 3 + it.mesh.userData.bobOffset) * 0.04;
      }
      // doll: idle subtle sway; if triggered, lurch toward camera and fade out
      if (it.type === 'doll') {
        if (it.triggered) {
          it.scareTime += dt;
          // 0..0.25s: rapid scale-up + lurch; after 1.2s: vanish
          const s = it.scareTime < 0.25
            ? 1 + (it.scareTime / 0.25) * 1.8
            : 2.8 - Math.min(1, (it.scareTime - 0.25) / 0.8) * 1.8;
          it.mesh.scale.setScalar(s);
          it.mesh.rotation.y += dt * 8;
          if (it.light) it.light.intensity = 0.4 + Math.sin(it.scareTime * 40) * 0.6;
        } else {
          const head = it.mesh.userData.head;
          if (head) head.rotation.y = Math.sin(time * 0.7 + it.mesh.userData.bobOffset) * 0.4;
        }
      }
      // shrine: spin and bob the runes; pulse the column light
      if (it.type === 'shrine') {
        const runes = it.mesh.userData.runes;
        if (runes) {
          for (let i = 0; i < runes.length; i++) {
            const r = runes[i];
            const a = time * 0.6 + (i / runes.length) * Math.PI * 2;
            r.position.x = Math.cos(a) * 0.55;
            r.position.z = Math.sin(a) * 0.55;
            r.position.y = 0.9 + Math.sin(time * 2 + i) * 0.08;
            r.rotation.y += dt * 1.5;
          }
        }
        if (it.light) it.light.intensity = 1.5 + Math.sin(time * 3) * 0.5;
      }
    }
  }

  /** Returns an untriggered doll within radius, if any. */
  dollNear(position, radius = 2.5) {
    const r2 = radius * radius;
    for (const it of this.activeItems) {
      if (it.type !== 'doll' || it.triggered) continue;
      const dx = it.position.x - position.x;
      const dz = it.position.z - position.z;
      if (dx * dx + dz * dz < r2) return it;
    }
    return null;
  }

  /** Returns a shrine within radius, if any. */
  shrineNear(position, radius = 2.0) {
    const r2 = radius * radius;
    for (const it of this.activeItems) {
      if (it.type !== 'shrine') continue;
      const dx = it.position.x - position.x;
      const dz = it.position.z - position.z;
      if (dx * dx + dz * dz < r2) return it;
    }
    return null;
  }

  _clear() {
    for (const it of this.activeItems) {
      this.scene.remove(it.mesh);
      if (it.light) this.scene.remove(it.light);
    }
    this.activeItems = [];
  }
}
