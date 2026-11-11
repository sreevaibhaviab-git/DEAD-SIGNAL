import * as THREE from 'three';

// All textures are generated procedurally at load time (no image files).
// Each material set produces matching colour, roughness and normal maps from one layout,
// so seams, rivets, chips and grime line up across all three channels.

// ---------- utilities ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = true, color = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  return t;
}

// Height canvas (grey) -> tangent-space normal map
function normalFromHeight(hc, strength = 2.5) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, g] = canvas(w, h);
  const out = g.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      out.data[i] = (nx * 0.5 + 0.5) * 255;
      out.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      out.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return c;
}

// Three parallel layers: colour, height, roughness
class Layers {
  constructor(w, h, { base, height = 128, rough = 150 }) {
    [this.cc, this.c] = canvas(w, h);
    [this.hc, this.h] = canvas(w, h);
    [this.rc, this.r] = canvas(w, h);
    this.w = w; this.hgt = h;
    this.c.fillStyle = base; this.c.fillRect(0, 0, w, h);
    this.h.fillStyle = grey(height); this.h.fillRect(0, 0, w, h);
    this.r.fillStyle = grey(rough); this.r.fillRect(0, 0, w, h);
  }
  rect(x, y, w, h, { color, height, rough }) {
    if (color) { this.c.fillStyle = color; this.c.fillRect(x, y, w, h); }
    if (height != null) { this.h.fillStyle = grey(height); this.h.fillRect(x, y, w, h); }
    if (rough != null) { this.r.fillStyle = grey(rough); this.r.fillRect(x, y, w, h); }
  }
  dot(x, y, rad, { color, height, rough }) {
    for (const [ctx, v] of [[this.c, color], [this.h, height != null ? grey(height) : null], [this.r, rough != null ? grey(rough) : null]]) {
      if (!v) continue;
      ctx.fillStyle = v;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
  }
  line(x0, y0, x1, y1, width, { color, height, rough }) {
    for (const [ctx, v] of [[this.c, color], [this.h, height != null ? grey(height) : null], [this.r, rough != null ? grey(rough) : null]]) {
      if (!v) continue;
      ctx.strokeStyle = v; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
  }
  finish({ normalStrength = 2.5, repeat = true } = {}) {
    return {
      map: tex(this.cc, { repeat }),
      normalMap: tex(normalFromHeight(this.hc, normalStrength), { repeat, color: false }),
      roughnessMap: tex(this.rc, { repeat, color: false }),
    };
  }
}

function grey(v) { const n = Math.max(0, Math.min(255, Math.round(v))); return `rgb(${n},${n},${n})`; }

function speckle(ctx, w, h, count, alpha, R, light = 0.5) {
  for (let i = 0; i < count; i++) {
    const v = R() < light ? 255 : 0, s = 1 + R() * 2;
    ctx.fillStyle = `rgba(${v},${v},${v},${(R() * alpha).toFixed(3)})`;
    ctx.fillRect(R() * w, R() * h, s, s);
  }
}

function mottle(ctx, w, h, count, R, colorFn) {
  for (let i = 0; i < count; i++) {
    const x = R() * w, y = R() * h, r = 20 + R() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colorFn(R)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function grimeStreaks(L, R, count, from = 0) {
  const { w, hgt } = L;
  for (let i = 0; i < count; i++) {
    const x = R() * w, y = from + R() * hgt * 0.4, len = 40 + R() * hgt * 0.6, wd = 2 + R() * 9;
    const g = L.c.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, `rgba(30,24,16,${(0.15 + R() * 0.2).toFixed(2)})`);
    g.addColorStop(1, 'rgba(30,24,16,0)');
    L.c.fillStyle = g; L.c.fillRect(x, y, wd, len);
    const gr = L.r.createLinearGradient(0, y, 0, y + len);
    gr.addColorStop(0, 'rgba(230,230,230,0.5)'); gr.addColorStop(1, 'rgba(230,230,230,0)');
    L.r.fillStyle = gr; L.r.fillRect(x, y, wd, len);
  }
}

function scratches(L, R, count, color = 'rgba(190,196,196,0.5)') {
  for (let i = 0; i < count; i++) {
    const x = R() * L.w, y = R() * L.hgt, a = (R() - 0.5) * 1.2 + (R() < 0.5 ? 0 : Math.PI / 2), l = 8 + R() * 50;
    L.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 0.6 + R() * 0.8, { color, height: 116, rough: 95 });
  }
}

// Paint chips that expose bare metal, concentrated along a rectangle's edges
function edgeWear(L, R, x, y, w, h, count) {
  for (let i = 0; i < count; i++) {
    const side = Math.floor(R() * 4);
    let px, py;
    if (side === 0) { px = x + R() * w; py = y + R() * 6; }
    else if (side === 1) { px = x + R() * w; py = y + h - R() * 6; }
    else if (side === 2) { px = x + R() * 6; py = y + R() * h; }
    else { px = x + w - R() * 6; py = y + R() * h; }
    const r = 0.8 + R() * 2.6;
    L.dot(px, py, r, { color: R() < 0.15 ? '#6b4a32' : '#737b7d', height: 120, rough: 90 });
  }
}

// ---------- material sets ----------
export function paintedPanelSet({ base = '#3b6466', seam = '#16201f', cols = 2, rows = 2, size = 512, seed = 1, vents = false, rivets = true } = {}) {
  const R = rng(seed);
  const L = new Layers(size, size, { base, height: 132, rough: 150 });
  mottle(L.c, size, size, 26, R, (r) => `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${(0.03 + r() * 0.05).toFixed(3)})`);
  const cw = size / cols, ch = size / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = i * cw, y = j * ch;
    // slight per-panel tone shift
    L.c.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${(R() * 0.06).toFixed(3)})`;
    L.c.fillRect(x + 4, y + 4, cw - 8, ch - 8);
    // raised inner panel bevel
    L.h.fillStyle = grey(140); L.h.fillRect(x + 14, y + 14, cw - 28, ch - 28);
    L.h.fillStyle = grey(124); L.h.fillRect(x + 20, y + 20, cw - 40, ch - 40);
    L.c.strokeStyle = 'rgba(0,0,0,0.25)'; L.c.lineWidth = 2; L.c.strokeRect(x + 15, y + 15, cw - 30, ch - 30);
    if (rivets) {
      for (const [rx, ry] of [[x + 9, y + 9], [x + cw - 9, y + 9], [x + 9, y + ch - 9], [x + cw - 9, y + ch - 9], [x + cw / 2, y + 9], [x + cw / 2, y + ch - 9]]) {
        L.dot(rx, ry, 3.2, { color: '#5d6466', height: 205, rough: 110 });
        L.dot(rx - 0.8, ry - 0.8, 1.2, { color: 'rgba(255,255,255,0.35)' });
      }
    }
    if (vents && (i + j) % 2 === 1) {
      for (let k = 0; k < 7; k++) L.rect(x + cw * 0.22, y + ch * 0.52 + k * 11, cw * 0.56, 5, { color: '#0b0f0f', height: 40, rough: 200 });
    }
    edgeWear(L, R, x + 2, y + 2, cw - 4, ch - 4, 90);
  }
  // deep seams
  for (let i = 0; i <= cols; i++) L.rect(i * cw - 3, 0, 6, size, { color: seam, height: 20, rough: 210 });
  for (let j = 0; j <= rows; j++) L.rect(0, j * ch - 3, size, 6, { color: seam, height: 20, rough: 210 });
  scratches(L, R, 70, 'rgba(170,178,178,0.26)');
  // random chips and a few rust blooms
  for (let i = 0; i < 40; i++) L.dot(R() * size, R() * size, 0.6 + R() * 1.6, { color: '#6f7779', height: 122, rough: 92 });
  for (let i = 0; i < 6; i++) {
    const x = R() * size, y = R() * size, r = 4 + R() * 10;
    const g = L.c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(110,62,30,0.55)'); g.addColorStop(1, 'rgba(110,62,30,0)');
    L.c.fillStyle = g; L.c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  grimeStreaks(L, R, 18);
  speckle(L.c, size, size, 5000, 0.06, R);
  speckle(L.r, size, size, 3000, 0.25, R);
  return L.finish({ normalStrength: 3 });
}

export function insulationSet({ base = '#b5aa8f', size = 512, seed = 7 } = {}) {
  const R = rng(seed);
  const L = new Layers(size, size, { base, height: 110, rough: 232 });
  const n = 4, s = size / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = i * s, y = j * s;
    const gh = L.h.createRadialGradient(x + s / 2, y + s / 2, 4, x + s / 2, y + s / 2, s * 0.62);
    gh.addColorStop(0, grey(200)); gh.addColorStop(1, grey(80));
    L.h.fillStyle = gh; L.h.fillRect(x, y, s, s);
    const gc = L.c.createRadialGradient(x + s / 2, y + s / 2, 4, x + s / 2, y + s / 2, s * 0.62);
    gc.addColorStop(0, 'rgba(255,250,235,0.10)'); gc.addColorStop(1, 'rgba(40,30,15,0.22)');
    L.c.fillStyle = gc; L.c.fillRect(x, y, s, s);
  }
  // stitch lines
  for (let k = 0; k <= n; k++) {
    for (let t = 0; t < size; t += 10) {
      L.rect(k * s - 1, t, 2, 6, { color: 'rgba(60,52,38,0.75)', height: 50 });
      L.rect(t, k * s - 1, 6, 2, { color: 'rgba(60,52,38,0.75)', height: 50 });
    }
  }
  // stains and scuffs
  mottle(L.c, size, size, 14, R, (r) => `rgba(120,95,50,${(0.06 + r() * 0.1).toFixed(2)})`);
  for (let i = 0; i < 4; i++) {
    const x = R() * size, y = R() * size, r = 18 + R() * 30;
    L.c.strokeStyle = 'rgba(110,85,40,0.1)'; L.c.lineWidth = 1.5;
    L.c.beginPath(); L.c.arc(x, y, r, 0, Math.PI * 2); L.c.stroke();
  }
  speckle(L.c, size, size, 7000, 0.07, R);
  speckle(L.h, size, size, 5000, 0.2, R);
  return L.finish({ normalStrength: 2 });
}

export function floorPlateSet({ base = '#2f3333', size = 512, seed = 3 } = {}) {
  const R = rng(seed);
  const L = new Layers(size, size, { base, height: 120, rough: 170 });
  // diamond tread
  for (let y = 0; y < size; y += 16) {
    for (let x = (y / 16) % 2 ? 8 : 0; x < size; x += 16) {
      L.h.save(); L.h.translate(x + 4, y + 4); L.h.rotate(((x + y) / 16) % 2 ? 0.7 : -0.7);
      L.h.fillStyle = grey(175); L.h.fillRect(-5, -1.5, 10, 3); L.h.restore();
      L.c.save(); L.c.translate(x + 4, y + 4); L.c.rotate(((x + y) / 16) % 2 ? 0.7 : -0.7);
      L.c.fillStyle = 'rgba(170,175,172,0.22)'; L.c.fillRect(-5, -1, 10, 2); L.c.restore();
    }
  }
  // worn path through the middle (smoother, lighter)
  const g = L.c.createLinearGradient(0, 0, size, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(150,152,148,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  L.c.fillStyle = g; L.c.fillRect(0, 0, size, size);
  const gr = L.r.createLinearGradient(0, 0, size, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(40,40,40,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  L.r.fillStyle = gr; L.r.fillRect(0, 0, size, size);
  // plate seams + screws
  L.rect(0, 0, size, 4, { color: '#121414', height: 30, rough: 220 });
  L.rect(0, 0, 4, size, { color: '#121414', height: 30, rough: 220 });
  for (const [x, y] of [[14, 14], [size - 14, 14], [14, size - 14], [size - 14, size - 14], [size / 2, 14], [14, size / 2]]) {
    L.dot(x, y, 4, { color: '#4a4f4f', height: 190, rough: 120 });
  }
  scratches(L, R, 110, 'rgba(160,162,158,0.22)');
  mottle(L.c, size, size, 20, R, (r) => `rgba(25,20,12,${(0.08 + r() * 0.14).toFixed(2)})`);
  speckle(L.c, size, size, 7000, 0.08, R);
  return L.finish({ normalStrength: 2.2 });
}

export function grateSet({ size = 256, seed = 11 } = {}) {
  const R = rng(seed);
  const L = new Layers(size, size, { base: '#323738', height: 180, rough: 130 });
  for (let r = 0; r < 16; r++) for (let k = 0; k < 4; k++) {
    const x = k * 64 + 6, y = r * 16 + 4;
    L.rect(x, y, 52, 8, { color: '#060707', height: 0, rough: 255 });
    L.rect(x, y + 8, 52, 1, { color: 'rgba(255,255,255,0.10)' });
  }
  L.rect(0, 0, size, 3, { color: '#181b1b', height: 90 });
  L.rect(0, 0, 3, size, { color: '#181b1b', height: 90 });
  scratches(L, R, 60, 'rgba(190,194,190,0.35)');
  speckle(L.c, size, size, 1600, 0.07, R);
  return L.finish({ normalStrength: 4 });
}

export function graphiteSet({ size = 256, seed = 5 } = {}) {
  const R = rng(seed);
  const L = new Layers(size, size, { base: '#2c3132', height: 130, rough: 140 });
  // brushed grain
  for (let y = 0; y < size; y += 2) {
    L.c.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${(R() * 0.05).toFixed(3)})`;
    L.c.fillRect(0, y, size, 1);
  }
  edgeWear(L, R, 0, 0, size, size, 110);
  scratches(L, R, 30, 'rgba(160,166,166,0.22)');
  for (const [x, y] of [[20, 20], [size - 20, 20], [20, size - 20], [size - 20, size - 20]]) {
    L.dot(x, y, 6, { color: '#4b5152', height: 220, rough: 110 });
    L.dot(x, y, 2.5, { color: '#1a1d1e', height: 150 });
  }
  grimeStreaks(L, R, 8);
  speckle(L.c, size, size, 1600, 0.07, R);
  return L.finish({ normalStrength: 2.5 });
}

