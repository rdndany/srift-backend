import type * as THREE from 'three';
import {
  AnvilMenu,
  BLOCKS,
  EnchantMenu,
  GrindstoneMenu,
  TradeMenu,
  allItems,
  makeGenerator,
  makeStack,
  mountItemId,
  type Command,
  type GameSession,
  type MobKind,
  type MountId,
  type QuestEvent,
  type SaveMode,
  type WorldKind,
  BEYOND_BIOMES,
  BeyondWorldGenerator,
} from '@solrift/shared';
import { bumpUi, useUi } from '../ui/store';
import type { AbilityFx } from './abilityFx';
import type { BeyondClient } from './beyondClient';
import type { AdminBar } from './adminBar';
import type { Atlas } from './atlas';
import type { GameAudio } from './audio';
import type { BookRenderer } from './bookRenderer';
import type { ChaseCamera } from './chaseCamera';
import type { Chat } from './chat';
import type { ClientSession } from './clientSession';
import type { DeathFx } from './deathFx';
import type { HeldItem } from './heldItem';
import type { Hud } from './hud';
import type { Input } from './input';
import type { MapData } from './mapData';
import type { Particles } from './particles';
import type { PlayerRenderer } from './playerRenderer';
import type { FxFlags, PostFx } from './postfx';
import type { Rain } from './rain';
import type { RemoteSession } from './remote';
import { saveBridge } from './saveBridge';
import type { SelfView } from './selfView';
import type { SunShadows } from './shadows';
import type { Sky } from './sky';
import type { LocalSaveStore } from './storage';
import type { TorchGlow } from './torchGlow';
import type { World } from './world';

/** What the hooks reach: the parts of a running game, and a few doors into what `startGame` keeps to itself. */
export interface DebugParts {
  /** The game when it runs right here (single player); null online, where most hooks then refuse. */
  local: GameSession | null;
  remote: RemoteSession | null;
  session: ClientSession;
  kind: WorldKind;
  seed: number;
  guest: boolean;
  myLook: number;
  world: World;
  store: LocalSaveStore;
  atlas: Atlas;
  input: Input;
  camera: THREE.PerspectiveCamera;
  sky: Sky;
  rain: Rain;
  audio: GameAudio;
  hud: Hud;
  admin: AdminBar;
  chat: Chat;
  postfx: PostFx;
  /** The effects the player asked for (changed in place). */
  fxWanted: FxFlags;
  applyPostfx(): void;
  torchGlow: TorchGlow;
  shadows: SunShadows | null;
  particles: Particles;
  players: PlayerRenderer;
  hand: HeldItem;
  selfView: SelfView;
  deathFx: DeathFx;
  chase: ChaseCamera;
  books: BookRenderer;
  abilityFx: AbilityFx;
  mapData: MapData;
  /** Run something directly on the session, then deliver the events it caused. */
  act<T>(fn: () => T): T;
  syncUi(): void;
  sendCommand(c: Command): void;
  setMapUp(up: boolean): void;
  switchWorld(kind: WorldKind): void;
  /** How far underground the view is (0 in the open .. 1). */
  caveDark(): number;
  /** The World Beyond's client (null in the other worlds). */
  beyond: BeyondClient | null;
  /** Draw calls and triangles of the last scene render, and the frame rate. */
  drawn(): { calls: number; triangles: number; fps: number };
  setHandHidden(hidden: boolean): void;
  setPartyPins(party: { name: string; x: number; z: number }[]): void;
  /** Break your own body into cubes now (`variant` picks the way), and stay down for a while. */
  die(variant: number): void;
}

/**
 * The developer hooks for automated tests and screenshots (`window.__solrift`, with ?debug in the address). These reach
 * straight into the session (the "dev back door"); real input only ever goes through the link.
 */
