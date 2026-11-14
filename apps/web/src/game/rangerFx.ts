import * as THREE from 'three';
import { ABILITY_BY_ID, type Fx } from '@solrift/shared';
import { clamp01, easeOut, glowMat, glowSprite, rnd, softMesh, setOp, type FxEntry, type SpellKit } from './spellFx';

/**
 * How the Ranger's abilities look: the Piercing Shot (a bright tracer racing down the line with an arrow at its head,
 * rings of wind where it passed, a spray where it struck), the Evasive Roll (the ranger's afterimages tumbling along the
 * way they went, leaves and dust in the wake), the Bear Trap (steel jaws on the ground that slam shut) and the Rain of
 * Arrows (a green circle on the ground, and real arrows falling out of the sky into it, volley after volley, and
 * staying stuck in the ground). The server decides what happened and sends each mark; this only draws them.
 * Nothing here affects the game.
 */

/** An ordinary (not glowing) material for a solid part, freed with the entry. */
function solidMat(e: FxEntry, color: number, opacity = 1): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide });
  e.materials.push(m);
  return m;
}

// ---- Piercing Shot ---------------------------------------------------------------------------------------------------

export function buildPiercingShot(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  if (f.x2 === undefined || f.y2 === undefined || f.z2 === undefined) return e;
  const from = new THREE.Vector3(f.x, f.y, f.z);
  const to = new THREE.Vector3(f.x2, f.y2, f.z2);
  const len = from.distanceTo(to);
  if (len < 0.05) return e;
  g.position.copy(from);
  g.lookAt(to);
  const TRAVEL = 0.09;

  // The tracer: a soft green sleeve, a brighter one inside it and a white-hot core, thin where it started and fat at its head.
  const outerMat = glowMat(e, 0x4fd04a, 0.35);
  const midMat = glowMat(e, 0xb8ff8a, 0.7);
  const coreMat = glowMat(e, 0xffffff, 0.95);
  const outer = new THREE.Mesh(kit.beam, outerMat);
  const mid = new THREE.Mesh(kit.beam, midMat);
  const core = new THREE.Mesh(kit.beam, coreMat);
  for (const m of [outer, mid, core]) {
    m.frustumCulled = false;
    g.add(m);
  }
  // The arrow itself, at the head of it.
  const arrowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide });
  e.materials.push(arrowMat);
  const arrow = new THREE.Mesh(kit.arrowZ, arrowMat);
  arrow.scale.setScalar(1.5);
  g.add(arrow);
  const headGlow = glowSprite(e, kit, 0xe6ffc8, 1);
  const tailGlow = glowSprite(e, kit, 0x9aff70, 1);
  const endGlow = glowSprite(e, kit, 0xd8ffb8, 0);
  endGlow.position.z = len;
  g.add(headGlow, tailGlow, endGlow);
  // Rings of wind, one at each seventh of the way, opening up as the arrow passes.
  const rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; at: number }[] = [];
  for (let i = 1; i <= 7; i++) {
    const mat = glowMat(e, 0xd8ffb8, 0);
    const mesh = new THREE.Mesh(kit.pressure, mat);
    mesh.position.z = (len * i) / 8;
    mesh.visible = false;
    g.add(mesh);
    rings.push({ mesh, mat, at: (i / 8) * TRAVEL });
  }

  if (f.age < 0.25) kit.fire.pierceShot(from.x, from.y, from.z, to.x, to.y, to.z, len < 31.5);

  e.animate = (_t, age) => {
    const head = clamp01(age / TRAVEL);
    const dist = len * head;
    const fade = clamp01((age - TRAVEL * 0.6) / Math.max(0.05, e.ttl - TRAVEL * 0.6));
    const op = Math.pow(1 - fade, 1.5);
    const w = 0.075 * (1 - 0.7 * fade);
    outer.scale.set(w * 3.2, w * 3.2, Math.max(0.01, dist));
    mid.scale.set(w * 1.5, w * 1.5, Math.max(0.01, dist));
    core.scale.set(w * 0.5, w * 0.5, Math.max(0.01, dist));
    outerMat.opacity = 0.35 * op;
    midMat.opacity = 0.7 * op;
    coreMat.opacity = 0.95 * op;
    arrow.position.z = dist;
    arrow.visible = head < 1;
    arrowMat.opacity = 1;
    headGlow.position.z = dist;
    headGlow.scale.setScalar(1.1 + 0.4 * Math.sin(age * 90));
    headGlow.material.opacity = head < 1 ? 1 : Math.max(0, 1 - (age - TRAVEL) / 0.12);
    tailGlow.scale.setScalar(0.9 + 1.2 * (1 - clamp01(age / 0.2)));
    tailGlow.material.opacity = Math.max(0, 1 - age / 0.2);
    // a flash where it ended
    const arrived = age - TRAVEL;
    endGlow.scale.setScalar(0.8 + 1.8 * clamp01(arrived / 0.2));
    endGlow.material.opacity = arrived < 0 ? 0 : 0.9 * Math.pow(1 - clamp01(arrived / 0.3), 2);
    for (const r of rings) {
      const a = age - r.at;
      r.mesh.visible = a >= 0 && a < 0.45;
      if (!r.mesh.visible) continue;
      const k = a / 0.45;
      r.mesh.scale.setScalar(0.1 + 0.55 * easeOut(k));
      // the ones close to the bow are kept faint, so they do not fill the archer's view
      r.mat.opacity = 0.7 * Math.pow(1 - k, 1.4) * Math.min(1, (r.mesh.position.z / 12) ** 1.2);
    }
  };
  return e;
}

