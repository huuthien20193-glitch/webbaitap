-- ═══════════════════════════════════════════════════════════════
-- StudyOS 2.0 – Migration from StudyFlow v1 (002)
-- Chạy trong Supabase Dashboard → SQL Editor (sau schema.sql v1).
--
-- NGUYÊN TẮC AN TOÀN:
--   • KHÔNG DROP bảng/cột nào của v1 — chỉ thêm bảng + cột mới.
--   • Dữ liệu v1 được COPY sang cấu trúc mới, GIỮ NGUYÊN id
--     (subject_id cũ == course_id mới) nên app cũ/app mới cùng đọc được.
--   • Chạy lại nhiều lần vẫn an toàn (idempotent).
-- ═══════════════════════════════════════════════════════════════

-- ── 0) Helper: updated_at trigger ──────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── 1) profiles (thông tin người dùng) ────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles_self_all" on public.profiles;
create policy "profiles_self_all" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── 2) courses (thay thế subjects — giữ id cũ) ────────────────
create table if not exists public.courses (
  id uuid primary key, -- COPY từ subjects.id để task/cột cũ map thẳng
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  code text not null default '',
  instructor text not null default '',
  credits integer not null default 0 check (credits between 0 and 30),
  description text not null default '',
  color text not null default '#6366f1',
  goal text not null default '',
  created_at timestamptz not null default now()
);
alter table public.courses enable row level security;
drop policy if exists "courses_owner_all" on public.courses;
create policy "courses_owner_all" on public.courses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Copy dữ liệu v1 → v2 (giữ nguyên id). Chỉ khi bảng nguồn tồn tại
-- và chưa từng copy (insert on conflict do nothing).
do $$
begin
  if to_regclass('public.subjects') is not null then
    insert into public.courses (id, user_id, name, color, goal, created_at)
    select s.id, s.user_id, s.name, s.color, s.goal, s.created_at
    from public.subjects s
    on conflict (id) do nothing;
  end if;
end $$;

-- ── 3) chapters (chương học + mức hiểu bài 1–5) ───────────────
create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  content text not null default '',
  understanding integer not null default 1 check (understanding between 1 and 5),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.chapters enable row level security;
drop policy if exists "chapters_owner_all" on public.chapters;
create policy "chapters_owner_all" on public.chapters
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 4) tasks: thêm cột v2 (không xóa cột cũ) ──────────────────
alter table public.tasks
  add column if not exists course_id uuid references public.courses (id) on delete set null,
  add column if not exists est_minutes integer not null default 30 check (est_minutes between 5 and 600),
  add column if not exists difficulty integer not null default 3 check (difficulty between 1 and 5),
  add column if not exists importance integer not null default 3 check (importance between 1 and 5),
  add column if not exists progress integer not null default 0 check (progress between 0 and 100);

-- Nếu course_id trống mà subject_id có → map thẳng (id đã được giữ nguyên)
update public.tasks
   set course_id = subject_id
 where course_id is null
   and subject_id is not null;

-- ── 5) study_sessions (thay sessions — khả năng tương thích cũ) ──
create table if not exists public.study_sessions (
  id uuid primary key, -- COPY từ sessions.id khi insert
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  subject_id uuid references public.subjects (id) on delete set null, -- tương thích đọc v1
  started_at timestamptz not null default now(),
  duration_sec integer not null check (duration_sec > 0),
  note text not null default ''
);
alter table public.study_sessions enable row level security;
drop policy if exists "study_sessions_owner_all" on public.study_sessions;
create policy "study_sessions_owner_all" on public.study_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

do $$
begin
  if to_regclass('public.sessions') is not null then
    insert into public.study_sessions (id, user_id, course_id, subject_id, started_at, duration_sec, note)
    select s.id,
           s.user_id,
           s.subject_id, -- course_id giữ nguyên bằng subjects.id mapping
           s.subject_id,
           s.started_at,
           s.duration_sec,
           s.note
    from public.sessions s
    where not exists (select 1 from public.study_sessions ss where ss.id = s.id);
  end if;
end $$;

-- ── 6) flashcards + reviews (SM-2) ────────────────────────────
create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete cascade,
  chapter_id uuid references public.chapters (id) on delete set null,
  question text not null check (char_length(question) between 1 and 400),
  answer text not null check (char_length(answer) between 1 and 800),
  ease numeric not null default 2.5 check (ease between 1.3 and 2.8),
  interval integer not null default 0 check (interval between 0 and 3650),
  repetitions integer not null default 0 check (repetitions between 0 and 9999),
  due_date date not null,
  created_at timestamptz not null default now()
);
alter table public.flashcards enable row level security;
drop policy if exists "flashcards_owner_all" on public.flashcards;
create policy "flashcards_owner_all" on public.flashcards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  flashcard_id uuid not null references public.flashcards (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  rated integer not null check (rated between 0 and 5),
  reviewed_at timestamptz not null default now()
);
alter table public.reviews enable row level security;
drop policy if exists "reviews_owner_all" on public.reviews;
create policy "reviews_owner_all" on public.reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 7) exams + exam_results ───────────────────────────────────
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  exam_date date not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.exams enable row level security;
drop policy if exists "exams_owner_all" on public.exams;
create policy "exams_owner_all" on public.exams
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.exam_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  score integer not null check (score between 0 and 100),
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.exam_results enable row level security;
drop policy if exists "exam_results_owner_all" on public.exam_results;
create policy "exam_results_owner_all" on public.exam_results
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 8) ai_conversations (lịch sử hội thoại AI) ────────────────
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Cuộc trò chuyện',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_conversations enable row level security;
drop policy if exists "ai_conversations_owner_all" on public.ai_conversations;
create policy "ai_conversations_owner_all" on public.ai_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists trg_ai_conversations_updated_at on public.ai_conversations;
create trigger trg_ai_conversations_updated_at before update on public.ai_conversations
  for each row execute function public.set_updated_at();

-- ── 9) Chỉ mục phục vụ truy vấn nhanh ────────────────────────
create index if not exists idx_courses_user       on public.courses (user_id);
create index if not exists idx_chapters_course    on public.chapters (course_id, position);
create index if not exists idx_tasks_course       on public.tasks (course_id);
create index if not exists idx_study_sessions_user_start on public.study_sessions (user_id, started_at);
create index if not exists idx_study_sessions_course     on public.study_sessions (course_id);
create index if not exists idx_flashcards_user_due       on public.flashcards (user_id, due_date);
create index if not exists idx_flashcards_course         on public.flashcards (course_id);
create index if not exists idx_reviews_card              on public.reviews (flashcard_id);
create index if not exists idx_reviews_user_at           on public.reviews (user_id, reviewed_at);
create index if not exists idx_exams_user_date           on public.exams (user_id, exam_date);
create index if not exists idx_exam_results_exam         on public.exam_results (exam_id);
create index if not exists idx_ai_conversations_user     on public.ai_conversations (user_id, updated_at desc);

-- ═══════════════════════════════════════════════════════════════
-- XONG. Đây là bản migration an toàn: dữ liệu v1 KHÔNG BỊ XÓA.
-- Bảng v1 (subjects, sessions) được giữ nguyên — chỉ không còn được
-- app v2 ghi nữa (app v2 đọc study_sessions + courses).
-- ═══════════════════════════════════════════════════════════════
