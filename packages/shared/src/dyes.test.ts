import { describe, expect, it } from 'vitest';
import {
  B,
  BLOCKS,
  DYE_NAMES,
  DYE_RGB,
  GameSession,
  HeadlessWorld,
  I,
  MOBS,
  SMELTING,
  TILE_NAMES,
  WorldGenerator,
  bedId,
  bedInfo,
  bedItemColor,
  bedItemId,
  blockDrops,
  dyeColor,
  dyeId,
  findRecipe,
  getItem,
  makeStack,
  mulberry32,
  sheepColor,
  tileIndex,
  toolId,
  woolColor,
  woolId,
  type InputFrame,
  type ItemStack,
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

function make(mode: 'survival' | 'creative' = 'survival') {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 12; x <= CX + 12; x++)
    for (let z = CZ - 12; z <= CZ + 12; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(5), mode });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return s;
}

const PITCH = -0.6;
const grid = (...ids: number[]): (ItemStack | null)[] => ids.map((id) => (id ? makeStack(id) : null));
const dye = (name: (typeof DYE_NAMES)[number]): number => dyeId(DYE_NAMES.indexOf(name));
const craft = (...ids: number[]) => findRecipe(grid(...ids), ids.length, 1)?.result ?? null;

describe('dye and wool ids', () => {
  it('has sixteen colours, each with an item, and fifteen coloured wools', () => {
    expect(DYE_NAMES.length).toBe(16);
    expect(DYE_RGB.length).toBe(16);
    for (let c = 0; c < 16; c++) {
      expect(dyeColor(dyeId(c))).toBe(c);
      expect(getItem(dyeId(c)).name).toBe(`${DYE_NAMES[c]}_dye`);
      expect(TILE_NAMES).toContain(`dye_${DYE_NAMES[c]}`);
      expect(woolColor(woolId(c))).toBe(c);
    }
    expect(woolId(0)).toBe(B.WOOL);
    for (let c = 1; c < 16; c++) {
      expect(BLOCKS[woolId(c)].name).toBe(`${DYE_NAMES[c]}_wool`);
      expect(getItem(woolId(c)).block).toBe(woolId(c));
    }
    expect(woolColor(B.STONE)).toBe(-1);
    expect(dyeColor(I.STICK)).toBe(-1);
    expect(tileIndex('lapis_ore')).toBeGreaterThanOrEqual(0);
  });

  it('keeps block ids to one byte and clear of other ids', () => {
    expect(woolId(15)).toBeLessThan(256);
    const used = new Set<number>();
    for (let c = 1; c < 16; c++) {
      expect(used.has(woolId(c))).toBe(false);
      used.add(woolId(c));
    }
    expect(used.has(B.LAPIS_ORE)).toBe(false);
  });
});

describe('getting dyes', () => {
  it('makes dyes from flowers, ink, bone and the mix of others', () => {
    expect(craft(B.ROSE)).toEqual({ id: dye('red'), count: 1 });
    expect(craft(B.DANDELION)).toEqual({ id: dye('yellow'), count: 1 });
    expect(craft(I.INK_SAC)).toEqual({ id: dye('black'), count: 1 });
    expect(craft(I.BONE)).toEqual({ id: dye('white'), count: 3 });
    expect(craft(dye('red'), dye('yellow'))).toEqual({ id: dye('orange'), count: 2 });
    expect(craft(dye('white'), dye('red'))).toEqual({ id: dye('pink'), count: 2 });
    expect(craft(dye('blue'), dye('white'))).toEqual({ id: dye('light_blue'), count: 2 });
    expect(craft(dye('blue'), dye('red'))).toEqual({ id: dye('purple'), count: 2 });
    expect(craft(dye('blue'), dye('green'))).toEqual({ id: dye('cyan'), count: 2 });
    expect(craft(dye('purple'), dye('pink'))).toEqual({ id: dye('magenta'), count: 2 });
    expect(craft(dye('gray'), dye('white'))).toEqual({ id: dye('light_gray'), count: 2 });
    expect(craft(dye('black'), dye('white'))).toEqual({ id: dye('gray'), count: 2 });
    expect(craft(dye('green'), dye('white'))).toEqual({ id: dye('lime'), count: 2 });
    expect(craft(dye('red'), dye('green'))).toEqual({ id: dye('brown'), count: 2 });
  });

  it('cooks cactus into green dye', () => {
    expect(SMELTING.get(B.CACTUS)).toBe(dye('green'));
  });

  it('mines lapis ore into 4 to 8 lapis lazuli with a stone pickaxe, nothing with a wooden one', () => {
    const pick = (kind: 'wood' | 'stone') => getItem(toolId('pickaxe', kind)).tool ?? null;
    for (let i = 0; i < 20; i++) {
      const drops = blockDrops(BLOCKS[B.LAPIS_ORE], pick('stone'), mulberry32(i));
      expect(drops.length).toBe(1);
      expect(drops[0].id).toBe(I.LAPIS_LAZULI);
      expect(drops[0].count).toBeGreaterThanOrEqual(4);
      expect(drops[0].count).toBeLessThanOrEqual(8);
    }
    expect(blockDrops(BLOCKS[B.LAPIS_ORE], pick('wood'), mulberry32(1))).toEqual([]);
  });
});

