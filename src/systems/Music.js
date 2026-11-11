// Original generative score: slow organ-like pads, a restrained low pulse and deliberate silences.
// Chords are simple voicings chosen for this game; no existing melody is reproduced.
const CHORDS = [
  [50, 57, 62, 65], // D A D F
  [46, 53, 58, 62], // Bb F Bb D
  [48, 55, 60, 63], // C G C Eb
  [45, 52, 57, 64], // A E A E
  [43, 50, 55, 62], // G D G D
];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = out;
    this.idx = 0;
    this.timer = null;
    this.current = CHORDS[0];
    this.tension = 0; // 0..1, raised by discoveries; shortens silences, adds the pulse
  }

  start() {
    if (this.timer) return;
    this.timer = setTimeout(() => this._next(), 5000);
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  raiseTension(amount = 0.2) { this.tension = Math.min(1, this.tension + amount); }

  _next() {
    let wait;
    const silenceChance = 0.25 - this.tension * 0.12;
    if (Math.random() < silenceChance) {
      wait = 14 + Math.random() * 14;
    } else {
      const chord = CHORDS[this.idx];
      this.current = chord;
      this.idx = (this.idx + (Math.random() < 0.3 ? 2 : 1)) % CHORDS.length;
      const dur = 22 + Math.random() * 10;
      chord.forEach((m, i) => this._pad(hz(m), dur, i));
      if (Math.random() < 0.4 + this.tension * 0.5) this._pulse(hz(chord[0] - 12), dur);
      wait = dur * 0.8;
    }
    this.tension = Math.max(0, this.tension - 0.05);
    this.timer = setTimeout(() => this._next(), wait * 1000);
  }

  _pad(f, dur, i) {
    const c = this.ctx, t = c.currentTime + i * 0.6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.028, t + 7);
    g.gain.setValueAtTime(0.028, t + dur - 7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(380, t);
    lp.frequency.linearRampToValueAtTime(860, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(420, t + dur);
    lp.connect(g);
    g.connect(this.out);
    for (const [type, det, lvl, mul] of [['sawtooth', -7, 0.42, 1], ['sawtooth', 7, 0.42, 1], ['triangle', 0, 0.8, 0.5]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      o.detune.value = det;
      const og = c.createGain();
      og.gain.value = lvl;
      o.connect(og);
      og.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  _pulse(f, dur) {
    const c = this.ctx;
    for (let s = 4; s < dur - 4; s += 2.6) {
      const t = c.currentTime + s;
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(g);
      g.connect(this.out);
      o.start(t);
      o.stop(t + 1.3);
    }
  }

  // Subtle swell when the player discovers something.
  stinger() {
    const c = this.ctx, t = c.currentTime;
    this.raiseTension(0.25);
    this.current.forEach((m, i) => {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz(m + 12);
      const g = c.createGain();
      const st = t + i * 0.12;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.022, st + 2.5);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 8);
      o.connect(g);
      g.connect(this.out);
      o.start(st);
      o.stop(st + 8.2);
    });
  }
}
