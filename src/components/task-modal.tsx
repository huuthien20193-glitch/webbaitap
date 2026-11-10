"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Modal, Button, TextField, TextArea, SelectField } from "@/components/ui";
import { useData } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { DEFAULT_TASK_FIELDS, type Priority, type Task, type TaskStatus } from "@/lib/types";

export interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  editing?: Task | null;
  /** Môn học gợi ý sẵn khi tạo mới */
  defaultCourseId?: string | null;
  /** Ngày gợi ý sẵn khi tạo mới (từ Lịch học) */
  defaultDate?: string | null;
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Thấp" },
  { value: "medium", label: "Trung bình" },
  { value: "high", label: "Cao" },
];

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "Chưa bắt đầu" },
  { value: "in_progress", label: "Đang thực hiện" },
  { value: "done", label: "Hoàn thành" },
];

const DIFFICULTY_LABELS = ["Rất dễ", "Dễ", "Vừa phải", "Khó", "Rất khó"];

interface FormState {
  title: string;
  description: string;
  courseId: string;
  startDate: string;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
  estMinutes: number;
  difficulty: number;
  importance: number;
  progress: number;
}

function emptyForm(courseId = ""): FormState {
  const today = todayStr();
  return {
    title: "",
    description: "",
    courseId,
    startDate: today,
    dueDate: today,
    priority: "medium",
    status: "todo",
    estMinutes: DEFAULT_TASK_FIELDS.estMinutes,
    difficulty: DEFAULT_TASK_FIELDS.difficulty,
    importance: DEFAULT_TASK_FIELDS.importance,
    progress: 0,
  };
}

export function TaskModal({ open, onClose, editing, defaultCourseId, defaultDate }: TaskModalProps) {
  const { courses, addTask, updateTask } = useData();
  const [form, setForm] = useState<FormState>(emptyForm(defaultCourseId ?? ""));
  const [errors, setErrors] = useState<{ title?: string; dueDate?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        title: editing.title,
        description: editing.description,
        courseId: editing.courseId ?? "",
        startDate: editing.startDate,
        dueDate: editing.dueDate,
        priority: editing.priority,
        status: editing.status,
        estMinutes: editing.estMinutes || DEFAULT_TASK_FIELDS.estMinutes,
        difficulty: editing.difficulty || DEFAULT_TASK_FIELDS.difficulty,
        importance: editing.importance || DEFAULT_TASK_FIELDS.importance,
        progress: editing.progress ?? 0,
      });
    } else {
      const base = emptyForm(defaultCourseId ?? (courses[0]?.id ?? ""));
      if (defaultDate) base.dueDate = defaultDate;
      setForm(base);
    }
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, defaultDate, defaultCourseId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((p) => ({ ...p, [key]: value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: { title?: string; dueDate?: string } = {};
    if (!form.title.trim()) nextErrors.title = "Vui lòng nhập tên nhiệm vụ.";
    else if (form.title.trim().length > 200) nextErrors.title = "Tên nhiệm vụ tối đa 200 ký tự.";
    if (form.startDate > form.dueDate) nextErrors.dueDate = "Deadline không thể sớm hơn ngày bắt đầu.";
    const estForm = Math.min(600, Math.max(5, Math.round(Number(form.estMinutes) || DEFAULT_TASK_FIELDS.estMinutes)));
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const payload: Omit<Task, "id"> = {
        courseId: form.courseId || null,
        title: form.title.trim(),
        description: form.description.trim(),
        startDate: form.startDate,
        dueDate: form.dueDate,
        priority: form.priority,
        status: form.status,
        estMinutes: estForm,
        difficulty: Math.min(5, Math.max(1, Math.round(Number(form.difficulty) || 3))),
        importance: Math.min(5, Math.max(1, Math.round(Number(form.importance) || 3))),
        progress: Math.min(100, Math.max(0, Math.round(Number(form.progress) || 0))),
        completedAt: null,
        createdAt: editing ? editing.createdAt : new Date().toISOString(),
      };
      if (editing) {
        await updateTask(editing.id, {
          ...payload,
          completedAt: form.status === "done" ? editing.completedAt ?? new Date().toISOString() : null,
        });
      } else {
        await addTask({
          ...payload,
          completedAt: form.status === "done" ? new Date().toISOString() : null,
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Sửa nhiệm vụ" : "Thêm nhiệm vụ mới"} wide>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField
          id="task-title"
          label="Tên nhiệm vụ"
          placeholder="Ví dụ: Hoàn thành bài tập Toán chương 4"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          error={errors.title}
          maxLength={200}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <SelectField id="task-course" label="Môn học" value={form.courseId} onChange={(e) => set("courseId", e.target.value)}>
            <option value="">— Không môn —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.code ? ` (${c.code})` : ""}
              </option>
            ))}
          </SelectField>
          <SelectField id="task-priority" label="Mức độ ưu tiên" value={form.priority} onChange={(e) => set("priority", e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <TextField id="task-start" label="Ngày bắt đầu" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} required />
          <TextField id="task-due" label="Deadline" type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} error={errors.dueDate} required />
        </div>

        {/* Thông số phục vụ thuật toán ưu tiên */}
        <div className="grid grid-cols-3 gap-4">
          <TextField
            id="task-est"
            label="Thời lượng (phút)"
            type="number"
            min={5}
            max={600}
            step={5}
            value={form.estMinutes}
            onChange={(e) => set("estMinutes", Number(e.target.value))}
            required
          />
          <SelectField id="task-difficulty" label="Độ khó" value={form.difficulty} onChange={(e) => set("difficulty", Number(e.target.value))}>
            {DIFFICULTY_LABELS.map((d, i) => (
              <option key={i} value={i + 1}>
                {i + 1} — {d}
              </option>
            ))}
          </SelectField>
          <SelectField id="task-importance" label="Quan trọng" value={form.importance} onChange={(e) => set("importance", Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}/5
              </option>
            ))}
          </SelectField>
        </div>

        <div>
          <label htmlFor="task-progress" className="label-base">
            Tiến độ: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{form.progress}%</span>
          </label>
          <input
            id="task-progress"
            type="range"
            min={0}
            max={100}
            step={10}
            value={form.progress}
            onChange={(e) => set("progress", Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-indigo-600"
          />
        </div>

        <SelectField id="task-status" label="Trạng thái" value={form.status} onChange={(e) => set("status", e.target.value as TaskStatus)}>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </SelectField>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? "Lưu thay đổi" : "Thêm nhiệm vụ"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Export mặc định cho các trang import ngắn gọn (planner, dashboard),
 * cùng export đặt tên cho tasks/calendar.
 */
export default function TaskModalRoot(props: TaskModalProps) {
  return <TaskModal {...props} />;
}