describe('dyeing wool', () => {
  it('dyes plain or coloured wool with any dye', () => {
    for (let c = 0; c < 16; c++) {
      expect(craft(B.WOOL, dyeId(c))).toEqual({ id: woolId(c), count: 1 });
      expect(craft(dyeId(c), woolId((c + 5) % 16))).toEqual({ id: woolId(c), count: 1 });
    }
  });

  it('still makes a bed from wool of one colour', () => {
    const r = findRecipe(grid(0, 0, 0, woolId(3), woolId(3), woolId(3), B.PLANKS, B.PLANKS, B.PLANKS), 3, 3);
    expect(r?.result.id).toBe(bedItemId(3));
  });

  it('does not turn a dye on its own into wool', () => {
    expect(craft(B.STONE, dye('red'))).toBeNull();
  });
});

describe('sheep colours', () => {
  it('drops wool of its own colour', () => {
    for (const c of [0, 1, 7, 15]) {
      const d = MOBS.sheep.drops(mulberry32(1), { size: 1, variant: c });
      expect(d.some((x) => x.id === woolId(c))).toBe(true);
    }
    expect(MOBS.sheep.drops(mulberry32(1)).some((x) => x.id === B.WOOL)).toBe(true);
  });

  it('is mostly white in the wild, never a loud colour', () => {
    const r = mulberry32(11);
    const count = new Map<number, number>();
    for (let i = 0; i < 5000; i++) {
      const c = sheepColor(r);
      count.set(c, (count.get(c) ?? 0) + 1);
    }
    expect((count.get(0) ?? 0) / 5000).toBeGreaterThan(0.78);
    for (const c of count.keys()) expect([0, 6, 7, 8, 12, 15]).toContain(c);
    expect(count.get(15) ?? 0).toBeGreaterThan(100);
  });

  it('is dyed by right-clicking with a dye, using one up', () => {
    const s = make();
    const sheep = s.mobs.spawn('sheep', CX + 0.5, FLOOR + 1, CZ - 1.2, { variant: 0 });
    s.inventory.set(0, makeStack(dye('blue'), 3));
    s.selected = 0;
    s.tick(idle({ pitch: PITCH }));
    s.tick(idle({ pitch: PITCH, right: true }));
    expect(sheep.variant).toBe(DYE_NAMES.indexOf('blue'));
    expect(s.inventory.get(0)?.count).toBe(2);
    // The same colour again changes nothing and keeps the dye.
    s.tick(idle({ pitch: PITCH }));
    s.tick(idle({ pitch: PITCH, right: true }));
    expect(s.inventory.get(0)?.count).toBe(2);
  });

  it('keeps its colour through a save', () => {
    const s = make();
    s.mobs.spawn('sheep', CX + 0.5, FLOOR + 1, CZ - 3.5, { variant: 11 });
    const saved = JSON.parse(JSON.stringify(s.mobs.toJSON(CX, CZ, 64)));
    const t = make();
    t.mobs.loadJSON(saved);
    const back = t.mobs.mobs.find((m) => m.kind === 'sheep');
    expect(back?.variant).toBe(11);
  });

  it('rejects a bad colour from a save', () => {
    const t = make();
    t.mobs.loadJSON([{ kind: 'sheep', x: CX + 0.5, y: FLOOR + 1, z: CZ - 3.5, hp: 8, variant: 99 } as never]);
    expect(t.mobs.mobs.find((m) => m.kind === 'sheep')?.variant).toBe(0);
  });
});

