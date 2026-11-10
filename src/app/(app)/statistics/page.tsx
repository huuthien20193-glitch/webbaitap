"use client";

import { useMemo, useState } from "react";
import { BarChart3, CheckCircle2, Clock3, Percent, TrendingUp } from "lucide-react";
import { Card, LoadingBlock, ProgressBar } from "@/components/ui";
import {
  CompletedTasksChart,
  DailyMinutesChart,
  SubjectTimePie,
  WeeklyCompareChart,
} from "@/components/charts";
import { useData } from "@/lib/data";
import { formatMinutes, toDateStr } from "@/lib/date";
import {
  minutesByCourse,
  minutesInRange,
  minutesThisMonth,
  seriesDailyCompleted,
  seriesDailyMinutes,
  taskStats,
  weekPerformance,
} from "@/lib/stats";
import { cn } from "@/lib/utils";

type RangeMode = 7 | 30;

export default function StatisticsPage() {
  const { loading, tasks, sessions, courses } = useData();
  const [range, setRange] = useState<RangeMode>(7);

  const now = useMemo(() => new Date(), []);

  const dailyMinutes = useMemo(() => seriesDailyMinutes(sessions, range, now), [sessions, range, now]);
  const dailyCompleted = useMemo(() => seriesDailyCompleted(tasks, range, now), [tasks, range, now]);
  const subjectSlices = useMemo(() => minutesByCourse(sessions, courses).slice(0, 6), [sessions, courses]);
  const weekly = useMemo(() => weekPerformance(sessions, tasks, 4, now), [sessions, tasks, now]);

  const stats = useMemo(() => {
    const from = toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (range - 1)));
    const to = toDateStr(now);
    const rangeMinutes = Math.round(minutesInRange(sessions, from, to));
    const ts = taskStats(tasks);
    const top = subjectSlices[0];
    return { rangeMinutes, ts, top };
  }, [sessions, tasks, subjectSlices, range, now]);

  if (loading) return <LoadingBlock />;

  const thisWeek = weekly[weekly.length - 1];
  const prevWeek = weekly[weekly.length - 2];
  const minuteDelta = thisWeek && prevWeek ? Math.round(thisWeek.minutes - prevWeek.minutes) : 0;
  const taskDelta = thisWeek && prevWeek ? thisWeek.completed - prevWeek.completed : 0;

  const cards = [
    {
      label: `Thời gian học ${range} ngày qua`,
      value: formatMinutes(stats.rangeMinutes),
      icon: Clock3,
      tone: "text-blue-500",
    },
    { label: "Tháng này", value: formatMinutes(minutesThisMonth(sessions, now)), icon: BarChart3, tone: "text-violet-500" },
    { label: "Nhiệm vụ hoàn thành", value: `${stats.ts.done}/${stats.ts.total}`, icon: CheckCircle2, tone: "text-emerald-500" },
    { label: "Tỷ lệ hoàn thành", value: `${stats.ts.rate}%`, icon: Percent, tone: "text-amber-500" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Thống kê hiệu suất học tập</h2>
          <p className="text-sm text-muted">Phân tích thời gian học và tiến độ nhiệm vụ của bạn.</p>
        </div>
        <div className="flex rounded-lg border border-border bg-surface-2 p-1">
          <button
            onClick={() => setRange(7)}
            className={cn("rounded-md px-4 py-1.5 text-sm font-medium transition-colors", range === 7 ? "bg-indigo-600 text-white shadow-card" : "text-muted hover:text-foreground")}
          >
            7 ngày
          </button>
          <button
            onClick={() => setRange(30)}
            className={cn("rounded-md px-4 py-1.5 text-sm font-medium transition-colors", range === 30 ? "bg-indigo-600 text-white shadow-card" : "text-muted hover:text-foreground")}
          >
            30 ngày
          </button>
        </div>
      </div>

      {/* Thẻ số liệu */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c, i) => (
          <Card key={c.label} className="card-lift animate-fade-up p-5 hover:border-indigo-300/60 dark:hover:border-indigo-500/30" style={{ animationDelay: `${i * 70}ms` }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted">{c.label}</p>
                <p className="mt-1.5 text-xl font-bold tracking-tight">{c.value}</p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2">
                <c.icon className={cn("h-5 w-5", c.tone)} />
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Biểu đồ chính */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Thời gian học theo ngày (phút)</h3>
          <DailyMinutesChart data={dailyMinutes} />
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Nhiệm vụ hoàn thành theo ngày</h3>
          <CompletedTasksChart data={dailyCompleted} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Phân bổ thời gian theo môn học</h3>
          <SubjectTimePie data={subjectSlices} />
          {stats.top && (
            <p className="mt-2 text-center text-sm text-muted">
              Môn chiếm nhiều thời gian nhất:{" "}
              <span className="font-semibold" style={{ color: stats.top.color }}>
                {stats.top.name}
              </span>{" "}
              ({formatMinutes(stats.top.minutes)})
            </p>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 font-semibold">So sánh hiệu suất các tuần</h3>
          <WeeklyCompareChart data={weekly.map((w) => ({ label: toDateStr(new Date(w.weekStartStr)).slice(5), minutes: w.minutes, completed: w.completed }))} />
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <span className={cn("rounded-lg px-3 py-1.5", minuteDelta >= 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400")}>
              Tuần này {minuteDelta >= 0 ? "+" : ""}{minuteDelta} phút so với tuần trước
            </span>
            <span className={cn("rounded-lg px-3 py-1.5", taskDelta >= 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400")}>
              {taskDelta >= 0 ? "+" : ""}{taskDelta} nhiệm vụ
            </span>
          </div>
        </Card>
      </div>

      {/* Tổng quan chung */}
      <Card className="p-5">
        <h3 className="mb-4 flex items-center gap-2 font-semibold">
          <TrendingUp className="h-4 w-4 text-indigo-500" /> Tiến độ tổng thể
        </h3>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="text-muted">Tỷ lệ hoàn thành nhiệm vụ</span>
              <span className="font-semibold">{stats.ts.rate}%</span>
            </div>
            <ProgressBar percent={stats.ts.rate} />
            <p className="mt-2 text-xs text-muted">
              {stats.ts.open} nhiệm vụ còn lại trên tổng số {stats.ts.total} nhiệm vụ.
            </p>
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="text-muted">Cơ cấu nhiệm vụ</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">Đã xong: {stats.ts.done}</span>
              <span className="rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400">Đang làm: {tasks.filter((t) => t.status === "in_progress").length}</span>
              <span className="rounded-full bg-surface-2 px-3 py-1 text-muted">Chưa bắt đầu: {tasks.filter((t) => t.status === "todo").length}</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
