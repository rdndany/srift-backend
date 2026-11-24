import { describe, expect, it } from 'vitest';
import {
  B,
  AUCTIONEER,
  CLASS_IDS,
  FIRST_QUEST,
  I,
  MOBS,
  NPCS,
  QUESTS,
  QUEST_DROPS,
  QUEST_ITEMS,
  QuestLog,
  ZONES,
  getItem,
  npcById,
  questById,
  rollQuestDrops,
  shopOf,
  zoneDef,
  type ClassId,
  type Objective,
} from './index';

/** Do what a quest asks, as the game would tell the log. */
function doObjective(log: QuestLog, o: Objective): void {
  switch (o.kind) {
    case 'collect':
      return; // what is carried is told by `doAll`
    case 'craft':
      log.record({ t: 'craft', item: o.items[0], count: o.count });
      return;
    case 'smelt':
      log.record({ t: 'smelt', item: o.items?.[0] ?? 1, count: o.count });
      return;
    case 'kill':
      for (let i = 0; i < o.count; i++) log.record({ t: 'kill', mob: o.mobs[i % o.mobs.length] });
      return;
    case 'mine':
      for (let i = 0; i < o.count; i++) log.record({ t: 'mine', block: o.blocks[0] });
      return;
    case 'place':
      for (let i = 0; i < o.count; i++) log.record({ t: 'place', block: o.blocks[0] });
      return;
    case 'enter':
      log.record({ t: 'enter', zone: o.zone });
  }
}

/** Do everything a quest asks, carrying what it wants collected. */
function doAll(log: QuestLog, id: string): void {
  const q = questById(id)!;
  for (const o of q.objectives) doObjective(log, o);
  const stock = new Map<number, number>();
  for (const o of q.objectives) if (o.kind === 'collect') stock.set(o.items[0], (stock.get(o.items[0]) ?? 0) + o.count);
  log.sync((items) => items.reduce((n, item) => n + (stock.get(item) ?? 0), 0));
}

/** Take up and finish one quest. */
function finish(log: QuestLog, id: string): void {
  expect(log.accept(id), `accept ${id}`).toBe(true);
  doAll(log, id);
  expect(log.status(id), `${id} ready`).toBe('ready');
  expect(log.complete(id), `complete ${id}`).not.toBeNull();
}

/** A log of a character of a class that has finished the first `n` quests of the story, in the order they open. */
function played(classId: ClassId | null, n = Infinity): QuestLog {
  const log = new QuestLog();
  log.classId = classId;
  for (let i = 0; i < n; i++) {
    const next = QUESTS.find((q) => log.status(q.id) === 'available');
    if (!next) break;
    finish(log, next.id);
  }
  return log;
}

