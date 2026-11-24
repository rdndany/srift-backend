import * as THREE from 'three';
import {
  BED_DIRS,
  BLOCKS,
  SOUL_LANTERN_LIGHT,
  NPCS,
  campfireInfo,
  GameSession,
  LoopbackLink,
  ADVENTURE_SEED,
  INSTANCE_FLOOR,
  MOBS,
  instanceFootprint,
  SaveError,
  SessionHost,
  isWorldKind,
  isClassId,
  caveKindHere,
  placeNameAt,
  lookCode,
  lookOfCode,
  makeGenerator,
  type WorldKind,
  type MobKind,
  type ClassId,
  type Command,
  type InputFrame,
  type PlayerSave,
  getItem,
  CraftingMenu,
  I,
  MOUNTS,
  IS_LIQUID,
  isWaterBlock,
  roofGap,
  createBody,
  type SaveMode,
  showcaseFind,
  SHOWCASE_BOX,
  SHOWCASE_FLOOR,
  SHOWCASE_HEIGHT,
  type DiscoveryLog,
  type WorldState,
  outfitOfCode,
  outfitSetFits,
  outfitSetOfItem,
  companionOfItem,
  COMPANIONS,
  plainCodeOf,
  wornCode,
  wingNumberOf,
  glowCode,
  glowColor,
} from '@solrift/shared';
import { bumpUi, showZone, useUi, type CodexView } from '../ui/store';
import { BeyondClient } from './beyondClient';
import { CampfireFood } from './campfireFood';
import { SignBoards } from './signBoards';
import { Chat } from './chat';
import { isPlayPath, markEntry, newUid, paramsFor, prettyAddress, realmPath, uidFromPath } from './route';
import type { ClientSession } from './clientSession';
import { GameAudio } from './audio';
import { NO_DUNGEON, dungeonDepth, hostileThreat, scanSurroundings, type DungeonEnv } from './dungeonAmbience';
import { buildAtlas } from './atlas';
import { HeldItem } from './heldItem';
import { Hud } from './hud';
import { ItemIcons } from './icons';
import { MapData, blockColors, type MapPin } from './mapData';
import { MapSheet } from './heldMap';
import { Input } from './input';
import { ItemEntities } from './itemEntities';
import { BookRenderer } from './bookRenderer';
import { MobRenderer, disposeMobAssets } from './mobRenderer';
import { disposeWingKits } from './wingRig';
import { VehicleRenderer, disposeVehicleAssets } from './vehicleRenderer';
import { NetClient } from './net';
import { Particles } from './particles';
import { CompanionFollowers, type PetOwner } from './companionRenderer';
import { PlayerRenderer } from './playerRenderer';
import { DeathFx } from './deathFx';
import { SelfView, cameraPose } from './selfView';
import { ChaseCamera } from './chaseCamera';
import { Rain } from './rain';
import { RemoteSession } from './remote';
import { saveBridge } from './saveBridge';
import { Sky } from './sky';
import { PostFx, type FxFlags } from './postfx';
import { SunShadows } from './shadows';
import { AdminBar, type AdminDetails } from './adminBar';
import { blockInfoText } from './blockInfo';
import { TorchGlow } from './torchGlow';
import { CRACK_STAGES, makeCrackTexture, setCrackStage } from './breakCracks';
import { XpOrbRenderer } from './xpOrbRenderer';
import { BobberRenderer } from './bobbers';
import { rodLine } from './held/basic';
import { EatFx } from './eatFx';
import { LevelUpFx } from './levelUpFx';
import { CHEWS_PER_SECOND } from './character';
import { EntityLight } from './entityLight';
import { LocalSaveStore } from './storage';
import { paletteOfCode } from './lookPalette';
import { hydrateProfile, useProfile } from '../profile/store';
import { useAuth } from '../auth/store';
import { useToken } from '../token/store';
import { AbilityFx } from './abilityFx';
import { EmberFx } from './emberFx';
import { MOUNT_LOOK } from './mountFx';
import { DamageNumbers } from './damageNumbers';
import { WindBlur } from './windBlur';
import { ShaderKeeper } from './shaderKeep';
import { HitchLog, describeHitch, hitchShaders, type Hitch } from './hitch';
import { FigureWarm } from './figureWarm';
import { warmText } from './textWarm';
import { getSettings, subscribeSettings, type Settings } from './settings';
import { warmPreview } from './characterPreview';
import { RushLines } from './spellFx';
import { ARCANE_VEIL, GuardVeil } from './guardFx';
import { RiftFx } from './riftFx';
import { FireParticles } from './fireFx';
import { World } from './world';
import { installDebugHooks } from './debugHooks';
import { makeWindows } from './gameWindows';
import { CompassNeedle } from './compassNeedle';
import { makeEventHandler } from './gameEvents';
import { makeLandClient } from './landClient';
import { KeyActions } from './gameKeys';
import { RecipeMemory } from './recipeMemory';
import { makeUiApi } from './uiApi';
import { makeUiSync } from './uiSync';
import { TargetPicker } from './targeting';
import { MobTargetPicker } from './mobTargeting';
import { ViewFeel, type FeelFrame } from './viewFeel';


const BIOME_NAMES = ['ocean', 'beach', 'plains', 'forest', 'desert', 'snow', 'mountain'];

/** "143 blocks NE" for an offset (north is -z, as on the F3 screen of the original). */
function compass(dx: number, dz: number): string {
  const names = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const dir = names[(Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) + 8) % 8];
  return `${Math.round(Math.hypot(dx, dz))} blocks ${dir}`;
}

/** Is this a map: the thing that is read in the hand rather than used? */
const isMap = (stack: { id: number } | null | undefined): boolean => !!stack && getItem(stack.id).use === 'map';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

export interface StartOptions {
  /** Lets React Strict Mode abort a start that was superseded before it began. */
  isCancelled?: () => boolean;
  /** The world to play (the title screen's choice). Without it `?seed=` decides, then 1337. */
  seed?: number;
  /** The mode a brand new world starts in; a saved world keeps its own. */
  mode?: SaveMode;
  /** A new world with one life on Hard difficulty. */
  hardcore?: boolean;
  /** Which world to enter: the generated one (default) or the flat square platform (?world=square). */
  world?: WorldKind;
  /** Asks the page to restart the game in the other world (what /world does); the game saves first. */
  switchWorld?: (kind: WorldKind, mode: SaveMode) => void;
  /** Play as a guest: nothing is read from or written to this device (the world lives only until the page closes). */
  guest?: boolean;
}

/**
 * Boots the game into the DOM rendered by `GameView`. Returns a disposer.
 *
 * This file is the *client*: rendering, audio, input and the HUD. The game itself (physics, vitals,
 * mining, mobs, menus, saves) is a `GameSession` that the client drives through a loopback link:
 * one `InputFrame` per animation frame plus discrete commands, answered with events to show and hear.
 */