export function ceilingSet({ size = 512, seed = 9 } = {}) {
  return paintedPanelSet({ base: '#232829', seam: '#0c0f0f', cols: 2, rows: 2, size, seed, vents: true });
}

export function beigePlasticSet({ size = 256, seed = 13 } = {}) {
  const R = rng(seed);
  const L = new Layers(size, size, { base: '#c4b896', height: 128, rough: 175 });
  speckle(L.h, size, size, 9000, 0.16, R);  // fine moulded texture
  mottle(L.c, size, size, 10, R, (r) => `rgba(140,110,50,${(0.05 + r() * 0.08).toFixed(2)})`); // yellowing
  for (let i = 0; i < 40; i++) {
    const x = R() * size, y = R() * size;
    L.line(x, y, x + (R() - 0.5) * 30, y + (R() - 0.5) * 8, 0.8, { color: 'rgba(80,70,50,0.35)', height: 118, rough: 140 });
  }
  speckle(L.c, size, size, 2500, 0.05, R);
  return L.finish({ normalStrength: 1.2 });
}

export function rubberSet({ size = 256, seed = 17 } = {}) {
  const R = rng(seed);
  const L = new Layers(size, size, { base: '#262b29', height: 110, rough: 225 });
  for (let y = 12; y < size; y += 24) for (let x = 12; x < size; x += 24) {
    L.dot(x, y, 6, { color: '#2e3431', height: 190 });
  }
  L.rect(0, 0, size, 2, { color: '#121514', height: 40 });
  L.rect(0, 0, 2, size, { color: '#121514', height: 40 });
  mottle(L.c, size, size, 10, R, (r) => `rgba(0,0,0,${(0.1 + r() * 0.12).toFixed(2)})`);
  speckle(L.c, size, size, 2500, 0.06, R);
  return L.finish({ normalStrength: 2 });
}

