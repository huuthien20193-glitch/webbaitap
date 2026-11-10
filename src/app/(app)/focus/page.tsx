"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Coffee,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SkipForward,
  Timer,
  Trash2,
  Zap,
} from "lucide-react";
import { Badge, Button, Card, EmptyState, LoadingBlock, Modal, TextField } from "@/components/ui";
import { useData } from "@/lib/data";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { formatClock, formatMinutes, formatTimeOfDay, toDateStr, todayStr } from "@/lib/date";
import { DEFAULT_POMODORO, type PomodoroSettings } from "@/lib/types";

/**
 * MODULE F – Focus Mode (Pomodoro) chống mất tiến độ:
 * - Mọi thay đổi của bộ đếm được lưu snapshot runtime localStorage
 *   (phase/running/targetSec/remainingSec/courseId/startedAtIso/savedAtMs/cycle).
 * - Khi tải lại trang hoặc quay lại tab, thời gian dôi dư được tính
 *   theo Δ thực tế = now − savedAtMs → đếm không sai dù tab bị throttle.
 * - Nếu phiên tập trung kết thúc trong lúc vắng mặt → vẫn được ghi nhận.
 */

const RUNTIME_KEY = "studyflow:focus:runtime";
const SETTINGS_KEY = "studyflow:focus:settings";

type Phase = "focus" | "short" | "long";

interface Runtime {
  phase: Phase;
  running: boolean;
  targetSec: number;
  remainingSec: number;
  courseId: string | null;
  startedAtIso: string | null;
  savedAtMs: number;
  cycle: number; // số phiên focus đã xong (tổng)
}

function clampNumber(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function defaultTarget(settings: PomodoroSettings): number {
  return Math.max(60, settings.focusMin * 60);
}

function loadSettings(): PomodoroSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_POMODORO;
    const s = JSON.parse(raw) as Partial<PomodoroSettings>;
    return {
      focusMin: clampNumber(s.focusMin, DEFAULT_POMODORO.focusMin, 10, 90),
      shortBreakMin: clampNumber(s.shortBreakMin, DEFAULT_POMODORO.shortBreakMin, 2, 20),
      longBreakMin: clampNumber(s.longBreakMin, DEFAULT_POMODORO.longBreakMin, 5, 45),
      longBreakEvery: clampNumber(s.longBreakEvery, DEFAULT_POMODORO.longBreakEvery, 2, 8),
    };
  } catch {
    return DEFAULT_POMODORO;
  }
}

