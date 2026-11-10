import type {
  Chapter,
  Conversation,
  Course,
  Exam,
  ExamResult,
  Flashcard,
  Goal,
  Review,
  StudySession,
  Task,
} from "./types";
import { todayStr } from "./date";
import { getSupabase } from "./supabase";

/**
 * Tầng lưu trữ thống nhất (v2.0):
 * - supabaseAdapter: dùng khi đã cấu hình NEXT_PUBLIC_SUPABASE_URL/ANON_KEY.
 *   Dữ liệu được bảo vệ bởi RLS (mỗi user chỉ đọc/ghi dòng có user_id của mình).
 * - localAdapter: fallback lưu bền vững theo tài khoản cục bộ.
 *
 * Migration cục bộ an toàn: dữ liệu v1 (subjects/sessions giữ key cũ, task có
 * subjectId) được đọc rồi copy sang cấu trúc mới, KHÔNG xóa dữ liệu cũ.
 */
export interface StorageAdapter {
  listCourses(userId: string): Promise<Course[]>;
  listChapters(userId: string): Promise<Chapter[]>;
  listTasks(userId: string): Promise<Task[]>;
  listSessions(userId: string): Promise<StudySession[]>;
  listGoals(userId: string): Promise<Goal[]>;
  listFlashcards(userId: string): Promise<Flashcard[]>;
  listReviews(userId: string): Promise<Review[]>;
  listExams(userId: string): Promise<Exam[]>;
  listExamResults(userId: string): Promise<ExamResult[]>;
  listConversations(userId: string): Promise<Conversation[]>;

  createCourse(userId: string, data: Omit<Course, "id">): Promise<Course>;
  updateCourse(userId: string, id: string, patch: Partial<Course>): Promise<void>;
  deleteCourse(userId: string, id: string): Promise<void>; // cascade nội bộ

  createChapter(userId: string, data: Omit<Chapter, "id">): Promise<Chapter>;
  updateChapter(userId: string, id: string, patch: Partial<Chapter>): Promise<void>;
  deleteChapter(userId: string, id: string): Promise<void>;

  createTask(userId: string, data: Omit<Task, "id">): Promise<Task>;
  updateTask(userId: string, id: string, patch: Partial<Task>): Promise<void>;
  deleteTask(userId: string, id: string): Promise<void>;

  createSession(userId: string, data: Omit<StudySession, "id">): Promise<StudySession>;
  deleteSession(userId: string, id: string): Promise<void>;

  createGoal(userId: string, data: Omit<Goal, "id">): Promise<Goal>;
  updateGoal(userId: string, id: string, patch: Partial<Goal>): Promise<void>;
  deleteGoal(userId: string, id: string): Promise<void>;

  createFlashcard(userId: string, data: Omit<Flashcard, "id">): Promise<Flashcard>;
  updateFlashcard(userId: string, id: string, patch: Partial<Flashcard>): Promise<void>;
  deleteFlashcard(userId: string, id: string): Promise<void>;

  createReview(userId: string, data: Omit<Review, "id">): Promise<Review>;
  deleteReview(userId: string, id: string): Promise<void>;

  createExam(userId: string, data: Omit<Exam, "id">): Promise<Exam>;
  updateExam(userId: string, id: string, patch: Partial<Exam>): Promise<void>;
  deleteExam(userId: string, id: string): Promise<void>;

  createExamResult(userId: string, data: Omit<ExamResult, "id">): Promise<ExamResult>;
  deleteExamResult(userId: string, id: string): Promise<void>;

  saveConversation(userId: string, conversation: Conversation): Promise<void>;
  deleteConversation(userId: string, id: string): Promise<void>;
}

/* ═══════════════ CHUẨN HOÁ & MẶC ĐỊNH ═══════════════ */

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Task từ dữ liệu cũ (v1 chỉ có subjectId) → dạng mới, không mất gì */
export function normTask(raw: object): Task {
  const r = raw as Partial<Task> & { subjectId?: unknown };
  const rawCourse = (r as { courseId?: unknown }).courseId;
  const courseId = rawCourse != null && rawCourse !== "" ? String(rawCourse) : r.subjectId != null ? String(r.subjectId) : null;
  return {
    id: String(r.id),
    courseId,
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    startDate: String(r.startDate ?? todayStr()),
    dueDate: String(r.dueDate ?? todayStr()),
    priority: (r.priority ?? "medium") as Task["priority"],
    status: (r.status ?? "todo") as Task["status"],
    estMinutes: clampInt(r.estMinutes, 30, 5, 600),
    difficulty: clampInt(r.difficulty, 3, 1, 5),
    importance: clampInt(r.importance, 3, 1, 5),
    progress: clampInt(r.progress, 0, 0, 100),
    completedAt: r.completedAt == null ? null : String(r.completedAt),
    createdAt: String(r.createdAt ?? ""),
  };
}

