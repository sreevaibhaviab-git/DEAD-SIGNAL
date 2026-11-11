import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  paintedPanelSet, insulationSet, floorPlateSet, grateSet, graphiteSet, ceilingSet, beigePlasticSet,
  rubberSet, hazardSet, doorSet, circleMaskTexture, labelTexture, stencilTexture, warningLabelTexture, grilleNormal,
} from './textures.js';

// ---------------------------------------------------------------------------
// Light pool: rooms declare many "virtual" lights; only the nearest few (weighted
// toward the player's current room) are backed by real Three.js lights. The real
// light count never changes at runtime, so shaders never recompile mid-game.
// ---------------------------------------------------------------------------
class LightPool {
  constructor(group) {
    this.group = group;
    this.virtual = [];
    this.points = [];
    this.spots = [];
    this.acc = 1;
  }

  setSize(nPoints, nSpots) {
    for (const r of [...this.points, ...this.spots]) {
      this.group.remove(r.light);
      if (r.light.target) this.group.remove(r.light.target);
      r.light.dispose?.();
    }
    this.points = [];
    this.spots = [];
    for (let i = 0; i < nPoints; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 1, 2);
      this.group.add(l);
      this.points.push({ light: l, v: null, fade: 0 });
    }
    for (let i = 0; i < nSpots; i++) {
      const l = new THREE.SpotLight(0xffffff, 0, 1, 0.6, 0.6, 2);
      this.group.add(l);
      this.group.add(l.target);
      this.spots.push({ light: l, v: null, fade: 0 });
    }
    this.acc = 1;
  }

  add(v) { this.virtual.push(v); return v; }

  _flicker(v, t) {
    if (v.mode === 'emergency') return 0.5 + 0.5 * Math.sin(t * 3 + v.seed);
    if (v.mode === 'fault') {
      const n = Math.sin(t * 23.1 + v.seed) * Math.sin(t * 7.3 + v.seed * 2);
      return n > 0.72 ? 0.08 : 1;
    }
    if (v.mode === 'off') return 0;
    return 1;
  }

  update(dt, t, camPos, room) {
    for (const v of this.virtual) {
      v.k = this._flicker(v, t);
      if (v.panel) v.panel.emissiveIntensity = v.panelBase * Math.max(0.05, v.k);
      if (v.onFlicker) v.onFlicker(v.k);
    }
    this.acc += dt;
    if (this.acc > 0.2) {
      this.acc = 0;
      this._assign(this.points, 'point', camPos, room);
      this._assign(this.spots, 'spot', camPos, room);
    }
    for (const r of [...this.points, ...this.spots]) {
      if (!r.v) { r.light.intensity = 0; continue; }
      r.fade = Math.min(1, r.fade + dt * 3);
      r.light.intensity = r.v.intensity * r.v.k * r.fade * 0.65;
    }
  }

  _assign(reals, type, cam, room) {
    const cand = this.virtual
      .filter((v) => v.type === type && v.mode !== 'off')
      .map((v) => {
        const d = Math.hypot(v.pos.x - cam.x, v.pos.z - cam.z);
        const bias = v.room === room ? 0 : (v.rooms && v.rooms.includes(room)) ? 2 : 9;
        return { v, s: d + bias };
      })
      .filter((c) => c.s < 28)
      .sort((a, b) => a.s - b.s)
      .slice(0, reals.length)
      .map((c) => c.v);
    const keep = new Set(cand);
    // keep lights that are still wanted on the same real light (no pop)
    const free = [];
    for (const r of reals) {
      if (r.v && keep.has(r.v)) keep.delete(r.v);
      else free.push(r);
    }
    for (const v of keep) {
      const r = free.pop();
      if (!r) break;
      r.v = v;
      r.fade = 0;
      r.light.color.setHex(v.color);
      r.light.distance = v.distance;
      r.light.position.set(v.pos.x, v.pos.y, v.pos.z);
      if (type === 'spot') {
        r.light.angle = v.angle;
        r.light.penumbra = v.penumbra;
        r.light.target.position.set(v.target.x, v.target.y, v.target.z);
      }
    }
    for (const r of free) r.v = null;
  }
}

