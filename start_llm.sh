#!/bin/bash
# start_llm.sh — Запустить AI сервер (модель уже скачана)
# Запуск: bash start_llm.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODEL_PATH="$SCRIPT_DIR/models/phi4-mini-q4.gguf"
SERVER_PORT=11434
SERVER_HOST="127.0.0.1"
LOG_FILE="$SCRIPT_DIR/llm_server.log"

if [[ ! -f "$MODEL_PATH" ]]; then
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
