import type * as THREE from 'three';
import { THIRD_PERSON_FOV_TRIM } from './selfView';

/** What the view is told each frame. */
export interface FeelFrame {
  dt: number;
  /** The game has begun (what the body does before that is not felt). */
  ready: boolean;
  /** Seen from the eyes (as opposed to from behind or from the front). */
  firstPerson: boolean;
  body: { onGround: boolean; vx: number; vy: number; vz: number };
  /** Where the player looks. */
  yaw: number;
  /** How far a bow is drawn (0..1). */
  bowDraw: number;
  /** A Charge or an Evasive Roll under way (see `ClassView.rush`). */
  rush: { yaw: number; roll?: boolean } | null | undefined;
  /** The part of a Ground Slam under way: 1 the crouch, 2 the jump, 3 the blow (0: none). */
  slam: number;
}

/**
 * What the camera does besides looking where the player looks: it shakes when the ground is hit, dips on a hard landing,
 * kicks when a blow lands, leans into a roll, is thrown about by a Ground Slam, and widens or narrows its angle (a drawn
 * bow, a charge, a run seen from behind).
 *
 * Each frame, once the camera stands where the player looks from: `jolt`, then `carry`. What happens in the game reaches
 * it through `impact`, `kick` and `blow`.
 */
export class ViewFeel {
  /** The field of view of a player standing still or walking, in degrees (a setting; the rest of the feel is added to it). */
  baseFov = 75;
  /** Hard hits on the ground (a Ground Slam, a meteor) knock the screen: the closer, the harder, dying away quickly. */
  private shake = 0;
  /** The weight of a blow you land: the view kicks and zooms in a hair, and for `hitStop` seconds the hand stands almost still. */
  private hitK = 0;
  hitStop = 0;
  /** A hard landing: the view drops and comes back up. */
  private landK = 0;
  private prevVy = 0;
  private wasGrounded = true;
  /** A charge: the view widens (0..1, eased). */
  private rushK = 0;
  /** Running in third person widens the view a little (0..1, eased). */
  private runK = 0;
  /** How far into an Evasive Roll the view is (it dips and leans). */
  private rollK = 0;
  /** A Ground Slam seen from the eyes: how far into each part the view is (eased), the part it was in and the seconds in it. */
  private readonly slamCam = { wind: 0, up: 0, fall: 0, hit: 0 };
  private slamWas = 0;
  private slamT = 0;

  /** Something hit the ground (`strength` already thinned by its distance): the screen is knocked, at most all the way. */
  impact(strength: number): void {
    this.shake = Math.min(1, Math.max(this.shake, strength));
  }

  /** A knock of a given size (a parry). */
  kick(strength: number): void {
    this.shake = Math.max(this.shake, strength);
  }

  /** A blow of yours landed: the hand and the view stop for a moment and the view kicks; harder for a critical one. */
  blow(crit: boolean): void {
    this.hitK = Math.max(this.hitK, crit ? 1 : 0.55);
    this.hitStop = Math.max(this.hitStop, crit ? 0.085 : 0.045);
    this.shake = Math.max(this.shake, crit ? 0.24 : 0.12);
  }

  /** An arrow of yours found its mark: the view jolts a little (more for a headshot or a critical hit), but the hand does not stop. */
  thump(big: boolean): void {
    this.hitK = Math.max(this.hitK, big ? 0.5 : 0.25);
    this.shake = Math.max(this.shake, big ? 0.14 : 0.06);
  }

  /** The kick of loosing an arrow: the view jumps back a little, more for a full draw (0..1). */
  recoil(power: number): void {
    this.shake = Math.max(this.shake, 0.03 + 0.07 * power * power);
  }

  /** The weight of a blow wears off (in real time, even while the game stands still). */
  fade(dt: number): void {
    this.hitStop = Math.max(0, this.hitStop - dt);
    this.hitK = Math.max(0, this.hitK - dt * 5);
  }

  /** The shake, the dip of a landing and the kick of a blow, laid on the camera. */
  jolt(camera: THREE.PerspectiveCamera, f: FeelFrame): void {
    const { dt, body } = f;
    if (this.shake > 0.004) {
      const t = performance.now() / 1000;
      const amp = this.shake * this.shake * 0.05;
      camera.rotation.x += (Math.sin(t * 61) + Math.sin(t * 37 + 1.3)) * 0.5 * amp;
      camera.rotation.y += (Math.sin(t * 53 + 2) + Math.sin(t * 29)) * 0.5 * amp;
      camera.rotation.z += Math.sin(t * 43 + 0.7) * amp * 0.5;
      camera.position.y += Math.sin(t * 71) * amp * 0.6;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    } else this.shake = 0;
    // Landing from a height: the eye drops and eases back.
    if (f.ready) {
      if (body.onGround && !this.wasGrounded && this.prevVy < -7) this.landK = Math.max(this.landK, Math.min(1, (-this.prevVy - 7) / 14));
      this.wasGrounded = body.onGround;
      this.prevVy = body.vy;
    }
    this.landK = Math.max(0, this.landK - dt * 2.6);
    if (this.landK > 0) {
      const dip = Math.sin(Math.min(1, this.landK) * Math.PI * 0.5) * this.landK;
      camera.position.y -= dip * (f.firstPerson ? 0.3 : 0.12);
      camera.rotation.x -= dip * 0.04;
    }
    // A blow you land kicks the view up a hair.
    if (this.hitK > 0) camera.rotation.x += this.hitK * 0.016;
  }

