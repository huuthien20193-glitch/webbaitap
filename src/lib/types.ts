export type Priority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "done";
export type GoalScope = "daily" | "weekly";
export type GoalMetric = "tasks" | "minutes";

export interface Subject {
  id: string;
  name: string;
  color: string;
  goal: string; // mục tiêu môn học (tự do)
  createdAt: string;
}

export interface Task {
  id: string;
  subjectId: string | null;
  title: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  priority: Priority;
  status: TaskStatus;
  completedAt: string | null;
  createdAt: string;
}

export interface StudySession {
  id: string;
  subjectId: string | null;
  startedAt: string; // ISO datetime
  durationSec: number; // thời gian học thực tế tính bằng giây
  note: string;
}

export interface Goal {
  id: string;
  scope: GoalScope; // daily | weekly
  metric: GoalMetric; // tasks | minutes
  target: number; // số nhiệm vụ hoặc số phút
  note: string;
  createdAt: string;
}

export interface PomodoroSettings {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
}

export const DEFAULT_POMODORO: PomodoroSettings = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
};

export const SUBJECT_COLORS = [
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#84cc16",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#ec4899",
] as const;

export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};
