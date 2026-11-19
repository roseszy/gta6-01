// The story: six jobs for fixer Vera Solano that pay off Deke's $5,000 debt.
// Each mission is a list of steps — reach a place, steal a car, pick something
// up, lose the cops, or take out rivals — with a marker beacon in the world
// and a payout at the end.
import * as THREE from 'three';
import { dist2 } from './util.js';
import { ANCHORS } from './city.js';

const DEBT = 5000;

export const MISSIONS = [
  {
    id: 1, title: 'First Wheels', reward: 300,
    intro: "Vera: \"Deke, you owe me five grand. Start simple — take any car on the street and bring it to my garage. Don't scratch it.\"",
    steps: [
      { type: 'steal', text: 'Steal a car (walk up to one and press E)' },
      { type: 'driveTo', target: 'garage', radius: 14, text: "Drive it to Vera's Garage" },
    ],
  },
  {
    id: 2, title: 'The Pickup', reward: 500,
    intro: "Vera: \"A package is waiting at the marina. Grab it, bring it back — and don't ask what's inside.\"",
    steps: [
      { type: 'reach', target: 'docks', radius: 10, text: 'Go to the Solmar Marina' },
      { type: 'pickup', target: 'docks', radius: 6, text: 'Pick up the package (press E)' },
      { type: 'deliver', target: 'garage', radius: 14, text: "Deliver the package to Vera's Garage" },
    ],
  },
  {
    id: 3, title: 'Getaway Driver', reward: 700,
    intro: "Vera: \"Kade's boys tipped off the cops. Lose them, then pick up my client at the Solmar Grand and take him to Club Neon Palms.\"",
    steps: [
      { type: 'evade', stars: 2, text: 'Lose the 2-star wanted level' },
      { type: 'reach', target: 'hotel', radius: 10, text: 'Pick up the client at the Solmar Grand' },
      { type: 'driveTo', target: 'club', radius: 14, text: 'Drive the client to Club Neon Palms' },
    ],
  },
  {
    id: 4, title: 'Rival Heat', reward: 900,
    intro: "Vera: \"Kade sent his crew to the marina to send a message. Send one back. They're armed — so are you.\"",
    steps: [
      { type: 'reach', target: 'docks', radius: 12, text: 'Go to the Solmar Marina' },
      { type: 'eliminate', count: 3, target: 'docks', radius: 30, text: 'Take out the 3 rival gang members' },
      { type: 'reach', target: 'garage', radius: 14, text: "Report back to Vera's Garage" },
    ],
  },
  {
    id: 5, title: 'The Big Score', reward: 1500,
    intro: "Vera: \"Three packages, three corners of the city, one penthouse drop. The cops will be all over you — that's why I hired the best.\"",
    steps: [
      { type: 'pickup', target: 'hotel', radius: 6, text: 'Pick up package 1 at the Solmar Grand (press E)' },
      { type: 'pickup', target: 'club', radius: 6, text: 'Pick up package 2 at Club Neon Palms (press E)' },
      { type: 'pickup', target: 'docks', radius: 6, text: 'Pick up package 3 at the Marina (press E)' },
      { type: 'deliver', target: 'penthouse', radius: 14, text: 'Deliver all three to the Azure Penthouse' },
    ],
  },
  {
    id: 6, title: 'Paying the Debt', reward: 2500,
    intro: "Vera: \"Last job, Deke. Take my car to the penthouse with the payoff. Kade will throw everything at you — drive like your freedom depends on it. It does.\"",
    steps: [
      { type: 'driveTo', target: 'penthouse', radius: 14, text: 'Drive the payoff to the Azure Penthouse' },
      { type: 'evade', stars: 3, text: 'Lose the cops and finish the job' },
    ],
  },
];

export class MissionManager {
  constructor(scene) {
    this.scene = scene;
    this.index = 0; // mission in MISSIONS
    this.stepIndex = 0;
    this.active = false;
    this.carrying = 0; // packages held
    this.killsNeeded = 0;
    this.killsDone = 0;
    this.evadeTimer = 0;
    this.done = false;
    this.beacon = this.makeBeacon();
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.onEvent = null; // (type, payload) => void; set by main
  }

