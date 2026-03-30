/**
 * chronicle.js — Система Хронист
 * Каждые 50 ходов анализирует мир и генерирует живые события через Sonnet.
 */

export const ChronicleSystem = {
  INTERVAL:      50,   // каждые N ходов
  MAX_EVENTS:    5,    // событий за вызов
  MAX_TOKENS:    600,  // лимит ответа Sonnet
  EFFECT_RADIUS: 6,    // хопов для региональных эффектов

  /** Сбор метаданных мира без LLM */
  collectSnapshot(gameState) {},

  /** Формирование промпта для Sonnet */
  buildPrompt(snapshot) {},

  /** Парсинг ответа Sonnet */
  parseEvents(raw, gameState) {},

  /** Применить игровые эффекты событий */
  applyEffects(events, gameState) {},

  /** Главная функция — вызывается каждые INTERVAL ходов */
  async generate(gameState) {},
};

export default ChronicleSystem;

// Браузерный доступ для non-module скриптов
if (typeof window !== 'undefined') {
  window.ChronicleSystem = ChronicleSystem;
}
