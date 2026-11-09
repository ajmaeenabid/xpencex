// Makes every app icon from the one logo in src/shared/brand/logoSvg.ts: `npm run icons`
// Renders with Microsoft Edge (already on Windows), so nothing extra needs installing.
// Run it again after any change to the logo, then `npm run android:release` for a new app file.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logoSvg } from '../src/shared/brand/logoSvg.ts';

const root = join(import.meta.dirname, '..');
const res = join(root, 'android', 'app', 'src', 'main', 'res');
const SPLASH_BG = '#FFF4EC'; // cream, the app's light background

const edge = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find(existsSync);
if (!edge) {
  console.error('Microsoft Edge or Google Chrome is needed to draw the icons, and neither was found.');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'xpencex-icons-'));

/** Draw one PNG: w x h pixels, the logo `logoPx` wide in the middle, on `bg` (transparent if not given). */
function render(out, w, h, logo, logoPx = Math.min(w, h), bg = 'transparent') {
  const page = join(tmp, 'icon.html');
  writeFileSync(
    page,
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${bg}}
body{display:flex;align-items:center;justify-content:center}svg{display:block}</style>${logoSvg({ ...logo, size: logoPx })}`,
  );
  const r = spawnSync(edge, [
    '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--default-background-color=00000000', `--window-size=${w},${h}`, `--screenshot=${out}`,
    `--user-data-dir=${join(tmp, 'profile')}`, `file:///${page.replace(/\\/g, '/')}`,
  ]);
  const png = existsSync(out) ? readFileSync(out) : null;
  if (r.status !== 0 || !png || png.readUInt32BE(16) !== w || png.readUInt32BE(20) !== h) {
    console.error(`Could not draw ${out}`);
    process.exit(1);
  }
  console.log(`✔ ${out.slice(root.length + 1)} (${w}x${h})`);
}

// Web app and download page
render(join(root, 'public', 'icon-192.png'), 192, 192, { frame: 'rounded' });
render(join(root, 'public', 'icon-512.png'), 512, 512, { frame: 'rounded' });
render(join(root, 'public', 'icon-maskable-512.png'), 512, 512, { frame: 'square', wallet: 0.8 });
render(join(root, 'public', 'apple-touch-icon.png'), 180, 180, { frame: 'square', wallet: 0.9 });

// Android launcher icons. Newer phones build the icon from two layers: the peach gradient
// (drawable/ic_launcher_gradient.xml) and the wallet alone, kept inside the middle 61% so no phone cuts it off.
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, d] of Object.entries(densities)) {
  const dir = join(res, `mipmap-${name}`);
  render(join(dir, 'ic_launcher.png'), 48 * d, 48 * d, { frame: 'rounded' });
  render(join(dir, 'ic_launcher_round.png'), 48 * d, 48 * d, { frame: 'circle', wallet: 0.9 });
  render(join(dir, 'ic_launcher_foreground.png'), 108 * d, 108 * d, { frame: 'none', wallet: 0.66 });
}

// Opening screen (older Android versions): the logo in the middle of a cream screen
const splashes = {
  drawable: [480, 320],
  'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920],
};
for (const [dir, [w, h]] of Object.entries(splashes)) {
  render(join(res, dir, 'splash.png'), w, h, { frame: 'rounded' }, Math.round(Math.min(w, h) * 0.3), SPLASH_BG);
}

rmSync(tmp, { recursive: true, force: true });
console.log('\nAll icons are made. For the phone app, run: npm run android:release');
