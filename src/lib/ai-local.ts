/**
 * AI CƠ SỞ (offline) – chạy trực tiếp trên server KHÔNG cần GEMINI_API_KEY.
 *
 * Nguyên tắc tuyệt đối: chỉ tính từ dữ liệu người dùng truyền vào (prompt/context).
 * Không bịa nội dung; không gọi Internet. Khi có GEMINI_API_KEY, route /api/ai
 * ưu tiên Gemini và chỉ rơi về engine này khi key chưa cấu hình hoặc Gemini lỗi.
 */

import { shiftDateStr, todayStr } from "@/lib/date";

export type LocalMode = "chat" | "summary" | "questions" | "flashcards" | "plan" | "report" | "suggestions";

export interface LocalInput {
  mode: LocalMode;
  prompt: string;
  context: unknown;
  messages?: { role?: string; content?: string }[];
}

export interface LocalOutput {
  text?: string;
  json?: unknown;
  error?: string;
  /** Lệnh hành động AI đề xuất — client thực thi trực tiếp trong app */
  action?: AIAction;
}

/** Hành động AI có thể tự làm trong app (client thực thi qua useData) */
export interface AIAction {
  type: "createTask" | "completeTask" | "createCourse" | "createExam" | "createFlashcard";
  args: Record<string, unknown>;
}

const BAD = new Set(
  ("và hoặc của là một mấy các những cho với về từ đến tới để khi mà thì bị được phải có không này đó " +
    "nó sẽ vẫn đã đang cũng như rất lắm nhé thôi đi vào ra ở trong ngoài trên dưới rồi nên nếu nhưng bằng theo cả " +
    "mỗi vài ít nhiều giờ phút ngày tuần tháng năm hôm nay mai qua khi nào sao thế mình bạn ta người dùng cũng vậy " +
    "the of in to and or for with is are a an this that")
    .split(/\s+/)
    .filter(Boolean)
);

function clampText(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !BAD.has(w));
}

function freqTerms(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens(text)) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function topTerms(text: string, n: number): string[] {
  return [...freqTerms(text).entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, n)
    .map(([t]) => t);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?:[.!?;\n]|\s-{2,})+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 15);
}

function cap(s: string): string {
  const t = s.trim();
  return t.length ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function asObj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/* ── 1. Tóm tắt trích xuất (extractive) ──────────────────── */

export function localSummary(prompt: string): LocalOutput {
  const content = clampText(prompt, 6000);
  if (content.split(/\s+/).length < 20) {
    return { error: "Cần nội dung dài hơn để tóm tắt — hãy dán bài học/ghi chú vào ô rồi gửi lại." };
  }
  const terms = freqTerms(content);
  const scored = splitSentences(content).map((s, i) => {
    let score = 0;
    for (const t of tokens(s)) score += terms.get(t) ?? 0;
    return { s, i, score: score / Math.sqrt(Math.max(6, s.split(/\s+/).length)) };
  });
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, 5).sort((a, b) => a.i - b.i);
  const keywords = topTerms(content, 8);
  const selfs: string[] = [];
  for (const { s } of top) {
    if (selfs.length >= 3) break;
    const m = s.match(/^(.{2,70}?)\s+là\s+(.{10,})$/i);
    if (m) {
      selfs.push(`${cap(m[1])} là gì?`);
      continue;
    }
    const kw = topTerms(s, 1)[0];
    if (kw && s.toLowerCase().includes(kw) && !selfs.some((q) => q === s)) {
      selfs.push(`${s.replace(new RegExp(kw, "i"), "___")} — từ còn thiếu là gì?`);
    }
  }
  const lines: string[] = [
    "**Tóm tắt (AI cơ sở – trích nguyên văn từ nội dung bạn gửi, không bịa thêm):**",
    ...top.map((x) => `- ${x.s}`),
    "",
    `**Từ khóa cần nhớ:** ${keywords.join(", ")}`,
  ];
  if (selfs.length > 0) {
    lines.push("", "**Tự kiểm tra:**");
    selfs.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
  }
  return { text: lines.join("\n") };
}

/* ── 2. Flashcards từ nội dung ───────────────────────────── */

export function localFlashcards(prompt: string): LocalOutput {
  const content = clampText(prompt, 6000);
  if (content.split(/\s+/).length < 15) {
    return { error: "Cần nội dung dài hơn để tạo flashcard — dán đoạn học vào ô rồi gửi lại." };
  }
  const cards: { question: string; answer: string }[] = [];
  const seen = new Set<string>();
  const push = (q: string, a: string) => {
    const key = q.toLowerCase();
    if (!seen.has(key) && cards.length < 8) {
      seen.add(key);
      cards.push({ question: q, answer: a });
    }
  };

  for (const s of splitSentences(content)) {
    const def = s.match(/^(.{2,70}?)\s+là\s+(.{10,200})$/i);
    if (def) {
      push(`${cap(def[1])} là gì?`, `${cap(def[1])} là ${def[2].trim().replace(/\.$/, "")}`);
      continue;
    }
    const enu = s.match(/^(\S.{1,68}?)\s*(?:bao\s+gồm|gồm\s+có|gồm|có\s+các)\s*:?\s*(.{10,120})$/i);
    if (enu) {
      push(`${cap(enu[1])} gồm những gì (kể tên)?`, cap(enu[2].trim().replace(/\.$/, "")));
    }
  }
  const terms = topTerms(content, 6);
  for (const s of splitSentences(content)) {
    if (cards.length >= 8) break;
    const kw = terms.find((t) => new RegExp(`\\b${t}\\b`, "i").test(s));
    if (kw) push(s.replace(new RegExp(kw, "i"), "___"), kw);
  }

  if (cards.length === 0) return { error: "Nội dung này quá ít mẫu hình để tạo thẻ — thử nội dung có định nghĩa ('X là Y') hoặc liệt kê." };
  return { json: cards, text: `AI cơ sở đã tạo ${cards.length} thẻ trực tiếp từ nội dung của bạn.` };
}

/* ── 3. Trắc nghiệm từ nội dung ──────────────────────────── */

