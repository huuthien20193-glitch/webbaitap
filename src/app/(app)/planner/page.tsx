"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Bot,
  CalendarRange,
  CheckCircle2,
  Clock,
  Flame,
  Gauge,
  GripVertical,
  Loader2,
  Plus,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button, Card, EmptyState, LoadingBlock, SelectField } from "@/components/ui";
import TaskModal from "@/components/task-modal";
import { useData } from "@/lib/data";
import { useToast } from "@/lib/toast";
import { formatDayLabel, formatMinutes, parseDate, shiftDateStr, todayStr } from "@/lib/date";
import { buildSchedule, rankTasks } from "@/lib/planner";
import { cn } from "@/lib/utils";
import { askAI, asObjectArray, num, str } from "@/lib/ai";

function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", className)}>{children}</span>;
}

interface AIPlan {
  summary: string;
  days: { date: string; items: { taskTitle: string; minutes: number; reason: string }[] }[];
  newTasks: { title: string; courseName: string; estMinutes: number; difficulty: number; importance: number }[];
}

export default function PlannerPage() {
  const { loading, tasks, courses, updateTask, addTask } = useData();
  const { push } = useToast();
  const today = todayStr();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"auto" | "ai">("auto");
  const [minutesPerDay, setMinutesPerDay] = useState(90);
  const [scheduleOpen, setScheduleOpen] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPlan, setAiPlan] = useState<AIPlan | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const ranked = useMemo(() => rankTasks(tasks, today), [tasks, today]);
  const openTasks = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);
  const overdue = useMemo(() => openTasks.filter((t) => t.dueDate < today).length, [openTasks, today]);
  const remainingMinutes = useMemo(
    () => openTasks.reduce((sum, t) => sum + Math.max(0, Math.round(((100 - (t.progress ?? 0)) / 100) * (t.estMinutes ?? 30))), 0),
    [openTasks]
  );

  /* Lịch tự động — chỉ đề xuất, áp dụng khi người dùng bấm */
  const schedule = useMemo(() => buildSchedule(tasks, { daysAhead: 7, minutesPerDay }), [tasks, minutesPerDay]);
  const firstDateByTask = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of schedule.entries) if (!m.has(e.taskId)) m.set(e.taskId, e.date);
    return m;
  }, [schedule]);

  /* Bảng tuần 7 ngày để kéo thả deadline */
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftDateStr(today, i)), [today]);
  const tasksByDay = useMemo(() => {
    const map = new Map<string, typeof openTasks>();
    for (const d of weekDays) map.set(d, openTasks.filter((t) => t.dueDate === d));
    return map;
  }, [openTasks, weekDays]);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const editingTask = editingId ? (taskById.get(editingId) ?? null) : null;

  async function applySchedule() {
    let count = 0;
    for (const [taskId, date] of firstDateByTask) {
      const t = taskById.get(taskId);
      if (!t || t.startDate === date) continue;
      await updateTask(taskId, { startDate: date });
      count += 1;
    }
    if (count === 0) push("Không có gì cần thay đổi — lịch trùng với hiện tại", "success");
    else push(`Đã áp dụng ngày bắt đầu cho ${count} nhiệm vụ. Xem lại ở trang Lịch học nhé!`, "success");
  }

  async function runAI() {
    setAiLoading(true);
    setAiError(null);
    const ctx = {
      today,
      minutesPerDay,
      courses: courses.map((c) => ({ id: c.id, name: c.name, code: c.code })),
      tasks: openTasks.slice(0, 25).map((t) => ({
        title: t.title,
        course: courseMap.get(t.courseId ?? "")?.name ?? "",
        dueDate: t.dueDate,
        priority: t.priority,
        status: t.status,
        estMinutes: t.estMinutes,
        difficulty: t.difficulty,
        importance: t.importance,
        progress: t.progress,
      })),
    };
    const res = await askAI("plan", { context: ctx });
    setAiLoading(false);
    if (res.error) {
      setAiError(res.error);
      return;
    }
    const raw = (res.json ?? null) as Record<string, unknown> | null;
    if (!raw) {
      setAiError(res.text ? "AI trả về định dạng không chuẩn, thử bấm lại nhé." : "Không nhận được kế hoạch từ AI.");
      return;
    }
    const daysRaw = Array.isArray(raw.days) ? (raw.days as Record<string, unknown>[]) : [];
    const newRaw = Array.isArray(raw.newTasks) ? (raw.newTasks as Record<string, unknown>[]) : [];
    setAiPlan({
      summary: str(raw.summary, ""),
      days: daysRaw
        .filter((d) => str(d.date))
        .slice(0, 14)
        .map((d) => ({
          date: str(d.date),
          items: asObjectArray(d.items)
            .slice(0, 8)
            .map((it) => ({ taskTitle: str(it.taskTitle ?? it.title, "Nhiệm vụ"), minutes: num(it.minutes, 30), reason: str(it.reason) })),
        })),
      newTasks: newRaw.slice(0, 6).map((n) => ({
        title: str(n.title ?? n.taskTitle, "Nhiệm vụ mới"),
        courseName: str(n.courseName ?? n.course),
        estMinutes: Math.min(600, Math.max(15, num(n.estMinutes, 30))),
        difficulty: Math.min(5, Math.max(1, num(n.difficulty, 3))),
        importance: Math.min(5, Math.max(1, num(n.importance, 3))),
      })),
    });
  }

  async function createFromAI(list: AIPlan["newTasks"]) {
    if (list.length === 0) return;
    try {
      for (const t of list) {
        const lower = t.courseName.toLowerCase();
        const course = courses.find((c) => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase()));
        await addTask({
          courseId: course?.id ?? null,
          title: t.title,
          description: "",
          startDate: today,
          dueDate: shiftDateStr(today, 7),
          priority: t.importance >= 4 ? "high" : t.importance >= 3 ? "medium" : "low",
          status: "todo",
          estMinutes: t.estMinutes,
          difficulty: t.difficulty,
          importance: t.importance,
          progress: 0,
          completedAt: null,
          createdAt: new Date().toISOString(),
        });
      }
      push(`Đã tạo ${list.length} nhiệm vụ từ đề xuất của AI`, "success");
    } catch {
      /* toast lỗi đã hiện trong provider */
    }
  }

  async function handleDrop(dateStr: string) {
    if (!dragId) return;
    const t = taskById.get(dragId);
    setDragId(null);
    setDragOver(null);
    if (!t || t.dueDate === dateStr) return;
    await updateTask(t.id, { dueDate: dateStr, startDate: t.startDate > dateStr ? dateStr : t.startDate });
    push(`Đã chuyển "${t.title}" sang ${formatDayLabel(parseDate(dateStr))}`, "success");
  }

  if (loading) {
    return <LoadingBlock label="Đang tải kế hoạch học tập..." />;
  }

  const stats = [
    { label: "Đang mở", value: openTasks.length, icon: Gauge, tone: "text-indigo-500 bg-indigo-500/10" },
    { label: "Quá hạn", value: overdue, icon: Flame, tone: "text-red-500 bg-red-500/10" },
    { label: "Còn lại dự kiến", value: formatMinutes(remainingMinutes), icon: Clock, tone: "text-violet-500 bg-violet-500/10" },
    { label: "Kế hoạch 7 ngày", value: formatMinutes(schedule.totalMinutes), icon: CalendarRange, tone: "text-emerald-500 bg-emerald-500/10" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Trạm lập kế hoạch</h1>
          <p className="mt-1 text-sm text-muted">Nhiệm vụ được xếp theo deadline, độ khó, độ quan trọng &amp; tiến độ của bạn.</p>
        </div>
        <Button
          onClick={() => {
            setEditingId(null);
            setModalOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Nhiệm vụ mới
        </Button>
      </div>

      {/* Số liệu nhanh */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s, i) => (
          <Card key={s.label} className="card-lift animate-fade-up p-4" style={{ animationDelay: `${i * 70}ms` }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted">{s.label}</p>
                <p className="mt-1 truncate text-lg font-bold tracking-tight">{s.value}</p>
              </div>
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", s.tone)}>
                <s.icon className="h-4 w-4" />
              </span>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Hàng đợi ưu tiên */}
        <Card className="card-lift animate-fade-up p-5 lg:col-span-2" style={{ animationDelay: "120ms" }}>
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <Sparkles className="h-4 w-4 text-indigo-500" /> Hàng đợi ưu tiên
          </h2>
          {ranked.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-10 w-10" />}
              title={openTasks.length === 0 ? "Tuyệt vời — Bạn đã làm hết mọi nhiệm vụ!" : "Không có nhiệm vụ"}
              hint="Tạo nhiệm vụ mới để thuật toán xếp lịch cho bạn."
            />
          ) : (
            <ul className="space-y-2.5">
              {ranked.slice(0, 10).map(({ task, score, reasons }, i) => {
                const course = task.courseId ? courseMap.get(task.courseId) : null;
                const late = task.dueDate < today;
                return (
                  <li
                    key={task.id}
                    className="row-lift animate-fade-up group flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface-2/40 px-3.5 py-3 hover:border-indigo-300/60 hover:bg-surface-2 dark:hover:border-indigo-500/30"
                    style={{ animationDelay: `${180 + i * 50}ms` }}
                    onClick={() => {
                      setEditingId(task.id);
                      setModalOpen(true);
                    }}
                  >
                    <span className="flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
                      <span className="text-[9px] leading-none opacity-60">#</span>
                      <span className="text-sm font-bold leading-none">{i + 1}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {course && (
                          <Chip className="bg-surface text-muted">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: course.color }} />
                            {course.name}
                          </Chip>
                        )}
                        {reasons.slice(0, 2).map((r) => (
                          <Chip
                            key={r}
                            className={
                              r.startsWith("Đã quá") || r === "Deadline hôm nay"
                                ? "bg-red-500/10 text-red-500"
                                : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                            }
                          >
                            {r}
                          </Chip>
                        ))}
                        <Chip className="bg-surface-2 text-muted">{formatMinutes(task.estMinutes ?? 30)}</Chip>
                      </div>
                    </div>
                    <div className="flex w-14 shrink-0 flex-col items-end gap-1">
                      <span className={cn("text-sm font-bold", score >= 70 ? "text-red-500" : score >= 45 ? "text-amber-500" : "text-emerald-500")}>{score}</span>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                        <div
                          className={cn("h-full rounded-full", score >= 70 ? "bg-red-500" : score >= 45 ? "bg-amber-500" : "bg-emerald-500")}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void updateTask(task.id, { status: "done", progress: 100, completedAt: new Date().toISOString() });
                        push("Đã hoàn thành nhiệm vụ", "success");
                      }}
                      className="rounded-lg p-2 text-muted opacity-0 transition-opacity hover:bg-emerald-500/10 hover:text-emerald-500 group-hover:opacity-100"
                      aria-label="Đánh dấu hoàn thành"
                      title="Hoàn thành"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                    <span className="hidden text-muted/50 sm:block">
                      <GripVertical className="h-4 w-4 cursor-grab" />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Xếp lịch: Tự động | AI — người dùng xem trước & xác nhận rồi mới áp dụng */}
        <Card className="card-lift animate-fade-up p-5" style={{ animationDelay: "200ms" }}>
          <div className="mb-4 flex items-center gap-1 rounded-lg bg-surface-2 p-1">
            <button
              onClick={() => setTab("auto")}
              className={cn("flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all", tab === "auto" ? "bg-surface shadow-sm" : "text-muted hover:text-foreground")}
              aria-pressed={tab === "auto"}
            >
              <Wand2 className="mr-1.5 inline h-4 w-4" /> Tự động
            </button>
            <button
              onClick={() => setTab("ai")}
              className={cn("flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all", tab === "ai" ? "bg-surface shadow-sm" : "text-muted hover:text-foreground")}
              aria-pressed={tab === "ai"}
            >
              <Bot className="mr-1.5 inline h-4 w-4 text-violet-500" /> AI
            </button>
          </div>

          {tab === "auto" ? (
            <>
              <SelectField
                id="perday"
                label="Thời gian học mỗi ngày"
                value={minutesPerDay}
                onChange={(e) => setMinutesPerDay(Number(e.target.value))}
              >
                {[60, 90, 120, 180, 240].map((m) => (
                  <option key={m} value={m}>
                    {formatMinutes(m)}
                  </option>
                ))}
              </SelectField>
              <button onClick={() => setScheduleOpen((p) => !p)} className="mt-3 flex w-full items-center justify-between text-sm font-medium">
                <span>Đề xuất lịch (7 ngày)</span>
                <span className="text-muted">{scheduleOpen ? "–" : "+"}</span>
              </button>
              {scheduleOpen && (
                <div className="mt-2 max-h-72 space-y-3 overflow-y-auto pr-1">
                  {schedule.days.every((d) => d.minutes === 0) ? (
                    <p className="rounded-lg bg-surface-2 px-3 py-4 text-center text-sm text-muted">Không có công việc nào cần xếp.</p>
                  ) : (
                    schedule.days.map((d) => {
                      const items = schedule.entries.filter((e) => e.date === d.date);
                      if (items.length === 0) return null;
                      return (
                        <div key={d.date} className="rounded-lg border border-border p-2.5">
                          <p className="flex items-center justify-between text-xs font-semibold">
                            {formatDayLabel(parseDate(d.date))}
                            <span className="font-normal text-muted">{d.minutes} phút</span>
                          </p>
                          <ul className="mt-1.5 space-y-1">
                            {items.map((e) => {
                              const t = taskById.get(e.taskId);
                              return t ? (
                                <li key={`${e.taskId}-${e.date}`} className="flex items-center justify-between gap-2 text-xs">
                                  <span className={cn("truncate", e.late && "text-red-500")} title={t.title}>
                                    {t.title}
                                    {e.late && " (trễ)"}
                                  </span>
                                  <span className="shrink-0 text-muted">{e.minutes}p</span>
                                </li>
                              ) : null;
                            })}
                          </ul>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
              <div className="mt-3 rounded-lg bg-indigo-500/10 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300">
                Đây là <b>đề xuất</b> — bạn cần xác nhận trước khi áp dụng.
              </div>
              <Button className="mt-3 w-full" onClick={() => void applySchedule()}>
                Duyệt &amp; áp dụng ngày bắt đầu
              </Button>
            </>
          ) : aiLoading ? (
            <div className="flex flex-col items-center gap-3 py-10 text-muted">
              <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
              <p className="text-sm">AI đang thiết kế lịch học cho bạn…</p>
            </div>
          ) : aiError ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-red-200 bg-red-500/10 px-3 py-3 text-sm text-red-600 dark:border-red-500/30 dark:text-red-300">{aiError}</div>
              <Button className="w-full" onClick={() => void runAI()}>
                Thử lại
              </Button>
            </div>
          ) : (
            <>
              <Button className="w-full bg-gradient-to-r from-violet-600 to-indigo-600" onClick={() => void runAI()}>
                <Bot className="h-4 w-4" /> Có AI đề xuất lịch
              </Button>
              {aiPlan ? (
                <div className="mt-4 space-y-3">
                  {aiPlan.summary && <p className="rounded-lg bg-violet-500/10 px-3 py-2 text-xs text-violet-700 dark:text-violet-300">{aiPlan.summary}</p>}
                  <div className="max-h-56 space-y-2.5 overflow-y-auto pr-1">
                    {aiPlan.days.map((d) => (
                      <div key={d.date} className="rounded-lg border border-border p-2.5">
                        <p className="text-xs font-semibold">{formatDayLabel(parseDate(d.date))}</p>
                        <ul className="mt-1.5 space-y-1">
                          {d.items.map((it, idx) => (
                            <li key={idx} className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate" title={it.reason || it.taskTitle}>{it.taskTitle}</span>
                              <span className="shrink-0 text-muted">{it.minutes}p</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {aiPlan.newTasks.length > 0 && (
                    <div className="rounded-lg border border-dashed border-violet-300/60 p-3 dark:border-violet-500/30">
                      <p className="text-xs font-semibold text-violet-600 dark:text-violet-300">Gợi ý nhiệm vụ mới</p>
                      <ul className="mt-2 space-y-1.5">
                        {aiPlan.newTasks.map((t, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate">{t.title}</span>
                            <button className="shrink-0 font-medium text-indigo-600 hover:underline dark:text-indigo-300" onClick={() => void createFromAI([t])}>
                              + Tạo
                            </button>
                          </li>
                        ))}
                      </ul>
                      <Button variant="secondary" className="mt-2 w-full text-xs" onClick={() => void createFromAI(aiPlan.newTasks)}>
                        Tạo tất cả ({aiPlan.newTasks.length})
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-xs text-muted">AI sẽ đọc toàn bộ nhiệm vụ, deadline &amp; thời gian bạn có để không ra phương án. Bấm nút trên để bắt đầu.</p>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Bảng 7 ngày — kéo thả deadline */}
      <Card className="card-lift animate-fade-up p-5" style={{ animationDelay: "280ms" }}>
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <CalendarRange className="h-4 w-4 text-indigo-500" /> Bảng tuần 7 ngày
        </h2>
        <p className="mb-3 text-xs text-muted">Kéo nhiệm vụ sang ngày khác để đổi deadline.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {weekDays.map((d) => {
            const isToday = d === today;
            const items = tasksByDay.get(d) ?? [];
            return (
              <div
                key={d}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(d);
                }}
                onDragLeave={() => setDragOver((p) => (p === d ? null : p))}
                onDrop={() => void handleDrop(d)}
                className={cn(
                  "min-h-32 rounded-lg border p-2 transition-colors",
                  isToday ? "border-indigo-400/70 bg-indigo-500/5" : "border-border bg-surface-2/40",
                  dragOver === d && "border-violet-500 bg-violet-500/10"
                )}
              >
                <p className={cn("mb-2 text-center text-[11px] font-semibold", isToday && "text-indigo-600 dark:text-indigo-300")}>
                  {formatDayLabel(parseDate(d)).split(",")[0]}
                </p>
                <ul className="space-y-1">
                  {items.map((t) => {
                    const course = t.courseId ? courseMap.get(t.courseId) : null;
                    return (
                      <li
                        key={t.id}
                        draggable
                        onDragStart={() => setDragId(t.id)}
                        onDragEnd={() => setDragId(null)}
                        className="cursor-grab rounded-md border border-border bg-surface p-1.5 text-[10px] leading-tight shadow-sm transition-transform hover:scale-[1.03] active:cursor-grabbing"
                        title={`${t.title} — ${formatMinutes(t.estMinutes ?? 30)}`}
                      >
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: course?.color ?? "#94a3b8" }} />
                          <span className="truncate font-medium">{t.title}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      <TaskModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editingTask} />
    </div>
  );
}
