import * as THREE from 'three';
import { Builder } from './Builder.js';
import { Door } from './Door.js';
import { Space } from './Space.js';
import { ScreenTexture, Draw } from './Screens.js';
import { containerSet, paperTexture, photoTexture } from './textures.js';
import { terminal, wallTerminal, strappedCrate, grabHandle, table, chair, mug, tray, cable, debris } from './Props.js';

// Phase One layout (metres). +X east, -Z north.
//   Airlock    x -2..2   z 0..6
//   Cargo Bay  x -8..8   z -16..0
//   Corridor   x 8..20   z -13.5..-10.5  (Earth window)
//   Security   x 20..28  z -16..-8
//   Crew Hub   x 18..30  z -28..-16
//   Crew corr. x 12..18  z -23.5..-20.5
//   Mess Hall  x 2..12   z -29..-17
export class Station {
  constructor(scene, env) {
    this.b = new Builder(scene);
    this.env = env;
    this.colliders = this.b.colliders;
    this.blockers = this.b.blockers;
    this.doors = new Map();
    this.hooks = {};
    this.dynamic = {};
    this.emitters = [];
    this.spawnPoint = new THREE.Vector3(0, 0, 4.0);
    this.spawnYaw = Math.PI; // facing the airlock window
    this.zones = [
      { id: 'cargo', minX: -8, maxX: 8, minZ: -16, maxZ: 0 },
      { id: 'security', minX: 20, maxX: 28, minZ: -16, maxZ: -8 },
      { id: 'hub', minX: 18, maxX: 30, minZ: -28, maxZ: -16 },
      { id: 'mess', minX: 2, maxX: 12, minZ: -29, maxZ: -17 },
    ];

    this.hemi = new THREE.HemisphereLight(0x6485a5, 0x0c0e0e, 0.14);
    scene.add(this.hemi);
    this.space = new Space(scene);

    this._airlock();
    this._cargo();
    this._corridor();
    this._security();
    this._hub();
    this._crewCorridor();
    this._mess();

    // Merge static geometry for performance (keep anything interactive or moving separate)
    const keep = new Set([this.dynamic.lever, this.dynamic.recLed, this.dynamic.cycleBtn]);
    for (const list of Object.values(this.hooks)) for (const m of list) keep.add(m);
    for (const d of this.doors.values()) keep.add(d.group);
    this.mergeStats = this.b.finalize(keep, (x, z) => this.roomAt(x, z));
  }

  door(opts) {
    const d = new Door(this.b, opts);
    this.doors.set(opts.id, d);
    return d;
  }

  _screenAt(st, x, y, z) { st.pos = { x, y, z }; return st; }

