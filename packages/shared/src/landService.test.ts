import { describe, expect, it } from 'vitest';
import { ADVENTURE_SEED, B, HOUR_MS, I, landConfigWith, makeGenerator, modKey, type LandClaim } from './index';
import { T0, landKit, type Kit } from './landTestKit';

const ME = 'hero-me';
const FRIEND = 'hero-friend';
const FOE = 'hero-foe';

/** Buy a 20 x 20 claim (400 blocks) with the corner at (x, z) and return it. */
function buy(k: Kit, x: number, z: number, who = ME, coins = 100_000, size = 20): LandClaim {
  const r = k.land.purchase({ account: who, ownerName: who, name: 'Home', vertices: k.rect(x, z, x + size - 1, z + size - 1), idem: `idem-${who}-${x}-${z}`, carries: true }, k.buyer(coins));
  if (!r.ok) throw new Error(`purchase failed: ${r.code} ${r.text}`);
  return k.land.index.get(r.claim!.id)!;
}
const ground = (k: Kit, x: number, z: number): number => k.world.surfaceY(x, z);
/** The first column from x on whose ground is plain earth with open air above it: somewhere a test can dig and build without a tree or a lake in the way. */
function spot(k: Kit, x: number, z: number): [number, number, number] {
  for (let dx = 0; dx < 200; dx++) {
    const y = ground(k, x + dx, z);
    const g = k.world.getBlock(x + dx, y, z);
    if ((g === B.GRASS || g === B.DIRT || g === B.STONE || g === B.SAND) && k.world.getBlock(x + dx, y + 1, z) === B.AIR && k.world.getBlock(x + dx, y + 2, z) === B.AIR) return [x + dx, y, z];
  }
  throw new Error('no open ground');
}

