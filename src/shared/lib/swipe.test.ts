import { describe, expect, it } from 'vitest';
import { dragAxis, pagerOffset, pagerTarget, swipeDirection } from './swipe';

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

describe('the two-page slider', () => {
  it('waits until the finger has clearly gone sideways or up and down', () => {
    expect(dragAxis(4, 2)).toBeNull();
    expect(dragAxis(20, 5)).toBe('x');
    expect(dragAxis(12, 30)).toBe('y');
    expect(dragAxis(15, 12)).toBe('y'); // not sideways enough to be a slide
  });

  it('follows the finger, with resistance past either end', () => {
    expect(pagerOffset(0, -100, 400)).toBe(-100);
    expect(pagerOffset(1, 100, 400)).toBe(-300);
    expect(pagerOffset(0, 100, 400)).toBe(30); // nothing to the left of the first page
    expect(pagerOffset(1, -100, 400)).toBe(-430); // nothing to the right of the second
  });

  it('moves on a swipe or a long drag, and snaps back on a short one', () => {
    expect(pagerTarget(0, -80, 5, 400, 400)).toBe(1); // a real swipe left
    expect(pagerTarget(1, 80, 5, 400, 400)).toBe(0); // a real swipe right
    expect(pagerTarget(0, -40, 5, 600, 400)).toBe(0); // slow and short: back
    expect(pagerTarget(0, -150, 120, 900, 400)).toBe(1); // slow but over a third of the way
    expect(pagerTarget(1, -80, 5, 400, 400)).toBe(1); // already on the last page
  });
});
