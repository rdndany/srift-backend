import type { WorldAccess } from './headlessWorld';
import { Player } from './player';
import { Realm, type RealmOptions } from './realm';
import type { SaveMode, WorldState } from './save';
import type { ClassId } from './classes';
import type { InputFrame, SessionMessage } from './sessionProtocol';

export { CREATIVE_HOTBAR, DEATH_TEXT, REACH, STEP } from './player';

export interface SessionOptions extends RealmOptions {
  world: WorldAccess;
  mode?: SaveMode;
  /** One life on Hard difficulty (survival only). */
  hardcore?: boolean;
  /** The character's class (none: the unmodified game). */
  classId?: ClassId | null;
}

/**
 * Single-player: one realm with one player, driven frame by frame. Everything the game does lives
 * in `Realm` (shared world) and `Player` (one player's side); this class only decides the order of a
 * frame, like the original's pause (the world idles and the clock crawls unless the player is in
 * control or a menu is open).
 *
 * The server runs the same classes with many players (`GameRoom`).
 */
export class GameSession extends Player {
  constructor(opts: SessionOptions) {
    super(new Realm(opts), { mode: opts.mode, hardcore: opts.hardcore, classId: opts.classId });
  }

  receive(m: SessionMessage): void {
    if (m.t === 'frame') this.tick(m);
    else this.command(m);
  }

  /**
   * Advance the game by one frame of input. Queued commands run first. While the player is in
   * control (or a menu is open) the simulation steps; otherwise the world idles and the clock
   * crawls.
   */
  tick(f: InputFrame): void {
    this.runCommands();
    const dt = f.dt;
    this.beginFrame(f);

    const playing = f.locked && this.screen === 'none';
    const simulating = f.locked || this.screen !== 'none';

    if (this.ready && simulating) {
      this.advance(f);
      this.realm.update(dt, [this]);
      this.postRealm(dt);
    }
    if (this.ready && playing) this.updateInteraction(dt, f);

    this.realm.advanceClock(dt, simulating || !this.ready ? 1 : 0.2);
  }

  loadWorldState(w: WorldState, opts: { weather?: boolean } = {}): void {
    this.realm.loadState(w, opts);
  }

  saveWorldState(): WorldState {
    return this.realm.saveState();
  }
}
