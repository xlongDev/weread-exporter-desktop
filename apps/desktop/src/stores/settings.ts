import { create } from "zustand";
import type { SettingsMap } from "../types";
import { api, toAppError } from "../services/api";

interface SettingsState {
  settings: SettingsMap | null;
  loadError: string | null;
  /** 读取全部设置（启动时调用一次） */
  load: () => Promise<void>;
  /** 写入单个键并同步本地缓存；失败抛 AppError */
  set: (key: string, value: unknown) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  loadError: null,
  load: async () => {
    try {
      set({ settings: await api.settings(), loadError: null });
    } catch (e) {
      set({ loadError: toAppError(e).userMessage });
    }
  },
  set: async (key, value) => {
    await api.setSetting(key, value);
    const current = get().settings ?? {};
    set({ settings: { ...current, [key]: value } });
  },
}));
