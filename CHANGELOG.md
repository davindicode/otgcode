# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
- File explorer **multi-select mode** — a "Select" item in an entry's menu enters
  select mode, where each row's 3-dot becomes a checkbox and the Hidden toggle is
  replaced by a selection count, Select all/None, a group actions menu, and
  Cancel. Group actions: **Download** and **Delete** with a recursive-folder
  warning when folders are included.
- **Folder downloads** — download a folder as a recursive `.zip` from its menu,
  and group downloads bundle the whole selection (files + folders) into one zip
  (streamed server-side via a new `/api/files/download-zip` endpoint).

### Changed
- Opening image/PDF/video/audio files no longer reads the whole file as text
  first — they stream straight from the file API, so large media/PDFs open
  immediately instead of hanging.
- PDF viewer renders pages lazily (only as they scroll into view) instead of
  mounting every page up front, so large PDFs no longer choke.

### Fixed
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
