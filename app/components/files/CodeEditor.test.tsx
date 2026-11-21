import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Monaco cannot run in jsdom — it is fetched by a loader at mount — so it
 * stands in as a plain textarea with the one behaviour this is about: the
 * component drives it by a `value` prop and hears about typing through
 * `onChange`.
 */
vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const { default: CodeEditor } = await import("~/components/files/CodeEditor");
const { saveView } = await import("~/lib/viewState");
const { readDraft, writeDraft } = await import("~/lib/drafts");

/** A `.ts` file has no preview, so the editor opens in Monaco rather than one. */
const PATH = "/tmp/notes.ts";

function setup(onSave: (content: string) => Promise<boolean>) {
  // Edit is not where a file opens — plain text is, and it is read-only — so
  // the mode this is about is the one the view state asks for.
  saveView(PATH, { mode: "edit" });
  const view = render(
    <CodeEditor path={PATH} content="first" onSave={onSave} onReload={() => {}} reloadCount={0} stale={false} />,
  );
  return view;
}

const type = async (text: string) => {
  const box = await screen.findByLabelText("editor");
  // Not user-event: this is about a value arriving, not about keystrokes.
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

describe("an editor told to throw its edits away", () => {
  // Re-reading tears the editor down, and it is rebuilt from the draft: with
  // the draft still there, the second tap handed the edits straight back.
  it("drops the draft the reload was agreed to discard", async () => {
    writeDraft(PATH, "edits nobody wants");
    const view = setup(() => Promise.resolve(true));
    await screen.findByLabelText("editor");
    expect(readDraft(PATH)).not.toBeNull();

    const reload = () => view.container.querySelector<HTMLButtonElement>('button[title*="eload"]');
    await act(async () => reload()?.click()); // the warning tap
    await act(async () => reload()?.click()); // and through

    expect(readDraft(PATH)).toBeNull();
  });
});

describe("an editor whose save is still in flight", () => {
  it("keeps what was typed while the write was on its way", async () => {
    let finish: (ok: boolean) => void = () => {};
    const onSave = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const view = setup(onSave);

    await type("first edit");
    await act(async () => {
      screen.getByTitle(/save/i).click();
    });
    expect(onSave).toHaveBeenCalledWith("first edit");

    // The save is away; the user carries on.
    await type("first edit, and more");
    await act(async () => finish(true));

    // The pane now hands down what the save wrote, as it does on success.
    view.rerender(
      <CodeEditor path={PATH} content="first edit" onSave={onSave} onReload={() => {}} reloadCount={0} stale={false} />,
    );

    await waitFor(() => expect(screen.getByLabelText("editor")).toHaveValue("first edit, and more"));
    // Still unsaved work: the file holds the snapshot, the buffer went past it.
    expect(screen.getByTitle(/save/i)).toBeEnabled();
  });

  it("takes up a file that really did change", async () => {
    const view = setup(() => Promise.resolve(true));
    await screen.findByLabelText("editor");

    view.rerender(
      <CodeEditor
        path={PATH}
        content="written by something else"
        onSave={() => Promise.resolve(true)}
        onReload={() => {}}
        reloadCount={0}
        stale={false}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("editor")).toHaveValue("written by something else"));
  });
});
