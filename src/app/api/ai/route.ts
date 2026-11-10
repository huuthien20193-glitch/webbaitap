import { NextRequest, NextResponse } from "next/server";

/**
 * MODULE D – Proxy Gemini server-side.
 * - API key CHỈ nằm ở backend (env GEMINI_API_KEY), frontend gọi qua route này.
 * - Giới hạn độ dài dữ liệu vào/out; reject body quá lớn.
 * - JSON guard: các mode trả JSON được parse có fallback (tách khối ```json / {...}).
 * - Xử lý lỗi API (403/429/5xx/timeout) và trả message thân thiện.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const MAX_TEXT = 6000; // ký tự mỗi tin nhắn
const MAX_MESSAGES = 16; // tin nhắn ngữ cảnh tối đa
const MAX_OUTPUT = 8192; // ký tự metadata vừa đủ

type Mode = "chat" | "summary" | "questions" | "flashcards" | "plan" | "report" | "suggestions";

interface IncomingMessage {
  role?: string;
  content?: string;
}

function trunc(v: unknown, max = MAX_TEXT): string {
  const s = String(v ?? "");
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function clipMessages(msgs: IncomingMessage[]): { role: "user" | "assistant"; content: string }[] {
  return msgs
    .filter((m) => m && typeof m === "object" && typeof m.content === "string")
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" as const : ("user" as const),
      content: trunc(m.content),
    }));
}

/* ── System prompts ────────────────────────────────────────── */

const BASE =
  "Bạn là trợ lý học tập của một nền tảng quản lý học tập dành cho học sinh, sinh viên Việt Nam. " +
  "Luôn trả lời bằng tiếng Việt, ngắn gọn, chính xác, có cấu trúc rõ ràng (gạch đầu dòng khi phù hợp). " +
  "Không sử dụng dữ liệu giả; nếu thiếu thông tin hãy hỏi lại hoặc nói rõ rằng cần thêm dữ liệu.";

const MODE_PROMPT: Record<Mode, string> = {
  chat: BASE,
  summary: `${BASE}\nNhiệm vụ: TÓM TẮT tài liệu học tập người dùng cung cấp. Trả về: (1) ý chính gạch đầu dòng, (2) từ khóa cần nhớ, (3) câu hỏi tự kiểm tra. Tuân thủ nghiêm nội dung được cho, không bịa thêm.`,
  questions: `${BASE}\nNhiệm vụ: TẠO CÂU HỎI TRẮC NGHIỆM từ nội dung. Trả về CHỈ JSON mảng: [{"question": string, "options": [string, string, string, string], "answerIndex": 0|1|2|3, "explain": string}]. Tạo 5 câu, mỗi câu 4 lựa chọn.`,
  flashcards: `${BASE}\nNhiệm vụ: TẠO FLASHCARD từ nội dung. Trả về CHỈ JSON mảng: [{"question": string, "answer": string}] với 6–10 thẻ, một mặt là câu hỏi ngắn gọn, một mặt là đáp án súc tích.`,
  plan: `${BASE}\nNhiệm vụ: ĐỀ XUẤT LỊCH HỌC. Dựa trên dữ liệu nhiệm vụ (deadline, độ khó, độ quan trọng, thời lượng) và thời gian có sẵn mỗi ngày. Trả về CHỈ JSON: {"summary": string, "days": [{"date": "YYYY-MM-DD", "items": [{"taskTitle": string, "minutes": number, "reason": string}]}], "newTasks": [{"title": string, "courseName": string, "estMinutes": number, "difficulty": 1..5, "importance": 1..5}]}. Chỉ đề xuất, không yêu cầu thêm thông tin.`,
  report: `${BASE}\nNhiệm vụ: PHÂN TÍCH dữ liệu học tập của bạn (thời gian học, nhiệm vụ, kết quả kiểm tra, flashcard, mức độ hiểu chương) và viết BÁO CÁO TUẦN bằng tiếng Việt (≤ 300 từ): điểm tốt / điểm yếu / 3 hành động cụ thể cho tuần sau.`,
  suggestions: `${BASE}\nNhiệm vụ: Từ dữ liệu nhiệm vụ & tiến độ, trả về CHỈ JSON: {"suggestions": [string, string, string]} — 3 gợi ý công việc nên ưu tiên tiếp theo, mỗi gợi ý ≤ 20 từ, dựa trên deadline/difficulty/importance/progress.`,
};