function loadRuntime(): Runtime | null {
  try {
    const raw = window.localStorage.getItem(RUNTIME_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<Runtime> & { startedAtMs?: number };
    if (r.phase !== "focus" && r.phase !== "short" && r.phase !== "long") return null;
    const targetSec = clampNumber(r.targetSec, 25 * 60, 60, 6 * 3600);
    const remainingSec = clampNumber(r.remainingSec, targetSec, 0, targetSec);
    const savedAtMs = clampNumber(r.savedAtMs ?? r.startedAtMs, Date.now(), 0, Date.now());
    return {
      phase: r.phase,
      running: r.running === true,
      targetSec,
      remainingSec: Math.min(remainingSec, targetSec),
      courseId: typeof r.courseId === "string" ? r.courseId : null,
      startedAtIso: typeof r.startedAtIso === "string" ? r.startedAtIso : null,
      savedAtMs,
      cycle: clampNumber(r.cycle, 0, 0, 9999),
    };
  } catch {
    return null;
  }
}

function persist(rt: Runtime, settings: PomodoroSettings) {
  try {
    window.localStorage.setItem(RUNTIME_KEY, JSON.stringify(rt));
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* Local storage đầy — timer vẫn hoạt động trong phiên hiện tại */
  }
}

const PHASE_META: Record<Phase, { label: string; icon: typeof Timer; sub: string; ring: string }> = {
  focus: { label: "Tập trung", icon: Timer, sub: "Đóng điện thoại, tập trung 100%", ring: "text-indigo-500" },
  short: { label: "Nghỉ ngắn", icon: Coffee, sub: "Đứng dậy, uống nước, thư giãn mắt", ring: "text-emerald-500" },
  long: { label: "Nghỉ dài", icon: Coffee, sub: "Bạn xứng đáng được nghỉ xứng đáng", ring: "text-sky-500" },
};

export default function FocusPage() {
  const { loading, courses, sessions, addSession, deleteSession } = useData();
  const { push } = useToast();
  const today = todayStr();

  const [settings, setSettings] = useState<PomodoroSettings>(DEFAULT_POMODORO);
  const [rt, setRt] = useState<Runtime>(() => ({
    phase: "focus",
    running: false,
    targetSec: defaultTarget(DEFAULT_POMODORO),
    remainingSec: defaultTarget(DEFAULT_POMODORO),
    courseId: null,
    startedAtIso: null,
    savedAtMs: 0,
    cycle: 0,
  }));
  const [courseId, setCourseId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<PomodoroSettings>(DEFAULT_POMODORO);

  const rtRef = useRef(rt);
  rtRef.current = rt;
  const restoredRef = useRef(false);
  const courseIdRef = useRef("");
  courseIdRef.current = courseId;

  const persistRef = useRef(persist);
  persistRef.current = persist;

  /* ── Ghi một phiên học vào dữ liệu ── */
  const recordSession = useCallback(
    async (cur: Runtime, durationSec: number) => {
      try {
        await addSession({
          courseId: cur.courseId ?? null,
          startedAt: cur.startedAtIso ?? new Date().toISOString(),
          durationSec: Math.max(60, Math.round(durationSec)),
          note: "",
        });
        push(`🎉 Đã ghi nhận phiên học ${Math.round(durationSec / 60)} phút!`, "success");
      } catch {
        /* toast lỗi đã hiện trong provider */
      }
    },
    [addSession, push]
  );

  /* ── Chuyển sang phase kế tiếp (hết phiên nào đó) ── */
  const advance = useCallback(
    (cur: Runtime, settingsNow: PomodoroSettings) => {
      const nextPhase: Phase = cur.phase === "focus"
        ? ((cur.cycle + 1) % settingsNow.longBreakEvery === 0 ? "long" : "short")
        : "focus";
      const cycle = cur.phase === "focus" ? cur.cycle + 1 : cur.cycle;
      const targetSec = Math.max(
        60,
        (nextPhase === "focus" ? settingsNow.focusMin : nextPhase === "short" ? settingsNow.shortBreakMin : settingsNow.longBreakMin) * 60
      );
      const next: Runtime = {
        phase: nextPhase,
        running: nextPhase !== "focus",
        targetSec,
        remainingSec: targetSec,
        courseId: cur.courseId,
        startedAtIso: nextPhase === "focus" ? null : cur.startedAtIso,
        savedAtMs: Date.now(),
        cycle,
      };
      rtRef.current = next;
      setRt(next);
      persistRef.current(next, settingsNow);
    },
    []
  );

  /* ── Khôi phục snapshot khi mở trang / tải lại ── */
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const loadedSettings = loadSettings();
    setSettings(loadedSettings);
    setDraft(loadedSettings);

    const snap = loadRuntime();
    if (!snap) {
      const idle: Runtime = {
        phase: "focus",
        running: false,
        targetSec: defaultTarget(loadedSettings),
        remainingSec: defaultTarget(loadedSettings),
        courseId: null,
        startedAtIso: null,
        savedAtMs: Date.now(),
        cycle: 0,
      };
      rtRef.current = idle;
      setRt(idle);
      persistRef.current(idle, loadedSettings);
      return;
    }

    setCourseId(snap.courseId ?? "");

    if (!snap.running) {
      // Tạm dừng → nạp thẳng, không tính delta
      rtRef.current = snap;
      setRt(snap);
      return;
    }

    const elapsedSec = Math.max(0, Math.floor((Date.now() - snap.savedAtMs) / 1000));

    // Phase nghỉ → kết thúc break khi vắng mặt
    if (snap.phase !== "focus" && elapsedSec >= snap.remainingSec) {
      advance({ ...snap, phase: "focus" as Phase, cycle: snap.cycle }, loadedSettings);
      push("Hết giờ nghỉ khi bạn vắng mặt — tiếp tục thôi!", "info");
      return;
    }

    if (snap.phase !== "focus") {
      const next: Runtime = { ...snap, remainingSec: snap.remainingSec - elapsedSec, savedAtMs: Date.now() };
      rtRef.current = next;
      setRt(next);
      return;
    }

    // Phase tập trung
    if (elapsedSec >= snap.remainingSec) {
      // ✅ Hoàn thành phiên khi vắng mặt — vẫn ghi nhận đầy đủ
      void recordSession(snap, snap.targetSec);
      push("Bạn đã hoàn thành 1 phiên tập trung khi rời trang — Đã ghi nhận vào dữ liệu học tập!", "success");
      advance(snap, loadedSettings);
    } else {
      const next: Runtime = { ...snap, remainingSec: snap.remainingSec - elapsedSec, savedAtMs: Date.now() };
      rtRef.current = next;
      setRt(next);
      push(`Đã khôi phục bộ đếm — còn ${formatClock(snap.remainingSec - elapsedSec)} của phiên ${PHASE_META[snap.phase].label.toLowerCase()}.`, "info");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Tick mỗi giây — dùng ref để không reset interval ── */
  useEffect(() => {
    const tickId = setInterval(() => {
      const cur = rtRef.current;
      if (!cur.running) return;
      const nextRemaining = Math.max(0, cur.remainingSec - 1);
      const next: Runtime = { ...cur, remainingSec: nextRemaining, savedAtMs: Date.now() };
      rtRef.current = next;
      setRt(next);
      persistRef.current(next, settings);
      if (nextRemaining === 0) finishPhase();
    }, 1000);
    return () => clearInterval(tickId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  function finishPhase() {
    const cur = rtRef.current;
    if (!cur.running) return;
    if (cur.phase === "focus") void recordSession(cur, cur.targetSec);
    advance(cur, settings);
  }

  /* ── Tiêu đề tab chạy theo bộ đếm ── */
  useEffect(() => {
    if (rt.running) document.title = `${formatClock(rt.remainingSec)} · ${PHASE_META[rt.phase].label} — StudyOS`;
    else document.title = "StudyOS — Trợ lý học tập AI";
    return () => {
      document.title = "StudyOS — Trợ lý học tập AI";
    };
  }, [rt.running, rt.remainingSec, rt.phase]);

  /* ── Lưu snapshot khi đóng/rời trang ── */
  useEffect(() => {
    const onLeave = () => {
      // Mỗi tick đã save rồi — here safety-net cho pause giữa các tick
      try {
        window.localStorage.setItem(RUNTIME_KEY, JSON.stringify(rtRef.current));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeunload", onLeave);
    document.addEventListener("visibilitychange", onLeave);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      document.removeEventListener("visibilitychange", onLeave);
    };
  }, []);

  /* ── Hành động ── */

  function start() {
    const cur = rtRef.current;
    if (cur.remainingSec <= 0) {
      push("Phiên đã kết thúc — bấm Restart để bắt đầu lại.", "info");
      return;
    }
    if (cur.phase === "focus" && cur.remainingSec === cur.targetSec) {
      // Phiên hoàn toàn mới → bắt buộc chọn môn (khi chưa chọn)
      if (!courseIdRef.current && courses.length > 0) {
        push("Hãy chọn môn học đang học để ghi nhận dữ liệu chính xác.", "error");
        return;
      }
    }
    const next: Runtime = {
      ...cur,
      running: true,
      savedAtMs: Date.now(),
      courseId: cur.phase === "focus" ? courseIdRef.current || null : cur.courseId,
      startedAtIso: cur.startedAtIso ?? new Date().toISOString(),
    };
    rtRef.current = next;
    setRt(next);
    persistRef.current(next, settings);
  }

  function pause() {
    const cur = rtRef.current;
    if (!cur.running) return;
    const next: Runtime = { ...cur, running: false, savedAtMs: Date.now() };
    rtRef.current = next;
    setRt(next);
    persistRef.current(next, settings);
  }

  function reset() {
    const cur = rtRef.current;
    const next: Runtime = {
      ...cur,
      running: false,
      remainingSec: cur.targetSec,
      startedAtIso: cur.phase === "focus" ? null : cur.startedAtIso,
      savedAtMs: Date.now(),
    };
    rtRef.current = next;
    setRt(next);
    persistRef.current(next, settings);
    push("Đã đặt lại bộ đếm.", "info");
  }

  function skip() {
    advance(rtRef.current, settings);
    push("Đã bỏ qua phase này (không ghi nhận phiên học).", "info");
  }

  function saveSettings() {
    const next = {
      focusMin: clampNumber(draft.focusMin, 25, 10, 90),
      shortBreakMin: clampNumber(draft.shortBreakMin, 5, 2, 20),
      longBreakMin: clampNumber(draft.longBreakMin, 15, 5, 45),
      longBreakEvery: clampNumber(draft.longBreakEvery, 4, 2, 8),
    };
    setSettings(next);
    persistRef.current(rtRef.current, next);
    if (!rtRef.current.running) {
      const targetFor =
        rtRef.current.phase === "focus"
          ? defaultTarget(next)
          : rtRef.current.phase === "short"
            ? next.shortBreakMin * 60
            : next.longBreakMin * 60;
      const updated: Runtime = { ...rtRef.current, targetSec: targetFor, remainingSec: targetFor, savedAtMs: Date.now() };
      rtRef.current = updated;
      setRt(updated);
      persistRef.current(updated, next);
    }
    setSettingsOpen(false);
    push("Đã lưu cài đặt Pomodoro", "success");
  }

  /* ── Phát sinh dữ liệu cho UI ── */

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const todaySessions = useMemo(
    () => sessions.filter((s) => toDateStr(new Date(s.startedAt)) === today).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [sessions, today]
  );
  const todayMinutes = useMemo(() => Math.round(todaySessions.reduce((a, b) => a + b.durationSec, 0) / 60), [todaySessions]);
  const focusMinutesToday = useMemo(
    () => Math.round(todaySessions.filter((s) => s.durationSec >= 300).reduce((a, b) => a + b.durationSec, 0) / 60),
    [todaySessions]
  );

  if (loading) return <LoadingBlock label="Đang tải Focus Mode..." />;

  const meta = PHASE_META[rt.phase];
  const percent = rt.targetSec > 0 ? 1 - rt.remainingSec / rt.targetSec : 0;
  const R = 76;
  const CIRC = 2 * Math.PI * R;
  const activeCourse = rt.courseId ? courseMap.get(rt.courseId) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Tập trung</h1>
          <p className="mt-1 text-sm text-muted">Pomodoro đếm chính xác cả khi tải lại trang — thời gian học luôn được ghi đủ.</p>
        </div>
        <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
          <Settings2 className="h-4 w-4" /> Cài đặt
        </Button>
      </div>

      {/* Đồng hồ chính */}
      <Card className="card-lift animate-fade-up relative mx-auto max-w-xl overflow-hidden p-8">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-500/[0.04] to-violet-500/[0.05]" />
        <div className="relative flex flex-col items-center gap-6">
          <div className="flex items-center gap-2">
            <Badge className={cn("gap-1.5 bg-surface-2")}>
              <meta.icon className={cn("h-3.5 w-3.5", meta.ring)} />
              {meta.label}
            </Badge>
            <Badge className="bg-surface-2 text-muted">Chu kỳ: {rt.cycle}</Badge>
            {activeCourse && (
              <Badge className="gap-1.5 bg-indigo-500/10">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activeCourse.color }} />
                {activeCourse.name}
              </Badge>
            )}
          </div>

          {/* Vòng tròn tiến độ */}
          <div className="relative">
            <svg width="196" height="196" viewBox="0 0 196 196" className="-rotate-90">
              <circle cx="98" cy="98" r={R} fill="none" stroke="rgb(var(--border))" strokeWidth="10" />
              <circle
                cx="98"
                cy="98"
                r={R}
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC * (1 - percent)}
                className={cn("transition-[stroke-dashoffset] duration-500", rt.phase === "focus" ? "stroke-indigo-500" : "stroke-emerald-500")}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn("font-mono text-5xl font-bold tabular-nums tracking-tight", rt.remainingSec <= 30 && rt.running && "animate-pulse text-red-500")}>
                {formatClock(rt.remainingSec)}
              </span>
              <span className="mt-1 text-xs text-muted">{rt.running ? "Đang chạy" : rt.remainingSec < rt.targetSec ? "Tạm dừng" : "Sẵn sàng"}</span>
            </div>
          </div>

          <p className="text-center text-sm text-muted">{meta.sub}</p>

          {/* Chọn môn khi bắt đầu phiên mới */}
          {rt.phase === "focus" && !rt.running && courses.length > 0 && (
            <label className="w-full max-w-xs text-center">
              <span className="label-base">Môn đang học</span>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="input-base mt-1 bg-surface-2"
                aria-label="Môn đang học"
              >
                {courses.length > 0 && <option value="">— Chọn môn —</option>}
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {rt.running ? (
              <Button onClick={pause} className="min-w-32 bg-gradient-to-r from-amber-500 to-orange-500">
                <Pause className="h-4 w-4" /> Tạm dừng
              </Button>
            ) : (
              <Button onClick={start} className="min-w-32 bg-gradient-to-r from-indigo-600 to-violet-600">
                <Play className="h-4 w-4" /> {rt.remainingSec === rt.targetSec ? "Bắt đầu" : "Tiếp tục"}
              </Button>
            )}
            <Button variant="secondary" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Đặt lại
            </Button>
            <Button variant="ghost" onClick={skip}>
              <SkipForward className="h-4 w-4" /> Bỏ qua
            </Button>
          </div>

          <p className="text-center text-[11px] text-muted">
            Rời trang hoặc tải lại không làm mất tiến độ — bộ đếm khôi phục theo thời gian thực.
          </p>
        </div>
      </Card>

      {/* Thống kê hôm nay */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Tập trung hôm nay", value: formatMinutes(Math.max(focusMinutesToday, 0)), icon: Timer, tone: "text-indigo-500 bg-indigo-500/10" },
          { label: "Tổng thời gian học", value: formatMinutes(todayMinutes), icon: Zap, tone: "text-violet-500 bg-violet-500/10" },
          { label: "Số phiên hôm nay", value: todaySessions.length, icon: Coffee, tone: "text-emerald-500 bg-emerald-500/10" },
        ].map((s, i) => (
          <Card key={s.label} className="card-lift animate-fade-up p-4" style={{ animationDelay: `${i * 70}ms` }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted">{s.label}</p>
                <p className="mt-1.5 truncate text-lg font-bold tracking-tight">{s.value}</p>
              </div>
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", s.tone)}>
                <s.icon className="h-4 w-4" />
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Danh sách phiên học hôm nay */}
      <Card className="card-lift animate-fade-up p-5" style={{ animationDelay: "220ms" }}>
        <h3 className="mb-4 font-semibold">Phiên học hôm nay</h3>
        {todaySessions.length === 0 ? (
          <EmptyState icon={<Timer className="h-10 w-10" />} title="Chưa có phiên học nào hôm nay" hint="Bấm “Bắt đầu” ở bộ đếm phía trên để ghi phiên đầu tiên." />
        ) : (
          <ul className="space-y-2.5">
            {todaySessions.map((s, i) => {
              const course = s.courseId ? courseMap.get(s.courseId) : null;
              return (
                <li
                  key={s.id}
                  className="row-lift animate-fade-up group flex items-center gap-3 rounded-lg border border-border bg-surface-2/40 px-3.5 py-2.5"
                  style={{ animationDelay: `${260 + i * 50}ms` }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
                    <Timer className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{formatTimeOfDay(s.startedAt)}</p>
                    <p className="truncate text-xs text-muted">
                      {course ? course.name : "Không môn"}{s.note ? ` · ${s.note}` : ""}
                    </p>
                  </div>
                  <Badge className="shrink-0 bg-violet-500/10 text-violet-600 dark:text-violet-300">{formatMinutes(s.durationSec / 60)}</Badge>
                  <button
                    onClick={() => {
                      if (window.confirm("Xóa phiên học này? Số liệu thống kê sẽ thay đổi theo.")) void deleteSession(s.id);
                    }}
                    className="shrink-0 rounded-lg p-2 text-muted opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                    aria-label="Xóa phiên học"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Modal cài đặt Pomodoro */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Cài đặt Pomodoro">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField
              id="focus-min"
              label="Tập trung (phút)"
              type="number"
              min={10}
              max={90}
              value={draft.focusMin}
              onChange={(e) => setDraft((p) => ({ ...p, focusMin: Number(e.target.value) }))}
              required
            />
            <TextField
              id="short-min"
              label="Nghỉ ngắn (phút)"
              type="number"
              min={2}
              max={20}
              value={draft.shortBreakMin}
              onChange={(e) => setDraft((p) => ({ ...p, shortBreakMin: Number(e.target.value) }))}
              required
            />
            <TextField
              id="long-min"
              label="Nghỉ dài (phút)"
              type="number"
              min={5}
              max={45}
              value={draft.longBreakMin}
              onChange={(e) => setDraft((p) => ({ ...p, longBreakMin: Number(e.target.value) }))}
              required
            />
            <TextField
              id="long-every"
              label="Nghỉ dài sau mỗi"
              type="number"
              min={2}
              max={8}
              value={draft.longBreakEvery}
              onChange={(e) => setDraft((p) => ({ ...p, longBreakEvery: Number(e.target.value) }))}
              required
            />
          </div>
          <p className="text-xs text-muted">Cài đặt áp dụng cho phiên kế tiếp. Phiên đang chạy sẽ không bị thay đổi.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setSettingsOpen(false)}>
              Hủy
            </Button>
            <Button onClick={saveSettings}>Lưu cài đặt</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
