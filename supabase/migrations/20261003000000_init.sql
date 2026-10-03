-- Kiwi Time Tracker: initial schema.
-- Every table is private to its owner through row level security (auth.uid()).
-- Vocabulary is generic: "categories" are level 1 (Client, Matière…),
-- "projects" are level 2 (Projet, Sujet…). Users rename both in their profile.

-- ---------------------------------------------------------------------------
-- Profiles: one row per user, holds preferences and level labels.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  onboarded boolean not null default false,
  level1_label text not null default 'Client',
  level1_label_plural text not null default 'Clients',
  level2_label text not null default 'Projet',
  level2_label_plural text not null default 'Projets',
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  week_start smallint not null default 1 check (week_start in (0, 1)),
  day_hours numeric(4, 2) not null default 7 check (day_hours > 0 and day_hours <= 24),
  duration_format text not null default 'hm' check (duration_format in ('hm', 'decimal', 'clock')),
  rounding_minutes smallint not null default 0 check (rounding_minutes in (0, 1, 5, 6, 10, 15, 30, 60)),
  rounding_mode text not null default 'nearest' check (rounding_mode in ('nearest', 'up', 'down')),
  pomodoro_work smallint not null default 25 check (pomodoro_work between 1 and 180),
  pomodoro_short_break smallint not null default 5 check (pomodoro_short_break between 1 and 60),
  pomodoro_long_break smallint not null default 15 check (pomodoro_long_break between 1 and 120),
  pomodoro_long_every smallint not null default 4 check (pomodoro_long_every between 2 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Level 1 (categories) and level 2 (projects).
-- Budgets are expressed in days (converted with profiles.day_hours).
-- Recurring goals are an amount per week or month, in hours or days.
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  color text not null default '#5E9B2E' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  budget_days numeric(8, 2) check (budget_days > 0),
  goal_amount numeric(8, 2) check (goal_amount > 0),
  goal_unit text check (goal_unit in ('hours', 'days')),
  goal_period text check (goal_period in ('week', 'month')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint categories_goal_complete check (
    (goal_amount is null and goal_unit is null and goal_period is null)
    or (goal_amount is not null and goal_unit is not null and goal_period is not null)
  )
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  color text not null default '#5E9B2E' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  budget_days numeric(8, 2) check (budget_days > 0),
  goal_amount numeric(8, 2) check (goal_amount > 0),
  goal_unit text check (goal_unit in ('hours', 'days')),
  goal_period text check (goal_period in ('week', 'month')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint projects_goal_complete check (
    (goal_amount is null and goal_unit is null and goal_period is null)
    or (goal_amount is not null and goal_unit is not null and goal_period is not null)
  )
);

create index projects_user_idx on public.projects (user_id);
create index projects_category_idx on public.projects (category_id);
create index categories_user_idx on public.categories (user_id);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------------------
-- Time entries. end_at null means the timer is running.
-- ---------------------------------------------------------------------------
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  description text not null default '',
  tag_ids uuid[] not null default '{}',
  start_at timestamptz not null,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_end_after_start check (end_at is null or end_at >= start_at)
);

create index time_entries_user_start_idx on public.time_entries (user_id, start_at desc);
create index time_entries_project_idx on public.time_entries (project_id);
-- At most one running timer per user, across all devices.
create unique index time_entries_one_running_idx on public.time_entries (user_id) where end_at is null;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger time_entries_touch before update on public.time_entries
  for each row execute function public.touch_updated_at();

-- Removing a tag removes it from every entry that carries it.
create or replace function public.remove_deleted_tag()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.time_entries
     set tag_ids = array_remove(tag_ids, old.id)
   where user_id = old.user_id
     and old.id = any (tag_ids);
  return old;
end;
$$;

create trigger tags_cleanup after delete on public.tags
  for each row execute function public.remove_deleted_tag();

-- New users get a profile, named from their Google or Microsoft account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Timer RPC: stop the running entry and start a new one in one transaction.
-- ---------------------------------------------------------------------------
create or replace function public.start_timer(
  p_project_id uuid default null,
  p_description text default '',
  p_tag_ids uuid[] default '{}',
  p_start_at timestamptz default now()
)
returns public.time_entries
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entry public.time_entries;
begin
  update public.time_entries
     set end_at = greatest(p_start_at, start_at)
   where user_id = auth.uid()
     and end_at is null;

  insert into public.time_entries (user_id, project_id, description, tag_ids, start_at)
  values (auth.uid(), p_project_id, coalesce(p_description, ''), coalesce(p_tag_ids, '{}'), p_start_at)
  returning * into v_entry;

  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.projects enable row level security;
alter table public.tags enable row level security;
alter table public.time_entries enable row level security;

create policy "profiles: owner reads" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: owner inserts" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles: owner updates" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "categories: owner all" on public.categories
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "projects: owner all" on public.projects
  for all to authenticated using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (category_id is null or exists (
      select 1 from public.categories c where c.id = category_id and c.user_id = auth.uid()
    ))
  );

create policy "tags: owner all" on public.tags
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "time_entries: owner all" on public.time_entries
  for all to authenticated using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (project_id is null or exists (
      select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
    ))
  );

grant execute on function public.start_timer(uuid, text, uuid[], timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: keep every open device in sync (running timer, edits).
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.time_entries;
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.tags;
alter publication supabase_realtime add table public.profiles;
