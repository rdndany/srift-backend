import { describe, expect, it } from 'vitest';
import { B, GameSession, HeadlessWorld, Player, WorldGenerator, makeStack, mulberry32, toolId, type InputFrame } from './index';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

function stand(): { s: GameSession; foe: Player } {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 12; x <= CX + 12; x++)
    for (let z = CZ - 12; z <= CZ + 12; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(7) });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  const foe = new Player(s.realm, { name: 'Bob', mode: 'survival' });
  foe.finishLoading();
  foe.teleport(s.body.x + 2, s.body.y, s.body.z, 0, 0);
  return { s, foe };
}

const frame = (over: Partial<InputFrame> = {}): InputFrame => ({
  t: 'frame',
  dt: 1 / 20,
  locked: true,
  yaw: -Math.PI / 2,
  pitch: 0,
  forward: 0,
  strafe: 0,
  jump: false,
  sprint: false,
  sneak: false,
  left: false,
  right: false,
  ...over,
});

describe('players are solid, and a duel is the only time they can be struck', () => {
  it('stops a player who walks into another, short of standing inside them', () => {
    const { s, foe } = stand();
    foe.teleport(s.body.x + 3, s.body.y, s.body.z, 0, 0);
    for (let i = 0; i < 60; i++) s.tick(frame({ forward: 1 }));
    expect(s.body.x).toBeLessThan(foe.body.x - 0.2);
    expect(Math.hypot(s.body.x - foe.body.x, s.body.z - foe.body.z)).toBeGreaterThan(0.5);
  });

  it('a sword does nothing until both are in the duel, and then it lands', () => {
    const { s, foe } = stand();
    s.inventory.set(0, makeStack(toolId('sword', 'iron')));
    const full = foe.vitals.health;
    s.tick(frame({ left: true }));
    expect(foe.vitals.health).toBe(full);
    s.duelTarget = foe;
    foe.duelTarget = s;
    s.tick(frame({ left: true }));
    expect(foe.vitals.health).toBeLessThan(full);
    expect(foe.killedBy).toBe(s.name);
  });
});
