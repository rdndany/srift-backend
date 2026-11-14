'use client';

import { useEffect, useRef } from 'react';
import { MOUNTS, MOUNT_BITE, MOUNT_HOWL, mountDef, mountItemId, mountOfItem, mountSpeedText } from '@solrift/shared';
import { useUi } from '../ui/store';
import { ItemSprite } from './ItemSprite';
import { ItemView } from './ItemView';
import './classHud.css';

const N = 16;

/** The violet of the Fenrir's eyes: the colour of its buttons. */
const TINT = '#b46cff';

type Grid = string[][];
const PAL: Record<string, string> = {
  K: '#150d07',
  W: '#ffffff',
  s: '#e4ebf7',
  R: '#ff6a4a',
  r: '#cf2f1d',
  m: '#7a1410',
  Y: '#ffe680',
  y: '#f2b632',
  P: '#e2c8ff',
  p: '#9a5cf0',
  q: '#5a2cb8',
  F: '#ffd84a',
};

const blank = (): Grid => Array.from({ length: N }, () => Array<string>(N).fill(' '));
const put = (g: Grid, x: number, y: number, c: string): void => {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px >= 0 && py >= 0 && px < N && py < N) g[py][px] = c;
};
const line = (g: Grid, x0: number, y0: number, x1: number, y1: number, c: string, thick = false): void => {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    put(g, x, y, c);
    if (thick) put(g, x + 1, y, c);
  }
};

/** The two pictures: jaws with fangs (the bite) and a bolt of lightning striking a ring on the ground (the howl's storm). */
const ART: Record<'bite' | 'howl', () => Grid> = {
  bite: () => {
    const g = blank();
    // The upper jaw (red, lit from above) and the lower one (dark), with the fangs of both.
    for (let x = 1; x <= 14; x++) {
      const top = 2 + Math.round(2.2 * Math.sin(((x - 1) / 13) * Math.PI));
      for (let y = top; y <= 6; y++) put(g, x, y, y === top ? 'R' : y < 5 ? 'r' : 'm');
      const low = 13 - Math.round(1.6 * Math.sin(((x - 1) / 13) * Math.PI));
      for (let y = 10; y <= low; y++) put(g, x, y, y === 10 ? 'r' : 'm');
    }
    for (const x of [3, 6, 9, 12]) {
      put(g, x, 7, 'W');
      put(g, x, 8, 's');
      if (x % 3 === 0) put(g, x, 9, 'W');
    }
    for (const x of [4, 7, 10, 13]) {
      put(g, x, 9, 'W');
      put(g, x, 8, 's');
    }
    put(g, 2, 4, 'Y');
    put(g, 13, 4, 'Y');
    return g;
  },
  howl: () => {
    const g = blank();
    // The ground it strikes: a ring seen at a slant, the near edge darker.
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      put(g, 7.5 + Math.cos(a) * 6.8, 12.4 + Math.sin(a) * 2.3, Math.sin(a) > 0 ? 'q' : 'p');
    }
    // The bolt: down from the top in two kinks onto the middle of the ring, a wide stroke of lavender with a white core.
    const path: [number, number][] = [[10, 0], [6.5, 5.5], [9.5, 6.5], [6, 12]];
    for (let i = 0; i < path.length - 1; i++) line(g, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], 'P', true);
    for (let i = 0; i < path.length - 1; i++) line(g, path[i][0] + 0.5, path[i][1], path[i + 1][0] + 0.5, path[i + 1][1], 'W');
    // Where it lands: a flash and a few sparks.
    for (const [x, y] of [[5, 12], [7, 12], [6, 11], [6, 13]]) put(g, x, y, 'W');
    for (const [x, y] of [[3, 10], [10, 10], [12, 12], [2, 13], [9, 14], [13, 8]]) put(g, x, y, 'F');
    return g;
  },
};

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** One of the mount's skills as a 16 x 16 pixel picture on a violet tile, like the abilities of the classes. */
export function MountSkillIcon({ kind, size = 44 }: { kind: 'bite' | 'howl'; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const art = ART[kind]();
    const img = new ImageData(N, N);
    const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < N && y < N && art[y][x] !== ' ';
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1;
        let c: [number, number, number];
        if (solid(x, y)) c = rgb(PAL[art[y][x]]);
        else if (edge || solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) c = rgb(PAL.K);
        else {
          const t = Math.min(1, Math.hypot(x - 7.5, (y - 5.5) * 1.1) / 11);
          const k = 1 - 0.55 * t + (((x + y) & 1) === 0 ? 0.04 : 0);
          c = [Math.round(110 * k), Math.round(62 * k), Math.round(190 * k)];
        }
        const o = (y * N + x) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  }, [kind]);
  return <canvas ref={ref} width={N} height={N} className="ability-icon" data-skill={kind} aria-hidden style={{ width: size, height: size, imageRendering: 'pixelated' }} />;
}