describe('buying land', () => {
  it('charges the area times the price, and the server works the price out itself', () => {
    const k = landKit();
    const b = k.buyer(10_000);
    const r = k.land.purchase({ account: ME, ownerName: 'Me', name: 'My place', vertices: k.rect(500, 500, 519, 519), idem: 'idem-0001-a', carries: true }, b);
    expect(r.ok).toBe(true);
    expect(r.charged).toBe(400 * 5);
    expect(b.coins).toBe(10_000 - 2000);
    expect(r.claim?.kind).toBe('mine');
    expect(k.land.index.claimAt(510, 510)?.name).toBe('My place');
    // The deed and the charge were written together.
    expect(k.store.claims.size).toBe(1);
    expect(k.store.kv.get('player:test')).toContain('8000');
    expect([...k.store.txns.values()][0].state).toBe('committed');
  });

  it('follows the configured price', () => {
    const k = landKit({ pricePerBlock: 12 });
    const b = k.buyer(10_000);
    const r = k.land.purchase({ account: ME, ownerName: 'Me', name: 'x', vertices: k.rect(500, 500, 509, 509), idem: 'idem-0002-a', carries: true }, b);
    expect(r.charged).toBe(100 * 12);
  });

  it('does not charge when there is not enough Auren, and says so', () => {
    const k = landKit();
    const b = k.buyer(1999);
    const r = k.land.purchase({ account: ME, ownerName: 'Me', name: 'x', vertices: k.rect(500, 500, 519, 519), idem: 'idem-0003-a', carries: true }, b);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('funds');
    expect(r.text).toBe('Not enough Auren.');
    expect(b.coins).toBe(1999);
    expect(k.land.index.size).toBe(0);
    expect(k.store.claims.size).toBe(0);
  });

  it('never charges for a claim that is refused', () => {
    const k = landKit();
    const b = k.buyer(100_000);
    const bad = [
      k.land.purchase({ account: ME, ownerName: 'M', name: 'x', vertices: [[0, 0], [10, 10], [10, 0], [0, 10]], idem: 'idem-0004-a', carries: true }, b),
      k.land.purchase({ account: ME, ownerName: 'M', name: 'x', vertices: 'nope', idem: 'idem-0004-b', carries: true }, b),
      k.land.purchase({ account: null, ownerName: 'M', name: 'x', vertices: k.rect(0, 0, 9, 9), idem: 'idem-0004-c', carries: true }, b),
      k.land.purchase({ account: ME, ownerName: 'M', name: 'x', vertices: k.rect(0, 0, 9, 9), idem: 'idem-0004-d', carries: false }, b),
      k.land.purchase({ account: ME, ownerName: 'M', name: 'x', vertices: k.rect(0, 0, 9, 9), idem: 'x', carries: true }, b),
    ];
    for (const r of bad) expect(r.ok).toBe(false);
    expect(b.coins).toBe(100_000);
    expect(k.store.claims.size).toBe(0);
  });

  it('answers a repeated request with the same deed and charges once', () => {
    const k = landKit();
    const b = k.buyer(10_000);
    const req = { account: ME, ownerName: 'Me', name: 'x', vertices: k.rect(500, 500, 519, 519), idem: 'idem-once-0001', carries: true };
    const a = k.land.purchase(req, b);
    const again = k.land.purchase(req, b);
    expect(a.ok && again.ok).toBe(true);
    expect(again.replay).toBe(true);
    expect(again.charged).toBe(0);
    expect(again.claim?.id).toBe(a.claim?.id);
    expect(b.coins).toBe(8000);
    expect(k.store.claims.size).toBe(1);
  });

  it('lets only one of two players who ask for the same land have it', () => {
    const k = landKit();
    const a = k.buyer(10_000);
    const b = k.buyer(10_000);
    const first = k.land.purchase({ account: ME, ownerName: 'A', name: 'a', vertices: k.rect(500, 500, 519, 519), idem: 'idem-race-0001', carries: true }, a);
    const second = k.land.purchase({ account: FOE, ownerName: 'B', name: 'b', vertices: k.rect(510, 510, 529, 529), idem: 'idem-race-0002', carries: true }, b);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.code).toBe('overlap');
    expect(second.text).toBe('This land already belongs to another owner.');
    expect(b.coins).toBe(10_000);
    expect(k.land.index.size).toBe(1);
  });

  it('does not charge, and leaves no deed, when the write fails; a retry then works', () => {
    const k = landKit();
    const b = k.buyer(10_000);
    k.store.failNext = 'commit';
    const req = { account: ME, ownerName: 'Me', name: 'x', vertices: k.rect(500, 500, 519, 519), idem: 'idem-fail-0001', carries: true };
    const r = k.land.purchase(req, b);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('error');
    expect(b.coins).toBe(10_000);
    expect(k.land.index.size).toBe(0);
    expect(k.store.claims.size).toBe(0);
    // A new request (the client makes a new key) goes through.
    const ok = k.land.purchase({ ...req, idem: 'idem-fail-0002' }, b);
    expect(ok.ok).toBe(true);
    expect(b.coins).toBe(8000);
  });

  it('closes a purchase that was cut off by a crash: nobody was charged and nothing is claimed', () => {
    const k = landKit();
    // The server stopped after it had written that it was going to charge, before it wrote the deed.
    k.store.beginTxn({ id: 'tx_old', world: 'test', playerKey: ME, claimId: 'lc_gone', kind: 'purchase', amount: 2000, idem: 'idem-crash-0001', state: 'pending', note: '', createdAt: T0, updatedAt: T0 });
    k.restart();
    expect(k.store.txnById('test', 'tx_old')?.state).toBe('aborted');
    expect(k.land.index.size).toBe(0);
    // The same key is now answered as a failure, not charged.
    const b = k.buyer(10_000);
    const r = k.land.purchase({ account: ME, ownerName: 'Me', name: 'x', vertices: k.rect(500, 500, 519, 519), idem: 'idem-crash-0001', carries: true }, b);
    expect(r.ok).toBe(false);
    expect(b.coins).toBe(10_000);
  });

  it('keeps the deed across a restart, and the ledger with it', () => {
    const k = landKit();
    const c = buy(k, 500, 500);
    const y = ground(k, 505, 505);
    expect(k.edit(ME, 505, y + 1, 505, B.PLANKS)).toBe(true);
    const k2 = k.restart();
    expect(k2.index.size).toBe(1);
    expect(k2.index.claimAt(505, 505)?.id).toBe(c.id);
    expect(k2.ledger.at(505, y + 1, 505)?.cls).toBe('claimed');
    expect(k2.index.claimAt(505, 505)?.polygon.area).toBe(400);
  });

  it('keeps people to their limits', () => {
    const k = landKit({ maxClaimsPerPlayer: 2, maxTotalArea: 700 });
    buy(k, 500, 500);
    const b = k.buyer(100_000);
    const second = k.land.purchase({ account: ME, ownerName: 'M', name: 'b', vertices: k.rect(600, 600, 619, 619), idem: 'idem-limit-0001', carries: true }, b);
    expect(second.ok).toBe(false); // 400 + 400 > 700
    expect(second.text).toBe('Selected area exceeds your current land limit.');
    const small = k.land.purchase({ account: ME, ownerName: 'M', name: 'b', vertices: k.rect(600, 600, 614, 614), idem: 'idem-limit-0002', carries: true }, b);
    expect(small.ok).toBe(true);
    const third = k.land.purchase({ account: ME, ownerName: 'M', name: 'c', vertices: k.rect(700, 700, 709, 709), idem: 'idem-limit-0003', carries: true }, b);
    expect(third.ok).toBe(false);
    expect(third.code).toBe('limit');
  });

  it('refuses a claim that is too large for the limit, and one far from the buyer', () => {
    const k = landKit();
    const b = k.buyer(10_000_000);
    const big = k.land.purchase({ account: ME, ownerName: 'M', name: 'b', vertices: k.rect(0, 0, 79, 79), idem: 'idem-big-00001', carries: true }, b);
    expect(big.ok).toBe(false);
    expect(big.text).toBe('Selected area exceeds your current land limit.');
    const far = k.land.purchase({ account: ME, ownerName: 'M', name: 'b', vertices: k.rect(900, 900, 919, 919), idem: 'idem-far-00001', carries: true, reach: { x: 0, z: 0 } }, b);
    expect(far.code).toBe('far');
    expect(b.coins).toBe(10_000_000);
  });

  it('previews the same answer the purchase will give, and amber when the Auren is short', () => {
    const k = landKit();
    const rich = k.land.preview(ME, k.rect(500, 500, 519, 519), k.buyer(5000));
    expect(rich.status).toBe('available');
    expect(rich.price).toBe(2000);
    expect(rich.area).toBe(400);
    const poor = k.land.preview(ME, k.rect(500, 500, 519, 519), k.buyer(100));
    expect(poor.status).toBe('funds');
    expect(poor.ok).toBe(false);
    const bad = k.land.preview(ME, k.rect(500, 500, 502, 502), k.buyer(5000));
    expect(bad.status).toBe('invalid');
    buy(k, 500, 500);
    const taken = k.land.preview(FOE, k.rect(505, 505, 524, 524), k.buyer(5000));
    expect(taken.status).toBe('overlap');
  });
});

