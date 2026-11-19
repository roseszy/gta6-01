// Side activities: 20 cash stashes hidden around the city and taxi fares.
// Stashes are collected by walking over them; fares pick a passenger up at
// the Taxi Stand and pay on delivery. Events go back to main.js.

import * as THREE from 'three';
import { ANCHORS } from './city.js';
import { mulberry32, dist2, rngPick } from './util.js';

export const STASH_VALUE = 50;
export const STASH_COUNT = 20;

export class Activities {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed ^ 0x57a5);
    this.stashes = [];
    const stashMat = new THREE.MeshBasicMaterial({ color: 0x39d353 });
    const stashGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    for (let i = 0; i < STASH_COUNT; i++) {
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 20; tries++) {
        const p = this.city.streetPoints[Math.floor(this.rng() * this.city.streetPoints.length)];
        x = p.x + (this.rng() - 0.5) * 16;
        z = p.z + (this.rng() - 0.5) * 16;
        if (!this.city.isBlocked(x, z, 1)) break;
      }
      const mesh = new THREE.Mesh(stashGeo, stashMat);
      mesh.position.set(x, 0.9, z);
      scene.add(mesh);
      this.stashes.push({ x, z, value: STASH_VALUE, taken: false, mesh });
    }
    // Taxi: one passenger waiting at the stand at a time.
    this.taxi = { state: 'waiting', dest: null, fare: 0, timer: 0 };
    this.taxiMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.5, 2.6),
      new THREE.MeshLambertMaterial({ color: 0xffc93f })
    );
    this.taxiMesh.position.set(ANCHORS.taxiStand.x, 0.4, ANCHORS.taxiStand.z);
    scene.add(this.taxiMesh);
    this.time = 0;
  }

  stashesLeft() {
    return this.stashes.filter((s) => !s.taken).length;
  }

  // One frame. s: { pos:{x,z}, inCar }. Returns events for main.js.
  update(dt, s) {
    this.time += dt;
    const events = [];
    for (const st of this.stashes) {
      if (st.taken) continue;
      st.mesh.rotation.y += dt * 1.5;
      st.mesh.position.y = 0.9 + Math.sin(this.time * 2 + st.x) * 0.15;
      if (dist2(s.pos.x, s.pos.z, st.x, st.z) < 2.2) {
        st.taken = true;
        this.scene.remove(st.mesh);
        events.push({ type: 'stash', amount: st.value });
      }
    }

    const stand = ANCHORS.taxiStand;
    if (this.taxi.state === 'waiting') {
      this.taxiMesh.visible = true;
      this.taxiMesh.position.set(stand.x, 0.4, stand.z);
      if (s.inCar && dist2(s.pos.x, s.pos.z, stand.x, stand.z) < 6) {
        const dests = Object.keys(ANCHORS).filter((k) => k !== 'taxiStand');
        const key = rngPick(this.rng, dests);
        const dest = ANCHORS[key];
        const fare = 40 + Math.round(dist2(stand.x, stand.z, dest.x, dest.z) * 0.15);
        this.taxi = { state: 'riding', dest, fare, timer: 0 };
        events.push({ type: 'farePickup', dest: dest.label, fare });
      }
    } else if (this.taxi.state === 'riding') {
      this.taxiMesh.visible = false;
      const d = this.taxi.dest;
      if (dist2(s.pos.x, s.pos.z, d.x, d.z) < 8) {
        events.push({ type: 'fareDelivered', amount: this.taxi.fare });
        this.taxi = { state: 'cooldown', dest: null, fare: 0, timer: 8 };
      }
    } else {
      this.taxi.timer -= dt;
      if (this.taxi.timer <= 0) this.taxi = { state: 'waiting', dest: null, fare: 0, timer: 0 };
    }
    return events;
  }
}
