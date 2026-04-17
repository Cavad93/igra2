import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@engine': resolve(__dirname, 'engine'),
      '@ui':     resolve(__dirname, 'ui'),
      '@data':   resolve(__dirname, 'data'),
      '@ai':     resolve(__dirname, 'ai'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    open: '/index.html',
    hmr: true,
  },
});
