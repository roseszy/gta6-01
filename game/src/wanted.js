// Wanted / heat: 0-5 stars. Crimes raise heat; police cruisers spawn by
// star count and chase/ram the player. Stay out of sight and heat cools one
// star at a time. Busted when health hits 0 or a cruiser catches you on foot.

import * as THREE from 'three';
import { clamp, dist2, mulberry32 } from './util.js';
import { makeCarMesh } from './vehicles.js';

export class Wanted {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.stars = 0;
    this.heat = 0;
    this.cruisers = [];
    this.outOfSight = 0;
    this.busted = false;
    this.catchTimer = 0;
    this.time = 0;
    this.rng = mulberry32(0xbadc0de);
    this.flashPhase = 0;
  }

  addHeat(n) {
    this.heat = clamp(this.heat + n, 0, 125);
    this.stars = clamp(Math.floor(this.heat / 25), 0, 5);
    if (this.stars > 0) this.outOfSight = 0;
  }

  setStars(n) {
    this.stars = clamp(n, 0, 5);
    this.heat = this.stars * 25;
    if (this.stars > 0) this.outOfSight = 0;
  }

  clear() {
    this.stars = 0;
    this.heat = 0;
    this.outOfSight = 0;
    this.busted = false;
    this.catchTimer = 0;
    for (const c of this.cruisers) this.scene.remove(c.mesh);
    this.cruisers = [];
  }

  cruiserTarget() {
    if (this.stars === 0) return 0;
    if (this.stars === 1) return 1;
    if (this.stars === 2) return 2;
    if (this.stars === 3) return 3;
    return 4;
  }

  spawnCruiserNear(x, z) {
    const pts = this.city.streetPoints;
    let best = null;
    let bestScore = -1;
    for (const p of pts) {
      const d = dist2(x, z, p.x, p.z);
      if (d < 55 || d > 130) continue;
      const score = this.rng();
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    const spot = best || { x: clamp(x + 70, 10, 476), z: clamp(z, 10, 476) };
    const mesh = makeCarMesh(0xf2f2f2, true);
    mesh.position.set(spot.x, 0, spot.z);
    this.scene.add(mesh);
    this.cruisers.push({ mesh, x: spot.x, z: spot.z, heading: 0, speed: 0, siren: this.rng() });
  }

  update(dt, player, inCar) {
    this.time += dt;
    this.flashPhase += dt;
    const px = player.pos.x;
    const pz = player.pos.z;

    // Match the cruiser count to the star level.
    const target = this.cruiserTarget();
    while (this.cruisers.length < target) this.spawnCruiserNear(px, pz);
    while (this.cruisers.length > target) {
      const c = this.cruisers.pop();
      this.scene.remove(c.mesh);
    }

    // Heat cools when the player stays far from every cruiser: after 6 s out
    // of sight it falls steadily, one star at a time, all the way to zero.
    let nearest = Infinity;
    for (const c of this.cruisers) nearest = Math.min(nearest, dist2(px, pz, c.x, c.z));
    if (this.heat > 0) {
      if (nearest > 55) {
        this.outOfSight += dt;
        if (this.outOfSight > 6) {
          this.heat = Math.max(0, this.heat - 9 * dt);
          this.stars = clamp(Math.floor(this.heat / 25), 0, 5);
        }
      } else {
        this.outOfSight = 0;
      }
    }

    // Cruisers chase and ram.
    for (const c of this.cruisers) {
      const d = dist2(px, pz, c.x, c.z);
      const want = Math.atan2(px - c.x, pz - c.z);
      let dh = want - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      c.heading += clamp(dh, -2.2 * dt, 2.2 * dt);
      const topSpeed = 20 + this.stars * 4.5;
      const desired = d > 6 ? topSpeed : topSpeed * 0.55;
      c.speed += clamp(desired - c.speed, -14 * dt, 9 * dt);
      const nx = c.x + Math.sin(c.heading) * c.speed * dt;
      const nz = c.z + Math.cos(c.heading) * c.speed * dt;
      if (!this.city.isBlocked(nx, nz, 2.2)) {
        c.x = nx;
        c.z = nz;
      }
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      // Flashing light bar.
      const phase = Math.floor(this.flashPhase * 6 + c.siren * 10) % 2 === 0;
      c.mesh.userData.lightRed.material.color.setHex(phase ? 0xff2222 : 0x550000);
      c.mesh.userData.lightBlue.material.color.setHex(phase ? 0x002266 : 0x2266ff);
      // Ram: damage the player when a cruiser slams into them.
      if (d < 3.4 && c.speed > 4) {
        if (!inCar) player.damage(14 * dt);
        else player.damage(4 * dt);
        c.speed *= 0.4;
      }
    }

    // Caught on foot: a cruiser sitting on the player busts them.
    if (!inCar && this.stars > 0 && nearest < 2.6) {
      this.catchTimer += dt;
      if (this.catchTimer > 2) this.busted = true;
    } else {
      this.catchTimer = Math.max(0, this.catchTimer - dt);
    }
    if (player.health <= 0) this.busted = true;
  }
}
