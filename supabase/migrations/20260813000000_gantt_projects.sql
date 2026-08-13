-- MyGantt share-link projects + portal registry
-- Run in Supabase SQL Editor after 20260326120000_db_manager_beta.sql

create table if not exists public.gantt_projects (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.gantt_projects enable row level security;

drop policy if exists "public read gantt_projects" on public.gantt_projects;
drop policy if exists "public insert gantt_projects" on public.gantt_projects;
drop policy if exists "public update gantt_projects" on public.gantt_projects;

-- 링크를 아는 누구나 읽기/쓰기 (공유 링크형). 외부에 링크를 공개하지 마세요.
create policy "public read gantt_projects"
  on public.gantt_projects for select
  using (true);

create policy "public insert gantt_projects"
  on public.gantt_projects for insert
  with check (true);

create policy "public update gantt_projects"
  on public.gantt_projects for update
  using (true)
  with check (true);

update public.apps
set status = 'beta',
    description = '일정/간트 관리 (웹)',
    portal_path = '/apps/my-gantt',
    local_path_hint = 'study/MyGantt'
where id = 'my-gantt';
