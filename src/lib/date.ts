export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function parseDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function shiftDateStr(str: string, n: number): string {
  return toDateStr(addDays(parseDate(str), n));
}

/** Tuần bắt đầu từ Thứ 2 */
export function startOfWeek(d: Date): Date {
  const c = new Date(d);
  const day = c.getDay(); // 0 = CN
  const diff = day === 0 ? -6 : 1 - day;
  c.setDate(c.getDate() + diff);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const DAY_FMT = new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "numeric", month: "numeric" });
export function formatDayLabel(d: Date): string {
  return capitalize(DAY_FMT.format(d).replace(",", ""));
}

export const SHORT_DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function formatFullDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = parseDate(dateStr);
  return new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function formatDueLabel(dateStr: string, todayDate = todayStr()): string {
  if (dateStr === todayDate) return "Hôm nay";
  const tomorrow = shiftDateStr(todayDate, 1);
  if (dateStr === tomorrow) return "Ngày mai";
  const d = parseDate(dateStr);
  return new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "short" }).format(d);
}

/* ── Định dạng thông dụng ─────────────────────────────────────── */

export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} giờ` : `${h} giờ ${r} phút`;
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatTimeOfDay(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Số ngày còn lại đến deadline (âm = đã quá hạn) */
export function daysUntil(dateStr: string, from = todayStr()): number {
  const a = parseDate(from).getTime();
  const b = parseDate(dateStr).getTime();
  return Math.round((b - a) / 86_400_000);
}
