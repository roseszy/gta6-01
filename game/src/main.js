// Solmar Heat — boot and the one loop. The game moves between the title,
// play, paused and end screens; the world advances in fixed 1/60 s steps.
// ?shot=start|drive|chase|mission stages a deterministic screenshot scene
// instead of running the loop, and ?nogl=1 runs the logic with no renderer
// (for headless checks).
import * as THREE from 'three';
import { Input } from './input.js';
import { City, ANCHORS, CITY } from './city.js';
import { Player } from './player.js';
import { TrafficSystem, DriveCar } from './vehicles.js';
import { PedestrianSystem } from './pedestrians.js';
import { WantedSystem } from './wanted.js';
import { Combat } from './combat.js';
import { Activities } from './activities.js';
import { MissionManager, MISSIONS, DEBT } from './missions.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { stageShot } from './shots.js';
import { clamp, dist2, formatMoney, seededRandom } from './util.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const SAVE_KEY = 'solmar-heat-save-v1';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1337;
const noGL = params.get('nogl') === '1';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.input = new Input(this.canvas);
    this.audio = new AudioEngine();
    this.hud = new Hud();
    this.rng = seededRandom(seed);
    this.state = 'title';
    this.endKind = null;
    this.money = 0;
    this.day = 1;
    this.clockMinutes = 840; // 14:00, golden afternoon
    this.currentCar = null;
    this.looseCars = [];
    this.parkedCars = [];
    this.camOrbit = 0;
    this.cineAngle = 0;
    this.shootCrimeCooldown = 0;
    this.trafficHitCooldown = 0;
    this.faresDone = 0;
    this.shotMode = false;
    this.webglOK = true;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xbfd9e8, 260, 950);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
    this.camera.position.set(243, 90, 120);
    this.setupSkyAndLights();

    this.city = new City(this.scene, seed);
    this.player = new Player(this.scene);
    this.traffic = new TrafficSystem(this.scene, this.city, seededRandom(seed + 11));
    this.peds = new PedestrianSystem(this.scene, this.city, seed + 23);
    this.wanted = new WantedSystem(this.scene, this.city, seededRandom(seed + 37));
    this.combat = new Combat(this.scene, seededRandom(seed + 51));
    this.activities = new Activities(this.scene, this.city, seededRandom(seed + 67));
    this.missions = new MissionManager(this.scene);
    this.parkedCars = this.traffic.spawnParked(this.scene, seededRandom(seed + 83), 8);

    this.traffic.spawn(16);
    this.peds.spawn(26);
    this.wireEvents();
    this.bindMenus();
    this.setupRenderer();
    window.addEventListener('resize', () => this.resize());
  }

  // ---------- sky and light ----------
  setupSkyAndLights() {
    // Gradient sky dome: warm at the horizon, blue above.
    const skyGeo = new THREE.SphereGeometry(1200, 24, 12);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x3f8fd2) },
        mid: { value: new THREE.Color(0x9fd0e8) },
        low: { value: new THREE.Color(0xffd9a0) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low;'
        + ' void main(){ float h = normalize(vP).y;'
        + ' vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.8, h)) : mix(low, mid, smoothstep(-0.05, 0.25, h));'
        + ' gl_FragColor = vec4(c, 1.0); }',
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffe0b3, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -280;
    this.sun.shadow.camera.right = 280;
    this.sun.shadow.camera.top = 280;
    this.sun.shadow.camera.bottom = -280;
    this.sun.shadow.camera.far = 900;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9));
    this.updateSun();
  }

  /** The sun arcs across the sky as the in-game clock moves. */
  updateSun() {
    const t = clamp((this.clockMinutes - 360) / 720, 0, 1);
    const el = THREE.MathUtils.degToRad(15 + Math.sin(t * Math.PI) * 47);
    const az = THREE.MathUtils.degToRad(100 + t * 160);
    const r = 600;
    this.sun.position.set(
      CITY / 2 + Math.cos(el) * Math.sin(az) * r,
      Math.sin(el) * r,
      CITY / 2 + Math.cos(el) * Math.cos(az) * r,
    );
    this.sun.target.position.set(CITY / 2, 0, CITY / 2);
  }

  setupRenderer() {
    if (noGL) {
      this.renderer = null;
      return;
    }
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    } catch {
      this.webglOK = false;
      this.renderer = null;
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.resize();
  }

  resize() {
    if (!this.renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    if (this.renderer) this.renderer.render(this.scene, this.camera);
  }

  // ---------- events ----------
  wireEvents() {
    this.missions.onEvent = (type, p) => {
      if (type === 'mission-start') {
        this.hud.feed(p.intro);
        this.hud.toast(`MISSION ${p.id} — ${p.title}`, `Reward ${formatMoney(p.reward)}`);
        this.audio.mission();
      } else if (type === 'mission-complete') {
        this.money += p.reward;
        this.audio.mission();
        const earned = MISSIONS.slice(0, this.missions.index + 1).reduce((a, m) => a + m.reward, 0);
        const left = Math.max(0, DEBT - earned);
        this.hud.toast('MISSION COMPLETE', `+${formatMoney(p.reward)}  ·  Debt left: ${formatMoney(left)}`);
        this.hud.feed(`Mission complete: ${p.title} (+${formatMoney(p.reward)}). Debt left: ${formatMoney(left)}.`);
        this.save();
        if (this.missions.index >= MISSIONS.length - 1) {
          this.missions.finishAll();
          this.hud.toast('DEBT PAID — SOLMAR IS YOURS', 'Free roam: collect cash, run taxi fares, stay fast.');
          this.hud.feed('Vera: "We\'re square, Deke. Solmar is yours now."');
        } else {
          this.missions.startMission(this.missions.index + 1);
        }
      } else if (type === 'set-wanted') {
        if (this.wanted.stars < p) this.wanted.addStars(p - this.wanted.stars);
      } else if (type === 'spawn-rivals') {
        const marker = this.missions.markerPos || ANCHORS.docks;
        this.combat.spawnRivals(marker, p);
        this.hud.feed(`Kade's crew is here — ${p} rivals. Take them out!`);
      } else if (type === 'pickup') {
        this.audio.pickup();
      } else if (type === 'kill-progress') {
        this.hud.feed(`Rivals down: ${p.done}/${p.needed}`);
      } else if (type === 'step') {
        this.hud.feed(p.text);
      }
    };
    this.combat.onEvent = (type, p) => {
      if (type === 'shot') {
        this.audio.shot();
        if (this.shootCrimeCooldown <= 0 && this.wanted.policeCars.length > 0) {
          this.wanted.addStars(1);
          this.shootCrimeCooldown = 4;
        }
      } else if (type === 'enemy-shot') {
        this.audio.enemyShot();
        if (p.hit && this.player.damage(p.damage) && this.player.health <= 0) {
          this.endGame('wasted');
        }
      } else if (type === 'enemy-down') {
        this.missions.onKill();
        this.money += 50;
        this.hud.feed('Rival down. +$50 off the body.');
      } else if (type === 'ped-hit') {
        this.wanted.addStars(1);
        this.hud.feed('You hit a pedestrian! The cops were called.');
      } else if (type === 'punch') {
        this.audio.punch();
      } else if (type === 'reload') {
        this.audio.reload();
      }
    };
    this.activities.onEvent = (type, p) => {
      if (type === 'cash') {
        this.money += p.value;
        this.audio.cash();
        this.hud.feed(`Found cash: +${formatMoney(p.value)}`);
      } else if (type === 'fare-waiting') {
        this.hud.feed('A passenger is waiting at the taxi stand by the Solmar Grand.');
      } else if (type === 'fare-start') {
        this.hud.toast('FARE STARTED', `Drive them there in ${Math.round(p.timer)}s — ${formatMoney(p.payout)}`);
      } else if (type === 'fare-done') {
        this.money += p.payout;
        this.faresDone += 1;
        this.audio.cash();
        this.hud.feed(`Fare complete: +${formatMoney(p.payout)}`);
      } else if (type === 'fare-fail') {
        this.hud.feed('Fare failed — the passenger got out and walked off.');
      }
    };
  }

  // ---------- menus and state ----------
  setState(s) {
    this.state = s;
    document.getElementById('menu-title').classList.toggle('hidden', s !== 'title');
    document.getElementById('menu-pause').classList.toggle('hidden', s !== 'paused');
    document.getElementById('menu-end').classList.toggle('hidden', s !== 'end');
    if (s === 'playing') {
      this.hud.show();
      this.audio.ensure();
    } else {
      this.hud.hide();
    }
  }

  bindMenus() {
    const $ = (id) => document.getElementById(id);
    $('btn-new').addEventListener('click', () => {
      this.audio.ensure();
      this.audio.click();
      this.newGame();
    });
    $('btn-continue').addEventListener('click', () => {
      this.audio.ensure();
      this.audio.click();
      this.continueGame();
    });
    $('btn-sound').addEventListener('click', (e) => {
      const m = this.audio.setMuted(!this.audio.muted);
      e.target.textContent = m ? 'SOUND: OFF' : 'SOUND: ON';
    });
    $('btn-resume').addEventListener('click', () => this.setState('playing'));
    $('btn-save').addEventListener('click', () => {
      this.save();
      this.hud.feed('Game saved.');
    });
    $('btn-restart-mission').addEventListener('click', () => {
      this.missions.restart();
      this.wanted.clear();
      this.player.resetTo(ANCHORS.garage.x, ANCHORS.garage.z + 3);
      this.setState('playing');
    });
    $('btn-quit').addEventListener('click', () => {
      this.save();
      this.setState('title');
    });
    $('btn-end-resume').addEventListener('click', () => this.setState('playing'));
    $('btn-end-quit').addEventListener('click', () => {
      this.save();
      this.setState('title');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.setState('paused');
    });
    if (!this.hasSave()) $('btn-continue').style.opacity = '0.4';
  }

  hasSave() {
    try {
      return !!window.localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  newGame() {
    this.money = 0;
    this.day = 1;
    this.clockMinutes = 840;
    this.wanted.clear();
    this.player.resetTo(ANCHORS.garage.x, ANCHORS.garage.z + 3);
    this.player.camYaw = Math.PI;
    this.exitCar(true);
    this.missions.startMission(0);
    this.setState('playing');
    this.hud.feed('Vera: "Deke, you owe me five grand. Start simple — take any car and bring it to my garage."');
  }

  continueGame() {
    if (!this.load()) {
      this.newGame();
      return;
    }
    this.setState('playing');
  }

  /** Enter play from a menu or a screenshot scene (audio optional). */
  beginPlay(opts = {}) {
    if (!opts.silent) this.audio.ensure();
    this.setState('playing');
  }

  /** Screenshot scenes run the world without the title screen. */
  startShotMode() {
    this.shotMode = true;
    this.setState('playing');
  }

  endGame(kind) {
    this.endKind = kind;
    const title = document.getElementById('end-title');
    const text = document.getElementById('end-text');
    if (kind === 'busted') {
      const loss = Math.floor(this.money * 0.1);
      this.money -= loss;
      title.textContent = 'BUSTED';
      title.className = 'big-msg red';
      text.textContent = `The Solmar PD hauled you in. Bail cost you ${formatMoney(loss)}. You wake up outside Central — the city is still yours to take.`;
      this.wanted.clear();
      this.exitCar(true);
      this.player.resetTo(ANCHORS.police.x, ANCHORS.police.z + 3);
      this.audio.busted();
    } else {
      const loss = Math.floor(this.money * 0.15);
      this.money -= loss;
      title.textContent = 'WASTED';
      title.className = 'big-msg red';
      text.textContent = `You flatlined on a Solmar street. The medics patched you up — minus ${formatMoney(loss)} in hospital bills.`;
      this.wanted.clear();
      this.exitCar(true);
      this.player.resetTo(ANCHORS.hospital.x, ANCHORS.hospital.z + 3);
      this.audio.busted();
    }
    this.player.health = this.player.maxHealth;
    this.save();
    this.setState('end');
  }

  save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1,
        money: this.money,
        day: this.day,
        clock: this.clockMinutes,
        mission: this.missions.done ? MISSIONS.length : this.missions.index,
        cashTaken: this.activities.cash.map((c) => c.taken),
        collected: this.activities.collected,
        fares: this.faresDone,
        px: this.player.x,
        pz: this.player.z,
        health: this.player.health,
      }));
    } catch {
      // Storage unavailable — the session still plays, it just won't save.
    }
  }

  load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      this.money = s.money || 0;
      this.day = s.day || 1;
      this.clockMinutes = s.clock || 840;
      this.faresDone = s.fares || 0;
      this.player.resetTo(s.px ?? ANCHORS.garage.x, s.pz ?? ANCHORS.garage.z + 3);
      this.player.health = s.health ?? 100;
      this.activities.cash.forEach((c, i) => {
        if (s.cashTaken && s.cashTaken[i]) {
          c.taken = true;
          c.group.visible = false;
        }
      });
      this.activities.collected = s.collected || 0;
      const mi = Math.min(s.mission ?? 0, MISSIONS.length - 1);
      if ((s.mission ?? 0) >= MISSIONS.length) this.missions.finishAll();
      else this.missions.startMission(mi);
      this.updateSun();
      return true;
    } catch {
      return false;
    }
  }

  // ---------- cars ----------
  enterCar(car, opts = {}) {
    this.currentCar = car;
    car.occupied = true;
    this.player.mesh.visible = false;
    this.camOrbit = 0;
    if (!opts.silent) {
      this.audio.click();
      this.missions.onEnterCar();
    }
  }

  exitCar(silent) {
    if (!this.currentCar) return;
    const car = this.currentCar;
    car.occupied = false;
    this.currentCar = null;
    this.player.mesh.visible = true;
    // Step out beside the car.
    const a = car.yaw + Math.PI / 2;
    this.player.resetTo(car.pos.x + Math.sin(a) * 2.4, car.pos.z + Math.cos(a) * 2.4);
    this.player.camYaw = car.yaw;
    if (!silent) this.audio.click();
  }

  /** E near a car: parked and loose cars are free, traffic cars are a crime. */
  tryEnterCar() {
    const px = this.player.x;
    const pz = this.player.z;
    for (const car of [...this.parkedCars, ...this.looseCars]) {
      if (dist2(px, pz, car.pos.x, car.pos.z) < 4.5) {
        this.enterCar(car);
        return;
      }
    }
    const t = this.traffic.nearest(px, pz, 4.5);
    if (t) {
      this.traffic.remove(t);
      const drive = new DriveCar(t.mesh);
      drive.yaw = t.mesh.rotation.y;
      drive.stolen = true;
      this.looseCars.push(drive);
      this.enterCar(drive);
      this.wanted.addStars(1);
      this.hud.feed('You jacked a car! The cops are on their way.');
    }
  }

  // ---------- per-frame ----------
  update(dt, override) {
    const input = this.input;
    const playing = this.state === 'playing';
    // The clock always ticks while playing.
    if (playing) {
      this.clockMinutes += dt * 0.5;
      if (this.clockMinutes >= 1440) {
        this.clockMinutes -= 1440;
        this.day += 1;
        this.updateSun();
      }
      this.shootCrimeCooldown = Math.max(0, this.shootCrimeCooldown - dt);
      this.trafficHitCooldown = Math.max(0, this.trafficHitCooldown - dt);
    }

    // World life goes on even on the title screen.
    const playerPos = { x: this.player.x, z: this.player.z };
    const danger = this.currentCar
      ? [{ x: this.currentCar.pos.x, z: this.currentCar.pos.z, speed: this.currentCar.speed }]
      : [{ x: this.player.x, z: this.player.z, speed: this.player.speed }];
    this.traffic.step(dt);
    this.peds.step(dt, danger);
    this.slowTrafficForPlayer();
    this.combat.step(dt, playerPos);

    if (!playing) {
      input.endFrame();
      this.wanted.step(dt, this.player, null);
      return;
    }
    this.activities.step(
      dt,
      this.currentCar ? { x: this.currentCar.pos.x, z: this.currentCar.pos.z } : playerPos,
      !!this.currentCar,
    );

    const axes = input.moveAxes();
    const look = input.takeLook();
    const running = input.down('ShiftLeft') || input.down('ShiftRight');

    // Pause.
    if (input.hit('Escape') || input.hit('KeyP')) {
      this.setState('paused');
      input.endFrame();
      return;
    }
    // Mute.
    if (input.hit('KeyM')) {
      const m = this.audio.setMuted(!this.audio.muted);
      document.getElementById('btn-sound').textContent = m ? 'SOUND: OFF' : 'SOUND: ON';
    }

    if (this.currentCar) {
      const carInput = override && override.carInput
        ? override.carInput
        : { throttle: axes.y, steer: axes.x, handbrake: input.down('Space') };
      const others = [...this.looseCars, ...this.wanted.policeCars];
      for (const t of this.traffic.cars) {
        others.push({ pos: t.mesh.position, speed: t.speed });
      }
      const prevSpeed = this.currentCar.speed;
      this.currentCar.step(dt, carInput.throttle, carInput.steer, carInput.handbrake, this.city, others);
      this.camOrbit = clamp(this.camOrbit - look.dx * 0.0028, -1.1, 1.1);
      this.camOrbit *= Math.max(0, 1 - dt * 1.4);
      // A hard impact wrecks the car a little.
      if (prevSpeed > 14 && Math.abs(this.currentCar.speed) < prevSpeed * 0.4) {
        this.currentCar.health -= 12;
        this.audio.crash();
      }
      if (this.currentCar.health <= 0) {
        const wreck = this.currentCar;
        this.exitCar(true);
        this.scene.remove(wreck.mesh);
        const i = this.looseCars.indexOf(wreck);
        if (i >= 0) this.looseCars.splice(i, 1);
        this.hud.toast('YOUR RIDE IS WRECKED', 'Find another car.');
        this.hud.feed('Your car is wrecked.');
      }
      // Running over a pedestrian is a crime.
      if (Math.abs(this.currentCar.speed) > 6 && this.trafficHitCooldown <= 0) {
        const ped = this.peds.nearest(this.currentCar.pos.x, this.currentCar.pos.z, 2.4);
        if (ped) {
          this.peds.remove(ped);
          this.wanted.addStars(1);
          this.currentCar.speed *= 0.7;
          this.audio.crash();
          this.trafficHitCooldown = 1.5;
          this.hud.feed('You ran someone over! The cops are on their way.');
        }
      }
      if (input.hit('KeyE') && Math.abs(this.currentCar.speed) < 3) this.exitCar(false);
    } else {
      this.player.step(dt, axes, look, running, input.hit('Space'), this.city);
      if (input.hit('KeyE')) {
        const s = this.missions.step;
        const marker = this.missions.markerPos;
        if (s && s.type === 'pickup' && marker && dist2(this.player.x, this.player.z, marker.x, marker.z) < (s.radius || 5) + 2) {
          this.missions.onPickup();
        } else {
          this.tryEnterCar();
        }
      }
      if (input.takeClick() && !this.shotMode) {
        const hit = this.combat.shoot(this.camera);
        if (hit && hit.kind === 'enemy') this.hud.feed('Hit!');
      }
      if (input.hit('KeyF')) this.combat.punch(this.player, this.peds.peds);
      if (input.hit('KeyR')) this.combat.reload();
      // Traffic can run the player down.
      for (const t of this.traffic.cars) {
        if (dist2(this.player.x, this.player.z, t.mesh.position.x, t.mesh.position.z) < 2.2 && t.speed > 5) {
          if (this.player.damage(15)) {
            this.audio.crash();
            if (this.player.health <= 0) this.endGame('wasted');
          }
        }
      }
    }

    // Health slowly recovers when there is no heat and no fight.
    if (this.wanted.stars === 0 && this.combat.enemies.length === 0) {
      this.player.heal(dt * 2);
    }

    this.missions.update(dt, { player: this.player, car: this.currentCar, wantedStars: this.wanted.stars });
    this.wanted.step(dt, this.player, this.currentCar);
    if (this.wanted.busted) this.endGame('busted');

    // Audio follows the world.
    const speedNorm = this.currentCar ? clamp(Math.abs(this.currentCar.speed) / 42, 0, 1) : 0;
    this.audio.setEngine(speedNorm, !!this.currentCar);
    let nearestPolice = Infinity;
    for (const c of this.wanted.policeCars) {
      nearestPolice = Math.min(nearestPolice, dist2(this.player.x, this.player.z, c.pos.x, c.pos.z));
    }
    this.audio.setSiren(this.wanted.stars > 0 && nearestPolice < 90);

    this.updateHud(dt);
    input.endFrame();
  }

  /** Traffic slows for the player standing in the road. */
  slowTrafficForPlayer() {
    if (this.currentCar) return;
    for (const t of this.traffic.cars) {
      const dx = this.player.x - t.mesh.position.x;
      const dz = this.player.z - t.mesh.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 8) {
        const ahead = Math.sin(t.mesh.rotation.y) * dx + Math.cos(t.mesh.rotation.y) * dz;
        if (ahead > 0) t.speed = Math.min(t.speed, 2.5);
      }
    }
  }

  /** Build the HUD state for this frame. */
  updateHud(dt) {
    const marker = this.missions.markerPos;
    const s = {
      stars: this.wanted.stars,
      money: this.money,
      health: this.player.health,
      clockMinutes: this.clockMinutes,
      day: this.day,
      objective: this.missions.objectiveText(),
      objectiveDist: marker ? this.missions.markerDistance({ player: this.player, car: this.currentCar }) + ' m' : '',
      inCar: !!this.currentCar,
      speed: this.currentCar ? this.currentCar.speed : 0,
      ammo: this.combat.ammo,
      aiming: !this.currentCar,
      playerX: this.currentCar ? this.currentCar.pos.x : this.player.x,
      playerZ: this.currentCar ? this.currentCar.pos.z : this.player.z,
      playerYaw: this.currentCar ? this.currentCar.yaw : this.player.yaw,
      marker,
      cash: this.activities.cash.filter((c) => !c.taken),
      fareWaiting: this.activities.fare && this.activities.fare.state === 'waiting' ? this.activities.fare : null,
      traffic: this.traffic.cars.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
      police: this.wanted.policeCars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
    };
    this.hud.update(dt, s);
  }

  /** Chase camera behind the car, or the player's third-person camera. */
  updateCamera(dt) {
    if (this.state === 'title') {
      this.cinematicCamera(dt);
      return;
    }
    if (this.currentCar) {
      const car = this.currentCar;
      const yaw = car.yaw + this.camOrbit;
      const tx = car.pos.x - Math.sin(yaw) * 11;
      const tz = car.pos.z - Math.cos(yaw) * 11;
      const ty = 4.6;
      this.camera.position.x += (tx - this.camera.position.x) * Math.min(1, dt * 6);
      this.camera.position.y += (ty - this.camera.position.y) * Math.min(1, dt * 6);
      this.camera.position.z += (tz - this.camera.position.z) * Math.min(1, dt * 6);
      this.camera.lookAt(car.pos.x + Math.sin(car.yaw) * 7, 1.6, car.pos.z + Math.cos(car.yaw) * 7);
    } else {
      this.player.cameraTarget(this.camera, dt);
    }
  }

  /** Slow orbit over the city for the title screen. */
  cinematicCamera(dt = 0) {
    this.cineAngle += dt * 0.02;
    const r = 250;
    const cx = CITY / 2 + Math.cos(this.cineAngle) * r;
    const cz = CITY / 2 + Math.sin(this.cineAngle) * r;
    this.camera.position.set(cx, 95, cz);
    this.camera.lookAt(CITY / 2, 10, CITY / 2 + 60);
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    if (!this.lastT) this.lastT = now;
    let acc = Math.min((now - this.lastT) / 1000, MAX_FRAME);
    this.lastT = now;
    while (acc >= STEP) {
      this.update(STEP, null);
      acc -= STEP;
    }
    this.updateCamera(STEP);
    this.render();
  }

  start() {
    if (shotName) {
      document.getElementById('loading').remove();
      stageShot(shotName, this);
      return;
    }
    this.setState('title');
    if (!this.webglOK) {
      const loading = document.getElementById('loading');
      loading.textContent = 'WebGL is unavailable in this browser — Solmar Heat needs it to render the city.';
      loading.style.display = 'flex';
      return;
    }
    document.getElementById('loading').remove();
    requestAnimationFrame((t) => this.frame(t));
  }
}

const game = new Game();
window.__game = game;
game.start();
