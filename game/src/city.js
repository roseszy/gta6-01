// Solmar Bay: a 9x9-block coastal city. Streets run on a 54 m pitch, the
// beach and sea lie to the south, and the marina sits on the water's edge.
// Anchors are the fixed landmarks missions and activities point at.

import * as THREE from 'three';
import { makeBuildingTexture, makeRoadTexture, makeSandTexture, makeWaterTexture } from './textures.js';
import { mulberry32, rngPick, rngRange, dist2 } from './util.js';

export const GRID = 9;
export const PITCH = 54;
export const SIZE = GRID * PITCH; // 486

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

const PASTELS = ['#f2b8c6', '#f6d9a0', '#a8d8c8', '#a9c6e8', '#e8c9f0', '#f0e6b8', '#c8d8f0', '#f5c9a8'];

function anchorNear(x, z, clearance) {
  for (const key of Object.keys(ANCHORS)) {
    const a = ANCHORS[key];
    if (dist2(x, z, a.x, a.z) < clearance) return true;
  }
  return false;
}

// Builds every static mesh of the city into the scene and returns the
// collision data and street points the other systems use.
export function buildCity(scene, seed) {
  const rng = mulberry32(seed);
  const blockers = [];

  // Sky, sun and light.
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc8e8, 320, 900);
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.4);
  sun.position.set(180, 260, 120);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbdd8f0, 0.9));
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.7);
  scene.add(hemi);

  // Sea: a big plane below everything, visible past the beach.
  const waterTex = makeWaterTexture();
  waterTex.wrapS = THREE.RepeatWrapping;
  waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(10, 10);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.MeshLambertMaterial({ map: waterTex })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(SIZE / 2, -0.6, SIZE / 2);
  scene.add(sea);

  // City ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE + 40, SIZE + 40),
    new THREE.MeshLambertMaterial({ color: 0x8a9a6a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(SIZE / 2, 0, SIZE / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // Beach strips along the south and east edges.
  const sandTex = makeSandTexture();
  sandTex.wrapS = THREE.RepeatWrapping;
  sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set(12, 1);
  const beachSouth = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE + 40, 34),
    new THREE.MeshLambertMaterial({ map: sandTex })
  );
  beachSouth.rotation.x = -Math.PI / 2;
  beachSouth.position.set(SIZE / 2, 0.05, SIZE + 17);
  scene.add(beachSouth);
  const beachEast = new THREE.Mesh(
    new THREE.PlaneGeometry(34, SIZE + 40),
    new THREE.MeshLambertMaterial({ map: sandTex })
  );
  beachEast.rotation.x = -Math.PI / 2;
  beachEast.position.set(SIZE + 17, 0.05, SIZE / 2);
  scene.add(beachEast);

  // Roads: dark strips along every block boundary, both directions.
  const roadTex = makeRoadTexture();
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  for (let i = 0; i <= GRID; i++) {
    const c = i * PITCH;
    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, 12), roadMat);
    hRoad.rotation.x = -Math.PI / 2;
    hRoad.position.set(SIZE / 2, 0.08, c);
    scene.add(hRoad);
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(12, SIZE), roadMat);
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.position.set(c, 0.08, SIZE / 2);
    scene.add(vRoad);
  }

  // Buildings: one or two per block, pastel facades, varied heights.
  const buildingGeoms = new THREE.BoxGeometry(1, 1, 1);
  for (let bx = 0; bx < GRID; bx++) {
    for (let bz = 0; bz < GRID; bz++) {
      const ox = bx * PITCH;
      const oz = bz * PITCH;
      const count = rng() < 0.55 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const w = rngRange(rng, 16, 26);
        const d = rngRange(rng, 16, 26);
        const cx = ox + 14 + rng() * (PITCH - 28 - w + 14);
        const cz = oz + 14 + rng() * (PITCH - 28 - d + 14);
        if (anchorNear(cx, cz, 26)) continue;
        const h = rng() < 0.18 ? rngRange(rng, 55, 95) : rngRange(rng, 12, 42);
        const color = rngPick(rng, PASTELS);
        const mat = new THREE.MeshLambertMaterial({ map: makeBuildingTexture(color) });
        const mesh = new THREE.Mesh(buildingGeoms, mat);
        mesh.scale.set(w, h, d);
        mesh.position.set(cx, h / 2, cz);
        scene.add(mesh);
        // Roof cap so the top is not a stretched facade.
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6),
          new THREE.MeshLambertMaterial({ color: 0x6a6a72 })
        );
        roof.position.set(cx, h + 0.4, cz);
        scene.add(roof);
        blockers.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
      }
    }
  }

  // Landmark markers: a coloured sign box on a pole at every anchor.
  const signColors = { garage: 0xffd23f, docks: 0x3fa7ff, hotel: 0xff8fb3, penthouse: 0x9f7bff, hospital: 0xffffff, police: 0x3f6bff, taxiStand: 0xffc93f, club: 0xff5fd0 };
  for (const key of Object.keys(ANCHORS)) {
    const a = ANCHORS[key];
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0x444444 })
    );
    pole.position.set(a.x, 3.5, a.z);
    scene.add(pole);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(6, 2.2, 0.4),
      new THREE.MeshLambertMaterial({ color: signColors[key] || 0xffffff })
    );
    sign.position.set(a.x, 7.4, a.z);
    scene.add(sign);
  }

  // Palm trees along the streets and the beach.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e4f });
  const palmSpots = [];
  for (let i = 0; i < 90; i++) {
    const along = rng() < 0.5;
    const line = Math.floor(rng() * (GRID + 1)) * PITCH;
    const t = rng() * SIZE;
    const x = along ? t : line + (rng() < 0.5 ? -8 : 8);
    const z = along ? line + (rng() < 0.5 ? -8 : 8) : t;
    if (x < 4 || x > SIZE - 4 || z < 4 || z > SIZE - 4) continue;
    if (anchorNear(x, z, 10)) continue;
    palmSpots.push({ x, z });
  }
  // A row of palms on the beach.
  for (let x = 20; x < SIZE; x += 26) palmSpots.push({ x, z: SIZE + 8 });
  for (const p of palmSpots) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 5.5, 6), trunkMat);
    trunk.position.set(p.x, 2.75, p.z);
    trunk.rotation.z = (rng() - 0.5) * 0.16;
    scene.add(trunk);
    for (let f = 0; f < 5; f++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), leafMat);
      const ang = (f / 5) * Math.PI * 2;
      leaf.position.set(p.x + Math.cos(ang) * 1.1, 6.1, p.z + Math.sin(ang) * 1.1);
      leaf.rotation.z = Math.cos(ang) * 1.1;
      leaf.rotation.x = -Math.sin(ang) * 1.1;
      scene.add(leaf);
    }
  }

  // Marina: wooden piers reaching into the sea, plus a few moored boats.
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  for (let i = 0; i < 3; i++) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 26), woodMat);
    pier.position.set(36 + i * 20, 0.6, SIZE + 26);
    scene.add(pier);
  }
  const boatColors = [0xe8e8e8, 0xff6b6b, 0x4ecdc4];
  for (let i = 0; i < 3; i++) {
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(3, 1.2, 9),
      new THREE.MeshLambertMaterial({ color: boatColors[i % boatColors.length] })
    );
    hull.position.set(30 + i * 22, 0.2, SIZE + 40);
    scene.add(hull);
  }

  // Street props: a few benches and hydrants for flavour.
  const propMat = new THREE.MeshLambertMaterial({ color: 0x555c66 });
  for (let i = 0; i < 24; i++) {
    const line = Math.floor(rng() * (GRID + 1)) * PITCH;
    const t = 20 + rng() * (SIZE - 40);
    const x = rng() < 0.5 ? t : line + 8;
    const z = rng() < 0.5 ? line + 8 : t;
    if (anchorNear(x, z, 8)) continue;
    const prop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.5), propMat);
    prop.position.set(x, 0.45, z);
    scene.add(prop);
  }

  const streetPoints = [];
  for (let bx = 0; bx <= GRID; bx++) {
    for (let bz = 0; bz <= GRID; bz++) {
      streetPoints.push({ x: bx * PITCH, z: bz * PITCH });
    }
  }

  function isBlocked(x, z, r) {
    if (x < -18 - r || x > SIZE + 34 + r || z < -18 - r || z > SIZE + 34 + r) return true;
    for (const b of blockers) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
    }
    return false;
  }

  return { anchors: ANCHORS, blockers, streetPoints, isBlocked };
}
