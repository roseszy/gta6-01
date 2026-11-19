// Every sound in Solmar Heat is synthesized with WebAudio — no audio files.
// A four-chord sunset pad loops underneath, an engine hum follows the car,
// a two-tone siren wails when the cops are close, and one-shot blips and
// noise bursts cover shots, pickups, crashes and missions. Nothing starts
// until ensure() runs inside a user gesture (a menu click or a key press).
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.padBus = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.muted = false;
    this.padTimer = null;
    this.padStep = 0;
    try {
      this.muted = window.localStorage.getItem('solmar-heat.muted') === '1';
    } catch {
      // Storage can be blocked; sound still works, it just won't remember.
    }
  }

  /** Build the graph (or resume it) — call from a user gesture first. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.padBus = this.ctx.createGain();
    this.padBus.gain.value = 0.16;
    this.padBus.connect(this.master);

    // Engine: two detuned saws through a lowpass, quiet until you drive.
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const sawA = this.ctx.createOscillator();
    sawA.type = 'sawtooth';
    sawA.frequency.value = 55;
    const sawB = this.ctx.createOscillator();
    sawB.type = 'sawtooth';
    sawB.frequency.value = 55.7;
    sawA.connect(lp);
    sawB.connect(lp);
    lp.connect(this.engineGain);
    this.engineGain.connect(this.master);
    sawA.start();
    sawB.start();
    this.engineOsc = sawA;

    // Siren: a square wave that alternates between two notes.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 660;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();

    this.startPad();
  }

  setMuted(m) {
    this.muted = m;
    try {
      window.localStorage.setItem('solmar-heat.muted', m ? '1' : '0');
    } catch {
      // Ignore a storage failure; the mute still applies this session.
    }
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
    return m;
  }

  /** Sunset loop: Am – F – C – G, a soft pad and a walking bass. */
  startPad() {
    const chords = [
      [220.0, 261.6, 329.6], // Am
      [174.6, 220.0, 261.6], // F
      [261.6, 329.6, 392.0], // C
      [196.0, 246.9, 293.7], // G
    ];
    const bassNotes = [110.0, 87.3, 130.8, 98.0];
    const bar = 2.0;
    const playBar = () => {
      if (!this.ctx) return;
      const i = this.padStep % 4;
      const t = this.ctx.currentTime + 0.05;
      for (const f of chords[i]) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5, t + 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + bar);
        o.connect(g);
        g.connect(this.padBus);
        o.start(t);
        o.stop(t + bar + 0.1);
      }
      const b = this.ctx.createOscillator();
      b.type = 'sine';
      b.frequency.value = bassNotes[i];
      const bg = this.ctx.createGain();
      bg.gain.setValueAtTime(0.9, t);
      bg.gain.linearRampToValueAtTime(0.0001, t + bar);
      b.connect(bg);
      bg.connect(this.padBus);
      b.start(t);
      b.stop(t + bar + 0.1);
      this.padStep += 1;
    };
    playBar();
    this.padTimer = window.setInterval(playBar, bar * 1000);
  }

  /** Engine hum follows the car's speed (0 when on foot). */
  setEngine(speedNorm, driving) {
    if (!this.ctx || !this.engineGain) return;
    const target = driving ? 0.05 + speedNorm * 0.12 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speedNorm * 130, this.ctx.currentTime, 0.1);
  }

  /** Two-tone siren on or off. */
  setSiren(on) {
    if (!this.ctx || !this.sirenGain) return;
    const now = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, now, 0.2);
    if (on) {
      const note = Math.floor(now * 2) % 2 === 0 ? 660 : 520;
      this.sirenOsc.frequency.setTargetAtTime(note, now, 0.05);
    }
  }

  /** One short oscillator blip. */
  blip(freq, dur, type = 'sine', vol = 0.2, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** A burst of filtered noise (shots, crashes, punches). */
  noise(dur, vol, cutoff = 1200) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  shot() {
    this.noise(0.12, 0.5, 2400);
    this.blip(160, 0.1, 'square', 0.22);
  }
  enemyShot() {
    this.noise(0.1, 0.2, 1800);
  }
  punch() {
    this.noise(0.08, 0.3, 700);
  }
  pickup() {
    this.blip(880, 0.09);
    this.blip(1318, 0.12, 'sine', 0.2, 0.08);
  }
  cash() {
    this.blip(1046, 0.08);
    this.blip(1568, 0.14, 'sine', 0.2, 0.07);
  }
  click() {
    this.blip(660, 0.05, 'square', 0.12);
  }
  mission() {
    [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.16, 'triangle', 0.22, i * 0.11));
  }
  busted() {
    [392, 330, 262, 196].forEach((f, i) => this.blip(f, 0.25, 'sawtooth', 0.16, i * 0.16));
  }
  crash() {
    this.noise(0.25, 0.4, 500);
  }
  reload() {
    this.blip(440, 0.05, 'square', 0.12);
    this.blip(330, 0.05, 'square', 0.12, 0.15);
  }
}
