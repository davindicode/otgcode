import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiPost = vi.fn();
vi.mock("~/lib/api", () => ({ apiPost: (...args: unknown[]) => apiPost(...args) }));

const { default: FilesPage } = await import("~/components/files/FilesPage");
const { useFileStore } = await import("~/stores/fileStore");
const { useToastStore } = await import("~/stores/toastStore");

const ENTRY = { name: "big", isDirectory: true, size: 0, modified: "", permissions: "drwxr-xr-x" };

/** Hands out a promise plus the lever that settles it, so a request can be held open. */
function deferred<T>() {
  let settle!: (v: T) => void;
  let fail!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    settle = res;
    fail = rej;
  });
  return { promise, settle, fail };
}

async function setup() {
  const id = useFileStore.getState().createSession("files-test", "Explorer", "/tmp");
  const view = render(<FilesPage sessionId={id} />);
  // The first render reads the directory; wait for the row it produces.
  await screen.findByText("big");
  return view;
}

/** Walk the row's menu to the delete dialog, the way a tap does. */
async function openDeleteDialog() {
  await act(async () => {
    screen.getByLabelText("Actions for big").click();
  });
  await act(async () => {
    screen.getByText("Delete").click();
  });
  return screen.getByRole("heading", { name: "Delete" }).parentElement as HTMLElement;
}

beforeEach(() => {
  cleanup();
  apiPost.mockReset();
  useFileStore.setState({ sessions: {} });
  useToastStore.setState({ toasts: [] });
  global.fetch = vi.fn(async () => ({ json: async () => ({ dir: "/tmp", entries: [ENTRY] }) })) as never;
});

describe("FilesPage", () => {
  it("closes the dialog and freezes the explorer for the whole delete", async () => {
    const held = deferred<void>();
    apiPost.mockReturnValue(held.promise);
    await setup();
    const dialog = await openDeleteDialog();

    await act(async () => {
      within(dialog).getByRole("button", { name: "Delete" }).click();
    });

    // The button that asked for it is gone, so it cannot be pressed twice, and
    // the explorer says what it is doing instead of accepting the tap silently.
    expect(screen.queryByRole("heading", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Deleting big...");
    expect(screen.getByTitle("New folder")).toBeDisabled();

    await act(async () => {
      held.settle();
      await held.promise;
    });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(apiPost).toHaveBeenCalledTimes(1);
    // Frozen until the new tree is in: the initial read, then the reload.
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("thaws the explorer when the delete is refused", async () => {
    const held = deferred<void>();
    apiPost.mockReturnValue(held.promise);
    await setup();
    const dialog = await openDeleteDialog();
    await act(async () => {
      within(dialog).getByRole("button", { name: "Delete" }).click();
    });

    await act(async () => {
      held.fail(new Error("Permission denied"));
      await held.promise.catch(() => {});
    });

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.getByTitle("New folder")).not.toBeDisabled();
    expect(useToastStore.getState().toasts[0].message).toContain("Permission denied");
  });
});
