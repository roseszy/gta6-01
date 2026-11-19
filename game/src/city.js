// Solmar Bay: a procedural sun-soaked coastal city. A 9x9 grid of blocks on a
// 54-unit pitch, streets 14 wide, downtown towers in the middle, hotels along
// the beachfront, a marina at the south-west corner and the bay beyond the
// southern shore. Buildings are boxes with painted facades; collisions are
// axis-aligned boxes, and the road graph drives the traffic.
import * as THREE from 'three';
import { clamp, mulberry32, pick, rand, randInt } from './util.js';
import { buildingTexture, roadTexture, roofTexture, sandTexture, sidewalkTexture, signTexture } from './textures.js';

export const PITCH = 54;      // street centre to street centre
export const ROAD_W = 14;     // street width
export const GRID = 9;        // blocks across (streets 0..GRID)
export const CITY = GRID * PITCH; // 486: city spans 0..486 in x and z
export const BEACH_Z = CITY + 14; // sand strip south of the city
export const WATER_Z = BEACH_Z + 220;

const DOWNTOWN = { i0: 3, i1: 5, j0: 3, j1: 5 };
const HOTEL_ROW = 8; // beachfront hotels live on block row 8

const PALETTES = [
  ['#e8b48a', '#d9a06f', '#c98f6a'],
  ['#f2e3c6', '#e6d3ae', '#dcc49a'],
  ['#a8c8d8', '#93b8cc', '#7fa9c0'],
  ['#e8e0d0', '#d8cfba', '#c9bda6'],
  ['#d8a0a8', '#c98f9a', '#bb8089'],
];

export const ANCHORS = {
  // Markers sit on streets, curbs and sand — never inside a building block —
  // so a car or a player on foot can always reach them.
  garage: { x: 81, z: 108, label: "Vera's Garage" },
  docks: { x: 56, z: 505, label: 'Solmar Marina' },
  hotel: { x: 243, z: 486, label: 'Solmar Grand Hotel' },
  penthouse: { x: 243, z: 270, label: 'The Azure Penthouse' },
  hospital: { x: 405, z: 162, label: 'Solmar General' },
  police: { x: 135, z: 378, label: 'Solmar PD Central' },
  taxiStand: { x: 230, z: 486, label: 'Taxi Stand' },
  club: { x: 351, z: 324, label: 'Club Neon Palms' },
};

/** Is (x,z) on a street (road surface) rather than inside a block? */
export function isRoad(x, z) {
  const mx = ((x % PITCH) + PITCH) % PITCH;
  const mz = ((z % PITCH) + PITCH) % PITCH;
  return mx < ROAD_W / 2 + 1 || mx > PITCH - ROAD_W / 2 - 1 || mz < ROAD_W / 2 + 1 || mz > PITCH - ROAD_W / 2 - 1;
}

/** Nearest point on a street centre line. */
export function nearestStreetPoint(x, z) {
  const cx = clamp(Math.round(x / PITCH) * PITCH, 0, CITY);
  const cz = clamp(Math.round(z / PITCH) * PITCH, 0, CITY);
  const dx = Math.abs(x - cx); const dz = Math.abs(z - cz);
  return dx < dz ? { x: cx, z } : { x, z: cz };
}

export class City {
  constructor(scene, seed) {
    this.rng = mulberry32(seed);
    this.scene = scene;
    this.colliders = []; // {x, z, hx, hz} building footprints
    this.buildings = []; // meshes, for the minimap
    this.roadGraph = this.buildRoadGraph();
    this.palms = [];
    this.buildGround();
    this.buildBlocks();
    this.buildWaterfront();
    this.buildProps();
    this.buildSigns();
  }

  buildRoadGraph() {
    const nodes = [];
    const index = new Map();
    for (let i = 0; i <= GRID; i += 1) {
      for (let j = 0; j <= GRID; j += 1) {
        const key = i + ',' + j;
        index.set(key, nodes.length);
        nodes.push({ x: i * PITCH, z: j * PITCH, i, j });
      }
    }
    const edges = [];
    for (let i = 0; i <= GRID; i += 1) {
      for (let j = 0; j <= GRID; j += 1) {
        const a = index.get(i + ',' + j);
        if (i < GRID) edges.push([a, index.get((i + 1) + ',' + j)]);
        if (j < GRID) edges.push([a, index.get(i + ',' + (j + 1))]);
      }
    }
    const adj = nodes.map(() => []);
    for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
    return { nodes, adj };
  }

