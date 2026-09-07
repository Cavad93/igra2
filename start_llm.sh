#!/bin/bash
# start_llm.sh — Запустить AI сервер (модель уже скачана)
# Запуск: bash start_llm.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_PORT=11434
SERVER_HOST="127.0.0.1"
LOG_FILE="$SCRIPT_DIR/llm_server.log"

# Берём путь модели из файла сохранённого setup_llm.sh
# (поддерживает и phi4-mini и qwen2.5-3b)
if [[ -f "$SCRIPT_DIR/llm_model.path" ]]; then
  MODEL_PATH=$(cat "$SCRIPT_DIR/llm_model.path")
else
  # Fallback: ищем любой .gguf в models/
  MODEL_PATH=$(ls "$SCRIPT_DIR/models/"*.gguf 2>/dev/null | head -1)
fi

if [[ -z "$MODEL_PATH" || ! -f "$MODEL_PATH" ]]; then
  echo "Модель не найдена. Сначала запусти: bash setup_llm.sh"
  exit 1
fi

# Остановить старый процесс если есть
EXISTING_PID=$(lsof -ti tcp:$SERVER_PORT 2>/dev/null || true)
if [[ -n "$EXISTING_PID" ]]; then
  echo "Останавливаю старый сервер (PID $EXISTING_PID)..."
  kill "$EXISTING_PID" 2>/dev/null || true
  sleep 1
fi

echo "Запускаю AI сервер на http://$SERVER_HOST:$SERVER_PORT ..."

llama-server \
  --model     "$MODEL_PATH" \
  --host      "$SERVER_HOST" \
  --port      "$SERVER_PORT" \
  --ctx-size  4096 \
  --n-predict 1024 \
  --threads   $(sysctl -n hw.logicalcpu 2>/dev/null || echo 4) \
  --no-mmap \
  > "$LOG_FILE" 2>&1 &

echo $! > "$SCRIPT_DIR/llm_server.pid"
echo "Сервер запущен (PID $!). Лог: $LOG_FILE"
