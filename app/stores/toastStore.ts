import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  type: "error" | "info";
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, type?: Toast["type"]) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message, type = "error") => {
    counter += 1;
    const id = counter;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Convenience for non-component callers.
export const showToast = (message: string, type?: Toast["type"]) => useToastStore.getState().show(message, type);
