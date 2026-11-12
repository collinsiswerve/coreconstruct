import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./preview', import.meta.url)),
  base: './',
  plugins: [react()],
  css: { postcss: fileURLToPath(new URL('.', import.meta.url)) },
  build: {
    outDir: fileURLToPath(new URL('./dist/pages-demo', import.meta.url)),
    emptyOutDir: true,
  },
});
