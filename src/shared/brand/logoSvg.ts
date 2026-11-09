// The Xpences logo: a white bifold leather wallet with a winking face and a taka sign,
// on the app's peach to rose background. Every icon is drawn from this one file:
// the sign-in screen uses it directly, and `npm run icons` renders all PNG icons from it.

/** How the background is cut: a rounded box, a full square (the system rounds it), a circle, or none (wallet only). */
export type LogoFrame = 'rounded' | 'square' | 'circle' | 'none';

export interface LogoOptions {
  frame?: LogoFrame;
  /** Size of the wallet compared with the normal logo, e.g. 0.66 to fit inside Android's safe zone */
  wallet?: number;
  /** Width and height in pixels; leave out to let the SVG fill its box */
  size?: number;
  /** For the opening animation: the right eye opens and winks again, then the taka sign hops (starts winking, like the icon) */
  animated?: boolean;
}

// Times match the opening animation (src/app/OpeningAnimation.tsx). Off when the phone asks for less motion.
const ANIMATION_CSS = `<style>
@media (prefers-reduced-motion: no-preference) {
.xl-open{opacity:0;animation:xl-open .55s .3s both}
.xl-shut{animation:xl-shut .55s .3s both}
.xl-taka{transform-box:fill-box;transform-origin:50% 100%;animation:xl-hop .5s .75s both}
}
@keyframes xl-open{0%,100%{opacity:0}15%,85%{opacity:1}}
@keyframes xl-shut{0%,100%{opacity:1}15%,85%{opacity:0}}
@keyframes xl-hop{0%,100%{transform:translateY(0)}45%{transform:translateY(-7px) rotate(-12deg)}70%{transform:translateY(1px)}}
</style>`;

// Colours from the theme in src/app/index.css (indigo-* = peach, purple-* = rose)
const PEACH_300 = '#FFB083';
const PEACH_600 = '#E8602B';
const PEACH_900 = '#5E2412';
const ROSE_500 = '#EE5578';

// Shapes on a 100 x 100 grid. The wallet's fold is on the left; its open edge (layers and a card) on the right.
const LEAF = 'M27 23 H77 Q82 23 82 28 V69 Q82 74 77 74 H27 Q15 74 15 62 V35 Q15 23 27 23 Z';
const SPINE = 'M27 23 H30 V74 H27 Q15 74 15 62 V35 Q15 23 27 23 Z';

export function logoSvg({ frame = 'rounded', wallet = 1, size, animated = false }: LogoOptions = {}): string {
  const box =
    frame === 'rounded' ? '<rect width="100" height="100" rx="22" fill="url(#xl-bg)"/>'
    : frame === 'square' ? '<rect width="100" height="100" fill="url(#xl-bg)"/>'
    : frame === 'circle' ? '<circle cx="50" cy="50" r="50" fill="url(#xl-bg)"/>'
    : '';
  const s = 1.02 * wallet;
  const dims = size ? ` width="${size}" height="${size}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${dims}>
<defs>
<linearGradient id="xl-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PEACH_300}"/><stop offset="1" stop-color="${ROSE_500}"/></linearGradient>
<linearGradient id="xl-fold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${PEACH_900}" stop-opacity=".22"/><stop offset="1" stop-color="${PEACH_900}" stop-opacity="0"/></linearGradient>
</defs>
${animated ? ANIMATION_CSS : ''}
${box}
<g transform="translate(50 50) scale(${s}) translate(-50 -50)">
<path d="${LEAF}" fill="${PEACH_600}" transform="translate(2.6 3.4)"/>
<path d="${LEAF}" fill="${PEACH_300}" transform="translate(1.3 1.7)"/>
<path d="${LEAF}" fill="#FFFFFF"/>
<path d="${SPINE}" fill="url(#xl-fold)"/>
<path d="M30 25.4 H74" stroke="${PEACH_300}" stroke-width="1.5" stroke-linecap="round" opacity=".35"/>
<text class="xl-taka" x="72" y="66" text-anchor="middle" font-family="'Nirmala UI','Noto Sans Bengali','Noto Sans',sans-serif" font-weight="800" font-size="10" fill="${PEACH_600}" opacity=".9">&#2547;</text>
<circle cx="41" cy="45" r="4.4" fill="${PEACH_900}"/>
${animated ? `<circle class="xl-open" cx="58" cy="45" r="4.4" fill="${PEACH_900}"/>` : ''}
<path class="xl-shut" d="M52 45.5 Q58 40 64 45.5" fill="none" stroke="${PEACH_900}" stroke-width="4" stroke-linecap="round"/>
<path d="M40 54 Q50.5 64 61 54" fill="none" stroke="${PEACH_900}" stroke-width="4.4" stroke-linecap="round"/>
</g>
</svg>`;
}

/** The logo as an image address, for <img src>. */
export const logoDataUri = (opts?: LogoOptions) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg(opts))}`;