describe('lapis ore in the world', () => {
  it('generates underground, deterministically', () => {
    const gen = new WorldGenerator(4242);
    let found = 0;
    for (let cx = -3; cx <= 3 && !found; cx++)
      for (let cz = -3; cz <= 3; cz++) {
        const chunk = gen.generateChunk(cx, cz);
        for (const b of chunk) if (b === B.LAPIS_ORE) found++;
      }
    expect(found).toBeGreaterThan(0);
  });
});

describe('coloured beds', () => {
  it('has a block id for every colour, direction and half, all different and inside one byte', () => {
    const seen = new Set<number>();
    for (let c = 0; c < 16; c++)
      for (let dir = 0; dir < 4; dir++) {
        const foot = bedId(false, dir, c);
        expect(foot).toBeLessThan(256);
        expect(seen.has(foot)).toBe(false);
        seen.add(foot);
        expect(bedInfo(foot)).toMatchObject({ head: false, dir, color: c });
      }
    for (let dir = 0; dir < 4; dir++) {
      const head = bedId(true, dir);
      expect(seen.has(head)).toBe(false);
      expect(bedInfo(head)).toMatchObject({ head: true, dir, color: -1 });
    }
    expect(bedId(false, 0, DYE_NAMES.indexOf('red'))).toBe(B.BED_FOOT_PX);
    expect(bedInfo(B.BED_COLOR_BASE + 60)).toBeNull();
  });

  it('has a bed item for every colour, red being the original', () => {
    const ids = new Set<number>();
    for (let c = 0; c < 16; c++) {
      ids.add(bedItemId(c));
      expect(bedItemColor(bedItemId(c))).toBe(c);
      expect(getItem(bedItemId(c)).maxStack).toBe(1);
    }
    expect(ids.size).toBe(16);
    expect(bedItemId(DYE_NAMES.indexOf('red'))).toBe(I.BED);
    expect(bedItemColor(I.STICK)).toBe(-1);
  });

  it('is crafted from three wool of one colour, in that colour', () => {
    const P = makeStack(B.PLANKS);
    for (let c = 0; c < 16; c++) {
      const W = makeStack(woolId(c));
      expect(findRecipe([W, W, W, P, P, P, null, null, null], 3, 3)?.result).toEqual({ id: bedItemId(c), count: 1 });
    }
    const a = makeStack(woolId(1));
    const b = makeStack(woolId(2));
    expect(findRecipe([a, a, b, P, P, P, null, null, null], 3, 3)).toBeNull();
    expect(findRecipe([a, makeStack(B.WOOL), a, P, P, P, null, null, null], 3, 3)).toBeNull();
  });

  it('is placed in its colour and drops one bed of that colour from either half', () => {
    for (const c of [0, 3, 14, 15]) {
      for (const half of ['foot', 'head'] as const) {
        const s = make();
        s.inventory.set(0, makeStack(bedItemId(c)));
        s.selectSlot(0);
        expect(s.useOn(CX + 3, FLOOR, CZ, 0, 1, 0)).toBe(true);
        expect(s.world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(bedId(false, 3, c));
        expect(s.world.getBlock(CX + 3, FLOOR + 1, CZ - 1)).toBe(B.BED_HEAD_NZ);
        if (half === 'foot') s.breakBlock(CX + 3, FLOOR + 1, CZ);
        else s.breakBlock(CX + 3, FLOOR + 1, CZ - 1);
        expect(s.world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.AIR);
        expect(s.world.getBlock(CX + 3, FLOOR + 1, CZ - 1)).toBe(B.AIR);
        s.teleport(CX + 3.5, FLOOR + 1, CZ + 0.5);
        s.tickDrops(2);
        expect(s.inventory.countOf(bedItemId(c))).toBe(1);
      }
    }
  });
});