import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type FileKind, fileKind } from "~/lib/fileTypes";
import { type PaneIndex, type Tab, useTabsStore } from "~/stores/tabsStore";
import ConfirmDialog from "./ConfirmDialog";
import RenamableTab from "./RenamableTab";
import TmuxPicker from "./TmuxPicker";
import { dragScroll } from "./terminal/dragScroll";

type NewKind = "terminal" | "explorer" | "tmux";

const TerminalIcon = () => (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  </svg>
);

const ExplorerIcon = () => (
  <svg className="w-3.5 h-3.5 shrink-0 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
  </svg>
);

const TmuxIcon = () => (
  <svg
    className="w-3.5 h-3.5 shrink-0 text-green-400"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M4 12h8" />
  </svg>
);

const ViewerIcon = () => (
  <svg
    className="w-3.5 h-3.5 shrink-0 text-ink-dim"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
);

const ImageIcon = () => (
  <svg
    className="w-3.5 h-3.5 shrink-0 text-emerald-400"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={1.8}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
    />
  </svg>
);

const VideoIcon = () => (
  <svg
    className="w-3.5 h-3.5 shrink-0 text-sky-400"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={1.8}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h8.25a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H4.5A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
    />
  </svg>
);

const AudioIcon = () => (
  <svg
    className="w-3.5 h-3.5 shrink-0 text-fuchsia-400"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={1.8}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"
    />
  </svg>
);

const PdfIcon = () => (
  <svg
    className="w-3.5 h-3.5 shrink-0 text-red-400"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={1.8}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25M9 16.5v.75m3-3v3M15 12v5.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
    />
  </svg>
);

const KIND_ICONS: Record<FileKind, () => React.ReactElement> = {
  image: ImageIcon,
  video: VideoIcon,
  audio: AudioIcon,
  pdf: PdfIcon,
  text: ViewerIcon,
};

function tabIcon(tab: Tab) {
  if (tab.kind === "terminal") return <TerminalIcon />;
  if (tab.kind === "tmux") return <TmuxIcon />;
  if (tab.kind === "explorer") return <ExplorerIcon />;
  // A viewer tab shows what it holds, so the strip reads at a glance.
  const Icon = KIND_ICONS[fileKind(tab.path ?? "")];
  return <Icon />;
}

/** The + menu. Only the two tab types a user can create from scratch appear —
 *  viewer tabs are spawned by opening a file in an explorer. */
