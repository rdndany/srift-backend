import type { SessionScreen } from '@solrift/shared';
import { useUi } from '../ui/store';
import type { ClientSession } from './clientSession';
import type { Input } from './input';
import type { RecipeMemory } from './recipeMemory';

/**
 * Makes the function that mirrors the session's state into the React store, and reacts to a change of screen. It writes
 * only what changed, so it can be called every frame.
 */
export function makeUiSync(session: ClientSession, input: Input, overlay: HTMLElement, recipes: RecipeMemory): () => void {
  let shownScreen: SessionScreen = 'none';

  return function syncUi(): void {
    recipes.observe();
    // The class state: published when something in it changed (a cooldown ticking, the resource moving), not every frame.
    const mv = session.mountView();
    const mshown = useUi.getState().mount;
    if (mv.mount !== mshown.mount || mv.pick !== mshown.pick || mv.cd[0] !== mshown.cd[0] || mv.cd[1] !== mshown.cd[1]) useUi.setState({ mount: mv });
    const cv = session.classView();
    const shown = useUi.getState().cls;
    if (cv ? !shown || JSON.stringify(cv) !== JSON.stringify(shown) : shown !== null) useUi.setState({ cls: cv });
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