export class Builder {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];
    this.blockers = [];   // meshes that stop interaction rays
    this.screens = new Set();
    this.room = null;     // room id assigned to lights created now
    this._tiles = new Map();
    this._geos = new Map();
    this.lights = new LightPool(this.group);
    this.mat = this._materials();
  }

  // ---------- materials ----------
  _materials() {
    const fromSet = (s, { metal = 0.3, n = 1, color = 0xffffff, env = 0.6 } = {}) => new THREE.MeshStandardMaterial({
      map: s.map, normalMap: s.normalMap, roughnessMap: s.roughnessMap,
      roughness: 1, metalness: metal, color, normalScale: new THREE.Vector2(n, n), envMapIntensity: env,
    });
    const std = (o) => new THREE.MeshStandardMaterial({ envMapIntensity: 0.5, ...o });
    const em = (hex, i) => std({ color: 0x111111, emissive: hex, emissiveIntensity: i, roughness: 0.4 });

    const teal = paintedPanelSet({ base: '#344451', seed: 1 });
    const tealLow = paintedPanelSet({ base: '#222e39', cols: 2, rows: 1, seed: 2 });
    const tealDoor = doorSet({ seed: 23 });
    return {
      teal: fromSet(teal, { metal: 0.35, n: 1 }),
      tealLow: fromSet(tealLow, { metal: 0.35, n: 1 }),
      insulation: fromSet(paintedPanelSet({ base: '#46535f', seed: 7 }), { metal: 0.35, n: 1, env: 0.4 }),
      graphite: fromSet(graphiteSet({ seed: 5 }), { metal: 0.7, n: 1, env: 0.7 }),
      ceiling: fromSet(ceilingSet({ seed: 9 }), { metal: 0.4, n: 1 }),
      floor: fromSet(floorPlateSet({ seed: 3 }), { metal: 0.55, n: 1, env: 0.7 }),
      grate: fromSet(grateSet({ seed: 11 }), { metal: 0.7, n: 1, env: 0.7 }),
      rubberFloor: fromSet(rubberSet({ seed: 17 }), { metal: 0, n: 1, env: 0.2 }),
      beige: fromSet(paintedPanelSet({ base: '#3c4955', seed: 13 }), { metal: 0.25, n: 0.6, env: 0.3 }),
      hazard: fromSet(hazardSet({ seed: 19 }), { metal: 0.3, n: 1 }),
      door: fromSet(tealDoor, { metal: 0.45, n: 1 }),
      dark: std({ color: 0x1b1f20, roughness: 0.55, metalness: 0.7 }),
      darkMatte: std({ color: 0x141717, roughness: 0.9, metalness: 0.2 }),
      pipe: std({ color: 0x70777a, roughness: 0.32, metalness: 0.85, envMapIntensity: 0.8 }),
      pipeInsulated: std({ color: 0x536473, roughness: 0.92, metalness: 0 }),
      copper: std({ color: 0x8a5a3a, roughness: 0.4, metalness: 0.8 }),
      rubber: std({ color: 0x141616, roughness: 0.95, metalness: 0 }),
      fabric: std({ color: 0x35433f, roughness: 1, metalness: 0 }),
      fabricB: std({ color: 0x5a3f36, roughness: 1, metalness: 0 }),
      fabricC: std({ color: 0x3e3a52, roughness: 1, metalness: 0 }),
      crate: std({ color: 0x55583e, roughness: 0.85, metalness: 0.15 }),
      crateB: std({ color: 0x3c4954, roughness: 0.8, metalness: 0.25 }),
      strap: std({ color: 0xa8561d, roughness: 0.9, metalness: 0 }),
      paint: std({ color: 0xa98522, roughness: 0.6, metalness: 0.4 }),
      plastic: std({ color: 0xb9bec4, roughness: 0.55, metalness: 0.02 }),
      ceramic: std({ color: 0xd9d4c6, roughness: 0.45, metalness: 0 }),
      steel: std({ color: 0x9aa0a2, roughness: 0.28, metalness: 0.9, envMapIntensity: 0.9 }),
      food: std({ color: 0x8a6a3a, roughness: 0.9 }),
      food2: std({ color: 0x5a6e3a, roughness: 0.9 }),
      food3: std({ color: 0xb8a070, roughness: 0.85 }),
      paper: std({ color: 0xe0d9c4, roughness: 0.95 }),
      cork: std({ color: 0x5e4c39, roughness: 1 }),
      puddle: std({ color: 0x060403, roughness: 0.18, metalness: 0.1, envMapIntensity: 0.35 }),
      glass: std({ color: 0xa8d8d8, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.1, depthWrite: false }),
      voidMat: new THREE.MeshBasicMaterial({ color: 0x030405 }),
      grille: std({ color: 0x9a9077, roughness: 0.8, normalMap: grilleNormal(), normalScale: new THREE.Vector2(1, 1) }),
      teal_em: em(0x5fd8cc, 0.9),
      amber: em(0xffa020, 1.3),
      amberDim: em(0xffa020, 0.5),
      red: em(0xff2a2a, 1.5),
      green: em(0x2bff88, 1.2),
      ivoryPanel: em(0xfff0d8, 2.2),
      tealPanel: em(0xc8f6ef, 2.0),
      warmPanel: em(0xffd6a0, 2.0),
    };
  }

  tiled(mat, rx, ry) {
    if (!mat.map) return mat;
    const key = `${mat.uuid}:${rx.toFixed(2)}:${ry.toFixed(2)}`;
    let m = this._tiles.get(key);
    if (!m) {
      m = mat.clone();
      for (const k of ['map', 'normalMap', 'roughnessMap']) {
        if (!mat[k]) continue;
        m[k] = mat[k].clone();
        m[k].repeat.set(rx, ry);
        m[k].needsUpdate = true;
      }
      this._tiles.set(key, m);
    }
    return m;
  }

  _boxGeo(w, h, d) {
    const k = `${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}`;
    let g = this._geos.get(k);
    if (!g) { g = new THREE.BoxGeometry(w, h, d); this._geos.set(k, g); }
    return g;
  }

  _shade(mesh, cast = true) {
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    return mesh;
  }

  // ---------- primitives ----------
  collider(minX, maxX, minZ, maxZ) {
    const c = { minX, maxX, minZ, maxZ, enabled: true };
    this.colliders.push(c);
    return c;
  }

  box(w, h, d, x, y, z, mat, o = {}) {
    const { collide = false, tile = 0, repeat = null, rx = 0, ry = 0, rz = 0, parent = this.group, block = collide, cast = true } = o;
    let m = mat;
    if (repeat) m = this.tiled(mat, repeat[0], repeat[1]);
    else if (tile) m = this.tiled(mat, Math.max(w, d) / tile, h / tile);
    const mesh = this._shade(new THREE.Mesh(this._boxGeo(w, h, d), m), cast);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    if (collide) this.collider(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
    if (block) this.blockers.push(mesh);
    return mesh;
  }

  plane(w, d, x, y, z, mat, { tile = 0, repeat = null, ceiling = false, parent = this.group } = {}) {
    let m = mat;
    if (repeat) m = this.tiled(mat, repeat[0], repeat[1]);
    else if (tile) m = this.tiled(mat, w / tile, d / tile);
    const mesh = this._shade(new THREE.Mesh(new THREE.PlaneGeometry(w, d), m), false);
    mesh.rotation.x = ceiling ? Math.PI / 2 : -Math.PI / 2;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  // Vertical plane; rotY 0 faces +Z
  vplane(w, h, x, y, z, rotY, mat, parent = this.group) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  cyl(r, len, x, y, z, axis, mat, { seg = 12, parent = this.group, r2 = null, collide = false } = {}) {
    const mesh = this._shade(new THREE.Mesh(new THREE.CylinderGeometry(r2 ?? r, r, len, seg), mat));
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    else if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    if (collide) { this.collider(x - r, x + r, z - r, z + r); this.blockers.push(mesh); }
    return mesh;
  }

  instanced(geo, mat, transforms, parent = this.group) {
    if (!transforms.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, transforms.length);
    const o = new THREE.Object3D();
    transforms.forEach((p, i) => {
      o.position.set(p.x, p.y, p.z);
      o.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
      o.scale.set(p.sx || 1, p.sy || 1, p.sz || 1);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    im.receiveShadow = true;
    parent.add(im);
    return im;
  }

  dots(points, mat, size = [0.16, 0.02, 0.05]) {
    return this.instanced(this._boxGeo(...size), mat, points);
  }

  // Lit decal (stencil, warning label, paper) laid flat on a surface
  decal(texture, w, h, x, y, z, rotY, { parent = this.group, opacity = 1, rotX = 0, rough = 0.85 } = {}) {
    const mat = new THREE.MeshStandardMaterial({
      map: texture, transparent: true, opacity, depthWrite: false, roughness: rough, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.set(rotX, rotY, 0);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  stencil(text, w, h, x, y, z, rotY, opts = {}) {
    return this.decal(stencilTexture(text, { w: 512, h: Math.max(48, Math.round((512 * h) / w)), ...opts }), w, h, x, y, z, rotY, opts);
  }

  warning(lines, w, x, y, z, rotY, opts = {}) {
    return this.decal(warningLabelTexture(lines, opts), w, w / 2, x, y, z, rotY, opts);
  }

  // Unlit (self-illuminated) text, e.g. on signs with backlights
  label(text, w, h, x, y, z, rotY, opts = {}) {
    const tex = labelTexture(text, { w: 512, h: Math.max(32, Math.round((512 * h) / w)), ...opts });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, opacity: opts.opacity ?? 0.9 });
    return this.vplane(w, h, x, y, z, rotY, mat, opts.parent || this.group);
  }

  curvedScreenGeo(w, h, bulge = 0.02) {
    const g = new THREE.PlaneGeometry(w, h, 12, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const nx = p.getX(i) / (w / 2), ny = p.getY(i) / (h / 2);
      p.setZ(i, bulge * (1 - 0.5 * (nx * nx + ny * ny)));
    }
    g.computeVertexNormals();
    return g;
  }

  // Display surface with a ScreenTexture. Glass-like: slight gloss over the image.
  screen(screenTex, w, h, x, y, z, rotY, { tilt = 0, frame = true, parent = this.group, bulge = 0.012 } = {}) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    parent.add(g);
    if (frame) this.box(w + 0.08, h + 0.08, 0.05, 0, 0, -0.03, this.mat.dark, { parent: g, rx: -tilt });
    const mat = new THREE.MeshBasicMaterial({ map: screenTex.texture, toneMapped: false });
    mat.color.setScalar(0.85);
    const mesh = new THREE.Mesh(this.curvedScreenGeo(w, h, bulge), mat);
    mesh.rotation.x = -tilt;
    mesh.position.z = 0.002;
    g.add(mesh);
    this.screens.add(screenTex);
    return mesh;
  }

  // ---------- lights ----------
  // Point light with optional emissive fixture. mode: steady | fault | emergency
  light(x, y, z, color, intensity, distance, { flicker = null, panel = null, panelSize = [1.2, 0.05, 0.25], rooms = null } = {}) {
    let mesh = null;
    if (panel) {
      const mat = flicker ? panel.clone() : panel;
      mesh = this.box(panelSize[0], panelSize[1], panelSize[2], x, y + 0.1, z, mat, { cast: false });
      this.box(panelSize[0] + 0.08, 0.04, panelSize[2] + 0.08, x, y + 0.14, z, this.mat.dark, { cast: false });
    }
    return this.lights.add({
      type: 'point', pos: { x, y, z }, color, intensity, distance, mode: flicker || 'steady',
      seed: Math.random() * 100, k: 1, room: this.room, rooms,
      panel: mesh ? mesh.material : null, panelBase: mesh ? mesh.material.emissiveIntensity : 0,
    });
  }

  // Directional cold work-light: a caged lamp throwing a pool of light below.
  workLight(x, y, z, { tx = x, ty = 0, tz = z, color = 0xa8e6e0, intensity = 30, distance = 11, angle = 0.65, flicker = null, rooms = null } = {}) {
    const M = this.mat;
    const lensMat = flicker ? M.tealPanel.clone() : M.tealPanel;
    this.cyl(0.13, 0.14, x, y + 0.07, z, 'y', M.graphite, { seg: 14, r2: 0.09 });
    const lens = this.cyl(0.11, 0.02, x, y - 0.01, z, 'y', lensMat, { seg: 14 });
    lens.castShadow = false;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      this.box(0.012, 0.1, 0.012, x + Math.cos(a) * 0.12, y - 0.04, z + Math.sin(a) * 0.12, M.dark, { cast: false });
    }
    return this.lights.add({
      type: 'spot', pos: { x, y: y - 0.05, z }, target: { x: tx, y: ty, z: tz }, color, intensity, distance,
      angle, penumbra: 0.55, mode: flicker || 'steady', seed: Math.random() * 100, k: 1, room: this.room, rooms,
      panel: lensMat, panelBase: lensMat.emissiveIntensity,
    });
  }

  updateLights(dt, t, camPos, room) { this.lights.update(dt, t, camPos, room); }

  // Merge static meshes that share a material, per room, into single meshes.
  // Cuts draw calls by roughly 5x. Interactive, moving and dynamic objects are kept separate.
  // Raycast blockers keep working: detached meshes retain their final world matrix.
  finalize(keep, roomAt) {
    this.group.updateMatrixWorld(true);
    const isKept = (o) => {
      for (let p = o; p && p !== this.group; p = p.parent) if (keep.has(p)) return true;
      return false;
    };
    const buckets = new Map();
    const wp = new THREE.Vector3();
    this.group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || isKept(o)) return;
      wp.setFromMatrixPosition(o.matrixWorld);
      const key = `${o.material.uuid}|${roomAt(wp.x, wp.z)}|${o.castShadow ? 1 : 0}`;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push(o);
    });
    let before = 0, after = 0;
    for (const list of buckets.values()) {
      before += list.length;
      if (list.length < 2) { after += list.length; continue; }
      const geos = list.map((m) => {
        let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (!g.index) g = g.toNonIndexed();
        return g;
      });
      const indexed = geos.every((g) => g.index);
      const merged = mergeGeometries(indexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
      if (!merged) { after += list.length; continue; }
      const mesh = new THREE.Mesh(merged, list[0].material);
      mesh.castShadow = list[0].castShadow;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      for (const m of list) m.parent.remove(m);
      after += 1;
    }
    return { before, after };
  }

  // ---------- architecture ----------
  // axis 'x': wall along X at z = at. axis 'z': wall along Z at x = at.
  // openings: [{ c, w, y0 = 0, h = 2.6 }] with c measured along the wall.
  // style: { upper, lower, band } — lower material below `band` metres, upper above.
  wall(axis, at, from, to, H, openings = [], { upper = this.mat.teal, lower = null, band = 1.1, tile = 2, thick = 0.3 } = {}) {
    const ops = [...openings].sort((a, b) => a.c - b.c);
    let cursor = from;
    const piece = (s, e, y0, y1, mat) => {
      const len = e - s, h = y1 - y0;
      if (len <= 0.001 || h <= 0.001) return;
      const mid = (s + e) / 2, yc = (y0 + y1) / 2, collide = y0 < 1.8;
      if (axis === 'x') this.box(len, h, thick, mid, yc, at, mat, { collide, tile, block: true });
      else this.box(thick, h, len, at, yc, mid, mat, { collide, tile, block: true });
    };
    const seg = (s, e, y0, y1) => {
      if (lower && y0 < band && y1 > band) {
        piece(s, e, y0, band, lower);
        piece(s, e, band, y1, upper);
        const len = e - s, mid = (s + e) / 2;
        if (axis === 'x') this.box(len, 0.06, thick + 0.06, mid, band, at, this.mat.graphite, { cast: false });
        else this.box(thick + 0.06, 0.06, len, at, band, mid, this.mat.graphite, { cast: false });
      } else {
        piece(s, e, y0, y1, lower && y1 <= band ? lower : upper);
      }
      if (y0 === 0) {
        const len = e - s, mid = (s + e) / 2;
        if (axis === 'x') this.box(len, 0.14, thick + 0.08, mid, 0.07, at, this.mat.dark, { cast: false });
        else this.box(thick + 0.08, 0.14, len, at, 0.07, mid, this.mat.dark, { cast: false });
      }
    };
    for (const op of ops) {
      const a = op.c - op.w / 2, b = op.c + op.w / 2, y0 = op.y0 ?? 0, h = op.h ?? 2.6;
      if (a > cursor) seg(cursor, a, 0, H);
      if (y0 > 0) seg(a, b, 0, y0);
      if (y0 + h < H) seg(a, b, y0 + h, H);
      cursor = b;
    }
    if (cursor < to) seg(cursor, to, 0, H);
  }

  // walls: { n, s, w, e } — each an openings array; omit a key to skip that wall.
  // n = minZ side, s = maxZ side, w = minX side, e = maxX side.
  roomShell({ x0, x1, z0, z1, H, walls = {}, floor = 'floor', floorTile = 2, ceiling = 'ceiling', style = {} }) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.plane(w, d, cx, 0, cz, this.mat[floor], { tile: floorTile });
    this.plane(w, d, cx, H, cz, this.mat[ceiling], { tile: 2, ceiling: true });
    if (walls.n) this.wall('x', z0, x0 - 0.15, x1 + 0.15, H, walls.n, style);
    if (walls.s) this.wall('x', z1, x0 - 0.15, x1 + 0.15, H, walls.s, style);
    if (walls.w) this.wall('z', x0, z0 + 0.15, z1 - 0.15, H, walls.w, style);
    if (walls.e) this.wall('z', x1, z0 + 0.15, z1 - 0.15, H, walls.e, style);
  }

  // Structural frame across a passage. alongX = passage runs along X.
  rib(px, pz, alongX, halfW, H) {
    const M = this.mat;
    const g = new THREE.Group();
    g.position.set(px, 0, pz);
    g.rotation.y = alongX ? 0 : Math.PI / 2;
    this.group.add(g);
    const inner = halfW - 0.15, d = 0.22, pz0 = inner - d / 2;
    for (const s of [-1, 1]) {
      this.box(0.26, H, d, 0, H / 2, s * pz0, M.graphite, { parent: g });
      this.box(0.27, 0.62, 0.2, 0, H - 0.42, s * (inner - 0.36), M.graphite, { parent: g, rx: (-s * Math.PI) / 4 });
      // bolt heads
      for (const y of [0.4, 1.4, 2.2]) this.box(0.05, 0.05, 0.03, 0.08, y, s * (inner - d - 0.012), M.dark, { parent: g, cast: false });
      if (alongX) this.collider(px - 0.13, px + 0.13, pz + s * pz0 - d / 2, pz + s * pz0 + d / 2);
      else this.collider(px + s * pz0 - d / 2, px + s * pz0 + d / 2, pz - 0.13, pz + 0.13);
    }
    this.box(0.26, 0.22, inner * 2, 0, H - 0.11, 0, M.graphite, { parent: g });
  }

  pipe(x0, y0, z0, x1, y1, z1, r, mat) {
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const axis = Math.abs(x1 - x0) > 0.01 ? 'x' : Math.abs(z1 - z0) > 0.01 ? 'z' : 'y';
    const m = this.cyl(r, len, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, axis, mat, { seg: 10 });
    // flanges every ~2.4m
    const n = Math.floor(len / 2.4);
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      this.cyl(r * 1.45, 0.05, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, axis, this.mat.graphite, { seg: 10 });
    }
    return m;
  }

  corridor({ alongX, from, to, at, H = 3.2, halfW = 1.5, openings = {}, ribs = [], lights = [], style = {} }) {
    const M = this.mat, len = to - from, mid = (from + to) / 2, W = halfW * 2;
    const P = (s, a) => (alongX ? [s, a] : [a, s]); // (along, across) -> [x, z]

    if (alongX) {
      this.plane(len, W, mid, 0, at, M.floor, { tile: 2 });
      this.plane(len, 1.7, mid, 0.006, at, M.grate, { repeat: [len / 1.7, 1] });
      this.plane(len, W, mid, H, at, M.ceiling, { tile: 2, ceiling: true });
      this.wall('x', at - halfW, from, to, H, openings.neg || [], style);
      this.wall('x', at + halfW, from, to, H, openings.pos || [], style);
    } else {
      this.plane(W, len, at, 0, mid, M.floor, { tile: 2 });
      this.plane(1.7, len, at, 0.006, mid, M.grate, { repeat: [1, len / 1.7] });
      this.plane(W, len, at, H, mid, M.ceiling, { tile: 2, ceiling: true });
      this.wall('z', at - halfW, from, to, H, openings.neg || [], style);
      this.wall('z', at + halfW, from, to, H, openings.pos || [], style);
    }

    for (const s of [-1, 1]) {
      const [x, z] = P(mid, at + s * 0.88);
      this.box(alongX ? len : 0.06, 0.03, alongX ? 0.06 : len, x, 0.015, z, M.graphite, { cast: false });
    }

    for (const r of ribs) { const [x, z] = P(r, at); this.rib(x, z, alongX, halfW, H); }

    // Floor guide lights (sparse, dim amber-white)
    const pts = [];
    for (let s = from + 0.6; s < to - 0.3; s += 2.4) {
      for (const side of [-1, 1]) {
        const [x, z] = P(s, at + side * (halfW - 0.45));
        pts.push({ x, y: 0.012, z, ry: alongX ? 0 : Math.PI / 2 });
      }
    }
    this.dots(pts, M.amberDim, [0.12, 0.02, 0.04]);

    // Service runs: pipes, insulated line, handrail and cable tray
    const off = halfW - 0.27;
    const runs = [
      [-1, H - 0.75, 0.07, M.pipe],
      [-1, H - 0.95, 0.05, M.copper],
      [1, H - 0.32, 0.1, M.pipeInsulated],
    ];
    for (const [side, y, r, m] of runs) {
      const [xa, za] = P(from, at + side * off), [xb, zb] = P(to, at + side * off);
      this.pipe(xa, y, za, xb, y, zb, r, m);
    }
    {
      const [xa, za] = P(from, at - off), [xb, zb] = P(to, at - off);
      this.pipe(xa, 1.0, za, xb, 1.0, zb, 0.03, M.steel);
    }
    { const [x, z] = P(mid, at + 0.55); this.box(alongX ? len : 0.35, 0.05, alongX ? 0.35 : len, x, H - 0.28, z, M.graphite, { cast: false }); }

    for (const L of lights) {
      const [x, z] = P(L.s, at);
      if (L.kind === 'work') {
        this.workLight(x, H - 0.22, z, { intensity: L.intensity ?? 22, distance: L.distance ?? 8, flicker: L.flicker || null });
      } else {
        this.light(x, H - 0.18, z, L.color ?? 0xffe8c8, L.intensity ?? 6, L.distance ?? 8, {
          flicker: L.flicker || null,
          panel: L.panel === 'teal' ? M.tealPanel : L.panel === 'warm' ? M.warmPanel : M.ivoryPanel,
          panelSize: alongX ? [0.9, 0.05, 0.28] : [0.28, 0.05, 0.9],
        });
      }
    }
  }

  // Round window set into a rectangular wall opening. rotY: direction the inner face looks.
  porthole(x, y, z, rotY, { radius = 0.95, size = 2.2, thick = 0.3, wallMat = this.mat.teal } = {}) {
    const M = this.mat;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    this.group.add(g);

    const key = `mask:${wallMat.uuid}:${radius}:${size}`;
    let maskMat = this._tiles.get(key);
    if (!maskMat) {
      maskMat = wallMat.clone();
      for (const k of ['map', 'normalMap', 'roughnessMap']) {
        if (!wallMat[k]) continue;
        maskMat[k] = wallMat[k].clone();
        maskMat[k].repeat.set(size / 2, size / 2);
        maskMat[k].needsUpdate = true;
      }
      maskMat.alphaMap = circleMaskTexture(radius / (size / 2));
      maskMat.alphaTest = 0.5;
      this._tiles.set(key, maskMat);
    }
    if (!this._liningMat) {
      this._liningMat = M.graphite.clone();
      this._liningMat.side = THREE.DoubleSide;
    }

    for (const s of [1, -1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size), maskMat);
      p.position.z = s * (thick / 2 + 0.004);
      if (s < 0) p.rotation.y = Math.PI;
      p.receiveShadow = true;
      g.add(p);
      this.blockers.push(p);
    }

    const lining = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thick, 40, 1, true), this._liningMat);
    lining.rotation.x = Math.PI / 2;
    g.add(lining);

    for (const s of [1, -1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.04, 0.08, 12, 48), M.graphite);
      ring.position.z = s * (thick / 2 + 0.03);
      g.add(ring);
      const seal = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.01, 0.025, 8, 48), M.rubber);
      seal.position.z = s * (thick / 2 + 0.01);
      g.add(seal);
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.box(0.05, 0.05, 0.04, Math.cos(a) * (radius + 0.2), Math.sin(a) * (radius + 0.2), thick / 2 + 0.02, M.dark, { parent: g, cast: false });
    }

    const glass = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), M.glass);
    glass.position.z = 0.02;
    g.add(glass);
    this.blockers.push(glass);
    return g;
  }
}
