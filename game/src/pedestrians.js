// Pedestrians: Solmar's residents strolling the sidewalks. They walk from
// corner to corner, bob as they go, and scatter when a car comes at them fast.
import * as THREE from 'three';
import { dist2, pick, rand, randInt } from './util.js';
import { createPersonMesh } from './player.js';
import { CITY, PITCH } from './city.js';

const SHIRTS = [0x3a7bd5, 0xe8e8e8, 0x7bc23a, 0xd5a03a, 0xb03ad5, 0x3ad5c2, 0xd53a6b, 0x8a8a8a];
const PANTS = [0x2e3a4d, 0x4d3a2e, 0x333333, 0x5a6b7a, 0x6b4d5a];

export class PedestrianSystem {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.peds = [];
    this.spawnTimer = 0;
  }

  spawn(count) {
    for (let i = 0; i < count; i += 1) this.spawnOne();
  }

  spawnOne() {
    const rng = this.rng;
    const mesh = createPersonMesh({
      shirt: pick(rng, SHIRTS),
      pants: pick(rng, PANTS),
      skin: pick(rng, [0xc98d64, 0x8a5a3b, 0xe8b88a, 0x6b4423]),
    });
    // Start on a sidewalk corner.
    const i = randInt(rng, 0, 9); const j = randInt(rng, 0, 9);
    mesh.position.set(i * PITCH + 9, 0, j * PITCH + 9);
    this.scene.add(mesh);
    const ped = {
      mesh,
      tx: mesh.position.x, tz: mesh.position.z,
      speed: rand(rng, 1.2, 2.2),
      phase: rand(rng, 0, 6),
      fleeing: 0,
      hit: false,
    };
    this.pickTarget(ped);
    this.peds.push(ped);
    return ped;
  }

  pickTarget(ped) {
    const rng = this.rng;
    const i = randInt(rng, 0, 9); const j = randInt(rng, 0, 9);
    // Walk along block edges (sidewalks), not through buildings.
    ped.tx = i * PITCH + (rng() < 0.5 ? 9 : -9);
    ped.tz = j * PITCH + (rng() < 0.5 ? 9 : -9);
    ped.tx = Math.max(4, Math.min(CITY - 4, ped.tx));
    ped.tz = Math.max(4, Math.min(CITY - 4, ped.tz));
  }

  step(dt, playerCar, playerPos) {
    for (const ped of this.peds) {
      // Flee a fast car or the player on foot coming close.
      let danger = null;
      if (playerCar && Math.abs(playerCar.speed) > 6) {
        const d = dist2(ped.mesh.position.x, ped.mesh.position.z, playerCar.pos.x, playerCar.pos.z);
        if (d < 14) danger = playerCar.pos;
      }
      if (!danger && playerPos) {
        const d = dist2(ped.mesh.position.x, ped.mesh.position.z, playerPos.x, playerPos.z);
        if (d < 3) danger = playerPos;
      }
      let tx = ped.tx; let tz = ped.tz;
      let speed = ped.speed;
      if (danger) {
        const away = Math.atan2(ped.mesh.position.x - danger.x, ped.mesh.position.z - danger.z);
        tx = ped.mesh.position.x + Math.sin(away) * 12;
        tz = ped.mesh.position.z + Math.cos(away) * 12;
        speed = ped.speed * 3.2;
        ped.fleeing = 1.5;
      } else if (ped.fleeing > 0) {
        ped.fleeing -= dt;
      }
      const dx = tx - ped.mesh.position.x;
      const dz = tz - ped.mesh.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.2) {
        if (!danger) this.pickTarget(ped);
      } else {
        const stepLen = Math.min(d, speed * dt);
        ped.mesh.position.x += (dx / d) * stepLen;
        ped.mesh.position.z += (dz / d) * stepLen;
        ped.mesh.rotation.y = Math.atan2(dx, dz);
        ped.phase += dt * speed * 4;
        const swing = Math.sin(ped.phase) * 0.45;
        const { armL, armR, legs } = ped.mesh.userData.arms;
        armL.rotation.x = swing;
        armR.rotation.x = -swing;
        legs.rotation.x = swing * 0.4;
      }
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.peds.length < 34) {
      this.spawnOne();
      this.spawnTimer = 2;
    }
  }

  /** The pedestrian nearest a point, within maxDist (for crimes and punches). */
  nearest(x, z, maxDist) {
    let best = null; let bestD = maxDist;
    for (const p of this.peds) {
      const d = dist2(x, z, p.mesh.position.x, p.mesh.position.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  remove(ped) {
    const i = this.peds.indexOf(ped);
    if (i >= 0) this.peds.splice(i, 1);
    this.scene.remove(ped.mesh);
  }
}
