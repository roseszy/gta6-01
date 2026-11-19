// Side activities: cash bundles dropped around the city, and taxi fares —
// pick up a waiting passenger and drive them to their marker before the
// clock runs out.
import * as THREE from 'three';
import { dist2, pick, rand, randInt } from './util.js';
import { ANCHORS, CITY } from './city.js';

export class Activities {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cash = [];
    this.collected = 0;
    this.fare = null; // active taxi fare
    this.fareMarker = null;
    this.onEvent = null;
    this.spawnCash(20);
  }

  emit(type, payload) { if (this.onEvent) this.onEvent(type, payload); }

  spawnCash(count) {
    for (let i = 0; i < count; i += 1) {
      const g = new THREE.Group();
      const bundle = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.35, 0.6),
        new THREE.MeshLambertMaterial({ color: 0x2fae4e, emissive: 0x1a6b2e, emissiveIntensity: 0.5 }),
      );
      bundle.position.y = 0.5;
      const glow = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.1, 0.2, 12),
        new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.3 }),
      );
      glow.position.y = 0.15;
      g.add(bundle, glow);
      const node = this.city.randomRoadNode(this.rng);
      const x = Math.max(6, Math.min(CITY - 6, node.x + rand(this.rng, -18, 18)));
      const z = Math.max(6, Math.min(CITY - 6, node.z + rand(this.rng, -18, 18)));
      g.position.set(x, 0, z);
      this.scene.add(g);
      this.cash.push({ group: g, value: randInt(this.rng, 50, 150), taken: false, x, z });
    }
  }

  /** Taxi stand passenger: appears near the hotel when none is active. */
  maybeSpawnPassenger() {
    if (this.fare) return;
    if (this.rng() > 0.25) return;
    this.fare = {
      state: 'waiting',
      x: ANCHORS.taxiStand.x + rand(this.rng, -4, 4),
      z: ANCHORS.taxiStand.z + rand(this.rng, -4, 4),
      tx: 0, tz: 0, timer: 0, payout: 0,
    };
    this.emit('fare-waiting', this.fare);
  }

  startFare(dest) {
    const f = this.fare;
    f.state = 'riding';
    f.tx = dest.x; f.tz = dest.z;
    f.timer = Math.max(35, Math.round(dist2(f.x, f.z, dest.x, dest.z) / 1.1));
    f.payout = randInt(this.rng, 120, 260);
    this.emit('fare-start', f);
  }

  completeFare() {
    const f = this.fare;
    const pay = f.payout;
    this.fare = null;
    this.emit('fare-done', { payout: pay });
    return pay;
  }

  failFare() {
    this.fare = null;
    this.emit('fare-fail', {});
  }

  step(dt, playerPos, inCar) {
    // Cash pickups spin and bob; collect within 2.2 m.
    for (const c of this.cash) {
      if (c.taken) continue;
      c.group.rotation.y += dt * 1.5;
      c.group.children[0].position.y = 0.5 + Math.sin(performance.now() * 0.003 + c.x) * 0.12;
      if (dist2(playerPos.x, playerPos.z, c.x, c.z) < 2.4) {
        c.taken = true;
        c.group.visible = false;
        this.collected += 1;
        this.emit('cash', { value: c.value });
      }
    }
    // Taxi: waiting passenger boards when the player stops near in a car.
    if (this.fare && this.fare.state === 'waiting') {
      if (inCar && dist2(playerPos.x, playerPos.z, this.fare.x, this.fare.z) < 6) {
        const dests = [ANCHORS.club, ANCHORS.docks, ANCHORS.penthouse, ANCHORS.hospital, ANCHORS.garage];
        this.startFare(pick(this.rng, dests));
      }
    } else if (this.fare && this.fare.state === 'riding') {
      this.fare.timer -= dt;
      if (inCar && dist2(playerPos.x, playerPos.z, this.fare.tx, this.fare.tz) < 9) {
        this.completeFare();
      } else if (this.fare.timer <= 0) {
        this.failFare();
      }
    }
    // A new passenger shows up now and then.
    if (!this.fare && this.rng() < dt * 0.05) this.maybeSpawnPassenger();
  }
}
