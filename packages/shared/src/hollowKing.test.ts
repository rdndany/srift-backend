import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SEED,
  DUNGEON_MIN_LEVEL,
  ENCHANTS,
  GameSession,
  HK,
  HK_ARMOR,
  HK_NAMES,
  HOLLOW_KING_IDS,
  HeadlessWorld,
  I,
  accessoryOfItem,
  armorId,
  canCarry,
  dominantElement,
  getItem,
  glowCode,
  glyphSockets,
  hollowKingRelic,
  LOOT_TABLES,
  isChest,
  makeGenerator,
  makeStack,
  mulberry32,
  randomGear,
  randomHollowKingRelic,
  rollChest,
  tooltipLines,
  tooltipName,
  totalForLevel,
  type AdventureWorldGenerator,
  type InputFrame,
} from './index';

const rand = mulberry32(5);

describe('the relics of the Hollow King', () => {
  it('are nine items, each with its own name and picture', () => {
    expect(HOLLOW_KING_IDS.length).toBe(9);
    expect(new Set(HOLLOW_KING_IDS).size).toBe(9);
    const tiles = new Set<number>();
    for (const id of HOLLOW_KING_IDS) {
      const item = getItem(id);
      expect(item.id).toBe(id);
      expect(item.maxStack).toBe(1);
      expect(HK_NAMES[id]).toMatch(/\w/);
      tiles.add(item.tile);
    }
    expect(tiles.size).toBe(9);
  });

  it('are a full set of armor, a sword, a staff, a crossbow, a ring and a necklace', () => {
    expect(HK_ARMOR.map((id) => getItem(id).armor?.slotIndex)).toEqual([0, 1, 2, 3]);
    for (const id of HK_ARMOR) expect(getItem(id).armor?.set).toBe('hollow_king');
    expect(getItem(HK.BLADE).weapon?.kind).toBe('melee');
    expect(getItem(HK.STAFF).weapon?.kind).toBe('spell');
    expect(getItem(HK.STAFF).carry).toBe('staff');
    expect(getItem(HK.CROSSBOW).use).toBe('crossbow');
    expect(accessoryOfItem(HK.SIGNET)?.kind).toBe('ring');
    expect(accessoryOfItem(HK.HEART)?.kind).toBe('necklace');
    // Better than diamond
    expect(getItem(HK.CUIRASS).armor!.defense).toBeGreaterThanOrEqual(8);
    expect(getItem(HK.CUIRASS).armor!.durability).toBeGreaterThan(getItem(armorId(1, 'diamond')).armor!.durability);
  });

  it('are made epic, with fire inscribed that fits them, and always glow with ember', () => {
    for (const id of HOLLOW_KING_IDS) {
      const stack = hollowKingRelic(id, rand);
      expect(stack.id).toBe(id);
      expect(dominantElement(stack)).toBe('ember');
      expect(glowCode(stack)).toBeGreaterThan(0);
      if (id === HK.SIGNET || id === HK.HEART) {
        expect(stack.gear).toBeUndefined();
        continue;
      }
      expect(stack.gear?.r).toBe(3);
      const glyphs = stack.ench ?? [];
      expect(glyphs.length).toBeGreaterThan(0);
      expect(glyphs.length).toBeLessThanOrEqual(glyphSockets(stack));
      for (const [gid, rank] of glyphs) {
        const def = ENCHANTS.find((d) => d.id === gid)!;
        expect(canCarry(getItem(id), def), `${HK_NAMES[id]} carries glyph ${def.name}`).toBe(true);
        expect(rank).toBeLessThanOrEqual(def.max);
      }
    }
    // The weapons are for their classes.
    expect(hollowKingRelic(HK.BLADE, rand).gear?.c).toBe('warrior');
    expect(hollowKingRelic(HK.STAFF, rand).gear?.c).toBe('mage');
    expect(hollowKingRelic(HK.CROSSBOW, rand).gear?.c).toBe('ranger');
    // Even a relic that has lost its glyphs still burns.
    expect(dominantElement(makeStack(HK.CROWN))).toBe('ember');
  });

  it('show their own names and lore, and any of the nine can drop', () => {
    for (const id of HOLLOW_KING_IDS) {
      const stack = hollowKingRelic(id, rand);
      expect(tooltipName(stack)).toBe(HK_NAMES[id]);
      const lines = tooltipLines(stack);
      expect(lines[0].color).toBe('epic');
      expect(lines.some((l) => l.text.includes('Hollow King'))).toBe(true);
    }
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) seen.add(randomHollowKingRelic(rand).id);
    expect(seen.size).toBe(9);
  });
});

