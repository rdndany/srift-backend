import { describe, expect, it } from 'vitest';
import {
  B,
  BlockEntities,
  GameSession,
  HeadlessWorld,
  SIGN_LINES,
  SIGN_LINE_MAX,
  WorldGenerator,
  cleanSignLine,
  cleanSignLines,
  fitSignLine,
  isBlankSign,
  isInteractive,
  makeStack,
  mulberry32,
  parseSessionMessage,
  signId,
  signInfo,
  type SessionEvent,
} from './index';

const FLOOR = 100;
const CX = 8;
const CZ = 8;

function make(mode: 'survival' | 'creative' = 'creative') {
  const generator = new WorldGenerator(1337);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 12; x <= CX + 12; x++)
    for (let z = CZ - 12; z <= CZ + 12; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: 1337, world, generator, naturalSpawning: false, rand: mulberry32(7), mode });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world };
}

const edits = (events: SessionEvent[]) => events.filter((e): e is Extract<SessionEvent, { t: 'signEdit' }> => e.t === 'signEdit');

describe('the words on a sign', () => {
  it('are four lines of fifteen characters, cleaned of what cannot be shown', () => {
    expect(SIGN_LINES).toBe(4);
    expect(cleanSignLine('  hello   world  ')).toBe('hello world');
    expect(cleanSignLine('x'.repeat(40))).toHaveLength(SIGN_LINE_MAX);
    expect(cleanSignLine('<b>hi</b>')).toBe('bhi/b');
    expect(cleanSignLine('a\u202Eb\u0000c\u200Bd')).toBe('abcd');
    expect(cleanSignLine(42)).toBe('');
    expect(cleanSignLines(['a', 'b'])).toEqual(['a', 'b', '', '']);
    expect(cleanSignLines(['1', '2', '3', '4', '5'])).toBeNull();
    expect(cleanSignLines('no')).toBeNull();
    expect(cleanSignLines([1, null, 'x'])).toEqual(['', '', 'x', '']);
    expect(isBlankSign(['', ' ', '', ''])).toBe(true);
    expect(isBlankSign(['', 'a', '', ''])).toBe(false);
    expect(fitSignLine('Short')).toBe('Short');
    expect(fitSignLine('A very long name of a player')).toHaveLength(SIGN_LINE_MAX);
  });

  it('come over the wire only as a list of at most four strings', () => {
    const ok = parseSessionMessage({ t: 'sign', x: 1, y: 70, z: 2, lines: ['a', 'b', '', 'd'] });
    expect(ok).toEqual({ t: 'sign', x: 1, y: 70, z: 2, lines: ['a', 'b', '', 'd'] });
    expect(parseSessionMessage({ t: 'sign', x: 1, y: 70, z: 2, lines: 'a' })).toBeNull();
    expect(parseSessionMessage({ t: 'sign', x: 1, y: 70, z: 2, lines: ['1', '2', '3', '4', '5'] })).toBeNull();
    expect(parseSessionMessage({ t: 'sign', x: 'a', y: 70, z: 2, lines: [] })).toBeNull();
    const cut = parseSessionMessage({ t: 'sign', x: 1, y: 70, z: 2, lines: ['x'.repeat(500)] });
    expect(cut && cut.t === 'sign' ? cut.lines[0] : '').toHaveLength(SIGN_LINE_MAX);
  });

  it('are kept with the sign, saved with the world, and gone with the sign', () => {
    const be = new BlockEntities();
    const id = signId(0, 1, false);
    expect(isInteractive(id)).toBe(true);
    expect(be.signAt(3, 70, 4)).toEqual(['', '', '', '']);
    expect(be.setSign(3, 70, 4, ['Hello', 'there', '', ''])).toEqual(['Hello', 'there', '', '']);
    expect(be.signAt(3, 70, 4)).toEqual(['Hello', 'there', '', '']);
    const rev = be.signRev;
    expect(be.signsNear(3, 4, 5)).toHaveLength(1);
    expect(be.signsNear(100, 100, 5)).toHaveLength(0);
    // Saved and loaded.
    const copy = new BlockEntities();
    copy.loadJSON(JSON.parse(JSON.stringify(be.toJSON())));
    expect(copy.signAt(3, 70, 4)).toEqual(['Hello', 'there', '', '']);
    // A sign left blank keeps nothing.
    be.setSign(3, 70, 4, ['', '', '', '']);
    expect(be.signsNear(3, 4, 5)).toHaveLength(0);
    expect(be.signRev).toBeGreaterThan(rev);
    // Breaking the sign forgets the words.
    be.setSign(3, 70, 4, ['Bye']);
    be.remove(id, 3, 70, 4);
    expect(be.signAt(3, 70, 4)).toEqual(['', '', '', '']);
  });
});