export function hazardSet({ size = 256, seed = 19 } = {}) {
  const R = rng(seed);
  const L = new Layers(size, size, { base: '#17191a', height: 128, rough: 160 });
  L.c.fillStyle = '#c99a25';
  for (let i = -2; i < 6; i++) {
    L.c.beginPath();
    L.c.moveTo(i * 64, size); L.c.lineTo(i * 64 + 32, size); L.c.lineTo(i * 64 + 32 + size, 0); L.c.lineTo(i * 64 + size, 0);
    L.c.closePath(); L.c.fill();
  }
  for (let i = 0; i < 220; i++) L.dot(R() * size, R() * size, 0.8 + R() * 2.5, { color: '#7d8284', height: 118, rough: 95 });
  grimeStreaks(L, R, 8);
  speckle(L.c, size, size, 1500, 0.12, R);
  return L.finish({ normalStrength: 1.5 });
}

export function doorSet({ seed = 23 } = {}) {
  const W = 256, H = 512, R = rng(seed);
  const L = new Layers(W, H, { base: '#355a5b', height: 132, rough: 150 });
  L.rect(12, 12, W - 24, H - 24, { height: 140 });
  L.c.strokeStyle = 'rgba(0,0,0,0.45)'; L.c.lineWidth = 3; L.c.strokeRect(12, 12, W - 24, H - 24);
  // viewport
  L.rect(W * 0.3, 54, W * 0.4, 72, { color: '#0a0d0e', height: 40, rough: 30 });
  L.rect(W * 0.3 + 4, 58, W * 0.4 - 8, 64, { color: 'rgba(120,190,190,0.18)' });
  // hazard band
  const band = H * 0.52;
  L.c.save(); L.c.beginPath(); L.c.rect(12, band - 24, W - 24, 48); L.c.clip();
  L.c.fillStyle = '#17191a'; L.c.fillRect(12, band - 24, W - 24, 48);
  L.c.fillStyle = '#c99a25';
  for (let x = -60; x < W + 60; x += 40) { L.c.beginPath(); L.c.moveTo(x, band + 24); L.c.lineTo(x + 20, band + 24); L.c.lineTo(x + 68, band - 24); L.c.lineTo(x + 48, band - 24); L.c.closePath(); L.c.fill(); }
  L.c.restore();
  // vent slots lower
  for (let k = 0; k < 7; k++) L.rect(W * 0.25, H * 0.73 + k * 12, W * 0.5, 5, { color: '#0b0f0f', height: 30, rough: 220 });
  edgeWear(L, R, 12, 12, W - 24, H - 24, 260);
  scratches(L, R, 40, 'rgba(170,178,178,0.3)');
  grimeStreaks(L, R, 10, H * 0.5);
  speckle(L.c, W, H, 2500, 0.07, R);
  return L.finish({ normalStrength: 3, repeat: false });
}

