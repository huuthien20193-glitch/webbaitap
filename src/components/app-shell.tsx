"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  CalendarDays,
  CalendarRange,
  GraduationCap,
  Layers,
  LayoutDashboard,
  ListTodo,
  Loader2,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Search,
  Sparkles,
  Sun,
  Target,
  Timer,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useData } from "@/lib/data";
import { Badge, EmptyState } from "@/components/ui";
import { daysUntil, todayStr } from "@/lib/date";
import { dueFlashcards } from "@/lib/stats";

/* ─── Điều hướng theo nhóm (v2.0) ─────────────────────────── */

const NAV_SECTIONS: { label: string; items: { href: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    label: "Học tập",
    items: [
      { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
      { href: "/planner", label: "Lập kế hoạch", icon: CalendarRange },
      { href: "/tasks", label: "Nhiệm vụ", icon: ListTodo },
      { href: "/calendar", label: "Lịch học", icon: CalendarDays },
    ],
  },
  {
    label: "Nghiên cứu",
    items: [
      { href: "/courses", label: "Môn học", icon: GraduationCap },
      { href: "/assistant", label: "Trợ lý AI", icon: Sparkles },
      { href: "/revision", label: "Ôn tập", icon: Layers },
      { href: "/focus", label: "Tập trung", icon: Timer },
    ],
  },
  {
    label: "Phân tích",
    items: [
      { href: "/analytics", label: "Hồ sơ học tập", icon: BarChart3 },
      { href: "/statistics", label: "Thống kê", icon: PieChart },
      { href: "/goals", label: "Mục tiêu", icon: Target },
    ],
  },
];

const NAV_FLAT = NAV_SECTIONS.flatMap((s) => s.items);

export function AppShell({ children }: { children: ReactNode }) {
  const { user, authLoading, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const { loading, storageMode, tasks, exams, flashcards } = useData();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState<"search" | "notif" | "profile" | null>(null);
  const [query, setQuery] = useState("");

  // Trạng thái thu gọn sidebar được ghi nhớ
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("studyflow:sidebar:collapsed") === "1");
    } catch { /* ignore */ }
  }, []);
  const toggleCollapse = useCallback(() => {
    setCollapsed((p) => {
      const n = !p;
      try { window.localStorage.setItem("studyflow:sidebar:collapsed", n ? "1" : "0"); } catch { /* ignore */ }
      return n;
    });
  }, []);

  // Đóng menu khi click ngoài / bấm Escape
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-popover]")) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  // Chặn truy cập khi chưa đăng nhập
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  /* ─── Dữ liệu cho thông báo & tìm kiếm ─── */

  const notifications = useMemo(() => {
    const today = todayStr();
    type NotificationItem = { id: string; icon: string; title: string; sub: string; href: string; tone: string };
    const out: NotificationItem[] = [];
    for (const t of tasks) {
      if (t.status === "done") continue;
      const d = daysUntil(t.dueDate, today);
      if (d < 0)
        out.push({ id: `t-${t.id}`, icon: "late", title: t.title, sub: `Quá hạn ${-d} ngày`, href: "/tasks", tone: "text-red-500 bg-red-500/10" });
      else if (d <= 2)
        out.push({ id: `t-${t.id}`, icon: "soon", title: t.title, sub: d === 0 ? "Đến hạn hôm nay" : d === 1 ? "Hạn ngày mai" : `Hạn sau ${d} ngày`, href: "/tasks", tone: "text-amber-500 bg-amber-500/10" });
    }
    const dueCards = dueFlashcards(flashcards, today).length;
    if (dueCards > 0)
      out.push({ id: "cards", icon: "cards", title: `${dueCards} flashcard đến hạn ôn`, sub: "Ôn tập SM-2 hôm nay", href: "/revision", tone: "text-violet-500 bg-violet-500/10" });
    for (const e of exams) {
      const d = daysUntil(e.examDate, today);
      if (d >= 0 && d <= 7)
        out.push({ id: `e-${e.id}`, icon: "exam", title: e.title, sub: d === 0 ? "Kiểm tra hôm nay" : `Kiểm tra sau ${d} ngày`, href: "/analytics", tone: "text-indigo-500 bg-indigo-500/10" });
    }
    return out.slice(0, 9);
  }, [tasks, exams, flashcards]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { pages: [], tasks: [] };
    const pages = NAV_FLAT.filter((n) => n.label.toLowerCase().includes(q)).slice(0, 4);
    const taskHits = tasks.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 4);
    return { pages, tasks: taskHits };
  }, [query, tasks]);

  /* ─── Sidebar ─── */

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2.5 px-5 py-5", collapsed && "px-3 justify-center")}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/25">
          <GraduationCap className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-sm font-bold leading-tight tracking-tight">StudyOS</p>
            <p className="text-[11px] text-muted">AI Study Platform</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted/70">{section.label}</p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                      collapsed ? "justify-center px-0" : "hover:translate-x-1",
                      active
                        ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25"
                        : "text-muted hover:bg-surface-2 hover:text-foreground"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-transform duration-200",
                        active ? "scale-110" : "group-hover:scale-110"
                      )}
                    />
                    {!collapsed && item.label}
                    {!collapsed && !active && (
                      <span className="absolute left-3 right-3 bottom-1 h-px origin-left scale-x-0 rounded-full bg-indigo-500/40 transition-transform duration-300 group-hover:scale-x-100" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white shadow-md shadow-indigo-600/20" title={user?.name || user?.email}>
              {(user?.name || user?.email || "?").charAt(0).toUpperCase()}
            </div>
            <button
              onClick={toggleCollapse}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              aria-label="Mở rộng thanh bên"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <button
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-red-500"
              aria-label="Đăng xuất"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white shadow-md shadow-indigo-600/20">
              {(user?.name || user?.email || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>
            <button
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
              className="rounded-lg p-2 text-muted transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-2 hover:text-red-500 hover:shadow-sm"
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <button
              onClick={toggleCollapse}
              className="rounded-lg p-2 text-muted transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-2 hover:text-foreground"
              aria-label="Thu gọn thanh bên"
              title="Thu gọn"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm">Đang tải StudyOS...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Sidebar desktop — thu gọn được */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-border bg-surface/95 backdrop-blur transition-all duration-300 lg:block",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {sidebar}
      </aside>

      {/* Sidebar mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-surface animate-slide-left">
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground" aria-label="Đóng menu">
              <X className="h-4 w-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className={cn("transition-[padding] duration-300", collapsed ? "lg:pl-16" : "lg:pl-64")}>
        {/* Header: tìm kiếm + thông báo + hồ sơ */}
        <header className="glass sticky top-0 z-20 flex items-center gap-2 border-b border-border px-4 py-3 lg:gap-3 lg:px-6">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-muted transition-all hover:-translate-y-0.5 hover:bg-surface-2 hover:text-foreground lg:hidden" aria-label="Mở menu">
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="hidden truncate flex-1 text-base font-semibold tracking-tight sm:block sm:flex-1">
            {NAV_FLAT.find((n) => n.href === pathname)?.label ?? "StudyOS"}
          </h1>
          <div className="flex items-center justify-end gap-1.5 sm:flex-none lg:gap-2">
            {/* Ô tìm kiếm */}
            <div className="relative" data-popover>
              <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
                <Search className="h-4 w-4" />
              </div>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setMenu(e.target.value ? "search" : null);
                }}
                onFocus={() => query && setMenu("search")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchResults.tasks[0]) {
                    try { sessionStorage.setItem("studyflow:taskq", query); } catch { /* ignore */ }
                    router.push("/tasks");
                    setMenu(null);
                    setQuery("");
                  }
                }}
                placeholder="Tìm nhiệm vụ, trang…"
                className="w-40 rounded-lg border border-border bg-surface-2/60 py-1.5 pl-8 pr-3 text-sm outline-none transition-all focus:w-56 focus:border-indigo-500/60 focus:bg-surface focus:ring-2 focus:ring-indigo-500/15 sm:w-52"
                aria-label="Tìm kiếm"
              />
              {menu === "search" && (searchResults.pages.length > 0 || searchResults.tasks.length > 0) && (
                <div className="absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-surface shadow-card-hover animate-fade-up">
                  {searchResults.pages.length > 0 && (
                    <div className="border-b border-border p-1.5">
                      {searchResults.pages.map((p) => (
                        <button
                          key={p.href}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                          onClick={() => {
                            router.push(p.href);
                            setMenu(null);
                            setQuery("");
                          }}
                        >
                          <p.icon className="h-4 w-4 text-indigo-500" />
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.tasks.length > 0 && (
                    <div className="p-1.5">
                      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted/70">Nhiệm vụ</p>
                      {searchResults.tasks.map((t) => (
                        <button
                          key={t.id}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2"
                          onClick={() => {
                            try { sessionStorage.setItem("studyflow:taskq", query); } catch { /* ignore */ }
                            router.push("/tasks");
                            setMenu(null);
                            setQuery("");
                          }}
                        >
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", t.status === "done" ? "bg-emerald-500" : t.dueDate <= todayStr() ? "bg-red-500" : "bg-indigo-500")} />
                          <span className="truncate">{t.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {loading && (
              <Badge className="hidden gap-1.5 bg-surface-2 text-muted md:inline-flex">
                <Loader2 className="h-3 w-3 animate-spin" />
                Đồng bộ
              </Badge>
            )}
            <Badge
              className={cn(
                "hidden transition-colors md:inline-flex",
                storageMode === "supabase"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
              )}
            >
              {storageMode === "supabase" ? "Supabase" : "Lưu cục bộ"}
            </Badge>

            {/* Chuông thông báo */}
            <div className="relative" data-popover>
              <button
                onClick={() => setMenu((m) => (m === "notif" ? null : "notif"))}
                className="relative rounded-lg p-2 text-muted transition-all hover:-translate-y-0.5 hover:bg-surface-2 hover:text-foreground"
                aria-label="Thông báo"
              >
                <Bell className="h-[18px] w-[18px]" />
                {notifications.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-b from-rose-500 to-red-600 px-1 text-[10px] font-bold text-white shadow-sm">
                    {notifications.length}
                  </span>
                )}
              </button>
              {menu === "notif" && (
                <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-card-hover animate-fade-up">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <p className="text-sm font-semibold">Thông báo</p>
                    <Badge className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">{notifications.length}</Badge>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-3">
                        <EmptyState
                          icon={<Bell className="h-8 w-8" />}
                          title="Không có thông báo mới"
                          hint="Mọi việc đã được sắp xếp xong xuôi."
                        />
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <Link
                          key={n.id}
                          href={n.href}
                          onClick={() => setMenu(null)}
                          className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                        >
                          <span className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", n.tone.split(" ")[0])} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{n.title}</span>
                            <span className="block text-xs text-muted">{n.sub}</span>
                          </span>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={toggle}
              className="group rounded-lg p-2 text-muted transition-all duration-300 hover:-translate-y-0.5 hover:bg-surface-2 hover:text-foreground"
              aria-label="Chuyển giao diện sáng/tối"
              title={theme === "dark" ? "Chuyển sang Light Mode" : "Chuyển sang Dark Mode"}
            >
              {theme === "dark" ? (
                <Sun className="h-[18px] w-[18px] transition-transform duration-500 group-hover:rotate-90" />
              ) : (
                <Moon className="h-[18px] w-[18px] transition-transform duration-500 group-hover:-rotate-12" />
              )}
            </button>

            {/* Hồ sơ người dùng */}
            <div className="relative" data-popover>
              <button
                onClick={() => setMenu((m) => (m === "profile" ? null : "profile"))}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition-transform hover:scale-105"
                aria-label="Hồ sơ"
              >
                {(user.name || user.email).charAt(0).toUpperCase()}
              </button>
              {menu === "profile" && (
                <div className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-card-hover animate-fade-up">
                  <div className="border-b border-border px-4 py-3">
                    <p className="truncate text-sm font-semibold">{user.name}</p>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                  </div>
                  <div className="p-1.5">
                    <button
                      onClick={toggle}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                    >
                      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                      {theme === "dark" ? "Chế độ sáng" : "Chế độ tối"}
                    </button>
                    <button
                      onClick={async () => {
                        await signOut();
                        router.replace("/login");
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-500/10"
                    >
                      <LogOut className="h-4 w-4" />
                      Đăng xuất
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Nền trang trí cực nhẹ (indigo/violet) */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-32 right-[10%] h-80 w-80 rounded-full bg-indigo-500/[0.06] blur-3xl dark:bg-indigo-500/[0.05]" />
          <div className="absolute bottom-0 left-[20%] h-64 w-96 rounded-full bg-violet-500/[0.05] blur-3xl dark:bg-violet-500/[0.04]" />
        </div>

        <main className="p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