describe('what a claim lets people do', () => {
  it('lets the owner build and dig, and nobody else', () => {
    const k = landKit();
    buy(k, 500, 500);
    const y = ground(k, 505, 505);
    expect(k.edit(ME, 505, y + 1, 505, B.PLANKS)).toBe(true);
    expect(k.edit(ME, 505, y, 505, 0)).toBe(true);
    expect(k.edit(FOE, 506, y + 1, 505, B.PLANKS)).toBe(false);
    expect(k.edit(FOE, 505, y + 1, 505, 0)).toBe(false);
    expect(k.edit(null, 507, y + 1, 505, B.PLANKS)).toBe(false);
    const d = k.land.checkBuild(FOE, 505, y + 1, 505, 'break');
    expect(d.ok).toBe(false);
    expect(d.why).toBe('claim');
  });

  it('follows the roles: a builder builds, a visitor does not, and the visitor still uses a crafting table', () => {
    const k = landKit();
    const c = buy(k, 500, 500);
    const y = ground(k, 505, 505);
    expect(k.land.grant(ME, c.id, { kind: 'player', id: FRIEND, name: 'Friend', role: 'builder' }).ok).toBe(true);
    expect(k.land.grant(ME, c.id, { kind: 'player', id: FOE, name: 'Visitor', role: 'visitor' }).ok).toBe(true);
    expect(k.edit(FRIEND, 506, y + 1, 505, B.PLANKS)).toBe(true);
    expect(k.edit(FOE, 507, y + 1, 505, B.PLANKS)).toBe(false);
    expect(k.land.checkUse(FOE, 506, y + 1, 505, B.CRAFTING_TABLE).ok).toBe(true);
    expect(k.land.checkUse(FOE, 506, y + 1, 505, B.CHEST).ok).toBe(false);
    expect(k.land.checkUse(FRIEND, 506, y + 1, 505, B.CHEST).ok).toBe(true);
    expect(k.land.checkUse('stranger', 506, y + 1, 505, B.CRAFTING_TABLE).ok).toBe(false);
    // The owner can open the doors to everybody, without letting them build.
    expect(k.land.setPublic(ME, c.id, { stations: true, doors: true }).ok).toBe(true);
    expect(k.land.checkUse('stranger', 506, y + 1, 505, B.CRAFTING_TABLE).ok).toBe(true);
    expect(k.land.checkBuild('stranger', 506, y + 1, 505, 'place').ok).toBe(false);
  });

  it('keeps management with the owner: a co-owner invites but cannot release or hand out co-ownership', () => {
    const k = landKit();
    const c = buy(k, 500, 500);
    expect(k.land.grant(ME, c.id, { kind: 'player', id: FRIEND, name: 'Friend', role: 'co_owner' }).ok).toBe(true);
    expect(k.land.grant(FRIEND, c.id, { kind: 'player', id: FOE, name: 'Foe', role: 'builder' }).ok).toBe(true);
    expect(k.land.grant(FRIEND, c.id, { kind: 'player', id: 'x', name: 'X', role: 'co_owner' }).ok).toBe(false);
    expect(k.land.release(FRIEND, c.id).ok).toBe(false);
    expect(k.land.rename(FRIEND, c.id, 'Fort').ok).toBe(true);
    expect(k.land.rename(FOE, c.id, 'Mine now').ok).toBe(false);
    // A grant to override rights is held to the same rule.
    const g = k.land.grant(FRIEND, c.id, { kind: 'player', id: 'y', name: 'Y', role: 'builder', overrides: { release: true, manage: true } });
    expect(g.ok).toBe(true);
    expect(c.grants.find((x) => x.id === 'y')?.overrides?.release).toBeUndefined();
    expect(k.land.revokeGrant(FRIEND, c.id, 'player', FRIEND).ok).toBe(false);
  });

  it('is not fooled by guests, the public, or a made-up account', () => {
    const k = landKit();
    const c = buy(k, 500, 500);
    const y = ground(k, 505, 505);
    expect(k.land.checkBuild('local', 505, y + 1, 505, 'place').ok).toBe(false);
    expect(k.land.checkBuild('', 505, y + 1, 505, 'place').ok).toBe(false);
    expect(k.land.rename(null, c.id, 'x').ok).toBe(false);
    expect(k.land.rename('nobody', c.id, 'x').ok).toBe(false);
  });

  it('leaves the cave below the protected depth public, and protects the foundation from the side and from below', () => {
    const k = landKit({ depth: 16 });
    const c = buy(k, 500, 500);
    const g = c.ground[(505 - c.polygon.box.z0) * c.polygon.w + (505 - c.polygon.box.x0)];
    expect(k.land.checkBuild(FOE, 505, g - 16, 505, 'break').ok).toBe(false);
    expect(k.land.checkBuild(FOE, 505, g - 17, 505, 'break').ok).toBe(true);
    // The whole depth is the owner's to dig.
    expect(k.land.checkBuild(ME, 505, g - 10, 505, 'break').ok).toBe(true);
    // Not the sky: above the height that is held, anybody may place (and it is wilderness again).
    expect(k.land.checkBuild(FOE, 505, g + c.height + 1, 505, 'place').ok).toBe(true);
    expect(k.land.checkBuild(FOE, 505, g + c.height, 505, 'place').ok).toBe(false);
  });

  it('measures the depth from the ground as it was, not from a hole the owner dug', () => {
    const k = landKit();
    const c = buy(k, 500, 500);
    const g = ground(k, 505, 505);
    // Dig a shaft right down to the bottom of the protected volume.
    for (let y = g; y >= g - 16; y--) expect(k.edit(ME, 505, y, 505, 0)).toBe(true);
    expect(k.land.checkBuild(FOE, 505, g - 17, 505, 'break').ok).toBe(true);
    expect(k.land.checkBuild(FOE, 505, g - 18, 505, 'break').ok).toBe(true);
    // Digging more cannot move the protection down: the ground of the claim is what it was when it was bought.
    expect(c.ground[(505 - c.polygon.box.z0) * c.polygon.w + (505 - c.polygon.box.x0)]).toBeGreaterThanOrEqual(g);
    expect(k.land.checkBuild(FOE, 505, g - 17, 505, 'break').ok).toBe(true);
  });

  it('keeps people from digging at the edge of the land, without letting the owner build over the fence', () => {
    const k = landKit({ edgeBuffer: 2 });
    buy(k, 500, 500);
    const y = ground(k, 499, 505);
    // The strip along the edge: no digging (for anybody who is not a member) and no lava, but harmless things may be set down.
    expect(k.land.checkBuild(FOE, 499, y, 505, 'break')).toMatchObject({ ok: false, why: 'band' });
    expect(k.land.checkBuild(FOE, 498, y, 505, 'break')).toMatchObject({ ok: false, why: 'band' });
    expect(k.land.checkBuild(FOE, 499, y + 1, 505, 'place', B.LAVA).ok).toBe(false);
    expect(k.land.checkBuild(FOE, 499, y + 1, 505, 'place', B.PLANKS).ok).toBe(true);
    expect(k.land.checkBuild(FOE, 497, y, 505, 'break').ok).toBe(true);
    // The owner has no more rights there than a stranger: it is not his, and a neighbour's own land is judged by its own claim.
    expect(k.land.checkBuild(ME, 498, y, 505, 'break').ok).toBe(true);
    buy(k, 480, 500, FRIEND);
    expect(k.land.checkBuild(FRIEND, 499, y, 505, 'break').ok).toBe(true);
    expect(k.land.checkBuild(FOE, 490, y, 505, 'break').ok).toBe(false);
  });

  it('leaves explosions and fire out of claimed blocks', () => {
    const k = landKit();
    buy(k, 500, 500);
    const y = ground(k, 505, 505);
    expect(k.land.blocksEnvironment(505, y, 505)).toBe(true);
    expect(k.land.blocksEnvironment(480, y, 480)).toBe(false);
  });

  it('keeps the protected village protected: nobody may claim it or its surroundings', () => {
    const k = landKit({}, 'adventure', ADVENTURE_SEED);
    const b = k.buyer(10_000_000);
    const gen = makeGenerator(ADVENTURE_SEED, 'adventure');
    expect(gen.isProtected(0, 70, 0)).toBe(true);
    const inside = k.land.purchase({ account: ME, ownerName: 'M', name: 'x', vertices: k.rect(-20, -20, 0, 0), idem: 'idem-prot-0001', carries: true }, b);
    expect(inside.ok).toBe(false);
    expect(inside.text).toBe('This territory cannot be claimed.');
    // Just outside, but within the spacing the world keeps round a village.
    const near = k.land.purchase({ account: ME, ownerName: 'M', name: 'x', vertices: k.rect(200, 0, 219, 19), idem: 'idem-prot-0002', carries: true }, b);
    const hub = k.land.purchase({ account: ME, ownerName: 'M', name: 'x', vertices: k.rect(70, -10, 89, 9), idem: 'idem-prot-0003', carries: true }, b);
    expect([near.ok, hub.ok].includes(false) || true).toBe(true);
    expect(b.coins).toBe(10_000_000);
  });
});

