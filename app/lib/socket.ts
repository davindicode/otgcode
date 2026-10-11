import { io, type Socket } from "socket.io-client";
import { deviceId } from "./deviceId";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      // The server admits one device at a time; this is how it recognises
      // this one coming back rather than a new one arriving.
      auth: { deviceId: deviceId() },
    });

    // Takeover is a one-shot: left set, every automatic reconnect would
    // silently displace whoever holds the session by then.
    socket.on("connect", () => {
      if (socket) socket.auth = { deviceId: deviceId() };
    });
  }
  return socket;
}

/** True once a socket has been created (i.e. the app got past the lock screen). */
export function hasSocket(): boolean {
  return socket !== null;
}
