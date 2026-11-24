import type { Command } from '@solrift/shared';
import { useUi } from '../ui/store';
import type { AdminBar } from './adminBar';
import type { GameAudio } from './audio';
import type { ChaseCamera } from './chaseCamera';
import type { Chat } from './chat';
import type { ClientSession } from './clientSession';
import type { makeWindows } from './gameWindows';
import type { Hud } from './hud';
import type { Input } from './input';
import { FX_KEYS } from './postfx';
import type { RemoteSession } from './remote';
import { DEFAULT_SETTINGS, getSettings, setSettings } from './settings';
import type { SelfView } from './selfView';
import type { World } from './world';

/** Keys of the four ability buttons, in order. */
const ABILITY_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyG'] as const;
/** How far the open map can be zoomed with the wheel. */
const MAP_ZOOMS = [1, 2, 4];

export interface KeyParts {
  session: ClientSession;
  /** The game server's side of the session, when playing online. */
  remote: RemoteSession | null;
  online: boolean;
  input: Input;
  world: World;
  hud: Hud;
  admin: AdminBar;
  chat: Chat;
  audio: GameAudio;
  selfView: SelfView;
  chase: ChaseCamera;
  /** How far the automatic quality has stepped down (0 = not at all). */
  quality(): number;
  windows: ReturnType<typeof makeWindows>;
  sendCommand(c: Command): void;
  openSpellbook(): void;
  /** The land (see landClient.ts): E closes a shape marked with the Surveyor, B opens the window of the player's lands. */
  land?: { key(code: string): boolean };
}

/** Keys that start something (as opposed to held keys, which go in the frame). */
export class KeyActions {
  /** Running: W tapped twice, for as long as it is then held. */
  sprinting = false;
  /** The talk key was down last frame, so a hold opens the microphone once and a release closes it once. */
  private voiceHeld = false;
  private lastSpace = -1;
  private lastW = -1;

  constructor(private readonly parts: KeyParts) {}

