"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Coffee, Pause, Play, RotateCcw, Settings2, SkipForward, Timer as TimerIcon, Trash2 } from "lucide-react";
import { Badge, Button, Card, SelectField } from "@/components/ui";
import { useData } from "@/lib/data";
import { useToast } from "@/lib/toast";
import { formatClock, formatMinutes, formatTimeOfDay, toDateStr, todayStr } from "@/lib/date";
import { cn } from "@/lib/utils";
import { DEFAULT_POMODORO, type PomodoroSettings } from "@/lib/types";

type Phase = "focus" | "short" | "long";

const PHASE_LABEL: Record<Phase, string> = { focus: "Phiên học tập trung", short: "Nghỉ ngắn", long: "Nghỉ dài" };
const SESSION_KEY = "studyflow:pomodoro-settings";

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Sau n phiên tập trung, lần nghỉ tiếp theo là nghỉ dài nếu n chia hết longBreakEvery */
function nextBreak(n: number, every: number): Phase {
  return n > 0 && n % every === 0 ? "long" : "short";
}

export default function FocusPage() {
  const { sessions, subjects, addSession, deleteSession, loading } = useData();
  const { push } = useToast();

  const [settings, setSettings] = useState<PomodoroSettings>(DEFAULT_POMODORO);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("focus");
  const [remaining, setRemaining] = useState(DEFAULT_POMODORO.focusMin * 60);
  const [running, setRunning] = useState(false);
  const completedRef = useRef(0);
  const [completedFocus, setCompletedFocus] = useState(0);
  const [subjectId, setSubjectId] = useState("");
  const [saving, setSaving] = useState(false);

  const durationFor = useMemo(
    () => ({
      focus: settings.focusMin * 60,
      short: settings.shortBreakMin * 60,
      long: settings.longBreakMin * 60,
    }),
    [settings]
  );

  // Nạp cài đặt đã lưu từ lần trước
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<PomodoroSettings>;
        const merged: PomodoroSettings = {
          focusMin: clampInt(s.focusMin, 1, 180, DEFAULT_POMODORO.focusMin),
          shortBreakMin: clampInt(s.shortBreakMin, 1, 60, DEFAULT_POMODORO.shortBreakMin),
          longBreakMin: clampInt(s.longBreakMin, 1, 90, DEFAULT_POMODORO.longBreakMin),
          longBreakEvery: clampInt(s.longBreakEvery, 2, 10, DEFAULT_POMODORO.longBreakEvery),
        };
        setSettings(merged);
        setRemaining(merged.focusMin * 60);
      }
    } catch {
      /* giữ mặc định */
    }
  }, []);

  const recordSession = async (durationSec: number) => {
    if (durationSec <= 0) return;
    try {
      await addSession({
        subjectId: subjectId || null,
        startedAt: new Date(Date.now() - durationSec * 1000).toISOString(),
        durationSec,
        note: "Pomodoro",
      });
    } catch {
      /* đã có toast lỗi từ DataProvider */
    }
  };

  // completePhase luôn dùng state mới nhất → gán qua ref mỗi render
  const completePhaseRef = useRef<() => void>(async () => {});
  completePhaseRef.current = async () => {
    setRunning(false);
    if (phase === "focus") {
      const done = completedRef.current + 1;
      completedRef.current = done;
      setCompletedFocus(done);
      push(`Hoàn thành ${settings.focusMin} phút tập trung! Giờ đến lúc nghỉ ngơi ☕`, "success");
      setSaving(true);
      await recordSession(settings.focusMin * 60);
      setSaving(false);
      const next = nextBreak(done, settings.longBreakEvery);
      setPhase(next);
      setRemaining(durationFor[next]);
    } else {
      push("Hết giờ nghỉ — bắt đầu phiên học mới nhé! 💪", "info");
      setPhase("focus");
      setRemaining(durationFor.focus);
    }
  };

  // Đồng hồ chạy mỗi giây khi running
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          window.setTimeout(() => void completePhaseRef.current?.(), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const changePhase = (next: Phase) => {
    setRunning(false);
    setPhase(next);
    setRemaining(durationFor[next]);
  };

  const reset = () => {
    setRunning(false);
    setRemaining(durationFor[phase]);
  };

  const skip = () => {
    // Nếu đang trong phiên học và đã chạy được một phần → ghi nhận phần đã học
    if (phase === "focus" && remaining < durationFor.focus) {
      void recordSession(durationFor.focus - remaining);
      if (remaining < durationFor.focus) {
        completedRef.current += 1;
        setCompletedFocus(completedRef.current);
      }
    }
    const target = phase === "focus" ? nextBreak(completedRef.current, settings.longBreakEvery) : "focus";
    changePhase(target);
  };

  /* ── Thống kê tập trung ───────────────────────────────── */

  const today = todayStr();
  const todayMinutes = useMemo(
    () => Math.round(sessions.filter((s) => toDateStr(new Date(s.startedAt)) === today).reduce((sum, s) => sum + s.durationSec, 0) / 60),
    [sessions, today]
  );
  const last7From = new Date();
  last7From.setDate(last7From.getDate() - 6);
  last7From.setHours(0, 0, 0, 0);
  const weekMinutes = useMemo(
    () => Math.round(sessions.filter((s) => new Date(s.startedAt) >= last7From).reduce((sum, s) => sum + s.durationSec, 0) / 60),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions]
  );
  const totalMinutes = useMemo(() => Math.round(sessions.reduce((sum, s) => sum + s.durationSec, 0) / 60), [sessions]);

  const percent = 1 - remaining / Math.max(1, durationFor[phase]);
  const R = 42;
  const C = 2 * Math.PI * R;
  const ringColor = phase === "focus" ? "#3b82f6" : phase === "short" ? "#10b981" : "#8b5cf6";

  const recent = useMemo(() => sessions.slice().reverse().slice(0, 10), [sessions]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Phiên học tập trung</h2>
          <p className="text-sm text-muted">Mặc định học sâu 25 phút – nghỉ 5 phút, có thể tùy chỉnh thoải mái.</p>
        </div>
        <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
          <Settings2 className="h-4 w-4" /> Tùy chỉnh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Đồng hồ */}
        <Card className="flex flex-col items-center p-6 lg:col-span-2">
          <div className="mb-4 flex rounded-lg border border-border bg-surface-2 p-1">
            {(Object.keys(PHASE_LABEL) as Phase[]).map((p) => (
              <button
                key={p}
                onClick={() => changePhase(p)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  phase === p && (p === "focus" ? "bg-blue-600 text-white shadow-card" : p === "short" ? "bg-emerald-600 text-white shadow-card" : "bg-violet-600 text-white shadow-card"),
                  phase !== p && "text-muted hover:text-foreground"
                )}
              >
                {p === "focus" ? "Tập trung" : p === "short" ? "Nghỉ ngắn" : "Nghỉ dài"}
              </button>
            ))}
          </div>

          <div className="relative h-56 w-56">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle cx="50" cy="50" r={R} fill="none" stroke="rgb(var(--surface-2))" strokeWidth="7" />
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={ringColor}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - percent)}
                style={{ transition: "stroke-dashoffset 0.85s linear, stroke 0.4s ease" }}
                className={running ? "animate-pulse-soft" : undefined}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold tabular-nums">{formatClock(remaining)}</span>
              <span className="mt-1 text-xs text-muted">{PHASE_LABEL[phase]}</span>
              {running && saving && <span className="mt-0.5 text-[10px] text-muted">Đang ghi nhận phiên học...</span>}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <Button onClick={() => setRunning((r) => !r)} className="h-11 min-w-36 text-base">
              {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {running ? "Tạm dừng" : remaining < durationFor[phase] && remaining > 0 ? "Tiếp tục" : "Bắt đầu"}
            </Button>
            <Button variant="secondary" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Đặt lại
            </Button>
            <Button variant="ghost" onClick={skip} title="Bỏ qua giai đoạn hiện tại">
              <SkipForward className="h-4 w-4" /> Bỏ qua
            </Button>
          </div>

          <div className="mt-5 w-full max-w-xs">
            <SelectField id="pomo-subject" label="Môn đang học (tùy chọn)" error={null} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">— Không gắn môn —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          </div>

          <p className="mt-3 text-center text-xs text-muted">
            Vòng tập trung thứ {completedFocus + 1} • cứ {settings.longBreakEvery} phiên tập trung sẽ có một lần nghỉ dài {settings.longBreakMin} phút
          </p>
        </Card>

        {/* Thống kê */}
        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-semibold">
            <TimerIcon className="h-4 w-4 text-blue-500" /> Thời gian tập trung
          </h3>
          <div className="mt-4 space-y-2.5">
            <Stat label="Hôm nay" value={formatMinutes(todayMinutes)} />
            <Stat label="7 ngày qua" value={formatMinutes(weekMinutes)} />
            <Stat label="Tổng cộng" value={formatMinutes(totalMinutes)} />
          </div>

          <h4 className="mt-6 text-sm font-semibold">Phiên học gần đây</h4>
          {loading ? (
            <p className="mt-2 text-sm text-muted">Đang tải...</p>
          ) : recent.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Chưa có phiên nào. Hoàn thành phiên tập trung đầu tiên để được ghi nhận.</p>
          ) : (
            <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {recent.map((s) => {
                const subject = s.subjectId ? subjects.find((x) => x.id === s.subjectId) : null;
                return (
                  <li key={s.id} className="group flex items-center gap-2 rounded-md bg-surface-2/50 px-2.5 py-1.5 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: subject?.color ?? "#94a3b8" }} />
                    <span className="flex-1 truncate">{subject?.name ?? "Không môn"}</span>
                    <span className="shrink-0 text-muted">{Math.round(s.durationSec / 60)} phút</span>
                    <span className="shrink-0 text-muted">{formatTimeOfDay(s.startedAt)}</span>
                    <button
                      onClick={async () => {
                        if (window.confirm("Xóa phiên học này?")) await deleteSession(s.id);
                      }}
                      className="shrink-0 text-muted opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                      aria-label="Xóa phiên học"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4">
            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400">
              Mẹo: tắt thông báo điện thoại và để điện thoại ngoài tầm mắt khi tập trung.
            </Badge>
          </div>
        </Card>
      </div>

      {settingsOpen && (
        <PomodoroSettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={(s) => {
            setSettings(s);
            setRemaining(durationForRef(s, phase));
            setSettingsOpen(false);
            push("Đã lưu cài đặt Pomodoro");
          }}
        />
      )}
    </div>
  );
}

function durationForRef(s: PomodoroSettings, phase: Phase): number {
  return (phase === "focus" ? s.focusMin : phase === "short" ? s.shortBreakMin : s.longBreakMin) * 60;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-2/50 px-3.5 py-2.5">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function PomodoroSettingsModal({
  settings,
  onClose,
  onSave,
}: {
  settings: PomodoroSettings;
  onClose: () => void;
  onSave: (s: PomodoroSettings) => void;
}) {
  const [focusMin, setFocusMin] = useState(String(settings.focusMin));
  const [shortBreakMin, setShortBreakMin] = useState(String(settings.shortBreakMin));
  const [longBreakMin, setLongBreakMin] = useState(String(settings.longBreakMin));
  const [longBreakEvery, setLongBreakEvery] = useState(String(settings.longBreakEvery));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const errs: Record<string, string> = {};
    const check = (key: string, val: string, min: number, max: number) => {
      const n = Number(val);
      if (!val.trim() || !Number.isInteger(n) || n < min || n > max) errs[key] = `Nhập số nguyên từ ${min} đến ${max}.`;
    };
    check("focusMin", focusMin, 1, 180);
    check("shortBreakMin", shortBreakMin, 1, 60);
    check("longBreakMin", longBreakMin, 1, 90);
    check("longBreakEvery", longBreakEvery, 2, 10);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const next: PomodoroSettings = {
      focusMin: Number(focusMin),
      shortBreakMin: Number(shortBreakMin),
      longBreakMin: Number(longBreakMin),
      longBreakEvery: Number(longBreakEvery),
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } catch {
      /* bỏ qua */
    }
    onSave(next);
  };

  const fields: Array<{ key: string; label: string; value: string; set: (v: string) => void; max: number }> = [
    { key: "focusMin", label: "Thời lượng tập trung (phút)", value: focusMin, set: setFocusMin, max: 180 },
    { key: "shortBreakMin", label: "Nghỉ ngắn (phút)", value: shortBreakMin, set: setShortBreakMin, max: 60 },
    { key: "longBreakMin", label: "Nghỉ dài (phút)", value: longBreakMin, set: setLongBreakMin, max: 90 },
    { key: "longBreakEvery", label: "Số phiên trước khi nghỉ dài", value: longBreakEvery, set: setLongBreakEvery, max: 10 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative w-full max-w-sm p-5">
        <h3 className="mb-4 flex items-center gap-2 font-semibold">
          <Settings2 className="h-4 w-4 text-blue-500" /> Tùy chỉnh Pomodoro
        </h3>
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key}>
              <label htmlFor={`po-${f.key}`} className="label-base">
                {f.label}
              </label>
              <input
                id={`po-${f.key}`}
                type="number"
                min={1}
                max={f.max}
                className="input-base"
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
              />
              {errors[f.key] && <p className="error-text">{errors[f.key]}</p>}
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={submit}>Lưu cài đặt</Button>
        </div>
      </Card>
    </div>
  );
}
