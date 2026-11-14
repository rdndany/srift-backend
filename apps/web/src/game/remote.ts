import {
  BAG_MENU_SLOTS,
  BAG_SLOTS,
  ChestMenu,
  MOUNTS,
  MOUNTED_EYE,
  type MountView,
  Container,
  CraftingMenu,
  CreativeMenu,
  Furnace,
  FurnaceMenu,
  PLAYER_EYE,
  PLAYER_SLOTS,
  SLEEP_EYE,
  STEP,
  MOUNT_STEP_HEIGHT,
  VEHICLE_SPECS,
  bagInventory,
  AnvilMenu,
  GrindstoneMenu,
  EnchantMenu,
  TradeMenu,
  Weather,
  makeGenerator,
  buildMove,
  rushMove,
  newBook,
  cleanName,
  parseEnchants,
  parsePenalty,
  createBody,
  stepPlayer,
  type BlockReader,
  type ClassId,
  type ClassView,
  parseGear,
  type Fx,
  type InputFrame,
  type InventoryView,
  type ItemStack,
  type ItemView,
  type Menu,
  type NetClientMessage,
  type NetInput,
  type NetServerMessage,
  type PlayerView,
  type SaveMode,
  type SessionEvent,
  type SessionScreen,
  type Snapshot,
  type Command,
  type WorldGenerator,
  type WorldKind,
  type ChatChannel,
  type InspectView,
  type SocialAction,
  type SocialView,
  type TradeAct,
  type TradeView,
  mountOfItem,
} from '@solrift/shared';
import type { AimTarget, ArrowLike, ClientSession, DropLike, MobLike, VehicleLike, XpOrbLike } from './clientSession';

/** Another player, smoothed for drawing. */
export interface OtherPlayer {
  id: number;
  name: string;
  /** A `lookCode`: what they look like. */
  look: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  sneaking: boolean;
  held: number;
  armor: number[];
  /** Off-hand item id (0 = none) and whether the shield is raised. */
  offhand: number;
  blocking: boolean;
  /** Eating or drinking. */
  eating?: boolean;
  /** Dead: they have come apart, and nothing is drawn of them until they are back. */
  dead?: boolean;
  /** Seconds since the arm last swung (it runs on by itself between snapshots; a new swing restarts it). */
  swingT?: number;
  /** Seconds since a Shield Bash was thrown (runs on by itself between snapshots; a new one restarts it). */
  bashT?: number;
  /** Running at a Charge. */
  charging?: boolean;
  /** Casting the Emberstone: how far into the cast (0..1), 0 when not. */
  casting?: number;
  /** A Ground Slam (1 crouching, 2 in the air, 3 down on the shield), 0 when none. */
  slam?: number;
  /** Lying in a bed: 0 = awake, else 1 + the bed's direction. */
  sleeping: number;
  /** Their class and class level (a character without one has none). */
  cls?: ClassId;
  clv?: number;
  /** The tag of their guild. */
  gt?: string;
  /** The mount they ride (1 + its place in MOUNTS), none when on foot. */
  mount?: number;
  /** Horizontal speed, for the walking animation. */
  speed: number;
  tx: number;
  ty: number;
  tz: number;
  tyaw: number;
  tpitch: number;
}

export interface RemoteCallbacks {
  onEvents(events: SessionEvent[]): void;
  onChat(from: string, text: string, ch?: ChatChannel, to?: string): void;
  onNotice(text: string): void;
  /** The lists of the social window, and the answer to a look at a player (null: they are not here). */
  onSocial?(view: SocialView): void;
  onInspect?(name: string, view: InspectView | null): void;
  /** Your trade: the table opens, changes and closes (null); and somebody asks you to trade (null: the request is over). */
  onTrade?(view: TradeView | null): void;
  onTradeAsk?(from: string | null): void;
  onClose(reason: string): void;
}

const MAX_PENDING = 600;
const MAX_INPUTS_PER_MESSAGE = 8;