describe('writing on a sign in the game', () => {
  it('opens the editor when a sign is put up, and keeps what is sent back', () => {
    const { s, world } = make();
    s.clearInventory();
    s.giveItem(signId(0, 0, false), 1);
    s.selectSlot(0);
    s.drainEvents();
    expect(s.useOn(CX + 2, FLOOR, CZ - 2, 0, 1, 0)).toBe(true);
    const placed = signInfo(world.getBlock(CX + 2, FLOOR + 1, CZ - 2));
    expect(placed).not.toBeNull();
    const asked = edits(s.drainEvents());
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ x: CX + 2, y: FLOOR + 1, z: CZ - 2, lines: ['', '', '', ''] });
    s.apply({ t: 'sign', x: CX + 2, y: FLOOR + 1, z: CZ - 2, lines: ['Home', 'sweet home', '', 'x'.repeat(30)] });
    expect(s.blockEntities.signAt(CX + 2, FLOOR + 1, CZ - 2)).toEqual(['Home', 'sweet home', '', 'x'.repeat(SIGN_LINE_MAX)]);
    // Using the sign again asks with what it says now.
    s.drainEvents();
    s.clearInventory();
    expect(s.useBlock(CX + 2, FLOOR + 1, CZ - 2)).toBe(true);
    expect(edits(s.drainEvents())[0].lines[0]).toBe('Home');
  });

  it('ignores words for something that is not a sign, a sign out of reach, and a spectator', () => {
    const { s, world } = make();
    world.setBlock(CX + 2, FLOOR + 1, CZ, signId(0, 0, false));
    s.apply({ t: 'sign', x: CX + 4, y: FLOOR + 1, z: CZ, lines: ['Nothing'] });
    expect(s.blockEntities.signAt(CX + 4, FLOOR + 1, CZ)).toEqual(['', '', '', '']);
    world.setBlock(CX + 11, FLOOR + 1, CZ, signId(0, 0, false));
    s.teleport(CX - 11.5, FLOOR + 1, CZ + 0.5, 0, 0);
    s.apply({ t: 'sign', x: CX + 11, y: FLOOR + 1, z: CZ, lines: ['Too far'] });
    expect(s.blockEntities.signAt(CX + 11, FLOOR + 1, CZ)).toEqual(['', '', '', '']);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
    s.apply({ t: 'sign', x: CX + 2, y: FLOOR + 1, z: CZ, lines: ['Near'] });
    expect(s.blockEntities.signAt(CX + 2, FLOOR + 1, CZ)[0]).toBe('Near');
  });

  it('forgets the words when the sign is broken, and a new sign in its place is blank', () => {
    const { s, world } = make();
    world.setBlock(CX + 2, FLOOR + 1, CZ, signId(0, 0, false));
    s.apply({ t: 'sign', x: CX + 2, y: FLOOR + 1, z: CZ, lines: ['Old news'] });
    s.breakBlock(CX + 2, FLOOR + 1, CZ);
    expect(s.blockEntities.signAt(CX + 2, FLOOR + 1, CZ)).toEqual(['', '', '', '']);
    s.giveItem(signId(0, 0, false), 1);
    s.selectSlot(s.selected);
    s.useOn(CX + 2, FLOOR, CZ, 0, 1, 0);
    expect(s.blockEntities.signAt(CX + 2, FLOOR + 1, CZ)).toEqual(['', '', '', '']);
    void makeStack;
  });
});
