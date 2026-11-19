// Combat: Deke's pistol (a hitscan shot with a tracer line) and the rival
// gang members who close in and shoot back. Enemies are simple: approach
// until they are in range, then fire on a cooldown with inaccuracy.
import * as THREE from 'three';
import { clamp, dist2, rand } from './util.js';
import { createPersonMesh } from './player.js';

const MAG = 12;
const RELOAD_TIME = 1.1;
const FIRE_INTERVAL = 0.22;
const PISTOL_DAMAGE = 34;

/** A rival gang member: a mesh, health, a shot timer and a death fade. */
class Rival {
  constructor(mesh, rng) {
    this.mesh = mesh;
    this.health = 100;
    this.shootTimer = rand(rng, 0.5, 1.5);
    this.speed = 4.5;
    this.dead = false;
    this.fade = 0;
  }
}

export class Combat {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.ammo = MAG;
    this.reloadTimer = 0;
    this.fireTimer = 0;
    this.enemies = [];
    this.tracers = [];
    this.onEvent = null; // (type, payload) => void; set by main
  }

  emit(type, payload) {
    if (this.onEvent) this.onEvent(type, payload);
  }

  /** Drop `count` armed rivals in a ring around a point. */
  spawnRivals(center, count) {
    for (let i = 0; i < count; i += 1) {
      const mesh = createPersonMesh({ shirt: 0x8a1a1a, pants: 0x222226, skin: 0xc98d64 });
      const a = (i / count) * Math.PI * 2 + rand(this.rng, -0.4, 0.4);
      mesh.position.set(center.x + Math.sin(a) * 10, 0, center.z + Math.cos(a) * 10);
      this.scene.add(mesh);
      this.enemies.push(new Rival(mesh, this.rng));
    }
  }

  /** Fire the pistol from the camera toward the crosshair. */
  shoot(camera, wanted) {
    if (this.reloadTimer > 0 || this.fireTimer > 0 || this.ammo <= 0) return null;
    this.fireTimer = FIRE_INTERVAL;
    this.ammo -= 1;
    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const end = origin.clone().addScaledVector(dir, 120);
    this.addTracer(origin, end);
    this.emit('shot', {});
    // Find the closest rival the ray passes near (within 0.9 m of the line).
    let best = null;
    let bestT = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const to = new THREE.Vector3(
        e.mesh.position.x - origin.x,
        1.2 - origin.y,
        e.mesh.position.z - origin.z,
      );
      const t = to.dot(dir);
      if (t < 0 || t > 120) continue;
      const closest = origin.clone().addScaledVector(dir, t);
      const d = Math.hypot(closest.x - e.mesh.position.x, closest.y - 1.2, closest.z - e.mesh.position.z);
      if (d < 1.1 + 0.9 && t < bestT) {
        bestT = t;
        best = e;
      }
    }
    if (best) {
      best.health -= PISTOL_DAMAGE;
      this.emit('hitmark', {});
      if (best.health <= 0) this.killRival(best);
      return { kind: 'enemy', ref: best, t: bestT };
    }
    return { kind: 'miss', t: bestT };
  }

  /** A rival goes down: topple the mesh and start its fade-out. */
  killRival(e) {
    e.dead = true;
    e.fade = 1.2;
    e.mesh.rotation.x = -Math.PI / 2;
    e.mesh.position.y = 0.4;
    this.emit('enemy-down', e);
  }

  addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }),
    );
    this.scene.add(line);
    this.tracers.push({ line, life: 0.08 });
  }

  reload() {
    if (this.reloadTimer > 0 || this.ammo === MAG) return;
    this.reloadTimer = RELOAD_TIME;
    this.emit('reload', {});
  }

  /** A short-range swing at the nearest pedestrian or rival within 2.2 m. */
  punch(player, peds, wanted) {
    let best = null;
    let bestD = 2.2;
    for (const p of peds) {
      const d = dist2(player.x, player.z, p.mesh.position.x, p.mesh.position.z);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'ped', ref: p };
      }
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist2(player.x, player.z, e.mesh.position.x, e.mesh.position.z);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'enemy', ref: e };
      }
    }
    if (!best) return null;
    this.emit('punch', {});
    if (best.kind === 'enemy') {
      const e = best.ref;
      e.health -= PISTOL_DAMAGE;
      if (e.health <= 0) this.killRival(e);
    } else {
      this.emit('ped-hit', best.ref);
    }
    return best;
  }

  step(dt, playerPos) {
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.ammo = MAG;
        this.emit('reloaded', {});
      }
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
    // Rivals: close in, stop at range, shoot, fall and fade.
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
