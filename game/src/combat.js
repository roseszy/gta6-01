// Combat: the player's pistol (hitscan, with a tracer and muzzle flash) and
// the rival gang members who shoot back. Enemies are simple: they close in,
// stop at range, and fire with a cooldown and inaccuracy.
import * as THREE from 'three';
import { clamp, dist2, rand } from './util.js';
import { createPersonMesh } from './player.js';

const MAG = 12;
const RELOAD_TIME = 1.1;
const FIRE_INTERVAL = 0.22;

export class Combat {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.ammo = MAG;
    this.reloadTimer = 0;
    this.fireTimer = 0;
    this.enemies = [];
    this.tracers = [];
    this.onEvent = null;
  }

  emit(type, payload) { if (this.onEvent) this.onEvent(type, payload); }

  spawnRivals(center, count) {
    for (let i = 0; i < count; i += 1) {
      const mesh = createPersonMesh({ shirt: 0x8a1a1a, pants: 0x222226, skin: 0xc98d64 });
      const a = (i / count) * Math.PI * 2 + rand(this.rng, -0.4, 0.4);
      mesh.position.set(center.x + Math.sin(a) * 10, 0, center.z + Math.cos(a) * 10);
      this.scene.add(mesh);
      this.enemies.push({
        mesh, health: 100, shootTimer: rand(this.rng, 0.5, 1.5),
        speed: 4.5, dead: false, fade: 0,
      });
    }
  }

  /** Fire the pistol from the camera toward the crosshair. Returns 'hit' info. */
  shoot(camera, player, wanted) {
    if (this.reloadTimer > 0 || this.fireTimer > 0 || this.ammo <= 0) return null;
    this.fireTimer = FIRE_INTERVAL;
    this.ammo -= 1;
    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const end = origin.clone().addScaledVector(dir, 120);
    this.addTracer(origin, end);
    this.emit('shot', {});
    // Find the closest thing the ray passes near: enemies first, then peds, then cars.
    let best = null; let bestT = Infinity;
    const test = (pos, radius, kind, ref) => {
      const to = new THREE.Vector3(pos.x - origin.x, (pos.y ?? 1.2) - origin.y, pos.z - origin.z);
      const t = to.dot(dir);
      if (t < 0 || t > 120) return;
      const closest = origin.clone().addScaledVector(dir, t);
      const d = Math.hypot(closest.x - pos.x, closest.y - (pos.y ?? 1.2), closest.z - pos.z);
      if (d < radius + 0.9 && t < bestT) { bestT = t; best = { kind, ref, t }; }
    };
    for (const e of this.enemies) {
      if (!e.dead) test(e.mesh.position, 1.1, 'enemy', e);
    }
    if (best) {
      const e = best.ref;
      e.health -= 34;
      this.emit('hitmark', {});
      if (e.health <= 0) {
        e.dead = true;
        e.fade = 1.2;
        e.mesh.rotation.x = -Math.PI / 2;
        e.mesh.position.y = 0.4;
        this.emit('enemy-down', e);
      }
      return best;
    }
    return { kind: 'miss', t: bestT };
  }

  addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.08 });
  }

  reload() {
    if (this.reloadTimer > 0 || this.ammo === MAG) return;
    this.reloadTimer = RELOAD_TIME;
    this.emit('reload', {});
  }

  punch(player, peds, wanted) {
    // A short-range swing: nearest pedestrian or enemy within 2.2 m.
    let best = null; let bestD = 2.2;
    for (const p of peds) {
      const d = dist2(player.x, player.z, p.mesh.position.x, p.mesh.position.z);
      if (d < bestD) { bestD = d; best = { kind: 'ped', ref: p }; }
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist2(player.x, player.z, e.mesh.position.x, e.mesh.position.z);
      if (d < bestD) { bestD = d; best = { kind: 'enemy', ref: e }; }
    }
    if (!best) return null;
    this.emit('punch', {});
    if (best.kind === 'enemy') {
      const e = best.ref;
      e.health -= 34;
      if (e.health <= 0) {
        e.dead = true; e.fade = 1.2;
        e.mesh.rotation.x = -Math.PI / 2;
        e.mesh.position.y = 0.4;
        this.emit('enemy-down', e);
      }
    } else {
      this.emit('ped-hit', best.ref);
    }
    return best;
  }

  step(dt, player, playerPos) {
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) { this.ammo = MAG; this.emit('reloaded', {}); }
    }
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    // Enemies: close in, shoot, die and fade.
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const e = this.enemies[i];
      if (e.dead) {
        e.fade -= dt;
        e.mesh.position.y = Math.max(0.1, e.mesh.position.y - dt * 0.4);
        if (e.fade <= 0) {
          this.scene.remove(e.mesh);
          this.enemies.splice(i, 1);
        }
        continue;
      }
      const dx = playerPos.x - e.mesh.position.x;
      const dz = playerPos.z - e.mesh.position.z;
      const d = Math.hypot(dx, dz);
      e.mesh.rotation.y = Math.atan2(dx, dz);
      if (d > 20) {
        e.mesh.position.x += (dx / d) * e.speed * dt;
        e.mesh.position.z += (dz / d) * e.speed * dt;
        const swing = Math.sin(performance.now() * 0.011 + i) * 0.5;
        const { armL, armR } = e.mesh.userData.arms;
        armL.rotation.x = swing;
        armR.rotation.x = -swing;
      } else {
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          e.shootTimer = rand(this.rng, 1.1, 2.1);
          const hitChance = clamp(0.42 - d * 0.008, 0.12, 0.42);
          this.emit('enemy-shot', { hit: this.rng() < hitChance, damage: 9 });
          this.addTracer(
            new THREE.Vector3(e.mesh.position.x, 1.5, e.mesh.position.z),
            new THREE.Vector3(playerPos.x, 1.4, playerPos.z),
          );
        }
      }
    }
  }
}
