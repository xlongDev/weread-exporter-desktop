import type { ReactNode } from "react";

/** 对话框：唯一允许阴影的浮层（docs/09 §1）；Esc 关闭；wide 用于书架网格等宽内容 */
export function Dialog({
  title,
  children,
  actions,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="anim-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`anim-dialog glass mx-4 w-full rounded-[24px] p-5 ${wide ? "max-w-[720px]" : "max-w-[440px]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <div className="mt-3 flex flex-col gap-3 text-sm text-muted">{children}</div>
        <div className="mt-5 flex justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}
