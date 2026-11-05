# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-31

A rebuilt interface: one tab strip in place of the fixed split panels and the
separate mobile tab bar, with the split now an optional two panes on a wide
screen; tmux as a tab kind, an access password on by default, light and dark
themes, and a workspace that is saved on the host rather than in the browser.

### Added

- **tmux tabs.** A tmux tab runs `tmux new -A` rather than a shell, so a
  dropped phone or a closed laptop re-attaches to the same session instead of
  landing in a fresh shell beside it. `+` → tmux session opens a picker to
  attach, create or kill, and closing the tab only detaches. Renaming the tab
  renames the session, so the strip and the picker cannot disagree.
- **In-session tmux controls** on tmux tabs — windows, panes, copy mode and
  session actions, with any window reachable by index rather than only the
  first few.
- **An access password, set up on first run.** A fresh install asks for one
  before the app opens; declining takes a deliberate second step that repeats
  what the tunnel exposes. Enforced server-side on every route, the localhost
  proxy including WebSocket upgrades, and the Socket.IO handshake, so the
  terminal cannot be reached by talking to the socket directly. Stored as a
  salted scrypt hash in `~/.otgcode/config.json` (mode 600); sessions are
  signed cookies, and changing or removing the password signs every device out.
  Failed logins back off exponentially rather than locking out, so a stranger
  with the URL cannot deny you your own machine.
- **Stay signed in until I close the browser**, on the login screen. Nothing is
  written to disk either way, so closing the browser ends the session;
  unticked, it also expires after 30 minutes. Password fields have a show/hide
  toggle, on the login screen and when setting one.
- **An account popup** under its own header icon: the user the shell runs as,
  how long the session has been open, and sign-out. Setting or changing a
  password is its own dialog.
- **One device at a time.** The open tabs and their terminals are a single
  workspace on the host, so the server admits one device and tells a second who
  holds it and since when. There is no take-over button — anyone who reached
  the tunnel URL could otherwise pull a live terminal away from whoever was
  using it — so the second device waits, with **Check now** to ask again. tmux
  sessions keep running throughout, and two devices on one terminal is what a
  tmux tab is for.
- **A confirmation before a close that cannot be undone, and only then.** A
  terminal says it takes its processes and scrollback with it, a file with
  unsaved edits says they are lost, and killing a session from the picker gets
  a red button. A tmux tab and a file with nothing unsaved just close.
- **Light theme**, with a Dark/Light switch in Settings. Every colour resolves
  to a semantic token defined once, including the terminal and editor palettes,
  and the theme is rendered server-side so there is no flash of the wrong one
  on load.
- **The workspace is saved on the host** — `~/.otgcode/workspace.json` keeps the
  theme, both font sizes, custom commands, and every open tab in order with its
  directory, file or tmux session. Preferences save as you change them and
  follow you across refreshes, reconnects and devices.
- **Installable as an app** — manifest, standalone display, maskable icons, iOS
  home-screen meta and safe-area padding.
- **A split view on a wide screen.** Appearance offers one pane or two side by
  side, with a divider to drag — a file in the left pane and a terminal in the
  right. Each pane keeps its own tab strip, its own `+` and its own active tab,
  and a tab moves between them by being dragged onto the other strip. Below
  900px, or on a screen taller than it is wide, one pane is drawn at a time and
  Settings grows a Left / Right switch for which one. Each pane still keeps its
  own tabs there, so turning a tablet landscape restores both columns with
  everything where it was.
- **One action keyboard**, with five modes: `main` plus a keyboard per
  CLI — claude, codex, opencode — and git. `main` carries the key set (nav,
  numbers, letters, function, symbols) and a sticky modifier (Shift, Ctrl,
  Ctrl+Shift, Alt, Alt+Shift) beside it. The keys row never grows, so opening
  the keyboard cannot change how much terminal you can see.
- **Bksp and the arrow keys sit beside Enter** in a coding CLI's keys, since its
  prompts are an arrow-key list and its typos are taken back with Bksp.