export function localQuestions(prompt: string): LocalOutput {
  const content = clampText(prompt, 6000);
  if (content.split(/\s+/).length < 25) {
    return { error: "Cần nội dung dài hơn để tạo trắc nghiệm — dán đoạn học vào ô rồi gửi lại." };
  }
  const out: Record<string, unknown>[] = [];
  const sentences = splitSentences(content);
  const terms = topTerms(content, 12);

  for (const s of sentences) {
    if (out.length >= 5) break;
    const def = s.match(/^(.{2,70}?)\s+là\s+(.{10,200})$/i);
    if (def && terms.length >= 4) {
      const subject = cap(def[1]);
      const right = cap(def[2].trim().replace(/\.$/, "")).split(/[,;]/)[0].trim();
      if (right.length >= 8 && right.length <= 70) {
        const distract = terms
          .filter((t) => !new RegExp(`\\b${t}\\b`, "i").test(def[2]))
          .slice(0, 3)
          .map((t) => cap(t));
        const options = [...distract];
        const answerIndex = out.length % 4;
        options.splice(answerIndex, 0, right);
        if (options.length >= 4) {
          out.push({ question: `${subject} là gì?`, options: options.slice(0, 4), answerIndex, explain: s });
          continue;
        }
      }
    }
    const kw = terms.find((t) => new RegExp(`\\b${t}\\b`, "i").test(s));
    if (kw && terms.length >= 4) {
      const options = terms.filter((t) => t !== kw).slice(0, 3).map((t) => t);
      const answerIndex = (out.length + 1) % 4;
      options.splice(answerIndex, 0, kw);
      out.push({ question: `Điền từ còn thiếu: ${s.replace(new RegExp(kw, "i"), "___")}`, options, answerIndex, explain: `Câu gốc: ${s}` });
    }
  }

  if (out.length === 0) return { error: "Nội dung này quá ít mẫu hình để tạo câu hỏi — thử nội dung có định nghĩa hoặc từ khóa lặp lại." };
  return { json: out, text: `AI cơ sở đã tạo ${out.length} câu hỏi trắc nghiệm từ nội dung của bạn.` };
}

/* ── 4. Kế hoạch 7 ngày (thuật toán xếp lịch) ────────────── */

interface PlanTask {
  title: string;
  course: string;
  dueDate: string;
  priority: string;
  estMinutes: number;
  progress: number;
}

function scoreTask(t: PlanTask, today: string): number {
  const days = Math.max(0, Math.round((new Date(t.dueDate).getTime() - new Date(today).getTime()) / 86400000));
  const urgency = 6 / Math.max(1, days / 2 + 1);
  const prio = (["low", "medium", "high"].indexOf(t.priority) + 1) * 3;
  return urgency * 2 + prio + (100 - t.progress) / 20;
}

export function localPlan(ctx: Record<string, unknown>): LocalOutput {
  const today = /^[12]\d{3}-[01]\d-[0-3]\d$/.test(clampText(ctx.today, 10)) ? clampText(ctx.today, 10) : todayStr();
  const minutesPerDay = Math.min(600, Math.max(30, Number(ctx.minutesPerDay) || 90));
  const tasks: PlanTask[] = Array.isArray(ctx.tasks)
    ? (ctx.tasks as Record<string, unknown>[])
        .map((t) => ({
          title: clampText(t.title ?? "Nhiệm vụ", 80),
          course: clampText(t.course, 60),
          dueDate: /^[12]\d{3}-[01]\d-[0-3]\d$/.test(clampText(t.dueDate, 10)) ? clampText(t.dueDate, 10) : today,
          priority: clampText(t.priority, 10) || "medium",
          estMinutes: Math.min(600, Math.max(10, Number(t.estMinutes) || 30)),
          progress: Math.min(100, Math.max(0, Number(t.progress) || 0)),
        }))
        .filter((t) => Number.isFinite(new Date(t.dueDate).getTime()))
    : [];

  if (tasks.length === 0) {
    return { json: { summary: "Chưa có nhiệm vụ nào cần xếp — tạo nhiệm vụ trước để AI lập kế hoạch.", days: [], newTasks: [] } };
  }

  const sorted = [...tasks].sort((a, b) => scoreTask(b, today) - scoreTask(a, today));
  const capacity = new Map<string, number>();
  for (let i = 0; i < 7; i++) capacity.set(shiftDateStr(today, i), minutesPerDay);

  const dayItems = new Map<string, { taskTitle: string; minutes: number; reason: string }[]>();
  let scheduled = 0;

  for (const t of sorted.slice(0, 14)) {
    let remain = t.estMinutes;
    for (const d of capacity.keys()) {
      if (remain <= 0) break;
      const c = capacity.get(d) ?? 0;
      if (c <= 10) continue;
      const chunk = Math.min(remain, c, 90);
      capacity.set(d, c - chunk);
      const late = t.dueDate < d;
      const reason = late
        ? "Xếp sau deadline — dồn từ những hôm trước đã kín"
        : t.progress > 60
          ? `Gần hoàn thành (${t.progress}%) — dứt điểm sớm`
          : t.dueDate <= d
            ? "Đến hoặc qua hạn — làm ngay hôm nay"
            : `Theo độ ưu tiên — còn ${Math.max(1, Math.round((new Date(t.dueDate).getTime() - new Date(today).getTime()) / 86400000))} ngày đến hạn`;
      const arr = dayItems.get(d) ?? [];
      const same = arr.find((i) => i.taskTitle === t.title);
      if (same) same.minutes += chunk;
      else arr.push({ taskTitle: t.title, minutes: chunk, reason });
      dayItems.set(d, arr);
      remain -= chunk;
      scheduled += chunk;
    }
  }

  const totalNeed = tasks.reduce((a, b) => a + b.estMinutes, 0);
  const days = [...capacity.keys()].map((date) => ({ date, items: dayItems.get(date) ?? [] })).filter((d) => d.items.length > 0);
  const firstCourse = clampText(sorted[0].course, 60);
  const summary =
    `AI cơ sở đã xếp ${scheduled}/${totalNeed} phút vào ${days.length} ngày tới, ` +
    `giới hạn ${minutesPerDay} phút/ngày, ưu tiên deadline & độ quan trọng` +
    (firstCourse ? `, bắt đầu từ "${firstCourse}"` : "") +
    (scheduled < totalNeed ? `. Còn ${totalNeed - scheduled} phút chưa xếp được trong 7 ngày — cân nhắc tăng thời gian/ngày hoặc hạ deadline.` : ".");
  return { json: { summary, days, newTasks: [] } };
}

/* ── 5. Gợi ý 3 việc nên làm (từ dữ liệu thật) ───────────── */

