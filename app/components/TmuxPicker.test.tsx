import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { default: TmuxPicker } = await import("~/components/TmuxPicker");
const { useTabsStore } = await import("~/stores/tabsStore");

type Answer = { sessions: unknown[]; version: string | null };

/** Hands out a promise plus the lever that settles it, so the listing can be held open. */
function deferred<T>() {
  let settle!: (v: T) => void;
  let fail!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    settle = res;
    fail = rej;
  });
  return { promise, settle, fail };
}

/** Renders the picker with its listing still out, and the lever to answer it. */
async function open() {
  const held = deferred<Answer>();
  global.fetch = vi.fn(async () => ({ json: () => held.promise })) as never;
  const view = render(<TmuxPicker onClose={() => {}} />);
  // The picker reconciles tab names before it lists, so let that microtask run.
  await act(async () => {});
  return { ...view, held };
}

beforeEach(() => {
  cleanup();
  useTabsStore.setState({ tabs: [] });
});

describe("TmuxPicker, while the listing is still out", () => {
  it("spins rather than reporting tmux missing", async () => {
    const { container } = await open();

    expect(container.querySelector(".spinner")).toBeInTheDocument();
    // The bug: "not installed" is what an absent version means, and an absent
    // version was also what not having asked yet looked like.
    expect(screen.queryByText(/not installed/)).not.toBeInTheDocument();
  });

  it("says tmux is missing once the server has actually said so", async () => {
    const { held } = await open();

    await act(async () => {
      held.settle({ sessions: [], version: null });
    });

    await waitFor(() => expect(screen.getByText(/not installed/)).toBeInTheDocument());
    // Nothing to name a session for, so the row that starts one goes away.
    expect(screen.queryByPlaceholderText(/New session name/)).not.toBeInTheDocument();
  });

  it("blames the request, not tmux, when it fails", async () => {
    const { held } = await open();

    await act(async () => {
      held.fail(new Error("offline"));
      await held.promise.catch(() => {});
    });

    await waitFor(() => expect(screen.getByText(/Could not list tmux sessions/)).toBeInTheDocument());
    expect(screen.queryByText(/not installed/)).not.toBeInTheDocument();
  });
});
