"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Flame,
  GraduationCap,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { Badge, Button, Card, EmptyState, LoadingBlock, Modal, ProgressBar, SelectField, TextField, TextArea } from "@/components/ui";
import { DailyMinutesChart, SubjectTimePie, WeeklyCompareChart, CompletedTasksChart, type Slice, type WeekPoint } from "@/components/charts";
import { useData } from "@/lib/data";
import { cn } from "@/lib/utils";
import { courseProgress, dueFlashcards, minutesByCourse, seriesDailyCompleted, seriesDailyMinutes, studyStreak, taskStats, weekPerformance } from "@/lib/stats";
import { daysUntil, formatDayLabel, formatMinutes, parseDate, startOfWeek, toDateStr, todayStr } from "@/lib/date";
import { askAI } from "@/lib/ai";
import type { Exam, ExamResult } from "@/lib/types";

/* ─── Modal bài kiểm tra ───────────────────────────────────── */
function ExamModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Exam | null }) {
  const { courses, addExam, updateExam } = useData();
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [examDate, setExamDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const key = editing ? editing.id : "new";
  if (open && loadedKey !== key) {
    setLoadedKey(key);
    setTitle(editing?.title ?? "");
    setCourseId(editing?.courseId ?? "");
    setExamDate(editing?.examDate ?? todayStr());
    setNote(editing?.note ?? "");
    setError(null);
  }

  async function submit() {
    if (!title.trim()) {
      setError("Nhập tên bài kiểm tra.");
      return;
    }
    setSaving(true);
    try {
      if (editing) await updateExam(editing.id, { title: title.trim(), courseId: courseId || null, examDate, note: note.trim() });
      else
        await addExam({
          title: title.trim(),
          courseId: courseId || null,
          examDate,
          note: note.trim(),
          createdAt: new Date().toISOString(),
        });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Sửa bài kiểm tra" : "Thêm bài kiểm tra"}>
      <div className="space-y-4">
        <TextField id="exam-title" label="Tên bài kiểm tra" placeholder="Giữa kỳ Giải tích 1" value={title} onChange={(e) => setTitle(e.target.value)} error={error} required maxLength={120} />
        <SelectField id="exam-course" label="Môn học" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">— Không môn —</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <TextField id="exam-date" label="Ngày kiểm tra" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} required />
        <TextArea id="exam-note" label="Ghi chú (phạm vi ôn tập...)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            {editing ? "Lưu thay đổi" : "Thêm bài kiểm tra"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Modal kết quả ───────────────────────────────────────── */
function ResultModal({ open, onClose, exam }: { open: boolean; onClose: () => void; exam: Exam | null }) {
  const { addExamResult } = useData();
  const [score, setScore] = useState(70);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  if (open && exam && loadedKey !== exam.id) {
    setLoadedKey(exam.id);
    setScore(70);
    setNote("");
    setError(null);
  }

  async function submit() {
    if (!exam) return;
    const s = Math.min(100, Math.max(0, Math.round(Number(score) || 0)));
    setSaving(true);
    try {
      await addExamResult({
        examId: exam.id,
        courseId: exam.courseId,
        score: s,
        note: note.trim(),
        createdAt: new Date().toISOString(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Nhập kết quả — ${exam?.title ?? ""}`}>
      <div className="space-y-4">
        <div>
          <label htmlFor="score" className="label-base">
            Điểm số: <span className="font-bold text-indigo-600 dark:text-indigo-400">{score}/100</span>
          </label>
          <input id="score" type="range" min={0} max={100} step={1} value={score} onChange={(e) => setScore(Number(e.target.value))} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-indigo-600" />
        </div>
        <TextArea id="result-note" label="Ghi chú (điểm mạnh/yếu...)" value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <p className="error-text">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            Lưu kết quả
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Trang Analytics ─────────────────────────────────────── */
export default function AnalyticsPage() {
  const { loading, courses, chapters, tasks, sessions, exams, examResults, flashcards, deleteExam } = useData();

  const [examModal, setExamModal] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [resultFor, setResultFor] = useState<Exam | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const today = todayStr();
  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const stat = useMemo(() => taskStats(tasks), [tasks]);
  const streak = useMemo(() => studyStreak(sessions), [sessions]);
  const totalHours = useMemo(() => sessions.reduce((a, b) => a + b.durationSec, 0) / 3600, [sessions]);
  const avgScore = useMemo(() => (examResults.length === 0 ? null : Math.round(examResults.reduce((a, b) => a + b.score, 0) / examResults.length)), [examResults]);
  const due = useMemo(() => dueFlashcards(flashcards, today).length, [flashcards, today]);

  const weekly = useMemo(() => weekPerformance(sessions, tasks, 8), [sessions, tasks]);
  const weekPoints: WeekPoint[] = useMemo(
    () => weekly.map((w) => ({ label: `T${new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "numeric" }).format(parseDate(w.weekStartStr))}`, minutes: Math.round(w.minutes), completed: w.completed })),
    [weekly]
  );
  const timeSlices: Slice[] = useMemo(
    () => minutesByCourse(sessions, courses).map((m) => ({ name: m.name, color: m.color, minutes: m.minutes })),
    [sessions, courses]
  );
  const dailyLine = useMemo(() => seriesDailyMinutes(sessions, 14).map((d) => ({ label: d.label, minutes: d.minutes })), [sessions]);
  const completedLine = useMemo(() => seriesDailyCompleted(tasks, 14), [tasks]);

  const progressRows = useMemo(() => courseProgress(courses, tasks, chapters), [courses, tasks, chapters]);
  const weakChapters = useMemo(() => chapters.filter((c) => c.understanding <= 2), [chapters]);

  const upcomingExams = useMemo(
    () => [...exams].sort((a, b) => a.examDate.localeCompare(b.examDate)).filter((e) => e.examDate >= today),
    [exams, today]
  );
  const resultsByExam = useMemo(() => {
    const m = new Map<string, ExamResult[]>();
    for (const r of examResults) {
      const arr = m.get(r.examId) ?? [];
      arr.push(r);
      m.set(r.examId, arr);
    }
    return m;
  }, [examResults]);

  /* Báo cáo AI tuần */
  const weekStart = toDateStr(startOfWeek(new Date()));
  async function runReport() {
    setAiLoading(true);
    setAiError(null);
    const ctx = {
      week: `${weekStart} → ${today}`,
      stats: {
        totalHoursAcrossAll: Number(totalHours.toFixed(1)),
        weeklyMinutes: Math.round(weekly[weekly.length - 1]?.minutes ?? 0),
        prevWeekMinutes: Math.round(weekly[weekly.length - 2]?.minutes ?? 0),
        completionRate: stat.rate,
        streakDays: streak,
      },
      byCourse: progressRows.map((r) => ({ course: r.course.name, minutes: Math.round(minutesByCourse(sessions, courses).find((m) => m.id === r.course.id)?.minutes ?? 0), completion: r.rate, chapterScore: r.chapterScore })),
      examResults: examResults.slice(0, 10).map((r) => ({ exam: exams.find((x) => x.id === r.examId)?.title ?? "", course: courseMap.get(r.courseId ?? "")?.name ?? "", score: r.score })),
      weakChapters: weakChapters.map((c) => ({ course: courseMap.get(c.courseId)?.name ?? "", chapter: c.title })),
      flashcards: { total: flashcards.length, due: due },
      selectedContext: "weekly-report",
    };
    const res = await askAI("report", { context: ctx });
    setAiLoading(false);
    if (res.error) {
      setAiError(res.error);
      return;
    }
    setAiReport(res.text ?? "Không nhận được báo cáo, thử lại nhé.");
  }

  if (loading) {
    return <LoadingBlock label="Đang phân tích dữ liệu học tập..." />;
  }

  const kpis = [
    { label: "Tổng giờ học", value: totalHours >= 1 ? `${Math.round(totalHours)} giờ` : formatMinutes(totalHours * 60), icon: Clock, tone: "text-indigo-500 bg-indigo-500/10" },
    { label: "Số phiên học", value: sessions.length, icon: ClipboardCheck, tone: "text-violet-500 bg-violet-500/10" },
    { label: "Tỷ lệ hoàn thành", value: `${stat.rate}%`, icon: Target, tone: "text-emerald-500 bg-emerald-500/10" },
    { label: "Chuỗi ngày học", value: `${streak} ngày`, icon: Flame, tone: "text-orange-500 bg-orange-500/10" },
    { label: "Điểm TB kiểm tra", value: avgScore === null ? "—" : `${avgScore}/100`, icon: GraduationCap, tone: "text-sky-500 bg-sky-500/10" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Hồ sơ học tập</h1>
          <p className="mt-1 text-sm text-muted">Cái nhìn toàn diện về hiệu quả học — từ thời gian, nhiệm vụ tới kết quả kiểm tra.</p>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k, i) => (
          <Card key={k.label} className="card-lift animate-fade-up p-4" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted">{k.label}</p>
                <p className="mt-1.5 text-lg font-bold tracking-tight">{k.value}</p>
              </div>
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", k.tone)}>
                <k.icon className="h-4 w-4" />
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Biểu đồ chính */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="card-lift animate-fade-up p-5 lg:col-span-2" style={{ animationDelay: "120ms" }}>
          <h3 className="flex items-center gap-2 font-semibold">
            <BarChart3 className="h-4 w-4 text-indigo-500" /> Học tập theo tuần (8 tuần)
          </h3>
          <WeeklyCompareChart data={weekPoints} />
        </Card>
        <Card className="card-lift animate-fade-up p-5" style={{ animationDelay: "180ms" }}>
          <h3 className="mb-2 flex items-center gap-2 font-semibold">
            <Layers className="h-4 w-4 text-violet-500" /> Thời gian theo môn
          </h3>
          <SubjectTimePie data={timeSlices} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="card-lift animate-fade-up p-5" style={{ animationDelay: "220ms" }}>
          <h3 className="mb-2 flex items-center gap-2 font-semibold">Lượt học 14 ngày</h3>
          <DailyMinutesChart data={dailyLine} />
        </Card>
        <Card className="card-lift animate-fade-up p-5" style={{ animationDelay: "260ms" }}>
          <h3 className="mb-2 flex items-center gap-2 font-semibold">Nhiệm vụ hoàn thành 14 ngày</h3>
          <CompletedTasksChart data={completedLine} />
        </Card>
      </div>

      {/* Tiến độ môn & nội dung yếu */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="card-lift animate-fade-up p-5" style={{ animationDelay: "300ms" }}>
          <h3 className="mb-4 flex items-center gap-2 font-semibold">
            <Target className="h-4 w-4 text-indigo-500" /> Tiến độ từng môn học
          </h3>
          {progressRows.length === 0 ? (
            <EmptyState icon={<GraduationCap className="h-10 w-10" />} title="Chưa có môn học" hint="Thêm môn học để thấy tiến độ tại đây." />
          ) : (
            <ul className="space-y-3.5">
              {progressRows.map((r) => (
                <li key={r.course.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.course.color }} />
                      <span className="truncate font-medium">{r.course.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {r.done}/{r.total} nhiệm vụ {r.chapterScore !== null && ` · hiểu ${r.chapterScore}%`}
                    </span>
                  </div>
                  <ProgressBar percent={r.rate} color="bg-gradient-to-r from-indigo-500 to-violet-500" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="card-lift animate-fade-up p-5" style={{ animationDelay: "340ms" }}>
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <Flame className="h-4 w-4 text-amber-500" /> Nội dung đang yếu
          </h3>
          {weakChapters.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-10 w-10" />} title="Mọi chương đều khá trở lên" hint="Chia mức hiểu bài 1–5 trong trang Môn học để biết điểm yếu." />
          ) : (
            <ul className="space-y-2">
              {weakChapters.slice(0, 8).map((c) => {
                const course = courseMap.get(c.courseId);
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-amber-300/50 bg-amber-500/5 px-3 py-2 text-sm dark:border-amber-500/25">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.title}</span>
                      {course && <span className="truncate text-xs text-muted">{course.name}</span>}
                    </span>
                    <Badge className="shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-300">hiểu {c.understanding}/5</Badge>
                  </li>
                );
              })}
            </ul>
          )}
          {due > 0 && (
            <p className="mt-4 rounded-lg bg-violet-500/10 px-3 py-2 text-xs text-violet-700 dark:text-violet-300">
              Có {due} flashcard đến hạn ôn hôm nay.
            </p>
          )}
        </Card>
      </div>

      {/* Bài kiểm tra */}
      <Card className="card-lift animate-fade-up p-5" style={{ animationDelay: "380ms" }}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-semibold">
            <GraduationCap className="h-4 w-4 text-indigo-500" /> Bài kiểm tra &amp; kết quả
          </h3>
          <Button
            className="text-xs"
            variant="secondary"
            onClick={() => {
              setEditingExam(null);
              setExamModal(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Thêm bài kiểm tra
          </Button>
        </div>

        {/* Sắp tới */}
        {upcomingExams.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {upcomingExams.slice(0, 4).map((e) => {
              const d = daysUntil(e.examDate, today);
              return (
                <Badge key={e.id} className="gap-1.5 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                  {e.title} · {d === 0 ? "hôm nay" : `sau ${d} ngày`}
                </Badge>
              );
            })}
          </div>
        )}

        {exams.length === 0 ? (
          <EmptyState icon={<GraduationCap className="h-10 w-10" />} title="Chưa ghi nhận bài kiểm tra nào" hint="Thêm để theo dõi kết quả và nhận phân tích điểm yếu." />
        ) : (
          <ul className="space-y-2.5">
            {exams
              .slice()
              .sort((a, b) => b.examDate.localeCompare(a.examDate))
              .map((exam, i) => {
                const results = resultsByExam.get(exam.id) ?? [];
                const last = results[0];
                const course = exam.courseId ? courseMap.get(exam.courseId) : null;
                return (
                  <li key={exam.id} className="row-lift animate-fade-up rounded-lg border border-border bg-surface-2/40 px-3.5 py-3" style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <span className={cn("h-2 w-2 rounded-full", exam.examDate >= today ? "bg-indigo-500" : "bg-slate-400")} />
                          {exam.title}
                          {course && <span className="text-xs text-muted">({course.name})</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">{formatDayLabel(parseDate(exam.examDate))}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {last && (
                          <Badge className={cn(last.score >= 80 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : last.score >= 50 ? "bg-amber-500/10 text-amber-600 dark:text-amber-300" : "bg-red-500/10 text-red-600 dark:text-red-300")}>
                            {last.score}/100
                          </Badge>
                        )}
                        <button onClick={() => setResultFor(exam)} className="rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300">
                          Nhập kết quả
                        </button>
                        <button
                          onClick={() => {
                            setEditingExam(exam);
                            setExamModal(true);
                          }}
                          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-indigo-500/10 hover:text-indigo-500"
                          aria-label="Sửa"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Xóa bài kiểm tra "${exam.title}"?`)) void deleteExam(exam.id);
                          }}
                          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                          aria-label="Xóa"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {last && (
                      <div className="mt-2">
                        <ProgressBar percent={last.score} color={last.score >= 80 ? "bg-emerald-500" : last.score >= 50 ? "bg-amber-500" : "bg-red-500"} />
                        {last.note && <p className="mt-1.5 text-xs text-muted">{last.note}</p>}
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </Card>

      {/* Báo cáo AI hàng tuần */}
      <Card className="card-lift animate-fade-up p-5" style={{ animationDelay: "420ms" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-semibold">
            <Bot className="h-4 w-4 text-violet-500" /> Báo cáo học tập tuần này (AI)
          </h3>
          <Button variant="secondary" className="text-xs" onClick={() => void runReport()}>
            <Bot className="h-3.5 w-3.5 text-violet-500" /> Tạo báo cáo
          </Button>
        </div>
        {aiLoading ? (
          <div className="flex items-center justify-center gap-3 py-10 text-muted">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
            <span className="text-sm">AI đang phân tích dữ liệu tuần của bạn…</span>
          </div>
        ) : aiError ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-500/10 px-3 py-3 text-sm text-red-600 dark:border-red-500/30 dark:text-red-300">{aiError}</div>
        ) : aiReport ? (
          <div className="whitespace-pre-wrap rounded-lg border border-violet-300/40 bg-violet-500/5 p-4 text-sm leading-relaxed dark:border-violet-500/25">{aiReport}</div>
        ) : (
          <p className="mt-3 text-xs text-muted">
            AI sẽ tổng hợp: thời gian học, tỷ lệ hoàn thành, điểm kiểm tra, flashcard còn thiếu — rồi cho 3 hành động cụ thể cho tuần tới.
          </p>
        )}
      </Card>

      <ExamModal
        open={examModal}
        onClose={() => {
          setExamModal(false);
          setEditingExam(null);
        }}
        editing={editingExam}
      />
      <ResultModal
        open={resultFor !== null}
        onClose={() => setResultFor(null)}
        exam={resultFor}
      />
    </div>
  );
}