export function localSuggestions(ctx: Record<string, unknown>): LocalOutput {
  const today = /^[12]\d{3}-[01]\d-[0-3]\d$/.test(clampText(ctx.today, 10)) ? clampText(ctx.today, 10) : todayStr();
  const openTasks = Array.isArray(ctx.openTasks) ? (ctx.openTasks as Record<string, unknown>[]) : [];
  const dueCards = Number(ctx.dueCards) || 0;
  const weeklyMinutes = Number(ctx.weeklyMinutes) || 0;
  const streak = Number(ctx.streak) || 0;
  const exam = asObj(ctx.upcomingExam);
  const examTitle = clampText(exam.title, 60);

  const s: string[] = [];
  for (const t of openTasks.slice(0, 3)) {
    const title = clampText(t.title ?? "", 60);
    if (title) s.push(title.charAt(0).toLowerCase() + title.slice(1));
  }
  if (exam && Number(exam.inDays) >= 0 && examTitle) {
    s.unshift(`Ôn bài cho ${examTitle} — còn ${clampText(exam.inDays, 4)} ngày nữa thi`);
  } else if (dueCards > 0) {
    s.unshift(`Ôn ${dueCards} flashcard đến hạn hôm nay (trang Ôn tập)`);
  }
  if (weeklyMinutes === 0) s.push("Tạo phiên Pomodoro 25 phút đầu tiên của tuần để bật động lực");
  if (streak === 0 && weeklyMinutes > 0) s.push("Học thêm hôm nay để bắt đầu chuỗi ngày học 🔥");
  while (s.length < 3) s.push(s.length === 1 ? "Chia nhỏ nhiệm vụ lớn thành phần 30–45 phút trong Planner" : s.length === 2 ? "Duy trì nhịp: mỗi ngày 1 phiên tập trung là đủ tạo thói quen" : "Check mức hiểu bài (Môn học → chương) ở phần yếu nhất");

  const suggestions = s.slice(0, 3).map((x) => cap(x));
  return { json: { suggestions } };
}

/* ── 6. Báo cáo tuần (từ số liệu thật) ───────────────────── */

function fmtMin(v: unknown): string {
  const n = Math.round(Number(v) || 0);
  return n >= 60 ? `${Math.floor(n / 60)} giờ${n % 60 ? ` ${n % 60} phút` : ""}` : `${n} phút`;
}

export function localReport(ctx: Record<string, unknown>): LocalOutput {
  const totals = asObj(ctx.totals);
  const minutesThis = Number(totals.minutesThisWeek);
  const minutesPrev = Number(totals.prevWeekMinutes);
  const completionRate = Number(totals.completionRate);
  const streakDays = Number(totals.streakDays);
  const openTasks = Number(totals.openTasks);
  const byCourse = Array.isArray(ctx.byCourse) ? (ctx.byCourse as Record<string, unknown>[]) : [];
  const weak = Array.isArray(ctx.weakChapters) ? (ctx.weakChapters as Record<string, unknown>[]) : [];
  const dueCards = Number(asObj(ctx.flashcards).due);

  const deltas = minutesThis - minutesPrev;
  const best = [...byCourse].sort((a, b) => Number(b.minutes) - Number(a.minutes))[0];
  const weakestCourse = [...byCourse].sort((a, b) => Number(a.completion) - Number(b.completion))[0];

  const good: string[] = [];
  if (minutesThis > 0) good.push(`Tập trung được ${fmtMin(minutesThis)} trong tuần`);
  if (deltas > 0) good.push(`Tăng ${fmtMin(deltas)} so với tuần trước`);
  if (completionRate >= 60) good.push(`Tỷ lệ hoàn thành nhiệm vụ tốt: ${completionRate}%`);
  if (streakDays > 1) good.push(`Chuỗi ${streakDays} ngày học liên tiếp`);
  if (best && Number(best.minutes) > 0) good.push(`Chiếc xe dẫn đầu: ${clampText(best.course, 40)}`);

  const bad: string[] = [];
  if (minutesThis === 0) bad.push("Tuần này chưa ghi nhận phiên học nào");
  else if (deltas < 0) bad.push(`Kém ${fmtMin(-deltas)} so với tuần trước`);
  if (openTasks > 0 && completionRate < 50) bad.push(`Còn ${openTasks} nhiệm vụ, tỷ lệ hoàn thành ${completionRate}% hơi thấp`);
  if (weak.length > 0) bad.push(`${weak.length} chương học mức hiểu 1–2 cần củng cố`);
  if (weakestCourse && Number(weakestCourse.completion) < 40) bad.push(`"${clampText(weakestCourse.course, 40)}" đang chậm tiến độ nhất`);

  const actions: string[] = [];
  if (dueCards > 0) actions.push(`Ôn ngay ${dueCards} flashcard đến hạn (trang Ôn tập) — SM-2 sẽ đưa đúng thẻ quên nhất lên đầu`);
  if (weak.length > 0) actions.push(`Đánh mức hiểu bài lại cho ${clampText(asObj(weak[0]).chapter, 40)} (${clampText(asObj(weak[0]).course, 40)}) sau khi đọc lại`);
  if (minutesThis < 300) actions.push("Đặt mục tiêu 60 phút/ngày trong Planner và để Pomodoro chạy đủ phiên");
  else actions.push("Bổ sung 2 phiên Pomodoro ngắn cho môn chậm tiến độ nhất");
  while (actions.length < 3) actions.push(actions.length === 2 ? "Tạo trắc nghiệm tuần bằng Trợ lý AI để kiểm tra mức nhớ" : "Deadline gần nhất: xem Planner → Bảng tuần để rải việc ra trước");

  const text =
    "**Báo cáo tuần (AI cơ sở – tính trực tiếp từ dữ liệu của bạn):**\n\n" +
    `**Điểm tốt:**\n${good.length ? good.map((g, i) => `${i + 1}. ${g}`).join("\n") : "— Chưa đủ dữ liệu trong tuần để nhận diện điểm tốt."}\n\n` +
    (bad.length ? `**Điểm cần cải thiện:**\n${bad.map((g, i) => `${i + 1}. ${g}`).join("\n")}\n\n` : "") +
    `**3 hành động cho tuần sau:**\n${actions.slice(0, 3).map((g, i) => `${i + 1}. ${g}`).join("\n")}`;
  return { text };
}

