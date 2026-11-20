import { RefObject, useEffect, useRef } from 'react';
import { RopePoint, easeToRest, hangRope, ropeLean, stepRope } from './hangingRope';

// The "খরচ" paper sign in the opening animation (chosen 2026-11-19, demo
// https://claude.ai/artifact/DRaaLji6qz9gANaNCzkgN3). A short rope is knotted round the tail of the "p" and holds a
// paper with a brass ring at its top. It comes into view together with the p, as if it had always been tied there,
// and swings behind as the rest of the word pushes the p to the left, then eases to hanging still.

const ROPE_LENGTH = 30; // px, from the knot on the p to the ring
const PIECES = 10;
const BANNER_WIDTH = 112; // matches w-28; the rope holds the middle of its top edge
const STEPS_PER_FRAME = 3; // small physics steps give the same swing at any frame rate
// From half a second after the p appears (about 1.65s) the sign eases back to hanging straight, and is still by
// about 1.9s, so the screen never fades into the app (at 2.0s) with the sign caught mid-swing
const SETTLE_AFTER_MS = 500;
const SETTLE_MS = 250;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const MAX_TILT = 20; // degrees: the paper never tips further than this, however fast the word moves

// Where the tail of the p ends, inside the opening screen. The p's stem sits about a fifth of the way into the
// letter; its tail ends a little more than half a letter height below the middle of the line.
function tailOf(letter: HTMLElement, screen: HTMLElement) {
  const r = letter.getBoundingClientRect(), s = screen.getBoundingClientRect();
  const size = parseFloat(getComputedStyle(letter).fontSize);
  // While the p is still growing in from its left side, its stem is the part already showing
  return { x: r.left - s.left + Math.min(r.width, letter.scrollWidth * 0.2), y: r.top - s.top + size * 1.22 };
}

const themeColour = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export default function HangingBanner({ letterRef, still }: { letterRef: RefObject<HTMLSpanElement | null>; still: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current, banner = bannerRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !banner || !ctx) return;
    const ropeDark = themeColour('--color-indigo-900', '#5E2412');
    const ropeLight = themeColour('--color-indigo-300', '#FFB083');
    let rope: RopePoint[] | null = null;
    let frame = 0, last = performance.now(), appearedAt = 0;

    const draw = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const letter = letterRef.current, screen = canvas.parentElement;
      if (!letter || !screen) { frame = requestAnimationFrame(draw); return; }

      const width = screen.clientWidth, height = screen.clientHeight, dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // The sign shows exactly as much as the p does (its fade is set by the letter's own animation)
      const shown = parseFloat(getComputedStyle(letter).opacity) || 0;
      if (shown <= 0) {
        banner.style.opacity = '0';
        frame = requestAnimationFrame(draw);
        return;
      }
      const top = tailOf(letter, screen);
      if (!appearedAt) appearedAt = now;
      if (!rope || still) rope = hangRope(top, ROPE_LENGTH, PIECES);
      else for (let i = 0; i < STEPS_PER_FRAME; i++) stepRope(rope, top, ROPE_LENGTH, dt / STEPS_PER_FRAME);
      // What is drawn: the swinging rope, blended towards hanging straight as the end draws near
      const settle = easeInOut(Math.max(0, Math.min(1, (now - appearedAt - SETTLE_AFTER_MS) / SETTLE_MS)));
      const shape = settle > 0 ? easeToRest(rope, top, ROPE_LENGTH, settle) : rope;

      // The rope: a dark core with a lighter twist on top
      ctx.globalAlpha = shown;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(shape[0].x, shape[0].y);
        for (let i = 1; i < shape.length; i++) {
          const a = shape[i - 1], b = shape[i];
          ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
        }
        const end = shape[shape.length - 1];
        ctx.lineTo(end.x, end.y);
      };
      trace(); ctx.strokeStyle = ropeDark; ctx.lineWidth = 3; ctx.setLineDash([]); ctx.stroke();
      trace(); ctx.strokeStyle = ropeLight; ctx.lineWidth = 1.4; ctx.setLineDash([2.5, 3.5]); ctx.stroke();
      ctx.setLineDash([]);
      // The knot round the tail of the p
      ctx.beginPath(); ctx.ellipse(top.x, top.y - 3, 5, 3.8, 0, 0, Math.PI * 2);
      ctx.strokeStyle = ropeDark; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.beginPath(); ctx.arc(top.x, top.y + 1.5, 3.2, 0, Math.PI * 2); ctx.fillStyle = ropeDark; ctx.fill();
      ctx.globalAlpha = 1;

      const end = shape[shape.length - 1];
      const tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, -ropeLean(shape) * 0.9));
      banner.style.opacity = String(shown);
      banner.style.transform = `translate(${end.x - BANNER_WIDTH / 2}px, ${end.y}px) rotate(${tilt}deg) scale(${0.88 + 0.12 * shown})`;

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [letterRef, still]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      <div
        ref={bannerRef}
        className="absolute left-0 top-0 w-28 pointer-events-none will-change-transform"
        style={{ opacity: 0, transformOrigin: `${BANNER_WIDTH / 2}px 0` }}
      >
        {/* A soft shadow under the paper */}
        <div className="absolute inset-x-1.5 top-3 -bottom-1.5 -z-10 rounded-lg bg-indigo-900/15 blur-md" />
        {/* The brass ring in the paper, with the rope tied once round its top */}
        <svg viewBox="0 -8 112 40" className="absolute left-0 -top-2 w-28 h-10 z-10 overflow-visible">
          <circle cx="56" cy="14" r="5" className="fill-white stroke-amber-500" strokeWidth="2.6" />
          <circle cx="56" cy="14" r="5" fill="none" className="stroke-amber-200" strokeWidth="0.9" strokeDasharray="4 20" strokeDashoffset="-2" />
          <path d="M56 -1 C56 3 56 6 56 9.6" fill="none" className="stroke-indigo-900" strokeWidth="3" strokeLinecap="round" />
          <path d="M52.6 10.4 C53.6 7.6 58.4 7.6 59.4 10.4" fill="none" className="stroke-indigo-900" strokeWidth="2.8" strokeLinecap="round" />
        </svg>
        {/* Paper with a torn bottom edge */}
        <div
          className="relative mt-1 px-2.5 pt-1.5 pb-3 text-center rounded-t-md bg-gradient-to-b from-white to-indigo-50 shadow-[inset_0_0_0_1.5px_var(--color-indigo-100)]"
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% 86%, 93% 100%, 84% 90%, 74% 100%, 63% 91%, 52% 100%, 41% 90%, 30% 100%, 19% 91%, 9% 100%, 0 88%)' }}
        >
          <div className="absolute inset-x-2 top-1.5 border-t-[1.5px] border-dashed border-indigo-200" />
          <span lang="bn" className="block mt-1 text-[32px] leading-tight font-bold text-indigo-700">খরচ</span>
        </div>
      </div>
    </>
  );
}
