"use client";

import { useMemo, useState } from "react";
import {
  Brain,
  CheckCircle2,
  Eye,
  Frown,
  Layers,
  Meh,
  Pencil,
  Plus,
  Search,
  Smile,
  Trash2,
} from "lucide-react";
import { Badge, Button, Card, EmptyState, LoadingBlock, Modal, ProgressBar, SelectField, TextField, TextArea } from "@/components/ui";
import { useData } from "@/lib/data";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { dueFlashcards } from "@/lib/stats";
import { nextFlashcardState } from "@/lib/sm2";
import { todayStr, formatDueLabel } from "@/lib/date";
import type { Flashcard } from "@/lib/types";

/* Nút đánh giá mức nhớ (SM-2 quality) */
const RATE_BUTTONS = [
  { q: 2, label: "Quên", icon: Frown, sub: "Học lại ngay", cls: "hover:border-red-400 hover:bg-red-500/10 hover:text-red-500" },
  { q: 3, label: "Khó", icon: Meh, sub: "Gắng nhớ được", cls: "hover:border-amber-400 hover:bg-amber-500/10 hover:text-amber-500" },
  { q: 4, label: "Tốt", icon: Smile, sub: "Nhớ vững", cls: "hover:border-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-500" },
  { q: 5, label: "Dễ", icon: CheckCircle2, sub: "Nhuệ nhuyễn", cls: "hover:border-sky-400 hover:bg-sky-500/10 hover:text-sky-500" },
];