  randomRoadNode(rng) {
    const n = this.roadGraph.nodes[Math.floor(rng() * this.roadGraph.nodes.length)];
    return n;
  }

  buildGround() {
    const rng = this.rng;
    // Base ground: grass-green under the whole city, then asphalt streets.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY + 60, CITY + 60),
      new THREE.MeshLambertMaterial({ color: 0x7d9b5e }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(CITY / 2, -0.05, CITY / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);

    const roadTex = roadTexture();
    roadTex.wrapS = THREE.RepeatWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;
    const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    // Streets as long ribbons, one per grid line in each direction.
    for (let i = 0; i <= GRID; i += 1) {
      for (const horizontal of [true, false]) {
        const len = CITY + ROAD_W;
        const geo = new THREE.PlaneGeometry(horizontal ? len : ROAD_W, horizontal ? ROAD_W : len);
        const mesh = new THREE.Mesh(geo, roadMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(
          horizontal ? CITY / 2 : i * PITCH,
          0,
          horizontal ? i * PITCH : CITY / 2,
        );
        mesh.receiveShadow = true;
        this.scene.add(mesh);
      }
    }
    // Sidewalk slabs inside each block, slightly above the ground.
    const swTex = sidewalkTexture();
    swTex.wrapS = THREE.RepeatWrapping;
    swTex.wrapT = THREE.RepeatWrapping;
    swTex.repeat.set(3, 3);
    const swMat = new THREE.MeshLambertMaterial({ map: swTex });
    for (let i = 0; i < GRID; i += 1) {
      for (let j = 0; j < GRID; j += 1) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(PITCH - ROAD_W, PITCH - ROAD_W), swMat);
        s.rotation.x = -Math.PI / 2;
        s.position.set(i * PITCH + PITCH / 2, 0.02, j * PITCH + PITCH / 2);
        s.receiveShadow = true;
        this.scene.add(s);
      }
    }
    void rng;
  }

