import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
    assetsInlineLimit: 0, // keep images as separate files
  },
  server: { port: 5173, open: false },
  preview: { port: 4173 },
});
