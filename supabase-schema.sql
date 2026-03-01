-- Таблицы для визового помощника. Выполните в SQL Editor в дашборде Supabase.

-- Профили пользователей (визовый профиль)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- Метаданные документов (файлы храните в Storage, ключи — здесь)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  type text not null,
  file_name text not null,
  storage_path text,
  extraction_status text default 'pending',
  extracted_data jsonb,
  created_at timestamptz not null default now()
);

-- Мотивационные письма (для США и др.)
create table if not exists public.motivation_letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  country text not null default 'usa',
  purpose text,
  ties_to_home text,
  trip_plan text,
  letter_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, country)
);

-- Анкеты по странам (UK и др.): привязаны к user_id
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  country text not null,
  visa_type text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, country)
);

-- RLS: доступ только к своим данным
alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.motivation_letters enable row level security;
alter table public.applications enable row level security;

create policy "profiles_select" on public.profiles for select using (auth.uid() = user_id);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = user_id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = user_id);

create policy "documents_all" on public.documents for all using (auth.uid() = user_id);

create policy "motivation_letters_all" on public.motivation_letters for all using (auth.uid() = user_id);

create policy "applications_all" on public.applications for all using (auth.uid() = user_id);
