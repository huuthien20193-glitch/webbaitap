import type { Goal, StudySession, Subject } from "./types";
import type { Task } from "./types";
import { getSupabase } from "./supabase";

/**
 * Tầng lưu trữ thống nhất:
 * - supabaseAdapter: dùng khi đã cấu hình NEXT_PUBLIC_SUPABASE_URL/ANON_KEY.
 *   Dữ liệu được bảo vệ bởi RLS (mỗi user chỉ đọc/ghi dòng có user_id của mình).
 * - localAdapter: fallback lưu bền vững theo tài khoản cục bộ, dữ liệu không
 *   mất khi tải lại trang và tách biệt giữa các tài khoản trên cùng máy.
 */
export interface StorageAdapter {
  listSubjects(userId: string): Promise<Subject[]>;
  listTasks(userId: string): Promise<Task[]>;
  listSessions(userId: string): Promise<StudySession[]>;
  listGoals(userId: string): Promise<Goal[]>;

  createSubject(userId: string, data: Omit<Subject, "id">): Promise<Subject>;
  updateSubject(userId: string, id: string, patch: Partial<Subject>): Promise<void>;
  deleteSubject(userId: string, id: string): Promise<void>;

  createTask(userId: string, data: Omit<Task, "id">): Promise<Task>;
  updateTask(userId: string, id: string, patch: Partial<Task>): Promise<void>;
  deleteTask(userId: string, id: string): Promise<void>;

  createSession(userId: string, data: Omit<StudySession, "id">): Promise<StudySession>;
  deleteSession(userId: string, id: string): Promise<void>;

  createGoal(userId: string, data: Omit<Goal, "id">): Promise<Goal>;
  updateGoal(userId: string, id: string, patch: Partial<Goal>): Promise<void>;
  deleteGoal(userId: string, id: string): Promise<void>;
}

/* ─── Local adapter ─────────────────────────────────────────── */

const NS = "studyflow";

type Kind = "subjects" | "tasks" | "sessions" | "goals";