- **Each CLI's keys read from what that CLI actually binds.** opencode drives
  almost everything from a leader key, so its buttons send `ctrl+x` and the key
  together — the sidebar, sessions, agents, models, compaction, undo and redo
  are all reachable now. Claude Code gained its todo list, fast mode, queue and
  send-now, stop-all-agents and undo.
- **A launch button per CLI**, bare and without permission flags — start it,
  then confirm in the CLI itself.
- **Custom commands and custom slash commands**, added, edited and removed from
  the keyboard and saved on the host. Slash commands are kept per CLI, so the
  same label can mean different things in claude and codex.
- **Move mode in the explorer** — pick an entry, browse to where it belongs,
  drop it there. Refuses to overwrite, refuses a folder into itself, and copies
  instead of renaming across filesystems.
- **Multi-select in the explorer**, with select all/none, a count, and group
  download or delete.
- **Folder downloads and uploads** — a folder downloads as a recursive zip and a
  group download bundles the whole selection; folders upload by picker or by
  dragging them in, with the nested structure recreated on the host. The tree is
  walked before the archive is written, so an unreadable file is named in an
  `UNREADABLE.txt` inside it rather than truncating it; a symlinked file arrives
  as its bytes, and a symlinked directory is left out rather than followed.
- **Drag-and-drop upload**, with progress and per-file cancel, and chunked
  upload above 80 MB to clear Cloudflare's request limit.
- **Reload a file in place**, for every type, since a file can change under an
  open tab whoever is changing it.
- **A file changing on disk is noticed, and never overwritten unasked** — the
  editor carries the version it read, and a save that would land on something
  newer is refused and says so.
- **Ctrl/Cmd+S saves** in the editor instead of opening the browser's save
  dialog, with undo/redo buttons for phones.
- **One screen for a file the app cannot display**, naming the file and its
  size, explaining why, and offering the download, with raw bytes one tap away.
  Unsupported formats are detected from content rather than an extension list,
  so HEIC, `.docx` and whatever arrives next are all covered.
- **A reset for terminal and tmux tabs** that both resets the modes and
  repaints, which is what recovers a terminal a program left capturing the
  mouse.
- **Viewer tabs are restored on reload** along with terminal and explorer tabs.
- **Toasts** for what used to fail silently — a failed navigation, a tmux
  listing, a directory picker.
- **Startup output worth reading**: a progress spinner per step with its
  duration, the LAN addresses beside the tunnel URL, a check that the tunnel
  actually serves the app, and a privacy warning naming the user whose shell
  the URL exposes. Animation is TTY-only, so a piped log prints each step once.
- **Connection latency** in System Info, coloured by quality.
- `start.sh --port N` for running on something other than 7777.
- The lock screen names the user and host — `deploy on bastion` — which is what
  tells several open tabs apart.
- Media previews explain a browser, codec or network failure instead of failing
  blank, and offer the download.
- GIF replay, an audio/video loop toggle, and a Cancel while a large file loads.
- **A short drop no longer costs you the shell.** A plain terminal's process
  keeps running for a minute after the connection goes, and a reconnect picks
  it up where it was with whatever it printed in the meantime — so a walk past
  a dead spot does not kill a build. A minute and no more: longer is what tmux
  is for, and closing the tab still ends it there and then. A tmux tab needs
  none of this and gets none, since tmux is already the thing that survives.
- **Equations are typeset in markdown preview** — `$...$` inline and `$$...$$`
  display through KaTeX, including the multi-line form a paper's worth of
  algebra actually arrives in. Prices and shell variables are left as written.
- **Work in progress survives a page torn down under you.** A phone evicts a
  backgrounded tab and reloads it silently, and the workspace used to come
  back with every editor showing what was on disk — which looks like nothing
  was lost, and is exactly when something was. An editor's unsaved buffer, a
  half-written commit message, an explorer's directory and how a file was
  being looked at are kept in the browser, bounded and expiring. Closing a tab
  is a decision, so it throws its buffer away.
