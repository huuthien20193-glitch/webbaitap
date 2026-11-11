"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Renderer văn bản nhẹ cho tin nhắn AI: **đậm**, *nghiêng*, `code`,
 * gạch đầu dòng & xuống dòng — render bằng React node, không innerHTML.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const lines = (text ?? "").split("\n");
  return (
    <div className={cn("space-y-1", className)}>
      {lines.map((line, i) => {
        const t = line.trim();
        if (t === "") return <div key={i} className="h-1.5" aria-hidden />;
        if (t.startsWith("- ")) {
          return (
            <div key={i} className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500/80" aria-hidden />
              <span className="min-w-0">{inline(t.slice(2))}</span>
            </div>
          );
        }
        const num = t.match(/^(\d+)[.)]\s+(.*)$/);
        if (num) {
          return (
            <div key={i} className="flex gap-2">
              <span className="mt-[1px] flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 px-1 text-[10px] font-bold leading-none text-indigo-600 dark:text-indigo-300">
                {num[1]}
              </span>
              <span className="min-w-0">{inline(num[2])}</span>
            </div>
          );
        }
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

function inline(s: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // Đậm **x**; nghiêng *x* (bắt buộc có chữ cái bên trong — dấu * của phép tính
  // như "345*12+88" không bị nuốt, và không cướp dấu * của **đậm**); code `x`.
  const re = /\*\*(.+?)\*\*|\*(?=[^*\n]*\p{L})(\S(?:[^*\n]*\S)?)\*|`([^`]+)`/gu;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(<span key={k++}>{s.slice(last, m.index)}</span>);
    if (m[1] !== undefined) {
      parts.push(
        <strong key={k++} className="font-semibold">
          {m[1]}
        </strong>
      );
    } else if (m[2] !== undefined) {
      parts.push(
        <em key={k++} className="italic">
          {m[2]}
        </em>
      );
    } else {
      parts.push(
        <code key={k++} className="rounded bg-surface-2 px-1 py-0.5 text-[0.85em]">
          {m[3]}
        </code>
      );
    }
    last = re.lastIndex;
  }
  if (last < s.length) parts.push(<span key={k++}>{s.slice(last)}</span>);
  return parts;
}