function NewTabMenu({
  anchor,
  onPick,
  onClose,
}: {
  anchor: RefObject<HTMLButtonElement | null>;
  onPick: (kind: NewKind) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // The + sits in a horizontally scrolling strip, so an absolutely positioned
  // menu would be clipped by it and can end up anywhere across the width.
  // Position it against the viewport instead and clamp it inside, flipping
  // above the button when there isn't room below.
  useLayoutEffect(() => {
    const button = anchor.current;
    const menu = ref.current;
    if (!button || !menu) return;
    const place = () => {
      const rect = button.getBoundingClientRect();
      const { offsetWidth: w, offsetHeight: h } = menu;
      const pad = 8;
      const left = Math.max(pad, Math.min(rect.left, window.innerWidth - w - pad));
      const below = rect.bottom + 4;
      const top = below + h + pad <= window.innerHeight ? below : Math.max(pad, rect.top - h - 4);
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest("[data-new-tab-trigger]")) return;
      if (ref.current && !ref.current.contains(target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const item = (kind: NewKind, label: string, hint: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onPick(kind)}
      className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-hover"
    >
      <span className="mt-0.5">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-ink">{label}</span>
        <span className="block text-[11px] text-ink-faint">{hint}</span>
      </span>
    </button>
  );

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="New tab"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
      className="fixed z-50 w-56 overflow-hidden glass rounded-panel py-1"
    >
      {/* The menu already says "New tab", so each item saying "tab" again was
          three words doing the work of one. */}
      {item("terminal", "Terminal", "A new shell session", <TerminalIcon />)}
      {item("tmux", "tmux", "Attach to a session that survives reconnects", <TmuxIcon />)}
      {item("explorer", "Explorer", "Browse files and folders", <ExplorerIcon />)}
    </div>
  );
}

/** A mouse this far from where it went down is dragging, not clicking. */
const DRAG_SLOP_PX = 6;
/** How long a finger has to rest on a tab before it picks it up. */
const TOUCH_HOLD_MS = 300;

/**
 * Where the dragged tab belongs now, as an index into the strip *without* it —
 * before the first remaining tab whose middle the pointer hasn't passed.
 */
function dropIndex(others: HTMLElement[], x: number): number {
  const at = others.findIndex((el) => {
    const rect = el.getBoundingClientRect();
    return x < rect.left + rect.width / 2;
  });
  return at === -1 ? others.length : at;
}

/**
 * Drag-to-reorder on the selected tab; drag-to-pan on everything else.
 *
 * The strip has two jobs for one gesture — reordering a tab, and scrolling
 * itself when there are more tabs than fit. Splitting them by *which* tab is
 * under the pointer settles it without a mode: only the tab you have already
 * selected can be picked up, and dragging any other one slides the strip, the
 * way the composer's key rows already work. A plain mouse has no sideways
 * gesture, so before this the overflowing half of a long strip was simply out
 * of reach on the desktop.
 *
 * Touch still waits for a hold before taking the selected tab, so a swipe that
 * happens to start on it scrolls rather than reorders. Once dragging,
 * touchmove is cancelled by hand: `touch-action` is read when the gesture
 * begins, so it cannot call off a scroll already under way.
 *
 * The tab moves as you drag rather than following the pointer under a ghost —
 * the strip itself is the preview.
 */
function useTabReorder(stripRef: RefObject<HTMLDivElement | null>, activeId: string | null) {
  const move = useTabsStore((s) => s.move);
  const moveToPane = useTabsStore((s) => s.moveToPane);
  const setDrag = useTabsStore((s) => s.setDrag);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    // The close button, the + and the rename input own their own gestures.
    if (target.closest("button, input")) return;
    const id = target.closest<HTMLElement>("[data-tab-id]")?.dataset.tabId;
    const strip = stripRef.current;
    if (!strip) return;
    // Anything but the selected tab — another tab, or the bare strip beside
    // them — pans instead. Touch scrolls the strip natively, so this is the
    // mouse's version of that; dragScroll bows out on its own when there is
    // nothing to scroll.
    if (!id || id !== activeId) {
      dragScroll(e);
      return;
    }

    const { pointerId, clientX: startX } = e;
    const holdFirst = e.pointerType !== "mouse";
    let dragging = false;
    let hold: ReturnType<typeof setTimeout> | null = null;

    const own = useTabsStore.getState().tabs.find((t) => t.id === id)?.pane ?? 0;

    const start = () => {
      hold = null;
      dragging = true;
      setDrag({ id, pane: own });
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) <= DRAG_SLOP_PX) return;
        // A finger that moves before the hold is through is scrolling.
        if (holdFirst) return end();
        start();
      }
      // Which strip the pointer is over, so dragging a tab onto the other
      // pane's strip previews it there rather than doing nothing. Both strips
      // are in the document, so this is a hit test rather than a drop target.
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-pane-strip]")
        ?.dataset.paneStrip;
      // Off both strips, it keeps the pane it was last over: dragging through
      // the gap between them should not snap it back and forth.
      const over = under === undefined ? (useTabsStore.getState().drag?.pane ?? own) : under === "1" ? 1 : 0;
      setDrag({ id, pane: over });

      // The ordering preview is the real thing moving, as it always was — the
      // strip is its own preview. Only the pane is held back.
      const landing = document.querySelector<HTMLElement>(`[data-pane-strip="${over}"]`) ?? strip;
      const others = [...landing.querySelectorAll<HTMLElement>("[data-tab-id]")].filter(
        (el) => el.dataset.tabId !== id,
      );
      const at = dropIndex(others, ev.clientX);
      // `at` indexes the landing strip, but `move` wants an index into the one
      // array both panes share — so the drop position has to be expressed as a
      // neighbour and then looked up there. Past the strip's last tab it is
      // *after that tab*, not the end of the array: the end of the array is
      // behind the other pane's tabs, which is how dropping at the right edge
      // of the left strip used to fling a tab across the whole order.
      const rest = useTabsStore.getState().tabs.filter((t) => t.id !== id);
      const indexOf = (tabId: string | undefined) => (tabId ? rest.findIndex((t) => t.id === tabId) : -1);
      const before = indexOf(others[at]?.dataset.tabId);
      const afterLast = indexOf(others[others.length - 1]?.dataset.tabId);
      move(id, before !== -1 ? before : afterLast !== -1 ? afterLast + 1 : rest.length);
    };

    // Dragging and scrolling are the same gesture to the browser; the drag wins
    // once it has started.
    const onTouchMove = (ev: TouchEvent) => {
      if (dragging) ev.preventDefault();
    };

    function end() {
      if (hold) clearTimeout(hold);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      document.removeEventListener("touchmove", onTouchMove);
      if (!dragging) return;
      // Letting go is what commits the pane: until now the tab has only been
      // drawn in the other strip, and its content has stayed where it was.
      const preview = useTabsStore.getState().drag;
      setDrag(null);
      if (preview && preview.pane !== own) {
        // The preview is what the user was looking at, so it is what commits —
        // including the index the ordering preview already settled on.
        const order = useTabsStore.getState().tabs.findIndex((t) => t.id === preview.id);
        moveToPane(preview.id, preview.pane, order);
      }
    }

    if (holdFirst) hold = setTimeout(start, TOUCH_HOLD_MS);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
  };

  return { onPointerDown };
}

/**
 * One strip per pane, holding that pane's tabs and its own + button.
 *
 * The + belongs to a strip rather than to the app because a new tab has to
 * open somewhere, and "the pane whose + you pressed" is the only answer that
 * needs no explaining. In a split, the strip of the pane without the cursor is
 * dimmed rather than hidden: it is still showing a tab.
 */
