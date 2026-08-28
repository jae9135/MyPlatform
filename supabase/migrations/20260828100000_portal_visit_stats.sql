-- Daily page view counters (public marketing pages). Service role only.

create table if not exists public.portal_visit_daily (
  path text not null,
  visit_date date not null default (timezone('Asia/Seoul', now()))::date,
  views bigint not null default 0,
  primary key (path, visit_date)
);

create index if not exists portal_visit_daily_date_idx
  on public.portal_visit_daily (visit_date desc);

comment on table public.portal_visit_daily is '포털 공개 페이지 일별 방문(페이지뷰) 집계';

alter table public.portal_visit_daily enable row level security;
