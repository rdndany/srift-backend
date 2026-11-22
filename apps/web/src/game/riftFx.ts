import * as THREE from 'three';
import { RIFT_GRADE_DEFS, RIFT_OMEN, type RiftView } from '@solrift/shared';

/**
 * What a rift looks like in the world: a column of light, tall enough to be seen from far off (it is how a player finds it), standing on a
 * floor of glowing blocks that turn slowly, with cubes of light rising along it in a spiral. It is drawn in the colour of its grade.
 * It swells while the rift is tearing open, burns while it is fought, turns gold and fades when it is sealed, and shrinks away when it collapses.
 */

const BEAM_HEIGHT = 140;
const SPARKS = 90;
const RING_CUBES = 28;
const FADE = 5;

interface Spark {
  a: number;
  r: number;
  speed: number;
  phase: number;
  size: number;
}

export class RiftFx {
  readonly group = new THREE.Group();
  private readonly beam: THREE.Mesh;
  private readonly core: THREE.Mesh;
  private readonly beamMat: THREE.MeshBasicMaterial;
  private readonly coreMat: THREE.MeshBasicMaterial;
  private readonly cubes: THREE.InstancedMesh;
  private readonly cubeMat: THREE.MeshBasicMaterial;
  private readonly sparks: Spark[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly col = new THREE.Color();
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private time = 0;
  private phase: RiftView['phase'] | null = null;
  private phaseAt = 0;
  private grade: RiftView['grade'] | null = null;
  private tint = new THREE.Color();
  private readonly gold = new THREE.Color(1, 0.86, 0.45);
  private readonly white = new THREE.Color(1, 1, 1);

  constructor() {
    this.group.visible = false;
    this.beamMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.25, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.coreMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.beam = new THREE.Mesh(this.box, this.beamMat);
    this.beam.scale.set(3.2, BEAM_HEIGHT, 3.2);
    this.beam.position.y = BEAM_HEIGHT / 2;
    this.core = new THREE.Mesh(this.box, this.coreMat);
    this.core.scale.set(1.2, BEAM_HEIGHT, 1.2);
    this.core.position.y = BEAM_HEIGHT / 2;
    for (const m of [this.beam, this.core]) {
      m.frustumCulled = false;
      m.renderOrder = 12;
    }
    this.cubeMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.cubes = new THREE.InstancedMesh(this.box, this.cubeMat, RING_CUBES * 2 + SPARKS);
    this.cubes.frustumCulled = false;
    this.cubes.renderOrder = 13;
    this.cubes.setColorAt(0, this.col.setRGB(1, 1, 1));
    this.group.add(this.beam, this.core, this.cubes);
    for (let i = 0; i < SPARKS; i++) this.sparks.push({ a: i * 2.399963, r: 0.6 + Math.random() * 1.6, speed: 3 + Math.random() * 6, phase: Math.random(), size: 0.18 + Math.random() * 0.22 });
  }

  /** Draw the rift (or nothing, when there is none in sight). */
  update(dt: number, view: RiftView | null): void {
    if (!view) {
      this.group.visible = false;
      this.phase = null;
      return;
    }
    this.time += dt;
    if (view.phase !== this.phase || view.grade !== this.grade) {
      this.phase = view.phase;
      this.grade = view.grade;
      this.phaseAt = this.time;
      this.tint.set(RIFT_GRADE_DEFS[view.grade].color);
    }
    const since = this.time - this.phaseAt;
    // How strong it is: it swells through the omen, is full while fought, and fades or shrinks away when it is over.
    let k = 1;
    let tone = this.tint;
    if (view.phase === 'omen') k = 0.2 + 0.8 * Math.min(1, Math.max(0, 1 - view.seconds / RIFT_OMEN));
    else if (view.phase === 'sealed') {
      k = Math.max(0, 1 - since / FADE);
      tone = this.gold;
    } else if (view.phase === 'collapsed') k = Math.max(0, 1 - since / 3);
    if (k <= 0.001) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.group.position.set(view.x, view.y - 1, view.z);
    const pulse = 0.85 + 0.15 * Math.sin(this.time * 5);
    const wide = view.phase === 'collapsed' ? k : 1;
    this.beamMat.color.copy(tone);
    this.coreMat.color.copy(tone).lerp(this.white, 0.55);
    this.beamMat.opacity = 0.22 * k * pulse;
    this.coreMat.opacity = 0.5 * k * pulse;
    this.beam.scale.x = this.beam.scale.z = 3.2 * wide * (0.9 + 0.1 * Math.sin(this.time * 2.3));
    this.core.scale.x = this.core.scale.z = 1.2 * wide;
    this.beam.rotation.y = this.core.rotation.y = this.time * 0.6;
    this.cubeMat.color.copy(tone);

    // The floor: two rings of glowing blocks turning against each other, and the rising cubes in a spiral round the column.
    let n = 0;
    const put = (x: number, y: number, z: number, size: number, spin: number, bright: number): void => {
      this.q.setFromAxisAngle(this.p.set(0, 1, 0), spin);
      this.p.set(x, y, z);
      this.s.set(size, size, size);
      this.m4.compose(this.p, this.q, this.s);
      this.cubes.setMatrixAt(n, this.m4);
      this.cubes.setColorAt(n, this.col.setRGB(bright, bright, bright));
      n++;
    };
    for (let i = 0; i < RING_CUBES; i++) {
      const outer = i % 2 === 0;
      const a = (i / RING_CUBES) * Math.PI * 2 + this.time * (outer ? 0.35 : -0.5);
      const r = (outer ? 4.4 : 2.9) * wide;
      const lift = 0.3 + 0.18 * Math.sin(this.time * 3 + i);
      put(Math.cos(a) * r, lift, Math.sin(a) * r, outer ? 0.55 : 0.4, a, (0.7 + 0.3 * Math.sin(this.time * 4 + i * 1.7)) * k);
    }
    for (let i = 0; i < RING_CUBES; i++) {
      // (a second ring a little higher, so it reads as a crown)
      const a = (i / RING_CUBES) * Math.PI * 2 - this.time * 0.8;
      put(Math.cos(a) * 1.9 * wide, 1.6 + 0.5 * Math.sin(this.time * 2 + i * 0.6), Math.sin(a) * 1.9 * wide, 0.22, a, 0.8 * k);
    }
    for (const sp of this.sparks) {
      const t = (sp.phase + (this.time * sp.speed) / 60) % 1;
      const y = t * 60;
      const a = sp.a + this.time * 1.4 + y * 0.12;
      const r = sp.r * wide * (1 - t * 0.5);
      put(Math.cos(a) * r, y, Math.sin(a) * r, sp.size, a, Math.min(1, 1.4 - t) * k);
    }
    this.cubes.count = n;
    this.cubes.instanceMatrix.needsUpdate = true;
    if (this.cubes.instanceColor) this.cubes.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.box.dispose();
    this.beamMat.dispose();
    this.coreMat.dispose();
    this.cubeMat.dispose();
    this.cubes.dispose();
  }
}
