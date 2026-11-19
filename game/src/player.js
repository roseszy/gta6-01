// Dana "Deke" Reyes on foot: a stylised figure built from boxes. WASD moves
// relative to the camera, Shift runs, Space jumps, and a third-person camera
// orbits behind with the mouse. The same figure builder makes pedestrians,
// cops and rivals with different shirts.
import * as THREE from 'three';
import { angleToward, clamp } from './util.js';

const WALK = 6;
const RUN = 11;
const JUMP = 8.5;
const GRAVITY = 24;

// Body-part table: each entry is [size x/y/z, offset x/y/z, material key].
// The builder walks the table, so a person is one loop, not a dozen meshes.
const BODY_PARTS = [
  { size: [0.55, 0.8, 0.32], at: [0, 0.4, 0], mat: 'pants', name: 'legs' },
  { size: [0.72, 0.85, 0.4], at: [0, 1.22, 0], mat: 'shirt', name: 'torso' },
  { size: [0.42, 0.42, 0.42], at: [0, 1.88, 0], mat: 'skin', name: 'head' },
  { size: [0.46, 0.16, 0.46], at: [0, 2.12, 0], mat: 'hair', name: 'hair' },
  { size: [0.2, 0.75, 0.24], at: [-0.48, 1.22, 0], mat: 'shirt', name: 'armL' },
  { size: [0.2, 0.75, 0.24], at: [0.48, 1.22, 0], mat: 'shirt', name: 'armR' },
];

/** A boxy person assembled from the BODY_PARTS table. Returns a Group. */
export function createPersonMesh(opts = {}) {
  const colours = {
    shirt: opts.shirt ?? 0xd94f3d,
    pants: opts.pants ?? 0x2e3a4d,
    skin: opts.skin ?? 0xc98d64,
    hair: 0x1a1210,
  };
  const g = new THREE.Group();
  const parts = {};
  for (const part of BODY_PARTS) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]),
      new THREE.MeshLambertMaterial({ color: colours[part.mat] }),
    );
    mesh.position.set(part.at[0], part.at[1], part.at[2]);
    mesh.castShadow = true;
    g.add(mesh);
    parts[part.name] = mesh;
  }
  g.userData.arms = { armL: parts.armL, armR: parts.armR, legs: parts.legs };
  return g;
}

export class Player {
  constructor(scene) {
    this.mesh = createPersonMesh({ shirt: 0xd94f3d, pants: 0x2e3a4d });
    this.mesh.position.set(81, 0, 96);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.yaw = Math.PI; // facing the garage
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 9;
    this.vy = 0;
    this.grounded = true;
    this.health = 100;
    this.maxHealth = 100;
    this.speed = 0;
    this.invulnerable = 0;
    this.walkPhase = 0;
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  /** One on-foot step: axes are camera-relative, look turns the camera. */
  step(dt, axes, look, running, jump, city) {
    if (this.invulnerable > 0) this.invulnerable -= dt;
    this.camYaw -= look.dx * 0.0032;
    this.camPitch = clamp(this.camPitch + look.dy * 0.0024, 0.05, 1.1);
    const wantSpeed = axes.x !== 0 || axes.y !== 0 ? (running ? RUN : WALK) : 0;
    this.speed += (wantSpeed - this.speed) * Math.min(1, dt * 10);
    if (this.speed > 0.3) {
      const moveAngle = this.camYaw - Math.atan2(axes.x, axes.y);
      this.yaw = angleToward(this.yaw, moveAngle, dt * 10);
      const probe = {
        x: this.pos.x + Math.sin(moveAngle) * this.speed * dt,
        z: this.pos.z + Math.cos(moveAngle) * this.speed * dt,
      };
      city.collideCircle(probe, 0.55);
      this.pos.x = probe.x;
      this.pos.z = probe.z;
      this.walkPhase += dt * this.speed * 1.6;
      const swing = Math.sin(this.walkPhase) * 0.5 * Math.min(1, this.speed / RUN);
      const { armL, armR, legs } = this.mesh.userData.arms;
      armL.rotation.x = swing;
      armR.rotation.x = -swing;
      legs.rotation.x = swing * 0.4;
    }
    if (jump && this.grounded) {
      this.vy = JUMP;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.vy = 0;
        this.grounded = true;
      }
    }
    this.mesh.rotation.y = this.yaw;
  }

  /** Ease the third-person camera in behind the player. */
  cameraTarget(cam, dt) {
    const cx = this.pos.x - Math.sin(this.camYaw) * this.camDist * Math.cos(this.camPitch);
    const cz = this.pos.z - Math.cos(this.camYaw) * this.camDist * Math.cos(this.camPitch);
    const cy = this.pos.y + 2.2 + Math.sin(this.camPitch) * this.camDist;
    const ease = Math.min(1, dt * 8);
    cam.position.x += (cx - cam.position.x) * ease;
    cam.position.y += (cy - cam.position.y) * ease;
    cam.position.z += (cz - cam.position.z) * ease;
    cam.lookAt(this.pos.x, this.pos.y + 1.8, this.pos.z);
  }

  /** Take damage (briefly invulnerable afterwards). True if it landed. */
  damage(amount) {
    if (this.invulnerable > 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.invulnerable = 0.4;
    return true;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /** Put the player at (x, z), unhurt, on the ground. */
  resetTo(x, z) {
    this.pos.set(x, 0, z);
    this.health = this.maxHealth;
    this.vy = 0;
    this.grounded = true;
  }
}
