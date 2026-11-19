// Missions: the six jobs of SOLMAR HEAT, their state machine and the golden
// beacon that marks the current destination. Pure logic — no DOM, no scene
// calls at update time — so the headless checks can drive it with plain data.
// main.js polls update() each frame and performs the side effects the
// returned events name (spawn rivals, set wanted, pay out, show intros).

import * as THREE from 'three';
import { ANCHORS } from './city.js';
import { dist2 } from './util.js';

export const DEBT = 5000;

export const MISSIONS = [
  {
    title: 'First Wheels',
    reward: 300,
    intro: 'Vera: "Deke, you owe me five grand. Start simple — take any car on the street and bring it to my garage. Don\'t scratch it."',
    steps: [
      { type: 'steal', text: 'Steal a car — walk up and press E' },
      { type: 'driveTo', target: 'garage', text: "Drive it to Vera's Garage" },
    ],
  },
  {
    title: 'The Pickup',
    reward: 500,
    intro: 'Vera: "A package is waiting at the marina. Grab it, bring it back — and don\'t ask what\'s inside."',
    steps: [
      { type: 'reach', target: 'docks', text: 'Go to the Solmar Marina' },
      { type: 'pickup', target: 'docks', text: 'Pick up the package (press E)' },
      { type: 'deliver', target: 'garage', text: "Deliver the package to Vera's Garage" },
    ],
  },
  {
    title: 'Getaway Driver',
    reward: 700,
    intro: 'Vera: "Kade\'s boys tipped off the cops. Lose them, then pick up my client at the Solmar Grand and take him to Club Neon Palms."',
    steps: [
      { type: 'evade', stars: 2, text: 'Lose the cops' },
      { type: 'pickup', target: 'hotel', text: 'Pick up the client at the Solmar Grand (press E)' },
      { type: 'driveTo', target: 'club', text: 'Drive the client to Club Neon Palms' },
    ],
  },
  {
    title: 'Rival Heat',
    reward: 900,
    intro: 'Vera: "Kade sent his crew to the marina to send a message. Send one back. They\'re armed — so are you."',
    steps: [
      { type: 'reach', target: 'docks', text: 'Go to the Solmar Marina' },
      { type: 'eliminate', target: 'docks', count: 3, text: 'Take out the rival gang members' },
      { type: 'deliver', target: 'garage', text: "Report back to Vera's Garage" },
    ],
  },
  {
    title: 'The Big Score',
    reward: 1500,
    intro: 'Vera: "Three packages, three corners of the city, one penthouse drop. The cops will be all over you — that\'s why I hired the best."',
    steps: [
      { type: 'pickup', target: 'hotel', text: 'Pick up package 1 at the Solmar Grand (press E)' },
      { type: 'pickup', target: 'club', text: 'Pick up package 2 at Club Neon Palms (press E)' },
      { type: 'pickup', target: 'docks', text: 'Pick up package 3 at the Marina (press E)' },
      { type: 'deliver', target: 'penthouse', text: 'Deliver all three to the Azure Penthouse' },
    ],
  },
  {
    title: 'Paying the Debt',
    reward: 2500,
    intro: 'Vera: "Last job, Deke. Take my car to the penthouse with the payoff. Kade will throw everything at you — drive like your freedom depends on it. It does."',
    steps: [
      { type: 'driveTo', target: 'penthouse', text: 'Drive the payoff to the Azure Penthouse' },
      { type: 'evade', stars: 3, text: 'Lose the cops and finish the job' },
    ],
  },
];

export function totalRewards() {
  return MISSIONS.reduce((n, m) => n + m.reward, 0);
}

export class MissionManager {
  constructor() {
    this.index = 0;
    this.step = 0;
    this.state = 'idle'; // idle | active | between | complete
    this.betweenTimer = 0;
    this.zeroTime = 0;
    this.stepTime = 0;
    this.eliminated = 0;
    this.rivalsSpawned = false;
    this.beacon = null;
    this.beaconGem = null;
    this.time = 0;
  }

  get mission() {
    return MISSIONS[this.index] || null;
  }

  get currentStep() {
    const m = this.mission;
    return m ? m.steps[this.step] : null;
  }

  start() {
    this.index = 0;
    this.step = 0;
    this.state = 'active';
    this.zeroTime = 0;
    this.stepTime = 0;
    this.eliminated = 0;
    this.rivalsSpawned = false;
    return this.enterStepEvents();
  }

  startMission(i) {
    this.index = i;
    this.step = 0;
    this.state = 'active';
    this.zeroTime = 0;
    this.stepTime = 0;
    this.eliminated = 0;
    this.rivalsSpawned = false;
    return this.enterStepEvents();
  }

  restart() {
    return this.startMission(this.index);
  }

  // The destination of the current step, or null for steps with no target.
  currentTarget() {
    const s = this.currentStep;
    if (!s || !s.target) return null;
    const a = ANCHORS[s.target];
    return a ? { x: a.x, z: a.z, label: a.label } : null;
  }

