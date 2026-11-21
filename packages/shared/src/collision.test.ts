import { describe, expect, it } from 'vitest';
import { B, MobManager, PLAYER_WIDTH, createBody, mulberry32, stepPlayer, BOSS_WINDUP, type MoveInput, type Solid } from './index';

const floor = { getBlock: (_x: number, y: number, _z: number): number => (y < 1 ? B.STONE : B.AIR) };
const walk = (over: Partial<MoveInput> = {}): MoveInput => ({ forward: 1, strafe: 0, jump: false, sprint: false, sneak: false, fly: false, flyDown: false, yaw: Math.PI / 2, ...over });

describe('characters are solid', () => {
  it('stops a body that walks into a monster at the edge of it, and does not let it through', () => {
    // yaw PI/2 walks towards +x: forward = (-sin, -cos) = (-1, 0)... so face -x (yaw -PI/2 walks +x).
    const b = createBody(0.5, 1, 0.5);
    const mob: Solid = { x: 3.5, y: 1, z: 0.5, r: 0.5, h: 1.9 };
    for (let i = 0; i < 200; i++) stepPlayer(floor, b, walk({ yaw: -Math.PI / 2, solids: [mob] }), 1 / 20);
    expect(b.x).toBeLessThan(mob.x - 0.5 - PLAYER_WIDTH / 2 + 0.05);
    expect(b.x).toBeGreaterThan(2.5);
    // Without it in the way the body walks on.
    const free = createBody(0.5, 1, 0.5);
    for (let i = 0; i < 200; i++) stepPlayer(floor, free, walk({ yaw: -Math.PI / 2 }), 1 / 20);
    expect(free.x).toBeGreaterThan(10);
  });

  it('slides round a monster when it walks into it off-centre, and jumps over a low one', () => {
    const b = createBody(0.5, 1, 0.9);
    const mob: Solid = { x: 3.5, y: 1, z: 0.5, r: 0.5, h: 1.9 };
    for (let i = 0; i < 200; i++) stepPlayer(floor, b, walk({ yaw: -Math.PI / 2, solids: [mob] }), 1 / 20);
    expect(b.x).toBeGreaterThan(5);
    const hop = createBody(0.5, 1, 0.5);
    const low: Solid = { x: 3.5, y: 1, z: 0.5, r: 0.3, h: 0.4 };
    for (let i = 0; i < 100; i++) stepPlayer(floor, hop, walk({ yaw: -Math.PI / 2, solids: [low], jump: true }), 1 / 20);
    expect(hop.x).toBeGreaterThan(5);
  });

  it('is not pushed into a wall', () => {
    const wall = { getBlock: (x: number, y: number, _z: number): number => (y < 1 || x >= 2 ? B.STONE : B.AIR) };
    const b = createBody(1.6, 1, 0.5);
    const mob: Solid = { x: 0.9, y: 1, z: 0.5, r: 1, h: 2 };
    for (let i = 0; i < 20; i++) stepPlayer(wall, b, walk({ forward: 0, solids: [mob] }), 1 / 20);
    expect(b.x).toBeLessThanOrEqual(2 - PLAYER_WIDTH / 2 + 1e-3);
  });

  it('makes a monster stop at the edge of a player instead of standing inside them', () => {
    const mgr = new MobManager(mulberry32(3));
    const player = { x: 0.5, y: 1, z: 0.5, alive: true, invulnerable: false };
    const events: any = { hurtPlayer() {}, sound() {}, explode() {}, shoot() {}, afflict() {}, ignite() {}, fx() {} };
    const z = mgr.spawn('zombie', 6.5, 1, 0.5);
    for (let i = 0; i < 200; i++) mgr.update(1 / 20, { world: floor, player, daylight: 0, rand: mulberry32(i + 5) } as any, events);
    const d = Math.hypot(z.body.x - player.x, z.body.z - player.z);
    expect(d).toBeGreaterThan(0.3 + z.width / 2 - 0.1);
  });
});

describe('a boss swing', () => {
  it('is wound up for a moment (and can be walked out of) before it lands', () => {
    const mgr = new MobManager(mulberry32(3));
    const player = { x: 0.5, y: 1, z: 0.5, alive: true, invulnerable: false };
    const hits: number[] = [];
    const events: any = { hurtPlayer: (a: number) => hits.push(a), sound() {}, explode() {}, shoot() {}, afflict() {}, ignite() {}, fx() {} };
    const king = mgr.spawn('hollow_king', 4.5, 1, 0.5);
    const env = (): any => ({ world: floor, player, daylight: 0, rand: mulberry32(1) });
    let t = 0;
    let first = -1;
    for (let i = 0; i < 400 && first < 0; i++) {
      mgr.update(1 / 20, env(), events);
      t += 1 / 20;
      if (hits.length > 0) first = t;
    }
    expect(first).toBeGreaterThan(0);
    // The swing began (attackTime restarted) about BOSS_WINDUP before the blow.
    expect(king.windup).toBe(0);
    expect(hits.length).toBe(1);
    // And one that the player has left by the time it lands hits nothing.
    const mgr2 = new MobManager(mulberry32(3));
    const hits2: number[] = [];
    const events2: any = { hurtPlayer: (a: number) => hits2.push(a), sound() {}, explode() {}, shoot() {}, afflict() {}, ignite() {}, fx() {} };
    const p2 = { x: 0.5, y: 1, z: 0.5, alive: true, invulnerable: false };
    const k2 = mgr2.spawn('hollow_king', 3.5, 1, 0.5);
    let swung = false;
    for (let i = 0; i < 400; i++) {
      mgr2.update(1 / 20, { world: floor, player: p2, daylight: 0, rand: mulberry32(1) } as any, events2);
      if (!swung && k2.windup > 0) {
        swung = true;
        p2.x = -12;
      }
      if (swung && k2.windup === 0) break;
    }
    expect(swung).toBe(true);
    expect(hits2.length).toBe(0);
    expect(BOSS_WINDUP).toBeGreaterThan(0.5);
  });
});
