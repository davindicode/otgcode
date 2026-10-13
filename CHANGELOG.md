# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-13

### Added

- **One device at a time, and a second one waits.** Two devices on the same
  tunnel used to break each other silently: every device restores the same
  workspace file, so they use the same tab ids, and creating a pty for an id
  that already has one kills the existing one. The first device was never told
  — its terminal looked connected and did nothing. The server now admits one
  device and tells the second who holds it and since when. There is no take-over
  button: it would let anyone who reached the tunnel URL pull a live terminal
  out from under whoever was using it, by mistapping on a phone. Waiting is the
  safe default, and **Check now** asks again on demand rather than polling,
  since only the other device can give the session up. tmux sessions keep
  running through all of it, and two devices on one terminal is what a tmux tab
  is for.
- **A confirmation before a close that cannot be taken back.** The X is a few
  millimetres from the tab you meant to tap. A terminal says it takes its
  processes and scrollback with it, a tmux tab says it only detaches and that
  the session keeps running, and killing a session from the picker gets the red
  button. Closing a file just closes — it returns you to the explorer it came
  from — unless it holds edits that are not on disk, where the confirm reads
  "Discard and close". A dialog on every close would be something to dismiss
  twice a minute, which is how the one that matters gets waved through.
- **One dead end for every file the explorer cannot show.** It used to end four
  different ways — a broken-image icon with a toast beside it, "Failed to load
  PDF" in red, an error with a Retry that could never succeed, and a grey line
  for a kind no viewer claimed. All of them now say what cannot be done, name
  the file and its size, explain why, and offer the download, because the file
  is still perfectly readable by something on your device. Unsupported formats
  are detected from content rather than an extension allow-list — a NUL byte in
  the first 8000 bytes, git's own rule — so HEIC off an iPhone, a `.docx`, and
  whatever lands there next are all covered, with the raw bytes one tap away.
- **A keyboard per thing you type at.** The composer's text, combos, code and
  git tabs were four repetitions of one shape — a bar of keys with something
  above it qualifying them — so they are modes of one tab now, and the strip
  went from six tabs to three. The primary menu lists five: main, claude,
  codex, opencode, git. Which keys main shows is a setting of main, beside the
  modifier it already had, so the row reads `main  mode: nav  combo: none`.
  The keys row never grows, so opening the keyboard cannot change how much
  terminal you can see.
- **Bksp and the arrows sit beside Enter in a coding CLI's keys.** Its prompts
  are an arrow-key list and its typos are taken back with Bksp, so both were a
  sector switch away from the Enter that answers them. Ordered as a hand wants
  them: Bksp, up/down for the choice, left/right for the ones that read
  sideways.
- **Shift joined the combo modifiers**, which is what capitals needed to be
  reachable at all. Shift+Tab sends back-tab `CSI Z` rather than the generic
  form, because that is what cycles permission modes in Claude Code and
  reverse-completes in a shell. Letters are labelled in capitals throughout,
  since a key is labelled with the key and not its output — `A` sends `a`, the
  same bargain a physical keyboard makes — and the tooltip spells that out
  where it differs visibly.
- **An account popup**, as a fourth header icon: who you are on the host, how
  long this session has been open, and the way to end it. Signing out was
  living in Settings, which is for how the app behaves — ending what you are
  doing is not a preference. Changing or setting a password is its own dialog
  rather than a form inside a panel.
- **A reset button for terminal and tmux tabs**, right-aligned on the composer
  row so it sits in the same place whichever tab it is. It does both halves,
  because neither fixes the other: the mode reset stops a dead program's mouse
  reporting, and the repaint clears what it left on screen.
- **Reload a file in place**, where the close button used to be — the tab strip
  already closed it, so that X was a second way to do one thing. Every type
  re-reads, since a file can change under an open tab whoever is doing the
  changing.
- **A file changing on disk is noticed, and never overwritten unasked.** The
  editor carries the version it read — modification time and size, the pair
  every editor has used for this — and a save that would land on something
  newer is refused and says so, rather than quietly winning.
