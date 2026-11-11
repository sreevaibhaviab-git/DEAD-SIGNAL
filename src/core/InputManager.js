export class InputManager {
  constructor(element) {
    this.el = element;
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.onLockChange = null;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => {
      for (const k of this.keys) this.released.add(k);
      this.keys.clear();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return; // ignore lock-in spikes
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      for (const k of this.keys) this.released.add(k);
      this.keys.clear();
      this.mouseDX = this.mouseDY = 0;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lock() {
    try {
      const p = this.el.requestPointerLock();
      return p && typeof p.then === 'function' ? p : Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  isDown(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  wasReleased(code) { return this.released.has(code); }

  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }
}
