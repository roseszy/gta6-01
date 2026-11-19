// Solmar Bay: a procedural sun-soaked coastal city. Nine blocks across on a
// 54-unit pitch, streets 14 wide, towers downtown, hotels along the beach,
// a marina in the south-west corner and the bay past the southern shore.
// Buildings are textured boxes; collisions are flat footprints, and a road
// graph of intersections drives the traffic.
import * as THREE from 'three';
import { clamp, pick, rand, randInt, seededRandom } from './util.js';
import { asphaltTexture, facadeTexture, pavementTexture, roofTexture, sandTexture, signTexture } from './textures.js';

export const PITCH = 54; // street centre to street centre
export const ROAD_W = 14; // street width
export const GRID = 9; // blocks across (streets 0..GRID)
export const CITY = GRID * PITCH; // 486: the city runs 0..486 in x and z
export const BEACH_Z = CITY + 14; // sand strip south of the city
export const WATER_Z = BEACH_Z + 220; // the bay stretches past here

// Downtown towers live in the middle blocks; beachfront hotels on row 8.
const CORE = { x0: 3, x1: 5, z0: 3, z1: 5 };
const HOTEL_ROW = 8;

const FACADES = [
  ['#e8b48a', '#d9a06f', '#c98f6a'],
  ['#f2e3c6', '#e6d3ae', '#dcc49a'],
  ['#a8c8d8', '#93b8cc', '#7fa9c0'],
  ['#e8e0d0', '#d8cfba', '#c9bda6'],
  ['#d8a0a8', '#c98f9a', '#bb8089'],
];

// Story places. Each one sits on a street, a curb or sand — never inside a
// building — so a car or a walker can always reach it.
export const ANCHORS = {
  garage: { x: 81, z: 108, label: "Vera's Garage" },
  docks: { x: 56, z: 505, label: 'Solmar Marina' },
  hotel: { x: 243, z: 486, label: 'Solmar Grand Hotel' },
  penthouse: { x: 243, z: 270, label: 'The Azure Penthouse' },
  hospital: { x: 405, z: 162, label: 'Solmar General' },
  police: { x: 135, z: 378, label: 'Solmar PD Central' },
  taxiStand: { x: 230, z: 486, label: 'Taxi Stand' },
  club: { x: 351, z: 324, label: 'Club Neon Palms' },
};

/** Is (x, z) on road surface rather than inside a block? */
export function isRoad(x, z) {
  const mx = ((x % PITCH) + PITCH) % PITCH;
  const mz = ((z % PITCH) + PITCH) % PITCH;
  const edge = ROAD_W / 2 + 1;
  return mx < edge || mx > PITCH - edge || mz < edge || mz > PITCH - edge;
}

/** The closest point on a street centre line to (x, z). */
export function nearestStreetPoint(x, z) {
  const cx = clamp(Math.round(x / PITCH) * PITCH, 0, CITY);
  const cz = clamp(Math.round(z / PITCH) * PITCH, 0, CITY);
  return Math.abs(x - cx) < Math.abs(z - cz) ? { x: cx, z } : { x, z: cz };
}

export class City {
  constructor(scene, seed) {
    this.rng = seededRandom(seed);
    this.scene = scene;
    this.colliders = []; // {x, z, hx, hz} building and pier footprints
    this.buildings = []; // {x, z, w, d, h} for the minimap
    this.palms = [];
    this.roadGraph = this.makeRoadGraph();
    this.layGround();
    this.raiseBlocks();
    this.buildShore();
    this.scatterProps();
    this.hangSigns();
  }

  /** Intersections 0..GRID in both directions, edges between neighbours. */
  makeRoadGraph() {
    const nodes = [];
    const index = new Map();
    for (let i = 0; i <= GRID; i += 1) {
      for (let j = 0; j <= GRID; j += 1) {
        index.set(i + ',' + j, nodes.length);
        nodes.push({ x: i * PITCH, z: j * PITCH, i, j });
      }
    }
    const adj = nodes.map(() => []);
    for (let i = 0; i <= GRID; i += 1) {
      for (let j = 0; j <= GRID; j += 1) {
        const a = index.get(i + ',' + j);
        if (i < GRID) {
          const b = index.get((i + 1) + ',' + j);
          adj[a].push(b);
          adj[b].push(a);
        }
        if (j < GRID) {
          const b = index.get(i + ',' + (j + 1));
          adj[a].push(b);
          adj[b].push(a);
        }
      }
    }
    return { nodes, adj };
  }

  randomRoadNode(rng) {
    return this.roadGraph.nodes[Math.floor(rng() * this.roadGraph.nodes.length)];
  }

