'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { CLASSES, MOUNTS, mountSpeedText, type TipLine } from '@solrift/shared';
import { Tip } from './ItemView';
import { lookOf } from '../game/character';
import { paletteOfLook } from '../game/lookPalette';
import { paintSkin, partRects } from '../game/skin';
import { useProfile } from '../profile/store';
import { useUi } from '../ui/store';

/** Head and shoulders of a look, 16 x 12 pixels: the head's front, the top of the torso and both arms (each with the layer over it). */
function bustOf(look: Parameters<typeof paletteOfLook>[0]): ImageData {
  const skin = paintSkin(lookOf(paletteOfLook(look)));
  const out = new ImageData(16, 12);
  // Seen from the front, the figure's right arm is on the left.
  const pieces = [
    { part: 'armR', ox: 0, oy: 8, w: 4, h: 4 },
    { part: 'armL', ox: 12, oy: 8, w: 4, h: 4 },
    { part: 'body', ox: 4, oy: 8, w: 8, h: 4 },
    { part: 'head', ox: 4, oy: 0, w: 8, h: 8 },
  ] as const;
  for (const { part, ox, oy, w, h } of pieces) {
    for (const layer of ['base', 'over'] as const) {
      const r = partRects(part, layer).front;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = ((r.y + y) * 64 + r.x + x) * 4;
          if (skin[i + 3] < 128) continue;
          const o = ((oy + y) * 16 + ox + x) * 4;
          out.data[o] = skin[i];
          out.data[o + 1] = skin[i + 1];
          out.data[o + 2] = skin[i + 2];
          out.data[o + 3] = 255;
        }
    }
  }
  return out;
}

/** The character in a round frame, head and shoulders in pixel art, from the same skin the figure wears. */
function Portrait() {
  const look = useProfile((s) => s.look);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const small = document.createElement('canvas');
    small.width = 16;
    small.height = 12;
    small.getContext('2d')!.putImageData(bustOf(look), 0, 0);
    const g = canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, canvas.width, canvas.height);
    // 7 canvas pixels to a skin pixel: the head fills about 60% of the circle, with the shoulders under it.
    const px = canvas.width / 13.7;
    const w = 16 * px;
    g.drawImage(small, (canvas.width - w) / 2, canvas.height * 0.1, w, 12 * px);
  }, [look]);
  return <canvas ref={ref} width={96} height={96} />;
}

/** A sick green face, 16×16, drawn on the Poison status effect. */
const POISON_FACE = [
  '                ',
  '     gggggg     ',
  '    gGGGGGG     ',
  '   gGGkkGkkGg   ',
  '   gGGkkGkkGg   ',
  '   gGGGGGGGGg   ',
  '    gGGkkGGg    ',
  '    gGGGkkGg    ',
  '     gGGGGGg    ',
  '      gGGGg     ',
  '       gGg      ',
  '        g       ',
  '                ',
  '                ',
  '                ',
  '                ',
];
const POISON_PAL: Record<string, [number, number, number]> = {
  g: [20, 48, 12],
  G: [94, 214, 58],
  k: [12, 26, 8],
};

/** A saddle, the same for every mount. Each mount keeps its own picture on its horn. */
const SADDLE = [
  '                ',
  '      hhhh      ',
  '    hHBBBBhh    ',
  '   hBBBBBBBBh   ',
  '   hBkkkkkkBh   ',
  '    hBBBBBBBh   ',
  '     hBBBBBh    ',
  '       BB       ',
  '       BB       ',
  '      sSSs      ',
  '     s    s     ',
  '     s    s     ',
  '      ssss      ',
  '                ',
  '                ',
  '                ',
];
const SADDLE_PAL: Record<string, [number, number, number]> = {
  h: [58, 36, 20],
  H: [214, 164, 102],
  B: [150, 92, 48],
  k: [74, 44, 24],
  s: [110, 118, 132],
  S: [214, 220, 230],
};

