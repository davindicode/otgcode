import { create } from "zustand";
import { deviceId } from "~/lib/deviceId";
import { hasSocket } from "~/lib/socket";
import { usePresenceStore } from "./presenceStore";

interface AuthState {
  /** False until the first /api/auth/status response lands. */
  loaded: boolean;
  /** False until a password choice has been saved on the host (first run). */
  configured: boolean;
  /** An access password is configured on the server. */
  enabled: boolean;
  authenticated: boolean;
  /** The OS user the server runs as — shown on the lock screen. */
  user: string;
  /** The host it runs on, to tell two OTGCode tabs apart. */
  host: string;
  /** When this session began, if there is one that says. */
  since: number | null;
  /**
   * A live socket was already open when the session was invalidated, so the
   * page has to reload after unlocking to rebuild terminal state cleanly.
   */
  needsReload: boolean;

  refresh: () => Promise<void>;
  /** Resolves to an error message, or null on success. */
  login: (password: string, staySignedIn: boolean) => Promise<string | null>;
  logout: () => Promise<void>;
  setPassword: (newPassword: string, currentPassword?: string) => Promise<string | null>;
  disablePassword: (currentPassword: string) => Promise<string | null>;
  /** Record "no password" on a fresh install, where there is none to confirm. */
  declinePassword: () => Promise<string | null>;
  lock: () => void;
}

async function post(path: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return data?.error || `Request failed (${res.status})`;
  } catch {
    return "Could not reach the server";
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  loaded: false,
  configured: true,
  enabled: false,
  authenticated: true,
  user: "",
  host: "",
  since: null,
  needsReload: false,

  refresh: async () => {
    try {
      // The device id goes along so the server can tell this browser coming
      // back from a second device holding the session — the same distinction
      // the socket handshake makes, asked here because the answer decides
      // whether there is any point showing a password form at all.
      const res = await fetch(`/api/auth/status?deviceId=${encodeURIComponent(deviceId())}`);
      const data = (await res.json()) as {
        configured: boolean;
        enabled: boolean;
        authenticated: boolean;
        user?: string;
        host?: string;
        since?: number | null;
        busySince?: number | null;
      };
      set({
        loaded: true,
        configured: data.configured,
        enabled: data.enabled,
        authenticated: data.authenticated,
        user: data.user || "",
        host: data.host || "",
        since: typeof data.since === "number" ? data.since : null,
      });

      // Another device holding the session outranks everything else on this
      // screen, so the gate goes up from here rather than waiting for a socket
      // refusal — which only arrives after a password has been typed and the
      // workspace restored behind it. `displaced` is left alone: only the
      // socket that lost the session can resolve that one.
      const presence = usePresenceStore.getState();
      if (typeof data.busySince === "number") presence.setBusy(data.busySince);
      else if (presence.status === "busy") presence.clear();
    } catch {
      // Treat an unreachable status endpoint as "not gated" rather than
      // stranding the user on a lock screen they can't get past.
      set({ loaded: true, configured: true, enabled: false, authenticated: true });
    }
  },

  login: async (password, staySignedIn) => {
    const error = await post("/api/auth/login", { password, staySignedIn });
    if (error) return error;
    // Re-read rather than set `authenticated` by hand: the session that just
    // started is the only thing that knows when it started, and the account
    // popup reads that from here.
    await get().refresh();
    return null;
  },

  logout: async () => {
    await post("/api/auth/logout", {});
    // Full reload: the terminal sockets and every panel's state belong to the
    // session that just ended.
    window.location.reload();
  },

  setPassword: async (newPassword, currentPassword) => {
    const error = await post("/api/auth/password", { newPassword, currentPassword });
    if (error) return error;
    await get().refresh();
    return null;
  },

  disablePassword: async (currentPassword) => {
    const error = await post("/api/auth/password/disable", { currentPassword });
    if (error) return error;
    set({ configured: true, enabled: false, authenticated: true });
    return null;
  },

  declinePassword: async () => {
    const error = await post("/api/auth/password/disable", {});
    if (error) return error;
    set({ configured: true, enabled: false, authenticated: true });
    return null;
  },

  lock: () => {
    if (get().enabled && !get().authenticated) return;
    set({ enabled: true, authenticated: false, needsReload: hasSocket() });
  },
}));
