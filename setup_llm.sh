#!/bin/bash
# ══════════════════════════════════════════════════════════════════════
# setup_llm.sh — Локальный AI для игры (llama.cpp + phi4-mini)
#
# Что делает:
#   1. Устанавливает llama.cpp через Homebrew
#   2. Скачивает модель phi4-mini (~2.5 ГБ) с HuggingFace
#   3. Запускает локальный AI сервер на http://localhost:11434
#
# Требования: macOS 10.15+, Homebrew (brew.sh)
# Запуск: bash setup_llm.sh
# ══════════════════════════════════════════════════════════════════════

set -e

# ── Настройки ─────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="$SCRIPT_DIR/models"
SERVER_PORT=11434
SERVER_HOST="127.0.0.1"
MODEL_FILE="phi4-mini-q4.gguf"
MODEL_PATH="$MODELS_DIR/$MODEL_FILE"

# HuggingFace: модель phi-4-mini в формате GGUF (Q4_K_M — баланс качество/размер)
HF_REPO="bartowski/Phi-4-Mini-Instruct-GGUF"
HF_FILE="Phi-4-Mini-Instruct-Q4_K_M.gguf"
HF_URL="https://huggingface.co/${HF_REPO}/resolve/main/${HF_FILE}"

# ── Цвета для вывода ───────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }
step()    { echo -e "\n${YELLOW}══ $1 ══${NC}"; }

# ── Шаг 1: Проверить Homebrew ──────────────────────────────────────────
step "Проверка Homebrew"
if ! command -v brew &>/dev/null; then
  warn "Homebrew не найден. Устанавливаю..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Apple Silicon: добавить brew в PATH
  if [[ -f "/opt/homebrew/bin/brew" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
fi
info "Homebrew: $(brew --version | head -1)"

# ── Шаг 2: Установить llama.cpp ───────────────────────────────────────
step "Установка llama.cpp"
if command -v llama-server &>/dev/null; then
  info "llama-server уже установлен: $(llama-server --version 2>&1 | head -1)"
else
  warn "Устанавливаю llama.cpp..."
  brew install llama.cpp
  info "llama.cpp установлен"
fi

# ── Шаг 3: Скачать модель ─────────────────────────────────────────────
step "Загрузка модели phi4-mini"
mkdir -p "$MODELS_DIR"

if [[ -f "$MODEL_PATH" ]]; then
  info "Модель уже скачана: $MODEL_PATH"
else
  warn "Скачиваю $HF_FILE (~2.5 ГБ), это займёт несколько минут..."
  warn "URL: $HF_URL"

  # Скачать с прогрессом, возобновить если прервалось (-C -)
  # -f: упасть если HTTP ошибка (4xx/5xx) — иначе curl качает HTML-страницу ошибки
  # -A: User-Agent нужен HuggingFace иначе блокирует
  if command -v curl &>/dev/null; then
    curl -L -f --progress-bar -C - \
      -A "Mozilla/5.0 (compatible; curl)" \
      -H "Accept: application/octet-stream" \
      "$HF_URL" -o "$MODEL_PATH" \
      || { rm -f "$MODEL_PATH"; error "Ошибка скачивания. Проверь интернет или попробуй позже."; }
  else
    error "curl не найден. Установи: brew install curl"
  fi

  # Проверить что файл скачался (минимум 1 ГБ — модель ~2.5 ГБ)
  FILE_SIZE=$(stat -f%z "$MODEL_PATH" 2>/dev/null || stat -c%s "$MODEL_PATH" 2>/dev/null || echo 0)
  if [[ "$FILE_SIZE" -lt 1073741824 ]]; then
    rm -f "$MODEL_PATH"
    error "Файл слишком маленький (${FILE_SIZE} байт). HuggingFace вернул ошибку или редирект. Запусти скрипт ещё раз."
  fi

  info "Модель скачана: $(du -sh "$MODEL_PATH" | cut -f1)"
fi

# ── Шаг 4: Остановить старый сервер если запущен ──────────────────────
step "Запуск AI сервера"
EXISTING_PID=$(lsof -ti tcp:$SERVER_PORT 2>/dev/null || true)
if [[ -n "$EXISTING_PID" ]]; then
  warn "Порт $SERVER_PORT занят (PID $EXISTING_PID) — останавливаю..."
  kill "$EXISTING_PID" 2>/dev/null || true
  sleep 1
fi

# ── Шаг 5: Запустить llama-server ─────────────────────────────────────
LOG_FILE="$SCRIPT_DIR/llm_server.log"

llama-server \
  --model        "$MODEL_PATH" \
  --host         "$SERVER_HOST" \
  --port         "$SERVER_PORT" \
  --ctx-size     4096 \
  --n-predict    1024 \
  --threads      $(sysctl -n hw.logicalcpu 2>/dev/null || echo 4) \
  --no-mmap \
  > "$LOG_FILE" 2>&1 &

SERVER_PID=$!
echo "$SERVER_PID" > "$SCRIPT_DIR/llm_server.pid"

# Подождать пока сервер запустится (до 30 сек)
warn "Жду запуска сервера (PID $SERVER_PID)..."
for i in $(seq 1 30); do
  sleep 1
  if curl -s "http://$SERVER_HOST:$SERVER_PORT/health" &>/dev/null; then
    info "Сервер запущен на http://$SERVER_HOST:$SERVER_PORT"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    error "Сервер упал. Смотри лог: $LOG_FILE"
  fi
  if [[ $i -eq 30 ]]; then
    warn "Сервер запускается дольше обычного. Проверь: $LOG_FILE"
  fi
done

# ── Готово ────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Локальный AI готов к работе!${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo "  Сервер:  http://$SERVER_HOST:$SERVER_PORT"
echo "  Модель:  $MODEL_FILE"
echo "  Лог:     $LOG_FILE"
echo "  PID:     $SERVER_PID"
echo ""
echo "  Для остановки: bash stop_llm.sh"
echo "  Для повторного запуска: bash start_llm.sh"
echo ""
