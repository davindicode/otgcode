# Contributing to OTG Code

Thanks for your interest in improving OTG Code! This guide covers the dev
setup, conventions, and PR workflow.

## Prerequisites

- **Node.js** `>= 20.19`
- **pnpm** `>= 10` (`corepack enable` will provide it)

## Setup

```bash
pnpm install
```

### Run it

```bash
pnpm dev          # local dev server (no tunnel)
bash start.sh     # production build + server + Cloudflare quick tunnel
```

By default the app runs on http://localhost:7777 (override with `OTG_PORT`).

## Checks (run before opening a PR)

CI runs these on every PR; they must pass.

```bash
pnpm lint         # Biome lint + format check (biome ci)
pnpm format       # auto-fix formatting and safe lint issues
pnpm typecheck    # React Router typegen + tsc
pnpm run build    # production build
```

## Code style

Formatting and linting are handled by [Biome](https://biomejs.dev) — config in
`biome.json`. Run `pnpm format` to auto-apply. Don't hand-format; let Biome
decide. Match the conventions of the surrounding code.

## Commit messages — Conventional Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org).
It keeps history readable and makes the `CHANGELOG.md` easy to assemble per
release.

Common types:

- `feat:` — a new feature
- `fix:` — a bug fix
- `chore:`, `docs:`, `style:`, `refactor:`, `test:`, `ci:` — supporting changes

Example: `fix: flip file menu upward near the bottom of the pane`

Security fixes should use `fix:` and are listed under a **Security** section in
the changelog — there is no separate security-advisory file.

## Pull request workflow

1. Branch off `main`.
2. Make your change; keep commits focused and Conventionally named.
3. Ensure `pnpm lint`, `pnpm typecheck`, and `pnpm run build` pass.
4. Open a PR against `main` with a short description of what and why.

## Releasing (maintainers)

Releases are cut manually:

1. Update the version in `package.json` and add a section to `CHANGELOG.md`
   (group changes under Added / Changed / Fixed / Security).
2. Merge to `main`.
3. Tag and push: `git tag -a vX.Y.Z -m "Release vX.Y.Z" && git push origin vX.Y.Z`.
4. Create a GitHub Release for the tag, using the changelog section as the notes.

The in-app version (shown in the header) is read from `package.json` at build
time, so bumping `package.json` is enough to update it.

## Project layout

```
app/                  React Router (SSR) frontend
  components/         UI — browser/, files/, terminal/
  routes/             routes + routes/api/ (file ops, tmux, system info)
  stores/             Zustand stores
  lib/                shared client helpers (clipboard, socket, constants)
server/               Node backend
  index.ts            Express + Socket.IO entry
  pty-manager.ts      node-pty terminal sessions
  socket-handlers.ts  realtime terminal I/O
  proxy.ts            reverse proxy
  tunnel.ts           Cloudflare quick-tunnel management
start.sh              builds, installs cloudflared, runs server + tunnel
```