export function installDebugHooks(parts: DebugParts): void {
  const { local, remote, session, kind: KIND, seed: SEED, guest, myLook, world, store, atlas, input, camera, sky, rain, audio, hud, admin, chat } = parts;
  const { postfx, fxWanted, applyPostfx, torchGlow, shadows, particles, players, hand, selfView, deathFx, chase, books, abilityFx, mapData } = parts;
  const { act, syncUi, sendCommand, setMapUp, switchWorld } = parts;
  const body = session.body;
  const weather = session.weather;
  const L = (): GameSession => {
    if (!local) throw new Error('only available in single-player');
    return local;
  };
  (window as unknown as Record<string, unknown>).__solrift = {
    atlasPng: () => atlas.canvas.toDataURL('image/png'),
    teleport(x: number, y: number, z: number, yaw = input.yaw, pitch = input.pitch) {
      input.yaw = yaw;
      input.pitch = pitch;
      act(() => L().teleport(x, y, z, yaw, pitch));
    },
    setTime(t: number) {
      L().time = t;
      sky.time = t;
    },
    setWeather: (kind: 'clear' | 'rain' | 'thunder') => L().setWeather(kind),
    weather: () => ({ kind: weather.kind, rain: weather.rain, storm: weather.storm, flash: weather.flash, darkness: weather.darkness }),
    strike() {
      weather.flash = 1;
      audio.thunder(0.3);
    },
    brightness: () => sky.brightness,
    /** The clouds on or off (for pictures taken at their height). */
    setClouds: (on: boolean) => sky.setCloudsVisible(on),
    /** Ambient occlusion and edge smoothing on or off (for pictures); `ao` reaches the N8AO settings (aoRadius, intensity ...). */
    setPostfx: (on: boolean | Partial<FxFlags>) => {
      const all = typeof on === 'boolean';
      for (const k of Object.keys(fxWanted) as (keyof FxFlags)[]) fxWanted[k] = all ? on : (on[k] ?? fxWanted[k]);
      applyPostfx();
      return postfx.on;
    },
    postfxOn: () => postfx.current,
    ao: () => postfx.occlusion?.configuration ?? null,
    fxTune: () => ({ bloom: postfx.glowEffect, rays: postfx.raysEffect }),
    lightInfo: () => ({ halos: torchGlow.visibleCount, shadows: shadows?.active ?? false, sunHeight: sky.sunHeight, sun: sky.lighting.sun.r, meshVersion: world.meshVersion, caveDark: parts.caveDark() }),
    /** What the shadow maps have cost so far (see scripts/shadow-cost.mjs); `reset` starts the worst frame over. */
    shadowStats: (reset = false) => {
      if (!shadows) return null;
      const s = { ...shadows.stats };
      if (reset) shadows.stats.worstCalls = shadows.stats.worstTris = 0;
      return s;
    },
    rainDrops: (x0: number, x1: number, z0: number, z1: number, maxY: number) => rain.countVisible(x0, x1, z0, z1, maxY),
    save: () => saveBridge.flush!(),
    worldKind: () => KIND,
    /** The World Beyond: where the traveller is, what the Codex holds and how the air feels now (null elsewhere). */
    beyond: () => (parts.beyond ? { here: parts.beyond.here, name: BEYOND_BIOMES[parts.beyond.here].name, found: parts.beyond.log.toJSON(), feel: { ...parts.beyond.feel } } : null),
    /** The places (structures) of the World Beyond within 
 of a point, nearest first. */
    beyondPlaces: (x: number, z: number, r: number) => (session.generator instanceof BeyondWorldGenerator ? session.generator.places.near(x, z, r).map((p) => ({ key: p.key, x: p.x, y: p.y, z: p.z, rot: p.rot, radius: p.info.radius })) : []),
    /** The biome of a column of the World Beyond. */
    beyondBiomeAt: (x: number, z: number) => (session.generator instanceof BeyondWorldGenerator ? session.generator.biomeAt(Math.floor(x), Math.floor(z)).name : null),
    switchWorld: (kind: WorldKind) => switchWorld(kind),
    freezeSaves: () => store.freeze(),
    isGuest: () => guest,
    myLook: () => myLook,
    savedState: async () => JSON.stringify({ player: await store.loadPlayer(), world: await store.loadWorldState() }),
    setBlock: (x: number, y: number, z: number, id: number) => {
      world.setBlock(x, y, z, id);
      local?.realm.blockChanged(x, y, z); // like any other change next to a liquid
    },
    getBlock: (x: number, y: number, z: number) => world.getBlock(x, y, z),
    setDebug(v: boolean) {
      hud.debugVisible = v;
    },
    setAdmin(v: boolean) {
      admin.visible = v;
    },
    /** Hide the first-person hand (for clean screenshots). */
    setHandHidden: (v: boolean) => parts.setHandHidden(v),
    mapState: () => ({ inside: !!mapData.inside, up: useUi.getState().mapUp, mini: useUi.getState().minimap, zoom: useUi.getState().mapZoom, painted: mapData.painted, underground: mapData.underground }),
    setMapUp: (up: boolean) => setMapUp(up),
    /** Pretend the server has sent these map pins (for looking at them). */
    setMapPins(party: { name: string; x: number; z: number }[]) {
      parts.setPartyPins(party);
    },
    setRenderDistance: (r: number) => world.setRenderDistance(r),
    /** How many chunks in view are still on their way (0: the land is all there). */
    chunksWaiting: () => world.waiting,
    burst: (x: number, y: number, z: number, id: number) => particles.burst(x, y, z, BLOCKS[id].tiles.side, 24),
    dust: (x: number, y: number, z: number, id: number, count = 16) => particles.dust(x, y, z, BLOCKS[id].tiles.top, count, 1),
    sparks: (x: number, y: number, z: number, crit = false) => (crit ? particles.sparks(x, y, z, 1, 0.82, 0.25, 14) : particles.sparks(x, y, z, 0.95, 0.3, 0.25, 8)),
    sound: (kind: Parameters<GameAudio['play']>[0], action: 'break' | 'place' | 'step' | 'hit' | 'land' | 'jump' = 'step', vol = 1, pan = 0) => {
      audio.resume();
      audio.play(kind, action, vol, pan);
    },
    stats: () => world.refreshStats(),
    /** How crowded the scene is and what it costs: draw calls of the last frame, how the other players are drawn. */
    crowd: () => ({ calls: parts.drawn().calls, triangles: parts.drawn().triangles, players: players.stats(), fps: parts.drawn().fps }),
    isReady: () => session.ready,
    position: () => ({ x: body.x, y: body.y, z: body.z }),
    surfaceY: (x: number, z: number) => world.surfaceY(x, z),

    // ---- gameplay hooks ----
    setMode: (m: SaveMode) => act(() => L().setMode(m)),
    /** Creative flight on or off without the double tap (for screenshots). */
    setFlying: (on: boolean) => act(() => { L().flying = on; }),
    mode: () => session.mode,
    give: (id: number, count = 1) => act(() => L().giveItem(id, count)),
    /** A plain piece of gear already raised to +`u`. */
    giveGear: (id: number, u: number) => act(() => L().giveOrDrop({ ...makeStack(id, 1), gear: { r: 0, l: 1, s: [], u } })),
    coins: () => session.coins,
    addCoins: (n: number) => act(() => L().addCoins(n)),
    clearInventory: () => act(() => L().clearInventory()),
    inventory: () => session.inventory.toJSON(),
    countOf: (id: number) => session.inventory.countOf(id),
    select: (i: number) => act(() => L().selectSlot(i)),
    /** Break a block exactly as if the player mined it with the held tool. */
    breakAt: (x: number, y: number, z: number) => act(() => L().breakBlock(x, y, z)),
    breakTimeAt: (x: number, y: number, z: number) => L().breakTimeAt(x, y, z),
    /** Right-click the held item on a block face (hoe tilling / block placement). */
    useBucket: () => act(() => L().useBucket()),
    /** Use a door, trapdoor, gate or other interactive block as a right-click would. */
    useBlock: (x: number, y: number, z: number) => act(() => L().useBlock(x, y, z)),
    useOn: (x: number, y: number, z: number, nx: number, ny: number, nz: number, fy?: number) => act(() => L().useOn(x, y, z, nx, ny, nz, fy)),
    growCrops: (seconds: number) => world.growCrops(seconds),
    swingHand: () => {
      hand.swing();
      selfView.swing();
    },
    /** Hold/release the right mouse button without pointer lock. */
    setRight: (down: boolean) => void (input.rightDown = down),
    bowDraw: () => session.bowDraw,
    /** Pretend the pointer is locked (headless browsers cannot lock it). */
    forceLock: () => void (input.locked = true),
    /** Hold the first-person swing at one moment of it (0..1, or null to let it play), and fire the guard's hit reaction. */
    holdSwing: (t: number | null, variant = 0) => hand.holdSwing(t, variant),
    blockHit: (parry = false) => hand.blockHit(parry),
    /** Start one of the idle animations of the figure (1 sit, 2 stretch, 3 look around). */
    idle: (kind: number) => selfView.idle(kind),
    /** Break your own body into cubes now (0 burst, 1 crumble, 2 ascend; else random), for a look at the death effects. */
    die: (variant = -1) => {
      parts.die(variant);
    },
    dyingDone: () => !deathFx.active,
    drops: () => session.drops.count,
    /** How many experience orbs are about, and a way to let some out. */
    xpOrbs: () => session.xpOrbs.orbs.length,
    spawnXp: (amount: number, x: number, y: number, z: number) => L().realm.awardXp(amount, x, y, z),
    /** The fishing lines out (as drawn), and a way to make your own fish bite or come now. */
    bobbers: () => session.bobbers.bobbers.map((b) => ({ ...b })),
    fishNow: (phase: 'lured' | 'bite') =>
      act(() => {
        const b = L().fishing.of(L());
        if (b && b.state === 'floating') {
          b.phase = phase;
          b.timer = 2;
        }
      }),
    /** Lay items in a row on the ground (nobody can pick them up): `ids` along +x from (x, y, z). */
    spawnDrops: (ids: number[], x: number, y: number, z: number, gap = 0.9) =>
      ids.forEach((id, i) => L().realm.drops.spawn(makeStack(id, 1), x + i * gap, y, z, 0, 0, 0, 999)),
    // ---- view hooks ----
    view: () => selfView.mode,
    /** Put a mount's horn in the mount slot (and be high enough level to ride it); `summon()` then calls it as the key does. */
    learnMount: (id: MountId) =>
      act(() => {
        const p = L();
        p.mountSlot.set(0, { id: mountItemId(id), count: 1, damage: 0 });
        p.xp.level = Math.max(p.xp.level, 30);
      }),
    summon: () => act(() => L().apply({ t: 'mount' })),
    mountState: () => session.mountView(),
    setView: (m: 0 | 1 | 2) => {
      selfView.setMode(m);
      chase.reset();
    },
    cameraAt: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
    /** Where your own figure is drawn (smoothed between steps, see `viewPos`). */
    /** The way the view looks (yaw, pitch) and the way your figure is turned (a figure faces where it walks). */
    facing: () => ({ yaw: input.yaw, pitch: input.pitch, body: selfView.group.rotation.y }),
    drawnAt: () => ({ x: selfView.group.position.x, y: selfView.group.position.y, z: selfView.group.position.z }),
    /** The block under the crosshair (what would be mined), or null; in third person that is what the camera's crosshair is on. */
    aimedBlock: () => (session.target ? { x: session.target.x, y: session.target.y, z: session.target.z } : null),
    /** Put the third-person camera on the other shoulder, as mouse 3 does; which shoulder it is on (1 right, -1 left). */
    swapShoulder: () => {
      chase.swapShoulder();
      return chase.shoulder;
    },
    bodyShown: () => selfView.group.visible && !selfView.cameraInHead,
    // ---- armor hooks ----
    armor: () => ({ defense: session.defense, worn: L().armorIds(), wear: [0, 1, 2, 3].map((i) => L().armor.get(i)?.damage ?? 0) }),
    /** What the screen has of the worn clothes and the hotbar (single player or online), for tests of a first load. */
    worn: () => ({ armor: [0, 1, 2, 3].map((i) => session.armor.get(i)?.id ?? 0), offhand: session.offhand.get(0)?.id ?? 0, hotbar: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => session.inventory.get(i)?.id ?? 0) }),
    equipHeld: () => act(() => L().equipHeld()),
    /** Put an item in an armor slot (0 helmet .. 3 boots), or empty it with id 0: how the clothes of a class are taken off. */
    setArmorSlot: (slot: number, id: number) => act(() => L().armor.set(slot, id ? makeStack(id, 1) : null)),
    hurtByMob: (amount: number) => act(() => L().hurtByMob(amount, 0, 0, 'zombie')),
    // ---- shield hooks ----
    /** A melee hit whose knockback points along (kx, kz), i.e. from the opposite side. */
    hurtFrom: (amount: number, kx: number, kz: number) => act(() => L().hurtByMob(amount, kx, kz, 'zombie')),
    blast: (x: number, y: number, z: number, radius: number) => act(() => L().hurtByExplosion(x, y, z, radius, 'creeper')),
    shield: () => ({ offhand: L().offhand.toJSON()[0], blocking: session.blocking, blockTime: L().blockTime, held: session.held ? session.held.id : 0, health: session.vitals.health }),
    swapHands: () => act(() => L().swapHands()),
    setOffhand: (id: number) => act(() => L().offhand.set(0, id ? { id, count: 1, damage: 0 } : null)),
    sendCommand: (c: Command) => act(() => L().apply(c)),
    // ---- enchanting hooks ----
    /** The id of an item by its name (`iron_sword`, `blue_dye`), or -1. */
    itemId: (name: string) => allItems().find((i) => i.name === name)?.id ?? -1,
    /** Put an enchanted item in the inventory: `ench` is a list of [enchantment id, level]. */
    giveEnchanted: (id: number, ench: [number, number][], damage = 0) => act(() => L().giveOrDrop(makeStack(id, 1, damage, ench))),
    // ---- fire hooks ----
    /** Light a fire at (x, y, z) as flint and steel would. */
    ignite: (x: number, y: number, z: number) => L().realm.fire.ignite(x, y, z),
    /** Light the fuse of the TNT at a cell, and how many fuses burn. */
    tnt: (x: number, y: number, z: number, fuse?: number) => L().realm.primeTnt(x, y, z, fuse),
    litTnt: () => L().realm.litTnt,
    /** Make a mob grown up or young (seconds left as a young one), for tests. */
    growMob: (id: number, seconds: number) => {
      const m = L().mobs.mobs.find((x) => x.id === id);
      if (m) m.growTimer = seconds;
    },
    /** How many fires burn, and run the fire simulation ahead by some seconds. */
    fires: () => L().realm.fire.count,
    fireRun: (seconds: number) => L().realm.fire.run(seconds),
    /** Seconds the player has left alight. */
    onFire: () => L().onFire,
    /** Bookshelves counted around the table block at (x, y, z). */
    countShelves: (x: number, y: number, z: number) => L().countShelves(x, y, z),
    /** The open enchanting table or anvil: what it shows. */
    enchantScreen: () => {
      const m = session.menu;
      if (m instanceof EnchantMenu) return { kind: 'enchant', shelves: m.shelves, offers: m.offers.map((o) => ({ cost: o.cost, clue: o.clue })), item: m.item, lapis: m.lapis?.count ?? 0 };
      if (m instanceof AnvilMenu) return { kind: 'anvil', cost: m.cost, tooExpensive: m.tooExpensive, name: m.name };
      if (m instanceof GrindstoneMenu) return { kind: 'grindstone', xp: m.xp };
      return null;
    },
    /** Let sand, gravel or an anvil with nothing under it start to fall. */
    checkFall: (x: number, y: number, z: number) => L().realm.checkFall(x, y, z),
    /** Floating enchanting-table books drawn, and thrown arrows or bottles in flight. */
    books: () => books.count,
    projectiles: () => session.mobs.arrows.length,
    /** What the held stack is enchanted with. */
    heldEnchants: () => session.held?.ench ?? null,
    // ---- bed hooks ----
    useBed: (x: number, y: number, z: number) => act(() => L().useBed({ x, y, z, id: world.getBlock(x, y, z), nx: 0, ny: 1, nz: 0 })),
    bed: () => ({
      sleeping: session.sleeping ? session.sleeping.dir + 1 : 0,
      spawn: local ? local.spawnPoint : null,
      sleepTime: local ? local.sleepTime : 0,
      fade: useUi.getState().sleep,
      time: session.time,
      weather: weather.kind,
      eye: session.eye(),
      camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      figure: selfView.group.visible ? { rotX: selfView.group.rotation.x, y: selfView.group.position.y } : null,
    }),
    // ---- hardcore / village hooks ----
    hardcore: () => ({ hardcore: session.hardcore, spectating: session.spectating, screen: session.screen, health: session.vitals.health, mode: session.mode }),
    nearestVillage: (x: number, z: number) => makeGenerator(SEED, KIND).nearestVillage(x, z),
    // ---- underground hooks ----
    nearestStructure: (kind: 'dungeon' | 'mineshaft' | 'temple' | 'castle', x: number, z: number) => {
      const p = makeGenerator(SEED, KIND).nearestStructure(kind, x, z);
      return p && { kind: p.kind, x: p.x, y: p.y, z: p.z, chests: [...p.chests.keys()] };
    },
    /** The pond closest to a point, looked for `rings` chunks out (12 by default: ponds need flat ground and can be far apart). */
    nearestLake: (x: number, z: number, rings?: number) => makeGenerator(SEED, KIND).nearestLake(x, z, rings),
    findCavePoint: (kind: 'cave' | 'lava', x: number, z: number) => makeGenerator(SEED, KIND).findCavePoint(kind, x, z),
    /** What is in a chest (rolling its loot if it came with the world). */
    chestContents: (x: number, y: number, z: number) => L().blockEntities.chest(x, y, z).toJSON(),
    hp: () => session.vitals.health,
    eatState: () => ({ eat: session.eatProgress, hunger: session.vitals.hunger }),
    lastDamage: () => L().vitals.lastDamage,
    // ---- experience hooks ----
    xp: () => ({ level: session.xp.level, progress: session.xp.progress }),
    addXp: (n: number) => act(() => L().addXp(n)),
    /** Run the item physics so drops land and get collected without real time passing. */
    tickDrops: (seconds: number) => act(() => L().tickDrops(seconds)),
    /**
     * Walk over everything that lies about: each drop is picked up as if the player stood on it (an item is taken by
     * walking onto it, it is not drawn in from a distance). Returns how many items were taken.
     */
    gatherDrops: () =>
      act(() => {
        const s = L();
        let picked = 0;
        for (const d of [...s.drops.drops]) {
          if (!s.drops.drops.includes(d)) continue;
          d.delay = 0;
          picked += s.drops.update(0, d.x, d.y - 0.7, d.z, (stack) => s.inventory.canFit(stack), (stack) => s.inventory.collect(stack));
        }
        return picked;
      }),
    // ---- mob hooks ----
    spawnMob: (kind: MobKind, x: number, y: number, z: number, variant = 0) => L().spawnMob(kind, x, y, z, variant),
    mobs: () =>
      session.mobs.mobs.map((m) => ({
        id: m.id,
        kind: m.kind,
        x: m.body.x,
        y: m.body.y,
        z: m.body.z,
        yaw: m.yaw,
        health: (m as { health?: number }).health ?? 0,
        dead: m.dead,
        variant: m.variant,
        baby: !!m.baby,
        sheared: !!m.sheared,
        love: m.love ?? 0,
      })),
    clearMobs: () => L().clearMobs(),
    /** Talk to a villager by mob id, as a right-click does. */
    talkToMob: (id: number) => act(() => L().talkToMob(id)),
    /** The quest log as the client knows it (Adventure mode). */
    questLog: () => useUi.getState().quests.toJSON(),
    /** Mark an objective done without playing it (tests): feed the log a quest event. */
    questEvent: (e: QuestEvent) => act(() => L().questEvent(e)),
    /** The open trade screen: what the villager offers and which offer is chosen. */
    tradeScreen: () => {
      const m = session.menu;
      return m instanceof TradeMenu ? { profession: m.villager.profession, level: m.villager.level, xp: m.villager.xp, selected: m.selected, offers: m.villager.offers } : null;
    },
    /** Hurt a mob like a player hit would (no cooldown), knocking it away along +x. */
    damageMob: (id: number, amount: number) => act(() => L().damageMob(id, amount)),
    /** Swing at whatever is under the crosshair, exactly like a left click. */
    swing: () => act(() => L().swing()),
    /** Right-click the mob under the crosshair with the held item (a dye on a sheep). */
    useOnMob: () => act(() => L().useOnMob()),
    // ---- vehicle hooks ----
    /** Set a minecart (on a rail) or boat down; returns its id, or -1 when it did not fit. */
    spawnVehicle: (kind: 'minecart' | 'boat', x: number, y: number, z: number, yaw = 0) => L().realm.vehicles.spawn(kind, x, y, z, yaw)?.id ?? -1,
    vehicles: () => L().realm.vehicles.list.map((v) => ({ id: v.id, kind: v.kind, x: v.x, y: v.y, z: v.z, yaw: v.yaw, speed: v.speed, onRail: v.rail !== null, rider: v.rider !== null })),
    /** Give a vehicle a shove: along its rail (a cart) or along x (a boat). */
    pushVehicle: (id: number, speed: number) => {
      const v = L().realm.vehicles.get(id);
      if (!v) return false;
      if (v.kind === 'minecart') v.s = speed;
      else v.vx = speed;
      return true;
    },
    mount: (id: number) => act(() => { const v = L().realm.vehicles.get(id); return !!v && L().mount(v); }),
    dismount: () => act(() => L().dismount()),
    riding: () => (session.riding ? session.riding.id : 0),
    arrows: () => session.mobs.arrows.length,
    /** Push vitals/inventory to the React UI even while the simulation is idle. */
    forceUi() {
      syncUi();
      bumpUi();
    },
    tickFurnaces: (seconds: number) => act(() => L().tickFurnaces(seconds)),
    vitals: () => ({
      health: session.vitals.health,
      hunger: session.vitals.hunger,
      saturation: session.vitals.saturation,
      air: session.vitals.air,
      dead: session.vitals.dead,
    }),
    damage(n: number) {
      L().vitals.damage(n, 'generic');
    },
    setHealth(n: number) {
      L().vitals.health = n;
    },
    setHunger(n: number) {
      L().vitals.hunger = n;
    },
    openMenu: (kind: 'inventory' | 'crafting' | 'furnace' | 'chest' | 'creative') => act(() => L().openScreen(kind)),
    closeMenu: () => act(() => L().closeMenu()),
    screen: () => session.screen,
    // ---- input hooks (the real input path, minus the pointer) ----
    look(yaw: number, pitch: number) {
      input.yaw = yaw;
      input.pitch = pitch;
    },
    setLeft: (down: boolean) => void (input.leftDown = down),
    holdKey(code: string, down: boolean) {
      if (down) input.keys.add(code);
      else input.keys.delete(code);
    },
    // ---- online hooks ----
    online: () => !!remote,
    others: () => (remote ? [...remote.others.values()].map((p) => ({ id: p.id, name: p.name, look: p.look, x: p.x, y: p.y, z: p.z, cls: p.cls ?? null, clv: p.clv ?? 0 })) : []),
    /** The class bar's data and the ability effects in range, for tests. */
    classView: () => session.classView(),
    addClassXp: (n: number) => act(() => L().addClassXp(n)),
    /** A raw command by the way the interface sends it (single player or online): for tests of what the server accepts. */
    netCommand: (c: Command) => sendCommand(c),
    fxList: () => session.fx.map((f) => ({ id: f.id, k: f.k, by: f.by, x: f.x, y: f.y, z: f.z, r: f.r, age: f.age, ttl: f.ttl })),
    /** Learn a class ability without its skill book (single player), to look at it. */
    unlockAbility: (id: string) => act(() => void L().cls?.unlocked.add(id as never)),
    abilityMeshes: () => abilityFx.group.children.length,
    /** Send a spell (1 fireball, 2 the spellbook's arcane bolt, 3 a wand's and 4 a staff's bolt of cubes) from the eye at a given speed, to look at it in flight (single player). */
    testSpell: (spell: number, speed: number) => {
      const p = L();
      const e = p.eye();
      const d = p.look();
      p.mobs.castBolt(e.x + d.x * 0.6, e.y + d.y * 0.6 - 0.1, e.z + d.z * 0.6, d.x, d.y, d.z, speed, spell, () => undefined);
    },
    chat: (text: string) => remote?.chat(text),
    chatLog: () => chat.history(),
    command: (c: Command) => sendCommand(c),
    pingMs: () => remote?.pingMs ?? 0,
    connected: () => remote?.connected ?? false,
  };
}
