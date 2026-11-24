import type { AdventureWorldGenerator } from './adventure';
import { I } from './items';
import type { Player } from './player';
import { FIRST_QUEST, type QuestDef } from './quests';

/**
 * Tests only. A new Adventure character wakes in the wilds with a compass and a quest to find Dawnwatch; the tests that
 * are about the city (its people, its quests, its safety) want them on the Landing of Dawnwatch with that quest handed in.
 */
export function startInVillage(s: Player, generator: AdventureWorldGenerator): void {
  const log = s.quests;
  if (log) {
    log.active.delete(FIRST_QUEST);
    log.done.add(FIRST_QUEST);
  }
  s.inventory.remove(I.COMPASS, 1);
  const land = generator.landingFor(0);
  s.teleport(land.x, land.y, land.z, 0, 0);
  s.syncQuests();
  s.drainEvents();
}

/** Tests only. Do what a quest asks, the way the game would tell the log (and carry what it asks to be collected). */
export function doObjectives(s: Player, q: QuestDef): void {
  for (const o of q.objectives) {
    switch (o.kind) {
      case 'collect':
        s.giveItem(o.items[0], o.count);
        break;
      case 'craft':
        s.questEvent({ t: 'craft', item: o.items[0], count: o.count });
        break;
      case 'smelt':
        s.questEvent({ t: 'smelt', item: o.items?.[0] ?? 1, count: o.count });
        break;
      case 'kill':
        for (let i = 0; i < o.count; i++) s.questEvent({ t: 'kill', mob: o.mobs[i % o.mobs.length] });
        break;
      case 'mine':
        for (let i = 0; i < o.count; i++) s.questEvent({ t: 'mine', block: o.blocks[0] });
        break;
      case 'place':
        for (let i = 0; i < o.count; i++) s.questEvent({ t: 'place', block: o.blocks[0] });
        break;
      case 'enter':
        s.questEvent({ t: 'enter', zone: o.zone });
        break;
    }
  }
}
