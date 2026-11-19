// SOLMAR HEAT — entrypoint: renderer, game loop, wiring, save/load, menus
// and the deterministic screenshot scenes (?shot=start|drive|chase|mission
// with ?seed=N). Everything runs from static files, offline, no network.

import * as THREE from 'three';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { Player } from './player.js';
import { VehicleSystem } from './vehicles.js';
import { Pedestrians, makeHumanoid } from './pedestrians.js';
import { Wanted } from './wanted.js';
import { Combat } from './combat.js';
import { MissionManager } from './missions.js';
import { Activities } from './activities.js';
import { HUD } from './hud.js';
import { stageShot } from './shots.js';
import { buildCity, ANCHORS } from './city.js';
import { dist2, hashSeed, clamp } from './util.js';

const SAVE_KEY = 'solmar-heat-save-v1';
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedRaw = params.get('seed');
const SEED = seedRaw ? (Number.parseInt(seedRaw, 10) || hashSeed(seedRaw)) : 1337;
const SHOT_MODE = !!shotName;

// ---------------------------------------------------------------- setup
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.userData.time = 0;
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(81, 6, 140);

const city = buildCity(scene, SEED);
const input = new Input();
const audio = new AudioSys();
const player = new Player();
const vehicles = new VehicleSystem(scene, city, SEED);
const pedestrians = new Pedestrians(scene, city, SEED);
const wanted = new Wanted(scene, city);
const combat = new Combat(scene);
const missions = new MissionManager();
const activities = new Activities(scene, city, SEED);
const hud = new HUD();
missions.createBeacon(scene);

// Deke's visible body on foot (hidden while driving).
const playerMesh = makeHumanoid(0x2e86c1, 0x2b3a55);
scene.add(playerMesh);

// ---------------------------------------------------------------- state
let state = 'title'; // title | playing | paused | busted | won
let money = 0;
let clockMinutes = 14 * 60;
let time = 0;
let shotReady = false;
let interactPressed = false;
let pointerLocked = false;

const titleScreen = document.getElementById('title-screen');
const pauseScreen = document.getElementById('pause-screen');
const endScreen = document.getElementById('end-screen');
const endTitle = document.getElementById('end-title');
const endText = document.getElementById('end-text');
const btnContinue = document.getElementById('btn-continue');
const btnSound = document.getElementById('btn-sound');

function showOnly(screen) {
  titleScreen.classList.toggle('hidden', screen !== 'title');
  pauseScreen.classList.toggle('hidden', screen !== 'pause');
  endScreen.classList.toggle('hidden', screen !== 'end');
}

function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch (e) {
    return false;
  }
}

function saveGame() {
  try {
    const missionIndex = missions.state === 'between' ? missions.index + 1 : missions.index;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money,
      missionIndex,
      missionStep: missions.state === 'between' ? 0 : missions.step,
      missionComplete: missions.state === 'complete',
      pos: { x: player.pos.x, z: player.pos.z },
      health: player.health,
      clockMinutes,
    }));
  } catch (e) {
    // Storage unavailable (private mode): the game still plays.
  }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function refreshTitleButtons() {
  btnContinue.style.display = hasSave() ? '' : 'none';
}

// ---------------------------------------------------------------- missions
function applyMissionEvents(events) {
  for (const e of events) {
    if (e.type === 'intro') {
      hud.feed(e.text);
    } else if (e.type === 'setWanted') {
      wanted.setStars(e.stars);
    } else if (e.type === 'spawnRivals') {
      combat.spawnRivals(e.x, e.z, e.count);
      hud.feed(`Kade's crew is at ${e.label || 'the marina'} — watch yourself.`);
    } else if (e.type === 'payout') {
      money += e.amount;
      hud.toast(`+$${e.amount} — ${e.title}`);
      hud.feed(`Job done: ${e.title} paid $${e.amount}.`);
      audio.payout();
      saveGame();
    } else if (e.type === 'allComplete') {
      state = 'won';
      document.exitPointerLock && document.exitPointerLock();
      endTitle.textContent = 'DEBT PAID';
      endTitle.className = 'gold';
      endText.textContent = 'Five grand, paid in full. Solmar is yours now, Deke.';
      document.getElementById('btn-streets').textContent = 'KEEP DRIVING — FREE ROAM';
      showOnly('end');
      audio.setSiren(false);
      audio.setEngine(0, 0);
    }
  }
}

function startPlaying() {
  showOnly(null);
  state = 'playing';
  audio.ensure();
}

// ---------------------------------------------------------------- menus
document.getElementById('btn-new').addEventListener('click', () => {
  audio.ensure();
  audio.ui();
  money = 0;
  clockMinutes = 14 * 60;
  player.pos.set(81, 0, 126);
  player.yaw = Math.PI;
  player.health = 100;
  player.onFoot = true;
  wanted.clear();
  combat.clearRivals();
  applyMissionEvents(missions.start());
  startPlaying();
  renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock();
});

