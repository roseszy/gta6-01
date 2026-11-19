// Cars: boxy meshes with wheels and lights, arcade driving for the car the
// player drives, traffic that follows the road graph, parked cars to steal,
// and police cars that chase. Traffic and police share the mesh builder.
import * as THREE from 'three';
import { angleDiff, angleToward, clamp, dist2, lerp, pick, rand, randInt } from './util.js';
import { CITY, PITCH } from './city.js';

export const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8b13c, 0x3aa655, 0xd8d8d8, 0x222226, 0x8a4fbf, 0xe87a2e];

/** Build a car from boxes: body, cabin, wheels, lights. `kind` changes it. */
export function createCarMesh(color, kind = 'sedan') {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x16181c });
  const len = kind === 'truck' ? 5.6 : kind === 'sports' ? 4.4 : 4.8;
  const wid = 2.0;
  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, 0.75, len), bodyMat);
  body.position.y = 0.62;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(wid - 0.35, 0.62, kind === 'truck' ? 1.4 : len * 0.46),
    glassMat,
  );
  cabin.position.set(0, 1.28, kind === 'truck' ? 0.9 : -0.2);
  g.add(body, cabin);
  if (kind === 'truck') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.2, 0.5, 2.2), darkMat);
    bed.position.set(0, 1.05, -1.4);
    g.add(bed);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-0.95, 1.55], [0.95, 1.55], [-0.95, -1.55], [0.95, -1.55]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(wx, 0.38, wz);
    g.add(wheel);
  }
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe9a0, emissiveIntensity: 0.9 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xff2a2a, emissive: 0xcc0000, emissiveIntensity: 0.8 });
  for (const sx of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), headMat);
    head.position.set(sx, 0.7, len / 2 + 0.02);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), tailMat);
    tail.position.set(sx, 0.7, -len / 2 - 0.02);
    g.add(head, tail);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0xaa8800, emissiveIntensity: 0.6 }),
    );
    sign.position.set(0, 1.72, -0.2);
    g.add(sign);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.16, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 1.2 }),
    );
    bar.position.set(0, 1.66, -0.2);
    bar.name = 'lightbar';
    g.add(bar);
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    door.position.set(-1.01, 0.66, 0);
    door.rotation.y = -Math.PI / 2;
    g.add(door);
  }
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.userData.kind = kind;
  g.userData.length = len;
  return g;
}

/** Arcade driving physics for a car the player is driving. */
export class DriveCar {
  constructor(mesh) {
    this.mesh = mesh;
    this.pos = mesh.position;
    this.yaw = 0;
    this.speed = 0; // units per second, forward positive
    this.steer = 0;
    this.maxSpeed = 42;
    this.maxReverse = 14;
    this.stolen = false;
    this.occupied = false; // a traffic car nobody is driving
    this.health = 100;
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  /** One physics step. `others` are cars to bump against softly. */
  step(dt, throttle, steerInput, handbrake, city, others) {
    const accel = throttle > 0 ? 26 : throttle < 0 ? -20 : 0;
    if (handbrake) this.speed *= Math.max(0, 1 - dt * 3.2);
    else this.speed += accel * dt;
    this.speed -= this.speed * 0.35 * dt; // drag
    if (throttle === 0) this.speed -= this.speed * 0.6 * dt; // coasting
    this.speed = clamp(this.speed, -this.maxReverse, this.maxSpeed);
    if (Math.abs(this.speed) < 0.15 && throttle === 0) this.speed = 0;

    const wantSteer = steerInput * clamp(Math.abs(this.speed) / 8, 0, 1) * (handbrake ? 1.35 : 1);
    this.steer += (wantSteer - this.steer) * Math.min(1, dt * 7);
    const turn = this.steer * 1.9 * clamp(Math.abs(this.speed) / 12, 0, 1);
    // Positive steer (D) turns right, so the yaw drops toward screen-right.
    this.yaw -= turn * dt * (this.speed >= 0 ? 1 : -1);

    const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
    const probe = { x: nx, z: nz };
    if (city.collideCircle(probe, 1.5)) this.speed *= 0.45;
    this.pos.x = probe.x;
    this.pos.z = probe.z;
    for (const o of others) {
      if (o === this) continue;
      const d = dist2(this.pos.x, this.pos.z, o.pos.x, o.pos.z);
      if (d < 3.4 && d > 0.01) {
        const push = (3.4 - d) / 2;
        const ux = (this.pos.x - o.pos.x) / d;
        const uz = (this.pos.z - o.pos.z) / d;
        this.pos.x += ux * push;
        this.pos.z += uz * push;
        this.speed *= 0.82;
        if (o.speed !== undefined) o.speed *= 0.7;
      }
    }
    this.mesh.rotation.y = this.yaw;
  }
}

/** Traffic: cars that cruise the road graph, slow for the car ahead, and
 *  turn at intersections. */
export class TrafficSystem {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    this.spawnTimer = 0;
  }

