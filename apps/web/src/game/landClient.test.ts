import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LAND_CONFIG, I, parseNetClientMessage, publicLandConfig, type Command, type LandClaimView, type ProtectedZone } from '@solrift/shared';
import { freshLand, useUi } from '../ui/store';
import type { ClientSession } from './clientSession';
import type { Input } from './input';
import { makeLandClient, type LandClient } from './landClient';
import { SurveyorSignals, surveyorMove, surveyorMomentLength, type SurveyorEvent } from './held/surveyor';

/** A flat world of stone up to y = 9, and a player who looks straight down at the block they choose. */
const world = { getBlock: (_x: number, y: number) => (y <= 9 ? 1 : 0), surfaceY: () => 9 };

interface Rig {
  c: LandClient;
  sent: Command[];
  mouse: boolean[];
  toasts: string[];
  held: { id: number } | null;
  t: number;
  /** What the staff in the hand is told. */
  hand: SurveyorSignals;
  /** Where the player stands. */
  body: { x: number; y: number; z: number };
  /** One frame with the crosshair on the block (x, z), with the buttons that went down. */
  step(x: number, z: number, buttons?: { left?: boolean; right?: boolean }, playing?: boolean): void;
}

function rig(): Rig {
  const sent: Command[] = [];
  const mouse: boolean[] = [];
  const toasts: string[] = [];
  const camera = new THREE.PerspectiveCamera();
  camera.rotation.order = 'YXZ';
  const body = { x: 0, y: 10, z: 0 };
  const hand = new SurveyorSignals();
  const r = { held: { id: I.LAND_SURVEYOR } as { id: number } | null, t: 100, body, hand } as Rig;
  const session = {
    get held() {
      return r.held;
    },
    body,
    spectating: false,
  } as unknown as ClientSession;
  const c = makeLandClient({
    session,
    input: {} as Input,
    camera,
    scene: new THREE.Group(),
    world,
    sendCommand: (x) => sent.push(x),
    toast: (t) => toasts.push(t),
    mouse: (w) => mouse.push(w),
    storage: { getItem: () => '9', setItem: () => undefined },
    now: () => r.t,
    hand,
  });
  r.c = c;
  r.sent = sent;
  r.mouse = mouse;
  r.toasts = toasts;
  r.step = (x, z, b = {}, playing = true) => {
    camera.position.set(x + 0.5, 20, z + 0.5);
    camera.rotation.set(-Math.PI / 2 + 0.0001, 0, 0);
    camera.updateMatrixWorld(true);
    r.t += 0.3;
    c.update(0.05, playing, !!b.left, !!b.right);
  };
  return r;
}

const cfg = publicLandConfig(DEFAULT_LAND_CONFIG);
const previews = (r: Rig) => r.sent.filter((s) => s.t === 'land' && s.a === 'preview');

