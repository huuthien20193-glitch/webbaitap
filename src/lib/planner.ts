import type { Task } from "./types";
import { daysUntil, shiftDateStr, todayStr } from "./date";

/**
 * MODULE B – Thuật toán ưu tiên công việc.
 * Điểm tổng hợp từ 5 yếu tố:
 *   1. Urgency  — thời gian còn lại đến deadline (45%)
 *   2. Importance — mức độ quan trọng 1–5 (22%)
 *   3. Difficulty — độ khó 1–5 (15%)
 *   4. EstMinutes — thời lượng cần thiết (10%)
 *   5. Progress  — tiến độ hiện tại (8%, còn nhiều việc → điểm cao hơn)
 */

export interface TaskScore {
  task: Task;
  score: number; // 0–100
  urgency: number; // 0–1
  reasons: string[]; // lý do giải thích (hiển thị UI)
}

export const HORIZON_DAYS = 7;

export function priorityScore(task: Task, now = todayStr()): TaskScore {
  const done = task.status === "done";
  const dLeft = daysUntil(task.dueDate, now);
  const overdue = !done && dLeft < 0;

  let urgency: number;
  if (overdue) urgency = 1;
  else if (dLeft > HORIZON_DAYS) urgency = 0.08;
  else urgency = Math.max(0.12, 1 - dLeft / HORIZON_DAYS);

  const importance = Math.min(5, Math.max(1, task.importance ?? 3)) / 5;
  const difficulty = Math.min(5, Math.max(1, task.difficulty ?? 3)) / 5;
  const est = Math.min(1, Math.max(10, task.estMinutes ?? 30) / 120);
  const weakProgress = 1 - Math.min(100, Math.max(0, task.progress ?? 0)) / 100;
  const statusBoost = task.status === "in_progress" ? 1 : 0.9; // đang làm → slight push

  const score = done
    ? 0
    : Math.round(
        (urgency * 45 + importance * 22 + difficulty * 15 + est * 10 + weakProgress * 8) * statusBoost
      );

  const reasons: string[] = [];
  if (overdue) reasons.push("Đã quá hạn");
  else if (dLeft === 0) reasons.push("Deadline hôm nay");
  else if (dLeft === 1) reasons.push("Hạn ngày mai");
  else if (dLeft <= 3) reasons.push(`Còn ${dLeft} ngày`);
  if (task.importance >= 4) reasons.push("Quan trọng");
  if (task.difficulty >= 4) reasons.push("Khó");
  if ((task.progress ?? 0) <= 20 && !done) reasons.push("Chưa triển khai");
  if (task.status === "in_progress") reasons.push("Đang làm dở");

  return { task, score, urgency, reasons };
}

/** Danh sách nhiệm vụ xếp theo độ ưu tiên (bỏ nhiệm vụ hoàn thành) */
export function rankTasks(tasks: Task[], now = todayStr()): TaskScore[] {
  return tasks
    .map((t) => priorityScore(t, now))
    .filter((s) => s.task.status !== "done")
    .sort((a, b) => b.score - a.score || a.task.dueDate.localeCompare(b.task.dueDate));
}

/* ─── Sinh lịch học tự động ───────────────────────────────────
 * Cơ chế "smart fill": xếp nhiệm vụ theo điểm ưu tiên vào các
 * ngày sắp tới, tôn trọng startDate, mỗi ngày có "băng thông"
 * (minutes/day) riêng, chunk tối đa 90 phút/ngày đối với một task.
 * Kết quả chỉ là ĐỀ XUẤT — người dùng xem và xác nhận rồi mới áp dụng.
 */
export interface PlanEntry {
  date: string; // YYYY-MM-DD
  taskId: string;
  minutes: number;
  late: boolean; // bị xếp sau deadline
}

export interface GeneratedPlan {
  entries: PlanEntry[];
  days: { date: string; minutes: number }[];
  totalMinutes: number;
}

export function buildSchedule(
  tasks: Task[],
  opts?: { daysAhead?: number; minutesPerDay?: number; maxChunk?: number }
): GeneratedPlan {
  const daysAhead = Math.min(21, Math.max(1, opts?.daysAhead ?? 7));
  const minutesPerDay = Math.min(600, Math.max(30, opts?.minutesPerDay ?? 120));
  const maxChunk = Math.min(180, Math.max(15, opts?.maxChunk ?? 90));
  const start = todayStr();

  // Băng thông mỗi ngày
  const capacity = new Map<string, number>();
  for (let i = 0; i < daysAhead; i++) capacity.set(shiftDateStr(start, i), minutesPerDay);

  const ranked = rankTasks(tasks, start);
  const entries: PlanEntry[] = [];

  for (const { task } of ranked) {
    let remaining = Math.max(10, task.estMinutes ?? 30);
    for (let i = 0; i < daysAhead && remaining > 0; i++) {
      const date = shiftDateStr(start, i);
      if (task.startDate && date < task.startDate) continue; // chưa bắt đầu được
      const cap = capacity.get(date) ?? 0;
      if (cap <= 10) continue;
      const chunk = Math.min(remaining, cap, maxChunk);
      capacity.set(date, cap - chunk);
      entries.push({ date, taskId: task.id, minutes: Math.round(chunk), late: task.dueDate < date });
      remaining -= chunk;
    }
  }

  const days: { date: string; minutes: number }[] = [];
  for (let i = 0; i < daysAhead; i++) {
    const date = shiftDateStr(start, i);
    days.push({
      date,
      minutes: entries.filter((e) => e.date === date).reduce((a, b) => a + b.minutes, 0),
    });
  }

  return { entries, days, totalMinutes: entries.reduce((a, b) => a + b.minutes, 0) };
}
