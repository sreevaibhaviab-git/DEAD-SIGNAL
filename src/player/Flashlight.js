import * as THREE from 'three';

export class Flashlight {
  constructor(camera) {
    this.light = new THREE.SpotLight(0xfff1dc, 13, 16, Math.PI / 6.5, 0.6, 2);
    this.light.position.set(0.18, -0.14, 0.05);
    this.light.shadow.mapSize.set(512, 512);
    this.light.shadow.camera.near = 0.2;
    this.light.shadow.camera.far = 18;
    this.light.shadow.bias = -0.0015;
    this.target = new THREE.Object3D();
    this.target.position.set(0, -0.05, -1);
    this.light.target = this.target;
    camera.add(this.light);
    camera.add(this.target);
    this.on = true;
    this.base = 13;
  }

  setShadows(on) { this.light.castShadow = !!on; }

  toggle() {
    this.on = !this.on;
    this.light.visible = this.on;
    return this.on;
  }

  update(t) {
    if (!this.on) return;
    this.light.intensity = this.base * (0.97 + 0.03 * Math.sin(t * 13.7) * Math.sin(t * 3.1));
  }
}
