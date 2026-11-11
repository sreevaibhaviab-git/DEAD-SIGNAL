import * as THREE from 'three';

// Reusable props built from simple, layered geometry. Each takes the Builder (b).

// Chunky beige desk terminal: recessed curved screen, bezel, buttons, speaker grille, keyboard.
// Local space faces +Z; (x, y, z) is the base centre on the surface it stands on.
export function terminal(b, { x, y = 0, z, rotY = 0, screen, sw = 0.46, sh = 0.34, keyboard = true, pedestal = false }) {
  const M = b.mat;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  b.group.add(g);
  const hit = [];
  let base = 0;
  if (pedestal) {
    hit.push(b.box(0.7, 0.95, 0.55, 0, 0.475, -0.05, M.beige, { parent: g }));
    b.box(0.74, 0.06, 0.6, 0, 0.03, -0.05, M.dark, { parent: g, cast: false });
    b.box(0.5, 0.3, 0.01, 0, 0.5, 0.226, M.grille, { parent: g, cast: false });
    base = 0.95;
  }
  const cw = sw + 0.2, ch = sh + 0.22, cd = 0.46;
  // casing with a sloped back
  hit.push(b.box(cw, ch, cd * 0.6, 0, base + ch / 2, -0.04, M.beige, { parent: g }));
  b.box(cw * 0.82, ch * 0.78, cd * 0.45, 0, base + ch * 0.45, -0.3, M.beige, { parent: g, rx: 0.18 });
  // recessed screen: dark well + bezel frame
  const sz = 0.11;
  b.box(sw + 0.02, sh + 0.02, 0.04, 0, base + ch / 2 + 0.02, sz - 0.03, M.darkMatte, { parent: g, cast: false });
  const bz = sz + 0.012;
  b.box(cw, 0.08, 0.06, 0, base + ch / 2 + sh / 2 + 0.06, bz, M.beige, { parent: g });
  b.box(cw, 0.12, 0.06, 0, base + ch / 2 - sh / 2 - 0.04, bz, M.beige, { parent: g });
  for (const s of [-1, 1]) b.box(0.1, sh + 0.02, 0.06, s * (sw / 2 + 0.05), base + ch / 2 + 0.02, bz, M.beige, { parent: g });
  const mat = new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false });
  mat.color.setScalar(0.85);
  const screenMesh = new THREE.Mesh(b.curvedScreenGeo(sw, sh, 0.018), mat);
  screenMesh.position.set(0, base + ch / 2 + 0.02, sz - 0.008);
  g.add(screenMesh);
  b.screens.add(screen);
  hit.push(screenMesh);
  // buttons + grille under the screen
  const by = base + ch / 2 - sh / 2 - 0.04;
  [M.amber, M.teal_em, M.darkMatte, M.darkMatte].forEach((m, i) => b.box(0.035, 0.025, 0.02, -cw / 2 + 0.08 + i * 0.05, by, bz + 0.035, m, { parent: g, cast: false }));
  b.box(0.16, 0.06, 0.01, cw / 2 - 0.13, by, bz + 0.032, M.grille, { parent: g, cast: false });
  if (keyboard) {
    const kb = b.box(cw * 0.95, 0.04, 0.2, 0, base + 0.03, 0.27, M.beige, { parent: g, rx: 0.08 });
    hit.push(kb);
    const keys = [];
    for (let r = 0; r < 4; r++) for (let k = 0; k < 13; k++) {
      keys.push({ x: -cw * 0.42 + k * (cw * 0.84 / 12), y: base + 0.058 + r * 0.004, z: 0.21 + r * 0.035, rx: 0.08 });
    }
    b.instanced(new THREE.BoxGeometry(0.03, 0.012, 0.028), M.ceramic, keys, g);
  }
  return { group: g, screenMesh, hit };
}

