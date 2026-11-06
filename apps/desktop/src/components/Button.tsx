import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink hover:opacity-90 disabled:opacity-40",
  secondary:
    "bg-surface text-ink border border-line hover:bg-raised disabled:opacity-40",
  ghost: "text-muted hover:bg-raised hover:text-ink disabled:opacity-40",
};

/** 控件高度统一 36px（--control-h），radius 6（docs/09 §5） */
export function Button({ variant = "secondary", className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] px-3 text-sm transition-colors disabled:cursor-not-allowed ${variantClass[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
