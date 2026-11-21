import { describe, expect, it } from 'vitest';
import { B } from '@solrift/shared';
import { NO_DUNGEON, dungeonDepth, heartLevel, hostileThreat, scanSurroundings } from './dungeonAmbience';
import { AMBIENT_NAMES, TRIM } from './dungeonSounds';
import { BOSS_SOUND_NAMES, bossLoudness } from './bossSounds';

describe('how deep the dungeon is', () => {
  it('is nothing at the camp and everything at the boss\'s floor, and stays between', () => {
    expect(dungeonDepth(150, 150)).toBe(0);
    expect(dungeonDepth(160, 150)).toBe(0);
    expect(dungeonDepth(78, 150)).toBe(1);
    expect(dungeonDepth(20, 150)).toBe(1);
    expect(dungeonDepth(114, 150)).toBeCloseTo(0.5, 5);
  });
});

describe('the heart', () => {
  it('beats for hostile things that are near, more the nearer they are, and not for ones far off', () => {
    expect(hostileThreat([])).toBe(0);
    expect(hostileThreat([{ dist: 30 }])).toBe(0);
    expect(hostileThreat([{ dist: 3 }])).toBe(1);
    const mid = hostileThreat([{ dist: 14 }]);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    expect(hostileThreat([{ dist: 14 }, { dist: 12 }, { dist: 10 }])).toBeGreaterThan(mid);
    expect(hostileThreat([{ dist: 2 }, { dist: 2 }, { dist: 2 }, { dist: 2 }])).toBeLessThanOrEqual(1);
  });

  it('beats for low health, from four tenths down, and for nothing when well', () => {
    expect(heartLevel(0, 1)).toBe(0);
    expect(heartLevel(0, 0.4)).toBe(0);
    expect(heartLevel(0, 0.25)).toBeGreaterThan(0.3);
    expect(heartLevel(0, 0.05)).toBe(1);
    expect(heartLevel(1, 1)).toBeCloseTo(0.9, 5);
    expect(heartLevel(0.5, 0.05)).toBe(1);
  });
});

describe('what the player is standing near', () => {
  const world = (at: (x: number, y: number, z: number) => number) => at;
  it('finds lava, water and amethyst within reach, and nothing in bare rock', () => {
    const rock = scanSurroundings(world(() => B.STONE), 0, 0, 0);
    expect(rock).toEqual({ lava: 0, water: 0, amethyst: 0 });
    const lava = scanSurroundings(world((x, y) => (y < 0 ? B.LAVA : B.STONE)), 0, 0, 0, 800);
    expect(lava.lava).toBeGreaterThan(0.9);
    expect(lava.water).toBe(0);
    const wet = scanSurroundings(world((x) => (x > 0 ? B.WATER : B.AIR)), 0, 0, 0, 800);
    expect(wet.water).toBeGreaterThan(0.5);
    const geode = scanSurroundings(world((x, y, z) => (Math.abs(x) + Math.abs(y) + Math.abs(z) > 3 ? B.AMETHYST_BLOCK : B.AIR)), 0, 0, 0, 800);
    expect(geode.amethyst).toBeGreaterThan(0.9);
  });

  it('does not feel lava that is farther than twelve blocks away', () => {
    const far = scanSurroundings(world((x) => (x > 13 ? B.LAVA : B.AIR)), 0, 0, 0, 800);
    expect(far.lava).toBe(0);
  });
});

describe('the sounds that are named', () => {
  it('have a loudness each, and the boss ones a way to be played by name', () => {
    for (const n of AMBIENT_NAMES) expect(TRIM[n]).toBeGreaterThan(0);
    expect(new Set(BOSS_SOUND_NAMES).size).toBe(BOSS_SOUND_NAMES.length);
    for (const spell of ['slam', 'pillars', 'court', 'rain', 'unbound']) {
      expect(BOSS_SOUND_NAMES).toContain(`cast_${spell}`);
      expect(BOSS_SOUND_NAMES).toContain(`release_${spell}`);
    }
    for (const n of ['wake', 'yell', 'phase2', 'phase3', 'step', 'swing', 'grunt', 'down']) expect(BOSS_SOUND_NAMES).toContain(n);
    expect(NO_DUNGEON.active).toBe(false);
  });

  it('are loud by the king and fainter far away, and the big ones are heard everywhere in the copy', () => {
    for (const what of ['step', 'swing', 'cast', 'release', 'wake', 'phase', 'down'] as const) {
      expect(bossLoudness(what, 0).vol).toBe(1);
      expect(bossLoudness(what, 0).far).toBe(0);
      expect(bossLoudness(what, 20).vol).toBeLessThan(1);
      expect(bossLoudness(what, 20).vol).toBeGreaterThan(bossLoudness(what, 40).vol);
      expect(bossLoudness(what, 40).far).toBeGreaterThan(bossLoudness(what, 20).far);
    }
    // His stride is lost in the dark; his roar and his fall are not.
    expect(bossLoudness('step', 200).vol).toBe(0);
    expect(bossLoudness('swing', 200).vol).toBe(0);
    expect(bossLoudness('wake', 500).vol).toBeGreaterThanOrEqual(0.3);
    expect(bossLoudness('phase', 500).vol).toBeGreaterThanOrEqual(0.3);
    expect(bossLoudness('down', 500).vol).toBeGreaterThanOrEqual(0.3);
    expect(bossLoudness('cast', 500).vol).toBeGreaterThan(0);
    expect(bossLoudness('release', 500).vol).toBeGreaterThan(0);
  });
});