btnContinue.addEventListener('click', () => {
  audio.ensure();
  audio.ui();
  const s = loadSave();
  if (!s) return;
  money = s.money || 0;
  clockMinutes = s.clockMinutes || 14 * 60;
  player.pos.set(s.pos ? s.pos.x : 81, 0, s.pos ? s.pos.z : 126);
  player.health = s.health || 100;
  player.onFoot = true;
  wanted.clear();
  combat.clearRivals();
  if (s.missionComplete) {
    missions.index = 5;
    missions.step = 0;
    missions.state = 'complete';
  } else {
    missions.index = s.missionIndex || 0;
    missions.step = s.missionStep || 0;
    missions.state = 'active';
    applyMissionEvents(missions.enterStepEvents());
  }
  startPlaying();
  renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock();
});

btnSound.addEventListener('click', () => {
  audio.ensure();
  const muted = audio.toggleMute();
  btnSound.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
});

document.getElementById('btn-resume').addEventListener('click', () => {
  audio.ui();
  startPlaying();
  renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock();
});

document.getElementById('btn-save').addEventListener('click', () => {
  saveGame();
  hud.toast('Game saved.');
  audio.ui();
});

document.getElementById('btn-restart').addEventListener('click', () => {
  audio.ui();
  wanted.clear();
  combat.clearRivals();
  applyMissionEvents(missions.restart());
  hud.toast('Mission restarted.');
  startPlaying();
  renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock();
});

document.getElementById('btn-quit').addEventListener('click', () => {
  audio.ui();
  state = 'title';
  refreshTitleButtons();
  showOnly('title');
});

document.getElementById('btn-streets').addEventListener('click', () => {
  audio.ui();
  if (state === 'busted') {
    // Back on the streets: respawn at the hospital, heat cleared.
    player.pos.set(ANCHORS.hospital.x + 8, 0, ANCHORS.hospital.z + 8);
    player.yaw = Math.PI;
    player.healFull();
    player.onFoot = true;
    if (vehicles.playerCar) {
      const c = vehicles.playerCar;
      vehicles.traffic.push({ mesh: c.mesh, x: c.x, z: c.z, heading: c.heading, speed: 0, baseSpeed: 8, turnCooldown: 1 });
      vehicles.playerCar = null;
      player.car = null;
    }
    wanted.clear();
    combat.clearRivals();
    hud.toast('Back on the streets.');
  }
  startPlaying();
  renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock();
});

document.getElementById('btn-endquit').addEventListener('click', () => {
  audio.ui();
  state = 'title';
  refreshTitleButtons();
  showOnly('title');
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (!pointerLocked && state === 'playing' && !SHOT_MODE) {
    state = 'paused';
    showOnly('pause');
  }
});

