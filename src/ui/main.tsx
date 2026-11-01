import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './index.css';

// Deja la app disponible sin conexión y la actualiza sola al publicar una versión nueva.
registerSW({ immediate: true });

createRoot(document.getElementById('raiz') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
