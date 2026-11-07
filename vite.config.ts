import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
import {defineConfig, type Plugin} from 'vite';

/**
 * Fills in public/sw.js after a build: the list of every built file, so the service worker saves
 * them all when it installs, and a version name that changes whenever any file changes.
 */
function swPrecache(): Plugin {
  let outDir = 'dist';
  let files: string[] = [];
  return {
    name: 'xpencex-sw-precache',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    generateBundle(_options, bundle) {
      files = Object.keys(bundle).filter((f) => f.startsWith('assets/') && !f.endsWith('.map')).sort().map((f) => `/${f}`);
    },
    closeBundle() {
      const swPath = path.join(outDir, 'sw.js');
      if (!fs.existsSync(swPath)) return;
      const version = createHash('sha256').update(files.join(',')).digest('hex').slice(0, 12);
      let sw = fs.readFileSync(swPath, 'utf8');
      const fill = (placeholder: string, value: string) => {
        if (!sw.includes(placeholder)) throw new Error(`sw.js no longer contains: ${placeholder}`);
        sw = sw.replace(placeholder, value);
      };
      fill("const VERSION = 'dev';", `const VERSION = '${version}';`);
      fill('const BUILD_FILES = [];', `const BUILD_FILES = ${JSON.stringify(files)};`);
      fs.writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), swPrecache()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Big libraries in files of their own: they rarely change, so after an app update the phone
          // keeps them and only downloads the app's own code again
          manualChunks: {
            react: ['react', 'react-dom', 'react-dom/client'],
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
