#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

# Clean up all cloudflared tunnels on exit (Ctrl+C, kill, etc.)
cleanup() {
  echo ""
  echo "  Shutting down tunnels..."
  pkill -f 'cloudflared.*tunnel' 2>/dev/null || true
  echo "  Done."
}
trap cleanup EXIT

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
IS_WINDOWS=false
if echo "$OS" | grep -qi "mingw\|msys\|cygwin"; then
  IS_WINDOWS=true
fi

# Load .env
if [ -f .env ]; then
  set -a
  . .env
  set +a
fi

PORT="${OTG_PORT:-7777}"

echo ""
echo "  OTG Code - On-The-Go Code"
echo "  =========================="
echo ""

# Always sync dependencies (fast no-op if already up to date)
echo "  Syncing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
echo ""

# macOS: clear quarantine flags on node-pty binaries (Gatekeeper blocks them)
if [ "$OS" = "darwin" ]; then
  find node_modules -path "*/node-pty/prebuilds/darwin-*" -type f \
    -exec xattr -d com.apple.provenance {} 2>/dev/null \; \
    -exec xattr -d com.apple.quarantine {} 2>/dev/null \; || true
fi

# Build
echo "  Building for production..."
pnpm run build
echo ""

# Kill any existing process on our port
if command -v lsof &>/dev/null; then
  lsof -ti:"$PORT" 2>/dev/null | xargs kill 2>/dev/null || true
elif command -v ss &>/dev/null; then
  # Linux without lsof
  PID=$(ss -tlnp "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)
  [ -n "$PID" ] && kill "$PID" 2>/dev/null || true
elif [ "$IS_WINDOWS" = true ]; then
  PID=$(netstat -ano 2>/dev/null | grep "LISTENING" | grep ":$PORT " | awk '{print $5}' | head -1)
  [ -n "$PID" ] && taskkill //F //PID "$PID" 2>/dev/null || true
fi
sleep 1

# Resolve cloudflared binary — check PATH, then local .bin/
CF_CMD=""
if command -v cloudflared &>/dev/null; then
  CF_CMD="cloudflared"
elif [ -f "$(pwd)/.bin/cloudflared" ]; then
  CF_CMD="$(pwd)/.bin/cloudflared"
elif [ -f "$(pwd)/.bin/cloudflared.exe" ]; then
  CF_CMD="$(pwd)/.bin/cloudflared.exe"
fi

# Install cloudflared locally if not found
if [ -z "$CF_CMD" ]; then
  echo "  Installing cloudflared..."
  INSTALL_DIR="$(pwd)/.bin"
  mkdir -p "$INSTALL_DIR"

  if [ "$OS" = "darwin" ]; then
    case "$ARCH" in
      arm64) CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz" ;;
      *)     CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz" ;;
    esac
    curl -sL "$CF_URL" | tar xz -C "$INSTALL_DIR"
    chmod +x "$INSTALL_DIR/cloudflared"
    CF_CMD="$INSTALL_DIR/cloudflared"

  elif [ "$OS" = "linux" ]; then
    case "$ARCH" in
      x86_64)          CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" ;;
      aarch64|arm64)   CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64" ;;
      armv7l|armhf)    CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm" ;;
      *)               CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-386" ;;
    esac
    curl -sL -o "$INSTALL_DIR/cloudflared" "$CF_URL"
    chmod +x "$INSTALL_DIR/cloudflared"
    CF_CMD="$INSTALL_DIR/cloudflared"

  elif [ "$IS_WINDOWS" = true ]; then
    case "$ARCH" in
      x86_64) CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" ;;
      *)      CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-386.exe" ;;
    esac
    curl -sL -o "$INSTALL_DIR/cloudflared.exe" "$CF_URL"
    CF_CMD="$INSTALL_DIR/cloudflared.exe"

  else
    echo "  Could not detect OS. Please install cloudflared manually:"
    echo "  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    echo ""
    echo "  Starting server without tunnel..."
    echo ""
    npx tsx server/index.ts
    exit 0
  fi
  echo ""
fi

# Export resolved path so Node can find it
export CLOUDFLARED_BIN="$CF_CMD"

# Start server with Cloudflare quick tunnel
echo "  Starting server + Cloudflare tunnel..."
echo ""
npx tsx server/index.ts --tunnel
