import type * as THREE from 'three';
import type { MountId } from '@solrift/shared';
import { BODY_SCALE, type Character } from './character';
import { BODY_LIFT, Fenrir, MOUNT_SCALE, SEAT_Y, SEAT_Z, type StepHandler } from './fenrir';

/** How far the rider's hips are above the saddle (the sitting figure's seat is a little proud of the leather). */
const SAT_ON = 0.05;
/** The figure's hips are this high above its origin. */
const HIP = 0.75 * BODY_SCALE;
/** How much higher than a person on foot a rider's head (and so the name tag above it) is. */
const RIDER_SEAT = (SEAT_Y + SAT_ON) * MOUNT_SCALE - HIP;
export const RIDER_LIFT = RIDER_SEAT + BODY_LIFT;

/**
 * A mount under a figure: the animal (made when the figure first mounts, thrown away a while after it gets off) and the pivot
 * the figure's body hangs from, which rides the saddle as the mount bobs and pitches. Both the player's own figure and
 * those of the other players use it.
 */
export class MountRig {
  private fenrir: Fenrir | null = null;

  /** A paw of the mount came down (see `Fenrir.onStep`): the game makes the sound and the dust. */
  onStep: StepHandler | null = null;

  /** `host` is the group that holds the figure and now the mount; `rider` is the pivot the figure's root hangs from. */
  constructor(
    private readonly host: THREE.Group,
    private readonly rider: THREE.Group,
    private readonly character: Character,
  ) {}

  get mounted(): boolean {
    return this.fenrir !== null;
  }

  /**
   * One frame. `id` is the mount ridden (null: on foot). Call before the figure's own `animate`, which then sits the body on
   * the saddle. `light` is the colour of the light that falls on the mount. `viewer` is where the camera is (it keeps the lightning
   * off it), and `rider` is true when the camera is the rider's own, in first person.
   */
  update(dt: number, id: MountId | null, speed: number, turn: number, vy: number, airborne: boolean, light?: THREE.Color, viewer?: THREE.Vector3 | null, rider = false): void {
    if (!id) {
      if (this.fenrir) this.remove();
      return;
    }
    if (!this.fenrir) {
      this.fenrir = new Fenrir(id);
      this.fenrir.appear();
      this.host.add(this.fenrir.root);
      this.character.setRiding(true);
    } else this.fenrir.setMount(id);
    const f = this.fenrir;
    f.setViewer(viewer ?? null, rider);
    f.onStep = this.onStep;
    f.update(dt, speed, turn, vy, airborne);
    if (light) f.setTint(light);
    // The saddle moves with the body: the seat point turned about the body's origin by its pitch and roll, then raised by the bob.
    const cp = Math.cos(f.pitch);
    const sp = Math.sin(f.pitch);
    // (`f.bob` already holds the lift of the body on its long legs.)
    const y = RIDER_SEAT * cp - SEAT_Z * MOUNT_SCALE * sp + f.bob;
    const z = RIDER_SEAT * sp + SEAT_Z * MOUNT_SCALE * cp;
    const cr = Math.cos(f.roll);
    const sr = Math.sin(f.roll);
    // The rider leans over what the body does (into a turn, forward at speed and in a climb, back in a drop). The lean turns the figure about
    // its hips, which are `HIP` above the pivot, so the pivot moves to keep them on the saddle.
    const lp = f.leanPitch;
    const lr = f.leanRoll;
    this.rider.rotation.order = 'ZYX';
    this.rider.position.set(-y * sr + HIP * Math.sin(lr), y * cr + HIP * (2 - Math.cos(lr) - Math.cos(lp)), z - HIP * Math.sin(lp));
    this.rider.rotation.set(f.pitch + lp, 0, f.roll + lr);
  }

  /** The mount does what its rider's skill says: a bite or the howl. */
  act(what: 'bite' | 'howl'): void {
    if (what === 'bite') this.fenrir?.lunge();
    else this.fenrir?.roar();
  }

  private remove(): void {
    if (!this.fenrir) return;
    this.host.remove(this.fenrir.root);
    this.fenrir.dispose();
    this.fenrir = null;
    this.rider.position.set(0, 0, 0);
    this.rider.rotation.set(0, 0, 0);
    this.character.setRiding(false);
  }

  dispose(): void {
    this.remove();
  }
}
