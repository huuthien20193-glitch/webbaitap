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
  const lastUser = clampText([...msgs].reverse().find((m) => (m.role ?? "user") === "user")?.content, 300).toLowerCase();
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
        "Còn hội thoại tự nhiên kiểu ChatGPT thì cần Gemini — dán `GEMINI_API_KEY` vào Environment của service trên Render là xong (2 phút)." +
        tail,
    };
  }

  if (/thẻ|flashcard|ôn\s*tập|cách\s*nhớ|nhớ\s*lâu/.test(lastUser)) {
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
        ) + tail,
    };
  }

  if (/cảm\s*ơn|thanks|thank\s*you/.test(lastUser)) {
    return { text: pick(["Không có gì! Cần gì cứ hô mình nhé 😄", "Rất vui giúp được bạn — học tốt nhé 💪"], seed) + tail };
  }

  if (/bạn\s*là\s*ai|mày\s*là\s*ai|giới\s*thiệu\s*bản\s*thân/.test(lastUser)) {
    return {
      text:
        "Mình là **AI cơ sở** của StudyOS — chạy trực tiếp trên server, không cần API key, và chỉ nói dựa trên dữ liệu thật trong app của bạn (không bịa).\n" +
        "Mình giỏi nhất ở: tổng quan tiến độ, xếp lịch theo thuật toán, tóm tắt & tạo thẻ/câu hỏi từ bài bạn dán.\n" +
        "Còn kiến thức tự do kiểu ChatGPT thì cần bộ não Gemini — bạn dán key vào Render Environment là mình 'nâng cấp' ngay." +
        tail,
    };
  }

  return {
    text:
      pick(
        [
          "Câu này ngoài phạm vi dữ liệu app của mình rồi 🙈 Mình đọc được: nhiệm vụ, phiên học, flashcard, kỳ thi, chương học. Thử hỏi “tình hình học của mình” xem!",
          "Mình chưa xử lý được câu này — mình là AI offline, trả lời chắc nhất khi hỏi về tiến độ, kế hoạch, kỳ thi, flashcard.",
        ],
        seed
      ) +
      "\n\nCòn muốn hỏi tự do như ChatGPT (giải thích khái niệm, kiến thức tổng quát)? Chỉ cần **GEMINI_API_KEY**: tạo miễn phí ở aistudio.google.com/apikey → Render → service webbaitap → Environment → dán key → Save. 2 phút, không cần sửa code." +
      tail,
  };
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
