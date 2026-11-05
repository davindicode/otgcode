# OTG Code — reference

The detail behind [the README](README.md): what each part does, how the server
is put together, and what to do when something does not start. Every release is
described in [CHANGELOG.md](CHANGELOG.md); working on OTG Code itself is
[CONTRIBUTING.md](CONTRIBUTING.md).

- [The tab system](#the-tab-system)
- [Panes and the split view](#panes-and-the-split-view)
- [Light and dark](#light-and-dark)
- [Action keyboards and the text input](#action-keyboards-and-the-text-input)
- [File explorer](#file-explorer)
- [Viewers and editors](#viewers-and-editors)
- [Security](#security)
- [Localhost preview](#localhost-preview)
- [Settings and preferences](#settings-and-preferences)
- [Platforms](#platforms)
- [Scripts](#scripts)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)

## The tab system

Everything you open is a tab, in one strip, VS Code style.

**The same workspace on every device.** The tabs, their terminals, the split and
every preference live on the host, not the browser, so any two devices are one
session. Only what you are mid-way through — the keyboard you had open, a
half-typed command, which pane a narrow screen is showing — stays on the device
doing it.

### Three kinds of tab

`+` offers exactly these three:

| | What it is |
|---|---|
| **Terminal** | Your login shell, in a pty on the host. Its processes and scrollback belong to the tab, so closing it asks first |
| **tmux** | A tmux session. The tab runs `tmux new -A` — a client of the session, not a shell containing it — so a reconnect re-attaches. Closing the tab detaches and leaves the session running, so it closes without asking |
| **Explorer** | A file browser, with a breadcrumb and an editable path field |

### Files open as their own tabs

Pick a file in an explorer and it opens in a **viewer or editor tab** of its
own; closing it returns you to the explorer. An explorer spawns these, which is
why `+` offers three kinds and not four. The viewer follows the file type — see
[Viewers and editors](#viewers-and-editors).

### The strip

- **Drag the selected tab to reorder it**; dragging any other tab slides the
  whole strip, for when there are more tabs than fit. On a touch screen the
  selected tab needs a hold first, so a swipe still scrolls
- Tabs carry an icon for what they hold, a close button, and a name you can edit
  in place. **Renaming a tmux tab renames the session**: the tab title, tmux's
  own name and the name a reconnect attaches by are one value
- A background tab's terminal stays live, and **every tab keeps its own keyboard
  state** — typed text, open keyboard, chosen CLI
- Each tab's controls sit in the bottom bar and change with the tab. Localhost
  previews, system info, settings and your account are popups under the header
  icons
- A fresh start opens on an empty board; `+` makes the first tab. Installed to a
  home screen it runs standalone

### Terminal and tmux tabs

- **A short drop does not cost you the shell.** A plain terminal's process keeps
  running for a minute after the connection goes, and a reconnect picks it up
  where it was, with whatever it printed in the meantime. A minute and no more —
  anything longer is what tmux is for — and closing the tab ends it immediately.
  A tmux tab gets none of this: its client is dropped and re-attached cleanly,
  since tmux is what survives
- Picking **tmux** from `+` opens a picker: attach to a running session, start a
  new one, or kill one
- **Closing a tab asks first** only where it costs something: a terminal takes
  its processes and scrollback with it, and a file with unsaved edits says so. A
  tmux tab closes without asking, since the session keeps running on the host
- **System info** under the header — OS, kernel, CPU, memory, GPU, latency to
  the host, and which of tmux, claude, codex and opencode are installed

### One device at a time

The tabs and their terminals are one workspace on the host, so a second device
is told who holds the session and waits rather than taking it. That screen comes
before the password, so there is no logging in to reach it. Signing out, closing
the tab or letting the session expire frees the session. For two devices on one
terminal, use tmux — those sessions keep running regardless.

## Panes and the split view

One pane, or **two side by side on a wide screen** — from Settings →
Appearance. A file on the left and a terminal on the right, with a divider to
drag; double-click it to even the panes up.

- Each pane has **its own tab strip, its own `+` and its own active tab**, and a
  tab moves across by being dragged onto the other strip
- On a narrow screen — under 900px, or taller than it is wide — one pane is
  drawn at a time and Settings grows a **Left / Right** switch for which one.
  Each pane still keeps its own tabs there, so the split you set on one device
  is the same workspace on another
- Which pane a device shows is per device, since on a narrow screen it is the
  only one visible. The pane **count** is shared: dropping to one pane merges
  the right pane's tabs into the left, and where a tab lives is workspace state

## Light and dark

A **Dark / Light switch in Settings → Appearance**. One semantic colour token
set drives the whole UI, the terminal's ANSI palette and the code editor's
theme, so everything switches at once. Resolved server-side, so there is no
flash on load.

## Action keyboards and the text input

A phone has no modifier keys, no arrows, no second mouse button and no Esc —
most of what a coding CLI is driven by. So a terminal or tmux tab carries its
own controls underneath: **task-specific action keyboards** in rows sized for a
thumb, and a **text input box**. Both are there on a desktop too.

Pick a keyboard from the row of tabs under the terminal. Which ones are offered
follows the tab.

### keyboard — the text input, and the keys a terminal needs

A **dedicated input box** for a prompt, a commit message, a path, with Send
beside it. One line that scrolls inside itself, so the bar keeps its height, and
per tab, so a half-written prompt stays with its session. What you send goes in
**as a paste, not as keystrokes** (see below).

Under it, one row of keys. A row longer than the screen can be dragged sideways,
or scrolled with a wheel on a desktop. A mode picks what those keys are:

- **main** — nav, numbers, letters, function and symbol sets, with a sticky
  modifier beside them (Shift, Ctrl, Ctrl+Shift, Alt or Alt+Shift)
- **claude / codex / opencode** — one keyboard per coding CLI: Enter, Bksp, the
  arrows, that CLI's own shortcuts, a launch button, and **slash commands you
  can add yourself**, kept per CLI
- **git** — status, log, diff, add, fetch, pull, push, stash, branch, commit
  with a message, and `user.name` / `user.email` setup

### commands — shell commands worth a button

Common ones (ls, top, df, free, nvidia-smi…), plus **your own** — add, edit and
remove, saved on the host.

### navigate — go somewhere else

A directory picker. The current directory is detected on the server, so it
tracks the shell as it moves, inside tmux too. If it cannot be determined the
picker says so and offers no buttons, since every button sends a `cd`.

### tmux — the session's own controls

Only on a tmux tab, so tmux keys can never be typed into a plain shell: windows
(new, next, prev, last, rename, kill, list, and any index by number), panes
(split, select, cycle, zoom, kill, layout) and copy mode.

### Text goes in as a paste, not as keystrokes

Anything sent as a line — a prompt, a commit message, a `cd`, one of your own
commands — is wrapped in bracketed paste markers when the program has asked for
them. That tells a TUI it is holding text, not keys it may have bindings for.
Enter is sent separately, so no newline rides along inside the text. Quick keys
and the slash-command chips go as keys.

## File explorer

- Explorer tabs (renamable), breadcrumb and editable path navigation
- Create, rename, delete files and folders; multi-select for bulk download or
  delete; file info dialog; hidden files toggle
- **Move by dragging** — hold a row until it lifts, drag it onto a folder in the
  same listing and let go; dragging near the top or bottom scrolls the list. For
  a destination elsewhere, **Move** from the row's menu turns the explorer into
  the destination picker. Either way a move refuses to overwrite, to put a
  folder inside itself, or to land where it already is, and copies rather than
  renames across filesystems
- **A slow delete or move says so.** The dialog closes the moment you confirm
  and the explorer freezes under a `Deleting…` / `Moving…` spinner until the new
  listing is in — one confirmation, one operation
- Row menu on right-click, or by holding a row and letting go; file paths stay
  selectable and scrollable
- Drag-and-drop file upload with progress tracking and per-file cancel
- Chunked upload for large files (>80 MB) to bypass Cloudflare's 100 MB request
  limit
- **Reload a file in place** from its own bar, for every type. The editor
  carries the version it read, so a save onto a file changed since is refused
- Failures name the cause — `"TODO.md" is a file, not a folder`, `No such folder
  "saves"`, `Permission denied`

## Viewers and editors

- **Code editor** — Monaco with syntax highlighting and word wrap. Text opens in
  Plain and markdown in Preview; Edit is a deliberate switch. **Ctrl/Cmd+S
  saves** instead of opening the browser's save dialog, and undo/redo have
  buttons for touch
- **Markdown preview** — GitHub-flavored, with **equations typeset** by KaTeX:
  `$...$` inline, `$$...$$` display, including multi-line. Prices and shell
  variables are left alone
- **Jupyter notebook** — cells with type badges, rendered markdown, code, and
  outputs
- **HTML preview** — live rendered in a sandboxed iframe
- **PDF viewer** — pages render as they scroll into view, sized to the pane,
  with zoom and pinch-to-zoom
- **Image viewer** — zoom, pinch-to-zoom and drag-to-pan. 100% is the scale at
  which the whole image fits the pane
- **Video player** — mp4, webm, ogg, mov, mkv, avi
- **Audio player** — mp3, wav, ogg, flac, aac, m4a
- Anything else — a HEIC, a `.docx`, a format the browser cannot decode — gets
  one screen with the file's name, size and why, and offers the download or the
  raw bytes

## Security

- **Access password, set up on first run**, before the app opens. Declining
  takes a second confirmation. Either way the choice is remembered, and the
  Settings cog can change it later
- Enforced on the server for every request, the localhost proxy (HTTP +
  WebSocket) and the Socket.IO handshake — not just the UI
- Salted **scrypt** hash stored in `~/.otgcode/config.json` (mode 600); sessions
  are signed HttpOnly cookies, and changing or removing the password signs every
  device out
- Failed logins back off exponentially rather than locking out, so a stranger
  with the URL cannot deny you your own machine
- **An unreadable config file stops the server**, rather than falling back to no
  password
- **Previewing a file cannot run it.** Rendered markdown and a notebook's HTML
  outputs go through DOMPurify, and a file served inline carries
  `Content-Security-Policy: sandbox`
- **Account popup** in the header — the user the shell runs as, how long the
  session has been open, and sign out
- **Stay signed in until I close the browser** on the login screen. Nothing is
  written to disk either way; unticked, the session also expires after 30
  minutes

> [!WARNING]
> The tunnel URL reaches a shell on your host, as the user that launched OTG
> Code, with read/write access to that user's files. With the access password on,
> that is what stands in the way. **Without it, the URL is the only thing
> protecting that shell, so keep it private** — and you can turn a password on at
> any time from the Settings cog.
>
> Locked out? Set `passwordEnabled` to `false` in `~/.otgcode/config.json` on
> the host and restart.

## Localhost preview

- Port list in a popup under the globe icon in the header
- Preview any localhost port in a new tab, via the built-in `/proxy/:port`
  reverse proxy
- Reachability checks with green/amber indicators, copy-URL and remove per port
- Previews route through the app's own tunnel — no second tunnel to set up

## Settings and preferences

- **Appearance** — the [Dark / Light switch](#light-and-dark), one pane or
  [two](#panes-and-the-split-view), and which pane a narrow screen is showing
- **Terminal and editor font sizes**, adjustable from Settings
- **Saved on the host, not in the browser** — `~/.otgcode/workspace.json` holds
  the theme, both font sizes, your custom commands and slash commands, the split
  and every open tab in order with its directory, file or tmux session. Written
  as you change them
- Errors arrive as toasts
- **Installable** — web app manifest, standalone display, maskable icons and iOS
  safe-area handling

## Platforms

| Platform | Status |
|----------|--------|
| Linux x64 | Supported — needs a C/C++ toolchain |
| Linux arm64 (Raspberry Pi, Graviton) | Supported, same toolchain path, less travelled |
| macOS (Intel / Apple Silicon) | Supported — nothing to compile, no toolchain needed |
| Windows | Through [WSL2](https://learn.microsoft.com/windows/wsl/install) only |

Native Windows is not supported: the terminal rests on a Linux/macOS pty.
`start.sh` stops with a pointer to WSL2 if you run it under Git Bash, MSYS or
Cygwin.

macOS needs no setup beyond Node and pnpm — `node-pty` ships a binary for it,
and `start.sh` clears the Gatekeeper quarantine flag on it for you.

On Linux, and anywhere else `node-pty` has no prebuilt binary, it compiles
`pty.node` from source and needs a **C/C++ toolchain and Python 3** — without
them the terminal cannot start. `node-gyp` itself is a pinned devDependency, so
you do not need one installed:

| | |
|---|---|
| Debian / Ubuntu | `sudo apt install -y build-essential python3` |
| Fedora / RHEL | `sudo dnf group install -y "Development Tools"` |
| Alpine | `sudo apk add build-base python3 linux-headers` |
| Arch | `sudo pacman -S --needed base-devel python` |
| macOS | `xcode-select --install`, only if a prebuilt binary is ever missing |

`cloudflared` is downloaded to `.bin/` for Linux and macOS (x64/arm64) if it
isn't already on your PATH. `./start.sh` checks all of this before it builds and
names the command to install whatever is missing.

### Windows: running under WSL2

1. Install WSL2 and a distro — `wsl --install -d Ubuntu` in an admin
   PowerShell, then reboot.
2. Open the Ubuntu shell. Everything below happens **inside** WSL: the Windows
   copies of Node and pnpm will not work, because `pty.node` is a Linux binary.
3. Install Node, a toolchain and pnpm inside WSL:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt install -y nodejs build-essential python3
   npm install -g pnpm
   ```
4. Clone into the **WSL filesystem** (`~/otgcode`), not `/mnt/c`. A checkout on
   the Windows drive is slow and breaks file watching.
5. Run `./start.sh`. The tunnel URL works from any device; from the Windows
   host's own browser `http://localhost:7777` reaches it too, since WSL2
   forwards localhost.

### Tunnel URL not resolving? Set your DNS to 1.1.1.1

The Quick Tunnel URL (e.g. `xxxx.trycloudflare.com`) resolves instantly on
Cloudflare DNS but may take time on ISP/router DNS servers, or fail entirely if
a stale NXDOMAIN gets cached. Set your DNS to **1.1.1.1** (Cloudflare) for
instant resolution.

**macOS:**
```bash
networksetup -setdnsservers Wi-Fi 1.1.1.1 1.0.0.1
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
# To revert: networksetup -setdnsservers Wi-Fi empty
```

**Linux (systemd-resolved):**
```bash
resolvectl dns $(ip route show default | awk '{print $5}') 1.1.1.1 1.0.0.1
# Or permanently via /etc/systemd/resolved.conf:
# [Resolve]
# DNS=1.1.1.1 1.0.0.1
# sudo systemctl restart systemd-resolved
```

**Windows (PowerShell as Admin):**
```powershell
Get-NetAdapter | Select Name, Status
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ServerAddresses 1.1.1.1,1.0.0.1
ipconfig /flushdns
# To revert: Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ResetServerAddresses
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Dev server with HMR (Socket.IO + proxy on same port) |
| `pnpm build` | Production build |
| `pnpm start` | Production server |
| `pnpm start:tunnel` | Production server + Cloudflare tunnel |
| `./start.sh` | Install + build + start + tunnel (all-in-one); `--port N` to move off 7777 |
| `pnpm typecheck` | React Router typegen + `tsc` |
| `pnpm test` | Vitest |
| `pnpm lint` | Biome lint + format check |
| `pnpm format` | Biome write |

## Architecture

React Router v7, Express, Socket.IO, node-pty, xterm.js, Monaco Editor, Zustand,
Tailwind CSS v4, TypeScript. A single Express server on one port handles
everything:

```
Express (port 7777)
├── Auth gate — access password, ahead of every route below
├── Workspace API — layout, open tabs and preferences in ~/.otgcode/workspace.json
├── React Router v7 — UI (SSR shell + client-side app)
├── Socket.IO — real-time terminal I/O via node-pty, admitting one device at a time
├── REST API — file operations (list, read, write, rename, move, delete, mkdir, upload, download)
├── Reverse Proxy — /proxy/:port/* forwards HTTP + WebSocket to localhost services
└── Cloudflare Tunnel — single optional tunnel via cloudflared (all traffic)
```

The file layout of the source itself is in
[CONTRIBUTING.md](CONTRIBUTING.md#project-layout).

### Reverse proxy

The `/proxy/:port` reverse proxy is how localhost previews work — no extra
tunnels or processes needed. It handles:

- **Path rewriting** — strips the `/proxy/:port` prefix before forwarding to
  `127.0.0.1:<port>`
- **WebSocket upgrades** — WS connections on `/proxy/:port/...` are forwarded
  (supports Vite HMR, webpack-dev-server, etc.)
- **Header stripping** — removes `X-Frame-Options` and CSP headers so content
  can embed in the preview iframe
- **Asset path rewriting** — rewrites absolute paths in HTML, CSS, and JS (src,
  href, url(), ES imports) to include the `/proxy/:port` prefix so assets load
  correctly through the proxy
- **Port blocking** — blocks privileged ports (1–1023, except 80/443) and the
  OTG server port itself

**Dev server notes:** most dev servers (Vite, webpack, Next.js) work out of the
box since both HTTP and WebSocket traffic are proxied. However, dev servers that
hardcode their WebSocket URL to `ws://localhost:<port>` in client-side code
(bypassing the proxy path) will fail over the tunnel — the HMR connection won't
reach the VPS. Vite works because its HMR client connects relative to the page
origin. If a dev server's HMR breaks, configure it to use a relative or custom
WebSocket path.

## Troubleshooting

### `Failed to load native module: pty.node`

`node-pty` never compiled. It ships prebuilt binaries for macOS and Windows
only, so everywhere else it builds `pty.node` during install — and **pnpm 10 and
newer skip a dependency's build scripts unless the package is allowlisted**,
while `pnpm install` still exits 0. OTG Code allowlists it:

```json
"pnpm": { "onlyBuiltDependencies": ["node-pty"] }
```

`node-gyp` is a devDependency for the same reason: pnpm, unlike npm, does not
supply one, and node-pty's install script calls bare `node-gyp`. Without it the
install fails with `sh: node-gyp: command not found`, or silently uses whatever
the machine happens to have.

A fresh `pnpm install` therefore compiles it. If the compile failed, or you are
on an older checkout, `./start.sh` catches it at the **Native modules** step and
rebuilds. By hand, from the repo root:

```bash
cd node_modules/.pnpm/node-pty@*/node_modules/node-pty
"$OLDPWD/node_modules/.bin/node-gyp" rebuild
```

Install `build-essential` (or your platform's equivalent from
[Platforms](#platforms)) and `python3` first. Note that pnpm caches a build per
machine, so a compile that failed once is not retried by a later `pnpm install`
— use the command above, or `./start.sh`.

### The terminal crashes the server, or `pty.node` segfaults instead of erroring

A `pty.node` built by an outdated `node-gyp` can bind to the wrong Node ABI and
crash on every load rather than failing cleanly. Debian and Ubuntu ship
`node-gyp` 9.x as `/usr/bin/node-gyp`, which does exactly this against Node 24 —
measured at 0/10 successful loads, against 10/10 for the same source under a
current node-gyp.

The pinned devDependency is what prevents it, so this only bites a checkout that
predates it. Rebuild with the local one:

```bash
cd node_modules/.pnpm/node-pty@*/node_modules/node-pty
"$OLDPWD/node_modules/.bin/node-gyp" rebuild
```

`start.sh` uses that same binary rather than `pnpm rebuild`, which would re-run
node-pty's install script and pick up whichever `node-gyp` is on PATH again.

### After switching Node versions, or on a `node_modules` shared between machines

`pty.node` is compiled for one Node ABI and one architecture. An `nvm` switch
across major versions, or a checkout shared over NFS between hosts, leaves a
binary that no longer loads. `start.sh` notices on every run — loading the
module *is* the check — and rebuilds it. By hand it is the same `node-gyp
rebuild`.

### No root on the machine

OTG Code itself needs no `sudo`; only installing a compiler does. On a shared or
HPC machine, bring your own toolchain instead:

```bash
conda install -c conda-forge gxx make    # or, on many clusters: module load gcc
```

Then re-run `./start.sh`.

## Known limitations

- **tmux controls belong to tmux tabs.** Running `tmux attach` by hand in a
  plain **terminal** tab works, but that tab keeps a terminal's controls. Use
  `+` → tmux for the session controls.
- **The code editor loads from a CDN.** Monaco is fetched from jsDelivr at
  runtime rather than bundled, so the editor needs internet access even though
  everything else works offline.
- **Work in progress does not follow you between devices.** Tabs and layout are
  on the host, but an unsaved buffer, a half-written commit message and a
  viewer's zoom live in the browser that typed them. A file edited and not saved
  on one device opens from disk on another, with no sign a draft exists
  elsewhere — save before switching. That browser-side state also ends with the
  tunnel, since a Quick Tunnel's hostname is new on every start.