- **The session gate comes before the password.** Another device holding the
  session is answered by the status endpoint now, so a second device is told
  who has it rather than asked for a password that could only land on the same
  screen with the first device's tabs showing through it.
- **Drag a row onto a folder to move it there.** Hold a file or folder in the
  explorer until it lifts, then drag it onto any folder in the listing and let
  go. A mouse skips the hold and drags straight away. The destination-picking
  mode is still there for a folder that is not in front of you; this is for
  the one that is. Holding and letting go without moving opens the row's menu,
  as the long press always did. Near the top or bottom of a long listing the
  rows creep past, so a destination off the screen is still reachable.

### Changed

- **One tab strip.** The fixed split panels, per-panel tab rows and separate
  mobile tab bar are gone: every tab — terminal, tmux, explorer or an open file
  — lives in one VS Code-style strip, and `+` asks which kind to create. Opening
  a file spawns its own tab, so an explorer stays a file browser; the tab lands
  next to the explorer it came from, and closing it returns there. A split is
  now something you ask for rather than the shape of the app — see **A split
  view on a wide screen** above.
- **The nano, vim and tmux command wrappers are gone**, replaced by tmux as a
  tab kind.
- **A fresh start opens on an empty board** rather than a shell you did not ask
  for, and closing every tab stays that way across a reload.
- **Drag a tab to reorder it** — hold-and-drag on a phone, so a swipe still
  scrolls the strip. The order is saved.
- **Each tab keeps its own keyboard state** — open keyboard, typed text, chosen
  CLI, commit message — instead of carrying your half-typed command between
  sessions.
- **The action keyboards are three tabs**: keyboard, commands and navigate, plus
  a tmux tab's own session controls. The text input is one line and scrolls
  inside itself rather than moving the bar below it as you type, and the git
  keyboard's commit and config forms share one line.
- **100% zoom means the whole image or page is visible**, measured from the
  pane, rather than one image pixel per screen pixel — a phone photo is
  thousands of pixels wide, so 100% used to mean a corner of it. The tooltip
  gives the true ratio.
- **Text files open in Plain and markdown in Preview**, never straight into
  Edit.
- **A material system for controls** — a vertical gradient, a lit top edge, a
  tight drop shadow and a real pressed state, at developer-tool density.
  Overlays that float above content are frosted glass; list rows and the
  terminal stay flat, since a backdrop filter over a canvas costs a lot and
  buys nothing. Two radii, 6px for controls and 10px for panels.
- **Content recedes and chrome advances in both themes.** The terminal is the
  darkest surface in dark mode and shares the explorer's paper in light; the
  header sits a step apart from the tab strip; light-theme ANSI colours were
  re-checked against the new ground. Light mode inverts the dark layering
  deliberately rather than washing it out, which is what lets a near-white
  control read as raised.
- **Every text input shares one definition**, replacing seven near-duplicates
  that had drifted apart in surface, border and focus ring. Rejected input
  shows it on the field itself.
- **Every popup behaves the same way**: its trigger toggles it, stays
  highlighted while open, and opening one closes any other. Popup headers stay
  put while their content scrolls.
- **Font sizes are global settings**, one control each for terminal and editor,
  and the editor's is remembered rather than reset on every file open. The
  default terminal size is 8.
- **Localhost previews moved into a popup** under a globe icon, since every row
  was one line and Go opens a real browser tab.
- The header dropped its online/offline pill — losing the connection raises the
  full-screen gate anyway — and its version number, which moved into System
  Info.
- Tabs carry an icon for what they hold, and every tab has a close button.
- Theme switching cross-fades; input drawers slide.
- Switching to a labelled selector's menu highlights its label, rather than
  moving a caret at a slightly different vertical centre.
- The empty board says **"No tabs open"**, which fits a phone.
- The terminal's controls are pinned right, matching the explorer's.
- **Filesystem errors say what went wrong** — `"TODO.md" is a file, not a
  folder`, `No such folder "saves"`, `Permission denied` — rather than relaying
  an errno and a syscall name.
