-- 방문 시각: 일별 집계 last_viewed_at + 개별 방문 로그

alter table public.portal_visit_daily
  add column if not exists last_viewed_at timestamptz;

create table if not exists public.portal_visit_log (
  id bigserial primary key,
  path text not null,
  visited_at timestamptz not null default now()
);

create index if not exists portal_visit_log_path_visited_idx
  on public.portal_visit_log (path, visited_at desc);

comment on table public.portal_visit_log is '포털 공개 페이지 개별 방문(세션) 시각 로그';

alter table public.portal_visit_log enable row level security;
