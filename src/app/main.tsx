import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from '../shared/components/ErrorBoundary';
import { LanguageProvider } from '../shared/i18n';
import './index.css';
import { DialogHost } from '../shared/components/Dialog';
import { ToastHost } from '../shared/components/Toast';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <DialogHost />
      <ToastHost />
    </LanguageProvider>
  </StrictMode>,
);

// Only in production builds: a service worker in dev would serve stale modules
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.error('Service worker registration failed:', err));
  });
}

// In dev, remove a service worker left over from running the built app (`vite preview`) on the same
// address. It keeps every file it saw, so after the first load the browser would get old code.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    if (registrations.length === 0) return;
    await Promise.all(registrations.map(r => r.unregister()));
    await caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
    window.location.reload(); // load again, this time straight from the dev server
  }).catch(err => console.error('Could not remove the old service worker:', err));
}
