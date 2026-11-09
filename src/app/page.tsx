"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function HomePage() {
  const { user, authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    router.replace(user ? "/dashboard" : "/login");
  }, [authLoading, user, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted">
      <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl bg-blue-600 text-white">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      </div>
      <p className="text-sm">StudyFlow đang khởi động...</p>
    </div>
  );
}
