import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from '../shared/components/ErrorBoundary';
import { LanguageProvider } from '../shared/i18n';
import './index.css';
import { DialogHost } from '../shared/components/Dialog';
import { ToastHost } from '../shared/components/Toast';
import OpeningAnimation from './OpeningAnimation';
import { isNative, openOutsideLinksInBrowser } from '../shared/lib/nativeApp';
import { installErrorReports } from '../shared/lib/errorReports';
import { startCrashlytics } from '../shared/lib/crashlytics';

// Xpences is used only as the installed phone app. The website (a built copy opened in a browser)
// shows the download page instead. During development (`npm run dev`) the app runs in the browser.
const DownloadPage = lazy(() => import('../features/download/DownloadPage'));
const showApp = isNative() || import.meta.env.DEV;

openOutsideLinksInBrowser();
installErrorReports();
startCrashlytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      {showApp ? (
        <>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
          <DialogHost />
          <ToastHost />
          <OpeningAnimation />
          {isNative() && <><div className="safe-bar safe-bar-top" aria-hidden="true" /><div className="safe-bar safe-bar-bottom" aria-hidden="true" /></>}
        </>
      ) : (
        <Suspense fallback={null}>
          <DownloadPage />
        </Suspense>
      )}
    </LanguageProvider>
  </StrictMode>,
);

// The old web version installed a service worker. The website now only offers the download, so it is
// removed (with its saved files) wherever it is found: on the website, in the phone app and in dev.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    if (registrations.length === 0) return;
    await Promise.all(registrations.map(r => r.unregister()));
    await caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
    window.location.reload(); // load again, this time without the old saved copy
  }).catch(err => console.error('Could not remove the old service worker:', err));
}
