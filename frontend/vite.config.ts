import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Configuracion de Vite.
 *
 * Tailwind CSS v4 se integra como PLUGIN de Vite (@tailwindcss/vite) en lugar
 * de como plugin de PostCSS: es el metodo recomendado en v4 y elimina la
 * necesidad de postcss.config.js y de tailwind.config.js, porque en v4 la
 * configuracion del tema se declara desde el propio CSS (ver src/index.css).
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 0.0.0.0 para poder abrir el dev server desde otra maquina de la red
    // (util si se desarrolla contra el servidor Ubuntu de la demostracion).
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    // Sin sourcemaps en produccion: no exponemos el codigo original.
    sourcemap: false,
  },
});