/** A drumstick, 16×16, drawn on the Hunger sickness status effect. */
const HUNGER = [
  '                ',
  '                ',
  '      mmmm      ',
  '    mmMMMMmm    ',
  '   mMMMkkMMmm   ',
  '   mMMMMMMMmm   ',
  '    mMMMMMmm    ',
  '      mmmm      ',
  '       bb       ',
  '       bb       ',
  '      bBBb      ',
  '     b    b     ',
  '                ',
  '                ',
  '                ',
  '                ',
];
const HUNGER_PAL: Record<string, [number, number, number]> = {
  m: [92, 42, 16],
  M: [196, 112, 48],
  k: [120, 58, 24],
  b: [92, 78, 58],
  B: [232, 220, 196],
};

function paintGlyph(canvas: HTMLCanvasElement | null, rows: readonly string[], pal: Record<string, [number, number, number]>, empty: [number, number, number]) {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const img = new ImageData(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const ch = rows[y]?.[x] ?? ' ';
      const c = ch === ' ' ? empty : (pal[ch] ?? empty);
      const o = (y * 16 + x) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

const MOUNT_EMPTY: [number, number, number] = [28, 20, 14];
const POISON_EMPTY: [number, number, number] = [22, 36, 16];
const HUNGER_EMPTY: [number, number, number] = [36, 18, 10];

function Glyph({ rows, pal, empty }: { rows: readonly string[]; pal: Record<string, [number, number, number]>; empty: [number, number, number] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    paintGlyph(ref.current, rows, pal, empty);
  }, [rows, pal, empty]);
  return <canvas ref={ref} width={16} height={16} aria-hidden />;
}

function MountIcon() {
  return <Glyph rows={SADDLE} pal={SADDLE_PAL} empty={MOUNT_EMPTY} />;
}

function PoisonIcon() {
  return <Glyph rows={POISON_FACE} pal={POISON_PAL} empty={POISON_EMPTY} />;
}

function HungerIcon() {
  return <Glyph rows={HUNGER} pal={HUNGER_PAL} empty={HUNGER_EMPTY} />;
}

/** True while a window has given the mouse back (inventory, dialog, the quest log, and the rest). */
function useCursorFree(): boolean {
  const [free, setFree] = useState(false);
  useEffect(() => {
    const sync = () => setFree(document.pointerLockElement === null);
    sync();
    document.addEventListener('pointerlockchange', sync);
    return () => document.removeEventListener('pointerlockchange', sync);
  }, []);
  return free;
}

function Bar({ id, kind, value, max, label, title }: { id?: string; kind: string; value: number; max: number; label: string; title: string }) {
  const f = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div id={id} className={`pf-bar ${kind}${kind === 'health' && f <= 0.3 ? ' low' : ''}`} title={title}>
      <i style={{ width: `${(f * 100).toFixed(1)}%` }} />
      <span>{label}</span>
    </div>
  );
}

/**
 * The character's frame in the top left corner (the mini map is in the top right): the head in a round portrait
 * with the level on it, the name and class, and bars for health, food and armor. Status effects sit in a row
 * under those bars, outside the plate, lined up with the bars rather than under the portrait. The mount icon
 * sits in that same row.
 */
