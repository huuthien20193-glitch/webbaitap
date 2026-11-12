import { NextRequest, NextResponse } from "next/server";

/**
 * MODULE D – Proxy AI server-side.
 * - API key CHỈ nằm ở backend (env GEMINI_API_KEY), frontend gọi qua route này.
 * - Chưa có key → dùng AI CƠ SỞ (offline, engine ai-local.ts, không cần key).
 * - Có key nhưng Gemini lỗi/timeout → tự rơi về AI cơ sở (fallbackNote kèm theo).
 * - Giới hạn độ dài dữ liệu vào/out; JSON guard (tách khối ```json / {...}).
 */

import { parseChatAction, runLocalAI, type LocalMode } from "@/lib/ai-local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.GEMINI_API_KEY;
/** Model mặc định: "gemini-flash-latest" là alias tự trỏ tới Flash mới nhất — không bao giờ bị retire.
 *  Có env GEMINI_MODEL thì override. Chuỗi fallback chặn trường hợp model bị Google ngừng phục vụ (404). */
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const MODEL_CHAIN: string[] = [
  ...new Set([
    MODEL,
    "gemini-flash-latest",
    "gemini-3.8-flash",
    // Model Lite: vùng sức chứa free-tier riêng, vẫn đáp ứng khi Flash chính nghẽn 503/treo (probe 12/11)
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
  ]),
];

/** Key cá nhân người dùng dán trong app (BYOK) — ưu tiên hơn key env nếu có. Chấp nhận "AIza…" lẫn "AQ.Ab8…" */
function resolveKey(bodyApiKey: unknown): string {
  const k = typeof bodyApiKey === "string" ? bodyApiKey.trim() : "";
  if (k.length >= 30 && k.length <= 120 && /^[A-Za-z0-9_.-]+$/.test(k)) return k;
  return API_KEY ?? "";
}
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

const CHAT_PROMPT =
  "Bạn là trợ lý AI đa năng (kiểu ChatGPT) hoạt động trong app StudyFlow của học sinh, sinh viên Việt Nam.\n" +
  "Phạm vi: trả lời MỌI chủ đề — học tập, lập trình, khoa học, toán, nấu ăn, sức khỏe, thể thao, giải đố, viết lách, đời sống, trò chuyện tâm tình… KHÔNG giới hạn ở học tập và KHÔNG từ chối câu hỏi vì 'ngoài chuyên môn'.\n" +
  "Phong cách: tự nhiên, ấm áp, xưng \"mình\" — gọi người dùng là \"bạn\", dùng emoji vừa phải, không sáo rỗng, không dài dòng vô ích.\n" +
  "Khi DỮ LIỆU HỌC TẬP được cung cấp và câu hỏi liên quan, hãy dùng số liệu thật (nhiệm vụ, kỳ thi, tiến độ…) để trả lời cá nhân hoá; không bịa thêm số liệu không có.\n" +
  "Kiến thức hiện tại: nếu được hỏi về tin tức/sự kiện rất mới xảy ra sau thời điểm kiến thức của bạn, hãy nói thẳng mình không có dữ liệu cập nhật realtime.\n" +
  "Khi người dùng muốn TẠO nhiệm vụ / môn học / kỳ thi / thẻ ghi nhớ hay đánh dấu hoàn thành: nếu họ chưa gõ đúng mẫu lệnh, hướng dẫn ngắn gọn mẫu lệnh để dùng trong khung chat, ví dụ: \"tạo nhiệm vụ Làm lab 3 hạn mai 45 phút\" hoặc \"việc Đọc chương 2 xong rồi\".\n" +
  "Trả lời bằng tiếng Việt, có cấu trúc (gạch đầu dòng, **đậm** từ khoá chính), câu trả lời vừa đủ chi tiết — không lan man.";

const MODE_PROMPT: Record<Mode, string> = {
  chat: CHAT_PROMPT,
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

async function callGemini(system: string, turns: Turn[], json: boolean, apiKey: string): Promise<string> {
  const started = Date.now();
  let lastDetail = "";
  let sawBusy = false;
  // Chuỗi model fallback: 404 (bị retire) hoặc 503/treo (quá tải) → thử model kế tiếp.
  for (const model of MODEL_CHAIN) {
    const elapsed = Date.now() - started;
    if (elapsed > 38_000) break; // giữ tổng thời gian dưới trần 50s
    const cap = Math.min(15_000, 42_000 - (Date.now() - started));
    if (cap < 3_000) break;
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(cap),
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
    } catch (e) {
      // Treo/timeout model này → coi như quá tải, thử model kế
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
        sawBusy = true;
        continue;
      }
      throw e;
    }
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
      if (res.status === 429) {
        // Hết quota phút này trên model này → bucket quota của model khác có thể còn, thử model kế
        lastDetail = "rate limit (429)";
        sawBusy = true;
        continue;
      }
      if (res.status === 404 || res.status === 503) {
        lastDetail = detail || res.statusText;
        sawBusy = sawBusy || res.status === 503;
        continue;
      }
      throw new Error(`Lỗi AI (${res.status}): ${detail || res.statusText}`);
    }
    const j = await res.json();
    const text: unknown = j?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p?.text ?? "")
      .join("");
    if (typeof text !== "string" || text.trim() === "") throw new Error("AI trả về kết quả trống");
    return text.slice(0, MAX_OUTPUT);
  }
  if (sawBusy) throw new Error("Gemini đang quá tải (free tier) — thử lại sau vài phút nhé");
  throw new Error(lastDetail || "Gemini không phản hồi");
}