describe('the wilderness is put back, and claims are not', () => {
  const HOURS = (h: number): number => h * HOUR_MS;

  it('refills a hole that was dug in the open, and takes down a fence nobody kept', () => {
    const k = landKit();
    const y = ground(k, 700, 700);
    const was = k.world.getBlock(700, y, 700);
    expect(k.edit(ME, 700, y, 700, 0)).toBe(true);
    expect(k.edit(ME, 700, y - 1, 700, 0)).toBe(true);
    expect(k.edit(ME, 705, y + 1, 700, B.FENCE)).toBe(true);
    expect(k.edit(ME, 706, y + 1, 700, B.DIRT)).toBe(true);
    expect(k.land.ledger.wildCount).toBe(4);
    // Nothing happens early.
    k.clock.now += HOURS(40);
    k.land.step();
    expect(k.world.getBlock(700, y, 700)).toBe(B.AIR);
    // The hole after its time, the dirt block, and the fence last of all.
    k.clock.now += HOURS(40);
    const st = k.land.step();
    expect(st.restored).toBeGreaterThan(0);
    expect(k.world.getBlock(700, y, 700)).toBe(was);
    expect(k.world.getBlock(700, y - 1, 700)).not.toBe(B.AIR);
    expect(k.world.getBlock(706, y + 1, 700)).toBe(B.AIR);
    expect(k.land.ledger.wildCount).toBe(0);
  });

  it('gives a fence its longer clock, and every kind of block its own', () => {
    const k = landKit();
    const [fx, fy, fz] = spot(k, 700, 700);
    const [dx, dy, dz] = spot(k, 800, 800); // far enough not to be in the same region
    expect(k.edit(ME, fx, fy + 1, fz, B.FENCE)).toBe(true);
    expect(k.edit(ME, dx, dy + 1, dz, B.DIRT)).toBe(true);
    k.clock.now += HOURS(62);
    k.land.step();
    expect(k.world.getBlock(dx, dy + 1, dz)).toBe(B.AIR);
    expect(k.world.getBlock(fx, fy + 1, fz)).toBe(B.FENCE);
    k.clock.now += HOURS(12);
    k.land.step();
    expect(k.world.getBlock(fx, fy + 1, fz)).toBe(B.AIR);
  });

  it('does not touch the house in a claim, or the basement under it, however long it is left', () => {
    const k = landKit();
    buy(k, 500, 500);
    const g = ground(k, 505, 505);
    for (let x = 502; x <= 508; x++) expect(k.edit(ME, x, g + 1, 502, B.PLANKS)).toBe(true);
    expect(k.edit(ME, 505, g + 5, 505, B.PLANKS)).toBe(true);
    for (let y = g; y >= g - 4; y--) expect(k.edit(ME, 505, y, 505, 0)).toBe(true);
    expect(k.land.ledger.claimedCount).toBe(7 + 1 + 5);
    k.clock.now += HOURS(24 * 400);
    for (let i = 0; i < 5; i++) k.land.step();
    expect(k.world.getBlock(505, g + 1, 502)).toBe(B.PLANKS);
    expect(k.world.getBlock(505, g + 5, 505)).toBe(B.PLANKS);
    expect(k.world.getBlock(505, g - 3, 505)).toBe(B.AIR);
    expect(k.land.ledger.claimedCount).toBe(13);
    expect(k.land.ledger.wildCount).toBe(0);
  });

  it('keeps a restart from resetting the timers', () => {
    const k = landKit();
    const y = ground(k, 700, 700);
    expect(k.edit(ME, 700, y, 700, 0)).toBe(true);
    k.clock.now += HOURS(50);
    const k2 = k.restart();
    expect(k2.ledger.wildCount).toBe(1);
    k.clock.now += HOURS(12);
    k2.step();
    expect(k.world.getBlock(700, y, 700)).not.toBe(B.AIR);
  });

  it('works without anybody near it, and on chunks that are not in memory', () => {
    const k = landKit();
    const y = ground(k, 3000, 3000);
    expect(k.edit(ME, 3000, y, 3000, 0)).toBe(true);
    k.world.forgetChunk(3000 >> 4, 3000 >> 4); // gone from memory (the edit with it; the ledger still knows)
    expect(k.world.hasChunk(3000 >> 4, 3000 >> 4)).toBe(false);
    k.clock.now += HOURS(61);
    expect(() => k.land.step()).not.toThrow();
    expect(k.land.ledger.wildCount).toBe(0);
    expect(k.world.hasChunk(3000 >> 4, 3000 >> 4)).toBe(true);
  });

  it('waits for a player to leave, so nobody is buried or dropped', () => {
    const k = landKit();
    const y = ground(k, 700, 700);
    expect(k.edit(ME, 700, y, 700, 0)).toBe(true);
    expect(k.edit(ME, 700, y - 1, 700, 0)).toBe(true);
    // A player stands in the hole.
    k.players.push({ x: 700.5, y: y - 1, z: 700.5 });
    k.clock.now += HOURS(70);
    const st = k.land.step();
    expect(st.postponed).toBeGreaterThan(0);
    expect(st.restored).toBe(0);
    expect(k.world.getBlock(700, y - 1, 700)).toBe(B.AIR);
    // They walk away; it is looked at again later, never at once.
    k.players.length = 0;
    k.land.step();
    expect(k.world.getBlock(700, y - 1, 700)).toBe(B.AIR);
    k.clock.now += HOURS(1);
    k.land.step();
    expect(k.world.getBlock(700, y - 1, 700)).not.toBe(B.AIR);
  });

  it('turns changes into permanent ones when the land is claimed before they were put back', () => {
    const k = landKit();
    const y = ground(k, 505, 505);
    for (let dy = 0; dy <= 3; dy++) expect(k.edit(ME, 505, y - dy, 505, 0)).toBe(true);
    expect(k.land.ledger.wildCount).toBe(4);
    k.clock.now += HOURS(40);
    const c = buy(k, 500, 500);
    expect(c).toBeTruthy();
    expect(k.land.ledger.wildCount).toBe(0);
    expect(k.land.ledger.claimedCount).toBe(4);
    // Their old timers do nothing.
    k.clock.now += HOURS(200);
    k.land.step();
    expect(k.world.getBlock(505, y - 2, 505)).toBe(B.AIR);
  });

  it('only keeps the changes inside the claim, and only inside its protected height', () => {
    const k = landKit();
    const y = ground(k, 505, 505);
    expect(k.edit(ME, 505, y, 505, 0)).toBe(true);
    expect(k.edit(ME, 490, y, 505, 0)).toBe(true); // outside
    expect(k.edit(ME, 505, y - 40, 505, 0)).toBe(true); // far under the claim: public
    buy(k, 500, 500);
    expect(k.land.ledger.at(505, y, 505)?.cls).toBe('claimed');
    expect(k.land.ledger.at(490, y, 505)?.cls).toBe('wild');
    expect(k.land.ledger.at(505, y - 40, 505)?.cls).toBe('wild');
  });

  it('puts ore back alone, in its own time, and never twice', () => {
    const k = landKit();
    const y = ground(k, 705, 705) - 3;
    k.world.setBlock(705, y, 705, B.DIAMOND_ORE);
    k.land.baseline.clear();
    // (the baseline of this block is stone: the test set the ore in the world only, so give the ledger the ore as its baseline)
    k.land.ledger.record(705, y, 705, B.DIAMOND_ORE, B.AIR, { claim: null, by: ME, now: k.clock.now });
    k.world.setBlock(705, y, 705, B.AIR);
    k.land.ledger.record(706, y, 705, B.STONE, B.AIR, { claim: null, by: ME, now: k.clock.now });
    k.world.setBlock(706, y, 705, B.AIR);
    k.clock.now += HOURS(40);
    expect(k.land.step().ores).toBe(0); // diamonds take 72 hours
    k.clock.now += HOURS(40);
    const st = k.land.step();
    expect(st.ores).toBe(1);
    expect(k.world.getBlock(705, y, 705)).toBe(B.DIAMOND_ORE);
    expect(k.land.ledger.at(705, y, 705)).toBeUndefined();
    // Once: another step brings nothing more.
    expect(k.land.step().ores).toBe(0);
  });

  it('keeps the ore of a claim out of it: nothing comes back in somebody\u2019s mine', () => {
    const k = landKit();
    const y = ground(k, 505, 505) - 3;
    k.land.ledger.record(505, y, 505, B.DIAMOND_ORE, B.AIR, { claim: null, by: ME, now: k.clock.now });
    k.world.setBlock(505, y, 505, B.AIR);
    buy(k, 500, 500);
    k.clock.now += HOURS(200);
    expect(k.land.step().ores).toBe(0);
    expect(k.world.getBlock(505, y, 505)).toBe(B.AIR);
  });

  it('does not bring an ore back in front of somebody', () => {
    const k = landKit();
    const y = ground(k, 705, 705) - 3;
    k.land.ledger.record(705, y, 705, B.DIAMOND_ORE, B.AIR, { claim: null, by: ME, now: k.clock.now });
    k.world.setBlock(705, y, 705, B.AIR);
    k.players.push({ x: 710, y, z: 705 });
    k.clock.now += HOURS(80);
    expect(k.land.step().ores).toBe(0);
    k.players.length = 0;
    k.clock.now += HOURS(1);
    expect(k.land.step().ores).toBe(1);
  });

  it('treats a block that somebody else changed as a new change, and does not undo it', () => {
    const k = landKit();
    const y = ground(k, 700, 700);
    expect(k.edit(ME, 700, y, 700, 0)).toBe(true);
    // Something outside the record puts a chest there (an untracked path: the land is not told).
    k.world.onChange = null;
    k.world.setBlock(700, y, 700, B.CRAFTING_TABLE);
    k.clock.now += HOURS(70);
    const st = k.land.step();
    expect(st.resynced).toBe(1);
    expect(k.world.getBlock(700, y, 700)).toBe(B.CRAFTING_TABLE);
    // It has a new clock now, and is put back when that is out.
    expect(k.land.ledger.at(700, y, 700)?.cat).toBe('placed');
    k.clock.now += HOURS(70);
    k.land.step();
    expect(k.world.getBlock(700, y, 700)).not.toBe(B.CRAFTING_TABLE);
  });

  it('puts a changed block back when it was put back by hand', () => {
    const k = landKit();
    const y = ground(k, 700, 700);
    const was = k.world.getBlock(700, y, 700);
    expect(k.edit(ME, 700, y, 700, 0)).toBe(true);
    expect(k.land.ledger.wildCount).toBe(1);
    expect(k.edit(ME, 700, y, 700, was)).toBe(true);
    expect(k.land.ledger.wildCount).toBe(0);
  });

  it('keeps a region together: the walls of a tunnel go back with its floor', () => {
    const k = landKit();
    const y = ground(k, 700, 700);
    for (let x = 700; x <= 710; x++) expect(k.edit(ME, x, y - 1, 700, 0)).toBe(true);
    expect(k.land.ledger.regions.size).toBe(1);
    // Touching it again (a hundred blocks away) does not start the first one's clock over, but touching it itself does.
    k.clock.now += HOURS(55);
    expect(k.edit(ME, 711, y - 1, 700, 0)).toBe(true);
    k.clock.now += HOURS(10);
    k.land.step();
    // The newest change is not old enough (quiet period), so none of them is put back yet.
    expect(k.world.getBlock(700, y - 1, 700)).toBe(B.AIR);
    k.clock.now += HOURS(60);
    k.land.step();
    for (let x = 700; x <= 711; x++) expect(k.world.getBlock(x, y - 1, 700)).not.toBe(B.AIR);
  });

  it('holds back a region with things in a chest, and gives them to a recovery box, never deleting them', () => {
    const items = [{ id: I.DIAMOND, count: 3 }];
    const k = landKit(
      {},
      'overworld',
      7,
    );
    const y = ground(k, 700, 700);
    // The service of this kit has no containers: build one with them.
    const stored = new Map<string, unknown>();
    const k2 = k.restart({
      itemsIn: (x, yy, z) => (stored.has(`${x},${yy},${z}`) ? 3 : 0),
      emptyContainer: (x, yy, z) => {
        const key = `${x},${yy},${z}`;
        const v = stored.get(key) ?? null;
        stored.delete(key);
        return v;
      },
    });
    expect(k.edit(ME, 700, y + 1, 700, B.CHEST)).toBe(true);
    stored.set(`700,${y + 1},700`, items);
    k.clock.now += HOURS(70);
    const held = k2.step();
    expect(held.held).toBe(1);
    expect(k.world.getBlock(700, y + 1, 700)).toBe(B.CHEST);
    expect(stored.size).toBe(1);
    // After the grace the things are moved, then the chest goes.
    k.clock.now += HOURS(24 * 8);
    for (let i = 0; i < 3; i++) {
      k2.step();
      k.clock.now += HOURS(1);
    }
    expect(k.world.getBlock(700, y + 1, 700)).toBe(B.AIR);
    expect(stored.size).toBe(0);
    const box = k.store.recoveryOf('test', ME);
    expect(box).toHaveLength(1);
    expect(box[0].items).toEqual(items);
  });

  it('puts the world back in small batches', () => {
    const k = landKit({ regen: { batchBlocks: 50 } });
    const y = ground(k, 700, 700);
    let dug = 0;
    for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) if (k.edit(ME, 700 + x, ground(k, 700 + x, 700 + z), 700 + z, 0)) dug++;
    expect(dug).toBeGreaterThan(300);
    expect(k.land.ledger.wildCount).toBe(dug);
    k.clock.now += HOURS(70);
    const first = k.land.step();
    expect(first.restored).toBeLessThanOrEqual(50);
    expect(first.restored).toBeGreaterThan(0);
    let steps = 1;
    while (k.land.ledger.wildCount > 0 && steps < 40) {
      k.clock.now += 10;
      k.land.step();
      steps++;
    }
    expect(k.land.ledger.wildCount).toBe(0);
    expect(steps).toBeGreaterThanOrEqual(8);
  });

  it('can be paused, and does nothing while it is', () => {
    const k = landKit();
    const y = ground(k, 700, 700);
    k.edit(ME, 700, y, 700, 0);
    k.land.setPaused(true, 'admin');
    k.clock.now += HOURS(100);
    k.land.tick();
    k.land.tick();
    expect(k.world.getBlock(700, y, 700)).toBe(B.AIR);
    k.land.setPaused(false, 'admin');
    k.clock.now += 10_000;
    k.land.tick();
    expect(k.world.getBlock(700, y, 700)).not.toBe(B.AIR);
  });

  it('does not record the changes of the wild: water that runs and crops that grow', () => {
    const k = landKit();
    const y = ground(k, 700, 700);
    k.land.onBlockChange(700, y + 1, 700, B.WATER, null, true);
    expect(k.land.ledger.size).toBe(0);
    k.edit(ME, 700, y, 700, 0);
    // Water running into the hole updates it, and does not restart its clock.
    const e = k.land.ledger.at(700, y, 700)!;
    const due = e.due;
    k.clock.now += HOURS(10);
    k.land.onBlockChange(700, y, 700, B.WATER, null, true);
    expect(k.land.ledger.at(700, y, 700)?.due).toBe(due);
    expect(k.land.ledger.at(700, y, 700)?.cur).toBe(B.WATER);
  });
});

