import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SEED,
  BLOCKS,
  DUMMY_SPOTS,
  GameSession,
  HeadlessWorld,
  YARD,
  abilitiesOf,
  makeGenerator,
  mulberry32,
  zoneDef,
  type AbilityId,
  type AdventureWorldGenerator,
  type ClassId,
  type InputFrame,
  type Mob,
  type SessionEvent,
} from './index';

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

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

function make(classId: ClassId | null = null) {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(5), classId });
  s.finishLoading();
  if (s.cls) {
    s.cls.setModifiers([{ critChance: -1 }]);
    // A new character knows no ability: this one has read all four skill books of its class.
    for (const a of abilitiesOf(s.cls.classId)) s.cls.unlocked.add(a.id);
  }
  return s;
}

const run = (s: GameSession, seconds: number, over: Partial<InputFrame> = {}): void => {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.tick(idle(over));
};

const dummies = (s: GameSession): Mob[] => s.mobs.mobs.filter((m) => m.kind === 'dummy').sort((a, b) => a.variant - b.variant);

/** Stand `ahead` blocks in front of the middle dummy, looking at it. */
function standBefore(s: GameSession, ahead: number): void {
  const d = DUMMY_SPOTS[1];
  s.teleport(d.x, generator.hubY + 1, d.z + ahead, 0, 0);
  run(s, 0.3);
}

describe('the training yard', () => {
  it('is a named place inside the village, with three dummies on ground that can be stood on', () => {
    const stations = generator.dummyStations();
    expect(stations.length).toBe(3);
    expect(zoneDef('training_yard')).not.toBeNull();
    for (const st of stations) {
      expect(st.x).toBeGreaterThan(YARD.x0);
      expect(st.x).toBeLessThan(YARD.x1);
      expect(st.z).toBeGreaterThan(YARD.z0);
      expect(st.z).toBeLessThan(YARD.z1);
      expect(generator.zoneAt(st.x, st.y, st.z)).toBe('training_yard');
    }
    expect(generator.zoneAt(0.5, generator.hubY + 1, 0.5)).toBe('dawnwatch');
    const world = new HeadlessWorld(generator);
    for (const st of stations) {
      const x = Math.floor(st.x);
      const z = Math.floor(st.z);
      expect(BLOCKS[world.getBlock(x, Math.floor(st.y) - 1, z)].solid).toBe(true);
      expect(BLOCKS[world.getBlock(x, Math.floor(st.y), z)].solid).toBe(false);
      expect(BLOCKS[world.getBlock(x, Math.floor(st.y) + 1, z)].solid).toBe(false);
    }
  });

  it('has the gate open to the road: a walk from the road to the dummies is not blocked', () => {
    const world = new HeadlessWorld(generator);
    const x = Math.floor((YARD.x0 + YARD.x1) / 2);
    for (let z = YARD.z1; z >= YARD.z0 + 1; z--) {
      expect(BLOCKS[world.getBlock(x, generator.hubY + 1, z)].solid, `block at ${x},${z}`).toBe(false);
      expect(BLOCKS[world.getBlock(x, generator.hubY + 2, z)].solid, `block above at ${x},${z}`).toBe(false);
    }
  });

  it('puts the dummies there when a player comes near, as targets that take hits and never hit back', () => {
    const s = make();
    standBefore(s, 4);
    const ds = dummies(s);
    expect(ds.length).toBe(3);
    for (const m of ds) {
      expect(m.def.hostile).toBe(false);
      expect(m.def.ambient).toBeFalsy();
      expect(m.def.invulnerable).toBeFalsy();
      expect(m.def.melee).toBeNull();
      expect(m.body.x).toBeCloseTo(DUMMY_SPOTS[m.variant].x, 1);
      expect(m.body.z).toBeCloseTo(DUMMY_SPOTS[m.variant].z, 1);
    }
  });

  it('takes hits from a player and reports the damage and what it has taken in all', () => {
    const s = make();
    standBefore(s, 2);
    s.drainEvents();
    const m = dummies(s)[1];
    s.attackMob(m);
    const hit = (s.drainEvents() as SessionEvent[]).find((e) => e.t === 'dmg');
    expect(hit).toBeDefined();
    if (hit?.t !== 'dmg') return;
    expect(hit.amount).toBeGreaterThan(0);
    expect(hit.total).toBeCloseTo(m.maxHealth - m.health, 0);
    expect(m.health).toBeLessThan(m.maxHealth);
  });

  it('does not run away or die: it starts over when it has taken all it has, and mends when left alone', () => {
    const s = make();
    standBefore(s, 3);
    const m = dummies(s)[1];
    const x = m.body.x;
    const z = m.body.z;
    expect(s.damageMob(m.id, 400)).toBe(false);
    expect(m.fleeTimer).toBe(0);
    expect(m.health).toBe(m.maxHealth - 400);
    expect(s.damageMob(m.id, 5000)).toBe(false);
    expect(m.dead).toBe(false);
    expect(m.health).toBe(m.maxHealth);
    s.damageMob(m.id, 300);
    run(s, 0.5);
    expect(Math.hypot(m.body.x - x, m.body.z - z)).toBeLessThan(3);
    run(s, 8);
    expect(m.health).toBe(m.maxHealth);
    expect(m.body.x).toBeCloseTo(x, 1);
    expect(m.body.z).toBeCloseTo(z, 1);
  });

  it('is put back on its spot after being thrown across the yard', () => {
    const s = make();
    standBefore(s, 3);
    const m = dummies(s)[1];
    m.body.x += 3;
    m.body.z += 2;
    s.damageMob(m.id, 1);
    run(s, 3);
    expect(m.body.x).toBeCloseTo(DUMMY_SPOTS[1].x, 1);
    expect(m.body.z).toBeCloseTo(DUMMY_SPOTS[1].z, 1);
  });

  it('is not saved with the mobs of the world', () => {
    const s = make();
    standBefore(s, 3);
    expect(dummies(s).length).toBe(3);
    expect(s.mobs.toJSON(0, 0, 500).some((e) => e.kind === 'dummy')).toBe(false);
    expect(s.mobs.loadJSON([{ kind: 'dummy', x: 0, y: 80, z: 0 }])).toBe(0);
  });
});

describe('the abilities against the dummies', () => {
  const direct: Record<ClassId, AbilityId[]> = {
    warrior: ['ground_slam', 'shield_bash'],
    mage: ['fireball', 'frost_nova'],
    ranger: ['piercing_shot'],
  };
  for (const classId of ['warrior', 'mage', 'ranger'] as const) {
    for (const id of direct[classId]) {
      it(`${id} (${classId}) damages a dummy`, () => {
        const s = make(classId);
        s.addClassXp(100000);
        standBefore(s, id === 'ground_slam' || id === 'shield_bash' || id === 'frost_nova' ? 2 : 6);
        s.drainEvents();
        const m = dummies(s)[1];
        const slot = abilitiesOf(classId).find((a) => a.id === id)!.slot;
        expect(s.useAbility(slot)).toBe('cast');
        run(s, 1.5);
        expect(m.health, id).toBeLessThan(m.maxHealth);
        const hits = (s.drainEvents() as SessionEvent[]).filter((e) => e.t === 'dmg' && !e.taken);
        expect(hits.length).toBeGreaterThan(0);
      });
    }
  }
});
