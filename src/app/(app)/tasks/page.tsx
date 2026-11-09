"use client";

import { useMemo, useState } from "react";
import {
  Circle,
  CircleCheckBig,
  Clock,
  ListPlus,
  ListTodo,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { Badge, Button, Card, EmptyState, LoadingBlock, SelectField } from "@/components/ui";
import { TaskModal } from "@/components/task-modal";
import { useData } from "@/lib/data";
import { formatDueLabel, todayStr } from "@/lib/date";
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
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
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

export default function TasksPage() {
  const { loading, tasks, subjects, updateTask, deleteTask } = useData();
  const { push } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks
      .filter((t) => (statusFilter === "all" ? true : t.status === statusFilter))
      .filter((t) => (priorityFilter === "all" ? true : t.priority === priorityFilter))
      .filter((t) => (subjectFilter === "all" ? true : t.subjectId === subjectFilter))
      .filter((t) => {
        if (!q) return true;
        const subject = t.subjectId ? subjectMap.get(t.subjectId)?.name ?? "" : "";
        return t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || subject.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const w: Record<TaskStatus, number> = { done: 2, in_progress: 1, todo: 0 };
        if (w[a.status] !== w[b.status]) return w[a.status] - w[b.status];
        if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority]) return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [tasks, search, statusFilter, priorityFilter, subjectFilter, subjectMap]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      todo: tasks.filter((t) => t.status === "todo").length,
      in_progress: tasks.filter((t) => t.status === "in_progress").length,
      done: tasks.filter((t) => t.status === "done").length,
    }),
    [tasks]
  );

  const toggleStatus = async (task: Task) => {
    try {
      if (task.status === "done") {
        await updateTask(task.id, { status: "in_progress", completedAt: null });
        push("Đã quay lại trạng thái chưa hoàn thành", "info");
      } else {
        await updateTask(task.id, { status: "done", completedAt: new Date().toISOString() });
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
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            <SelectField id="f-subject" label="" error={null} value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
              <option value="all">Tất cả môn học</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
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
            const subject = task.subjectId ? subjectMap.get(task.subjectId) : null;
            const overdue = task.status !== "done" && task.dueDate < todayStr();
            return (
              <Card
                key={task.id}
                className={cn("group card-lift animate-fade-up p-4 hover:border-blue-300/60 dark:hover:border-blue-500/30", task.status === "done" && "opacity-70")}
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

                  <div className="h-full w-1.5 shrink-0 self-stretch rounded-full" style={{ backgroundColor: subject?.color ?? "#cbd5e1" }} aria-hidden />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={cn("text-sm font-semibold", task.status === "done" && "line-through")}>{task.title}</p>
                      <Badge className={STATUS_BADGE[task.status]}>{STATUS_LABEL[task.status]}</Badge>
                      <Badge className={PRIORITY_BADGE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
                      {overdue && <Badge className="bg-red-100 font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">Quá hạn</Badge>}
                    </div>
                    {task.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{task.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      {subject && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: subject.color }} />
                          {subject.name}
                        </span>
                      )}
                      <span>Bắt đầu: {formatDueLabel(task.startDate)}</span>
                      <span className={cn(overdue && "font-semibold text-red-500")}>
                        <Clock className="mr-0.5 inline h-3 w-3" /> Hạn: {formatDueLabel(task.dueDate)}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => {
                        setEditing(task);
                        setModalOpen(true);
                      }}
                      className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-blue-500"
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
