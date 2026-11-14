'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { CLASSES } from '@solrift/shared';
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
 * with the level on it, the name and class, and bars for health, food and armor.
 */
export function PlayerFrame() {
  const mode = useUi((s) => s.mode);
  const health = useUi((s) => s.health);
  const hunger = useUi((s) => s.hunger);
  const armor = useUi((s) => s.armor);
  const level = useUi((s) => s.level);
  const hardcore = useUi((s) => s.hardcore);
  const cls = useUi((s) => s.cls);
  const spectating = useUi((s) => s.spectating);
  const name = useProfile((s) => s.name);
  if (spectating) return null;
  const def = cls ? CLASSES[cls.id] : null;
  const maxHealth = cls?.maxHealth ?? 20;
  const survival = mode !== 'creative';
  return (
    <div id="player-frame" data-testid="player-frame" style={{ '--cls': def?.color ?? '#d6aa46' } as CSSProperties}>
      <div className="pf-portrait-wrap">
        <div className="pf-portrait">
          <Portrait />
        </div>
        {survival && <div className="pf-level" title="Character level">{level}</div>}
      </div>
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
    </div>
  );
}
