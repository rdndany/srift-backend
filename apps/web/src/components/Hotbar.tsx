'use client';

import { HOTBAR_SLOTS } from '@solrift/shared';
import { useUi } from '../ui/store';
import { AbilityBar } from './ClassUI';
import { MountBar } from './MountUI';
import { ItemView } from './ItemView';

export function Hotbar() {
  const api = useUi((s) => s.api);
  const selected = useUi((s) => s.selected);
  useUi((s) => s.version);
  if (!api) return null;
  const off = api.offhand.get(0);
  return (
    <div id="hotbar">
      {off && (
        <div className="slot off-hotbar" title="Off hand (F swaps)">
          <ItemView stack={off} />
        </div>
      )}
      {Array.from({ length: HOTBAR_SLOTS }, (_, i) => (
        <div key={i} className={`slot${i === selected ? ' selected' : ''}`}>
          <ItemView stack={api.inventory.get(i)} />
          <em>{i + 1}</em>
        </div>
      ))}
      <AbilityBar />
      <MountBar />
    </div>
  );
}
