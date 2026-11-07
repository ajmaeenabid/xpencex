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
