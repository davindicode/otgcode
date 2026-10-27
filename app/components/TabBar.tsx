import { Fragment, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type FileKind, fileKind } from "~/lib/fileTypes";
import { type PaneIndex, type Tab, useTabsStore } from "~/stores/tabsStore";
import { useWorkspaceStore } from "~/stores/workspaceStore";
import ConfirmDialog from "./ConfirmDialog";
import RenamableTab from "./RenamableTab";
import TmuxPicker from "./TmuxPicker";
import { dragScroll, wheelScroll } from "./terminal/dragScroll";

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
/** Under this a finger is resting, not moving. */
const TOUCH_JITTER_PX = 2;

/**
 * Where a dragged tab would land. A line between two tabs rather than a gap
 * opened up between them: a gap means every tab in the strip moves while you
 * are still deciding, and moving them is what the drag used to get wrong.
 *
 * It takes up no width at all — the line is drawn outside a zero-width box —
 * so putting it in cannot change how much content the strip has to scroll.
 * Two pixels would be enough to clamp the scroll offset of a strip that is
 * already at its end, which is the whole bug this caret replaced.
 */
/**
 * The tab, drawn where it would land: same shape, same name, shaded.
 *
 * A bare line between two tabs said less than this did, and said nothing at
 * all over a pane with no tabs in it — which is exactly where you most need
 * telling that the drop will work.
 */
const TabGhost = ({ tab }: { tab: Tab }) => (
  <div
    aria-hidden="true"
    className="pointer-events-none my-1 ml-1 flex shrink-0 items-center gap-1.5 rounded-control px-3 py-1.5 text-sm text-ink-dim opacity-60 ring-1 ring-inset ring-blue-400/70"
  >
    {tabIcon(tab)}
    <span className="truncate max-w-[80px]">{tab.title}</span>
  </div>
);

/** How close to an end of the strip starts it creeping, and by how much. */
const EDGE_PX = 36;
const EDGE_SPEED_PX = 10;

/**
 * Where the dragged tab belongs now, as an index into the strip *without* it —
 * before the first remaining tab whose middle the pointer hasn't passed.
 *
 * Takes geometry rather than elements so it can be checked on its own: the
 * one thing this has to be is monotonic in x, since it runs again on every
 * pointermove against a strip it has just reordered.
 */