// ---- Evasive Roll ----------------------------------------------------------------------------------------------------

export function buildEvasiveRoll(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  if (f.x2 === undefined || f.y2 === undefined || f.z2 === undefined) return e;
  const dx = f.x2 - f.x;
  const dz = f.z2 - f.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.3) return e;
  const dir = new THREE.Vector3(dx / len, 0, dz / len);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = Math.atan2(dir.x, dir.z);
  const ground = f.y - 0.9;
  const rise = f.y2 - f.y;

  // A soft streak of green light along the whole way, and thin lines of speed beside it.
  const streak = softMesh(e, kit, 0xbfffa0, 0.6, 1.4, 0.1, false);
  streak.mesh.position.set(0, rise / 2, len / 2);
  streak.mesh.scale.set(0.42, 0.5, len / 2 + 0.6);
  g.add(streak.mesh);
  const lineMat = glowMat(e, 0xeaffd8, 0.5);
  const lines: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(kit.box, lineMat);
    const l = len * rnd(0.55, 0.95);
    m.scale.set(0.018, 0.018, l);
    m.position.set(rnd(-0.55, 0.55), rnd(-0.5, 0.6) + rise * 0.5, len * rnd(0.3, 0.7));
    g.add(m);
    lines.push(m);
  }

  // The ranger's afterimages: a pale shape at each stage of a somersault along the way.
  const GHOSTS = 6;
  const ghosts: { group: THREE.Group; mat: THREE.MeshBasicMaterial; z: number }[] = [];
  for (let i = 0; i < GHOSTS; i++) {
    const mat = glowMat(e, 0x9be86f, 0);
    const body = new THREE.Group();
    const torso = new THREE.Mesh(kit.box, mat);
    torso.scale.set(0.5, 0.7, 0.28);
    torso.position.y = 0.05;
    const head = new THREE.Mesh(kit.box, mat);
    head.scale.set(0.4, 0.4, 0.4);
    head.position.set(0, 0.62, 0.06);
    const legs = new THREE.Mesh(kit.box, mat);
    legs.scale.set(0.46, 0.55, 0.26);
    legs.position.set(0, -0.55, 0);
    body.add(torso, head, legs);
    body.rotation.x = (i / GHOSTS) * Math.PI * 2 + 0.35;
    body.scale.setScalar(0.92);
    const z = (len * (i + 0.5)) / GHOSTS;
    body.position.set(0, rise * (z / len), z);
    g.add(body);
    ghosts.push({ group: body, mat, z });
  }

  if (f.age < 0.25) {
    kit.fire.rollStart(f.x, ground, f.z, dir.x, dir.z);
    kit.fire.rollTrail(f.x, ground + 0.9, f.z, f.x2, f.y2, f.z2);
  }
  // the roll takes about len / 18 seconds (the ability's own speed): each afterimage shows as the ranger passes it, and the landing dust when they stop
  const SPEED = 18;
  let landed = f.age >= len / SPEED + 0.25;

  const wp = new THREE.Vector3();
  e.animate = (_t, age) => {
    const fade = clamp01(age / e.ttl);
    setOp(streak.mat, 0.6 * Math.min(1, age * 14) * Math.pow(1 - fade, 2));
    lineMat.opacity = 0.5 * Math.pow(1 - fade, 1.5);
    if (!landed && age >= len / SPEED) {
      landed = true;
      kit.fire.rollEnd(f.x2!, f.y2! - 0.9, f.z2!);
    }
    ghosts.forEach((gh, i) => {
      const a = age - gh.z / SPEED;
      const k = a / 0.4;
      let op = a < 0 ? 0 : 0.3 * Math.pow(1 - clamp01(k), 1.5);
      // out of the way of the ranger's own eyes
      if (op > 0 && kit.viewer) {
        wp.set(f.x + dir.x * gh.z, f.y + rise * (gh.z / len), f.z + dir.z * gh.z);
        if (wp.distanceTo(kit.viewer) < 3) op = 0;
      }
      gh.mat.opacity = op;
      gh.group.visible = op > 0.01;
    });
  };
  return e;
}