  /** Grass base, asphalt ribbons for every street, sidewalk slabs in blocks. */
  layGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY + 60, CITY + 60),
      new THREE.MeshLambertMaterial({ color: 0x7d9b5e }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(CITY / 2, -0.05, CITY / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);

    const roadTex = asphaltTexture();
    roadTex.wrapS = THREE.RepeatWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;
    const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    for (let i = 0; i <= GRID; i += 1) {
      for (const across of [true, false]) {
        const len = CITY + ROAD_W;
        const geo = new THREE.PlaneGeometry(across ? len : ROAD_W, across ? ROAD_W : len);
        const mesh = new THREE.Mesh(geo, roadMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(
          across ? CITY / 2 : i * PITCH,
          0,
          across ? i * PITCH : CITY / 2,
        );
        mesh.receiveShadow = true;
        this.scene.add(mesh);
      }
    }

    const walkTex = pavementTexture();
    walkTex.wrapS = THREE.RepeatWrapping;
    walkTex.wrapT = THREE.RepeatWrapping;
    walkTex.repeat.set(3, 3);
    const walkMat = new THREE.MeshLambertMaterial({ map: walkTex });
    for (let i = 0; i < GRID; i += 1) {
      for (let j = 0; j < GRID; j += 1) {
        const slab = new THREE.Mesh(new THREE.PlaneGeometry(PITCH - ROAD_W, PITCH - ROAD_W), walkMat);
        slab.rotation.x = -Math.PI / 2;
        slab.position.set(i * PITCH + PITCH / 2, 0.02, j * PITCH + PITCH / 2);
        slab.receiveShadow = true;
        this.scene.add(slab);
      }
    }
  }

  /** One to three buildings per block; towers downtown, hotels on row 8. */
  raiseBlocks() {
    const rng = this.rng;
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < GRID; i += 1) {
      for (let j = 0; j < GRID; j += 1) {
        const cx = i * PITCH + PITCH / 2;
        const cz = j * PITCH + PITCH / 2;
        const core = i >= CORE.x0 && i <= CORE.x1 && j >= CORE.z0 && j <= CORE.z1;
        const beachfront = j === HOTEL_ROW;
        const count = core ? 1 : randInt(rng, 1, 3);
        for (let b = 0; b < count; b += 1) {
          const w = core ? rand(rng, 30, 38) : rand(rng, 12, 26);
          const d = core ? rand(rng, 30, 38) : rand(rng, 12, 26);
          const h = core ? rand(rng, 34, 64)
            : beachfront ? rand(rng, 18, 34)
            : rand(rng, 9, 26);
          const ox = count === 1 ? 0 : rand(rng, -8, 8);
          const oz = count === 1 ? 0 : rand(rng, -8, 8);
          const x = cx + ox;
          const z = cz + oz;
          const palette = pick(rng, FACADES);
          const base = palette[randInt(rng, 0, 2)];
          const floors = Math.max(2, Math.round(h / 3.2));
          const face = facadeTexture(rng, base, floors, Math.max(3, Math.round(w / 5)));
          const mesh = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ map: face }));
          mesh.scale.set(w, h, d);
          mesh.position.set(x, h / 2, z);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.scene.add(mesh);
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

  /** Sand, the bay, wooden piers and a few moored boats. */
  buildShore() {
    const rng = this.rng;
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

    const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
    for (let p = 0; p < 3; p += 1) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 46), pierMat);
      pier.position.set(30 + p * 26, 0.4, BEACH_Z + 26);
      pier.castShadow = true;
      this.scene.add(pier);
      this.colliders.push({ x: 30 + p * 26, z: BEACH_Z + 26, hx: 2.4, hz: 23 });
    }
    const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    const cabinMat = new THREE.MeshLambertMaterial({ color: 0x2e6f9e });
    for (let b = 0; b < 4; b += 1) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 12), hullMat);
      hull.position.y = 0.4;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 5), cabinMat);
      cabin.position.set(0, 1.8, -1);
      boat.add(hull, cabin);
      boat.position.set(22 + b * 26, -0.2, BEACH_Z + 44 + (b % 2) * 10);
      boat.rotation.y = b % 2 === 0 ? 0.15 : -0.12;
      this.scene.add(boat);
    }
  }

  /** Palm trees along the beachfront and the main avenue, lamps at corners. */
  scatterProps() {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 7, 6);
    const leafGeo = new THREE.ConeGeometry(2.6, 3.2, 6);
    const plantPalm = (x, z) => {
      const palm = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 3.5;
      trunk.castShadow = true;
      const leaves = new THREE.Mesh(leafGeo, leafMat);
      leaves.position.y = 8.2;
      leaves.castShadow = true;
      palm.add(trunk, leaves);
      palm.position.set(x, 0, z);
      this.scene.add(palm);
      this.palms.push({ x, z });
    };
    for (let i = 0; i <= GRID; i += 1) {
      plantPalm(i * PITCH + 9, CITY - 6);
      plantPalm(i * PITCH - 9, CITY - 6);
      if (i % 2 === 0) plantPalm(i * PITCH + 9, 4 * PITCH + 9);
    }
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
  }

  /** Big glowing signs on the south faces of the landmark buildings. */
  hangSigns() {
    const signs = [
      { text: 'SOLMAR GRAND', sub: 'HOTEL · BEACHFRONT', bg: '#123a5c', fg: '#ffd23e', x: 243, z: 480, y: 26 },
      { text: "VERA'S GARAGE", sub: 'REPAIRS · 24H', bg: '#5c1a1a', fg: '#ffffff', x: 81, z: 108, y: 12 },
      { text: 'CLUB NEON PALMS', sub: 'DANCE · DRINKS', bg: '#2a1040', fg: '#ff7ad9', x: 351, z: 318, y: 16 },
    ];
    for (const s of signs) {
      const tex = signTexture(s.text, s.sub, s.bg, s.fg);
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(22, 5.5),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      board.position.set(s.x, s.y, s.z);
      this.scene.add(board);
    }
  }

  /**
   * Push a circle at (pos.x, pos.z) with `radius` out of every building it
   * overlaps, and keep it inside the world. Returns true on a building hit.
   */
  collideCircle(pos, radius) {
    let hit = false;
    for (const c of this.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const pushX = c.hx + radius - Math.abs(dx);
      const pushZ = c.hz + radius - Math.abs(dz);
      if (pushX > 0 && pushZ > 0) {
        hit = true;
        if (pushX < pushZ) pos.x = c.x + (dx > 0 ? c.hx + radius : -c.hx - radius);
        else pos.z = c.z + (dz > 0 ? c.hz + radius : -c.hz - radius);
      }
    }
    // The bay is a wall of water at the south; the other edges are fences.
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
