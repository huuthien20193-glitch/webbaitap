"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabase, supabaseConfigured } from "./supabase";
import { uid } from "./utils";

/**
 * Xác thực:
 * - Khi cấu hình Supabase → dùng Supabase Auth thật (người dùng & dữ liệu trên server).
 * - Khi chưa cấu hình → biếnModes tài khoản cục bộ bền vững để toàn bộ chức năng
 *   vẫn hoạt động thật; dữ liệu vẫn tách biệt theo từng tài khoản.
 */

export interface AppUser {
  id: string;
  email: string;
  name: string;
}

interface AuthCtx {
  user: AppUser | null;
  authLoading: boolean;
  usingSupabase: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  authLoading: true,
  usingSupabase: false,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

const SESSION_KEY = "studyflow:session";
const USERS_KEY = "studyflow:users";

interface LocalAccount {
  id: string;
  email: string;
  name: string;
  hash: string;
}

// Hash đơn giản cho chế độ cục bộ (KHÔNG dùng cho môi trường production thật;
// dùng Supabase Auth khi triển khai thật)
function localHash(email: string, password: string): string {
  const s = `${email.toLowerCase()}::${password}::studyflow-local`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `h${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`;
}

function readAccounts(): LocalAccount[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as LocalAccount[]) : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: LocalAccount[]) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(accounts));
  } catch {
    /* bỏ qua */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Khôi phục phiên đăng nhập khi mở trang
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (supabaseConfigured) {
          const sb = getSupabase()!;
          const { data } = await sb.auth.getSession();
          const u = data.session?.user;
          if (u && !cancelled) {
            setUser({ id: u.id, email: u.email ?? "", name: String(u.user_metadata?.full_name ?? u.email ?? "Bạn") });
          }
          if (!cancelled) {
            sb.auth.onAuthStateChange((_e, session) => {
              const su = session?.user;
              setUser(su ? { id: su.id, email: su.email ?? "", name: String(su.user_metadata?.full_name ?? su.email ?? "Bạn") } : null);
            });
          }
        } else {
          const raw = localStorage.getItem(SESSION_KEY);
          if (raw) {
            const accounts = readAccounts();
            const acc = accounts.find((a) => a.id === raw);
            if (acc) setUser({ id: acc.id, email: acc.email, name: acc.name });
          }
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })().catch(() => setAuthLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    if (supabaseConfigured) {
      const sb = getSupabase()!;
      const { error, data } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw new Error(error.message);
      const u = data.user;
      setUser({ id: u.id, email: u.email ?? "", name: String(u.user_metadata?.full_name ?? u.email ?? "Bạn") });
      return;
    }
    const accounts = readAccounts();
    const acc = accounts.find((a) => a.email === email.trim().toLowerCase());
    if (!acc) throw new Error("Tài khoản này chưa được đăng ký.");
    if (acc.hash !== localHash(email, password)) throw new Error("Mật khẩu không chính xác.");
    localStorage.setItem(SESSION_KEY, acc.id);
    setUser({ id: acc.id, email: acc.email, name: acc.name });
  };

  const signUp = async (email: string, password: string, name: string) => {
    if (supabaseConfigured) {
      const sb = getSupabase()!;
      const { error, data } = await sb.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { full_name: name.trim() } },
      });
      if (error) throw new Error(error.message);
      const u = data.user;
      if (u) setUser({ id: u.id, email: u.email ?? "", name: name.trim() });
      return;
    }
    const clean = email.trim().toLowerCase();
    const accounts = readAccounts();
    if (accounts.some((a) => a.email === clean)) {
      throw new Error("Email này đã được đăng ký trên thiết bị này. Hãy đăng nhập.");
    }
    const acc: LocalAccount = { id: uid(), email: clean, name: name.trim() || clean.split("@")[0], hash: localHash(clean, password) };
    accounts.push(acc);
    writeAccounts(accounts);
    localStorage.setItem(SESSION_KEY, acc.id);
    setUser({ id: acc.id, email: acc.email, name: acc.name });
  };

  const signOut = async () => {
    if (supabaseConfigured) {
      const sb = getSupabase()!;
      await sb.auth.signOut();
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, authLoading, usingSupabase: supabaseConfigured, signIn, signUp, signOut }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, authLoading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