export async function startGame(opts: StartOptions = {}): Promise<() => void> {
  if (opts.isCancelled?.()) return () => undefined;

  const canvas = byId<HTMLCanvasElement>('game');
  const overlay = byId('overlay');
  const statusEl = byId('status');
  const params = paramsFor(location);

  // The loading screen covers everything until the world is ready (see components/LoadingScreen.tsx).
  const loadingEl = document.getElementById('loading-screen');
  const loadingBar = document.getElementById('loading-bar');
  const loadingText = document.getElementById('loading-text');
  loadingEl?.classList.remove('gone', 'ready');
  let loadingPct = 4;
  const setLoading = (text: string, pct: number): void => {
    loadingPct = Math.max(loadingPct, pct);
    if (loadingText) loadingText.textContent = text;
    if (loadingBar) loadingBar.style.width = `${loadingPct}%`;
  };
  const hideLoading = (): void => {
    loadingEl?.classList.remove('ready');
    loadingEl?.classList.add('gone');
  };
  setLoading('Preparing the world...', 4);
  // An old-style `/?online&name=Alice` shows as `/play/Alice` (the page is not reloaded).
  const pretty = prettyAddress(location);
  if (pretty) history.replaceState(null, '', pretty);
  /** ?online (or ?server=ws://...) plays on a game server instead of a local world. */
  const online = params.has('online') || params.has('server');
  document.body.classList.toggle('online', online);

  const ac = new AbortController();
  const { signal } = ac;

  // Painting the block pictures takes a few seconds and holds the page: let the loading screen show first.
  setLoading('Painting the blocks...', 8);
  await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  const atlas = buildAtlas();
  const icons = new ItemIcons(atlas.canvas);
  // Multisampling keeps the hard block edges and the texture-aliased far terrain from crawling.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !params.has('noaa'), powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  // A frame is many renders (shadow maps, the world, the effects, the hand): the counts are of all of them, started over each frame.
  renderer.info.autoReset = false;
  // A shader program is built once and kept, however often the things drawn with it come and go.
  const shaderKeeper = new ShaderKeeper(renderer);

  // Automatic quality: if the game stays slow, give back the expensive things in order (shadows, then resolution)
  // instead of stuttering. It only ever steps down, so it cannot flip-flop. Off with ?debug or ?noautoquality.
  const autoQuality = !params.has('debug') && !params.has('noautoquality');
  let qualityLevel = 0;
  let shadowsOff = false;
  /** The player turned the sun's shadows off (a setting); shadowsOff is the automatic quality having done so. */
  let shadowsUserOff = false;
  let adaptiveOn = true;
  let aqTime = 0;
  let aqFrames = 0;
  let aqSlow = 0;
  const stepQuality = (): void => {
    qualityLevel++;
    // First the ambient occlusion goes (it is the dearest), then the shadows, then the resolution.
    if (qualityLevel === 1) {
      applyPostfx();
      return void console.info('[solrift] low frame rate: ambient occlusion off');
    }
    if (qualityLevel === 2) shadowsOff = true;
    else if (qualityLevel === 3) renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    else renderer.setPixelRatio(0.75);
    if (qualityLevel >= 3) renderer.setSize(window.innerWidth, window.innerHeight, false);
    console.info(`[solrift] low frame rate: quality level ${qualityLevel}`);
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 600);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  // ---- online: join the server first, because the world's seed is the server's ----
  const chat = new Chat(
    (text) => (remote ? remote.chat(text) : localCommand(text)),
    (open) => {
      if (open && document.pointerLockElement) document.exitPointerLock();
      else if (!open && session.ready) input.lock();
    },
  );
  const worldName = (kind: WorldKind): string => (kind === 'square' ? 'square platform' : kind === 'beyond' ? 'World Beyond' : kind === 'showcase' ? 'block showcase' : kind === 'castle' ? 'castle grounds' : 'overworld');
  /** Single-player has no one to talk to, but `/` still takes the few cheats (they need creative mode). */
  function localCommand(text: string): void {
    const [name, arg] = text.replace(/^\//, '').trim().toLowerCase().split(/\s+/);
    if (!text.startsWith('/')) return;
    if (name === 'help') {
      chat.add('Commands: /help /world [overworld|beyond|square|showcase|castle] /find <block> (in the showcase) /admin on|off (block details at the crosshair) /spawn <mob id> [count] /mobs [filter] /invasion (creative mode)', 'notice');
    } else if (name === 'world') {
      if (KIND === 'adventure') chat.add('Adventure is its own world: leave it from the pause menu and pick another from the title screen.', 'notice');
      else if (!arg) chat.add(`You are in the ${worldName(KIND)}. Use /world overworld, /world beyond, /world square, /world showcase or /world castle.`, 'notice');
      else if (arg !== 'overworld' && arg !== 'square' && arg !== 'beyond' && arg !== 'showcase' && arg !== 'castle') chat.add('Worlds: overworld, beyond, square, showcase, castle.', 'notice');
      else if (session.mode !== 'creative') chat.add('Switching worlds is a cheat: it needs creative mode (F4).', 'notice');
      else if (arg === KIND) chat.add(`You are already in the ${worldName(arg)}.`, 'notice');
      else switchWorld(arg);
    } else if (name === 'admin') {
      // Your own world is yours: no list to check. (Online, the server decides and tells us through onAdmin.)
      if (arg === 'on' || arg === 'off') {
        adminMode = arg === 'on';
        chat.add(adminMode ? 'Admin mode ON: the block under the crosshair is described beside it. /admin off to leave.' : 'Admin mode OFF.', 'notice');
      } else chat.add(`Admin mode is ${adminMode ? 'on' : 'off'}. Use /admin on or /admin off.`, 'notice');
    } else if (name === 'find') {
      // The block showcase: stand beside the box of a block (/find grass, /find stone_bricks).
      const box = KIND === 'showcase' && arg ? showcaseFind(arg) : null;
      if (KIND !== 'showcase') chat.add('/find works in the block showcase: /world showcase, or open the game with ?world=showcase.', 'notice');
      else if (!box) chat.add(arg ? `No block called "${arg}" here.` : 'Which block? For example /find grass.', 'notice');
      else {
        local?.teleport(box.x + SHOWCASE_BOX / 2, SHOWCASE_FLOOR + SHOWCASE_HEIGHT + 3, box.z - 4, 0, -0.5);
        chat.add(`${box.name}: ten by ten blocks, four high.`, 'notice');
      }
    } else if (name === 'invasion') {
      // Begin the Gilded Tide now (creative mode, or /admin on): shy golden creatures hide across the land.
      if (!local || (session.mode !== 'creative' && !adminMode)) chat.add('/invasion is a cheat: it needs creative mode (F4) or /admin on.', 'notice');
      else if (!local.realm.invasions) chat.add('Invasions are off in this world (?noinvasions or ?nomobs).', 'notice');
      else if (local.realm.invasions.current) chat.add('The Gilded Tide is on already.', 'notice');
      else if (local.realm.startInvasion()) chat.add('The Gilded Tide breaks over the land.', 'notice');
      else chat.add('No place for the Gilded Tide here (explore more land, or move away from villages).', 'notice');
    } else if (name === 'spawn' || name === 'mobs') {
      // Your own world: any creature, by its id, in front of you (creative mode, or /admin on). /mobs lists the ids.
      const words = text.replace(/^\//, '').trim().toLowerCase().split(/\s+/).slice(1);
      const ids = Object.keys(MOBS) as MobKind[];
      const norm = (s: string): string => s.trim().toLowerCase().replace(/[\s-]+/g, '_');
      if (!local || (session.mode !== 'creative' && !adminMode)) chat.add(`/${name} is a cheat: it needs creative mode (F4) or /admin on.`, 'notice');
      else if (name === 'mobs') {
        const q = norm(words.join(' '));
        const hit = ids.filter((k) => !q || k.includes(q) || norm(MOBS[k].name).includes(q));
        chat.add(hit.length === 0 ? `No mob matches "${words.join(' ')}".` : `Mob ids (${hit.length}): ${hit.slice(0, 60).join(', ')}${hit.length > 60 ? ', ... (add a word to narrow it)' : ''}`, 'notice');
      } else {
        const hasCount = words.length > 1 && /^\d{1,2}$/.test(words[words.length - 1]);
        const count = Math.max(1, Math.min(20, hasCount ? Number(words[words.length - 1]) : 1));
        const q = norm((hasCount ? words.slice(0, -1) : words).join(' '));
        const kind = ids.find((k) => k === q) ?? ids.find((k) => norm(MOBS[k].name) === q);
        if (!kind) {
          const near = ids.filter((k) => q && (k.includes(q) || norm(MOBS[k].name).includes(q))).slice(0, 12);
          chat.add(q ? (near.length ? `Which one? ${near.join(', ')}` : `No mob with the id "${q}". /mobs lists them.`) : 'Usage: /spawn <mob id> [count]  (/mobs lists the ids)', 'notice');
        } else {
          const fx = -Math.sin(local.yaw);
          const fz = -Math.cos(local.yaw);
          const dist = 3 + MOBS[kind].width * 0.5;
          for (let i = 0; i < count; i++) {
            const side = (i - (count - 1) / 2) * (MOBS[kind].width + 0.6);
            local.spawnMob(kind, local.body.x + fx * dist - fz * side, local.body.y + 0.1, local.body.z + fz * dist + fx * side);
          }
          chat.add(`Spawned ${count > 1 ? `${count} x ` : ''}${MOBS[kind].name} (${kind}).`, 'notice');
        }
      }
    } else {
      chat.add(`Unknown command: /${name}. Try /help.`, 'notice');
    }
  }
  /** Save this world, then have the page start the game again in the other one. */
  function switchWorld(kind: WorldKind): void {
    if (online || kind === KIND || !opts.switchWorld) return;
    chat.add('Travelling...', 'notice');
    void (saveBridge.flush?.() ?? Promise.resolve()).finally(() => opts.switchWorld?.(kind, session.mode));
  }
  let remote: RemoteSession | null = null;
  /** The server says admin mode is on: the block under the crosshair is described next to it. */
  let adminMode = false;
  let onlineError: string | null = null;
  // The class this character plays: a wallet character's is on its account; a guest picked theirs on the title screen. ?class= is for tests and developers.
  hydrateProfile();
  const classParam = params.get('class');
  const myClass: ClassId | null = isClassId(classParam) ? classParam : ((useProfile.getState().identity === 'wallet' ? useAuth.getState().account?.class : useProfile.getState().classId) ?? null);
  if (online) {
    const serverUrl = params.get('server') ?? process.env.NEXT_PUBLIC_SERVER_URL ?? `ws://${location.hostname}:8787`;
    const saved = localStorage.getItem('solrift-name');
    hydrateProfile();
    // The name: the address's (`?name=`, `/play/Alice`), else the character the lobby made (the profile), else the last one used here.
    const name = params.get('name') || useProfile.getState().name || saved || `player${Math.floor(Math.random() * 900 + 100)}`;
    localStorage.setItem('solrift-name', name);
    if (useProfile.getState().identity !== 'wallet') useProfile.getState().setName(name);
    // The realm's address is the character's id (`play.solrift.io/<uid>`), not a name: a name in the address becomes one.
    if (isPlayPath(location.pathname) && !uidFromPath(location.pathname)) {
      const uid = newUid();
      markEntry(uid);
      history.replaceState(null, '', `${realmPath(uid)}${location.search}`);
    }
    statusEl.textContent = 'Connecting to the server...';
    setLoading('Connecting to the server...', 8);
    try {
      remote = await RemoteSession.connect(serverUrl, name, lookCode(useProfile.getState().look), {
        onEvents: (events) => {
          handleEvents(events);
          syncUi();
        },
        onChat: (from, text, ch, to) => {
          if (ch === 'whisper') chat.add(to ? `To ${to}: ${text}` : `${from} whispers: ${text}`, 'whisper');
          else if (ch === 'emote') chat.add(`* ${from} ${text}`, 'emote');
          else if (ch === 'guild') chat.add(`[Guild] ${from}: ${text}`, 'guild');
          else if (ch === 'party') chat.add(`[Party] ${from.replace(/ \(party\)$/, '')}: ${text}`, 'party');
          else chat.add(`<${from}> ${text}`);
        },
        onSocial: (view) => useUi.setState({ social: view }),
        onInspect: (name, view) => useUi.setState({ inspect: { name, view } }),
        onTrade: (view) => showTrade(view),
        onTradeAsk: (from) => useUi.setState({ tradeAsk: from }),
        onNotice: (text) => {
          chat.add(text, 'notice');
          // A reward was added to the wallet's balance: read it again so the number on screen is the true one.
          if (text.includes('$SOLRIFT')) void useToken.getState().loadMe();
        },
        onAdmin: (on) => (adminMode = on),
        onClose: (reason) => {
          onlineError = reason;
          hideLoading(); // the reason is on the pause screen
          overlay.style.display = 'flex';
          statusEl.textContent = `Disconnected: ${reason.replace(/^Disconnected( from the server)?\.?/, 'connection lost').trim()} Reload the page to reconnect.`;
          statusEl.style.color = '#ff6b6b';
          if (document.pointerLockElement) document.exitPointerLock();
        },
      }, myClass);
    } catch (err) {
      chat.dispose();
      renderer.dispose();
      atlas.dispose();
      throw new Error(err instanceof Error ? err.message : 'Cannot reach the game server.');
    }
  }
  const KIND: WorldKind = remote ? remote.kind : opts.world ?? (isWorldKind(params.get('world')) ? (params.get('world') as WorldKind) : 'overworld');
  // Adventure is an online mode (a shared village and dungeon). Offline it opens only for developers and tests, with ?debug.
  if (!online && KIND === 'adventure' && !params.has('debug')) {
    chat.dispose();
    renderer.dispose();
    atlas.dispose();
    throw new Error('Adventure is an online mode. Pick the Dawnwatch Adventure realm under Multiplayer.');
  }
  /** Adventure is one fixed world (the village and the dungeon are made for it), so it has no seed to choose. */
  const SEED = remote ? remote.seed : KIND === 'adventure' ? ADVENTURE_SEED : opts.seed ?? Number(params.get('seed') ?? 1337);
  /** Each kind of world keeps its own save, so the square never touches the overworld's blocks. */
  const worldId = KIND === 'overworld' ? String(SEED) : `${SEED}-${KIND}`;
  const store = new LocalSaveStore(worldId);
  /** A guest keeps nothing: a frozen store drops every write, and the world keeps the blocks they change in memory for this visit only. */
  const guest = !online && opts.guest === true;
  if (guest) store.freeze();
  const world = new World(SEED, atlas, online || guest ? null : store, KIND);
  if (!online && !guest) await world.loadSaved();
  if (opts.isCancelled?.()) {
    remote?.leave();
    chat.dispose();
    world.dispose();
    renderer.dispose();
    atlas.dispose();
    return () => undefined;
  }
  scene.add(world.group);
  const cardMultisamples = renderer.getContext().getParameter(renderer.getContext().SAMPLES) > 1;
  // The picture's finishing: F6 ambient occlusion, F7 glow, F8 colour grade, F9 sun rays, F10 blur behind menus (the choice is kept;
  // `?nopostfx` turns all off, `?postfx` all on). The card's own multisampling does not go with it: edges are smoothed by a pass, and the
  // cut-outs (leaves, grass) use a plain alpha test.

  // ---- the game itself -------------------------------------------------
  const forcedMode: SaveMode | null = params.get('mode') === 'creative' ? 'creative' : null;
  /** Single-player: the game runs right here. Online: the server runs it and `remote` mirrors it. */
  const local: GameSession | null = online
    ? null
    : new GameSession({
        seed: SEED,
        world,
        generator: makeGenerator(SEED, KIND),
        mode: forcedMode ?? opts.mode ?? 'survival',
        hardcore: forcedMode === null && opts.hardcore === true,
        classId: myClass,
        /** `?nomobs` turns off natural spawning (used by deterministic tests). */
        naturalSpawning: !params.has('nomobs'),
        /** Rifts come with the monsters (and `?norifts` keeps them away). */
        rifts: !params.has('nomobs') && !params.has('norifts'),
        /** The Gilded Tide every half hour (`?noinvasions` or `?nomobs` keeps it away). */
        invasions: !params.has('nomobs') && !params.has('noinvasions'),
        /** ?villagers brings the villages' people back into a ?nomobs world. */
        villagers: !params.has('nomobs') || params.has('villagers'),
      });
  const session: ClientSession = local ?? remote!;
  remote?.attachWorld(world, (blocks) => world.applyRemoteEdits(blocks));
  const body = session.body;
  const weather = session.weather;

  const sky = new Sky();
  /** The sun's shadow map (`?noshadows` turns it off, `?shadows=4096` sharpens the near map, `?shadowfar=0` drops the wide one). */
  const shadowSize = Math.min(4096, Math.max(512, Number(params.get('shadows')) || 2048));
  const shadows = params.has('noshadows') ? null : new SunShadows(world.materials, shadowSize, 64, params.get('shadowfar') === '0' ? 0 : 256);
  if (shadows) {
    shadows.setTerrain(world.group);
    shadows.setView(camera);
    world.onRemesh = (x0, y0, z0, x1, y1, z1) => shadows.terrainChanged(x0, y0, z0, x1, y1, z1);
  }
  const shadowFocus = new THREE.Vector3();
  /** 0 in the open, 1 deep underground: fades the sky-coloured fog to black so caves have a dark horizon. */
  let caveDark = 0;
  /** The kind of cave the player was last in (see the banner below) and the time to the next look. */
  let lastCaveKind = 'plain';
  let caveBannerWait = 0;
  let placeWait = 0;
  const caveFog = new THREE.Color();
  const beyondTint = new THREE.Color();
  scene.add(sky.group);
  const postfx = new PostFx(renderer, scene, camera, sky.sunMesh);
  const fxWanted: FxFlags = ((): FxFlags => {
    const all = (on: boolean): FxFlags => ({ ao: on, glow: on, grade: on, rays: on, menuBlur: on });
    if (params.has('nopostfx')) return all(false);
    if (params.has('postfx')) return all(true);
    try {
      if (localStorage.getItem('solrift.postfx') === '0' && !localStorage.getItem('solrift.fx') && !localStorage.getItem('solrift-settings')) return all(false); // (the first version had one switch)
    } catch {
      // (no storage: the settings)
    }
    const s = getSettings();
    return { ao: s.ao, glow: s.glow, grade: s.grade, rays: s.rays, menuBlur: s.menuBlur };
  })();
  /** ?nopostfx and ?postfx decide the picture's finishing whatever the settings say. */
  const fxForced = params.has('nopostfx') || params.has('postfx');
  const applyPostfx = (): void => {
    const wasOn = postfx.on;
    postfx.setFlags(qualityLevel < 1 ? fxWanted : { ao: false, glow: false, grade: false, rays: false, menuBlur: false });
    if (postfx.on && !wasOn) postfx.resize(window.innerWidth, window.innerHeight);
    world.materials.setMultisampled(!postfx.on && cardMultisamples);
  };
  applyPostfx();
  const rain = new Rain((x, z) => world.surfaceY(x, z));
  scene.add(rain.object);
  const startWeather = params.get('weather');
  scene.background = sky.color;

  // Two passes (world, then the hand on top), so clearing is manual.
  renderer.autoClear = false;
  const hand = new HeldItem(atlas.canvas, atlas.texture);

  const particles = new Particles(atlas.canvas, atlas.texture);
  scene.add(particles.mesh);
  scene.add(particles.debris);
  const torchGlow = new TorchGlow();
  let campfireSmoke = 0;
  scene.add(torchGlow.group);
  const audio = new GameAudio();

  const drops = new ItemEntities(icons, (id) => hand.dropModel(id));  scene.add(drops.group);
  const campfireFood = new CampfireFood((id) => hand.dropModel(id), (x, y, z) => world.getBlock(x, y, z));
  scene.add(campfireFood.group);
  const signBoards = new SignBoards((x, y, z) => world.getBlock(x, y, z));
  scene.add(signBoards.group);
  const xpOrbs = new XpOrbRenderer();
  scene.add(xpOrbs.group);
  const bobbers = new BobberRenderer();
  scene.add(bobbers.group);
  const eatFx = new EatFx();
  scene.add(eatFx.group);
  let bowWas = 0;
  let drawShown = 0;
  let zoomShown = 0;
  // A ranger with a bow in the hand puts it away for a stab of the dagger (see the left button below): seconds since the last click, and a click waiting for the dagger to be out.
  const STAB_HOLD = 0.7;
  let stabClock = 99;
  let stabQueued = false;
  const bowHeld = (): boolean => {
    const use = session.held ? getItem(session.held.id).use : undefined;
    return use === 'bow' || use === 'crossbow';
  };
  const hasStabDagger = (): boolean => session.offhand.get(0)?.id === I.DAGGER;
  /** The dagger is out instead of the bow. */
  const stabbing = (): boolean => stabClock < STAB_HOLD && bowHeld() && hasStabDagger() && session.bowDraw < 0.02;
  let eatClock = 0;
  let eatBites = 0;
  const eatDir = new THREE.Vector3();
  const fire = new FireParticles();
  scene.add(fire.group);
  const abilityFx = new AbilityFx(fire);
  scene.add(abilityFx.group);
  abilityFx.setViewer(camera.position);
  // An effect that stays on someone (Iron Defense) is put on the figure as it is drawn: yours, or the other player of that name.
  abilityFx.setLocator((who) => (!remote || who === remote.name ? body : ([...remote.others.values()].find((p) => p.name === who) ?? null)));
  // The effects' shaders are compiled while the game loads, and kept: not at the first use of an ability, and not again at each one.
  abilityFx.keeper = shaderKeeper;
  abilityFx.warm();
  // A level gained: the golden column of light on the player (a level of one's own at once, others' from the marks the server shows).
  const levelFx = new LevelUpFx();
  scene.add(levelFx.group);
  levelFx.viewer = camera.position;
  /** The rift near the player: its column of light. */
  const riftFx = new RiftFx();
  scene.add(riftFx.group);
  const levelSeen = new Set<number>();
  // The Emberstone: the runes and the column of light while it is cast, the flash when it takes hold and the one at the bed.
  const emberFx = new EmberFx();
  scene.add(emberFx.group);
  emberFx.onSound = (sound, x, y, z, progress) => {
    const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
    audio.ability(sound, Math.max(0, 1 - d / 40), progress);
  };
  // A mount being called: the same, in violet; a burst when it arrives and a puff of dust when the rider gets off.
  const mountFx = new EmberFx(MOUNT_LOOK);
  scene.add(mountFx.group);
  mountFx.onSound = emberFx.onSound;
  emberFx.viewer = camera.position;
  mountFx.viewer = camera.position;
  /** Which ear a sound at a point is heard in: -1 (left) .. 1 (right), 0 when it is at your feet; the nearer, the less it leans. */
  const panDir = new THREE.Vector3();
  const panOf = (x: number, z: number): number => {
    const dx = x - camera.position.x;
    const dz = z - camera.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.8) return 0;
    const f = camera.getWorldDirection(panDir);
    const h = Math.hypot(f.x, f.z) || 1;
    // The camera's right-hand side on the ground is (-fz, fx).
    return ((dx * -f.z + dz * f.x) / (d * h)) * Math.min(1, d / 5) * 0.85;
  };
  // A mount's paws: a thud and a rattle of armour for each one that comes down, in time with its stride, and dust kicked up (more of it, and more
  // noise, the harder and faster it runs; a landing is the heaviest). The ground says what it sounds like, as for a person's step. Over water it splashes.
  const mountStep = (x: number, y: number, z: number, power: number, dx: number, dz: number): void => {
    const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
    if (d > 40) return;
    const near = 1 - d / 40;
    const under = world.getBlock(Math.floor(x), Math.floor(y - 0.2), Math.floor(z));
    if (IS_LIQUID[under]) {
      audio.splash(near * 0.35 * power);
      return;
    }
    audio.ability('mount_step', near * Math.min(1, 0.35 + power * 0.5), 1, panOf(x, z));
    const kind = BLOCKS[under].sound;
    audio.play(kind, 'land', near * 0.3 * power, panOf(x, z));
    if (d < 36 && (kind === 'dirt' || kind === 'sand' || kind === 'gravel' || kind === 'stone' || kind === 'grass')) fire.pawDust(x, y, z, dx, dz, power);
  };
  // What the camera does besides looking where the player looks: shakes, dips on a landing, kicks with a blow, leans into a roll, widens in a charge.
  const feel = new ViewFeel();
  const DUSTY = new Set(['dirt', 'grass', 'sand', 'gravel', 'stone', 'snow']);
  /** Dust under a foot: a puff of the ground's own colour, a few flecks for a step and a cloud for a landing. */
  const footDust = (kind: string, action: string, x: number, y: number, z: number, vol: number): void => {
    if (!DUSTY.has(kind)) return;
    if (Math.hypot(x - camera.position.x, z - camera.position.z) > 22) return;
    const id = world.getBlock(Math.floor(x), Math.floor(y - 0.2), Math.floor(z));
    if (!id || IS_LIQUID[id]) return;
    const tiles = BLOCKS[id].tiles;
    // (a hard stomp, like the spring of a Ground Slam, sends up far more)
    if (action === 'land') particles.dust(x, y, z, tiles.top, Math.round(6 + 12 * Math.min(1, vol) + 40 * Math.max(0, vol - 1.2)), vol > 1.2 ? 1.5 : 1);
    else particles.dust(x, y, z, tiles.top, 2, 0.3);
  };
  // A charge: streaks of light rush past (and the view widens: see ViewFeel).
  const rushLines = new RushLines();
  scene.add(rushLines.group);
  // Iron Defense seen from inside: a bluish mask of cubes over the edges of the view (see GuardVeil).
  const guardVeil = new GuardVeil();
  scene.add(guardVeil.group);
  // The Arcane Shield seen from inside: a twinkling frame of violet cubes round the edge of the view.
  const arcaneVeil = new GuardVeil(ARCANE_VEIL);
  scene.add(arcaneVeil.group);
  // Numbers for the damage the player deals and takes.
  const damageNumbers = new DamageNumbers();
  // The wind of a fast dash: blurred sides and streaks of air.
  const windBlur = new WindBlur();
  const noWind = params.has('nowind');
  // What the last freeze was made of, for the admin bar and the console (a tab that was hidden is not a freeze).
  const hitches = new HitchLog();
  let lastHitch: Hitch | null = null;
  let hiddenAt = -Infinity;
  document.addEventListener('visibilitychange', () => void (hiddenAt = performance.now()), { signal });
  scene.add(damageNumbers.group);
  abilityFx.onImpact = (x, y, z, strength) => {
    const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
    feel.impact(strength * Math.max(0, 1 - d / 24));
  };
  // What abilities sound like where they happen (the caster's own and everyone else's near them): quieter with distance.
  abilityFx.onSound = (sound, x, y, z, seconds) => {
    const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
    audio.ability(sound, Math.max(0, 1 - d / 40), seconds, panOf(x, z));
  };
  const books = new BookRenderer();
  scene.add(books.group);
  const figureOf = (id: number): THREE.Object3D | null => (getItem(id).shield ? hand.figureShield(id) : hand.figureModel(id));
  const players = new PlayerRenderer(figureOf);
  scene.add(players.group);
  const companions = new CompanionFollowers();
  scene.add(companions.group);
  players.onMountStep = mountStep;
  const selfView = new SelfView(figureOf);
  selfView.onMountStep = mountStep;
  // The third-person camera (from behind), over the shoulder the player chose last time (mouse 3 swaps it).
  const chase = new ChaseCamera();
  try {
    if (localStorage.getItem('solrift-shoulder') === 'left') chase.swapShoulder();
  } catch {
    /* no storage: the right shoulder */
  }
  /** What holds the camera back: whole blocks (low or thin ones, like beds, slabs and fences, do not). */
  const cameraSolid = (x: number, y: number, z: number): boolean => {
    const d = BLOCKS[world.getBlock(x, y, z)];
    return d.solid && d.shape === 'cube';
  };
  // Your own body wears the character you made (online, the one the server has for you).
  hydrateProfile();
  const myLook = remote ? remote.look : lookCode(useProfile.getState().look);
  selfView.setLook(paletteOfCode(myLook));
  hand.setLook(paletteOfCode(myLook));
  useProfile.setState({ look: lookOfCode(myLook), outfit: outfitOfCode(myLook)?.id ?? null });
  /** The set in the outfit slot that your body is drawn in (-1: not yet read): putting one on, or taking it off, dresses you at once. */
  let wornShown = -1;
  scene.add(selfView.group);
  // When someone dies the body comes apart into the little cubes it is made of (one of three ways, picked at random).
  const deathFx = new DeathFx((x, y, z) => world.getBlock(x, y, z));
  scene.add(deathFx.group);
  players.onDeath = (c, x, y, z, yaw) => deathFx.spawn(c.voxels(), x, y, z, yaw, -1, sky.brightness);
  /** Your own body falls apart where it stood (`variant` picks the way: any other number is random). */
  let debugDeadUntil = 0;
  const breakSelf = (variant = -1): void => {
    deathFx.spawn(selfView.voxels(), body.x, body.y, body.z, selfView.mode !== 0 ? selfView.facing : input.yaw, variant, sky.brightness);
  };

  const mobRenderer = new MobRenderer(fire, abilityFx.voxelKit);
  // Mobs, other players and your own body are lit like the world: sky colour, caves, torches, sun on each face.
  const handLight = new THREE.Color();
  const heldLightFull = new THREE.Color();
  const heldLightColor = new THREE.Color();
  const heldLightAt = new THREE.Vector3();
  const heldLightDir = new THREE.Vector3();
  let debugHideHand = false;

  // The map: painted from the chunks around you and remembered. The map item draws from it.
  const mapData = new MapData({ chunk: (cx, cz) => world.chunkData(cx, cz) }, blockColors(atlas.canvas), (cx, cz) => world.chunkRev(cx, cz));
  /** The picture of the map item, as it is painted on the sheet in the hand (see HeldItem). */
  const mapSheet = new MapSheet();
  hand.setMapSheet(mapSheet);
  let mapPaintWait = 0;
  let mapWasShown = false;
  /** The hand's shaders are built once, behind the loading screen, just before the world is entered (see `HeldItem.warm`). */
  let handWarm = false;
  /** The line "Preparing the hand..." is up for a frame before the build, so the bar can show it while the card works. */
  let handAnnounced = false;
  /** What the world only shows later (your body in gear, the mount, the block outline, the rain) is drawn once while loading (see `FigureWarm`). */
  let figureWarm: FigureWarm | null = null;
  let figureWarmStarted = false;
  let figureWarmWait = 1;
  /** The inventory window drawn for the loading screen (one frame at each of its tabs, see `FigureWarm` and `MenuScreen`). */
  function warmWindows(step: number): void {
    if (step < 0) {
      delete document.documentElement.dataset.uiWarm;
      useUi.setState({ warmMenu: null, warmHud: false, invTab: 'inventory', questLogOpen: false, codexOpen: false, socialOpen: false, partyOpen: false });
      return;
    }
    if (step === 5) {
      // The boss's frame and what it says, the rift and dungeon trackers: only a fight brings them up, and the first sight of each
      // would stand the game still while the browser builds how they are painted (150 ms for King Aurelion's frame).
      document.documentElement.dataset.uiWarm = '1';
      useUi.setState({ warmMenu: null, warmHud: true });
      return;
    }
    if (step === 4) {
      // The windows of the store's own flags, in the games that have them (nothing else about the game changes: only the flags).
      const s = useUi.getState();
      document.documentElement.dataset.uiWarm = '1';
      useUi.setState({ warmMenu: null, questLogOpen: s.adventure, codexOpen: !!s.codex, socialOpen: !!remote, partyOpen: !!remote && s.adventure });
      return;
    }
    const tabs = ['inventory', 'attributes', 'crafting', 'spells'] as const;
    if (tabs[step] === 'spells' && !session.classView()) return;
    const menu = new CraftingMenu(session.inventory, 2, session.armor, session.offhand, session.mountSlot, session.outfitSlot, () => session.classView()?.id ?? null, session.companionSlot, session.wingSlot, session.accessories);
    menu.attachBags(session.inventory, session.bags);
    useUi.setState({ warmMenu: menu, invTab: tabs[step] });
  }
  /** What the server last said the map should mark besides the quest givers: the rest of your party. */
  let mapPartyPins: { name: string; x: number; z: number }[] = [];
  /** The pins for this frame: quest givers (Adventure) and party members. Far-off places in another map (a dungeon copy) are left out. */
  function mapPins(): MapPin[] {
    const pins: MapPin[] = [];
    const near = (x: number, z: number, r: number): boolean => Math.hypot(x - body.x, z - body.z) < r;
    if (KIND === 'adventure') {
      const log = useUi.getState().quests;
      for (const n of NPCS) {
        if (n.dungeon) continue; // (a dungeon's person is in a map of its own)
        const kind = log.markerFor(n.id);
        if (kind && near(n.x, n.z, 400)) pins.push({ kind, name: n.name, x: n.x, z: n.z });
      }
    }
    for (const p of mapPartyPins) if (near(p.x, p.z, 3000)) pins.push({ kind: 'party', name: p.name, x: p.x, z: p.z });
    // Your own land, so that home can be found from afar: the middle of each claim (the map keeps it at the edge when it is out of view).
    for (const c of useUi.getState().land.mine) {
      if (c.status === 'released' || c.status === 'revoked') continue;
      pins.push({ kind: 'land', name: c.name, x: (c.box[0] + c.box[2] + 1) / 2, z: (c.box[1] + c.box[3] + 1) / 2 });
    }
    return pins;
  }
  function setMapUp(up: boolean): void {
    if (useUi.getState().mapUp !== up) useUi.setState({ mapUp: up });
  }
  const entityLight = new EntityLight((x, z) => world.surfaceY(x, z), torchGlow);
  mobRenderer.setEnvironment(entityLight);
  players.setEnvironment(entityLight);
  players.roofAt = (x, y, z) => roofGap(world, createBody(x, y, z));
  players.isWater = (x, y, z) => isWaterBlock(world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
  drops.setEnvironment(entityLight);
  campfireFood.setEnvironment(entityLight);
  signBoards.setEnvironment(entityLight);
  scene.add(mobRenderer.group);
  const vehicleRenderer = new VehicleRenderer();
  vehicleRenderer.setEnvironment(entityLight);
  scene.add(vehicleRenderer.group);
  // Everything that walks, rides or rolls casts a shadow on the ground (?noentshadows turns it off).
  if (!params.has('noentshadows')) shadows?.setCasters(players.group, selfView.group, mobRenderer.group, vehicleRenderer.group);

  const input = new Input(canvas, signal);

  // ---- target highlight ----------------------------------------------
  const highlightGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
  const highlight = new THREE.LineSegments(highlightGeo, new THREE.LineBasicMaterial({ color: 0x000000 }));
  highlight.visible = false;
  scene.add(highlight);
  // The breaking animation: ten stages of cracks drawn over every face of the block being mined.
  const crackTexture = makeCrackTexture();
  const crack = new THREE.Mesh(
    new THREE.BoxGeometry(1.004, 1.004, 1.004),
    new THREE.MeshBasicMaterial({ map: crackTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  crack.visible = false;
  scene.add(crack);
  // Water and glass share a shader that is built the first time one of them is drawn. This sliver stays hidden, and the
  // warm-up draws it with the other hidden things, so the first lake or window does not stop the game.
  const glassGeo = new THREE.PlaneGeometry(0.02, 0.02);
  glassGeo.setAttribute('aTile', new THREE.BufferAttribute(new Float32Array(4), 1));
  glassGeo.setAttribute('aLight', new THREE.BufferAttribute(new Float32Array(16), 4));
  const glassWarm = new THREE.Mesh(glassGeo, world.materials.translucent);
  glassWarm.visible = false;
  glassWarm.frustumCulled = false;
  glassWarm.position.set(0, -8, 0);
  scene.add(glassWarm);

  const hud = new Hud();
  /** The admin bar at the top centre (F2, or ?admin): the choice is remembered. */
  const admin = new AdminBar(
    document.getElementById('admin-bar')!,
    params.has('admin') ||
      ((): boolean => {
        try {
          return localStorage.getItem('solrift-admin') === 'on';
        } catch {
          return false;
        }
      })(),
  );
  let flash = 0;

  // ---- load the save (migrating the pre-versioning localStorage format on first run) ----
  let savedPlayer: PlayerSave | null = null;
  let savedWorld: WorldState | null = null;
  try {
    if (!online && !guest) {
      await store.importLegacy();
      savedPlayer = await store.loadPlayer();
      savedWorld = await store.loadWorldState();
    }
  } catch (err) {
    if (err instanceof SaveError) {
      store.freeze(); // never overwrite a save we cannot read
      world.dispose();
      renderer.dispose();
      throw new Error(`This world cannot be loaded: ${err.message}. Nothing was changed.`);
    }
    console.warn('failed to read save', err);
  }
  if (local && savedWorld) {
    local.loadWorldState(savedWorld, { weather: !params.has('weather') });
    sky.time = session.time;
  }
  if (local && (startWeather === 'rain' || startWeather === 'thunder' || startWeather === 'clear')) {
    local.weather.set(startWeather, 100000);
    weather.rain = startWeather === 'clear' ? 0 : 1;
    weather.storm = startWeather === 'thunder' ? 1 : 0;
  }
  if (local && savedPlayer) {
    local.loadPlayer(savedPlayer, forcedMode !== null);
    input.yaw = local.yaw;
    input.pitch = local.pitch;
  }

  // ---- loopback link: client <-> session ------------------------------------

  // The recipe book: remembers which items this player has held (per world, on this device). See recipeMemory.ts.
  const recipes = new RecipeMemory(session, `solrift-recipes-${LocalSaveStore.scopeKey()}${online ? 'online' : worldId}`, !guest);

  /** Mirror session state into the React store, and react to screen changes: see uiSync.ts. */
  const syncUi = makeUiSync(session, input, overlay, recipes);

  // What is shown and played for each thing the game says has happened: see gameEvents.ts.
  const handleEvents = makeEventHandler({
    session, input, camera, hud, audio, particles, damageNumbers, hand, selfView, players, feel, abilityFx, emberFx, mountFx, levelFx, panOf, footDust,
    hurtFlash: () => void (flash = 1),
    setPartyPins: (party) => void (mapPartyPins = party),
    breakSelf: () => breakSelf(),
    landEvent: (e) => land.onEvent(e),
    signEdit: (x, y, z, lines) => windows.openSignEdit(x, y, z, lines),
  });

  const link = local
    ? new LoopbackLink(new SessionHost(local), (events) => {
        handleEvents(events);
        syncUi();
      })
    : null;
  /** One door for everything the player does: the loopback session, or the server. */
  function sendCommand(c: Command): void {
    if (link) link.send(c);
    else remote!.command(c);
  }

  /** Dev back door: run something directly on the session, then deliver the events it caused. */
  function act<T>(fn: () => T): T {
    const r = fn();
    link?.flush();
    syncUi();
    return r;
  }

  // The windows over the game (quest log, party, social, trade, a player's menu) and who has the mouse: see gameWindows.ts.
  const windows = makeWindows({ session, remote, online, input, chat, overlay, sendCommand });
  const { showTrade } = windows;

  // The Land Surveyor: marking corners, the live price, the confirmation and the window of the player's lands (see landClient.ts).
  const land = makeLandClient({
    session, input, camera, scene, world, sendCommand,
    toast: (text) => hud.toast(text),
    mouse: (up) => {
      if (up) {
        if (document.pointerLockElement) document.exitPointerLock();
      } else if (session.screen === 'none') windows.relockIfFree();
    },
    mote: (x, y, z, vx, vy, vz, fall, life, size, r, g, b) => particles.mote(x, y, z, vx, vy, vz, fall, life, size, r, g, b),
    chime: () => audio.quest('done'),
    hand: hand.surveyor,
  });

  // The needle of the compass, and whether the map is carried : see compassNeedle.ts.
  const compassNeedle = new CompassNeedle(session, input, hand, KIND);
  // The target frame (online): the player the crosshair rests on. See targeting.ts.
  const targets = remote ? new TargetPicker(remote, session, input, camera) : null;
  // ...and the same for a creature (an animal, a monster, a person), in any game: the frame shows its tier, level and health.
  const mobTargets = new MobTargetPicker(session, input, camera, (x, y, z) => BLOCKS[world.getBlock(x, y, z)]?.opaque === true);
  /** A living monster within ten blocks: the figure stands to fight (see Character.engaged). */
  const hostileNear = (x: number, y: number, z: number): boolean => {
    for (const m of session.mobs.mobs) {
      if (m.dead || !MOBS[m.kind]?.hostile) continue;
      const dx = m.body.x - x;
      const dz = m.body.z - z;
      if (dx * dx + dz * dz < 100 && Math.abs(m.body.y - y) < 6) return true;
    }
    return false;
  };
  /** The spellbook (key K): the third tab of the inventory window, which opens on it. */
  function openSpellbook(): void {
    if (!session.classView() || session.screen !== 'none' || session.mode === 'creative') return;
    useUi.setState({ invTab: 'spells' });
    sendCommand({ t: 'inventory' });
  }
  mobRenderer.markerFor = KIND === 'adventure' ? (npc) => useUi.getState().quests.markerFor(npc) : null;

  // The World Beyond: its atmosphere, the specks in the air, and the Codex of what the traveller has found.
  let noteKey = 0;
  const pushNote = (kind: 'discovery' | 'achievement', title: string, text: string): void => {
    const key = ++noteKey;
    useUi.setState((s) => ({ beyondNotes: [...s.beyondNotes.slice(-3), { key, kind, title, text }] }));
    setTimeout(() => useUi.setState((s) => ({ beyondNotes: s.beyondNotes.filter((n) => n.key !== key) })), 6500);
  };
  const codexView = (log: DiscoveryLog, here: number): CodexView => {
    const j = log.toJSON();
    return { here, biomes: j.b, structures: j.s, caves: j.c, achievements: j.a };
  };
  const beyond: BeyondClient | null =
    KIND === 'beyond'
      ? new BeyondClient(session.generator, worldId, {
          onDiscover: (d) => {
            pushNote('discovery', d.name, d.desc);
            chat.add(`Discovered: ${d.name} (${d.family})`, 'notice');
          },
          onAchievement: (a) => {
            pushNote('achievement', a.name, a.desc);
            chat.add(`Achievement: ${a.name}`, 'notice');
          },
          onChange: (log, here) => useUi.setState({ codex: codexView(log, here) }),
        })
      : null;
  if (beyond?.active) useUi.setState({ codex: codexView(beyond.log, beyond.here) });

  useUi.setState({
    adventure: KIND === 'adventure',
    map: mapData,
    mapUp: false,
    questLogOpen: false,
    partyOpen: false,
    social: null,
    socialOpen: false,
    inspect: null,
    target: null,
    playerMenu: null,
    signEdit: null,
    trade: null,
    tradeAsk: null,
    invTab: 'inventory',
    dialogNpc: null,
    shopOpen: false,
    auction: null,
    stash: null,
    api: makeUiApi({ session, remote, input, chat, icons, store, guest, recipes, windows, sendCommand, openSpellbook }),
    mode: session.mode,
    hardcore: session.hardcore,
    spectating: session.spectating,
    selected: session.selected,
    screen: 'none',
    health: session.vitals.health,
    hunger: session.vitals.hunger,
    air: session.vitals.air,
    level: session.xp.level,
    xpProgress: session.xp.progress,
    coins: session.coins,
    armor: session.defense,
  });
  bumpUi();

  // ---- networking (optional) -----------------------------------------
  const net = online
    ? null
    : new NetClient(process.env.NEXT_PUBLIC_SERVER_URL ?? `ws://${location.hostname}:8787`, 'player', () => {
        const s = net!.state;
        hud.setNet(s.connected ? `online - ${s.pingMs}ms - ${s.players} player(s)${s.user ? ` - ${s.user}` : ''}` : 'offline (single-player)', s.connected);
      });
  net?.connect();
  if (net) saveBridge.reconnectNet = () => net.reconnect();

  // ---- the player's settings (see settings.ts): applied now, and each time one changes ----
  const BASE_SENSITIVITY = input.sensitivity;
  let shownSettings: Settings | null = null;
  let previewTimer = 0;
  const applySettings = (s: Settings): void => {
    audio.setLevels({ master: s.master, effects: s.effects, ambience: s.ambience, muted: s.muted });
    audio.musicVolume = s.music;
    input.sensitivity = BASE_SENSITIVITY * s.sensitivity;
    input.invertY = s.invertY;
    feel.baseFov = s.fov;
    shadowsUserOff = !s.shadows;
    adaptiveOn = s.adaptive;
    // The finishing of the picture (the keys F6 to F10 change the same settings).
    if (!fxForced && (!shownSettings || (['ao', 'glow', 'grade', 'rays', 'menuBlur'] as const).some((k) => shownSettings![k] !== s[k]))) {
      Object.assign(fxWanted, { ao: s.ao, glow: s.glow, grade: s.grade, rays: s.rays, menuBlur: s.menuBlur });
      applyPostfx();
    }
    if (world.renderDistance !== s.renderDistance) world.setRenderDistance(s.renderDistance);
    // A slider for the sounds is heard as it is moved: one knock of a block, once it has stopped for a moment.
    if (shownSettings && (shownSettings.master !== s.master || shownSettings.effects !== s.effects) && !s.muted) {
      window.clearTimeout(previewTimer);
      previewTimer = window.setTimeout(() => {
        audio.resume();
        audio.play('stone', 'place', 0.9);
      }, 140);
    }
    shownSettings = s;
  };
  applySettings(getSettings());
  const stopSettings = subscribeSettings(applySettings);
  signal.addEventListener('abort', () => {
    stopSettings();
    window.clearTimeout(previewTimer);
  });

  // ---- loop -----------------------------------------------------------
  let last = performance.now();
  let fps = 0;
  /** Draw calls and triangles of the last scene render (the hand is drawn separately afterwards). */
  let sceneCalls = 0;
  let sceneTris = 0;
  /** Triangles drawn into the shadow maps this frame. */
  let shadowTris = 0;
  let fpsFrames = 0;
  let fpsTime = 0;
  let saveTimer = 0;
  let rafId = 0;
  let stopped = false;
  let lastFar = 0;
  /** 0..1 how black the screen is while sleeping; it fades up in bed and back down on waking. */
  let sleepFade = 0;
  let wasSleeping = false;
  let textPrimed = false;

  /** Wait for the terrain around the player, then let the session start. */
  function tryFinishLoading(): void {
    const pcx = Math.floor(body.x / 16);
    const pcz = Math.floor(body.z / 16);
    let total = 0;
    let done = 0;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        total++;
        if (world.isChunkMeshed(pcx + dx, pcz + dz)) done++;
      }
    }
    const pct = Math.round((done / total) * 100);
    // Footsteps, and the pictures of every item, are built a little at a time. The first step and the first
    // opening of the inventory would otherwise stop the game while they are made.
    if (!textPrimed) {
      textPrimed = true;
      chat.prepare();
      damageNumbers.warm();
    }
    const soundsReady = audio.warm(6);
    const iconsReady = icons.warm(done >= total && !figureWarm ? 14 : 6);
    const textReady = warmText(done >= total && !figureWarm ? 8 : 4);
    // While the warm-up (see `FigureWarm`) goes, the words and the bar are its (they are set in the frame, see there).
    const warming = !figureWarmStarted || !!figureWarm;
    if (!warming && done >= total && !soundsReady) {
      statusEl.textContent = 'Preparing sounds...';
      setLoading('Preparing sounds...', 92);
    } else if (!warming && done >= total && !iconsReady) {
      statusEl.textContent = 'Preparing the inventory...';
      setLoading('Preparing the inventory...', 96);
    } else if (!warming && done >= total && !textReady) {
      statusEl.textContent = 'Preparing text...';
      setLoading('Preparing text...', 98);
    } else if (!warming && done >= total && !handWarm) {
      statusEl.textContent = 'Preparing the hand...';
      setLoading('Preparing the hand...', 99);
    } else if (!warming) {
      statusEl.textContent = `Generating world... ${pct}%`;
      setLoading(`Generating world... ${pct}%`, 40 + Math.round(pct * 0.58));
    }
    // The hand's shader is built the frame after the words go up: the card can take seconds, and that wait stays on this screen.
    if (!warming && done >= total && soundsReady && iconsReady && textReady && !handWarm) {
      if (!handAnnounced) {
        handAnnounced = true;
        return;
      }
      hand.warm(renderer);
      handWarm = true;
    }
    if (done < total || warming || !soundsReady || !iconsReady || !textReady || !handWarm) return;
    damageNumbers.release();
    if (local) act(() => local.finishLoading());
    else remote!.ready = true;
    statusEl.textContent = '';
    // Whatever the bags and the clothes got while the world was loading is shown now (the hotbar only redraws when told to).
    bumpUi();
    enterWorld();
  }

  let entered = false;
  /**
   * The world is ready: go straight in, with the mouse taken, instead of stopping at the pause screen. A browser only
   * hands over the mouse after a click or key press, so when that was too long ago (or the page was just opened, as it
   * is for the online realm) the loading screen turns into the "Enter the world" button.
   */
  function enterWorld(): void {
    if (entered) return;
    entered = true;
    // Developers and tests (?debug) keep the pause screen as the way in.
    if (params.has('debug') || !loadingEl) return hideLoading();
    setLoading('World ready', 100);
    overlay.style.display = 'none';
    audio.resume();
    void input.lock().then((ok) => {
      if (ok || input.locked) hideLoading();
      else loadingEl.classList.add('ready');
    });
  }

  // Keys that start something (as opposed to held keys, which go in the frame): see gameKeys.ts.
  const keys = new KeyActions({
    session, remote, online, input, world, hud, admin, chat, audio, selfView, chase, windows, sendCommand, openSpellbook, land,
    quality: () => qualityLevel,
  });

  function buildFrame(dt: number, cam: { x: number; y: number; z: number } | null = null): InputFrame {
    const round = (v: number): number => Math.round(v * 100) / 100;
    return {
      t: 'frame',
      dt,
      locked: input.locked,
      yaw: input.yaw,
      pitch: input.pitch,
      ...(cam ? { cam: [round(cam.x), round(cam.y), round(cam.z)] as [number, number, number] } : {}),
      forward: (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0),
      strafe: (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0),
      jump: input.isDown('Space'),
      sprint: keys.sprinting || input.isDown('ControlLeft'),
      sneak: input.isDown('ShiftLeft'),
      left: input.leftDown,
      right: input.rightDown,
    };
  }

  /** What the admin bar shows besides the frame's own numbers. */
  const adminDetails = (): AdminDetails => {
    const w = world.refreshStats();
    return {
      chunksMeshed: w.meshed,
      chunksLoaded: w.loaded,
      chunksQueued: w.pendingGen,
      renderDistance: world.renderDistance,
      mobs: session.mobs.mobs.length,
      drops: session.drops.count,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0,
      programsBuilt: shaderKeeper.built,
      hitch: lastHitch ? `${describeHitch(lastHitch, 3)}${hitchShaders(lastHitch)}, ${Math.round((performance.now() - lastHitch.at) / 1000)} s ago` : 'none',
      width: renderer.domElement.width,
      height: renderer.domElement.height,
      quality: qualityLevel,
      shadows: shadows !== null && !shadowsOff && !shadowsUserOff,
      net: remote ? { ping: remote.connected ? remote.pingMs : null, players: remote.others.size + 1 } : null,
    };
  };

  /** A frame, and its measure for the admin bar. */
  function tick(now: number): void {
    if (stopped) return;
    const began = performance.now();
    const frameMs = now - last;
    const hitch = hitches.begin(now, frameMs);
    if (hitch && session.ready && hitch.at - hiddenAt > hitch.ms + 50) {
      lastHitch = hitch;
      console.info(`[solrift] freeze of ${describeHitch(hitch, 6)}${hitchShaders(hitch)}`);
    }
    renderer.info.reset();
    shadowTris = 0;
    frame(now);
    shaderKeeper.hold();
    hitches.end(shaderKeeper.fresh);
    if (admin.visible) admin.frame(frameMs, performance.now() - began, renderer.info.render.calls, renderer.info.render.triangles, shadowTris, adminDetails);
  }

  function frame(now: number): void {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (autoQuality && adaptiveOn && session.ready && document.visibilityState === 'visible' && qualityLevel < 4) {
      aqTime += dt;
      aqFrames++;
      if (aqTime >= 2.5) {
        aqSlow = aqTime / aqFrames > 1 / 36 ? aqSlow + 1 : 0;
        aqTime = 0;
        aqFrames = 0;
        if (aqSlow >= 2) {
          aqSlow = 0;
          stepQuality();
        }
      }
    }

    fpsFrames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      fps = Math.round(fpsFrames / fpsTime);
      fpsFrames = 0;
      fpsTime = 0;
    }

    world.update(body.x, body.z);
    if (!session.ready) tryFinishLoading();
    else if (input.locked && loadingEl && !loadingEl.classList.contains('gone')) hideLoading();

    const playing = input.locked && session.screen === 'none';
    // The map: keep it painted, and raise or lower the map item on a right click while it is in hand.
    const rightClick = input.consumeRightClick();
    if (session.ready) {
      const roof = world.surfaceY(Math.floor(body.x), Math.floor(body.z));
      // In a dungeon copy the map is that dungeon alone: its level at head height, and only the people and places inside it.
      mapData.inside = KIND === 'adventure' ? instanceFootprint(body.x, body.z) : null;
      mapData.underground = !!mapData.inside || (roof >= 0 && roof - body.y > 6);
      mapData.update(body.x, body.y, body.z, input.yaw);
      // What the minimap calls the place: worked out a couple of times a second, written only when it changes.
      placeWait -= dt;
      if (placeWait <= 0) {
        placeWait = 0.4;
        const place = placeNameAt(session.generator, body.x, body.y, body.z, KIND === 'adventure');
        if (useUi.getState().place !== place) useUi.setState({ place });
      }
      const box = mapData.inside;
      const within = (x: number, z: number): boolean => !box || (x >= box.x0 && x <= box.x1 + 1 && z >= box.z0 && z <= box.z1 + 1);
      mapData.pins = mapPins().filter((p) => within(p.x, p.z));
      // Party members are drawn as pins (they are seen from any distance), the rest as plain dots.
      const inParty = new Set(mapPartyPins.map((p) => p.name));
      mapData.others = remote ? [...remote.others.values()].filter((o) => !inParty.has(o.name)).filter((o) => within(o.x, o.z)).map((o) => ({ name: o.name, x: o.x, z: o.z })) : [];
      // The map opens in the hands, so only in first person, and only the one in the hand (the one in the off hand is just carried, open to glance at).
      const readable = selfView.mode === 0 && isMap(session.held);
      // (Aimed at a villager or a quest giver, the click talks to it instead: the map stays as it is, or closes when the talk opens.)
      if (playing && readable && rightClick && !session.aimsAtTalker) setMapUp(!useUi.getState().mapUp);
      else if (useUi.getState().mapUp && (!playing || !readable || session.sleeping || session.spectating)) setMapUp(false);
    }
    // Mouse 3 puts the third-person camera on the other shoulder (the choice is kept for next time).
    if (input.consumeMiddleClick() && playing && selfView.mode === 1) {
      chase.swapShoulder();
      localStorage.setItem('solrift-shoulder', chase.shoulder === 1 ? 'right' : 'left');
    }
    if (session.ready && playing) keys.handle();
    // From behind, the camera is placed before the frame is sent: the game aims at what its crosshair is on (see `aimThroughCrosshair`).
    // The camera and the body are both placed from one smoothed position (see `viewPos`), taken here, so the body never jitters against the camera.
    // The draw of a bow arrives in steps (a tick of the game at a time, and a whole snapshot late online) and drops to nothing at the shot. What is
    // shown comes from two smoothed copies: `drawShown` for the hand and the figure rises smoothly but falls at once (they watch for the shot
    // itself), `zoomShown` for the view's zoom and the camera coming in rises and falls smoothly (the shot gives it a quick, soft release).
    {
      const raw = session.bowDraw;
      drawShown = raw <= drawShown ? raw : drawShown + (raw - drawShown) * (1 - Math.exp(-Math.min(dt, 0.1) * 26));
      if (drawShown > raw - 0.002) drawShown = raw;
      zoomShown += (raw - zoomShown) * (1 - Math.exp(-Math.min(dt, 0.1) * (raw > zoomShown ? 22 : 9)));
      if (Math.abs(raw - zoomShown) < 0.002) zoomShown = raw;
    }
    const view = session.viewPos();
    const viewEye = session.eyeAt(view);
    // Flying on wings (the flight of creative mode has no wings, and no change of view).
    const wingFlight = session.flying && session.mode === 'survival' && !!session.wingSlot.get(0) && session.mountView().mount === 0;
    const chasing =
      selfView.mode === 1 && session.ready
        ? chase.update(dt, viewEye, input.yaw, input.pitch, cameraSolid, session.mountView().mount > 0, zoomShown, Math.hypot(body.vx, body.vz), wingFlight)
        : null;
    if (link) link.send(buildFrame(dt, chasing));
    else remote!.frame(buildFrame(dt, chasing));
    syncUi();
    hitches.lap('input');
    stabClock += dt;
    if (session.ready && playing && input.leftDown && !land.holding) {
      if (bowHeld()) {
        // A bow takes both hands and does not attack. A left click puts it away and brings out the dagger, which stabs (whether or not
        // anything is in reach); a moment after the last stab the bow comes back. The click is remembered until the dagger is out.
        if (hasStabDagger() && session.bowDraw < 0.02) {
          stabClock = 0;
          stabQueued = true;
        }
      } else {
        hand.swingIfIdle();
        selfView.swingIfIdle();
      }
    }
    if (stabQueued && stabbing()) {
      // (in first person the dagger has to be up in the hand first; in third person the figure stabs at once)
      if (selfView.mode !== 0 ? selfView.stab() : hand.stab()) {
        stabQueued = false;
        audio.ability('dagger_swish', 0.7);
      }
    } else if (!stabbing()) stabQueued = false;

    // The red damage flash fades in real time, even while the simulation is paused.
    flash = Math.max(0, flash - dt / 0.6);
    feel.fade(dt);
    hud.setDamageFlash(flash);

    // Lying in bed: turn to look down the bed, and fade the screen to black (and back up on waking).
    const sleeping = session.sleeping;
    if (sleeping && !wasSleeping) {
      input.yaw = Math.atan2(BED_DIRS[sleeping.dir][0], BED_DIRS[sleeping.dir][1]);
      input.pitch = 0;
    }
    wasSleeping = !!sleeping;
    sleepFade += ((sleeping ? 1 : 0) - sleepFade) * Math.min(1, dt * (sleeping ? 1.3 : 1.6));
    if (sleepFade < 0.01 && !sleeping) sleepFade = 0;
    const shownFade = Math.round(sleepFade * 40) / 40;
    if (useUi.getState().sleep !== shownFade || useUi.getState().sleeping !== !!sleeping) useUi.setState({ sleep: shownFade, sleeping: !!sleeping });

    const eye = session.eye();
    // The view stays as it is when mounting (first person: you see the head of the mount ahead of you, from the saddle).
    const mountNow = session.mountView().mount;
    const wornNow = session.outfitSlot.get(0)?.id ?? 0;
    if (wornNow !== wornShown) {
      wornShown = wornNow;
      const set = outfitSetFits(wornNow, session.classView()?.id ?? null) ? (outfitSetOfItem(wornNow)?.id ?? null) : null;
      const dressed = paletteOfCode(wornCode(plainCodeOf(myLook), set));
      selfView.setLook(dressed);
      hand.setLook(dressed);
      useProfile.setState({ outfit: set });
    }
    const pose = chasing ?? cameraPose(selfView.mode, viewEye, input.yaw, input.pitch, cameraSolid, undefined, mountNow > 0);
    selfView.cameraInHead = !!chasing?.bodyHidden;
    camera.position.set(pose.x, pose.y, pose.z);
    camera.rotation.set(pose.pitch, pose.yaw, 0);
    // What the view does on top of that (see ViewFeel): first the shake, the dip of a landing and the kick of a blow...
    const classNow = session.classView();
    const feelNow: FeelFrame = { dt, ready: session.ready, firstPerson: selfView.mode === 0, body, yaw: input.yaw, bowDraw: zoomShown, rush: classNow?.rush, slam: classNow?.slam ?? 0, flying: wingFlight };
    feel.jolt(camera, feelNow);
    // (the warrior's Charge streaks light past; the ranger's roll has its own look, the wind at the sides)
    rushLines.update(dt, !!classNow?.rush && !classNow.rush.roll, camera);
    guardVeil.update(dt, selfView.mode === 0 && session.ready && classNow?.id === 'warrior' && classNow.guard > 0, camera);
    arcaneVeil.update(dt, selfView.mode === 0 && session.ready && classNow?.id === 'mage' && classNow.shield > 0, camera);
    damageNumbers.update(dt, camera);
    // ...then what a dash or a Ground Slam does to it, and the angle of the lens.
    const dash = feel.carry(camera, feelNow);
    // (?nowind leaves the wind of a dash out: a page layer over the picture, for telling whether a freeze is its doing.)
    windBlur.update(dt, noWind ? 0 : dash.wind, dash.lateral);

    // Target highlight, mining cracks and the action bar all read the session's aim state.
    const target = session.target;
    highlight.visible = !!target;
    if (target) highlight.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    crack.visible = !!target && session.breakProgress > 0;
    if (crack.visible) {
      crack.position.copy(highlight.position);
      setCrackStage(crackTexture, Math.floor(Math.min(0.999, session.breakProgress) * CRACK_STAGES));
    }
    hud.setBreakProgress(session.hudProgress);
    // The Land Surveyor: its click, its stakes and its walls of light (every frame, so that a click is never kept for later).
    land.update(dt, playing && session.ready, input.consumeLeftClick(), rightClick);

    sky.time = session.time;
    sky.rain = weather.rain;
    // (The World Beyond's skies: an eternal night under a sky that gives little light.)
    sky.dim = beyond ? Math.min(0.92, 1 - (1 - weather.darkness) * beyond.feel.light) : weather.darkness;
    sky.flash = weather.flash;
    sky.update(camera);
    const fogFar = world.renderDistance * 16;
    const fogScale = (1 - 0.35 * weather.rain) * (beyond ? 1 - 0.8 * beyond.feel.fog : 1);
    const light = sky.lighting;
    if (body.eyeInWater) {
      const lava = body.eyeInLava === true;
      const water = lava ? new THREE.Color(0xc2480a) : new THREE.Color(0x1b3a8a).multiplyScalar(sky.brightness);
      world.setFog(water, 0.1, lava ? 4 : 22);
      scene.background = water;
      sky.setView(water, 0, true);
      light.glow.setScalar(0);
    } else {
      const sy = world.surfaceY(Math.floor(camera.position.x), Math.floor(camera.position.z));
      const under = sy >= 0 && camera.position.y < sy - 2 ? 1 : 0;
      caveDark += (under - caveDark) * Math.min(1, dt * 1.5);
      caveFog.copy(sky.color).multiplyScalar(1 - 0.94 * caveDark);
      // The haze of the place tints the distance (a desert's dust, a swamp's green, a blizzard's white).
      if (beyond && beyond.feel.fogColor && beyond.feel.fogMix > 0.01) {
        const fc = beyond.feel.fogColor;
        beyondTint.setRGB(fc[0] / 255, fc[1] / 255, fc[2] / 255, THREE.SRGBColorSpace).multiplyScalar(0.2 + 0.8 * sky.brightness);
        caveFog.lerp(beyondTint, beyond.feel.fogMix * (1 - caveDark));
      }
      sky.setView(caveFog, caveDark, false);
      world.setFog(caveFog, fogFar * 0.55 * fogScale * (1 - 0.45 * caveDark), fogFar * 0.98 * fogScale * (1 - 0.35 * caveDark), sky.domeZenith);
      scene.background = caveFog;
      light.glow.multiplyScalar(1 - caveDark);
      // Walking into lush, dripstone or deep dark country shows its name, as walking into a village does.
      caveBannerWait -= dt;
      if (caveBannerWait <= 0) {
        caveBannerWait = 0.6;
        const px = Math.floor(camera.position.x);
        const pz = Math.floor(camera.position.z);
        // (Against the land as the world made it: a house on the ground is not a cave, however tall its rooms.)
        const kind = under ? caveKindHere(session.generator, px, camera.position.y, pz, KIND === 'adventure') : 'plain';
        if (kind !== lastCaveKind) {
          lastCaveKind = kind;
          if (kind !== 'plain') showZone(kind === 'lush' ? 'lush_cave' : kind === 'dripstone' ? 'dripstone_cave' : 'deep_dark');
        }
      }
    }
    hud.setUnderwater(body.eyeInWater, body.eyeInLava === true);
    world.setDay(sky.brightness);
    world.setTime(performance.now() / 1000);
    world.materials.setLighting(light);
    // An item that gives light (a lantern: see `ItemDef.heldLight`) in either hand lights up its surroundings (the main hand's wins):
    // a point of its light by the hand.
    const handLamp = getItem(session.held ? session.held.id : 0).heldLight ?? getItem(session.offhand.get(0)?.id ?? 0).heldLight;
    if (handLamp && !body.eyeInWater && session.screen !== 'dead' && !session.spectating) {
      camera.getWorldDirection(heldLightDir);
      heldLightAt.copy(camera.position).addScaledVector(heldLightDir, 0.5);
      heldLightAt.y -= 0.25;
      heldLightColor.setRGB(handLamp.r, handLamp.g, handLamp.b);
      world.materials.setHeldLight(heldLightAt, heldLightColor, handLamp.level);
    } else {
      // No lamp in hand: the slot of the light by the hand lights the cave round a burning boss (the Hollow King) instead.
      let king: (typeof session.mobs.mobs)[number] | null = null;
      for (const mob of session.mobs.mobs) if (mob.kind === 'hollow_king' && !mob.dead && (!king || Math.hypot(mob.body.x - camera.position.x, mob.body.z - camera.position.z) < Math.hypot(king.body.x - camera.position.x, king.body.z - camera.position.z))) king = mob;
      if (king && Math.hypot(king.body.x - camera.position.x, king.body.z - camera.position.z) < 40) {
        heldLightAt.set(king.body.x, king.body.y + 4.6, king.body.z);
        heldLightColor.setRGB(1, 0.46, 0.14);
        world.materials.setHeldLight(heldLightAt, heldLightColor, 20 + 1.2 * Math.sin(performance.now() / 160));
      } else world.materials.setHeldLight(heldLightAt, heldLightColor, 0);
    }
    // Shadows only matter while the sun (or moon) shines on the open; underground and underwater they would be wasted work.
    if (shadows) {
      // (Not before the warm-up is over: it builds the depth shader of the maps, and the first chunks drawn into one would build it in the middle of the loading.)
      const warmingUp = !figureWarmStarted || figureWarm !== null;
      if (!shadowsOff && !shadowsUserOff && !warmingUp && light.sun.r > 0.02 && caveDark < 0.7 && !body.eyeInWater) {
        shadowFocus.copy(camera.position);
        const before = renderer.info.render.triangles;
        shadows.update(renderer, scene, shadowFocus, sky.lightDir, sky.lightHeight, performance.now() / 1000);
        shadowTris = renderer.info.render.triangles - before;
      } else shadows.suspend();
    }
    hitches.lap('light');
    updateWeatherFx(dt);
    torchGlow.soulLights(world.materials.soulLights, SOUL_LANTERN_LIGHT + 1);
    torchGlow.update(dt, camera.position, (x, y, z) => world.getBlock(x, y, z), sky.brightness, performance.now() / 1000, !body.eyeInWater && !params.has('nohalos'));
    campfireSmoke -= dt;
    if (campfireSmoke <= 0) {
      campfireSmoke = 0.45;
      const cx = Math.floor(camera.position.x);
      const cy = Math.floor(camera.position.y);
      const cz = Math.floor(camera.position.z);
      for (let y = cy - 4; y <= cy + 4; y++) {
        for (let z = cz - 8; z <= cz + 8; z++) {
          for (let x = cx - 8; x <= cx + 8; x++) {
            if (campfireInfo(world.getBlock(x, y, z))?.lit) particles.smoke(x + 0.5, y + 0.55, z + 0.5);
          }
        }
      }
    }
    entityLight.update(sky);
    particles.update(dt);
    deathFx.update(dt);
    particles.setBrightness(sky.brightness);
    drops.setBrightness(sky.brightness);
    remote?.update(dt);
    updateNetText(dt);
    players.setBrightness(sky.brightness);
    if (remote) {
      players.sync(remote.others.values(), dt, camera.position);
      targets?.update();
    }
    mobTargets.update();
    {
      // The companions: yours (the one in your companion slot) and those of the players in view.
      const owners: PetOwner[] = [];
      const mine = companionOfItem(session.companionSlot.get(0)?.id ?? 0);
      if (mine && session.screen !== 'dead' && !session.spectating) {
        const at = session.viewPos();
        owners.push({ key: -1, pet: COMPANIONS.indexOf(mine) + 1, x: at.x, y: at.y, z: at.z, yaw: selfView.mode !== 0 ? selfView.facing : input.yaw, lift: session.mountView().mount > 0 ? 0.8 : 0 });
      }
      if (remote) for (const o of remote.others.values()) if (o.pet && !o.dead) owners.push({ key: o.id, pet: o.pet, x: o.x, y: o.y, z: o.z, yaw: o.yaw, lift: o.mount ? 0.8 : 0 });
      companions.sync(owners, dt);
    }
    const heldId = session.held ? session.held.id : 0;
    compassNeedle.sync(dt);
    selfView.update(dt, {
      x: view.x,
      y: view.y,
      z: view.z,
      yaw: input.yaw,
      pitch: input.pitch,
      speed: Math.hypot(body.vx, body.vz),
      vx: body.vx,
      vz: body.vz,
      aiming: session.bowDraw > 0.02,
      bowDraw: drawShown,
      vy: body.vy,
      airborne: !body.onGround && !body.inWater && !body.onLadder,
      // Swimming: in water that comes up to the chest or has none under the feet (floating at the surface); wading in a shallow is still walking.
      afloat: body.inWater && !body.inLava && !body.onLadder && !session.flying && (isWaterBlock(world.getBlock(Math.floor(view.x), Math.floor(view.y + 1), Math.floor(view.z))) || isWaterBlock(world.getBlock(Math.floor(view.x), Math.floor(view.y - 0.5), Math.floor(view.z)))),
      sneaking: session.sneaking,
      wing: wingNumberOf(session.wingSlot.get(0)?.id ?? 0),
      winged: wingFlight,
      roof: session.wingSlot.get(0) ? roofGap(world, body) : 4,
      armor: [0, 1, 2, 3].map((i) => session.armor.get(i)?.id ?? 0),
      // A bow is held with both hands: the figure shows the dagger only while it stabs, with the bow put away.
      held: stabbing() ? 0 : heldId,
      glow: stabbing() ? null : glowColor(glowCode(session.held)),
      offGlow: glowColor(glowCode(session.offhand.get(0))),
      offhand: bowHeld() && hasStabDagger() && !stabbing() ? 0 : session.offhand.get(0)?.id ?? 0,
      blocking: session.blocking,
      eating: session.eatProgress > 0,
      slam: session.classView()?.slam ?? 0,
      charging: !!classNow?.rush && !classNow.rush.roll,
      casting: session.emberProgress,
      cls: classNow?.id ?? myClass,
      engaged: hostileNear(view.x, view.y, view.z),
      sleeping: sleeping ? sleeping.dir + 1 : 0,
      mount: mountNow > 0 ? (MOUNTS[mountNow - 1]?.id ?? null) : null,
      dead: session.screen === 'dead' || performance.now() < debugDeadUntil,
      brightness: sky.brightness,
      viewer: camera.position,
      light: entityLight,
    });
    chat.tick();
    drops.sync(session.drops.drops, camera.position, session.classView()?.id ?? myClass);
    const foods = local ? local.blockEntities.foods() : (remote?.campfires ?? []);
    campfireFood.sync(foods.filter((c) => Math.abs(c.x + 0.5 - camera.position.x) <= 64 && Math.abs(c.z + 0.5 - camera.position.z) <= 64));
    signBoards.sync(local ? local.blockEntities.signsNear(camera.position.x, camera.position.z, 48) : (remote?.signs ?? []), camera.position, 48);
    xpOrbs.sync(session.xpOrbs.orbs, camera, eye);
    rodLine.out = session.bobbers.bobbers.some((b) => b.own);
    bobbers.sync(session.bobbers.bobbers, dt, {
      camera,
      firstPerson: selfView.mode === 0,
      self: { x: view.x, y: view.y, z: view.z, yaw: selfView.mode !== 0 ? selfView.facing : input.yaw },
      brightness: sky.brightness,
    });
    hitches.lap('things');
    abilityFx.sync(session.fx, dt);
    hitches.lap('effects');
    // Someone else's level: the column stands on them and follows them (the mark is only the news; our own came with the event).
    for (const f of session.fx) {
      if (f.k !== 'level_up' || levelSeen.has(f.id)) continue;
      levelSeen.add(f.id);
      const who = remote ? [...remote.others.values()].find((p) => p.name === f.by) : undefined;
      if (!who) continue;
      levelFx.start(() => (remote!.others.has(who.id) ? { x: who.x, y: who.y, z: who.z } : null));
      audio.levelUp(0.4);
    }
    for (const id of levelSeen) if (!session.fx.some((f) => f.id === id)) levelSeen.delete(id);
    levelFx.update(dt);
    riftFx.update(dt, session.riftView());
    emberFx.update(dt, performance.now() / 1000);
    mountFx.update(dt, performance.now() / 1000);
    books.update(dt, eye, (x, y, z) => world.getBlock(x, y, z));
    // The creatures take notice of the player (heads turn, a shy animal freezes, a villager faces whoever visits).
    mobRenderer.setFocus(session.screen === 'dead' || session.spectating ? null : view);
    mobRenderer.sync(session.mobs.mobs, session.mobs.arrows, dt, sky.brightness);
    fire.update(dt);
    vehicleRenderer.sync(session.vehicles, sky.brightness);

    const far = fogFar * 2 + 100;
    if (far !== lastFar) {
      lastFar = far;
      camera.far = far;
      camera.updateProjectionMatrix();
    }

    const stats = world.refreshStats();
    hud.tick(dt, debugText(stats));
    updateBlockInfo();
    hitches.lap('things');
    const callsBefore = renderer.info.render.calls;
    const trisBefore = renderer.info.render.triangles;
    if (!figureWarmStarted) {
      figureWarmStarted = true;
      figureWarm = new FigureWarm({
        figure: figureOf,
        mobs: () => mobRenderer.warm(),
        inventory: () => {
          try {
            warmPreview();
          } catch {
            // (no second graphics context: the inventory goes without its figure)
          }
        },
        windows: warmWindows,
        bobber: () => bobbers.warm(),
        shadows: () => {
          shadows?.warmEntities(renderer);
          shadows?.warmTerrain(renderer);
        },
      });
      scene.add(figureWarm.group);
    }
    // One group of things per frame (the first frame only puts up the words); the last one also draws everything the world keeps hidden (see `FigureWarm`).
    const warmFrame = figureWarm !== null && figureWarmWait-- <= 0;
    if (warmFrame) figureWarm?.begin();
    figureWarm?.show(scene);
    if (postfx.on) {
      postfx.render({
        dt,
        dusk: sky.dusk,
        day: sky.day,
        underground: caveDark,
        rain: weather.rain,
        underwater: body.eyeInWater,
        menu: session.screen !== 'none' || !!figureWarm?.world,
        warm: !!figureWarm?.world,
      });
    } else {
      renderer.clear();
      renderer.render(scene, camera);
    }
    if (figureWarm && warmFrame && figureWarm.hide()) {
      scene.remove(figureWarm.group);
      figureWarm.dispose();
      figureWarm = null;
    } else if (figureWarm) {
      // What is put up now stays on the screen during the next frame, the one that does it.
      const next = figureWarm.status();
      const text = `${next.label} ${Math.round(next.fraction * 100)}%`;
      statusEl.textContent = text;
      setLoading(text, 12 + Math.round(next.fraction * 28));
    }
    sceneCalls = renderer.info.render.calls - callsBefore;
    sceneTris = renderer.info.render.triangles - trisBefore;
    hitches.lap('draw');

    const heldNow = session.held;
    hand.setLight(entityLight.at(body.x, body.y, body.z, handLight));
    // The hand that holds a light is lit by it: nothing about it goes dark.
    if (handLamp) hand.setLight(heldLightFull.setRGB(1, 1, 1));
    hand.setArmor([0, 1, 2, 3].map((i) => session.armor.get(i)?.id ?? 0));
    hand.visible = !debugHideHand && mountNow === 0 && session.screen !== 'dead' && !session.spectating && !body.eyeInWater && !session.sleeping && selfView.mode === 0;
    hand.setMapUp(useUi.getState().mapUp);
    hand.setDraw(drawShown);
    // A bow drawn: it creaks as it comes back, ticks at full draw (the crosshair pulses), and the view kicks when the arrow is loosed.
    {
      const draw = session.bowDraw;
      const use = heldNow ? getItem(heldNow.id).use : undefined;
      if (session.ready && (use === 'bow' || use === 'crossbow')) {
        if (bowWas < 0.02 && draw >= 0.02) audio.ability('bow_draw', 0.8, use === 'bow' ? 1 : 0.8);
        if (bowWas < 1 && draw >= 1) {
          audio.ability('bow_full', 0.9);
          hud.crosshairPulse();
        }
        if (bowWas >= 0.15 && draw < 0.02) feel.recoil(bowWas);
      }
      bowWas = draw;
    }
    const guardNow = session.classView();
    hand.setStance(guardNow?.rush && !guardNow.rush.roll ? 1 : guardNow && guardNow.id === 'warrior' && guardNow.guard > 0 ? 0.3 : 0);
    hand.setSlam(guardNow?.slam ?? 0, body.vy);
    // A bow is held with both hands: the dagger in the off hand is not shown (it is the one that comes out in the main hand for a stab).
    hand.quickSwap = bowHeld() && hasStabDagger() && stabClock < STAB_HOLD + 0.6;
    hand.offAway = bowHeld() && hasStabDagger() && !stabbing();
    // (the bow is put away, as nothing at all, while the dagger of the left hand stabs)
    const shownId = stabbing() ? -2 : heldNow ? heldNow.id : 0;
    hand.setGlow(stabbing() ? null : glowColor(glowCode(heldNow)));
    hand.setOffGlow(glowColor(glowCode(session.offhand.get(0))));
    hand.update(feel.hitStop > 0 ? dt * 0.1 : dt, shownId, body.onGround && session.ready ? Math.hypot(body.vx, body.vz) : 0, camera.aspect, session.offhand.get(0)?.id ?? 0, session.blocking, session.eatProgress, session.emberProgress);
    // Eating: a bite every quarter of a second, each with its crunch and a few crumbs of the food falling from the mouth.
    if (session.eatProgress > 0 && heldNow) {
      eatClock += dt;
      const bites = Math.floor(eatClock * CHEWS_PER_SECOND);
      if (bites > eatBites) {
        eatBites = bites;
        audio.munch();
        let mx: number;
        let my: number;
        let mz: number;
        if (selfView.mode === 0) {
          camera.getWorldDirection(eatDir);
          mx = camera.position.x + eatDir.x * 0.45;
          my = camera.position.y - 0.3;
          mz = camera.position.z + eatDir.z * 0.45;
        } else {
          const r = selfView.group.rotation.y;
          eatDir.set(-Math.sin(r), 0, -Math.cos(r));
          mx = selfView.group.position.x + eatDir.x * 0.28;
          my = selfView.group.position.y + 1.45;
          mz = selfView.group.position.z + eatDir.z * 0.28;
        }
        eatFx.burst(mx, my, mz, eatDir.x * 0.4, eatDir.z * 0.4, hand.crumbColors(heldNow.id), 4);
      }
    } else {
      eatClock = 0;
      eatBites = 0;
    }
    eatFx.update(dt);
    hitches.lap('hand');
    // The map in the hand is live: repainted a few times a second (more while it is open) when it can be seen.
    const mapShown = hand.visible && (isMap(heldNow) || isMap(session.offhand.get(0)));
    mapPaintWait -= dt;
    if (mapShown && (!mapWasShown || mapPaintWait <= 0)) {
      mapPaintWait = useUi.getState().mapUp ? 0.066 : 0.2;
      mapSheet.paint(mapData, useUi.getState().mapZoom);
    }
    mapWasShown = mapShown;
    hitches.lap('map');
    hand.render(renderer);
    hitches.lap('hand draw');

    saveTimer += dt;
    if (saveTimer > 4) {
      saveTimer = 0;
      void world.save();
      savePlayer();
    }
  }

  let weatherTimer = 0;
  let shelter = 0;
  /** Rain streaks, rain and thunder audio, music, birds and cave drones. */
  function updateWeatherFx(dt: number): void {
    const roof = world.surfaceY(Math.floor(body.x), Math.floor(body.z));
    const covered = roof >= 0 && camera.position.y < roof + 1;
    shelter += ((covered ? 1 : 0) - shelter) * Math.min(1, dt * 3);
    rain.update(dt, beyond ? beyond.feel.precip : weather.rain, camera.position, beyond?.feel.snow ?? false);
    beyond?.update(dt, camera.position.x, camera.position.y, camera.position.z, caveDark > 0.5, weather, sky.brightness, particles, body.eyeInWater);
    weatherTimer -= dt;
    if (weatherTimer > 0) return;
    weatherTimer = 0.1;
    audio.setRain(beyond ? (beyond.feel.snow ? 0 : beyond.feel.precip) : weather.rain, shelter);
    if (beyond) audio.setBed(caveDark > 0.6 ? 'cave' : beyond.feel.bed, 1, shelter);
    audio.setCave(caveDark);
    const inDungeon = KIND === 'adventure' && instanceFootprint(body.x, body.z) !== null;
    audio.ambient(0.1, { underground: covered && roof - body.y > 6, day: sky.brightness, rain: weather.rain, dungeon: inDungeon });
    audio.dungeonAmbient(0.1, senseDungeon(inDungeon));
  }

  /** What the dark sound of a dungeon wants to know (see dungeonAmbience.ts): how deep, how hurt, what hostile is near, what lava, water and amethyst is around. */
  const dungeonSense: DungeonEnv = { ...NO_DUNGEON };
  let dungeonScanWait = 0;
  function senseDungeon(inside: boolean): DungeonEnv {
    const e = dungeonSense;
    e.active = inside;
    if (!inside) {
      Object.assign(e, NO_DUNGEON);
      return e;
    }
    e.depth = dungeonDepth(body.y, INSTANCE_FLOOR);
    e.hp = Math.max(0, Math.min(1, session.vitals.health / 20));
    const near: { dist: number }[] = [];
    for (const m of session.mobs.mobs) {
      if (m.dead || !MOBS[m.kind]?.hostile) continue;
      const dist = Math.hypot(m.body.x - body.x, m.body.y - body.y, m.body.z - body.z);
      if (dist < 24) near.push({ dist });
    }
    e.threat = hostileThreat(near);
    e.fight = session.bossView() !== null;
    dungeonScanWait -= 1;
    if (dungeonScanWait <= 0) {
      dungeonScanWait = 2;
      Object.assign(e, scanSurroundings((x, y, z) => world.getBlock(x, y, z), body.x, body.y + 1, body.z));
    }
    return e;
  }

  let netTimer = 0;
  function updateNetText(dt: number): void {
    if (!remote) return;
    netTimer -= dt;
    if (netTimer > 0) return;
    netTimer = 0.5;
    hud.setNet(remote.connected ? `online - ${remote.pingMs}ms - ${remote.others.size + 1} player(s)` : (onlineError ?? 'disconnected'), remote.connected);
  }

  /** Admin mode: the block under the crosshair, described beside it (id, place, what it is, how it digs). */
  const blockInfoEl = document.getElementById('block-info');
  let blockInfoKey = '';
  function updateBlockInfo(): void {
    if (!blockInfoEl) return;
    const t = adminMode && input.locked ? session.target : null;
    if (!t) {
      if (blockInfoKey) {
        blockInfoKey = '';
        blockInfoEl.style.display = 'none';
      }
      return;
    }
    const key = `${t.x},${t.y},${t.z},${t.id}`;
    if (key === blockInfoKey) return;
    blockInfoKey = key;
    blockInfoEl.textContent = blockInfoText(t.x, t.y, t.z, t.id, BIOME_NAMES[session.generator.columnAt(t.x, t.z).biome]);
    blockInfoEl.style.display = 'block';
  }
  function debugText(stats: ReturnType<World['refreshStats']>): string {
    const col = session.generator.columnAt(Math.floor(body.x), Math.floor(body.z));
    const target = session.target;
    const hit = target ? `${BLOCKS[target.id].name} @ ${target.x} ${target.y} ${target.z}` : 'none';
    const v = session.vitals;
    const village = session.generator.nearestVillage(body.x, body.z);
    return [
      `SolRift 0.2  ${fps} fps`,
      `XYZ ${body.x.toFixed(2)} ${body.y.toFixed(2)} ${body.z.toFixed(2)}`,
      `Chunk ${Math.floor(body.x / 16)} ${Math.floor(body.z / 16)}  biome ${BIOME_NAMES[col.biome]}`,
      `Chunks ${stats.meshed}/${stats.loaded}  gen pending ${stats.pendingGen}`,
      `Tris ${Math.round(stats.triangles).toLocaleString()}  mesh ${stats.lastMeshMs.toFixed(1)}ms`,
      `Render dist ${world.renderDistance}  seed ${SEED}`,
      `Target ${hit}`,
      village ? `Village ${compass(village.x - body.x, village.z - body.z)} (${village.x} ${village.z})` : 'Village none nearby',
      `${session.mode}  hp ${v.health.toFixed(1)}  food ${v.hunger} sat ${v.saturation.toFixed(1)}  drops ${session.drops.count}  mobs ${session.mobs.mobs.length}`,
      `${session.flying ? 'flying ' : ''}${body.onGround ? 'ground ' : ''}${body.inWater ? 'water' : ''}`,
      // session.time 0 = sunrise (06:00), 0.25 = noon.
      `Time ${((session.time * 24 + 6) % 24).toFixed(1)}h  light ${sky.brightness.toFixed(2)}  weather ${weather.kind}`,
    ].join('\n');
  }

  /** Persist the player and the world clock/weather/chests (chunks are saved by world.save()). */
  function savePlayer(): Promise<void> {
    if (!local || !local.ready) return Promise.resolve();
    return Promise.all([store.savePlayer(local.savePlayer()), store.saveWorldState(local.saveWorldState())]).then(
      () => undefined,
      (err) => console.warn('save failed', err),
    );
  }

  saveBridge.flush = async () => {
    await world.save();
    await savePlayer();
  };
  saveBridge.freeze = () => store.freeze();
  // Tab hidden or closing: the most reliable moment to write.
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) void saveBridge.flush?.();
    },
    { signal },
  );
  // ---- UI wiring ------------------------------------------------------
  overlay.addEventListener(
    'click',
    (e) => {
      // Buttons inside the overlay (export/import) must not start the game.
      if ((e.target as HTMLElement | null)?.closest('[data-no-play]')) return;
      if (!session.ready) return;
      audio.resume();
      input.lock();
    },
    { signal },
  );
  // "Enter the world": the click (or any key) gives the browser the gesture it wants for the mouse.
  const enterNow = (e: Event): void => {
    if (!loadingEl?.classList.contains('ready')) return;
    // (a browser shortcut or a modifier on its own is not a way in)
    if (e instanceof KeyboardEvent && (e.ctrlKey || e.metaKey || e.altKey || /^(Shift|Control|Alt|Meta|F\d+)/.test(e.code))) return;
    audio.resume();
    void input.lock().then((ok) => {
      if (!ok && !input.locked) overlay.style.display = 'flex'; // still refused: fall back to the pause screen
      hideLoading();
    });
  };
  loadingEl?.addEventListener('click', enterNow, { signal });
  document.addEventListener('keydown', enterNow, { signal });
  // The menu is for Esc. Leaving the window (Alt+Tab, another program coming up) also lets go of the mouse, but that is not a request for
  // the menu: the game just waits, and the next click in it takes the mouse back.
  let unlockedAt = -1e9;
  const windowOpen = (): boolean => {
    const s = useUi.getState();
    return chat.isOpen || session.screen !== 'none' || s.codexOpen || s.questLogOpen || s.partyOpen || s.socialOpen || !!s.trade || !!s.playerMenu || !!s.inspect || !!s.signEdit || s.land.confirm || s.land.manage;
  };
  window.addEventListener(
    'blur',
    () => {
      if (performance.now() - unlockedAt < 600 && !input.locked && overlay.style.display !== 'none' && session.ready) overlay.style.display = 'none';
    },
    { signal },
  );
  document.addEventListener(
    'mousedown',
    (e) => {
      if (input.locked || !session.ready || windowOpen() || overlay.style.display !== 'none') return;
      if (loadingEl && !loadingEl.classList.contains('gone')) return;
      if ((e.target as HTMLElement | null)?.closest('button, input, select, textarea, a, #overlay, #menu-screen, #quest-log, #codex-window, #social-window, #party-window, #loading-screen, #home-layer')) return;
      audio.resume();
      void input.lock();
    },
    { signal },
  );
  document.addEventListener(
    'pointerlockchange',
    () => {
      if (!input.locked) unlockedAt = performance.now();
      // Escape gives up the shape being marked with the Surveyor (a window, the inventory or the chat taking the mouse does not).
      const gaveUp = !input.locked && document.hasFocus() && !document.hidden && land.onUnlock(windowOpen());
      const away = !document.hasFocus() || document.hidden;
      // (The Escape that gave up a shape is the Surveyor's: no pause screen. The mouse is asked for back at once, which some browsers allow;
      // where it is refused the next click takes it, as after a window.)
      overlay.style.display = input.locked || windowOpen() || gaveUp || (away && session.ready) ? 'none' : 'flex';
      if (gaveUp) void input.lock();
      if (!input.locked) {
        void world.save();
        savePlayer();
      }
    },
    { signal },
  );
  // Inventory screens close with E / Escape (pointer lock is released while they are open).
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.repeat) return;
      if (land.handleKey(e)) return;
      if (windows.handleKey(e)) return;
      if (!session.menu && session.screen !== 'dialog') return;
      // E closes the screen, except while typing in the recipe search box.
      if (e.code === 'KeyE' && (e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.code === 'KeyE' || e.code === 'Escape') {
        e.preventDefault();
        useUi.getState().api?.close();
      }
    },
    { signal },
  );
  window.addEventListener(
    'beforeunload',
    () => {
      void world.save();
      savePlayer();
    },
    { signal },
  );
  window.addEventListener(
    'resize',
    () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      postfx.resize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    },
    { signal },
  );

  // The developer hooks for automated tests and screenshots (?debug): see debugHooks.ts.
  if (params.has('debug')) {
    installDebugHooks({
      local, remote, session, kind: KIND, seed: SEED, guest, myLook, world, store, atlas, input, camera, sky, rain, audio, hud, admin, chat,
      postfx, fxWanted, applyPostfx, torchGlow, shadows, particles, players, hand, selfView, deathFx, chase, books, abilityFx, mapData,
      act, syncUi, sendCommand, setMapUp, switchWorld,
      deliver: (events) => handleEvents(events),
      land,
      signBoards,
      caveDark: () => caveDark,
      beyond,
      drawn: () => ({ calls: sceneCalls, triangles: sceneTris, fps }),
      setHandHidden: (hidden) => void (debugHideHand = hidden),
      setPartyPins: (party) => void (mapPartyPins = party),
      die: (variant) => {
        debugDeadUntil = performance.now() + 30000;
        breakSelf(variant);
      },
    });
  }

  rafId = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(rafId);
    ac.abort();
    void world.save();
    savePlayer();
    net?.close();
    remote?.leave();
    chat.dispose();
    players.dispose();
    companions.dispose();
    selfView.dispose();
    deathFx.dispose();
    audio.dispose();
    saveBridge.flush = null;
    saveBridge.freeze = null;
    saveBridge.reconnectNet = null;
    particles.dispose();
    torchGlow.dispose();
    rain.dispose();
    sky.dispose();
    shadows?.dispose();
    hand.dispose();
    drops.dispose();
    campfireFood.dispose();
    signBoards.dispose();
    xpOrbs.dispose();
    bobbers.dispose();
    eatFx.dispose();
    levelFx.dispose();
    riftFx.dispose();
    abilityFx.destroy();
    emberFx.destroy();
    mountFx.destroy();
    rushLines.dispose();
    guardVeil.dispose();
    arcaneVeil.dispose();
    damageNumbers.dispose();
    windBlur.dispose();
    hitches.dispose();
    shaderKeeper.dispose();
    fire.dispose();
    books.dispose();
    mobRenderer.dispose();
    disposeMobAssets();
    disposeWingKits();
    vehicleRenderer.dispose();
    disposeVehicleAssets();
    land.reset();
    land.dispose();
    highlightGeo.dispose();
    (highlight.material as THREE.Material).dispose();
    crack.geometry.dispose();
    (crack.material as THREE.Material).dispose();
    crackTexture.dispose();
    world.dispose();
    atlas.dispose();
    postfx.dispose();
    renderer.dispose();
    useUi.setState({ api: null, screen: 'none', adventure: false, codex: null, codexOpen: false, beyondNotes: [], questLogOpen: false, partyOpen: false, socialOpen: false, social: null, inspect: null, target: null, mobTarget: null, playerMenu: null, signEdit: null, trade: null, tradeAsk: null, invTab: 'inventory', mount: { mount: 0, pick: 0, cd: [0, 0] }, cls: null, party: [], partyInvite: null, dialogNpc: null, shopOpen: false, auction: null, stash: null, zone: null, questNotes: [], map: null, mapUp: false, poison: 0, foodSick: 0 });
    mapData.dispose();
    mapSheet.dispose();
    useUi.getState().quests.loadJSON(null);
    if (document.pointerLockElement) document.exitPointerLock();
  };
}