  makeBeacon() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 90, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 45;
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.4),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }),
    );
    gem.position.y = 7;
    g.add(beam, gem);
    g.userData.gem = gem;
    return g;
  }

  get mission() { return MISSIONS[this.index] ?? null; }
  get step() { return this.mission ? this.mission.steps[this.stepIndex] : null; }

  get markerPos() {
    const s = this.step;
    if (!s || !s.target) return null;
    return ANCHORS[s.target];
  }

  startMission(i) {
    this.index = i;
    this.stepIndex = 0;
    this.carrying = 0;
    this.killsDone = 0;
    this.evadeTimer = 0;
    this.active = true;
    this.done = false;
    const m = this.mission;
    if (m && m.steps[0].type === 'evade') this.armEvade(m.steps[0]);
    if (m && m.steps[0].type === 'eliminate') this.killsNeeded = m.steps[0].count;
    this.emit('mission-start', m);
  }

  armEvade(step) {
    this.evadeTimer = 0;
    this.emit('set-wanted', step.stars || 2);
  }

  restart() {
    this.startMission(this.index);
  }

  emit(type, payload) {
    if (this.onEvent) this.onEvent(type, payload);
  }

  /** Advance one step; returns true when the whole mission finished. */
  advance() {
    this.stepIndex += 1;
    const m = this.mission;
    if (this.stepIndex >= m.steps.length) {
      this.active = false;
      this.emit('mission-complete', m);
      return true;
    }
    const s = this.step;
    if (s.type === 'evade') this.armEvade(s);
    if (s.type === 'eliminate') { this.killsNeeded = s.count; this.killsDone = 0; this.emit('spawn-rivals', s.count); }
    this.emit('step', s);
    return false;
  }

  /** Called when the player picks up a package (E near a pickup marker). */
  onPickup() {
    const s = this.step;
    if (!s || s.type !== 'pickup') return false;
    this.carrying += 1;
    this.emit('pickup', { carrying: this.carrying });
    this.advance();
    return true;
  }

  onKill() {
    const s = this.step;
    if (!s || s.type !== 'eliminate') return;
    this.killsDone += 1;
    this.emit('kill-progress', { done: this.killsDone, needed: this.killsNeeded });
    if (this.killsDone >= this.killsNeeded) this.advance();
  }

  onEnterCar() {
    const s = this.step;
    if (s && s.type === 'steal') this.advance();
  }

  /** Per-frame checks: reach / deliver / evade completion. */
  update(dt, ctx) {
    // Spin the beacon gem.
    this.beacon.userData.gem.rotation.y += dt * 2;
    this.beacon.userData.gem.position.y = 7 + Math.sin(performance.now() * 0.002) * 0.8;
    if (!this.active || this.done) { this.beacon.visible = false; return; }
    const s = this.step;
    if (!s) return;
    const px = ctx.car ? ctx.car.pos.x : ctx.player.x;
    const pz = ctx.car ? ctx.car.pos.z : ctx.player.z;
    if (s.type === 'evade') {
      this.evadeTimer += dt;
      if (ctx.wantedStars <= 0 && this.evadeTimer > 4) {
        this.advance();
      }
      this.beacon.visible = false;
      return;
    }
    const marker = this.markerPos;
    if (marker) {
      this.beacon.visible = true;
      this.beacon.position.set(marker.x, 0, marker.z);
    } else {
      this.beacon.visible = false;
    }
    if (s.type === 'reach' || s.type === 'driveTo' || s.type === 'deliver') {
      const radius = s.radius || 8;
      const needCar = s.type === 'driveTo';
      if (dist2(px, pz, marker.x, marker.z) < radius && (!needCar || ctx.car)) {
        if (s.type === 'deliver') this.carrying = 0;
        this.advance();
      }
    }
  }

  objectiveText() {
    if (this.done) return { title: 'DEBT PAID — FREE ROAM', text: 'Solmar is yours now. Collect cash, run fares, stay fast.', dist: '' };
    if (!this.active || !this.mission) return { title: 'FREE ROAM', text: 'Start the next job from the pause menu, or explore Solmar.', dist: '' };
    const m = this.mission;
    const s = this.step;
    let text = s ? s.text : '';
    if (s && s.type === 'eliminate') text += ` (${this.killsDone}/${this.killsNeeded})`;
    if (s && s.type === 'evade') text += ` — ${Math.floor(this.evadeTimer)}s`;
    const marker = this.markerPos;
    return { title: `MISSION ${m.id} — ${m.title}`, text, dist: marker ? '' : '' };
  }

  /** Distance from the player to the current marker, in metres. */
  markerDistance(ctx) {
    const marker = this.markerPos;
    if (!marker) return 0;
    const px = ctx.car ? ctx.car.pos.x : ctx.player.x;
    const pz = ctx.car ? ctx.car.pos.z : ctx.player.z;
    return Math.round(dist2(px, pz, marker.x, marker.z));
  }

  finishAll() {
    this.done = true;
    this.active = false;
    this.beacon.visible = false;
  }
}

export { DEBT };
