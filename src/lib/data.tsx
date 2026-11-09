"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabaseConfigured } from "./supabase";
import { localAdapter, supabaseAdapter, type StorageAdapter } from "./adapter";
import { useAuth } from "./auth";
import { useToast } from "./toast";
import type { Goal, StudySession, Subject, Task } from "./types";

/**
 * Nguồn dữ liệu duy nhất của toàn app: CRUD thật + thông báo + loading + xử lý lỗi.
 * Dữ liệu luôn được ghi bền vững qua adapter (Supabase hoặc local theo account).
 */

interface DataCtx {
  loading: boolean;
  storageMode: "supabase" | "local";
  subjects: Subject[];
  tasks: Task[];
  sessions: StudySession[];
  goals: Goal[];

  reload: () => Promise<void>;

  addSubject: (data: Omit<Subject, "id">) => Promise<void>;
  updateSubject: (id: string, patch: Partial<Subject>) => Promise<void>;
  deleteSubject: (id: string) => Promise<void>;

  addTask: (data: Omit<Task, "id">) => Promise<void>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  addSession: (data: Omit<StudySession, "id">) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  addGoal: (data: Omit<Goal, "id">) => Promise<void>;
  updateGoal: (id: string, patch: Partial<Goal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
}

const Ctx = createContext<DataCtx | null>(null);

function byNewestCreated(a: Task, b: Task): number {
  return b.createdAt.localeCompare(a.createdAt);
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  const adapter: StorageAdapter = supabaseConfigured ? supabaseAdapter : localAdapter;

  const reset = useCallback(() => {
    setSubjects([]);
    setTasks([]);
    setSessions([]);
    setGoals([]);
  }, []);

  const load = useCallback(
    async (userId: string) => {
      setLoading(true);
      try {
        const [s, t, ss, g] = await Promise.all([
          adapter.listSubjects(userId),
          adapter.listTasks(userId),
          adapter.listSessions(userId),
          adapter.listGoals(userId),
        ]);
        setSubjects(s);
        setTasks(t.sort(byNewestCreated));
        setSessions(ss);
        setGoals(g);
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
    if (user) {
      void load(user.id);
    } else {
      reset();
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* ── Subjects ────────────────────────────────────────── */

  const addSubject = useCallback(
    async (data: Omit<Subject, "id">) => {
      try {
        const rec = await adapter.createSubject(user!.id, data);
        setSubjects((prev) => [...prev, rec]);
        push("Đã thêm môn học");
      } catch (e) {
        push(`Không thể thêm môn học: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const updateSubject = useCallback(
    async (id: string, patch: Partial<Subject>) => {
      try {
        await adapter.updateSubject(user!.id, id, patch);
        setSubjects((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
        push("Đã cập nhật môn học");
      } catch (e) {
        push(`Không thể cập nhật môn học: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  const deleteSubject = useCallback(
    async (id: string) => {
      try {
        await adapter.deleteSubject(user!.id, id);
        setSubjects((prev) => prev.filter((s) => s.id !== id));
        // Gỡ liên kết nhiệm vụ thuộc môn bị xóa (giữ lại nhiệm vụ)
        setTasks((prev) => prev.map((t) => (t.subjectId === id ? { ...t, subjectId: null } : t)));
        push("Đã xóa môn học");
      } catch (e) {
        push(`Không thể xóa môn học: ${e instanceof Error ? e.message : "lỗi"}`, "error");
        throw e;
      }
    },
    [adapter, user, push]
  );

  /* ── Tasks ───────────────────────────────────────────── */

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
        push("Đã cập nhật nhiệm vụ");
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

  /* ── Sessions ────────────────────────────────────────── */

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

  /* ── Goals ───────────────────────────────────────────── */

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

  const value = useMemo<DataCtx>(
    () => ({
      loading,
      storageMode: supabaseConfigured ? "supabase" : "local",
      subjects,
      tasks,
      sessions,
      goals,
      reload: async () => {
        if (user) await load(user.id);
      },
      addSubject,
      updateSubject,
      deleteSubject,
      addTask,
      updateTask,
      deleteTask,
      addSession,
      deleteSession,
      addGoal,
      updateGoal,
      deleteGoal,
    }),
    [loading, subjects, tasks, sessions, goals, user, load, addSubject, updateSubject, deleteSubject, addTask, updateTask, deleteTask, addSession, deleteSession, addGoal, updateGoal, deleteGoal]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useData phải dùng bên trong DataProvider");
  return ctx;
}
