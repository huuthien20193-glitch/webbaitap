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

/* ── 7. Trò chuyện offline ───────────────────────────────── */

export function localChat(input: LocalInput): LocalOutput {
  const msgs = Array.isArray(input.messages) ? input.messages.filter((m) => clampText(m.content, 1)) : [];
  const lastUser = clampText([...msgs].reverse().find((m) => (m.role ?? "user") === "user")?.content, 300).toLowerCase();
  const ctx = asObj(input.context);
  const today = /^[12]\d{3}-[01]\d-[0-3]\d$/.test(clampText(ctx.today, 10)) ? clampText(ctx.today, 10) : todayStr();

  // Tìm kiếm trong dữ liệu học tập thật của người dùng
  const taskStats = asObj(ctx.taskStats);
  const openTasks = Number(taskStats.open);
  const overdue = Number(taskStats.overdue);
  const dueCards = Number(ctx.flashcardsDue);
  const courseNames = Array.isArray(ctx.courses) ? (ctx.courses as unknown[]).map((c) => clampText(c, 40)) : [];
  const mentionsCourse = courseNames.find((c) => c && lastUser.includes(c.toLowerCase()));

  if (/tiến\s*độ|phân\s*tích|báo\s*cáo|tổng\s*quan|tình\s*hình/.test(lastUser) && Object.keys(ctx).length > 1) {
    const lines = [
      `**Tổng quan học tập (dữ liệu đến ${today}):**`,
      `- Nhiệm vụ đang mở: ${Number.isFinite(openTasks) ? openTasks : "—"}${overdue ? `, trong đó ${overdue} quá hạn` : ""}`,
      Number.isFinite(Number(ctx.weeklyMinutes)) ? `- Thời gian học 7 ngày qua: ${fmtMin(ctx.weeklyMinutes)}` : "",
      Number.isFinite(dueCards) ? `- Flashcard đến hạn: ${dueCards}` : "",
      courseNames.length > 0 ? `- Môn: ${courseNames.join(", ")}` : "",
      "",
      "**Gợi ý việc đầu tiên:** mở Planner → hàng đợi ưu tiên và làm dòng đầu tiên — đó là nhiệm vụ điểm số cao nhất theo thuật toán xếp hạng.",
    ].filter(Boolean);
    return { text: lines.join("\n") };
  }

  if (/kế\s*hoạch|học\s*gì|nên\s*làm|ưu\s*tiên|phân\s*công/.test(lastUser)) {
    return {
      text:
        "Ở chế độ AI cơ sở mình xếp lịch bằng thuật toán (không cần key):\n" +
        "1. Mở trang **Lập kế hoạch** → bấm **AI** → *Tạo kế hoạch* — mình sẽ chia mọi nhiệm vụ theo deadline, độ khó, độ quan trọng vào từng ngày.\n" +
        "2. Hoặc tab **Tự động** ngay bên cạnh — cùng thuật toán, nhanh gọn.\n\n" +
        "Muốn hội thoại tự nhiên hơn? Thêm `GEMINI_API_KEY` vào biến môi trường server (xem README) — khi ấy bộ não Gemini sẽ thay mình trả lời.",
    };
  }

  if (/thẻ|flashcard|ôn\s*tập|nhớ/.test(lastUser)) {
    return {
      text:
        (Number.isFinite(dueCards) && dueCards > 0
          ? `Bạn có **${dueCards} flashcard đến hạn** hôm nay. `
          : "") +
        "Tạo thẻ: Trợ lý AI → mode **Flashcard** (dán nội dung bài học, mình cắt thành thẻ) hoặc tự tạo ở trang **Ôn tập**.\n" +
        "SM-2 sẽ tự xếp ngày ôn kế tiếp sau mỗi lượt đánh giá.",
    };
  }

  if (mentionsCourse) {
    return {
      text: `Về môn **${mentionsCourse}**: mình có thể tóm tắt nội dung (mode **Tóm tắt**), tạo flashcard/trắc nghiệm từ ghi chú của bạn, và xem tiến độ nhiệm vụ của môn này ở trang **Môn học**. Dán ghi chú vào đây (mode ${input.mode}) là mình xử lý ngay.`,
    };
  }

  if (/^(hi|hello|xin\s*chào|chào|alo|hế\s*lô|hey)\b/.test(lastUser)) {
    return {
      text:
        "Chào bạn 👋 Mình là **AI cơ sở** của StudyOS — bản offline không cần API key.\n" +
        "Mình làm được ngay: tóm tắt ghi chú, tạo flashcard & trắc nghiệm từ nội dung bạn dán, phân tích tiến độ học, xếp lịch 7 ngày theo thuật toán.\n" +
        "Hỏi thẳng: “tóm tắt: ” + nội dung, hoặc dán bài vào mode Tóm tắt nhé!",
    };
  }

  return {
    text:
      "Bạn hỏi mình ở chế độ **AI cơ sở** (offline) — mình trả lời được chính xác khi: tổng hợp số liệu học tập của bạn, tóm tắt/trắc nghiệm/flashcard từ đoạn văn bạn dán, và xếp lịch theo thuật toán.\n" +
      "Làm ngay: bấm mode Tóm tắt rồi dán nội dung bài học.\n" +
      "Cần trả lời hội thoại tự nhiên theo ý bạn? Bạn chỉ cần thêm `GEMINI_API_KEY` vào biến môi trường server — README có 2 bước, sau đó toàn bộ mode đều dùng Gemini.",
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
