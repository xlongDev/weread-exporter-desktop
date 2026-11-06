export type PillTone = "neutral" | "positive" | "negative" | "warning";

const toneClass: Record<PillTone, string> = {
  neutral: "bg-[var(--pill-neutral-bg)] text-[var(--pill-neutral-ink)]",
  positive: "bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)]",
  negative: "bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)]",
  warning: "bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)]",
};

/** 状态徽章：颜色 + 文字双重表达（无障碍，docs/09 §8） */
export function StatusPill({ tone = "neutral", children }: { tone?: PillTone; children: string }) {
  return (
    <span
      className={`inline-flex h-5 flex-none items-center rounded-full px-2 text-xs font-medium whitespace-nowrap ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}
