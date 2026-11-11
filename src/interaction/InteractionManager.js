import * as THREE from 'three';

// Raycasts from the screen centre. Hits on non-interactive geometry block the ray,
// so prompts never appear through walls or for objects hidden behind others.
export class InteractionManager {
  constructor(camera, maxDistance = 2.6) {
    this.camera = camera;
    this.ray = new THREE.Raycaster();
    this.ray.far = maxDistance;
    this.meshes = [];
    this.blockers = [];
    this.current = null;
    this._center = new THREE.Vector2(0, 0);
    this._targets = [];
  }

  // item: { prompt: () => {text, kind}, onInteract: () => void, enabled?: () => boolean }
  add(meshes, item) {
    for (const m of [].concat(meshes || [])) {
      if (!m) continue;
      m.userData.interactable = item;
      this.meshes.push(m);
    }
    return item;
  }

  setBlockers(list) { this.blockers = list; }

  update() {
    this.ray.setFromCamera(this._center, this.camera);
    this._targets.length = 0;
    for (const m of this.meshes) this._targets.push(m);
    for (const m of this.blockers) this._targets.push(m);
    const hits = this.ray.intersectObjects(this._targets, false);
    let found = null;
    for (const h of hits) {
      const it = h.object.userData.interactable;
      if (!it) break; // a wall or prop is in the way
      if (!it.enabled || it.enabled()) { found = it; break; }
    }
    this.current = found;
    return found;
  }
}
