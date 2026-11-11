/**
 * Quản lý Gemini key CÁ NHÂN của người dùng (BYOK — bring your own key).
 * - Key chỉ lưu trong localStorage của trình duyệt người dùng — không ai khác nhìn thấy.
 * - Mỗi lần gọi /api/ai, key được gửi kèm qua HTTPS và chỉ được dùng cho request đó.
 * - Không hardcode vào bundle; không key → app vẫn chạy bằng AI cơ sở (offline).
 */

const STORAGE_KEY = "studyos.geminiKey";

/** Format key Gemini: bắt đầu "AIza", ~39 ký tự; cho phép dịu hơn để không chặn key tương lai */
export function looksLikeApiKey(key: string): boolean {
  const k = key.trim();
  return /^[A-Za-z0-9_-]{30,80}$/.test(k);
}

export function getStoredApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return (window.localStorage.getItem(STORAGE_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function setStoredApiKey(key: string): { ok: boolean; message: string } {
  const k = key.trim();
  if (!looksLikeApiKey(k)) {
    return { ok: false, message: "Key không đúng định dạng — key Gemini thường dài ~39 ký tự, bắt đầu bằng “AIza”." };
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, k);
    return { ok: true, message: "Đã lưu key — AI Pro đang bật!" };
  } catch {
    return { ok: false, message: "Trình duyệt không cho lưu dữ liệu (chế độ riêng tư?)." };
  }
}

export function clearStoredApiKey(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Che key khi hiển thị: AIza****...abc3 */
export function maskApiKey(key: string): string {
  if (key.length < 10) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(16)}…${key.slice(-4)}`;
}
