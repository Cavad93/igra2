// ai/ai_worker.js
// Выполняет HTTP-запросы к Groq (OpenAI-совместимый API) в отдельном потоке.
// Главный поток не блокируется во время ожидания ответа LLM.
//
// Протокол postMessage:
//   Получает: { id, url, apiKey, model, maxTokens, system, user }
//   Отправляет: { id, ok: true, raw } | { id, ok: false, error }

'use strict';

self.onmessage = async ({ data }) => {
  const { id, url, apiKey, model, maxTokens, system, user } = data;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user   },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      self.postMessage({ id, ok: false, error: `API ${response.status}: ${errText.slice(0, 200)}` });
      return;
    }

    const json = await response.json();
    const raw  = json.choices?.[0]?.message?.content;
    if (!raw) {
      self.postMessage({ id, ok: false, error: 'Пустой ответ от Groq' });
      return;
    }

    self.postMessage({ id, ok: true, raw });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e.name === 'AbortError' ? 'timeout (30s)' : e.message });
  } finally {
    clearTimeout(timer);
  }
};
