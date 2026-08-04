/**
 * main.tsx — Punto de montaje de React sobre el <div id="root"> de index.html.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('No se encontro el elemento #root en index.html');
}

createRoot(container).render(
  // StrictMode solo actua en desarrollo: monta y desmonta los componentes dos
  // veces para destapar efectos mal limpiados (por ejemplo, un setInterval de
  // polling sin su clearInterval). En el build de produccion no hace nada.
  <StrictMode>
    <App />
  </StrictMode>
);
