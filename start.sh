#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

# ---------------------------------------------------------------------------
# Output helpers
#
# Every long step runs behind a spinner so the script never looks hung, but
# only when stdout is a terminal: piped to a file or a CI log, carriage-return
# animation becomes thousands of junk lines, so there each step prints once.
# ---------------------------------------------------------------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  TTY=1
  DIM=$'\033[2m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
  GREEN=$'\033[32m'; RED=$'\033[31m'; CYAN=$'\033[36m'; YELLOW=$'\033[33m'
else
  TTY=0
  DIM=''; BOLD=''; RESET=''
  GREEN=''; RED=''; CYAN=''; YELLOW=''
fi

# Braille renders as tofu without a capable font; fall back unless the
# environment advertises UTF-8.
case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in
  *[Uu][Tt][Ff]8*|*[Uu][Tt][Ff]-8*) FRAMES=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏); MARK_OK="✓"; MARK_BAD="✗"; RULE="─" ;;
  *)                                FRAMES=(- \\ \| /);              MARK_OK="+"; MARK_BAD="x"; RULE="-" ;;
esac

STEP_LOG="$(mktemp)"

show_cursor() { [ "$TTY" = 1 ] && printf '\033[?25h' || true; }

cleanup() {
  show_cursor
  printf '\n  %sShutting down tunnels%s\n' "$DIM" "$RESET"
  pkill -f 'cloudflared.*tunnel' 2>/dev/null || true
  rm -f "$STEP_LOG"
}
trap cleanup EXIT

# run_step "Label" command...  — spinner while it runs, ✓/✗ when it finishes.
# On failure the captured output is printed, so a build error is never hidden
# behind a tidy checkmark.
run_step() {
  local label="$1"; shift
  local start=$SECONDS rc=0

  if [ "$TTY" != 1 ]; then
    printf '  %s...\n' "$label"
    "$@" >"$STEP_LOG" 2>&1 || rc=$?
  else
    "$@" >"$STEP_LOG" 2>&1 &
    local pid=$! i=0
    printf '\033[?25l'
    while kill -0 "$pid" 2>/dev/null; do
      printf '\r\033[2K  %s%s%s %s' "$CYAN" "${FRAMES[i++ % ${#FRAMES[@]}]}" "$RESET" "$label"
      sleep 0.08
    done
    wait "$pid" || rc=$?
    printf '\r\033[2K'
    show_cursor
  fi

  local elapsed=$((SECONDS - start))
  if [ "$rc" -ne 0 ]; then
    printf '  %s%s%s %s\n\n' "$RED" "$MARK_BAD" "$RESET" "$label"
    sed 's/^/    /' "$STEP_LOG"
    printf '\n'
    exit "$rc"
  fi

  if [ "$elapsed" -ge 1 ]; then
    printf '  %s%s%s %-28s %s%ss%s\n' "$GREEN" "$MARK_OK" "$RESET" "$label" "$DIM" "$elapsed" "$RESET"
  else
    printf '  %s%s%s %s\n' "$GREEN" "$MARK_OK" "$RESET" "$label"
  fi
}

# A step with no work to wait on — just report the outcome.
note_ok()   { printf '  %s%s%s %-28s %s%s%s\n' "$GREEN" "$MARK_OK" "$RESET" "$1" "$DIM" "${2:-}" "$RESET"; }
note_warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$1"; }

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
IS_WINDOWS=false
if echo "$OS" | grep -qi "mingw\|msys\|cygwin"; then
  IS_WINDOWS=true
fi

if [ -f .env ]; then
  set -a
  . .env
  set +a
fi

PORT="${OTG_PORT:-7777}"
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' package.json | head -1)

printf '\n  %sOTG Code%s %sv%s%s\n' "$BOLD" "$RESET" "$DIM" "${VERSION:-?}" "$RESET"
printf '  %s%s%s\n\n' "$DIM" "$(printf "%0.s$RULE" $(seq 1 38))" "$RESET"

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
sync_deps() { pnpm install --frozen-lockfile || pnpm install; }
run_step "Dependencies" sync_deps

