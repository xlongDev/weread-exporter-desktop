import { create } from "zustand";
import { api } from "../services/api";
import type { TaskRow } from "../types";

interface TasksStore {
  tasks: TaskRow[];
  loadError: string | null;
  load: () => Promise<void>;
}

export const useTasks = create<TasksStore>((set) => ({
  tasks: [],
  loadError: null,
  load: async () => {
    try {
      set({ tasks: await api.listTasks(50), loadError: null });
    } catch (e) {
      set({ loadError: String(e) });
    }
  },
}));