export default function TabBar({ pane, split }: { pane: PaneIndex; split: boolean }) {
  const allTabs = useTabsStore((s) => s.tabs);
  const activeIds = useTabsStore((s) => s.activeIds);
  const focusedPane = useTabsStore((s) => s.focusedPane);
  const focusPane = useTabsStore((s) => s.focusPane);
  // In a split a strip shows its own pane's tabs. With one pane drawn, every
  // tab is reachable from it, whichever pane it is assigned to — otherwise
  // narrowing the window would hide tabs with no way back to them.
  const drag = useTabsStore((s) => s.drag);
  // A tab being dragged shows in the strip it is over, not the one it still
  // belongs to — which is the whole preview.
  const tabs = split ? allTabs.filter((t) => (drag?.id === t.id ? drag.pane : t.pane) === pane) : allTabs;
  const activeId = split ? activeIds[pane] : activeIds[focusedPane];
  const setActive = useTabsStore((s) => s.setActive);
  const close = useTabsStore((s) => s.close);
  const rename = useTabsStore((s) => s.rename);
  const openTerminal = useTabsStore((s) => s.openTerminal);
  const openExplorer = useTabsStore((s) => s.openExplorer);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tmuxPicker, setTmuxPicker] = useState(false);
  /** The tab whose X was tapped, held while the user confirms. */
  const [closing, setClosing] = useState<Tab | null>(null);
  const unsaved = useTabsStore((s) => s.unsaved);
  const plusRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const { onPointerDown } = useTabReorder(stripRef, activeId);

  const pick = (kind: NewKind) => {
    setMenuOpen(false);
    // Open it here, in the pane whose + was pressed.
    focusPane(pane);
    // A tmux tab needs its session chosen first — the tab *is* that session.
    if (kind === "tmux") setTmuxPicker(true);
    else if (kind === "terminal") openTerminal();
    else openExplorer();
  };

  /**
   * What closing this tab costs, or null when it costs nothing and the X
   * should simply work.
   *
   * A tmux tab costs nothing: the session keeps running on the host, so
   * closing the tab detaches from it and the + picker reattaches. Asking first
   * implied otherwise. A viewer tab is usually free too — closing it returns
   * you to the explorer it came from and the file is still there — unless it
   * has edits that are not, which is the state its save button shows.
   */
  const closeCost = (tab: Tab): string | null => {
    if (tab.kind === "terminal") return "Its shell and anything running in it stop, and the scrollback goes with them.";
    if (tab.kind === "tmux") return null;
    if (tab.kind === "viewer") return unsaved[tab.id] ? "This file has edits that are not saved. They are lost." : null;
    return "";
  };

  return (
    // Both strips look the same. The unfocused one used to be held back to
    // 60% opacity as a focus cue, which dimmed its + along with everything
    // else and read as a disabled button — and the cue was not needed anyway:
    // each pane has its own +, so which one you press is which pane it opens
    // in, and the active tab's own highlight already says where you are.
    <div className="bar-edge relative flex shrink-0 items-center border-b border-line bg-surface">
      <div
        ref={stripRef}
        data-pane-strip={pane}
        onPointerDown={onPointerDown}
        className="flex items-center overflow-x-auto scrollbar-none flex-1 min-w-0"
      >
        {tabs.map((tab) => (
          <RenamableTab
            key={tab.id}
            id={tab.id}
            dragging={tab.id === drag?.id}
            name={tab.title}
            isActive={tab.id === activeId}
            // A viewer tab is named by its file; renaming it would be a lie.
            renamable={tab.kind !== "viewer"}
            existingNames={tabs.filter((t) => t.id !== tab.id).map((t) => t.title)}
            onRename={(name) => rename(tab.id, name)}
            onClick={() => setActive(tab.id)}
            onClose={() => (closeCost(tab) === null ? close(tab.id) : setClosing(tab))}
            title={tab.kind === "viewer" ? tab.path : undefined}
            icon={tabIcon(tab)}
          />
        ))}
        {closing && (
          <ConfirmDialog
            title={`Close ${closing.title}?`}
            body={closeCost(closing)}
            confirmLabel={unsaved[closing.id] ? "Discard and close" : "Close tab"}
            danger={closing.kind === "terminal" || !!unsaved[closing.id]}
            onConfirm={() => {
              close(closing.id);
              setClosing(null);
            }}
            onCancel={() => setClosing(null)}
          />
        )}
        <button
          ref={plusRef}
          type="button"
          data-new-tab-trigger=""
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="New tab"
          title="New tab"
          className={`relief shrink-0 m-1.5 p-1.5 rounded-control ${
            menuOpen ? "text-ink" : "text-ink-dim hover:text-ink"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
      {menuOpen && <NewTabMenu anchor={plusRef} onPick={pick} onClose={() => setMenuOpen(false)} />}
      {tmuxPicker && <TmuxPicker onClose={() => setTmuxPicker(false)} />}
    </div>
  );
}
