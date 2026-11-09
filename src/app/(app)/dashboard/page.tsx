"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlarmClock,
  CalendarDays,
  CheckCircle2,
  Circle,
  CircleCheckBig,
  Clock3,
  Flame,
  ListTodo,
  Target,
  Timer,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { Badge, EmptyState, LoadingBlock } from "@/components/ui";
import { DailyMinutesChart } from "@/components/charts";
import { useData } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import {
  seriesDailyMinutes,
  todaySummary,
  upcomingDeadlines,
} from "@/lib/stats";
import { daysUntil, formatDueLabel, formatMinutes, todayStr } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";

const PRIORITY_BADGE: Record<Task["priority"], string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  low: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { loading, tasks, sessions, goals, subjects, updateTask, deleteTask } = useData();
  const today = new Date();

  const summary = useMemo(
    () => (user ? todaySummary(tasks, sessions, goals, today) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, sessions, goals, user]
  );
  const upcoming = useMemo(() => (user ? upcomingDeadlines(tasks, 7, today) : []), [tasks, user]);
  const chartData = useMemo(() => seriesDailyMinutes(sessions, 7, today), [sessions]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  const toggleStatus = async (task: Task) => {
    if (task.status === "done") await updateTask(task.id, { status: "in_progress", completedAt: null });
    else await updateTask(task.id, { status: "done", completedAt: new Date().toISOString() });
  };

  if (loading || !summary) return <LoadingBlock />;

const stats = [
    { label: "Nhiệm vụ hôm nay", value: summary.todays.length, icon: ListTodo, tone: "text-blue-500", chip: "bg-blue-50 dark:bg-blue-500/10", hint: "Theo ngày bắt đầu & deadline" },
    { label: "Đã hoàn thành", value: summary.done, icon: CircleCheckBig, tone: "text-emerald-500", chip: "bg-emerald-50 dark:bg-emerald-500/10", hint: "Nhiệm vụ hôm nay" },
    { label: "Chưa hoàn thành", value: summary.remaining, icon: AlarmClock, tone: "text-amber-500", chip: "bg-amber-50 dark:bg-amber-500/10", hint: "Nhiệm vụ hôm nay" },
    { label: "Học trong tuần này", value: formatMinutes(summary.weekMinutes), icon: Clock3, tone: "text-violet-500", chip: "bg-violet-50 dark:bg-violet-500/10", hint: "Từ Pomodoro & phiên học" },
  ];

  const todayDateStr = todayStr();

  return (
    <div className="space-y-6">
      {/* Chào mừng + mục tiêu tuần */}
      <div className="animate-fade-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            Chào bạn, <span className="text-gradient">{user!.name}</span> 👋
          </h2>
          <p className="mt-0.5 text-sm text-muted">Đây là tình hình học tập của bạn hôm nay.</p>
        </div>
        <Link href="/focus" className="inline-flex w-fit items-center gap-2 interactive-pop rounded-lg bg-gradient-to-b from-blue-500 to-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-md shadow-blue-600/25 transition-colors hover:from-blue-600 hover:to-blue-700">
          <Timer className="h-4 w-4" /> Bắt đầu học với Pomodoro
        </Link>
      </div>

      {/* Thẻ thống kê */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="card-lift animate-fade-up rounded-xl border border-border bg-surface p-5 shadow-card hover:border-blue-300/60 dark:hover:border-blue-500/30"
            style={{ animationDelay: `${60 + i * 80}ms` }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted">{s.label}</p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight">{s.value}</p>
                <p className="mt-1 text-xs text-muted">{s.hint}</p>
              </div>
              <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", s.chip)}>
                <s.icon className={cn("h-5 w-5", s.tone)} />
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Mục tiêu tuần + Biểu đồ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card-lift animate-fade-up rounded-xl border border-border bg-surface p-5 shadow-card lg:col-span-1" style={{ animationDelay: "380ms" }}>
          <h3 className="flex items-center gap-2 font-semibold">
            <Target className="h-4 w-4 text-blue-500" /> Phần trăm mục tiêu tuần
          </h3>
          {goals.filter((g) => g.scope === "weekly").length === 0 ? (
            <div className="mt-4 text-sm text-muted">
              Chưa đặt mục tiêu tuần.
              <Link href="/goals" className="mt-2 inline-block font-medium text-blue-600 transition-colors hover:underline dark:text-blue-400">
                Đặt mục tiêu ngay →
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-4xl font-bold tracking-tight text-blue-600 dark:text-blue-400">{summary.weeklyPercent}%</span>
                <span className="mb-1 text-sm text-muted">hoàn thành</span>
              </div>
              <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 bg-[length:200%_100%] transition-all duration-1000 ease-out animate-shimmer"
                  style={{ width: `${summary.weeklyPercent}%` }}
                />
              </div>
              {summary.weeklyPercent >= 100 && (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                  <Flame className="h-4 w-4 animate-pulse-soft" /> Bạn đã chinh phục mục tiêu tuần này. Quá tuyệt vời!
                </p>
              )}
            </>
          )}
        </div>

        <div className="card-lift animate-fade-up rounded-xl border border-border bg-surface p-5 shadow-card lg:col-span-2" style={{ animationDelay: "460ms" }}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold">
              <TrendingUp className="h-4 w-4 text-blue-500" /> Thời gian học 7 ngày qua
            </h3>
            <Link href="/statistics" className="text-xs text-muted transition-colors hover:text-blue-600">
              Xem chi tiết →
            </Link>
          </div>
          <DailyMinutesChart data={chartData} />
        </div>
      </div>

      {/* Lịch học hôm nay */}
      <div className="animate-fade-up rounded-xl border border-border bg-surface p-5 shadow-card" style={{ animationDelay: "540ms" }}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <CalendarDays className="h-4 w-4 text-blue-500" /> Lịch học hôm nay
          </h3>
          <Link href="/tasks" className="text-xs text-muted transition-colors hover:text-blue-600">
            Quản lý nhiệm vụ →
          </Link>
        </div>
        {summary.todays.length === 0 ? (
          <EmptyState
            icon={<ListTodo className="h-10 w-10" />}
            title="Hôm nay bạn không có nhiệm vụ nào"
            hint="Tạo nhiệm vụ mới ở trang Nhiệm vụ hoặc bấm trực tiếp vào lịch học."
          />
        ) : (
          <ul className="space-y-2.5">
            {summary.todays.map((task, i) => {
              const subject = task.subjectId ? subjectMap.get(task.subjectId) : null;
              const overdue = task.status !== "done" && task.dueDate < todayDateStr;
              return (
                <li key={task.id} className="row-lift animate-fade-up group flex items-center gap-3 rounded-lg border border-border bg-surface-2/40 px-3.5 py-3 hover:bg-surface-2 hover:shadow-sm" style={{ animationDelay: `${560 + i * 60}ms` }}>
                  <button
                    onClick={() => toggleStatus(task)}
                    className={cn("shrink-0 transition-colors", task.status === "done" ? "text-emerald-500" : "text-muted hover:text-emerald-500")}
                    aria-label={task.status === "done" ? "Bỏ hoàn thành" : "Đánh dấu hoàn thành"}
                    title={task.status === "done" ? "Bỏ hoàn thành" : "Đánh dấu hoàn thành"}
                  >
                    {task.status === "done" ? <CircleCheckBig className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                  </button>
                  <div
                    className="h-8 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: subject?.color ?? "#cbd5e1" }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-medium", task.status === "done" && "text-muted line-through")}>{task.title}</p>
                    <p className="text-xs text-muted">
                      {subject ? `${subject.name} • ` : ""}
                      {task.status === "done" ? "Đã hoàn thành" : task.status === "in_progress" ? "Đang thực hiện" : "Chưa bắt đầu"}
                    </p>
                  </div>
                  {task.status !== "done" && (
                    <Badge className={cn(PRIORITY_BADGE[task.priority], "mr-1 shrink-0")}>
                      {task.priority === "high" ? "Ưu tiên cao" : task.priority === "medium" ? "Trung bình" : "Thấp"}
                    </Badge>
                  )}
                  <span className={cn("hidden shrink-0 text-xs sm:block", overdue ? "font-medium text-red-500" : "text-muted")}>
                    {formatDueLabel(task.dueDate)}
                  </span>
                  <button
                    onClick={async () => {
                      await deleteTask(task.id);
                    }}
                    className="shrink-0 rounded-md p-1.5 text-muted opacity-0 transition-all hover:bg-surface hover:text-red-500 group-hover:opacity-100"
                    aria-label="Xóa nhiệm vụ"
                    title="Xóa nhiệm vụ"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Deadline sắp tới */}
      <div className="animate-fade-up rounded-xl border border-border bg-surface p-5 shadow-card" style={{ animationDelay: "580ms" }}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <AlarmClock className="h-4 w-4 text-red-400" /> Deadline 7 ngày tới
          </h3>
          <Link href="/calendar" className="text-xs text-muted transition-colors hover:text-blue-600">
            Xem lịch →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="h-10 w-10" />} title="Không có deadline nào sắp tới" hint="Tuyệt, bạn không bị áp lực nào trong 7 ngày tới." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {upcoming.map((task, i) => {
              const subject = task.subjectId ? subjectMap.get(task.subjectId) : null;
              const d = daysUntil(task.dueDate);
              return (
                <div
                  key={task.id}
                  className="card-lift animate-fade-up rounded-lg border border-border bg-surface-2/40 p-3.5 hover:border-red-300/60 dark:hover:border-red-500/30"
                  style={{ animationDelay: `${600 + i * 60}ms` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: subject?.color ?? "#cbd5e1" }} />
                    <p className="text-xs font-medium" style={{ color: subject?.color }}>
                      {subject?.name ?? "Không môn"}
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
      </div>
    </div>
  );
}