# macOS: clear quarantine flags on node-pty binaries (Gatekeeper blocks them)
if [ "$OS" = "darwin" ]; then
  find node_modules -path "*/node-pty/prebuilds/darwin-*" -type f \
    -exec xattr -d com.apple.provenance {} 2>/dev/null \; \
    -exec xattr -d com.apple.quarantine {} 2>/dev/null \; || true
fi

run_step "Production build" pnpm run build

# ---------------------------------------------------------------------------
# Port
# ---------------------------------------------------------------------------
FREED=false
if command -v lsof &>/dev/null; then
  if lsof -ti:"$PORT" >/dev/null 2>&1; then FREED=true; fi
  lsof -ti:"$PORT" 2>/dev/null | xargs kill 2>/dev/null || true
elif command -v ss &>/dev/null; then
  PID=$(ss -tlnp "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)
  if [ -n "$PID" ]; then FREED=true; kill "$PID" 2>/dev/null || true; fi
elif [ "$IS_WINDOWS" = true ]; then
  PID=$(netstat -ano 2>/dev/null | grep "LISTENING" | grep ":$PORT " | awk '{print $5}' | head -1)
  if [ -n "$PID" ]; then FREED=true; taskkill //F //PID "$PID" 2>/dev/null || true; fi
fi
if [ "$FREED" = true ]; then
  sleep 1
  note_ok "Port $PORT" "reclaimed"
else
  note_ok "Port $PORT" "free"
fi

# ---------------------------------------------------------------------------
# cloudflared
# ---------------------------------------------------------------------------
CF_CMD=""
if command -v cloudflared &>/dev/null; then
  CF_CMD="cloudflared"
elif [ -f "$(pwd)/.bin/cloudflared" ]; then
  CF_CMD="$(pwd)/.bin/cloudflared"
elif [ -f "$(pwd)/.bin/cloudflared.exe" ]; then
  CF_CMD="$(pwd)/.bin/cloudflared.exe"
fi

if [ -z "$CF_CMD" ]; then
  INSTALL_DIR="$(pwd)/.bin"
  mkdir -p "$INSTALL_DIR"

  fetch_cloudflared() {
    if [ "$OS" = "darwin" ]; then
      case "$ARCH" in
        arm64) CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz" ;;
        *)     CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz" ;;
      esac
      curl -sL "$CF_URL" | tar xz -C "$INSTALL_DIR"
      chmod +x "$INSTALL_DIR/cloudflared"
    elif [ "$OS" = "linux" ]; then
      case "$ARCH" in
        x86_64)        CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" ;;
        aarch64|arm64) CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64" ;;
        armv7l|armhf)  CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm" ;;
        *)             CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-386" ;;
      esac
      curl -sL -o "$INSTALL_DIR/cloudflared" "$CF_URL"
      chmod +x "$INSTALL_DIR/cloudflared"
    elif [ "$IS_WINDOWS" = true ]; then
      case "$ARCH" in
        x86_64) CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" ;;
        *)      CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-386.exe" ;;
      esac
      curl -sL -o "$INSTALL_DIR/cloudflared.exe" "$CF_URL"
    else
      return 1
    fi
  }

  if fetch_cloudflared >/dev/null 2>&1; then
    [ -f "$INSTALL_DIR/cloudflared" ] && CF_CMD="$INSTALL_DIR/cloudflared"
    [ -f "$INSTALL_DIR/cloudflared.exe" ] && CF_CMD="$INSTALL_DIR/cloudflared.exe"
  fi

  if [ -z "$CF_CMD" ]; then
    note_warn "Could not install cloudflared for $OS/$ARCH."
    printf '    %sInstall it manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/%s\n' "$DIM" "$RESET"
    printf '\n  %sStarting server without a tunnel%s\n\n' "$DIM" "$RESET"
    npx tsx server/index.ts
    exit 0
  fi
  note_ok "cloudflared" "installed to .bin/"
else
  note_ok "cloudflared" "$CF_CMD"
fi

export CLOUDFLARED_BIN="$CF_CMD"

# ---------------------------------------------------------------------------
# Run — the server takes over the output from here, including the animated
# "Generating tunnel URL" wait (that step lives in Node, not this script).
# ---------------------------------------------------------------------------
printf '\n  %sStarting server + Cloudflare tunnel%s\n' "$DIM" "$RESET"
npx tsx server/index.ts --tunnel
