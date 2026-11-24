'use client';

import { useEffect, useRef } from 'react';
import type { BossView } from '@solrift/shared';
import { useUi } from '../ui/store';

/** What the loading screen draws of the boss's frame (see `warmHud` in the store): every part of it, so that all of its painting is built once. */
const WARM_BOSS: BossView = { name: 'King Aurelion', level: 60, hp: 0.62, health: 6200, max: 10000, phase: 2, marks: [0.7, 0.4], cast: { name: 'Judgement', t: 0.4, seconds: 3 }, shield: 1, enraged: 1, adds: 2 };

/** The Hollow King's face in pixel art, 16 x 16: a crown of gold spikes over a skull whose sockets burn. */
const SKULL = [
  '..g..g.GG.g..g..',
  '..gg.gggggg.gg..',
  '..gggGggggGggg..',
  '..gggggggggggg..',
  '....bbbbbbbb....',
  '...bbbbbbbbbb...',
  '...bkkkbbkkkb...',
  '...bkekbbkekb...',
  '...bkkkbbkkkb...',
  '...bbbbkkbbbb...',
  '....bbbkkbbb....',
  '....bbbbbbbb....',
  '....bkbkbkbb....',
  '.....bBbBbB.....',
  '......BBBB......',
  '................',
];
const PALETTE: Record<string, [number, number, number]> = {
  g: [198, 142, 44],
  G: [255, 222, 112],
  b: [222, 214, 190],
  B: [160, 150, 128],
  k: [20, 8, 6],
  e: [255, 140, 40],
};

function SkullPortrait() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const small = document.createElement('canvas');
    small.width = small.height = 16;
    const img = new ImageData(16, 16);
    SKULL.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const c = PALETTE[ch];
        if (!c) return;
        const o = (y * 16 + x) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }),
    );
    small.getContext('2d')!.putImageData(img, 0, 0);
    const g = canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(small, 0, 0, canvas.width, canvas.height);
  }, []);
  return <canvas ref={ref} width={96} height={96} />;
}

/**
 * The boss's own frame, across the top of the screen: a portrait with its level, its name, a health bar with a tick
 * where each phase begins, what it carries (a ward from its court, its rage) and, under it, the spell it is gathering with
 * the time left to stop it or to get out of the way.
 */
export function BossFrame() {
  const warm = useUi((s) => s.warmHud);
  const boss = useUi((s) => s.boss) ?? (warm ? WARM_BOSS : null);
  const screen = useUi((s) => s.screen);
  const spectating = useUi((s) => s.spectating);
  if (!boss || (!warm && (spectating || (screen !== 'none' && screen !== 'dead')))) return null;
  const pct = Math.round(boss.hp * 100);
  const left = boss.cast ? Math.max(0, boss.cast.seconds * (1 - boss.cast.t)) : 0;
  return (
    <div id="boss-frame" data-testid="boss-frame" className={`${boss.enraged ? 'enraged' : ''} ${boss.shield ? 'warded' : ''}`}>
      <div className="bf-portrait-wrap">
        <div className="bf-portrait">
          <SkullPortrait />
        </div>
        <span className="bf-level" title="Boss level">
          {boss.level}
        </span>
      </div>
      <div className="bf-side">
        <div className="bf-plate">
          <div className="bf-name">
            <b>{boss.name}</b>
            <small>Boss · Phase {boss.phase}</small>
          </div>
          <div className="bf-hp" data-testid="boss-hp">
            <div className="bf-hp-fill" style={{ width: `${pct}%` }} />
            {boss.marks.map((m, i) => (
              <i key={i} className="bf-mark" style={{ left: `${m * 100}%` }} />
            ))}
            <span className="bf-hp-text">
              {boss.health} / {boss.max} · {pct}%
            </span>
          </div>
          <div className="bf-status">
            {boss.shield ? (
              <span className="bf-buff ward" title="His court shields him: most of what hits him is undone while any of them stands.">
                Warded
              </span>
            ) : null}
            {boss.enraged ? (
              <span className="bf-buff rage" title="Enraged: he hits harder and moves faster.">
                Enraged
              </span>
            ) : null}
            {boss.adds > 0 ? (
              <span className="bf-buff court" title="Helpers he has called.">
                Court x{boss.adds}
              </span>
            ) : null}
          </div>
          {boss.cast ? (
            <div className="bf-cast" data-testid="boss-cast">
              <div className="bf-cast-fill" style={{ width: `${Math.round(boss.cast.t * 100)}%` }} />
              <span className="bf-cast-name">{boss.cast.name}</span>
              <em className="bf-cast-time">{left.toFixed(1)}s</em>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** What the boss says, or the raid warning, across the screen under the frame. Each new line restarts the animation. */
export function BossBanner() {
  const warm = useUi((s) => s.warmHud);
  const line = useUi((s) => s.bossLine) ?? (warm ? { text: 'You will kneel.', kind: 'yell' as const, stamp: 0 } : null);
  const boss = useUi((s) => s.boss);
  if (!line) return null;
  return (
    <div id="boss-banner" key={line.stamp} className={line.kind} data-testid="boss-banner" style={{ top: boss ? 128 : 96 }}>
      {line.kind === 'yell' ? <small>The Hollow King yells</small> : null}
      <span style={line.color ? { color: line.color } : undefined}>{line.text}</span>
    </div>
  );
}