/* ── Handler ───────────────────────────────────────────────── */

function parseCtx(v: unknown): Record<string, unknown> {
  if (typeof v === "string" && v.trim().startsWith("{")) {
    try {
      const j: unknown = JSON.parse(v);
      return typeof j === "object" && j !== null && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

interface AIBody {
  mode?: Mode;
  prompt?: string;
  context?: unknown;
  messages?: IncomingMessage[];
  data?: unknown;
  /** Key cá nhân người dùng (BYOK) — tuỳ chọn */
  apiKey?: unknown;
}

/**
 * GET /api/ai — báo server đã cấu hình key Gemini chưa (boolean, KHÔNG trả key).
 * UI dùng để hiện badge "AI Pro" mặc định khi key nằm ở biến môi trường (Render env):
 * có env GEMINI_API_KEY → mọi người dùng được Gemini ngay từ đầu, không cần dán key.
 */
export async function GET() {
  return NextResponse.json({ serverKey: Boolean(API_KEY) });
}

export async function POST(req: NextRequest) {
  let body: AIBody | null = null;
  try {
    body = (await req.json().catch(() => null)) as AIBody | null;
  } catch {
    body = null;
  }

  if (!body || !body.mode || !(body.mode in MODE_PROMPT)) {
    return NextResponse.json({ error: "Mode không hợp lệ" }, { status: 400 });
  }
  const mode = body.mode;
  const jsonMode = mode === "questions" || mode === "flashcards" || mode === "plan" || mode === "suggestions";
  const messages = clipMessages(Array.isArray(body.messages) ? body.messages : []);
  const apiKey = resolveKey(body.apiKey);

  /* ── Chưa có key nào (env + cá nhân) → AI cơ sở (offline, không cần key) ── */
  if (!apiKey) {
    const local = runLocalAI({
      mode: mode as LocalMode,
      prompt: trunc(body.prompt, 2000),
      context: body.context ?? "",
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const payload: Record<string, unknown> = { mode, engine: "local" };
    if (local.text) payload.text = local.text;
    if (local.json !== undefined) payload.json = local.json;
    if (local.action) payload.action = local.action;
    if (local.error) payload.error = local.error;
    return NextResponse.json(payload, { status: 200 });
  }

  /* ── Có key → Gemini ── */
  try {
    const turns: Turn[] = [];

    if (mode === "chat") {
      if (messages.length === 0) return NextResponse.json({ error: "Thiếu nội dung trò chuyện" }, { status: 400 });
      // Lệnh hành động ("tạo nhiệm vụ…", "…xong rồi") hoạt động cả khi có key —
      // xử lý trực tiếp bằng parser, không cần gọi Gemini.
      const cmd = parseChatAction(messages[messages.length - 1].content ?? "", parseCtx(body.context));
      if (cmd) {
        const payload: Record<string, unknown> = { mode, engine: "local", text: cmd.reply };
        if (cmd.action) payload.action = cmd.action;
        return NextResponse.json(payload, { status: 200 });
      }
      // Lịch sử → turn đúng role của Gemini ("model" thay cho "assistant");
      // tin nhắn cuối (user) là phần cần trả lời.
      const history = messages.slice(0, -1);
      const last = messages[messages.length - 1];
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

    const text = await callGemini(MODE_PROMPT[mode], turns, jsonMode, apiKey);

    if (jsonMode) {
      const parsed = extractJson(text);
      if (parsed.error) {
        // Trả về dạng text thay vì JSON khi parse lỗi — UI vẫn hiển thị được
        return NextResponse.json({ mode, engine: "gemini", text, parseWarning: parsed.error });
      }
      return NextResponse.json({ mode, engine: "gemini", json: parsed.data });
    }

    return NextResponse.json({ mode, engine: "gemini", text });
  } catch (e) {
    /* ── Gemini lỗi (timeout/429/5xx/…) → rơi về AI cơ sở, vẫn có kết quả ── */
    const detail = e instanceof Error ? e.message : "Lỗi AI không xác định";
    const aborted = e instanceof Error && e.name === "AbortError";
    const local = runLocalAI({
      mode: mode as LocalMode,
      prompt: trunc(body.prompt, 2000),
      context: body.context ?? "",
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const payload: Record<string, unknown> = {
      mode,
      engine: "local",
      fallbackNote: (aborted ? "AI trả lời chậm, " : `Gemini lỗi (${detail}), `) + "đang dùng AI cơ sở (offline).",
    };
    if (local.error) payload.error = local.error;
    else {
      if (local.text) payload.text = local.text;
      if (local.json !== undefined) payload.json = local.json;
      if (local.action) payload.action = local.action;
    }
    return NextResponse.json(payload, { status: 200 });
  }
}
