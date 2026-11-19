// Pedestrians: simple walkers who stroll the sidewalks between random
// street points and scatter when a gun goes off nearby.

import * as THREE from 'three';
import { mulberry32, rngPick, rngRange, dist2 } from './util.js';

const SHIRTS = [0xe84c4c, 0x4c8de8, 0x4ce88a, 0xe8d24c, 0xb44ce8, 0xe88a4c, 0xeeeeee, 0x222831];
const PANTS = [0x2b3a55, 0x3a3a3a, 0x5a4a3a, 0x2a4a2a];

export function makeHumanoid(shirtColor, pantsColor) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: pantsColor });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32), shirt);
  body.position.y = 1.05;
  g.add(body);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), pants);
  legs.position.y = 0.35;
  g.add(legs);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.68;
  g.add(head);
  return g;
}

export class Pedestrians {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed ^ 0x9e3779b9);
    this.peds = [];
    for (let i = 0; i < 24; i++) {
      const mesh = makeHumanoid(rngPick(this.rng, SHIRTS), rngPick(this.rng, PANTS));
      const start = this.randomStreetPoint();
      mesh.position.set(start.x, 0, start.z);
      scene.add(mesh);
      this.peds.push({
        mesh,
        x: start.x,
        z: start.z,
        heading: this.rng() * Math.PI * 2,
        speed: rngRange(this.rng, 1.0, 2.0),
        target: this.randomStreetPoint(),
        fleeing: 0,
      });
    }
  }

  randomStreetPoint() {
    const pts = this.city.streetPoints;
    return pts[Math.floor(this.rng() * pts.length)];
  }

  // A gunshot at (x, z) makes nearby pedestrians run away from it.
  scare(x, z, radius) {
    for (const p of this.peds) {
      if (dist2(p.x, p.z, x, z) < radius) {
        p.fleeing = 3;
        p.heading = Math.atan2(p.x - x, p.z - z);
      }
    }
  }

  update(dt, playerPos) {
    for (const p of this.peds) {
      if (p.fleeing > 0) {
        p.fleeing -= dt;
        p.speed = 4.2;
      } else {
        p.speed = 1.4;
      }
      const tx = p.target.x;
      const tz = p.target.z;
      const d = dist2(p.x, p.z, tx, tz);
      if (d < 2) {
        p.target = this.randomStreetPoint();
        continue;
      }
      const want = Math.atan2(tx - p.x, tz - p.z);
      let dh = want - p.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      p.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
      const nx = p.x + Math.sin(p.heading) * p.speed * dt;
      const nz = p.z + Math.cos(p.heading) * p.speed * dt;
      if (!this.city.isBlocked(nx, nz, 0.5)) {
        p.x = nx;
        p.z = nz;
      } else {
        p.target = this.randomStreetPoint();
      }
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      // Simple walk bob.
      p.mesh.position.y = Math.abs(Math.sin(this.scene.userData.time * 6 + p.x)) * 0.05;
    }
  }
}
