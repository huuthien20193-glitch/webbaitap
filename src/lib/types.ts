export type Priority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "done";
export type GoalScope = "daily" | "weekly";
export type GoalMetric = "tasks" | "minutes";

/* ─── Môn học (Course Manager v2) ─────────────────────────────
   Entity thống nhất thay cho "Subject" của v1. Migration giữ
   nguyên id → dữ liệu cũ không mất (subject_id cũ map trực tiếp
   sang course_id).                                                    */
export interface Course {
  id: string;
  name: string;
  code: string; // mã môn học, ví dụ "MA101"
  instructor: string;
  credits: number; // số tín chỉ
  description: string;
  color: string;
  goal: string; // mục tiêu môn học (từ v1)
  createdAt: string;
}

/* ─── Chương học ───────────────────────────────────────────── */
export interface Chapter {
  id: string;
  courseId: string;
  title: string;
  content: string;
  understanding: number; // 1–5 mức độ hiểu bài
  position: number; // thứ tự chương
  createdAt: string;
}

/* ─── Nhiệm vụ ─────────────────────────────────────────────── */
export interface Task {
  id: string;
  courseId: string | null;
  title: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  priority: Priority;
  status: TaskStatus;
  estMinutes: number; // thời lượng dự kiến (phút)
  difficulty: number; // 1 (đễ) → 5 (khó)
  importance: number; // 1 (ít quan trọng) → 5 (rất quan trọng)
  progress: number; // 0–100 %
  completedAt: string | null;
  createdAt: string;
}

/* ─── Phiên học (Pomodoro) ─────────────────────────────────── */
export interface StudySession {
  id: string;
  courseId: string | null;
  startedAt: string; // ISO datetime
  durationSec: number; // thời gian học thực tế tính bằng giây
  note: string;
}

/* ─── Mục tiêu ─────────────────────────────────────────────── */
export interface Goal {
  id: string;
  scope: GoalScope; // daily | weekly
  metric: GoalMetric; // tasks | minutes
  target: number; // số nhiệm vụ hoặc số phút
  note: string;
  createdAt: string;
}

/* ─── Flashcard + SM-2 ─────────────────────────────────────── */
export interface Flashcard {
  id: string;
  courseId: string | null;
  chapterId: string | null;
  question: string;
  answer: string;
  ease: number; // hệ số dễ (SM-2), mặc định 2.5
  interval: number; // số ngày ôn tiếp theo
  repetitions: number; // số lần ôn thành công liên tiếp
  dueDate: string; // YYYY-MM-DD ngày ôn kế tiếp
  createdAt: string;
}

export interface Review {
  id: string;
  flashcardId: string;
  courseId: string | null;
  rated: number; // chất lượng nhớ 0–5 (SM-2)
  reviewedAt: string; // ISO
}

/* ─── Bài kiểm tra & kết quả ───────────────────────────────── */
export interface Exam {
  id: string;
  title: string;
  courseId: string | null;
  examDate: string; // YYYY-MM-DD
  note: string;
  createdAt: string;
}

export interface ExamResult {
  id: string;
  examId: string;
  courseId: string | null;
  score: number; // 0–100
  note: string;
  createdAt: string;
}

/* ─── AI Assistant ─────────────────────────────────────────── */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

/* ─── Cấu hình Pomodoro ────────────────────────────────────── */
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

/* ─── Giá trị mặc định khi tạo mới ─────────────────────────── */
export const DEFAULT_TASK_FIELDS = {
  estMinutes: 30,
  difficulty: 3,
  importance: 3,
  progress: 0,
} as const;

export const COURSE_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#84cc16",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#ec4899",
] as const;

/** Tương thích với code cũ (v1) */
export const SUBJECT_COLORS = COURSE_COLORS;

export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const UNDERSTANDING_LABELS: Record<number, string> = {
  1: "Chưa hiểu gì",
  2: "Còn xa lạ",
  3: "Hiểu cơ bản",
  4: "Hiểu khá tốt",
  5: "Nắm chắc",
};