// Slim wall-mounted beige terminal (no keyboard), local +Z faces out of the wall.
export function wallTerminal(b, { x, y, z, rotY = 0, screen, sw = 0.5, sh = 0.36 }) {
  const M = b.mat;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  b.group.add(g);
  const hw = sw + 0.18, hh = sh + 0.3;
  const housing = b.box(hw, hh, 0.14, 0, 0, 0.07, M.beige, { parent: g });
  b.box(sw + 0.02, sh + 0.02, 0.02, 0, 0.06, 0.135, M.darkMatte, { parent: g, cast: false });
  const mat = new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false });
  mat.color.setScalar(0.85);
  const screenMesh = new THREE.Mesh(b.curvedScreenGeo(sw, sh, 0.012), mat);
  screenMesh.position.set(0, 0.06, 0.142);
  g.add(screenMesh);
  b.screens.add(screen);
  // keypad + grille strip below
  for (let i = 0; i < 6; i++) b.box(0.04, 0.03, 0.02, -hw / 2 + 0.1 + i * 0.055, -hh / 2 + 0.07, 0.15, i === 0 ? M.amber : M.darkMatte, { parent: g, cast: false });
  b.box(0.18, 0.05, 0.01, hw / 2 - 0.14, -hh / 2 + 0.07, 0.145, M.grille, { parent: g, cast: false });
  return { group: g, screenMesh, hit: [housing, screenMesh] };
}

export function strappedCrate(b, x, y, z, s, mat, ry = 0) {
  const M = b.mat;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  b.group.add(g);
  b.box(s, s, s, 0, 0, 0, mat, { parent: g });
  for (const o of [-0.28, 0.28]) {
    b.box(s + 0.03, s + 0.03, 0.06, 0, 0, o * s, M.strap, { parent: g, cast: false });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, s + 0.01, 0.08, sx * (s / 2 - 0.03), 0, sz * (s / 2 - 0.03), M.graphite, { parent: g, cast: false });
  return g;
}

export function grabHandle(b, x, y, z, { axis = 'y', len = 0.5, out = 0.07, dir = [0, 0, 1] } = {}) {
  const M = b.mat;
  const [dx, , dz] = dir;
  b.cyl(0.02, len, x + dx * out, y, z + dz * out, axis, M.paint, { seg: 8 });
  for (const s of [-1, 1]) {
    const ox = axis === 'x' ? s * (len / 2 - 0.02) : 0, oy = axis === 'y' ? s * (len / 2 - 0.02) : 0, oz = axis === 'z' ? s * (len / 2 - 0.02) : 0;
    b.box(Math.abs(dx) > 0 ? out : 0.03, 0.03, Math.abs(dz) > 0 ? out : 0.03, x + ox + dx * out / 2, y + oy, z + oz + dz * out / 2, M.graphite, { cast: false });
  }
}

