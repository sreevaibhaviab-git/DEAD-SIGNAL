import { Music } from './Music.js';

// Room ambience profiles: low-pass on the hum, hum level, ventilation level and band centre.
const ROOMS = {
  airlock:  { lp: 300, hum: 0.050, vent: 0.020, ventFreq: 1300 },
  cargo:    { lp: 190, hum: 0.075, vent: 0.014, ventFreq: 600 },
  corridor: { lp: 260, hum: 0.050, vent: 0.024, ventFreq: 900 },
  security: { lp: 340, hum: 0.040, vent: 0.020, ventFreq: 1500 },
  hub:      { lp: 280, hum: 0.045, vent: 0.030, ventFreq: 1000 },
  crew:     { lp: 240, hum: 0.040, vent: 0.020, ventFreq: 800 },
  mess:     { lp: 220, hum: 0.035, vent: 0.016, ventFreq: 700 },
};

const VOICE_PREFS = {
  EVA: ['Samantha', 'Ava', 'Allison', 'Zira', 'Google UK English Female'],
  MARA: ['Karen', 'Moira', 'Tessa', 'Serena', 'Fiona', 'Susan'],
  PRIYA: ['Veena', 'Victoria', 'Kathy', 'Rishi', 'Google US English'],
};

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.voices = {};
    this.settings = { master: 0.8, music: 0.55, sfx: 0.8, voice: 0.9 };
    this.room = 'airlock';
    this._duckTimer = null;
    this._emitters = [];
    this._pendingEmitters = [];
    this._audioEl = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());

    this.master = c.createGain();
    this.master.connect(c.destination);
    this.menuGain = c.createGain();          // fades world audio while paused
    this.menuGain.connect(this.master);
    this.sfx = c.createGain();
    this.sfx.connect(this.menuGain);
    this.duckGain = c.createGain();
    this.duckGain.connect(this.master);
    this.musicBus = c.createGain();
    this.musicBus.connect(this.duckGain);
    this.ambBus = c.createGain();
    this.ambBus.connect(this.sfx);
    this.voiceBus = c.createGain();          // recordings played through Web Audio
    this.voiceBus.connect(this.master);

    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this._ambience();
    this._machinery();
    this.music = new Music(c, this.musicBus);
    this.music.start();
    this._loadVoices();
    this.applySettings(this.settings);
    this.setRoom(this.room, true);
    for (const e of this._pendingEmitters) this._createEmitter(e);
    this._pendingEmitters = [];
  }

  applySettings(s) {
    this.settings = { master: s.master, music: s.music, sfx: s.sfx, voice: s.voice };
    if (this._audioEl) this._audioEl.volume = Math.min(1, s.voice * s.master);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.music, t, 0.05);
    this.voiceBus.gain.setTargetAtTime(s.voice, t, 0.05);
  }

  // Paused / main menu: world sound drops, music softens.
  setPaused(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.menuGain.gain.setTargetAtTime(on ? 0.2 : 1, t, 0.25);
    this.duckGain.gain.setTargetAtTime(on ? 0.5 : 1, t, 0.4);
  }

  // ---------- ambience ----------
  _ambience() {
    const c = this.ctx;
    this.humLP = c.createBiquadFilter();
    this.humLP.type = 'lowpass';
    this.humLP.connect(this.ambBus);

    this.humGain = c.createGain();
    this.humGain.connect(this.humLP);
    [[55, 0.6], [110.5, 0.25], [165, 0.08]].forEach(([f, v]) => {
      const o = c.createOscillator();
      o.frequency.value = f;
      const og = c.createGain();
      og.gain.value = v;
      o.connect(og);
      og.connect(this.humGain);
      o.start();
    });
    const rumble = c.createBufferSource();
    rumble.buffer = this.noise;
    rumble.loop = true;
    const rg = c.createGain();
    rg.gain.value = 0.35;
    rumble.connect(rg);
    rg.connect(this.humGain);
    rumble.start();

    const vent = c.createBufferSource();
    vent.buffer = this.noise;
    vent.loop = true;
    this.ventF = c.createBiquadFilter();
    this.ventF.type = 'bandpass';
    this.ventF.Q.value = 0.7;
    this.ventGain = c.createGain();
    vent.connect(this.ventF);
    this.ventF.connect(this.ventGain);
    this.ventGain.connect(this.ambBus);
    vent.start(0, 0.7);
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.006;
    lfo.connect(lfoGain);
    lfoGain.connect(this.ventGain.gain);
    lfo.start();
  }

  setRoom(room, instant = false) {
    this.room = room;
    if (!this.ctx) return;
    const p = ROOMS[room] || ROOMS.corridor;
    const t = this.ctx.currentTime, tc = instant ? 0.01 : 1.5;
    this.humLP.frequency.setTargetAtTime(p.lp, t, tc);
    this.humGain.gain.setTargetAtTime(p.hum, t, tc);
    this.ventGain.gain.setTargetAtTime(p.vent, t, tc);
    this.ventF.frequency.setTargetAtTime(p.ventFreq, t, tc);
  }

  _machinery() {
    const fire = () => {
      if (this.ctx) {
        if (Math.random() < 0.6) {
          this._noise(1.4, { type: 'lowpass', freq: 160, gain: 0.08, attack: 0.02 });
          this._tone(140, 1.8, { type: 'triangle', gain: 0.012, freqEnd: 118 });
        } else {
          // distant metallic tick as the hull flexes
          this._tone(900 + Math.random() * 400, 0.25, { type: 'triangle', gain: 0.008 });
          this._tone(620 + Math.random() * 200, 0.4, { type: 'triangle', gain: 0.006, delay: 0.18 });
        }
      }
      this._machTimer = setTimeout(fire, 9000 + Math.random() * 13000);
    };
    this._machTimer = setTimeout(fire, 6000);
  }

  // ---------- positional emitters ----------
  // type: 'buzz' (faulty light), 'fridge' (galley cooler), 'vent' (local vent), 'servo' (idle machinery)
  addEmitter(pos, type, level = 1) {
    const e = { pos, type, level, gain: null };
    this._emitters.push(e);
    if (this.ctx) this._createEmitter(e);
    else this._pendingEmitters.push(e);
    return e;
  }

  setEmitterLevel(e, v) {
    e.level = v;
    if (e.gain && this.ctx) e.gain.gain.setTargetAtTime(v * e.base, this.ctx.currentTime, 0.02);
  }

  _createEmitter(e) {
    const c = this.ctx;
    const panner = c.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.2;
    panner.maxDistance = 25;
    panner.rolloffFactor = 1.5;
    if (panner.positionX) {
      panner.positionX.value = e.pos.x; panner.positionY.value = e.pos.y; panner.positionZ.value = e.pos.z;
    } else {
      panner.setPosition(e.pos.x, e.pos.y, e.pos.z);
    }
    const g = c.createGain();
    g.connect(panner);
    panner.connect(this.sfx);
    e.gain = g;
    if (e.type === 'buzz') {
      e.base = 0.05;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 120;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1200;
      f.Q.value = 1.2;
      o.connect(f); f.connect(g); o.start();
    } else if (e.type === 'fridge') {
      e.base = 0.07;
      const o = c.createOscillator();
      o.frequency.value = 98;
      o.connect(g); o.start();
      const n = c.createBufferSource();
      n.buffer = this.noise; n.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 400;
      const ng = c.createGain(); ng.gain.value = 0.5;
      n.connect(f); f.connect(ng); ng.connect(g); n.start(0, 1.1);
    } else if (e.type === 'vent') {
      e.base = 0.06;
      const n = c.createBufferSource();
      n.buffer = this.noise; n.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.5;
      n.connect(f); f.connect(g); n.start(0, 0.3);
    } else {
      e.base = 0.04;
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 220;
      const o2 = c.createOscillator();
      o2.frequency.value = 0.3;
      const og = c.createGain(); og.gain.value = 8;
      o2.connect(og); og.connect(o.frequency);
      o.connect(g); o.start(); o2.start();
    }
    g.gain.value = e.level * e.base;
  }

  setListener(camera) {
    if (!this.ctx) return;
    const L = this.ctx.listener, p = camera.position;
    const fx = -Math.sin(camera.rotation.y), fz = -Math.cos(camera.rotation.y);
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t);
      L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(0, t); L.forwardZ.setValueAtTime(fz, t);
      L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  // ---------- primitives ----------
  _noise(dur, { type = 'bandpass', freq = 1000, freqEnd = null, q = 1, gain = 0.2, attack = 0.01, delay = 0, bus = null } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(attack, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(bus || this.sfx);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  _tone(freq, dur, { type = 'sine', gain = 0.1, delay = 0, freqEnd = null, bus = null } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------- effects ----------
  door() {
    this.relay();
    this._tone(90, 0.3, { type: 'triangle', gain: 0.22, freqEnd: 45, delay: 0.08 });
    this._noise(1.1, { freq: 420, freqEnd: 1300, q: 0.7, gain: 0.1, attack: 0.15, delay: 0.08 });
    this._tone(60, 0.35, { type: 'triangle', gain: 0.2, delay: 1.05, freqEnd: 35 });
  }
  doorClose() {
    this._noise(0.9, { freq: 1100, freqEnd: 400, q: 0.7, gain: 0.08, attack: 0.1 });
    this._tone(55, 0.4, { type: 'triangle', gain: 0.22, delay: 0.85, freqEnd: 32 });
  }
  relay() { this._tone(1800, 0.02, { type: 'square', gain: 0.03 }); this._tone(1200, 0.02, { type: 'square', gain: 0.025, delay: 0.035 }); }
  beep() { this._tone(880, 0.07, { gain: 0.05 }); this._tone(1320, 0.07, { gain: 0.04, delay: 0.08 }); }
  key() { this._noise(0.03, { freq: 3000, q: 2, gain: 0.03, attack: 0.002 }); }
  deny() { this._tone(220, 0.12, { type: 'square', gain: 0.03 }); this._tone(170, 0.16, { type: 'square', gain: 0.03, delay: 0.15 }); }
  evidence() {
    this._tone(660, 0.15, { gain: 0.04 });
    this._tone(990, 0.25, { gain: 0.035, delay: 0.12 });
    if (this.music) this.music.stinger();
  }
  complete() {
    this._tone(523, 0.6, { type: 'triangle', gain: 0.04 });
    this._tone(784, 0.9, { type: 'triangle', gain: 0.035, delay: 0.25 });
    if (this.music) this.music.stinger();
  }
  hiss(dur = 3.5) {
    this._noise(dur, { type: 'highpass', freq: 2500, q: 0.5, gain: 0.1, attack: 0.3 });
    this._noise(dur, { type: 'lowpass', freq: 300, q: 0.5, gain: 0.06, attack: 0.5 });
  }
  staticBurst() { this._noise(0.9, { freq: 2200, q: 2, gain: 0.1, attack: 0.02 }); }
  clunk() { this._tone(70, 0.4, { type: 'triangle', gain: 0.28, freqEnd: 40 }); this._noise(0.25, { type: 'lowpass', freq: 900, gain: 0.12 }); }
  tapeClick() { this._noise(0.05, { freq: 2500, q: 3, gain: 0.08, attack: 0.002 }); this._tone(160, 0.08, { type: 'square', gain: 0.02, delay: 0.03 }); }

  step(material = 'plate') {
    if (material === 'grate') {
      this._noise(0.09, { freq: 2200, q: 3, gain: 0.06, attack: 0.003 });
      this._tone(420 + Math.random() * 60, 0.08, { type: 'triangle', gain: 0.01 });
    } else if (material === 'rubber') {
      this._noise(0.12, { type: 'lowpass', freq: 380, gain: 0.08, attack: 0.008 });
    } else {
      this._noise(0.12, { type: 'lowpass', freq: 520, q: 0.7, gain: 0.09, attack: 0.004 });
      this._tone(180 + Math.random() * 30, 0.06, { type: 'triangle', gain: 0.008 });
    }
  }

  // ---------- dialogue ----------
  duck(on) {
    if (!this.ctx) return;
    this.duckGain.gain.setTargetAtTime(on ? 0.35 : 1, this.ctx.currentTime, on ? 0.15 : 0.8);
  }

  // Scripted line via the browser voice. Returns a promise that resolves when speech ends.
  speak(line) {
    const ss = window.speechSynthesis;
    this.stopSpeech(false);
    if (!ss || !line || line.speaker === 'INTERCOM' || line.speaker === 'SYSTEM') { this.duck(false); return Promise.resolve(); }
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(line.text);
      const sp = line.speaker;
      const v = this.voices[sp] || this.voices.EVA;
      if (v) u.voice = v;
      u.rate = sp === 'EVA' ? 0.92 : sp === 'PRIYA' ? 1.02 : 1.0;
      u.pitch = sp === 'EVA' ? 0.8 : sp === 'PRIYA' ? 1.15 : 1.05;
      u.volume = Math.min(1, this.settings.voice * this.settings.master);
      const done = () => { clearTimeout(this._duckTimer); this.duck(false); resolve(); };
      u.onend = done;
      u.onerror = done;
      this.duck(true);
      // fallback if the browser never reports the end of speech
      this._duckTimer = setTimeout(done, Math.min(15000, 2500 + line.text.split(/\s+/).length * 450));
      ss.speak(u);
    });
  }

  // Plays server-generated speech audio (EVA via ElevenLabs). Resolves when playback ends.
  playVoiceBlob(blob) {
    this.stopSpeech(false);
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      a.volume = Math.min(1, this.settings.voice * this.settings.master);
      this._audioEl = a;
      const done = () => {
        URL.revokeObjectURL(url);
        if (this._audioEl === a) this._audioEl = null;
        this.duck(false);
        resolve();
      };
      a.onended = done;
      a.onerror = done;
      this.duck(true);
      a.play().catch(done);
    });
  }

  stopSpeech(unduck = true) {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    clearTimeout(this._duckTimer);
    if (this._audioEl) { this._audioEl.pause(); this._audioEl = null; }
    if (unduck) this.duck(false);
  }

  _loadVoices() {
    const ss = window.speechSynthesis;
    if (!ss) return;
    const pick = () => {
      const vs = ss.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'));
      if (!vs.length) return;
      const find = (names) => vs.find((v) => names.some((n) => v.name.includes(n)));
      this.voices.EVA = find(VOICE_PREFS.EVA) || vs[0];
      this.voices.MARA = find(VOICE_PREFS.MARA) || vs[1] || vs[0];
      this.voices.PRIYA = find(VOICE_PREFS.PRIYA) || vs[2] || vs[0];
      this.voices.JONAH = vs.find((v) => /Daniel|Alex|Fred|Tom|Male/.test(v.name)) || vs[0];
    };
    pick();
    ss.addEventListener('voiceschanged', pick);
  }
}
