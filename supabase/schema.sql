-- ═══════════════════════════════════════════════════════════════
-- StudyFlow – Schema Supabase (PostgreSQL)
-- Chạy toàn bộ script này trong Supabase Dashboard → SQL Editor.
-- Bảo mật: Row Level Security đảm bảo mỗi người dùng chỉ truy cập
-- dữ liệu của chính mình (auth.uid()).
-- ═══════════════════════════════════════════════════════════════

-- ── Môn học ────────────────────────────────────────────────────
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null default '#3b82f6',
  goal text not null default '',
  created_at timestamptz not null default now()
);

-- ── Nhiệm vụ ───────────────────────────────────────────────────
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  start_date date not null,
  due_date date not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── Phiên học (Pomodoro / thời gian thực tế) ───────────────────
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  started_at timestamptz not null default now(),
  duration_sec integer not null check (duration_sec > 0),
  note text not null default ''
);

-- ── Mục tiêu ───────────────────────────────────────────────────
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null check (scope in ('daily', 'weekly')),
  metric text not null check (metric in ('tasks', 'minutes')),
  target integer not null check (target > 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

-- ── Bật Row Level Security cho mọi bảng ────────────────────────
alter table public.subjects enable row level security;
alter table public.tasks    enable row level security;
alter table public.sessions enable row level security;
alter table public.goals    enable row level security;

-- Xóa policy cũ nếu chạy lại script
drop policy if exists "subjects_owner_all" on public.subjects;
drop policy if exists "tasks_owner_all"    on public.tasks;
drop policy if exists "sessions_owner_all" on public.sessions;
drop policy if exists "goals_owner_all"    on public.goals;

-- Người dùng đã đăng nhập chỉ thao tác được với dữ liệu của chính mình
create policy "subjects_owner_all" on public.subjects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "tasks_owner_all" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "sessions_owner_all" on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "goals_owner_all" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Chỉ mục hỗ trợ truy vấn nhanh ──────────────────────────────
create index if not exists idx_tasks_user_due      on public.tasks (user_id, due_date);
create index if not exists idx_tasks_user_status   on public.tasks (user_id, status);
create index if not exists idx_tasks_subject       on public.tasks (subject_id);
create index if not exists idx_sessions_user_start on public.sessions (user_id, started_at);
create index if not exists idx_subjects_user       on public.subjects (user_id);
create index if not exists idx_goals_user          on public.goals (user_id);