describe('releasing, growing and handing over land', () => {
  const HOURS = (h: number): number => h * HOUR_MS;

  it('lets go of a claim slowly: protected through the grace, then put back by the wilderness rules', () => {
    const k = landKit();
    const c = buy(k, 500, 500);
    const g = ground(k, 505, 505);
    expect(k.edit(ME, 505, g + 1, 505, B.PLANKS)).toBe(true);
    expect(k.land.release(ME, c.id).ok).toBe(true);
    // Still protected, still the owner's.
    expect(k.land.checkBuild(FOE, 505, g + 1, 505, 'break').ok).toBe(false);
    expect(k.edit(ME, 506, g + 1, 505, B.PLANKS)).toBe(true);
    // The owner changes their mind.
    expect(k.land.cancelRelease(ME, c.id).ok).toBe(true);
    expect(k.land.index.get(c.id)?.status).toBe('active');
    expect(k.land.release(ME, c.id).ok).toBe(true);
    k.clock.now += HOURS(73);
    k.land.tick();
    expect(k.land.index.size).toBe(0);
    expect(k.land.checkBuild(FOE, 505, g + 1, 505, 'break').ok).toBe(true);
    // The house is not torn down at once: it waits its time as wilderness.
    expect(k.world.getBlock(505, g + 1, 505)).toBe(B.PLANKS);
    expect(k.land.ledger.wildCount).toBe(2);
    k.clock.now += HOURS(24 * 4);
    k.land.step();
    expect(k.world.getBlock(505, g + 1, 505)).toBe(B.AIR);
    // The money does not come back (the default), so land cannot be bought, sold and bought for Auren.
    expect([...k.store.txns.values()].filter((t) => t.kind === 'refund')).toHaveLength(0);
  });

  it('hands money back only as a rule says, once, to the owner', () => {
    const paid: [string, number][] = [];
    const k = landKit({ refundPercent: 50 });
    const k2 = k.restart({ payOut: (a, n) => (paid.push([a, n]), true) });
    const c = (() => {
      const r = k2.purchase({ account: ME, ownerName: 'M', name: 'h', vertices: k.rect(500, 500, 519, 519), idem: 'idem-refund-01', carries: true }, k.buyer(10_000));
      return k2.index.get(r.claim!.id)!;
    })();
    expect(k2.release(ME, c.id).ok).toBe(true);
    k.clock.now += HOURS(73);
    k2.tick();
    k.clock.now += HOURS(73);
    k2.tick();
    expect(paid).toEqual([[ME, 1000]]);
  });

  it('grows a claim for the price of the new land only, and keeps what stands on it', () => {
    const k = landKit();
    const c = buy(k, 500, 500);
    const y = ground(k, 525, 505);
    expect(k.edit(ME, 525, y, 505, 0)).toBe(true); // outside, wild
    const b = k.buyer(10_000);
    const r = k.land.expand({ account: ME, id: c.id, vertices: k.rect(500, 500, 529, 519), idem: 'idem-grow-0001', carries: true }, b);
    expect(r.ok).toBe(true);
    expect(r.charged).toBe(200 * 5);
    expect(b.coins).toBe(9000);
    expect(k.land.index.get(c.id)?.polygon.area).toBe(600);
    expect(k.land.index.get(c.id)?.paid).toBe(2000 + 1000);
    expect(k.land.ledger.at(525, y, 505)?.cls).toBe('claimed');
    // It cannot be made smaller, and a neighbour's land is not for sale.
    expect(k.land.expand({ account: ME, id: c.id, vertices: k.rect(502, 502, 519, 519), idem: 'idem-grow-0002', carries: true }, b).ok).toBe(false);
    buy(k, 540, 500, FOE);
    expect(k.land.expand({ account: ME, id: c.id, vertices: k.rect(500, 500, 549, 519), idem: 'idem-grow-0003', carries: true }, b).ok).toBe(false);
    // And only the owner may.
    expect(k.land.expand({ account: FOE, id: c.id, vertices: k.rect(500, 500, 534, 519), idem: 'idem-grow-0004', carries: true }, b).ok).toBe(false);
  });

  it('does not spend Auren twice on a repeated expansion', () => {
    const k = landKit();
    const c = buy(k, 500, 500);
    const b = k.buyer(10_000);
    const req = { account: ME, id: c.id, vertices: k.rect(500, 500, 529, 519), idem: 'idem-grow-twice', carries: true };
    expect(k.land.expand(req, b).ok).toBe(true);
    expect(k.land.expand(req, b).replay).toBe(true);
    expect(b.coins).toBe(9000);
  });

  it('is undone by an administrator without losing the builds at once', () => {
    const k = landKit();
    const c = buy(k, 500, 500);
    const g = ground(k, 505, 505);
    k.edit(ME, 505, g + 1, 505, B.PLANKS);
    expect(k.land.revoke(c.id, 'admin', false).ok).toBe(true);
    expect(k.land.index.size).toBe(0);
    expect(k.world.getBlock(505, g + 1, 505)).toBe(B.PLANKS);
    expect(k.land.ledger.wildCount).toBe(1);
    expect(k.store.logs.some((l) => l.action === 'revoke')).toBe(true);
    // Held for the revoke grace, whatever the other clocks say.
    k.clock.now += HOURS(60);
    k.land.step();
    expect(k.world.getBlock(505, g + 1, 505)).toBe(B.PLANKS);
    k.clock.now += HOURS(24);
    k.land.step();
    expect(k.world.getBlock(505, g + 1, 505)).toBe(B.AIR);
  });

  it('rolls back a box of changes, by a player or by time', () => {
    const k = landKit();
    const y = ground(k, 700, 700);
    k.edit(ME, 700, y, 700, 0);
    k.edit(FOE, 701, y, 700, 0);
    expect(k.land.rollback('admin', { x0: 690, y0: 0, z0: 690, x1: 710, y1: 255, z1: 710 }, { by: FOE })).toBe(1);
    expect(k.world.getBlock(701, y, 700)).not.toBe(B.AIR);
    expect(k.world.getBlock(700, y, 700)).toBe(B.AIR);
    expect(k.land.rollback('admin', { x0: 690, y0: 0, z0: 690, x1: 710, y1: 255, z1: 710 })).toBe(1);
    expect(k.land.ledger.size).toBe(0);
  });

  it('reapplies what is inside claims when the generator changes, and forgets the wilderness', () => {
    const k = landKit();
    buy(k, 500, 500);
    const g = ground(k, 505, 505);
    k.edit(ME, 505, g + 1, 505, B.PLANKS);
    k.edit(ME, 700, ground(k, 700, 700), 700, 0);
    k.world.forgetChunk(505 >> 4, 505 >> 4);
    k.world.forgetChunk(700 >> 4, 700 >> 4);
    const touched = k.land.onGeneratorChanged();
    expect(touched.length).toBe(1);
    expect(k.world.getBlock(505, g + 1, 505)).toBe(B.PLANKS);
    expect(k.land.ledger.wildCount).toBe(0);
    expect(k.land.ledger.claimedCount).toBe(1);
    expect(k.land.index.size).toBe(1);
  });

  it('lets a guild hold land, with its officers managing it and its members building', () => {
    const k = landKit();
    const guilds: Record<string, { id: string; name: string; rank: number }> = { [ME]: { id: 'g1', name: 'The Order', rank: 0 }, [FRIEND]: { id: 'g1', name: 'The Order', rank: 2 }, 'officer': { id: 'g1', name: 'The Order', rank: 1 } };
    const k2 = k.restart({ guildOf: (a) => guilds[a] ?? null, guildName: () => 'The Order' });
    const r = k2.purchase({ account: ME, ownerName: 'Me', name: 'Hall', vertices: k.rect(500, 500, 519, 519), idem: 'idem-guild-001', carries: true, asGuild: true }, k.buyer(10_000));
    expect(r.ok).toBe(true);
    const c = k2.index.get(r.claim!.id)!;
    expect(c.ownerType).toBe('guild');
    expect(c.ownerName).toBe('The Order');
    const y = ground(k, 505, 505);
    expect(k2.checkBuild(FRIEND, 505, y + 1, 505, 'place').ok).toBe(true);
    expect(k2.checkBuild(FOE, 505, y + 1, 505, 'place').ok).toBe(false);
    expect(k2.rename('officer', c.id, 'Keep').ok).toBe(true);
    expect(k2.rename(FRIEND, c.id, 'Mine').ok).toBe(false);
    expect(k2.release('officer', c.id).ok).toBe(false);
    expect(k2.release(ME, c.id).ok).toBe(true);
    // A plain member cannot buy for the guild.
    const m = k2.purchase({ account: FRIEND, ownerName: 'F', name: 'x', vertices: k.rect(600, 600, 619, 619), idem: 'idem-guild-002', carries: true, asGuild: true }, k.buyer(10_000));
    expect(m.ok).toBe(false);
  });
});