- File downloads and inline media stream from disk with range support, so
  large video seeks without buffering the file in server memory, and images,
  PDFs, video and audio are no longer read as text first.
- PDFs render pages as they scroll into view rather than mounting every page.
- The explorer toolbar scrolls when its controls outgrow a narrow pane.
- **Platform support is a statement rather than a half-implementation**: Linux,
  macOS, and Windows through WSL2. `start.sh` stops immediately under Git Bash,
  MSYS or Cygwin with a pointer to WSL2, instead of failing later on the native
  module. The docs gained a support matrix, per-distro prerequisites, a WSL2
  walkthrough and a troubleshooting section.
- `start.sh` prints a failing step's real log and exit code instead of hiding
  it behind tidy output.
- **A tab crossing panes looks like a tab being moved.** The drag drew its own
  brighter blue ring, on the tab in the strip it left and on the ghost showing
  where it would land, so taking a tab to the other pane read as a different
  kind of operation from reordering one in place. Both are the selected tab's
  own pill, shaded — the difference between the two cases is that crossing
  panes keeps the original in place as well, which is the duplicate, not a
  colour.
- **The tab strip and the pane divider each do one thing.** Dragging the
  selected tab reorders it and dragging any other slides the strip, with no
  stray selection where a drag ends and nothing for Safari's own scrolling to
  fight. The divider is a grid track of its own, so neither pane puts anything
  under it — an editor's scrollbar used to take the press — and it stays lit
  for the whole drag.
- **The lock screen's session note is a tooltip** beside the tick rather than a
  line of footer, and only the tick and its words toggle it. The
  already-open screen is down to one line too — what to do about it, with no
  paragraph underneath explaining the app to someone already using it.

### Fixed

- **The explorer accepted a delete or a move silently and left its buttons
  live.** Deleting a deep folder or moving something large takes a while, and
  the confirmation dialog stayed up with its button pressable for the whole of
  it — a second tap ran the whole thing again. Every write to the tree now
  closes its dialog first and then runs with the explorer frozen under a
  `Deleting big...` / `Moving big...` / `Renaming...` spinner, the way an
  upload already reported itself, so nothing is clickable and nothing is
  unexplained until the new listing is in. The same window after an upload
  finishes is covered too: navigating in it used to reset you to the upload
  directory.

- **The caret jumped to the end of the file while editing.** Saving sends the
  buffer and the pane hands back what it wrote, which the editor took up as
  though the file had changed underneath it. Over a tunnel a write takes long
  enough to keep typing through, and when the older bytes came back Monaco
  replaced its whole document with them — the caret landing at the end of the
  file, and the characters typed in the meantime gone. A save's own echo is
  recognised now and left alone, and the unsaved mark comes from the save
  itself: clean if the buffer still matches what was written, dirty if it has
  moved on.
- **Text sent from the input box reached the terminal as keystrokes.** Send
  wrote the message down the same channel as a keypress, so to the program on
  the other end it was someone typing four hundred characters in a
  millisecond — and every one of them a key it might have a binding for.
  opencode binds a bare `!` to its shell mode and the check that gates it does
  not re-run inside a burst, so a question with a `!` in it flipped the prompt
  partway through and the whole thing went to bash, which answered `syntax
  error near unexpected token '('`. Text is now sent as a paste, wrapped in
  the bracketed paste markers when the program has asked for them, which is
  what tells a TUI it is holding text and not keys. Everything that composes a
  command line goes the same way — the git drawer's commit message, the
  directory drawer's `cd`, your own saved commands — because a path or a
  commit message is as free to hold a `!` as a sentence is, and quoting it for
  the shell never said anything about the program in between. The Enter is a
  separate keystroke, so the newline that used to ride along inside a message
  is gone with it. Quick keys and the slash-command chips still go as keys:
  reaching the program's own bindings is what they are for.
