import { create } from "zustand";

/** IA 收缩（2026-11）：总览并入导出页，任务中心改为常驻底部任务 dock */
export type Page = "export" | "library" | "settings";

interface NavState {
  page: Page;
  goto: (page: Page) => void;
}

export const useNav = create<NavState>((set) => ({
  page: "export",
  goto: (page) => set({ page }),
}));
