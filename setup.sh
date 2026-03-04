#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
PYTHON_BIN=""
REQUIRED_PYTHON_VERSION="3.12.12"
REQUIRED_OPENAI_VERSION="1.46.0"
REQUIRED_HTTPX_VERSION="0.27.2"

log() {
  printf '[setup] %s\n' "$1"
}

require_cmd() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf '[setup] Missing required command: %s\n' "$cmd" >&2
    printf '[setup] %s\n' "$hint" >&2
    exit 1
  fi
}

copy_if_missing() {
  local source_file="$1"
  local target_file="$2"
  if [[ -f "$target_file" ]]; then
    log "Keeping existing $(basename "$target_file")"
    return
  fi
  cp "$source_file" "$target_file"
  log "Created $(basename "$target_file") from $(basename "$source_file")"
}

require_cmd "python3" "Install Python 3.12.12 and re-run this script."
require_cmd "npm" "Install Node.js (includes npm) and re-run this script."

if command -v python3.12 >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python3.12)"
elif command -v python3 >/dev/null 2>&1; then
  DETECTED_PYTHON="$(command -v python3)"
  DETECTED_PYTHON_VERSION="$("$DETECTED_PYTHON" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
  if [[ "$DETECTED_PYTHON_VERSION" == "3.12" ]]; then
    PYTHON_BIN="$DETECTED_PYTHON"
  fi
fi

if [[ -z "$PYTHON_BIN" ]]; then
  printf '[setup] Python %s is required for this project.\n' "$REQUIRED_PYTHON_VERSION" >&2
  printf '[setup] Install python3.12.12 and rerun setup.\n' >&2
  exit 1
fi

DETECTED_PYTHON_VERSION="$("$PYTHON_BIN" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")')"
if [[ "$DETECTED_PYTHON_VERSION" != "$REQUIRED_PYTHON_VERSION" ]]; then
  printf '[setup] Detected Python %s at %s.\n' "$DETECTED_PYTHON_VERSION" "$PYTHON_BIN" >&2
  printf '[setup] Python %s is required.\n' "$REQUIRED_PYTHON_VERSION" >&2
  exit 1
fi

log "Using Python $DETECTED_PYTHON_VERSION at $PYTHON_BIN"

if [[ ! -f "$BACKEND_DIR/requirements.txt" || ! -f "$FRONTEND_DIR/package.json" ]]; then
  printf '[setup] Run this script from the project root.\n' >&2
  exit 1
fi

copy_if_missing "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
copy_if_missing "$FRONTEND_DIR/.env.local.example" "$FRONTEND_DIR/.env.local"

if [[ ! -d "$BACKEND_DIR/.venv" ]]; then
  log "Creating backend virtual environment (.venv)"
  "$PYTHON_BIN" -m venv "$BACKEND_DIR/.venv"
else
  log "Using existing backend virtual environment (.venv)"
fi

VENV_PYTHON_VERSION="$("$BACKEND_DIR/.venv/bin/python" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")')"
if [[ "$VENV_PYTHON_VERSION" != "$REQUIRED_PYTHON_VERSION" ]]; then
  printf '[setup] backend/.venv is using Python %s, but %s is required.\n' "$VENV_PYTHON_VERSION" "$REQUIRED_PYTHON_VERSION" >&2
  printf '[setup] Remove it and rerun: rm -rf backend/.venv && bash setup.sh\n' >&2
  exit 1
fi

log "Installing backend dependencies"
PIP_DISABLE_PIP_VERSION_CHECK=1 "$BACKEND_DIR/.venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt"

INSTALLED_OPENAI_VERSION="$("$BACKEND_DIR/.venv/bin/python" -c 'import importlib.metadata as m; print(m.version("openai"))')"
INSTALLED_HTTPX_VERSION="$("$BACKEND_DIR/.venv/bin/python" -c 'import importlib.metadata as m; print(m.version("httpx"))')"
if [[ "$INSTALLED_OPENAI_VERSION" != "$REQUIRED_OPENAI_VERSION" ]]; then
  printf '[setup] Installed openai=%s, but openai=%s is required.\n' "$INSTALLED_OPENAI_VERSION" "$REQUIRED_OPENAI_VERSION" >&2
  exit 1
fi
if [[ "$INSTALLED_HTTPX_VERSION" != "$REQUIRED_HTTPX_VERSION" ]]; then
  printf '[setup] Installed httpx=%s, but httpx=%s is required.\n' "$INSTALLED_HTTPX_VERSION" "$REQUIRED_HTTPX_VERSION" >&2
  exit 1
fi
log "Verified backend package versions: openai=$INSTALLED_OPENAI_VERSION, httpx=$INSTALLED_HTTPX_VERSION"

log "Installing frontend dependencies"
(cd "$FRONTEND_DIR" && npm install)

cat <<'EOF'

[setup] Setup complete.

Run backend:
  cd backend
  source .venv/bin/activate
  uvicorn app.main:app --reload --port 8000

Run frontend (new terminal):
  cd frontend
  npm run dev

Use:
  Frontend: http://localhost:3000
  Backend:  http://localhost:8000
EOF
