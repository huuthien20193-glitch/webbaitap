import type { Course, Goal, StudySession, Task } from "./types";
import {
  isSameDay,
  isSameMonth,
  startOfWeek,
  toDateStr,
  shiftDateStr,
} from "./date";

/** Các hàm tính toán thuần, tái sử dụng cho Dashboard/Planner/Analytics */

export function tasksForDay(tasks: Task[], dateStr: string): Task[] {
  return tasks.filter((t) => t.startDate === dateStr || t.dueDate === dateStr);
}

export function minutesInDay(sessions: StudySession[], dateStr: string): number {
  return (
    sessions.filter((s) => toDateStr(new Date(s.startedAt)) === dateStr).reduce((sum, s) => sum + s.durationSec, 0) /
    60
  );
}

export function minutesInRange(sessions: StudySession[], fromStr: string, toStr: string): number {
  return (
    sessions
      .filter((s) => {
        const d = toDateStr(new Date(s.startedAt));
        return d >= fromStr && d <= toStr;
      })
      .reduce((sum, s) => sum + s.durationSec, 0) / 60
  );
}

export function seriesDailyMinutes(
  sessions: StudySession[],
  days: number,
  endDate = new Date()
): { date: string; label: string; minutes: number }[] {
  const out: { date: string; label: string; minutes: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const ds = toDateStr(d);
    const label = new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "numeric" }).format(d);
    out.push({ date: ds, label, minutes: Math.round(minutesInDay(sessions, ds) * 10) / 10 });
  }
  return out;
}

export function seriesDailyCompleted(
  tasks: Task[],
  days: number,
  endDate = new Date()
): { date: string; label: string; count: number }[] {
  const out: { date: string; label: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const ds = toDateStr(d);
    const label = new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "numeric" }).format(d);
    const count = tasks.filter((t) => t.status === "done" && t.completedAt && toDateStr(new Date(t.completedAt)) === ds).length;
    out.push({ date: ds, label, count });
  }
  return out;
}

export interface WeekPerf {
  weekStartStr: string;
  minutes: number;
  completed: number;
}

export function weekPerformance(sessions: StudySession[], tasks: Task[], weeks: number, endDate = new Date()): WeekPerf[] {
  const out: WeekPerf[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = startOfWeek(new Date(endDate.getTime() - i * 7 * 86_400_000));
    const we = shiftDateStr(toDateStr(ws), 6);
    const wsStr = toDateStr(ws);
    const minutes = Math.round(minutesInRange(sessions, wsStr, we) * 10) / 10;
    const completed = tasks.filter(
      (t) => t.status === "done" && t.completedAt && toDateStr(new Date(t.completedAt)) >= wsStr && toDateStr(new Date(t.completedAt)) <= we
    ).length;
    out.push({ weekStartStr: wsStr, minutes, completed });
  }
  return out;
}

export function minutesByCourse(
  sessions: StudySession[],
  courses: Course[],
  fromStr?: string,
  toStr?: string
): { id: string; name: string; color: string; minutes: number }[] {
  const totals = new Map<string, number>();
  for (const s of sessions) {
    const d = toDateStr(new Date(s.startedAt));
    if (fromStr && d < fromStr) continue;
    if (toStr && d > toStr) continue;
    const key = s.courseId ?? "_none";
    totals.set(key, (totals.get(key) ?? 0) + s.durationSec);
  }
  const out = courses.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    minutes: Math.round(((totals.get(c.id) ?? 0) / 60) * 10) / 10,
  }));
  const none = totals.get("_none") ?? 0;
  if (none > 0) out.push({ id: "_none", name: "Không môn", color: "#94a3b8", minutes: Math.round((none / 60) * 10) / 10 });
  return out.filter((r) => r.minutes > 0).sort((a, b) => b.minutes - a.minutes);
}

export function taskStats(tasks: Task[]) {
  const done = tasks.filter((t) => t.status === "done").length;
  return {
    total: tasks.length,
    done,
    open: tasks.length - done,
    rate: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
  };
}

export interface CourseProgress {
  course: Course;
  total: number;
  done: number;
  rate: number;
  /** Trung bình mức độ hiểu các chương (0–100). null khi chưa có chương nào */
  chapterScore: number | null;
}

export function courseProgress(courses: Course[], tasks: Task[], chapters: { courseId: string; understanding: number }[]): CourseProgress[] {
  return courses.map((c) => {
    const own = tasks.filter((t) => t.courseId === c.id);
    const done = own.filter((t) => t.status === "done").length;
    const chs = chapters.filter((ch) => ch.courseId === c.id);
    const chapterScore = chs.length === 0 ? null : Math.round((chs.reduce((a, b) => a + b.understanding, 0) / (chs.length * 5)) * 100);
    return {
      course: c,
      total: own.length,
      done,
      rate: own.length === 0 ? 0 : Math.round((done / own.length) * 100),
      chapterScore,
    };
  });
}

