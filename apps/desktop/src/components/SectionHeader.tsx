import type { ReactNode } from "react";

/** 区块标题行：左侧标题，右侧可选动作（docs/09 §4） */
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex h-8 items-center justify-between">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {action}
    </div>
  );
}