export function dropIndex(others: { left: number; width: number }[], x: number): number {
  const at = others.findIndex((r) => x < r.left + r.width / 2);
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
 * **The drag changes nothing until it is let go.** It reads the strip, works
 * out where the tab would land, and says so with a caret; the tabs themselves
 * hold still. Reordering as you went looked better and was the cause of every
 * jump at the ends of the strip: the gesture was measuring a layout it was
 * changing underneath itself, and once a strip's content got shorter or longer
 * the browser clamped its scroll offset and every tab in it shifted. The
 * composer's key rows have always worked because they only ever scroll — this
 * now does the same, and does the arithmetic on top of a strip that is sitting
 * still.
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
    /** Where the pointer last was, so the edge creep can keep going without it. */
    let at: { x: number; y: number } | null = null;
    let creep = 0;

    const own = useTabsStore.getState().tabs.find((t) => t.id === id)?.pane ?? 0;

    const start = () => {
      hold = null;
      dragging = true;
    };

    /**
     * Work out where the tab would land and say so. Called again by the edge
     * creep below while the pointer sits still, which is why it takes a
     * position rather than an event.
     */
    const place = (x: number, y: number) => {
      at = { x, y };
      // Which strip the pointer is over, so dragging a tab onto the other
      // pane's strip offers to put it there. Both strips are in the document,
      // so this is a hit test rather than a drop target.
      const under = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-pane-strip]")?.dataset.paneStrip;
      // Off both strips it keeps the pane it was last over: dragging through
      // the gap between them should not snap back and forth.
      const over = under === undefined ? (useTabsStore.getState().drag?.pane ?? own) : under === "1" ? 1 : 0;
      const landing = document.querySelector<HTMLElement>(`[data-pane-strip="${over}"]`) ?? strip;

      // At the end of a strip with more tabs than fit, the tab you mean to
      // drop in front of is off-screen, so there is nothing to point at and
      // the drag just stops short. Creep while the pointer rests near an end,
      // then measure, so the caret is read off where the tabs ended up.
      const box = landing.getBoundingClientRect();
      const dir = x < box.left + EDGE_PX ? -1 : x > box.right - EDGE_PX ? 1 : 0;
      if (dir !== 0 && landing.scrollWidth > landing.clientWidth) {
        landing.scrollLeft += dir * EDGE_SPEED_PX;
        creep ||= requestAnimationFrame(() => {
          creep = 0;
          if (at) place(at.x, at.y);
        });
      }

      const others = [...landing.querySelectorAll<HTMLElement>("[data-tab-id]")].filter(
        (el) => el.dataset.tabId !== id,
      );
      const slot = dropIndex(
        others.map((el) => el.getBoundingClientRect()),
        x,
      );
      // `slot` indexes the landing strip; `index` is the same place in the one
      // array both panes share, reached through a neighbour. Past the strip's
      // last tab it is *after that tab*, not the end of the array: the end of
      // the array is behind the other pane's tabs, which is how dropping at
      // the right edge of the left strip used to fling a tab across the whole
      // order.
      const rest = useTabsStore.getState().tabs.filter((t) => t.id !== id);
      const indexOf = (tabId: string | null | undefined) => (tabId ? rest.findIndex((t) => t.id === tabId) : -1);
      const before = others[slot]?.dataset.tabId ?? null;
      const ahead = indexOf(before);
      const afterLast = indexOf(others[others.length - 1]?.dataset.tabId);
      const index = ahead !== -1 ? ahead : afterLast !== -1 ? afterLast + 1 : rest.length;
      // Inside its own pane the tab moves as you drag, which is what this
      // looked like before and what reads best: the strip is its own preview.
      // That was never the part that went wrong — a sweep of the hit test
      // against every width combination is stable, because the tab being
      // measured against is the one tab left out of the measurement.
      //
      // A move to the *other* pane is still only drawn, never done. Taking
      // the tab out of this strip's DOM shortened the content it scrolls, and
      // a browser clamps a scroll offset its content can no longer reach.
      if (over === own) move(id, index);
      setDrag({ id, pane: over, before, index });
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!dragging) {
        const moved = Math.abs(ev.clientX - startX);
        // A finger that moves at all before the hold is through is scrolling,
        // and the scroll has already started: `touch-action` is read when the
        // gesture begins, so preventDefault cannot call it off afterwards. The
        // slop below used to apply here too, which let the hold fire under a
        // finger that had crept a few pixels — and then the strip was being
        // scrolled by the browser and reordered by us at the same time, off
        // positions that were moving under both. Giving the gesture up is the
        // only way to have one of them. A couple of pixels of jitter is not
        // movement.
        if (holdFirst) return moved > TOUCH_JITTER_PX ? end() : undefined;
        if (moved <= DRAG_SLOP_PX) return;
        start();
      }
      place(ev.clientX, ev.clientY);
    };

    // Dragging and scrolling are the same gesture to the browser; the drag wins
    // once it has started.
    const onTouchMove = (ev: TouchEvent) => {
      if (dragging) ev.preventDefault();
    };

    function end() {
      if (hold) clearTimeout(hold);
      if (creep) cancelAnimationFrame(creep);
      at = null;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      document.removeEventListener("touchmove", onTouchMove);
      if (!dragging) return;

      // A pointerup over a tab is followed by a click on that tab, and a tab's
      // click selects it. So letting a drag go anywhere near another tab
      // landed the dragged one and then showed whichever tab it was dropped
      // on — most visible across panes, where the pane you had just dragged
      // into switched to something else as you released. dragScroll has
      // swallowed its own click all along; this is the reorder's.
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      document.addEventListener("click", swallow, { capture: true, once: true });
      // If no click follows, this would otherwise eat the next real one.
      setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 100);

      // The one change the whole gesture makes.
      const drop = useTabsStore.getState().drag;
      setDrag(null);
      if (!drop) return;
      if (drop.pane === own) move(drop.id, drop.index);
      else moveToPane(drop.id, drop.pane, drop.index);
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
export default function TabBar({ pane }: { pane: PaneIndex }) {
  const allTabs = useTabsStore((s) => s.tabs);
  const activeIds = useTabsStore((s) => s.activeIds);
  const focusPane = useTabsStore((s) => s.focusPane);
  const drag = useTabsStore((s) => s.drag);
  /**
   * A strip shows its own pane's tabs whenever there are two panes to belong
   * to — not only when both are on screen.
   *
   * It used to key off whether the split was *drawn*, so a phone, which draws
   * one pane at a time, pooled every tab into whichever strip was up: switch
   * to Right and the left pane's tabs were still sitting there. The reason
   * given was that separating them would hide tabs with no way back, but
   * Settings grows a Left/Right switcher in exactly this case and that is the
   * way back. Pane assignment is the same on every screen now; only how many
   * of them fit changes.
   *
   * And that is all a strip shows: the dragged tab stays here, shaded, while
   * the other strip offers to take it. Redrawing it in the strip it was over
   * changed how much content each strip had to scroll mid-gesture, which is
   * what used to make the other pane lurch.
   */
  const twoPanes = useWorkspaceStore((s) => s.panes) === 2;
  const tabs = twoPanes ? allTabs.filter((t) => t.pane === pane) : allTabs;
  const activeId = activeIds[pane];
  /**
   * A tab from the other pane hovering over this one, drawn where it would
   * land. Its own strip keeps it too, shaded, so neither strip changes width
   * while the drag is going on — which is what used to clamp the other pane's
   * scroll offset and shift every tab in it.
   */
  const guest = drag && drag.pane === pane ? allTabs.find((t) => t.id === drag.id && t.pane !== pane) : undefined;
  const ghostAt = guest ? drag?.before : undefined;
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
   *
   * Those edits used to be lost here, and this said so. They are kept in the
   * browser now, so it says that instead: the close is still worth mentioning,
   * since the file on disk is not what you were looking at, but it is no
   * longer the kind of thing to put a red button on.
   */
  const closeCost = (tab: Tab): string | null => {
    if (tab.kind === "terminal") return "Its shell and anything running in it stop, and the scrollback goes with them.";
    if (tab.kind === "tmux") return null;
    if (tab.kind === "viewer")
      return unsaved[tab.id] ? "This file has edits that are not saved. They come back when you open it again." : null;
    return "";
  };

  return (
    // Both strips look the same. The unfocused one used to be held back to
    // 60% opacity as a focus cue, which dimmed its + along with everything
    // else and read as a disabled button — and the cue was not needed anyway:
    // each pane has its own +, so which one you press is which pane it opens
    // in, and the active tab's own highlight already says where you are.
    <div className="bar-edge relative flex shrink-0 items-center border-b border-line bg-surface">
      {/* The scroller and the row it scrolls are two elements, the way the
          composer's key rows have always had them. A flex container that is
          also the scroll container measures its own scrollable overflow
          differently in Safari, which is the one difference between this strip
          and the rows in the composer that have never had any of this trouble
          — and the drag reads scrollWidth, clientWidth and scrollLeft off this
          element to decide everything. */}
      <div
        ref={stripRef}
        data-pane-strip={pane}
        onPointerDown={onPointerDown}
        onWheel={wheelScroll}
        className="select-none overflow-x-auto scrollbar-none flex-1 min-w-0"
      >
        <div className="flex w-max items-center">
          {tabs.map((tab) => (
            <Fragment key={tab.id}>
              {ghostAt === tab.id && guest && <TabGhost tab={guest} />}
              <RenamableTab
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
            </Fragment>
          ))}
          {/* Past the last tab, so dropping at the end of a strip — or onto one
              with nothing in it — shows up too. */}
          {ghostAt === null && guest && <TabGhost tab={guest} />}
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
      </div>
      {closing && (
        <ConfirmDialog
          title={`Close ${closing.title}?`}
          body={closeCost(closing)}
          confirmLabel="Close tab"
          danger={closing.kind === "terminal"}
          onConfirm={() => {
            close(closing.id);
            setClosing(null);
          }}
          onCancel={() => setClosing(null)}
        />
      )}
      {menuOpen && <NewTabMenu anchor={plusRef} onPick={pick} onClose={() => setMenuOpen(false)} />}
      {tmuxPicker && <TmuxPicker onClose={() => setTmuxPicker(false)} />}
    </div>
  );
}