export interface GoalProgress {
  goal: Goal;
  current: number;
  target: number;
  percent: number;
  achieved: boolean;
}

export function goalProgress(goal: Goal, tasks: Task[], sessions: StudySession[], now = new Date()): GoalProgress {
  if (goal.scope === "daily") {
    const ds = toDateStr(now);
    const current =
      goal.metric === "tasks"
        ? tasks.filter((t) => t.status === "done" && t.completedAt && isSameDay(new Date(t.completedAt), now)).length
        : Math.round(minutesInDay(sessions, ds));
    const target = Math.max(1, goal.target);
    return { goal, current, target, percent: Math.min(100, Math.round((current / target) * 100)), achieved: current >= target };
  }
  const ws = startOfWeek(now);
  const wsStr = toDateStr(ws);
  const weStr = toDateStr(new Date(ws.getTime() + 6 * 86_400_000));
  const current =
    goal.metric === "tasks"
      ? tasks.filter((t) => {
          if (t.status !== "done" || !t.completedAt) return false;
          const d = toDateStr(new Date(t.completedAt));
          return d >= wsStr && d <= weStr;
        }).length
      : Math.round(minutesInRange(sessions, wsStr, weStr));
  const target = Math.max(1, goal.target);
  return { goal, current, target, percent: Math.min(100, Math.round((current / target) * 100)), achieved: current >= target };
}

/** Tasks trong "hôm nay", chưa hoàn thành lên trước */
export function orderTasks(tasks: Task[]): Task[] {
  const weight: Record<string, number> = { todo: 0, in_progress: 1, done: 2 };
  return [...tasks].sort((a, b) => {
    const p = { high: 0, medium: 1, low: 2 } as const;
    if (weight[a.status] !== weight[b.status]) return weight[a.status] - weight[b.status];
    if (p[a.priority] !== p[b.priority]) return p[a.priority] - p[b.priority];
    return a.dueDate.localeCompare(b.dueDate);
  });
}

export function todaySummary(tasks: Task[], sessions: StudySession[], goals: Goal[], now = new Date()) {
  const ds = toDateStr(now);
  const todays = tasks.filter((t) => t.startDate === ds || t.dueDate === ds);
  const done = todays.filter((t) => t.status === "done").length;
  const weekStart = toDateStr(startOfWeek(now));
  const weekEnd = shiftDateStr(weekStart, 6);
  const weekMinutes = Math.round(minutesInRange(sessions, weekStart, weekEnd));
  const weeklyGoals = goals.filter((g) => g.scope === "weekly");
  let weeklyPercent = 0;
  if (weeklyGoals.length > 0) {
    const ps = weeklyGoals.map((g) => goalProgress(g, tasks, sessions, now).percent);
    weeklyPercent = Math.round(ps.reduce((a, b) => a + b, 0) / weeklyGoals.length);
  }
  return { todays: orderTasks(todays), done, remaining: todays.length - done, weekStart, weekEnd, weekMinutes, weeklyPercent };
}

export function upcomingDeadlines(tasks: Task[], days = 7, now = new Date()): Task[] {
  const today = toDateStr(now);
  const limit = shiftDateStr(today, days);
  return orderTasks(tasks.filter((t) => t.status !== "done" && t.dueDate >= today && t.dueDate <= limit)).slice(0, 8);
}

/** Chûỗi ngày học liên tục (mỗi ngày có ≥1 phiên > 0 phút). */
export function studyStreak(sessions: StudySession[], now = new Date()): number {
  const days = new Set(
    sessions.filter((s) => s.durationSec > 0).map((s) => toDateStr(new Date(s.startedAt)))
  );
  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(toDateStr(cursor))) {
    // Hôm nay chưa học → chuỗi tính từ hôm qua trở về trước
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(toDateStr(cursor))) return 0;
  }
  while (days.has(toDateStr(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Số flashcard đến hạn (hôm nay và các hôm đã quá hạn) */
export function dueFlashcards<T extends { dueDate: string }>(cards: T[], today: string): T[] {
  return cards.filter((c) => c.dueDate <= today);
}

/** Tổng số phút học của tháng hiện tại */
export function minutesThisMonth(sessions: StudySession[], now = new Date()): number {
  let total = 0;
  for (const s of sessions) {
    if (isSameMonth(new Date(s.startedAt), now)) total += s.durationSec;
  }
  return Math.round(total / 60);
}
