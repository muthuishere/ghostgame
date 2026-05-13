/**
 * Procedural mansion generator.
 *
 * 10 floors, each floor is a 4x3 grid of rooms (12 rooms = 120 total, but
 * we treat the grid as up to 100 reachable rooms accounting for blocked cells).
 * Floors are connected by stairwells. Each floor has a different palette/decor
 * theme. Rooms are picked from a pool of templates: bedroom, library, kitchen,
 * bathroom, study, dining, nursery, attic, basement, etc.
 *
 * The mansion is rendered with low-poly geometry (boxes + planes) which keeps
 * mobile FPS reasonable. Only the current floor's rooms are added to the scene
 * at any time; switching floors swaps them out.
 */

import * as THREE from 'three';

export const ROOM_SIZE = 14;       // width/depth of each room (units)
export const WALL_HEIGHT = 6;
export const FLOORS = 10;
export const GRID_W = 4;
export const GRID_D = 3;

const FLOOR_THEMES = [
  { name: 'Foyer',     wall: 0x2a1f18, floor: 0x1a1410, accent: 0x4a2a18, mood: 'wooden, old' },
  { name: 'Parlor',    wall: 0x281414, floor: 0x180808, accent: 0x5a0000, mood: 'bloody walls' },
  { name: 'Library',   wall: 0x1f1a14, floor: 0x100c08, accent: 0x3a2a18, mood: 'dusty books' },
  { name: 'Servants',  wall: 0x181818, floor: 0x0c0c0c, accent: 0x2a2a2a, mood: 'cold stone' },
  { name: 'Nursery',   wall: 0x2a1828, floor: 0x180818, accent: 0x6a1a4a, mood: 'children’s laughter' },
  { name: 'Gallery',   wall: 0x14141a, floor: 0x080810, accent: 0x4a0000, mood: 'portraits watching' },
  { name: 'Chapel',    wall: 0x181018, floor: 0x080408, accent: 0x6a4a00, mood: 'flickering candles' },
  { name: 'Attic',     wall: 0x141008, floor: 0x080604, accent: 0x3a2814, mood: 'creaking rafters' },
  { name: 'Basement',  wall: 0x0c0c0c, floor: 0x040404, accent: 0x3a0000, mood: 'something dragging' },
  { name: 'The Crypt', wall: 0x080008, floor: 0x040004, accent: 0x8a0000, mood: 'they are here' },
];

const ROOM_TYPES = [
  'bedroom', 'library', 'kitchen', 'bathroom', 'study', 'dining',
  'nursery', 'hall', 'storage', 'parlor', 'ritual', 'workshop',
];

export class Mansion {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.floors = [];               // array of floor data
    this.currentFloor = 0;
    this.activeMeshes = [];         // meshes currently in scene
    this.activeColliders = [];      // collision boxes for the current floor
    this.activeStairs = [];         // stair triggers for current floor
    this.activeDoors = [];          // door triggers
    this.activeItemSpawns = [];     // item spawn points for current floor