- **The tmux controls work from a phone.** The window digits 0-5 could only
  ever reach the windows that fitted on a row; the top line now takes any
  index — type it, press Go — and runs `select-window` on the server rather
  than typing into tmux's command prompt, which measurably cannot be driven by
  a burst of keystrokes and swallows every key after the attempt.
- **The lock screen names the user and the host** — `deploy on bastion` — in
  place of a sentence explaining what a password field is for. With several
  OTGCode tabs open, which machine this one is matters more than the
  instruction.
- `start.sh` takes `--port N` (and `-p`, `--port=N`, `--help`) for running on
  something other than 7777, validated as a number in range before anything
  starts.
- **Drag a tab to reorder it.** A mouse picks a tab up once it has moved too
  far to be a click; a finger needs a short hold first, so a swipe still
  scrolls the strip. The order is saved with everything else.
- **Renaming a tmux tab renames the session.** The title was only ever a
  label, so the session kept its old name — the picker still listed it, and a
  reconnect attached by it. tmux also rewrites `.` and `:` in a session name,
  so the tab now shows the name tmux settled on rather than the one that was
  typed, and the two cannot drift.
- **Each terminal and tmux tab keeps its own bottom-bar state** — open group,
  typed text, chosen CLI, commit message. One shared bar carried your
  half-written command between sessions, and could leave the tmux group open on
  a tab with no tmux behind it.
- **A password is the default on a fresh install.** First start asks you to set
  one before the app opens. Declining takes a second step that repeats the
  tunnel warning — anyone with the URL gets a terminal as you — and says a
  password can be turned on later from Settings. The choice is recorded, so
  the prompt appears once.
- Login has a **Stay signed in until I close the browser** checkbox. The
  session cookie is never persisted now, so closing the browser always ends
  the session; unticked, it also expires after 30 minutes so coming back later
  asks again. Previously a login was remembered for 30 days on disk, which
  left a shell reachable on an unlocked device for a month.
- Password fields have a show/hide toggle, on the login screen and when
  setting one.
- **Ctrl/Cmd+S saves the file** in the code editor instead of opening the
  browser's save-page dialog.
- **Undo/redo buttons** in the editor toolbar, so the shortcuts are reachable
  on a phone. They grey out when there is nothing to undo or redo.
- The editor's Edit/Plain/Preview switch is a dropdown rather than up to three
  side-by-side buttons, freeing width in a bar that also carries the file path.
- Startup prints the LAN addresses the server is reachable on next to the
  tunnel URL — on the same network that skips DNS and Cloudflare entirely —
  and checks the tunnel actually serves the app. Only the tunnel URL is
  highlighted; the local addresses are dimmed as reference detail, so the one
  address worth copying is unmistakable.
- System Info shows **connection latency** to the server alongside the app
  version, coloured by quality — green under 100ms, amber to 300ms, red beyond
  — with deeper shades in the light theme so each state stays legible.
- **Custom slash commands, per coding CLI.** Each CLI's slash row takes the
  same add/edit/remove treatment as cmds, saved separately for claude, codex
  and opencode — so the same label can mean different things in each, and
  removing one from claude leaves codex alone.
- **Custom commands.** The cmds group has an "add" button that opens a small
  dialog for a label and a command, and an "edit" toggle that turns every
  button into a remove target. Removed built-ins can be restored from the same
  view. Both lists are saved to the workspace file.
- Viewer tabs are restored on reload along with terminal and explorer tabs
  (which files were open, not unsaved edits).
- Startup now shows an animated **"Generating tunnel URL"** while waiting on
  cloudflared, so the wait reads as working rather than hung, and `start.sh`
  reports each step with a spinner, a tick and its duration. Animation is
  TTY-only — piped to a file or a CI log each step prints once instead of
  emitting thousands of carriage returns — and falls back from braille to
  ASCII spinner frames when the locale doesn't advertise UTF-8.
- File explorer **Move** — a Move item in each entry's menu turns the explorer
  into a destination picker: the toolbar's controls are replaced by "Move to
  this directory" and Cancel, the entry being moved is highlighted, row menus
  are hidden, and only folders stay clickable. Cancel returns to the folder the
  move started from. Backed by a dedicated endpoint that refuses to overwrite
  an existing name, refuses a folder into itself, and falls back to copy-delete
  across filesystems — `fs.rename` would silently clobber the destination.
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