export function containerSet(hex, label, seed = 29) {
  const S = 256, R = rng(seed);
  const L = new Layers(S, S, { base: hex, height: 128, rough: 170 });
  for (let x = 0; x < S; x += 16) {
    L.rect(x, 0, 5, S, { color: 'rgba(0,0,0,0.25)', height: 70 });
    L.rect(x + 6, 0, 2, S, { color: 'rgba(255,255,255,0.08)', height: 190 });
  }
  L.rect(0, 0, S, 10, { color: 'rgba(0,0,0,0.35)', height: 200 });
  L.rect(0, S - 10, S, 10, { color: 'rgba(0,0,0,0.35)', height: 200 });
  for (let i = 0; i < 500; i++) L.dot(R() * S, R() * S, 1 + R() * 2.5, { color: `rgba(95,52,24,${(R() * 0.45).toFixed(2)})`, rough: 220 });
  if (label) {
    L.c.font = 'bold 54px "Arial Narrow", Impact, sans-serif';
    L.c.textAlign = 'center'; L.c.textBaseline = 'middle';
    L.c.fillStyle = 'rgba(230,226,210,0.8)';
    L.c.fillText(label, S / 2, S / 2);
    stencilWear(L.c, S, S, R, 260);
  }
  speckle(L.c, S, S, 1500, 0.08, R);
  return L.finish({ normalStrength: 2, repeat: false });
}

