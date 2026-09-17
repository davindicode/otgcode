# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- File explorer **Move** — a Move item in each entry's menu turns the explorer
  into a destination picker: the toolbar's controls are replaced by "Move to
  this directory" and Cancel, the entry being moved is highlighted, row menus
  are hidden, and only folders stay clickable. Cancel returns to the folder the
  move started from. Backed by a dedicated endpoint that refuses to overwrite
  an existing name, refuses a folder into itself, and falls back to copy-delete
  across filesystems — `fs.rename` would silently clobber the destination.

## [0.2.0] - 2026-09-17

A big step toward a proper app: installable, themed, with settings and
workspace state that persist on the host. Still alpha.

### Added
- **Light theme**, with a Dark/Light switch in Settings. Every colour now
  resolves to a semantic token (`surface`, `ink`, `line`, …) defined once in
  `app.css`, so both themes stay consistent; the terminal and code editor
  palettes follow the app theme. The theme is resolved server-side and rendered
  into `<html>`, so there is no flash of the wrong theme on load.
- **Persisted workspace** — the pane split, open explorer tabs and their paths,
  open terminal tabs and their directories, the terminal font size and the
  theme are saved to `~/.otgcode/workspace.json` on the host and restored on
  the next load. Settings save themselves the moment you change them, and
  because they live on the host rather than in browser storage they follow you
  across refreshes, reconnects and devices.
- **Installable as an app** — web app manifest, standalone display, maskable
  icons, iOS home-screen meta and safe-area padding, so it behaves like a
  native app when added to a home screen.
- Terminal font size is now a Settings control, alongside the theme.
- **Optional access password** — a Settings toggle (off by default) that puts a
  login in front of the whole app. Enforced server-side on every HTTP route,
  the `/proxy/:port` reverse proxy (including WebSocket upgrades) and the
  Socket.IO handshake, so the terminal cannot be reached by talking to the
  socket directly. The password is stored as a salted scrypt hash in
  `~/.otgcode/config.json` (mode 600) and sessions are signed cookies; changing
  or removing the password invalidates every existing session. Failed attempts
  back off exponentially instead of locking the account, so nobody can shut the
  owner out of their own machine.
- **Settings panel** — a cog in the header, next to the info icon, holding the
  access-password controls and a sign-out action.
- Tunnel startup now prints a privacy warning next to the Quick Tunnel URL,
  naming the user whose shell the URL exposes and pointing at the password
  setting when none is configured.
- Media previews now show an informative browser, codec, or network error when
  a video or audio file cannot be played.
- App-wide offline/reconnecting gate: the interface dims and becomes fully
  non-interactive while the server socket is disconnected, with a spinner and
  animated connecting message until the VPS connection is ready.
- Image viewer: **Replay** button for GIFs (restart a play-once animation).
- Video/audio viewer: **loop toggle**, plus `playsInline` and `preload=metadata`.
- File open: **Cancel** button while a large file is loading, so a misclick can
  be backed out instead of waiting.
- File explorer: **drag-and-drop upload** — drop files onto the explorer panel
  to upload them to the current directory (with a drop overlay).
- App-wide **toast notifications** — small popups centered at the top, above all
  widgets; click to dismiss (slides out) or auto-dismiss after 3s. Used to
  surface previously-silent errors: failed directory navigation, tmux session
  load failures, and `cd` directory-picker failures.
- Breadcrumbs: a **Go** button to submit the edited path (on-screen alternative
  to Enter, handy on mobile).
- File explorer **multi-select mode** — a toolbar Select button enters selection
  mode and changes to Cancel, while each row's 3-dot becomes a checkbox. The
  toolbar also shows the selection count, Select all/None, and a group actions
  menu. Group actions: **Download** and **Delete** with a recursive-folder warning
  when folders are included.
- **Folder downloads** — download a folder as a recursive `.zip` from its menu,
  and group downloads bundle the whole selection (files + folders) into one zip
  (streamed server-side via a new `/api/files/download-zip` endpoint).
- **Folder uploads** — upload whole folders via a new "Upload folder" button
  (`webkitdirectory`) or by dragging a folder onto the explorer; nested
  structure is recreated server-side (with path-traversal protection).

### Changed
- **Localhost previews moved out of the third panel** into a popup under a new
  globe icon in the header. Every row was a single line and "Go" opens a real
  browser tab, so it never needed a column; desktop is now a two-pane split.
- **Desktop layout is two panes** — explorer and terminal — with the explorer
  at 1/4 width by default, still draggable (double-click the divider to reset)
  and now with a minimum width so its toolbar stays usable.
- **Mobile tab bar is two tabs** — Files and Terminal — matching the desktop
  focus.
- The file explorer toolbar scrolls horizontally when its controls outgrow the
  pane (entering select mode on a narrow explorer), instead of squashing them.
