import type { Flashcard } from "./types";
import { shiftDateStr, todayStr } from "./date";

/**
 * Thuật toán SM-2 (SuperMemo-2) — spaced repetition chuẩn:
 * - Người dùng đánh giá chất lượng nhớ q ∈ [0, 5].
 * - q < 3 → thẻ phải học lại từ đầu (interval vẫn giữ 0 ngày để ôn lại ngay).
 * - q ≥ 3 → tăng số lần liên tiếp; interval = 1 → 6 → interval × (ease).
 * - ease được điều chỉnh theo công thức EF' = EF + (0.1 − (5 − q) × (0.08 + (5 − q) × 0.02)).
 */
export interface SM2State {
  ease: number;
  interval: number;
  repetitions: number;
}

export interface SM2Result extends SM2State {
  dueDate: string; // YYYY-MM-DD
}

export function clampQuality(q: number): number {
  return Math.max(0, Math.min(5, Math.round(q)));
}

/** Trả về trạng thái mới của thẻ sau một lần đánh giá. */
export function applySM2(state: SM2State, quality: number): SM2Result {
  const q = clampQuality(quality);
  let { ease, interval, repetitions } = state;

  if (q < 3) {
    // Quên → ôn lại ngay hôm sau, giữ nguyên ease (không giảm ease khi quên đầu tay)
    repetitions = 0;
    interval = 0;
  } else {
    ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    ease = Math.max(1.3, Math.min(2.8, ease));
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.max(1, Math.round(interval * ease));
  }

  return { ease, interval, repetitions, dueDate: shiftDateStr(todayStr(), interval) };
}

/** Trạng thái khởi tạo cho flashcard mới */
export function initialSM2State() {
  return { ease: 2.5, interval: 0, repetitions: 0, dueDate: todayStr() };
}

/** Hình dạng trạng thái đầy đủ của một thẻ sau khi áp dụng SM-2 (dùng để updateFlashcard) */
export function nextFlashcardState(card: Pick<Flashcard, "ease" | "interval" | "repetitions">, quality: number) {
  return applySM2({ ease: card.ease ?? 2.5, interval: card.interval ?? 0, repetitions: card.repetitions ?? 0 }, quality);
}

/** Thẻ đến hạn hôm nay hay chưa */
export function isDue(card: Pick<Flashcard, "dueDate">, today = todayStr()): boolean {
  return card.dueDate <= today;
}
