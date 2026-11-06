import type { ReactNode } from "react";

/** 对话框：唯一允许阴影的浮层（docs/09 §1）；Esc 关闭 */
export function Dialog({
  title,
  children,
  actions,
  onClose,
}: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="mx-4 w-full max-w-[440px] rounded-card border border-line bg-surface p-5 shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <div className="mt-3 flex flex-col gap-3 text-sm text-muted">{children}</div>
        <div className="mt-5 flex justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}
