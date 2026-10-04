import type { Server as SocketIOServer } from "socket.io";

/**
 * One device in the app at a time.
 *
 * Every device restores the same workspace file, so two of them end up using
 * the same tab ids — and creating a pty for an id that already has one kills
 * the existing pty. The first device was never told: its terminal simply went
 * dead while still looking connected. The layout, the open tabs and the
 * workspace file are all single-writer for the same reason.
 *
 * Rather than making each of those multi-device safe, the app admits one
 * device and lets another take over deliberately. Two devices on one terminal
 * is what a tmux tab is for.
 */
export interface Holder {
  /** Stable per-browser id, so a refresh is not mistaken for a second device. */
  deviceId: string;
  socketId: string;
  since: number;
}

export type ClaimResult = { ok: true; displaced: string | null } | { ok: false; holder: Holder };

/** How long a displaced socket has to receive the reason before it is closed. */
const DISPLACE_GRACE_MS = 50;

let holder: Holder | null = null;

/**
 * Admits a connection, displaces the current one, or refuses.
 *
 * An empty `deviceId` never matches, so a client that cannot identify itself
 * is treated as a separate device every time — it just has to tap through.
 */
export function claimSession(
  deviceId: string,
  socketId: string,
  opts: { takeover?: boolean; now?: number } = {},
): ClaimResult {
  const now = opts.now ?? Date.now();

  if (holder && holder.socketId !== socketId) {
    // The same browser coming back — a refresh, a tunnel blip, a phone waking
    // up — is not a second device and must not have to ask for its own lock.
    const sameDevice = deviceId !== "" && holder.deviceId === deviceId;
    if (!sameDevice && !opts.takeover) return { ok: false, holder };
    const displaced = holder.socketId;
    holder = { deviceId, socketId, since: now };
    return { ok: true, displaced };
  }

  holder = { deviceId, socketId, since: now };
  return { ok: true, displaced: null };
}

/** Frees the lock, if this socket is the one holding it. */
export function releaseSession(socketId: string): void {
  if (holder?.socketId === socketId) holder = null;
}

export function activeSession(): Holder | null {
  return holder;
}

/**
 * Mounted after the auth gate: who else is connected is not something to tell
 * a client that hasn't logged in.
 */
export function gatePresence(io: SocketIOServer): void {
  io.use((socket, next) => {
    const auth = socket.handshake.auth ?? {};
    const raw = typeof auth.deviceId === "string" ? auth.deviceId : "";
    const deviceId = /^[\w-]{1,64}$/.test(raw) ? raw : "";

    // A holder is released when its socket disconnects, which Socket.IO is
    // reliable about — but the lock is the only way into the app, so it does
    // not get to depend on that. If the holding socket is no longer on the
    // server, the lock is stale and nobody should have to take it over.
    const held = activeSession();
    if (held && !io.sockets.sockets.has(held.socketId)) releaseSession(held.socketId);

    const result = claimSession(deviceId, socket.id, { takeover: auth.takeover === true });

    if (!result.ok) {
      const err = new Error("busy") as Error & { data?: unknown };
      err.data = { since: result.holder.since };
      next(err);
      return;
    }

    if (result.displaced) {
      const old = io.sockets.sockets.get(result.displaced);
      if (old) {
        // Say why before closing, so the other device shows "taken over"
        // instead of reconnecting straight into a fight for the same lock.
        old.emit("displaced");
        setTimeout(() => old.disconnect(true), DISPLACE_GRACE_MS);
      }
    }

    socket.on("disconnect", () => releaseSession(socket.id));
    next();
  });
}
