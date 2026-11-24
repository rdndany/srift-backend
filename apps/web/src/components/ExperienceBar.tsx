'use client';

import { MAX_LEVEL, xpToNext } from '@solrift/shared';
import { useUi } from '../ui/store';

/** The green experience bar above the hotbar, labelled with the points toward the next level. Hidden in creative mode. */
export function ExperienceBar() {
  const mode = useUi((s) => s.mode);
  const level = useUi((s) => s.level);
  const progress = useUi((s) => s.xpProgress);
  if (mode === 'creative') return null;
  const need = xpToNext(level);
  const xp = level >= MAX_LEVEL ? `next bottle ${Math.round(progress * 100)}%` : `${Math.round(progress * need)} / ${need} XP`;
  return (
    <div id="xp" data-level={level} data-progress={progress.toFixed(3)} data-max={level >= MAX_LEVEL ? '1' : undefined}>
      <div id="xp-bar">
        <div id="xp-track">
          <div id="xp-fill" style={{ width: `${(progress * 100).toFixed(2)}%` }} />
        </div>
        <span id="xp-label">{xp}</span>
      </div>
    </div>
  );
}