describe('the quest data', () => {
  it('never asks anybody to craft or place a crafting table or a furnace: every village and town has a workshop for all', () => {
    const bench: number[] = [B.CRAFTING_TABLE, B.FURNACE];
    for (const q of QUESTS) {
      q.objectives.forEach((o, i) => {
        if (o.kind === 'craft' || o.kind === 'place') expect((o.kind === 'craft' ? o.items : o.blocks).some((id) => bench.includes(id)), `${q.id} objective ${i}`).toBe(false);
      });
    }
  });
  it('has unique ids, real people, real prerequisites and real places', () => {
    const ids = new Set<string>();
    for (const q of QUESTS) {
      expect(ids.has(q.id), `duplicate ${q.id}`).toBe(false);
      ids.add(q.id);
      expect(npcById(q.giver), `${q.id} giver`).not.toBeNull();
      expect(npcById(q.turnIn), `${q.id} turn-in`).not.toBeNull();
      expect(q.name.length).toBeGreaterThan(0);
      expect(q.offer.length, ` offer`).toBeGreaterThan(10);
      expect(q.complete.length, `${q.id} complete`).toBeGreaterThan(10);
      expect(q.progress.length).toBeGreaterThan(10);
      expect(q.reward.xp).toBeGreaterThan(0);
      expect(q.objectives.length).toBeGreaterThan(0);
      for (const r of q.requires) expect(questById(r), `${q.id} requires ${r}`).not.toBeNull();
      for (const it of [...q.reward.items, ...(q.give ?? []), ...Object.values(q.reward.classItems ?? {}).flat()]) {
        expect(() => getItem(it.id), `${q.id} item ${it.id}`).not.toThrow();
        expect(getItem(it.id).name, `${q.id} item ${it.id}`).toBeTruthy();
        expect(it.count).toBeGreaterThan(0);
      }
      for (const o of q.objectives) {
        expect(o.count).toBeGreaterThan(0);
        expect(o.label.length).toBeGreaterThan(0);
        if (o.kind === 'enter') expect(zoneDef(o.zone), `${q.id} zone`).not.toBeNull();
        if (o.kind === 'kill') for (const m of o.mobs) expect(MOBS[m], `${q.id} mob ${m}`).toBeDefined();
        if (o.kind === 'collect' || o.kind === 'craft') for (const id of o.items) expect(() => getItem(id), `${q.id} objective item ${id}`).not.toThrow();
      }
    }
    expect(QUESTS.length).toBeGreaterThanOrEqual(100);
    expect(ZONES.length).toBeGreaterThanOrEqual(2);
  });

  it('has a long main story and plenty of side quests, and a class line for each class', () => {
    const main = QUESTS.filter((q) => /^ms\d+$/.test(q.id));
    expect(main.length).toBe(39);
    expect(QUESTS.length - main.length).toBeGreaterThanOrEqual(60);
    for (const c of CLASS_IDS) expect(QUESTS.filter((q) => q.class === c).length, c).toBe(5);
  });

  it('keeps every NPC as the index of a mob variant, and gives each business', () => {
    expect(NPCS.length).toBeGreaterThan(0);
    expect(NPCS.length).toBeLessThan(256);
    for (const n of NPCS) expect(QUESTS.some((q) => q.giver === n.id || q.turnIn === n.id) || shopOf(n.id) !== null || n.id === AUCTIONEER || n.stash === true, `${n.id} has no business`).toBe(true);
    expect(new Set(NPCS.map((n) => n.id)).size).toBe(NPCS.length);
  });

  it('starts with one quest that anyone can take', () => {
    const log = new QuestLog();
    const first = QUESTS.filter((q) => log.status(q.id) === 'available');
    expect(first.map((q) => q.id)).toEqual([FIRST_QUEST]);
    expect(FIRST_QUEST).toBe('ms00');
    expect(log.markerFor('mirel')).toBe('offer');
  });

  it('can be finished from there, in order, by every class (a quest of another class is never offered)', () => {
    for (const c of CLASS_IDS) {
      const log = new QuestLog();
      log.classId = c;
      const order: string[] = [];
      for (let round = 0; round < QUESTS.length + 2; round++) {
        const next = QUESTS.find((q) => log.status(q.id) === 'available');
        if (!next) break;
        expect(next.class === undefined || next.class === c, `${c} offered ${next.id}`).toBe(true);
        expect(log.offeredBy(next.giver).map((q) => q.id)).toContain(next.id);
        expect(log.markerFor(next.giver)).toBe('offer');
        expect(log.accept(next.id)).toBe(true);
        doAll(log, next.id);
        expect(log.status(next.id), next.id).toBe('ready');
        expect(log.markerFor(next.turnIn)).toBe('ready');
        expect(log.complete(next.id)).toEqual(next.reward);
        order.push(next.id);
      }
      const mine = QUESTS.filter((q) => q.class === undefined || q.class === c);
      expect(order.length, c).toBe(mine.length);
      expect(log.done.size).toBe(mine.length);
      expect(log.active.size).toBe(0);
    }
  });

  it('never needs more than the log can hold, and never asks for a thing one of its own steps hands in', () => {
    for (const q of QUESTS) {
      expect(q.objectives.length).toBeLessThanOrEqual(5);
      const collected = q.objectives.filter((o) => o.kind === 'collect').flatMap((o) => (o.kind === 'collect' ? o.items : []));
      const crafted = q.objectives.filter((o) => o.kind === 'craft').flatMap((o) => (o.kind === 'craft' ? o.items : []));
      for (const id of collected) expect(crafted.includes(id), `${q.id} collects what it also crafts (${id})`).toBe(false);
    }
  });
});