describe('the land on the client', () => {
  beforeEach(() => {
    useUi.setState({ land: freshLand(), landApi: null });
  });

  it('shows nothing until the server has said this world has land', () => {
    const r = rig();
    r.step(5, 5);
    expect(r.c.holding).toBe(false);
    expect(useUi.getState().land.holding).toBe(false);
    r.c.onEvent({ k: 'cfg', cfg });
    r.step(5, 5);
    expect(r.c.holding).toBe(true);
    expect(useUi.getState().land.holding).toBe(true);
    expect(useUi.getState().land.cfg?.pricePerBlock).toBe(cfg.pricePerBlock);
  });

  it('asks the server about the land while it has not heard (the word sent while the world loaded is lost), and stops once it has', () => {
    const r = rig();
    const hellos = () => r.sent.filter((s) => s.t === 'land' && s.a === 'hello').length;
    r.step(5, 5, {}, false);
    expect(hellos()).toBe(0);
    r.step(5, 5);
    expect(hellos()).toBe(1);
    r.step(5, 5);
    expect(hellos()).toBe(1);
    for (let i = 0; i < 50; i++) r.step(5, 5);
    expect(hellos()).toBeGreaterThanOrEqual(2);
    r.c.onEvent({ k: 'cfg', cfg });
    const n = hellos();
    for (let i = 0; i < 40; i++) r.step(5, 5);
    expect(hellos()).toBe(n);
    expect(r.c.holding).toBe(true);
  });

  it('marks a corner at each left click, on the block the crosshair is on, and takes it back with the right button', () => {
    const r = rig();
    r.c.onEvent({ k: 'cfg', cfg });
    r.step(100, 100, { left: true });
    r.step(120, 100, { left: true });
    r.step(120, 120, { left: true });
    expect(r.c.markers.corners).toEqual([[100, 100], [120, 100], [120, 120]]);
    expect(useUi.getState().land.corners).toBe(3);
    r.step(110, 110, { right: true });
    expect(r.c.markers.count).toBe(2);
    expect(useUi.getState().land.corners).toBe(2);
  });

  it('tells the player when the corners are true: in line with a corner, a perfect rectangle once closed, and not when a corner is a block off', () => {
    const r = rig();
    r.c.onEvent({ k: 'cfg', cfg });
    r.step(100, 100, { left: true });
    r.step(120, 100, { left: true });
    r.step(120, 118, { left: true });
    // The crosshair is where the fourth corner of a rectangle goes: it says so, and the edge is drawn white.
    r.step(100, 118);
    expect(useUi.getState().land.perfect).toBe(true);
    expect(useUi.getState().land.straightText).toBe('This corner makes a perfect rectangle: 21 x 19');
    // A block off that: only two edges are straight.
    r.step(101, 119);
    expect(useUi.getState().land.perfect).toBe(false);
    expect(useUi.getState().land.straightText).toBe('Straight edges: 2 of 4');
    // Straight below the first corner (but nothing square): the crosshair is in line with it.
    r.step(100, 130);
    expect(useUi.getState().land.straightText).toBe('In line with corner 1');
    r.step(100, 118, { left: true });
    r.c.key('KeyE');
    expect(r.c.markers.closed).toBe(true);
    r.step(100, 118);
    expect(useUi.getState().land.perfect).toBe(true);
    expect(useUi.getState().land.straightText).toBe('Perfect rectangle, 21 x 19');
    // Picking a corner up and putting it a block off spoils it.
    r.step(100, 118, { left: true });
    r.step(103, 119);
    expect(useUi.getState().land.perfect).toBe(false);
    r.step(100, 118, { left: true });
    expect(useUi.getState().land.perfect).toBe(true);
  });

  it('does not mark anything while the mouse is not the game\u2019s, or while the Surveyor is not held', () => {
    const r = rig();
    r.c.onEvent({ k: 'cfg', cfg });
    r.step(100, 100, { left: true }, false);
    expect(r.c.markers.count).toBe(0);
    r.held = { id: I.DIAMOND };
    r.step(100, 100, { left: true });
    expect(r.c.markers.count).toBe(0);
  });

  it('asks for the price of the shape as the crosshair moves, never more often than it may, and never for a shape that is plainly wrong', () => {
    const r = rig();
    r.c.onEvent({ k: 'cfg', cfg });
    r.step(100, 100, { left: true });
    r.step(120, 100, { left: true });
    expect(previews(r)).toHaveLength(0);
    r.step(120, 120);
    expect(previews(r)).toHaveLength(1);
    expect(previews(r)[0]).toMatchObject({ v: [[100, 100], [120, 100], [120, 120]] });
    // The crosshair moves a little on the same frame time: no second question yet.
    r.t -= 0.29;
    r.step(121, 121);
    r.t -= 0.29;
    expect(previews(r).length).toBeLessThanOrEqual(2);
    // A third corner on top of the first is a fault the player sees at once, and nothing is sent for it.
    const before = previews(r).length;
    r.step(100, 100);
    expect(useUi.getState().land.fault).toBeNull(); // (the ghost on a corner is simply not added)
    r.step(100, 101);
    expect(useUi.getState().land.fault).toBe('The corners are too close together.');
    expect(previews(r).length).toBe(before);
  });

  it('closes the shape with E, opens the confirmation with the next E, and leaves the inventory key alone when it has no use for it', () => {
    const r = rig();
    r.c.onEvent({ k: 'cfg', cfg });
    expect(r.c.key('KeyE')).toBe(false);
    r.step(100, 100, { left: true });
    expect(r.c.key('KeyE')).toBe(false);
    r.step(120, 100, { left: true });
    r.step(120, 120, { left: true });
    expect(r.c.key('KeyE')).toBe(true);
    expect(r.c.markers.closed).toBe(true);
    expect(useUi.getState().land.confirm).toBe(false);
    r.step(120, 120);
    expect(r.c.key('KeyE')).toBe(true);
    expect(useUi.getState().land.confirm).toBe(true);
    expect(r.mouse.at(-1)).toBe(true);
    expect(previews(r).at(-1)).toMatchObject({ v: [[100, 100], [120, 100], [120, 120]] });
  });

  it('buys with one key for one purchase, and celebrates and clears the shape only when the server says it is sold', () => {
    const r = rig();
    r.c.onEvent({ k: 'cfg', cfg });
    for (const [x, z] of [[100, 100], [119, 100], [119, 119], [100, 119]]) r.step(x, z, { left: true });
    r.c.key('KeyE');
    r.c.key('KeyE');
    r.c.api.buy('  <b>My Keep</b>  ');
    const buys = () => r.sent.filter((s) => s.t === 'land' && s.a === 'buy') as Extract<Command, { t: 'land'; a: 'buy' }>[];
    expect(buys()).toHaveLength(1);
    expect(buys()[0].name).toBe('bMy Keep/b');
    expect(buys()[0].name).not.toMatch(/[<>]/);
    expect(buys()[0].idem).toMatch(/^[A-Za-z0-9_-]{8,}$/);
    // A second click while the first is in the air is not a second purchase.
    r.c.api.buy('x');
    expect(buys()).toHaveLength(1);
    expect(useUi.getState().land.busy).toBe(true);
    expect(r.c.markers.count).toBe(4);
    // The server's refusal leaves everything as it was, and says why.
    r.c.onEvent({ k: 'result', what: 'buy', result: { ok: false, code: 'funds', text: 'Not enough Auren.' } });
    expect(useUi.getState().land.busy).toBe(false);
    expect(useUi.getState().land.result?.text).toBe('Not enough Auren.');
    expect(r.c.markers.count).toBe(4);
    expect(useUi.getState().land.confirm).toBe(true);
    // Tried again, it is the same purchase (the same key).
    const firstKey = buys()[0].idem;
    r.c.api.buy('My Keep');
    expect(buys()).toHaveLength(2);
    expect(buys()[1].idem).toBe(firstKey);
    // Sold.
    r.c.onEvent({ k: 'result', what: 'buy', result: { ok: true, code: 'ok', text: 'Land Claimed! Your property is now protected.', charged: 2000 } });
    expect(r.c.markers.count).toBe(0);
    expect(useUi.getState().land.confirm).toBe(false);
    expect(r.c.fx.celebrating).toBe(true);
    expect(r.mouse.at(-1)).toBe(false);
  });

  it('gives a shape up when the mouse is let go by Escape, but not when a window takes the mouse', () => {
    const r = rig();
    r.c.onEvent({ k: 'cfg', cfg });
    r.step(100, 100, { left: true });
    r.step(120, 100, { left: true });
    expect(r.c.onUnlock(true)).toBe(false);
    expect(r.c.markers.count).toBe(2);
    expect(r.c.onUnlock(false)).toBe(true);
    expect(r.c.markers.count).toBe(0);
    expect(useUi.getState().land.hint?.text).toContain('Land selection cancelled.');
    // With nothing marked, Escape is the game's: the pause screen.
    expect(r.c.onUnlock(false)).toBe(false);
  });

  it('leaves nothing in the world when the Surveyor is put away, and brings the marks back when it is taken up again', () => {
    const r = rig();
    r.c.onEvent({ k: 'cfg', cfg });
    r.step(100, 100, { left: true });
    r.step(120, 100, { left: true });
    expect(r.c.fx.root.visible).toBe(true);
    r.held = null;
    r.step(120, 100);
    expect(r.c.fx.root.visible).toBe(false);
    expect(useUi.getState().land.holding).toBe(false);
    r.held = { id: I.LAND_SURVEYOR };
    r.step(120, 100);
    expect(r.c.fx.root.visible).toBe(true);
    expect(r.c.markers.count).toBe(2);
  });

  it('knows the claims round the player, what the crosshair is on, and what the player may do there', () => {
    const r = rig();
    r.c.onEvent({ k: 'cfg', cfg });
    const claim = (kind: LandClaimView['kind'], can: boolean): LandClaimView =>
      ({
        id: 'lc_abc',
        name: 'Ash Hall',
        owner: 'Vera',
        kind,
        role: can ? 'builder' : 'public',
        vertices: [[100, 100], [119, 100], [119, 119], [100, 119]],
        area: 400,
        box: [100, 100, 119, 119],
        status: 'active',
        releaseAt: null,
        depth: 16,
        rev: 1,
        can: { build: can, containers: false, stations: false, doors: true, manage: false, release: false },
        shared: can,
        price: 2000,
        paid: 2000,
        createdAt: 0,
      }) as LandClaimView;
    r.c.onEvent({ k: 'sync', add: [claim('other', false)], remove: [] });
    r.step(110, 110);
    expect(useUi.getState().land.look).toMatchObject({ kind: 'other', name: 'Ash Hall', owner: 'Vera', canBuild: false, shared: false });
    r.step(300, 300);
    expect(useUi.getState().land.look).toMatchObject({ kind: 'wild' });
    // It changes with the server's word, and goes when the claim is out of sight.
    r.c.onEvent({ k: 'sync', add: [claim('shared', true)], remove: [] });
    r.step(110, 110);
    expect(useUi.getState().land.look).toMatchObject({ kind: 'shared', canBuild: true, shared: true });
    r.c.onEvent({ k: 'sync', add: [], remove: ['lc_abc'] });
    r.step(110, 110);
    expect(useUi.getState().land.look).toMatchObject({ kind: 'wild' });
  });

  it('opens the window of the lands with B, and Escape closes it', () => {
    const r = rig();
    r.c.onEvent({ k: 'cfg', cfg });
    r.step(5, 5);
    expect(r.c.key('KeyB')).toBe(true);
    expect(useUi.getState().land.manage).toBe(true);
    expect(r.mouse.at(-1)).toBe(true);
    expect(r.sent.some((s) => s.t === 'land' && s.a === 'list')).toBe(true);
    let prevented = false;
    const used = r.c.handleKey({ code: 'Escape', target: null, preventDefault: () => (prevented = true) } as unknown as KeyboardEvent);
    expect(used).toBe(true);
    expect(prevented).toBe(true);
    expect(useUi.getState().land.manage).toBe(false);
    expect(r.c.handleKey({ code: 'KeyW', target: null, preventDefault: () => undefined } as unknown as KeyboardEvent)).toBe(false);
  });

  it('loads the outline of a claim to be grown, and asks for the expansion with its own key', () => {
    const r = rig();
    r.c.onEvent({ k: 'cfg', cfg });
    const mine = {
      id: 'lc_mine',
      name: 'Home',
      owner: 'me',
      kind: 'mine',
      role: 'owner',
      vertices: [[100, 100], [119, 100], [119, 119], [100, 119]],
      area: 400,
      box: [100, 100, 119, 119],
      status: 'active',
      releaseAt: null,
      depth: 16,
      rev: 1,
      can: { build: true, containers: true, stations: true, doors: true, manage: true, release: true },
      shared: false,
      price: 2000,
      paid: 2000,
      createdAt: 0,
    } as LandClaimView;
    r.c.onEvent({ k: 'mine', claims: [mine] });
    r.step(5, 5);
    r.c.api.expand('lc_mine');
    expect(r.c.markers.closed).toBe(true);
    expect(r.c.markers.count).toBe(4);
    // Pick up a corner and put it further out.
    r.step(119, 119, { left: true });
    r.step(130, 130, { left: true });
    expect(r.c.markers.corners[2]).toEqual([130, 130]);
    r.c.key('KeyE');
    r.c.api.buy('ignored');
    const e = r.sent.at(-1) as Extract<Command, { t: 'land'; a: 'expand' }>;
    expect(e).toMatchObject({ t: 'land', a: 'expand', id: 'lc_mine' });
    expect(e.v[2]).toEqual([130, 130]);
    expect(e.idem.length).toBeGreaterThanOrEqual(8);
  });

  it('only sends what the server\u2019s parser accepts, unchanged: every command of the interface, with the odd names a player types', () => {
    const r = rig();
    r.c.onEvent({ k: 'cfg', cfg });
    // A shape, its preview, the confirmation and the purchase, with a name the server must clean rather than refuse.
    r.step(100, 100, { left: true });
    r.step(120, 100, { left: true });
    r.step(120, 120, { left: true });
    r.step(100, 120, { left: true });
    r.step(100, 120);
    r.c.key('KeyE');
    r.c.key('KeyE');
    r.c.api.buy('  My <b>Keep</b>  ');
    const a = r.c.api;
    a.refresh();
    a.select('lc_one');
    a.rename('lc_one', 'New name');
    a.grant('lc_one', 'player', 'Friend Name', 'builder');
    a.grant('lc_one', 'guild', 'guild', 'visitor');
    a.revoke('lc_one', 'player', 'Friend Name');
    a.setPublic('lc_one', { build: false, containers: false, stations: true, doors: true });
    a.release('lc_one');
    a.unrelease('lc_one');
    a.recover();
    const lands = r.sent.filter((s) => s.t === 'land');
    expect(lands.length).toBeGreaterThanOrEqual(12);
    const kinds = new Set(lands.map((s) => (s.t === 'land' ? s.a : '')));
    for (const k of ['preview', 'buy', 'list', 'detail', 'rename', 'grant', 'revoke', 'public', 'release', 'unrelease', 'recover']) expect(kinds, k).toContain(k);
    for (const cmd of lands) {
      const parsed = parseNetClientMessage({ t: 'cmd', c: JSON.parse(JSON.stringify(cmd)) });
      expect(parsed, JSON.stringify(cmd)).not.toBeNull();
      expect(parsed && parsed.t === 'cmd' ? parsed.c : null).toMatchObject(JSON.parse(JSON.stringify(cmd)));
    }
  });

  describe("the server's own territory", () => {
    const town: ProtectedZone = { id: 't:-5,-5', name: 'Dawnwatch', kind: 'town', box: [-5, -5, 5, 5], vertices: [[-5, -5], [5, -5], [5, 5], [-5, 5]] };

    it('says so once on walking in, and not again at once on walking out and in', () => {
      const r = rig();
      r.c.onEvent({ k: 'cfg', cfg });
      r.c.onEvent({ k: 'zones', zones: [town] });
      r.body.x = 40;
      for (let i = 0; i < 6; i++) r.step(5, 5);
      expect(r.toasts.filter((t) => t.includes('Dawnwatch'))).toHaveLength(0);
      r.body.x = 0;
      for (let i = 0; i < 6; i++) r.step(5, 5);
      const said = r.toasts.filter((t) => t.includes('Dawnwatch'));
      expect(said).toHaveLength(1);
      expect(said[0]).toContain('cannot be changed or claimed');
      r.body.x = 40;
      for (let i = 0; i < 6; i++) r.step(5, 5);
      r.body.x = 0;
      for (let i = 0; i < 6; i++) r.step(5, 5);
      expect(r.toasts.filter((t) => t.includes('Dawnwatch'))).toHaveLength(1);
    });

    it('reads out what the crosshair is on, as the server\u2019s ground and not as available land', () => {
      const r = rig();
      r.c.onEvent({ k: 'cfg', cfg });
      r.c.onEvent({ k: 'zones', zones: [town] });
      r.step(2, 2);
      expect(useUi.getState().land.look).toMatchObject({ kind: 'protected', name: 'Dawnwatch', canBuild: false });
      expect(useUi.getState().land.look?.note).toContain('cannot be changed or claimed');
      r.step(50, 50);
      expect(useUi.getState().land.look?.kind).toBe('wild');
    });

    it('draws nothing in the world for it, with the Surveyor in the hand or without (only the words say it is the server\u2019s)', () => {
      const r = rig();
      r.c.onEvent({ k: 'cfg', cfg });
      r.c.onEvent({ k: 'zones', zones: [town] });
      r.body.x = 20;
      r.step(20, 20);
      expect(r.c.fx.root.children.filter((o) => o.visible && (o as THREE.Mesh).material && (o as THREE.Mesh).geometry?.getAttribute?.('aColor') && (o as THREE.Mesh).geometry.drawRange.count > 3)).toHaveLength(0);
      r.held = null;
      r.step(20, 20);
      expect(r.c.fx.root.visible).toBe(false);
    });

    it('draws nothing when the server told of none, and forgets what it was told on a reset', () => {
      const r = rig();
      r.c.onEvent({ k: 'cfg', cfg });
      r.held = null;
      r.step(2, 2);
      expect(r.c.fx.root.visible).toBe(false);
      r.c.onEvent({ k: 'zones', zones: [town] });
      expect(r.c.zones).toHaveLength(1);
      r.c.reset();
      expect(r.c.zones).toHaveLength(0);
    });
  });

  describe('the staff in the hand', () => {
    const said = (r: Rig): SurveyorEvent[] => {
      const out: SurveyorEvent[] = [];
      for (let e = r.hand.take(); e; e = r.hand.take()) out.push(e);
      return out;
    };

    it('is told when a shape is being marked, and stops being told when the Surveyor is put away', () => {
      const r = rig();
      r.c.onEvent({ k: 'cfg', cfg });
      expect(r.hand.surveying).toBe(false);
      r.step(5, 5);
      expect(r.hand.surveying).toBe(true);
      r.held = null;
      r.step(5, 5);
      expect(r.hand.surveying).toBe(false);
      expect(r.hand.tone).toBe('idle');
    });

    it('is driven in at each corner (new, cut into an edge, or put down after it was carried), and plucked when one is taken back', () => {
      const r = rig();
      r.c.onEvent({ k: 'cfg', cfg });
      r.step(100, 100, { left: true });
      expect(said(r)).toEqual(['plant']);
      r.step(120, 100, { left: true });
      r.step(120, 120, { left: true });
      said(r);
      r.step(110, 110, { right: true });
      expect(said(r)).toEqual(['pluck']);
      // A right click with nothing marked is not a tug at anything.
      r.c.markers.clear();
      r.step(110, 110, { right: true });
      expect(said(r)).toEqual([]);
      // Picking a corner up is no stake going in; putting it down is.
      for (const [x, z] of [[100, 100], [120, 100], [120, 120]] as const) r.step(x, z, { left: true });
      said(r);
      r.c.markers.close();
      r.step(120, 120, { left: true });
      expect(said(r)).toEqual([]);
      r.step(130, 130, { left: true });
      expect(said(r)).toEqual(['plant']);
    });

    it('turns when the shape is closed, and is raised at the purchase (but not for a purchase that was a repeat)', () => {
      const r = rig();
      r.c.onEvent({ k: 'cfg', cfg });
      for (const [x, z] of [[100, 100], [120, 100], [120, 120]] as const) r.step(x, z, { left: true });
      said(r);
      expect(r.c.key('KeyE')).toBe(true);
      expect(said(r)).toEqual(['seal']);
      r.c.onEvent({ k: 'result', what: 'buy', result: { ok: true, code: 'ok', text: 'Land Claimed! Your property is now protected.', charged: 2000 } });
      expect(said(r)).toEqual(['claim']);
      r.c.onEvent({ k: 'result', what: 'buy', result: { ok: true, code: 'ok', text: 'Land Claimed! Your property is now protected.', charged: 0, replay: true } });
      expect(said(r)).toEqual([]);
    });

    it('takes the colour of the verdict on the shape', () => {
      const r = rig();
      r.c.onEvent({ k: 'cfg', cfg });
      for (const [x, z] of [[100, 100], [120, 100], [120, 120]] as const) r.step(x, z, { left: true });
      r.step(120, 120);
      expect(r.hand.tone).toBe('warn');
      r.c.onEvent({ k: 'preview', preview: { ok: true, status: 'available', text: 'Available Land', corners: 3, area: 200, pricePerBlock: 5, price: 1000, balance: 5000, depth: 16, maxArea: 10000, claimsLeft: 4, areaLeft: 19600 } });
      r.step(120, 120);
      expect(r.hand.tone).toBe('good');
    });
  });

  describe('the moments of the staff', () => {
    const kinds: SurveyorEvent[] = ['plant', 'pluck', 'seal', 'claim'];
    it('begin and end at rest, and stay within what the hand can show', () => {
      for (const k of kinds) {
        const end = surveyorMomentLength(k);
        const a = surveyorMove(k, 0);
        const b = surveyorMove(k, end);
        for (const v of [a.lift, a.flash, b.lift, b.thrust, b.flash]) expect(Math.abs(v), k).toBeLessThan(0.01);
        let peakLift = 0;
        let peakFlash = 0;
        for (let t = 0; t <= end; t += end / 200) {
          const m = surveyorMove(k, t);
          for (const v of [m.lift, m.thrust, m.spin, m.flash]) expect(Number.isFinite(v), k).toBe(true);
          expect(m.lift).toBeGreaterThanOrEqual(-0.001);
          expect(m.lift).toBeLessThanOrEqual(1.001);
          expect(m.thrust).toBeLessThanOrEqual(1.001);
          peakLift = Math.max(peakLift, m.lift);
          peakFlash = Math.max(peakFlash, m.flash);
        }
        expect(peakFlash, k).toBeGreaterThan(0.25);
        expect(peakLift, k).toBeGreaterThan(0.4);
      }
      // The plant is driven down at its middle, and the claim turns twice.
      expect(surveyorMove('plant', surveyorMomentLength('plant') * 0.5).thrust).toBeGreaterThan(0.95);
      expect(surveyorMove('claim', surveyorMomentLength('claim')).spin).toBeCloseTo(2, 1);
      // Nothing before or after.
      expect(surveyorMove('plant', -1)).toEqual({ lift: 0, thrust: 0, spin: 0, flash: 0 });
      expect(surveyorMove('plant', 99)).toEqual({ lift: 0, thrust: 0, spin: 0, flash: 0 });
    });
  });});
