import * as THREE from 'three';

// Phosphor-style terminal displays: dark glass, restrained cyan text, amber/red for status only.
const CY = '#8fe9df', CY2 = 'rgba(143,233,223,0.62)', DIM = 'rgba(143,233,223,0.22)', BG = '#020a09';
const AMB = '#f0a83c', RED = '#ff5a4a', GRN = '#7ff0a0';
const font = (px, bold = false) => `${bold ? 'bold ' : ''}${Math.round(px)}px Menlo, Monaco, "SF Mono", monospace`;

export class ScreenTexture {
  constructor(w, h, draw, fps = 8) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.draw = draw;
    this.fps = fps;
    this.acc = Math.random();
    this.visible = true;
    this.render(0);
  }
  render(t) { this.draw(this.ctx, this.canvas.width, this.canvas.height, t); this.texture.needsUpdate = true; }
  update(dt, t) {
    if (!this.fps || !this.visible) return;
    this.acc += dt;
    if (this.acc >= 1 / this.fps) { this.acc = 0; this.render(t); }
  }
}

function frame(g, w, h, title, color = CY) {
  g.fillStyle = BG; g.fillRect(0, 0, w, h);
  const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.75);
  grd.addColorStop(0, 'rgba(143,233,223,0.07)'); grd.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.textBaseline = 'top';
  if (!title) return 14;
  g.fillStyle = color; g.font = font(h * 0.08, true);
  g.fillText(title, 16, 14);
  g.fillStyle = DIM; g.fillRect(16, 20 + h * 0.085, w - 32, 2);
  return 28 + h * 0.1;
}

function scan(g, w, h, t) {
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  const by = ((t * 50) % (h + 40)) - 40;
  g.fillStyle = 'rgba(143,233,223,0.04)'; g.fillRect(0, by, w, 24);
  // vignette, as on a curved tube
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v; g.fillRect(0, 0, w, h);
}

const cursor = (g, x, y, h, t) => { if (Math.sin(t * 6) > 0) { g.fillStyle = CY; g.fillRect(x, y, h * 0.035, h * 0.06); } };