describe('what only a quest makes fall', () => {
  it('points at quests that ask for the item, monsters and zones that exist', () => {
    for (const d of QUEST_DROPS) {
      const q = questById(d.quest);
      expect(q, d.quest).not.toBeNull();
      expect(q!.objectives.some((o) => o.kind === 'collect' && o.items.includes(d.item)), `${d.quest} collects ${d.item}`).toBe(true);
      expect(() => getItem(d.item)).not.toThrow();
      expect(getItem(d.item).undroppable).toBe(true);
      expect(d.chance).toBeGreaterThan(0);
      expect(d.chance).toBeLessThanOrEqual(1);
      if (d.zone) expect(zoneDef(d.zone), d.zone).not.toBeNull();
      if (d.mobs !== 'hostile') for (const m of d.mobs) expect(MOBS[m], `${d.quest} mob ${m}`).toBeDefined();
    }
  });

  it('gives every quest item a way to be had, and every item a quest collects only a way it can be got', () => {
    const given = new Set<number>();
    for (const q of QUESTS) for (const it of [...q.reward.items, ...(q.give ?? [])]) given.add(it.id);
    for (const id of QUEST_ITEMS) expect(QUEST_DROPS.some((d) => d.item === id), `item ${id} is dropped`).toBe(true);
    for (const q of QUESTS) {
      for (const o of q.objectives) {
        if (o.kind !== 'collect') continue;
        for (const id of o.items) {
          if (!QUEST_ITEMS.includes(id)) continue;
          expect(QUEST_DROPS.some((d) => d.quest === q.id && d.item === id) || given.has(id), `${q.id} collects ${id}`).toBe(true);
        }
      }
    }
  });

  it('rolls only for an active quest, only for the right monster and place, and not past what the quest wants', () => {
    const rag = QUEST_DROPS.find((d) => d.item === I.RIFT_SINGED_RAG)!;
    const always = () => 0;
    const never = () => 0.999;
    const on = (id: string) => (q: string) => q === id;
    const none = () => 0;
    const need = (): number => 1;
    const misses = new Map<string, number>();
    expect(rollQuestDrops('zombie', null, on(rag.quest), none, need, misses, always)).toEqual([I.RIFT_SINGED_RAG]);
    expect(rollQuestDrops('zombie', null, on('nothing'), none, need, misses, always)).toEqual([]);
    expect(rollQuestDrops('cow', null, on(rag.quest), none, need, misses, always)).toEqual([]);
    expect(rollQuestDrops('zombie', null, on(rag.quest), () => 1, need, misses, always)).toEqual([]);
    expect(rollQuestDrops('zombie', null, on(rag.quest), none, need, misses, never)).toEqual([]);
    // A drop of a place needs the place.
    const ember = QUEST_DROPS.find((d) => d.item === I.REED_EMBER)!;
    expect(rollQuestDrops('zombie', 'dawnwatch', on(ember.quest), none, need, new Map(), always)).toEqual([]);
    expect(rollQuestDrops('zombie', 'reed_grotto', on(ember.quest), none, need, new Map(), always)).toEqual([I.REED_EMBER]);
    expect(rollQuestDrops('cow', 'reed_grotto', on(ember.quest), none, need, new Map(), always)).toEqual([]);
  });

  it('makes a long run of bad luck end: the Embers are certain after fifteen kills', () => {
    const ember = QUEST_DROPS.find((d) => d.item === I.REED_EMBER)!;
    const misses = new Map<string, number>();
    let kills = 0;
    for (;;) {
      kills++;
      if (rollQuestDrops('zombie', 'reed_grotto', (q) => q === ember.quest, () => 0, () => 1, misses, () => 0.999).length > 0) break;
      if (kills > 100) throw new Error('no ember');
    }
    expect(kills).toBe(ember.pity);
  });
});

