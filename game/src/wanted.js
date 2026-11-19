// The wanted system: a heat level of 0–5 stars, police cars that hunt the
// player down, and officers on foot who try to make an arrest. Crimes raise
// the heat; staying out of sight while the heat is on lets it cool off one
// star at a time.
import { clamp, dist2 } from './util.js';
import { createCarMesh, DriveCar } from './vehicles.js';
import { createPersonMesh } from './player.js';

export const MAX_STARS = 5;

export class WantedSystem {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.stars = 0;
    this.coolTimer = 0;
    this.spawnTimer = 0;
    this.arrestTimer = 0;
    this.policeCars = [];
    this.cops = [];
    this.busted = false;
  }

  /** Raise (or set) the heat. Returns the new star count. */
  addStars(n) {
    this.stars = clamp(this.stars + n, 0, MAX_STARS);
    this.coolTimer = 0;
    return this.stars;
  }

  /** Drop the heat to zero and clear every officer from the streets. */
  clear() {
    this.stars = 0;
    this.coolTimer = 0;
    this.arrestTimer = 0;
    for (const c of this.policeCars) this.scene.remove(c.mesh);
    for (const c of this.cops) this.scene.remove(c.mesh);
    this.policeCars = [];
    this.cops = [];
  }

  heat() {
    return this.stars;
  }

  /** How many cruisers the current heat calls for: 1 at one star, up to 4. */
  carsForHeat() {
    if (this.stars === 0) return 0;
    if (this.stars <= 1) return 1;
    if (this.stars <= 2) return 2;
    if (this.stars <= 3) return 3;
    return 4;
  }

  /** Send a cruiser in from a street a little way off. */
  dispatchCar(playerPos) {
    const mesh = createCarMesh(0x1a1a22, 'police');
    const angle = this.rng() * Math.PI * 2;
    const d = 55 + this.rng() * 30;
    const x = clamp(playerPos.x + Math.sin(angle) * d, 8, 478);
    const z = clamp(playerPos.z + Math.cos(angle) * d, 8, 478);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const car = new DriveCar(mesh);
    car.maxSpeed = 34 + this.stars * 2;
    car.yaw = Math.atan2(playerPos.x - x, playerPos.z - z);
    car.isPolice = true;
    this.policeCars.push(car);
    return car;
  }

  /** Send an officer on foot in from nearby. */
  dispatchOfficer(playerPos) {
    const mesh = createPersonMesh({ shirt: 0x1c2f55, pants: 0x1c2f55, skin: 0xc98d64 });
    const angle = this.rng() * Math.PI * 2;
    mesh.position.set(
      clamp(playerPos.x + Math.sin(angle) * 26, 8, 478),
      0,
      clamp(playerPos.z + Math.cos(angle) * 26, 8, 478),
    );
    this.scene.add(mesh);
    const cop = { mesh, speed: 6.8 + this.stars * 0.3, arrest: 0 };
    this.cops.push(cop);
    return cop;
  }

  /** One step: cool-off, spawn to match the heat, chase, ram, arrest. */
  step(dt, player, playerCar) {
    const px = playerCar ? playerCar.pos.x : player.x;
    const pz = playerCar ? playerCar.pos.z : player.z;
    // Cool-off: no police within 70 m for 20 s drops a star.
    if (this.stars > 0) {
      let nearestPolice = Infinity;
      for (const c of this.policeCars) nearestPolice = Math.min(nearestPolice, dist2(px, pz, c.pos.x, c.pos.z));
      for (const c of this.cops) nearestPolice = Math.min(nearestPolice, dist2(px, pz, c.mesh.position.x, c.mesh.position.z));
      if (nearestPolice > 70) {
        this.coolTimer += dt;
        if (this.coolTimer > 20) {
          this.stars -= 1;
          this.coolTimer = 0;
        }
      } else {
        this.coolTimer = 0;
      }
    }
    // Top the patrol up to match the heat.
    this.spawnTimer -= dt;
    if (this.stars > 0 && this.spawnTimer <= 0) {
      if (this.policeCars.length < this.carsForHeat()) this.dispatchCar({ x: px, z: pz });
      if (!playerCar && this.cops.length < Math.min(3, this.stars)) this.dispatchOfficer({ x: px, z: pz });
      this.spawnTimer = 3;
    }
    // Cruisers chase: steer at the player and ram to slow them down.
    for (const car of this.policeCars) {
      const dx = px - car.pos.x;
      const dz = pz - car.pos.z;
      const d = Math.hypot(dx, dz);
      const wantYaw = Math.atan2(dx, dz);
      // DriveCar turns right when steer is positive (yaw drops), so flip
      // the angle error to steer toward the player.
      const steer = -clamp(((wantYaw - car.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1, 1);
      const throttle = d > 6 ? 1 : 0.2;
      car.step(dt, throttle, steer, false, this.city, [...this.policeCars]);
      if (playerCar && d < 4.5) {
        playerCar.speed *= Math.max(0, 1 - dt * 2.2);
        playerCar.health = Math.max(0, playerCar.health - dt * 6);
      }
    }
    // Officers on foot chase the player; standing next to one for 1.6 s
    // straight gets Deke arrested.
    this.busted = false;
    if (!playerCar) {
      let closest = null;
      let closestD = Infinity;
      for (const cop of this.cops) {
        const d = dist2(player.x, player.z, cop.mesh.position.x, cop.mesh.position.z);
        if (d < closestD) {
          closestD = d;
          closest = cop;
        }
        const dx = player.x - cop.mesh.position.x;
        const dz = player.z - cop.mesh.position.z;
        const len = Math.hypot(dx, dz) || 1;
        cop.mesh.position.x += (dx / len) * cop.speed * dt;
        cop.mesh.position.z += (dz / len) * cop.speed * dt;
        cop.mesh.rotation.y = Math.atan2(dx, dz);
        const swing = Math.sin(performance.now() * 0.012 + cop.mesh.position.x) * 0.5;
        const { armL, armR } = cop.mesh.userData.arms;
        armL.rotation.x = swing;
        armR.rotation.x = -swing;
      }
      if (closest && closestD < 1.6) {
        this.arrestTimer += dt;
        if (this.arrestTimer > 1.6) this.busted = true;
      } else {
        this.arrestTimer = Math.max(0, this.arrestTimer - dt * 2);
      }
    } else {
      this.arrestTimer = 0;
    }
    // Flash the light bars red and blue.
    const on = Math.floor(performance.now() / 280) % 2 === 0;
    for (const car of this.policeCars) {
      const bar = car.mesh.getObjectByName('lightbar');
      if (bar) bar.material.emissive.setHex(on ? 0x2244ff : 0xff2222);
    }
    // When the heat is gone, thin out patrols that fell far behind.
    if (this.stars === 0) {
      for (let i = this.policeCars.length - 1; i >= 0; i -= 1) {
        const c = this.policeCars[i];
        if (dist2(px, pz, c.pos.x, c.pos.z) > 160) {
          this.scene.remove(c.mesh);
          this.policeCars.splice(i, 1);
        }
      }
      for (let i = this.cops.length - 1; i >= 0; i -= 1) {
        const c = this.cops[i];
        if (dist2(px, pz, c.mesh.position.x, c.mesh.position.z) > 120) {
          this.scene.remove(c.mesh);
          this.cops.splice(i, 1);
        }
      }
    }
  }
}
