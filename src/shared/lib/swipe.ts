// Sideways swipes on touch screens (the chat's "Chats | Agent space" switch). Plain rules first, so they can be tested.
import { useRef } from 'react';

/** How far (px) a finger must travel sideways, and how much more sideways than up or down, to count */
export const SWIPE_MIN_DISTANCE = 60;
const SIDEWAYS_RATIO = 1.5;
/** A quick flick counts sooner */
const FLICK_MS = 250;
const FLICK_MIN_DISTANCE = 35;
/** Android's back gesture starts at the screen edges, so swipes starting there are left to it */
export const EDGE_PX = 24;

/** 'left' or 'right' for a real sideways swipe, null for a scroll, a tap or a small wobble */
export function swipeDirection(dx: number, dy: number, ms: number): 'left' | 'right' | null {
  const distance = Math.abs(dx);
  if (distance < Math.abs(dy) * SIDEWAYS_RATIO) return null;
  const enough = distance >= SWIPE_MIN_DISTANCE || (ms <= FLICK_MS && distance >= FLICK_MIN_DISTANCE);
  if (!enough) return null;
  return dx < 0 ? 'left' : 'right';
}

/** How far the finger must move (px) before a drag counts as sideways or as a scroll */
export const DRAG_LOCK_PX = 10;

/** Which way a finger drag is going, once it has moved far enough to tell; null while still unsure */
export function dragAxis(dx: number, dy: number): 'x' | 'y' | null {
  if (Math.abs(dx) >= DRAG_LOCK_PX && Math.abs(dx) > Math.abs(dy) * SIDEWAYS_RATIO) return 'x';
  if (Math.abs(dy) >= DRAG_LOCK_PX) return 'y';
  return null;
}

/**
 * Where a two-page slider (src/shared/components/SidePager.tsx) settles when the finger lifts: the other page
 * after a real swipe or once dragged over a third of the way, otherwise back where it was.
 */
export function pagerTarget(side: 0 | 1, dx: number, dy: number, ms: number, width: number): 0 | 1 {
  const direction = swipeDirection(dx, dy, ms) ?? (Math.abs(dx) > width / 3 ? (dx < 0 ? 'left' : 'right') : null);
  if (direction === 'left') return 1;
  if (direction === 'right') return 0;
  return side;
}

/** The page's sideways position while dragging: it follows the finger, with resistance past either end */
export function pagerOffset(side: 0 | 1, dx: number, width: number): number {
  const at = -side * width + dx;
  if (at > 0) return at * 0.3;
  if (at < -width) return -width + (at + width) * 0.3;
  return at;
}

/** Whether a swipe that starts on this element belongs to something else: typing, or a row that scrolls sideways */
export function ownsSideways(start: EventTarget | null, stopAt: Element | null): boolean {
  let el = start instanceof Element ? start : null;
  while (el && el !== stopAt) {
    if (el.matches('input, textarea, select, [contenteditable="true"], [data-no-swipe]')) return true;
    const overflowX = getComputedStyle(el).overflowX;
    if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Touch handlers for an area: calls onSwipe('left' | 'right') after a sideways swipe.
 * Mouse and pen are ignored, so it only acts in the phone app and on touch screens.
 */
export function useSwipe(onSwipe: (direction: 'left' | 'right') => void, enabled = true) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      start.current = null;
      if (!enabled || e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (touch.clientX < EDGE_PX || touch.clientX > window.innerWidth - EDGE_PX) return;
      if (ownsSideways(e.target, e.currentTarget)) return;
      start.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const from = start.current;
      start.current = null;
      if (!from || !enabled) return;
      const touch = e.changedTouches[0];
      const direction = swipeDirection(touch.clientX - from.x, touch.clientY - from.y, Date.now() - from.t);
      // Someone selecting text isn't switching screens
      if (direction && !window.getSelection()?.toString()) onSwipe(direction);
    },
    onTouchCancel: () => { start.current = null; },
  };
}
