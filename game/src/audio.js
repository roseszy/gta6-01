// Synthesized sound only: WebAudio oscillators and noise, no audio files.
// The context is created lazily on the first user gesture so browsers allow it.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.sirenHigh = false;
  }

  // Call from a user gesture (click / keypress). Safe to call repeatedly.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);

    // Engine hum: a sawtooth through a lowpass, pitch and level follow speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();

    // Police siren: a square wave that alternates between two tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // level 0..1 (how loud), speed 0..1 (how high the pitch).
  setEngine(level, speed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(level * 0.12, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speed * 140, t, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (on && !this.sirenTimer) {
      this.sirenGain.gain.setTargetAtTime(0.05, t, 0.1);
      this.sirenTimer = setInterval(() => {
        this.sirenHigh = !this.sirenHigh;
        if (this.sirenOsc) this.sirenOsc.frequency.value = this.sirenHigh ? 950 : 700;
      }, 380);
    } else if (!on && this.sirenTimer) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
      this.sirenGain.gain.setTargetAtTime(0, t, 0.1);
    }
  }

  blip(freq, dur, type, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq || 880;
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.08));
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + (dur || 0.08) + 0.02);
  }

  shoot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.09);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.35;
    src.connect(g);
    g.connect(this.master);
    src.start(t);
    this.blip(160, 0.07, 'square', 0.12);
  }

  pickup() {
    this.blip(660, 0.07, 'sine', 0.15);
    setTimeout(() => this.blip(990, 0.1, 'sine', 0.15), 70);
  }

  payout() {
    this.blip(523, 0.09, 'sine', 0.16);
    setTimeout(() => this.blip(659, 0.09, 'sine', 0.16), 90);
    setTimeout(() => this.blip(784, 0.14, 'sine', 0.16), 180);
  }

  ui() {
    this.blip(440, 0.05, 'sine', 0.1);
  }

  busted() {
    this.blip(220, 0.3, 'sawtooth', 0.18);
    setTimeout(() => this.blip(165, 0.4, 'sawtooth', 0.18), 220);
  }
}