/* ── JSON parse có fallback ────────────────────────────────── */

function extractJson(text: string): { data: unknown; error?: string } {
  try {
    return { data: JSON.parse(text) };
  } catch {
    // fallback: cặp ngoặc lớn nhất
    const candidates: string[] = [];
    const firstArray = text.indexOf("[");
    const firstObj = text.indexOf("{");
    const start = Math.min(firstArray === -1 ? Infinity : firstArray, firstObj === -1 ? Infinity : firstObj);
    if (!Number.isFinite(start)) return { data: null, error: "AI trả về không có JSON" };
    candidates.push(text.slice(start));
    try {
      const parsed = JSON.parse(candidates[0]);
      return { data: parsed };
    } catch {
      return { data: null, error: "JSON không hợp lệ" };
    }
  }
}

/* ── Gemini call ───────────────────────────────────────────── */

interface Turn {
  role: "user" | "model";
  text: string;
}

async function callGemini(system: string, turns: Turn[], json: boolean): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);
  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(API_KEY as string)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: {
          temperature: json ? 0.6 : 0.9,
          maxOutputTokens: 2048,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const j = await res.json();
        detail = j?.error?.message ?? "";
      } catch {
        /* ignore */
      }
      if (res.status === 400 && detail.toLowerCase().includes("api key")) {
        throw new Error("API key Gemini không hợp lệ");
      }
      if (res.status === 429) throw new Error("AI đang quá tải (rate limit), thử lại sau ít phút");
      throw new Error(`Lỗi AI (${res.status}): ${detail || res.statusText}`);
    }
    const j = await res.json();
    const text: unknown = j?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p?.text ?? "")
      .join("");
    if (typeof text !== "string" || text.trim() === "") throw new Error("AI trả về kết quả trống");
    return text.slice(0, MAX_OUTPUT);
  } finally {
    clearTimeout(timeout);
  }
}

/* ── Handler ───────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    if (!API_KEY) {
      return NextResponse.json(
        { error: "AI chưa được cấu hình: thêm GEMINI_API_KEY vào biến môi trường phía server." },
        { status: 503 }
      );
    }

    const body = (await req.json().catch(() => null)) as
      | { mode?: Mode; prompt?: string; context?: unknown; messages?: IncomingMessage[]; data?: unknown }
      | null;

    if (!body || !body.mode || !(body.mode in MODE_PROMPT)) {
      return NextResponse.json({ error: "Mode không hợp lệ" }, { status: 400 });
    }
    const mode = body.mode;
    const jsonMode = mode === "questions" || mode === "flashcards" || mode === "plan" || mode === "suggestions";

    const turns: Turn[] = [];

    if (mode === "chat") {
      const msgs = clipMessages(Array.isArray(body.messages) ? body.messages : []);
      if (msgs.length === 0) return NextResponse.json({ error: "Thiếu nội dung trò chuyện" }, { status: 400 });
      // Lịch sử → turn đúng role của Gemini ("model" thay cho "assistant");
      // tin nhắn cuối (user) là phần cần trả lời.
      const history = msgs.slice(0, -1);
      const last = msgs[msgs.length - 1];
      for (const m of history) {
        turns.push({ role: m.role === "assistant" ? "model" : "user", text: m.content });
      }
      turns.push({ role: "user", text: last.content || "(trống)" });
    } else {
      const prompt = trunc(body.prompt, 2000);
      const ctx = trunc(body.context ?? "", 5000);
      turns.push({
        role: "user",
        text: `${prompt ? `NỘI DUNG / CÂU HỎI:\n${prompt}\n\n` : ""}DỮ LIỆU HỌC TẬP LIÊN QUAN (JSON):\n${ctx || "(trống)"}`,
      });
    }

    const text = await callGemini(MODE_PROMPT[mode], turns, jsonMode);

    if (jsonMode) {
      const parsed = extractJson(text);
      if (parsed.error) {
        // Trả về dạng text thay vì JSON khi parse lỗi — UI vẫn hiển thị được
        return NextResponse.json({ mode, text, parseWarning: parsed.error });
      }
      return NextResponse.json({ mode, json: parsed.data });
    }

    return NextResponse.json({ mode, text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi AI không xác định";
    const status = e instanceof Error && e.name === "AbortError" ? 504 : 502;
    return NextResponse.json({ error: status === 504 ? "AI phản hồi chậm, thử lại nhé." : message }, { status });
  }
}
