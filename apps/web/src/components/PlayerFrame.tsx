'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { CLASSES, MOUNTS, mountSpeedText, type TipLine } from '@solrift/shared';
import { Tip } from './ItemView';
import { lookOf } from '../game/character';
import { paletteOfCode, paletteOfLook } from '../game/lookPalette';
import { paintSkin, partRects } from '../game/skin';
import { useProfile } from '../profile/store';
import { useUi } from '../ui/store';
import { useSettings } from '../game/settings';
import { voiceKeyLabel } from '../game/voiceBind';
import { TokenPurse } from './TokenPurse';

/** Head and shoulders, in the round frame. With a `code`, it is somebody else's face; without one, it is yours. */
export function HeadShot({ code }: { code?: number }) {
  const look = useProfile((s) => s.look);
  const outfit = useProfile((s) => s.outfit);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const palette = code === undefined ? paletteOfLook(look, outfit) : paletteOfCode(code);
    const skin = paintSkin(lookOf(palette));
    const out = new ImageData(16, 12);
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
    const small = document.createElement('canvas');
    small.width = 16;
    small.height = 12;
    small.getContext('2d')!.putImageData(out, 0, 0);
    const g = canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, canvas.width, canvas.height);
    const px = canvas.width / 13.7;
    const w = 16 * px;
    g.drawImage(small, (canvas.width - w) / 2, canvas.height * 0.1, w, 12 * px);
  }, [code, look, outfit]);
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

/** A voxel picture with a clear background. Every icon is the same 9×9 cell, drawn at the same size. */
function Sprite({ rows, pal }: { rows: readonly string[]; pal: Record<string, [number, number, number]> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx || !rows.length) return;
    const w = rows[0].length;
    const h = rows.length;
    const img = new ImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const c = pal[rows[y]?.[x] ?? ' '];
        if (!c) continue;
        const o = (y * w + x) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  }, [rows, pal]);
  const w = rows[0]?.length ?? 9;
  return <canvas ref={ref} width={w} height={rows.length} aria-hidden />;
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

/** The microphone, on the portrait. The talk key does the same while you are playing. */
function VoiceMic() {
  const live = useUi((s) => s.voiceLive);
  const on = useUi((s) => s.voiceOn);
  const api = useUi((s) => s.api);
  const hear = useSettings();
  if (!live || !api) return null;
  const key = voiceKeyLabel(hear.voiceKey);
  const hold = hear.pushToTalk;
  return (
    <button
      id="voice-mic"
      className={on ? 'on' : ''}
      type="button"
      aria-label={hold ? `Hold ${key} to talk` : on ? 'Turn microphone off' : 'Turn microphone on'}
      title={hold ? `Hold ${key} to talk to players near you.` : on ? `Microphone on. Press ${key} to turn it off.` : `Press ${key} to talk to players near you.`}
      onClick={() => { if (!hold) api.toggleVoice(); }}
    >
      <svg viewBox="0 0 16 16" aria-hidden>
        <rect x="6" y="1" width="4" height="1" />
        <rect x="5" y="2" width="6" height="6" />
        <rect x="6" y="8" width="4" height="1" />
        <rect x="4" y="6" width="1" height="3" />
        <rect x="11" y="6" width="1" height="3" />
        <rect x="4" y="9" width="8" height="1" />
        <rect x="7" y="10" width="2" height="2" />
        <rect x="5" y="12" width="6" height="1" />
      </svg>
    </button>
  );
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
  const tone = kind.startsWith('health') ? 'health' : kind;
  return (
    <div id={id} className={`pf-bar ${kind}${tone === 'health' && f <= 0.3 ? ' low' : ''}`} title={title}>
      <i style={{ width: `${(f * 100).toFixed(1)}%` }} />
      <span>{label}</span>
    </div>
  );
}

/** The 9×9 pictures beside the bars: a full heart and a haunch, each filling the same cell. */
const HEART = [' RR RR   ', 'RwwRRRRR ', 'RwwRRRRR ', 'RRRRRRRd ', ' RRRRRd  ', '  RRRd   ', '   Rd    ', '         ', '         '];
const HEART_PAL: Record<string, [number, number, number]> = { w: [255, 255, 255], R: [255, 0, 0], d: [190, 0, 0] };
const MEAT = ['     mkMm', '   mmMMMm', '  mMMMMMm', ' mMMMMMbm', ' mMMMbb  ', '  mMbb   ', '   bb    ', '  b      ', '         '];
const MEAT_PAL: Record<string, [number, number, number]> = { m: [107, 58, 26], M: [176, 98, 42], k: [232, 176, 96], b: [240, 224, 196] };
/** A voxel mark beside a bar: the heart and the haunch. */
function StatMark({ kind }: { kind: 'health' | 'food' }) {
  if (kind === 'health') return <span className="pf-mark"><Sprite rows={HEART} pal={HEART_PAL} /></span>;
  return <span className="pf-mark"><Sprite rows={MEAT} pal={MEAT_PAL} /></span>;
}

/**
 * The character's frame in the top left: a round portrait with the level on its lower left, the name beside it
 * with the $SOLRIFT balance on that same line, then health and food, and status effects in a row beneath.
 */
export function PlayerFrame() {
  const mode = useUi((s) => s.mode);
  const health = useUi((s) => s.health);
  const hunger = useUi((s) => s.hunger);
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
    const x = Math.round(r.left + 8);
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
          <HeadShot />
        </div>
        {survival && <div className="pf-level" title="Character level">{level}</div>}
        <VoiceMic />
      </div>
      <div className="pf-side" ref={sideRef}>
        <div className="pf-plate">
          <div className="pf-name">
            <b>{name || 'Adventurer'}</b>
            <TokenPurse where="frame" />
          </div>
          {survival && (
            <div id="vitals" className="pf-bars">
              <div id={hardcore ? 'hardcore-hearts' : undefined} className="pf-stat" title={`Health ${Math.ceil(health)} / ${maxHealth}${hardcore ? ' (hardcore)' : ''}`}>
                <StatMark kind="health" />
                <Bar kind={hardcore ? 'health hardcore' : 'health'} value={health} max={maxHealth} label={`${Math.ceil(health)} / ${maxHealth}`} title={`Health ${Math.ceil(health)} / ${maxHealth}${hardcore ? ' (hardcore)' : ''}`} />
              </div>
              <div className="pf-stat" title={`Food ${Math.ceil(hunger)} / 20`}>
                <StatMark kind="food" />
                <Bar kind="food" value={hunger} max={20} label={`${Math.ceil(hunger)} / 20`} title={`Food ${Math.ceil(hunger)} / 20`} />
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
