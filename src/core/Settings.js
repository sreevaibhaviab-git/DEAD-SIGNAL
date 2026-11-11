const KEY = 'deadsignal.settings';

export const DEFAULTS = {
  master: 0.8,
  music: 0.55,
  sfx: 0.8,
  voice: 0.9,
  sensitivity: 1.0,
  invertY: false,
  headBob: true,
  quality: 'medium',
  evaVoice: false,
};

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && typeof saved === 'object') {
        for (const k of Object.keys(DEFAULTS)) if (k in saved) this.values[k] = saved[k];
      }
    } catch { /* ignore corrupt settings */ }
    if (!['low', 'medium', 'high'].includes(this.values.quality)) this.values.quality = 'medium';
    this.listeners = [];
  }

  get(key) { return this.values[key]; }

  set(key, value) {
    this.values[key] = value;
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* storage blocked */ }
    for (const fn of this.listeners) fn(key, value, this.values);
  }

  onChange(fn) { this.listeners.push(fn); }
}
