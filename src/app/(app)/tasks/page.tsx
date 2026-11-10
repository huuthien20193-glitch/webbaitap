"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  CircleCheckBig,
  Clock,
  Flame,
  ListPlus,
  ListTodo,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { Badge, Button, Card, EmptyState, LoadingBlock, ProgressBar, SelectField } from "@/components/ui";
import { TaskModal } from "@/components/task-modal";
import { useData } from "@/lib/data";
import { formatDueLabel, formatMinutes, todayStr } from "@/lib/date";
import { priorityScore } from "@/lib/planner";
import { cn } from "@/lib/utils";
import { PRIORITY_ORDER, type Priority, type Task, type TaskStatus } from "@/lib/types";
import { useToast } from "@/lib/toast";

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Chưa bắt đầu",
  in_progress: "Đang thực hiện",
  done: "Hoàn thành",
};

const STATUS_BADGE: Record<TaskStatus, string> = {
  todo: "bg-surface-2 text-muted",
  in_progress: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
};

const PRIORITY_LABEL: Record<Priority, string> = { low: "Thấp", medium: "Trung bình", high: "Cao" };
const PRIORITY_BADGE: Record<Priority, string> = {
  low: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  high: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

type StatusFilter = "all" | TaskStatus;
type PriorityFilter = "all" | Priority;
type SortMode = "smart" | "due" | "newest";

export default function TasksPage() {
  const { loading, tasks, courses, updateTask, deleteTask } = useData();
  const { push } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<SortMode>("smart");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  // Tiến từ tìm kiếm header (studyflow:taskq)
  useEffect(() => {
    try {
      const q = sessionStorage.getItem("studyflow:taskq");
      if (q) {
        setSearch(q);
        sessionStorage.removeItem("studyflow:taskq");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const today = todayStr();

  // Điểm ưu tiên v2 (tính 1 lần cho tất cả)
  const scores = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) m.set(t.id, priorityScore(t, today).score);
    return m;
  }, [tasks, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = tasks
      .filter((t) => (statusFilter === "all" ? true : t.status === statusFilter))
      .filter((t) => (priorityFilter === "all" ? true : t.priority === priorityFilter))
      .filter((t) => (courseFilter === "all" ? true : t.courseId === courseFilter))
      .filter((t) => {
        if (!q) return true;
        const course = t.courseId ? courseMap.get(t.courseId)?.name ?? "" : "";
        return t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || course.toLowerCase().includes(q);
      });

    return out.sort((a, b) => {
      if (sortMode === "smart") {
        const sa = scores.get(a.id) ?? 0;
        const sb = scores.get(b.id) ?? 0;
        if (sa !== sb) return sb - sa;
      }
      if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority]) return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      return sortMode === "newest" ? b.createdAt.localeCompare(a.createdAt) : a.dueDate.localeCompare(b.dueDate);
    });
  }, [tasks, search, statusFilter, priorityFilter, courseFilter, sortMode, scores, courseMap]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      todo: tasks.filter((t) => t.status === "todo").length,
      in_progress: tasks.filter((t) => t.status === "in_progress").length,
      done: tasks.filter((t) => t.status === "done").length,
      openMinutes: tasks.filter((t) => t.status !== "done").reduce((sum, t) => sum + (t.estMinutes ?? 0), 0),
    }),
    [tasks]
  );

  const toggleStatus = async (task: Task) => {
    try {
      if (task.status === "done") {
        await updateTask(task.id, { status: "in_progress", completedAt: null });
        push("Đã quay lại trạng thái chưa hoàn thành", "info");
      } else {
        await updateTask(task.id, { status: "done", progress: 100, completedAt: new Date().toISOString() });
        push("Chúc mừng! Một nhiệm vụ đã hoàn thành 🎉", "success");
      }
    } catch {
      // toast lỗi đã hiển thị từ DataProvider
    }
  };

  const removeTask = async (task: Task) => {
    if (!window.confirm(`Xóa nhiệm vụ "${task.title}"? Hành động này không thể hoàn tác.`)) return;
    try {
      await deleteTask(task.id);
    } catch {
      /* đã có toast lỗi */
    }
  };

  if (loading) return <LoadingBlock />;

  return (
    <div className="space-y-5">
      {/* Thanh công cụ */}
      <Card className="card-lift animate-fade-up p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input-base pl-9"
              placeholder="Tìm kiếm nhiệm vụ, mô tả hoặc môn học..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm kiếm nhiệm vụ"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SelectField id="f-status" label="" error={null} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="all">Tất cả trạng thái ({counts.all})</option>
              <option value="todo">Chưa bắt đầu ({counts.todo})</option>
              <option value="in_progress">Đang thực hiện ({counts.in_progress})</option>
              <option value="done">Hoàn thành ({counts.done})</option>
            </SelectField>
            <SelectField id="f-priority" label="" error={null} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}>
              <option value="all">Mọi mức ưu tiên</option>
              <option value="high">Ưu tiên cao</option>
              <option value="medium">Trung bình</option>
              <option value="low">Thấp</option>
            </SelectField>
            <SelectField id="f-course" label="" error={null} value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
              <option value="all">Tất cả môn học</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <SelectField id="f-sort" label="" error={null} value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
              <option value="smart">Sắp xếp: Thông minh (AI)</option>
              <option value="due">Sắp xếp: Deadline</option>
              <option value="newest">Sắp xếp: Mới nhất</option>
            </SelectField>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="shrink-0"
          >
            <ListPlus className="h-4 w-4" /> Thêm nhiệm vụ
          </Button>
        </div>
        {(sortMode === "smart" || counts.openMinutes > 0) && (
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            {sortMode === "smart" && <span>Danh sách xếp theo điểm ưu tiên: deadline, độ khó, độ quan trọng và tiến độ (thuật toán v2).</span>}
            {counts.openMinutes > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {formatMinutes(counts.openMinutes)} còn lại cho {counts.all - counts.done} nhiệm vụ mở
              </span>
            )}
          </p>
        )}
      </Card>

      {/* Danh sách nhiệm vụ */}
      {counts.all === 0 ? (
        <EmptyState
          icon={<ListTodo className="h-12 w-12" />}
          title="Bạn chưa có nhiệm vụ nào"
          hint="Bấm “Thêm nhiệm vụ” để bắt đầu lập kế hoạch học tập cho mình."
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search className="h-12 w-12" />} title="Không tìm thấy nhiệm vụ phù hợp" hint="Thử đổi từ khóa hoặc bỏ bớt bộ lọc." />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((task, i) => {
            const course = task.courseId ? courseMap.get(task.courseId) : null;
            const overdue = task.status !== "done" && task.dueDate < today;
            const score = scores.get(task.id) ?? 0;
            const progress = task.status === "done" ? 100 :(task.progress ?? 0);
            return (
              <Card
                key={task.id}
                className={cn("group card-lift animate-fade-up p-4 hover:border-indigo-300/60 dark:hover:border-indigo-500/30", task.status === "done" && "opacity-70")}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleStatus(task)}
                    className={cn("mt-0.5 shrink-0 transition-colors", task.status === "done" ? "text-emerald-500" : "text-muted hover:text-emerald-500")}
                    aria-label={task.status === "done" ? "Bỏ hoàn thành" : "Đánh dấu hoàn thành"}
                    title={task.status === "done" ? "Bỏ hoàn thành" : "Đánh dấu hoàn thành"}
                  >
                    {task.status === "done" ? <CircleCheckBig className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                  </button>

                  <div className="h-full w-1.5 shrink-0 self-stretch rounded-full" style={{ backgroundColor: course?.color ?? "#cbd5e1" }} aria-hidden />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={cn("text-sm font-semibold", task.status === "done" && "line-through")}>{task.title}</p>
                      <Badge className={STATUS_BADGE[task.status]}>{STATUS_LABEL[task.status]}</Badge>
                      <Badge className={PRIORITY_BADGE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
                      {overdue && <Badge className="bg-red-100 font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">Quá hạn</Badge>}
                      {task.status !== "done" && task.difficulty >= 4 && (
                        <Badge className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400">
                          <Flame className="h-3 w-3" /> Khó
                        </Badge>
                      )}
                    </div>
                    {task.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{task.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      {course && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: course.color }} />
                          {course.name}
                        </span>
                      )}
                      <span>Bắt đầu: {formatDueLabel(task.startDate)}</span>
                      <span className={cn(overdue && "font-semibold text-red-500")}>
                        <Clock className="mr-0.5 inline h-3 w-3" /> Hạn: {formatDueLabel(task.dueDate)}
                      </span>
                      <Badge className="bg-surface-2 text-muted">{formatMinutes(task.estMinutes ?? 0)}</Badge>
                      {task.status !== "done" && score > 0 && (
                        <Badge className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">Ưu tiên {score}</Badge>
                      )}
                    </div>
                    {(progress > 0 && task.status !== "done") && (
                      <div className="mt-2.5 max-w-sm">
                        <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                          <span>Tiến độ</span>
                          <span className="font-semibold">{progress}%</span>
                        </div>
                        <ProgressBar percent={progress} color="bg-gradient-to-r from-indigo-500 to-violet-500" />
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => {
                        setEditing(task);
                        setModalOpen(true);
                      }}
                      className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-indigo-500"
                      aria-label="Sửa nhiệm vụ"
                      title="Sửa"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => removeTask(task)}
                      className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-red-500"
                      aria-label="Xóa nhiệm vụ"
                      title="Xóa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <TaskModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} />
    </div>
  );
}
