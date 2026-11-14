import type { AdventureWorldGenerator } from './adventure';
import { I } from './items';
import type { Player } from './player';
import { FIRST_QUEST } from './quests';

/**
 * Tests only. A new Adventure character wakes in the wilds with a compass and a quest to find Dawnwatch; the tests that
 * are about the village (its people, its quests, its safety) want them on the Landing with that quest handed in.
 */
export function startInVillage(s: Player, generator: AdventureWorldGenerator): void {
  const log = s.quests;
  if (log) {
    log.active.delete(FIRST_QUEST);
    log.done.add(FIRST_QUEST);
  }
  s.inventory.remove(I.COMPASS, 1);
  const land = generator.spawnFor(0);
  s.teleport(land.x, land.y, land.z, 0, 0);
  s.syncQuests();
  s.drainEvents();
}
