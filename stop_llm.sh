#!/bin/bash
# stop_llm.sh — Остановить AI сервер
# Запуск: bash stop_llm.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/llm_server.pid"
SERVER_PORT=11434

if [[ -f "$PID_FILE" ]]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "AI сервер остановлен (PID $PID)"
  else
    echo "Процесс $PID уже не запущен"
  fi
  rm -f "$PID_FILE"
else
  # Попробовать найти по порту
  PID=$(lsof -ti tcp:$SERVER_PORT 2>/dev/null || true)
  if [[ -n "$PID" ]]; then
    kill "$PID"
    echo "AI сервер остановлен (PID $PID)"
  else
    echo "AI сервер не запущен"
  fi
fi
