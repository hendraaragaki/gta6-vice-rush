// Solmar Bay — all sound is synthesized with WebAudio. No audio files, no network.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.radioOn = false;
    this.radioTimer = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenPhase = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  _noiseBuffer(seconds = 1) {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  _noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur + 0.1);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  gunshot() { this._noise(0.16, 0.5, 2600); this._tone(160, 0.1, 'square', 0.22, 60); }
  enemyShot() { this._noise(0.12, 0.25, 1800); }
  pickup() { this._tone(660, 0.09, 'sine', 0.3); setTimeout(() => this._tone(990, 0.12, 'sine', 0.3), 90); }
  cash() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.14, 'triangle', 0.28), i * 80));
  }
  missionDone() {
    [392, 523, 659, 784].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 'triangle', 0.3), i * 110));
  }
  busted() { this._tone(220, 0.5, 'sawtooth', 0.25, 110); this._tone(110, 0.7, 'square', 0.18, 55); }
  crash() { this._noise(0.3, 0.45, 700); }
  door() { this._tone(300, 0.06, 'square', 0.15, 180); }
  phone() { this._tone(880, 0.12, 'sine', 0.25); setTimeout(() => this._tone(880, 0.12, 'sine', 0.25), 180); }
  click() { this._tone(700, 0.05, 'square', 0.12); }
  heal() { this._tone(440, 0.2, 'sine', 0.2, 880); }

  // Continuous car engine hum; call with speed 0..1, or null to stop.
  engine(speed) {
    if (!this.ctx) return;
    if (speed === null) {
      if (this.engineOsc) { try { this.engineOsc.stop(); } catch (e) { /* already stopped */ } this.engineOsc = null; }
      return;
    }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineGain.gain.value = 0.0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 420;
      this.engineOsc.connect(filter); filter.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + speed * 130, t, 0.08);
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.05 + speed * 0.06, t, 0.08);
  }

  // Police siren while any cop is near; call every frame with true/false.
  siren(on) {
    if (!this.ctx) return;
    if (!on) {
      if (this.sirenOsc) { try { this.sirenOsc.stop(); } catch (e) { /* already stopped */ } this.sirenOsc = null; }
      return;
    }
    if (!this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenOsc.type = 'triangle';
      this.sirenGain.gain.value = this.muted ? 0 : 0.05;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenPhase = 0;
    }
    this.sirenPhase += 0.09;
    this.sirenOsc.frequency.value = 700 + Math.sin(this.sirenPhase) * 220;
  }

  // Tiny procedural "radio": a sunny synth-pop loop while driving. Toggle with R.
  toggleRadio() {
    this.radioOn = !this.radioOn;
    if (!this.radioOn) { if (this.radioTimer) clearInterval(this.radioTimer); this.radioTimer = null; return this.radioOn; }
    this.ensure();
    if (!this.ctx) { this.radioOn = false; return false; }
    const bass = [110, 110, 130.8, 98, 110, 110, 146.8, 164.8];
    const lead = [440, 523, 659, 523, 587, 659, 784, 659];
    let step = 0;
    this.radioTimer = setInterval(() => {
      if (this.muted) { step++; return; }
      const i = step % 8;
      this._tone(bass[i], 0.22, 'triangle', 0.16);
      if (step % 2 === 0) this._tone(lead[i], 0.18, 'square', 0.05);
      if (step % 4 === 2) this._noise(0.05, 0.06, 5000);
      step++;
    }, 240);
    return this.radioOn;
  }
}
