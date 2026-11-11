/** Gọi tầng AI server-side (/api/ai). Key env của chủ app nằm ở server; key cá nhân (nếu có) gửi kèm từng request. */
import { getStoredApiKey } from "@/lib/ai-key";

export type AIMode = "chat" | "summary" | "questions" | "flashcards" | "plan" | "report" | "suggestions";

export interface AIPayload {
  prompt?: string;
  context?: unknown;
  messages?: { role: "user" | "assistant"; content: string }[];
}

export interface AIAction {
  type: "createTask" | "completeTask" | "createCourse" | "createExam" | "createFlashcard";
  args: Record<string, unknown>;
}

export interface AIResult {
  text?: string;
  json?: unknown;
  parseWarning?: string;
  error?: string;
  /** Ghi chú server rơi về AI cơ sở (Gemini lỗi/key sai/chậm) */
  fallbackNote?: string;
  /** Lệnh hành động AI đề xuất — client thực thi trong app */
  action?: AIAction;
}

export async function askAI(mode: AIMode, payload: AIPayload): Promise<AIResult> {
  try {
    const apiKey = getStoredApiKey();
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, ...payload, ...(apiKey ? { apiKey } : {}) }),
    });
    const j: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = typeof j === "object" && j !== null && "error" in j ? String((j as { error: unknown }).error) : `Lỗi máy chủ (${res.status})`;
      return { error: msg };
    }
    const box = j as { text?: string; json?: unknown; parseWarning?: string; action?: unknown; fallbackNote?: string; error?: string };
    const action =
      typeof box.action === "object" && box.action !== null && typeof (box.action as { type?: unknown }).type === "string"
        ? (box.action as AIAction)
        : undefined;
    return { text: box.text, json: box.json ?? null, parseWarning: box.parseWarning, error: box.error, fallbackNote: box.fallbackNote, action };
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
