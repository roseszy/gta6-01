// Dana "Deke" Reyes on foot: a stylised figure built from boxes, WASD movement
// relative to the camera, running, jumping, and a third-person camera that
// orbits with the mouse.
import * as THREE from 'three';
import { angleToward, clamp } from './util.js';

const WALK_SPEED = 6;
const RUN_SPEED = 11;
const JUMP_SPEED = 8.5;
const GRAVITY = 24;

export function createPersonMesh(opts = {}) {
  const shirt = opts.shirt ?? 0xd94f3d;
  const pants = opts.pants ?? 0x2e3a4d;
  const skin = opts.skin ?? 0xc98d64;
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.32), mat(pants));
  legs.position.y = 0.4;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), mat(shirt));
  torso.position.y = 1.22;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), mat(skin));
  head.position.y = 1.88;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.46), mat(0x1a1210));
  hair.position.y = 2.12;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.24), mat(shirt));
  armL.position.set(-0.48, 1.22, 0);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.24), mat(shirt));
  armR.position.set(0.48, 1.22, 0);
  g.add(legs, torso, head, hair, armL, armR);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.userData.arms = { armL, armR, legs };
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

  /** On-foot step: axes are camera-relative, look turns the camera. */
  step(dt, axes, look, running, jump, city) {
    if (this.invulnerable > 0) this.invulnerable -= dt;
    this.camYaw -= look.dx * 0.0032;
    this.camPitch = clamp(this.camPitch + look.dy * 0.0024, 0.05, 1.1);
    const targetSpeed = (axes.x !== 0 || axes.y !== 0) ? (running ? RUN_SPEED : WALK_SPEED) : 0;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 10);
    if (this.speed > 0.3) {
      const moveAngle = this.camYaw - Math.atan2(axes.x, axes.y);
      this.yaw = angleToward(this.yaw, moveAngle, dt * 10);
      const nx = this.pos.x + Math.sin(moveAngle) * this.speed * dt;
      const nz = this.pos.z + Math.cos(moveAngle) * this.speed * dt;
      const probe = { x: nx, z: nz };
      city.collideCircle(probe, 0.55);
      this.pos.x = probe.x;
      this.pos.z = probe.z;
      this.walkPhase += dt * this.speed * 1.6;
      const swing = Math.sin(this.walkPhase) * 0.5 * Math.min(1, this.speed / RUN_SPEED);
      const { armL, armR, legs } = this.mesh.userData.arms;
      armL.rotation.x = swing;
      armR.rotation.x = -swing;
      legs.rotation.x = swing * 0.4;
    }
    if (jump && this.grounded) {
      this.vy = JUMP_SPEED;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.grounded = true; }
    }
    this.mesh.rotation.y = this.yaw;
  }

  /** Place the third-person camera behind the player. Returns the camera position. */
  cameraTarget(cam, dt) {
    const cx = this.pos.x - Math.sin(this.camYaw) * this.camDist * Math.cos(this.camPitch);
    const cz = this.pos.z - Math.cos(this.camYaw) * this.camDist * Math.cos(this.camPitch);
    const cy = this.pos.y + 2.2 + Math.sin(this.camPitch) * this.camDist;
    cam.position.x += (cx - cam.position.x) * Math.min(1, dt * 8);
    cam.position.y += (cy - cam.position.y) * Math.min(1, dt * 8);
    cam.position.z += (cz - cam.position.z) * Math.min(1, dt * 8);
    cam.lookAt(this.pos.x, this.pos.y + 1.8, this.pos.z);
  }

  damage(amount) {
    if (this.invulnerable > 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.invulnerable = 0.4;
    return true;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  resetTo(x, z) {
    this.pos.set(x, 0, z);
    this.health = this.maxHealth;
    this.vy = 0;
    this.grounded = true;
  }
}