describe('a quest log', () => {
  it('only gives a quest once what it needs is handed in, and only once', () => {
    const log = new QuestLog();
    const second = QUESTS.find((q) => q.requires.includes(FIRST_QUEST))!;
    expect(log.status(second.id)).toBe('locked');
    expect(log.accept(second.id)).toBe(false);
    expect(log.accept(FIRST_QUEST)).toBe(true);
    expect(log.accept(FIRST_QUEST)).toBe(false);
    expect(log.complete(second.id)).toBeNull();
    expect(log.status(second.id)).toBe('locked');
    log.record({ t: 'enter', zone: 'ashbrook' });
    expect(log.status(FIRST_QUEST)).toBe('ready');
    expect(log.complete(FIRST_QUEST)).not.toBeNull();
    expect(log.complete(FIRST_QUEST)).toBeNull();
    expect(log.status(second.id)).toBe('available');
    expect(log.accept('nonsense')).toBe(false);
  });

  it('offers a class line only to its class', () => {
    const w = played('warrior', 4);
    const m = played('mage', 4);
    const none = played(null, 4);
    expect(w.status('cl_w1')).toBe('available');
    expect(w.status('cl_m1')).toBe('locked');
    expect(m.status('cl_m1')).toBe('available');
    expect(m.status('cl_w1')).toBe('locked');
    expect(none.status('cl_w1')).toBe('locked');
    expect(w.accept('cl_m1')).toBe(false);
    expect(w.offeredBy('garrick').map((q) => q.id)).toContain('cl_w1');
    expect(m.offeredBy('garrick').map((q) => q.id)).not.toContain('cl_w1');
    // The class travels with a copy of the log.
    const copy = new QuestLog();
    copy.loadJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(copy.classId).toBe('warrior');
    expect(copy.status('cl_w1')).toBe('available');
  });

  it('counts a kill, a craft or a mined block only towards a quest that asks for it, and not past its count', () => {
    const log = new QuestLog();
    const watch = QUESTS.find((q) => q.id === 'ms04')!;
    const o = watch.objectives.find((x) => x.kind === 'kill') as Extract<Objective, { kind: 'kill' }>;
    for (const r of ['ms00', 'ms01', 'ms02', 'ms03']) finish(log, r);
    expect(log.accept(watch.id)).toBe(true);
    expect(log.record({ t: 'mine', block: 1 })).toEqual([]);
    expect(log.record({ t: 'kill', mob: 'bat' })).toEqual([]);
    const moved = log.record({ t: 'kill', mob: o.mobs[0] });
    expect(moved.length).toBe(1);
    expect(moved[0].now).toBe(1);
    expect(moved[0].count).toBe(o.count);
    for (let i = 0; i < o.count + 5; i++) log.record({ t: 'kill', mob: o.mobs[0] });
    expect(log.progressOf(watch.id)[watch.objectives.indexOf(o)]).toBe(o.count);
  });

  it('follows what you carry for a "collect" step, down as well as up, and counts it done only while you have it', () => {
    const log = new QuestLog();
    const q = QUESTS.find((x) => x.id === 'ms04')!;
    const o = q.objectives.find((x) => x.kind === 'collect') as Extract<Objective, { kind: 'collect' }>;
    for (const r of q.requires) finishChain(log, r);
    expect(log.accept(q.id)).toBe(true);
    const i = q.objectives.indexOf(o);
    expect(log.sync(() => 1).length).toBe(1);
    expect(log.progressOf(q.id)[i]).toBe(Math.min(1, o.count));
    log.sync(() => 0);
    expect(log.progressOf(q.id)[i]).toBe(0);
    log.sync(() => o.count + 10);
    expect(log.progressOf(q.id)[i]).toBe(o.count);
    expect(log.sync(() => o.count + 10)).toEqual([]);
  });

  it('can give a quest up and take it again', () => {
    const log = new QuestLog();
    log.accept(FIRST_QUEST);
    expect(log.abandon(FIRST_QUEST)).toBe(true);
    expect(log.abandon(FIRST_QUEST)).toBe(false);
    expect(log.status(FIRST_QUEST)).toBe('available');
  });

  it('marks the people with business: a quest to give, one to hand in, one waited on', () => {
    const log = new QuestLog();
    expect(log.markerFor('mirel')).toBe('offer');
    expect(log.markerFor('edda')).toBeNull();
    expect(log.markerFor('brannoc')).toBeNull();
    log.accept(FIRST_QUEST);
    expect(log.markerFor('mirel')).toBeNull();
    expect(log.markerFor('edda')).toBe('waiting');
    log.record({ t: 'enter', zone: 'ashbrook' });
    expect(log.markerFor('edda')).toBe('ready');
    log.complete(FIRST_QUEST);
    expect(log.markerFor('edda')).toBe('offer');
    const next = log.offeredBy('edda')[0];
    log.accept(next.id);
    expect(['waiting', 'ready']).toContain(log.markerFor(next.turnIn));
  });

  it('saves and loads, and throws away what it does not know', () => {
    const log = played('mage', 3);
    const next = QUESTS.find((q) => log.status(q.id) === 'available')!;
    log.accept(next.id);
    const json = JSON.parse(JSON.stringify(log.toJSON()));
    const copy = new QuestLog();
    copy.loadJSON(json);
    expect([...copy.done]).toEqual([...log.done]);
    expect([...copy.active]).toEqual([...log.active]);
    expect(copy.empty).toBe(false);

    const junk = new QuestLog();
    junk.loadJSON({ d: ['ms00', 'nope', 7, null], a: [['nope', [1]], 5, ['ms01', ['x', -4, 9999]], ['ms00', [1]]] });
    expect([...junk.done]).toEqual(['ms00']);
    expect(junk.active.has('ms00')).toBe(false); // done wins
    for (const [id, p] of junk.active) {
      const q = questById(id)!;
      expect(p.length).toBe(q.objectives.length);
      p.forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(q.objectives[i].count);
      });
    }
    for (const bad of [null, 3, 'x', [], { d: 5, a: 'x' }]) {
      const l = new QuestLog();
      l.loadJSON(bad);
      expect(l.empty).toBe(true);
    }
  });
});

