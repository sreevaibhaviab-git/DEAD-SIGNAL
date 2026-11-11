const KEY = 'deadsignal.save';
const VERSION = 3;

export class GameState {
  constructor() { this.reset(); }

  reset() {
    this.flags = new Set();
    this.inventory = ['investigator_id'];
    this.evidence = [];
    this.doors = {};
    this.objective = 'cycle';
    this.chapter = 1;
    this.room = 'airlock';
    this.player = null;
  }

  has(f) { return this.flags.has(f); }
  set(f) { if (this.flags.has(f)) return false; this.flags.add(f); return true; }
  addItem(id) { if (this.inventory.includes(id)) return false; this.inventory.push(id); return true; }
  addEvidence(id) { if (this.evidence.includes(id)) return false; this.evidence.push(id); return true; }

  save(player) {
    const data = {
      version: VERSION, savedAt: Date.now(), flags: [...this.flags], inventory: this.inventory,
      evidence: this.evidence, doors: this.doors, objective: this.objective,
      chapter: this.chapter, room: this.room, player,
    };
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
  }

  load() {
    const d = GameState.read();
    if (!d) return false;
    this.flags = new Set(Array.isArray(d.flags) ? d.flags : []);
    this.inventory = Array.isArray(d.inventory) ? d.inventory : ['investigator_id'];
    this.evidence = Array.isArray(d.evidence) ? d.evidence : [];
    this.doors = d.doors && typeof d.doors === 'object' ? d.doors : {};
    this.objective = d.objective || 'cycle';
    this.chapter = d.chapter || 1;
    this.room = d.room || 'airlock';
    this.player = d.player || null;
    return true;
  }

  // Each step upgrades one version. Older saves pass through every later step.
  static migrate(d) {
    if (d.version === 1) d = { ...d, version: 2, chapter: 1, room: 'airlock' };
    if (d.version === 2) {
      const doors = { ...(d.doors || {}) };
      // v2 had the Mess Hall door locked as a placeholder; it is now a real room.
      if (doors.mess === 'locked') doors.mess = 'ready';
      d = { ...d, version: 3, doors };
    }
    return d;
  }

  static read() {
    try {
      let d = JSON.parse(localStorage.getItem(KEY));
      if (!d || typeof d !== 'object') return null;
      d = GameState.migrate(d);
      return d.version === VERSION ? d : null;
    } catch {
      return null;
    }
  }

  static hasSave() { return !!GameState.read(); }
}