  // ---------------- 1. ARRIVAL AIRLOCK ----------------
  _airlock() {
    const b = this.b, M = b.mat, H = 3.2;
    b.room = 'airlock';
    const style = { upper: M.insulation, lower: M.tealLow, band: 1.1 };
    b.roomShell({ x0: -2, x1: 2, z0: 0, z1: 6, H, floor: 'grate', floorTile: 1.7,
      walls: { s: [{ c: 0, w: 2.2, y0: 0.5, h: 2.2 }], w: [], e: [] }, style });
    b.porthole(0, 1.6, 6, Math.PI, { wallMat: M.insulation });
    b.stencil('AIRLOCK 01 · DOCK B', 1.7, 0.22, 0, 3.0, 5.84, Math.PI);
    for (const z of [1.2, 2.7, 4.2]) b.rib(0, z, false, 2, H);

    // Pressure display + cycle control (east wall)
    const ps = this._screenAt(new ScreenTexture(512, 288, Draw.pressure(this.env.getPressure), 10), 1.85, 1.85, 3.45);
    const wt = wallTerminal(b, { x: 1.85, y: 1.9, z: 3.45, rotY: -Math.PI / 2, screen: ps, sw: 0.5, sh: 0.3 });
    const btnBase = b.cyl(0.09, 0.06, 1.81, 1.18, 3.45, 'x', M.graphite, { seg: 16 });
    const btn = b.cyl(0.065, 0.06, 1.76, 1.18, 3.45, 'x', M.amber.clone(), { seg: 16 });
    b.warning(['CYCLE BEFORE OPENING', 'Equalise chamber pressure', 'Inner door interlocked'], 0.5, 1.845, 2.56, 3.45, -Math.PI / 2, { seed: 61 });
    b.collider(1.6, 1.86, 3.1, 3.8);
    this.hooks.cycle = [btn, btnBase, ...wt.hit];
    this.dynamic.cycleBtn = btn;

    // Analogue gauges either side of the outer hatch
    const gaugeVal = () => (this.env.getPressure().chamber - 60) / 50;
    for (const [x, lbl] of [[-1.3, 'CHAMBER'], [1.3, 'STATION']]) {
      const gt = this._screenAt(new ScreenTexture(160, 160, Draw.gauge(lbl === 'CHAMBER' ? gaugeVal : () => 0.83, lbl), 6), x, 2.3, 5.8);
      b.cyl(0.17, 0.06, x, 2.3, 5.83, 'z', M.graphite, { seg: 20 });
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.14, 24), new THREE.MeshStandardMaterial({ map: gt.texture, roughness: 0.4 }));
      m.position.set(x, 2.3, 5.79); m.rotation.y = Math.PI;
      b.group.add(m);
      b.screens.add(gt);
    }

    // Suit lockers (west wall) — locker 3 hangs open and empty
    const lockers = [];
    [3.09, 3.45, 3.81].forEach((z, i) => {
      lockers.push(b.box(0.45, 2.0, 0.35, -1.625, 1.0, z, M.graphite));
      b.box(0.02, 0.06, 0.12, -1.39, 1.1, z, M.steel, { cast: false });
      if (i === 2) {
        lockers.push(b.vplane(0.3, 1.86, -1.398, 1.0, z, Math.PI / 2, M.voidMat));
        lockers.push(b.box(0.025, 1.86, 0.33, -1.25, 1.0, z + 0.28, M.tealLow, { ry: 1.1 }));
        lockers.push(b.stencil('VOSS M.', 0.3, 0.08, -1.396, 1.88, z, Math.PI / 2, { color: 'rgba(240,190,90,0.9)' }));
      } else {
        lockers.push(b.box(0.02, 1.86, 0.32, -1.39, 1.0, z, M.tealLow));
        b.stencil(`0${i + 1}`, 0.12, 0.08, -1.375, 1.88, z, Math.PI / 2);
      }
    });
    b.collider(-1.85, -1.38, 2.9, 4.0);
    this.hooks.locker = lockers;

    // Grab handles, equipment case, seal hardware
    for (const z of [1.9, 5.0]) {
      grabHandle(b, -1.85, 1.5, z, { axis: 'y', len: 0.55, dir: [1, 0, 0] });
      grabHandle(b, 1.85, 1.5, z, { axis: 'y', len: 0.55, dir: [-1, 0, 0] });
    }
    b.box(0.62, 0.28, 0.42, -0.9, 0.14, 1.7, M.darkMatte, { ry: 0.4 });
    b.box(0.2, 0.04, 0.04, -0.9, 0.3, 1.7, M.steel, { ry: 0.4, cast: false });
    b.box(0.64, 0.02, 0.44, -0.9, 0.2, 1.7, M.paint, { ry: 0.4, cast: false });
    cable(b, { x: 1.84, y: 2.9, z: 2.0 }, { x: 1.84, y: 2.85, z: 4.9 }, 0.25, 0.018);

    b.light(0, 2.95, 1.95, 0xb9ddff, 6, 7, { panel: M.ivoryPanel, panelSize: [0.3, 0.05, 0.9] });
    b.light(0, 2.95, 3.45, 0xb9ddff, 5, 7, { panel: M.ivoryPanel, panelSize: [0.3, 0.05, 0.9] });
    b.box(0.22, 0.12, 0.08, 0, 2.95, 0.2, M.red, { cast: false });
    this.dynamic.alarm = b.light(0, 2.6, 0.7, 0xff3020, 3, 5, { flicker: 'emergency' });

    this.door({ id: 'airlock', x: 0, z: 0, axis: 'x', state: 'sealed',
      labels: { pos: 'CARGO BAY', neg: 'AIRLOCK 01' }, lockedMsg: 'Pressure unequal — use the cycle control.' });
  }

  // ---------------- 2. CARGO BAY ----------------
  _cargo() {
    const b = this.b, M = b.mat, H = 7;
    b.room = 'cargo';
    const style = { upper: M.teal, lower: M.tealLow, band: 1.4 };
    b.roomShell({ x0: -8, x1: 8, z0: -16, z1: 0, H, floor: 'floor', floorTile: 2.5,
      walls: { n: [], s: [{ c: 0, w: 2.2 }], w: [], e: [{ c: -12, w: 2.2 }] }, style });

    // Structural columns (I-beams) along the walls
    for (const z of [-4, -8, -12]) {
      for (const s of [-1, 1]) {
        if (s > 0 && z === -12) continue; // door to the corridor
        const x = s * 7.62;
        b.box(0.12, H, 0.36, x, H / 2, z, M.graphite, { collide: true });
        b.box(0.36, H, 0.06, x + s * 0.12, H / 2, z - 0.15, M.graphite);
        b.box(0.36, H, 0.06, x + s * 0.12, H / 2, z + 0.15, M.graphite);
      }
    }

    // Loading lane + rails
    for (const x of [-2.2, 2.2]) b.plane(0.15, 14, x, 0.008, -8, M.hazard, { repeat: [0.3, 28] });
    for (const x of [-3.2, 3.2]) b.box(0.12, 0.05, 15, x, 0.025, -8, M.steel, { cast: false });

    // Roof trusses + crane
    for (const z of [-2, -6, -10, -14]) {
      b.box(16, 0.35, 0.3, 0, 6.7, z, M.graphite, { cast: false });
      for (let x = -7; x <= 7; x += 2) b.box(0.08, 0.5, 0.08, x, 6.4, z, M.graphite, { rz: 0.6, cast: false });
    }
    for (const x of [-5.5, 5.5]) b.box(0.3, 0.3, 15.6, x, 6.35, -8, M.graphite, { cast: false });
    b.box(11.4, 0.5, 0.6, 0, 6.0, -9.5, M.paint);
    b.stencil('SWL 4 T', 1.2, 0.3, 0, 6.0, -9.19, 0, { color: 'rgba(20,20,20,0.85)' });
    b.box(1.0, 0.6, 0.9, 1.2, 5.5, -9.5, M.dark);
    b.cyl(0.03, 2.4, 1.2, 4.0, -9.5, 'y', M.steel);
    b.box(0.45, 0.55, 0.35, 1.2, 2.55, -9.5, M.paint);
    b.warning(['OVERHEAD LOAD', 'Keep clear of crane path'], 1.0, -7.83, 3.0, -9.5, Math.PI / 2, { seed: 63 });

    // Catwalk (west)
    b.box(2, 0.12, 14, -7, 3.6, -8, M.grate, { repeat: [2, 14] });
    for (let z = -15; z <= -1; z += 2) {
      b.box(0.06, 1.0, 0.06, -6.05, 4.16, z, M.graphite, { cast: false });
      b.box(0.1, 1.4, 0.1, -7.5, 2.95, z, M.graphite, { rz: 0.7, cast: false });
    }
    b.box(0.05, 0.05, 14, -6.05, 4.66, -8, M.paint, { cast: false });
    b.box(0.05, 0.05, 14, -6.05, 4.3, -8, M.graphite, { cast: false });

    // Containers
    const cMat = (hex, label, seed) => {
      const s = containerSet(hex, label, seed);
      return new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughnessMap: s.roughnessMap, roughness: 1, metalness: 0.4, envMapIntensity: 0.5 });
    };
    b.box(2.4, 2.4, 5, 5.6, 1.2, -4.5, cMat('#3d5c69', 'C-07', 71), { collide: true });
    b.box(2.4, 2.4, 5, 5.6, 3.6, -4.5, cMat('#7a4630', 'C-11', 72));
    b.box(2.4, 2.4, 5, -5.4, 1.2, -12.5, cMat('#56602f', 'C-12', 73), { collide: true });
    for (const [x, z] of [[5.6, -2.1], [5.6, -6.9]]) b.box(2.5, 0.08, 0.12, x, 0.04, z, M.strap, { cast: false }); // tie-down straps
    b.box(0.08, 4.9, 0.12, 4.35, 2.45, -4.5, M.strap, { cast: false });

    // Strapped crates (secured to floor rings)
    strappedCrate(b, -4.6, 0.6, -4.6, 1.2, M.crate);
    strappedCrate(b, -3.3, 0.6, -4.6, 1.2, M.crateB, 0.05);
    strappedCrate(b, -4.6, 0.6, -5.9, 1.2, M.crateB, -0.04);
    strappedCrate(b, -3.95, 1.8, -5.25, 1.2, M.crate, 0.1);
    b.collider(-5.25, -2.65, -6.55, -3.95);

    // Fallen trolley + spilled packing material
    b.box(1.4, 0.08, 0.8, 1.6, 0.32, -7.5, M.graphite, { rz: 0.35 });
    b.box(0.05, 0.8, 0.7, 2.25, 0.62, -7.5, M.graphite, { rz: 0.35 });
    for (const z of [-7.85, -7.15]) b.cyl(0.1, 0.06, 1.05, 0.1, z, 'z', M.rubber);
    b.collider(0.9, 2.4, -7.9, -7.1);
    debris(b, { x0: -1.5, x1: 3.5, z0: -12, z1: -3, count: 26, seed: 5 });
    for (let i = 0; i < 10; i++) {
      b.box(0.3 + Math.random() * 0.4, 0.02, 0.2 + Math.random() * 0.3, -1 + Math.random() * 4, 0.012, -11 + Math.random() * 7, M.plastic, { ry: Math.random() * Math.PI, cast: false });
    }

    // Cargo terminal on pedestal (south wall, left of airlock)
    const cs = this._screenAt(new ScreenTexture(512, 384, Draw.cargo(this.env.getCargo), 6), -3.4, 1.3, -0.6);
    const ct = terminal(b, { x: -3.4, y: 0, z: -0.62, rotY: Math.PI, screen: cs, pedestal: true, sw: 0.5, sh: 0.38 });
    b.collider(-3.8, -3.0, -0.95, -0.15);
    this.hooks.cargoTerminal = ct.hit;
    ct.hit.forEach((m) => this.blockers.push(m));

    // West wall displays
    const s1 = this._screenAt(new ScreenTexture(512, 320, Draw.sector('CARGO OPS', ['MANIFEST 2189-03', 'CONTAINERS 14', 'CRANE IDLE', 'HATCH 01 SEALED']), 5), -7.85, 2.0, -2.2);
    wallTerminal(b, { x: -7.85, y: 2.0, z: -2.2, rotY: Math.PI / 2, screen: s1, sw: 0.9, sh: 0.56 });
    const s2 = this._screenAt(new ScreenTexture(512, 320, Draw.sector('DOCK B', ['ARV-112 CLAMPED', 'FUEL 64%', 'UMBILICAL OK', 'CREW 1']), 5), -7.85, 2.0, -6.0);
    wallTerminal(b, { x: -7.85, y: 2.0, z: -6.0, rotY: Math.PI / 2, screen: s2, sw: 0.9, sh: 0.56 });

    // North cargo hatch (sealed; vacuum beyond)
    b.box(6, 4.6, 0.12, 0, 2.3, -15.8, M.door);
    b.box(6.4, 0.3, 0.16, 0, 4.75, -15.78, M.hazard, { repeat: [14, 1] });
    for (const x of [-3.15, 3.15]) b.box(0.3, 4.75, 0.16, x, 2.375, -15.78, M.hazard, { repeat: [1, 10] });
    b.box(0.3, 0.3, 0.05, 3.6, 3.8, -15.72, M.red, { cast: false });
    b.warning(['VACUUM BEYOND HATCH', 'Do not open without suit', 'Interlock: Dock control'], 1.4, -4.4, 1.7, -15.84, 0, { seed: 65 });
    b.stencil('HATCH 01', 2.2, 0.45, 0, 5.3, -15.84, 0);

    // Station markings
    b.stencil('ECHO-9', 3.2, 0.8, -7.84, 5.4, -10, Math.PI / 2, { color: 'rgba(230,226,205,0.7)' });
    b.stencil('CARGO 01 · DECK A', 6, 0.7, 0, 6.0, -15.84, 0);
    b.stencil('SECURITY · CREW HUB  >', 3.2, 0.32, 7.84, 3.6, -12, -Math.PI / 2, { color: 'rgba(240,190,90,0.85)' });
    b.stencil('< DOCK B · AIRLOCK 01', 3.2, 0.32, 3.4, 3.1, -0.16, Math.PI, { color: 'rgba(240,190,90,0.85)' });

    // Service runs along the east wall
    b.pipe(7.7, 5.2, -0.3, 7.7, 5.2, -15.7, 0.12, M.pipeInsulated);
    b.pipe(7.75, 4.8, -0.3, 7.75, 4.8, -15.7, 0.06, M.copper);
    b.box(0.35, 0.05, 15.4, 7.6, 5.6, -8, M.graphite, { cast: false });
    cable(b, { x: -5.5, y: 6.2, z: -3 }, { x: -1, y: 6.5, z: -3 }, 0.6);
    cable(b, { x: 2, y: 6.5, z: -12 }, { x: 5.5, y: 6.2, z: -12 }, 0.5);

    // Lighting: cold work-light pools, a dim fill, one emergency lamp at the hatch
    b.workLight(-4, 6.45, -4.5, { intensity: 34, distance: 12, angle: 0.6 });
    b.workLight(3.5, 6.45, -10.5, { intensity: 34, distance: 12, angle: 0.6 });
    b.workLight(-3, 6.45, -13.5, { intensity: 30, distance: 12, angle: 0.6, flicker: 'fault' });
    b.light(0, 4.5, -7, 0xa8d6ff, 9, 15);
    b.light(3.6, 3.8, -15.4, 0xff2a20, 3, 6, { flicker: 'emergency' });
    this.emitters.push({ pos: { x: 1.2, y: 5.5, z: -9.5 }, type: 'servo' });

    this.door({ id: 'cargo_sec', x: 8, z: -12, axis: 'z', state: 'locked',
      labels: { pos: 'CARGO BAY', neg: 'OBSERVATION 2A' }, lockedMsg: 'Security access required — use the cargo terminal.' });
  }

  // ---------------- 3. OBSERVATION CORRIDOR (Earth window) ----------------
  _corridor() {
    const b = this.b, M = b.mat, H = 3.2, cz = -12;
    b.room = 'corridor';
    b.corridor({
      alongX: true, from: 8.15, to: 19.85, at: cz, H, halfW: 1.5,
      openings: { neg: [], pos: [{ c: 14, w: 2.2, y0: 0.5, h: 2.2 }] },
      ribs: [9.4, 11.6, 16.4, 18.6],
      lights: [{ s: 10.5, kind: 'work', intensity: 18 }, { s: 14, intensity: 3 }, { s: 17.5, intensity: 6, flicker: 'fault' }],
      style: { upper: M.teal, lower: M.tealLow, band: 1.1 },
    });
    b.porthole(14, 1.6, cz + 1.5, Math.PI, { wallMat: M.teal });
    b.light(14, 1.7, cz + 1.0, 0x9fc8ff, 2.5, 5);
    b.stencil('OBSERVATION 2A', 1.6, 0.22, 14, 2.92, cz + 1.34, Math.PI);
    this.emitters.push({ pos: { x: 17.5, y: 2.95, z: cz }, type: 'buzz', lightIndex: b.lights.virtual.length - 2 });

    const zN = cz - 1.35, zS = cz + 1.35;
    const t1 = this._screenAt(new ScreenTexture(512, 320, Draw.sector('SECTOR 2A', ['SYSTEMS OPS', 'HABITATION', 'DECK A', 'CREW ONLY']), 5), 10.5, 1.8, zN);
    wallTerminal(b, { x: 10.5, y: 1.8, z: zN, rotY: 0, screen: t1 });
    const t2 = this._screenAt(new ScreenTexture(768, 288, Draw.waveform('SIG-7 // DEEP FIELD'), 10), 14, 1.85, zN);
    wallTerminal(b, { x: 14, y: 1.85, z: zN, rotY: 0, screen: t2, sw: 1.0, sh: 0.38 });
    const t3 = this._screenAt(new ScreenTexture(512, 320, Draw.sector('NAV DATA', ['ORBIT 412 KM', 'INCL 51.6', 'DRIFT 0.002', 'STATUS NOMINAL']), 5), 17.5, 1.8, zN);
    wallTerminal(b, { x: 17.5, y: 1.8, z: zN, rotY: 0, screen: t3 });
    const t4 = this._screenAt(new ScreenTexture(512, 320, Draw.sector('DECK A', ['SECURITY  >', 'CREW HUB  >', 'RESEARCH  [NO POWER]', 'ENGINEERING  [LOCKED]']), 5), 10.5, 1.8, zS);
    wallTerminal(b, { x: 10.5, y: 1.8, z: zS, rotY: Math.PI, screen: t4 });
    const t5 = this._screenAt(new ScreenTexture(512, 320, Draw.sector('LIFE SUPPORT', ['O2 20.9%', 'CO2 0.04%', 'TEMP 19.2C', 'DECK A NOMINAL']), 5), 17.5, 1.8, zS);
    wallTerminal(b, { x: 17.5, y: 1.8, z: zS, rotY: Math.PI, screen: t5 });
    b.warning(['PRESSURE BULKHEAD', 'Keep door clear'], 0.5, 19.4, 2.2, zS - 0.01, Math.PI, { seed: 67 });
    debris(b, { x0: 9, x1: 19, z0: cz - 1.1, z1: cz + 1.1, count: 10, seed: 9 });

    this.door({ id: 'sec_entry', x: 20, z: cz, axis: 'z', state: 'ready',
      labels: { pos: 'OBSERVATION 2A', neg: 'SECURITY S-01' } });
  }

  // ---------------- 4. SECURITY OFFICE ----------------
  _security() {
    const b = this.b, M = b.mat, H = 3.2;
    b.room = 'security';
    b.roomShell({ x0: 20, x1: 28, z0: -16, z1: -8, H, floor: 'floor',
      walls: { s: [], e: [], w: [{ c: -12, w: 2.2 }] }, style: { upper: M.teal, lower: M.tealLow, band: 1.1 } });

    // Camera monitor bank on the east wall
    let id = 1;
    for (const y of [1.75, 2.55]) for (const z of [-13.6, -12, -10.4]) {
      const st = this._screenAt(new ScreenTexture(256, 160, Draw.cams(id++), 4), 27.85, y, z);
      wallTerminal(b, { x: 27.85, y, z, rotY: -Math.PI / 2, screen: st, sw: 0.8, sh: 0.45 });
    }
    // Desk + operator console
    b.box(0.85, 0.06, 4.4, 27.0, 0.78, -12, M.beige, { block: true });
    b.box(0.06, 0.74, 4.3, 27.4, 0.38, -12, M.graphite);
    for (const z of [-14.1, -9.9]) b.box(0.8, 0.75, 0.06, 27.0, 0.375, z, M.graphite);
    b.collider(26.55, 27.85, -14.2, -9.8);
    const ss = this._screenAt(new ScreenTexture(512, 384, Draw.security(this.env.getSecurity), 6), 27.0, 1.2, -12);
    const sec = terminal(b, { x: 27.05, y: 0.81, z: -12, rotY: -Math.PI / 2, screen: ss, sw: 0.5, sh: 0.38 });
    this.hooks.securityTerminal = sec.hit;
    sec.hit.forEach((m) => this.blockers.push(m));
    const side = this._screenAt(new ScreenTexture(384, 288, Draw.sector('ACCESS LOG', ['04:12 VOSS M. DOCK B', '04:31 VOSS M. LOCKDOWN', '04:31 CREW CORR SEALED', '05:02 EVA OUTBOUND']), 4), 27.05, 1.2, -10.5);
    terminal(b, { x: 27.05, y: 0.81, z: -10.5, rotY: -Math.PI / 2 - 0.25, screen: side, sw: 0.36, sh: 0.27, keyboard: false });
    // papers scattered across the desk and floor
    for (let i = 0; i < 6; i++) {
      b.box(0.21, 0.003, 0.3, 26.8 + Math.random() * 0.35, 0.815, -13.6 + Math.random() * 1.0, M.paper, { ry: Math.random() * 1.2, cast: false });
    }
    for (let i = 0; i < 5; i++) {
      b.box(0.21, 0.003, 0.3, 24.5 + Math.random() * 2, 0.004, -13.8 + Math.random() * 3, M.paper, { ry: Math.random() * 3, cast: false });
    }

    // Station map (south wall)
    const map = this._screenAt(new ScreenTexture(768, 384, Draw.map(), 2), 24, 1.85, -8.17);
    b.box(2.6, 1.4, 0.06, 24, 1.85, -8.18, M.beige);
    b.screen(map, 2.4, 1.2, 24, 1.85, -8.215, Math.PI, { frame: false, bulge: 0.005 });

    // Chair pushed back and turned, spilled drink
    chair(b, { x: 25.7, z: -11.2, rotY: 2.1 });
    mug(b, 26.6, 0, -13.1, { tipped: true });
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.38, 24), M.puddle);
    puddle.rotation.x = -Math.PI / 2; puddle.position.set(26.35, 0.007, -13.0); b.group.add(puddle);

    // Lockers + equipment shelf (west wall, north of the door)
    for (const z of [-9.0, -9.5]) b.box(0.45, 2.0, 0.48, 20.4, 1.0, z, M.graphite, { collide: true });
    b.stencil('SEC', 0.25, 0.1, 20.635, 1.8, -9.25, Math.PI / 2);

    // Emergency release lever (on the hub wall, security side)
    const housing = b.box(0.5, 0.7, 0.14, 26.3, 1.3, -15.78, M.beige);
    const handle = b.box(0.08, 0.4, 0.08, 26.3, 1.38, -15.66, M.red.clone());
    b.warning(['EMERGENCY RELEASE', 'Crew corridor lockdown', 'Authorise at console S-01'], 0.7, 26.3, 1.95, -15.84, 0, { seed: 69 });
    b.collider(26.0, 26.6, -15.85, -15.6);
    this.hooks.lever = [housing, handle];
    this.dynamic.lever = handle;

    b.light(23.5, 2.95, -12, 0xb9ddff, 7, 9, { panel: M.ivoryPanel, panelSize: [1.2, 0.05, 0.4] });
    b.workLight(26.6, 3.0, -12, { tx: 27, ty: 0.8, tz: -12, intensity: 16, distance: 6, angle: 0.75 });
    this.dynamic.secAlarm = b.light(26.3, 2.5, -15.3, 0xff3020, 2.5, 5, { flicker: 'emergency' });

    this.door({ id: 'sec_hub', x: 24, z: -16, axis: 'x', state: 'sealed',
      labels: { pos: 'CREW HUB', neg: 'SECURITY S-01' }, lockedMsg: 'Emergency lockdown — release required.' });
  }

  // ---------------- 5. CREW HUB ----------------
  _hub() {
    const b = this.b, M = b.mat, H = 4;
    b.room = 'hub';
    b.roomShell({ x0: 18, x1: 30, z0: -28, z1: -16, H, floor: 'grate', floorTile: 1.7,
      walls: { n: [{ c: 24, w: 2.2 }], s: [{ c: 24, w: 2.2 }], w: [{ c: -22, w: 2.2 }], e: [{ c: -22, w: 2.2 }] },
      style: { upper: M.insulation, lower: M.tealLow, band: 1.2 } });

    // Chamfered graphite corners
    for (const [cx, cz, sx, sz] of [[18, -16, 1, -1], [30, -16, -1, -1], [18, -28, 1, 1], [30, -28, -1, 1]]) {
      b.box(2.0, H, 0.25, cx + sx * 0.75, H / 2, cz + sz * 0.75, M.graphite, { ry: sx * sz > 0 ? Math.PI / 4 : -Math.PI / 4 });
      b.collider(Math.min(cx, cx + sx * 1.2), Math.max(cx, cx + sx * 1.2), Math.min(cz, cz + sz * 1.2), Math.max(cz, cz + sz * 1.2));
    }

    // Central pillar with directory screens
    b.cyl(0.55, H, 24, H / 2, -22, 'y', M.dark, { seg: 24, collide: true });
    const dir = this._screenAt(new ScreenTexture(384, 512, Draw.directory(this.env.getDirectory), 2), 24, 1.7, -22);
    this.hooks.directory = [[24, -21.4, 0], [24, -22.6, Math.PI], [24.6, -22, Math.PI / 2], [23.4, -22, -Math.PI / 2]]
      .map(([x, z, r]) => b.screen(dir, 0.75, 1.0, x, 1.7, z, r));
    const ringMat = M.ivoryPanel.clone();
    ringMat.emissiveIntensity = 0.7;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.04, 8, 48), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.set(24, H - 0.06, -22); b.group.add(ring);

    // Route signs above each door (backlit) with status strips
    const sign = (text, sub, x, z, ry, status) => {
      const g = new THREE.Group(); g.position.set(x, 3.5, z); g.rotation.y = ry; b.group.add(g);
      b.box(2.2, 0.5, 0.1, 0, 0, 0, M.beige, { parent: g });
      b.label(text, 1.9, 0.26, 0, 0.07, 0.052, 0, { parent: g, fg: '#1b1f1f', opacity: 1, family: '"Arial Narrow", Arial, sans-serif' });
      b.label(sub, 1.9, 0.14, 0, -0.15, 0.052, 0, { parent: g, fg: '#3a4040', opacity: 1, family: 'Menlo, monospace' });
      b.box(2.2, 0.05, 0.02, 0, -0.27, 0.06, status, { parent: g, cast: false });
    };
    sign('CREW QUARTERS', 'MESS · BUNKS', 18.2, -22, Math.PI / 2, M.green);
    sign('ENGINEERING', 'CREDENTIAL REQUIRED', 24, -27.8, 0, M.amber);
    sign('RESEARCH', 'NO POWER · MAIN BUS', 29.8, -22, -Math.PI / 2, M.red);

    // Benches, abandoned bags, datapad
    for (const [x, z] of [[20.6, -24.5], [27.4, -19.5]]) {
      b.box(2.2, 0.08, 0.6, x, 0.45, z, M.fabric);
      for (const o of [-1.0, 1.0]) b.box(0.08, 0.45, 0.5, x + o, 0.225, z, M.graphite, { cast: false });
      b.collider(x - 1.1, x + 1.1, z - 0.3, z + 0.3);
    }
    b.box(0.55, 0.32, 0.3, 20.2, 0.65, -24.5, M.fabricB, { ry: 0.2 });
    b.box(0.6, 0.35, 0.35, 21.9, 0.175, -23.8, M.fabricC, { ry: -0.5 });
    const pad = b.box(0.26, 0.02, 0.18, 27.0, 0.5, -19.5, M.dark, { ry: 0.3 });
    const glow = b.box(0.22, 0.006, 0.14, 27.0, 0.513, -19.5, M.teal_em, { ry: 0.3, cast: false });
    this.hooks.datapad = [pad, glow];

    // Intercom (south wall, hub side)
    const ic = b.box(0.36, 0.5, 0.1, 26.4, 1.45, -16.2, M.beige);
    const grille = b.box(0.26, 0.2, 0.02, 26.4, 1.52, -16.26, M.grille, { cast: false });
    const icBtn = b.box(0.06, 0.06, 0.03, 26.4, 1.3, -16.26, M.amber, { cast: false });
    b.stencil('INTERCOM', 0.36, 0.07, 26.4, 1.78, -16.155, Math.PI);
    this.hooks.intercom = [ic, grille, icBtn];

    b.stencil('CREW HUB · DECK A', 2.4, 0.3, 21.2, 2.6, -27.84, 0);
    b.pipe(18.4, 3.6, -26.5, 29.6, 3.6, -26.5, 0.08, M.pipeInsulated);

    b.light(21, 3.75, -19, 0xb9ddff, 9, 10, { panel: M.ivoryPanel });
    b.light(27, 3.75, -25, 0xa1cfff, 9, 10, { panel: M.warmPanel });
    b.workLight(24, 3.85, -24.5, { tx: 24, ty: 0, tz: -23.2, intensity: 14, distance: 7, angle: 0.7 });

    this.door({ id: 'hub_crew', x: 18, z: -22, axis: 'z', state: 'ready',
      labels: { neg: 'CREW HUB' } }); // hub side has a backlit sign
    this.door({ id: 'hub_eng', x: 24, z: -28, axis: 'x', state: 'locked',
      labels: {}, lockedMsg: 'Engineering credential required.' });
    this.door({ id: 'hub_res', x: 30, z: -22, axis: 'z', state: 'sealed',
      labels: {}, lockedMsg: 'No power to the Research wing from the main bus.' });
  }

  // ---------------- CREW CORRIDOR ----------------
  _crewCorridor() {
    const b = this.b, M = b.mat, H = 3.0, cz = -22;
    b.room = 'crew';
    b.corridor({
      alongX: true, from: 12.15, to: 17.85, at: cz, H, halfW: 1.5,
      ribs: [13.6, 16.3],
      lights: [{ s: 15, color: 0xffcf9a, intensity: 5, flicker: 'fault', panel: 'warm' }],
      style: { upper: M.insulation, lower: M.tealLow, band: 1.1 },
    });
    this.emitters.push({ pos: { x: 15, y: 2.8, z: cz }, type: 'buzz', lightIndex: b.lights.virtual.length - 1 });
    b.stencil('CREW QUARTERS', 1.6, 0.22, 15, 2.2, cz - 1.34, 0);
    b.stencil('MESS  <', 0.9, 0.2, 13.0, 1.9, cz + 1.34, Math.PI, { color: 'rgba(240,190,90,0.85)' });
  }

  // ---------------- 6. MESS HALL ----------------
  _mess() {
    const b = this.b, M = b.mat, H = 3.0;
    b.room = 'mess';
    b.roomShell({ x0: 2, x1: 12, z0: -29, z1: -17, H, floor: 'rubberFloor', floorTile: 1.2,
      walls: { n: [], s: [], w: [{ c: -23, w: 2.2 }], e: [{ c: -22, w: 2.2 }] },
      style: { upper: M.insulation, lower: M.tealLow, band: 1.0 } });

    // ---- Galley (north wall) ----
    const gz = -28.5;
    b.box(7.6, 0.9, 0.7, 6.8, 0.45, gz, M.graphite, { collide: true });
    b.box(7.7, 0.04, 0.74, 6.8, 0.92, gz, M.steel);
    for (let i = 0; i < 8; i++) {
      b.box(0.86, 0.36, 0.02, 3.4 + i * 0.94, 0.62, gz + 0.36, M.tealLow, { cast: false }); // drawer fronts
      b.box(0.2, 0.025, 0.03, 3.4 + i * 0.94, 0.74, gz + 0.38, M.steel, { cast: false });
    }
    b.box(7.6, 0.6, 0.4, 6.8, 2.05, -28.65, M.beige); // wall cabinets
    for (let i = 0; i < 6; i++) b.box(0.02, 0.56, 0.01, 3.6 + i * 1.25, 2.05, -28.44, M.darkMatte, { cast: false });
    // food dispensers
    const dispScreen = this._screenAt(new ScreenTexture(384, 256, Draw.galley(), 4), 5.6, 1.35, -28.3);
    b.box(0.62, 0.8, 0.5, 4.2, 1.34, -28.55, M.beige);
    b.box(0.3, 0.2, 0.05, 4.2, 1.2, -28.29, M.darkMatte, { cast: false });
    const disp2 = b.box(0.62, 0.8, 0.5, 5.6, 1.34, -28.55, M.beige);
    const dispMesh = b.screen(dispScreen, 0.4, 0.26, 5.6, 1.52, -28.29, 0, { frame: false });
    b.box(0.3, 0.2, 0.05, 5.6, 1.12, -28.29, M.darkMatte, { cast: false });
    b.box(0.08, 0.04, 0.02, 5.85, 1.12, -28.26, M.red, { cast: false });
    this.hooks.galley = [disp2, dispMesh];
    // sink + hotplate
    b.box(0.6, 0.02, 0.45, 7.2, 0.935, gz, M.darkMatte, { cast: false });
    b.cyl(0.015, 0.3, 7.2, 1.08, -28.75, 'y', M.steel);
    b.box(0.6, 0.02, 0.5, 8.6, 0.935, gz, M.dark, { cast: false });
    for (const [dx, dz] of [[-0.14, -0.1], [0.14, 0.1]]) b.cyl(0.1, 0.01, 8.6 + dx, 0.946, gz + dz, 'y', M.darkMatte, { seg: 16 });
    // tall cold storage
    b.box(1.0, 2.1, 0.75, 11.1, 1.05, -28.45, M.beige, { collide: true });
    b.box(0.02, 1.9, 0.02, 10.75, 1.05, -28.06, M.steel, { cast: false });
    b.box(0.12, 0.04, 0.02, 11.3, 1.85, -28.06, M.green, { cast: false });
    this.emitters.push({ pos: { x: 11.1, y: 1.0, z: -28.2 }, type: 'fridge' });
    // galley clutter
    mug(b, 3.3, 0.94, -28.4);
    mug(b, 3.5, 0.94, -28.3, { mat: M.tealLow });
    tray(b, 9.6, 0.94, -28.45, 0.1);
    b.stencil('GALLEY', 0.9, 0.18, 6.8, 2.5, -28.84, 0);
    b.warning(['HOT SURFACE', 'Hotplate stays hot after use'], 0.42, 8.6, 1.55, -28.84, 0, { seed: 71 });

    // ---- Tables (bolted) and chairs ----
    const tables = [[4.5, -19.6], [8.5, -19.6], [4.5, -26.2], [8.5, -26.2]];
    for (const [x, z] of tables) table(b, { x, z, w: 1.7, d: 0.85 });
    const chairSpots = [
      [3.9, -18.85, Math.PI], [5.1, -18.75, Math.PI + 0.3], [3.9, -20.35, 0], [5.2, -20.6, -0.35],
      [7.9, -18.85, Math.PI], [9.1, -18.85, Math.PI], [7.8, -20.5, 0.25],
      [3.9, -25.45, Math.PI], [5.1, -25.45, Math.PI], [3.9, -26.95, 0],
      [7.9, -25.4, Math.PI - 0.2], [9.1, -25.45, Math.PI], [9.1, -26.95, 0],
    ];
    for (const [x, z, r] of chairSpots) chair(b, { x, z, rotY: r });
    // the overturned chair, in the aisle, as if someone stood up fast
    chair(b, { x: 8.6, z: -21.9, rotY: 0.4, fallen: true });

    // ---- Interrupted meal ----
    tray(b, 4.1, 0.765, -19.75, 0.1);
    tray(b, 4.95, 0.765, -19.45, -0.2, { half: true });
    tray(b, 8.1, 0.765, -19.75, 0.05, { half: true });
    tray(b, 4.3, 0.765, -26.0, 0.3);
    tray(b, 8.9, 0.765, -26.35, -0.1);
    mug(b, 4.7, 0.765, -19.95);
    mug(b, 5.35, 0.765, -19.4, { mat: M.tealLow });
    mug(b, 8.95, 0.765, -19.35, { tipped: true });
    mug(b, 8.0, 0.765, -26.45);
    mug(b, 4.9, 0.765, -26.4, { mat: M.paint });
    // spill: across the table edge and onto the floor
    const spillT = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), M.puddle);
    spillT.rotation.x = -Math.PI / 2; spillT.position.set(9.05, 0.768, -19.4); b.group.add(spillT);
    const spillF = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), M.puddle);
    spillF.rotation.x = -Math.PI / 2; spillF.position.set(9.3, 0.006, -20.35); b.group.add(spillF);
    // dropped tray + scattered food near the overturned chair
    tray(b, 7.6, 0.0, -22.6, 2.2, { half: true });
    for (let i = 0; i < 6; i++) b.box(0.05, 0.03, 0.05, 7.2 + Math.random() * 0.9, 0.015, -22.9 + Math.random() * 0.7, M.food3, { cast: false });
    b.box(0.014, 0.006, 0.16, 7.9, 0.004, -22.2, M.steel, { ry: 1.1, cast: false });

    // ---- Personal possessions ----
    b.box(0.5, 0.06, 0.45, 5.15, 0.81, -20.55, M.fabricC, { rx: -0.25, ry: -0.35 }); // jacket over a chair back
    b.box(0.5, 0.4, 0.04, 5.25, 0.62, -20.82, M.fabricC, { ry: -0.35 });
    b.box(0.2, 0.035, 0.27, 3.75, 0.783, -26.4, M.fabricB, { ry: 0.5 }); // book
    b.box(0.19, 0.005, 0.26, 3.75, 0.802, -26.4, M.paper, { ry: 0.5, cast: false });
    const hp = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 18, Math.PI), M.rubber);
    hp.rotation.x = -Math.PI / 2; hp.position.set(9.0, 0.775, -25.9); b.group.add(hp);
    b.box(0.22, 0.012, 0.15, 7.7, 0.772, -19.45, M.dark, { ry: -0.2 }); // tablet
    b.box(0.19, 0.003, 0.12, 7.7, 0.779, -19.45, M.teal_em, { ry: -0.2, cast: false });

    // ---- Crew recorder (playable) on table 2 ----
    const rec = b.box(0.16, 0.05, 0.1, 8.75, 0.79, -19.8, M.beige, { ry: 0.3 });
    const recLed = b.box(0.02, 0.012, 0.01, 8.7, 0.81, -19.75, M.amber.clone(), { ry: 0.3, cast: false });
    b.box(0.07, 0.015, 0.05, 8.79, 0.818, -19.82, M.grille, { ry: 0.3, cast: false });
    this.hooks.recorder = [rec, recLed];
    this.dynamic.recLed = recLed;

    // ---- Noticeboard (south wall) with the duty roster and a crew photo ----
    const nz = -17.16;
    b.box(2.4, 1.2, 0.04, 6.4, 1.6, nz - 0.01, M.cork);
    b.box(2.5, 0.06, 0.06, 6.4, 2.23, nz, M.graphite, { cast: false });
    b.box(2.5, 0.06, 0.06, 6.4, 0.97, nz, M.graphite, { cast: false });
    const rosterTex = paperTexture('ECHO-9 DUTY ROSTER · WK 10', [
      'SEN, M.        LEAD RESEARCH   BUNK 1',
      'REYES, J.      CHIEF ENGINEER  BUNK 2',
      'ANAND, P.      COMMS           BUNK 3',
      'KELLER, T.     MEDICAL         BUNK 4',
      'HARGREAVE, L.  SIGNAL ANALYST  BUNK 5',
      'OKAFOR, D.     SYSTEMS         BUNK 6',
      '',
      'Bunk lockers match bunk numbers. -J.R.',
      '',
      'Mar 12: hearing yourself on ch.4?',
      'Log it with Priya. Do NOT answer. -M.S.',
    ], { seed: 81 });
    const fz = nz - 0.045; // just in front of the cork face
    const roster = b.decal(rosterTex, 0.42, 0.56, 5.75, 1.6, fz, Math.PI, { rough: 0.95 });
    const photo = b.decal(photoTexture(), 0.4, 0.3, 6.65, 1.75, fz, Math.PI - 0.06);
    const notes = [
      paperTexture('SHIFT SWAP', ['Tomas -> Daniel', 'Thu night shift', 'thx!'], { w: 256, h: 256, seed: 82, tint: '#e9df9c' }),
      paperTexture('FILM NIGHT', ['Fri 21:00', 'Obs room 2A', 'bring a chair'], { w: 256, h: 256, seed: 83, tint: '#cfe0e9' }),
      paperTexture('NOTICE', ['Ch.4 relay under', 'maintenance. Use', 'ch.2 for ops.', '-J.R.'], { w: 256, h: 256, seed: 84 }),
    ];
    b.decal(notes[0], 0.2, 0.2, 7.3, 1.85, fz, Math.PI + 0.08);
    b.decal(notes[1], 0.2, 0.2, 7.45, 1.4, fz, Math.PI - 0.1);
    b.decal(notes[2], 0.22, 0.22, 6.85, 1.28, fz, Math.PI + 0.04);
    for (const [x, y] of [[5.75, 1.86], [6.65, 1.89], [7.3, 1.94], [7.45, 1.49], [6.85, 1.38]]) b.cyl(0.012, 0.02, x, y, fz - 0.008, 'z', M.red, { seg: 6 });
    b.stencil('NOTICES', 0.8, 0.14, 6.4, 2.38, -17.16, Math.PI);
    this.hooks.roster = [roster];
    this.hooks.photo = [photo];

    // ---- Clock above the entrance ----
    const clock = this._screenAt(new ScreenTexture(256, 128, Draw.clock(), 2), 11.84, 2.55, -20.3);
    b.box(0.06, 0.34, 0.66, 11.85, 2.55, -20.3, M.beige);
    b.screen(clock, 0.6, 0.28, 11.81, 2.55, -20.3, -Math.PI / 2, { frame: false, bulge: 0.003 });

    // ---- Markings, service runs ----
    b.stencil('MESS · DECK A', 1.8, 0.26, 2.16, 2.5, -20.0, Math.PI / 2);
    b.warning(['DOOR MOTOR FAULT', 'Do not force', 'Manual release: Engineering'], 0.6, 2.16, 1.6, -24.6, Math.PI / 2, { seed: 73 });
    b.pipe(2.4, 2.7, -17.4, 11.6, 2.7, -17.4, 0.06, M.copper);
    b.pipe(2.4, 2.75, -28.0, 2.4, 2.75, -17.6, 0.09, M.pipeInsulated);

    // ---- Lighting: warm cabin light, one failing fixture, cool light over the galley ----
    b.light(4.5, 2.85, -19.6, 0x91caff, 6, 7, { panel: M.warmPanel, panelSize: [1.0, 0.05, 0.4] });
    b.light(8.5, 2.85, -19.6, 0x91caff, 6, 7, { panel: M.warmPanel, panelSize: [1.0, 0.05, 0.4] });
    b.light(4.5, 2.85, -26.2, 0x91caff, 6, 7, { panel: M.warmPanel, panelSize: [1.0, 0.05, 0.4], flicker: 'fault' });
    this.emitters.push({ pos: { x: 4.5, y: 2.85, z: -26.2 }, type: 'buzz', lightIndex: b.lights.virtual.length - 1 });
    b.light(8.5, 2.85, -26.2, 0x91caff, 4, 7, { panel: M.warmPanel, panelSize: [1.0, 0.05, 0.4] });
    b.workLight(6.8, 2.8, -27.7, { tx: 6.8, ty: 0.9, tz: -28.4, intensity: 12, distance: 5, angle: 0.9 });

    this.door({ id: 'mess', x: 12, z: -22, axis: 'z', state: 'ready',
      labels: { pos: 'MESS HALL', neg: 'CREW CORRIDOR' } });
    this.door({ id: 'mess_bunk', x: 2, z: -23, axis: 'z', state: 'locked',
      labels: { pos: 'BUNKROOM', neg: 'MESS HALL' }, lockedMsg: 'Door motor fault. The manual release is in Engineering.' });
  }

  // ---------------- state hooks ----------------
  reset() {
    for (const d of this.doors.values()) d.reset();
    this.setAirlockSafe(false);
    this.setLever('locked');
    this.setSecurityAlarm(true);
    this.setRecorder('idle');
  }

  setAirlockSafe(on) {
    const f = this.dynamic.alarm;
    f.mode = on ? 'steady' : 'emergency';
    f.intensity = on ? 1.5 : 3;
    f.color = on ? 0x7fdcd2 : 0xff3020;
    this.dynamic.cycleBtn.material.emissive.setHex(on ? 0x2bff88 : 0xffa020);
    this.b.lights.acc = 1; // re-assign with the new colour
    for (const r of this.b.lights.points) if (r.v === f) r.light.color.setHex(f.color);
  }

  setLever(mode) {
    const h = this.dynamic.lever;
    h.material.emissive.setHex({ locked: 0xff2a2a, ready: 0x2bff88, pulled: 0x1f8f55 }[mode]);
    h.rotation.x = mode === 'pulled' ? 0.9 : 0;
    h.position.y = mode === 'pulled' ? 1.22 : 1.38;
  }

  setSecurityAlarm(on) {
    const f = this.dynamic.secAlarm;
    f.mode = on ? 'emergency' : 'off';
  }

  setRecorder(mode) {
    const led = this.dynamic.recLed;
    led.material.emissive.setHex(mode === 'playing' ? 0x2bff88 : mode === 'done' ? 0x335544 : 0xffa020);
  }

  roomAt(x, z) {
    if (z > 0) return 'airlock';
    if (x > -8 && x < 8 && z > -16) return 'cargo';
    if (x >= 20 && x < 28 && z > -16 && z < -8) return 'security';
    if (x >= 18 && x <= 30 && z > -28 && z <= -16) return 'hub';
    if (x >= 12 && x < 18 && z > -24 && z < -20) return 'crew';
    if (x >= 2 && x < 12 && z > -29 && z < -17) return 'mess';
    return 'corridor';
  }

  floorAt(x, z) {
    const r = this.roomAt(x, z);
    if (r === 'airlock' || r === 'hub') return 'grate';
    if (r === 'mess') return 'rubber';
    if (r === 'corridor' && Math.abs(z + 12) < 0.85) return 'grate';
    if (r === 'crew' && Math.abs(z + 22) < 0.85) return 'grate';
    return 'plate';
  }

  update(dt, t, camPos) {
    const room = this.roomAt(camPos.x, camPos.z);
    this.b.updateLights(dt, t, camPos, room);
    for (const d of this.doors.values()) d.update(dt);
    for (const s of this.b.screens) {
      if (s.pos) s.visible = Math.hypot(s.pos.x - camPos.x, s.pos.z - camPos.z) < 14;
      s.update(dt, t);
    }
    this.space.update(t);
  }
}
