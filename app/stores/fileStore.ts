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
  selectedFile: string | null;
  fileContent: string | null;
  loading: boolean;
  error: string | null;
}

interface FileState {
  sessions: Record<string, FileSession>;
  activeSessionId: string | null;

  createSession: (id?: string) => string;
  closeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  updateSession: (id: string, patch: Partial<FileSession>) => void;
}

let sessionCounter = 0;

export const useFileStore = create<FileState>((set, get) => ({
  sessions: {},
  activeSessionId: null,

  createSession: (id) => {
    sessionCounter++;
    const sessionId = id || `files-${Date.now()}`;
    const name = `Explorer ${sessionCounter}`;
    const { sessions } = get();
    set({
      sessions: {
        ...sessions,
        [sessionId]: {
          id: sessionId,
          name,
          cwd: "",
          entries: [],
          showHidden: false,
          selectedFile: null,
          fileContent: null,
          loading: false,
          error: null,
        },
      },
      activeSessionId: sessionId,
    });
    return sessionId;
  },

  closeSession: (id) => {
    const { sessions, activeSessionId } = get();
    const newSessions = { ...sessions };
    delete newSessions[id];
    const remaining = Object.keys(newSessions);
    set({
      sessions: newSessions,
      activeSessionId:
        activeSessionId === id ? (remaining.length > 0 ? remaining[remaining.length - 1] : null) : activeSessionId,
    });
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

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
