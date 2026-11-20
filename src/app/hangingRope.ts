// A short rope that hangs from a moving point (the tail of the "p" in the opening animation) and swings
// behind it, like a sign on a string. Verlet physics: each point remembers where it was, gravity pulls it down,
// and a few passes pull neighbouring points back to their fixed distance. Plain functions, so they can be tested.

export interface RopePoint { x: number; y: number; px: number; py: number }
export interface Point { x: number; y: number }

const GRAVITY = 4500; // px per second squared: strong enough that a fast-moving word only tilts the sign a little
const DAMPING = 0.975; // keeps a small swing, then lets it rest
const PASSES = 40;
const END_WEIGHT = 2.2; // the banner at the end is heavier than the rope

/** A rope of `segments` pieces hanging straight down from `top`, at rest */
export function hangRope(top: Point, length: number, segments: number): RopePoint[] {
  const piece = length / segments;
  return Array.from({ length: segments + 1 }, (_, i) => ({ x: top.x, y: top.y + i * piece, px: top.x, py: top.y + i * piece }));
}

/** Moves the rope on by `dt` seconds, with its top held at `top` (which may have moved since the last step) */
export function stepRope(points: RopePoint[], top: Point, length: number, dt: number): void {
  const piece = length / (points.length - 1);
  const first = points[0];
  first.x = first.px = top.x;
  first.y = first.py = top.y;
  for (let i = 1; i < points.length; i++) {
    const q = points[i];
    const weight = i === points.length - 1 ? END_WEIGHT : 1;
    const vx = (q.x - q.px) * DAMPING, vy = (q.y - q.py) * DAMPING;
    q.px = q.x; q.py = q.y;
    q.x += vx;
    q.y += vy + GRAVITY * weight * dt * dt;
  }
  for (let pass = 0; pass < PASSES; pass++) {
    first.x = top.x; first.y = top.y;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      const off = (d - piece) / d;
      if (i === 0) { b.x -= dx * off; b.y -= dy * off; } // the top is held, so only the lower point moves
      else { a.x += dx * off / 2; a.y += dy * off / 2; b.x -= dx * off / 2; b.y -= dy * off / 2; }
    }
  }
}

/** How far the end of the rope leans from straight down, in degrees (positive = the end is to the right) */
export function ropeLean(points: RopePoint[]): number {
  const end = points[points.length - 1];
  const before = points[Math.max(0, points.length - 3)];
  return (Math.atan2(end.x - before.x, end.y - before.y) * 180) / Math.PI;
}

/**
 * The rope as drawn while it comes to rest: `amount` 0 is where the physics put it, 1 is hanging straight down
 * from `top`. Used at the end of the opening animation, so the sign is perfectly still when the screen fades.
 */
export function easeToRest(points: RopePoint[], top: Point, length: number, amount: number): RopePoint[] {
  const k = Math.max(0, Math.min(1, amount));
  const straight = hangRope(top, length, points.length - 1);
  return points.map((p, i) => {
    const x = p.x + (straight[i].x - p.x) * k, y = p.y + (straight[i].y - p.y) * k;
    return { x, y, px: x, py: y };
  });
}
