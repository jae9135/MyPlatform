-- MyPlatform initial schema (Supabase SQL Editor에서 실행)
-- 샘플 메타 + 도구 목록 + (선택) 실행 로그. 업무 결과 파일은 저장하지 않는 전제.

create extension if not exists "pgcrypto";

-- 도구 레지스트리 (포털 카드)
create table if not exists public.apps (
  id text primary key,
  name text not null,
  description text not null default '',
  category text not null default 'tool',
  status text not null default 'planned'
    check (status in ('live', 'beta', 'planned')),
  portal_path text,
  api_path text,
  local_path_hint text,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);

-- Storage 객체 메타 (실제 파일은 Storage 버킷)
create table if not exists public.sample_assets (
  id uuid primary key default gen_random_uuid(),
  app_id text references public.apps (id) on delete set null,
  title text not null,
  bucket text not null,
  object_path text not null,
  content_type text,
  kind text not null default 'sample'
    check (kind in ('sample', 'standard', 'docs')),
  bytes bigint,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  unique (bucket, object_path)
);

-- 실행 로그 (파일 내용 저장 금지, 메타만)
create table if not exists public.run_events (
  id uuid primary key default gen_random_uuid(),
  app_id text references public.apps (id) on delete set null,
  kind text not null default 'check',
  client text,
  ok boolean,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists run_events_created_at_idx on public.run_events (created_at desc);
create index if not exists sample_assets_app_id_idx on public.sample_assets (app_id);

alter table public.apps enable row level security;
alter table public.sample_assets enable row level security;
alter table public.run_events enable row level security;

-- 익명 읽기: 앱 목록·공개 샘플 메타
create policy "apps_public_read"
  on public.apps for select
  to anon, authenticated
  using (true);

create policy "sample_assets_public_read"
  on public.sample_assets for select
  to anon, authenticated
  using (is_public = true);

-- 실행 로그: 익명 insert만 (읽기는 authenticated — 필요 시 조정)
create policy "run_events_anon_insert"
  on public.run_events for insert
  to anon, authenticated
  with check (true);

create policy "run_events_auth_read"
  on public.run_events for select
  to authenticated
  using (true);

-- seed apps
insert into public.apps (id, name, description, category, status, portal_path, api_path, local_path_hint, sort_order)
values
  ('chk-db-std', 'ChkDBStd', '행안부 공통표준 단어/용어/도메인/코드 점검', 'db-std', 'beta', '/apps/chk-db-std', '/v1/chk-db-std', 'study/ChkDBStd', 10),
  ('db-manager', 'DBManager', '테이블정의서 → PostgreSQL DDL / 데이터 관리', 'db-std', 'planned', '/apps/db-manager', '/v1/db-manager', 'study/DBManager', 20),
  ('deliverable-manager', 'DeliverableManager', '산출물 목록·문서 조회', 'pm', 'planned', '/apps/deliverable-manager', null, 'study/DeliverableManager', 30),
  ('receipt-to-pdf', 'ReceiptToPDF', '영수증 촬영 → A4 PDF (PWA)', 'mobile', 'planned', '/apps/receipt-to-pdf', null, 'study/ReceiptToPDF', 40),
  ('my-gantt', 'MyGantt', '일정/간트 관리', 'pm', 'planned', '/apps/my-gantt', null, null, 50)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  portal_path = excluded.portal_path,
  api_path = excluded.api_path,
  sort_order = excluded.sort_order;

-- Storage 버킷은 Dashboard에서 생성 권장:
--   samples   (공개 또는 signed)
--   standards (비공개, service role로 API만 접근)
