// Small WebAudio synthesizer: no audio files are downloaded.
export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = false;
    this.ambient = null;
    this.bellTimer = 0;
  }

  // Must be called from a user gesture.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) {
      this.unlock();
      this.startAmbient();
    } else {
      this.stopAmbient();
    }
  }

  tone(freq, dur, { type = 'sine', gain = 0.2, attack = 0.005, delay = 0, detune = 0 } = {}) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, { gain = 0.2, freq = 1800, q = 2, delay = 0, type = 'bandpass' } = {}) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  bell(delay = 0) {
    for (const [f, g, d] of [[196, 0.16, 4.5], [392.6, 0.08, 3.5], [588, 0.05, 2.6], [1004, 0.03, 1.6]]) this.tone(f, d, { gain: g, delay, attack: 0.01 });
  }

  clack() {
    this.noise(0.06, { gain: 0.5, freq: 2400, q: 6 });
    this.tone(620, 0.12, { type: 'triangle', gain: 0.18 });
    this.noise(0.05, { gain: 0.4, freq: 2100, q: 6, delay: 0.11 });
    this.tone(540, 0.1, { type: 'triangle', gain: 0.14, delay: 0.11 });
  }

  rattle() {
    for (let i = 0; i < 8; i++) this.noise(0.04, { gain: 0.25, freq: 3000 + Math.random() * 1500, q: 4, delay: i * 0.09 });
  }

  chime() {
    this.tone(1318, 1.4, { gain: 0.09 });
    this.tone(1975, 1.0, { gain: 0.05, delay: 0.08 });
  }

  whoosh() {
    this.noise(1.2, { gain: 0.25, freq: 700, q: 0.8, type: 'lowpass' });
  }

  woodfish(delay = 0) {
    this.tone(760, 0.09, { type: 'triangle', gain: 0.22, delay });
    this.noise(0.03, { gain: 0.15, freq: 1500, q: 3, delay });
  }

  startAmbient() {
    if (!this.ctx || this.ambient) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + 3);
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(g.gain);
    const oscs = [110, 164.8, 220.5].map((f) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(g);
      o.start();
      return o;
    });
    lfo.start();
    g.connect(this.master);
    this.ambient = { g, oscs, lfo };
    this.bellTimer = setInterval(() => this.bell(), 28000);
  }

  stopAmbient() {
    if (!this.ambient) return;
    const { g, oscs, lfo } = this.ambient;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + 0.5);
    setTimeout(() => {
      oscs.forEach((o) => o.stop());
      lfo.stop();
      g.disconnect();
    }, 700);
    clearInterval(this.bellTimer);
    this.ambient = null;
  }
}