export const Draw = {
  sector: (title, lines) => (g, w, h, t) => {
    const top = frame(g, w, h, title);
    g.font = font(h * 0.062);
    lines.forEach((l, i) => { g.fillStyle = i === 0 ? CY : CY2; g.fillText(l, 18, top + 8 + i * h * 0.1); });
    const bx = w * 0.62, bw = w * 0.32, n = 6, base = h - 22, bh = h * 0.3;
    for (let i = 0; i < n; i++) {
      const v = 0.3 + 0.7 * Math.abs(Math.sin(t * 0.7 + i * 1.7));
      g.fillStyle = DIM; g.fillRect(bx + i * (bw / n), base - bh, bw / n - 6, bh);
      g.fillStyle = CY2; g.fillRect(bx + i * (bw / n), base - bh * v, bw / n - 6, bh * v);
    }
    cursor(g, 18, h - 26, h, t);
    scan(g, w, h, t);
  },

  waveform: (title) => (g, w, h, t) => {
    const top = frame(g, w, h, title);
    const mid = (top + h - 30) / 2;
    g.strokeStyle = DIM; g.lineWidth = 1;
    for (let x = 20; x < w - 20; x += 40) { g.beginPath(); g.moveTo(x, top + 6); g.lineTo(x, h - 40); g.stroke(); }
    g.beginPath(); g.moveTo(20, mid); g.lineTo(w - 20, mid); g.stroke();
    g.strokeStyle = CY; g.lineWidth = 2; g.beginPath();
    for (let x = 20; x < w - 20; x += 3) {
      const u = x * 0.02 + t * 2.0;
      const y = mid + Math.sin(u) * h * 0.12 * Math.sin(u * 0.13 + t * 0.4) + Math.sin(u * 3.7) * h * 0.035 + (Math.random() - 0.5) * h * 0.012;
      if (x === 20) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = AMB; g.font = font(h * 0.06);
    g.fillText('PATTERN CLASS: UNRESOLVED', 18, h - 18 - h * 0.07);
    scan(g, w, h, t);
  },

  pressure: (get) => (g, w, h, t) => {
    const p = get();
    const top = frame(g, w, h, 'AIRLOCK 01 · PRESSURE');
    const col = p.status === 'done' ? GRN : p.status === 'cycling' ? AMB : RED;
    g.font = font(h * 0.07); g.fillStyle = CY2;
    g.fillText('CHAMBER kPa', 18, top + 4); g.fillText('STATION kPa', w * 0.55, top + 4);
    g.font = font(h * 0.17, true);
    g.fillStyle = col; g.fillText(p.chamber.toFixed(1), 18, top + 4 + h * 0.09);
    g.fillStyle = CY; g.fillText(p.station.toFixed(1), w * 0.55, top + 4 + h * 0.09);
    const frac = Math.max(0, Math.min(1, (p.chamber - 60) / (101.3 - 60)));
    g.fillStyle = DIM; g.fillRect(18, h * 0.68, w - 36, h * 0.07);
    g.fillStyle = col; g.fillRect(18, h * 0.68, (w - 36) * frac, h * 0.07);
    g.font = font(h * 0.07, true);
    const label = p.status === 'done' ? 'EQUALISED' : p.status === 'cycling' ? 'CYCLING…' : 'UNEQUAL · CYCLE REQUIRED';
    if (p.status !== 'unequal' || Math.sin(t * 5) > -0.3) { g.fillStyle = col; g.fillText(label, 18, h * 0.8); }
    scan(g, w, h, t);
  },

  // Analogue dial (drawn, not a screen glow)
  gauge: (get, label) => (g, w, h) => {
    const v = get();
    g.fillStyle = '#d8d2bd'; g.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.56, r = w * 0.4;
    g.strokeStyle = '#222'; g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 2.2); g.stroke();
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.8 + (i / 10) * Math.PI * 1.4;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke();
    }
    g.strokeStyle = '#b02a20'; g.lineWidth = 6;
    g.beginPath(); g.arc(cx, cy, r * 0.92, Math.PI * 0.8, Math.PI * 1.1); g.stroke();
    const a = Math.PI * 0.8 + Math.max(0, Math.min(1, v)) * Math.PI * 1.4;
    g.strokeStyle = '#111'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85); g.stroke();
    g.fillStyle = '#111'; g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2); g.fill();
    g.font = 'bold 18px Arial, sans-serif'; g.textAlign = 'center'; g.fillText(label, cx, h * 0.9); g.textAlign = 'left';
  },

  cargo: (get) => (g, w, h, t) => {
    const s = get();
    const top = frame(g, w, h, 'CARGO CONTROL · DOCK B');
    g.font = font(h * 0.06);
    const rows = ['DOCK B ........ OCCUPIED', 'ARV-112 ....... CLAMPED', 'REGISTER ...... 2 ENTRIES', s.granted ? 'SECURITY ...... UNLOCKED' : 'SECURITY ...... LOCKED'];
    rows.forEach((r, i) => { g.fillStyle = i === 3 && !s.granted ? AMB : CY2; g.fillText(r, 18, top + 6 + i * h * 0.095); });
    if (Math.sin(t * 4) > 0) { g.fillStyle = AMB; g.fillText('! DUPLICATE CREDENTIAL', 18, top + 6 + 4.2 * h * 0.095); }
    g.fillStyle = CY; g.fillText('> PRESS E TO ACCESS', 18, h - 20 - h * 0.06);
    scan(g, w, h, t);
  },

  security: (get) => (g, w, h, t) => {
    const s = get();
    const top = frame(g, w, h, 'SECURITY · S-01');
    g.font = font(h * 0.06);
    const rows = [
      [`LOCKDOWN ...... ${s.released ? 'LIFTED' : 'ACTIVE'}`, s.released ? GRN : RED],
      [`RELEASE ....... ${s.authorised ? 'AUTHORISED' : 'LOCKED'}`, s.authorised ? GRN : AMB],
      ['CAM ARCHIVE ... 1 FLAGGED', AMB],
      ['OPERATOR ...... VOSS, M.', CY2],
    ];
    rows.forEach(([r, c], i) => { g.fillStyle = c; g.fillText(r, 18, top + 6 + i * h * 0.095); });
    g.fillStyle = CY; g.fillText('> PRESS E TO ACCESS', 18, h - 20 - h * 0.06);
    scan(g, w, h, t);
  },

  cams: (id) => (g, w, h, t) => {
    g.fillStyle = '#030606'; g.fillRect(0, 0, w, h);
    const vx = w * (0.45 + 0.1 * Math.sin(id)), vy = h * 0.45;
    g.strokeStyle = 'rgba(120,180,170,0.35)'; g.lineWidth = 1.5;
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(vx, vy); g.stroke(); }
    g.strokeRect(vx - w * 0.12, vy - h * 0.14, w * 0.24, h * 0.28);
    if (id === 2 && (t % 20) < 1.4) {
      g.fillStyle = 'rgba(10,14,14,0.95)';
      g.beginPath(); g.ellipse(vx, vy - h * 0.06, w * 0.022, h * 0.05, 0, 0, Math.PI * 2); g.fill();
      g.fillRect(vx - w * 0.035, vy - h * 0.01, w * 0.07, h * 0.16);
    }
    for (let i = 0; i < 300; i++) {
      const v = (Math.random() * 90) | 0;
      g.fillStyle = `rgba(${v},${v + 20},${v + 15},0.35)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 1);
    }
    if (Math.random() < 0.05) { g.fillStyle = 'rgba(200,255,240,0.15)'; g.fillRect(0, Math.random() * h, w, 6); }
    g.textBaseline = 'top'; g.font = font(h * 0.09); g.fillStyle = 'rgba(180,240,220,0.8)';
    g.fillText(`CAM 0${id}`, 8, 6);
    const ts = `09:${String(41 + (Math.floor(t / 60) % 18)).padStart(2, '0')}:${String(Math.floor(t) % 60).padStart(2, '0')}`;
    g.fillText(ts, w - 8 - g.measureText(ts).width, 6);
    if (Math.sin(t * 3) > 0) { g.fillStyle = RED; g.beginPath(); g.arc(14, h - 14, 4, 0, Math.PI * 2); g.fill(); }
    scan(g, w, h, t);
  },

  map: () => (g, w, h, t) => {
    const top = frame(g, w, h, 'ECHO-9 · DECK A');
    const X = (x) => 20 + ((x + 10) / 48) * (w - 40);
    const Z = (z) => top + 6 + ((z + 31) / 39) * (h - top - 26);
    const rooms = [
      ['AIRLOCK', -2, 2, 0, 6], ['CARGO BAY', -8, 8, -16, 0], ['', 8, 20, -13.5, -10.5],
      ['SECURITY', 20, 28, -16, -8], ['CREW HUB', 18, 30, -28, -16], ['', 12, 18, -23.5, -20.5], ['MESS', 2, 12, -29, -17],
    ];
    const sealed = [['ENGINEERING', 20, 28, -31, -28, AMB], ['RESEARCH', 30, 36, -25.5, -18.5, RED], ['BUNKS', -4, 2, -26, -20, AMB]];
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(h * 0.036);
    for (const [n, x0, x1, z0, z1] of rooms) {
      const blink = n === 'SECURITY' && Math.sin(t * 4) > 0;
      g.fillStyle = blink ? 'rgba(143,233,223,0.25)' : 'rgba(143,233,223,0.07)';
      g.fillRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
      g.strokeStyle = CY2; g.lineWidth = 2; g.strokeRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
      if (n) { g.fillStyle = CY; g.fillText(n, (X(x0) + X(x1)) / 2, (Z(z0) + Z(z1)) / 2); }
    }
    g.setLineDash([6, 4]);
    for (const [n, x0, x1, z0, z1, c] of sealed) {
      g.strokeStyle = c; g.strokeRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
      g.fillStyle = c; g.fillText(n, (X(x0) + X(x1)) / 2, (Z(z0) + Z(z1)) / 2);
    }
    g.setLineDash([]);
    g.fillStyle = AMB; g.fillText('YOU ARE HERE', X(24), Z(-6.5));
    g.textAlign = 'left'; g.textBaseline = 'top';
    scan(g, w, h, t);
  },

  directory: (get) => (g, w, h, t) => {
    const rows = get();
    const top = frame(g, w, h, 'DIRECTORY');
    g.font = font(h * 0.04);
    rows.forEach(([name, status, kind], i) => {
      const y = top + 4 + i * h * 0.105;
      g.fillStyle = CY2; g.fillText(name, 14, y);
      g.fillStyle = kind === 'ok' ? GRN : kind === 'warn' ? AMB : RED;
      g.fillText(status, 14, y + h * 0.045);
    });
    scan(g, w, h, t);
  },

  clock: () => (g, w, h, t) => {
    g.fillStyle = '#050606'; g.fillRect(0, 0, w, h);
    const base = 9 * 3600 + 52 * 60;
    const s = Math.floor(base + t);
    const hh = String(Math.floor(s / 3600) % 24).padStart(2, '0'), mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
    g.fillStyle = '#ff7a3a'; g.font = font(h * 0.55, true); g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText(`${hh}${Math.sin(t * 6) > 0 ? ':' : ' '}${mm}`, w / 2, h * 0.45);
    g.font = font(h * 0.16); g.fillStyle = 'rgba(255,122,58,0.6)';
    g.fillText('STATION TIME · 2189-03-22', w / 2, h * 0.85);
    g.textAlign = 'left'; g.textBaseline = 'top';
  },

  galley: () => (g, w, h, t) => {
    const top = frame(g, w, h, 'GALLEY · DISPENSER 2');
    g.font = font(h * 0.07);
    g.fillStyle = CY2; g.fillText('LAST ORDER  03-13 19:42', 16, top + 6);
    g.fillStyle = CY2; g.fillText('ORDER BY    ANAND, P.', 16, top + 6 + h * 0.12);
    g.fillStyle = AMB; g.fillText('STATUS      NOT COLLECTED', 16, top + 6 + h * 0.24);
    if (Math.sin(t * 3) > 0) { g.fillStyle = RED; g.fillText('E-17 SERVICE HOLD', 16, top + 6 + h * 0.4); }
    scan(g, w, h, t);
  },
};
