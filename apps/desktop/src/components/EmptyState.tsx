import type { ReactNode } from "react";

/** 空态：书脊装饰（衬线排版世界），标题 + 说明 + 可选动作；centered = 居中变体 */
export function EmptyState({
  title,
  description,
  action,
  withSpines = false,
  centered = false,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  withSpines?: boolean;
  centered?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-3 py-2 ${centered ? "items-center text-center" : "items-start"}`}
    >
      {withSpines && <Spines />}
      <p className="font-serif text-lg text-ink">{title}</p>
      <p className="text-sm text-muted">{description}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** 排版书脊立在搁板上 —— 空的是"还没上架的书"，不是坏掉的图。
 *  标签取自本应用真实产出的三种格式；末册空脊微倾，示意虚位以待。 */
function Spines() {
  return (
    <div className="relative pr-9 pb-[4px]" aria-hidden="true">
      <div className="flex items-end gap-[4px]">
        <Spine label="PDF" height={118} />
        <Spine label="EPUB" height={102} />
        <Spine label="MD" height={90} />
        <Spine height={78} lean />
      </div>
      <div className="absolute bottom-0 left-[-10px] right-0 h-[4px] rounded-[2px] bg-[var(--control)]" />
    </div>
  );
}

function Spine({ label, height, lean = false }: { label?: string; height: number; lean?: boolean }) {
  return (
    <div
      style={{
        height,
        transform: lean ? "rotate(-7deg)" : undefined,
        transformOrigin: "bottom right",
      }}
      className="flex w-[30px] flex-none flex-col items-center justify-between rounded-[4px] border border-line bg-raised px-[3px] py-[7px]"
    >
      <span className="block h-[3px] w-3 rounded-full bg-[var(--control)]" />
      {label && (
        <span className="font-serif text-[12px] leading-none text-faint [writing-mode:vertical-rl]">
          {label}
        </span>
      )}
      <span className="block h-[3px] w-3 rounded-full bg-[var(--control)]" />
    </div>
  );
}