/**
 * While mounted the two mouse buttons are the mount's skills: shown right of the hotbar where the class abilities usually are,
 * with the cooldowns the server says. They are not buttons to press: the mouse buttons do it.
 */
export function MountBar() {
  const mount = useUi((s) => s.mount);
  const screen = useUi((s) => s.screen);
  if (mount.mount <= 0 || (screen !== 'none' && screen !== 'dead')) return null;
  const def = MOUNTS[mount.mount - 1];
  const skills = [
    { kind: 'bite' as const, key: 'LMB', skill: MOUNT_BITE, cd: mount.cd[0] },
    { kind: 'howl' as const, key: 'RMB', skill: MOUNT_HOWL, cd: mount.cd[1] },
  ];
  return (
    <div id="class-bar" data-testid="mount-bar" style={{ '--cls': TINT } as React.CSSProperties}>
      <div className="cb-slots">
        {skills.map(({ kind, key, skill, cd }) => {
          const cooling = cd > 0;
          return (
            <div key={kind} className={`cb-slot mount-skill${cooling ? ' cooling' : ''}`} data-skill={kind} title={`${skill.name}: ${skill.blurb} (${skill.cooldown}s). ${def.name} hits ${Math.round(def.power * 100)}% as hard as the crimson one.`}>
              <MountSkillIcon kind={kind} />
              <kbd>{key}</kbd>
              {cooling && <span className="cb-cd" style={{ height: `${Math.min(100, (cd / skill.cooldown) * 100)}%` }} />}
              {cooling && <span className="cb-cd-num">{cd >= 10 ? Math.ceil(cd) : cd.toFixed(1)}</span>}
            </div>
          );
        })}
      </div>
      <div className="cb-buffs">
        <span className="buff mounted">{def.name}</span>
      </div>
    </div>
  );
}

/**
 * The mount slot, top left of the screen under the character frame (small, no key shown): the horn of the mount that H calls (put one there from the inventory window, which
 * has the same slot, or with a right-click on a horn). It lights up while the mount is ridden. It is shown, not clicked: the
 * pointer is locked to the game.
 */
export function MountSlot() {
  const api = useUi((s) => s.api);
  const mount = useUi((s) => s.mount);
  const screen = useUi((s) => s.screen);
  const spectating = useUi((s) => s.spectating);
  const creative = useUi((s) => s.mode === 'creative');
  useUi((s) => s.version);
  if (!api || spectating || (screen !== 'none' && screen !== 'dead')) return null;
  const stack = api.mountSlot.get(0);
  const def = mountDef(stack ? mountOfItem(stack.id) : null);
  const title = def ? `${def.name}: ${mountSpeedText(def)}. H calls it, H again gets off.` : creative ? 'Mount slot: H calls a mount' : 'Mount slot: put a mount horn here, then press H';
  return (
    <div id="mount-slot" className={mount.mount > 0 ? 'riding' : ''} data-testid="mount-slot" title={title}>
      <div className="slot">
        {stack ? <ItemView stack={stack} /> : <ItemSprite id={mountItemId(MOUNTS[0].id)} size={24} />}
      </div>
    </div>
  );
}
