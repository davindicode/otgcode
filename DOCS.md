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

**The same workspace on both screens.** The tabs, their terminals, the split and
every preference live on the host rather than in the browser, so a phone and a
laptop are one session: open either and you are where you left off. Only what
your thumb is doing — the keyboard you had open, a half-typed command, which
pane a phone is showing — stays on the device doing it.

### Three kinds of tab

`+` offers exactly these three:

| | What it is |
|---|---|
| **Terminal** | Your login shell, in a pty on the host. Its processes and scrollback belong to the tab, so closing it asks first |
| **tmux** | A tmux session. The tab runs `tmux new -A`, so it is a client of the session rather than a shell containing it, and a reconnect re-attaches. Closing the tab detaches and the session keeps running, so it closes without asking |
| **Explorer** | A file browser rooted wherever you point it, with its own breadcrumb and path field |

### Files open as their own tabs

Pick a file in an explorer and it opens in a **viewer or editor tab** of its
own; closing it returns you to the explorer. A file tab is something an explorer
spawns, which is why `+` offers three kinds and not four. Which viewer or editor
it gets follows the file — see [Viewers and editors](#viewers-and-editors).

### The strip

- **Drag the selected tab to reorder it**; dragging any other tab slides the
  whole strip, for when there are more tabs than fit. On a phone the selected
  tab needs a hold first, so a swipe still scrolls
- Tabs carry an icon for what they hold, a close button, and a name you can edit
  in place. **Renaming a tmux tab renames the session** — the tab title, tmux
  itself and the name a reconnect attaches by are one value, so the strip and
  the session picker can never disagree
- Switching tabs never costs you a terminal: one stays live while you are in
  another, and **every tab keeps its own keyboard state** — your half-typed
  command, the open keyboard and the chosen CLI stay with the tab rather than
  following you to another session
- Each tab's controls sit in the bottom bar and change with the tab. Localhost
  previews, system info, settings and your account live in popups under the
  header icons
- A fresh start opens on an empty board, and `+` makes the first tab. Installed
  to a home screen it runs standalone, like an app

### Terminal and tmux tabs

- **A short drop does not cost you the shell.** A plain terminal's process keeps
  running for a minute after the connection goes, and a reconnect picks it up
  where it was, with whatever it printed in the meantime — so a walk past a dead
  spot costs you nothing. A minute, and no more: anything longer is what
  tmux is for, and closing the tab still ends it there and then. A tmux tab
  needs none of this and gets none: tmux is already the thing that survives, so
  its client is dropped and re-attached cleanly
- Picking **tmux** from `+` opens a picker: attach to a running session, start a
  new one, or kill one
- **Closing a tab asks first** only where it costs something: a terminal takes
  its processes and scrollback with it, and a file with unsaved edits says so. A
  tmux tab closes without asking, since the session keeps running on the host
- **System info** under the header — OS, kernel, CPU, memory, GPU, latency to
  the host, and which of tmux, claude, codex and opencode are installed

### One device at a time

The open tabs and their terminals are a single workspace on the host, so a
second device is told who holds the session and waits for it rather than taking
it — nothing reachable from the tunnel URL can pull a live terminal away from
whoever is using it. It is told before the password, too, so there is no logging
in to reach that screen. Signing out, closing the tab or letting the session
expire frees it. tmux sessions keep running either way, which is what to use for
two devices on one terminal.

## Panes and the split view

One pane, or **two side by side on a wide screen** — from Settings →
Appearance. A file on the left and a terminal on the right, with a divider to
drag; double-click it to even the panes up.

- Each pane has **its own tab strip, its own `+` and its own active tab**, and a
  tab moves across by being dragged onto the other strip
- On a phone — or any screen under 900px, or taller than it is wide — one pane
  is drawn at a time and Settings grows a **Left / Right** switch for which one.
  Each pane still keeps its own tabs there, so the split you set on a laptop is
  the same workspace when you pick the phone up
- Which pane a device is showing is the device's own, since on a phone it is the
  only pane you can see. The pane **count** is shared, because asking for one
  pane merges the right pane's tabs into the left and where a tab lives is part
  of the workspace

## Light and dark

A **Dark / Light switch in Settings → Appearance**. Both are designed rather
than one derived from the other.

- One semantic colour token set drives the whole UI, the terminal's ANSI palette
  and the code editor's theme together, so everything switches at once
- **Content recedes and chrome advances in both.** The terminal is the darkest
  surface in dark mode and shares the explorer's paper in light; light mode
  inverts the dark layering rather than lightening it, which is what lets a
  near-white control read as raised
- Resolved **server-side**, so a reload paints the right theme immediately. The
  switch itself cross-fades

## Action keyboards and the text input

A phone has no modifier keys, no arrows, no second mouse button and no Esc —
which is most of what a coding CLI is driven by. So a terminal or tmux tab
carries its own controls underneath it: **task-specific action keyboards**, in
rows sized for a thumb, and a **text input box** for anything you would rather
write than type a key at a time. Both are there on a desktop too.

Pick a keyboard from the row of tabs under the terminal; which ones are offered
follows the tab they belong to.

### keyboard — the text input, and the keys a terminal needs

A **dedicated input box** for writing a line out in full — a prompt for a coding
CLI, a commit message, a path — with Send beside it. It is one line that scrolls
inside itself, so the bar keeps its height however much you write, and it is per
tab, so a half-written prompt stays with the session it was meant for. What you send
goes in **as a paste, not as keystrokes** (see below).

Under it, one row of keys that never grows. Any row longer than the screen can
be dragged sideways, or scrolled with a wheel on a desktop. A mode picks what
those keys are:

- **main** — a key set for the terminal itself: nav, numbers, letters, function,
  symbols, with a sticky modifier beside it (Shift, Ctrl, Ctrl+Shift, Alt or
  Alt+Shift)
- **claude / codex / opencode** — one keyboard per coding CLI, read from what
  that CLI actually binds. Each leads with Enter, then Bksp and the arrows its
  prompts are driven by, then its own shortcuts, a bare launch button, and
  **slash commands you can add yourself**, kept separately per CLI
- **git** — status, log, diff, add, fetch, pull, push, stash, branch, commit
  with a message, and `user.name` / `user.email` setup

### commands — shell commands worth a button

Common ones (ls, top, df, free, nvidia-smi…), plus **your own**: add, edit and
remove, saved on the host so they are there on every device.

### navigate — go somewhere else

A directory picker with server-side CWD detection, so it knows where the shell
actually is and follows you inside tmux too. A directory it cannot establish is
reported as one it cannot establish, and offers no buttons — every button in it
sends a `cd`, and a wrong one moves the terminal somewhere nobody chose.

### tmux — the session's own controls

Only on a tmux tab, so tmux keys can never be typed into a plain shell: windows
(new, next, prev, last, rename, kill, list, and any index by number), panes
(split, select, cycle, zoom, kill, layout) and copy mode.

### Text goes in as a paste, not as keystrokes

Anything sent as a line — a prompt, a commit message, a `cd`, one of your own
commands — is wrapped in the bracketed paste markers when the program has asked
for them, which is what tells a TUI it is holding text rather than a burst of
keys it might have bindings for. The Enter is sent separately, so no newline
rides along inside the text. Quick keys and the slash-command chips still go as
keys, since reaching those bindings is what they are for.

## File explorer

- Explorer tabs (renamable), breadcrumb and editable path navigation
- Create, rename, delete files and folders; multi-select for bulk download or
  delete; file info dialog; hidden files toggle
- **Move by dragging** — hold a row until it lifts, drag it onto a folder in the
  same listing and let go; dragging near the top or bottom creeps the list, so a
  destination off the screen is still reachable. For a folder that is not in
  front of you, **Move** from the row's menu turns the explorer itself into the
  destination picker. Either way the move refuses to overwrite, to put a folder
  inside itself, or to land somewhere it already is, and copies instead of
  renaming across filesystems
- **A slow delete or move says so.** Deleting a deep tree or moving something
  large takes a while, so the dialog closes the moment you confirm and the
  explorer freezes under a `Deleting…` / `Moving…` spinner until the new listing
  is in: one confirmation, one operation, and nothing clickable in between
- Row menu on right-click, or by holding a row and letting go; file paths stay
  selectable and scrollable
- Drag-and-drop file upload with progress tracking and per-file cancel
- Chunked upload for large files (>80 MB) to bypass Cloudflare's 100 MB request
  limit
- **Reload a file in place** from its own bar, for every type. The editor also
  carries the version it read, so a save that would land on a file something
  else has changed since is refused, and says which
- Failures name the cause — `"TODO.md" is a file, not a folder`, `No such folder
  "saves"`, `Permission denied`

## Viewers and editors

- **Code editor** — Monaco with syntax highlighting and word wrap. Text opens in
  Plain and markdown in Preview; Edit is a deliberate switch. **Ctrl/Cmd+S
  saves** instead of opening the browser's save dialog, and undo/redo have
  buttons for phones
- **Markdown preview** — GitHub-flavored with prose styling, and **equations are
  typeset**: `$...$` inline and `$$...$$` display go through KaTeX, including
  the multi-line form a paper's worth of algebra actually arrives in. Prices and
  shell variables are left as they were written
- **Jupyter notebook** — cells with type badges, rendered markdown, code, and
  outputs
- **HTML preview** — live rendered in a sandboxed iframe
- **PDF viewer** — pages render as they scroll into view, sized to the pane,
  with zoom and pinch-to-zoom
- **Image viewer** — 100% is the scale at which the whole image is visible,
  measured from the pane, with zoom, pinch-to-zoom and drag-to-pan
- **Video player** — mp4, webm, ogg, mov, mkv, avi
- **Audio player** — mp3, wav, ogg, flac, aac, m4a
- Anything else — HEIC off an iPhone, a `.docx`, a format this browser cannot
  decode — gets one screen naming the file and its size, saying why, and
  offering the download or the raw bytes

## Security

- **Access password, set up on first run.** A fresh install asks for one before
  the app opens; declining takes a deliberate second step that repeats what the
  tunnel exposes. Either way the choice is remembered, and you can change it
  later from the Settings cog
- Enforced on the server for every request, the localhost proxy (HTTP +
  WebSocket) and the Socket.IO handshake — not just the UI
- Salted **scrypt** hash stored in `~/.otgcode/config.json` (mode 600); sessions
  are signed HttpOnly cookies, and changing or removing the password signs every
  device out
- Failed logins back off exponentially rather than locking out, so a stranger
  with the URL can't deny you access to your own machine
- **A config file it cannot read stops the server** rather than falling back to
  no password — the one file that decides whether the password is required fails
  closed
- **Previewing a file cannot run it.** Rendered markdown and a notebook's own
  HTML outputs go through DOMPurify, and a file served inline carries
  `Content-Security-Policy: sandbox` — so a `.html` or a `<script>` in a repo
  you cloned cannot reach the session that drives the terminals
- **Your account popup** in the header shows the user the shell runs as, how
  long the session has been open, and signs you out
- **Stay signed in until I close the browser** on the login screen. Nothing is
  written to disk either way, so closing the browser always ends the session;
  unticked, it also expires after 30 minutes so coming back later asks again

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

- Port list in a popup under the globe icon in the header — compact, no panel of
  its own
- Preview any localhost port in a new tab via the built-in `/proxy/:port`
  reverse proxy
- Reachability checks with green/amber status indicators, copy-URL and remove
  per port
- All localhost previews route through the same main tunnel of the app

## Settings and preferences

- **Appearance** — the [Dark / Light switch](#light-and-dark), one pane or
  [two](#panes-and-the-split-view), and which pane a narrow screen is showing
- **Terminal and editor font sizes**, adjustable from Settings
- **Saved on the host, not in the browser** — `~/.otgcode/workspace.json` keeps
  the theme, both font sizes, your custom commands and slash commands, the split
  and every open tab in order with its directory, file or tmux session.
  Preferences save themselves as you change them and follow you across
  refreshes, reconnects and devices
- Errors arrive as toasts, so nothing in the layout shifts under them
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

- **tmux controls belong to tmux tabs.** A tmux tab *is* its session, so its
  controls are always correct. Running `tmux attach` by hand inside a plain
  **terminal** tab still works, but that tab keeps a terminal's controls — use
  `+` → tmux session to get the session controls.
- **The code editor loads from a CDN.** Monaco is fetched from jsDelivr at
  runtime rather than bundled, so the editor needs internet access even though
  everything else works offline.
- **Work in progress does not follow you between devices.** Your tabs and layout
  are on the host, but an unsaved buffer, a half-written commit message and a
  viewer's zoom are kept in the browser that typed them — so a file edited and
  not saved on a phone opens from disk on a laptop, with no sign a draft exists
  elsewhere. Save before switching. The browser's share also ends with the
  tunnel, since a Quick Tunnel's hostname is new on every start.