/* ─── Modal tạo/sửa flashcard ──────────────────────────────── */
function CardModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Flashcard | null }) {
  const { courses, chapters, addFlashcard, updateFlashcard } = useData();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [courseId, setCourseId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const key = editing ? editing.id : "new";
  if (open && loadedKey !== key) {
    setLoadedKey(key);
    setQuestion(editing?.question ?? "");
    setAnswer(editing?.answer ?? "");
    setCourseId(editing?.courseId ?? "");
    setChapterId(editing?.chapterId ?? "");
    setError(null);
  }

  const chapterOptions = chapters.filter((c) => !courseId || c.courseId === courseId);

  async function submit() {
    if (!question.trim() || !answer.trim()) {
      setError("Cần có cả câu hỏi và đáp án.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateFlashcard(editing.id, {
          question: question.trim(),
          answer: answer.trim(),
          courseId: courseId || null,
          chapterId: chapterId || null,
        });
      } else {
        await addFlashcard({
          courseId: courseId || null,
          chapterId: chapterId || null,
          question: question.trim(),
          answer: answer.trim(),
          ease: 2.5,
          interval: 0,
          repetitions: 0,
          dueDate: todayStr(),
          createdAt: new Date().toISOString(),
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Sửa flashcard" : "Tạo flashcard mới"} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField id="fc-course" label="Môn học" value={courseId} onChange={(e) => { setCourseId(e.target.value); setChapterId(""); }}>
            <option value="">— Không môn —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </SelectField>
          <SelectField id="fc-chapter" label="Chương (tùy chọn)" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
            <option value="">— Không chương —</option>
            {chapterOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </SelectField>
        </div>
        <TextField id="fc-question" label="Câu hỏi (mặt trước)" placeholder="Ví dụ: Gradient descent là gì?" value={question} onChange={(e) => setQuestion(e.target.value)} error={error} required />
        <TextArea id="fc-answer" label="Đáp án (mặt sau)" placeholder="Trả lời ngắn gọn, súc tích để dễ nhớ..." value={answer} onChange={(e) => setAnswer(e.target.value)} required />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button loading={saving} onClick={() => void submit()}>{editing ? "Lưu thay đổi" : "Tạo thẻ"}</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Trang ôn tập ─────────────────────────────────────────── */
export default function RevisionPage() {
  const { loading, flashcards, reviews, courses, chapters, updateFlashcard, deleteFlashcard, addReview } = useData();
  const { push } = useToast();

  const [tab, setTab] = useState<"study" | "library">("study");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Flashcard | null>(null);
  const [courseFilter, setCourseFilter] = useState("");
  const [search, setSearch] = useState("");

  // Trạng thái phiên ôn
  const [queue, setQueue] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const today = todayStr();
  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const chapterMap = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);

  const dueCards = useMemo(() => dueFlashcards(flashcards, today), [flashcards, today]);

  const libraryRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return flashcards
      .filter((f) => (courseFilter ? f.courseId === courseFilter : true))
      .filter((f) => (q ? f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q) : true))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [flashcards, courseFilter, search]);

  const reviewsToday = useMemo(() => reviews.filter((r) => r.reviewedAt.slice(0, 10) === today).length, [reviews, today]);

  function startSession(forcedFuture = false) {
    const pool = forcedFuture ? [...flashcards] : dueCards;
    const picked = pool
      .filter((f) => (courseFilter ? f.courseId === courseFilter : true))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.repetitions - b.repetitions);
    if (picked.length === 0) {
      push("Không có thẻ nào trong bộ lọc đang chọn.", "info");
      return;
    }
    setQueue(picked.map((f) => f.id));
    setIdx(0);
    setFlipped(false);
    setDoneCount(0);
  }

  async function rate(q: number) {
    const current = flashcards.find((f) => f.id === queue[idx]);
    if (!current) return;
    try {
      const next = nextFlashcardState(current, q);
      await updateFlashcard(current.id, next);
      await addReview({
        flashcardId: current.id,
        courseId: current.courseId,
        rated: q,
        reviewedAt: new Date().toISOString(),
      });
    } catch {
      /* toast đã hiện */
    }
    setDoneCount((p) => p + 1);
    setIdx((p) => p + 1);
    setFlipped(false);
  }

  if (loading) {
    return <LoadingBlock label="Đang tải kho flashcard..." />;
  }

  const current = queue[idx] ? flashcards.find((f) => f.id === queue[idx]) ?? null : null;
  const sessionLength = queue.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Ôn tập thông minh</h1>
          <p className="mt-1 text-sm text-muted">Thuật toán SM-2 tự xếp lịch ôn dựa trên khả năng nhớ của bạn.</p>
        </div>
        <Button
          className="bg-gradient-to-r from-violet-600 to-indigo-600"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Tạo flashcard
        </Button>
      </div>

      {/* Bộ lọc + tab */}
      <Card className="card-lift animate-fade-up p-4" style={{ animationDelay: "80ms" }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1">
            <button
              onClick={() => setTab("study")}
              className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all", tab === "study" ? "bg-surface shadow-sm" : "text-muted")}
            >
              <Brain className="h-4 w-4" /> Ôn tập
              {dueCards.length > 0 && (
                <Badge className="ml-1 bg-violet-500/10 text-violet-600 dark:text-violet-300">{dueCards.length}</Badge>
              )}
            </button>
            <button
              onClick={() => setTab("library")}
              className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all", tab === "library" ? "bg-surface shadow-sm" : "text-muted")}
            >
              <Layers className="h-4 w-4" /> Kho thẻ
              <Badge className="ml-1 bg-surface-2 text-muted">{flashcards.length}</Badge>
            </button>
          </div>
          <SelectField id="rev-course" label="" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="w-auto min-w-44">
            <option value="">Tất cả môn học</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </SelectField>
          <span className="ml-auto text-xs text-muted">Đã ôn {reviewsToday} thẻ hôm nay</span>
        </div>
      </Card>

      {tab === "study" ? (
        queue.length === 0 || (!current && doneCount === 0) ? (
          /* Trước khi vào phiên */
          <Card className="card-lift animate-fade-up p-8" style={{ animationDelay: "140ms" }}>
            {dueCards.length === 0 && flashcards.length === 0 ? (
              <EmptyState
                icon={<Layers className="h-12 w-12" />}
                title="Chưa có flashcard nào"
                hint="Tạo thẻ thủ công hoặc nhờ AI tạo thẻ từ tài liệu (Trợ lý AI → Flashcard)."
              />
            ) : dueCards.length === 0 ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 animate-float">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <p className="font-semibold">Tuyệt! Không có thẻ nào đến hạn hôm nay</p>
                <p className="text-sm text-muted">SM-2 sẽ nhắc bạn ôn đúng thời điểm tối ưu nhất cho từng thẻ. Bạn vẫn có thể ôn sớm nếu muốn.</p>
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="secondary" onClick={() => startSession(true)}>
                    <Eye className="h-4 w-4" /> Ôn thẻ chưa đến hạn
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <Badge className="bg-violet-500/10 text-violet-600 dark:text-violet-300">{dueCards.length} thẻ đến hạn</Badge>
                <p className="text-lg font-semibold">Sẵn sàng vào phiên ôn?</p>
                <p className="text-sm text-muted">Câu hỏi trước, đáp án sau — đánh giá mức độ nhớ để SM-2 tính ngày ôn kế tiếp.</p>
                <Button className="mt-1 bg-gradient-to-r from-violet-600 to-indigo-600" onClick={() => startSession()}>
                  <Brain className="h-4 w-4" /> Bắt đầu ôn tập
                </Button>
              </div>
            )}
          </Card>
        ) : current ? (
          /* Phiên ôn đang chạy */
          <Card className="card-lift animate-fade-up overflow-hidden p-0" style={{ animationDelay: "140ms" }}>
            <div className="border-b border-border px-5 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Thẻ {idx + 1} / {sessionLength}</span>
                <span className="text-muted">Đã ôn: {doneCount} thẻ</span>
              </div>
              <ProgressBar percent={sessionLength ? ((idx) / sessionLength) * 100 : 0} color="bg-gradient-to-r from-violet-500 to-indigo-500" />
            </div>
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-6 p-8">
              <div className="w-full max-w-xl text-center">
                {(current.courseId || current.chapterId) && (
                  <div className="mb-4 flex items-center justify-center gap-1.5">
                    {current.courseId && (
                      <Badge className={cn("gap-1")}> 
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: courseMap.get(current.courseId)?.color ?? "#94a3b8" }} />
                        {courseMap.get(current.courseId)?.name ?? ""}
                      </Badge>
                    )}
                    {current.chapterId && chapterMap.get(current.chapterId) && (
                      <Badge className="bg-surface-2 text-muted">{chapterMap.get(current.chapterId)?.title}</Badge>
                    )}
                  </div>
                )}
                <p className="text-xl font-semibold">{current.question}</p>
                {flipped ? (
                  <div className="mt-6 animate-fade-up space-y-4">
                    <div className="rounded-xl border-2 border-indigo-500/30 bg-indigo-500/5 p-5">
                      <p className="whitespace-pre-wrap text-base">{current.answer}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {RATE_BUTTONS.map((b) => (
                        <button
                          key={b.q}
                          onClick={() => void rate(b.q)}
                          className={cn(
                            "flex flex-col items-center gap-1 rounded-xl border border-border bg-surface px-3 py-3 text-sm font-medium transition-all hover:-translate-y-0.5 hover:shadow-md",
                            b.cls
                          )}
                        >
                          <b.icon className="h-5 w-5" />
                          {b.label}
                          <span className="text-[10px] font-normal text-muted">{b.sub}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Button className="mt-6 bg-gradient-to-r from-violet-600 to-indigo-600" onClick={() => setFlipped(true)}>
                    <Eye className="h-4 w-4" /> Lật đáp án
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ) : (
          /* Kết thúc phiên */
          <Card className="card-lift animate-fade-up p-8" style={{ animationDelay: "140ms" }}>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-indigo-600/25">
                <Brain className="h-7 w-7" />
              </div>
              <p className="text-lg font-bold">Hoàn thành buổi ôn!</p>
              <p className="text-sm text-muted">Đã đánh giá {doneCount} thẻ. SM-2 đã cập nhật thời điểm ôn kế tiếp cho từng thẻ.</p>
              <Button variant="secondary" onClick={() => startSession()} disabled={dueCards.length + flashcards.length === 0}>
                Ôn tiếp đợt khác
              </Button>
            </div>
          </Card>
        )
      ) : (
        /* Kho thẻ */
        <Card className="card-lift animate-fade-up p-5" style={{ animationDelay: "140ms" }}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm trong câu hỏi / đáp án..." className="input-base w-full pl-9 sm:w-72" />
            </div>
            <span className="ml-auto text-xs text-muted">{libraryRows.length} thẻ</span>
          </div>
          {libraryRows.length === 0 ? (
            <EmptyState
              icon={<Layers className="h-10 w-10" />}
              title={flashcards.length === 0 ? "Kho thẻ còn trống" : "Không tìm thấy thẻ phù hợp"}
              hint={flashcards.length === 0 ? "Tạo thẻ đầu tiên của mình — hoặc để AI tạo từ tài liệu." : "Thử từ khóa khác hoặc bỏ bộ lọc."}
            />
          ) : (
            <ul className="space-y-2">
              {libraryRows.map((f, i) => {
                const isDue = f.dueDate <= today;
                const course = f.courseId ? courseMap.get(f.courseId) : null;
                const chapter = f.chapterId ? chapterMap.get(f.chapterId) : null;
                return (
                  <li
                    key={f.id}
                    className="row-lift animate-fade-up group flex items-center gap-3 rounded-lg border border-border bg-surface-2/40 px-3.5 py-3 hover:bg-surface-2"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.question}</p>
                      <p className="truncate text-xs text-muted">{f.answer}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {course && (
                          <Badge className="gap-1 bg-surface text-muted">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: course.color }} />
                            {course.name}
                          </Badge>
                        )}
                        {chapter && <Badge className="bg-surface-2 text-muted">{chapter.title}</Badge>}
                        <Badge className={cn(isDue ? "bg-violet-500/10 text-violet-600 dark:text-violet-300" : "bg-surface-2 text-muted")}>
                          {isDue ? "Đến hạn" : `Ôn: ${formatDueLabel(f.dueDate)}`}
                        </Badge>
                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">×{f.repetitions}</Badge>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setEditing(f);
                        setModalOpen(true);
                      }}
                      className="rounded-lg p-2 text-muted opacity-0 transition-opacity hover:bg-indigo-500/10 hover:text-indigo-500 group-hover:opacity-100"
                      aria-label="Sửa thẻ"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm("Xóa flashcard này? Lịch sử ôn liên quan cũng bị xóa.")) void deleteFlashcard(f.id);
                      }}
                      className="rounded-lg p-2 text-muted opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                      aria-label="Xóa thẻ"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <CardModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        editing={editing}
      />
    </div>
  );
}
