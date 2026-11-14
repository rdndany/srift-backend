import * as THREE from 'three';
import { useUi } from '../ui/store';
import type { ClientSession } from './clientSession';
import type { Input } from './input';
import type { RemoteSession } from './remote';

/** How far (in blocks) the crosshair picks a player as the target, and how long a target stays after looking away. */
const TARGET_RANGE = 32;
const TARGET_KEEP_MS = 6000;

/**
 * The target frame of an online game: the player the crosshair rests on is the target; it stays a few seconds after
 * looking away, and while it is in sight. The frame itself is drawn from the store (`target`).
 */
export class TargetPicker {
  private name: string | null = null;
  private seen = 0;
  private readonly aim = new THREE.Vector3();

  constructor(
    private readonly remote: RemoteSession,
    private readonly session: ClientSession,
    private readonly input: Input,
    private readonly camera: THREE.Camera,
  ) {}

  /** Once a frame: who is under the crosshair now, and what the frame should show. */
  update(): void {
    const now = performance.now();
    let hit: string | null = null;
    if (this.input.locked && this.session.screen === 'none' && !this.session.spectating && !useUi.getState().trade) {
      this.camera.getWorldDirection(this.aim);
      const ox = this.camera.position.x;
      const oy = this.camera.position.y;
      const oz = this.camera.position.z;
      let best = TARGET_RANGE;
      for (const o of this.remote.others.values()) {
        // Does the ray cross the box of the figure (0.8 wide, 1.9 tall, its feet at y)?
        let t0 = 0;
        let t1 = best;
        const slab = (p: number, d: number, lo: number, hi: number): boolean => {
          if (Math.abs(d) < 1e-6) return p >= lo && p <= hi;
          let a = (lo - p) / d;
          let b = (hi - p) / d;
          if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a);
          t1 = Math.min(t1, b);
          return t0 <= t1;
        };
        if (slab(ox, this.aim.x, o.x - 0.4, o.x + 0.4) && slab(oy, this.aim.y, o.y, o.y + 1.9) && slab(oz, this.aim.z, o.z - 0.4, o.z + 0.4) && t0 < best) {
          best = t0;
          hit = o.name;
        }
      }
    }
    if (hit) {
      this.name = hit;
      this.seen = now;
    } else if (this.name && now - this.seen > TARGET_KEEP_MS) this.name = null;
    const o = this.name ? [...this.remote.others.values()].find((p) => p.name === this.name) : undefined;
    const near = o && Math.hypot(o.x - this.session.body.x, o.z - this.session.body.z) <= TARGET_RANGE * 2;
    if (!o || !near) this.name = null;
    const next = o && near ? { name: o.name, ...(o.cls ? { cls: o.cls, level: o.clv ?? 0 } : {}), ...(o.gt ? { guild: o.gt } : {}) } : null;
    const cur = useUi.getState().target;
    if (JSON.stringify(cur) !== JSON.stringify(next)) useUi.setState({ target: next });
  }
}
