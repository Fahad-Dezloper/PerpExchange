"use client";

import { forwardRef } from "react";

type Variant = "primary" | "neutral" | "long" | "short" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "btn-primary",
  neutral: "border border-border bg-panel-2 text-fg hover:bg-panel",
  long: "bg-long/15 text-long hover:bg-long/25",
  short: "bg-short/15 text-short hover:bg-short/25",
  ghost: "text-muted hover:bg-panel-2 hover:text-fg",
  outline: "border border-border text-muted hover:border-border-soft hover:text-fg",
};

const SIZES: Record<Size, string> = {
  sm: "rounded-md px-2 py-1 text-xs",
  md: "rounded-lg px-3 py-1.5 text-[13px]",
  lg: "rounded-xl px-4 py-3 text-[15px]",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

// The single button primitive used across the app.
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "neutral", size = "md", className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-1.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export default Button;