renderer.domElement.addEventListener('click', () => {
  if (state === 'playing' && !SHOT_MODE && !pointerLocked) {
    renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- frame
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

function tick(dt) {
  time += dt;
  scene.userData.time = time;
  clockMinutes += dt * 0.5;
  interactPressed = false;

  if (!pointerLocked && !SHOT_MODE) input.consumeMouse();

  // Pause / resume with Esc (pointer lock loss also pauses, see below).
  if (input.pressed('Escape') && !SHOT_MODE) {
    if (state === 'playing') {
      state = 'paused';
      showOnly('pause');
      document.exitPointerLock && document.exitPointerLock();
    } else if (state === 'paused') {
      startPlaying();
      renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock();
    }
  }
  if (input.pressed('KeyM')) {
    const muted = audio.toggleMute();
    btnSound.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
    hud.toast(muted ? 'Sound off.' : 'Sound on.');
  }

  // Interact: steal a car, pick up a package, or get out of a car.
  if (input.pressed('KeyE')) {
    audio.ensure();
    if (!player.onFoot) {
      vehicles.exitCar(player);
    } else {
      const car = vehicles.nearestStealable(player.pos.x, player.pos.z, 4.5);
      if (car) {
        vehicles.enterCar(car, player);
        wanted.addHeat(15);
        hud.feed('You stole a car — the cops noticed.');
        audio.ui();
      } else {
        interactPressed = true;
      }
    }
  }

  // Shooting (on foot, pointer locked) and punching.
  if (player.onFoot && pointerLocked && input.clicked()) {
    audio.ensure();
    const origin = player.pos.clone();
    origin.y += 1.6;
    camera.getWorldDirection(tmpDir);
    const hit = combat.shoot(origin, tmpDir);
    audio.shoot();
    pedestrians.scare(player.pos.x, player.pos.z, 40);
    if (hit && hit.dead) hud.feed('Rival down.');
  }
  if (player.onFoot && input.pressed('KeyF')) {
    const hit = combat.punch(player.pos, player.yaw);
    audio.blip(200, 0.08, 'square', 0.12);
    pedestrians.scare(player.pos.x, player.pos.z, 20);
    if (hit && hit.dead) hud.feed('Rival down.');
  }
  if (input.pressed('KeyR')) combat.startReload();

  player.update(dt, input, city);
  vehicles.update(dt, input, player, wanted.stars);
  pedestrians.update(dt, player.pos);
  wanted.update(dt, player, !player.onFoot);
  combat.update(dt, player);

  const events = missions.update(dt, {
    pos: { x: player.pos.x, z: player.pos.z },
    inCar: !player.onFoot,
    interact: interactPressed,
    wantedStars: wanted.stars,
    rivalsAlive: combat.rivalsAlive(),
  });
  applyMissionEvents(events);

  const aEvents = activities.update(dt, { pos: { x: player.pos.x, z: player.pos.z }, inCar: !player.onFoot });
  for (const e of aEvents) {
    if (e.type === 'stash') {
      money += e.amount;
      hud.toast(`+$${e.amount} cash stash`);
      audio.pickup();
    } else if (e.type === 'farePickup') {
      hud.toast(`Passenger aboard — take them to ${e.dest} ($${e.fare})`);
      hud.feed(`Taxi fare: ${e.dest}, $${e.fare}.`);
      audio.ui();
    } else if (e.type === 'fareDelivered') {
      money += e.amount;
      hud.toast(`+$${e.amount} taxi fare`);
      audio.payout();
    }
  }

  missions.updateBeacon(dt);

  // Busted?
  if (wanted.busted) {
    state = 'busted';
    document.exitPointerLock && document.exitPointerLock();
    endTitle.textContent = 'BUSTED';
    endTitle.className = 'red';
    endText.textContent = 'The Solmar PD finally caught up with you.';
    document.getElementById('btn-streets').textContent = 'BACK ON THE STREETS';
    showOnly('end');
    audio.busted();
    audio.setSiren(false);
    audio.setEngine(0, 0);
  }

  // HUD.
  const obj = missions.objective();
  const target = missions.currentTarget();
  let distText = '';
  if (target && missions.state === 'active') {
    distText = `${Math.round(dist2(player.pos.x, player.pos.z, target.x, target.z))}m · ${target.label}`;
  }
  hud.setStars(wanted.stars);
  hud.setMoney(money);
  hud.setHealth(player.health);
  hud.setClock(clockMinutes);
  hud.setObjective(obj.title, obj.text, distText);
  hud.setSpeed(vehicles.playerMph());
  hud.setWeapon(combat.reloading ? 'RELOADING…' : `PISTOL · ${combat.ammo} / ∞`);
  hud.drawMinimap({
    anchors: ANCHORS,
    beacon: missions.state === 'active' ? target : null,
    cars: vehicles.traffic,
    cruisers: wanted.cruisers,
    playerX: player.pos.x,
    playerZ: player.pos.z,
    playerYaw: player.yaw,
  });

  // Engine + siren.
  const speed01 = vehicles.playerCar ? clamp(Math.abs(vehicles.playerCar.speed) / 42, 0, 1) : 0;
  audio.setEngine(vehicles.playerCar ? 0.6 + speed01 * 0.4 : 0, speed01);
  let nearestCop = Infinity;
  for (const c of wanted.cruisers) nearestCop = Math.min(nearestCop, dist2(player.pos.x, player.pos.z, c.x, c.z));
  audio.setSiren(wanted.stars > 0 && nearestCop < 90);

  // Player body + camera (third person).
  playerMesh.visible = player.onFoot;
  if (player.onFoot) {
    playerMesh.position.set(player.pos.x, player.pos.y, player.pos.z);
    playerMesh.rotation.y = player.yaw;
  }
  if (!SHOT_MODE) {
    const back = player.onFoot ? 6.5 : 11;
    const height = player.onFoot ? 3.2 : 4.6;
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    camPos.set(player.pos.x - fx * back, player.pos.y + height, player.pos.z - fz * back);
    camera.position.lerp(camPos, 1 - Math.exp(-8 * dt));
    camTarget.set(player.pos.x + fx * 5, player.pos.y + 1.6, player.pos.z + fz * 5);
    camera.lookAt(camTarget);
  }

  input.endFrame();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state === 'playing') tick(dt);
  renderer.render(scene, camera);
  if (SHOT_MODE && !shotReady) {
    window.__shotReady = true;
    shotReady = true;
  }
}

// ---------------------------------------------------------------- start
refreshTitleButtons();
showOnly('title');

if (SHOT_MODE) {
  // Screenshot scenes: stage the scene, hide the menus (except 'start',
  // which keeps the title screen over the garage view), and render.
  const game = { player, vehicles, wanted, missions, combat, activities, camera, scene };
  stageShot(shotName, SEED, game);
  if (shotName === 'start') {
    state = 'title';
    showOnly('title');
  } else {
    state = 'playing';
    showOnly(null);
  }
  // Keep the HUD honest for the shot scenes.
  hud.setMoney(money);
  hud.setHealth(player.health);
  hud.setStars(wanted.stars);
  const obj = missions.objective();
  const target = missions.currentTarget();
  hud.setObjective(obj.title, obj.text, target ? `${Math.round(dist2(player.pos.x, player.pos.z, target.x, target.z))}m · ${target.label}` : '');
}

animate();
