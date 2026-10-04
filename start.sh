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

# The server starts its own tunnel after it is listening and stops it on
# SIGINT/SIGTERM, which it receives with us from the foreground process group.
# A `pkill -f cloudflared` here killed tunnels this script never started —
# other projects', other users' — on any shared machine.
cleanup() {
  show_cursor
  rm -f "$STEP_LOG" "$STEP_LOG.deps"
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
    # STEP_SOFT lets the caller print advice of its own before giving up.
    [ "${STEP_SOFT:-0}" = 1 ] && return "$rc"
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

die() { printf '  %s%s%s %s\n\n' "$RED" "$MARK_BAD" "$RESET" "$1"; shift; printf '%b' "$@"; printf '\n'; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# Supported: Linux, macOS, and Windows through WSL2. Git Bash and MSYS get far
# enough to look like they work and then fail on the native module, so stop here
# rather than halfway through a build.
case "$OS" in
  mingw*|msys*|cygwin*)
    die "Native Windows is not supported." \
      "  Run OTG Code inside WSL2: ${CYAN}https://learn.microsoft.com/windows/wsl/install${RESET}\n" \
      "  ${DIM}Install Node and pnpm inside WSL2 — not the Windows ones — and clone into\n" \
      "  the WSL filesystem rather than /mnt/c.${RESET}\n" ;;
esac

have node || die "Node.js is not installed." "  ${DIM}OTG Code needs Node 20 or newer: https://nodejs.org${RESET}\n"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
[ "$NODE_MAJOR" -ge 20 ] 2>/dev/null || die "Node $(node -v 2>/dev/null) is too old." "  ${DIM}OTG Code needs Node 20 or newer.${RESET}\n"
have pnpm || die "pnpm is not installed." "  ${DIM}Install it with: npm install -g pnpm${RESET}  ${DIM}(pnpm 10 or newer)${RESET}\n"

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
# A dependency's build script can fail on its own — no compiler on the box —
# while every package is still in place. Stopping here would bury that in gyp
# output; the Native modules step below reports it with the fix instead, so a
# tree that is otherwise complete is allowed through with a warning.
DEPS_NOTE="$STEP_LOG.deps"
sync_deps() {
  pnpm install --frozen-lockfile && return 0
  pnpm install && return 0
  node -e 'require.resolve("react-router");require.resolve("express");require.resolve("node-pty/package.json")' 2>/dev/null || return 1
  : > "$DEPS_NOTE"
}
run_step "Dependencies" sync_deps
[ -f "$DEPS_NOTE" ] && note_warn "A dependency build script failed — the packages are there, see below."

# macOS: clear quarantine flags on node-pty binaries (Gatekeeper blocks them)
if [ "$OS" = "darwin" ]; then
  find node_modules -path "*/node-pty/prebuilds/darwin-*" -type f \
    -exec xattr -d com.apple.provenance {} 2>/dev/null \; \
    -exec xattr -d com.apple.quarantine {} 2>/dev/null \; || true
fi

# ---------------------------------------------------------------------------
# Native modules
#
# node-pty ships prebuilt binaries for macOS and Windows only, so everywhere
# else it compiles pty.node during install — and pnpm >= 10 skips a dependency's
# build scripts unless it is allowlisted (pnpm.onlyBuiltDependencies in
# package.json, which is now set). `pnpm install` exits 0 either way, so without
# this check the first sign of trouble was the server dying several steps later
# with "Failed to load native module: pty.node".
#
# Loading it is also the cheapest check that an *existing* binary still matches
# this machine: one built for another Node ABI (after an nvm switch) or another
# architecture (a node_modules shared over NFS) fails to load, and gets rebuilt
# here rather than at the first terminal the user opens.
# ---------------------------------------------------------------------------
# The brace group's own redirect also swallows the shell's "Segmentation fault"
# notice: a pty.node built by a mismatched node-gyp crashes this probe rather
# than throwing, and a core-dump line in the middle of a tidy checklist reads
# far worse than the ✗ and the advice that follow it.
pty_loads() { { node -e 'require("node-pty")'; } >/dev/null 2>&1; }

# Compiles with a current node-gyp rather than going through `pnpm rebuild`.
# That would re-run node-pty's own install script, which takes whatever
# `node-gyp` is on PATH — and a distro package can be years old: Debian's
# node-gyp 9.3.0 builds a pty.node against Node 24 that segfaults on every
# load (measured here: 0/10, against 10/10 for the same source under 12.4.0).
# A rebuild that produces a broken binary is worse than no rebuild, because it
# looks like it worked.
pty_rebuild() {
  local dir gyp
  dir=$(node -e 'console.log(require("path").dirname(require.resolve("node-pty/package.json")))' 2>/dev/null) || return 1
  [ -d "$dir" ] || return 1
  # The pinned devDependency first; npx only if node_modules is incomplete.
  # Deliberately unquoted below, so the two-word fallback still expands.
  gyp="$PWD/node_modules/.bin/node-gyp"
  [ -x "$gyp" ] || gyp="npx --yes node-gyp"
  # shellcheck disable=SC2086
  (cd "$dir" && $gyp rebuild 2>&1) || true
  pty_loads
}

toolchain_hint() {
  printf '  %sCompiling it needs a C/C++ toolchain and Python:%s\n' "$DIM" "$RESET"
  if   [ -f /etc/debian_version ];                               then printf '    sudo apt install -y build-essential python3\n'
  elif [ -f /etc/alpine-release ];                               then printf '    sudo apk add build-base python3 linux-headers\n'
  elif [ -f /etc/arch-release ];                                 then printf '    sudo pacman -S --needed base-devel python\n'
  elif [ -f /etc/fedora-release ] || [ -f /etc/redhat-release ]; then printf '    sudo dnf group install -y "Development Tools"\n'
  elif [ "$OS" = darwin ];                                       then printf '    xcode-select --install\n'
  else                                                                printf '    gcc, g++, make and python3, from your package manager\n'
  fi
  printf '\n  %sNo root here? A toolchain in your own prefix works too:%s\n' "$DIM" "$RESET"
  printf '    conda install -c conda-forge gxx make    %s# or: module load gcc%s\n' "$DIM" "$RESET"
}

if pty_loads; then
  note_ok "Native modules" "node-pty ready"
else
  # Say what is missing before spending a minute failing to compile.
  if ! { have cc || have gcc || have clang; } || ! have make || ! have python3; then
    printf '  %s%s%s %s\n\n' "$RED" "$MARK_BAD" "$RESET" "Native modules"
    printf '  node-pty has no prebuilt binary for %s/%s, and this machine cannot compile one.\n\n' "$OS" "$ARCH"
    toolchain_hint
    printf '\n'
    exit 1
  fi
  STEP_SOFT=1
  if ! run_step "Native modules" pty_rebuild; then
    printf '  %sThe compile above failed, so the terminal would not have worked.%s\n\n' "$DIM" "$RESET"
    toolchain_hint
    printf '\n'
    exit 1
  fi
  STEP_SOFT=0
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
    else
      return 1
    fi
  }

  if fetch_cloudflared >/dev/null 2>&1 && [ -f "$INSTALL_DIR/cloudflared" ]; then
    CF_CMD="$INSTALL_DIR/cloudflared"
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
