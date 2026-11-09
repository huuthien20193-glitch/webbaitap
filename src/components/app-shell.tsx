"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  ListTodo,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Sun,
  Timer,
  Target,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useData } from "@/lib/data";
import { Badge } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/tasks", label: "Nhiệm vụ", icon: ListTodo },
  { href: "/calendar", label: "Lịch học", icon: CalendarDays },
  { href: "/subjects", label: "Môn học", icon: GraduationCap },
  { href: "/focus", label: "Pomodoro", icon: Timer },
  { href: "/statistics", label: "Thống kê", icon: BarChart3 },
  { href: "/goals", label: "Mục tiêu", icon: Target },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, authLoading, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const { loading, storageMode } = useData();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Chặn truy cập khi chưa đăng nhập
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm">Đang tải StudyFlow...</p>
      </div>
    );
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-600/25">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight tracking-tight">StudyFlow</p>
          <p className="text-[11px] text-muted">Smart Study Planner</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item, i) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:translate-x-1",
                active
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25"
                  : "text-muted hover:bg-surface-2 hover:text-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "h-[18px] w-[18px] transition-transform duration-200",
                  active ? "scale-110" : "group-hover:scale-110"
                )}
              />
              {item.label}
              {!active && (
                <span className="absolute left-3 right-3 bottom-1 h-px origin-left scale-x-0 rounded-full bg-blue-500/40 transition-transform duration-300 group-hover:scale-x-100" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-semibold text-white shadow-md shadow-blue-600/20">
            {(user.name || user.email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
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
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-surface/95 backdrop-blur lg:block">{sidebar}</aside>

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

      <div className="lg:pl-64">
        {/* Thanh trên cùng */}
        <header className="glass sticky top-0 z-20 flex items-center gap-3 border-b border-border px-4 py-3 lg:px-8">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-muted transition-all hover:-translate-y-0.5 hover:bg-surface-2 hover:text-foreground lg:hidden" aria-label="Mở menu">
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="flex-1 truncate text-base font-semibold tracking-tight">
            {NAV.find((n) => n.href === pathname)?.label ?? "StudyFlow"}
          </h1>
          {loading && (
            <Badge className="hidden gap-1.5 bg-surface-2 text-muted sm:inline-flex">
              <Loader2 className="h-3 w-3 animate-spin" />
              Đang đồng bộ
            </Badge>
          )}
          <Badge className={cn(
            "transition-colors",
            storageMode === "supabase" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400"
          )}>
            {storageMode === "supabase" ? "Supabase" : "Lưu cục bộ"}
          </Badge>
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
        </header>

        {/* Nền trang trí cực nhẹ */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-32 right-[10%] h-80 w-80 rounded-full bg-blue-500/[0.06] blur-3xl dark:bg-blue-500/[0.05]" />
          <div className="absolute bottom-0 left-[20%] h-64 w-96 rounded-full bg-indigo-500/[0.05] blur-3xl dark:bg-violet-500/[0.04]" />
        </div>

        <main className="p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
