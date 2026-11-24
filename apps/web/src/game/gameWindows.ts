import type { Command, TradeView } from '@solrift/shared';
import { useUi } from '../ui/store';
import type { Chat } from './chat';
import type { ClientSession } from './clientSession';
import type { Input } from './input';
import type { RemoteSession } from './remote';

export interface WindowParts {
  session: ClientSession;
  /** The server's side of the session, when the game is played online. */
  remote: RemoteSession | null;
  online: boolean;
  input: Input;
  chat: Chat;
  /** The pause screen: shown when the browser will not hand the mouse back. */
  overlay: HTMLElement;
  sendCommand(c: Command): void;
}

/**
 * The windows that lie over the game and take the mouse while they are open: the quest log (L), the party (P), the social
 * window (O), the table of a trade, the menu of a player and a look at a player. They are React components fed from the
 * store (see ui/store.ts); what is here opens and closes them and says who has the mouse.
 */
export function makeWindows(parts: WindowParts) {
  const { session, remote, online, input, chat, overlay, sendCommand } = parts;

  /** The quest log window (key L): a page over the game, so the mouse comes back while it is open. */
  function toggleQuestLog(open?: boolean): void {
    const s = useUi.getState();
    if (!s.adventure) return;
    const next = open ?? !s.questLogOpen;
    if (next === s.questLogOpen) return;
    useUi.setState({ questLogOpen: next });
    if (next) {
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (session.screen === 'none') input.lock();
  }
  /** The Codex of the World Beyond (key B): the biomes, places and caverns found so far. */
  function toggleCodex(open?: boolean): void {
    const s = useUi.getState();
    if (!s.codex) return;
    const next = open ?? !s.codexOpen;
    if (next === s.codexOpen) return;
    useUi.setState({ codexOpen: next });
    input.wasPressed('KeyB'); // (a press made while it was open is not a second one)
    if (next) {
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (session.screen === 'none') input.lock();
  }
  /** The party window (key P): like the quest log, a page over the game with the mouse back. */
  function togglePartyWindow(open?: boolean): void {
    const s = useUi.getState();
    if (!s.adventure || !online) return;
    const next = open ?? !s.partyOpen;
    if (next === s.partyOpen) return;
    useUi.setState({ partyOpen: next });
    if (next) {
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (session.screen === 'none') input.lock();
  }
  /** The social window (key O), for any online game: friends, the people ignored, who is here. It asks the server for its lists while it is open. */
  function toggleSocialWindow(open?: boolean): void {
    const s = useUi.getState();
    if (!online) return;
    const next = open ?? !s.socialOpen;
    if (next === s.socialOpen) return;
    useUi.setState({ socialOpen: next, ...(next ? {} : { inspect: null }) });
    if (next) {
      remote?.socialRefresh();
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (session.screen === 'none') input.lock();
  }
  /** Is a window up that needs the mouse (the quest log, party, social, trade, a player's menu, a look at a player)? */
  function mouseWindowOpen(): boolean {
    const s = useUi.getState();
    return s.codexOpen || s.questLogOpen || s.partyOpen || s.socialOpen || !!s.trade || !!s.playerMenu || !!s.inspect || !!s.signEdit || s.land.confirm || s.land.manage;
  }
  /** Back to the game after a window closed, when nothing else needs the mouse. */
  function relockIfFree(): void {
    if (session.screen !== 'none' || mouseWindowOpen() || chat.isOpen) return;
    void input.lock().then((ok) => {
      if (!ok && !input.locked && !mouseWindowOpen()) overlay.style.display = 'flex'; // refused (no gesture): the pause screen
    });
  }
  /** The table of a trade opens (the mouse comes back), changes, or closes. */
  function showTrade(view: TradeView | null): void {
    const was = !!useUi.getState().trade;
    if (view && !was) {
      // Whatever else was up makes way for the table.
      useUi.setState({ trade: view, tradeAsk: null, socialOpen: false, partyOpen: false, questLogOpen: false, playerMenu: null, inspect: null });
      if (session.screen !== 'none') sendCommand({ t: 'closeMenu' });
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      useUi.setState({ trade: view });
      if (!view && was) relockIfFree();
    }
  }
  /** The menu of a player (whisper, trade, invite...): opened from the target frame (U) or from a name in a window. */
  function openPlayerMenu(name: string, x: number, y: number): void {
    if (!online || !remote) return;
    remote.socialRefresh(); // so it knows who is a friend or ignored
    useUi.setState({ playerMenu: { name, x, y } });
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function closePlayerMenu(relock = true): void {
    useUi.setState({ playerMenu: null });
    if (relock) relockIfFree();
  }

  /** The writing of a sign: the editor opens over the game with the mouse back. */
  function openSignEdit(x: number, y: number, z: number, lines: string[]): void {
    useUi.setState({ signEdit: { x, y, z, lines: [...lines] } });
    if (document.pointerLockElement) document.exitPointerLock();
  }
  /** The editor closes: with lines they are sent for the sign; with null it stays as it was. */
  function closeSignEdit(lines: string[] | null): void {
    const e = useUi.getState().signEdit;
    if (!e) return;
    useUi.setState({ signEdit: null });
    if (lines) sendCommand({ t: 'sign', x: e.x, y: e.y, z: e.z, lines });
    relockIfFree();
  }

  /** A key pressed while one of them is open closes it, or is left alone: true when one is open (the key is then nobody else's). */
  function handleKey(e: KeyboardEvent): boolean {
    // The board of a sign: Escape leaves it as it was (the editor's own fields take the typing, Enter included).
    if (useUi.getState().signEdit) {
      if (e.code === 'Escape') {
        e.preventDefault();
        closeSignEdit(null);
      }
      return true;
    }
    // The table of a trade: Escape calls it off.
    if (useUi.getState().trade) {
      if (e.code === 'Escape') {
        e.preventDefault();
        remote?.trade({ a: 'cancel' });
      }
      return true;
    }
    // A player's menu closes with Escape; so does a look at a player that was opened from it.
    if (useUi.getState().playerMenu) {
      if (e.code === 'Escape') {
        e.preventDefault();
        closePlayerMenu();
      }
      return true;
    }
    if (useUi.getState().inspect && !useUi.getState().socialOpen) {
      if (e.code === 'Escape') {
        e.preventDefault();
        useUi.setState({ inspect: null });
        relockIfFree();
      }
      return true;
    }
    // The Codex closes with B, E or Escape.
    if (useUi.getState().codexOpen) {
      if (e.code === 'KeyB' || e.code === 'KeyE' || e.code === 'Escape') {
        e.preventDefault();
        toggleCodex(false);
      }
      return true;
    }
    // The quest log closes with L, E or Escape.
    if (useUi.getState().questLogOpen) {
      if (e.code === 'KeyL' || e.code === 'KeyE' || e.code === 'Escape') {
        e.preventDefault();
        toggleQuestLog(false);
      }
      return true;
    }
    // The social window closes with O (unless typing a name) or Escape; Escape closes a look at a player first.
    if (useUi.getState().socialOpen) {
      const typing = (e.target as HTMLElement | null)?.tagName === 'INPUT';
      if (e.code === 'Escape' || (e.code === 'KeyO' && !typing)) {
        e.preventDefault();
        if (e.code === 'Escape' && useUi.getState().inspect) useUi.setState({ inspect: null });
        else toggleSocialWindow(false);
      }
      return true;
    }
    // The party window closes with P (unless typing a name) or Escape.
    if (useUi.getState().partyOpen) {
      const typing = (e.target as HTMLElement | null)?.tagName === 'INPUT';
      if (e.code === 'Escape' || (e.code === 'KeyP' && !typing)) {
        e.preventDefault();
        togglePartyWindow(false);
      }
      return true;
    }
    return false;
  }

  return { toggleCodex, toggleQuestLog, togglePartyWindow, toggleSocialWindow, mouseWindowOpen, relockIfFree, showTrade, openPlayerMenu, closePlayerMenu, openSignEdit, closeSignEdit, handleKey };
}