/* ── 6.5 Lệnh hành động: "tạo nhiệm vụ X hạn mai", "việc Y xong rồi" ── */

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Đọc ngày tiếng Việt: "mai", "hôm nay", "2 ngày nữa", "thứ 5", "25/11", "2026-11-20"… */
function parseVNDate(text: string, today: string): { date: string; matched: string } | null {
  const t = text.toLowerCase();
  let m = t.match(/\b([12]\d{3}-[01]\d-[0-3]\d)\b/);
  if (m) return { date: m[1], matched: m[1] };

  m = t.match(/\b([0-3]?\d)\s*[\/-]\s*([01]?\d)(?:\s*[\/-]\s*([12]\d{3}))?\b/);
  if (m) {
    const day = Math.min(31, Math.max(1, Number(m[1])));
    const mon = Math.min(12, Math.max(1, Number(m[2])));
    const y = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
    let date = `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!m[3] && date < today) date = `${y + 1}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { date, matched: m[0] };
  }

  m = t.match(/\b(\d+)\s*tuần\s*(nữa|tới|sau)?\b/);
  if (m) return { date: shiftDateStr(today, Number(m[1]) * 7), matched: m[0] };

  m = t.match(/\b(\d+)\s*ngày\s*(nữa|tới|sau)?\b/);
  if (m) return { date: shiftDateStr(today, Number(m[1])), matched: m[0] };

  if (/\bhôm\s*nay\b/.test(t)) return { date: today, matched: "hôm nay" };
  if (/\bmốt\b/.test(t)) return { date: shiftDateStr(today, 2), matched: t.match(/\bngày\s*mốt\b/)?.[0] ?? "mốt" };
  if (/\bngày\s*mai\b/.test(t)) return { date: shiftDateStr(today, 1), matched: "ngày mai" };
  if (/\bmai\b/.test(t)) return { date: shiftDateStr(today, 1), matched: "mai" };
  if (/\btuần\s*sau\b/.test(t)) return { date: shiftDateStr(today, 7), matched: "tuần sau" };
  if (/\btháng\s*sau\b/.test(t)) return { date: shiftDateStr(today, 30), matched: "tháng sau" };

  const WEEKDAYS: [RegExp, number][] = [
    [/thứ\s*2|thứ\s*hai/, 1], [/thứ\s*3|thứ\s*ba/, 2], [/thứ\s*4|thứ\s*tư/, 3],
    [/thứ\s*5|thứ\s*năm/, 4], [/thứ\s*6|thứ\s*sáu/, 5], [/thứ\s*7|thứ\s*bảy/, 6],
    [/chủ\s*nhật/, 0],
  ];
  for (const [re, target] of WEEKDAYS) {
    m = t.match(re);
    if (m) {
      const dow = new Date(`${today}T00:00:00`).getDay();
      const off = ((target - dow + 7) % 7) || 7;
      return { date: shiftDateStr(today, off), matched: m[0] };
    }
  }
  return null;
}

