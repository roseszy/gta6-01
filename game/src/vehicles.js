// Cars: traffic that drives the street grid, and the car the player drives.
// Steal a traffic car by walking up and pressing E — the driver gets out.

import * as THREE from 'three';
import { clamp, dist2, mulberry32, rngPick, rngRange } from './util.js';

const CAR_COLORS = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xecf0f1, 0x1a1a1a, 0xe67e22, 0x16a085];

export function makeCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.62;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.55, 2.2),
    new THREE.MeshLambertMaterial({ color: isPolice ? 0xffffff : 0x1c2733 })
  );
  cabin.position.set(0, 1.18, 0.2);
  g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.4), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.56, 0.2);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.32, 1.68, 0.2);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.set(0.32, 1.68, 0.2);
    g.add(blue);
    g.userData.lightRed = red;
    g.userData.lightBlue = blue;
  }
  g.userData.wheels = wheels;
  return g;
}

export class VehicleSystem {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed ^ 0x51ed);
    this.traffic = [];
    this.playerCar = null;
    this.time = 0;
    for (let i = 0; i < 14; i++) this.spawnTrafficCar();
  }

  spawnTrafficCar() {
    const pts = this.city.streetPoints;
    const p = pts[Math.floor(this.rng() * pts.length)];
    const heading = (Math.floor(this.rng() * 4) * Math.PI) / 2;
    const mesh = makeCarMesh(rngPick(this.rng, CAR_COLORS), false);
    mesh.position.set(p.x, 0, p.z);
    mesh.rotation.y = heading;
    this.scene.add(mesh);
    this.traffic.push({
      mesh,
      x: p.x,
      z: p.z,
      heading,
      speed: rngRange(this.rng, 6, 11),
      baseSpeed: rngRange(this.rng, 6, 11),
      turnCooldown: 0,
    });
  }

  // The closest traffic car within maxDist of (x, z), or null.
  nearestStealable(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const c of this.traffic) {
      const d = dist2(x, z, c.x, c.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  enterCar(car, player) {
    const i = this.traffic.indexOf(car);
    if (i >= 0) this.traffic.splice(i, 1);
    this.playerCar = {
      mesh: car.mesh,
      x: car.x,
      z: car.z,
      heading: car.heading,
      speed: 0,
      steer: 0,
    };
    player.onFoot = false;
    player.car = this.playerCar;
    player.pos.set(car.x, 0, car.z);
  }

  exitCar(player) {
    if (!this.playerCar) return;
    const c = this.playerCar;
    const sx = c.x + Math.sin(c.heading + Math.PI / 2) * 2.4;
    const sz = c.z + Math.cos(c.heading + Math.PI / 2) * 2.4;
    this.traffic.push({
      mesh: c.mesh,
      x: c.x,
      z: c.z,
      heading: c.heading,
      speed: 0,
      baseSpeed: rngRange(this.rng, 6, 11),
      turnCooldown: 1,
    });
    this.playerCar = null;
    player.onFoot = true;
    player.car = null;
    player.pos.set(sx, 0, sz);
    player.yaw = c.heading;
  }

  update(dt, input, player, wantedStars) {
    this.time += dt;
    // Traffic: drive along the grid, turn at intersections sometimes.
    for (const c of this.traffic) {
      c.turnCooldown -= dt;
      const nearX = Math.abs(c.x - Math.round(c.x / 54) * 54) < 3;
      const nearZ = Math.abs(c.z - Math.round(c.z / 54) * 54) < 3;
      if ((nearX || nearZ) && c.turnCooldown <= 0 && this.rng() < 0.35) {
        const turn = this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        c.heading += turn;
        c.turnCooldown = 2;
      }
      // Slow down for the car ahead.
      let target = c.baseSpeed;
      for (const o of this.traffic) {
        if (o === c) continue;
        const d = dist2(c.x, c.z, o.x, o.z);
        if (d < 7) {
          const ahead = Math.sin(c.heading) * (o.x - c.x) + Math.cos(c.heading) * (o.z - c.z);
          if (ahead > 0) target = Math.min(target, 2);
        }
      }
      if (this.playerCar) {
        const d = dist2(c.x, c.z, this.playerCar.x, this.playerCar.z);
        if (d < 8) {
          const ahead = Math.sin(c.heading) * (this.playerCar.x - c.x) + Math.cos(c.heading) * (this.playerCar.z - c.z);
          if (ahead > 0) target = Math.min(target, 1.5);
        }
      }
      c.speed += clamp(target - c.speed, -8 * dt, 5 * dt);
      const nx = c.x + Math.sin(c.heading) * c.speed * dt;
      const nz = c.z + Math.cos(c.heading) * c.speed * dt;
      if (nx < 2 || nx > 484 || nz < 2 || nz > 484) {
        c.heading += Math.PI;
        c.turnCooldown = 2;
      } else if (!this.city.isBlocked(nx, nz, 2.2)) {
        c.x = nx;
        c.z = nz;
      } else {
        c.heading += Math.PI / 2;
        c.turnCooldown = 1;
      }
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      for (const w of c.mesh.userData.wheels) w.rotation.x += (c.speed * dt) / 0.36;
    }

    // The player's car.
    const pc = this.playerCar;
    if (!pc) return;
    const accel = input.down('KeyW') ? 1 : input.down('KeyS') ? -0.6 : 0;
    const steerIn = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
    const handbrake = input.down('Space');
    const maxSpeed = 42;
    const maxReverse = 10;
    pc.speed += accel * (accel > 0 ? 13 : 16) * dt;
    if (accel === 0) pc.speed -= Math.sign(pc.speed) * Math.min(Math.abs(pc.speed), 6 * dt);
    if (handbrake) pc.speed -= Math.sign(pc.speed) * Math.min(Math.abs(pc.speed), 26 * dt);
    pc.speed = clamp(pc.speed, -maxReverse, maxSpeed);
    const steerTarget = steerIn * (pc.speed >= 0 ? 1 : -1) * clamp(Math.abs(pc.speed) / 12, 0.25, 1);
    pc.steer += clamp(steerTarget * 1.9 - pc.steer, -3.2 * dt, 3.2 * dt);
    if (Math.abs(pc.speed) > 0.2) {
      pc.heading += pc.steer * (pc.speed / maxSpeed) * 2.1 * dt * (handbrake ? 1.6 : 1);
    }
    const nx = pc.x + Math.sin(pc.heading) * pc.speed * dt;
    const nz = pc.z + Math.cos(pc.heading) * pc.speed * dt;
    if (this.city.isBlocked(nx, pc.z, 2.1)) {
      pc.speed *= -0.25;
    } else {
      pc.x = nx;
    }
    if (this.city.isBlocked(pc.x, nz, 2.1)) {
      pc.speed *= -0.25;
    } else {
      pc.z = nz;
    }
    // Nudge traffic cars we ram.
    for (const c of this.traffic) {
      if (dist2(pc.x, pc.z, c.x, c.z) < 3.6) {
        const push = 3.2;
        c.x += Math.sin(pc.heading) * push * dt * 4;
        c.z += Math.cos(pc.heading) * push * dt * 4;
      }
    }
    pc.mesh.position.set(pc.x, 0, pc.z);
    pc.mesh.rotation.y = pc.heading;
    for (const w of pc.mesh.userData.wheels) w.rotation.x += (pc.speed * dt) / 0.36;
    player.pos.set(pc.x, 0, pc.z);
    player.yaw = pc.heading;
  }

  // Speed in miles per hour, for the HUD speedometer.
  playerMph() {
    if (!this.playerCar) return 0;
    return Math.abs(this.playerCar.speed) * 2.23694;
  }
}
