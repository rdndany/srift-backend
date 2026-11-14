'use client';

import { getItem, jewelKind, makeStack, skillBookAbility, tooltipName } from '@solrift/shared';
import { useUi, type PickupNote } from '../ui/store';
import { ItemView } from './ItemView';

/** The colour class of a line: enchanted things and enchanted books in blue, skill books in purple. */
function tone(n: PickupNote): string {
  if (skillBookAbility(n.id)) return 'book';
  if (jewelKind(n.id) || (n.gear && n.gear.r === 0)) return 'jewel';
  if (n.gear) return ['', 'uncommon', 'rare-gear', 'epic'][n.gear.r] ?? 'plain';
  if (getItem(n.id).storesEnchants || (n.ench && n.ench.length > 0)) return 'rare';
  return 'plain';
}

/**
 * What you pick up off the ground, listed above the hotbar on the right: the icon, "+3 Oak Planks" and how many you
 * now carry. Picking up more of the same adds to its line; the lines slide in and fade out by themselves.
 */
export function PickupFeed() {
  const pickups = useUi((s) => s.pickups);
  const screen = useUi((s) => s.screen);
  const spectating = useUi((s) => s.spectating);
  if (pickups.length === 0 || spectating || (screen !== 'none' && screen !== 'dead')) return null;
  return (
    <div id="pickup-feed" data-testid="pickup-feed">
      {pickups.map((n) => {
        const stack = makeStack(n.id, 1, 0, n.ench);
        if (n.name) stack.name = n.name;
        if (n.gear) stack.gear = n.gear;
        return (
          <div key={n.key} className={`pickup-row ${tone(n)}`} data-testid="pickup-row">
            <div key={n.stamp} className="pickup-fade">
              <div className="pickup-icon">
                <ItemView stack={stack} />
              </div>
              <span className="pickup-name">{tooltipName(stack)}</span>
              <b className="pickup-count" key={n.count}>
                +{n.count}
              </b>
              <span className="pickup-total" title="In your bags">({n.total})</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
