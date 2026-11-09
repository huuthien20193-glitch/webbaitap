"use client";

import { useMemo, useState, type FormEvent } from "react";
import { BookOpen, Check, Pencil, Plus, Target, Trash2, X } from "lucide-react";
import { Badge, Button, Card, EmptyState, LoadingBlock, Modal, ProgressBar, TextArea, TextField } from "@/components/ui";
import { useData } from "@/lib/data";
import { cn } from "@/lib/utils";
import { SUBJECT_COLORS, type Subject } from "@/lib/types";
import { subjectProgress } from "@/lib/stats";

interface FormState {
  name: string;
  color: string;
  goal: string;
}

const EMPTY: FormState = { name: "", color: SUBJECT_COLORS[0], goal: "" };

export default function SubjectsPage() {
  const { loading, subjects, tasks, sessions, addSubject, updateSubject, deleteSubject } = useData();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [saving, setSaving] = useState(false);

  const progressRows = useMemo(() => subjectProgress(subjects, tasks), [subjects, tasks]);
  const sessionMinutes = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      if (s.subjectId) map.set(s.subjectId, (map.get(s.subjectId) ?? 0) + s.durationSec / 60);
    }
    return map;
  }, [sessions]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setErrors({});
    setOpen(true);
  };

  const openEdit = (subject: Subject) => {
    setEditing(subject);
    setForm({ name: subject.name, color: subject.color, goal: subject.goal });
    setErrors({});
    setOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: { name?: string } = {};
    if (!form.name.trim()) nextErrors.name = "Vui lòng nhập tên môn học.";
    else if (form.name.trim().length > 60) nextErrors.name = "Tên môn học tối đa 60 ký tự.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const payload = { name: form.name.trim(), color: form.color, goal: form.goal.trim(), createdAt: new Date().toISOString() };
      if (editing) await updateSubject(editing.id, payload);
      else await addSubject(payload);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const removeSubject = async (subject: Subject) => {
    const ownCount = tasks.filter((t) => t.subjectId === subject.id).length;
    const message =
      ownCount > 0
        ? `Xóa môn "${subject.name}"? ${ownCount} nhiệm vụ thuộc môn này sẽ được giữ lại nhưng tách khỏi môn học.`
        : `Xóa môn "${subject.name}"?`;
    if (!window.confirm(message)) return;
    try {
      await deleteSubject(subject.id);
    } catch {
      /* đã có toast lỗi */
    }
  };

  if (loading) return <LoadingBlock />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Môn học của bạn</h2>
          <p className="text-sm text-muted">Quản lý môn học, màu đại diện và mục tiêu riêng cho từng môn.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Thêm môn học
        </Button>
      </div>

      {subjects.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-12 w-12" />}
          title="Chưa có môn học nào"
          hint="Thêm môn học đầu tiên để phân loại nhiệm vụ và theo dõi tiến độ theo từng môn."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {progressRows.map(({ subject, total, done, rate }, i) => (
            <Card key={subject.id} className="group card-lift animate-fade-up relative p-5 hover:border-blue-300/60 dark:hover:border-blue-500/30" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ backgroundColor: subject.color }}>
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold">{subject.name}</p>
                    <p className="text-xs text-muted">
                      {total} nhiệm vụ • {done} đã xong
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => openEdit(subject)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-blue-500" aria-label={`Sửa môn ${subject.name}`} title="Sửa">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => removeSubject(subject)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-red-500" aria-label={`Xóa môn ${subject.name}`} title="Xóa">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted">Tiến độ</span>
                  <span className="font-semibold" style={{ color: subject.color }}>
                    {rate}%
                  </span>
                </div>
                <ProgressBar percent={rate} />
                <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <Badge className="bg-surface-2">{Math.round(sessionMinutes.get(subject.id) ?? 0)} phút đã học</Badge>
                  <Badge className="bg-surface-2">
                    {total - done} còn lại
                  </Badge>
                </div>
              </div>

              {subject.goal && (
                <div className="mt-4 rounded-lg bg-surface-2/60 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <Target className="h-3.5 w-3.5" style={{ color: subject.color }} /> Mục tiêu môn học
                  </p>
                  <p className="mt-1 text-sm">{subject.goal}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Sửa môn học" : "Thêm môn học mới"}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <TextField
            id="subject-name"
            label="Tên môn học"
            placeholder="Ví dụ: Toán cao cấp, Tiếng Anh giao tiếp..."
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            error={errors.name}
            maxLength={60}
            required
          />
          <div>
            <span className="label-base">Màu đại diện</span>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, color }))}
                  className={cn("relative h-9 w-9 rounded-full transition-transform hover:scale-110", form.color === color && "ring-2 ring-offset-2 ring-offset-surface")}
                  style={{ backgroundColor: color, ...(form.color === color ? { boxShadow: `0 0 0 2px ${color}` } : null) }}
                  aria-label={`Chọn màu ${color}`}
                  aria-pressed={form.color === color}
                >
                  {form.color === color && <Check className="absolute inset-0 m-auto h-4 w-4 text-white" />}
                </button>
              ))}
            </div>
          </div>
          <TextArea
            id="subject-goal"
            label="Mục tiêu của môn học (tùy chọn)"
            placeholder="Ví dụ: Đạt điểm A, hoàn thành 100% bài tập trên lớp..."
            value={form.goal}
            onChange={(e) => setForm((p) => ({ ...p, goal: e.target.value }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" /> Hủy
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Lưu thay đổi" : "Thêm môn học"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