export function normCourse(raw: object): Course {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    code: String(r.code ?? ""),
    instructor: String(r.instructor ?? ""),
    credits: clampInt(r.credits, 0, 0, 30),
    description: String(r.description ?? ""),
    color: String(r.color ?? "#6366f1"),
    goal: String(r.goal ?? ""),
    createdAt: String(r.createdAt ?? ""),
  };
}

export function normChapter(raw: object): Chapter {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id),
    courseId: String(r.courseId ?? ""),
    title: String(r.title ?? ""),
    content: String(r.content ?? ""),
    understanding: clampInt(r.understanding, 1, 1, 5),
    position: clampInt(r.position, 0, 0, 999),
    createdAt: String(r.createdAt ?? ""),
  };
}

export function normFlashcard(raw: object): Flashcard {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id),
    courseId: r.courseId == null ? null : String(r.courseId),
    chapterId: r.chapterId == null ? null : String(r.chapterId),
    question: String(r.question ?? ""),
    answer: String(r.answer ?? ""),
    ease: Number.isFinite(Number(r.ease)) ? Number(r.ease) : 2.5,
    interval: clampInt(r.interval, 0, 0, 3650),
    repetitions: clampInt(r.repetitions, 0, 0, 9999),
    dueDate: String(r.dueDate ?? todayStr()),
    createdAt: String(r.createdAt ?? ""),
  };
}

/* ═══════════════ LOCAL ADAPTER ═══════════════ */

const NS = "studyflow";

type Kind =
  | "subjects" /* legacy v1 */
  | "courses"
  | "chapters"
  | "tasks"
  | "sessions"
  | "goals"
  | "flashcards"
  | "reviews"
  | "exams"
  | "examResults"
  | "conversations";

function keyOf(kind: Kind, userId: string) {
  return `${NS}:data:${kind}:${userId}`;
}

function readLocal<T>(kind: Kind, userId: string): T[] {
  try {
    const raw =
      typeof window !== "undefined" ? window.localStorage.getItem(keyOf(kind, userId)) : null;
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return (Array.isArray(parsed) ? parsed : []).filter(
      (r) => typeof r === "object" && r !== null && typeof (r as { id?: unknown }).id === "string"
    ) as T[];
  } catch {
    return [];
  }
}

function writeLocal<T>(kind: Kind, userId: string, rows: T[]) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(keyOf(kind, userId), JSON.stringify(rows));
  } catch {
    // Bộ nhớ đầy — dữ liệu vẫn dùng được trong phiên hiện tại
  }
}

