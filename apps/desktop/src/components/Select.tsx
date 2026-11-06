import type { SelectHTMLAttributes } from "react";

/** 原生 select 样式化：40px 表单控件（docs/09 §5） */
export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={`h-9 rounded-[6px] border border-line bg-surface px-2.5 text-sm text-ink transition-colors hover:border-[var(--control)] ${className}`}
    >
      {children}
    </select>
  );
}
