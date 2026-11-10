"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, LoadingBlock, ProgressBar } from "@/components/ui";
import { GoalModal } from "@/components/goal-modal";
import { useData } from "@/lib/data";
import { useToast } from "@/lib/toast";
import { formatMinutes } from "@/lib/date";
import { goalProgress } from "@/lib/stats";
import { cn } from "@/lib/utils";
import type { Goal } from "@/lib/types";

export default function GoalsPage() {
  const { loading, goals, tasks, sessions, deleteGoal } = useData();
  const { push } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

  const rows = useMemo(() => goals.map((g) => goalProgress(g, tasks, sessions)), [goals, tasks, sessions]);

  // Thông báo chúc mừng khi một mục tiêu được hoàn thành (chỉ nhắc 1 lần mỗi đạt)
  const achievedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const row of rows) {
      if (row.achieved && !achievedRef.current.has(row.goal.id)) {
        achievedRef.current.add(row.goal.id);
        push(`🎉 Chúc mừng! Bạn đã hoàn thành mục tiêu: ${goalTitleMetri(row)}`, "success");
      }
      if (!row.achieved && achievedRef.current.has(row.goal.id)) {
        // Mục tiêu bị hụt lại (nhiệm vụ bỏ hoàn thành...) → cho phép nhắc lại lần đạt tới
        achievedRef.current.delete(row.goal.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const removeGoal = async (goal: Goal) => {
    if (!window.confirm("Xóa mục tiêu này?")) return;
    try {
      await deleteGoal(goal.id);
    } catch {
      /* đã có toast lỗi */
    }
  };

  if (loading) return <LoadingBlock />;

  const daily = rows.filter((r) => r.goal.scope === "daily");
  const weekly = rows.filter((r) => r.goal.scope === "weekly");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Mục tiêu học tập</h2>
          <p className="text-sm text-muted">Đặt mục tiêu mỗi ngày/mỗi tuần, theo dõi trực tiếp tiến độ đạt được.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Đặt mục tiêu
        </Button>
      </div>

      {goals.length === 0 ? (
        <EmptyState
          icon={<Target className="h-12 w-12" />}
          title="Bạn chưa đặt mục tiêu nào"
          hint="Ví dụ: “Hoàn thành 3 nhiệm vụ mỗi ngày” hoặc “Học 120 phút mỗi ngày”."
        />
      ) : (
        <>
          <Section title="Mục tiêu hằng ngày" rows={daily} onEdit={(g) => {setEditing(g); setModalOpen(true);}} onDelete={removeGoal} />
          <Section title="Mục tiêu hằng tuần" rows={weekly} onEdit={(g) => {setEditing(g); setModalOpen(true);}} onDelete={removeGoal} />
        </>
      )}

      <GoalModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} />
    </div>
  );
}

function goalTitleMetri(row: ReturnType<typeof goalProgress>): string {
  const g = row.goal;
  return g.metric === "tasks"
    ? `${row.current}/${row.target} nhiệm vụ ${g.scope === "daily" ? "hôm nay" : "tuần này"}`
    : `${formatMinutes(row.current)}/${formatMinutes(row.target)} ${g.scope === "daily" ? "hôm nay" : "tuần này"}`;
}

function Section({
  title,
  rows,
  onEdit,
  onDelete,
}: {
  title: string;
  rows: ReturnType<typeof goalProgress>[];
  onEdit: (g: Goal) => void;
  onDelete: (g: Goal) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-muted">{title}</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row, i) => (
          <Card
            key={row.goal.id}
            className={cn("group card-lift animate-fade-up relative p-5 hover:border-indigo-300/60 dark:hover:border-indigo-500/30", row.achieved && "ring-2 ring-emerald-500/60")}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", row.achieved ? "bg-emerald-600 text-white" : "bg-gradient-to-br from-indigo-500 to-violet-600 text-white")}>
                  {row.achieved ? <Check className="h-5 w-5" /> : <Target className="h-5 w-5" />}
                </span>
                <div>
                  <p className="font-semibold">
                    {row.goal.scope === "daily" ? "Mục tiêu hôm nay" : "Mục tiêu tuần này"}
                  </p>
                  <p className="text-xs text-muted">
                    {row.goal.metric === "minutes"
                      ? `Học ${formatMinutes(row.goal.target)}`
                      : `Hoàn thành ${row.goal.target} nhiệm vụ`}
                  </p>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => onEdit(row.goal)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-indigo-500" aria-label="Sửa mục tiêu" title="Sửa">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => onDelete(row.goal)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-red-500" aria-label="Xóa mục tiêu" title="Xóa">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-end justify-between">
              <p className="text-2xl font-bold">
                {row.goal.metric === "minutes" ? formatMinutes(row.current) : row.current}
                <span className="ml-1 text-sm font-normal text-muted">/ {row.goal.metric === "minutes" ? formatMinutes(row.target) : row.target}</span>
              </p>
              <Badge
                className={cn(
                  row.achieved
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                    : row.percent >= 50
                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400"
                      : "bg-surface-2 text-muted"
                )}
              >
                {row.achieved ? "Đã đạt ✓" : `${row.percent}%`}
              </Badge>
            </div>
            <div className="mt-2.5">
              <ProgressBar percent={row.percent} color={row.achieved ? "bg-emerald-500" : "bg-gradient-to-r from-indigo-500 to-violet-500"} />
            </div>
            {row.goal.note && <p className="mt-3 rounded-lg bg-surface-2/60 p-2.5 text-xs text-muted">“{row.goal.note}”</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}
