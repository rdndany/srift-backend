import type * as THREE from 'three';
import { BLOCKS, ENCHANTS, I, RIFT_GRADE_DEFS, abilitiesOf, getItem, type SessionEvent } from '@solrift/shared';
import { bumpUi, pushPickup, pushQuestNote, setParty, setQuests, showBossLine, showZone, useUi } from '../ui/store';
import type { AbilityFx } from './abilityFx';
import type { GameAudio } from './audio';
import type { ClientSession } from './clientSession';
import type { DamageNumbers } from './damageNumbers';
import type { EmberFx } from './emberFx';
import type { HeldItem } from './heldItem';
import type { Hud } from './hud';
import type { Input } from './input';
import { mountLook } from './mountFx';
import { showLevelBanner, type LevelUpFx } from './levelUpFx';
import type { Particles } from './particles';
import type { PlayerRenderer } from './playerRenderer';
import { saveBridge } from './saveBridge';
import type { SelfView } from './selfView';
import type { ViewFeel } from './viewFeel';

export interface EventParts {
  session: ClientSession;
  input: Input;
  camera: THREE.PerspectiveCamera;
  hud: Hud;
  audio: GameAudio;
  particles: Particles;
  damageNumbers: DamageNumbers;
  hand: HeldItem;
  selfView: SelfView;
  players: PlayerRenderer;
  feel: ViewFeel;
  abilityFx: AbilityFx;
  /** The Emberstone's effects, and the same in a mount's colours. */
  emberFx: EmberFx;
  mountFx: EmberFx;
  levelFx: LevelUpFx;
  /** Which ear a sound at a point is heard in (-1 left .. 1 right). */
  panOf(x: number, z: number): number;
  /** Dust under a foot that stepped or landed. */
  footDust(kind: string, action: string, x: number, y: number, z: number, vol: number): void;
  /** The red flash of being hurt. */
  hurtFlash(): void;
  /** Where the rest of the party is, for the map. */
  setPartyPins(party: { name: string; x: number; z: number }[]): void;
  /** Your own body falls apart where it stood. */
  breakSelf(): void;
  /** The boss of this copy has fallen (where he stood): a hook for whatever follows the fight (the way out, say). Optional. */
  bossDown?(x?: number, y?: number, z?: number): void;
}

/**
 * What the client shows and plays for each thing the game says has happened (a `SessionEvent`): sounds, particles, numbers,
 * the hand's and the view's reactions, the windows that follow the game. The game itself has already happened: nothing here
 * changes it.
 */
