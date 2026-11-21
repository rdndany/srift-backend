import * as THREE from 'three';
import { MOUNT_CAST, MOUNT_HOWL, type Fx, type FxKind, type MountId } from '@solrift/shared';
import type { AbilitySound } from './abilitySounds';
import { buildFang, buildThunderHit, buildThunderWarn } from './fenrirFx';
import { softBall, type FireParticles } from './fireFx';
import { buildSummonArrive, buildSummonCast, buildSummonFizzle } from './mountSummonFx';
import { buildPiercingShot } from './piercingFx';
import { buildEvasiveRoll } from './rollFx';
import { buildBearTrapSet, buildBearTrapSnap } from './trapFx';
import { buildRainHit, buildRainMark } from './rainFx';
import type { ShaderKeeper } from './shaderKeep';
import { buildShieldBash } from './bashFx';
import { buildCharge } from './chargeFx';
import { buildFireballHit } from './fireballFx';
import { buildStaffHit } from './staffFx';
import { buildWandHit } from './wandFx';
import { buildIronDefense } from './guardFx';
import { buildGroundSlam, buildLeap } from './slamFx';
import { buildMeteorHit, buildMeteorWarn } from './meteorFx';
import { buildFrostNova } from './frostFx';
import { SpellKit, type FxEntry } from './spellFx';
import { buildArcaneShield, buildShieldShatter } from './arcaneShieldFx';
import { buildArrowStick } from './arrowFx';

/**
 * Draws what class abilities leave in the world (rings, bursts, a meteor on its way down, a line of light for a
 * piercing shot). The server decides what happened and sends each mark with an id; this only plays them, once each,
 * from the age they arrive with. Nothing here affects the game.
 */

const COLORS: Record<FxKind, number> = {
  slam: 0xe8d8b8,
  leap: 0xe8d8b8,
  bash: 0xffd27a,
  charge: 0xe8e0d0,
  frost_nova: 0x8fd8ff,
  fireball_burst: 0xff7a1a,
  meteor_warn: 0xff5522,
  meteor_hit: 0xff8a2a,
  rain_mark: 0x7fd35a,
  rain_hit: 0xcfe8a0,
  pierce: 0xd8f8c0,
  roll: 0xcfe8a0,
  trap_set: 0xb8b8b8,
  trap_snap: 0xff6060,
  arrow_stick: 0xb08a55,
  guard_iron: 0xc8d0e0,
  guard_arcane: 0x9a7bff,
  bolt: 0x9ab8ff,
  wand_hit: 0x9aaeff,
  staff_hit: 0xc9a0ff,
  fang: 0xb8a8ff,
  thunder_warn: 0xb8a8ff,
  thunder_hit: 0xb8a8ff,
  boss_warn: 0xff3a14,
  boss_blast: 0xff8a2a,
  level_up: 0xffc040,
};

type Entry = FxEntry;

/** Where the effects are built to have their shaders compiled (see `warm`): far below anything the view reaches. */
const WARM_DEPTH = -4000;

/** An effect the game starts itself; `cast` is a mount's call still going on, at (x, z). */
interface Local {
  e: Entry;
  cast: boolean;
  x: number;
  z: number;
  /** Which mount a call is for. */
  id: MountId;
}

export class AbilityFx {
  readonly group = new THREE.Group();
  private readonly entries = new Map<number, Entry>();
  private readonly ring = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
  private readonly disc = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
  private readonly ball = new THREE.SphereGeometry(1, 16, 12);
  private readonly bar = new THREE.BoxGeometry(1, 1, 1);
  private readonly spike = new THREE.ConeGeometry(0.09, 0.4, 5);
  private readonly done = new Set<number>();

  /** `fire` makes the Fireball's burst a proper explosion; without it the burst is a plain flash. */
  private readonly kit: SpellKit | null;
  constructor(private readonly fire: FireParticles | null = null) {
    this.kit = fire ? new SpellKit(fire) : null;
    if (this.kit) this.kit.impact = (x, y, z, s) => this.onImpact?.(x, y, z, s);
  }

