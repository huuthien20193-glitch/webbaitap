"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlarmClock,
  Bot,
  CalendarDays,
  CheckCircle2,
  Flame,
  GraduationCap,
  Layers,
  LayoutDashboard,
  ListTodo,
  Loader2,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
} from "lucide-react";
import { Badge, Button, Card, EmptyState, LoadingBlock, ProgressBar } from "@/components/ui";
import { DailyMinutesChart } from "@/components/charts";
import { useData } from "@/lib/data";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import {
  courseProgress,
  dueFlashcards,
  seriesDailyMinutes,
  studyStreak,
  todaySummary,
  upcomingDeadlines,
} from "@/lib/stats";
import { rankTasks } from "@/lib/planner";
import { daysUntil, formatDueLabel, formatMinutes, todayStr } from "@/lib/date";
import { cn } from "@/lib/utils";
import { askAI } from "@/lib/ai";
import TaskModal from "@/components/task-modal";

export default function DashboardPage() {
  const { loading, tasks, sessions, courses, chapters, flashcards, exams, updateTask } = useData();
  const { user } = useAuth();
  const { push } = useToast();
  const today = todayStr();
  const now = new Date();

  const summary = useMemo(() => todaySummary(tasks, sessions, [], now), [tasks, sessions, now]);
  const chartData = useMemo(() => seriesDailyMinutes(sessions, 7), [sessions]);
  const upcoming = useMemo(() => upcomingDeadlines(tasks, 7, now), [tasks, now]);
  const streak = useMemo(() => studyStreak(sessions, now), [sessions, now]);
  const dueCards = useMemo(() => dueFlashcards(flashcards, today).length, [flashcards, today]);
  const topRanked = useMemo(() => rankTasks(tasks, today).slice(0, 3), [tasks, today]);
  const progressRows = useMemo(() => courseProgress(courses, tasks, chapters), [courses, tasks, chapters]);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiHints, setAiHints] = useState<string[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const courseStats = useMemo(() => {
    // Số môn, số nhiệm vụ, hoàn thành — theo v2
    const done = tasks.filter((t) => t.status === "done").length;
    const open = tasks.length - done;
    const completedToday = tasks.filter(
      (t) => t.status === "done" && t.completedAt && t.completedAt.slice(0, 10) === today
    ).length;
    const upcomingExam = exams
      .filter((e) => e.examDate >= today)
      .sort((a, b) => a.examDate.localeCompare(b.examDate))[0];
    return { courses: courses.length, done, open, completedToday, upcomingExam };
  }, [tasks, courses.length, today, exams]);

  async function runSuggestions() {
    setAiLoading(true);
    setAiError(null);
    const ctx = {
      today,
      openTasks: topRanked.map((r) => ({ title: r.task.title, reasons: r.reasons })),
      weeklyMinutes: summary.weekMinutes,
      streak,
      dueCards,
      upcomingExam: courseStats.upcomingExam
        ? { title: courseStats.upcomingExam.title, inDays: daysUntil(courseStats.upcomingExam.examDate, today) }
        : null,
    };
    const res = await askAI("suggestions", { context: ctx });
    setAiLoading(false);
    if (res.error) {
      setAiError(res.error);
      return;
    }
    const j = res.json as { suggestions?: unknown } | null;
    const list = Array.isArray(j?.suggestions) ? (j!.suggestions as unknown[]).map((s) => String(s)).filter(Boolean).slice(0, 3) : [];
    if (list.length === 0) {
      setAiError("AI chưa đưa được gợi ý — thử lại nhé.");
      return;
    }
    setAiHints(list);
  }

  if (loading) {
    return <LoadingBlock label="Đang tải tổng quan..." />;
  }

  const stats = [
    { label: "Môn học", value: courseStats.courses, icon: GraduationCap, chip: "text-indigo-500 bg-indigo-500/10", href: "/courses" },
    { label: "Nhiệm vụ đang mở", value: courseStats.open, icon: ListTodo, chip: "text-violet-500 bg-violet-500/10", href: "/tasks" },
    { label: `Hoàn thành hôm nay`, value: courseStats.completedToday, icon: CheckCircle2, chip: "text-emerald-500 bg-emerald-500/10", href: "/tasks" },
    { label: "Thời gian tuần này", value: formatMinutes(summary.weekMinutes), icon: Timer, chip: "text-sky-500 bg-sky-500/10", href: "/focus" },
    { label: "Chuỗi ngày học", value: `${streak} 🔥`, icon: Flame, chip: "text-orange-500 bg-orange-500/10", href: "/analytics" },
    { label: "Flashcards đến hạn", value: dueCards, icon: Layers, chip: "text-rose-500 bg-rose-500/10", href: "/revision" },
  ];

  return (
    <div className="space-y-5">
      {/* Chào mừng */}
      <Card className="card-lift animate-fade-up relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600 p-6 text-white shadow-lg shadow-indigo-600/25">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-14 right-20 h-36 w-36 rounded-full bg-violet-300/20 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              {`Chào ${(user?.name?.trim().split(" ").pop() || user?.email?.split("@")[0] || "bạn").slice(0, 20)} 👋`}
            </h1>
            <p className="mt-1 text-sm text-indigo-100">
              {streak > 0 ? `Bạn đang giữ chuỗi ${streak} ngày học liên tục — giữ nhịp nhé!` : "Hôm nay là một ngày tốt để bắt đầu học."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/planner" className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/25">
              <LayoutDashboard className="h-4 w-4" /> Gợi ý hôm nay
            </Link>
            <Link href="/focus" className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <Timer className="h-4 w-4" /> Bắt đầu học với Pomodoro
            </Link>
          </div>
        </div>
      </Card>

      {/* KPI v2 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((s, i) => (
          <Link key={s.label} href={s.href} className="group">
            <Card className="card-lift animate-fade-up h-full p-4" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted">{s.label}</p>
                  <p className="mt-1.5 truncate text-xl font-bold tracking-tight">{s.value}</p>
                </div>
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110", s.chip)}>
                  <s.icon className="h-5 w-5" />
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Ưu tiên + AI */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="card-lift animate-fade-up p-5 lg:col-span-2" style={{ animationDelay: "220ms" }}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4 text-indigo-500" /> Nên ưu tiên bây giờ
            </h3>
            <Link href="/planner" className="text-xs text-muted transition-colors hover:text-indigo-600">
              Xem hàng đợi đầy đủ →
            </Link>
          </div>
          {topRanked.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-10 w-10" />} title="Không có việc nào gấp" hint="Toàn bộ nhiệm vụ đã xong hoặc trống. Kế hoạch mới chờ bạn ở trang Lập kế hoạch." />
          ) : (
            <ul className="space-y-2">
              {topRanked.map(({ task, reasons }, i) => {
                const course = task.courseId ? courseMap.get(task.courseId) : null;
                return (
                  <li
                    key={task.id}
                    className="row-lift animate-fade-up flex items-center gap-3 rounded-lg border border-border bg-surface-2/40 px-3.5 py-2.5"
                    style={{ animationDelay: `${260 + i * 60}ms` }}
                  >
                    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold", i === 0 ? "bg-red-500/10 text-red-500" : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300")}>
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className="truncate text-xs text-muted">
                        {reasons.slice(0, 2).join(" · ")}
                        {course && ` · ${course.name}`}
                      </p>
                    </div>
                    <div className="hidden w-28 shrink-0 sm:block">
                      <ProgressBar percent={task.progress ?? 0} color="bg-gradient-to-r from-indigo-500 to-violet-500" />
                      <p className="mt-1 text-right text-[10px] text-muted">{task.progress ?? 0}%</p>
                    </div>
                    <button
                      onClick={() => {
                        void updateTask(task.id, { status: "done", progress: 100, completedAt: new Date().toISOString() });
                        push("Đã hoàn thành!", "success");
                      }}
                      className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-emerald-500/10 hover:text-emerald-500"
                      aria-label="Hoàn thành"
                      title="Đánh dấu hoàn thành"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="card-lift animate-fade-up p-5" style={{ animationDelay: "280ms" }}>
          <h3 className="flex items-center gap-2 font-semibold">
            <Bot className="h-4 w-4 text-violet-500" /> Gợi ý từ AI
          </h3>
          {aiLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted">
              <Loader2 className="h-5 w-5 animate-spin text-violet-500" /> Đang phân tích…
            </div>
          ) : aiError ? (
            <div className="mt-3 space-y-3">
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">{aiError}</p>
              <Button variant="secondary" className="w-full text-xs" onClick={() => void runSuggestions()}>
                Thử lại
              </Button>
            </div>
          ) : aiHints ? (
            <ul className="mt-3 space-y-2">
              {aiHints.map((h, i) => (
                <li key={i} className="animate-fade-up rounded-lg border border-violet-300/40 bg-violet-500/5 px-3 py-2 text-sm dark:border-violet-500/25" style={{ animationDelay: `${i * 70}ms` }}>
                  {h}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p className="mt-2 text-xs text-muted">AI đọc nhiệm vụ + thói quen học của bạn và gợi ý 3 việc nên làm kế tiếp.</p>
              <Button variant="secondary" className="mt-3 w-full text-xs" onClick={() => void runSuggestions()}>
                <Sparkles className="h-3.5 w-3.5 text-violet-500" /> Có gợi ý AI
              </Button>
            </>
          )}
          {courseStats.upcomingExam && (
            <Link href="/analytics" className="mt-4 block rounded-lg border border-indigo-300/40 bg-indigo-500/5 px-3 py-2 text-xs transition-colors hover:bg-indigo-500/10 dark:border-indigo-500/25">
              <b>Kì thi:</b> {courseStats.upcomingExam.title} · {daysUntil(courseStats.upcomingExam.examDate, today) === 0 ? "hôm nay" : `sau ${daysUntil(courseStats.upcomingExam.examDate, today)} ngày`}
            </Link>
          )}
        </Card>
      </div>

      {/* Mục tiêu tuần + Biểu đồ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="card-lift animate-fade-up p-5" style={{ animationDelay: "320ms" }}>
          <h3 className="flex items-center gap-2 font-semibold">
            <Target className="h-4 w-4 text-indigo-500" /> Phần trăm mục tiêu tuần
          </h3>
          {(() => {
            // dùng summary.weeklyPercent như v1
            if (summary.weeklyPercent === 0) {
              return (
                <div className="mt-4 text-sm text-muted">
                  Chưa đặt mục tiêu tuần.
                  <Link href="/goals" className="mt-2 inline-block font-medium text-indigo-600 transition-colors hover:underline dark:text-indigo-400">
                    Đặt mục tiêu ngay →
                  </Link>
                </div>
              );
            }
            return (
              <>
                <div className="mt-4 flex items-end gap-2">
                  <span className="text-4xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">{summary.weeklyPercent}%</span>
                  <span className="mb-1 text-sm text-muted">hoàn thành</span>
                </div>
                <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-surface-2">
                  <div className="animate-shimmer h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500 bg-[length:200%_100%] transition-all duration-1000 ease-out" style={{ width: `${summary.weeklyPercent}%` }} />
                </div>
              </>
            );
          })()}
        </Card>

        <Card className="card-lift animate-fade-up p-5 lg:col-span-2" style={{ animationDelay: "360ms" }}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold">
              <TrendingUp className="h-4 w-4 text-indigo-500" /> Thời gian học 7 ngày qua
            </h3>
            <Link href="/statistics" className="text-xs text-muted transition-colors hover:text-indigo-600">
              Xem chi tiết →
            </Link>
          </div>
          <DailyMinutesChart data={chartData} />
        </Card>
      </div>

      {/* Tiến độ từng môn học */}
      <Card className="card-lift animate-fade-up p-5" style={{ animationDelay: "400ms" }}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <GraduationCap className="h-4 w-4 text-indigo-500" /> Tiến độ từng môn học
          </h3>
          <Link href="/courses" className="text-xs text-muted transition-colors hover:text-indigo-600">
            Quản lý môn →
          </Link>
        </div>
        {progressRows.length === 0 ? (
          <EmptyState icon={<GraduationCap className="h-10 w-10" />} title="Chưa có môn học nào" hint="Thêm môn ở trang Môn học để thấy tiến độ tại đây." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {progressRows.slice(0, 6).map((r) => (
              <div key={r.course.id} className="rounded-lg border border-border bg-surface-2/40 p-3.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.course.color }} />
                  <p className="flex-1 truncate text-sm font-medium">{r.course.name}</p>
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{r.rate}%</span>
                </div>
                <div className="mt-2.5">
                  <ProgressBar percent={r.rate} color="bg-gradient-to-r from-indigo-500 to-violet-500" />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {r.done}/{r.total} nhiệm vụ{r.chapterScore !== null && ` · hiểu ${r.chapterScore}%`}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Lịch học hôm nay */}
      <Card className="card-lift animate-fade-up p-5" style={{ animationDelay: "440ms" }}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <CalendarDays className="h-4 w-4 text-indigo-500" /> Lịch học hôm nay ({formatDueLabel(today)})
          </h3>
          <Link href="/tasks" className="text-xs text-muted transition-colors hover:text-indigo-600">
            Quản lý nhiệm vụ →
          </Link>
        </div>
        {summary.todays.length === 0 ? (
          <EmptyState
            icon={<ListTodo className="h-10 w-10" />}
            title="Hôm nay bạn không có nhiệm vụ nào"
            hint="Tạo nhiệm vụ mới ở trang Nhiệm vụ hoặc trang Lập kế hoạch."
          />
        ) : (
          <ul className="space-y-2.5">
            {summary.todays.map((task, i) => {
              const course = task.courseId ? courseMap.get(task.courseId) : null;
              const overdue = task.status !== "done" && task.dueDate < today;
              return (
                <li
                  key={task.id}
                  className="row-lift animate-fade-up group flex items-center gap-3 rounded-lg border border-border bg-surface-2/40 px-3.5 py-3 hover:bg-surface-2"
                  style={{ animationDelay: `${460 + i * 60}ms` }}
                >
                  <button
                    onClick={() => {
                      const done = task.status === "done";
                      void updateTask(task.id, done ? { status: "todo", progress: Math.min(90, task.progress ?? 0), completedAt: null } : { status: "done", progress: 100, completedAt: new Date().toISOString() });
                    }}
                    className={cn("shrink-0 transition-colors", task.status === "done" ? "text-emerald-500" : "text-muted hover:text-emerald-500")}
                    aria-label={task.status === "done" ? "Bỏ hoàn thành" : "Hoàn thành"}
                  >
                    <CheckCircle2 className={cn(task.status === "done" && "fill-emerald-100 dark:fill-emerald-500/20")} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-medium", task.status === "done" && "text-muted line-through")}>{task.title}</p>
                    <p className="truncate text-xs text-muted">
                      {course?.name ?? "Không môn"} · {formatMinutes(task.estMinutes ?? 30)}
                    </p>
                  </div>
                  {overdue && <Badge className="shrink-0 bg-red-500/10 text-red-500">Quá hạn</Badge>}
                  <button
                    onClick={() => {
                      setEditingId(task.id);
                      setModalOpen(true);
                    }}
                    className="shrink-0 text-xs font-medium text-indigo-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-indigo-300"
                  >
                    Sửa
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Deadline sắp tới */}
      <Card className="card-lift animate-fade-up p-5" style={{ animationDelay: "500ms" }}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <AlarmClock className="h-4 w-4 text-red-400" /> Deadline 7 ngày tới
          </h3>
          <Link href="/planner" className="text-xs text-muted transition-colors hover:text-indigo-600">
            Xem kế hoạch →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="h-10 w-10" />} title="Không có deadline nào sắp tới" hint="Tuyệt, bạn không bị áp lực nào trong 7 ngày tới." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {upcoming.map((task, i) => {
              const course = task.courseId ? courseMap.get(task.courseId) : null;
              const d = daysUntil(task.dueDate, today);
              return (
                <div key={task.id} className="card-lift animate-fade-up rounded-lg border border-border bg-surface-2/40 p-3.5 hover:border-red-300/60 dark:hover:border-red-500/30" style={{ animationDelay: `${520 + i * 60}ms` }}>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: course?.color ?? "#cbd5e1" }} />
                    <p className="truncate text-xs font-medium" style={{ color: course?.color }}>
                      {course?.name ?? "Không môn"}
                    </p>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-medium">{task.title}</p>
                  <p className={cn("mt-2 text-xs", d < 1 ? "font-semibold text-red-500" : d <= 2 ? "text-amber-500" : "text-muted")}>
                    {d === 0 ? "Hạn: hôm nay" : d === 1 ? "Hạn: ngày mai" : `Hạn: sau ${d} ngày`}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <TaskModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingId(null);
        }}
        editing={editingId ? taskById.get(editingId) ?? null : null}
      />
    </div>
  );
}
