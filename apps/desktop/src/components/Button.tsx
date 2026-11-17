import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink hover:opacity-90 disabled:opacity-40",
  secondary:
    "bg-surface text-ink border border-line hover:bg-raised disabled:opacity-40",
  ghost: "text-muted hover:bg-raised hover:text-ink disabled:opacity-40",
};

const sizeClass: Record<Size, string> = {
  md: "h-9 px-3 text-sm",
  lg: "h-11 px-4 text-[15px]",
};

/** 控件高度 36px（md）/ 44px（lg，首页主输入行），radius 6（docs/09 §5） */
export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full transition-colors disabled:cursor-not-allowed ${variantClass[variant]} ${sizeClass[size]} ${className}`}
    >
      {children}
    </button>
  );
}