  // HUD objective line for the current state.
  objective() {
    if (this.state === 'complete') {
      return { title: 'DEBT PAID — FREE ROAM', text: 'Solmar is yours now. Collect cash, run fares, stay fast.' };
    }
    if (this.state !== 'active' || !this.mission) {
      return { title: 'FREE ROAM', text: 'Start the next job from the pause menu, or explore Solmar.' };
    }
    const s = this.currentStep;
    let text = s.text;
    if (s.type === 'eliminate') text += ` (${this.eliminated}/${s.count})`;
    if (s.type === 'evade') text += ` — ${Math.floor(this.stepTime)}s`;
    return { title: `MISSION ${this.index + 1} — ${this.mission.title}`, text };
  }

  // Events fired when a step begins (wanted levels, rival spawns, intros).
  enterStepEvents() {
    const events = [];
    const s = this.currentStep;
    if (!s) return events;
    if (this.step === 0 && this.mission) {
      events.push({ type: 'intro', text: this.mission.intro });
    }
    if (s.type === 'evade') {
      events.push({ type: 'setWanted', stars: s.stars || 2 });
    }
    if (s.type === 'eliminate') {
      const t = this.currentTarget();
      if (t) events.push({ type: 'spawnRivals', x: t.x, z: t.z, count: s.count, label: t.label });
      this.rivalsSpawned = true;
    }
    return events;
  }

  // One frame of mission logic. s: { pos:{x,z}, inCar, interact, wantedStars,
  // rivalsAlive }. Returns events for main.js to act on.
  update(dt, s) {
    this.time += dt;
    const events = [];
    if (this.state === 'between') {
      this.betweenTimer -= dt;
      if (this.betweenTimer <= 0) {
        this.index += 1;
        this.step = 0;
        this.state = 'active';
        this.zeroTime = 0;
        this.stepTime = 0;
        this.eliminated = 0;
        this.rivalsSpawned = false;
        events.push(...this.enterStepEvents());
      }
      return events;
    }
    if (this.state !== 'active' || !this.mission) return events;
    const step = this.currentStep;
    if (!step) return events;
    this.stepTime += dt;

    let done = false;
    if (step.type === 'steal') {
      done = s.inCar === true;
    } else if (step.type === 'reach' || step.type === 'deliver') {
      const t = this.currentTarget();
      if (t && dist2(s.pos.x, s.pos.z, t.x, t.z) < 8) done = true;
    } else if (step.type === 'driveTo') {
      const t = this.currentTarget();
      if (t && s.inCar && dist2(s.pos.x, s.pos.z, t.x, t.z) < 8) done = true;
    } else if (step.type === 'pickup') {
      const t = this.currentTarget();
      if (t && s.interact && dist2(s.pos.x, s.pos.z, t.x, t.z) < 7) done = true;
    } else if (step.type === 'eliminate') {
      if (this.rivalsSpawned) {
        this.eliminated = step.count - (s.rivalsAlive || 0);
        if ((s.rivalsAlive || 0) <= 0) done = true;
      }
    } else if (step.type === 'evade') {
      if (s.wantedStars === 0) {
        this.zeroTime += dt;
        if (this.zeroTime >= 4) done = true;
      } else {
        this.zeroTime = 0;
      }
    }

    if (!done) return events;
    this.step += 1;
    this.zeroTime = 0;
    this.stepTime = 0;
    this.eliminated = 0;
    this.rivalsSpawned = false;
    if (this.step < this.mission.steps.length) {
      events.push(...this.enterStepEvents());
      return events;
    }
    // Mission complete: pay out, then move on.
    events.push({ type: 'payout', amount: this.mission.reward, title: this.mission.title });
    if (this.index >= MISSIONS.length - 1) {
      this.state = 'complete';
      events.push({ type: 'allComplete' });
    } else {
      this.state = 'between';
      this.betweenTimer = 2.5;
    }
    return events;
  }

  // Golden beacon: a tall translucent beam with a spinning octahedron gem.
  // Built once by main.js; positioned each frame at the current target.
  createBeacon(scene) {
    const group = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffd23f,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 70, 12, 1, true), beamMat);
    beam.position.y = 35;
    group.add(beam);
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.7),
      new THREE.MeshBasicMaterial({ color: 0xffd23f })
    );
    gem.position.y = 9;
    group.add(gem);
    group.visible = false;
    scene.add(group);
    this.beacon = group;
    this.beaconGem = gem;
    return group;
  }

  updateBeacon(dt) {
    if (!this.beacon) return;
    const t = this.currentTarget();
    const active = this.state === 'active' && !!t;
    this.beacon.visible = active;
    if (!active) return;
    this.beacon.position.set(t.x, 0, t.z);
    this.beaconGem.rotation.y += dt * 1.6;
    this.beaconGem.position.y = 9 + Math.sin(this.time * 2.2) * 0.8;
  }
}