export function makeEventHandler(parts: EventParts): (events: SessionEvent[]) => void {
  const { session, input, camera, hud, audio, particles, damageNumbers, hand, selfView, players, feel, abilityFx, emberFx, mountFx, levelFx, panOf, footDust, breakSelf } = parts;
  const body = session.body;

  return function handleEvents(events: SessionEvent[]): void {
    for (const e of events) {
      switch (e.t) {
        case 'inv':
          bumpUi();
          break;
        case 'toast':
          hud.toast(e.text);
          break;
        case 'boss':
          showBossLine(e.text, e.kind);
          // His yells are heard as well as read: a deep torn voice, wherever he is in the copy.
          if (e.kind === 'yell') audio.bossYell(e.text);
          break;
        case 'rift':
          // Across the screen like a raid warning (in the colour of its grade), with a sound of its own.
          showBossLine(e.text, 'warn', RIFT_GRADE_DEFS[e.grade].color);
          audio.rift(e.what, e.grade);
          break;
        case 'invasion':
          // Across the screen in gold, like a raid warning, with a sound of its own.
          showBossLine(e.text, 'warn', '#ffd24a');
          audio.invasion(e.what);
          break;
        case 'bossFx': {
          // The sound of the fight: how loud and how dull it is follows how far the king is (a roar or his fall is heard in all of the copy).
          // It has no place when it comes without one: the room, then.
          const has = e.x !== undefined && e.y !== undefined && e.z !== undefined;
          const dist = has ? Math.hypot(e.x! - camera.position.x, e.y! - camera.position.y, e.z! - camera.position.z) : 0;
          audio.bossFx(e, dist, has ? panOf(e.x!, e.z!) : 0);
          if (e.what === 'down') parts.bossDown?.(e.x, e.y, e.z);
          break;
        }
        case 'sound':
          audio.play(e.sound, e.action, e.vol, e.x !== undefined && e.z !== undefined ? panOf(e.x, e.z) : 0);
          if ((e.action === 'step' || e.action === 'land') && e.x !== undefined && e.y !== undefined && e.z !== undefined) footDust(e.sound, e.action, e.x, e.y, e.z, e.vol);
          break;
        case 'chest':
          audio.chest(e.open);
          break;
        case 'burst': {
          const tiles = BLOCKS[e.id]?.tiles;
          particles.chips(e.x, e.y, e.z, tiles ? [tiles.side, tiles.top, tiles.bottom] : [0], e.count, e.soft === true);
          break;
        }
        case 'splash':
          audio.splash(e.vol);
          break;
        case 'fire':
          audio.fire(e.kind, e.vol);
          break;
        case 'eat':
          audio.eat();
          break;
        case 'pop':
          audio.pop();
          break;
        case 'pickup':
          pushPickup(e);
          break;
        case 'xp':
          audio.xp();
          if (e.gain && e.gain > 0) damageNumbers.xp(e.gain, camera);
          break;
        case 'coins':
          audio.coin();
          damageNumbers.coins(e.gain, camera);
          break;
        case 'shop':
          audio.coin();
          break;
        case 'equip':
          audio.equip();
          break;
        case 'enchant':
          audio.enchant(e.anvil === true, { element: e.glyph ? ENCHANTS.find((d) => d.id === e.glyph)?.element : undefined, rank: e.rank, erase: e.erase, fail: e.fail });
          if (e.fail) useUi.setState({ altarFail: { n: (useUi.getState().altarFail?.n ?? 0) + 1 } });
          break;
        case 'shield':
          audio.ability(e.parry ? 'shield_parry' : e.broke ? 'shield_break' : 'shield_block', e.vol);
          break;
        case 'guard':
          // "BLOCK" or "PARRY!" floats up in the middle of the view; a parry also kicks the screen a little.
          damageNumbers.guard(e.what, camera);
          // (a parry or a dodge with the dagger: a bright clash or a quick swish, no shield to jolt)
          if (e.what === 'dodge') audio.ability('dagger_swish', 0.8);
          else if ([session.held, session.offhand.get(0)].some((s) => s && getItem(s.id).shield)) hand.blockHit(e.what === 'parry');
          else if (e.what === 'parry') audio.ability('dagger_hit', 0.8);
          if (e.what === 'parry') feel.kick(0.12);
          break;
        case 'ember':
          if (e.what === 'start') emberFx.start(e.x, e.y, e.z);
          else if (e.what === 'stop') emberFx.stop(e.x, e.y, e.z);
          else if (e.what === 'depart') emberFx.depart(e.x, e.y, e.z);
          else emberFx.arrive(e.x, e.y, e.z);
          break;
        case 'mount':
          // The call, the arrival and the dismount are cubes of light, the same for every mount in the mount's own colour.
          if (e.what === 'start') abilityFx.startSummon(e.id, e.x, e.y, e.z);
          else if (e.what === 'stop') abilityFx.stopSummon(e.x, e.z);
          else if (e.what === 'on') abilityFx.arriveSummon(e.id, e.x, e.y, e.z);
          else if (e.what === 'off') mountFx.puff(e.x, e.y, e.z, mountLook(e.id));
          else if (e.what === 'bite' || e.what === 'howl') {
            // Your own mount, or somebody's near you: the beast bites or howls. (What it does to the world, the fangs and the lightning, is
            // drawn from the marks the server leaves.)
            if (Math.hypot(e.x - body.x, e.z - body.z) < 0.7) selfView.mountAct(e.what);
            else players.mountAct(e.x, e.z, e.what);
            // The howl is only seen where it strikes (the marks of the server); here only its sound.
            if (e.what === 'howl') mountFx.onSound?.('mount_howl', e.x, e.y, e.z, 0);
          }
          break;
        case 'spell':
          audio.ability(`${e.weapon}_cast`, e.vol);
          break;
        case 'levelup':
          audio.levelUp();
          levelFx.start(() => ({ x: body.x, y: body.y, z: body.z }));
          showLevelBanner(e.level);
          break;
        case 'classlevel':
          audio.levelUp();
          break;
        case 'jewelDrop':
          audio.jewelDrop(e.kind, e.vol);
          break;
        case 'forgeStart':
          audio.forge(e.craft);
          break;
        case 'crafted': {
          audio.crafted();
          const n = (useUi.getState().jewelFx?.n ?? 0) + 1;
          useUi.setState({ jewelFx: { n, slot: e.slot, ok: true, kind: 'dawn', label: e.label, detail: e.detail } });
          setTimeout(() => {
            if (useUi.getState().jewelFx?.n === n) useUi.setState({ jewelFx: null });
          }, 2200);
          break;
        }
        case 'jewel':
          audio.jewel(e.ok, e.kind);
          {
            const n = (useUi.getState().jewelFx?.n ?? 0) + 1;
            useUi.setState({ jewelFx: { n, slot: e.slot, ok: e.ok, kind: e.kind, label: e.label, detail: e.detail } });
            // It is gone from the window once it has played (so it does not play again when the window is opened).
            setTimeout(() => {
              if (useUi.getState().jewelFx?.n === n) useUi.setState({ jewelFx: null });
            }, 2200);
          }
          break;
        case 'learned':
          audio.ability('learn');
          break;
        case 'hurt':
          audio.hurt();
          parts.hurtFlash();
          break;
        case 'dmg':
          if (e.taken) damageNumbers.taken(e.amount, e.guarded === true, camera);
          else {
            const crit = e.crit === true;
            const head = e.head === true;
            damageNumbers.dealt(e.x, e.y, e.z, e.amount, crit || head, e.total, head ? 'head' : e.combo ? 'combo' : undefined);
            hud.hitMarker(head ? 'head' : crit || e.combo ? 'crit' : 'hit');
            if (e.arrow) {
              // An arrow lands from a distance: the view feels it, but the hand does not stop (it is not swinging anything).
              feel.thump(crit || head);
              audio.ability(head ? 'arrow_head' : 'arrow_hit', 0.9);
            } else {
              feel.blow(crit || e.combo === true);
              if (e.blade) audio.ability(e.combo ? 'dagger_finish' : 'dagger_hit', 0.9);
            }
            if (crit || head) particles.sparks(e.x, e.y, e.z, 1, 0.82, 0.25, 14);
            else particles.sparks(e.x, e.y, e.z, 0.95, 0.3, 0.25, 8);
          }
          break;
        case 'thunder':
          audio.thunder(e.distance);
          break;
        case 'explode':
          audio.explode(e.vol);
          break;
        case 'mob':
          audio.mob(e.kind, e.sound, e.vol, e.x !== undefined && e.z !== undefined ? panOf(e.x, e.z) : 0);
          break;
        case 'cast': {
          // The warrior's shield abilities show the shield in the hand rather than a swing of the weapon.
          const cv = session.classView();
          const id = cv ? abilitiesOf(cv.id)[e.slot]?.id : undefined;
          if (id === 'shield_bash') {
            hand.bash();
            selfView.bash();
          }
          // The Fireball leaves the hand now (its burst is heard where it lands, from the mark it leaves).
          if (id === 'fireball') audio.ability('fireball_cast');
          break;
        }
        case 'swing':
          // (A stab of the off hand is started and heard by the client the moment the button goes down, hit or not: see main.ts.)
          if (e.off) break;
          hand.swing(e.rate ?? 1);
          selfView.swing(e.rate ?? 1);
          if (session.held?.id === I.DAGGER) audio.ability('dagger_swish', 0.7);
          break;
        case 'fish': {
          // Heard and seen where it happens: quieter with the distance, and gone beyond the reach of the realm's events.
          const dist = Math.hypot(e.x - camera.position.x, e.y - camera.position.y, e.z - camera.position.z);
          const vol = Math.max(0, 1 - dist / 40) ** 1.5;
          audio.fishing(e.what, vol);
          if (dist > 48) break;
          const drops = e.what === 'bite' ? 12 : e.what === 'splash' ? 7 : e.what === 'catch' || e.what === 'reel' ? 6 : 0;
          for (let n = 0; n < drops; n++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 0.4 + Math.random() * 0.9;
            particles.mote(e.x, e.y + 0.05, e.z, Math.cos(a) * sp, 2.4 + Math.random() * 2.4, Math.sin(a) * sp, 14, 0.5 + Math.random() * 0.3, 0.06 + Math.random() * 0.04, 0.78, 0.9, 1);
          }
          if (e.what === 'lure') {
            for (let n = 0; n < 3; n++) particles.mote(e.x + (Math.random() - 0.5) * 0.5, e.y - 0.05, e.z + (Math.random() - 0.5) * 0.5, 0, 0.5, 0, -0.2, 0.7 + Math.random() * 0.4, 0.05, 0.9, 0.96, 1);
          }
          break;
        }
        case 'pins':
          parts.setPartyPins(e.party);
          break;
        case 'died':
          breakSelf();
          if (document.pointerLockElement) document.exitPointerLock();
          // A hardcore death is final: write it down now, so closing the page cannot undo it.
          if (session.hardcore) void saveBridge.flush?.();
          break;
        case 'respawned':
          audio.resume();
          input.lock();
          break;
        case 'quests':
          setQuests(e.log);
          break;
        case 'ach':
          useUi.setState({ ach: e.view });
          break;
        case 'bounties':
          useUi.setState({ bounties: e.view, bountiesAt: Date.now() });
          break;
        case 'bounty':
          hud.toast(`Daily bounty done: ${e.name}`);
          pushQuestNote('done', `Daily bounty done: ${e.name}`);
          break;
        case 'achievement':
          hud.toast(`Achievement unlocked: ${e.name} (${e.reward})`);
          pushQuestNote('done', `Achievement unlocked: ${e.name} (${e.reward})`);
          break;
        case 'dialog':
          useUi.setState({ dialogNpc: e.npc, shopOpen: false, auction: null, stash: null });
          break;
        case 'auction':
          useUi.setState({ auction: e.view });
          break;
        case 'stash':
          useUi.setState({ stash: e.view });
          break;
        case 'zone':
          showZone(e.id);
          break;
        case 'party':
          setParty(e.members, e.invite);
          break;
        case 'quest':
          pushQuestNote(e.what, e.text);
          audio.quest(e.what);
          break;
      }
    }
  };
}
