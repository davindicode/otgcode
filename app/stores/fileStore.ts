import { create } from "zustand";

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  modified: string;
  permissions: string;
}

export interface FileSession {
  id: string;
  name: string;
  cwd: string;
  entries: FileEntry[];
  showHidden: boolean;
  loading: boolean;
}

interface FileState {
  sessions: Record<string, FileSession>;

  createSession: (id?: string, name?: string, cwd?: string) => string;
  closeSession: (id: string) => void;
  updateSession: (id: string, patch: Partial<FileSession>) => void;
}

let sessionCounter = 0;

export const useFileStore = create<FileState>((set, get) => ({
  sessions: {},

  createSession: (id, restoredName, restoredCwd) => {
    sessionCounter++;
    const sessionId = id || `files-${Date.now()}`;
    const name = restoredName || `Explorer ${sessionCounter}`;
    const { sessions } = get();
    set({
      sessions: {
        ...sessions,
        [sessionId]: {
          id: sessionId,
          name,
          cwd: restoredCwd || "",
          entries: [],
          showHidden: false,
          loading: false,
        },
      },
    });
    return sessionId;
  },

  closeSession: (id) => {
    const { sessions } = get();
    const newSessions = { ...sessions };
    delete newSessions[id];
    set({ sessions: newSessions });
  },

  updateSession: (id, patch) => {
    const { sessions } = get();
    const session = sessions[id];
    if (!session) return;
    set({
      sessions: {
        ...sessions,
        [id]: { ...session, ...patch },
      },
    });
  },
}));
