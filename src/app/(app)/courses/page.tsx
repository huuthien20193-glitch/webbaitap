"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BookPlus,
  CheckCircle2,
  GraduationCap,
  ListPlus,
  Pencil,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import { Badge, Button, Card, EmptyState, LoadingBlock, Modal, ProgressBar, TextField, TextArea } from "@/components/ui";
import { useData } from "@/lib/data";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { COURSE_COLORS, UNDERSTANDING_LABELS, type Chapter, type Course } from "@/lib/types";
import { taskStats } from "@/lib/stats";

/* ─── Chọn mức độ hiểu 1–5 ─────────────────────────────────── */
function UnderstandingPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1" title={UNDERSTANDING_LABELS[value] ?? ""}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          aria-label={`Mức hiểu ${n}: ${UNDERSTANDING_LABELS[n] ?? n}`}
          title={`${n} — ${UNDERSTANDING_LABELS[n] ?? ""}`}
          className={cn(
            "h-4 w-4 rounded-full border-2 transition-all hover:scale-125",
            n <= value ? "border-indigo-500 bg-indigo-500" : "border-border bg-surface-2"
          )}
        />
      ))}
    </div>
  );
}

/* ─── Modal môn học ───────────────────────────────────────── */
interface CourseForm {
  name: string;
  code: string;
  instructor: string;
  credits: number;
  description: string;
  goal: string;
  color: string;
}

const EMPTY_FORM: CourseForm = { name: "", code: "", instructor: "", credits: 3, description: "", goal: "", color: COURSE_COLORS[0] };

function CourseModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Course | null }) {
  const { addCourse, updateCourse } = useData();
  const [form, setForm] = useState<CourseForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  if (open && loadedId !== (editing?.id ?? "new")) {
    setLoadedId(editing?.id ?? "new");
    setForm(
      editing
        ? {
            name: editing.name,
            code: editing.code,
            instructor: editing.instructor,
            credits: editing.credits,
            description: editing.description,
            goal: editing.goal,
            color: editing.color,
          }
        : EMPTY_FORM
    );
    setError(null);
  }

  const set = <K extends keyof CourseForm>(k: K, v: CourseForm[K]) => setForm((p) => ({ ...p, [k]: v }));

  async function submit() {
    if (!form.name.trim()) {
      setError("Vui lòng nhập tên môn học.");
      return;
    }
    setSaving(true);
    try {
      const credits = Math.min(30, Math.max(0, Math.round(Number(form.credits) || 0)));
      if (editing) {
        await updateCourse(editing.id, { ...form, name: form.name.trim(), credits });
      } else {
        await addCourse({ ...form, name: form.name.trim(), credits, createdAt: new Date().toISOString() });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Sửa môn học" : "Thêm môn học mới"} wide>
      <div className="space-y-4">
        <TextField
          id="course-name"
          label="Tên môn học"
          placeholder="Ví dụ: Giải tích 1"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          maxLength={80}
          error={error}
          required
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField id="course-code" label="Mã môn" placeholder="MA101" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} maxLength={20} />
          <TextField id="course-instructor" label="Giảng viên" placeholder="Ngọc Anh" value={form.instructor} onChange={(e) => set("instructor", e.target.value)} maxLength={60} />
          <TextField id="course-credits" label="Số tín chỉ" type="number" min={0} max={30} value={form.credits} onChange={(e) => set("credits", Number(e.target.value))} />
        </div>
        <TextArea id="course-desc" label="Mô tả" placeholder="Mục tiêu môn học, nội dung chính..." value={form.description} onChange={(e) => set("description", e.target.value)} />
        <div>
          <span className="label-base">Màu nhận diện</span>
          <div className="flex flex-wrap gap-2">
            {COURSE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => set("color", c)}
                aria-label={`Chọn màu ${c}`}
                className={cn("h-7 w-7 rounded-full transition-transform hover:scale-110", form.color === c && "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-surface")}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            {editing ? "Lưu thay đổi" : "Tạo môn học"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Modal chương học (thêm & sửa) ───────────────────────── */
function ChapterModal({ open, onClose, courseId, editing }: { open: boolean; onClose: () => void; courseId: string; editing: Chapter | null }) {
  const { addChapter, updateChapter, chapters } = useData();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [understanding, setUnderstanding] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const key = editing ? editing.id : courseId;
  if (open && loadedKey !== key) {
    setLoadedKey(key);
    setTitle(editing?.title ?? "");
    setContent(editing?.content ?? "");
    setUnderstanding(editing?.understanding ?? 3);
    setError(null);
  }

  async function submit() {
    if (!title.trim()) {
      setError("Nhập tên chương.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateChapter(editing.id, { title: title.trim(), content: content.trim(), understanding });
      } else {
        const pos = chapters.filter((c) => c.courseId === courseId).length;
        await addChapter({
          courseId,
          title: title.trim(),
          content: content.trim(),
          understanding,
          position: pos,
          createdAt: new Date().toISOString(),
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Sửa chương" : "Thêm chương mới"}>
      <div className="space-y-4">
        <TextField id="chapter-title" label="Tên chương" placeholder="Chương 1: Giới hạn và liên tục" value={title} onChange={(e) => setTitle(e.target.value)} error={error} required />
        <TextArea id="chapter-content" label="Nội dung / ghi chú" placeholder="Ý chính, công thức, điểm cần ôn tập..." value={content} onChange={(e) => setContent(e.target.value)} />
        <div>
          <span className="label-base">Mức độ hiểu bài</span>
          <div className="flex items-center gap-3">
            <UnderstandingPicker value={understanding} onChange={setUnderstanding} />
            <span className="text-xs text-muted">{UNDERSTANDING_LABELS[understanding]}</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            {editing ? "Lưu thay đổi" : "Tạo chương"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Trang chính ─────────────────────────────────────────── */
export default function CoursesPage() {
  const { loading, courses, chapters, tasks, addChapter, updateChapter, deleteChapter, deleteCourse } = useData();
  const { push } = useToast();

  const [courseModal, setCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [chapterModal, setChapterModal] = useState(false);
  const [chapterCourse, setChapterCourse] = useState("");
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newChapterTitle, setNewChapterTitle] = useState("");

  const progressRows = useMemo(() => {
    return courses.map((course) => {
      const chs = chapters.filter((c) => c.courseId === course.id);
      const own = tasks.filter((t) => t.courseId === course.id);
      const stat = taskStats(own);
      const chapterScore = chs.length === 0 ? null : Math.round((chs.reduce((a, b) => a + b.understanding, 0) / (chs.length * 5)) * 100);
      return { course, chs, stat, chapterScore };
    });
  }, [courses, chapters, tasks]);

  async function createChapter(courseId: string) {
    const title = newChapterTitle.trim();
    if (!title) return;
    const pos = chapters.filter((c) => c.courseId === courseId).length;
    await addChapter({ courseId, title, content: "", understanding: 1, position: pos, createdAt: new Date().toISOString() });
    setNewChapterTitle("");
    push("Đã thêm chương học", "success");
  }

  if (loading) {
    return <LoadingBlock label="Đang tải môn học..." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Quản lý môn học</h1>
          <p className="mt-1 text-sm text-muted">Môn học, giảng viên, tín chỉ, chương học và mức độ hiểu bài của bạn.</p>
        </div>
        <Button
          onClick={() => {
            setEditingCourse(null);
            setCourseModal(true);
          }}
        >
          <Plus className="h-4 w-4" /> Thêm môn học
        </Button>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-12 w-12" />}
          title="Chưa có môn học nào"
          hint="Thêm môn học đầu tiên để bắt đầu quản lý chương, flashcard và nhiệm vụ theo môn."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {progressRows.map(({ course, chs, stat, chapterScore }, i) => {
            const isOpen = expanded === course.id;
            return (
              <Card key={course.id} className="card-lift animate-fade-up relative overflow-hidden p-5" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: course.color }} />
                <div className="flex items-start justify-between gap-3 pt-1.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold">{course.name}</h3>
                      {course.code && <Badge className="bg-indigo-500/10 font-mono text-indigo-600 dark:text-indigo-300">{course.code}</Badge>}
                      {course.credits > 0 && <Badge className="bg-surface-2 text-muted">{course.credits} tín chỉ</Badge>}
                    </div>
                    {course.instructor && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                        <User className="h-3 w-3" /> {course.instructor}
                      </p>
                    )}
                    {course.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{course.description}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => {
                        setEditingCourse(course);
                        setCourseModal(true);
                      }}
                      className="rounded-lg p-2 text-muted transition-colors hover:bg-indigo-500/10 hover:text-indigo-500"
                      aria-label="Sửa môn học"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Xóa môn "${course.name}"? Toàn bộ chương học & flashcard của môn này cũng bị xóa.`)) {
                          void deleteCourse(course.id);
                        }
                      }}
                      className="rounded-lg p-2 text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                      aria-label="Xóa môn học"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Tiến độ */}
                <div className="mt-4 space-y-2.5">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-muted">Hiểu bài ({chs.length} chương)</span>
                      <span className="font-semibold">{chapterScore === null ? "—" : `${chapterScore}%`}</span>
                    </div>
                    <ProgressBar percent={chapterScore ?? 0} color="bg-gradient-to-r from-indigo-500 to-violet-500" />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-muted">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Nhiệm vụ ({stat.done}/{stat.total})
                      </span>
                      <span className="font-semibold">{stat.rate}%</span>
                    </div>
                    <ProgressBar percent={stat.rate} color="bg-emerald-500" />
                  </div>
                </div>

                {/* Quản lý chương */}
                <button
                  onClick={() => setExpanded(isOpen ? null : course.id)}
                  className="mt-4 flex w-full items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-300"
                >
                  <span className="flex items-center gap-2">
                    <ListPlus className="h-4 w-4" /> Chương học ({chs.length})
                  </span>
                  <span>{isOpen ? "–" : "+"}</span>
                </button>

                {isOpen && (
                  <div className="mt-3 animate-fade-up space-y-2">
                    {chs.map((ch) => (
                      <div key={ch.id} className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{ch.title}</p>
                          {ch.content && <p className="truncate text-xs text-muted">{ch.content}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <UnderstandingPicker value={ch.understanding} onChange={(v) => void updateChapter(ch.id, { understanding: v })} />
                          <button
                            onClick={() => {
                              setChapterCourse(course.id);
                              setEditingChapter(ch);
                              setChapterModal(true);
                            }}
                            className="rounded-md p-1.5 text-muted opacity-0 transition-opacity hover:bg-indigo-500/10 hover:text-indigo-500 group-hover:opacity-100"
                            aria-label="Sửa chương"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => void deleteChapter(ch.id)}
                            className="rounded-md p-1.5 text-muted opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                            aria-label="Xóa chương"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void createChapter(course.id);
                      }}
                    >
                      <input
                        value={newChapterTitle}
                        onChange={(e) => setNewChapterTitle(e.target.value)}
                        placeholder="Thêm chương mới: Chương 1 — ..."
                        className="input-base flex-1"
                        maxLength={120}
                      />
                      <Button type="submit" disabled={!newChapterTitle.trim()} className="shrink-0">
                        <Plus className="h-4 w-4" /> Thêm
                      </Button>
                    </form>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        variant="secondary"
                        className="text-xs"
                        onClick={() => {
                          setChapterCourse(course.id);
                          setEditingChapter(null);
                          setChapterModal(true);
                        }}
                      >
                        <BookPlus className="h-3.5 w-3.5" /> Chương chi tiết
                      </Button>
                      <Link
                        href={`/assistant?create=flashcards&course=${course.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-600 transition-colors hover:bg-violet-500/20 dark:text-violet-300"
                      >
                        <BookPlus className="h-3.5 w-3.5" /> Tạo flashcard từ môn này
                      </Link>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <CourseModal open={courseModal} onClose={() => setCourseModal(false)} editing={editingCourse} />
      <ChapterModal
        open={chapterModal}
        onClose={() => {
          setChapterModal(false);
          setEditingChapter(null);
        }}
        courseId={chapterCourse}
        editing={editingChapter}
      />
    </div>
  );
}
