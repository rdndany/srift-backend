'use client';

import { CLASSES, MAX_LEVEL, xpToNext } from '@solrift/shared';
import { useUi } from '../ui/store';

/** The green experience bar above the hotbar, labelled with the character's level and points. Hidden in creative mode. */
export function ExperienceBar() {
  const mode = useUi((s) => s.mode);
  const level = useUi((s) => s.level);
  const progress = useUi((s) => s.xpProgress);
  const cls = useUi((s) => s.cls);
  if (mode === 'creative') return null;
  const need = xpToNext(level);
  return (
    <div id="xp" data-level={level} data-progress={progress.toFixed(3)} data-max={level >= MAX_LEVEL ? '1' : undefined}>
      <div id="xp-bar">
        <div id="xp-track">
          <div id="xp-fill" style={{ width: `${(progress * 100).toFixed(2)}%` }} />
        </div>
        <span id="xp-label">
          {`${cls ? `${CLASSES[cls.id].name} \u00b7 ` : ''}Level ${level} \u00b7 ${level >= MAX_LEVEL ? `MAX \u00b7 next bottle ${Math.round(progress * 100)}%` : `${Math.round(progress * need)} / ${need} XP`}`}
        </span>
      </div>
    </div>
  );
}