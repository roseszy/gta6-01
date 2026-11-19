// Combat: a 12-round pistol (R reloads, infinite reserve), a close-range
// punch, and the rival gang members who spawn for eliminate steps and shoot
// back. Shots use a raycaster; tracers are short-lived line meshes.

import * as THREE from 'three';
import { clamp, dist2, mulberry32, rngRange } from './util.js';
import { makeHumanoid } from './pedestrians.js';

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.magSize = 12;
    this.ammo = 12;
    this.reloadTimer = 0;
    this.rivals = [];
    this.tracers = [];
    this.raycaster = new THREE.Raycaster();
    this.rng = mulberry32(0xc0ffee);
    this.time = 0;
  }

  get reloading() {
    return this.reloadTimer > 0;
  }

  startReload() {
    if (this.reloadTimer <= 0 && this.ammo < this.magSize) this.reloadTimer = 1.2;
  }

  // Fire one pistol round along dir from origin. Returns the rival hit, if any.
  shoot(origin, dir) {
    if (this.reloadTimer > 0 || this.ammo <= 0) return null;
    this.ammo -= 1;
    if (this.ammo === 0) this.startReload();
    this.raycaster.set(origin, dir);
    this.raycaster.far = 70;
    const meshes = this.rivals.filter((r) => r.health > 0).map((r) => r.mesh);
    const hits = this.raycaster.intersectObjects(meshes, true);
    // Tracer: a thin glowing box from the muzzle to the hit point or max range.
    const end = hits.length > 0 ? hits[0].point : origin.clone().add(dir.clone().multiplyScalar(60));
    const len = origin.distanceTo(end);
    const tracer = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, len),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 })
    );
    tracer.position.copy(origin).add(end).multiplyScalar(0.5);
    tracer.lookAt(end);
    this.scene.add(tracer);
    this.tracers.push({ mesh: tracer, life: 0.09 });
    if (hits.length === 0) return null;
    let hitObj = hits[0].object;
    while (hitObj.parent && hitObj.parent !== this.scene) hitObj = hitObj.parent;
    const rival = this.rivals.find((r) => r.mesh === hitObj);
    if (rival) {
      rival.health -= 34;
      rival.flash = 0.12;
      if (rival.health <= 0) {
        rival.dead = true;
        this.scene.remove(rival.mesh);
      }
      return rival;
    }
    return null;
  }

  // Punch: hits the closest rival or nothing within 2.2 m in front.
  punch(pos, yaw) {
    let best = null;
    let bestD = 2.2;
    for (const r of this.rivals) {
      if (r.health <= 0) continue;
      const d = dist2(pos.x, pos.z, r.x, r.z);
      if (d > bestD) continue;
      const ang = Math.atan2(r.x - pos.x, r.z - pos.z);
      let dh = ang - yaw;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      if (Math.abs(dh) > 0.9) continue;
      bestD = d;
      best = r;
    }
    if (best) {
      best.health -= 25;
      best.flash = 0.12;
      if (best.health <= 0) {
        best.dead = true;
        this.scene.remove(best.mesh);
      }
    }
    return best;
  }

  spawnRivals(x, z, count) {
    for (let i = 0; i < count; i++) {
      const mesh = makeHumanoid(0x1a1a1a, 0x222222);
      // Red bandana: a small red box on the head.
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.44), new THREE.MeshLambertMaterial({ color: 0xcc2222 }));
      band.position.y = 1.82;
      mesh.add(band);
      const rx = x + rngRange(this.rng, -8, 8);
      const rz = z + rngRange(this.rng, -8, 8);
      mesh.position.set(rx, 0, rz);
      this.scene.add(mesh);
      this.rivals.push({
        mesh,
        x: rx,
        z: rz,
        health: 100,
        dead: false,
        flash: 0,
        shootTimer: rngRange(this.rng, 0.8, 2.0),
        speed: rngRange(this.rng, 2.2, 3.4),
      });
    }
  }

  rivalsAlive() {
    return this.rivals.filter((r) => !r.dead).length;
  }

  clearRivals() {
    for (const r of this.rivals) this.scene.remove(r.mesh);
    this.rivals = [];
  }

  update(dt, player) {
    this.time += dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.ammo = this.magSize;
    }
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter((t) => {
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        return false;
      }
      return true;
    });
    for (const r of this.rivals) {
      if (r.dead) continue;
      if (r.flash > 0) r.flash -= dt;
      const d = dist2(r.x, r.z, player.pos.x, player.pos.z);
      // Close in until 14 m, then hold and shoot.
      if (d > 14) {
        const want = Math.atan2(player.pos.x - r.x, player.pos.z - r.z);
        r.x += Math.sin(want) * r.speed * dt;
        r.z += Math.cos(want) * r.speed * dt;
        r.mesh.rotation.y = want;
      } else {
        r.mesh.rotation.y = Math.atan2(player.pos.x - r.x, player.pos.z - r.z);
      }
      r.mesh.position.set(r.x, 0, r.z);
      r.shootTimer -= dt;
      if (r.shootTimer <= 0 && d < 42) {
        r.shootTimer = rngRange(this.rng, 1.4, 2.6);
        // Hit chance falls with distance; a hit hurts.
        const hitChance = clamp(0.55 - d * 0.008, 0.12, 0.55);
        if (this.rng() < hitChance) player.damage(rngRange(this.rng, 5, 9));
      }
    }
  }
}
