import { describe, expect, it } from 'vitest';
import { warmText } from './textWarm';

describe('text warm-up', () => {
  it('finishes without a document, and stays finished', () => {
    expect(warmText(1)).toBe(true);
    expect(warmText(1)).toBe(true);
  });
});
