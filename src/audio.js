const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambientBus = null;
    this.fxBus = null;
    this.volume = { master: 0.8, ambient: 0.7, fx: 0.85 };
    this.started = false;
    this.scene = "menu";
    this.timers = new Set();
    this.ambientNodes = [];
    this.chaseMode = false;
    this.lastStep = 0;
    this.noiseBuffer = null;
  }

  get available() {
    return Boolean(this.ctx);
  }

  async init() {
    if (this.started) {
      if (this.ctx?.state === "suspended") await this.ctx.resume().catch(() => {});
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      this.ctx = new AudioContextClass();
      this.master = this.ctx.createGain();
      this.ambientBus = this.ctx.createGain();
      this.fxBus = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.ambientBus.connect(this.master);
      this.fxBus.connect(this.master);
      this.noiseBuffer = this.createNoiseBuffer(2.5);
      this.applyVolumes();
      this.started = true;
      if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => {});
      this.startHospitalAmbience();
      this.scheduleDrip();
    } catch {
      this.ctx = null;
    }
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volume.master;
    this.ambientBus.gain.value = this.volume.ambient;
    this.fxBus.gain.value = this.volume.fx;
  }

  setVolume(name, value) {
    if (!(name in this.volume)) return;
    this.volume[name] = clamp(Number(value) || 0, 0, 1);
    this.applyVolumes();
  }

  createNoiseBuffer(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = 0.97 * last + 0.03 * white;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  noiseSource(loop = false) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = loop;
    return source;
  }

  startHospitalAmbience() {
    if (!this.ctx || this.scene === "bedroom") return;
    this.stopAmbient();
    const now = this.ctx.currentTime;

    const humGain = this.ctx.createGain();
    humGain.gain.value = 0.042;
    humGain.connect(this.ambientBus);

    const hum = this.ctx.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 49.5;
    const hum2 = this.ctx.createOscillator();
    hum2.type = "triangle";
    hum2.frequency.value = 99;
    const humFilter = this.ctx.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 180;
    hum.connect(humFilter);
    hum2.connect(humFilter);
    humFilter.connect(humGain);
    hum.start();
    hum2.start();

    const air = this.noiseSource(true);
    const airFilter = this.ctx.createBiquadFilter();
    airFilter.type = "bandpass";
    airFilter.frequency.value = 420;
    airFilter.Q.value = 0.6;
    const airGain = this.ctx.createGain();
    airGain.gain.value = 0.05;
    air.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(this.ambientBus);
    air.start();

    const rumble = this.ctx.createOscillator();
    rumble.type = "sine";
    rumble.frequency.value = 28;
    const rumbleGain = this.ctx.createGain();
    rumbleGain.gain.value = 0.02;
    rumble.connect(rumbleGain);
    rumbleGain.connect(this.ambientBus);
    rumble.start();

    this.ambientNodes = [hum, hum2, air, rumble, humGain, airGain, rumbleGain, humFilter, airFilter];
    this.scene = "hospital";
    this.chaseMode = false;
    this.setChasePressure(false);
    void now;
  }

  startBedroomAmbience() {
    if (!this.ctx) return;
    this.stopAmbient();
    const now = this.ctx.currentTime;
    const pad = this.ctx.createOscillator();
    pad.type = "sine";
    pad.frequency.value = 146.83;
    const pad2 = this.ctx.createOscillator();
    pad2.type = "sine";
    pad2.frequency.value = 220;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.022, now + 3);
    pad.connect(filter);
    pad2.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientBus);
    pad.start();
    pad2.start();

    const room = this.noiseSource(true);
    const roomFilter = this.ctx.createBiquadFilter();
    roomFilter.type = "lowpass";
    roomFilter.frequency.value = 260;
    const roomGain = this.ctx.createGain();
    roomGain.gain.value = 0.028;
    room.connect(roomFilter);
    roomFilter.connect(roomGain);
    roomGain.connect(this.ambientBus);
    room.start();

    this.ambientNodes = [pad, pad2, room, gain, roomGain, filter, roomFilter];
    this.scene = "bedroom";
    this.chaseMode = false;
    this.setChasePressure(false);
  }

  stopAmbient(fade = 0.35) {
    if (!this.ctx) return;
    const nodes = this.ambientNodes;
    this.ambientNodes = [];
    for (const node of nodes) {
      try {
        if (node.gain) {
          const now = this.ctx.currentTime;
          node.gain.cancelScheduledValues(now);
          node.gain.setValueAtTime(node.gain.value, now);
          node.gain.linearRampToValueAtTime(0, now + fade);
        }
        if (typeof node.stop === "function") node.stop(this.ctx.currentTime + fade + 0.05);
      } catch {
        /* already disconnected */
      }
    }
  }

  silence(fade = 0.3) {
    this.stopAmbient(fade);
    this.chaseMode = false;
    this.setChasePressure(false);
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  setChasePressure(active) {
    if (!this.ctx) return;
    this.chaseMode = active;
    if (active) {
      this.heartbeat(0.06, 92);
      if (!this.chaseLoop) {
        const droneGain = this.ctx.createGain();
        droneGain.gain.value = 0.05;
        const drone = this.ctx.createOscillator();
        drone.type = "sawtooth";
        drone.frequency.value = 36;
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 120;
        drone.connect(filter);
        filter.connect(droneGain);
        droneGain.connect(this.ambientBus);
        drone.start();
        this.chaseLoop = { drone, droneGain, filter };
      }
    } else if (this.chaseLoop) {
      try {
        this.chaseLoop.drone.stop();
      } catch {
        /* ignore */
      }
      this.chaseLoop = null;
    }
  }

  scheduleDrip() {
    if (!this.ctx) return;
    const delay = 2600 + Math.random() * 5200;
    const timer = setTimeout(() => {
      if (this.scene === "hospital" && !this.chaseMode) this.drip();
      this.scheduleDrip();
    }, delay);
    this.timers.add(timer);
  }

  tone({ freq = 220, type = "sine", gain = 0.1, duration = 0.3, attack = 0.01, bus = "fx", slide = null, filterHz = null }) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), now + duration);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    let destination = bus === "ambient" ? this.ambientBus : this.fxBus;
    if (filterHz) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = filterHz;
      filter.connect(destination);
      destination = filter;
    }
    osc.connect(amp);
    amp.connect(destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  noiseBurst({ gain = 0.1, duration = 0.2, type = "bandpass", freq = 900, q = 1.2, attack = 0.005, bus = "fx" }) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const source = this.noiseSource(false);
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(bus === "ambient" ? this.ambientBus : this.fxBus);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  drip() {
    if (!this.ctx) return;
    const pitch = 1100 + Math.random() * 700;
    this.tone({ freq: pitch, type: "sine", gain: 0.035, duration: 0.16, attack: 0.002, slide: pitch * 0.55 });
    this.noiseBurst({ gain: 0.006, duration: 0.04, freq: 2500 });
  }

  heartbeat(gain = 0.05, bpm = 68) {
    if (!this.ctx) return;
    const interval = 60 / bpm;
    this.tone({ freq: 54, type: "sine", gain, duration: 0.2, attack: 0.012, slide: 33 });
    setTimeout(() => this.tone({ freq: 47, type: "sine", gain: gain * 0.62, duration: 0.24, attack: 0.012, slide: 30 }), interval * 0.33);
  }

  step(sprinting = false, surface = "tile") {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastStep < 0.18) return;
    this.lastStep = now;
    const base = surface === "carpet" ? 180 : 320;
    this.noiseBurst({
      gain: sprinting ? 0.075 : 0.045,
      duration: sprinting ? 0.13 : 0.1,
      freq: base + Math.random() * 180,
      type: "lowpass",
      bus: "fx",
    });
    this.tone({
      freq: surface === "carpet" ? 68 : 92,
      type: "sine",
      gain: sprinting ? 0.04 : 0.025,
      duration: 0.09,
      attack: 0.004,
      slide: 55,
    });
  }

  pickup() {
    this.tone({ freq: 620, type: "triangle", gain: 0.05, duration: 0.15, slide: 880 });
    setTimeout(() => this.tone({ freq: 940, type: "sine", gain: 0.035, duration: 0.22, slide: 1120 }), 90);
  }

  door(locked = false) {
    if (locked) {
      this.tone({ freq: 160, type: "square", gain: 0.035, duration: 0.1, slide: 90, filterHz: 600 });
      setTimeout(() => this.tone({ freq: 120, type: "square", gain: 0.03, duration: 0.08, slide: 70, filterHz: 500 }), 120);
      return;
    }
    this.noiseBurst({ gain: 0.055, duration: 0.6, type: "bandpass", freq: 480, q: 0.7, attack: 0.08 });
    this.tone({ freq: 130, type: "sawtooth", gain: 0.026, duration: 0.85, slide: 58, filterHz: 520 });
    setTimeout(() => this.tone({ freq: 58, type: "sine", gain: 0.08, duration: 0.3, slide: 32 }), 520);
  }

  paper() {
    this.noiseBurst({ gain: 0.04, duration: 0.35, type: "highpass", freq: 1800, q: 0.5, attack: 0.04 });
  }

  staticBurst(duration = 0.7, gain = 0.08) {
    this.noiseBurst({ gain, duration, type: "bandpass", freq: 1700, q: 0.4, attack: 0.01 });
    this.tone({ freq: 100, type: "sawtooth", gain: gain * 0.35, duration, slide: 60, filterHz: 900 });
  }

  whisper() {
    for (let i = 0; i < 4; i += 1) {
      setTimeout(() => {
        this.noiseBurst({ gain: 0.028, duration: 0.16, type: "bandpass", freq: 620 + Math.random() * 700, q: 5, attack: 0.04 });
      }, i * 170);
    }
  }

  stinger() {
    this.tone({ freq: 82, type: "sawtooth", gain: 0.12, duration: 1.4, slide: 31, filterHz: 520 });
    this.noiseBurst({ gain: 0.11, duration: 1.1, type: "lowpass", freq: 600, q: 0.5, attack: 0.02 });
    this.heartbeat(0.1, 110);
  }

  giggle() {
    if (!this.ctx) return;
    const notes = [980, 1120, 880, 1040, 780];
    notes.forEach((freq, index) => {
      setTimeout(() => {
        this.tone({ freq, type: "triangle", gain: 0.018, duration: 0.12, slide: freq * 0.86 });
      }, index * 130);
    });
  }

  musicBox() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 987.77, 783.99, 659.25];
    notes.forEach((freq, index) => {
      setTimeout(() => {
        this.tone({ freq, type: "sine", gain: 0.03, duration: 0.9, attack: 0.01, slide: freq * 0.995 });
        this.tone({ freq: freq * 2, type: "sine", gain: 0.008, duration: 0.6, attack: 0.01 });
      }, index * 380);
    });
  }

  memory() {
    this.musicBox();
    setTimeout(() => this.whisper(), 700);
    setTimeout(() => this.noiseBurst({ gain: 0.05, duration: 2.2, type: "lowpass", freq: 320, q: 0.4, attack: 0.2 }), 2300);
  }

  chaseStart() {
    this.setChasePressure(true);
    this.stinger();
    this.noiseBurst({ gain: 0.12, duration: 2.2, type: "bandpass", freq: 400, q: 0.3, attack: 0.01 });
  }

  fail() {
    this.silence(0.5);
    this.tone({ freq: 68, type: "sawtooth", gain: 0.14, duration: 2.4, slide: 24, filterHz: 300 });
    this.noiseBurst({ gain: 0.08, duration: 2, type: "lowpass", freq: 250, attack: 0.02 });
  }

  doorSlam() {
    this.noiseBurst({ gain: 0.16, duration: 0.5, type: "lowpass", freq: 380, q: 0.6, attack: 0.003 });
    this.tone({ freq: 52, type: "sine", gain: 0.17, duration: 0.7, slide: 27 });
  }

  ui() {
    this.tone({ freq: 480, type: "triangle", gain: 0.022, duration: 0.07, slide: 520 });
  }
}
