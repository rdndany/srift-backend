import { describe, expect, it } from 'vitest';
import { B } from '@solrift/shared';
import { blockInfoText } from './blockInfo';

describe('the block panel', () => {
  it('names the block, where it is and how it behaves', () => {
    const lines = blockInfoText(12, 64, -5, B.GRASS, 'Plains').split('\n');
    expect(lines[0]).toBe(`grass  #${B.GRASS}`);
    expect(lines[1]).toBe('12 64 -5  Plains');
    expect(lines[2]).toContain('solid');
    expect(lines[3]).toContain('hardness');
  });

  it('says so for bedrock and for an id nobody made', () => {
    expect(blockInfoText(0, 0, 0, B.BEDROCK)).toContain('unbreakable');
    expect(blockInfoText(0, 0, 0, 999999)).toContain('unknown block');
  });
});