export const stackOf = (v: ItemView | null): ItemStack | null => {
  if (!v) return null;
  const s: ItemStack = { id: v.id, count: v.count, damage: v.damage };
  const ench = parseEnchants(v.e);
  if (ench) s.ench = ench;
  const name = cleanName(v.n);
  if (name) s.name = name;
  const rc = parsePenalty(v.r);
  if (rc) s.rc = rc;
  const gear = parseGear(v.g, v.id);
  if (gear) s.gear = gear;
  return s;
};
const angleLerp = (a: number, b: number, t: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/**
 * The client's end of an online game. The server owns the world; this keeps a mirror of what the
 * server says, predicts the local player's movement so it feels instant, and corrects it from each
 * snapshot (the inputs the server has not applied yet are replayed on top of the server's state).
 */
export class RemoteSession implements ClientSession {
  readonly body = createBody(0, 80, 0);
  readonly vitals = { health: 20, hunger: 20, saturation: 5, air: 15, dead: false };
  /** The bags worn, mirrored from the server: they decide which of the inventory's slots are open. */
  readonly bags = new Container(BAG_SLOTS);
  readonly inventory = bagInventory(this.bags);
  readonly weather = new Weather();
  readonly mobs: { mobs: MobLike[]; arrows: ArrowLike[] } = { mobs: [], arrows: [] };
  readonly drops: { drops: DropLike[]; count: number } = { drops: [], count: 0 };
  readonly xpOrbs: { orbs: XpOrbLike[] } = { orbs: [] };
  vehicles: VehicleLike[] = [];
  riding: { id: number } | null = null;
  /** The mount ridden (1 + its place in MOUNTS, 0: none) and the cooldowns of its skills, as the server says. */
  private mountIdx = 0;
  private mountCd: readonly [number, number] = [0, 0];
  readonly xp = { level: 0, progress: 0 };
  coins = 0;
  /** Worn armor, mirrored from the inventory screen while it is open. */
  readonly armor = new Container(4);
  /** The off-hand slot (a shield), mirrored from the server. */
  readonly offhand = new Container(1);
  /** The mount slot (a mount horn), mirrored from the server. */
  readonly mountSlot = new Container(1);
  blocking = false;
  eatProgress = 0;
  emberProgress = 0;
  aimsAtTalker = false;
  burning = false;
  /** The bed this player lies in (only the way it points matters to the client), or null. */
  sleeping: { dir: number } | null = null;
  defense = 0;
  /** Ability effects the server sent with the last snapshot. */
  fx: Fx[] = [];
  /** The effects the server has sent in full and that are still on (see applyFx). */
  private readonly fxKnown = new Map<number, Fx>();
  private cls: ClassView | null = null;
  readonly others = new Map<number, OtherPlayer>();
  readonly generator: WorldGenerator;

  mode: SaveMode = 'survival';
  selected = 0;
  screen: SessionScreen = 'none';
  flying = false;
  menu: Menu | null = null;
  target: AimTarget | null = null;
  breakProgress = 0;
  hudProgress = 0;
  bowDraw = 0;
  time = 0.2;
  ready = false;
  yaw = 0;
  pitch = 0;
  sneaking = false;
  /** Online worlds are never hardcore. */
  readonly hardcore = false;
  readonly spectating = false;
  name: string;
  /** What you look like (a `lookCode`), as the server knows it. */
  look = 0;
  id = 0;
  pingMs = 0;
  connected = true;
  killMessage: string | null = null;

  private ws: WebSocket;
  private seq = 0;
  private acc = 0;
  private pending: NetInput[] = [];
  private world: BlockReader | null = null;
  private edits: number[][] = [];
  private applyEdits: ((blocks: number[]) => void) | null = null;
  private heldEvents: SessionEvent[] = [];
  /** Events from before the world was ready that must still be shown (see `handle`). */
  private carried: SessionEvent[] = [];
  private pingTimer = 0;

  private constructor(
    ws: WebSocket,
    seed: number,
    /** Which world the server runs (it decides the terrain, and whether there are quests). */
    readonly kind: WorldKind,
    name: string,
    private readonly cb: RemoteCallbacks,
  ) {
    this.ws = ws;
    this.generator = makeGenerator(seed, kind);
    this.name = name;
  }

  /** Connect, join, and wait until the server has told us the world's edits and our first state. */
  static connect(url: string, name: string, look: number, cb: RemoteCallbacks, classId: ClassId | null = null): Promise<RemoteSession> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('cannot connect'));
        return;
      }
      let session: RemoteSession | null = null;
      let editsDone = false;
      let settled = false;
      const fail = (message: string): void => {
        if (settled) return;
        settled = true;
        reject(new Error(message));
      };
      ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, look, ...(classId ? { class: classId } : {}) } satisfies NetClientMessage));
      ws.onerror = () => fail('Cannot reach the game server.');
      ws.onclose = () => {
        if (session) {
          session.connected = false;
          window.clearInterval(session.pingTimer);
          cb.onClose('Disconnected from the server.');
        } else fail('Disconnected from the server.');
      };
      ws.onmessage = (e) => {
        let msg: NetServerMessage | { t: 'welcome' } | { t: 'pong'; ts: number } | { t: 'error'; message: string };
        try {
          msg = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (msg.t === 'welcome' || msg.t === 'error') return;
        if (msg.t === 'pong') {
          if (session) session.pingMs = Math.round(performance.now() - msg.ts);
          return;
        }
        if (msg.t === 'kicked') {
          fail(msg.reason);
          cb.onClose(msg.reason);
          return;
        }
        if (msg.t === 'joined') {
          session = new RemoteSession(ws, msg.seed, msg.kind ?? 'overworld', msg.name, cb);
          if (typeof msg.look === 'number') session.look = msg.look;
          session.id = msg.id;
          session.time = msg.time;
          session.pingTimer = window.setInterval(() => ws.send(JSON.stringify({ t: 'ping', ts: performance.now() })), 2000);
          return;
        }
        if (!session) return;
        if (msg.t === 'edits') {
          session.takeEdits(msg.blocks);
          if (msg.last) editsDone = true;
          return;
        }
        session.handle(msg);
        if (editsDone && msg.t === 'snap' && !settled) {
          settled = true;
          resolve(session);
        }
      };
    });
  }

  get seed(): number {
    return this.generator.seed;
  }

  get held(): ItemStack | null {
    return this.inventory.get(this.selected);
  }

  eye(): { x: number; y: number; z: number } {
    return this.eyeAt(this.body);
  }

  eyeAt(at: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    if (this.sleeping) return { x: at.x, y: at.y + SLEEP_EYE, z: at.z };
    if (this.mountIdx > 0) return { x: at.x, y: at.y + MOUNTED_EYE, z: at.z };
    return { x: at.x, y: at.y + PLAYER_EYE - (this.sneaking && !this.flying ? 0.2 : 0), z: at.z };
  }

  /** The body one fixed step ago, and how far between it and the body the picture is (0..1): see `viewPos`. */
  private prev = { x: 0, y: 0, z: 0 };
  private blend = 1;
  /** How far below the body the picture still is after the mount stepped up a block (it is eased back to 0 in `update`). */
  private stepLift = 0;

  private markPrev(): void {
    this.prev.x = this.body.x;
    this.prev.y = this.body.y;
    this.prev.z = this.body.z;
  }

  viewPos(): { x: number; y: number; z: number } {
    const b = this.body;
    const p = this.prev;
    // After a jump (a teleport, a correction from the server) there is nothing to blend from.
    if (Math.abs(b.x - p.x) + Math.abs(b.y - p.y) + Math.abs(b.z - p.z) > 2) {
      this.stepLift = 0;
      return { x: b.x, y: b.y, z: b.z };
    }
    const a = this.blend;
    return { x: p.x + (b.x - p.x) * a, y: p.y + (b.y - p.y) * a + this.stepLift, z: p.z + (b.z - p.z) * a };
  }

  mountView(): MountView {
    const horn = this.mountSlot.get(0);
    return { mount: this.mountIdx, pick: MOUNTS.findIndex((m) => m.id === (horn ? mountOfItem(horn.id) : null)) + 1, cd: this.mountCd };
  }

  deathMessage(): string {
    return this.killMessage ?? 'You died';
  }

  furnaceState(): { burn: number; cook: number } | null {
    return this.furnace;
  }

  private furnace: { burn: number; cook: number } | null = null;

  // ---- sending -----------------------------------------------------------------

  private send(msg: NetClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  command(c: Command): void {
    this.send({ t: 'cmd', c });
  }

  chat(text: string): void {
    this.send({ t: 'chat', text });
  }

  socialRefresh(): void {
    this.send({ t: 'social' });
  }

  socialAct(a: SocialAction, name: string): void {
    this.send({ t: 'socialAct', a, name });
  }

  inspect(name: string): void {
    this.send({ t: 'inspect', name });
  }

  trade(act: TradeAct): void {
    this.send({ t: 'trade', act });
  }

  guild(line: string): void {
    this.send({ t: 'guild', line });
  }

  leave(): void {
    window.clearInterval(this.pingTimer);
    this.send({ t: 'leave' });
    this.ws.onclose = null;
    this.ws.close();
  }

  /** Terrain the player stands in must exist before prediction can run. */
  attachWorld(world: BlockReader, applyEdits: (blocks: number[]) => void): void {
    this.world = world;
    this.applyEdits = applyEdits;
    for (const e of this.edits) applyEdits(e);
    this.edits = [];
  }

  private takeEdits(blocks: number[]): void {
    if (this.applyEdits) this.applyEdits(blocks);
    else this.edits.push(blocks);
  }

  /** One animation frame: turn it into fixed-size inputs, predict them, and send them. */
  frame(f: InputFrame): void {
    this.yaw = f.yaw;
    this.pitch = f.pitch;
    this.sneaking = f.sneak;
    if (!this.ready || !(f.locked || this.screen !== 'none')) {
      this.acc = 0;
      this.markPrev();
      this.blend = 1;
      return;
    }
    this.acc += f.dt;
    const out: NetInput[] = [];
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.markPrev();
      const input: NetInput = {
        seq: ++this.seq,
        yaw: f.yaw,
        pitch: f.pitch,
        ...(f.cam ? { cam: f.cam } : {}),
        forward: f.forward,
        strafe: f.strafe,
        jump: f.jump,
        sprint: f.sprint,
        sneak: f.sneak,
        left: f.left,
        right: f.right,
      };
      this.predict(input);
      this.pending.push(input);
      out.push(input);
    }
    // The picture is a little behind the simulation (by less than one step) and moves smoothly between its last two steps.
    this.blend = Math.min(1, this.acc / STEP);
    if (this.pending.length > MAX_PENDING) this.pending.splice(0, this.pending.length - MAX_PENDING);
    for (let i = 0; i < out.length; i += MAX_INPUTS_PER_MESSAGE) {
      this.send({ t: 'input', frames: out.slice(i, i + MAX_INPUTS_PER_MESSAGE) });
    }
  }

  private predict(input: NetInput): void {
    if (!this.world || this.sleeping || this.riding) return;
    // A mount runs at its own speed, and a rider neither sprints nor sneaks (see Player.simulateStep).
    const mount = this.mountIdx > 0 ? MOUNTS[this.mountIdx - 1] : null;
    const canSprint = (this.mode === 'creative' || this.vitals.hunger > 6) && !this.blocking && !mount;
    const move = buildMove({ t: 'frame', dt: STEP, locked: true, ...input }, this.flying, canSprint, false, mount ? mount.speed : (this.cls?.speedMul ?? 1));
    if (mount) {
      move.sneak = false;
      move.stepHeight = MOUNT_STEP_HEIGHT;
    }
    // A Charge runs on the server's terms: predict it the same way, or the body would be dragged back at every snapshot.
    if (this.cls?.rush) rushMove(move, this.cls.rush.yaw, this.cls.rush.speed);
    const y0 = this.body.y;
    const wasOnGround = this.body.onGround;
    stepPlayer(this.world, this.body, move, STEP);
    // A mount walks up a block in one step: the picture climbs it over a moment instead of jumping (see `viewPos`).
    const rise = this.body.y - y0;
    if (mount && wasOnGround && this.body.onGround && rise > 0.25 && rise < 1.3) this.stepLift -= rise;
  }

  classView(): ClassView | null {
    return this.cls;
  }

  /** Smooth other players, mobs and arrows between snapshots. Call once per frame. */
  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 16);
    this.stepLift = this.mountIdx > 0 && Math.abs(this.stepLift) > 0.002 ? this.stepLift * Math.exp(-dt * 12) : 0;
    for (const p of this.others.values()) {
      const dx = p.tx - p.x;
      const dz = p.tz - p.z;
      p.speed += (Math.hypot(dx, dz) / Math.max(dt, 1e-3) - p.speed) * Math.min(1, dt * 6);
      p.x += dx * k;
      p.y += (p.ty - p.y) * k;
      p.z += dz * k;
      p.yaw = angleLerp(p.yaw, p.tyaw, k);
      p.pitch += (p.tpitch - p.pitch) * k;
      p.swingT = Math.min(9, (p.swingT ?? 9) + dt);
      p.bashT = Math.min(9, (p.bashT ?? 9) + dt);
    }
    for (const m of this.mobTargets.values()) {
      const o = m.obj;
      o.body.x += (m.x - o.body.x) * k;
      o.body.y += (m.y - o.body.y) * k;
      o.body.z += (m.z - o.body.z) * k;
      o.yaw = angleLerp(o.yaw, m.yaw, k);
      o.hurtTime += dt;
      if (o.attackTime !== undefined) o.attackTime += dt;
      if (o.dead) o.deathTime += dt;
    }
    for (const a of this.mobs.arrows) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.z += a.vz * dt;
    }
    for (const t of this.vehicleTargets.values()) {
      const o = t.obj;
      // A vehicle can move far between snapshots; follow quickly, and snap when it has teleported.
      if (Math.hypot(t.x - o.x, t.z - o.z) > 8) {
        o.x = t.x;
        o.y = t.y;
        o.z = t.z;
      } else {
        o.x += (t.x - o.x) * k;
        o.y += (t.y - o.y) * k;
        o.z += (t.z - o.z) * k;
      }
      o.yaw = angleLerp(o.yaw, t.yaw, k);
      o.hurt += dt;
    }
    // The rider's body is carried by the smoothed vehicle rather than hopping from snapshot to snapshot.
    const ride = this.riding && this.vehicleTargets.get(this.riding.id)?.obj;
    if (ride) {
      this.body.x = ride.x;
      this.body.y = ride.y + VEHICLE_SPECS[ride.kind].seat;
      this.body.z = ride.z;
    }
    for (const d of this.drops.drops) d.age += dt;
    for (const o of this.xpOrbs.orbs) o.age += dt;
    this.time = (this.time + dt / 1200) % 1;
  }

  private vehicleTargets = new Map<number, { obj: VehicleLike; x: number; y: number; z: number; yaw: number }>();
  private mobTargets = new Map<number, { obj: MobLike; x: number; y: number; z: number; yaw: number }>();

  // ---- receiving ---------------------------------------------------------------

  private handle(msg: NetServerMessage): void {
    switch (msg.t) {
      case 'snap':
        this.applySnapshot(msg);
        if (this.ready) {
          const out = [...this.carried, ...this.heldEvents];
          this.carried = [];
          if (out.length) this.cb.onEvents(out);
        } else {
          // Sounds and the like are not worth keeping while the world loads, but the quest log and the place you
          // spawned in (the server says both at once, on joining) are: the latest of each waits for the world.
          for (const e of this.heldEvents) {
            if (e.t !== 'quests' && e.t !== 'zone' && e.t !== 'party') continue;
            this.carried = this.carried.filter((c) => c.t !== e.t);
            this.carried.push(e);
          }
        }
        this.heldEvents = [];
        return;
      case 'events':
        // Shown after the snapshot that follows, so inventory data is current when the UI refreshes.
        this.heldEvents.push(...msg.events);
        return;
      case 'blocks':
        this.takeEdits(msg.blocks);
        return;
      case 'chat':
        this.cb.onChat(msg.from, msg.text, msg.ch, msg.to);
        return;
      case 'social':
        this.cb.onSocial?.(msg.view);
        return;
      case 'inspected':
        this.cb.onInspect?.(msg.name, msg.view);
        return;
      case 'trade':
        this.cb.onTrade?.(msg.view);
        return;
      case 'tradeAsk':
        this.cb.onTradeAsk?.(msg.from);
        return;
      case 'notice':
        this.cb.onNotice(msg.text);
        return;
      default:
    }
  }

  private applySnapshot(s: Snapshot): void {
    const y = s.you;
    // The server's word beats our prediction; the inputs it has not seen yet are replayed on top.
    Object.assign(this.body, { x: y.x, y: y.y, z: y.z, vx: y.vx, vy: y.vy, vz: y.vz, onGround: y.onGround, inWater: y.inWater, eyeInWater: y.eyeInWater });
    this.flying = y.flying;
    this.mode = y.mode;
    this.selected = y.selected;
    this.screen = y.screen;
    this.vitals.health = y.health;
    this.vitals.hunger = y.hunger;
    this.vitals.saturation = y.saturation;
    this.vitals.air = y.air;
    this.vitals.dead = y.dead;
    this.xp.level = y.level;
    this.xp.progress = y.xpProgress;
    this.coins = y.coins;
    this.defense = y.defense;
    this.killMessage = y.deathMessage;
    this.target = y.target;
    this.breakProgress = y.breakProgress;
    this.hudProgress = y.hudProgress;
    this.bowDraw = y.bowDraw;
    this.offhand.set(0, stackOf(y.offhand));
    this.mountSlot.set(0, stackOf(y.mountSlot));
    this.blocking = y.blocking;
    this.eatProgress = y.eat ?? 0;
    this.emberProgress = y.emb ?? 0;
    this.aimsAtTalker = !!y.talk;
    this.burning = y.burning;
    this.sleeping = y.sleeping > 0 ? { dir: y.sleeping - 1 } : null;
    this.riding = y.riding > 0 ? { id: y.riding } : null;
    this.mountIdx = y.mount ?? 0;
    this.mountCd = y.mountCd ?? [0, 0];
    this.cls = y.cls ?? null;
    this.applyFx(s);
    this.time = s.time;
    this.weather.kind = s.weather.kind;
    this.weather.rain = s.weather.rain;
    this.weather.storm = s.weather.storm;
    this.weather.flash = s.weather.flash;

    if (s.inv) this.applyInventory(s.inv);

    let i = 0;
    while (i < this.pending.length && this.pending[i].seq <= s.ack) i++;
    if (i > 0) this.pending.splice(0, i);
    if (this.ready) for (const p of this.pending) this.predict(p);

    this.applyOthers(s.players, s.keep);
    this.applyMobs(s);
  }

  private applyInventory(inv: InventoryView): void {
    for (let i = 0; i < BAG_SLOTS; i++) this.bags.set(i, stackOf(inv.bags?.[i] ?? null));
    for (let i = 0; i < this.inventory.size; i++) this.inventory.set(i, stackOf(inv.slots[i] ?? null));
    const mv = inv.menu;
    if (!mv) {
      this.menu = null;
      this.furnace = null;
      return;
    }
    if (!this.menu || this.menu.kind !== mv.kind || this.menu.slots.length !== mv.slots.length) {
      this.menu = this.buildMenu(mv.kind, mv.slots.length - PLAYER_SLOTS - BAG_MENU_SLOTS);
      this.menu.attachBags(this.inventory, this.bags);
    }
    const menu = this.menu;
    menu.slots.forEach((slot, i) => {
      if (slot.kind !== 'palette') slot.container.set(slot.index, stackOf(mv.slots[i] ?? null));
    });
    menu.cursor = stackOf(mv.cursor);
    if (menu instanceof TradeMenu && mv.trade) menu.adopt({ ...mv.trade }, mv.trade.selected);
    if (menu instanceof EnchantMenu && mv.enchant) menu.adopt(mv.enchant.shelves, mv.enchant.offers);
    if (menu instanceof AnvilMenu && mv.anvil) menu.adopt(mv.anvil.cost, mv.anvil.tooExpensive, mv.anvil.name ?? null);
    if (menu instanceof GrindstoneMenu && mv.grindstone) menu.adopt(mv.grindstone.xp);
    if (menu instanceof CraftingMenu) menu.adoptCraft(mv.craft ?? null);
    this.furnace = mv.furnace;
  }

  private buildMenu(kind: Menu['kind'], extra: number): Menu {
    switch (kind) {
      case 'crafting':
        return new CraftingMenu(this.inventory, 3);
      case 'furnace':
        return new FurnaceMenu(this.inventory, new Furnace());
      case 'chest':
        return new ChestMenu(this.inventory, new Container(Math.max(1, extra)));
      case 'creative':
        return new CreativeMenu(this.inventory);
      case 'trade':
        return new TradeMenu(this.inventory, newBook('unemployed'));
      case 'enchant':
        return new EnchantMenu(this.inventory, { shelves: 0, seed: () => 1, level: () => 0, creative: () => false, spend: () => {}, done: () => {} });
      case 'anvil':
        return new AnvilMenu(this.inventory, { level: () => 0, creative: () => false, spend: () => {}, done: () => {} });
      case 'grindstone':
        return new GrindstoneMenu(this.inventory, { creative: () => false, xp: () => {}, rand: () => 0, done: () => {} });
      default:
        return new CraftingMenu(this.inventory, 2, this.armor, this.offhand, this.mountSlot);
    }
  }

  /** The effects of the snapshot: the ones sent in full, and the ones only named (kept as they were last sent). */
  private applyFx(s: Snapshot): void {
    if (!s.fxKeep) {
      this.fx = s.fx ?? [];
      this.fxKnown.clear();
      for (const f of this.fx) this.fxKnown.set(f.id, f);
      return;
    }
    const list: Fx[] = s.fx ? [...s.fx] : [];
    for (const f of list) this.fxKnown.set(f.id, f);
    const live = new Set(list.map((f) => f.id));
    for (const id of s.fxKeep) {
      const f = this.fxKnown.get(id);
      if (f) list.push(f);
      live.add(id);
    }
    for (const id of this.fxKnown.keys()) if (!live.has(id)) this.fxKnown.delete(id);
    this.fx = list;
  }

  private applyOthers(list: PlayerView[], keep?: number[]): void {
    const seen = new Set<number>(keep);
    for (const v of list) {
      seen.add(v.id);
      let p = this.others.get(v.id);
      if (!p) {
        p = { id: v.id, name: v.name, look: v.look, x: v.x, y: v.y, z: v.z, yaw: v.yaw, pitch: v.pitch, sneaking: v.sneaking, held: v.held, armor: v.armor, offhand: v.offhand, blocking: v.blocking, sleeping: v.sleeping, speed: 0, tx: v.x, ty: v.y, tz: v.z, tyaw: v.yaw, tpitch: v.pitch };
        this.others.set(v.id, p);
      }
      p.tx = v.x;
      p.ty = v.y;
      p.tz = v.z;
      p.tyaw = v.yaw;
      p.tpitch = v.pitch;
      p.sneaking = v.sneaking;
      p.held = v.held;
      p.armor = v.armor;
      p.offhand = v.offhand;
      p.blocking = v.blocking;
      p.eating = v.ea === 1;
      p.dead = v.dd === 1;
      if (v.sw !== undefined && v.sw < (p.swingT ?? 9)) p.swingT = v.sw;
      if (v.bs !== undefined && v.bs < (p.bashT ?? 9)) p.bashT = v.bs;
      p.slam = v.sl ?? 0;
      p.charging = v.rs === 1;
      p.casting = v.em ?? 0;
      p.sleeping = v.sleeping;
      p.cls = v.cls;
      p.clv = v.clv;
      p.gt = v.gt;
      p.mount = v.mt;
    }
    for (const id of this.others.keys()) if (!seen.has(id)) this.others.delete(id);
  }

  private applyMobs(s: Snapshot): void {
    const seen = new Set<number>();
    const list: MobLike[] = [];
    for (const v of s.mobs) {
      seen.add(v.id);
      let t = this.mobTargets.get(v.id);
      if (!t) {
        const obj: MobLike = { id: v.id, kind: v.kind, body: { x: v.x, y: v.y, z: v.z }, yaw: v.yaw, walkPhase: v.walk, speedNow: v.speed, hurtTime: v.hurt, attackTime: v.atk ?? 99, dead: v.dead, deathTime: v.deathTime, burning: v.burning, fuse: v.fuse, fuseFraction: 0, size: v.size ?? 1, variant: v.variant ?? 0, baby: false, sheared: false, love: 0 };
        t = { obj, x: v.x, y: v.y, z: v.z, yaw: v.yaw };
        this.mobTargets.set(v.id, t);
      }
      const o = t.obj;
      t.x = v.x;
      t.y = v.y;
      t.z = v.z;
      t.yaw = v.yaw;
      o.walkPhase = v.walk;
      o.speedNow = v.speed;
      // Hurt time only ever restarts at zero on the server; interpolate in between.
      if (v.hurt < o.hurtTime) o.hurtTime = v.hurt;
      // The swing is only listed while it is on screen; a new one restarts the clock (in between it runs on its own).
      if (v.atk !== undefined && v.atk < (o.attackTime ?? 99)) o.attackTime = v.atk;
      o.dead = v.dead;
      o.deathTime = Math.max(o.deathTime, v.deathTime);
      o.burning = v.burning;
      o.size = v.size ?? 1;
      o.variant = v.variant ?? 0;
      o.baby = v.baby === 1;
      o.sheared = v.sheared === 1;
      o.love = v.love === 1 ? 1 : 0;
      o.fuse = v.fuse;
      o.fuseFraction = v.fuse < 0 ? 0 : Math.min(1, v.fuse / 1.5);
      list.push(o);
    }
    for (const id of this.mobTargets.keys()) if (!seen.has(id)) this.mobTargets.delete(id);
    this.mobs.mobs = list;
    // Reuse arrow objects so their meshes survive between snapshots.
    const arrows = this.mobs.arrows;
    arrows.length = Math.min(arrows.length, s.arrows.length);
    s.arrows.forEach((a, i) => (arrows[i] ? Object.assign(arrows[i], { b: undefined, p: undefined, s: undefined }, a) : arrows.push({ ...a })));

    const rigs: VehicleLike[] = [];
    const seenRigs = new Set<number>();
    for (const v of s.vehicles) {
      seenRigs.add(v.id);
      let t = this.vehicleTargets.get(v.id);
      if (!t) {
        t = { obj: { id: v.id, kind: v.kind, x: v.x, y: v.y, z: v.z, yaw: v.yaw, speed: v.speed, hurt: v.hurt }, x: v.x, y: v.y, z: v.z, yaw: v.yaw };
        this.vehicleTargets.set(v.id, t);
      }
      t.x = v.x;
      t.y = v.y;
      t.z = v.z;
      t.yaw = v.yaw;
      t.obj.speed = v.speed;
      if (v.hurt < t.obj.hurt) t.obj.hurt = v.hurt;
      rigs.push(t.obj);
    }
    for (const id of this.vehicleTargets.keys()) if (!seenRigs.has(id)) this.vehicleTargets.delete(id);
    this.vehicles = rigs;

    const drops: DropLike[] = [];
    for (const d of s.drops) drops.push({ id: d.id, stack: { id: d.item, count: d.count, damage: d.damage, ...(d.name ? { name: d.name } : {}), ...(d.ench ? { ench: d.ench } : {}), ...(d.g ? { gear: d.g } : {}) }, x: d.x, y: d.y, z: d.z, age: d.age, phase: d.phase });
    this.drops.drops = drops;
    this.drops.count = drops.length;
    this.xpOrbs.orbs = (s.orbs ?? []).map((o) => ({ id: o.id, value: o.v, x: o.x, y: o.y, z: o.z, age: o.age, phase: o.phase }));

  }
}