  buildBlocks() {
    const rng = this.rng;
    const geoBox = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < GRID; i += 1) {
      for (let j = 0; j < GRID; j += 1) {
        const cx = i * PITCH + PITCH / 2;
        const cz = j * PITCH + PITCH / 2;
        const downtown = i >= DOWNTOWN.i0 && i <= DOWNTOWN.i1 && j >= DOWNTOWN.j0 && j <= DOWNTOWN.j1;
        const hotel = j === HOTEL_ROW;
        const count = downtown ? 1 : randInt(rng, 1, 3);
        for (let b = 0; b < count; b += 1) {
          const w = downtown ? rand(rng, 30, 38) : rand(rng, 12, 26);
          const d = downtown ? rand(rng, 30, 38) : rand(rng, 12, 26);
          const h = downtown ? rand(rng, 34, 64)
            : hotel ? rand(rng, 18, 34)
            : rand(rng, 9, 26);
          const ox = count === 1 ? 0 : rand(rng, -8, 8);
          const oz = count === 1 ? 0 : rand(rng, -8, 8);
          const x = cx + ox; const z = cz + oz;
          const palette = pick(rng, PALETTES);
          const base = downtown ? palette[randInt(rng, 0, 2)] : palette[randInt(rng, 0, 2)];
          const floors = Math.max(2, Math.round(h / 3.2));
          const facade = buildingTexture(rng, base, floors, Math.max(3, Math.round(w / 5)));
          const mat = new THREE.MeshLambertMaterial({ map: facade });
          const mesh = new THREE.Mesh(geoBox, mat);
          mesh.scale.set(w, h, d);
          mesh.position.set(x, h / 2, z);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.scene.add(mesh);
          // Flat roof cap.
          const roof = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4),
            new THREE.MeshLambertMaterial({ map: roofTexture(rng, '#5a5148') }),
          );
          roof.position.set(x, h + 0.25, z);
          this.scene.add(roof);
          this.colliders.push({ x, z, hx: w / 2 + 0.3, hz: d / 2 + 0.3 });
          this.buildings.push({ x, z, w, d, h });
        }
      }
    }
  }

  buildWaterfront() {
    const rng = this.rng;
    // Sand strip, then the bay.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY + 60, BEACH_Z - CITY + 24),
      new THREE.MeshLambertMaterial({ map: sandTexture(rng) }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(CITY / 2, 0.03, CITY + (BEACH_Z - CITY) / 2 + 4);
    sand.receiveShadow = true;
    this.scene.add(sand);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY + 400, 400),
      new THREE.MeshLambertMaterial({ color: 0x1e7fa8, transparent: true, opacity: 0.92 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(CITY / 2, -0.4, BEACH_Z + 214);
    this.scene.add(water);
    this.water = water;

    // Marina docks: wooden piers jutting into the bay.
    const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
    for (let p = 0; p < 3; p += 1) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 46), pierMat);
      pier.position.set(30 + p * 26, 0.4, BEACH_Z + 26);
      pier.castShadow = true;
      this.scene.add(pier);
      this.colliders.push({ x: 30 + p * 26, z: BEACH_Z + 26, hx: 2.4, hz: 23 });
    }
    // A few moored boats (hull + cabin).
    const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    const cabinMat = new THREE.MeshLambertMaterial({ color: 0x2e6f9e });
    for (let b = 0; b < 4; b += 1) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 12), hullMat);
      hull.position.y = 0.4;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 5), cabinMat);
      cabin.position.set(0, 1.8, -1);
      g.add(hull, cabin);
      g.position.set(22 + b * 26, -0.2, BEACH_Z + 44 + (b % 2) * 10);
      g.rotation.y = (b % 2 === 0 ? 0.15 : -0.12);
      this.scene.add(g);
    }
  }

  buildProps() {
    const rng = this.rng;
    // Palm trees along the beachfront boulevard and the main avenue.
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 7, 6);
    const leafGeo = new THREE.ConeGeometry(2.6, 3.2, 6);
    const addPalm = (x, z) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 3.5;
      trunk.castShadow = true;
      const leaves = new THREE.Mesh(leafGeo, leafMat);
      leaves.position.y = 8.2;
      leaves.castShadow = true;
      g.add(trunk, leaves);
      g.position.set(x, 0, z);
      this.scene.add(g);
      this.palms.push({ x, z });
    };
    for (let i = 0; i <= GRID; i += 1) {
      addPalm(i * PITCH + 9, CITY - 6);
      addPalm(i * PITCH - 9, CITY - 6);
      if (i % 2 === 0) addPalm(i * PITCH + 9, 4 * PITCH + 9);
    }
    // Streetlights at every other intersection.
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
    const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffdf8a, emissiveIntensity: 0.7 });
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 7, 6);
    const lampGeo = new THREE.SphereGeometry(0.55, 8, 6);
    for (let i = 0; i <= GRID; i += 2) {
      for (let j = 0; j <= GRID; j += 2) {
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(i * PITCH + 8, 3.5, j * PITCH + 8);
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(i * PITCH + 8, 7.2, j * PITCH + 8);
        this.scene.add(pole, lamp);
      }
    }
    void rng;
  }

  buildSigns() {
    // Big glowing signs on the south faces of the landmark buildings.
    const signs = [
      { text: 'SOLMAR GRAND', sub: 'HOTEL · BEACHFRONT', bg: '#123a5c', fg: '#ffd23e', x: 243, z: 480, y: 26 },
      { text: "VERA'S GARAGE", sub: 'REPAIRS · 24H', bg: '#5c1a1a', fg: '#ffffff', x: 81, z: 108, y: 12 },
      { text: 'CLUB NEON PALMS', sub: 'DANCE · DRINKS', bg: '#2a1040', fg: '#ff7ad9', x: 351, z: 318, y: 16 },
    ];
    for (const s of signs) {
      const tex = signTexture(s.text, s.sub, s.bg, s.fg);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(22, 5.5),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      mesh.position.set(s.x, s.y, s.z);
      this.scene.add(mesh);
    }
  }

  /** Push a circle (x, z, radius) out of every building it overlaps. Returns true if it hit. */
  collideCircle(pos, radius) {
    let hit = false;
    for (const c of this.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const px = c.hx + radius - Math.abs(dx);
      const pz = c.hz + radius - Math.abs(dz);
      if (px > 0 && pz > 0) {
        hit = true;
        if (px < pz) pos.x = c.x + (dx > 0 ? c.hx + radius : -c.hx - radius);
        else pos.z = c.z + (dz > 0 ? c.hz + radius : -c.hz - radius);
      }
    }
    // Keep everything inside the world (the bay is a wall of water at the south).
    pos.x = clamp(pos.x, 2, CITY - 2);
    pos.z = clamp(pos.z, 2, BEACH_Z + 12);
    return hit;
  }

  /** A random point on a street, for spawning cars and pedestrians. */
  randomStreetPoint(rng) {
    const node = this.randomRoadNode(rng);
    return { x: node.x + rand(rng, -4, 4), z: node.z + rand(rng, -4, 4) };
  }
}