/** Migration v1 → v2: subjects → courses (giữ nguyên id), tasks: subjectId → courseId. */
function migrateLocal(userId: string) {
  try {
    if (typeof window === "undefined") return;
    const flagKey = `${NS}:migrated:${userId}`;
    if (window.localStorage.getItem(flagKey)) return;

    const legacySubjects = readLocal<object>("subjects", userId);
    if (legacySubjects.length > 0 && readLocal("courses", userId).length === 0) {
      writeLocal(
        "courses",
        userId,
        legacySubjects.map((s) => normCourse(s))
      );
    }

    const tasks = readLocal<object>("tasks", userId);
    if (tasks.length > 0) writeLocal("tasks", userId, tasks.map((t) => normTask(t)));

    const sessions = readLocal<object & { subjectId?: unknown }>("sessions", userId);
    if (sessions.length > 0) {
      writeLocal(
        "sessions",
        userId,
        sessions.map((s) => ({
          id: String((s as { id?: unknown }).id),
          courseId: (s as { courseId?: unknown }).courseId ?? (s as { subjectId?: unknown }).subjectId ?? null,
          startedAt: String((s as { startedAt?: unknown }).startedAt ?? ""),
          durationSec: Number((s as { durationSec?: unknown }).durationSec ?? 0),
          note: String((s as { note?: unknown }).note ?? ""),
        }))
      );
    }

    window.localStorage.setItem(flagKey, "v2");
  } catch {
    /* migration lỗi thì bỏ qua, app vẫn đọc được dữ liệu cũ nhờ norm functions */
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && typeof (v as { id?: unknown }).id === "string";
}

export const localAdapter: StorageAdapter = {
  listCourses: (userId) => {
    migrateLocal(userId);
    return Promise.resolve(readLocal<object>("courses", userId).filter(isRecord).map(normCourse));
  },
  listChapters: (userId) =>
    Promise.resolve(readLocal<object>("chapters", userId).filter(isRecord).map(normChapter).sort((a, b) => a.position - b.position)),
  listTasks: (userId) => {
    migrateLocal(userId);
    return Promise.resolve(
      readLocal<object>("tasks", userId).filter(isRecord).map(normTask)
    );
  },
  listSessions: (userId) =>
    Promise.resolve(readLocal<StudySession>("sessions", userId)),
  listGoals: (userId) => Promise.resolve(readLocal<Goal>("goals", userId)),
  listFlashcards: (userId) =>
    Promise.resolve(readLocal<object>("flashcards", userId).filter(isRecord).map(normFlashcard)),
  listReviews: (userId) => Promise.resolve(readLocal<Review>("reviews", userId)),
  listExams: (userId) => Promise.resolve(readLocal<Exam>("exams", userId)),
  listExamResults: (userId) => Promise.resolve(readLocal<ExamResult>("examResults", userId)),
  listConversations: (userId) => Promise.resolve(readLocal<Conversation>("conversations", userId)),

  async createCourse(userId, data) {
    const rows = readLocal<Course>("courses", userId);
    const rec: Course = { ...data, id: crypto.randomUUID() };
    rows.push(rec);
    writeLocal("courses", userId, rows);
    return rec;
  },
  async updateCourse(userId, id, patch) {
    const rows = readLocal<Course>("courses", userId);
    writeLocal("courses", userId, rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  },
  async deleteCourse(userId, id) {
    // Cascade: chapters, flashcards (+reviews), exams, exam_results của môn này
    writeLocal("chapters", userId, readLocal<Chapter>("chapters", userId).filter((c) => c.courseId !== id));
    const flashcards = readLocal<Flashcard>("flashcards", userId);
    const removedIds = new Set(flashcards.filter((f) => f.courseId === id).map((f) => f.id));
    writeLocal("flashcards", userId, flashcards.filter((f) => f.courseId !== id));
    writeLocal(
      "reviews",
      userId,
      readLocal<Review>("reviews", userId).filter((r) => !removedIds.has(r.flashcardId) && r.courseId !== id)
    );
    writeLocal("exams", userId, readLocal<Exam>("exams", userId).filter((e) => e.courseId !== id));
    writeLocal("examResults", userId, readLocal<ExamResult>("examResults", userId).filter((r) => r.courseId !== id));
    writeLocal("courses", userId, readLocal<Course>("courses", userId).filter((r) => r.id !== id));
  },

  async createChapter(userId, data) {
    const rows = readLocal<Chapter>("chapters", userId);
    const rec: Chapter = { ...data, id: crypto.randomUUID() };
    rows.push(rec);
    writeLocal("chapters", userId, rows);
    return rec;
  },
  async updateChapter(userId, id, patch) {
    const rows = readLocal<Chapter>("chapters", userId);
    writeLocal("chapters", userId, rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  },
  async deleteChapter(userId, id) {
    const rows = readLocal<Chapter>("chapters", userId);
    writeLocal("chapters", userId, rows.filter((r) => r.id !== id));
  },

  async createTask(userId, data) {
    const rows = readLocal<Task>("tasks", userId);
    const rec = normTask({ ...data, id: crypto.randomUUID() });
    rows.push(rec);
    writeLocal("tasks", userId, rows);
    return rec;
  },
  async updateTask(userId, id, patch) {
    const rows = readLocal<Task>("tasks", userId);
    writeLocal("tasks", userId, rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  },
  async deleteTask(userId, id) {
    const rows = readLocal<Task>("tasks", userId);
    writeLocal("tasks", userId, rows.filter((r) => r.id !== id));
  },

  async createSession(userId, data) {
    const rows = readLocal<StudySession>("sessions", userId);
    const rec: StudySession = { ...data, id: crypto.randomUUID() };
    rows.push(rec);
    writeLocal("sessions", userId, rows);
    return rec;
  },
  async deleteSession(userId, id) {
    const rows = readLocal<StudySession>("sessions", userId);
    writeLocal("sessions", userId, rows.filter((r) => r.id !== id));
  },

  async createGoal(userId, data) {
    const rows = readLocal<Goal>("goals", userId);
    const rec: Goal = { ...data, id: crypto.randomUUID() };
    rows.push(rec);
    writeLocal("goals", userId, rows);
    return rec;
  },
  async updateGoal(userId, id, patch) {
    const rows = readLocal<Goal>("goals", userId);
    writeLocal("goals", userId, rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  },
  async deleteGoal(userId, id) {
    const rows = readLocal<Goal>("goals", userId);
    writeLocal("goals", userId, rows.filter((r) => r.id !== id));
  },

  async createFlashcard(userId, data) {
    const rows = readLocal<Flashcard>("flashcards", userId);
    const rec = normFlashcard({ ...data, id: crypto.randomUUID() });
    rows.push(rec);
    writeLocal("flashcards", userId, rows);
    return rec;
  },
  async updateFlashcard(userId, id, patch) {
    const rows = readLocal<Flashcard>("flashcards", userId);
    writeLocal("flashcards", userId, rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  },
  async deleteFlashcard(userId, id) {
    writeLocal("flashcards", userId, readLocal<Flashcard>("flashcards", userId).filter((r) => r.id !== id));
    writeLocal("reviews", userId, readLocal<Review>("reviews", userId).filter((r) => r.flashcardId !== id));
  },

  async createReview(userId, data) {
    const rows = readLocal<Review>("reviews", userId);
    const rec: Review = { ...data, id: crypto.randomUUID() };
    rows.push(rec);
    writeLocal("reviews", userId, rows);
    return rec;
  },
  async deleteReview(userId, id) {
    writeLocal("reviews", userId, readLocal<Review>("reviews", userId).filter((r) => r.id !== id));
  },

  async createExam(userId, data) {
    const rows = readLocal<Exam>("exams", userId);
    const rec: Exam = { ...data, id: crypto.randomUUID() };
    rows.push(rec);
    writeLocal("exams", userId, rows);
    return rec;
  },
  async updateExam(userId, id, patch) {
    const rows = readLocal<Exam>("exams", userId);
    writeLocal("exams", userId, rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  },
  async deleteExam(userId, id) {
    writeLocal("exams", userId, readLocal<Exam>("exams", userId).filter((r) => r.id !== id));
    writeLocal("examResults", userId, readLocal<ExamResult>("examResults", userId).filter((r) => r.examId !== id));
  },

  async createExamResult(userId, data) {
    const rows = readLocal<ExamResult>("examResults", userId);
    const rec: ExamResult = { ...data, id: crypto.randomUUID() };
    rows.push(rec);
    writeLocal("examResults", userId, rows);
    return rec;
  },
  async deleteExamResult(userId, id) {
    writeLocal("examResults", userId, readLocal<ExamResult>("examResults", userId).filter((r) => r.id !== id));
  },

  async saveConversation(userId, conversation) {
    const rows = readLocal<Conversation>("conversations", userId);
    const idx = rows.findIndex((r) => r.id === conversation.id);
    if (idx >= 0) rows[idx] = conversation;
    else rows.push(conversation);
    writeLocal("conversations", userId, rows);
  },
  async deleteConversation(userId, id) {
    writeLocal("conversations", userId, readLocal<Conversation>("conversations", userId).filter((r) => r.id !== id));
  },
};

/* ═══════════════ SUPABASE ADAPTER ═══════════════ */

type Row = Record<string, unknown>;

/** camelCase → snake_case (dữ liệu app dùng camelCase, DB dùng snake_case) */
const COLS: Record<string, string> = {
  courseId: "course_id",
  chapterId: "chapter_id",
  flashcardId: "flashcard_id",
  examId: "exam_id",
  estMinutes: "est_minutes",
  dueDate: "due_date",
  startDate: "start_date",
  completedAt: "completed_at",
  createdAt: "created_at",
  updatedAt: "updated_at",
  startedAt: "started_at",
  durationSec: "duration_sec",
  examDate: "exam_date",
  reviewedAt: "reviewed_at",
};

function toDb(obj: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(obj)) out[COLS[k] ?? k] = v;
  return out;
}

function err(e: unknown): Error {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: unknown }).message)
        : String(e);
  return new Error(msg);
}

function table() {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase chưa được cấu hình");
  return sb;
}

async function list<T>(from: string, order: { col: string; asc?: boolean }, map: (r: Row) => T): Promise<T[]> {
  const { data, error } = await table()
    .from(from)
    .select("*")
    .order(order.col, { ascending: order.asc ?? true });
  if (error) throw err(error);
  return (data ?? []).map(map);
}

async function insert<T>(from: string, data: Row, map: (r: Row) => T): Promise<T> {
  const { data: d, error } = await table().from(from).insert(toDb(data)).select().single();
  if (error) throw err(error);
  return map(d);
}

async function update(from: string, id: string, patch: Row): Promise<void> {
  const { error } = await table().from(from).update(toDb(patch)).eq("id", id);
  if (error) throw err(error);
}

async function del(from: string, id: string): Promise<void> {
  const { error } = await table().from(from).delete().eq("id", id);
  if (error) throw err(error);
}

function mapCourse(r: Row): Course {
  return normCourse({
    id: r.id,
    name: r.name,
    code: r.code,
    instructor: r.instructor,
    credits: r.credits,
    description: r.description,
    color: r.color,
    goal: r.goal,
    createdAt: r.created_at,
  });
}

function mapChapter(r: Row): Chapter {
  return normChapter({
    id: r.id,
    courseId: r.course_id,
    title: r.title,
    content: r.content,
    understanding: r.understanding,
    position: r.position,
    createdAt: r.created_at,
  });
}

function mapTask(r: Row): Task {
  return normTask({
    id: r.id,
    courseId: r.course_id,
    subjectId: r.subject_id,
    title: r.title,
    description: r.description,
    startDate: r.start_date,
    dueDate: r.due_date,
    priority: r.priority,
    status: r.status,
    estMinutes: r.est_minutes,
    difficulty: r.difficulty,
    importance: r.importance,
    progress: r.progress,
    completedAt: r.completed_at,
    createdAt: r.created_at,
  });
}

function mapSession(r: Row): StudySession {
  return {
    id: String(r.id),
    courseId: r.course_id == null ? (r.subject_id == null ? null : String(r.subject_id)) : String(r.course_id),
    startedAt: String(r.started_at ?? ""),
    durationSec: Number(r.duration_sec ?? 0),
    note: String(r.note ?? ""),
  };
}

function mapGoal(r: Row): Goal {
  return {
    id: String(r.id),
    scope: (r.scope ?? "daily") as Goal["scope"],
    metric: (r.metric ?? "tasks") as Goal["metric"],
    target: Number(r.target ?? 1),
    note: String(r.note ?? ""),
    createdAt: String(r.created_at ?? ""),
  };
}

function mapFlashcard(r: Row): Flashcard {
  return normFlashcard({
    id: r.id,
    courseId: r.course_id,
    chapterId: r.chapter_id,
    question: r.question,
    answer: r.answer,
    ease: r.ease,
    interval: r.interval,
    repetitions: r.repetitions,
    dueDate: r.due_date,
    createdAt: r.created_at,
  });
}

function mapReview(r: Row): Review {
  return {
    id: String(r.id),
    flashcardId: String(r.flashcard_id ?? ""),
    courseId: r.course_id == null ? null : String(r.course_id),
    rated: Number(r.rated ?? 0),
    reviewedAt: String(r.reviewed_at ?? ""),
  };
}

function mapExam(r: Row): Exam {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    courseId: r.course_id == null ? null : String(r.course_id),
    examDate: String(r.exam_date ?? todayStr()),
    note: String(r.note ?? ""),
    createdAt: String(r.created_at ?? ""),
  };
}

function mapExamResult(r: Row): ExamResult {
  return {
    id: String(r.id),
    examId: String(r.exam_id ?? ""),
    courseId: r.course_id == null ? null : String(r.course_id),
    score: Number(r.score ?? 0),
    note: String(r.note ?? ""),
    createdAt: String(r.created_at ?? ""),
  };
}

function mapConversation(r: Row): Conversation {
  const msgs = Array.isArray(r.messages) ? r.messages : [];
  return {
    id: String(r.id),
    title: String(r.title ?? "Cuộc trò chuyện"),
    messages: msgs
      .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
      .map((m) => ({
        id: String(m.id ?? crypto.randomUUID()),
        role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: String(m.content ?? ""),
        createdAt: String(m.createdAt ?? m.created_at ?? ""),
      })),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? r.created_at ?? ""),
  };
}

export const supabaseAdapter: StorageAdapter = {
  listCourses: (userId) => {
    void userId;
    return list<Course>("courses", { col: "created_at" }, mapCourse);
  },
  listChapters: (userId) => {
    void userId;
    return list<Chapter>("chapters", { col: "position" }, mapChapter);
  },
  listTasks: (userId) => {
    void userId;
    return list<Task>("tasks", { col: "created_at", asc: false }, mapTask);
  },
  listSessions: (userId) => {
    void userId;
    return list<StudySession>("study_sessions", { col: "started_at" }, mapSession);
  },
  listGoals: (userId) => {
    void userId;
    return list<Goal>("goals", { col: "created_at" }, mapGoal);
  },
  listFlashcards: (userId) => {
    void userId;
    return list<Flashcard>("flashcards", { col: "created_at" }, mapFlashcard);
  },
  listReviews: (userId) => {
    void userId;
    return list<Review>("reviews", { col: "reviewed_at", asc: false }, mapReview);
  },
  listExams: (userId) => {
    void userId;
    return list<Exam>("exams", { col: "exam_date" }, mapExam);
  },
  listExamResults: (userId) => {
    void userId;
    return list<ExamResult>("exam_results", { col: "created_at", asc: false }, mapExamResult);
  },
  listConversations: (userId) => {
    void userId;
    return list<Conversation>("ai_conversations", { col: "updated_at", asc: false }, mapConversation);
  },

  createCourse: (_userId, data) => insert<Course>("courses", data as Row, mapCourse),
  updateCourse: (_userId, id, patch) => update("courses", id, patch as Row),
  deleteCourse: (_userId, id) => del("courses", id), // FK ON DELETE CASCADE lo phần còn lại

  createChapter: (_userId, data) => insert<Chapter>("chapters", data as Row, mapChapter),
  updateChapter: (_userId, id, patch) => update("chapters", id, patch as Row),
  deleteChapter: (_userId, id) => del("chapters", id),

  createTask: (_userId, data) => insert<Task>("tasks", data as Row, mapTask),
  updateTask: (_userId, id, patch) => update("tasks", id, patch as Row),
  deleteTask: (_userId, id) => del("tasks", id),

  createSession: (_userId, data) => insert<StudySession>("study_sessions", data as Row, mapSession),
  deleteSession: (_userId, id) => del("study_sessions", id),

  createGoal: (_userId, data) => insert<Goal>("goals", data as Row, mapGoal),
  updateGoal: (_userId, id, patch) => update("goals", id, patch as Row),
  deleteGoal: (_userId, id) => del("goals", id),

  createFlashcard: (_userId, data) => insert<Flashcard>("flashcards", data as Row, mapFlashcard),
  updateFlashcard: (_userId, id, patch) => update("flashcards", id, patch as Row),
  deleteFlashcard: (_userId, id) => del("flashcards", id),

  createReview: (_userId, data) => insert<Review>("reviews", data as Row, mapReview),
  deleteReview: (_userId, id) => del("reviews", id),

  createExam: (_userId, data) => insert<Exam>("exams", data as Row, mapExam),
  updateExam: (_userId, id, patch) => update("exams", id, patch as Row),
  deleteExam: (_userId, id) => del("exams", id),

  createExamResult: (_userId, data) => insert<ExamResult>("exam_results", data as Row, mapExamResult),
  deleteExamResult: (_userId, id) => del("exam_results", id),

  saveConversation: async (_userId, conversation) => {
    const row = {
      id: conversation.id,
      title: conversation.title,
      messages: conversation.messages,
      created_at: conversation.createdAt,
      updated_at: conversation.updatedAt,
    };
    const { error } = await table().from("ai_conversations").upsert(row, { onConflict: "id" });
    if (error) throw err(error);
  },
  deleteConversation: (_userId, id) => del("ai_conversations", id),
};