function keyOf(kind: Kind, userId: string) {
  return `${NS}:data:${kind}:${userId}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && typeof (v as { id?: unknown }).id === "string";
}

function readLocal<T>(kind: Kind, userId: string): T[] {
  try {
    const raw = localStorage.getItem(keyOf(kind, userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecord) as T[] : [];
  } catch {
    return [];
  }
}

function writeLocal<T>(kind: Kind, userId: string, rows: T[]) {
  try {
    localStorage.setItem(keyOf(kind, userId), JSON.stringify(rows));
  } catch {
    // Bộ nhớ đầy — dữ liệu vẫn dùng được trong phiên hiện tại
  }
}

export const localAdapter: StorageAdapter = {
  listSubjects: (userId) => Promise.resolve(readLocal<Subject>("subjects", userId)),
  listTasks: (userId) => Promise.resolve(readLocal<Task>("tasks", userId)),
  listSessions: (userId) => Promise.resolve(readLocal<StudySession>("sessions", userId)),
  listGoals: (userId) => Promise.resolve(readLocal<Goal>("goals", userId)),

  async createSubject(userId, data) {
    const kind = "subjects";
    const rows = readLocal<Subject>(kind, userId);
    const rec: Subject = { id: crypto.randomUUID(), ...data };
    rows.push(rec);
    writeLocal(kind, userId, rows);
    return rec;
  },
  async updateSubject(userId, id, patch) {
    const kind = "subjects";
    const rows = readLocal<Subject>(kind, userId);
    writeLocal(kind, userId, rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  },
  async deleteSubject(userId, id) {
    const kind = "subjects";
    const rows = readLocal<Subject>(kind, userId);
    writeLocal(kind, userId, rows.filter((r) => r.id !== id));
  },

  async createTask(userId, data) {
    const kind = "tasks";
    const rows = readLocal<Task>(kind, userId);
    const rec: Task = { id: crypto.randomUUID(), ...data };
    rows.push(rec);
    writeLocal(kind, userId, rows);
    return rec;
  },
  async updateTask(userId, id, patch) {
    const kind = "tasks";
    const rows = readLocal<Task>(kind, userId);
    writeLocal(kind, userId, rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  },
  async deleteTask(userId, id) {
    const kind = "tasks";
    const rows = readLocal<Task>(kind, userId);
    writeLocal(kind, userId, rows.filter((r) => r.id !== id));
  },

  async createSession(userId, data) {
    const kind = "sessions";
    const rows = readLocal<StudySession>(kind, userId);
    const rec: StudySession = { id: crypto.randomUUID(), ...data };
    rows.push(rec);
    writeLocal(kind, userId, rows);
    return rec;
  },
  async deleteSession(userId, id) {
    const kind = "sessions";
    const rows = readLocal<StudySession>(kind, userId);
    writeLocal(kind, userId, rows.filter((r) => r.id !== id));
  },

  async createGoal(userId, data) {
    const kind = "goals";
    const rows = readLocal<Goal>(kind, userId);
    const rec: Goal = { id: crypto.randomUUID(), ...data };
    rows.push(rec);
    writeLocal(kind, userId, rows);
    return rec;
  },
  async updateGoal(userId, id, patch) {
    const kind = "goals";
    const rows = readLocal<Goal>(kind, userId);
    writeLocal(kind, userId, rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  },
  async deleteGoal(userId, id) {
    const kind = "goals";
    const rows = readLocal<Goal>(kind, userId);
    writeLocal(kind, userId, rows.filter((r) => r.id !== id));
  },
};

/* ─── Supabase adapter ──────────────────────────────────────── */

type Row = Record<string, unknown>;

function mapSubject(r: Row): Subject {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    color: String(r.color ?? "#3b82f6"),
    goal: String(r.goal ?? ""),
    createdAt: String(r.created_at ?? ""),
  };
}

function mapTask(r: Row): Task {
  return {
    id: String(r.id),
    subjectId: r.subject_id == null ? null : String(r.subject_id),
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    startDate: String(r.start_date ?? ""),
    dueDate: String(r.due_date ?? ""),
    priority: (r.priority ?? "medium") as Task["priority"],
    status: (r.status ?? "todo") as Task["status"],
    completedAt: r.completed_at == null ? null : String(r.completed_at),
    createdAt: String(r.created_at ?? ""),
  };
}

function mapSession(r: Row): StudySession {
  return {
    id: String(r.id),
    subjectId: r.subject_id == null ? null : String(r.subject_id),
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

function err(e: unknown): Error {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e !== null && "message" in e
        ? String((e as Row).message)
        : String(e);
  return new Error(msg);
}

function table() {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase chưa được cấu hình");
  return sb;
}

export const supabaseAdapter: StorageAdapter = {
  listSubjects: async () => {
    const { data, error } = await table().from("subjects").select("*").order("created_at");
    if (error) throw err(error);
    return (data ?? []).map(mapSubject);
  },
  listTasks: async () => {
    const { data, error } = await table().from("tasks").select("*").order("created_at", { ascending: false });
    if (error) throw err(error);
    return (data ?? []).map(mapTask);
  },
  listSessions: async () => {
    const { data, error } = await table().from("sessions").select("*").order("started_at");
    if (error) throw err(error);
    return (data ?? []).map(mapSession);
  },
  listGoals: async () => {
    const { data, error } = await table().from("goals").select("*").order("created_at");
    if (error) throw err(error);
    return (data ?? []).map(mapGoal);
  },

  createSubject: async (_userId, data) => {
    const { data: d, error } = await table().from("subjects").insert(data).select().single();
    if (error) throw err(error);
    return mapSubject(d);
  },
  updateSubject: async (_userId, id, patch) => {
    const { error } = await table().from("subjects").update(patch).eq("id", id);
    if (error) throw err(error);
  },
  deleteSubject: async (_userId, id) => {
    const { error } = await table().from("subjects").delete().eq("id", id);
    if (error) throw err(error);
  },

  createTask: async (_userId, data) => {
    const { data: d, error } = await table().from("tasks").insert(data).select().single();
    if (error) throw err(error);
    return mapTask(d);
  },
  updateTask: async (_userId, id, patch) => {
    const { error } = await table().from("tasks").update(patch).eq("id", id);
    if (error) throw err(error);
  },
  deleteTask: async (_userId, id) => {
    const { error } = await table().from("tasks").delete().eq("id", id);
    if (error) throw err(error);
  },

  createSession: async (_userId, data) => {
    const { data: d, error } = await table().from("sessions").insert(data).select().single();
    if (error) throw err(error);
    return mapSession(d);
  },
  deleteSession: async (_userId, id) => {
    const { error } = await table().from("sessions").delete().eq("id", id);
    if (error) throw err(error);
  },

  createGoal: async (_userId, data) => {
    const { data: d, error } = await table().from("goals").insert(data).select().single();
    if (error) throw err(error);
    return mapGoal(d);
  },
  updateGoal: async (_userId, id, patch) => {
    const { error } = await table().from("goals").update(patch).eq("id", id);
    if (error) throw err(error);
  },
  deleteGoal: async (_userId, id) => {
    const { error } = await table().from("goals").delete().eq("id", id);
    if (error) throw err(error);
  },
};