- **A steadier composer.** The text field grew to three lines as you typed,
  moving the bar under it on every newline; it is one line now and scrolls
  inside itself. The git drawer's commit and config lines became one, switched
  by the same drop-up the combos use. `cd` moved to the first slot — and a tmux
  tab puts its own controls there instead, because a pane's directory is tmux's
  business, so `cd` was present and failing there.
- **One launch button per CLI, with no permission flags.** The purple row
  carried a variant per permission mode — yolo, plan, suggest, auto-edit,
  full-auto — and those flags move between releases, so several were already
  wrong. A button that passes a stale flag is worse than typing the one you
  meant. Each CLI now gets a single bare button, left of Enter: start it, then
  confirm.
- **100% zoom means the whole image, not one image pixel per screen pixel.** A
  photo off the same phone is 4000px wide, so 100% meant a tenth of one corner
  and a lot of dragging — 25% was the real fit. Scale is fit × zoom, with fit
  measured from the pane and never above 1, since a 48px icon stretched across
  a desktop pane is not what fitting means. The tooltip gives the true ratio.
  PDFs size to the pane the same way.
- **Text files open in Plain, and markdown in Preview** — never straight into
  Edit. Opening a file to read it should not put a cursor in it.
- A labelled selector shows its own name and lights it while its menu is open,
  rather than carrying a caret between the label and the value at a slightly
  different vertical centre. `mode:` and `combo:` each take a hue, so a label
  and its value read as one pair.
- The empty board says **"No tabs open"**. The sentence it replaced squashed on
  a phone, and the `+` in the header is the only thing it could have meant.
- The terminal's controls are pinned right, matching the explorer's, so the
  thing being chosen between is never sitting where a fixed control goes.
- One spinner, one reload glyph, one way to read a token: three near-duplicate
  definitions each collapsed to the one the rest of the app already used.
- **A fresh start opens on an empty board.** Installing used to spawn a shell
  before you had asked for anything; the first tab is now yours to pick with
  `+`, and closing every tab stays that way across a reload.
- The bottom bar's Send button is a glyph rather than the word, giving the text
  area back that width on a phone, and it sits at the bottom once the box has
  grown to several lines.
