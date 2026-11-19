// Dana "Deke" Reyes on foot: WASD walking, Shift to run, Space to jump,
// mouse look. Health regens slowly after a few seconds without damage.

import * as THREE from 'three';
import { clamp } from './util.js';

export class Player {
  constructor() {
    this.pos = new THREE.Vector3(81, 0, 126);
    this.yaw = Math.PI;
    this.pitch = -0.08;
    this.velY = 0;
    this.health = 100;
    this.onGround = true;
    this.onFoot = true;
    this.lastDamageAt = -99;
    this.time = 0;
  }

  damage(n) {
    if (this.health <= 0) return;
    this.health = Math.max(0, this.health - n);
    this.lastDamageAt = this.time;
  }

  healFull() {
    this.health = 100;
  }

  update(dt, input, city) {
    this.time += dt;
    if (!this.onFoot) return;

    // Slow health regen once the player has been safe for a while.
    if (this.health > 0 && this.health < 100 && this.time - this.lastDamageAt > 5) {
      this.health = Math.min(100, this.health + 2.5 * dt);
    }

    const look = input.consumeMouse();
    this.yaw -= look.dx * 0.0024;
    this.pitch = clamp(this.pitch - look.dy * 0.0022, -1.2, 1.2);

    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = run ? 9 : 4.6;
    // Forward is (sin yaw, cos yaw), right is (-cos yaw, sin yaw).
    let fx = 0;
    let fz = 0;
    if (input.down('KeyW')) fz += 1;
    if (input.down('KeyS')) fz -= 1;
    if (input.down('KeyA')) fx -= 1;
    if (input.down('KeyD')) fx += 1;
    const len = Math.hypot(fx, fz);
    if (len > 0) {
      fx /= len;
      fz /= len;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const mx = -fx * cos + fz * sin;
      const mz = fx * sin + fz * cos;
      const nx = this.pos.x + mx * speed * dt;
      const nz = this.pos.z + mz * speed * dt;
      if (!city.isBlocked(nx, this.pos.z, 0.7)) this.pos.x = nx;
      if (!city.isBlocked(this.pos.x, nz, 0.7)) this.pos.z = nz;
    }

    // Jump + gravity.
    if (input.pressed('Space') && this.onGround) {
      this.velY = 7.5;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.velY -= 22 * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.velY = 0;
        this.onGround = true;
      }
    }
  }
}
