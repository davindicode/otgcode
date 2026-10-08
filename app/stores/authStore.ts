import { create } from "zustand";
import { hasSocket } from "~/lib/socket";

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
  since: null,
  needsReload: false,

  refresh: async () => {
    try {
      const res = await fetch("/api/auth/status");
      const data = (await res.json()) as {
        configured: boolean;
        enabled: boolean;
        authenticated: boolean;
        user?: string;
        since?: number | null;
      };
      set({
        loaded: true,
        configured: data.configured,
        enabled: data.enabled,
        authenticated: data.authenticated,
        user: data.user || "",
        since: typeof data.since === "number" ? data.since : null,
      });
    } catch {
      // Treat an unreachable status endpoint as "not gated" rather than
      // stranding the user on a lock screen they can't get past.
      set({ loaded: true, configured: true, enabled: false, authenticated: true });
    }
  },

  login: async (password, staySignedIn) => {
    const error = await post("/api/auth/login", { password, staySignedIn });
    if (error) return error;
    set({ authenticated: true });
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
    set({ configured: true, enabled: true, authenticated: true });
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
