import * as THREE from 'three';

const STATUS = { ready: 0x2bff88, open: 0x1f8f55, locked: 0xffa020, sealed: 0xff2a2a };

// Heavy two-leaf pressure door with a control panel on each side.
// The collider is only removed once the leaves have opened wide enough to walk through.
export class Door {
  constructor(b, { id, x, z, axis = 'x', width = 2.0, height = 2.5, state = 'ready', labels = {}, lockedMsg = 'Locked.' }) {
    this.id = id;
    this.width = width;
    this.height = height;
    this.initialState = state;
    this.initialMsg = lockedMsg;
    this.lockedMsg = lockedMsg;
    this.progress = 0;
    this.target = 0;
    this.x = x; this.z = z;

    const M = b.mat, fw = 0.2, fd = 0.46;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = axis === 'x' ? 0 : Math.PI / 2;
    b.group.add(g);
    this.group = g;

    // Frame with pressure seal and hazard header
    for (const s of [-1, 1]) {
      b.box(fw, height + 0.26, fd, s * (width / 2 + fw / 2), (height + 0.26) / 2, 0, M.graphite, { parent: g });
      b.box(0.04, height, fd - 0.06, s * (width / 2 + 0.02), height / 2, 0, M.rubber, { parent: g, cast: false });
    }
    b.box(width + fw * 2, 0.26, fd, 0, height + 0.13, 0, M.graphite, { parent: g });
    const haz = b.tiled(M.hazard, (width + 0.4) / 0.5, 1);
    for (const s of [-1, 1]) b.vplane(width + 0.4, 0.16, 0, height + 0.13, s * (fd / 2 + 0.003), s > 0 ? 0 : Math.PI, haz, g);
    b.box(width, 0.05, fd, 0, 0.025, 0, M.graphite, { parent: g, cast: false }); // threshold

    // Sliding leaves
    this.leaves = [-1, 1].map((s) => b.box(width / 2, height, 0.14, (s * width) / 4, height / 2, 0, M.door, { parent: g }));

    // Control panels (beige housings with status lamp), one per side
    this.statusMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: STATUS[state] ?? STATUS.locked, emissiveIntensity: 2 });
    this.panels = [];
    for (const s of [-1, 1]) {
      // mounted on the frame post so it never clips into narrow corridor walls
      const px = width / 2 + fw / 2, pz = s * (fd / 2 + 0.04);
      const box = b.box(0.17, 0.32, 0.08, px, 1.35, pz, M.beige, { parent: g });
      const lamp = b.box(0.11, 0.045, 0.02, px, 1.45, pz + s * 0.045, this.statusMat, { parent: g, cast: false });
      const pad = b.box(0.11, 0.12, 0.02, px, 1.3, pz + s * 0.045, M.darkMatte, { parent: g, cast: false });
      this.panels.push(box, lamp, pad);
    }

    // Destination signs: pos = +local z side, neg = -local z side
    if (labels.pos) b.stencil(labels.pos, 1.8, 0.3, 0, height + 0.52, fd / 2 + 0.005, 0, { parent: g });
    if (labels.neg) b.stencil(labels.neg, 1.8, 0.3, 0, height + 0.52, -fd / 2 - 0.005, Math.PI, { parent: g });

    const hw = width / 2;
    this.collider = axis === 'x'
      ? b.collider(x - hw, x + hw, z - 0.16, z + 0.16)
      : b.collider(x - 0.16, x + 0.16, z - hw, z + hw);

    this.hit = [...this.leaves, ...this.panels];
    this.setState(state);
  }

  setState(s, msg) {
    this.state = s;
    if (msg) this.lockedMsg = msg;
    this.statusMat.emissive.setHex(STATUS[s] ?? STATUS.locked);
  }

  open(instant = false) {
    if (this.state === 'open') return false;
    this.setState('open');
    this.target = 1;
    if (instant) { this.progress = 1; this._apply(); }
    return true;
  }

  reset() {
    this.setState(this.initialState);
    this.lockedMsg = this.initialMsg;
    this.progress = 0;
    this.target = 0;
    this._apply();
  }

  _apply() {
    const off = this.progress * (this.width / 2 - 0.08);
    this.leaves[0].position.x = -this.width / 4 - off;
    this.leaves[1].position.x = this.width / 4 + off;
    this.collider.enabled = this.progress < 0.8;
  }

  update(dt) {
    if (this.progress === this.target) return;
    const step = dt * 1.2;
    this.progress = this.target > this.progress ? Math.min(this.target, this.progress + step) : Math.max(this.target, this.progress - step);
    this._apply();
  }

  prompt() {
    if (this.state === 'ready') return { text: 'E — Open door', kind: 'ok' };
    return { text: this.lockedMsg, kind: this.state === 'sealed' ? 'bad' : 'warn' };
  }
}
