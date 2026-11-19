// Deterministic screenshot scenes behind ?shot=start|drive|chase|mission.
// Each one plays the real rules forward from a fresh world for a fixed
// number of steps, steered by a tiny autopilot, so the frame is what real
// play looks like — and the same seed always gives the same frame.
import { ANCHORS, nearestStreetPoint } from './city.js';
import { createCarMesh, DriveCar } from './vehicles.js';
import { clamp } from './util.js';

const STEP = 1 / 60;

/**
 * Autopilot for the drive and chase scenes: stay on the road by aiming at a
 * point ahead on the nearest street centre line.
 */
function autopilotDrive(car) {
  const near = nearestStreetPoint(car.pos.x, car.pos.z);
  const alongX = Math.abs(Math.sin(car.yaw)) > Math.abs(Math.cos(car.yaw));
  const targetX = alongX ? car.pos.x + Math.sin(car.yaw) * 12 : near.x;
  const targetZ = alongX ? near.z : car.pos.z + Math.cos(car.yaw) * 12;
  const wantYaw = Math.atan2(targetX - car.pos.x, targetZ - car.pos.z);
  // DriveCar turns right when steer is positive (yaw drops), so flip the
  // angle error to steer toward the target.
  const steer = -clamp(((wantYaw - car.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1, 1);
  return { throttle: 1, steer, handbrake: false };
}

/** Run the world forward `n` fixed steps, driving the car if `drive` is set. */
function runSteps(game, n, drive) {
  for (let i = 0; i < n; i += 1) {
    game.update(STEP, drive ? { carInput: drive(game) } : null);
  }
}

/** Park a fresh car in the world and register it as a loose car. */
function giveCar(game, x, z, yaw, color, kind) {
  const mesh = createCarMesh(color, kind);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = yaw;
  game.scene.add(mesh);
  const car = new DriveCar(mesh);
  car.yaw = yaw;
  car.maxSpeed = kind === 'sports' ? 48 : 42;
  game.looseCars.push(car);
  return car;
}

/**
 * Stage a screenshot scene on the live game and render one frame.
 * Sets window.__shotReady once the frame is painted.
 */
export function stageShot(name, game) {
  const g = game;
  g.startShotMode();
  if (name === 'start') {
    // Title screen: the slow cinematic orbit over the city.
    g.setState('title');
    g.cinematicCamera();
    g.render();
    window.__shotReady = true;
    return;
  }
  g.beginPlay({ silent: true });
  g.hud.show();
  if (name === 'drive') {
    // A red sports car cruising the avenue, HUD and minimap live.
    const car = giveCar(g, 216, 150, 0, 0xc23b2e, 'sports');
    g.enterCar(car, { silent: true });
    car.speed = 24;
    runSteps(g, 150, () => autopilotDrive(car));
    g.updateCamera(STEP);
    g.render();
    window.__shotReady = true;
    return;
  }
  if (name === 'chase') {
    // Three stars of heat, two cruisers closing in, getaway mission live.
    const car = giveCar(g, 270, 200, Math.PI, 0x2e6fc2, 'sports');
    g.enterCar(car, { silent: true });
    car.speed = 30;
    g.wanted.addStars(3);
    g.wanted.dispatchCar({ x: car.pos.x, z: car.pos.z - 40 });
    g.wanted.dispatchCar({ x: car.pos.x + 12, z: car.pos.z - 55 });
    g.missions.startMission(2);
    runSteps(g, 200, () => autopilotDrive(car));
    g.updateCamera(STEP);
    g.render();
    window.__shotReady = true;
    return;
  }
  // mission: on foot at the marina, rivals closing in, beacon lit overhead.
  g.missions.startMission(3);
  g.missions.stepIndex = 1;
  g.missions.killsNeeded = 3;
  g.player.resetTo(ANCHORS.docks.x + 6, ANCHORS.docks.z - 6);
  g.player.camYaw = Math.atan2(ANCHORS.docks.x - g.player.x, ANCHORS.docks.z - g.player.z);
  g.combat.spawnRivals({ x: ANCHORS.docks.x, z: ANCHORS.docks.z }, 3);
  g.player.health = 100;
  runSteps(g, 120, null);
  g.updateCamera(STEP);
  g.render();
  window.__shotReady = true;
}
