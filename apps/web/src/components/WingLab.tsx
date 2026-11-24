'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { getItem } from '@solrift/shared';
import { Character } from '@/game/character';
import type { MotionClass } from '@/game/classMotion';

/**
 * A bench for the poses of a figure (dev only, see `app/wing-lab`): the real `Character` on a plain floor, stepped by hand with fixed time steps and
 * looked at from any side, so that every state of the wings and the flight can be photographed again and again with the same result. The game's
 * own loading takes minutes on a machine with no graphics card; this takes a second. The bench drives `Character.animate` exactly as the game
 * does (speed, turn, climb, whether it is in the air and flying) and nothing else.
 */

export interface LabInput {
  speed?: number;
  turn?: number;
  vy?: number;
  flying?: boolean;
  airborne?: boolean;
  engaged?: boolean;
  /** 0..1 through a swing (1: not swinging), a block, a spell. */
  attack?: number;
  blocking?: boolean;
  accel?: number;
}

export interface WingLabApi {
  ready: boolean;
  /** Dress a figure: its class, its wings (1..6, 0 none) and what it carries ('sword', 'staff', 'bow', 'none'), and a shield on its arm. */
  setup(cls: MotionClass | null, wings: number, held: 'sword' | 'staff' | 'bow' | 'none', shield: boolean): void;
  /** Put the wings on (the same figure, so the opening plays), without changing the rest. */
  wear(wings: number): void;
  /** Step the figure `seconds` at `fps` with this input (the same input throughout); returns the state it ends in. */
  run(seconds: number, input: LabInput, fps?: number): string;
  /** Step with a different time for every frame (the dts), to test what a stutter does. */
  runDts(dts: number[], input: LabInput): string;
  /** The camera: azimuth round the figure (radians, 0 behind it, PI in front, PI/2 its left side), elevation, distance, and the height it looks at. */
  view(az: number, el?: number, dist?: number, look?: number): void;
  /** Draw it now. */
  draw(): void;
  /** The pose now: some of the angles of the joints, for reading. */
  pose(): Record<string, number>;
}

declare global {
  interface Window {
    __wingLab?: WingLabApi;
  }
}

const STICK = new THREE.MeshBasicMaterial({ color: 0x8a5a2a });
const STEEL = new THREE.MeshBasicMaterial({ color: 0xcfd6e0 });
const GLOW = new THREE.MeshBasicMaterial({ color: 0x66d9ff });

function heldModel(kind: string): THREE.Object3D {
  const g = new THREE.Group();
  const box = (w: number, h: number, d: number, y: number, m: THREE.Material, z = 0): THREE.Mesh => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(0, y, z);
    g.add(b);
    return b;
  };
  if (kind === 'staff') {
    box(0.07, 1.7, 0.07, 0.35, STICK);
    box(0.2, 0.2, 0.2, 1.25, GLOW);
  } else if (kind === 'bow') {
    box(0.05, 0.9, 0.06, 0.2, STICK, -0.12);
    box(0.05, 0.3, 0.06, 0.62, STICK, -0.04);
    box(0.05, 0.3, 0.06, -0.22, STICK, -0.04);
    box(0.015, 1.1, 0.015, 0.2, STEEL, 0.02);
  } else {
    box(0.06, 0.2, 0.06, 0.0, STICK);
    box(0.3, 0.05, 0.08, 0.12, STEEL);
    box(0.08, 0.95, 0.02, 0.62, STEEL);
  }
  g.position.set(0, 0, -0.1);
  return g;
}

export default function WingLab() {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const W = 960;
    const H = 540;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(W, H);
    renderer.setClearColor(0x6fa8dc);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 100);
    // The floor: a grid, so that a figure floating over it is seen to float.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5c8a3a }));
    floor.position.y = -0.002;
    scene.add(floor);
    const grid = new THREE.GridHelper(30, 30, 0x2f5a1c, 0x3f7028);
    scene.add(grid);
    const group = new THREE.Group();
    scene.add(group);
    let character = new Character();
    group.add(character.root);
    let cls: MotionClass | null = null;
    let az = 0;
    let el2 = 0.12;
    let dist = 6.5;
    let lookY = 1.2;
    const place = (): void => {
      camera.position.set(Math.sin(az) * Math.cos(el2) * dist, lookY + Math.sin(el2) * dist, Math.cos(az) * Math.cos(el2) * dist);
      camera.lookAt(0, lookY, 0);
    };
    place();
    const step = (dt: number, i: LabInput): void => {
      const c = character;
      c.wingFlying = !!i.flying;
      c.engaged = !!i.engaged;
      // (The game sets the way the head looks every frame before nimate, and nimate adds to it: so does this.)
      c.headPivot.rotation.x = 0;
      c.headPivot.rotation.y = 0;
      c.moveF = 1;
      c.moveR = 0;
      c.animate(dt, i.speed ?? 0, i.turn ?? 0, i.attack ?? 1, false, !!i.blocking, i.vy ?? 0, i.airborne ?? !!i.flying, false);
    };
    const draw = (): void => {
      place();
      renderer.render(scene, camera);
    };
    const stateOf = (): string => {
      const s = character as unknown as { flight?: { out?: { state?: string } } };
      return s.flight?.out?.state ?? '';
    };
    const api: WingLabApi = {
      ready: true,
      setup(c2, wings, held, shield) {
        group.remove(character.root);
        character.dispose?.();
        character = new Character();
        group.add(character.root);
        cls = c2;
        character.setMotionClass(c2);
        character.setHeld(held === 'none' ? 0 : held === 'staff' ? 393 : held === 'bow' ? 303 : 287, (id) => (id ? heldModel(held) : null));
        if (shield) {
          character.setShield(344, () => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.06), new THREE.MeshBasicMaterial({ color: 0x4a6fa5 }));
            return m;
          });
        }
        character.setWings(wings);
        void getItem;
        draw();
      },
      wear(wings) {
        character.setWings(wings);
        draw();
      },
      run(seconds, input, fps = 60) {
        const n = Math.max(1, Math.round(seconds * fps));
        for (let k = 0; k < n; k++) step(1 / fps, input);
        draw();
        return stateOf();
      },
      runDts(dts, input) {
        for (const dt of dts) step(dt, input);
        draw();
        return stateOf();
      },
      view(a, e = 0.12, d = 6.5, l = 1.2) {
        az = a;
        el2 = e;
        dist = d;
        lookY = l;
        draw();
      },
      draw,
      pose() {
        const c = character;
        return {
          rootX: c.root.rotation.x, rootZ: c.root.rotation.z, rootY: c.root.position.y,
          legLx: c.legL.rotation.x, legRx: c.legR.rotation.x, armLx: c.armL.rotation.x, armRx: c.armR.rotation.x,
          armLz: c.armL.rotation.z, armRz: c.armR.rotation.z, headX: c.headPivot.rotation.x, headZ: c.headPivot.rotation.z,
        };
      },
    };
    void cls;
    window.__wingLab = api;
    draw();
    return () => {
      delete window.__wingLab;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return <div ref={mount} style={{ background: '#222', minHeight: '100vh' }} />;
}
