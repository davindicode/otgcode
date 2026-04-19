import * as pty from "node-pty";
import { existsSync } from "fs";

function getDefaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "cmd.exe";
  }
  // Use SHELL env if set (user's login shell)
  if (process.env.SHELL && existsSync(process.env.SHELL)) {
    return process.env.SHELL;
  }
  // macOS default is zsh, Linux is usually bash
  if (existsSync("/bin/zsh")) return "/bin/zsh";
  if (existsSync("/bin/bash")) return "/bin/bash";
  return "/bin/sh";
}

interface PtySession {
  id: string;
  process: pty.IPty;
  onData: (data: string) => void;
  onExit: (exitCode: number) => void;
}

const sessions = new Map<string, PtySession>();

export function createPty(
  sessionId: string,
  options: {
    shell?: string;
    cwd?: string;
    cols?: number;
    rows?: number;
    onData: (data: string) => void;
    onExit: (exitCode: number) => void;
  }
): void {
  if (sessions.has(sessionId)) {
    killPty(sessionId);
  }

  const shell = options.shell || process.env.DEFAULT_SHELL || getDefaultShell();
  const cwd = options.cwd || process.env.DEFAULT_CWD || process.env.HOME || process.env.USERPROFILE || "/";

  console.log(`pty-manager: spawning shell="${shell}", cwd="${cwd}"`);

  let proc: pty.IPty;
  try {
    proc = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd,
      env: process.env as Record<string, string>,
    });
  } catch (err) {
    console.error(`pty-manager: failed to spawn "${shell}" in "${cwd}":`, err);
    options.onExit(1);
    return;
  }

  const session: PtySession = {
    id: sessionId,
    process: proc,
    onData: options.onData,
    onExit: options.onExit,
  };

  proc.onData((data) => {
    session.onData(data);
  });

  proc.onExit(({ exitCode }) => {
    session.onExit(exitCode);
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, session);
}

export function writePty(sessionId: string, data: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.process.write(data);
  }
}

export function resizePty(sessionId: string, cols: number, rows: number): void {
  const session = sessions.get(sessionId);
  if (session) {
    try {
      session.process.resize(cols, rows);
    } catch {
      // Ignore resize errors for dead processes
    }
  }
}

export function killPty(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    try {
      session.process.kill();
    } catch {
      // Already dead
    }
    sessions.delete(sessionId);
  }
}

export function getPtyPid(sessionId: string): number | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  return session.process.pid;
}

export function getSessionIds(): string[] {
  return Array.from(sessions.keys());
}
