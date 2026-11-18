import { describe, expect, it } from 'vitest';
import { swipeDirection } from './swipe';

describe('swipeDirection', () => {
  it('reads a clear sideways swipe', () => {
    expect(swipeDirection(-120, 10, 300)).toBe('left');
    expect(swipeDirection(90, -15, 400)).toBe('right');
  });

  it('counts a quick short flick', () => {
    expect(swipeDirection(-40, 5, 150)).toBe('left');
    expect(swipeDirection(-40, 5, 600)).toBeNull();
  });

  it('leaves scrolling, taps and slanted drags alone', () => {
    expect(swipeDirection(30, 300, 300)).toBeNull(); // scrolling the messages
    expect(swipeDirection(4, 2, 80)).toBeNull(); // a tap
    expect(swipeDirection(-80, -70, 300)).toBeNull(); // more diagonal than sideways
  });
});
