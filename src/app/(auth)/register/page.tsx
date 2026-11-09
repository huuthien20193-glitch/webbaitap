"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { GraduationCap } from "lucide-react";
import { Button, TextField } from "@/components/ui";
import { useAuth } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const { user, authLoading, signUp } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; confirm?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) router.replace("/dashboard");
  }, [authLoading, user, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const nextErrors: typeof errors = {};
    if (!name.trim()) nextErrors.name = "Vui lòng nhập họ tên.";
    else if (name.trim().length < 2) nextErrors.name = "Họ tên tối thiểu 2 ký tự.";
    if (!email.trim()) nextErrors.email = "Vui lòng nhập email.";
    else if (!EMAIL_RE.test(email.trim())) nextErrors.email = "Email không hợp lệ.";
    if (!password) nextErrors.password = "Vui lòng nhập mật khẩu.";
    else if (password.length < 6) nextErrors.password = "Mật khẩu tối thiểu 6 ký tự.";
    if (!confirm) nextErrors.confirm = "Vui lòng nhập lại mật khẩu.";
    else if (confirm !== password) nextErrors.confirm = "Mật khẩu nhập lại không khớp.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await signUp(email, password, name);
      router.replace("/dashboard");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Đăng ký thất bại. Thử lại sau.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Bối cảnh trang trí */}
      <div className="bg-grid pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -top-24 left-[15%] h-72 w-72 rounded-full bg-blue-500/15 blur-3xl animate-float" />
      <div className="pointer-events-none absolute -bottom-24 right-[10%] h-80 w-80 rounded-full bg-violet-500/15 blur-3xl animate-float-delay" />
      <div className="pointer-events-none absolute top-[20%] right-[25%] h-40 w-40 rounded-full bg-indigo-400/10 blur-2xl animate-float" />

      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-600/30">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">StudyFlow</h1>
            <p className="mt-1 text-sm text-muted">Smart Study Planner</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="glass space-y-4 rounded-2xl border border-border p-6 shadow-card-hover" noValidate>
          <h2 className="text-lg font-semibold">Tạo tài khoản</h2>
          {formError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{formError}</p>
          )}
          <TextField
            id="name"
            label="Họ tên"
            placeholder="Nguyễn Văn A"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
            required
          />
          <TextField
            id="email"
            label="Email"
            type="email"
            placeholder="ban@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            required
          />
          <TextField
            id="password"
            label="Mật khẩu"
            type="password"
            placeholder="Tối thiểu 6 ký tự"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            required
          />
          <TextField
            id="confirm"
            label="Nhập lại mật khẩu"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
            required
          />
          <Button type="submit" loading={submitting} className="w-full">
            Đăng ký
          </Button>
          <p className="text-center text-sm text-muted">
            Đã có tài khoản?{" "}
            <Link href="/login" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Đăng nhập
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
