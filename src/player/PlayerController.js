import * as THREE from 'three';

export class PlayerController {
  constructor(camera, input, colliders) {
    this.camera = camera;
    this.input = input;
    this.colliders = colliders;
    this.onStep = null;

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;

    this.radius = 0.33;
    this.eyeHeight = 1.65;
    this.walkSpeed = 2.9;
    this.sprintSpeed = 4.8;
    this.sensitivity = 0.0022;
    this.invertY = false;
    this.bobScale = 1;
    this.bobTime = 0;

    this.camera.rotation.order = 'YXZ';
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wish = new THREE.Vector3();
  }

  spawn(point, yaw = 0) {
    this.position.set(point.x, 0, point.z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this._resolveCollisions(); // never spawn inside geometry
    this._applyCamera(0);
  }

  serialize() { return { x: this.position.x, z: this.position.z, yaw: this.yaw }; }

  update(dt) {
    const inp = this.input;
    const m = inp.consumeMouse();
    this.yaw -= m.x * this.sensitivity;
    this.pitch -= m.y * this.sensitivity * (this.invertY ? -1 : 1);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));

    this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const f = (inp.isDown('KeyW') ? 1 : 0) - (inp.isDown('KeyS') ? 1 : 0);
    const r = (inp.isDown('KeyD') ? 1 : 0) - (inp.isDown('KeyA') ? 1 : 0);

    this._wish.set(0, 0, 0).addScaledVector(this._fwd, f).addScaledVector(this._right, r);
    if (this._wish.lengthSq() > 0) this._wish.normalize();
    const sprint = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
    this._wish.multiplyScalar(sprint ? this.sprintSpeed : this.walkSpeed);

    this.velocity.lerp(this._wish, 1 - Math.exp(-10 * dt));
    // Sub-step movement so fast frames never tunnel through thin geometry.
    const steps = Math.max(1, Math.ceil((this.velocity.length() * dt) / 0.15));
    for (let i = 0; i < steps; i++) {
      this.position.x += (this.velocity.x * dt) / steps;
      this.position.z += (this.velocity.z * dt) / steps;
      this._resolveCollisions();
    }

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    let bob = 0;
    if (speed > 0.4) {
      const prev = Math.sin(this.bobTime);
      this.bobTime += dt * speed * 2.2;
      const now = Math.sin(this.bobTime);
      if ((prev > 0 && now <= 0) || (prev < 0 && now >= 0)) this.onStep?.();
      bob = now * 0.02 * (speed / this.walkSpeed) * this.bobScale;
    }
    this._applyCamera(bob);
  }

  _applyCamera(bob) {
    this.camera.position.set(this.position.x, this.eyeHeight + bob, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  _resolveCollisions() {
    const p = this.position, r = this.radius;
    for (let iter = 0; iter < 3; iter++) {
      for (const b of this.colliders) {
        if (b.enabled === false) continue;
        const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2), push = (r - d) / d;
          p.x += dx * push;
          p.z += dz * push;
        } else {
          const l = p.x - b.minX, rt = b.maxX - p.x, bk = p.z - b.minZ, ft = b.maxZ - p.z;
          const mn = Math.min(l, rt, bk, ft);
          if (mn === l) p.x = b.minX - r;
          else if (mn === rt) p.x = b.maxX + r;
          else if (mn === bk) p.z = b.minZ - r;
          else p.z = b.maxZ + r;
        }
      }
    }
  }

  // True if a box would overlap the player (used so doors never close on them).
  overlaps(b, pad = 0) {
    const p = this.position, r = this.radius + pad;
    const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
    return (p.x - cx) ** 2 + (p.z - cz) ** 2 < r * r;
  }
}