// Bolted pedestal table. Returns the top mesh.
export function table(b, { x, z, w = 1.6, d = 0.8, h = 0.74, rotY = 0 }) {
  const M = b.mat;
  const top = b.box(w, 0.05, d, x, h, z, M.beige, { ry: rotY, block: true });
  b.box(w - 0.04, 0.03, d - 0.04, x, h - 0.035, z, M.graphite, { ry: rotY, cast: false });
  b.cyl(0.06, h - 0.06, x, (h - 0.06) / 2, z, 'y', M.graphite, { seg: 10 });
  b.box(0.5, 0.03, 0.5, x, 0.015, z, M.graphite, { ry: rotY, cast: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.03, 0.02, 0.03, x + sx * 0.2, 0.04, z + sz * 0.2, M.steel, { cast: false });
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const hw = Math.abs(c * w / 2) + Math.abs(s * d / 2), hd = Math.abs(s * w / 2) + Math.abs(c * d / 2);
  b.collider(x - hw, x + hw, z - hd, z + hd);
  return top;
}

// Restrained station chair; fallen = lying on its back.
export function chair(b, { x, z, rotY = 0, fallen = false, mat = null, collide = true }) {
  const M = b.mat;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  b.group.add(g);
  const inner = new THREE.Group();
  g.add(inner);
  if (fallen) { inner.rotation.x = -Math.PI / 2; inner.position.set(0, 0.22, 0.45); }
  const seatMat = mat || M.fabric;
  b.box(0.44, 0.07, 0.42, 0, 0.46, 0, seatMat, { parent: inner });
  b.box(0.44, 0.42, 0.06, 0, 0.72, -0.2, seatMat, { parent: inner });
  b.box(0.04, 0.46, 0.04, 0, 0.22, 0, M.graphite, { parent: inner });
  b.box(0.4, 0.03, 0.04, 0, 0.02, 0, M.graphite, { parent: inner });
  b.box(0.04, 0.03, 0.4, 0, 0.02, 0, M.graphite, { parent: inner });
  for (const s of [-1, 1]) b.box(0.03, 0.4, 0.03, s * 0.2, 0.68, -0.22, M.graphite, { parent: inner });
  if (collide) {
    const r = fallen ? 0.45 : 0.28;
    b.collider(x - r, x + r, z - r, z + r);
  }
  return g;
}

export function mug(b, x, y, z, { mat = null, tipped = false } = {}) {
  const M = b.mat;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (tipped) { g.rotation.z = Math.PI / 2; g.position.y = y + 0.04 - 0.05; }
  b.group.add(g);
  b.cyl(0.04, 0.1, 0, 0.05, 0, 'y', mat || M.ceramic, { seg: 14, parent: g });
  b.cyl(0.036, 0.004, 0, 0.1, 0, 'y', M.darkMatte, { seg: 14, parent: g });
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 6, 12), mat || M.ceramic);
  h.position.set(0.045, 0.05, 0);
  g.add(h);
  return g;
}

export function tray(b, x, y, z, rotY = 0, { half = false } = {}) {
  const M = b.mat;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  b.group.add(g);
  b.box(0.42, 0.02, 0.3, 0, 0.01, 0, M.plastic, { parent: g, cast: false });
  b.box(0.13, 0.025, 0.11, -0.12, 0.03, -0.05, M.steel, { parent: g, cast: false });
  b.box(0.13, half ? 0.012 : 0.03, 0.11, -0.12, 0.04, -0.05, M.food, { parent: g, cast: false });
  b.box(0.12, 0.025, 0.11, 0.02, 0.03, -0.05, M.steel, { parent: g, cast: false });
  b.box(0.11, 0.022, 0.1, 0.02, 0.04, -0.05, M.food2, { parent: g, cast: false });
  b.box(0.14, 0.025, 0.09, 0.0, 0.03, 0.08, M.steel, { parent: g, cast: false });
  b.box(0.12, 0.03, 0.07, 0.0, 0.04, 0.08, M.food3, { parent: g, cast: false });
  b.box(0.012, 0.006, 0.14, 0.16, 0.025, 0.0, M.steel, { parent: g, ry: 0.2, cast: false });
  return g;
}

// Hanging cable between two points with sag
export function cable(b, a, c, sag = 0.3, r = 0.015, mat = null) {
  const mid = new THREE.Vector3((a.x + c.x) / 2, (a.y + c.y) / 2 - sag, (a.z + c.z) / 2);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(a.x, a.y, a.z), mid, new THREE.Vector3(c.x, c.y, c.z));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, r, 6, false), mat || b.mat.rubber);
  m.castShadow = true;
  b.group.add(m);
  return m;
}

// Small scattered debris (screws, plates, wrappers). Decorative, no collision.
export function debris(b, { x0, x1, z0, z1, count = 20, seed = 1 }) {
  const M = b.mat;
  let s = seed;
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const small = [], plates = [];
  for (let i = 0; i < count; i++) {
    const p = { x: x0 + R() * (x1 - x0), y: 0.01, z: z0 + R() * (z1 - z0), ry: R() * Math.PI };
    if (R() < 0.65) small.push(p); else plates.push(p);
  }
  b.instanced(new THREE.BoxGeometry(0.05, 0.015, 0.02), M.steel, small);
  b.instanced(new THREE.BoxGeometry(0.22, 0.008, 0.14), M.graphite, plates);
}