- **A large GIF opened at the wrong size and then jumped.** The viewer waited
  for `onLoad` to learn the image's dimensions, which for an animated GIF is
  the last frame — seconds after the first one is already on screen, during
  which it rendered at 1:1 and filled the pane with a corner of itself. It is
  capped to the pane until then, so the first paint is already fitted.
- **`./start.sh` on Linux crashed with `Failed to load native module:
  pty.node`.** node-pty ships binaries for macOS and Windows only and compiles
  elsewhere, but pnpm 10 skips a dependency's build scripts unless it is
  allowlisted — while still exiting 0, so the failure surfaced later as a stack
  trace. node-pty is allowlisted, `node-gyp` is a pinned devDependency because
  pnpm supplies none, and a Native modules step loads the module to check:
  a compile that runs is not the same as one that worked, and an outdated
  node-gyp produces a `pty.node` that segfaults on every load. The same check
  catches a binary built for another Node version or machine, so an nvm switch
  or a shared `node_modules` repairs itself.
- A missing toolchain stops with the install command for your distro, and a
  note for machines without `sudo`, rather than a page of compiler output.
- **A file with a non-ASCII name could not be downloaded at all.** Both header
  APIs reject a character above 255, so `ファイル.txt` failed its own download —
  500 from the zip route, 400 from the single-file one — while an accented Latin
  name slipped through only because it fits in one byte. Downloads now send the
  RFC 6266 pair: a flattened ASCII `filename` and a percent-encoded UTF-8
  `filename*`. The same flattening closes the zip route's name, which comes
  from the query, against a newline that would otherwise add a header.
- **An uploaded file with a non-ASCII name arrived mangled** — `テスト.txt`
  was written as `ãã¹ã.txt`, every UTF-8 byte having become its own
  character, because the multipart parser defaults a filename to latin1 while
  browsers send UTF-8.
- **Switching away from a terminal tab and back could kill a running TUI**, with
  its mouse reporting left on. A hidden pane has no measurable size, so the
  terminal was being resized to a fraction of its real one; it is only measured
  while on screen.
- **A terminal left capturing the mouse recovers.** Escape sequences printing as
  text on every pointer move mean a program enabled mouse reporting and exited
  without turning it off. The modes were only reset when the connection
  dropped, and here nothing dropped.
- **A tab stopped responding after a reconnect.** Recreating terminals keyed off
  a status field that could disagree with the server, leaving a tab that looked
  fine, ignored every keystroke and never redrew. Each session now carries the
  connection its terminal was created in.
- **The directory picker reported the wrong directory** on both tab kinds,
  answering with the home directory for a shell sitting somewhere else. It
  rested entirely on /proc, which macOS does not have, so there it could never
  read a directory at all and handed back the default every time — most
  visibly on reopening the drawer, which reset the picker to the login
  directory while the terminal had not moved. A tab's tmux client is found by
  the device its own pty is attached to rather than by hunting the process tree
  for something named `tmux`, and a plain shell's directory comes from /proc or
  from `lsof` depending on the platform. A directory it cannot establish is
  reported as one it cannot establish: the picker says so and offers no
  buttons, because every button in it sends a `cd` and a wrong one moves the
  terminal somewhere nobody chose.
- Stopping the server with Ctrl+C shuts the Cloudflare tunnel down; running the
  server directly used to leave it alive.
- **`start.sh` no longer kills cloudflared tunnels it did not start** — its exit
  trap reached other projects' and other users' tunnels on a shared machine.
- Terminal reconnects clear stale tmux mouse and focus modes before a
  replacement shell starts, and multi-byte controls are sent as one operation
  so trailing keys cannot cross a reconnect. Stale callbacks can no longer
  write to, resize or kill a newly reconnected terminal.
