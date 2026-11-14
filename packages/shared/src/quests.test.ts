import { describe, expect, it } from 'vitest';
import { FIRST_QUEST, MOBS, NPCS, QUESTS, QuestLog, ZONES, getItem, npcById, questById, shopOf, zoneDef, type Objective, type QuestDef } from './index';

/** Do what a quest asks, as the game would tell the log. */
function doObjective(log: QuestLog, o: Objective): void {
  switch (o.kind) {
    case 'collect':
      log.sync(() => o.count);
      return;
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

/** A log that has found Dawnwatch, which is where almost every other quest starts. */
function afterFirst(): QuestLog {
  const log = new QuestLog();
  log.accept(FIRST_QUEST);
  log.record({ t: 'enter', zone: 'dawnwatch' });
  log.complete(FIRST_QUEST);
  return log;
}

describe('the quest data', () => {
  it('has unique ids, real people, real prerequisites and real places', () => {
    const ids = new Set<string>();
    for (const q of QUESTS) {
      expect(ids.has(q.id), `duplicate ${q.id}`).toBe(false);
      ids.add(q.id);
      expect(npcById(q.giver), `${q.id} giver`).not.toBeNull();
      expect(npcById(q.turnIn), `${q.id} turn-in`).not.toBeNull();
      expect(q.name.length).toBeGreaterThan(0);
      expect(q.offer.length).toBeGreaterThan(20);
      expect(q.complete.length).toBeGreaterThan(20);
      expect(q.progress.length).toBeGreaterThan(10);
      expect(q.reward.xp).toBeGreaterThanOrEqual(0);
      for (const r of q.requires) expect(questById(r), `${q.id} requires ${r}`).not.toBeNull();
      for (const it of q.reward.items) {
        expect(() => getItem(it.id)).not.toThrow();
        expect(it.count).toBeGreaterThan(0);
      }
      for (const o of q.objectives) {
        expect(o.count).toBeGreaterThan(0);
        expect(o.label.length).toBeGreaterThan(0);
        if (o.kind === 'enter') expect(zoneDef(o.zone), `${q.id} zone`).not.toBeNull();
        if (o.kind === 'kill') for (const m of o.mobs) expect(MOBS[m], `${q.id} mob ${m}`).toBeDefined();
        if (o.kind === 'collect' || o.kind === 'craft') for (const id of o.items) expect(() => getItem(id)).not.toThrow();
      }
    }
    expect(QUESTS.length).toBeGreaterThanOrEqual(8);
    expect(ZONES.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps every NPC as the index of a mob variant, and gives each a quest to give', () => {
    expect(NPCS.length).toBeGreaterThan(0);
    expect(NPCS.length).toBeLessThan(256);
    for (const n of NPCS) expect(QUESTS.some((q) => q.giver === n.id || q.turnIn === n.id) || shopOf(n.id) !== null, `${n.id} has no business`).toBe(true);
    expect(new Set(NPCS.map((n) => n.id)).size).toBe(NPCS.length);
  });

  it('starts with one quest that anyone can take, and can be finished from there, in order', () => {
    const log = new QuestLog();
    const first = QUESTS.filter((q) => log.status(q.id) === 'available');
    expect(first.length).toBe(1);
    expect(first[0].id).toBe(FIRST_QUEST);
    const order: string[] = [];
    for (let round = 0; round < QUESTS.length + 2; round++) {
      const next = QUESTS.find((q) => log.status(q.id) === 'available');
      if (!next) break;
      expect(log.offeredBy(next.giver).map((q) => q.id)).toContain(next.id);
      expect(log.markerFor(next.giver)).toBe('offer');
      expect(log.accept(next.id)).toBe(true);
      for (const o of next.objectives) doObjective(log, o);
      expect(log.status(next.id)).toBe('ready');
      expect(log.markerFor(next.turnIn)).toBe('ready');
      expect(log.complete(next.id)).toEqual(next.reward);
      expect(log.status(next.id)).toBe('done');
      order.push(next.id);
    }
    expect(order.length).toBe(QUESTS.length);
    expect(log.done.size).toBe(QUESTS.length);
    expect(log.active.size).toBe(0);
  });
});

describe('a quest log', () => {
  const find = (id: string): QuestDef => questById(id)!;

  it('only gives a quest once what it needs is handed in, and only once', () => {
    const log = afterFirst();
    const second = QUESTS.find((q) => q.requires.includes('welcome'))!;
    expect(log.status(second.id)).toBe('locked');
    expect(log.accept(second.id)).toBe(false);
    expect(log.accept('welcome')).toBe(true);
    expect(log.accept('welcome')).toBe(false);
    expect(log.status('welcome')).toBe('ready'); // nothing to do but go and see the smith
    expect(log.status(second.id)).toBe('locked');
    expect(log.complete(second.id)).toBeNull();
    expect(log.complete('welcome')).not.toBeNull();
    expect(log.complete('welcome')).toBeNull();
    expect(log.status(second.id)).toBe('available');
    expect(log.accept('nonsense')).toBe(false);
  });

  it('counts a kill, a craft or a mined block only towards a quest that asks for it, and not past its count', () => {
    const log = afterFirst();
    log.accept('welcome');
    log.complete('welcome');
    const watch = QUESTS.find((q) => q.objectives.some((o) => o.kind === 'kill'))!;
    // Unlock everything before it, the quick way.
    const chain = (id: string): void => {
      const q = find(id);
      for (const r of q.requires) if (log.status(r) !== 'done') chain(r);
      if (log.status(id) === 'done') return;
      log.accept(id);
      for (const o of q.objectives) doObjective(log, o);
      log.complete(id);
    };
    for (const r of watch.requires) chain(r);
    expect(log.accept(watch.id)).toBe(true);
    const o = watch.objectives.find((x) => x.kind === 'kill') as Extract<Objective, { kind: 'kill' }>;
    expect(log.record({ t: 'mine', block: 1 })).toEqual([]);
    expect(log.record({ t: 'kill', mob: 'bat' })).toEqual([]);
    const moved = log.record({ t: 'kill', mob: o.mobs[0] });
    expect(moved.length).toBe(1);
    expect(moved[0].now).toBe(1);
    expect(moved[0].count).toBe(o.count);
    for (let i = 0; i < o.count + 5; i++) log.record({ t: 'kill', mob: o.mobs[0] });
    const idx = watch.objectives.indexOf(o);
    expect(log.progressOf(watch.id)[idx]).toBe(o.count);
  });

  it('follows what you carry for a "collect" step, down as well as up, and counts it done only while you have it', () => {
    const log = new QuestLog();
    const q = QUESTS.find((x) => x.objectives.some((o) => o.kind === 'collect'))!;
    const o = q.objectives.find((x) => x.kind === 'collect') as Extract<Objective, { kind: 'collect' }>;
    const chain = (id: string): void => {
      const d = find(id);
      for (const r of d.requires) if (log.status(r) !== 'done') chain(r);
      if (log.status(id) === 'done') return;
      log.accept(id);
      for (const ob of d.objectives) doObjective(log, ob);
      log.complete(id);
    };
    for (const r of q.requires) chain(r);
    expect(log.accept(q.id)).toBe(true);
    const i = q.objectives.indexOf(o);
    expect(log.sync(() => 2).length).toBe(1);
    expect(log.progressOf(q.id)[i]).toBe(Math.min(2, o.count));
    log.sync(() => 0);
    expect(log.progressOf(q.id)[i]).toBe(0);
    log.sync(() => o.count + 10);
    expect(log.progressOf(q.id)[i]).toBe(o.count);
    expect(log.sync(() => o.count + 10)).toEqual([]);
  });

  it('can give a quest up and take it again', () => {
    const log = afterFirst();
    log.accept('welcome');
    expect(log.abandon('welcome')).toBe(true);
    expect(log.abandon('welcome')).toBe(false);
    expect(log.status('welcome')).toBe('available');
  });

  it('marks the people with business: a quest to give, one to hand in, one waited on', () => {
    const log = new QuestLog();
    expect(log.markerFor('mirel')).toBe('offer');
    expect(log.markerFor('maren')).toBeNull();
    expect(log.markerFor('brannoc')).toBeNull();
    log.accept(FIRST_QUEST);
    expect(log.markerFor('mirel')).toBeNull();
    expect(log.markerFor('maren')).toBe('waiting');
    log.record({ t: 'enter', zone: 'dawnwatch' });
    expect(log.markerFor('maren')).toBe('ready');
    log.complete(FIRST_QUEST);
    expect(log.markerFor('maren')).toBe('offer');
    log.accept('welcome');
    expect(log.markerFor('brannoc')).toBe('ready');
    log.complete('welcome');
    expect(log.markerFor('brannoc')).toBe('offer');
    const next = log.offeredBy('brannoc')[0];
    log.accept(next.id);
    expect(['waiting', 'ready']).toContain(log.markerFor(next.turnIn));
  });

  it('saves and loads, and throws away what it does not know', () => {
    const log = afterFirst();
    log.accept('welcome');
    log.complete('welcome');
    const next = log.offeredBy('brannoc')[0];
    log.accept(next.id);
    const json = JSON.parse(JSON.stringify(log.toJSON()));
    const copy = new QuestLog();
    copy.loadJSON(json);
    expect([...copy.done]).toEqual([...log.done]);
    expect([...copy.active]).toEqual([...log.active]);
    expect(copy.empty).toBe(false);

    const junk = new QuestLog();
    junk.loadJSON({ d: ['welcome', 'nope', 7, null], a: [['nope', [1]], 5, ['first_timber', ['x', -4, 9999]], ['welcome', [1]]] });
    expect([...junk.done]).toEqual(['welcome']);
    expect(junk.active.has('welcome')).toBe(false); // done wins
    for (const [id, p] of junk.active) {
      const q = find(id);
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