// ---- Bear Trap -------------------------------------------------------------------------------------------------------

/** A trap's steel: two half-ring jaws set with teeth, hinged on a bar, around a pressure plate. `close(0..1)` shuts them. */
function makeTrap(e: FxEntry, kit: SpellKit): { root: THREE.Group; close: (c: number) => void; solids: THREE.MeshBasicMaterial[] } {
  const jawMat = solidMat(e, 0x4c5058);
  const toothMat = solidMat(e, 0xd6dae2);
  const barMat = solidMat(e, 0x2e3036);
  const plateMat = solidMat(e, 0x8a6a3a);
  const root = new THREE.Group();
  const jawA = new THREE.Group();
  const jawB = new THREE.Group();
  jawA.add(new THREE.Mesh(kit.jaw, jawMat));
  jawB.add(new THREE.Mesh(kit.jaw, jawMat));
  for (let i = 0; i < 7; i++) {
    const a = ((i + 0.5) / 7) * Math.PI;
    const t = new THREE.Mesh(kit.tooth, toothMat);
    t.position.set(Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0);
    t.scale.set(0.17, 0.17, 0.4);
    jawA.add(t);
    const b = ((i + 1) / 8) * Math.PI;
    const u = new THREE.Mesh(kit.tooth, toothMat);
    u.position.set(Math.cos(b) * 0.85, Math.sin(b) * 0.85, 0);
    u.scale.set(0.17, 0.17, -0.4);
    jawB.add(u);
  }
  const bar = new THREE.Mesh(kit.box, barMat);
  bar.scale.set(2.1, 0.09, 0.09);
  const plate = new THREE.Mesh(kit.disc, plateMat);
  plate.scale.setScalar(0.3);
  plate.position.y = 0.02;
  root.add(jawA, jawB, bar, plate);
  const open = Math.PI / 2;
  const shut = open - 0.1;
  const close = (c: number): void => {
    jawA.rotation.x = -open + c * shut;
    jawB.rotation.x = open - c * shut;
  };
  close(0);
  return { root, close, solids: [jawMat, toothMat, barMat, plateMat] };
}

/**
 * A trap thrown and lying in wait: it tumbles through the air in an arc from the thrower's hand (the mark's far end) to where
 * it lands, bites into the ground with a puff of earth and its jaws spring open, then rests there with a faint ring that
 * pulses to show how far it reaches.
 */
