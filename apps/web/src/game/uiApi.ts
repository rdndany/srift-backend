import type { Command } from '@solrift/shared';
import { useUi, type UiApi } from '../ui/store';
import type { Chat } from './chat';
import type { ClientSession } from './clientSession';
import type { makeWindows } from './gameWindows';
import type { ItemIcons } from './icons';
import type { Input } from './input';
import type { RecipeMemory } from './recipeMemory';
import type { RemoteSession } from './remote';
import type { VoiceChat } from './voiceChat';
import { gamePath, titleAddress } from './route';
import { getSettings } from './settings';
import { saveBridge } from './saveBridge';
import type { LocalSaveStore } from './storage';

export interface UiApiParts {
  session: ClientSession;
  /** The game server's side of the session, when playing online. */
  remote: RemoteSession | null;
  input: Input;
  chat: Chat;
  icons: ItemIcons;
  store: LocalSaveStore;
  /** A guest's world is not kept, so there is nothing to delete. */
  guest: boolean;
  recipes: RecipeMemory;
  windows: ReturnType<typeof makeWindows>;
  /** Voice, when this is an online realm. */
  voice: VoiceChat | null;
  sendCommand(c: Command): void;
  openSpellbook(): void;
}

/** What the page's windows and buttons can ask of the game: nearly all of it is a command sent the same way a key press is. */
export function makeUiApi(parts: UiApiParts): UiApi {
  const { session, remote, input, chat, icons, store, guest, voice, sendCommand, openSpellbook } = parts;
  const { toggleCodex, toggleQuestLog, togglePartyWindow, toggleSocialWindow, openPlayerMenu, closePlayerMenu, closeSignEdit } = parts.windows;
  const recipeBook = parts.recipes.book;
  /** The latest microphone request. An older one (the key was let go while the browser was still asking) does not write over it. */
  let voiceReq = 0;

  return {
    inventory: session.inventory,
    bags: session.bags,
    offhand: session.offhand,
    mountSlot: session.mountSlot,
    outfitSlot: session.outfitSlot,
    companionSlot: session.companionSlot,
    wingSlot: session.wingSlot,
    accessories: session.accessories,
    icons,
    menu: () => session.menu,
    click: (slot, button) => sendCommand({ t: 'click', slot, button }),
    shift: (slot) => sendCommand({ t: 'shift', slot }),
    organize: () => sendCommand({ t: 'organize' }),
    chestAct: (a) => sendCommand({ t: 'chestAct', a }),
    dropCursor: (all) => sendCommand({ t: 'dropCursor', all }),
    destroyCursor: (all) => sendCommand({ t: 'destroyCursor', all }),
    recipeBook,
    recipesAll: () => session.mode === 'creative',
    fillRecipe: (index, all) => sendCommand({ t: 'recipe', index, all }),
    forge: (all) => sendCommand({ t: 'forge', all }),
    creativeAmount: (n) => sendCommand({ t: 'creativeAmount', n }),
    creativeClear: () => sendCommand({ t: 'creativeClear' }),
    creativeGear: (spec) => sendCommand({ t: 'creativeGear', spec }),
    trade: (index) => sendCommand({ t: 'trade', index }),
    enchant: (id, erase) => sendCommand({ t: 'enchant', id, ...(erase ? { erase: true } : {}) }),
    anvilName: (name) => sendCommand({ t: 'anvilName', name }),
    close() {
      sendCommand({ t: 'closeMenu' });
      input.lock();
    },
    questAction: (action, id) => sendCommand({ t: 'quest', a: action, id }),
    shop: (a, i, n) => sendCommand({ t: 'shop', a, i, n }),
    auction: (cmd) => sendCommand({ t: 'auction', ...cmd }),
    stash: (cmd) => sendCommand({ t: 'stash', ...cmd }),
    toggleQuestLog,
    toggleSocialWindow,
    toggleCodex,
    socialRefresh: () => remote?.socialRefresh(),
    socialAct: (action, name) => remote?.socialAct(action, name),
    inspect: (name) => remote?.inspect(name),
    guild: (line) => remote?.guild(line),
    tradeAct: (act) => remote?.trade(act),
    duelAct: (act) => remote?.duel(act),
    openPlayerMenu,
    closePlayerMenu,
    toggleVoice(want?: boolean, quiet = false) {
      if (!voice) return;
      const talk = voice;
      const next = want ?? !useUi.getState().voiceOn;
      if (want !== undefined && talk.on === next && useUi.getState().voiceOn === next) return;
      const was = talk.on;
      const mine = ++voiceReq;
      void talk.setOn(next, getSettings().micDevice).then((err) => {
        if (mine !== voiceReq) return;
        if (err) chat.add(err, 'notice');
        else if (!quiet && talk.on !== was) chat.add(talk.on ? 'Microphone on. People near you can hear you.' : 'Microphone off.', 'notice');
        useUi.setState({ voiceOn: talk.on });
      });
    },
    voiceMuted: (name) => useUi.getState().voiceMuted.includes(name.toLowerCase()),
    muteVoice(name) {
      const key = name.toLowerCase();
      const have = useUi.getState().voiceMuted;
      const voiceMuted = have.includes(key) ? have.filter((n) => n !== key) : [...have, key];
      useUi.setState({ voiceMuted });
      chat.add(voiceMuted.includes(key) ? `You no longer hear ${name}.` : `You can hear ${name} again.`, 'notice');
    },
    signDone: (lines) => closeSignEdit(lines),
    whisper: (name) => {
      toggleSocialWindow(false);
      chat.show(`/w ${name} `);
    },
    partyAction: (action, name) => sendCommand({ t: 'party', a: action, ...(name ? { name } : {}) }),
    togglePartyWindow,
    ability: (slot) => sendCommand({ t: 'ability', slot }),
    spendStat: (stat, n) => sendCommand({ t: 'stat', stat, n }),
    resetStats: () => sendCommand({ t: 'statReset' }),
    openSpellbook,
    respawn: () => sendCommand({ t: 'respawn' }),
    wake: () => sendCommand({ t: 'wake' }),
    deathMessage: () => session.deathMessage(),
    quitToTitle() {
      void saveBridge.flush?.().finally(() => location.assign(titleAddress(location.pathname)));
    },
    quitToCharacters() {
      void saveBridge.flush?.().finally(() => location.assign(gamePath()));
    },
    async deleteWorld() {
      saveBridge.freeze?.(); // nothing may write the world back while it is being removed
      try {
        if (!guest) await store.clear();
      } catch (err) {
        console.warn('delete failed', err);
      }
      location.assign(titleAddress(location.pathname));
    },
    furnaceState: () => session.furnaceState(),
  };
}