function cleanTitle(s: string): string {
  // Lưu ý: \b của JS sai với ký tự tiếng Việt (ưu, gấp, tất…) → dùng khoảng trắng thay \b
  return ` ${s} `
    .replace(/ (?:hạn(?: vào| là| trước)?|deadline|bắt đầu|khoảng|mất|tốn|nữa|tới|đến|trước)(?=\s|$)/gi, " ")
    .replace(/[,.;:!…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nhận lệnh hành động từ tin nhắn tự nhiên. Trả về reply + action (nếu thực thi được). */
export function parseChatAction(raw: string, ctx: Record<string, unknown>): { action?: AIAction; reply: string } | null {
  const text = clampText(raw, 300).trim();
  if (!text) return null;
  const t = text.toLowerCase();
  const today = /^[12]\d{3}-[01]\d-[0-3]\d$/.test(clampText(ctx.today, 10)) ? clampText(ctx.today, 10) : todayStr();
  const seed = hashStr(t + today);
  const courseNames = Array.isArray(ctx.courses) ? (ctx.courses as unknown[]).map((c) => clampText(c, 40)).filter(Boolean) : [];
  const openTitles = Array.isArray(ctx.openTaskTitles) ? (ctx.openTaskTitles as unknown[]).map((x) => clampText(x, 80)).filter(Boolean) : [];
  // Câu hỏi mang tính hỏi đáp ("giờ nên làm gì?") không phải lệnh hoàn thành
  const questiony = /\b(nên|cách|thế nào|như thế nào|sao|vì sao|tại sao)\b/.test(t);

  /* ── Tạo nhiệm vụ ── */
  let m = text.match(/(?:tạo|thêm|đặt|lập)\s+(?:một\s+)?(?:việc|nhiệm\s*vụ|task)\s*(?:mới)?\s*[:\-—]?\s*(.+)/i);
  if (m) {
    let rest = m[1];
    const date = parseVNDate(rest, today);
    if (date) rest = rest.replace(new RegExp(escRe(date.matched), "i"), " ");
    let minutes = 30;
    const mm = rest.match(/(\d+)\s*(?:phút\b|\bp\b)/i) ?? rest.match(/(\d+)\s*giờ/i);
    if (mm) {
      minutes = /giờ/i.test(mm[0]) ? Number(mm[1]) * 60 : Number(mm[1]);
      minutes = Math.min(600, Math.max(10, minutes));
      rest = rest.replace(mm[0], " ");
    }
    let priority: "low" | "medium" | "high" = "medium";
    // \b của JS không đúng với ký tự tiếng Việt (ưu, gấp, tất…) → dùng khoảng trắng thay \b
    const padded = ` ${rest.replace(/\s+/g, " ").trim()} `;
    if (/ (?:gấp|quan trọng|ưu tiên cao) /.test(padded)) priority = "high";
    else if (/ (?:ưu tiên thấp|thấp) /.test(padded)) priority = "low";
    rest = padded.replace(/ (?:gấp|quan trọng|ưu tiên (?:cao|thấp)|ưu tiên|cao|thấp|hạn|ngày|đến|deadline|vào|trong|với)(?=\s|$)/gi, " ");
    const course = courseNames.find((c) => rest.toLowerCase().includes(c.toLowerCase()));
    if (course) rest = rest.replace(new RegExp(escRe(course), "i"), " ");
    const title = cleanTitle(rest);
    if (!title || title.length < 2) {
      return { reply: "Tên nhiệm vụ chưa rõ nè — thử “tạo nhiệm vụ Làm lab 3 hạn mai 45 phút” nhé." };
    }
    return {
      action: { type: "createTask", args: { title, dueDate: date?.date ?? today, priority, estMinutes: minutes, course: course ?? "" } },
      reply: pick([`Ok! Chờ mình tạo việc **${title}** nhé…`, `Hiểu rồi — mình thêm **${title}** vào danh sách liền…`], seed),
    };
  }

  /* ── Hoàn thành nhiệm vụ ── */
  const paddedT = ` ${t} `;
  if (/ (?:xong|hoàn thành|hoàn tất|đánh dấu) /.test(paddedT) && !questiony) {
    let title = "";
    const before = text.match(/(?:việc|nhiệm\s*vụ|task)\s+(.{2,80}?)\s+(?:xong|hoàn\s*thành|hoàn\s*tất|được\s*rồi|xong\s*rồi)/i);
    const after = text.match(/(?:đánh\s*dấu|hoàn\s*thành|hoàn\s*tất|làm\s*xong|xong\s*rồi|xong)\s*(?:việc|nhiệm\s*vụ|task)?\s*["'“”«]?([^"'“”»]+)?["'“”»]?/i);
    if (before) title = cleanTitle(before[1]);
    else if (after?.[1]) title = cleanTitle(after[1]);
    const want = title.toLowerCase();
    if (want) {
      const matched =
        openTitles.find((x) => x.toLowerCase() === want) ??
        openTitles.find((x) => x.toLowerCase().includes(want) || want.includes(x.toLowerCase())) ??
        "";
      if (matched) {
        return {
          action: { type: "completeTask", args: { title: matched } },
          reply: pick([`Ok, để mình đánh dấu **${matched}** là hoàn thành…`, `Giỏi ghê! Chờ mình cập nhật **${matched}** nhé…`], seed),
        };
      }
      return { reply: `Mình không thấy việc nào đang mở khớp “${title}”. Bạn nói lại tên chính xác giúp nhé (xem danh sách ở trang Nhiệm vụ).` };
    }
    return { reply: "Bạn muốn đánh dấu việc nào xong? Nói kiểu “việc Đọc chương 2 xong rồi” nhé." };
  }

  /* ── Tạo kỳ thi ── */
  m = text.match(/(?:tạo|thêm|đặt|ghi)\s+(?:kỳ\s*thi|bài\s*kiểm\s*tra|lịch\s*thi|đề\s*thi|lịch\s*kiểm\s*tra|thi)\b\s*(?:mới)?\s*[:\-—]?\s*(.+)/i);
  if (m) {
    let rest = m[1];
    const date = parseVNDate(rest, today);
    if (date) rest = rest.replace(new RegExp(escRe(date.matched), "i"), " ");
    const course = courseNames.find((c) => rest.toLowerCase().includes(c.toLowerCase()));
    if (course) rest = rest.replace(new RegExp(escRe(course), "i"), " ");
    const title = cleanTitle(rest);
    if (!title) {
      return { reply: "Kỳ thi tên gì nhỉ? Thử “tạo kỳ thi Giữa kỳ Toán hạn 25/11” nhé." };
    }
    return {
      action: { type: "createExam", args: { title, date: date?.date ?? "", course: course ?? "" } },
      reply: `Ok, mình lưu kỳ thi **${title}**${date ? ` — ngày ${date.date}` : ""}…`,
    };
  }

  /* ── Tạo môn học ── */
  m = text.match(/(?:tạo|thêm)\s+(?:một\s+)?(?:môn\s*học|môn\s*mới|học\s*phần|môn)\s*(?:mới)?\s*[:\-—]?\s*(.+)/i);
  if (m) {
    const title = cleanTitle(m[1]);
    if (!title) {
      return { reply: "Tên môn học chưa rõ — thử “tạo môn học Cơ sở dữ liệu” nhé." };
    }
    return { action: { type: "createCourse", args: { title } }, reply: `Ok, mình thêm môn **${title}** vào học phần của bạn…` };
  }

  /* ── Tạo 1 thẻ flashcard ── */
  m = text.match(/tạo\s*thẻ\s*(?:mới)?\s*:?\s*(.+)/i);
  if (m) {
    const rest = m[1];
    const qa = rest.match(/hỏi\s*[:=]?\s*(.+?)\s*[,;|]?\s*đáp\s*(?:án)?\s*[:=]?\s*(.+)/i);
    const sep = rest.match(/(.+?)\s*(?:→|–|-|\||\/)\s*(.+)/);
    const def = rest.match(/(.+?)\s+là\s+(.+)/i);
    if (qa) {
      return { action: { type: "createFlashcard", args: { question: cleanTitle(qa[1]), answer: cleanTitle(qa[2]) } }, reply: "Ok, mình thêm thẻ này vào Ôn tập luôn…" };
    }
    if (sep) {
      return { action: { type: "createFlashcard", args: { question: cleanTitle(sep[1]), answer: cleanTitle(sep[2]) } }, reply: "Ok, mình thêm thẻ này vào Ôn tập luôn…" };
    }
    if (def) {
      return { action: { type: "createFlashcard", args: { question: `${cap(def[1])} là gì?`, answer: `${def[1]} là ${def[2]}` } }, reply: "Ok, mình thêm thẻ này vào Ôn tập luôn…" };
    }
    return { reply: "Format thẻ: “tạo thẻ hỏi: Con trỏ là gì? đáp: Biến lưu địa chỉ” — hoặc dùng mode **Flashcard** để tạo hàng loạt từ bài học nhé." };
  }

  return null;
}

/* ── 7. Trò chuyện offline (giọng tự nhiên, chỉ dựa dữ liệu thật) ── */

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function daysUntil(date: string, today: string): number {
  return Math.round((new Date(date).getTime() - new Date(today).getTime()) / 86400000);
}

export function localChat(input: LocalInput): LocalOutput {
  const msgs = Array.isArray(input.messages) ? input.messages.filter((m) => clampText(m.content, 1)) : [];
  const lastUserRaw = clampText([...msgs].reverse().find((m) => (m.role ?? "user") === "user")?.content, 300);
  const lastUser = lastUserRaw.toLowerCase();
  const ctx = asObj(input.context);
  const hasCtx = Object.keys(ctx).length > 1;
  const today = /^[12]\d{3}-[01]\d-[0-3]\d$/.test(clampText(ctx.today, 10)) ? clampText(ctx.today, 10) : todayStr();
  const seed = hashStr(lastUser + today);

  const taskStats = asObj(ctx.taskStats);
  const openTasks = Number(taskStats.open);
  const overdue = Number(taskStats.overdue);
  const dueCards = Number(ctx.flashcardsDue);
  const weeklyMinutes = Number(ctx.weeklyMinutes);
  const courseNames = Array.isArray(ctx.courses) ? (ctx.courses as unknown[]).map((c) => clampText(c, 40)).filter(Boolean) : [];
  const progressByCourse = Array.isArray(ctx.progressByCourse) ? (ctx.progressByCourse as Record<string, unknown>[]) : [];
  const weakest = Array.isArray(ctx.weakestChapters) ? (ctx.weakestChapters as Record<string, unknown>[]) : [];
  const exams = Array.isArray(ctx.exams) ? (ctx.exams as Record<string, unknown>[]) : [];
  const mentionsCourse = courseNames.find((c) => lastUser.includes(c.toLowerCase()));

  const tail = hasCtx
    ? ""
    : "\n\n(Nhỏ thôi: trang đang không gửi được dữ liệu học tập — bạn đăng nhập rồi hỏi ở đây, mình sẽ đọc số liệu thật của bạn.)";

  /* Lệnh hành động — ưu tiên cao nhất: "tạo nhiệm vụ…", "…xong rồi"… */
  const cmd = parseChatAction(lastUserRaw, ctx);
  if (cmd) {
    return { text: cmd.reply + (cmd.action ? "" : tail), ...(cmd.action ? { action: cmd.action } : {}) };
  }

  /* Nhận xét tổng thể theo dữ liệu — dùng cho câu mở/kết */
  const mood =
    overdue > 0 ? "có một chút áp lực" : weeklyMinutes >= 300 ? "rất đáng nể" : weeklyMinutes > 0 ? "ổn" : "đang nghỉ hơi lâu";

  if (/tiến\s*độ|phân\s*tích|báo\s*cáo|tổng\s*quan|tình\s*hình|học\s*ra\s*sao|sao\s*rồi|như\s*thế\s*nào/.test(lastUser) && hasCtx) {
    const lines: string[] = [];
    lines.push(
      pick(
        [
          `Mình vừa soát lại toàn bộ dữ liệu của bạn — nhìn chung ${mood}. Nhìn nhanh thế này:`,
          "Để mình kể ngắn gọn tình hình học của bạn nhé:",
          "Mình đã đọc xong số liệu của bạn, đây là bức tranh hiện tại:",
        ],
        seed
      )
    );
    if (Number.isFinite(openTasks)) {
      lines.push(
        openTasks === 0
          ? "- Tuyệt vời: không còn nhiệm vụ nào dở dang 🎉"
          : `- Bạn còn ${openTasks} việc chưa xong${overdue ? `, mà **${overdue} việc đã qua hạn** — mình thấy cần xử lý cái này trước tiên` : ""}`
      );
    }
    if (Number.isFinite(weeklyMinutes)) {
      lines.push(
        weeklyMinutes === 0
          ? "- Tuần này chưa ghi nhận phiên học nào — một Pomodoro 25 phút hôm nay là bùng được nhịp lại"
          : `- Tuần này bạn tập trung được **${fmtMin(weeklyMinutes)}**${
              weeklyMinutes >= 300 ? " — nghiêm túc đấy, giữ lửa nhé 🔥" : weeklyMinutes < 60 ? " — hơi nhẹ, thử nhắm 30 phút mỗi ngày xem sao" : ""
            }`
      );
    }
    if (Number.isFinite(dueCards) && dueCards > 0) lines.push(`- Có ${dueCards} flashcard đến hạn hôm nay, SM-2 đã xếp sẵn thứ tự ôn rồi`);
    if (progressByCourse.length > 0) {
      lines.push(`- Tiến độ: ${progressByCourse.slice(0, 4).map((p) => `${clampText(p.course, 30)} ${clampText(p.tasks, 12)} việc`).join(", ")}`);
    } else if (courseNames.length > 0) {
      lines.push(`- Các môn đang học: ${courseNames.join(", ")}`);
    }
    if (weakest.length > 0) {
      lines.push(`- Chương yếu nhất: **${clampText(asObj(weakest[0]).chapter, 40)}** (môn ${clampText(asObj(weakest[0]).course, 30)}) — nên đọc lại trước khi thi`);
    }
    const upExam = exams
      .map((e) => ({
        title: clampText(e.title, 40),
        days: daysUntil(clampText(e.date, 12), today),
      }))
      .filter((e) => Number.isFinite(e.days) && e.days >= 0)
      .sort((a, b) => a.days - b.days)[0];
    if (upExam && upExam.title) {
      lines.push(`- Kỳ thi gần nhất: **${upExam.title}** — ${upExam.days === 0 ? "thi ngay hôm nay!" : `còn ${upExam.days} ngày nữa`}`);
    }

    const closing =
      overdue > 0
        ? pick(
            [
              "Việc quá hạn là ưu tiên số 1 — mở Planner, làm ngay dòng đầu tiên trong hàng đợi là gỡ được. Chỉ cần 25 phút thôi 💪",
              "Mình đề xuất: vào Planner → hàng đợi ưu tiên → xử lý việc quá hạn đầu tiên. Một Pomodoro là thấy khác liền.",
            ],
            seed + 1
          )
        : dueCards > 0
          ? "Không quá nặng nhọc đâu — dành 10 phút lướt flashcard ở trang Ôn tập là giữ được nhịp hôm nay."
          : "Muốn mình bày sẵn lịch cho 7 ngày tới không? Vào Planner → tab **AI** là có ngay.";
    lines.push("", closing);
    return { text: lines.join("\n") + tail };
  }

  if (/kế\s*hoạch|học\s*gì|nên\s*làm|ưu\s*tiên|phân\s*công|lịch\s*học/.test(lastUser)) {
    const first = Number.isFinite(openTasks) && openTasks > 0 ? `Hiện bạn có ${openTasks} việc đang mở — bắt đầu từ dòng đầu của hàng đợi Planner là chuẩn nhất (điểm số cao nhất theo thuật toán). ` : "";
    return {
      text:
        pick(["Mình xếp lịch được luôn cho bạn — bằng thuật toán, không cần API key:", "Được chứ! Mình bày lịch như sau:"], seed) +
        "\n" +
        "1. Trang **Lập kế hoạch** → tab **AI** → *Tạo kế hoạch*: mình chia mọi việc theo deadline, độ khó, độ quan trọng vào từng ngày.\n" +
        "2. Tab **Tự động** bên cạnh — cùng thuật toán, nhanh hơn.\n\n" +
        first +
        "Muốn hội thoại tự do kiểu ChatGPT (giải khái niệm, giải bài)? Mở nút **Nâng cấp AI** trong khung chat → dán Gemini key miễn phí là xong." +
        tail,
    };
  }

  if (/thẻ|flashcard|ôn\s*tập/.test(lastUser)) {
    return {
      text:
        (Number.isFinite(dueCards) && dueCards > 0
          ? `Bạn đang có **${dueCards} thẻ đến hạn** hôm nay — lướt trang **Ôn tập** chừng 10 phút là dứt điểm. `
          : "Chưa có thẻ nào đến hạn hôm nay, nhịp SM-2 đang thoải mái. ") +
        "Muốn thêm thẻ mới: dán bài học vào mode **Flashcard** ở đây, mình tự cắt thành thẻ; hoặc tự viết ở trang Ôn tập.\n" +
        "Mẹo nhỏ: thẻ nào bạn hay quên, SM-2 sẽ tự đưa lên sớm hơn — cứ đánh giá thật nhé 😄" +
        tail,
    };
  }

  if (/thi\b|kỳ\s*thi|đề\s|kiểm\s*tra|điểm/.test(lastUser) && exams.length > 0) {
    const withDays = exams
      .map((e) => ({
        t: clampText(e.title, 50),
        c: clampText(e.course, 30),
        d: clampText(e.date, 12),
        days: daysUntil(clampText(e.date, 12), today),
      }))
      .filter((e) => Number.isFinite(e.days) && e.days >= 0)
      .sort((a, b) => a.days - b.days);
    const lines = [
      pick(["Để mình điểm danh kỳ thi của bạn nhé:", "Kỳ thi sắp tới của bạn đây:"], seed),
      ...withDays.slice(0, 5).map((e, i) => `${i + 1}. **${e.t}**${e.c ? ` (${e.c})` : ""} — ${e.d}${e.days === 0 ? " (hôm nay!)" : `, còn ${e.days} ngày`}`),
      "",
      withDays.length > 0 && withDays[0].days <= 7
        ? `**${withDays[0].days === 0 ? "Thi ngay hôm nay" : `Còn ${withDays[0].days} ngày`}** — mình khuyên: ôn flashcard đến hạn trước, rồi làm vài câu trắc nghiệm từ ghi chú (mode **Trắc nghiệm**) để thử sức.`
        : "Thời gian còn tương đối — chia nhỏ chương học vào Planner trước, gần ngày thi quay lại trắc nghiệm & flashcard.",
    ];
    return { text: lines.join("\n") + tail };
  }

  if (mentionsCourse) {
    const prog = progressByCourse.find((p) => clampText(p.course, 60).toLowerCase() === mentionsCourse.toLowerCase());
    return {
      text:
        `À, bạn hỏi về **${mentionsCourse}**. ` +
        (prog ? `Ở môn này bạn làm được ${clampText(prog.tasks, 12)} nhiệm vụ rồi — ` : "") +
        pick(
          [
            "mình có thể giúp: tóm tắt ghi chú (dán bài vào mode **Tóm tắt**), cắt flashcard & trắc nghiệm từ nội dung đó, hoặc xếp lịch ôn ở Planner. Bạn muốn bắt đầu từ đâu?",
            "muốn mình làm gì trước — tóm tắt ghi chú, tạo flashcard, hay bày lịch ôn cho môn này?",
          ],
          seed
        ) +
        tail,
    };
  }

  if (/^(hi|hello|xin\s*chào|chào|alo|hế\s*lô|hey)\b/.test(lastUser)) {
    return {
      text:
        pick(
          [
            "Chào bạn 👋 Hôm nay học thế nào rồi? Cứ hỏi “tình hình học của mình” là mình tóm tắt ngay — mình đọc được toàn bộ nhiệm vụ, phiên học, flashcard và kỳ thi của bạn.",
            "Hi 👋 Mình đây. Muốn xem tình hình học hiện tại, tìm việc nên làm kế, hay dán bài học vào đây để mình tóm tắt/câu hỏi?",
          ],
          seed
        ) +
        "\n\nMình còn **làm trực tiếp** được nữa nhé:\n" +
        "- “tạo nhiệm vụ Làm lab 3 hạn mai 45 phút” — mình thêm việc vào app luôn\n" +
        "- “việc Đọc chương 2 xong rồi” — mình đánh dấu hoàn thành giúp\n" +
        "- “tạo môn học Cơ sở dữ liệu” / “tạo kỳ thi Giữa kỳ hạn 25/11”" +
        tail,
    };
  }

  if (/cảm\s*ơn|thanks|thank\s*you/.test(lastUser)) {
    return { text: pick(["Không có gì! Cần gì cứ hô mình nhé 😄", "Rất vui giúp được bạn — học tốt nhé 💪"], seed) + tail };
  }

  if (/bạn\s*là\s*ai|mày\s*là\s*ai|giới\s*thiệu\s*bản\s*thân/.test(lastUser)) {
    return {
      text:
        "Mình là **StudyOS AI** 🤖\n" +
        "- Ở chế độ hiện tại (AI cơ sở), mình chạy trực tiếp trên server, đọc dữ liệu thật của bạn: nhiệm vụ, phiên học, flashcard, kỳ thi — không bịa.\n" +
        "- Mình còn **làm trực tiếp** được: “tạo nhiệm vụ X hạn mai”, “việc X xong rồi”, “tạo môn học X”…\n" +
        "- Muốn mình trò chuyện tự do kiểu ChatGPT (giải thích khái niệm bất kỳ, giải bài, tư vấn sâu)? Dán **Gemini key** miễn phí trong app — nút “Nâng cấp AI” ở khung chat, 2 phút là xong." +
        tail,
    };
  }

  /* ── Tri thức phương pháp học (trả lời được kể cả khi không có key) ── */
  const skill = matchStudySkill(` ${lastUser} `);
  if (skill) {
    return { text: skill + tail };
  }

  return {
    text:
      pick(
        [
          "Câu này mình chưa xử lý được ở chế độ AI cơ sở 🙈 Mình chắc nhất khi hỏi về tiến độ, kế hoạch, kỳ thi, flashcard — hoặc phương pháp học (thử “học sao cho nhớ lâu?”).",
          "Ngoài phạm vi dữ liệu app rồi 🙈 Thử hỏi “tình hình học của mình”, “hôm nay nên làm gì”, hoặc mẹo học nhé!",
        ],
        seed
      ) +
      "\n\nMình **làm trực tiếp** được trong app: “tạo nhiệm vụ X hạn mai”, “việc X xong rồi”, “tạo môn học X”, “tạo kỳ thi X hạn 25/11”, “tạo thẻ hỏi: … đáp: …”.\n" +
      "Còn muốn hỏi tự do kiểu ChatGPT (giải thích khái niệm bất kỳ, giải bài)? Mở nút **Nâng cấp AI** ở khung chat → dán Gemini key miễn phí (lấy tại aistudio.google.com/apikey) → xong." +
      tail,
  };
}

/* ── 7.5 Tri thức phương pháp học có sẵn (không cần key) ── */

function matchStudySkill(padded: string): string | null {
  const has = (...words: string[]) => words.some((w) => padded.includes(w));

  if (has(" nhớ lâu", " ghi nhớ", " nhớ dài", " học thuộc", " nhớ nhanh", " học sao")) {
    return (
      "Mẹo nhớ lâu — 4 kỹ thuật có bằng chứng khoa học nhất:\n" +
      "- **Active recall**: đóng sách, tự kiểm tra mình nhớ gì rồi mới xem lại. Tự hỏi–đáp hiệu quả gấp 3 lần đọc đi đọc lại.\n" +
      "- **Spaced repetition**: ôn lại sau 1 ngày → 3 ngày → 1 tuần → 2 tuần. App có sẵn chế độ **Flashcard** với thuật toán SM-2 tự xếp lịch giúp bạn.\n" +
      "- **Kỹ thuật Feynman**: giải thích khái niệm bằng lời của mình như dạy trẻ 10 tuổi — chỗ líu lại chính là chỗ chưa hiểu.\n" +
      "- **Chunking**: chia bài thành khối nhỏ có tên gọi (ví dụ 5 bước của vòng lặp, 3 tính chất của phép cộng).\n" +
      "Dán bài học vào **Tóm tắt** để mình rút từ khoá & câu hỏi tự kiểm tra nhé!"
    );
  }

  if (has(" quản lý thời gian", " thời gian biểu", " phân bổ thời gian", " pomodoro")) {
    return (
      "Quản lý thời gian học — công thức đơn giản mà hiệu quả:\n" +
      "- **Pomodoro 25/5**: học 25 phút, nghỉ 5 phút; sau 4 vòng nghỉ dài 15–30 phút. Giữ điện thoại ngoài tầm tay trong 25 phút đó.\n" +
      "- **Nguyên tắc quả ếch**: làm việc khó/ngại nhất ngay đầu giờ — khi não còn tươi.\n" +
      "- **Lập khối lịch**: chặn trước khung giờ học vào lịch (2 buổi/ngày × 45 phút) thay vì học \"khi rảnh\" — lúc nào cũng không rảnh.\n" +
      "- **Tối thứ 7** dành 15 phút xem lại tuần: việc nào trôi, việc nào trễ — chỉnh lại tuần sau.\n" +
      "Bạn muốn mình xếp lịch sẵn theo deadline hiện tại? Trang **Lập kế hoạch** → tab **AI** nhé!"
    );
  }

  if (has(" trì hoãn", " lười", " không tập trung", " khó tập trung", " mất tập trung", " chán học", " ôm đồm")) {
    return (
      "Trì hoãn là chuyện não chống lại việc *bắt đầu*, không phải chống lại việc học. Xử lý được:\n" +
      "- **Quy tắc 2 phút**: chỉ cam kết làm 2 phút. Bắt đầu rồi thì não thường tiếp tục (điểm khó nhất là khởi động).\n" +
      "- **Bẻ nhỏ**: việc to (\"viết báo cáo\") → mục tiêu nhỏ hôm nay (\"chỉ viết phần mở đầu\"). App đã chia việc theo phút — cứ mở mục nhỏ nhất.\n" +
      "- **Bỏ thiết bị**: điện thoại để phòng khác (không chỉ úp mặt xuống — để *rời mắt* mới đủ).\n" +
      "- **Khoanh thất bại**: học 25 phút mà không tập trung được thì cho phép dừng — quay lại sau 15 phút, đừng bỏ cả buổi vì 1 phút chán.\n" +
      "Muốn mình gợi ý nên bắt đầu từ việc nào trước? Hỏi “hôm nay nên làm gì” nhé!"
    );
  }

  if (has(" ôn thi", " trước khi thi", " cho kỳ thi", " kiểm tra ngày mai", " thi ngày mai", " ôn tập hiệu quả", " ôn bài")) {
    return (
      "Kế hoạch ôn thi gọn lẹ (3 lớp):\n" +
      "- **Trước thi 5+ ngày**: đọc giáo trình/slide một lượt, đánh dấu mục chưa hiểu → hỏi thầy/bạn ngay, đừng để dồn.\n" +
      "- **2–4 ngày**: làm **đề cũ & câu hỏi chương** — đây là lớp quan trọng nhất. Sai chỗ nào, quay về đúng mục đó đọc lại (đừng đọc cả chương).\n" +
      "- **1 ngày & ngày thi**: chỉ ôn **flashcard + công thức + lỗi sai đã ghi lại**. Đừng học cái mới — chỉ củng cố cái cũ.\n" +
      "- Đêm trước: ngủ ≥ 7 tiếng. Não thiếu ngủ mất 30% khả năng recall — thức khuya học thêm là lỗ.\n" +
      "App có sẵn **Trắc nghiệm** (mode tạo câu hỏi) — dán chương vào là có đề ôn ngay!"
    );
  }

  if (has(" ghi chú", " note", " cornell", " sơ đồ tư duy", " mindmap", " vẽ sơ đồ")) {
    return (
      "Ghi chú hiệu quả — chọn kiểu phù hợp môn:\n" +
      "- **Cornell**: chia trang 2 cột — cột phải chép ý khi nghe, cột trái viết *từ khoá + câu hỏi*. Cuối trang viết 2–3 dòng tóm tắt bằng lời của mình. Ôn lại = che cột phải, tự hỏi theo cột trái.\n" +
      "- **Mindmap** (môn có cấu trúc phân nhánh như sinh học, lịch sử): chủ đề giữa → nhánh chính → lá. Tự vẽ tay tốt hơn dùng app vì phải *chọn* ý chính.\n" +
      "- **Outline** (môn logic như toán, lập trình): ghi theo mục 1, 1.1, 1.2 — kèm ví dụ làm mẫu cho mỗi định lý/cú pháp.\n" +
      "Quy tắc vàng: **ghi ít hơn nghe nhiều** — ghi từ khoá, không chép nguyên câu. Bài ghi xong, dán vào **Tóm tắt** để mình rút từ khoá nhé!"
    );
  }

  if (has(" mất gốc", " bắt đầu từ đâu", " học lại từ đầu", " tự học", " yếu môn")) {
    return (
      "Mất gốc mà muốn gở lại — lộ trình 3 bước:\n" +
      "- **1. Chẩn đoán**: làm 1 đề cũ không tra cứu. Sai dạng nào nhiều nhất → đó là gốc rễ cần vá trước, đừng học dàn trải.\n" +
      "- **2. Vá gốc bằng video + 5 bài dễ**: xem 1 video giải thích khái niệm (Việt Nam: studywithme, kênh giáo viên trên YouTube) rồi làm ngay 5 bài **cực dễ** của dạng đó. Dễ tạo đà, khó tạo bỏ.\n" +
      "- **3. Lặp lên dốc**: mỗi ngày 1 khái niệm + 10 bài tăng dần độ khó. Ghi vào **Chương học** mức hiểu 1–5 để theo dõi — chương nào còn ≤2 là phải quay lại.\n" +
      "Quan trọng: mất gốc không phải lỗi của bạn — là thiếu lộ trình. Giờ đã có lộ trình rồi đó 💪"
    );
  }

  return null;
}

/* ── Dispatcher ──────────────────────────────────────────── */

export function runLocalAI(input: LocalInput): LocalOutput {
  const prompt = clampText(input.prompt, 6000);
  const ctx = asObj(typeof input.context === "object" ? input.context : undefined);
  try {
    switch (input.mode) {
      case "chat":
        return localChat(input);
      case "summary":
        return localSummary(prompt);
      case "flashcards":
        return localFlashcards(prompt);
      case "questions":
        return localQuestions(prompt);
      case "plan":
        return localPlan(ctx);
      case "suggestions":
        return localSuggestions(ctx);
      case "report":
        return localReport(ctx);
      default:
        return { error: "Mode không hợp lệ" };
    }
  } catch {
    return { error: "AI cơ sở gặp lỗi khi xử lý dữ liệu — thử lại nhé." };
  }
}
