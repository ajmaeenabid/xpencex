import type { CapacitorConfig } from '@capacitor/cli';

// The Android app. It runs the same built app (dist/) inside the phone app, from https://localhost,
// so the AI server only needs to allow that one address (ALLOWED_ORIGINS in ai-server/wrangler.toml).
const config: CapacitorConfig = {
  // Permanent: Android and Google Play know the app by this id, and it can never change after release
  appId: 'com.xpence.app',
  appName: 'Xpences',
  webDir: 'dist',
  // Cream, like the opening screen and the opening animation, so nothing flashes white while the app starts
  backgroundColor: '#FFF4EC',
  android: {
    // Keeps the address https://localhost, which Firebase and the AI server treat as a secure origin
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // Edge to edge: the app draws under the status bar and the navigation buttons, and keeps its content
    // clear of them with the --safe-area-inset-* values this provides (see the end of src/app/index.css)
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    SocialLogin: {
      // Only Google is used; the others stay out of the app
      providers: { google: true, facebook: false, apple: false, twitter: false },
    },
  },
};

export default config;
