// The wanted system: stars 0-5, police cars that hunt the player, and cops on
// foot who try to arrest them. Crimes add stars; staying clean and out of
// sight lets the heat cool off.
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

  addStars(n, reason) {
    this.stars = clamp(this.stars + n, 0, MAX_STARS);
    this.coolTimer = 0;
    return this.stars;
  }

  clear() {
    this.stars = 0;
    this.coolTimer = 0;
    this.arrestTimer = 0;
    for (const c of this.policeCars) this.scene.remove(c.mesh);
    for (const c of this.cops) this.scene.remove(c.mesh);
    this.policeCars = [];
    this.cops = [];
  }

  wantedCount() {
    return this.stars;
  }

  /** How many police cars the heat calls for. */
  targetPoliceCars() {
    return this.stars === 0 ? 0 : this.stars <= 1 ? 1 : this.stars <= 2 ? 2 : this.stars <= 3 ? 3 : 4;
  }

  spawnPoliceCar(playerPos) {
    const mesh = createCarMesh(0x1a1a22, 'police');
    // Appear on a street a little way from the player.
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

  spawnCop(playerPos) {
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

  step(dt, player, playerCar) {
    const px = playerCar ? playerCar.pos.x : player.x;
    const pz = playerCar ? playerCar.pos.z : player.z;
    // Cool off: no crime and no police nearby for a while drops a star.
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
    // Spawn police to match the heat.
    this.spawnTimer -= dt;
    const wantCars = this.targetPoliceCars();
    if (this.stars > 0 && this.spawnTimer <= 0) {
      if (this.policeCars.length < wantCars) this.spawnPoliceCar({ x: px, z: pz });
      if (!playerCar && this.cops.length < Math.min(3, this.stars)) this.spawnCop({ x: px, z: pz });
      this.spawnTimer = 3;
    }
    // Police cars chase: steer toward the player, ram to slow them down.
    for (const car of this.policeCars) {
      const dx = px - car.pos.x;
      const dz = pz - car.pos.z;
      const d = Math.hypot(dx, dz);
      const wantYaw = Math.atan2(dx, dz);
      // DriveCar: positive steer turns right (yaw decreases), so negate the angle error.
      const steer = -clamp(((wantYaw - car.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1, 1);
      const throttle = d > 6 ? 1 : 0.2;
      car.step(dt, throttle, steer, false, this.city, [...this.policeCars]);
      // Ram: if close, shove the player's car and slow it.
      if (playerCar && d < 4.5) {
        playerCar.speed *= Math.max(0, 1 - dt * 2.2);
        playerCar.health = Math.max(0, playerCar.health - dt * 6);
      }
    }
    // Cops on foot chase the player and try to arrest them.
    this.busted = false;
    if (!playerCar) {
      let closest = null; let closestD = Infinity;
      for (const cop of this.cops) {
        const d = dist2(player.x, player.z, cop.mesh.position.x, cop.mesh.position.z);
        if (d < closestD) { closestD = d; closest = cop; }
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
    // Flash the police light bars.
    const on = Math.floor(performance.now() / 280) % 2 === 0;
    for (const car of this.policeCars) {
      const bar = car.mesh.getObjectByName('lightbar');
      if (bar) bar.material.emissive.setHex(on ? 0x2244ff : 0xff2222);
    }
    // Despawn police that fell far behind when the heat is gone.
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
