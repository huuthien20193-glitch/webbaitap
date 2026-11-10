/** Gọi tầng AI server-side (/api/ai). Key Gemini chỉ tồn tại ở server. */

export type AIMode = "chat" | "summary" | "questions" | "flashcards" | "plan" | "report" | "suggestions";

export interface AIPayload {
  prompt?: string;
  context?: unknown;
  messages?: { role: "user" | "assistant"; content: string }[];
}

export interface AIResult {
  text?: string;
  json?: unknown;
  parseWarning?: string;
  error?: string;
}

export async function askAI(mode: AIMode, payload: AIPayload): Promise<AIResult> {
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, ...payload }),
    });
    const j: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = typeof j === "object" && j !== null && "error" in j ? String((j as { error: unknown }).error) : `Lỗi máy chủ (${res.status})`;
      return { error: msg };
    }
    const box = j as { text?: string; json?: unknown; parseWarning?: string };
    return { text: box.text, json: box.json ?? null, parseWarning: box.parseWarning };
  } catch {
    return { error: "Không kết nối được tới máy chủ AI." };
  }
}

/** Bóc an toàn một mảng object từ JSON của AI */
export function asObjectArray(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
  if (typeof v === "object" && v !== null) {
    const obj = v as Record<string, unknown>;
    for (const key of ["days", "newTasks", "suggestions", "items"]) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
  }
  return [];
}

export function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : fallback;
}

export function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
