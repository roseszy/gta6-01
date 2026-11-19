// Pedestrians: people who wander the sidewalks, scatter when a car barrels
// at them, and can be mugged for a little cash. Built from the same boxy
// person mesh the player uses, with random shirts and skin tones.
import * as THREE from 'three';
import { angleToward, clamp, dist2, pick, rand, randInt, seededRandom } from './util.js';
import { createPersonMesh } from './player.js';

const SHIRTS = [0x4f8ad9, 0xe8b13c, 0x3aa655, 0xd94f9b, 0x8a4fbf, 0xe8e0d0, 0x2e6f6f, 0xe87a2e];
const SKINS = [0xc98d64, 0x8a5a3b, 0xe8b98a, 0x6b3f26, 0xf0c8a0];

/** A pedestrian: a mesh, a wander target, and its walk animation state. */
class Ped {
  constructor(mesh, x, z, rng) {
    this.mesh = mesh;
    this.x = x;
    this.z = z;
    this.yaw = rand(rng, 0, Math.PI * 2);
    this.target = null;
    this.speed = rand(rng, 1.4, 2.4);
    this.phase = rand(rng, 0, Math.PI * 2);
    this.panic = 0;
    this.fleeX = 0;
    this.fleeZ = 0;
    this.rng = rng;
  }
}

export class PedestrianSystem {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = seededRandom(seed + 77);
    this.peds = [];
    this.spawnTimer = 0;
  }

  spawn(count) {
    for (let i = 0; i < count; i += 1) this.spawnOne();
  }

  spawnOne() {
    const rng = this.rng;
    const spot = this.city.randomStreetPoint(rng);
    const mesh = createPersonMesh({
      shirt: pick(rng, SHIRTS),
      pants: pick(rng, [0x2e3a4d, 0x3a2e2e, 0x4d4d4d, 0x2e4d3a]),
      skin: pick(rng, SKINS),
    });
    mesh.position.set(spot.x, 0, spot.z);
    mesh.rotation.y = rand(rng, 0, Math.PI * 2);
    this.scene.add(mesh);
    const ped = new Ped(mesh, spot.x, spot.z, rng);
    ped.target = this.city.randomStreetPoint(rng);
    this.peds.push(ped);
    return ped;
  }

  /** One step: wander to the target, or flee from a fast car. */
  step(dt, danger) {
    const rng = this.rng;
    for (const ped of this.peds) {
      if (ped.panic > 0) ped.panic -= dt;
      // A car closing fast makes a pedestrian run away from it.
      for (const d of danger) {
        const dist = dist2(ped.x, ped.z, d.x, d.z);
        if (dist < 12 && d.speed > 10) {
          ped.panic = 2.2;
          const dx = ped.x - d.x;
          const dz = ped.z - d.z;
          const len = Math.max(0.1, Math.hypot(dx, dz));
          ped.fleeX = dx / len;
          ped.fleeZ = dz / len;
        }
      }
      let tx;
      let tz;
      let speed = ped.speed;
      if (ped.panic > 0) {
        tx = ped.x + ped.fleeX * 12;
        tz = ped.z + ped.fleeZ * 12;
        speed = 5.5;
      } else {
        tx = ped.target.x;
        tz = ped.target.z;
        if (dist2(ped.x, ped.z, tx, tz) < 3) {
          ped.target = this.city.randomStreetPoint(rng);
          tx = ped.target.x;
          tz = ped.target.z;
        }
      }
      const wantYaw = Math.atan2(tx - ped.x, tz - ped.z);
      ped.yaw = angleToward(ped.yaw, wantYaw, dt * 6);
      ped.x += Math.sin(ped.yaw) * speed * dt;
      ped.z += Math.cos(ped.yaw) * speed * dt;
      const probe = { x: ped.x, z: ped.z };
      this.city.collideCircle(probe, 0.5);
      ped.x = clamp(probe.x, 4, 482);
      ped.z = clamp(probe.z, 4, 498);
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.yaw;
      ped.phase += dt * speed * 3.4;
      const swing = Math.sin(ped.phase) * 0.45;
      const { armL, armR, legs } = ped.mesh.userData.arms;
      armL.rotation.x = swing;
      armR.rotation.x = -swing;
      legs.rotation.x = swing * 0.35;
    }
    // Keep the sidewalks lively: top the crowd back up to 34.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.peds.length < 34) {
      this.spawnOne();
      this.spawnTimer = 1.8;
    }
  }

  /** The pedestrian nearest a point, within maxDist. */
  nearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const p of this.peds) {
      const d = dist2(x, z, p.x, p.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  remove(ped) {
    const i = this.peds.indexOf(ped);
    if (i >= 0) this.peds.splice(i, 1);
    this.scene.remove(ped.mesh);
  }
}

/** A street-corner stranger whose pocket the player can empty with F. */
export function mugCash(rng) {
  return randInt(rng, 18, 42);
}