- Every popup in the app now behaves the same way: its trigger toggles it,
  stays highlighted while it is open, and opening one closes any other. This
  covers the header icons and each file row's 3-dot menu, where clicking the
  button while its menu was open previously closed and immediately reopened it.
- Default terminal font size is now 8 (was 6).
- The header info icon is now a proper toggle: it highlights while its popup is
  open and a second click dismisses it (previously a click on the icon while
  open closed and immediately reopened the popup).
- File downloads and inline media previews now stream from disk with HTTP range
  support, improving large-video loading and seeking without buffering the
  entire file in server memory.
- Opening image/PDF/video/audio files no longer reads the whole file as text
  first — they stream straight from the file API, so large media/PDFs open
  immediately instead of hanging.
- PDF viewer renders pages lazily (only as they scroll into view) instead of
  mounting every page up front, so large PDFs no longer choke.

### Fixed
- Terminal reconnects now clear stale tmux mouse/focus input modes before a
  replacement shell starts, preventing mouse movement from appearing as raw
  escape-sequence text after a connection loss.
- PTY replacement and disconnect cleanup are socket-owner and generation safe;
  stale socket callbacks can no longer delete, write to, resize, or kill a
  newly reconnected terminal with the same client session ID.
- Multi-byte toolbar controls (including tmux detach and Vim exit) are sent as
  one input operation so delayed trailing keys cannot cross a reconnect.
- Server console no longer floods with "No route matches URL" stack traces for
  unmatched URLs (bot/scanner probes on the public tunnel). A custom
  `handleError` swallows expected 404s and an Express handler returns a clean
  404; real errors still log.
- Upload race: the explorer no longer briefly unfreezes between an upload
  finishing and the tree refreshing, so navigating during that window can't get
  reset back to the upload directory. It stays frozen until the refreshed tree
  is ready, and the same freeze now covers the multi-select group delete.
- Centering/truncation of the file path on the opening/error screens.
- Path edit mode: the up/breadcrumb navigation is now disabled while editing the
  path, so the tree can no longer desync from the frozen text field.

### Security
- Resolve all production dependency vulnerabilities (`pnpm audit --prod` clean):
  - Bump `react-router` family 7.12.0 → 7.18.0 (DoS, XSS, CSRF, turbo-stream RCE).
  - Bump `http-proxy-middleware` → 3.0.7 (multipart field injection / router bypass).
  - Add version-scoped pnpm overrides for patched transitive deps: `dompurify`,
    `ws`, `qs`, `path-to-regexp`, `picomatch`, `follow-redirects`, `postcss`,
    `@babel/core`, `undici`; update `vite` to 7.3.6.
- Remaining advisories are dev/build-tooling only and not in the production
  runtime (`lodash` via `@react-router/dev` has no published fix; the low-severity
  `esbuild` dev-server advisory is not reachable through `tsx`'s usage).

## [0.1.1] - 2026-06-13

### Added
- **Download** action in the file explorer dropdown — download any file without
  opening it first (works on mobile and desktop).
- **Copy path** action in the file explorer dropdown — copy the absolute path of
  a file or folder to paste into the CLI, with a clipboard fallback for contexts
  where the Clipboard API is unavailable.
- Editor **Plain** view mode backed by a native textarea, so mobile native
  selection and Select-All work for copying code/logs (Monaco's custom-rendered
  editor does not support this on touch). Available on desktop too.
- Image viewer: desktop **click-and-drag to pan** a zoomed image (hand tool),
  matching the touch swipe/pinch controls on mobile.

### Changed
- Arrow keys are now pinned to the end of the persistent terminal key bar
  (Enter · Bksp → Esc · Tab · PgUp · PgDn · y · n → ↑ · ↓ · ← · →).
- Moved y/n keys into the persistent nav bar and removed duplicate code-tab keys.

### Fixed
- Cloudflare quick tunnel robustness: cloudflared output is now logged, the
  promise resolves immediately on early exit instead of a 30s silent wait, and
  startup retries up to 3 times before falling back to local-only.
- Quick tunnel is isolated from any system-wide `cloudflared` config so a global
  ingress catch-all can no longer hijack quick-tunnel traffic.
- File explorer dropdown menu now stays attached to its entry on scroll, clamps
  to the pane boundary instead of overflowing on mobile, and flips upward for
  bottom entries so it is never clipped.
- Markdown preview now renders local images/video referenced by relative or
  absolute on-disk paths (e.g. a README's `public/logo.png`) by routing them
  through the file API, instead of showing a broken-media icon.
- Per-terminal `cd` picker state and correct tmux pane resolution.

## [0.1.0] - 2026-04-19

- Initial public release.

[Unreleased]: https://github.com/davindicode/otgcode/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/davindicode/otgcode/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/davindicode/otgcode/releases/tag/v0.1.0
