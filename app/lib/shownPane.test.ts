import { beforeEach, describe, expect, it } from "vitest";
import { readShownPane, saveShownPane } from "~/lib/shownPane";

beforeEach(() => localStorage.clear());

describe("the pane this device is showing", () => {
  it("comes back after a reload", () => {
    saveShownPane(1);

    expect(readShownPane()).toBe(1);
  });

  // `null` is the answer that sends the caller to the host's value. Zero is
  // not: the left pane is a choice, and `?? ` has to be able to tell them
  // apart or a phone on the left would keep inheriting the desktop's pane.
  it("tells a remembered left pane apart from nothing remembered", () => {
    expect(readShownPane()).toBeNull();

    saveShownPane(0);

    expect(readShownPane()).toBe(0);
  });

  it("ignores a value that is not a pane", () => {
    localStorage.setItem("otgcode:layout:shown-pane", JSON.stringify({ v: 7, at: Date.now() }));

    expect(readShownPane()).toBeNull();
  });
});
