import * as THREE from 'three';
import { I, MESSAGES, pointInPolygon, raycast, type Command, type LandClaimView, type LandEvent, type LandPreview, type Perms, type ProtectedZone } from '@solrift/shared';
import { freshLand, setLand, useUi, type LandApi, type LandLook, type LandUi } from '../ui/store';
import type { ClientSession } from './clientSession';
import type { Input } from './input';
import { LandFx, type ClaimDraw, type FxHooks, type StraightDraw } from './landFx';
import type { SurveyorSignals } from './held/surveyor';
import { Markers, inLineWith, isPerfect, localFault, straightText, straightness, verdictOf, type Corner, type Fault } from './landMarkers';

/**
 * The player's side of the land: the Land Surveyor in the hand (marking corners with the mouse), the live price, the confirmation and
 * the window of the player's lands. Everything is the player asking: the price, the verdict, the sale and the rights are the server's
 * (the replies arrive as `LandEvent`s). What is kept here is only what has to be shown, and it is thrown away when the server says otherwise.
 */

export interface LandClientParts {
  session: ClientSession;
  input: Input;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Object3D;
  world: { getBlock(x: number, y: number, z: number): number; surfaceY(x: number, z: number): number };
  sendCommand(c: Command): void;
  toast(text: string): void;
  /** The mouse goes to a window (true) or comes back to the game (false). */
  mouse(window: boolean): void;
  mote?: FxHooks['mote'];
  /** A sound of the moment of a purchase. */
  chime?(): void;
  /** The Surveyor in the hand: told whether a shape is being marked, how it looks and what just happened, so that the staff in the hand answers it. */
  hand?: SurveyorSignals;
  /** What the browser keeps between visits (the tutorial); injectable for tests. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** The time, in seconds. */
  now?(): number;
}

const TUTORIAL_KEY = 'solrift-land-tutorial';
const TUTORIAL_SHOWS = 2;
/** How far the crosshair reaches for a corner. */
const AIM_REACH = 64;
/** How often a preview may be asked for while a corner is moved (s). */
const PREVIEW_EVERY = 0.2;
/** Claims within this many blocks of the player are outlined while the Surveyor is in the hand. */
const DRAW_RADIUS = 110;
const MAX_DRAWN = 20;

const sanitizeName = (s: string): string => s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);