const idle = (): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false });
const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

describe('only the Hollow King leaves the relics, and only as Epic', () => {
  it('says Epic on every one, the ring and the necklace too', () => {
    for (const id of HOLLOW_KING_IDS) {
      const lines = tooltipLines(hollowKingRelic(id, mulberry32(id)));
      expect(lines[1].text.startsWith('Epic ')).toBe(true);
      expect(lines[1].color).toBe('epic');
    }
    for (let i = 0; i < 50; i++) expect(hollowKingRelic(HOLLOW_KING_IDS[i % 9], mulberry32(i)).gear?.r ?? 3).toBe(3);
  });

  it('are in no loot table and in no roll of found gear', () => {
    const relic = new Set<number>(HOLLOW_KING_IDS);
    for (const [name, table] of Object.entries(LOOT_TABLES)) for (const e of table.entries) expect(relic.has(e.item), `${name} table`).toBe(false);
    const r = mulberry32(11);
    for (const cls of [undefined, 'warrior', 'mage', 'ranger'] as const) {
      for (let level = 1; level <= 30; level++) for (let n = 0; n < 12; n++) expect(relic.has(randomGear(level, 3, cls, r).id)).toBe(false);
    }
    for (const table of Object.values(LOOT_TABLES)) for (let n = 0; n < 40; n++) for (const s of rollChest(table, r)) if (s) expect(relic.has(s.id)).toBe(false);
  });
});

describe('when the Hollow King falls', () => {
  it('leaves a chest of loot and, besides the usual gear, one of his relics for each player', () => {
    const world = new HeadlessWorld(generator);
    const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: true, rand: mulberry32(9) });
    s.finishLoading();
    s.xp.add(totalForLevel(DUNGEON_MIN_LEVEL));
    s.inventory.collect(makeStack(I.HOLLOW_SIGIL, 8));
    const realm = s.realm;
    realm.usePortal(s);
    const spec = generator.instanceBoss(0)!;
    s.teleport(spec.arena.x0 + 3.5, spec.y, spec.z, -Math.PI / 2, 0);
    for (let i = 0; i < 40; i++) s.tick(idle());
    const king = realm.mobs.mobs.find((m) => m.kind === 'hollow_king')!;
    const before = realm.drops.drops.length;
    realm.mobs.damage(king, 99999, 0, 0, realm.mobEvents, true, false, true);
    expect(king.dead).toBe(true);

    const fresh = realm.drops.drops.slice(before);
    const relics = fresh.filter((d) => HOLLOW_KING_IDS.includes(d.stack.id));
    expect(relics.length).toBe(1);
    expect(fresh.filter((d) => d.stack.gear && !HOLLOW_KING_IDS.includes(d.stack.id)).length).toBeGreaterThanOrEqual(1);

    // A chest stands within a few blocks of where he fell, with his hoard in it.
    const near: { x: number; y: number; z: number }[] = [];
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) for (let dy = -4; dy <= 4; dy++) {
      const x = Math.floor(king.body.x) + dx;
      const y = Math.floor(king.body.y) + dy;
      const z = Math.floor(king.body.z) + dz;
      if (isChest(realm.world.getBlock(x, y, z))) near.push({ x, y, z });
    }
    expect(near.length).toBeGreaterThanOrEqual(1);
    const chest = realm.blockEntities.chest(near[0].x, near[0].y, near[0].z);
    expect(chest.isEmpty()).toBe(false);
    let stacks = 0;
    for (let i = 0; i < chest.size; i++) if (chest.get(i)) stacks++;
    expect(stacks).toBeGreaterThanOrEqual(9);
  });
});
