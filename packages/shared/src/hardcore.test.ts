import { describe, expect, it } from 'vitest';
import {
  B,
  GameSession,
  HARD_DAMAGE,
  HeadlessWorld,
  WorldGenerator,
  mulberry32,
  parsePlayerSave,
  type InputFrame,
} from './index';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({
  t: 'frame',
  dt: 1 / 20,
  locked: true,
  yaw: 0,
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

function make(hardcore: boolean, mode: 'survival' | 'creative' = 'survival') {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 12; x <= CX + 12; x++)
    for (let z = CZ - 12; z <= CZ + 12; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(3), mode, hardcore });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world, generator };
}

const kill = (s: GameSession) => {
  s.hurtByMob(1000, 0, 0, 'zombie');
  s.tick(idle());
};

describe('hardcore: the rules', () => {
  it('is survival with one life', () => {
    const { s } = make(true);
    expect(s.hardcore).toBe(true);
    expect(s.mode).toBe('survival');
    expect(s.gameOver).toBe(false);
  });

  it('is only ever survival, even if creative was asked for', () => {
    expect(make(true, 'creative').s.hardcore).toBe(false);
  });

  it('cannot switch to creative', () => {
    const { s } = make(true);
    s.command({ t: 'mode', mode: 'creative' });
    s.tick(idle());
    expect(s.mode).toBe('survival');
    s.setMode('creative');
    expect(s.mode).toBe('survival');
  });

  it('hits harder than normal: mobs deal half as much again', () => {
    const normal = make(false).s;
    const hard = make(true).s;
    normal.hurtByMob(4, 0, 0, 'zombie');
    hard.hurtByMob(4, 0, 0, 'zombie');
    const lostNormal = 20 - normal.vitals.health;
    const lostHard = 20 - hard.vitals.health;
    expect(lostNormal).toBe(4);
    expect(lostHard).toBeCloseTo(4 * HARD_DAMAGE);
  });

  it('starves to death instead of stopping at half a heart', () => {
    const run = (hardcore: boolean) => {
      const { s } = make(hardcore);
      s.vitals.hunger = 0;
      s.vitals.saturation = 0;
      s.vitals.health = 2;
      for (let i = 0; i < 20 * 120 && s.screen !== 'dead'; i++) s.tick(idle());
      return s;
    };
    const normal = run(false);
    expect(normal.screen).toBe('none');
    expect(normal.vitals.health).toBe(1);
    expect(run(true).screen).toBe('dead');
  });
});

describe('hardcore: dying', () => {
  it('ends the game', () => {
    const { s } = make(true);
    kill(s);
    expect(s.screen).toBe('dead');
    expect(s.gameOver).toBe(true);
  });

  it('respawning means spectating, not playing on', () => {
    const { s } = make(true);
    const where = { x: s.body.x, z: s.body.z };
    kill(s);
    s.command({ t: 'respawn' });
    s.tick(idle());
    expect(s.screen).toBe('none');
    expect(s.spectating).toBe(true);
    expect(s.gameOver).toBe(true);
    expect(s.flying).toBe(true);
    expect(Math.hypot(s.body.x - where.x, s.body.z - where.z)).toBeLessThan(2);
  });

  it('a normal survival death respawns as usual', () => {
    const { s } = make(false);
    kill(s);
    s.command({ t: 'respawn' });
    s.tick(idle());
    expect(s.spectating).toBe(false);
    expect(s.vitals.health).toBe(20);
  });
});

