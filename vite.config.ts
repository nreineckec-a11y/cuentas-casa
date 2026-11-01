import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * connect-src 'self' impide que la app envíe datos a otro servidor, aunque alguna
 * dependencia lo intentara. Solo al publicar: el modo de desarrollo necesita más.
 */
const POLITICA = [
  "default-src 'self'",
  "script-src 'self'",
  // Las barras y los gráficos fijan su tamaño y color con estilos en línea.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function politicaDeSeguridad(): Plugin {
  return {
    name: 'politica-de-seguridad',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: POLITICA },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  // GitHub Pages sirve la app en /nombre-del-repositorio/.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    politicaDeSeguridad(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'tema.js'],
      manifest: {
        name: 'Cuentas de la casa',
        short_name: 'Cuentas',
        description: 'Registrar, ver y editar los ingresos y gastos de la casa.',
        lang: 'es-CL',
        display: 'standalone',
        theme_color: '#0b5cad',
        background_color: '#f4f4f0',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // El lector de Excel debe quedar disponible sin conexión.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  build: { outDir: 'dist', emptyOutDir: true },
});
