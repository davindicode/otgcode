import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearDraft, readDraft, writeDraft } from "~/lib/drafts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("editor drafts", () => {
  it("gives back what was written, per file", () => {
    writeDraft("/tmp/a.ts", "half a sentence");
    writeDraft("/tmp/b.ts", "something else");

    expect(readDraft("/tmp/a.ts")).toBe("half a sentence");
    expect(readDraft("/tmp/b.ts")).toBe("something else");
    expect(readDraft("/tmp/never-touched.ts")).toBeNull();
  });

  it("forgets one on request", () => {
    writeDraft("/tmp/a.ts", "x");
    clearDraft("/tmp/a.ts");
    expect(readDraft("/tmp/a.ts")).toBeNull();
  });

  it("drops a draft nobody came back for, and does not report it", () => {
    vi.useFakeTimers();
    writeDraft("/tmp/a.ts", "stale");
    vi.setSystemTime(Date.now() + WEEK_MS + 1000);

    expect(readDraft("/tmp/a.ts")).toBeNull();
    // Collected, not merely hidden: it was holding quota.
    expect(localStorage.length).toBe(0);
  });

  it("leaves a buffer too big for the quota to memory alone", () => {
    writeDraft("/tmp/huge.ts", "x".repeat(300 * 1024));
    expect(readDraft("/tmp/huge.ts")).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("drops the oldest drafts to make room for the file being typed into", () => {
    vi.useFakeTimers();
    writeDraft("/tmp/old.ts", "oldest");
    vi.setSystemTime(Date.now() + 1000);
    writeDraft("/tmp/newer.ts", "newer");

    // Full, until one draft has been dropped.
    let attempts = 0;
    const real = localStorage.setItem.bind(localStorage);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((k: string, v: string) => {
      attempts += 1;
      if (attempts === 1) throw new DOMException("QuotaExceededError");
      real(k, v);
    });

    writeDraft("/tmp/typing.ts", "what is being typed now");

    expect(readDraft("/tmp/typing.ts")).toBe("what is being typed now");
    expect(readDraft("/tmp/old.ts")).toBeNull();
    // Only as many as it had to: the pruning stops at the first write that fits.
    expect(readDraft("/tmp/newer.ts")).toBe("newer");
  });

  it("stays quiet when storage itself refuses", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("SecurityError");
    });

    // A private window denies storage outright. The editor still works.
    expect(() => writeDraft("/tmp/a.ts", "x")).not.toThrow();
    expect(readDraft("/tmp/a.ts")).toBeNull();
    expect(() => clearDraft("/tmp/a.ts")).not.toThrow();
  });
});
