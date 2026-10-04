import { create } from "zustand";

/**
 * Whether this device holds the single app session.
 *
 * `busy` — another device had it and we were refused. `displaced` — we had it
 * and another device took over. Both replace the app with an explanation
 * rather than a reconnect spinner, because retrying on its own would either
 * fail forever or start a tug of war.
 */
export type SessionStatus = "ok" | "busy" | "displaced";

interface PresenceState {
  status: SessionStatus;
  /** When the holding device connected, for the "in use since" line. */
  since: number | null;
  setBusy: (since: number | null) => void;
  setDisplaced: () => void;
  clear: () => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  status: "ok",
  since: null,
  setBusy: (since) => set({ status: "busy", since }),
  setDisplaced: () => set({ status: "displaced", since: null }),
  clear: () => set({ status: "ok", since: null }),
}));
