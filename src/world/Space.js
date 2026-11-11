import * as THREE from 'three';
import { starTexture, earthTexture, cloudTexture, solarTexture } from './textures.js';

const VERT = `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vView = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const PLANET_FRAG = `
uniform sampler2D map;
uniform vec3 sunDir;
uniform float alphaMul;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
  vec4 tex = texture2D(map, vUv);
  vec3 n = normalize(vN);
  float d = dot(n, normalize(sunDir));
  float day = smoothstep(-0.15, 0.4, d);
  vec3 col = tex.rgb * (0.015 + 1.25 * day);
  float fres = pow(1.0 - max(dot(n, vView), 0.0), 3.0);
  col += vec3(0.2, 0.45, 1.0) * fres * day * 0.5;
  gl_FragColor = vec4(col, tex.a * alphaMul);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const ATMO_FRAG = `
uniform vec3 sunDir;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
  vec3 n = normalize(vN);
  float fres = pow(1.0 - max(dot(n, vView), 0.0), 2.2);
  float day = smoothstep(-0.35, 0.45, dot(n, normalize(sunDir)));
  float a = fres * day;
  gl_FragColor = vec4(vec3(0.3, 0.58, 1.0) * a * 1.6, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Exterior hull lit only by the sun, so it never affects interior lighting.
const HULL_FRAG = `
uniform vec3 color;
uniform vec3 sunDir;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
  vec3 n = normalize(vN);
  float l = max(dot(n, normalize(sunDir)), 0.0);
  float panel = step(0.96, fract(vUv.x * 8.0)) + step(0.96, fract(vUv.y * 8.0));
  vec3 col = color * (0.05 + 1.1 * l) * (1.0 - 0.25 * clamp(panel, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Space {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.sunDir = new THREE.Vector3(-0.65, 0.35, -0.68).normalize();

    const stars = new THREE.Mesh(
      new THREE.SphereGeometry(450, 48, 24),
      new THREE.MeshBasicMaterial({ map: starTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    stars.renderOrder = -10;
    this.group.add(stars);

    const planetMat = (map, alphaMul, transparent) => new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, sunDir: { value: this.sunDir }, alphaMul: { value: alphaMul } },
      vertexShader: VERT, fragmentShader: PLANET_FRAG, transparent, depthWrite: !transparent, fog: false,
    });

    this.earthPivot = new THREE.Group();
    this.earthPivot.position.set(14, -62, 78);
    this.earthPivot.rotation.z = 0.4;
    this.group.add(this.earthPivot);

    this.earth = new THREE.Mesh(new THREE.SphereGeometry(60, 128, 64), planetMat(earthTexture(), 1, false));
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(60.4, 128, 64), planetMat(cloudTexture(), 0.9, true));
    this.earthPivot.add(this.earth, this.clouds);

    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(62.5, 96, 48),
      new THREE.ShaderMaterial({
        uniforms: { sunDir: { value: this.sunDir } },
        vertexShader: VERT, fragmentShader: ATMO_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      }),
    );
    atmo.position.copy(this.earthPivot.position);
    this.group.add(atmo);

    this._hull();
    this._shuttle();
  }

  _sunMat(hex) {
    return new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(hex) }, sunDir: { value: this.sunDir } },
      vertexShader: VERT, fragmentShader: HULL_FRAG, fog: false,
    });
  }

  _add(w, h, d, x, y, z, mat, parent = this.group, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    parent.add(m);
    return m;
  }

  _hull() {
    const hull = this._sunMat(0x2a3138), light = this._sunMat(0x4f585f), white = this._sunMat(0x9a9890);
    // Main truss beneath the station (seen from the corridor window)
    this._add(46, 0.5, 0.5, 10, -3.2, 2, light);
    this._add(46, 0.5, 0.5, 10, -4.4, 2, light);
    for (let x = -12; x <= 32; x += 3) this._add(0.25, 1.2, 0.25, x, -3.8, 2, hull);
    this._add(3, 3, 3, 22, -3.8, 2, hull);
    // Habitat modules in the distance to give scale
    const mod = (x, y, z, len, r, ry) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24), white);
      m.rotation.z = Math.PI / 2; m.rotation.y = ry;
      m.position.set(x, y, z); this.group.add(m);
    };
    mod(30, -2, 18, 14, 2.2, 0.4);
    mod(-6, -3, 22, 10, 1.8, -0.3);
    // Solar array
    const solar = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 7),
      new THREE.MeshBasicMaterial({ map: solarTexture(), fog: false, side: THREE.DoubleSide }),
    );
    solar.position.set(16, -5.2, 14);
    solar.rotation.x = -Math.PI / 2 + 0.35;
    this.group.add(solar);
    this._add(0.3, 0.3, 12, 16, -4.5, 8, light);
    // Comms antenna mast
    this._add(0.2, 9, 0.2, 26, 1, 12, light);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3), white);
    dish.position.set(26, 5.6, 12); dish.rotation.x = -1.1;
    this.group.add(dish);

    const beacon = (hex) => new THREE.MeshBasicMaterial({ color: hex, toneMapped: false, fog: false });
    this.beacons = [
      this._add(0.25, 0.25, 0.25, 32.5, -3.2, 2, beacon(0xff3030)),
      this._add(0.25, 0.25, 0.25, -12.5, -3.2, 2, beacon(0x30ff80)),
      this._add(0.2, 0.2, 0.2, 26, 5.6, 12, beacon(0xff3030)),
    ];
  }

  _shuttle() {
    const body = this._sunMat(0x5a6168), dark = this._sunMat(0x1c2126);
    const g = new THREE.Group();
    g.position.set(4.8, 0.6, 12.5);
    g.rotation.y = -0.25;
    this.group.add(g);
    this._add(2.8, 2.0, 7.5, 0, 0, 0, body, g);
    this._add(2.2, 1.4, 1.6, 0, 0.1, -4.4, body, g);
    this._add(6.5, 0.15, 2.6, 0, -0.55, 1.4, dark, g);
    this._add(1.4, 1.4, 1.6, 0, 0, 4.4, dark, g);
    this._add(2.0, 0.22, 0.05, 0, 0.45, -5.23, new THREE.MeshBasicMaterial({ color: 0x8fe9df, toneMapped: false, fog: false }), g);
    const nav = (hex) => new THREE.MeshBasicMaterial({ color: hex, toneMapped: false, fog: false });
    this.navLights = [
      this._add(0.15, 0.15, 0.15, -3.25, -0.55, 1.4, nav(0xff3030), g),
      this._add(0.15, 0.15, 0.15, 3.25, -0.55, 1.4, nav(0x30ff80), g),
    ];
  }

  update(t) {
    this.earth.rotation.y = t * 0.003;
    this.clouds.rotation.y = t * 0.0042;
    const on = Math.sin(t * 2.2) > 0.6;
    for (const b of this.beacons) b.visible = on;
    for (const n of this.navLights) n.visible = !on;
  }
}
