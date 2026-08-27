-- Portal access codes (발급형 로그인 암호)
-- 서버(service role)만 접근. 평문 코드는 DB에 저장하지 않음.

create table if not exists public.portal_access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  kind text not null check (kind in ('full', 'day', 'once')),
  label text not null default '',
  max_uses int,
  use_count int not null default 0 check (use_count >= 0),
  expires_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint portal_access_codes_max_uses_chk check (max_uses is null or max_uses > 0)
);

create index if not exists portal_access_codes_kind_idx on public.portal_access_codes (kind);
create index if not exists portal_access_codes_created_at_idx on public.portal_access_codes (created_at desc);
create index if not exists portal_access_codes_active_idx on public.portal_access_codes (revoked, expires_at);

comment on table public.portal_access_codes is '베타 포털 발급 암호 (해시 저장). full=30일, day=1일, once=1회';
comment on column public.portal_access_codes.max_uses is 'null=제한 없음. once 발급 시 1';

alter table public.portal_access_codes enable row level security;
