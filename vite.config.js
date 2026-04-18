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
          // Крупные UI-вкладки — отдельные чанки (существовавшие)
          if (id.includes('ui/diplomacy_tab')) return 'diplomacy';
          if (id.includes('ui/population_tab')) return 'population';
          if (id.includes('ui/economy_react')) return 'economy_ui';

          // Тактический бой — свой чанк (существовавший)
          if (id.includes('engine/tactical_battle') ||
              id.includes('ui/tactical_map') ||
              id.includes('ui/battle_map_pixi')) return 'tactical';

          // Движок: engine-econ — экономика и базовые сущности
          if (id.includes('/engine/economy.js') ||
              id.includes('/engine/economy_ext.js') ||
              id.includes('/engine/market.js') ||
              id.includes('/engine/storage.js') ||
              id.includes('/engine/loans.js') ||
              id.includes('/engine/land_capacity.js') ||
              id.includes('/engine/buildings.js') ||
              id.includes('/engine/pops.js') ||
              id.includes('/engine/demography.js') ||
              id.includes('/engine/age_demographics.js') ||
              id.includes('/engine/forests.js') ||
              id.includes('/engine/roads.js') ||
              id.includes('/engine/rivers.js') ||
              id.includes('/engine/noise.js') ||
              id.includes('/engine/culture.js') ||
              id.includes('/engine/religion.js') ||
              id.includes('/engine/provinces.js')) return 'engine-econ';

          // engine-dip — дипломатия и связанные подсистемы
          if (id.includes('/engine/diplomacy.js') ||
              id.includes('/engine/diplomacy_range.js') ||
              id.includes('/engine/treaty_effects.js') ||
              id.includes('/engine/treaty_validator.js') ||
              id.includes('/engine/espionage.js') ||
              id.includes('/engine/conspiracy.js') ||
              id.includes('/engine/dialogue.js')) return 'engine-dip';

          // engine-war — стратегический бой, армии, осады
          if (id.includes('/engine/armies.js') ||
              id.includes('/engine/battalion.js') ||
              id.includes('/engine/battle.js') ||
              id.includes('/engine/combat.js') ||
              id.includes('/engine/siege.js') ||
              id.includes('/engine/fortifications.js') ||
              id.includes('/engine/fortress.js') ||
              id.includes('/engine/war_score.js') ||
              id.includes('/engine/victory.js')) return 'engine-war';

          // Session 25 (perf): разбили бывший engine-ai (520 kB) на три
          // логических чанка. Мотивация: super_ou + government + senate
          // — это редко меняющиеся "политические" подсистемы, грузятся
          // вместе с главным бандлом только из-за общего чанка. Вынос
          // сокращает путь критического рендера первого кадра.

          // engine-gov — правительство, сенат, конституционные реформы.
          if (id.includes('/engine/government.js') ||
              id.includes('/engine/senate.js') ||
              id.includes('/engine/constitutional.js')) return 'engine-gov';

          // engine-chars — персонажи (династии, биографии), super_ou, memory.
          if (id.includes('/engine/characters_ai.js') ||
              id.includes('/engine/characters_lifecycle.js') ||
              id.includes('/engine/super_ou.js') ||
              id.includes('/engine/memory.js')) return 'engine-chars';

          // engine-ai — AI-решения (ai_worker, fallback, scoring) + LLM-мост ai/*.
          if (id.includes('/engine/ai_worker.js') ||
              id.includes('/engine/ai_fallback.js') ||
              id.includes('/engine/ai_scoring.js') ||
              id.includes('/ai/')) return 'engine-ai';

          // engine-core — тик хода, инициализация, сохранение
          if (id.includes('/engine/turn.js') ||
              id.includes('/engine/init.js') ||
              id.includes('/engine/date.js') ||
              id.includes('/engine/save.js') ||
              id.includes('/engine/save_worker.js') ||
              id.includes('/engine/idb_storage.js') ||
              id.includes('/engine/events.js') ||
              id.includes('/engine/orders.js') ||
              id.includes('/engine/achievements.js')) return 'engine-core';

          // Большие статические данные — отдельные чанки,
          // чтобы не раздувать главный index
          if (id.includes('/data/map.js') ||
              id.includes('/data/region_centroids.js') ||
              id.includes('/data/nation_geo.js') ||
              id.includes('/data/region_areas.js') ||
              id.includes('/data/deposit_map.js')) return 'data-map';

          if (id.includes('/data/nations.js') ||
              id.includes('/data/nation_enriched.js') ||
              id.includes('/data/chains_data.js') ||
              id.includes('/data/pdf_chains.js') ||
              id.includes('/data/buildings.js') ||
              id.includes('/data/biomes.js')) return 'data-nations';
        },
      },
    },
  },
  server: {
    open: '/index.html',
    hmr: true,
  },
});
