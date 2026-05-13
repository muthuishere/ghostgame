/**
 * Audio synthesis using Web Audio API.
 *
 * No external audio files — every sound is generated in-browser. This keeps
 * the deploy tiny and avoids licensing.
 *
 * Layers:
 *   - ambient drone: continuous low rumble + slow detuned oscillators
 *   - heartbeat: bass pulse whose tempo rises with low sanity / near ghost
 *   - whispers: random pitched noise bursts with bandpass
 *   - stingers: sharp dissonant chords on jump scares
 *   - sfx: pickup ping, footsteps, door creak, gun fire
 */

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambientGain = null;
    this.heartbeatGain = null;
    this.whisperGain = null;
    this.started = false;
    this.muted = false;

    this.heartbeatRate = 1.0;       // hz
    this.heartbeatTimer = 0;
    this.whisperTimer = 5 + Math.random() * 10;
    this.intensity = 0;             // 0..1, controls scariness
  }

  /** must be called from a user gesture */
  start() {
    if (this.started) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    this._buildAmbient();
    this._buildHeartbeat();
    this._buildWhispers();
    this.started = true;
  }

  _buildAmbient() {
    // Sub drone: two detuned oscillators + slow LFO on filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.Q.value = 6;

    const o1 = this.ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 41;        // low E
    const o2 = this.ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = 41.5;      // detune
    const o3 = this.ctx.createOscillator();
    o3.type = 'sine';
    o3.frequency.value = 27.5;      // sub

    const ambGain = this.ctx.createGain();
    ambGain.gain.value = 0.0;
    this.ambientGain = ambGain;

    o1.connect(filter);
    o2.connect(filter);
    o3.connect(filter);
    filter.connect(ambGain);
    ambGain.connect(this.master);

    // LFO sweeping filter cutoff for "breathing house" feel
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 80;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    // Noise bed for hiss
    const noiseBuf = this._noiseBuffer(4);
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 800;
    noiseFilter.Q.value = 0.7;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.value = 0.04;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.master);

    o1.start(); o2.start(); o3.start(); lfo.start(); noise.start();

    // Fade in
    ambGain.gain.setValueAtTime(0, this.ctx.currentTime);
    ambGain.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 3);
  }

  _buildHeartbeat() {
    this.heartbeatGain = this.ctx.createGain();
    this.heartbeatGain.gain.value = 0;
    this.heartbeatGain.connect(this.master);
  }

  _triggerHeartbeat() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.4 * this.intensity + 0.05, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g);
    g.connect(this.heartbeatGain);
    o.start(t);
    o.stop(t + 0.3);
    // second beat
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(75, t + 0.18);
    o2.frequency.exponentialRampToValueAtTime(30, t + 0.36);
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0, t + 0.18);
    g2.gain.linearRampToValueAtTime(0.25 * this.intensity + 0.04, t + 0.2);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o2.connect(g2);
    g2.connect(this.heartbeatGain);
    o2.start(t + 0.18);
    o2.stop(t + 0.5);
    this.heartbeatGain.gain.setTargetAtTime(0.5 + this.intensity * 0.5, t, 0.5);
  }

  _buildWhispers() {
    this.whisperGain = this.ctx.createGain();
    this.whisperGain.gain.value = 0.5;
    this.whisperGain.connect(this.master);
  }

  _triggerWhisper() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 1.2 + Math.random() * 1.5;
    const noiseBuf = this._noiseBuffer(dur);
    const src = this.ctx.createBufferSource();
    src.buffer = noiseBuf;

    // modulate via lowpass that sweeps to simulate breath/whisper
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 8;
    bp.frequency.setValueAtTime(800 + Math.random() * 1400, t);
    bp.frequency.linearRampToValueAtTime(600 + Math.random() * 800, t + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18 + this.intensity * 0.2, t + 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);

    // Slight pitch shift via playbackRate
    src.playbackRate.value = 0.7 + Math.random() * 0.5;

    src.connect(bp);
    bp.connect(g);
    g.connect(this.whisperGain);
    src.start(t);
    src.stop(t + dur);
  }

  _noiseBuffer(seconds) {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * seconds, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Sharp dissonant stinger for jump scares */
  stinger() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [110, 116.5, 233, 246.9];  // dissonant cluster
    for (const n of notes) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(n * 2, t);
      o.frequency.exponentialRampToValueAtTime(n * 0.5, t + 0.9);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 1.3);
    }
    // crash noise
    const noiseBuf = this._noiseBuffer(0.6);
    const src = this.ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    src.connect(hp); hp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.6);
  }

  /** Pickup chime */
  pickup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const freqs = [523.25, 783.99];
    freqs.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.08);
      g.gain.linearRampToValueAtTime(0.12, t + 0.02 + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5 + i * 0.08);
      o.connect(g); g.connect(this.master);
      o.start(t + i * 0.08); o.stop(t + 0.6 + i * 0.08);
    });
  }

  /** Door / stair / footstep creak */
  creak() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const buf = this._noiseBuffer(0.4);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(180, t);
    bp.frequency.exponentialRampToValueAtTime(380, t + 0.35);
    bp.Q.value = 14;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.45);
  }

  footstep() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const buf = this._noiseBuffer(0.08);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 800;
    const g = this.ctx.createGain();
    g.gain.value = 0.06;
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.08);
  }

  gunshot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const buf = this._noiseBuffer(0.2);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.connect(hp); hp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.22);

    // low thump
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.4, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.22);
  }

  bombExplode() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const buf = this._noiseBuffer(1.2);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2000, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 1.25);
  }

  ghostShriek() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1200, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.8);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
    const dist = this.ctx.createWaveShaper();
    dist.curve = makeDistortionCurve(80);
    o.connect(dist); dist.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 1);
  }

  carEngine() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // sputter-then-roar
    const buf = this._noiseBuffer(3.5);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.linearRampToValueAtTime(600, t + 2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.4);
    g.gain.linearRampToValueAtTime(0.55, t + 2);
    g.gain.linearRampToValueAtTime(0, t + 3.5);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 3.6);
    // engine tone
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(60, t);
    o.frequency.linearRampToValueAtTime(140, t + 2);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(0.3, t + 0.4);
    og.gain.linearRampToValueAtTime(0, t + 3.5);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 3.6);
  }

  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
    if (this.ambientGain) {
      const target = 0.18 + this.intensity * 0.25;
      this.ambientGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.5);
    }
  }

  update(dt) {
    if (!this.ctx) return;
    this.heartbeatTimer -= dt;
    if (this.heartbeatTimer <= 0) {
      const rate = 0.7 + this.intensity * 1.8;  // 0.7 hz idle -> 2.5 hz panic
      this.heartbeatTimer = 1 / rate;
      this._triggerHeartbeat();
    }
    this.whisperTimer -= dt;
    if (this.whisperTimer <= 0) {
      this.whisperTimer = 4 + Math.random() * 8 - this.intensity * 3;
      this._triggerWhisper();
    }
  }

  toggleMute() {
    if (!this.master) return;
    this.muted = !this.muted;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }
}

function makeDistortionCurve(amount) {
  const k = amount;
  const n_samples = 1024;
  const curve = new Float32Array(n_samples);
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}