/** Finish a quest and everything it needs before it. */
function finishChain(log: QuestLog, id: string): void {
  if (log.status(id) === 'done') return;
  for (const r of questById(id)!.requires) finishChain(log, r);
  finish(log, id);
}

describe('the first quests', () => {
  const npc = (id: string) => NPCS.find((n) => n.id === id)!;

  it('are all given and taken in Ashbrook, the small village where a character wakes: Dawnwatch is the city they are sent to later', () => {
    for (let i = 0; i <= 7; i++) {
      const q = questById('ms0' + i)!;
      for (const who of [q.giver, q.turnIn]) expect(npc(who).place, `${q.id} ${who}`).toBe('ashbrook');
    }
    expect(questById(FIRST_QUEST)!.giver).toBe('mirel');
    expect(questById(FIRST_QUEST)!.turnIn).toBe('edda');
    expect(questById(FIRST_QUEST)!.objectives).toEqual([expect.objectContaining({ kind: 'enter', zone: 'ashbrook' })]);
  });

  it('send the character to Dawnwatch with the iron pick, and the Watch asks nothing before they have been', () => {
    const iron = questById('ms08')!;
    expect(npc(iron.giver).place).toBe('ashbrook');
    expect(npc(iron.turnIn).place).toBeUndefined();
    expect(iron.objectives).toContainEqual(expect.objectContaining({ kind: 'enter', zone: 'dawnwatch' }));
    // Everybody who stands in Dawnwatch comes after: no quest of the main line that is given there can be taken before the trip.
    expect(questById('ms09')!.requires).toContain('ms08');
    const log = new QuestLog();
    finishChain(log, 'ms07');
    finishChain(log, 'ms06');
    expect(log.status('ms09')).toBe('locked');
    finishChain(log, 'ms08');
    expect(log.status('ms09')).toBe('available');
  });

  it('keep the people of Ashbrook in Ashbrook, and name its zone and the city', () => {
    for (const id of ['edda', 'mirel', 'brannoc', 'isolde', 'nell', 'wick']) expect(npc(id).place, id).toBe('ashbrook');
    for (const id of ['maren', 'varro', 'tobin', 'auctioneer']) expect(npc(id).place, id).toBeUndefined();
    expect(zoneDef('ashbrook')!.name).toBe('Ashbrook');
    expect(zoneDef('dawnwatch')!.sub).toMatch(/city/);
  });
});