  /** The cubes' shapes and the camera, for what is drawn outside these marks (the wand's bolt in flight, see MobRenderer). Null without the fire. */
  get voxelKit(): SpellKit | null {
    return this.kit;
  }

  /** Tell the effects where the camera is, so the ones round the player can keep out of their view. */
  setViewer(position: THREE.Vector3): void {
    if (this.kit) this.kit.viewer = position;
  }

  /** Tell the effects how to find where a player (by name) is drawn, for the ones that stay on someone. */
  setLocator(find: (who: string) => { x: number; y: number; z: number } | null): void {
    if (this.kit) this.kit.locate = find;
  }

  /** Something hit the ground hard here (a slam, a meteor, a blast): strength 0..1. The game uses it to shake the screen. */
  onImpact: ((x: number, y: number, z: number, strength: number) => void) | null = null;

  private material(color: number, opacity = 1): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  }

  private build(f: Fx): Entry | null {
    const color = COLORS[f.k] ?? 0xffffff;
    const g = new THREE.Group();
    g.position.set(f.x, f.y, f.z);
    const mats: THREE.MeshBasicMaterial[] = [];
    const mat = (o = 1): THREE.MeshBasicMaterial => {
      const m = this.material(color, o);
      mats.push(m);
      return m;
    };
    const entry: Entry = { group: g, age: f.age, ttl: Math.max(0.1, f.ttl), materials: mats, extra: [], animate: () => undefined };
    const r = Math.max(0.6, f.r);

    if (f.k === 'fireball_burst' && this.kit) return buildFireballHit(f, entry, this.kit);
    if ((f.k === 'fireball_burst' || f.k === 'bolt') && this.fire) return this.spellBurst(f, entry, g, r, this.fire, f.k === 'bolt');
    if (this.kit) {
      if (f.k === 'frost_nova') return buildFrostNova(f, entry, this.kit);
      if (f.k === 'slam') return buildGroundSlam(f, entry, this.kit);
      if (f.k === 'leap') return buildLeap(f, entry, this.kit);
      if (f.k === 'bash') return buildShieldBash(f, entry, this.kit);
      if (f.k === 'charge') return buildCharge(f, entry, this.kit);
      if (f.k === 'guard_iron') return buildIronDefense(f, entry, this.kit);
      if (f.k === 'meteor_warn') return buildMeteorWarn(f, entry, this.kit);
      if (f.k === 'meteor_hit') return buildMeteorHit(f, entry, this.kit);
      if (f.k === 'guard_arcane') {
        const shield = buildArcaneShield(f, entry, this.kit);
        // soaked up before its time: it breaks, where it stood, in cubes of its own (the mark is gone by then)
        shield.onEnd = (early) => {
          if (early) this.shatterShield(shield.group.position.x, shield.group.position.y, shield.group.position.z);
        };
        return shield;
      }
      if (f.k === 'wand_hit') return buildWandHit(f, entry, this.kit);
      if (f.k === 'staff_hit') return buildStaffHit(f, entry, this.kit);
      if (f.k === 'pierce') return buildPiercingShot(f, entry, this.kit);
      if (f.k === 'roll') return buildEvasiveRoll(f, entry, this.kit);
      if (f.k === 'trap_set') return buildBearTrapSet(f, entry, this.kit);
      if (f.k === 'trap_snap') return buildBearTrapSnap(f, entry, this.kit);
      if (f.k === 'arrow_stick') return buildArrowStick(f, entry, this.kit);
      if (f.k === 'rain_mark') return buildRainMark(f, entry, this.kit);
      if (f.k === 'rain_hit') return buildRainHit(f, entry, this.kit);
      if (f.k === 'fang') return buildFang(f, entry, this.kit);
      if (f.k === 'thunder_warn') return buildThunderWarn(f, entry, this.kit);
      if (f.k === 'thunder_hit') return buildThunderHit(f, entry, this.kit);
    }

    switch (f.k) {
      case 'slam':
      case 'frost_nova':
      case 'bash':
      case 'rain_hit': {
        const ring = new THREE.Mesh(this.ring, mat());
        const inner = new THREE.Mesh(this.ring, mat(0.6));
        ring.position.y = inner.position.y = 0.15;
        g.add(ring, inner);
        entry.animate = (t) => {
          const k = Math.min(1, t);
          ring.scale.setScalar(Math.max(0.1, r * (0.3 + 0.7 * k)));
          inner.scale.setScalar(Math.max(0.1, r * (0.1 + 0.6 * k)));
          mats[0].opacity = 1 - k;
          mats[1].opacity = 0.6 * (1 - k);
        };
        return entry;
      }
      case 'fireball_burst':
      case 'meteor_hit':
      case 'bolt': {
        const ball = new THREE.Mesh(this.ball, mat(0.85));
        const ring = new THREE.Mesh(this.ring, mat(0.8));
        ring.position.y = 0.1;
        g.add(ball, ring);
        entry.animate = (t) => {
          const k = Math.min(1, t);
          ball.scale.setScalar(Math.max(0.05, r * 0.7 * (0.4 + 0.6 * Math.sqrt(k))));
          ring.scale.setScalar(Math.max(0.05, r * (0.4 + 0.8 * k)));
          mats[0].opacity = 0.85 * (1 - k);
          mats[1].opacity = 0.8 * (1 - k);
        };
        return entry;
      }
      case 'boss_warn': {
        // The classic telegraph: the edge of the danger, and a fill that rises to meet it when the spell lands.
        const edge = new THREE.Mesh(this.ring, mat(0.95));
        const fill = new THREE.Mesh(this.disc, mat(0.28));
        const base = new THREE.Mesh(this.disc, mat(0.1));
        edge.position.y = fill.position.y = base.position.y = 0.13;
        g.add(edge, base, fill);
        const embers: THREE.Mesh[] = [];
        for (let i = 0; i < 9; i++) {
          const s = new THREE.Mesh(this.bar, mat(0.8));
          s.scale.set(0.07, 0.5, 0.07);
          embers.push(s);
          g.add(s);
        }
        entry.animate = (t, age) => {
          const k = Math.min(1, t);
          edge.scale.setScalar(r * (1 + 0.02 * Math.sin(age * 14)));
          base.scale.setScalar(r);
          fill.scale.setScalar(Math.max(0.05, r * k));
          mats[1].opacity = 0.2 + 0.25 * k;
          embers.forEach((s, i) => {
            const a = i * 2.4;
            const ph = (age * 1.4 + i * 0.31) % 1;
            const rr = r * (0.2 + 0.7 * ((i * 0.37) % 1)) * (0.4 + 0.6 * k);
            s.position.set(Math.cos(a) * rr, 0.3 + ph * 3.2, Math.sin(a) * rr);
          });
        };
        return entry;
      }
      case 'boss_blast': {
        const column = new THREE.Mesh(this.bar, mat(0.7));
        const ring = new THREE.Mesh(this.ring, mat(0.95));
        const flash = new THREE.Mesh(this.disc, mat(0.5));
        ring.position.y = flash.position.y = 0.15;
        g.add(column, ring, flash);
        entry.animate = (t) => {
          const k = Math.min(1, t);
          const out = 1 - Math.pow(1 - k, 3);
          column.scale.set(Math.max(0.05, r * 0.9 * (1 - k)), 9 * (1 - k * 0.6), Math.max(0.05, r * 0.9 * (1 - k)));
          column.position.y = 4.2;
          ring.scale.setScalar(Math.max(0.05, r * (0.7 + 0.5 * out)));
          flash.scale.setScalar(Math.max(0.05, r));
          mats[0].opacity = 0.7 * (1 - k);
          mats[1].opacity = 0.95 * (1 - k);
          mats[2].opacity = 0.5 * (1 - k) * (1 - k);
        };
        return entry;
      }
      case 'meteor_warn': {
        // A ring on the ground that closes in, and the meteor itself falling onto it (it lands 0.4s before the mark goes).
        const ring = new THREE.Mesh(this.ring, mat(0.9));
        const fill = new THREE.Mesh(this.disc, mat(0.18));
        ring.position.y = fill.position.y = 0.12;
        const rock = new THREE.Mesh(this.ball, mat(1));
        const trail = new THREE.Mesh(this.bar, mat(0.5));
        g.add(ring, fill, rock, trail);
        const fall = Math.max(0.2, entry.ttl - 0.4);
        entry.animate = (_t, age) => {
          const k = Math.min(1, age / fall);
          const h = 26 * (1 - k * k);
          rock.position.set(0, h + 0.5, 0);
          rock.scale.setScalar(0.9 + r * 0.12);
          rock.visible = k < 1;
          trail.visible = k < 1;
          trail.position.set(0, h + 3.5, 0);
          trail.scale.set(0.5, 6, 0.5);
          ring.scale.setScalar(r * (1.05 - 0.05 * Math.sin(age * 12)));
          fill.scale.setScalar(r);
        };
        return entry;
      }
      case 'rain_mark': {
        const ring = new THREE.Mesh(this.ring, mat(0.7));
        const fill = new THREE.Mesh(this.disc, mat(0.12));
        ring.position.y = fill.position.y = 0.12;
        g.add(ring, fill);
        // A few arrows streak down inside the ring.
        const shafts: THREE.Mesh[] = [];
        for (let i = 0; i < 7; i++) {
          const s = new THREE.Mesh(this.bar, mat(0.8));
          s.scale.set(0.05, 1.1, 0.05);
          shafts.push(s);
          g.add(s);
        }
        entry.animate = (_t, age) => {
          ring.scale.setScalar(r);
          fill.scale.setScalar(r);
          shafts.forEach((s, i) => {
            const a = i * 2.4;
            const phase = (age * 2.3 + i * 0.37) % 1;
            s.position.set(Math.cos(a) * r * 0.75 * ((i % 3) / 3 + 0.2), 12 * (1 - phase) + 0.5, Math.sin(a) * r * 0.75 * ((i % 3) / 3 + 0.2));
          });
        };
        return entry;
      }
      case 'pierce':
      case 'charge':
      case 'roll': {
        if (f.x2 === undefined || f.y2 === undefined || f.z2 === undefined) return null;
        const from = new THREE.Vector3(f.x, f.y, f.z);
        const to = new THREE.Vector3(f.x2, f.y2, f.z2);
        const len = from.distanceTo(to);
        if (len < 0.05) return null;
        g.position.copy(from).lerp(to, 0.5);
        g.lookAt(to);
        const beam = new THREE.Mesh(this.bar, mat(0.9));
        g.add(beam);
        const thick = f.k === 'pierce' ? 0.07 : 0.5;
        entry.animate = (t) => {
          const k = Math.min(1, t);
          beam.scale.set(thick * (1 - 0.7 * k), thick * (1 - 0.7 * k) * (f.k === 'pierce' ? 1 : 1.6), len);
          mats[0].opacity = 0.9 * (1 - k);
        };
        return entry;
      }
      case 'trap_set': {
        const ring = new THREE.Mesh(this.ring, mat(0.7));
        ring.position.y = 0.06;
        g.add(ring);
        for (let i = 0; i < 8; i++) {
          const s = new THREE.Mesh(this.spike, mat(0.9));
          const a = (i / 8) * Math.PI * 2;
          s.position.set(Math.cos(a) * r * 0.8, 0.2, Math.sin(a) * r * 0.8);
          s.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
          g.add(s);
        }
        entry.animate = () => ring.scale.setScalar(r);
        return entry;
      }
      case 'trap_snap': {
        const ring = new THREE.Mesh(this.ring, mat(0.9));
        ring.position.y = 0.15;
        g.add(ring);
        entry.animate = (t) => {
          ring.scale.setScalar(r * (0.5 + 0.8 * Math.min(1, t)));
          mats[0].opacity = 0.9 * (1 - Math.min(1, t));
        };
        return entry;
      }
      case 'guard_iron':
      case 'guard_arcane': {
        const shell = new THREE.Mesh(this.ball, mat(0.35));
        shell.position.y = 0.9;
        const ring = new THREE.Mesh(this.ring, mat(0.8));
        ring.position.y = 0.1;
        g.add(shell, ring);
        entry.animate = (t, age) => {
          const k = Math.min(1, t);
          shell.scale.set(0.95 + 0.1 * Math.sin(age * 16), 1.15, 0.95 + 0.1 * Math.sin(age * 16));
          ring.scale.setScalar(0.6 + k * 1.2);
          mats[0].opacity = 0.35 * (1 - k);
          mats[1].opacity = 0.8 * (1 - k);
        };
        return entry;
      }
    }
    return null;
  }

  /**
   * A fireball bursting. The particles (flash, flames, sparks, smoke) are thrown once, as the mark first shows up and
   * only if it is fresh (a mark that arrives late is not replayed); the meshes here are the fireball swelling and
   * fading, a white-hot core, a halo and a shock ring along the ground.
   */
  private spellBurst(f: Fx, entry: Entry, g: THREE.Group, r: number, fire: FireParticles, arcane: boolean): Entry {
    if (f.age < 0.25) {
      arcane ? fire.arcBurst(f.x, f.y, f.z, r) : fire.explosion(f.x, f.y, f.z, r);
      this.onImpact?.(f.x, f.y, f.z, arcane ? 0.1 : 0.3);
    }
    const mats: THREE.MeshBasicMaterial[] = entry.materials;
    const mat = (color: number, o: number): THREE.MeshBasicMaterial => {
      const m = this.material(color, o);
      mats.push(m);
      return m;
    };
    const ballMat = arcane ? softBall(0x6f7dff, 1, 1.2, 0.14) : softBall(0xff6a10, 1, 1.2, 0.2);
    const coreMat = arcane ? softBall(0xf2f5ff, 1.6, 0.9, 0.08) : softBall(0xffe9a8, 1.6, 0.9, 0.1);
    entry.extra.push(ballMat, coreMat);
    const ball = new THREE.Mesh(fire.sphere, ballMat);
    const core = new THREE.Mesh(fire.sphere, coreMat);
    const ring = new THREE.Mesh(this.ring, mat(arcane ? 0xaab6ff : 0xffa040, 0.9));
    const wave = new THREE.Mesh(this.ring, mat(arcane ? 0x5a48ff : 0xff5a10, 0.6));
    ring.position.y = wave.position.y = 0.12;
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: fire.glow, color: arcane ? 0x6a5cff : 0xff7a20, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }),
    );
    halo.position.y = 0.3;
    halo.renderOrder = 6;
    entry.extra.push(halo.material);
    // An arcane burst also throws a tilted rune ring that spins as it widens.
    const rune = arcane ? new THREE.Mesh(this.ring, mat(0xdde4ff, 0.85)) : null;
    if (rune) {
      rune.position.y = 0.55;
      rune.rotation.x = 0.4;
      g.add(rune);
    }
    g.add(ball, core, ring, wave, halo);
    entry.animate = (t) => {
      const k = Math.min(1, t);
      const out = 1 - Math.pow(1 - k, 3); // fast at first, then it settles
      ball.position.y = 0.25 + 0.35 * out;
      ball.scale.setScalar(Math.max(0.05, r * 0.85 * (0.25 + 0.75 * out)));
      ball.rotation.y = k * 3;
      ballMat.uniforms.uOpacity.value = 1.1 * Math.pow(1 - k, 1.3);
      core.position.y = 0.2 + 0.25 * out;
      core.scale.setScalar(Math.max(0.05, r * 0.5 * (0.2 + 0.8 * Math.sqrt(k))));
      coreMat.uniforms.uOpacity.value = Math.max(0, 1.7 * (1 - k * 2));
      ring.scale.setScalar(Math.max(0.05, r * (0.2 + 1.5 * out)));
      mats[0].opacity = 0.9 * (1 - k);
      wave.scale.setScalar(Math.max(0.05, r * (0.1 + 1.0 * out)));
      mats[1].opacity = 0.6 * (1 - k) * (1 - k);
      if (rune) {
        rune.scale.setScalar(Math.max(0.05, r * (0.25 + 1.2 * out)));
        rune.rotation.y = k * 7;
        mats[2].opacity = 0.85 * (1 - k);
      }
      halo.scale.setScalar(r * (2.2 + 3.2 * out));
      halo.material.opacity = 0.85 * Math.pow(1 - k, 1.6);
    };
    return entry;
  }

  /**
   * Something that makes a sound at a place: the game plays it, louder the closer it is. `seconds` is how long a long
   * sound (a falling meteor) should run.
   */
  onSound: ((sound: AbilitySound, x: number, y: number, z: number, seconds: number) => void) | null = null;

  /** The sound an ability's mark makes the moment it shows up (only a fresh one: a mark that arrives late is not replayed). */
  private sound(f: Fx, e: Entry): void {
    if (!this.onSound || f.age >= 0.3) return;
    const play = (s: AbilitySound, seconds = 1): void => this.onSound?.(s, f.x, f.y, f.z, seconds);
    switch (f.k) {
      case 'fireball_burst':
        return play('fireball_burst');
      case 'frost_nova':
        return play('frost_nova');
      case 'meteor_warn':
        return play('meteor_fall', f.ttl - 0.4 - f.age); // it lands 0.4 s before the mark goes
      case 'meteor_hit':
        return play('meteor_hit');
      case 'bolt': // where a spellbook bolt bursts
      case 'wand_hit': // and a wand's
        return play('arcane_hit');
      case 'staff_hit': // a staff's is deeper
        return play('staff_hit');
      case 'arrow_stick':
        return play('arrow_thunk');
      case 'fang':
        return play('mount_bite');
      case 'thunder_warn':
        return play('mount_gather', MOUNT_HOWL.delay);
      case 'thunder_hit':
        return play('mount_strike');
      case 'boss_warn':
        return play('mount_gather', f.ttl - f.age);
      case 'boss_blast':
        this.onImpact?.(f.x, f.y, f.z, Math.min(1, 0.25 + f.r * 0.08));
        return play('meteor_hit');
      case 'leap':
        return play('slam_leap');
      case 'slam':
        return play('ground_slam');
      case 'bash':
        return play('shield_bash');
      case 'charge':
        return play('charge', f.ttl - 0.5 - f.age); // the mark outlives the run by half a second
      case 'guard_iron': {
        play('iron_defense');
        // the plates fly off when the guard is over (the mark outlives the guard by half a second)
        const ended = e.onEnd;
        e.onEnd = (early) => {
          ended?.(early);
          this.onSound?.('iron_end', e.group.position.x, e.group.position.y, e.group.position.z, 1);
        };
        return;
      }
      case 'guard_arcane': {
        play('arcane_shield');
        // soaked up before its time: it breaks
        const ended = e.onEnd;
        e.onEnd = (early) => {
          ended?.(early);
          if (early) this.onSound?.('arcane_break', e.group.position.x, e.group.position.y, e.group.position.z, 1); // where the shield is now
        };
        return;
      }
    }
  }

  /** Bring the world's marks up to date: start the new ones, step the live ones, drop what ended. */
  sync(list: readonly Fx[], dt: number): void {
    const live = new Map<number, Fx>();
    for (const f of list) {
      live.set(f.id, f);
      if (this.entries.has(f.id) || this.done.has(f.id)) continue;
      const e = this.build(f);
      if (!e) {
        this.done.add(f.id);
        continue;
      }
      this.entries.set(f.id, e);
      this.group.add(e.group);
      e.animate(Math.min(1, e.age / e.ttl), e.age, 0);
      this.sound(f, e);
    }
    for (const [id, e] of this.entries) {
      e.age += dt;
      const mark = live.get(id);
      if (!mark || e.age >= e.ttl) {
        this.dispose(id, e, false);
        continue;
      }
      e.update?.(mark);
      e.animate(e.age / e.ttl, e.age, dt);
    }
    // Ids that were skipped are forgotten once the server stops listing them.
    for (const id of this.done) if (!live.has(id)) this.done.delete(id);
    this.stepLocals(dt);
    this.stepWarming();
  }

  /** Keeps the shaders of the effects from being built again at every use (see ShaderKeeper); without one the materials are simply freed. */
  keeper: ShaderKeeper | null = null;

  /** An effect is over: free its materials. */
  private free(e: Entry): void {
    e.dispose?.();
    for (const m of [...e.materials, ...e.extra]) {
      if (this.keeper) this.keeper.retire(m);
      else m.dispose();
    }
  }

  /** Every effect built once, far below the world, and the frames they still have to be drawn for (see `warm`). */
  private warming: { group: THREE.Group; entries: Entry[]; frames: number } | null = null;
  private warmed = false;

  /**
   * Build every effect once, out of sight, and leave them to be drawn for a few frames. The graphics card compiles a shader the
   * first time something is drawn with it, and the game stands still while it does: this way that happens while the game
   * loads and not at the first use of an ability in a fight. Nothing is heard and nothing shakes.
   */
  warm(): void {
    const kit = this.kit;
    if (!kit || this.warmed) return;
    this.warmed = true;
    const y = WARM_DEPTH;
    const impact = kit.impact;
    const heard = this.onImpact;
    kit.impact = () => undefined;
    this.onImpact = null;
    const entries: Entry[] = [];
    try {
      let id = -1;
      for (const k of Object.keys(COLORS) as FxKind[]) {
        // (Not a fresh mark: the bursts of particles and the sounds are for those.)
        const e = this.build({ id: id--, k, x: 0, y, z: 0, x2: 4, y2: y, z2: 4, r: 3, age: 1, ttl: 3, by: '' });
        if (e) entries.push(e);
      }
      for (const arrive of [false, true]) {
        const e: Entry = { group: new THREE.Group(), age: 0, ttl: 2, materials: [], extra: [], animate: () => undefined };
        e.group.position.set(0, y, 0);
        if (arrive) buildSummonArrive('fenrir', e, kit, () => undefined, 0, y, 0);
        else buildSummonCast('fenrir', e, kit, () => undefined, 0, y, 0);
        entries.push(e);
      }
    } finally {
      kit.impact = impact;
      this.onImpact = heard;
    }
    const group = new THREE.Group();
    for (const e of entries) {
      e.animate(e.age / e.ttl, e.age, 0);
      // Every part, also the ones that only show later in the effect; and drawn although it is nowhere near the view
      // (beyond the far end of the view nothing of it reaches the picture).
      e.group.traverse((o) => {
        o.visible = true;
        o.frustumCulled = false;
      });
      group.add(e.group);
    }
    this.group.add(group);
    this.warming = { group, entries, frames: 3 };
  }

  /** A frame was drawn with them (`now`: do not wait for more): after a few, they are taken away again. */
  private stepWarming(now = false): void {
    const w = this.warming;
    if (!w || (!now && w.frames-- > 0)) return;
    this.warming = null;
    this.group.remove(w.group);
    for (const e of w.entries) this.free(e);
  }

  private dispose(id: number, e: Entry, quiet: boolean): void {
    // A mark the server ended early (a shield that was soaked up) can show its end; a cleared scene stays quiet.
    if (!quiet) e.onEnd?.(e.age < e.ttl - 0.3);
    this.group.remove(e.group);
    this.free(e);
    this.entries.delete(id);
    // An effect that ran its course must not start again while the server still lists it.
    this.done.add(id);
  }

  clear(): void {
    for (const [id, e] of [...this.entries]) this.dispose(id, e, true);
    this.done.clear();
    for (const l of [...this.locals]) this.endLocal(l, true);
  }

  // ---- calling a mount: effects that the game starts itself (from a session event), not marks from the server ----

  /** Effects started here, not by the server; they run on their own clock. */
  private readonly locals: Local[] = [];

  private startLocal(cast: boolean, ttl: number, x: number, y: number, z: number, build: (e: Entry, kit: SpellKit) => void, id: MountId = 'fenrir'): void {
    const kit = this.kit;
    if (!kit) return;
    // A call still going at this very spot (two events for one call) gives way to the new one.
    if (cast) {
      const old = this.castNear(x, z, 1.5);
      if (old) this.endLocal(old, true);
    }
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const e: Entry = { group: g, age: 0, ttl, materials: [], extra: [], animate: () => undefined };
    build(e, kit);
    this.locals.push({ e, cast, x, z, id });
    this.group.add(g);
    e.animate(0, 0, 0);
  }

  private endLocal(l: Local, quiet: boolean): void {
    const i = this.locals.indexOf(l);
    if (i < 0) return;
    this.locals.splice(i, 1);
    if (!quiet) l.e.onEnd?.(l.e.age < l.e.ttl - 0.3);
    this.group.remove(l.e.group);
    this.free(l.e);
  }

  private readonly say = (s: AbilitySound, x: number, y: number, z: number, seconds: number): void => this.onSound?.(s, x, y, z, seconds);

  /** The call begins: the prints of a paw are stamped round the caster, in cubes, until the beast is there. */
  startSummon(id: MountId, x: number, y: number, z: number): void {
    this.startLocal(true, MOUNT_CAST + 0.6, x, y, z, (e, kit) => {
      buildSummonCast(id, e, kit, this.say, x, y, z);
    }, id);
  }

  /** The call was lost (the caster moved or was hurt): the light gutters out. */
  stopSummon(x: number, z: number): void {
    const l = this.castNear(x, z, 8);
    if (!l) return;
    const at = l.e.group.position;
    const id = l.id;
    this.endLocal(l, false);
    this.startLocal(false, 1, at.x, at.y, at.z, (e, kit) => {
      buildSummonFizzle(id, e, kit);
    });
  }

  /** The call that is going on closest to a place (within `within` blocks): several players can be calling at once. */
  private castNear(x: number, z: number, within: number): Local | null {
    let best: Local | null = null;
    let d = within;
    for (const l of this.locals) {
      const m = l.cast ? Math.hypot(l.x - x, l.z - z) : Infinity;
      if (m <= d) {
        d = m;
        best = l;
      }
    }
    return best;
  }

  /** The call is answered: a bolt of cubes strikes the middle of the ring and the beast stands in it. */
  arriveSummon(id: MountId, x: number, y: number, z: number): void {
    const call = this.castNear(x, z, 8);
    if (call) this.endLocal(call, true);
    this.startLocal(false, 1.7, x, y, z, (e, kit) => {
      buildSummonArrive(id, e, kit, this.say, x, y, z);
    });
  }

  /** The Arcane Shield broke: its cubes fly apart. */
  private shatterShield(x: number, y: number, z: number): void {
    this.startLocal(false, 0.9, x, y, z, (e, kit) => buildShieldShatter(e, kit));
  }

  private stepLocals(dt: number): void {
    for (const l of [...this.locals]) {
      l.e.age += dt;
      if (l.e.age >= l.e.ttl) this.endLocal(l, false);
      else l.e.animate(l.e.age / l.e.ttl, l.e.age, dt);
    }
  }

  destroy(): void {
    this.clear();
    this.stepWarming(true);
    this.ring.dispose();
    this.disc.dispose();
    this.ball.dispose();
    this.bar.dispose();
    this.spike.dispose();
    this.kit?.dispose();
  }
}
