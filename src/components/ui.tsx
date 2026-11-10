"use client";

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { X } from "lucide-react";

/* ── Nút ────────────────────────────────────────────────────── */

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const variantCls: Record<Variant, string> = {
  primary: "bg-gradient-to-b from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 shadow-sm shadow-indigo-600/20 focus-visible:ring-indigo-500/40",
  secondary: "bg-surface-2 text-foreground border border-border hover:bg-surface-2/70 hover:border-indigo-300/50 focus-visible:ring-indigo-500/30",
  ghost: "text-muted hover:text-foreground hover:bg-surface-2 focus-visible:ring-indigo-500/30",
  danger: "bg-gradient-to-b from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 shadow-sm shadow-red-600/20 focus-visible:ring-red-500/40",
};

export function Button({ variant = "primary", loading, className, disabled, children, ...rest }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium",
        "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none disabled:shadow-none",
        variantCls[variant],
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)}
      aria-hidden
    />
  );
}

export function LoadingBlock({ label = "Đang tải..." }: { label?: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted">
      <Spinner className="h-7 w-7 text-indigo-500" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/* ── Ô nhập liệu ───────────────────────────────────────────── */

interface FieldProps {
  label: string;
  error?: string | null;
  required?: boolean;
}

export function TextField({ label, error, required, id, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="label-base">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input id={id} className={cn("input-base", error && "border-red-500 focus:border-red-500 focus:ring-red-500/20")} {...rest} />
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

export function TextArea({ label, error, id, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label htmlFor={id} className="label-base">
        {label}
      </label>
      <textarea id={id} className={cn("input-base min-h-[80px] resize-y", error && "border-red-500 focus:border-red-500 focus:ring-red-500/20")} {...rest} />
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

export function SelectField({ label, error, id, children, ...rest }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      {label ? (
        <label htmlFor={id} className="label-base">
          {label}
        </label>
      ) : null}
      <select id={id} aria-label={label || undefined} className={cn("input-base appearance-none bg-surface-2", error && "border-red-500")} {...rest}>
        {children}
      </select>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

/* ── Thẻ & đánh dấu ─────────────────────────────────────────── */

export function Card({ className, style, children }: { className?: string; style?: React.CSSProperties; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface shadow-card", className)} style={style}>
      {children}
    </div>
  );
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", className)}>{children}</span>;
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-10 text-center animate-fade-up">
      <div className="text-muted animate-float">{icon}</div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-xs text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function ProgressBar({ percent, color = "bg-indigo-500" }: { percent: number; color?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={cn("h-full rounded-full transition-all duration-700 ease-out", color)} style={{ width: `${p}%` }} />
    </div>
  );
}

/* ── Modal ─────────────────────────────────────────────────── */

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        className={cn("relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface shadow-card-hover animate-scale-in sm:rounded-2xl", wide ? "sm:max-w-2xl" : "sm:max-w-md")}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground" aria-label="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