function stencilWear(ctx, w, h, R, count) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = `rgba(0,0,0,${(0.2 + R() * 0.6).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(R() * w, R() * h, 0.6 + R() * 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------- decals ----------
// Spray-stencil text with worn edges; transparent background
export function stencilTexture(text, { w = 512, h = 128, color = 'rgba(225,222,205,0.85)', seed = 31, font = 'bold', wear = 380 } = {}) {
  const R = rng(seed);
  const [c, g] = canvas(w, h);
  let size = Math.floor(h * 0.7);
  const fam = '"Arial Narrow", "Helvetica Neue Condensed Bold", Impact, sans-serif';
  g.font = `${font} ${size}px ${fam}`;
  while (g.measureText(text).width > w * 0.94 && size > 8) { size -= 2; g.font = `${font} ${size}px ${fam}`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2 + 2);
  // stencil bridges: thin vertical gaps
  g.save(); g.globalCompositeOperation = 'destination-out';
  const tw = g.measureText(text).width;
  for (let x = w / 2 - tw / 2; x < w / 2 + tw / 2; x += size * 0.55) g.fillRect(x + R() * 4, h * 0.45, 2, h * 0.1);
  g.restore();
  stencilWear(g, w, h, R, wear);
  // overspray
  g.save(); g.globalAlpha = 0.08; g.filter = 'blur(2px)'; g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 2); g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Weathered printed warning label (yellow/black or red/white)
export function warningLabelTexture(lines, { w = 512, h = 256, bg = '#d5a623', fg = '#141414', seed = 37 } = {}) {
  const R = rng(seed);
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24);
  // triangle icon
  g.fillStyle = fg;
  g.beginPath(); g.moveTo(70, 50); g.lineTo(120, 140); g.lineTo(20, 140); g.closePath(); g.fill();
  g.fillStyle = bg; g.font = 'bold 70px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('!', 70, 133);
  g.fillStyle = fg; g.textAlign = 'left'; g.textBaseline = 'top';
  lines.forEach((ln, i) => {
    g.font = `bold ${i === 0 ? 44 : 26}px "Arial Narrow", Arial, sans-serif`;
    g.fillText(ln, 145, 40 + (i === 0 ? 0 : 50 + (i - 1) * 32), w - 165);
  });
  // weathering: stains, scuffs, peeled corner
  mottle(g, w, h, 10, R, (r) => `rgba(70,50,20,${(0.08 + r() * 0.15).toFixed(2)})`);
  stencilWear(g, w, h, R, 300);
  g.save(); g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(w, h); g.lineTo(w - 40 - R() * 30, h); g.lineTo(w, h - 30 - R() * 30); g.fill(); g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Clean small text label (instrument labels, signs)
export function labelTexture(text, { w = 512, h = 96, fg = '#cfe9e4', bg = null, family = 'Menlo, "SF Mono", monospace', weight = 'bold' } = {}) {
  const [c, g] = canvas(w, h);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  let size = Math.floor(h * 0.62);
  g.font = `${weight} ${size}px ${family}`;
  while (g.measureText(text).width > w * 0.92 && size > 8) { size -= 2; g.font = `${weight} ${size}px ${family}`; }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Paper sheet with typed lines (readable up close)
export function paperTexture(title, lines, { w = 512, h = 680, seed = 41, tint = '#e8e1cc' } = {}) {
  const R = rng(seed);
  const [c, g] = canvas(w, h);
  g.fillStyle = tint; g.fillRect(0, 0, w, h);
  mottle(g, w, h, 10, R, (r) => `rgba(150,120,70,${(0.05 + r() * 0.08).toFixed(2)})`);
  g.fillStyle = '#1d1d1d';
  g.font = 'bold 30px "Courier New", Courier, monospace';
  g.fillText(title, 30, 56);
  g.fillRect(30, 70, w - 60, 2);
  g.font = '22px "Courier New", Courier, monospace';
  lines.forEach((ln, i) => g.fillText(ln, 30, 110 + i * 34, w - 60));
  // pin hole + crease
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(w / 2, 16, 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, h * 0.5, w, 2);
  speckle(g, w, h, 2500, 0.05, R);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Faded crew photo: six figures at a window (no faces, just silhouettes)
export function photoTexture({ w = 384, h = 288, seed = 43 } = {}) {
  const R = rng(seed);
  const [c, g] = canvas(w, h);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#1d2a35'); grd.addColorStop(1, '#3a3f3c');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = '#4a6d8a'; g.beginPath(); g.arc(w * 0.5, h * 1.25, h * 0.9, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 6; i++) {
    const x = w * (0.16 + i * 0.135), y = h * 0.55;
    g.fillStyle = ['#c8a07a', '#8c6a4f', '#d9b48f', '#6e5240', '#b88f6b', '#a07c5c'][i];
    g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.fill();
    g.fillStyle = ['#2e4b5c', '#3d3d3d', '#5c4a2e', '#2e3d5c', '#4b2e2e', '#3a5c4b'][i];
    g.fillRect(x - 22, y + 16, 44, 90);
  }
  g.fillStyle = 'rgba(255,240,200,0.12)'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f2ecdc'; g.fillRect(0, h - 40, w, 40);
  g.fillStyle = '#2a2a2a'; g.font = 'italic 20px "Bradley Hand", "Comic Sans MS", cursive';
  g.fillText('ECHO-9 · year three · all six of us', 14, h - 14);
  g.strokeStyle = '#f2ecdc'; g.lineWidth = 12; g.strokeRect(0, 0, w, h);
  speckle(g, w, h, 2500, 0.08, R);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function grilleNormal({ size = 128 } = {}) {
  const [hc, h] = canvas(size, size);
  h.fillStyle = grey(170); h.fillRect(0, 0, size, size);
  h.fillStyle = grey(20);
  for (let y = 6; y < size; y += 10) for (let x = (y / 10) % 2 ? 11 : 6; x < size; x += 10) { h.beginPath(); h.arc(x, y, 3, 0, Math.PI * 2); h.fill(); }
  return tex(normalFromHeight(hc, 4), { color: false });
}

export function circleMaskTexture(ratio) {
  const S = 256, [c, g] = canvas(S, S);
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#000'; g.beginPath(); g.arc(S / 2, S / 2, (S / 2) * ratio, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ---------- space ----------
export function starTexture() {
  const W = 2048, H = 1024, [c, g] = canvas(W, H), R = rng(51);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const x = (i / 260) * W + (R() - 0.5) * 80;
    const y = H * 0.5 + Math.sin((x / W) * Math.PI * 2) * H * 0.18 + (R() - 0.5) * 140;
    const r = 40 + R() * 110, a = 0.03 + R() * 0.04;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(120,140,190,${a.toFixed(3)})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 9000; i++) {
    const x = R() * W, y = R() * H, b = R();
    const s = b > 0.995 ? 2.2 : b > 0.97 ? 1.5 : 1, tint = R();
    const col = tint < 0.15 ? '200,215,255' : tint > 0.9 ? '255,230,200' : '255,255,255';
    g.fillStyle = `rgba(${col},${(0.25 + b * 0.75).toFixed(2)})`;
    g.fillRect(x, y, s, s);
  }
  return tex(c, { repeat: false });
}

function makeFbm(octaves, base, R) {
  const layers = [];
  for (let o = 0; o < octaves; o++) {
    const nx = base * (1 << o), ny = Math.max(2, nx >> 1);
    const arr = new Float32Array(nx * (ny + 1));
    for (let i = 0; i < arr.length; i++) arr[i] = R();
    layers.push({ nx, ny, arr });
  }
  return (u, v) => {
    let sum = 0, amp = 0.5, norm = 0;
    for (const Ly of layers) {
      const x = u * Ly.nx, y = v * Ly.ny;
      const x0 = Math.floor(x), y0 = Math.min(Math.floor(y), Ly.ny - 1);
      const fx = x - x0, fy = Math.min(1, y - y0);
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const xa = ((x0 % Ly.nx) + Ly.nx) % Ly.nx, xb = (xa + 1) % Ly.nx;
      const r0 = y0 * Ly.nx, r1 = (y0 + 1) * Ly.nx;
      const a = Ly.arr[r0 + xa], b = Ly.arr[r0 + xb], cc = Ly.arr[r1 + xa], d = Ly.arr[r1 + xb];
      sum += amp * ((a + (b - a) * sx) * (1 - sy) + (cc + (d - cc) * sx) * sy);
      norm += amp; amp *= 0.5;
    }
    return sum / norm;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;

export function earthTexture() {
  const W = 1024, H = 512, [c, g] = canvas(W, H), R = rng(53);
  const img = g.createImageData(W, H), data = img.data;
  const land = makeFbm(6, 4, R), detail = makeFbm(4, 16, R);
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1), lat = Math.abs(v - 0.5) * 2;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const h = land(u, v) + (detail(u, v) - 0.5) * 0.12;
      let r, gg, b;
      if (lat > 0.88 || (lat > 0.74 && h > 0.47)) { r = 225; gg = 232; b = 238; }
      else if (h > 0.53) {
        const k = Math.min(1, (h - 0.53) / 0.2);
        const des = Math.max(0, 1 - Math.abs(lat - 0.35) / 0.2) * 0.75;
        r = lerp(lerp(52, 150, des), 120, k * 0.6);
        gg = lerp(lerp(84, 125, des), 110, k * 0.6);
        b = lerp(lerp(40, 80, des), 95, k * 0.6);
      } else {
        const dpt = Math.min(1, (0.53 - h) * 6);
        r = lerp(28, 6, dpt); gg = lerp(80, 24, dpt); b = lerp(130, 62, dpt);
      }
      const i = (y * W + x) * 4;
      data[i] = r; data[i + 1] = gg; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c);
}

export function cloudTexture() {
  const W = 1024, H = 512, [c, g] = canvas(W, H), R = rng(59);
  const img = g.createImageData(W, H), data = img.data;
  const n = makeFbm(5, 6, R);
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    for (let x = 0; x < W; x++) {
      let a = Math.max(0, Math.min(1, (n(x / W, v) - 0.5) / 0.2));
      a = a * a * (3 - 2 * a);
      const i = (y * W + x) * 4;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = a * 230;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c);
}

export function solarTexture() {
  const W = 512, H = 256, [c, g] = canvas(W, H);
  const grd = g.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, '#0d2244'); grd.addColorStop(1, '#081830');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#2a4a78'; g.lineWidth = 2;
  for (let x = 0; x <= W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = '#6a7a8a'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
  return tex(c, { repeat: false });
}