export function buildBearTrapSet(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  const r = Math.max(0.8, f.r);
  const trap = makeTrap(e, kit);
  trap.root.position.y = 0.06;
  g.add(trap.root);
  const ringMat = glowMat(e, 0x7fd35a, 0);
  const ring = new THREE.Mesh(kit.thin, ringMat);
  ring.position.y = 0.08;
  g.add(ring);
  const glow = glowSprite(e, kit, 0xdfffc0, 0);
  g.add(glow);
  const base = r * 0.55;
  const from = f.x2 === undefined || f.y2 === undefined || f.z2 === undefined ? null : new THREE.Vector3(f.x2 - f.x, f.y2 - f.y, f.z2 - f.z);
  const dist = from ? from.length() : 0;
  const flight = from ? Math.min(0.5, Math.max(0.2, 0.16 + dist * 0.02)) : 0;
  const lob = Math.min(3, 0.5 + dist * 0.14);
  let landed = false;
  if (flight === 0 || f.age >= flight) landed = true;
  if (landed && f.age < flight + 0.4) kit.fire.trapBury(f.x, f.y, f.z, r);
  trap.root.scale.setScalar(base);
  e.animate = (_t, age) => {
    const left = Math.max(0, e.ttl - age);
    const fade = clamp01(left / 2);
    for (const m of trap.solids) m.opacity = fade;
    if (age < flight && from) {
      // in the air: tumbling, shut tight, along an arc
      const u = age / flight;
      trap.root.position.set(from.x * (1 - u), from.y * (1 - u) + Math.sin(Math.PI * u) * lob + 0.06 * u, from.z * (1 - u));
      trap.root.rotation.set(u * Math.PI * 5, u * Math.PI * 2, 0);
      trap.close(1);
      glow.position.copy(trap.root.position);
      glow.scale.setScalar(0.8 + 0.3 * Math.sin(age * 50));
      glow.material.opacity = 0.7;
      ringMat.opacity = 0;
      return;
    }
    if (!landed) {
      landed = true;
      kit.fire.trapBury(f.x, f.y, f.z, r);
      kit.impact(f.x, f.y, f.z, 0.06);
    }
    trap.root.position.set(0, 0.06, 0);
    trap.root.rotation.set(0, 0, 0);
    // the jaws spring open as it lands, with a little overshoot
    const since = age - flight;
    const open = easeOut(since / 0.2);
    trap.close(Math.max(0, 1 - open) + (since > 0.2 ? 0 : 0.05 * Math.sin(open * Math.PI)));
    trap.root.scale.setScalar(base * (1 + 0.12 * Math.exp(-since * 14)));
    glow.material.opacity = Math.max(0, 0.7 * (1 - since / 0.25));
    glow.scale.setScalar(1.2 + 2 * since);
    glow.position.set(0, 0.3, 0);
    const k = (since % 2.4) / 1.2;
    if (since > 0.25 && k < 1) {
      ring.scale.setScalar(r * (0.4 + 0.6 * k));
      ringMat.opacity = 0.45 * (1 - k) * fade;
    } else ringMat.opacity = 0;
  };
  return e;
}
/** A trap springing: the jaws slam shut with a clang of sparks and a jolt of dust, and hold on for a moment. */
export function buildBearTrapSnap(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  const r = Math.max(0.8, f.r);
  const trap = makeTrap(e, kit);
  trap.root.position.y = 0.06;
  trap.root.scale.setScalar(r * 0.55);
  g.add(trap.root);
  const waveMat = glowMat(e, 0xfff0c0, 0.8);
  const wave = new THREE.Mesh(kit.ring, waveMat);
  wave.position.y = 0.1;
  g.add(wave);
  const flash = glowSprite(e, kit, 0xfff0c8, 1);
  flash.position.y = 0.4;
  g.add(flash);
  let clanged = false;
  e.animate = (_t, age) => {
    const c = clamp01(age / 0.1);
    // it slams shut, and the jaws jump a little as they meet
    trap.close(c * c + (age > 0.1 ? 0.04 * Math.exp(-(age - 0.1) * 14) * Math.sin((age - 0.1) * 60) : 0));
    if (c >= 1 && !clanged) {
      clanged = true;
      if (age < 0.4) {
        kit.fire.trapSnap(f.x, f.y, f.z, r);
        kit.impact(f.x, f.y, f.z, 0.12);
      }
    }
    const fade = clamp01((e.ttl - age) / 0.3);
    for (const m of trap.solids) m.opacity = fade;
    const k = clamp01((age - 0.08) / 0.35);
    wave.scale.setScalar(r * (0.3 + 0.9 * easeOut(k)));
    waveMat.opacity = age < 0.08 ? 0 : 0.8 * Math.pow(1 - k, 1.5);
    flash.scale.setScalar(1.2 + 2.2 * k);
    flash.material.opacity = age < 0.08 ? 0 : 0.9 * Math.pow(1 - k, 2);
  };
  return e;
}

