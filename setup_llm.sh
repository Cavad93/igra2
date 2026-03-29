#!/bin/bash
# ══════════════════════════════════════════════════════════════════════
# setup_llm.sh — Локальный AI для игры (llama.cpp + модель)
#
# Что делает:
#   1. Устанавливает llama.cpp через Homebrew
#   2. Скачивает модель Qwen2.5-3B (свободная) или Phi-4-Mini (токен HF)
#   3. Запускает локальный AI сервер на http://localhost:11434
#
# Требования: macOS 10.15+, Homebrew (brew.sh)
# Запуск:
#   bash setup_llm.sh                        # Qwen2.5-3B (без регистрации)
#   HF_TOKEN=hf_xxx bash setup_llm.sh        # Phi-4-Mini (токен с huggingface.co)
# ══════════════════════════════════════════════════════════════════════

set -e

# ── Настройки ─────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="$SCRIPT_DIR/models"
SERVER_PORT=11434
SERVER_HOST="127.0.0.1"

# ── Выбор модели ──────────────────────────────────────────────────────
# Если передан HF_TOKEN — скачиваем Phi-4-Mini (лучше, требует токен)
# Иначе — Qwen2.5-3B-Instruct (свободная, comparable quality)
if [[ -n "$HF_TOKEN" ]]; then
  MODEL_FILE="phi4-mini-q4.gguf"
  MODEL_NAME="Phi-4-Mini-Instruct"
  MODEL_SIZE="~2.5 ГБ"
  MODEL_URL="https://huggingface.co/bartowski/Phi-4-Mini-Instruct-GGUF/resolve/main/Phi-4-Mini-Instruct-Q4_K_M.gguf"
  AUTH_HEADER="-H \"Authorization: Bearer $HF_TOKEN\""
  OLLAMA_MODEL_ID="phi4-mini"
else
  MODEL_FILE="qwen2.5-3b-q4.gguf"
  MODEL_NAME="Qwen2.5-3B-Instruct"
  MODEL_SIZE="~2.0 ГБ"
  MODEL_URL="https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf"
  AUTH_HEADER=""
  OLLAMA_MODEL_ID="qwen2.5:3b"
fi

MODEL_PATH="$MODELS_DIR/$MODEL_FILE"

# ── Цвета для вывода ───────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
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
step "Загрузка модели $MODEL_NAME"
mkdir -p "$MODELS_DIR"

if [[ -n "$HF_TOKEN" ]]; then
  echo -e "${CYAN}  Режим: Phi-4-Mini (HuggingFace токен)${NC}"
else
  echo -e "${CYAN}  Режим: Qwen2.5-3B (без токена, свободная)${NC}"
  echo -e "${CYAN}  Хочешь Phi-4-Mini? Получи бесплатный токен:${NC}"
  echo -e "${CYAN}    1. Зарегистрируйся на huggingface.co${NC}"
  echo -e "${CYAN}    2. huggingface.co/settings/tokens → New token (Read)${NC}"
  echo -e "${CYAN}    3. HF_TOKEN=hf_xxx bash setup_llm.sh${NC}"
fi

if [[ -f "$MODEL_PATH" ]]; then
  info "Модель уже скачана: $MODEL_PATH"
else
  warn "Скачиваю $MODEL_NAME ($MODEL_SIZE)..."
  warn "URL: $MODEL_URL"

  # Собираем аргументы curl
  CURL_ARGS=(-L -f --progress-bar -C -
    -A "Mozilla/5.0 (compatible; curl)"
    -H "Accept: application/octet-stream"
  )
  if [[ -n "$HF_TOKEN" ]]; then
    CURL_ARGS+=(-H "Authorization: Bearer $HF_TOKEN")
  fi
  CURL_ARGS+=("$MODEL_URL" -o "$MODEL_PATH")

  curl "${CURL_ARGS[@]}" \
    || { rm -f "$MODEL_PATH"; error "Ошибка скачивания. Проверь интернет или токен."; }

  # Проверить размер (минимум 1 ГБ)
  FILE_SIZE=$(stat -f%z "$MODEL_PATH" 2>/dev/null || stat -c%s "$MODEL_PATH" 2>/dev/null || echo 0)
  if [[ "$FILE_SIZE" -lt 1073741824 ]]; then
    rm -f "$MODEL_PATH"
    error "Файл слишком маленький (${FILE_SIZE} байт). Возможно ошибка скачивания."
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
# Сохраняем имя модели для start_llm.sh
echo "$MODEL_PATH" > "$SCRIPT_DIR/llm_model.path"

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
echo "  Модель:  $MODEL_NAME"
echo "  Сервер:  http://$SERVER_HOST:$SERVER_PORT"
echo "  Лог:     $LOG_FILE"
echo "  PID:     $SERVER_PID"
echo ""
echo "  Для остановки: bash stop_llm.sh"
echo "  Для повторного запуска: bash start_llm.sh"
echo ""