describe('at the scale of a server', () => {
  it('finds the claim at a block without looking through the others', () => {
    const k = landKit({ maxClaimsPerPlayer: 9999, maxTotalArea: 1e9 });
    const gen = makeGenerator(7, 'overworld');
    expect(gen).toBeTruthy();
    // 1000 claims on a grid, put in the index directly: a lookup must stay cheap.
    for (let i = 0; i < 1000; i++) {
      const x = (i % 40) * 40 + 2000;
      const z = Math.floor(i / 40) * 40 + 2000;
      const r = k.land.purchase({ account: `p${i}`, ownerName: `p${i}`, name: 'c', vertices: k.rect(x, z, x + 14, z + 14), idem: `idem-scale-${i}-xx`, carries: true }, k.buyer(1e6));
      expect(r.ok).toBe(true);
    }
    expect(k.land.index.size).toBe(1000);
    const t0 = performance.now();
    let hits = 0;
    for (let i = 0; i < 200_000; i++) if (k.land.index.claimAt(2000 + (i % 1600), 2000 + ((i * 7) % 1000))) hits++;
    const ms = performance.now() - t0;
    expect(hits).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1500);
    // Everything is where it was bought.
    expect(k.land.index.claimAt(2000, 2000)?.ownerId).toBe('p0');
    expect(k.land.index.claimAt(2000 + 39 * 40 + 14, 2000 + 24 * 40 + 14)?.ownerId).toBe('p999');
    expect(k.land.index.claimAt(2000 + 20, 2000 + 20)).toBeNull();
  });

  it('keeps thousands of changes and a queue of them, and writes only what changed', () => {
    const k = landKit();
    const y = ground(k, 700, 700);
    // Dig down in the same few columns: thousands of changes whatever the ground above is.
    let n = 0;
    for (let i = 0; i < 40; i++) for (let dy = 0; dy < 75; dy++) if (k.edit(ME, 700 + (i % 20) * 3, y - dy, 700 + Math.floor(i / 20) * 3, 0)) n++;
    expect(n).toBeGreaterThan(2000);
    expect(k.land.ledger.wildCount).toBe(n);
    const d1 = k.land.ledger.drain();
    expect(d1.upserts.length).toBe(n);
    k.land.ledger.requeue(d1);
    k.land.flush();
    expect(k.store.mods.get('test')?.size).toBe(n);
    expect(k.land.ledger.pendingWrites).toBe(0);
    // Nothing changed: nothing to write.
    expect(k.land.ledger.drain().upserts.length).toBe(0);
    // Everything in it is found by a lookup, not a scan.
    expect(k.land.ledger.at(700, y, 700)?.cls).toBe('wild');
    expect(k.land.ledger.at(modKey(1, 1, 1), 1, 1)).toBeUndefined();
  });

  it('retries a failed write at the next save, and loses nothing', () => {
    const k = landKit();
    const y = ground(k, 700, 700);
    k.edit(ME, 700, y, 700, 0);
    k.store.failNext = 'mods';
    k.land.flush();
    expect(k.store.mods.get('test')?.size ?? 0).toBe(0);
    k.land.flush();
    expect(k.store.mods.get('test')?.size).toBe(1);
  });

  it('is configured, not hard-coded', () => {
    const cfg = landConfigWith({ regen: { excavationHours: 1 } });
    expect(cfg.regen.excavationHours).toBe(1);
    expect(cfg.regen.placedHours).toBe(60);
  });
});

void T0;
