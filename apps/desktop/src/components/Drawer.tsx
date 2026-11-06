import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/** 右侧抽屉：任务详情等次级信息流 */
export function Drawer({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" role="presentation" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full w-[440px] max-w-[90vw] flex-col border-l border-line bg-surface shadow-[0_0_40px_rgba(0,0,0,0.14)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-none items-center justify-between border-b border-rule px-5 py-3.5">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted hover:bg-raised hover:text-ink"
          >
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-none justify-end gap-2 border-t border-rule px-5 py-3">{footer}</footer>}
      </aside>
    </div>
  );
}