export function makeLandClient(parts: LandClientParts) {
  const { session, input, camera, world, sendCommand, toast } = parts;
  const now = parts.now ?? (() => performance.now() / 1000);
  const store = parts.storage ?? (typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null, setItem: () => undefined });
  const markers = new Markers({ minEdge: 3, minCorners: 3, maxCorners: 12 });
  const fx = new LandFx({ groundY: (x, z) => world.surfaceY(x, z), mote: parts.mote }, 16);
  parts.scene.add(fx.root);

  const nearby = new Map<string, LandClaimView>();
  /** The server's own territory round here (towns, vaults, landmarks, reserved ground): nobody can buy or change it. */
  let zones: ProtectedZone[] = [];
  let insideZone: string | null = null;
  let cfgSeen = false;
  /** Seconds until the next "tell me about the land" while the rules have not come, and how many times it was asked. */
  let helloIn = 0;
  let hellos = 0;
  let holding = false;
  let aim: Corner | null = null;
  let fault: Fault | null = null;
  let preview: LandPreview | null = null;
  let expanding: string | null = null;
  let lastSig = '';
  let lastAsk = -9;
  let wantAsk = false;
  let idem: { sig: string; key: string } | null = null;
  let busyUntil = 0;
  let hintAt = -9;
  let lastHint = '';
  const enteredAt = new Map<string, number>();
  let insideId: string | null = null;
  let stepCheck = 0;
  let lastLookKey = '';

  const ray = { o: new THREE.Vector3(), d: new THREE.Vector3() };

  /** Write to the store only what changed (this runs every frame). */
  function push(patch: Partial<LandUi>): void {
    const cur = useUi.getState().land;
    for (const k of Object.keys(patch) as (keyof LandUi)[]) {
      if (cur[k] !== patch[k]) {
        setLand(patch);
        return;
      }
    }
  }

  function hint(text: string, tone: 'good' | 'warn' | 'bad' | 'info', cooldown = 1.6): void {
    const t = now();
    if (text === lastHint && t - hintAt < cooldown * 3) return;
    if (t - hintAt < cooldown && text !== lastHint) return;
    lastHint = text;
    hintAt = t;
    setLand({ hint: { text, tone, stamp: (useUi.getState().land.hint?.stamp ?? 0) + 1 } });
  }

  function shape(): Corner[] {
    // (A corner of a closed shape that is carried follows the crosshair too: the price and the marks are of where it would go.)
    return markers.shape(markers.closed && markers.grabbed < 0 ? null : aim);
  }

  /** Ask the server for the price of the shape as it stands (not more often than the server likes). */
  function askPreview(force = false): void {
    const pts = shape();
    if (pts.length < 3 || fault) {
      if (preview) preview = null;
      return;
    }
    const sig = JSON.stringify([pts, expanding]);
    if (!force && sig === lastSig) return;
    if (!force && now() - lastAsk < PREVIEW_EVERY) {
      wantAsk = true;
      return;
    }
    lastSig = sig;
    lastAsk = now();
    wantAsk = false;
    sendCommand({ t: 'land', a: 'preview', v: pts, ...(expanding ? { expand: expanding } : {}) });
  }

  function claimAt(x: number, z: number): LandClaimView | null {
    for (const c of nearby.values()) {
      const [x0, z0, x1, z1] = c.box;
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      if (pointInPolygon(c.vertices, x, z)) return c;
    }
    return null;
  }

  function zoneAt(x: number, z: number): ProtectedZone | null {
    for (const zn of zones) {
      const [x0, z0, x1, z1] = zn.box;
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      if (pointInPolygon(zn.vertices, x, z)) return zn;
    }
    return null;
  }

  const ZONE_TEXT: Record<ProtectedZone['kind'], string> = {
    town: 'Protected territory. It cannot be changed or claimed.',
    landmark: 'Protected landmark. The ground round it is kept free for everybody.',
    reserved: 'Reserved ground. It cannot be claimed.',
  };

  function lookAt(cell: Corner | null): LandLook | null {
    if (!cell) return null;
    const c = claimAt(cell[0], cell[1]);
    const zn = c ? null : zoneAt(cell[0], cell[1]);
    if (zn) return { kind: 'protected', name: zn.name, owner: 'The server', shared: false, canBuild: false, can: null, area: 0, note: ZONE_TEXT[zn.kind] };
    if (!c) return { kind: 'wild', name: 'Unclaimed wilderness', owner: '', shared: false, canBuild: true, can: null, area: 0 };
    return { kind: c.kind, name: c.name, owner: c.owner, shared: c.shared, canBuild: c.can.build, can: c.can, area: c.area };
  }

  function claimDraws(px: number, pz: number, focus: string | null): ClaimDraw[] {
    const list: { d: number; c: LandClaimView }[] = [];
    for (const c of nearby.values()) {
      if (c.status === 'released' || c.status === 'revoked') continue;
      const cx = (c.box[0] + c.box[2]) / 2;
      const cz = (c.box[1] + c.box[3]) / 2;
      const d = Math.hypot(cx - px, cz - pz) - Math.hypot(c.box[2] - c.box[0], c.box[3] - c.box[1]) / 2;
      if (d < DRAW_RADIUS) list.push({ d, c });
    }
    list.sort((a, b) => a.d - b.d);
    return list.slice(0, MAX_DRAWN).map(({ c }) => ({ id: `${c.id}.${c.rev}`, vertices: c.vertices as Corner[], kind: c.kind, focus: c.id === focus }));
  }

  /** What changed in the world's rules or the player's claims, as the server tells it. */
  function onEvent(e: LandEvent): void {
    switch (e.k) {
      case 'cfg': {
        cfgSeen = true;
        markers.rules = { minEdge: e.cfg.minEdge, minCorners: e.cfg.minCorners, maxCorners: Math.min(16, e.cfg.maxCorners) };
        setLand({ cfg: e.cfg });
        // The player's own lands, once, so the window is ready and the number of them is known.
        sendCommand({ t: 'land', a: 'list' });
        break;
      }
      case 'preview':
        preview = e.preview;
        break;
      case 'mine':
        setLand({ mine: e.claims });
        break;
      case 'sync': {
        for (const id of e.remove) nearby.delete(id);
        for (const c of e.add) nearby.set(c.id, c);
        setLand({ nearby: [...nearby.values()] });
        break;
      }
      case 'zones':
        zones = e.zones.slice(0, 40);
        break;
      case 'detail':
        setLand({ detail: e.detail });
        break;
      case 'recovered':
        toast(e.stacks > 0 ? `Recovered ${e.stacks} stack${e.stacks === 1 ? '' : 's'} of items from the wilderness.` : 'There is nothing to recover.');
        break;
      case 'result': {
        const r = e.result;
        const buying = e.what === 'buy' || e.what === 'expand';
        busyUntil = 0;
        setLand({ busy: false, result: { what: e.what, ok: r.ok, text: r.text, stamp: (useUi.getState().land.result?.stamp ?? 0) + 1 } });
        if (buying && r.ok) {
          const pts = markers.corners.map((c): Corner => [c[0], c[1]]);
          if (!r.replay) {
            fx.celebrate(r.claim ? (r.claim.vertices as Corner[]) : pts);
            parts.hand?.push('claim');
            parts.chime?.();
          }
          markers.clear();
          expanding = null;
          preview = null;
          idem = null;
          lastSig = '';
          setLand({ confirm: false, expanding: null });
          parts.mouse(false);
          sendCommand({ t: 'land', a: 'list' });
        } else if (!buying) {
          if (!r.ok) toast(r.text);
          sendCommand({ t: 'land', a: 'list' });
          const open = useUi.getState().land.detail;
          if (open) sendCommand({ t: 'land', a: 'detail', id: open.id });
        }
        break;
      }
    }
  }

  function closeConfirm(): void {
    if (!useUi.getState().land.confirm) return;
    setLand({ confirm: false, result: null });
    parts.mouse(false);
  }

  function openConfirm(): void {
    askPreview(true);
    setLand({ confirm: true, result: null, busy: false });
    parts.mouse(true);
  }

  function openManage(): void {
    if (!useUi.getState().land.cfg) return;
    setLand({ manage: true, result: null });
    sendCommand({ t: 'land', a: 'list' });
    parts.mouse(true);
  }

  function closeManage(): void {
    if (!useUi.getState().land.manage) return;
    setLand({ manage: false, detail: null });
    parts.mouse(false);
  }

  function cancel(): void {
    markers.clear();
    expanding = null;
    preview = null;
    lastSig = '';
    idem = null;
    setLand({ expanding: null, confirm: false });
  }

  const api: LandApi = {
    confirmOpen: openConfirm,
    confirmClose: closeConfirm,
    buy(name) {
      const l = useUi.getState().land;
      const pts = markers.corners.map((c): Corner => [c[0], c[1]]);
      if (!markers.closed || pts.length < 3 || l.busy) return;
      const sig = JSON.stringify([pts, expanding]);
      // One purchase has one key: sent again (a lost reply, a second click) it is the same purchase, never a second charge.
      if (!idem || idem.sig !== sig) idem = { sig, key: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}` };
      busyUntil = now() + 8;
      setLand({ busy: true, result: null });
      if (expanding) sendCommand({ t: 'land', a: 'expand', id: expanding, v: pts, idem: idem.key });
      else sendCommand({ t: 'land', a: 'buy', v: pts, name: sanitizeName(name) || 'My Land', idem: idem.key });
    },
    cancel,
    openManage,
    closeManage,
    refresh: () => sendCommand({ t: 'land', a: 'list' }),
    select(id) {
      if (!id) setLand({ detail: null });
      else sendCommand({ t: 'land', a: 'detail', id });
    },
    rename: (id, name) => sendCommand({ t: 'land', a: 'rename', id, name: sanitizeName(name) || 'My Land' }),
    grant: (id, kind, who, role) => sendCommand({ t: 'land', a: 'grant', id, kind, who, role }),
    revoke: (id, kind, who) => sendCommand({ t: 'land', a: 'revoke', id, kind, who }),
    setPublic: (id, perms: Partial<Perms>, guildRole) => sendCommand({ t: 'land', a: 'public', id, perms, ...(guildRole ? { guildRole } : {}) }),
    release: (id) => sendCommand({ t: 'land', a: 'release', id }),
    unrelease: (id) => sendCommand({ t: 'land', a: 'unrelease', id }),
    expand(id) {
      const c = useUi.getState().land.mine.find((m) => m.id === id) ?? nearby.get(id);
      if (!c) return;
      markers.clear();
      for (const v of c.vertices) markers.corners.push([v[0], v[1]]);
      markers.closed = true;
      expanding = id;
      preview = null;
      lastSig = '';
      idem = null;
      setLand({ manage: false, expanding: id, detail: null });
      parts.mouse(false);
      toast('Click a corner to pick it up, then click where it should go. Press E when you are done.');
    },
    recover: () => sendCommand({ t: 'land', a: 'recover' }),
    dismissTutorial() {
      try {
        store.setItem(TUTORIAL_KEY, String(TUTORIAL_SHOWS));
      } catch {
        // (a private window may not keep it)
      }
      setLand({ tutorial: false });
    },
  };
  useUi.setState({ landApi: api });

  /** A key the game would otherwise take (E: inventory, B: codex). True when the land has used it. */
  function key(code: string): boolean {
    const l = useUi.getState().land;
    if (!l.cfg) return false;
    if (code === 'KeyB') {
      if (!holding && useUi.getState().codex) return false;
      openManage();
      return true;
    }
    if (code === 'KeyE' && holding) {
      if (markers.closed) {
        openConfirm();
        return true;
      }
      if (markers.count >= markers.rules.minCorners) {
        if (markers.close()) {
          hint('Shape closed. Press E again to see the price.', 'good');
          parts.hand?.push('seal');
        } else {
          const f = localFault(markers.corners, markers.rules, true);
          hint(f?.text ?? 'That shape cannot be closed.', 'bad');
        }
        return true;
      }
      return false;
    }
    return false;
  }

  /** A key pressed while a land window is up: Escape (and B) closes it. True when a window is up (the key is then nobody else's). */
  function handleKey(e: KeyboardEvent): boolean {
    const l = useUi.getState().land;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement | null)?.tagName ?? '');
    if (l.confirm) {
      if (e.code === 'Escape') {
        e.preventDefault();
        closeConfirm();
      }
      return true;
    }
    if (l.manage) {
      if (e.code === 'Escape' || (e.code === 'KeyB' && !typing)) {
        e.preventDefault();
        closeManage();
      }
      return true;
    }
    return false;
  }

  /**
   * The mouse was let go (Escape): a shape that was being marked is given up, unless a window or the inventory is what took the mouse.
   * True when it gave one up: that Escape was the Surveyor's, and the game does not bring up its pause screen for it (one more Escape, with
   * nothing marked, does).
   */
  function onUnlock(windowUp: boolean): boolean {
    if (windowUp || !holding || markers.count === 0) return false;
    cancel();
    hint('Land selection cancelled. Click to keep playing.', 'info', 0);
    return true;
  }

  /**
   * Once a frame. `playing`: the mouse is the game's. `left`, `right`: a button went down since the last frame.
   * `x, y, z`: where the player's feet are (for the claims round and the readout of entering one).
   */
  function update(dt: number, playing: boolean, left: boolean, right: boolean): void {
    const held = session.held;
    // The server tells the rules of the land once, a second after joining: that may be while the world is still loading, and then the
    // word is lost. Without it nothing here would ever show, so while it has not come, ask again (often at first, then now and then:
    // in a game with no land at all nobody answers, and that costs a message a half minute).
    if (!cfgSeen && playing) {
      helloIn -= dt;
      if (helloIn <= 0) {
        helloIn = ++hellos < 8 ? 2 : 30;
        sendCommand({ t: 'land', a: 'hello' });
      }
    }
    const nowHolding = !!held && held.id === I.LAND_SURVEYOR && cfgSeen && !session.spectating;
    if (nowHolding !== holding) {
      holding = nowHolding;
      if (parts.hand) {
        parts.hand.surveying = holding;
        if (!holding) {
          parts.hand.tone = 'idle';
          parts.hand.clear();
        }
      }
      let shows = 0;
      try {
        shows = Number(store.getItem(TUTORIAL_KEY) ?? 0) || 0;
      } catch {
        shows = 0;
      }
      if (holding && shows < TUTORIAL_SHOWS) {
        try {
          store.setItem(TUTORIAL_KEY, String(shows + 1));
        } catch {
          // (a private window may not keep it)
        }
        setLand({ tutorial: true });
      } else if (!holding) setLand({ tutorial: false });
      if (!holding) {
        aim = null;
        push({ holding: false, look: null });
      }
    }

    const body = session.body;
    // Entering and leaving a claim, said once in a while.
    stepCheck -= dt;
    if (stepCheck <= 0 && cfgSeen) {
      stepCheck = 0.4;
      const cur = useUi.getState().land.at;
      const ax = Math.round(body.x);
      const az = Math.round(body.z);
      if (cur[0] !== ax || cur[1] !== az) setLand({ at: [ax, az] });
      const here = claimAt(Math.floor(body.x), Math.floor(body.z));
      const id = here?.id ?? null;
      if (id !== insideId) {
        insideId = id;
        if (here) {
          const t = now();
          if (t - (enteredAt.get(here.id) ?? -999) > 60) {
            enteredAt.set(here.id, t);
            const mine = here.kind === 'mine';
            toast(mine ? `Entering your land: ${here.name}` : `Entering ${here.name} (${here.owner}). ${here.can.build ? 'You may build here.' : MESSAGES.protectedProperty}`);
          }
        }
      }
      // The server's own territory, the same way: said once when the player walks in (and again after a minute away).
      const inZone = here ? null : zoneAt(Math.floor(body.x), Math.floor(body.z));
      const zid = inZone?.id ?? null;
      if (zid !== insideZone) {
        insideZone = zid;
        if (inZone) {
          const t = now();
          if (t - (enteredAt.get(`z.${inZone.id}`) ?? -999) > 60) {
            enteredAt.set(`z.${inZone.id}`, t);
            toast(`Entering ${inZone.name}. ${ZONE_TEXT[inZone.kind]}`);
          }
        }
      }
    }

    if (busyUntil > 0 && now() > busyUntil) {
      busyUntil = 0;
      setLand({ busy: false, result: { what: 'buy', ok: false, text: 'No answer yet. You can try again: you will not be charged twice.', stamp: (useUi.getState().land.result?.stamp ?? 0) + 1 } });
    }
    if (wantAsk) askPreview();

    if (!holding) {
      fx.frame(dt, null, []);
      return;
    }

    // What the crosshair is on.
    if (playing) {
      camera.getWorldDirection(ray.d);
      ray.o.copy(camera.position);
      const hit = raycast(world, ray.o.x, ray.o.y, ray.o.z, ray.d.x, ray.d.y, ray.d.z, AIM_REACH);
      aim = hit ? [hit.x, hit.z] : null;
    }

    if (playing && aim) {
      if (left) {
        const r = markers.place(aim[0], aim[1]);
        // A corner put in the ground (a new one, one put down where it was carried to, one cut into an edge) is the staff driven in.
        if (r === 'added' || r === 'inserted' || (r === 'moved' && markers.grabbed < 0)) parts.hand?.push('plant');
        if (r === 'full') hint(`A claim can have at most ${markers.rules.maxCorners} corners.`, 'warn');
        else if (r === 'same') hint('Two corners are in the same place.', 'bad');
        else if (r === 'closed') hint('The shape is closed. Click a corner to move it, an edge to add a corner, or right-click to open it again.', 'info');
        else if (r === 'inserted') hint('New corner. Click where it should go; right-click takes it away again.', 'info');
        else if (r === 'moved' && markers.grabbed >= 0) hint('Corner picked up. Click where it should go; right-click puts it back.', 'info');
      }
    }
    if (playing && right) {
      if (markers.count > 0) parts.hand?.push('pluck');
      if (markers.closed && markers.grabbed < 0 && (!aim || markers.nearest(aim[0], aim[1], 0.5) < 0)) markers.reopen();
      else markers.undo(aim?.[0], aim?.[1]);
    }

    const pts = shape();
    // The shape is judged as the server will see it: closed (with the crosshair as the last corner while it is open), from three corners.
    fault = pts.length >= 2 ? localFault(pts, markers.rules, markers.closed || pts.length >= 3) : null;
    if (fault && !left && !right) hint(fault.text, 'bad', 2.5);
    askPreview();
    const verdict = verdictOf(fault, preview, pts.length);
    if (parts.hand) parts.hand.tone = verdict;
    // How true the corners are: square ones, the lines the crosshair is in line with, and a perfect rectangle or square (a shape of three corners or more is judged closed).
    const sg = straightness(pts, pts.length >= 3);
    const perfect = isPerfect(sg);
    const dragging = markers.grabbed >= 0;
    const inLine = aim && (dragging || !markers.closed) ? inLineWith(aim, markers.corners, markers.grabbed) : [];
    const straight: StraightDraw = { ticks: sg.ticks, guides: inLine.map((i) => markers.corners[i]), from: inLine.length > 0 ? aim : null, outline: perfect ? pts : null };
    const draws = claimDraws(body.x, body.z, null);
    const look = lookAt(aim);
    const focusId = aim ? (claimAt(aim[0], aim[1])?.id ?? null) : null;
    fx.frame(
      dt,
      { corners: markers.grabbed >= 0 ? pts.slice(0, markers.corners.length) : markers.corners, aim: markers.closed ? null : aim, closed: markers.closed, verdict, grabbed: markers.grabbed, straight },
      draws.map((c) => ({ ...c, focus: c.id.startsWith(`${focusId}.`) })),
    );
    // The panel and the readout follow what changed.
    const lookKey = look ? `${look.kind}|${look.name}|${look.owner}|${look.canBuild}|${look.shared}|${look.note ?? ''}` : '';
    if (lookKey !== lastLookKey) {
      lastLookKey = lookKey;
      setLand({ look });
    }
    push({ holding: true, corners: markers.count, closed: markers.closed, fault: fault?.text ?? null, straightText: fault ? null : straightText(sg, markers.closed, inLine), perfect: !fault && perfect, preview, expanding });
  }

  function reset(): void {
    cancel();
    nearby.clear();
    zones = [];
    insideZone = null;
    holding = false;
    if (parts.hand) {
      parts.hand.surveying = false;
      parts.hand.tone = 'idle';
      parts.hand.clear();
    }
    cfgSeen = false;
    helloIn = 0;
    hellos = 0;
    insideId = null;
    fx.frame(0, null, []);
    useUi.setState({ land: freshLand(), landApi: null });
  }

  return {
    update,
    onEvent,
    key,
    handleKey,
    onUnlock,
    reset,
    get holding(): boolean {
      return holding;
    },
    /** The server's own territory the server has told about (for tests and the debug hooks). */
    get zones(): readonly ProtectedZone[] {
      return zones;
    },
    get markers(): Markers {
      return markers;
    },
    get fx(): LandFx {
      return fx;
    },
    api,
    dispose: () => fx.dispose(),
  };
}

export type LandClient = ReturnType<typeof makeLandClient>;
