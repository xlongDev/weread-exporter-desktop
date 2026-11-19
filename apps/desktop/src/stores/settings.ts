import { create } from "zustand";
import type { SettingsMap } from "../types";
import { api, toAppError } from "../services/api";
import { useI18n, type Lang } from "../i18n";

/** 语言键写入/读取时同步 i18n store（load 与 set 各一处，UI 无需再散 effect） */
function syncLang(value: unknown) {
  if (value === "zh" || value === "en") useI18n.getState().setLang(value as Lang);
}

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
      const map = await api.settings();
      syncLang(map["general.language"]);
      set({ settings: map, loadError: null });
    } catch (e) {
      set({ loadError: toAppError(e).userMessage });
    }
  },
  set: async (key, value) => {
    await api.setSetting(key, value);
    if (key === "general.language") syncLang(value);
    const current = get().settings ?? {};
    set({ settings: { ...current, [key]: value } });
  },
}));