// ---- Rain of Arrows --------------------------------------------------------------------------------------------------

/**
 * The circle the rain falls on, and the rain: real arrows that fall out of the sky, volley after volley, each landing as the
 * server's hit of that volley happens, and then stay stuck in the ground until the mark goes. The volleys are timed from the
 * ability's own table (`delay`, `interval`, `waves`), so the picture and the damage keep step.
 */
export function buildRainMark(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  const fire = kit.fire;
  const r = Math.max(1.5, f.r);
  const eff = ABILITY_BY_ID.get('rain_of_arrows')?.effect;
  const zone = eff && eff.t === 'zone' ? eff : null;
  const delay = zone?.delay ?? 0.6;
  const interval = zone?.interval ?? 0.5;
  const waves = Math.max(1, Math.min(12, Math.round((e.ttl - 0.4 - delay) / interval + 1)));

  // the circle on the ground
  const ringMat = glowMat(e, 0x7fd35a, 0);
  const ring = new THREE.Mesh(kit.thin, ringMat);
  const fillMat = glowMat(e, 0x7fd35a, 0);
  const fill = new THREE.Mesh(kit.disc, fillMat);
  ring.position.y = fill.position.y = 0.1;
  ring.scale.setScalar(r);
  fill.scale.setScalar(r);
  g.add(ring, fill);
  const arcMat = glowMat(e, 0xd8ffb8, 0);
  const arcs: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const a = new THREE.Mesh(kit.arc, arcMat);
    a.position.y = 0.12;
    a.rotation.y = (i * Math.PI) / 2;
    arcs.push(a);
    g.add(a);
  }

  // the arrows: for each volley a bunch of them, each with where it lands and when
  const PER = Math.max(8, Math.round(r * 3.5));
  const N = waves * PER;
  const FALL = 0.36;
  const DIST = 22;
  const land = new Float32Array(N * 2);
  const when = new Float32Array(N);
  const dirs: THREE.Vector3[] = [];
  const quats: THREE.Quaternion[] = [];
  const landed = new Uint8Array(N);
  const up = new THREE.Vector3(0, 1, 0);
  for (let v = 0; v < waves; v++) {
    for (let j = 0; j < PER; j++) {
      const i = v * PER + j;
      const a = rnd(0, Math.PI * 2);
      const d = Math.sqrt(Math.random()) * r * 0.95;
      land[i * 2] = Math.cos(a) * d;
      land[i * 2 + 1] = Math.sin(a) * d;
      when[i] = delay + v * interval - rnd(0, 0.1);
      const dir = new THREE.Vector3(0.22 + rnd(-0.04, 0.04), -1, 0.12 + rnd(-0.04, 0.04)).normalize();
      dirs.push(dir);
      quats.push(new THREE.Quaternion().setFromUnitVectors(up, dir));
    }
  }
  const arrowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide });
  e.materials.push(arrowMat);
  const arrows = new THREE.InstancedMesh(kit.arrow, arrowMat, N);
  const trailMat = glowMat(e, 0xd8ffb0, 0.55);
  const trails = new THREE.InstancedMesh(kit.streak, trailMat, N);
  arrows.frustumCulled = trails.frustumCulled = false;
  g.add(arrows, trails);
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const none = new THREE.Matrix4().makeScale(0, 0, 0);
  const qTmp = new THREE.Quaternion();
  const axisX = new THREE.Vector3(1, 0, 0);

  e.animate = (_t, age) => {
    const open = easeOut(age / 0.2);
    const left = clamp01((e.ttl - age) / 0.4);
    // a flash of the ground at each volley
    let pulse = 0;
    if (age >= delay) {
      const v = Math.min(waves - 1, Math.floor((age - delay) / interval));
      pulse = Math.exp(-(age - delay - v * interval) * 9);
    }
    ringMat.opacity = (0.55 + 0.3 * pulse) * open * left;
    fillMat.opacity = (0.08 + 0.2 * pulse) * open * left;
    ring.scale.setScalar(r * (1 + 0.025 * pulse));
    arcMat.opacity = 0.7 * open * left;
    arcs.forEach((a, i) => {
      a.rotation.y = (i * Math.PI) / 2 + age * 0.9;
      a.scale.setScalar(r * 1.04);
    });
    arrowMat.opacity = left;
    trailMat.opacity = 0.55 * left;

    for (let i = 0; i < N; i++) {
      const L = when[i];
      const lx = land[i * 2];
      const lz = land[i * 2 + 1];
      const d = dirs[i];
      if (age < L - FALL) {
        arrows.setMatrixAt(i, none);
        trails.setMatrixAt(i, none);
        continue;
      }
      if (age < L) {
        const u = (age - (L - FALL)) / FALL;
        const back = DIST * (1 - u);
        // the tip is `back` blocks up the way it came from, measured from where it will land
        pos.set(lx - d.x * back, -d.y * back, lz - d.z * back);
        sc.set(1.15, 1.15, 1.15);
        arrows.setMatrixAt(i, m4.compose(pos, quats[i], sc));
        sc.set(1, 3.8, 1);
        trails.setMatrixAt(i, m4.compose(pos, quats[i], sc));
        continue;
      }
      if (!landed[i]) {
        landed[i] = 1;
        if (age - L < 0.3) fire.arrowLand(f.x + lx, f.y, f.z + lz);
      }
      // stuck in the ground: a little over a third of it buried, shivering for a moment
      const since = age - L;
      const shake = 0.1 * Math.exp(-since * 9) * Math.sin(since * 55);
      pos.set(lx + d.x * 0.55, d.y * 0.55, lz + d.z * 0.55);
      qTmp.setFromAxisAngle(axisX, shake).premultiply(quats[i]);
      sc.set(1.15, 1.15, 1.15);
      arrows.setMatrixAt(i, m4.compose(pos, qTmp, sc));
      trails.setMatrixAt(i, none);
    }
    arrows.instanceMatrix.needsUpdate = true;
    trails.instanceMatrix.needsUpdate = true;
  };
  e.onEnd = () => {
    arrows.dispose();
    trails.dispose();
  };
  return e;
}

/** A volley landing on the whole circle at once: a ripple out across the ground and a sparkle of wind. */
export function buildRainHit(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  const r = Math.max(1.5, f.r);
  const rippleMat = glowMat(e, 0xcfe8a0, 0.7);
  const ripple = new THREE.Mesh(kit.ring, rippleMat);
  const fillMat = glowMat(e, 0x7fd35a, 0.25);
  const fill = new THREE.Mesh(kit.disc, fillMat);
  ripple.position.y = fill.position.y = 0.14;
  g.add(ripple, fill);
  if (f.age < 0.25) {
    kit.fire.volleyBurst(f.x, f.y, f.z, r);
    kit.impact(f.x, f.y, f.z, 0.05);
  }
  e.animate = (t) => {
    const k = clamp01(t);
    ripple.scale.setScalar(Math.max(0.1, r * (0.25 + 0.8 * easeOut(k))));
    rippleMat.opacity = 0.7 * Math.pow(1 - k, 1.5);
    fill.scale.setScalar(r);
    fillMat.opacity = 0.25 * Math.pow(1 - k, 2);
  };
  return e;
}
