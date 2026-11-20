// The app's Content Security Policy (security review item 5, added at the USB session on 2026-11-20).
// It goes into the built index.html only (vite.config.ts), so it covers the phone app and the website;
// `npm run dev` runs without it, because Vite's development tools and Google's browser sign-in script need more.
// It is a second wall: if harmful code ever slipped into the page, it couldn't load scripts from elsewhere
// or send data anywhere but these addresses.

export interface CspPlaces {
  aiServer?: string; // VITE_AI_WORKER_URL, e.g. https://xpensex-ai.xpence.workers.dev
  authDomain: string; // Firebase sign-in helper pages (firebase-config.json)
  site: string; // the download site, where the update notice reads version.json
}

export function appCsp({ aiServer, authDomain, site }: CspPlaces): string {
  const ai = aiServer ? new URL(aiServer) : null;
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // blob: the live chat's microphone code is made inside the app (src/features/chat/liveSession.ts)
    // apis.google.com: Firebase sign-in loads its helper from there (Firebase's own CSP advice; seen on the phone)
    'script-src': ["'self'", 'blob:', 'https://apis.google.com'],
    // Inline styles: the opening screen and many components set style=""; Google Fonts for Hind Siliguri
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    // blob: receipt photos; googleusercontent: Google profile pictures
    'img-src': ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
    'media-src': ["'self'", 'data:', 'blob:'],
    'connect-src': [
      "'self'",
      ...(ai ? [ai.origin, `wss://${ai.host}`] : []), // the AI server, and live chat's connection
      'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', // Firebase sign-in
      'https://firestore.googleapis.com', // the database
      'https://www.googleapis.com', 'https://sheets.googleapis.com', // Drive backups and Sheets exports
      new URL(site).origin, // the update notice
    ],
    'frame-src': ["'self'", `https://${authDomain}`],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
  return Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}
