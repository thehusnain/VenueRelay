import { createRoot } from 'react-dom/client';
import '@fontsource/antonio/latin-400.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import './styles.css';
import './reference.css';
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js', { type: 'module', updateViaCache: 'none' })
      .then((registration) => {
        const report = () => {
          if (registration.waiting) window.dispatchEvent(new CustomEvent('rally:update-ready'));
        };
        report();
        registration.addEventListener('updatefound', () =>
          registration.installing?.addEventListener('statechange', report),
        );
      })
      .catch(() => window.dispatchEvent(new Event('rally:offline-unavailable')));
  });
}
