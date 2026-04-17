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
    minify: true,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('ui/diplomacy_tab')) return 'diplomacy';
          if (id.includes('ui/population_tab')) return 'population';
          if (id.includes('ui/economy_react')) return 'economy_ui';
          if (id.includes('engine/tactical_battle') ||
              id.includes('ui/tactical_map') ||
              id.includes('ui/battle_map_pixi')) return 'tactical';
        },
      },
    },
  },
  server: {
    open: '/index.html',
    hmr: true,
  },
});
