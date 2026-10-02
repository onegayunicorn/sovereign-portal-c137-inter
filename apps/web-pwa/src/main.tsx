import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

/**
 * Sovereign Portal C-137 — PWA entry point.
 * Mounts the HUD, registers the hardened range-request service worker and
 * announces runtime capabilities (WebGPU / COOP-COEP isolation) in the console.
 */

const container = document.getElementById('root');

if (!container) {
  throw new Error('[Portal C-137] #root container is missing from index.html.');
}

const root = createRoot(container);

root.render(
  React.createElement(React.StrictMode, null, React.createElement(App)),
);

/* ------------------------------------------------------- service worker --- */

async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    console.info('[Portal C-137] Service workers unavailable — offline mode disabled.');
    return;
  }
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
    console.info('[Portal C-137] Service worker requires HTTPS (or localhost). Skipping registration.');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    console.info('[Portal C-137] Service worker registered. Offline range-cache active.');
  } catch (error) {
    console.warn('[Portal C-137] Service worker registration failed.', error);
  }
}

/* ------------------------------------------------------- boot telemetry --- */

function reportCapabilities(): void {
  const crossOriginIsolated = typeof window.crossOriginIsolated === 'boolean' ? window.crossOriginIsolated : false;
  const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const sharedMemory = typeof SharedArrayBuffer !== 'undefined';

  console.info(
    [
      'Sovereign Portal C-137 // Twin Portal',
      `  WebGPU: ${webgpu ? 'available' : 'unavailable (WebGL2 shader path in use)'}`,
      `  Cross-origin isolated (COOP/COEP): ${crossOriginIsolated ? 'yes' : 'no'}`,
      `  SharedArrayBuffer: ${sharedMemory ? 'available' : 'unavailable'}`,
    ].join('\n'),
  );
}

window.addEventListener('load', () => {
  reportCapabilities();
  void registerServiceWorker();
});

export { root };
