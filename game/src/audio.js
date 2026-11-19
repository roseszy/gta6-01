// All sound is synthesized with WebAudio: a two-chord sunset pad and bass
// line for music, an engine hum that follows speed, a two-tone siren when
// the cops are close, and one-shot effects for shots, pickups and missions.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    try {
      this.muted = window.localStorage.getItem('solmar-heat.muted') === '1';
    } catch { /* storage unavailable */ }
  }

  /** Must be called from a user gesture at least once. */
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
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    // Engine hum: two detuned saws through a lowpass.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineOsc2 = this.ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 55.7;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp);
    engineOsc2.connect(lp);
    lp.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    engineOsc2.start();
    // Police siren: a square that alternates between two notes.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 660;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    try { window.localStorage.setItem('solmar-heat.muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
    return m;
  }

  /** Sunset progression: Am – F – C – G, pad plus a walking bass. */
  startMusic() {
    const chords = [
      [220.0, 261.6, 329.6], // Am
      [174.6, 220.0, 261.6], // F
      [261.6, 329.6, 392.0], // C
      [196.0, 246.9, 293.7], // G
    ];
    const bass = [110.0, 87.3, 130.8, 98.0];
    const stepDur = 2.0;
    const playStep = () => {
      if (!this.ctx) return;
      const i = this.musicStep % 4;
      const t = this.ctx.currentTime + 0.05;
      for (const f of chords[i]) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5, t + 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + stepDur);
        o.connect(g); g.connect(this.musicGain);
        o.start(t); o.stop(t + stepDur + 0.1);
      }
      const b = this.ctx.createOscillator();
      b.type = 'sine';
      b.frequency.value = bass[i];
      const bg = this.ctx.createGain();
      bg.gain.setValueAtTime(0.9, t);
      bg.gain.linearRampToValueAtTime(0.0001, t + stepDur);
      b.connect(bg); bg.connect(this.musicGain);
      b.start(t); b.stop(t + stepDur + 0.1);
      this.musicStep += 1;
    };
    playStep();
    this.musicTimer = window.setInterval(playStep, stepDur * 1000);
  }

  setEngine(speedNorm, driving) {
    if (!this.ctx || !this.engineGain) return;
    const target = driving ? 0.05 + speedNorm * 0.12 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    const f = 50 + speedNorm * 130;
    this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.1);
  }

  setSiren(on) {
    if (!this.ctx || !this.sirenGain) return;
    const now = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, now, 0.2);
    if (on) {
      const alt = Math.floor(now * 2) % 2 === 0 ? 660 : 520;
      this.sirenOsc.frequency.setTargetAtTime(alt, now, 0.05);
    }
  }

  blip(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, vol, freq = 1200) {
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
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  shot() { this.noise(0.12, 0.5, 2400); this.blip(160, 0.1, 'square', 0.22); }
  enemyShot() { this.noise(0.1, 0.2, 1800); }
  punch() { this.noise(0.08, 0.3, 700); }
  pickup() { this.blip(880, 0.09); this.blip(1318, 0.12, 'sine', 0.2, 0.08); }
  cash() { this.blip(1046, 0.08); this.blip(1568, 0.14, 'sine', 0.2, 0.07); }
  click() { this.blip(660, 0.05, 'square', 0.12); }
  mission() {
    [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.16, 'triangle', 0.22, i * 0.11));
  }
  busted() {
    [392, 330, 262, 196].forEach((f, i) => this.blip(f, 0.25, 'sawtooth', 0.16, i * 0.16));
  }
  crash() { this.noise(0.25, 0.4, 500); }
  reload() { this.blip(440, 0.05, 'square', 0.12); this.blip(330, 0.05, 'square', 0.12, 0.15); }
}
