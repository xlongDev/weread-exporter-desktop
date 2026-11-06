import { create } from "zustand";

export type Page = "dashboard" | "tasks" | "library" | "settings";

interface NavState {
  page: Page;
  goto: (page: Page) => void;
}

export const useNav = create<NavState>((set) => ({
  page: "dashboard",
  goto: (page) => set({ page }),
}));
