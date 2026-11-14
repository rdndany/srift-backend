import { describe, expect, it } from 'vitest';
import {
  MAX_GUILD_MEMBERS,
  cleanGuildName,
  cleanGuildTag,
  disbandError,
  doLeader,
  doRank,
  guildNameError,
  inviteError,
  kickError,
  leaderError,
  leaveError,
  memberOf,
  motdError,
  parseGuild,
  rankError,
  type GuildData,
} from './index';

const guild = (): GuildData => ({
  id: 'g1',
  name: 'Dawn Riders',
  tag: 'DAWN',
  motd: '',
  members: [
    { key: 'boss', name: 'Boss', rank: 0 },
    { key: 'off', name: 'Off', rank: 1 },
    { key: 'mem', name: 'Mem', rank: 2 },
  ],
});

describe('guild names', () => {
  it('are cleaned and checked', () => {
    expect(cleanGuildName("  Dawn   Riders!! <b> ")).toBe('Dawn Riders b');
    expect(cleanGuildTag('da-wn1x')).toBe('DAWN');
    expect(guildNameError('Dawn Riders', 'DAWN')).toBeNull();
    expect(guildNameError('Ab', 'DAWN')).toContain('at least 3');
    expect(guildNameError('Dawn', 'D')).toContain('tag');
    expect(guildNameError('- -', 'DAWN')).toContain('letters or digits');
  });
});

describe('the rules of a guild', () => {
  it('lets officers and the leader invite, up to the size limit', () => {
    const g = guild();
    expect(inviteError(g, 'boss')).toBeNull();
    expect(inviteError(g, 'off')).toBeNull();
    expect(inviteError(g, 'mem')).toContain('officers');
    expect(inviteError(g, 'stranger')).toContain('officers');
    while (g.members.length < MAX_GUILD_MEMBERS) g.members.push({ key: `k${g.members.length}`, name: 'x', rank: 2 });
    expect(inviteError(g, 'boss')).toBe('The guild is full.');
  });

  it('lets you remove only those who rank below you', () => {
    const g = guild();
    expect(kickError(g, 'boss', 'off')).toBeNull();
    expect(kickError(g, 'boss', 'mem')).toBeNull();
    expect(kickError(g, 'off', 'mem')).toBeNull();
    expect(kickError(g, 'off', 'boss')).toContain('below you');
    expect(kickError(g, 'off', 'off')).toContain('leave');
    expect(kickError(g, 'mem', 'off')).toContain('Only officers');
    expect(kickError(g, 'boss', 'ghost')).toContain('not in the guild');
  });

  it('has the leader alone change ranks, and never the leader', () => {
    const g = guild();
    expect(rankError(g, 'boss', 'mem', true)).toBeNull();
    expect(rankError(g, 'off', 'mem', true)).toContain('Only the guild leader');
    expect(rankError(g, 'boss', 'off', true)).toContain('already an officer');
    expect(rankError(g, 'boss', 'mem', false)).toContain('plain member');
    expect(rankError(g, 'boss', 'boss', false)).toContain('cannot be moved');
    doRank(g, 'mem', true);
    expect(memberOf(g, 'mem')?.rank).toBe(1);
    doRank(g, 'mem', false);
    expect(memberOf(g, 'mem')?.rank).toBe(2);
  });

  it('hands the guild over, and the old leader stays as an officer', () => {
    const g = guild();
    expect(leaderError(g, 'off', 'mem')).toContain('Only the guild leader');
    expect(leaderError(g, 'boss', 'boss')).toContain('already');
    expect(leaderError(g, 'boss', 'mem')).toBeNull();
    doLeader(g, 'boss', 'mem');
    expect(g.members.map((m) => [m.key, m.rank])).toEqual([
      ['boss', 1],
      ['off', 1],
      ['mem', 0],
    ]);
  });

  it('does not let a leader walk away from a guild that has members', () => {
    const g = guild();
    expect(leaveError(g, 'boss')).toContain('Hand over');
    expect(leaveError(g, 'mem')).toBeNull();
    expect(leaveError(g, 'ghost')).toContain('not in a guild');
    g.members = [g.members[0]];
    expect(leaveError(g, 'boss')).toBeNull();
  });

  it('lets officers set the message and only the leader disband', () => {
    const g = guild();
    expect(motdError(g, 'off')).toBeNull();
    expect(motdError(g, 'mem')).toContain('officers');
    expect(disbandError(g, 'boss')).toBeNull();
    expect(disbandError(g, 'off')).toContain('leader');
  });
});

describe('keeping a guild', () => {
  it('reads back what was kept', () => {
    const g = guild();
    expect(parseGuild(JSON.parse(JSON.stringify(g)))).toEqual(g);
  });

  it('mends a guild with two leaders or none, and drops nonsense', () => {
    const two = guild();
    two.members[1].rank = 0;
    expect(parseGuild(two)!.members.map((m) => m.rank)).toEqual([0, 1, 2]);
    const none = guild();
    none.members[0].rank = 2;
    expect(parseGuild(none)!.members[0].rank).toBe(0);
    expect(parseGuild(null)).toBeNull();
    expect(parseGuild({ id: 'g', name: 'Ok Name', tag: 'OK', members: [] })).toBeNull();
    expect(parseGuild({ ...guild(), name: '!!' })).toBeNull();
    const dup = parseGuild({ ...guild(), members: [{ key: 'a', name: 'A', rank: 0 }, { key: 'a', name: 'B', rank: 1 }, 5, { key: '', name: 'x' }] });
    expect(dup!.members).toHaveLength(1);
  });
});
