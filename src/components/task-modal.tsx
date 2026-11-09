"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Modal, Button, TextField, TextArea, SelectField } from "@/components/ui";
import { useData } from "@/lib/data";
import { todayStr } from "@/lib/date";
import type { Priority, Task, TaskStatus } from "@/lib/types";

export interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  editing?: Task | null;
  defaultSubjectId?: string | null;
  /** Ngày gợi ý sẵn khi tạo mới (từ Calendar) */
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

interface FormState {
  title: string;
  description: string;
  subjectId: string;
  startDate: string;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
}

function emptyForm(subjectId = ""): FormState {
  const today = todayStr();
  return { title: "", description: "", subjectId, startDate: today, dueDate: today, priority: "medium", status: "todo" };
}

export function TaskModal({ open, onClose, editing, defaultSubjectId, defaultDate }: TaskModalProps) {
  const { subjects, addTask, updateTask } = useData();
  const [form, setForm] = useState<FormState>(emptyForm(defaultSubjectId ?? ""));
  const [errors, setErrors] = useState<{ title?: string; dueDate?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        title: editing.title,
        description: editing.description,
        subjectId: editing.subjectId ?? "",
        startDate: editing.startDate,
        dueDate: editing.dueDate,
        priority: editing.priority,
        status: editing.status,
      });
    } else {
      const base = emptyForm(defaultSubjectId ?? (subjects[0]?.id ?? ""));
      if (defaultDate) base.dueDate = defaultDate;
      setForm(base);
    }
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, defaultDate, defaultSubjectId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((p) => ({ ...p, [key]: value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: { title?: string; dueDate?: string } = {};
    if (!form.title.trim()) nextErrors.title = "Vui lòng nhập tên nhiệm vụ.";
    else if (form.title.trim().length > 200) nextErrors.title = "Tên nhiệm vụ tối đa 200 ký tự.";
    if (form.startDate > form.dueDate) nextErrors.dueDate = "Deadline không thể sớm hơn ngày bắt đầu.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const payload: Omit<Task, "id"> = {
        subjectId: form.subjectId || null,
        title: form.title.trim(),
        description: form.description.trim(),
        startDate: form.startDate,
        dueDate: form.dueDate,
        priority: form.priority,
        status: form.status,
        completedAt: null,
        createdAt: new Date().toISOString(),
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
    <Modal open={open} onClose={onClose} title={editing ? "Sửa nhiệm vụ" : "Thêm nhiệm vụ mới"}>
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
        <TextArea
          id="task-desc"
          label="Mô tả (tùy chọn)"
          placeholder="Ghi chú chi tiết về nhiệm vụ..."
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            id="task-subject"
            label="Môn học"
            value={form.subjectId}
            onChange={(e) => set("subjectId", e.target.value)}
          >
            <option value="">— Không môn —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
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
          <TextField
            id="task-start"
            label="Ngày bắt đầu"
            type="date"
            value={form.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            required
          />
          <TextField
            id="task-due"
            label="Deadline"
            type="date"
            value={form.dueDate}
            onChange={(e) => set("dueDate", e.target.value)}
            error={errors.dueDate}
            required
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