- **Markdown and notebook previews are sanitised.** `marked` passes raw HTML
  through by design, and a notebook's outputs are HTML, so a `<script>` or an
  `onerror` in a file ran in the app's own origin — the origin holding the
  session that drives the terminals. A README from a repo you cloned is enough,
  and "preview this file" should not be a sentence that can reach a shell.
  Everything bound for the DOM goes through DOMPurify.
- **An inline file no longer runs in the app's own origin either.** `inline=1`
  renders a file off the host under this origin and markdown preview links
  straight at it, so a local `.html` was the same hole one step out. Those
  responses carry `Content-Security-Policy: sandbox` and `nosniff`, which
  leaves the images, video and audio a preview actually loads untouched.
- **The editor's find bar could not be closed with the mouse.** Monaco's own
  tooltip opens above its button, which on a short widget means over it, and
  swallows the press — so Escape was the only way out of Ctrl+F, on every
  control in the bar.
- **A browser could pin the app to one build** by answering the document from
  its own cache after an update.
- Socket.IO no longer announces itself to every origin; the client is served by
  the same server, so a cross-origin socket was never a real one.
- The header regained its top padding, lost to a safe-area inset that replaced
  it on any device without a notch.
- File sizes format consistently — three copies of the helper had drifted, so
  the same file read `1.5 kB` in a viewer and `1.5 KB` in the explorer.
- The server console no longer floods with stack traces for bot probes on the
  public tunnel; real errors still log.
- Breadcrumb navigation is disabled while the path is being edited, so the tree
  cannot desync from the field, and a Go button submits it on a phone.
- A file with no extension no longer reports its whole path as its type.
- **Every opencode key did the wrong thing.** They were the old TUI's plain
  Ctrl chords, and on current builds `Ctrl+X` is the leader rather than cancel,
  `Ctrl+A` jumps to the start of the line rather than switching session, and
  the rest reached nothing. `Ctrl+L` is also described correctly now: it clears
  the input in Claude Code, not the screen.
- **A file's contents could be served from the browser's cache after it changed
  on disk.** Nothing under `/api` carried a `Cache-Control` header, an ETag or
  a `Last-Modified`, and every request for one file is the same URL — so a
  browser was free to answer a re-read from the copy it already had. A reloaded
  file showed its old contents, and the changed-on-disk watcher could keep
  reporting the version it first saw, which is why the notification sometimes
  never arrived. Nothing under `/api` is cacheable now; it all answers from the
  filesystem or the live host.
- **The navigate drawer showed the directory a terminal tab started in.** Its
  listing was fetched once, when the drawer was tapped open, and the drawer
  stays open across a tab switch — so returning to a tab re-showed the login
  directory however far the shell had moved. The directory is re-detected
  whenever the drawer is on screen, from the live pty or, on a tmux tab, from
  the window that tab's own client is looking at.

### Security

- **Every dependency advisory this release could take is taken, and `pnpm audit`
  exits clean.** The `react-router` family moves to 7.18.4 (DoS, XSS, CSRF,
  turbo-stream RCE, RSC-mode CSRF bypass), `http-proxy-middleware` to 3.0.7
  (multipart field injection / router bypass), and version-scoped overrides pin
  patched transitive dependencies.
- **`engine.io` and `socket.io-parser` were the urgent ones**, because both sit
  on the pre-auth path of a tunnel anyone with the URL can reach: the Socket.IO
  gate runs after the handshake and after a frame has been parsed. Three
  advisories land there — polling-transport connection exhaustion, a
  protocol-revision mismatch on upgrade, and zero-attachment memory exhaustion.
- One advisory has no published fix: `braces` stack exhaustion on deeply nested
  patterns, where `micromatch` still depends on the latest release. It is
  unreachable here — neither proxy passes a path filter, so no pattern is ever
  compiled from input — and is recorded in `pnpm.auditConfig` with that
  reasoning rather than left to sit red, which is how a real advisory gets
  missed.

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

[Unreleased]: https://github.com/davindicode/otgcode/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/davindicode/otgcode/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/davindicode/otgcode/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/davindicode/otgcode/releases/tag/v0.1.0
