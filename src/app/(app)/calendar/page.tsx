"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CalendarRange, CalendarX2, ChevronLeft, ChevronRight, ListPlus, Plus } from "lucide-react";
import { Badge, Button, Card, EmptyState, LoadingBlock } from "@/components/ui";
import { TaskModal } from "@/components/task-modal";
import { useData } from "@/lib/data";
import {
  SHORT_DAYS,
  addDays,
  formatDueLabel,
  formatFullDate,
  isSameDay,
  isSameMonth,
  startOfWeek,
  toDateStr,
  todayStr,
} from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";

type ViewMode = "day" | "week" | "month";

const MODE_LABEL: Record<ViewMode, string> = { day: "Ngày", week: "Tuần", month: "Tháng" };

export default function CalendarPage() {
  const { loading, tasks, subjects, deleteTask } = useData();
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => todayStr());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);

  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const today = todayStr();

  const tasksFor = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      // Gắn nhiệm vụ vào deadline chính; nếu same-day start cũng thuộc ngày đó
      for (const d of new Set([t.dueDate, t.startDate])) {
        if (d) {
          const arr = map.get(d) ?? [];
          if (!arr.includes(t)) arr.push(t);
          map.set(d, arr);
        }
      }
    }
    // Sắp xếp trong ngày: chưa xong trước, ưu tiên cao trước, deadline sớm trước
    map.forEach((list, key) => {
      const w: Record<Task["status"], number> = { todo: 0, in_progress: 1, done: 2 };
      const p: Record<Task["priority"], number> = { high: 0, medium: 1, low: 2 };
      list.sort((a, b) => w[a.status] - w[b.status] || p[a.priority] - p[b.priority] || a.dueDate.localeCompare(b.dueDate));
      map.set(key, list);
    });
    return map;
  }, [tasks]);

  /* ── Điều hướng ─────────────────────────────────────── */

  const stepMonth = (dir: number) => {
    const next = new Date(cursor);
    next.setDate(1);
    next.setMonth(next.getMonth() + dir);
    setCursor(next);
    setSelectedDate(toDateStr(next));
  };

  const stepDay = (dir: number) => {
    setCursor((c) => addDays(c, dir));
    setSelectedDate(toDateStr(addDays(cursor, dir)));
  };

  const goToday = () => {
    const now = new Date();
    setCursor(now);
    setSelectedDate(todayStr());
  };

  const monthCells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)), [cursor]);

  const openCreate = (dateStr: string) => {
    setEditing(null);
    setPrefillDate(dateStr);
    setModalOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setPrefillDate(null);
    setModalOpen(true);
  };

  if (loading) return <LoadingBlock />;

  const heading =
    view === "month"
      ? new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(cursor)
      : view === "week"
        ? `Tuần ${formatDueLabel(toDateStr(startOfWeek(cursor)))} – ${formatDueLabel(toDateStr(addDays(startOfWeek(cursor), 6)))}`
        : formatFullDate(toDateStr(cursor));

  return (
    <div className="space-y-4">
      {/* Thanh điều hướng */}
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => (view === "month" ? stepMonth(-1) : stepDay(-1))} aria-label="Lùi lại">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="secondary" onClick={() => (view === "month" ? stepMonth(1) : stepDay(1))} aria-label="Tiếp">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={goToday}>
            Hôm nay
          </Button>
          <h2 className="ml-2 text-sm font-semibold capitalize sm:text-base">{heading}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-surface-2 p-1">
            {(Object.keys(MODE_LABEL) as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setView(m)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  view === m ? "bg-blue-600 text-white shadow-card" : "text-muted hover:text-foreground"
                )}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setPrefillDate(selectedDate);
              setModalOpen(true);
            }}
          >
            <ListPlus className="h-4 w-4" /> Thêm nhiệm vụ
          </Button>
        </div>
      </Card>

      {tasks.length === 0 && (
        <EmptyState
          icon={<CalendarDays className="h-12 w-12" />}
          title="Lịch trống — chưa có nhiệm vụ nào"
          hint="Bấm vào một ngày trong lịch để tạo nhiệm vụ ngay tại đó."
        />
      )}

      {/* Chế độ THÁNG */}
      {view === "month" && (
        <Card className="p-2 sm:p-4">
          <div className="grid grid-cols-7 gap-1.5 pb-2 text-center text-xs font-medium text-muted">
            {SHORT_DAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {monthCells.map((d) => {
              const ds = toDateStr(d);
              const dayTasks = tasksFor.get(ds) ?? [];
              const inMonth = isSameMonth(d, cursor);
              const isToday = ds === today;
              const isSelected = ds === selectedDate;
              return (
                <button
                  key={ds}
                  onClick={() => {
                    setSelectedDate(ds);
                    setCursor(d);
                    openCreate(ds);
                  }}
                  className={cn(
                    "group flex min-h-[92px] flex-col rounded-lg border p-1.5 text-left transition-colors sm:min-h-[110px]",
                    inMonth ? "border-border bg-surface" : "border-transparent bg-surface-2/40 text-muted",
                    isSelected ? "ring-2 ring-blue-500" : "hover:bg-surface-2"
                  )}
                  title={`Thêm nhiệm vụ ngày ${formatFullDate(ds)}`}
                >
                  <span
                    className={cn(
                      "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                      isToday && "bg-blue-600 text-white",
                      !isToday && inMonth && "text-foreground",
                      !isToday && !inMonth && "text-muted"
                    )}
                  >
                    {d.getDate()}
                  </span>
                  <div className="flex-1 space-y-1 overflow-hidden">
                    {dayTasks.slice(0, 3).map((t) => {
                      const s = t.subjectId ? subjectMap.get(t.subjectId) : null;
                      const overdue = t.status !== "done" && t.dueDate < today;
                      return (
                        <span
                          key={t.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(t);
                          }}
                          className={cn(
                            "block truncate rounded px-1 py-0.5 text-[10px] leading-tight sm:text-[11px]",
                            t.status === "done" && "line-through opacity-60"
                          )}
                          style={{
                            backgroundColor: `${overdue ? "#ef4444" : (s?.color ?? "#94a3b8")}22`,
                            color: overdue ? "#ef4444" : (s?.color ?? "#64748b"),
                            borderLeft: `2.5px solid ${overdue ? "#ef4444" : (s?.color ?? "#94a3b8")}`,
                          }}
                        >
                          {t.title}
                        </span>
                      );
                    })}
                    {dayTasks.length > 3 && <span className="block px-1 text-[10px] text-muted">+{dayTasks.length - 3} nữa</span>}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 px-2 text-xs text-muted">Chú thích: ô viền đỏ là nhiệm vụ quá hạn hoặc đến hạn hôm nay; các ô màu khác là màu đại diện của môn học.</p>
        </Card>
      )}

      {/* Chế độ TUẦN */}
      {view === "week" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
          {weekDays.map((d) => {
            const ds = toDateStr(d);
            const dayTasks = tasksFor.get(ds) ?? [];
            const isToday = ds === today;
            return (
              <Card key={ds} className={cn("flex min-h-[180px] flex-col p-3", isToday && "ring-2 ring-blue-500")}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted">{SHORT_DAYS[(d.getDay() + 6) % 7]}</p>
                    <p className={cn("text-sm font-semibold", isToday && "text-blue-600 dark:text-blue-400")}>
                      {d.getDate()}/{d.getMonth() + 1}
                    </p>
                  </div>
                  <button onClick={() => openCreate(ds)} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-blue-500" aria-label={`Thêm nhiệm vụ ngày ${ds}`}>
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 space-y-1.5">
                  {dayTasks.length === 0 ? (
                    <p className="text-[11px] text-muted">—</p>
                  ) : (
                    dayTasks.map((t) => {
                      const s = t.subjectId ? subjectMap.get(t.subjectId) : null;
                      const overdue = t.status !== "done" && t.dueDate < today;
                      return (
                        <button
                          key={t.id}
                          onClick={() => openEdit(t)}
                          className={cn("block w-full rounded-md border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight", t.status === "done" && "opacity-60 line-through")}
                          style={{
                            backgroundColor: `${overdue ? "#ef4444" : (s?.color ?? "#94a3b8")}1f`,
                            borderLeftColor: overdue ? "#ef4444" : (s?.color ?? "#94a3b8"),
                          }}
                        >
                          <span className="line-clamp-2">{t.title}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Chế độ NGÀY */}
      {view === "day" && (
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold capitalize">
              <CalendarRange className="h-4 w-4 text-blue-500" /> {formatFullDate(toDateStr(cursor))}
            </h3>
            <Button onClick={() => openCreate(toDateStr(cursor))}>
              <Plus className="h-4 w-4" /> Thêm cho ngày này
            </Button>
          </div>
          {(tasksFor.get(toDateStr(cursor)) ?? []).length === 0 ? (
            <EmptyState icon={<CalendarX2 className="h-10 w-10" />} title="Ngày này không có nhiệm vụ" hint="Bấm “Thêm cho ngày này” để tạo nhiệm vụ mới." />
          ) : (
            <ul className="space-y-2.5">
              {(tasksFor.get(toDateStr(cursor)) ?? []).map((t) => {
                const s = t.subjectId ? subjectMap.get(t.subjectId) : null;
                const overdue = t.status !== "done" && t.dueDate < today;
                return (
                  <li
                    key={t.id}
                    className="group flex items-center gap-3 rounded-lg border-l-4 bg-surface-2/40 px-3.5 py-3"
                    style={{ borderLeftColor: overdue ? "#ef4444" : (s?.color ?? "#94a3b8") }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium", t.status === "done" && "text-muted line-through")}>{t.title}</p>
                      <p className="text-xs text-muted">
                        {s?.name ?? "Không môn"} • {t.startDate === t.dueDate ? "Một ngày" : `Bắt đầu ${formatDueLabel(t.startDate)}`} • hạn {formatDueLabel(t.dueDate)}
                      </p>
                    </div>
                    {overdue && <Badge className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400">Quá hạn</Badge>}
                    <Badge
                      className={
                        t.status === "done"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                          : t.status === "in_progress"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400"
                            : "bg-surface-2 text-muted"
                      }
                    >
                      {t.status === "done" ? "Hoàn thành" : t.status === "in_progress" ? "Đang thực hiện" : "Chưa bắt đầu"}
                    </Badge>
                    <button
                      onClick={() => openEdit(t)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-surface hover:underline dark:text-blue-400"
                    >
                      Sửa
                    </button>
                    <button
                      onClick={async () => {
                        if (window.confirm(`Xóa nhiệm vụ "${t.title}"?`)) await deleteTask(t.id);
                      }}
                      className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-red-500"
                      aria-label="Xóa nhiệm vụ"
                    >
                      <CalendarX2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <TaskModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} defaultDate={prefillDate} />
    </div>
  );
}