  /**
   * What a dash and a Ground Slam do to the view, and the angle of the lens. Returns the wind of it for the sides of the
   * screen (see WindBlur): how strong (0..1) and how far to one side the player looks from where the dash goes (-1..1).
   */
  carry(camera: THREE.PerspectiveCamera, f: FeelFrame): { wind: number; lateral: number } {
    const { dt, body } = f;
    const rushing = !!f.rush;
    const rolling = !!f.rush?.roll;
    // The warrior's Charge widens the view and streaks light past; the ranger's roll has its own look (the wind at the sides).
    const charging = rushing && !rolling;
    this.rushK += ((charging ? 1 : 0) - this.rushK) * Math.min(1, dt * 8);
    // A charge shakes the view; a roll does not, it dips and leans into the direction instead.
    if (charging) this.shake = Math.max(this.shake, 0.16);
    this.rollK += ((rolling ? 1 : 0) - this.rollK) * Math.min(1, dt * (rolling ? 14 : 7));
    let lateral = 0;
    if (f.rush) lateral = Math.sin(f.yaw - f.rush.yaw);
    if (this.rollK > 0.01) {
      camera.rotation.z -= lateral * 0.16 * this.rollK;
      camera.rotation.x -= 0.1 * this.rollK;
      camera.position.y -= 0.22 * this.rollK;
    }
    // A Ground Slam: the eye sinks into the crouch, the view is thrown up and stretched by the jump, widens and rushes in the dive, and takes the
    // blow (the landing itself dips the view and shakes it, see landK and `impact`).
    const slamCam = this.slamCam;
    const slamNow = f.slam;
    if (slamNow !== this.slamWas) {
      if (slamNow === 2 && this.slamWas === 1) this.shake = Math.max(this.shake, 0.1);
      this.slamWas = slamNow;
      this.slamT = 0;
    }
    this.slamT += dt;
    const slamGo = (v: number, on: boolean, rin: number, rout: number): number => v + ((on ? 1 : 0) - v) * Math.min(1, dt * (on ? rin : rout));
    slamCam.wind = slamGo(slamCam.wind, slamNow === 1, 12, 9);
    slamCam.up = slamGo(slamCam.up, slamNow === 2 && body.vy > 0.5, 14, 6);
    slamCam.fall = slamGo(slamCam.fall, slamNow === 2 && body.vy <= 0.5, 6, 7);
    slamCam.hit = slamGo(slamCam.hit, slamNow === 3 && this.slamT < 0.16, 24, 9);
    const slamBump = slamNow === 3 ? Math.max(0, 1 - this.slamT / 0.16) : 0;
    const slamDepth = slamCam.wind * (0.4 + 0.6 * Math.min(1, this.slamT / 0.2));
    if (f.firstPerson) {
      camera.position.y -= 0.3 * slamDepth + 0.1 * slamCam.hit * (0.5 + 0.5 * slamBump);
      camera.rotation.x += -0.07 * slamDepth - 0.05 * slamCam.fall + 0.03 * slamCam.up - 0.05 * slamBump * slamCam.hit;
    }
    const slamFov = 6 * slamCam.up + 10 * slamCam.fall - 3 * slamCam.wind - 5 * slamCam.hit * slamBump;
    const wind = Math.max(rushing ? (rolling ? 1 : 0.85) : 0, 0.6 * slamCam.fall + 0.25 * slamCam.up);
    this.runK += ((!f.firstPerson ? Math.max(0, Math.min(1, (Math.hypot(body.vx, body.vz) - 3.5) / 4)) : 0) - this.runK) * Math.min(1, dt * 3);
    const fov = this.baseFov - 9 * f.bowDraw * f.bowDraw + 16 * this.rushK + 4 * this.rollK + 5 * this.runK + slamFov - 3.5 * this.hitK * this.hitK - (!f.firstPerson ? THIRD_PERSON_FOV_TRIM : 0);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    return { wind, lateral };
  }
}
