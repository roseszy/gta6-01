// Deterministic screenshot scenes for ?shot=start|drive|chase|mission.
// Every placement comes from the seed, so the same ?seed= gives the same
// frame. main.js renders one frame after staging and sets
// window.__shotReady = true.

import { mulberry32, rngRange } from './util.js';
import { ANCHORS } from './city.js';

// Stages one of the four scenes. g is the live game object from main.js:
// { player, vehicles, wanted, missions, combat, activities, camera, scene }.
export function stageShot(name, seed, g) {
  const rng = mulberry32(seed);
  const garage = ANCHORS.garage;
  const docks = ANCHORS.docks;

  if (name === 'start') {
    // Title view: Deke on foot outside Vera's Garage, camera looking in.
    g.player.pos.set(garage.x + 14, 0, garage.z + 20);
    g.player.yaw = Math.atan2(garage.x - g.player.pos.x, garage.z - g.player.pos.z);
    g.player.pitch = -0.04;
    g.player.onFoot = true;
    g.camera.position.set(garage.x + 20, 9, garage.z + 34);
    g.camera.lookAt(garage.x, 4, garage.z);
    return;
  }

  if (name === 'drive') {
    // Deke driving fast down a main street, traffic around him.
    const car = g.vehicles.traffic[0] || null;
    if (car) {
      g.vehicles.enterCar(car, g.player);
      const pc = g.vehicles.playerCar;
      pc.x = 243;
      pc.z = 300;
      pc.heading = 0;
      pc.speed = 30;
      pc.mesh.position.set(pc.x, 0, pc.z);
      pc.mesh.rotation.y = pc.heading;
      g.player.pos.set(pc.x, 0, pc.z);
    }
    g.camera.position.set(243, 7, 300 + 26);
    g.camera.lookAt(243, 2, 260);
    return;
  }

  if (name === 'chase') {
    // Two-star chase: Deke driving, two cruisers closing in behind.
    const car = g.vehicles.traffic[1] || g.vehicles.traffic[0];
    if (car) {
      g.vehicles.enterCar(car, g.player);
      const pc = g.vehicles.playerCar;
      pc.x = 162;
      pc.z = 216;
      pc.heading = Math.PI / 2;
      pc.speed = 26;
      pc.mesh.position.set(pc.x, 0, pc.z);
      pc.mesh.rotation.y = pc.heading;
      g.player.pos.set(pc.x, 0, pc.z);
    }
    g.wanted.setStars(2);
    g.missions.startMission(2);
    g.wanted.update(0.01, g.player, false);
    for (const c of g.wanted.cruisers) {
      c.x = g.player.pos.x - 14 - rngRange(rng, 0, 8);
      c.z = g.player.pos.z + 12 + rngRange(rng, 0, 8);
      c.heading = Math.PI / 2;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
    }
    g.camera.position.set(g.player.pos.x - 16, 8, g.player.pos.z + 20);
    g.camera.lookAt(g.player.pos.x + 10, 2, g.player.pos.z);
    return;
  }

  // 'mission': Deke on foot at the marina with rivals, beacon overhead.
  g.player.pos.set(docks.x + 10, 0, docks.z - 14);
  g.player.yaw = Math.atan2(docks.x - g.player.pos.x, docks.z - g.player.pos.z);
  g.player.onFoot = true;
  g.combat.spawnRivals(docks.x, docks.z, 3);
  g.missions.startMission(3);
  g.missions.update(0, {
    pos: { x: g.player.pos.x, z: g.player.pos.z },
    inCar: false,
    interact: false,
    wantedStars: 0,
    rivalsAlive: 3,
  });
  g.missions.updateBeacon(0);
  g.camera.position.set(docks.x + 22, 10, docks.z - 30);
  g.camera.lookAt(docks.x, 6, docks.z);
}
