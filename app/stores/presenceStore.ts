import { create } from "zustand";

/**
 * Whether this device holds the single app session.
 *
 * `busy` — another device had it and we were refused. `displaced` — we had it
 * and another device took over. Both replace the app with an explanation and a
 * button, because retrying on its own would either fail forever or start a tug
 * of war: only the other device can give the session up.
 */
export type SessionStatus = "ok" | "busy" | "displaced";

interface PresenceState {
  status: SessionStatus;
  /** When the holding device connected, for the "in use since" line. */
  since: number | null;
  /**
   * When the server last told us it was busy. Changes on every refusal, which
   * is how the gate knows its check came back — the answer to "is it free yet"
   * is otherwise identical to what it already knew.
   */
  lastCheck: number | null;
  setBusy: (since: number | null) => void;
  setDisplaced: () => void;
  clear: () => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  status: "ok",
  since: null,
  lastCheck: null,
  setBusy: (since) => set({ status: "busy", since, lastCheck: Date.now() }),
  setDisplaced: () => set({ status: "displaced", since: null, lastCheck: null }),
  clear: () => set({ status: "ok", since: null, lastCheck: null }),
}));