describe('hardcore: spectating', () => {
  const spectate = () => {
    const made = make(true);
    kill(made.s);
    made.s.command({ t: 'respawn' });
    made.s.tick(idle());
    return made;
  };

  it('cannot be hurt', () => {
    const { s } = spectate();
    s.hurtByMob(1000, 0, 0, 'zombie');
    s.hurtByExplosion(s.body.x, s.body.y, s.body.z, 4, 'creeper');
    expect(s.vitals.dead).toBe(false);
    expect(s.screen).toBe('none');
  });

  it('flies through walls', () => {
    const { s, world } = spectate();
    for (let y = FLOOR + 1; y <= FLOOR + 3; y++) world.setBlock(CX + 3, y, CZ, B.STONE);
    s.teleport(CX + 0.5, FLOOR + 1.5, CZ + 0.5, -Math.PI / 2, 0); // face +x
    for (let i = 0; i < 60; i++) s.tick(idle({ forward: 1, yaw: -Math.PI / 2 }));
    expect(s.body.x).toBeGreaterThan(CX + 4);
  });

  it('does not fall', () => {
    const { s } = spectate();
    const y = s.body.y;
    for (let i = 0; i < 40; i++) s.tick(idle());
    expect(s.body.y).toBeGreaterThan(y - 0.5);
  });

  it('cannot break or place blocks', () => {
    const { s, world } = spectate();
    world.setBlock(CX, FLOOR + 1, CZ - 2, B.STONE);
    s.teleport(CX + 0.5, FLOOR + 1.5, CZ + 0.5, 0, 0);
    for (let i = 0; i < 40; i++) s.tick(idle({ left: true }));
    expect(world.getBlock(CX, FLOOR + 1, CZ - 2)).toBe(B.STONE);
    expect(s.target).toBeNull();
  });

  it('cannot use commands such as opening the inventory', () => {
    const { s } = spectate();
    s.command({ t: 'inventory' });
    s.tick(idle());
    expect(s.menu).toBeNull();
  });

  it('cannot become creative', () => {
    const { s } = spectate();
    s.command({ t: 'mode', mode: 'creative' });
    s.tick(idle());
    expect(s.mode).toBe('survival');
  });
});

describe('hardcore: saving', () => {
  it('a normal save has no hardcore fields', () => {
    const { s } = make(false);
    const save = s.savePlayer();
    expect('hardcore' in save).toBe(false);
    expect('gameOver' in save).toBe(false);
  });

  it('remembers a hardcore world', () => {
    const { s } = make(true);
    const save = parsePlayerSave(s.savePlayer())!;
    expect(save.hardcore).toBe(true);
    expect(save.gameOver).toBeUndefined();
    const again = make(false).s;
    again.loadPlayer(save);
    expect(again.hardcore).toBe(true);
    expect(again.mode).toBe('survival');
  });

  it('a dead hardcore player is still dead after a reload', () => {
    const { s } = make(true);
    kill(s);
    const save = parsePlayerSave(JSON.parse(JSON.stringify(s.savePlayer())))!;
    expect(save.gameOver).toBe(true);
    const again = make(false).s;
    again.loadPlayer(save);
    expect(again.gameOver).toBe(true);
    expect(again.screen).toBe('dead');
    again.command({ t: 'respawn' });
    again.tick(idle());
    expect(again.spectating).toBe(true);
  });

  it('a spectator is still a spectator after a reload', () => {
    const { s } = make(true);
    kill(s);
    s.command({ t: 'respawn' });
    s.tick(idle());
    const save = parsePlayerSave(JSON.parse(JSON.stringify(s.savePlayer())))!;
    expect(save.spectating).toBe(true);
    const again = make(false).s;
    again.loadPlayer(save);
    expect(again.spectating).toBe(true);
    expect(again.screen).toBe('none');
    expect(again.flying).toBe(true);
  });

  it('ignores hardcore flags that make no sense', () => {
    const base = parsePlayerSave({ v: 1, x: 0, y: 70, z: 0, mode: 'survival' })!;
    expect(parsePlayerSave({ ...base, gameOver: true, spectating: true })).not.toHaveProperty('gameOver');
    expect(parsePlayerSave({ ...base, hardcore: 'yes' })).not.toHaveProperty('hardcore');
    expect(parsePlayerSave({ ...base, hardcore: true, spectating: true })).not.toHaveProperty('spectating');
    expect(parsePlayerSave({ ...base, savedAt: 123 })?.savedAt).toBe(123);
  });
});
