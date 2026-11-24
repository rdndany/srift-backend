import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SEED,
  AdventureWorldGenerator,
  B,
  CHUNK_SIZE,
  CLEARING,
  DUNGEON_X,
  DUNGEON_Z,
  GREYKEEP,
  GREYKEEP_SHIFT_Z,
  IS_SOLID,
  NPCS,
  OUTPOSTS,
  SEA_LEVEL,
  VAULTS,
  WORKSHOPS,
  WORKSHOP_BENCH,
  ZONES,
  blockIndex,
  chestId,
  makeGenerator,
} from './index';

const gen = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;
const chunks = new Map<string, Uint16Array>();
const blockAt = (x: number, y: number, z: number): number => {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  const k = `${cx},${cz}`;
  let c = chunks.get(k);
  if (!c) chunks.set(k, (c = gen.generateChunk(cx, cz)));
  return c[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
};
const solid = (x: number, y: number, z: number): boolean => IS_SOLID[blockAt(x, y, z)] === 1;

describe('the outposts', () => {
  it('stand on dry, levelled land, and the zone of each is its own', () => {
    for (const o of OUTPOSTS) {
      const g = gen.groundAt(o.id);
      expect(g, o.id).not.toBeNull();
      expect(g!, `${o.id} is above the sea`).toBeGreaterThanOrEqual(SEA_LEVEL + 2);
      expect(solid(o.x, g!, o.z), `${o.id} ground`).toBe(true);
      expect(solid(o.x + 6, g!, o.z + 6), `${o.id} ground beside`).toBe(true);
      expect(gen.zoneAt(o.x + 0.5, g! + 1, o.z + 0.5), o.id).toBe(o.id);
      expect(gen.safeFromMonsters(o.x, o.z), `${o.id} is safe`).toBe(true);
      expect(gen.isProtected(o.x, g! + 1, o.z), `${o.id} is protected`).toBe(true);
    }
  });

  it('give every quest giver a floor, and room to stand', () => {
    for (const st of gen.npcStations()) {
      if (!st.npc.place) continue;
      const x = Math.floor(st.x);
      const z = Math.floor(st.z);
      expect(solid(x, st.y - 1, z), `${st.npc.id} has ground`).toBe(true);
      expect(solid(x, st.y, z), `${st.npc.id} has room (feet)`).toBe(false);
      expect(solid(x, st.y + 1, z), `${st.npc.id} has room (head)`).toBe(false);
      expect(gen.zoneAt(st.x, st.y, st.z), st.npc.id).toBe(st.npc.cellar ? 'undercroft' : st.npc.place);
    }
    expect(NPCS.filter((n) => n.place).length).toBeGreaterThanOrEqual(10);
  });

  it('give Greykeep a gate that can be walked through', () => {
    const o = OUTPOSTS.find((p) => p.id === 'greykeep')!;
    const g = gen.groundAt('greykeep')!;
    const gx = o.x + GREYKEEP.gate.x;
    const gz = o.z + GREYKEEP_SHIFT_Z + GREYKEEP.gate.z;
    for (let dy = 1; dy <= 4; dy++) expect(blockAt(gx, g + dy, gz), `gate at height ${dy}`).toBe(B.AIR);
    expect(solid(gx, g, gz)).toBe(true);
    // The bridge ends at the plaza.
    expect(solid(o.x, g, o.z - 4)).toBe(true);
  });

  it('are far enough from each other, and from the village and the chapel', () => {
    for (const a of OUTPOSTS) {
      expect(Math.hypot(a.x, a.z), a.id).toBeGreaterThan(120);
      expect(Math.hypot(a.x - DUNGEON_X, a.z - DUNGEON_Z), a.id).toBeGreaterThan(90);
      for (const b of OUTPOSTS) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} and ${b.id}`).toBeGreaterThan(150);
    }
  });
});

describe('the vaults', () => {
  for (const v of VAULTS) {
    it(`${v.id}: a ramp walks down into a chamber with two cages, a chest and an altar`, () => {
      const g = gen.groundAt(v.id)!;
      // The ramp, from the surface at the north edge to the chamber.
      for (let k = 0; k <= 11; k++) {
        const z = v.z - 11 + k;
        const y = g - k;
        expect(solid(v.x, y, z), `step ${k}`).toBe(true);
        for (let dy = 1; dy <= 3; dy++) expect(solid(v.x, y + dy, z), `headroom ${k}/${dy}`).toBe(false);
      }
      // The chamber.
      const floor = g - 12;
      for (let z = v.z + 1; z <= v.z + 10; z++) {
        for (const x of [v.x - 6, v.x + 6]) {
          expect(solid(x, floor, z), `floor ${x},${z}`).toBe(true);
          expect(solid(x, floor + 3, z), `room ${x},${z}`).toBe(false);
        }
      }
      // Two cages, each making a different kind of monster, and a chest.
      const cages = [-5, 5].map((dx) => ({ x: v.x + dx, y: g - 11, z: v.z + 5 }));
      cages.forEach((c, i) => {
        expect(blockAt(c.x, c.y, c.z), 'cage').toBe(B.SPAWNER);
        expect(gen.spawnerAt(c.x, c.y, c.z)).toBe(v.mobs[i]);
      });
      expect(blockAt(v.x + 5, g - 11, v.z + 10)).toBe(chestId(3, 0));
      expect(gen.lootAt(v.x + 5, g - 11, v.z + 10)).toBe('ruin');
      // The zone is its own, and only down there.
      expect(gen.zoneAt(v.x + 0.5, g - 10, v.z + 5.5)).toBe(v.id);
      expect(gen.zoneAt(v.x + 0.5, g + 1, v.z + 5.5)).not.toBe(v.id);
      // Nobody digs the cages out.
      expect(gen.isProtected(v.x - 5, g - 11, v.z + 5)).toBe(true);
    });
  }
});

describe('the clearing and the chapel', () => {
  it('have a zone each, and the clearing stands on firm ground', () => {
    const y = SEA_LEVEL + 40;
    expect(gen.zoneAt(CLEARING.x + 0.5, y, CLEARING.z + 0.5)).toBe('whisper_clearing');
    expect(gen.zoneAt(DUNGEON_X + 0.5, y, DUNGEON_Z + 0.5)).toBe('chapel_ruin');
    expect(gen.zoneAt(CLEARING.x + 30, y, CLEARING.z)).not.toBe('whisper_clearing');
  });

  it('every zone a quest names exists', () => {
    for (const id of ['whisper_clearing', 'chapel_ruin', 'reed_grotto', 'sand_crypt', 'frost_vault', ...OUTPOSTS.map((o) => o.id)]) {
      expect(ZONES.some((z) => z.id === id), id).toBe(true);
    }
  });
});

describe('the workshops and the stashes', () => {
  // Every village and town has a workshop of its own (crafting tables and furnaces, so no quest asks anybody to make them) and a stashkeeper.
  const places = [{ id: 'dawnwatch', ox: 0, oz: 0, g: gen.hubY }, ...OUTPOSTS.map((o) => ({ id: o.id, ox: o.x, oz: o.z, g: gen.groundAt(o.id)! }))];

  it('are in all seven places, with four tables and four furnaces each', () => {
    expect(places.length).toBe(7);
    expect(WORKSHOP_BENCH.filter((k) => k === 'table').length).toBe(4);
    expect(WORKSHOP_BENCH.filter((k) => k === 'furnace').length).toBe(4);
    for (const p of places) {
      const w = WORKSHOPS[p.id as keyof typeof WORKSHOPS];
      expect(w, p.id).toBeDefined();
      const z = p.oz + w.zb;
      const zf = z + w.dir * 2;
      WORKSHOP_BENCH.forEach((kind, i) => {
        const x = p.ox + w.x0 + i;
        expect(blockAt(x, p.g + 1, z), `${p.id} bench ${i}`).toBe(kind === 'table' ? B.CRAFTING_TABLE : B.FURNACE);
        expect(solid(x, p.g, z), `${p.id} ground under bench ${i}`).toBe(true);
        // Standing room in front of every bench, and a roof high enough over it.
        expect(solid(x, p.g + 1, z + w.dir), `${p.id} room in front of bench ${i}`).toBe(false);
        expect(solid(x, p.g + 2, z + w.dir), `${p.id} head room in front of bench ${i}`).toBe(false);
        if (i !== 0 && i !== 7) expect(blockAt(x, p.g + 2, z), `${p.id} nothing above bench ${i}`).toBe(B.AIR);
        expect(blockAt(x, p.g + 4, zf), `${p.id} roof ${i}`).toBe(B.PLANKS);
      });
    }
  });

  it('are not on the water, and have the plaza roads open to them', () => {
    for (const p of places) {
      const w = WORKSHOPS[p.id as keyof typeof WORKSHOPS];
      const z = p.oz + w.zb;
      for (let i = 0; i < 8; i++) expect(blockAt(p.ox + w.x0 + i, p.g, z), `${p.id} ${i}`).not.toBe(B.WATER);
    }
  });

  it('have a stashkeeper in every place, on the ground and with room to stand', () => {
    const keepers = gen.npcStations().filter((s) => s.npc.stash);
    expect(keepers.length).toBe(7);
    const where = new Set<string>();
    for (const st of keepers) {
      const place = st.npc.place ?? 'dawnwatch';
      where.add(place);
      const x = Math.floor(st.x);
      const z = Math.floor(st.z);
      expect(solid(x, st.y - 1, z), `${st.npc.id} has ground`).toBe(true);
      expect(solid(x, st.y, z), `${st.npc.id} has room (feet)`).toBe(false);
      expect(solid(x, st.y + 1, z), `${st.npc.id} has room (head)`).toBe(false);
    }
    expect(where.size).toBe(7);
  });
});