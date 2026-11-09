"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Modal, Button, TextField, TextArea, SelectField } from "@/components/ui";
import { useData } from "@/lib/data";
import type { Goal, GoalMetric, GoalScope } from "@/lib/types";

export interface GoalModalProps {
  open: boolean;
  onClose: () => void;
  editing?: Goal | null;
}

export function GoalModal({ open, onClose, editing }: GoalModalProps) {
  const { addGoal, updateGoal } = useData();
  const [scope, setScope] = useState<GoalScope>("daily");
  const [metric, setMetric] = useState<GoalMetric>("tasks");
  const [target, setTarget] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setScope(editing.scope);
      setMetric(editing.metric);
      setTarget(String(editing.target));
      setNote(editing.note);
    } else {
      setScope("daily");
      setMetric("tasks");
      setTarget("1");
      setNote("");
    }
    setError(null);
  }, [open, editing]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(target);
    if (!target.trim() || Number.isNaN(n) || n <= 0 || !Number.isInteger(n)) {
      setError("Mục tiêu phải là số nguyên dương.");
      return;
    }
    if (metric === "minutes" && n > 24 * 60) {
      setError("Mục tiêu thời gian tối đa 1440 phút/ngày (hoặc tuần).");
      return;
    }
    setSaving(true);
    try {
      const payload = { scope, metric, target: n, note: note.trim(), createdAt: new Date().toISOString() };
      if (editing) await updateGoal(editing.id, payload);
      else await addGoal(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Sửa mục tiêu" : "Đặt mục tiêu mới"}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <SelectField id="goal-scope" label="Chu kỳ" value={scope} onChange={(e) => setScope(e.target.value as GoalScope)}>
            <option value="daily">Hằng ngày</option>
            <option value="weekly">Hằng tuần</option>
          </SelectField>
          <SelectField id="goal-metric" label="Chỉ số" value={metric} onChange={(e) => setMetric(e.target.value as GoalMetric)}>
            <option value="tasks">Số nhiệm vụ hoàn thành</option>
            <option value="minutes">Thời gian học (phút)</option>
          </SelectField>
        </div>
        <TextField
          id="goal-target"
          label={metric === "minutes" ? "Mục tiêu (phút)" : "Mục tiêu (nhiệm vụ)"}
          type="number"
          min={1}
          max={1440}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          error={error}
          required
        />
        <TextArea id="goal-note" label="Ghi chú (tùy chọn)" placeholder="Ví dụ: Giữ vững phong độ mỗi tối sau ăn cơm" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? "Lưu thay đổi" : "Đặt mục tiêu"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
