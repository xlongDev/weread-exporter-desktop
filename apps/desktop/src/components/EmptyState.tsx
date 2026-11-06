import type { ReactNode } from "react";

/** 空态：书脊几何装饰（衬线书名世界），标题 + 说明 + 可选动作 */
export function EmptyState({
  title,
  description,
  action,
  withSpines = false,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  withSpines?: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-2 py-2">
      {withSpines && <Spines />}
      <p className="font-serif text-base text-ink">{title}</p>
      <p className="text-sm text-muted">{description}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** 三册书脊的极简几何图形 —— 只表达"书"这件事本身 */
function Spines() {
  return (
    <svg width="72" height="44" viewBox="0 0 72 44" fill="none" aria-hidden="true">
      <rect x="4" y="2" width="14" height="40" rx="2" className="fill-raised" />
      <rect x="24" y="8" width="14" height="34" rx="2" className="fill-raised" />
      <rect x="44" y="2" width="14" height="40" rx="2" className="fill-control" />
      <line x1="51" y1="8" x2="51" y2="36" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}