  /** Called once a frame while the player has the mouse and no window is open. */
  handle(): void {
    const { session, remote, online, input, world, hud, admin, chat, selfView, chase, quality, sendCommand, openSpellbook } = this.parts;
    const { toggleCodex, toggleQuestLog, togglePartyWindow, toggleSocialWindow, openPlayerMenu } = this.parts.windows;
    for (let i = 0; i < 9; i++) if (input.wasPressed(`Digit${i + 1}`)) sendCommand({ t: 'select', slot: i });
    const w = input.consumeWheel();
    if (w !== 0) {
      // With the map held up the wheel zooms it (scrolling down shows more land) instead of changing what you hold.
      if (useUi.getState().mapUp) {
        const at = MAP_ZOOMS.indexOf(useUi.getState().mapZoom);
        useUi.setState({ mapZoom: MAP_ZOOMS[Math.max(0, Math.min(MAP_ZOOMS.length - 1, at - Math.sign(w)))] });
      } else sendCommand({ t: 'scroll', delta: w });
    }
    if (input.wasPressed('F3')) hud.debugVisible = !hud.debugVisible;
    if (input.wasPressed('F2')) {
      admin.visible = !admin.visible;
      try {
        localStorage.setItem('solrift-admin', admin.visible ? 'on' : 'off');
      } catch {
        // (a private window may not keep it)
      }
    }
    if (online && input.wasPressed('KeyT')) chat.show('');
    if (online) {
      const hear = getSettings();
      if (hear.pushToTalk) {
        input.wasPressed(hear.voiceKey);
        const held = input.isDown(hear.voiceKey);
        if (held !== this.voiceHeld) {
          this.voiceHeld = held;
          useUi.getState().api?.toggleVoice(held, true);
        }
      } else if (input.wasPressed(hear.voiceKey)) useUi.getState().api?.toggleVoice();
    }
    if (input.wasPressed('Slash')) chat.show('/');
    if (input.wasPressed('F5') || input.wasPressed('KeyV')) {
      selfView.cycle();
      chase.reset(); // the camera starts in its place, not swinging in from where it was
    }
    for (const fx of FX_KEYS) {
      if (!input.wasPressed(fx.key)) continue;
      // (the settings are the source of truth: they apply it to the picture, and the menu's switches follow the key)
      const on = !getSettings()[fx.flag];
      setSettings({ [fx.flag]: on });
      hud.toast(`${fx.name} ${on ? 'on' : 'off'}${on && quality() >= 1 ? ' (paused while the frame rate is low)' : ''}`);
    }
    // (the settings are the source of truth, so the pause screen's sliders follow these keys)
    if (input.wasPressed('KeyM')) setSettings({ music: getSettings().music > 0 ? 0 : DEFAULT_SETTINGS.music });
    if (input.wasPressed('F4')) sendCommand({ t: 'mode', mode: session.mode === 'survival' ? 'creative' : 'survival' });
    if (input.wasPressed('KeyF')) sendCommand({ t: 'swap' });
    if (input.wasPressed('KeyH')) sendCommand({ t: 'mount' });
    if (input.wasPressed('KeyR')) sendCommand({ t: 'home' });
    if (input.wasPressed('BracketRight')) setSettings({ renderDistance: Math.min(16, world.renderDistance + 1) });
    if (input.wasPressed('BracketLeft')) setSettings({ renderDistance: Math.max(3, world.renderDistance - 1) });

    if (input.wasPressed('KeyB')) {
      if (this.parts.land?.key('KeyB')) return;
      if (useUi.getState().codex) {
        toggleCodex(true);
        return;
      }
    }
    if (input.wasPressed('KeyL') && useUi.getState().adventure) {
      toggleQuestLog(true);
      return;
    }
    if (online && input.wasPressed('KeyO')) {
      toggleSocialWindow(true);
      return;
    }
    // The menu of the player in the target frame (whisper, trade, invite...).
    if (online && input.wasPressed('KeyU')) {
      const t = useUi.getState().target;
      if (t) openPlayerMenu(t.name, 40, 190);
      else chat.add('Look at a player, then press U for their menu.', 'notice');
      return;
    }
    // A request to trade is answered with Y or N (a party invitation takes them first), without leaving the game.
    if (online && useUi.getState().tradeAsk && !useUi.getState().partyInvite) {
      if (input.wasPressed('KeyY')) remote?.trade({ a: 'accept' });
      else if (input.wasPressed('KeyN')) remote?.trade({ a: 'decline' });
    } else if (online && useUi.getState().duelAsk && !useUi.getState().partyInvite) {
      if (input.wasPressed('KeyY')) remote?.duel({ a: 'accept' });
      else if (input.wasPressed('KeyN')) remote?.duel({ a: 'decline' });
    }
    if (online && useUi.getState().adventure) {
      if (input.wasPressed('KeyP')) {
        togglePartyWindow(true);
        return;
      }
      // An invitation is answered with Y or N, without leaving the game.
      if (useUi.getState().partyInvite) {
        if (input.wasPressed('KeyY')) sendCommand({ t: 'party', a: 'accept' });
        else if (input.wasPressed('KeyN')) sendCommand({ t: 'party', a: 'decline' });
      }
    }
    if (input.wasPressed('KeyE')) {
      if (this.parts.land?.key('KeyE')) return;
      sendCommand({ t: 'inventory' });
      return;
    }
    if (input.wasPressed('KeyQ')) sendCommand({ t: 'drop', all: input.isDown('ControlLeft') });
    // The ability bar (Z X C G: V, R, F, Q and E are taken). A character without a class has none.
    if (session.classView()) {
      ABILITY_KEYS.forEach((code, slot) => {
        if (input.wasPressed(code)) sendCommand({ t: 'ability', slot });
      });
      if (input.wasPressed('KeyK')) openSpellbook();
    }

    const t = performance.now();
    if (input.wasPressed('Space')) {
      if (t - this.lastSpace < 300) sendCommand({ t: 'fly' });
      this.lastSpace = t;
    }
    if (input.wasPressed('KeyW')) {
      if (t - this.lastW < 300) this.sprinting = true;
      this.lastW = t;
    }
    if (!input.isDown('KeyW')) this.sprinting = false;
  }
}
