"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabaseConfigured } from "./supabase";
import { localAdapter, supabaseAdapter, type StorageAdapter } from "./adapter";
import { useAuth } from "./auth";
import { useToast } from "./toast";
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

/**
 * Nguồn dữ liệu duy nhất của toàn app (v2.0): CRUD thật qua adapter
 * (Supabase hoặc local theo tài khoản) + thông báo + loading + xử lý lỗi.
 */

interface DataCtx {
  loading: boolean;
  storageMode: "supabase" | "local";
  courses: Course[];
  chapters: Chapter[];
  tasks: Task[];
  sessions: StudySession[];
  goals: Goal[];
  flashcards: Flashcard[];
  reviews: Review[];
  exams: Exam[];
  examResults: ExamResult[];
  conversations: Conversation[];

  reload: () => Promise<void>;

  addCourse: (data: Omit<Course, "id">) => Promise<void>;
  updateCourse: (id: string, patch: Partial<Course>) => Promise<void>;
  deleteCourse: (id: string) => Promise<void>;

  addChapter: (data: Omit<Chapter, "id">) => Promise<void>;
  updateChapter: (id: string, patch: Partial<Chapter>) => Promise<void>;
  deleteChapter: (id: string) => Promise<void>;

  addTask: (data: Omit<Task, "id">) => Promise<void>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  addSession: (data: Omit<StudySession, "id">) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  addGoal: (data: Omit<Goal, "id">) => Promise<void>;
  updateGoal: (id: string, patch: Partial<Goal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;

  addFlashcard: (data: Omit<Flashcard, "id">) => Promise<void>;
  updateFlashcard: (id: string, patch: Partial<Flashcard>) => Promise<void>;
  deleteFlashcard: (id: string) => Promise<void>;

  addReview: (data: Omit<Review, "id">) => Promise<void>;
  deleteReview: (id: string) => Promise<void>;

  addExam: (data: Omit<Exam, "id">) => Promise<void>;
  updateExam: (id: string, patch: Partial<Exam>) => Promise<void>;
  deleteExam: (id: string) => Promise<void>;

  addExamResult: (data: Omit<ExamResult, "id">) => Promise<void>;
  deleteExamResult: (id: string) => Promise<void>;

  saveConversation: (conversation: Conversation) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
}

const Ctx = createContext<DataCtx | null>(null);

function byNewestCreated(a: Task, b: Task): number {
  return b.createdAt.localeCompare(a.createdAt);
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const adapter: StorageAdapter = supabaseConfigured ? supabaseAdapter : localAdapter;

  const reset = useCallback(() => {
    setCourses([]); setChapters([]); setTasks([]); setSessions([]); setGoals([]);
    setFlashcards([]); setReviews([]); setExams([]); setExamResults([]); setConversations([]);
  }, []);

  const load = useCallback(
    async (userId: string) => {
      setLoading(true);
      try {
        const [c, ch, t, ss, g, f, r, e, er, conv] = await Promise.all([
          adapter.listCourses(userId),
          adapter.listChapters(userId),
          adapter.listTasks(userId),
          adapter.listSessions(userId),
          adapter.listGoals(userId),
          adapter.listFlashcards(userId),
          adapter.listReviews(userId),
          adapter.listExams(userId),
          adapter.listExamResults(userId),
          adapter.listConversations(userId),
        ]);
        setCourses(c);
        setChapters(ch);
        setTasks(t.sort(byNewestCreated));
        setSessions(ss);
        setGoals(g);
        setFlashcards(f);
        setReviews(r);
        setExams(e);
        setExamResults(er);
        setConversations(conv);
      } catch (e) {
        push(`Không tải được dữ liệu: ${e instanceof Error ? e.message : "lỗi không xác định"}`, "error");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [push]
  );

  useEffect(() => {
    if (user) void load(user.id);
    else {
      reset();
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const reload = useCallback(async () => {
    if (user) await load(user.id);
  }, [user, load]);

  /* ── Courses (môn học v2) ───────────────────────────── */

  const addCourse = useCallback(
    async (data: Omit<Course, "id">) => {
      try {
        const rec = await adapter.createCourse(user!.id, data);
        setCourses((prev) => [...prev, rec]);
        push("Đã thêm môn học");
      } catch (e) {
        push(`Không thể thêm môn học: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const updateCourse = useCallback(
    async (id: string, patch: Partial<Course>) => {
      try {
        await adapter.updateCourse(user!.id, id, patch);
        setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
        push("Đã cập nhật môn học");
      } catch (e) {
        push(`Không thể cập nhật môn học: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const deleteCourse = useCallback(
    async (id: string) => {
      try {
        await adapter.deleteCourse(user!.id, id);
        await reload();
        push("Đã xóa môn học (bao gồm chương & flashcard liên quan)");
      } catch (e) {
        push(`Không thể xóa môn học: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push, reload]
  );

  /* ── Chapters ──────────────────────────────────────── */

  const addChapter = useCallback(
    async (data: Omit<Chapter, "id">) => {
      try {
        const rec = await adapter.createChapter(user!.id, data);
        setChapters((prev) => [...prev, rec]);
        push("Đã thêm chương học");
      } catch (e) {
        push(`Không thể thêm chương: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const updateChapter = useCallback(
    async (id: string, patch: Partial<Chapter>) => {
      try {
        await adapter.updateChapter(user!.id, id, patch);
        setChapters((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      } catch (e) {
        push(`Không thể cập nhật chương: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const deleteChapter = useCallback(
    async (id: string) => {
      try {
        await adapter.deleteChapter(user!.id, id);
        setChapters((prev) => prev.filter((c) => c.id !== id));
        push("Đã xóa chương học");
      } catch (e) {
        push(`Không thể xóa chương: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  /* ── Tasks ─────────────────────────────────────────── */

  const addTask = useCallback(
    async (data: Omit<Task, "id">) => {
      try {
        const rec = await adapter.createTask(user!.id, data);
        setTasks((prev) => [rec, ...prev]);
        push("Đã thêm nhiệm vụ");
      } catch (e) {
        push(`Không thể thêm nhiệm vụ: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const updateTask = useCallback(
    async (id: string, patch: Partial<Task>) => {
      try {
        await adapter.updateTask(user!.id, id, patch);
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      } catch (e) {
        push(`Không thể cập nhật nhiệm vụ: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      try {
        await adapter.deleteTask(user!.id, id);
        setTasks((prev) => prev.filter((t) => t.id !== id));
        push("Đã xóa nhiệm vụ");
      } catch (e) {
        push(`Không thể xóa nhiệm vụ: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  /* ── Sessions ──────────────────────────────────────── */

  const addSession = useCallback(
    async (data: Omit<StudySession, "id">) => {
      try {
        const rec = await adapter.createSession(user!.id, data);
        setSessions((prev) => [...prev, rec]);
      } catch (e) {
        push(`Không thể ghi nhận phiên học: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        await adapter.deleteSession(user!.id, id);
        setSessions((prev) => prev.filter((s) => s.id !== id));
        push("Đã xóa phiên học");
      } catch (e) {
        push(`Không thể xóa phiên học: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  /* ── Goals ─────────────────────────────────────────── */

  const addGoal = useCallback(
    async (data: Omit<Goal, "id">) => {
      try {
        const rec = await adapter.createGoal(user!.id, data);
        setGoals((prev) => [...prev, rec]);
        push("Đã thêm mục tiêu");
      } catch (e) {
        push(`Không thể thêm mục tiêu: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const updateGoal = useCallback(
    async (id: string, patch: Partial<Goal>) => {
      try {
        await adapter.updateGoal(user!.id, id, patch);
        setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
        push("Đã cập nhật mục tiêu");
      } catch (e) {
        push(`Không thể cập nhật mục tiêu: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const deleteGoal = useCallback(
    async (id: string) => {
      try {
        await adapter.deleteGoal(user!.id, id);
        setGoals((prev) => prev.filter((g) => g.id !== id));
        push("Đã xóa mục tiêu");
      } catch (e) {
        push(`Không thể xóa mục tiêu: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  /* ── Flashcards ────────────────────────────────────── */

  const addFlashcard = useCallback(
    async (data: Omit<Flashcard, "id">) => {
      try {
        const rec = await adapter.createFlashcard(user!.id, data);
        setFlashcards((prev) => [...prev, rec]);
        push("Đã thêm flashcard");
      } catch (e) {
        push(`Không thể thêm flashcard: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const updateFlashcard = useCallback(
    async (id: string, patch: Partial<Flashcard>) => {
      try {
        await adapter.updateFlashcard(user!.id, id, patch);
        setFlashcards((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
      } catch (e) {
        push(`Không thể cập nhật flashcard: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const deleteFlashcard = useCallback(
    async (id: string) => {
      try {
        await adapter.deleteFlashcard(user!.id, id);
        setFlashcards((prev) => prev.filter((f) => f.id !== id));
        setReviews((prev) => prev.filter((r) => r.flashcardId !== id));
        push("Đã xóa flashcard");
      } catch (e) {
        push(`Không thể xóa flashcard: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  /* ── Reviews ───────────────────────────────────────── */

  const addReview = useCallback(
    async (data: Omit<Review, "id">) => {
      try {
        const rec = await adapter.createReview(user!.id, data);
        setReviews((prev) => [...prev, rec]);
      } catch (e) {
        push(`Không thể ghi nhận lần ôn: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const deleteReview = useCallback(
    async (id: string) => {
      try {
        await adapter.deleteReview(user!.id, id);
        setReviews((prev) => prev.filter((r) => r.id !== id));
      } catch (e) {
        push(`Không thể xóa lần ôn: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  /* ── Exams & kết quả ───────────────────────────────── */

  const addExam = useCallback(
    async (data: Omit<Exam, "id">) => {
      try {
        const rec = await adapter.createExam(user!.id, data);
        setExams((prev) => [...prev, rec]);
        push("Đã thêm bài kiểm tra");
      } catch (e) {
        push(`Không thể thêm bài kiểm tra: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const updateExam = useCallback(
    async (id: string, patch: Partial<Exam>) => {
      try {
        await adapter.updateExam(user!.id, id, patch);
        setExams((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      } catch (e) {
        push(`Không thể cập nhật bài kiểm tra: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const deleteExam = useCallback(
    async (id: string) => {
      try {
        await adapter.deleteExam(user!.id, id);
        setExams((prev) => prev.filter((x) => x.id !== id));
        setExamResults((prev) => prev.filter((r) => r.examId !== id));
        push("Đã xóa bài kiểm tra");
      } catch (e) {
        push(`Không thể xóa bài kiểm tra: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const addExamResult = useCallback(
    async (data: Omit<ExamResult, "id">) => {
      try {
        const rec = await adapter.createExamResult(user!.id, data);
        setExamResults((prev) => [...prev, rec]);
        push("Đã lưu kết quả bài kiểm tra");
      } catch (e) {
        push(`Không thể lưu kết quả: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const deleteExamResult = useCallback(
    async (id: string) => {
      try {
        await adapter.deleteExamResult(user!.id, id);
        setExamResults((prev) => prev.filter((r) => r.id !== id));
      } catch (e) {
        push(`Không thể xóa kết quả: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  /* ── Conversations (AI) ────────────────────────────── */

  const saveConversation = useCallback(
    async (conversation: Conversation) => {
      try {
        await adapter.saveConversation(user!.id, conversation);
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === conversation.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = conversation;
            return next;
          }
          return [conversation, ...prev];
        });
      } catch (e) {
        push(`Không thể lưu hội thoại: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await adapter.deleteConversation(user!.id, id);
        setConversations((prev) => prev.filter((c) => c.id !== id));
      } catch (e) {
        push(`Không thể xóa hội thoại: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const value = useMemo<DataCtx>(
    () => ({
      loading,
      storageMode: supabaseConfigured ? "supabase" : "local",
      courses,
      chapters,
      tasks,
      sessions,
      goals,
      flashcards,
      reviews,
      exams,
      examResults,
      conversations,
      reload,
      addCourse, updateCourse, deleteCourse,
      addChapter, updateChapter, deleteChapter,
      addTask, updateTask, deleteTask,
      addSession, deleteSession,
      addGoal, updateGoal, deleteGoal,
      addFlashcard, updateFlashcard, deleteFlashcard,
      addReview, deleteReview,
      addExam, updateExam, deleteExam,
      addExamResult, deleteExamResult,
      saveConversation, deleteConversation,
    }),
    [
      loading, courses, chapters, tasks, sessions, goals, flashcards, reviews, exams, examResults, conversations,
      reload,
      addCourse, updateCourse, deleteCourse,
      addChapter, updateChapter, deleteChapter,
      addTask, updateTask, deleteTask,
      addSession, deleteSession,
      addGoal, updateGoal, deleteGoal,
      addFlashcard, updateFlashcard, deleteFlashcard,
      addReview, deleteReview,
      addExam, updateExam, deleteExam,
      addExamResult, deleteExamResult,
      saveConversation, deleteConversation,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useData phải dùng bên trong DataProvider");
  return ctx;
}
