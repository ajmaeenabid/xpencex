import { describe, expect, it } from 'vitest';
import { easeToRest, hangRope, ropeLean, stepRope } from './hangingRope';

// The same small steps as the opening animation: three per 60 Hz frame
const DT = 1 / 180;
const run = (seconds: number, step: () => void) => { for (let i = 0; i < seconds / DT; i++) step(); };

describe('hanging rope', () => {
  it('stays still when its top does not move', () => {
    const top = { x: 100, y: 50 };
    const rope = hangRope(top, 30, 10);
    run(1, () => stepRope(rope, top, 30, DT));
    const end = rope[rope.length - 1];
    expect(end.x).toBeCloseTo(100, 3);
    expect(end.y).toBeCloseTo(80, 0);
  });

  it('trails behind when its top slides left, then settles back', () => {
    const top = { x: 200, y: 50 };
    const rope = hangRope(top, 30, 10);
    let most = 0;
    run(0.6, () => { top.x -= 1.5; stepRope(rope, top, 30, DT); most = Math.max(most, ropeLean(rope)); });
    expect(most).toBeGreaterThan(5); // the banner swings out to the right while the word moves left
    run(4, () => stepRope(rope, top, 30, DT));
    expect(Math.abs(ropeLean(rope))).toBeLessThan(1);
  });

  it('eases from its swing to hanging straight, without moving its top', () => {
    const top = { x: 200, y: 50 };
    const rope = hangRope(top, 30, 10);
    run(0.3, () => { top.x -= 1.5; stepRope(rope, top, 30, DT); });
    expect(Math.abs(ropeLean(rope))).toBeGreaterThan(3); // still swinging
    expect(easeToRest(rope, top, 30, 0)[10].x).toBeCloseTo(rope[10].x, 6);
    const half = easeToRest(rope, top, 30, 0.5);
    expect(Math.abs(ropeLean(half))).toBeLessThan(Math.abs(ropeLean(rope)));
    const rest = easeToRest(rope, top, 30, 1);
    expect(ropeLean(rest)).toBeCloseTo(0, 6);
    expect(rest[0]).toMatchObject({ x: top.x, y: top.y });
    expect(rest[10].y).toBeCloseTo(80, 6);
  });

  it('keeps its length while swinging', () => {
    const top = { x: 200, y: 50 };
    const rope = hangRope(top, 30, 10);
    run(0.5, () => { top.x -= 2; stepRope(rope, top, 30, DT); });
    const length = rope.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - rope[i].x, p.y - rope[i].y), 0);
    expect(length).toBeGreaterThan(29);
    expect(length).toBeLessThan(31.5);
  });
});