- **Filesystem errors say what actually went wrong.** Pasting a file path into
  the explorer's folder field reported `ENOTDIR: not a directory, scandir
  '/long/path/TODO.md'`; it now says `"TODO.md" is a file, not a folder`, and a
  missing folder, a permission problem or a full disk each read as themselves.
  One mapping covers every file operation, and a path that runs *through* a
  file is distinguished from one that is a file.
- **Platform support is a statement rather than a half-implementation**: Linux,
  macOS, and Windows through WSL2. `start.sh` had partial Windows handling that
  got far enough to look like it worked and then failed on the native module,
  so Git Bash, MSYS and Cygwin now stop immediately pointing at WSL2. The
  README gained a support matrix, per-distro prerequisites, a WSL2 walkthrough
  and a troubleshooting section.
- The header sits a step apart from the tab strip below it — lighter in dark
  mode, darker in light — so the two bars no longer read as one slab.
- **Content recedes, chrome advances, in both themes.** The terminal was
  lighter than the bars around it in dark mode, the opposite of light mode;
  it is now the darkest surface there and shares the explorer's paper in
  light, which was also toned down from near-white. Light-theme ANSI colours
  were re-checked against the new ground and seven were deepened to keep their
  contrast margin.
- **Light theme reworked.** It now inverts the dark layering deliberately:
  content is bright paper and the chrome around it (header, tab strip,
  toolbars) is grey-blue, which is what lets a near-white control read as
  raised. Controls previously sat at 1.02x the contrast of the bar they were
  on, against 1.38x in dark mode, so they effectively disappeared; that gap is
  now 1.32x and the two themes feel consistent.
- Toasts dropped their icon — the message already says what it is — and sit a
  step off the app behind them: lighter in the dark theme, darker in the light
  one.
- Popup headers stay put while their content scrolls — Settings, System Info
  and Localhost now cap their height and scroll the body, instead of scrolling
  the title and close button off the top.
- Modal backdrops are frosted glass rather than a flat dim wash — the
  connecting gate, confirm dialogs and the add-command dialog all share one
  scrim.
- Every text input in the app — settings, dialogs, the localhost port box, the
  terminal's own input — shares one definition, replacing seven near-duplicate
  styles that had drifted apart in surface, border and focus ring. Rejected
  input (a blocked port) now shows it on the field itself rather than only in
  the message beside it.
- The localhost popup's add button matches the tab strip's +.
- Tab strip picks up the same raised treatment as the rest of the controls:
  the + is a proper button and the active tab reads as lifted.
- Input group tabs are coloured by sector, so the strip reads at a glance:
  blue for what the terminal does natively (text, cmds, cd, combos), purple
  for the CLI tools launched from it (code, git), green for the full-screen
  programs (nano, vim, tmux).
- An active input group tab now lights its own label instead of bleaching it
  to white, which collided with the white button text inside the drawer. The
  selected state is a real glow plus a heavier weight and a thicker ring, and
  group-tab label colours are theme-aware — a blue that reads on a dark
  control is washed out on a bright one.
- The cmds group's add/edit controls moved onto their own row beneath the
  commands, so they no longer read as two more commands; edit highlights while
  active.
- Input drawers open and close more slowly (280ms) on a softer curve.
- **The terminal input is a tab group, not a pinned row.** "text" joins cmds,
  cd, combos and the rest; with no group selected the input area collapses to
  just the tab strip, giving the terminal the full pane.
- The terminal's text field sits evenly between the tab strip and the nav
  keys, and grows to three lines before scrolling inside itself — with no
  scrollbar, since the field visibly growing already says there is more.
- Switching theme cross-fades over 260ms instead of snapping. Canvas-rendered
  surfaces (terminal, code editor) still change instantly — they repaint their
  own colours and can't take part in a CSS transition.
- Input drawers slide open and closed instead of snapping, animating to each
  drawer's own height.
- The "Ctrl+" tab is now **combos** — it sends any modifier combination, not
  only Ctrl.
- **Font sizes are global settings.** The per-terminal and per-editor controls
  are gone; terminal and editor sizes each have one control in Settings and
  apply everywhere. Editor size is now remembered rather than resetting to a
  default on every file open.
- The header dropped its online/offline pill — losing the connection already
  raises the full-screen connecting gate — and its version number, which moved
  into the System Info popup.
- Opening a file puts its tab directly after the explorer it came from, and
  after any files already opened from that explorer, so a file sits beside its
  explorer and siblings stay in the order they were opened. Closing the file
  returns to that explorer rather than to whichever tab happens to be next.
- **One pane, one tab strip.** The split pane, the per-panel tab rows and the
  mobile tab bar are gone. Every tab — terminal, explorer, or an open file —
  lives in a single VS Code-style strip at the top, and `+` asks which kind to
  create. Opening a file from an explorer spawns its own tab and focuses it,
  so an explorer stays a file browser instead of turning into an editor;
  reopening a file that's already open just focuses its tab.
- **Controls sit where the pane's subject does.** The explorer keeps its
  breadcrumbs at the top and its actions in the bottom bar with the terminal's
  input; viewer and editor tabs put their file path and the few controls that
  go with it in one bar directly under the tab strip, where the explorer shows
  its path.
- A file's copy-path button now sits immediately beside the path rather than
  at the far right of the bar, so it reads as copying that path rather than as
  another toolbar action.
- Terminal text size moved with the rest of the terminal's controls into the
  input area, alongside Settings → Appearance.
- Every control in the terminal input area now uses the same raised treatment
  as the Send button, instead of flat fills with coloured borders.
- `start.sh` no longer hides a failing step behind tidy output: the captured
  log is printed under a ✗ and the step's real exit code is preserved.
- Tunnel startup no longer echoes cloudflared's "Requesting new quick Tunnel"
  progress line — the spinner already says that. Genuine failures still print.
- **Visual pass: a material system.** Controls now carry a subtle vertical
  gradient, a 1px lit top edge and a tight drop shadow, with a real pressed
  state that flips the light inward — the tactile quality of claymorphism at
  developer-tool density, without the padding and deep shadows that would bury
  a terminal and a file tree. Overlays that float above content (menus,
  popups, dialogs, toasts, the lock screen) are frosted glass; list rows and
  the terminal stay flat, since `backdrop-filter` over a canvas costs a lot
  and buys nothing. Adds a two-step radius scale (6px controls, 10px panels)
  in place of 81 bare `rounded` next to 12 `rounded-lg`, and replaces the
  global 7% press-squash with 3% for plain elements and none for controls that
  now depress on their own.
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

- **A slash-command chip never actually ran the command.** It sent the text and
  a newline in one pty write, and an Enter arriving in the same write as the
  text is not treated as a submit — measured against opencode, which read the
  whole thing as a prompt. The chips send the command alone now, which needs no
  timing guess.
- **A new tab could take a name already on the strip.** Close Explorer 1 while
  Explorer 2 is open and the next tab was a second Explorer 2: the name came
  from counting the tabs of that kind, which cannot see a closed one or a
  renamed one. The number is now the lowest one no tab is using, compared
  against every tab's name — the user reads one strip, and two tabs reading
  `Explorer 2` are confusing whatever is behind them.
- **The account popup said "Login — this session"**, which says nothing. It was
  the fallback for a token with no issue time, and logging in never re-read the
  status that carries it, so the time stayed unknown. The two-part token is
  refused now rather than accepted with the time missing, and the session's
  start is always real.
- **Switching away from a terminal tab and back killed a freshly started
  opencode**, leaving a Bun crash dump, "Illegal instruction (core dumped)" and
  its mouse reporting still on, so the shell underneath printed a pointer
  report for every movement. Nothing was being injected — it was a resize. A
  hidden pane has no layout box, so `getComputedStyle` hands back the
  `height: 100%` it was written with and the fit addon reads that as 100
  pixels, proposing about 17x9 on the way out of the tab. A terminal is only
  measured while it is on screen.
- **A terminal left capturing the mouse recovers.** `35;79;43M` scrolling past
  on every pointer move is an SGR mouse report printing as text: a program
  enabled mouse reporting and exited without turning it off, which is what a
  TUI interrupted mid-render does. The modes were only being reset when the
  socket dropped, and here nothing dropped — the program ended while the
  connection was fine.
- **A tab stopped responding after a reconnect.** Recreating ptys was keyed on
  `status !== "connected"`, a belief about the server: a session left marked
  connected across a drop was skipped, leaving a tab that looked fine, ignored
  every keystroke and never redrew, because `sendInput` is gated on the same
  field and fails silently. Each session now carries the socket generation its
  pty was requested in, which cannot disagree with the server.
- **The `cd` picker reported the wrong directory on both tab kinds** — a plain
  terminal sitting in `/usr/share` answered with the home directory. The
  endpoint read the live pty table across the layer boundary from a React
  Router route, and Vite inlined a second copy of the pty manager into the
  server bundle, with its own empty session map, so the lookup always returned
  null and the endpoint always fell back.
- A tmux session renamed from inside tmux no longer strands its tab: tabs are
  reconciled against tmux's own session ids, so a rename while a tab was away
  re-attaches instead of opening a second tab for a session already on screen.
- **A reconnected tmux tab painted only the top of the pane**, leaving the rest
  blank until something resized it — opening a bottom-bar group, usually. The
  pty was always created at 80x24 and resized afterwards; a shell hides that by
  reflowing at its next prompt, but tmux paints a whole screen the moment it
  attaches. It is now created at the size the pane already knows, so the first
  paint fills it.
- **A restored explorer tab claimed `Empty directory`.** The workspace file
  keeps a tab's path but not its listing, which has to be read fresh — and the
  one condition that skipped that read was having a saved path. A path that has
  since been deleted now falls back to the default directory instead of opening
  on an error.
- **`./start.sh` on Linux crashed at startup with `Failed to load native
  module: pty.node`.** node-pty ships binaries for macOS and Windows only and
  compiles elsewhere, but pnpm 10 skips a dependency's build scripts unless it
  is allowlisted — while still exiting 0, so the failure surfaced several steps
  later as a stack trace. node-pty is allowlisted now, `node-gyp` is a pinned
  devDependency because pnpm (unlike npm) supplies none, and a `Native modules`
  step loads the module to check: a compile that runs is not the same as one
  that worked, and an outdated distro node-gyp produces a `pty.node` that
  segfaults on every load. That same check catches a binary built for another
  Node version or another machine, so an nvm switch or a `node_modules` shared
  over NFS repairs itself.
- A missing toolchain now stops with the install command for your distro — and
  a note for machines where `sudo` is not an option — rather than a page of
  compiler output.
- **`start.sh` no longer kills cloudflared tunnels it did not start.** Its exit
  trap ran `pkill -f cloudflared`, which on a shared machine reached other
  projects' and other users' tunnels. The server owns its tunnel and stops it
  on Ctrl+C, so the trap is gone.
- Stopping the server with Ctrl+C now shuts the Cloudflare tunnel down.
  `start.sh` pkilled cloudflared on exit, but running the server directly
  (`pnpm start:tunnel`) left the tunnel process alive.
- File sizes are formatted consistently — three copies of the helper had
  drifted, so the same file could show "1.5 kB" in a viewer and "1.5 KB" in
  the explorer, and the viewer's copy stopped at MB.
- Terminal tabs show a terminal icon instead of a connection dot, and file
  tabs show an icon for what they hold (image, video, audio, PDF, text). The
  dot restated what the connecting gate already says, and left the terminal as
  the only tab kind without an icon.
- The terminal no longer shows dark bands above and below its rows after a
  theme switch: the xterm viewport kept the background it was built with, and
  the light theme's terminal background did not match its container.
- `getExt` returned the whole path for a file with no extension, which then
  appeared as the file's "type" in the unsupported-file message.
- The Settings modal's Appearance section (theme and terminal font size) was
  written but never rendered — the component existed as dead code, so there
  was no way to switch theme from the UI.
- Tabs kept their close button only when more than one was open; every tab now
  has one.
- The new-tab menu is positioned against the viewport and clamped inside it,
  flipping above the button when there is no room below. It previously
  anchored inside the horizontally scrolling tab strip, which clipped it.
- Header lost its top padding in the material pass, sitting flush against the
  top edge. The safe-area inset was applied to the header as a `padding-top`,
  and because the custom classes are unlayered they override Tailwind's
  layered utilities — so on any device without a notch it replaced the bar's
  padding with zero. The inset now sits on the app frame, which has no padding
  utility to collide with.
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

- **Every dependency advisory this release could take is taken, and `pnpm audit`
  exits clean.** The `react-router` family moves 7.12.0 → 7.18.4 (DoS, XSS, CSRF,
  turbo-stream RCE, and an RSC-mode CSRF bypass), `http-proxy-middleware` to
  3.0.7 (multipart field injection / router bypass), and version-scoped pnpm
  overrides pin patched transitive deps — `dompurify`, `ws`, `qs`,
  `path-to-regexp`, `picomatch`, `follow-redirects`, `postcss`, `@babel/core`,
  `undici`. Three of those floors had gone stale enough to be the thing holding
  the tree *on* a vulnerable release, so they now name the patched version.
- **`engine.io` and `socket.io-parser` were the urgent ones**, because both sit
  on the pre-auth path of a tunnel anyone with the URL can reach: the Socket.IO
  gate is namespace middleware, so it runs after the Engine.IO handshake and
  after a frame has been parsed. Three advisories land there — polling-transport
  connection exhaustion, a protocol-revision mismatch on upgrade, and
  zero-attachment memory exhaustion.
- One advisory is left and has no fix to take: `braces` stack exhaustion on
  deeply nested patterns, where 3.0.3 is the latest release and `micromatch` 4
  still depends on it, `http-proxy-middleware` 4 included. It is also
  unreachable here — neither proxy passes a `pathFilter`, so micromatch never
  compiles a pattern and no user input reaches one. Recorded in
  `pnpm.auditConfig` with that reasoning rather than left to sit red, which is
  how a real advisory gets missed.
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