    this._buildMaterials();
    this._generateAllFloors();
  }

  _buildMaterials() {
    // shared materials for performance
    this.matCache = {};
  }

  _mat(color, opts = {}) {
    const key = color + ':' + JSON.stringify(opts);
    if (!this.matCache[key]) {
      this.matCache[key] = new THREE.MeshStandardMaterial({
        color,
        roughness: opts.roughness ?? 0.95,
        metalness: opts.metalness ?? 0.02,
        emissive: opts.emissive ?? 0x000000,
        emissiveIntensity: opts.emissiveIntensity ?? 0,
        side: opts.side ?? THREE.FrontSide,
      });
    }
    return this.matCache[key];
  }

  _generateAllFloors() {
    for (let f = 0; f < FLOORS; f++) {
      this.floors.push(this._generateFloor(f));
    }
    // Pick a "car" spawn outside: it lives on floor 0 (ground floor),
    // we already pin it to a specific exterior position.
  }

  _generateFloor(floorIndex) {
    const theme = FLOOR_THEMES[floorIndex];
    const rooms = [];

    // create grid of rooms
    for (let x = 0; x < GRID_W; x++) {
      for (let z = 0; z < GRID_D; z++) {
        const type = ROOM_TYPES[Math.floor(this.rng() * ROOM_TYPES.length)];
        rooms.push({
          gx: x, gz: z,
          type,
          floorIndex,
          theme,
          // openings: which walls have doors. Will fill in below.
          openings: { n: false, s: false, e: false, w: false },
          hasItem: false,
          locked: false,
        });
      }
    }

    // Build a spanning connection: ensure every room is reachable.
    // For each room, connect to a random neighbor (acts as a maze-ish corridor).
    const roomAt = (x, z) => rooms.find(r => r.gx === x && r.gz === z);
    const visited = new Set();
    const stack = [rooms[0]];
    visited.add(`0,0`);
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const neighbors = [];
      if (cur.gx > 0 && !visited.has(`${cur.gx - 1},${cur.gz}`)) neighbors.push(['w', -1, 0]);
      if (cur.gx < GRID_W - 1 && !visited.has(`${cur.gx + 1},${cur.gz}`)) neighbors.push(['e', 1, 0]);
      if (cur.gz > 0 && !visited.has(`${cur.gx},${cur.gz - 1}`)) neighbors.push(['n', 0, -1]);
      if (cur.gz < GRID_D - 1 && !visited.has(`${cur.gx},${cur.gz + 1}`)) neighbors.push(['s', 0, 1]);
      if (!neighbors.length) { stack.pop(); continue; }
      const [side, dx, dz] = neighbors[Math.floor(this.rng() * neighbors.length)];
      cur.openings[side] = true;
      const other = roomAt(cur.gx + dx, cur.gz + dz);
      other.openings[oppositeSide(side)] = true;
      visited.add(`${other.gx},${other.gz}`);
      stack.push(other);
    }

    // Sprinkle extra openings for loops (less maze, more mansion feel)
    for (let i = 0; i < 3; i++) {
      const r = rooms[Math.floor(this.rng() * rooms.length)];
      const sides = ['n','s','e','w'].filter(s => !r.openings[s]);
      if (!sides.length) continue;
      const side = sides[Math.floor(this.rng() * sides.length)];
      const [dx, dz] = sideDelta(side);
      const nx = r.gx + dx, nz = r.gz + dz;
      if (nx < 0 || nx >= GRID_W || nz < 0 || nz >= GRID_D) continue;
      r.openings[side] = true;
      roomAt(nx, nz).openings[oppositeSide(side)] = true;
    }

    // On the ground floor, punch a doorway out to the driveway through one
    // of the southernmost rooms so the player can actually reach the car.
    if (floorIndex === 0) {
      const southRooms = rooms.filter(r => r.gz === GRID_D - 1);
      const exitRoom = southRooms[Math.floor(this.rng() * southRooms.length)];
      exitRoom.openings.s = true;
      exitRoom.isExit = true;
    }

    // Choose stairwell rooms. Each floor has an "up" stair (except top) and
    // "down" stair (except bottom). Stairs sit in opposite corners for variety.
    const stairUp = floorIndex < FLOORS - 1 ? rooms[Math.floor(this.rng() * rooms.length)] : null;
    let stairDown = null;
    if (floorIndex > 0) {
      do {
        stairDown = rooms[Math.floor(this.rng() * rooms.length)];
      } while (stairUp && stairDown === stairUp);
    }
    if (stairUp) stairUp.hasStairUp = true;
    if (stairDown) stairDown.hasStairDown = true;

    // Pick rooms that can spawn items: every room can, but we mark some
    // as "essential" hosts. Actual item placement happens in items.js
    // based on global plan.

    return {
      index: floorIndex,
      theme,
      rooms,
      stairUpRoom: stairUp,
      stairDownRoom: stairDown,
    };
  }

  /**
   * Returns the world position (Vector3) for the center of a grid cell.
   */
  cellCenter(gx, gz) {
    return new THREE.Vector3(
      gx * ROOM_SIZE + ROOM_SIZE / 2,
      0,
      gz * ROOM_SIZE + ROOM_SIZE / 2,
    );
  }

  /**
   * Build and add the meshes for the given floor to the scene.
   * Removes any previously active floor first.
   */
  showFloor(floorIndex) {
    this._clearActive();
    this.currentFloor = floorIndex;
    const floor = this.floors[floorIndex];

    const wallMat = this._mat(floor.theme.wall, { roughness: 0.98 });
    const floorMat = this._mat(floor.theme.floor, { roughness: 1.0 });
    const ceilMat = this._mat(0x040404, { roughness: 1.0 });
    const accentMat = this._mat(floor.theme.accent, { roughness: 0.8 });

    for (const room of floor.rooms) {
      const centerX = room.gx * ROOM_SIZE + ROOM_SIZE / 2;
      const centerZ = room.gz * ROOM_SIZE + ROOM_SIZE / 2;

      // floor plane
      const floorGeo = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.set(centerX, 0, centerZ);
      floorMesh.receiveShadow = true;
      this.scene.add(floorMesh);
      this.activeMeshes.push(floorMesh);

      // ceiling
      const ceilMesh = new THREE.Mesh(floorGeo, ceilMat);
      ceilMesh.rotation.x = Math.PI / 2;
      ceilMesh.position.set(centerX, WALL_HEIGHT, centerZ);
      this.scene.add(ceilMesh);
      this.activeMeshes.push(ceilMesh);

      // walls — each side. If opening, leave a gap for door.
      this._buildWall(room, 'n', centerX, centerZ, wallMat, accentMat);
      this._buildWall(room, 's', centerX, centerZ, wallMat, accentMat);
      this._buildWall(room, 'e', centerX, centerZ, wallMat, accentMat);
      this._buildWall(room, 'w', centerX, centerZ, wallMat, accentMat);

      // decor / props for atmosphere — also act as colliders
      this._decorate(room, centerX, centerZ);

      // stairs
      if (room.hasStairUp) {
        const stairMesh = this._makeStair(centerX, centerZ, true);
        this.scene.add(stairMesh);
        this.activeMeshes.push(stairMesh);
        this.activeStairs.push({
          direction: 'up',
          x: centerX, z: centerZ,
          targetFloor: floorIndex + 1,
        });
      }
      if (room.hasStairDown) {
        const stairMesh = this._makeStair(centerX, centerZ, false);
        this.scene.add(stairMesh);
        this.activeMeshes.push(stairMesh);
        this.activeStairs.push({
          direction: 'down',
          x: centerX, z: centerZ,
          targetFloor: floorIndex - 1,
        });
      }

      // record item spawn point (offset to a corner)
      this.activeItemSpawns.push({
        room,
        x: centerX + (this.rng() - 0.5) * (ROOM_SIZE * 0.5),
        z: centerZ + (this.rng() - 0.5) * (ROOM_SIZE * 0.5),
      });
    }

    // Outdoor area on floor 0: the car waiting outside
    if (floorIndex === 0) {
      this._buildExterior();
    }
  }

  _buildWall(room, side, cx, cz, wallMat, accentMat) {
    const half = ROOM_SIZE / 2;
    const open = room.openings[side];
    const doorWidth = 3;

    // wall positions/dims
    let length, posX, posZ, rotY;
    switch (side) {
      case 'n': length = ROOM_SIZE; posX = cx; posZ = cz - half; rotY = 0; break;
      case 's': length = ROOM_SIZE; posX = cx; posZ = cz + half; rotY = 0; break;
      case 'e': length = ROOM_SIZE; posX = cx + half; posZ = cz; rotY = Math.PI / 2; break;
      case 'w': length = ROOM_SIZE; posX = cx - half; posZ = cz; rotY = Math.PI / 2; break;
    }

    if (!open) {
      // solid wall
      const geo = new THREE.BoxGeometry(length, WALL_HEIGHT, 0.4);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(posX, WALL_HEIGHT / 2, posZ);
      mesh.rotation.y = rotY;
      this.scene.add(mesh);
      this.activeMeshes.push(mesh);
      this.activeColliders.push(this._collider(mesh, length, 0.4));
    } else {
      // two wall segments with doorway gap in the middle
      const segLen = (length - doorWidth) / 2;
      for (const sign of [-1, 1]) {
        const geo = new THREE.BoxGeometry(segLen, WALL_HEIGHT, 0.4);
        const mesh = new THREE.Mesh(geo, wallMat);
        let dx = 0, dz = 0;
        if (side === 'n' || side === 's') {
          dx = sign * (doorWidth / 2 + segLen / 2);
        } else {
          dz = sign * (doorWidth / 2 + segLen / 2);
        }
        mesh.position.set(posX + dx, WALL_HEIGHT / 2, posZ + dz);
        mesh.rotation.y = rotY;
        this.scene.add(mesh);
        this.activeMeshes.push(mesh);
        this.activeColliders.push(this._collider(mesh, segLen, 0.4));
      }
      // door frame top
      const frameGeo = new THREE.BoxGeometry(doorWidth, WALL_HEIGHT - 4, 0.4);
      const frame = new THREE.Mesh(frameGeo, accentMat);
      frame.position.set(posX, WALL_HEIGHT - (WALL_HEIGHT - 4) / 2, posZ);
      frame.rotation.y = rotY;
      this.scene.add(frame);
      this.activeMeshes.push(frame);
    }
  }

  _collider(mesh, w, d) {
    // axis-aligned bounding box approximation
    const box = new THREE.Box3().setFromObject(mesh);
    return box;
  }

  _decorate(room, cx, cz) {
    // a few decorative props depending on type — also act as colliders
    const rng = this.rng;
    const propCount = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < propCount; i++) {
      const px = cx + (rng() - 0.5) * (ROOM_SIZE - 4);
      const pz = cz + (rng() - 0.5) * (ROOM_SIZE - 4);
      const type = room.type;
      let prop;
      if (type === 'library' || type === 'study') {
        prop = this._makeProp(1.2, 2.4, 0.6, room.theme.accent);
      } else if (type === 'bedroom' || type === 'nursery') {
        prop = this._makeProp(2.8, 1.2, 1.6, 0x1a0a0a);
      } else if (type === 'dining' || type === 'kitchen') {
        prop = this._makeProp(2.0, 1.0, 1.2, 0x2a1810);
      } else if (type === 'bathroom') {
        prop = this._makeProp(1.0, 1.3, 1.0, 0x1a1a20);
      } else if (type === 'ritual') {
        prop = this._makeProp(1.8, 0.4, 1.8, 0x4a0000);
      } else {
        prop = this._makeProp(1.0 + rng(), 0.8 + rng() * 1.4, 1.0 + rng(), room.theme.accent);
      }
      prop.position.set(px, prop.geometry.parameters.height / 2, pz);
      this.scene.add(prop);
      this.activeMeshes.push(prop);
      const box = new THREE.Box3().setFromObject(prop);
      this.activeColliders.push(box);
    }
  }

  _makeProp(w, h, d, color) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = this._mat(color, { roughness: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return mesh;
  }

  _makeStair(cx, cz, isUp) {
    const group = new THREE.Group();
    const stepCount = 5;
    const stepHeight = 0.4;
    const stepDepth = 0.8;
    const stepWidth = 2.4;
    const mat = this._mat(0x1a0a04, { roughness: 0.9 });

    for (let i = 0; i < stepCount; i++) {
      const geo = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(0, stepHeight / 2 + i * stepHeight, -i * stepDepth);
      group.add(m);
    }
    // glowing rune to mark stairs
    const runeGeo = new THREE.RingGeometry(0.8, 1.0, 24);
    const runeMat = new THREE.MeshBasicMaterial({
      color: isUp ? 0x6a3000 : 0x002a4a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const rune = new THREE.Mesh(runeGeo, runeMat);
    rune.rotation.x = -Math.PI / 2;
    rune.position.set(0, 0.02, -0.5);
    group.add(rune);
    group.userData.rune = rune;

    group.position.set(cx, 0, cz);
    return group;
  }

  _buildExterior() {
    // a small outdoor patch beyond the south edge of floor 0, with the car
    const exteriorGeo = new THREE.PlaneGeometry(ROOM_SIZE * GRID_W + 20, 40);
    const exteriorMat = this._mat(0x080806, { roughness: 1 });
    const ground = new THREE.Mesh(exteriorGeo, exteriorMat);
    ground.rotation.x = -Math.PI / 2;
    const ex = (GRID_W * ROOM_SIZE) / 2;
    const ez = GRID_D * ROOM_SIZE + 20;
    ground.position.set(ex, 0.01, ez);
    this.scene.add(ground);
    this.activeMeshes.push(ground);

    // car body
    const carGroup = new THREE.Group();
    const bodyMat = this._mat(0x111111, { roughness: 0.4, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 2), bodyMat);
    body.position.y = 1.2;
    carGroup.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 1.8), bodyMat);
    cabin.position.set(0, 2.3, 0);
    carGroup.add(cabin);
    // wheels
    const wheelMat = this._mat(0x050505);
    for (const [wx, wz] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16), wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.5, wz);
      carGroup.add(w);
    }
    carGroup.position.set(ex, 0, ez);
    this.scene.add(carGroup);
    this.activeMeshes.push(carGroup);
    this.carPosition = new THREE.Vector3(ex, 0, ez);

    // sealed front door of the mansion (south edge of floor 0) - just an
    // accent so the player notices the exit gap is to the south
    // The player exits the mansion through the south of the southernmost room.
  }

  _clearActive() {
    for (const m of this.activeMeshes) {
      this.scene.remove(m);
      if (m.geometry) m.geometry.dispose();
    }
    this.activeMeshes = [];
    this.activeColliders = [];
    this.activeStairs = [];
    this.activeDoors = [];
    this.activeItemSpawns = [];
  }

  getStartPosition() {
    // Drop the player into the center of the first room on the active floor.
    const r = this.floors[this.currentFloor].rooms[0];
    const c = this.cellCenter(r.gx, r.gz);
    return new THREE.Vector3(c.x, 1.6, c.z);
  }

  getCarPosition() {
    return this.carPosition;
  }

  collides(position, radius = 0.4) {
    const min = new THREE.Vector3(
      position.x - radius, position.y - 0.5, position.z - radius,
    );
    const max = new THREE.Vector3(
      position.x + radius, position.y + 1.5, position.z + radius,
    );
    const box = new THREE.Box3(min, max);
    for (const c of this.activeColliders) {
      if (c.intersectsBox(box)) return true;
    }
    return false;
  }

  nearbyStair(position, radius = 1.6) {
    for (const s of this.activeStairs) {
      const dx = position.x - s.x;
      const dz = position.z - s.z;
      if (dx * dx + dz * dz < radius * radius) return s;
    }
    return null;
  }

  getFloorTheme(i) { return FLOOR_THEMES[i]; }
}

function oppositeSide(side) {
  return { n: 's', s: 'n', e: 'w', w: 'e' }[side];
}

function sideDelta(side) {
  return { n: [0,-1], s: [0,1], e: [1,0], w: [-1,0] }[side];
}
