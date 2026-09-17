import { create } from "zustand";
import { hasSocket } from "~/lib/socket";

interface AuthState {
  /** False until the first /api/auth/status response lands. */
  loaded: boolean;
  /** An access password is configured on the server. */
  enabled: boolean;
  authenticated: boolean;
  /** The OS user the server runs as — shown on the lock screen. */
  user: string;
  /**
   * A live socket was already open when the session was invalidated, so the
   * page has to reload after unlocking to rebuild terminal state cleanly.
   */
  needsReload: boolean;

  refresh: () => Promise<void>;
  /** Resolves to an error message, or null on success. */
  login: (password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  setPassword: (newPassword: string, currentPassword?: string) => Promise<string | null>;
  disablePassword: (currentPassword: string) => Promise<string | null>;
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
  enabled: false,
  authenticated: true,
  user: "",
  needsReload: false,

  refresh: async () => {
    try {
      const res = await fetch("/api/auth/status");
      const data = (await res.json()) as { enabled: boolean; authenticated: boolean; user?: string };
      set({
        loaded: true,
        enabled: data.enabled,
        authenticated: data.authenticated,
        user: data.user || "",
      });
    } catch {
      // Treat an unreachable status endpoint as "not gated" rather than
      // stranding the user on a lock screen they can't get past.
      set({ loaded: true, enabled: false, authenticated: true });
    }
  },

  login: async (password) => {
    const error = await post("/api/auth/login", { password });
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
    set({ enabled: true, authenticated: true });
    return null;
  },

  disablePassword: async (currentPassword) => {
    const error = await post("/api/auth/password/disable", { currentPassword });
    if (error) return error;
    set({ enabled: false, authenticated: true });
    return null;
  },

  lock: () => {
    if (get().enabled && !get().authenticated) return;
    set({ enabled: true, authenticated: false, needsReload: hasSocket() });
  },
}));