  spawn(count) {
    for (let i = 0; i < count; i += 1) this.spawnOne();
  }

  spawnOne() {
    const rng = this.rng;
    const kind = pick(rng, ['sedan', 'sedan', 'coupe', 'truck', 'sedan']);
    const mesh = createCarMesh(pick(rng, CAR_COLORS), kind === 'coupe' ? 'sports' : kind);
    const node = this.city.randomRoadNode(rng);
    const nodeIdx = this.city.roadGraph.nodes.indexOf(node);
    const adj = this.city.roadGraph.adj[nodeIdx];
    const next = adj.length ? this.city.roadGraph.nodes[adj[Math.floor(rng() * adj.length)]] : node;
    const car = {
      mesh, node, next,
      t: rng(),
      speed: rand(rng, 8, 13),
      cruise: rand(rng, 9, 14),
    };
    mesh.position.set(lerp(node.x, next.x, car.t), 0, lerp(node.z, next.z, car.t));
    mesh.rotation.y = Math.atan2(next.x - node.x, next.z - node.z);
    this.scene.add(mesh);
    this.cars.push(car);
    return car;
  }

  step(dt) {
    const graph = this.city.roadGraph;
    for (const car of this.cars) {
      // Ease off if another traffic car is right ahead on the same stretch.
      let target = car.cruise;
      for (const o of this.cars) {
        if (o === car) continue;
        const d = dist2(car.mesh.position.x, car.mesh.position.z, o.mesh.position.x, o.mesh.position.z);
        if (d < 9) {
          const ahead = Math.sin(car.mesh.rotation.y) * (o.mesh.position.x - car.mesh.position.x)
            + Math.cos(car.mesh.rotation.y) * (o.mesh.position.z - car.mesh.position.z);
          if (ahead > 0) target = Math.min(target, 4);
        }
      }
      car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
      const segLen = dist2(car.node.x, car.node.z, car.next.x, car.next.z);
      car.t += (car.speed * dt) / Math.max(1, segLen);
      if (car.t >= 1) {
        car.node = car.next;
        const idx = graph.nodes.indexOf(car.node);
        const options = graph.adj[idx].filter((n) => graph.nodes[n] !== car.node);
        const nextIdx = options.length ? pick(this.rng, options) : idx;
        car.next = graph.nodes[nextIdx];
        car.t = 0;
      }
      car.mesh.position.set(
        lerp(car.node.x, car.next.x, car.t),
        0,
        lerp(car.node.z, car.next.z, car.t),
      );
      const wantYaw = Math.atan2(car.next.x - car.node.x, car.next.z - car.node.z);
      car.mesh.rotation.y = angleToward(car.mesh.rotation.y, wantYaw, dt * 4);
    }
    // Keep the streets busy: top the traffic back up to 22 cars.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.cars.length < 22) {
      this.spawnOne();
      this.spawnTimer = 2.5;
    }
  }

  /** The traffic car nearest a point, within maxDist. */
  nearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const c of this.cars) {
      const d = dist2(x, z, c.mesh.position.x, c.mesh.position.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  remove(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.scene.remove(car.mesh);
  }

  /** Parked cars the player can steal, lined up along curbs. */
  spawnParked(scene, rng, count) {
    const parked = [];
    for (let i = 0; i < count; i += 1) {
      const kind = pick(rng, ['sedan', 'sports', 'truck', 'sedan']);
      const mesh = createCarMesh(pick(rng, CAR_COLORS), kind);
      const node = this.city.randomRoadNode(rng);
      const alongX = rng() < 0.5;
      const px = alongX ? node.x + rand(rng, -20, 20) : node.x + (rng() < 0.5 ? 8.6 : -8.6);
      const pz = alongX ? node.z + (rng() < 0.5 ? 8.6 : -8.6) : node.z + rand(rng, -20, 20);
      mesh.position.set(clamp(px, 6, CITY - 6), 0, clamp(pz, 6, CITY - 6));
      mesh.rotation.y = alongX ? 0 : Math.PI / 2;
      if (rng() < 0.5) mesh.rotation.y += Math.PI;
      scene.add(mesh);
      const drive = new DriveCar(mesh);
      drive.yaw = mesh.rotation.y;
      drive.occupied = false;
      parked.push(drive);
    }
    return parked;
  }
}
