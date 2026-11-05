<p align="center">
  <img src="public/logo-square.png" alt="OTG Code" width="128" />
</p>

<h1 align="center">OTG Code</h1>
<p align="center"><em>On-The-Go Code — a mobile-first, terminal-focused development environment in the browser</em></p>

<p align="center">Work on your VPS or home machine from anywhere — phone, tablet, or desktop — with zero client-side installation. A mobile-optimised terminal built for coding CLIs, with file explorer, code editor, and localhost proxy — all in a single browser tab, accessible via a single Cloudflare Quick Tunnel.</p>

<p align="center">
  <img src="https://img.shields.io/github/package-json/v/davindicode/otgcode?color=blue" alt="Version">
  <img src="https://img.shields.io/badge/status-alpha-orange" alt="Status: alpha">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20.19-brightgreen" alt="Node >= 20.19">
  <img src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20WSL2-lightgrey" alt="Platform: Linux, macOS, WSL2">
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React_Router-v7-red?logo=reactrouter&logoColor=white" alt="React Router">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome">
</p>

<p align="center">
  <a href="public/videos/demo.gif" title="OTG Code on a desktop browser and on a phone"><img src="public/videos/demo.gif" alt="The same workspace on a desktop browser and on a phone: file explorer and markdown preview beside a terminal and tmux on the left, the phone running a coding CLI over the on-screen key rows on the right" width="900"></a>
</p>

## What it is

One tunnel, one browser tab, one tab system. Everything you open is a tab —
there is no panel layout to arrange — and the tabs live on the host, so a phone
and a laptop are the same session: open either and you are where you left off.

### Three kinds of tab

| | |
|---|---|
| **Terminal** | Your shell, in a pty on the host. It survives a minute of lost signal, so a walk past a dead spot doesn't kill a build |
| **tmux** | A tmux session, not a shell that happens to run tmux — so a dropped phone re-attaches instead of landing in a fresh shell beside it |
| **Explorer** | A file browser. Pick a file and it opens in a viewer or editor tab of its own, next to the explorer it came from |

Monaco, markdown with KaTeX equations, notebooks, PDFs, images, video and audio
each get their own tab that way, which is what keeps an explorer a file browser
rather than an editor you have to navigate back out of.

### Built for thumbs, not scaled down to them

- **Task-specific action keyboards** under every terminal — `main` for the shell
  itself, one per coding CLI (claude, codex, opencode) read from what that CLI
  actually binds, `git`, your own saved commands, and a directory picker that
  knows where the shell really is. A tmux tab also gets its session's controls.
- **A dedicated text input box** for writing a line out in full — a prompt, a
  commit message, a path — instead of typing it a key at a time. It goes in as a
  *paste*, so a TUI reads it as text rather than four hundred keystrokes it
  might have bindings for.

### On a wide screen

- **Split panes** — one pane or two side by side, each with its own tab strip,
  its own `+` and its own active tab; drag a tab across to move it. A narrow
  screen draws one pane at a time and remembers which one it was showing.

### Throughout

- **Light and dark**, both first-class: one token set drives the UI, the
  terminal's ANSI palette and the editor's theme together, resolved server-side
  so a reload never flashes the wrong one.
- **Localhost previews** through a built-in `/proxy/:port`, over the same tunnel
  — HTTP and WebSockets, so a dev server with HMR works.
- **Password-protected by default**, enforced server-side on every request, the
  proxy and the terminal socket. One device holds the session at a time.

Full feature list, architecture and troubleshooting: **[DOCS.md](DOCS.md)**.
Every release is described in [CHANGELOG.md](CHANGELOG.md).

## Requirements

- **Linux, macOS, or Windows via [WSL2](https://learn.microsoft.com/windows/wsl/install)** — the terminal rests on a Unix pty
- **Node.js** 20.19 or newer, and **pnpm** 10 or newer (`npm install -g pnpm`)
- **A C/C++ toolchain and Python 3 on Linux** — `node-pty` compiles there
  (`sudo apt install -y build-essential python3` on Debian/Ubuntu). macOS needs
  nothing extra

`./start.sh` checks all of this up front and names the command to fix it, rather
than failing later at the first terminal you open. See
[Platforms](DOCS.md#platforms) for the other distros and the WSL2 walkthrough.

## Quick start

```bash
git clone https://github.com/davindicode/otgcode.git
cd otgcode

# Optional: port, shell and starting directory
cp .env.example .env

# Install, build, start, and open a Cloudflare tunnel
./start.sh

# ...or on another port
./start.sh --port 8080
```

`start.sh` installs dependencies, builds the app, starts the server and opens a
Cloudflare Quick Tunnel, printing a public URL you can open on any device with
the LAN addresses beside it. First start asks you to set an access password
before the app opens.

Tunnel URL not resolving? [Set your DNS to 1.1.1.1](DOCS.md#tunnel-url-not-resolving-set-your-dns-to-1111).
`pnpm dev` runs the same app with HMR if you are working on OTG Code itself.

> [!WARNING]
> **Keep the tunnel URL private.** Anyone who opens it gets a terminal on the
> host as the user that launched OTG Code, plus read/write access to that user's
> files. First start asks you to set an **access password** for exactly this
> reason — it is enforced server-side on every request, the localhost proxy and
> the terminal socket, not just in the UI. If you declined it, the URL is the
> only thing protecting that shell; you can turn one on at any time from the
> Settings cog in the header.
>
> Locked yourself out? Set `passwordEnabled` to `false` in
> `~/.otgcode/config.json` on the host and restart.

## Docs

| | |
|---|---|
| [DOCS.md](DOCS.md) | Features in full, platforms, scripts, architecture, troubleshooting, known limitations |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each release |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Dev setup, conventions, PR workflow |

## License

[MIT](LICENSE)