export function PlayerFrame() {
  const mode = useUi((s) => s.mode);
  const health = useUi((s) => s.health);
  const hunger = useUi((s) => s.hunger);
  const armor = useUi((s) => s.armor);
  const poison = useUi((s) => s.poison);
  const foodSick = useUi((s) => s.foodSick);
  const riding = useUi((s) => s.mount.mount);
  const level = useUi((s) => s.level);
  const hardcore = useUi((s) => s.hardcore);
  const cls = useUi((s) => s.cls);
  const spectating = useUi((s) => s.spectating);
  const name = useProfile((s) => s.name);
  const cursor = useCursorFree();
  const [hover, setHover] = useState<'mount' | 'poison' | 'hunger' | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const [box, setBox] = useState<{ x: number; y: number } | null>(null);
  const def = cls ? CLASSES[cls.id] : null;
  const maxHealth = cls?.maxHealth ?? 20;
  const survival = mode !== 'creative';
  const ridden = riding > 0 ? MOUNTS[riding - 1] : null;
  const tip: TipLine[] =
    cursor && hover === 'mount' && ridden
      ? [
          { text: ridden.name, color: ridden.speed >= 2 ? 'epic' : ridden.speed > 1.6 ? 'superior' : 'uncommon' },
          { text: mountSpeedText(ridden), color: 'stat' },
          { text: ridden.blurb, color: 'dim' },
          { text: 'Press H to get off', color: 'dim' },
        ]
      : cursor && hover === 'hunger' && foodSick > 0
        ? [
            { text: 'Hunger sickness', color: 'warn' },
            { text: 'Status effect', color: 'dim' },
            { text: 'The food bar drains while it lasts.', color: 'dim' },
            { text: `${foodSick}s left`, color: 'warn' },
          ]
        : cursor && hover === 'poison' && poison > 0
          ? [
              { text: 'Poison', color: 'good' },
              { text: 'Status effect', color: 'dim' },
              { text: 'A point of damage every moment. It never takes the last heart.', color: 'dim' },
              { text: `${poison}s left`, color: 'warn' },
            ]
          : [];
  const placeTip = () => {
    const el = tipRef.current;
    if (!el) return;
    const { x, y } = mouse.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const m = 6;
    let tx = x + 14;
    if (tx + w > window.innerWidth - m) tx = Math.max(m, x - 14 - w);
    const ty = Math.max(m, Math.min(y - 34, window.innerHeight - h - m));
    el.style.transform = `translate(${tx}px, ${ty}px)`;
  };
  useEffect(() => {
    if (!cursor) setHover(null);
  }, [cursor]);
  useEffect(() => {
    if (!tip.length) return;
    const onMove = (e: globalThis.MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      placeTip();
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [tip.length > 0]);
  useLayoutEffect(() => {
    if (tip.length) placeTip();
  });
  useLayoutEffect(() => {
    const el = sideRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + 28);
    const y = Math.round(r.bottom + 4);
    setBox((b) => (b && b.x === x && b.y === y ? b : { x, y }));
  });
  const enter = (kind: 'mount' | 'poison' | 'hunger') => (e: MouseEvent) => {
    mouse.current = { x: e.clientX, y: e.clientY };
    setHover(kind);
  };
  if (spectating) return null;
  return (
    <div id="player-frame" data-testid="player-frame" style={{ '--cls': def?.color ?? '#d6aa46' } as CSSProperties}>
      <div className="pf-portrait-wrap">
        <div className="pf-portrait">
          <Portrait />
        </div>
        {survival && <div className="pf-level" title="Character level">{level}</div>}
      </div>
      <div className="pf-side" ref={sideRef}>
        <div className="pf-plate">
          <div className="pf-name">
            <b>{name || 'Adventurer'}</b>
            {def && <small>{def.name}</small>}
          </div>
          {survival && (
            <div id="vitals" className="pf-bars">
              <div id={hardcore ? 'hardcore-hearts' : undefined}>
                <Bar kind={hardcore ? 'health hardcore' : 'health'} value={health} max={maxHealth} label={`${Math.ceil(health)} / ${maxHealth}`} title={`Health ${Math.ceil(health)} / ${maxHealth}${hardcore ? ' (hardcore)' : ''}`} />
              </div>
              <div className="pf-row">
                <Bar kind="food" value={hunger} max={20} label={`Food ${Math.ceil(hunger)}`} title={`Food ${Math.ceil(hunger)} / 20`} />
                {armor > 0 && <Bar id="armor-row" kind="armor" value={armor} max={20} label={`Armor ${armor}`} title={`Armor ${armor} / 20: it softens the blows you take`} />}
              </div>
            </div>
          )}
        </div>
        {box &&
          (ridden || (survival && (foodSick > 0 || poison > 0))) &&
          createPortal(
            <div className={`pf-buffs${cursor ? ' live' : ''}`} style={{ left: box.x, top: box.y }}>
              {ridden && (
                <div className="pf-buff mount" onMouseEnter={enter('mount')} onMouseLeave={() => setHover(null)}>
                  <MountIcon />
                </div>
              )}
              {survival && foodSick > 0 && (
                <div className="pf-buff" onMouseEnter={enter('hunger')} onMouseLeave={() => setHover(null)}>
                  <HungerIcon />
                  <b>{foodSick}s</b>
                </div>
              )}
              {survival && poison > 0 && (
                <div className="pf-buff" onMouseEnter={enter('poison')} onMouseLeave={() => setHover(null)}>
                  <PoisonIcon />
                  <b>{poison}s</b>
                </div>
              )}
              {tip.length > 0 && (
                <div ref={tipRef} className="tooltip">
                  <Tip lines={tip} />
                </div>
              )}
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
