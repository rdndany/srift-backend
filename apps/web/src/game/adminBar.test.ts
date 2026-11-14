import { describe, expect, it } from 'vitest';
import { FrameMeter, short } from './adminBar';

describe('FrameMeter', () => {
  it('has nothing to say before the first frame', () => {
    expect(new FrameMeter().summary()).toEqual({ fps: 0, frame: 0, worst: 0, low: 0 });
  });

  it('reads a steady 60 frames a second', () => {
    const m = new FrameMeter();
    for (let i = 0; i < 300; i++) m.push(1000 / 60);
    const s = m.summary();
    expect(s.fps).toBeCloseTo(60, 0);
    expect(s.frame).toBeCloseTo(16.67, 1);
    expect(s.worst).toBeCloseTo(16.67, 1);
    expect(s.low).toBeCloseTo(60, 0);
    expect(m.length).toBe(240);
  });

  it('shows a hitch in the worst frame and the 1% low, and barely in the mean', () => {
    const m = new FrameMeter();
    for (let i = 0; i < 200; i++) m.push(i % 40 === 0 ? 80 : 16);
    const s = m.summary();
    expect(s.worst).toBe(80);
    expect(s.low).toBeCloseTo(12.5, 1);
    expect(s.fps).toBeGreaterThan(50);
  });

  it('forgets a hitch from more than a second ago in the worst frame, and keeps the newest frame first', () => {
    const m = new FrameMeter();
    m.push(200);
    for (let i = 0; i < 100; i++) m.push(16);
    m.push(20);
    expect(m.ago(0)).toBe(20);
    expect(m.ago(1)).toBe(16);
    expect(m.summary().worst).toBe(20);
  });

  it('measures the last second only when the frames are slow', () => {
    const m = new FrameMeter();
    for (let i = 0; i < 100; i++) m.push(10);
    for (let i = 0; i < 10; i++) m.push(100);
    expect(m.summary().fps).toBeCloseTo(10, 5);
  });
});

describe('short', () => {
  it('writes big counts in thousands and millions', () => {
    expect(short(412)).toBe('412');
    expect(short(1234)).toBe('1.2k');
    expect(short(48200)).toBe('48k');
    expect(short(1234567)).toBe('1.23M');
  });
});
