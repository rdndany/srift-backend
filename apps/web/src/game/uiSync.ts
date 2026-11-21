import type { SessionScreen } from '@solrift/shared';
import { HOTBAR_SLOTS, type ItemStack } from '@solrift/shared';
import { bumpUi, useUi } from '../ui/store';
import type { ClientSession } from './clientSession';
import type { Input } from './input';
import type { RecipeMemory } from './recipeMemory';

const stackHash = (h: number, s: ItemStack | null): number => (Math.imul(h, 31) + (s ? s.id * 1009 + s.count * 17 + s.damage + 1 : 0)) | 0;

/** One number for the stacks on the hotbar, in the off hand and on the body: it changes when any of them does. */
function gearSignature(session: ClientSession): number {
  let h = 7;
  for (let i = 0; i < HOTBAR_SLOTS; i++) h = stackHash(h, session.inventory.get(i));
  h = stackHash(h, session.offhand.get(0));
  for (let i = 0; i < session.armor.size; i++) h = stackHash(h, session.armor.get(i));
  return h;
}

/**
 * Makes the function that mirrors the session's state into the React store, and reacts to a change of screen. It writes
 * only what changed, so it can be called every frame.
 */
export function makeUiSync(session: ClientSession, input: Input, overlay: HTMLElement, recipes: RecipeMemory): () => void {
  let shownScreen: SessionScreen = 'none';
  let shownGear = 0;

  return function syncUi(): void {
    recipes.observe();
    // What the hotbar, the off hand and the clothes hold, looked at every frame: the screen is told to read them again whenever
    // they differ from what it last drew, so that no missed message (the first snapshot of a character, a save that was
    // loaded late) can leave it empty until a window is opened.
    const gear = gearSignature(session);
    if (gear !== shownGear) {
      shownGear = gear;
      bumpUi();
    }
    // The class state: published when something in it changed (a cooldown ticking, the resource moving), not every frame.
    const mv = session.mountView();
    const mshown = useUi.getState().mount;
    if (mv.mount !== mshown.mount || mv.pick !== mshown.pick || mv.cd[0] !== mshown.cd[0] || mv.cd[1] !== mshown.cd[1]) useUi.setState({ mount: mv });
    const cv = session.classView();
    const shown = useUi.getState().cls;
    if (cv ? !shown || JSON.stringify(cv) !== JSON.stringify(shown) : shown !== null) useUi.setState({ cls: cv });
    // The boss being fought (its health bar), published when something in it changed.
    const bv = session.bossView();
    const bshown = useUi.getState().boss;
    if (bv ? !bshown || JSON.stringify(bv) !== JSON.stringify(bshown) : bshown !== null) useUi.setState({ boss: bv });
    // How far the player is in the dungeon they are in (its tracker).
    const dv = session.dungeonView();
    const dshown = useUi.getState().dungeon;
    if (dv ? !dshown || JSON.stringify(dv) !== JSON.stringify(dshown) : dshown !== null) useUi.setState({ dungeon: dv });
    const health = Math.ceil(session.vitals.health);
    const hunger = Math.ceil(session.vitals.hunger);
    const air = Math.round(session.vitals.air * 2) / 2;
    const s = useUi.getState();
    // The bar is 182 px wide in the original, so finer steps are invisible.
    const xpProgress = Math.round(session.xp.progress * 182) / 182;
    const level = session.xp.level;
    const armor = session.defense;
    if (s.armor !== armor) useUi.setState({ armor });
    if (s.coins !== session.coins) useUi.setState({ coins: session.coins });
    if (s.burning !== session.burning) useUi.setState({ burning: session.burning });
    const poison = Math.ceil(session.poison);
    const foodSick = Math.ceil(session.foodSick);
    if (s.poison !== poison || s.foodSick !== foodSick) useUi.setState({ poison, foodSick });
    if (s.hardcore !== session.hardcore || s.spectating !== session.spectating) {
      useUi.setState({ hardcore: session.hardcore, spectating: session.spectating });
    }
    if (s.health !== health || s.hunger !== hunger || s.air !== air || s.mode !== session.mode || s.selected !== session.selected || s.level !== level || s.xpProgress !== xpProgress) {
      useUi.setState({ health, hunger, air, level, xpProgress, mode: session.mode, selected: session.selected });
    }
    if (session.screen !== shownScreen) {
      shownScreen = session.screen;
      useUi.setState({ screen: shownScreen });
      // Menus and the death screen need the mouse back.
      if (shownScreen !== 'none' && document.pointerLockElement) document.exitPointerLock();
      overlay.style.display = input.locked || shownScreen !== 'none' ? 'none' : 'flex';
    }
  };
}
