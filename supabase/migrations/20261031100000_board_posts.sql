-- 커뮤니티 게시판 (후기 · Q&A). 포털 서버(service role)만 읽고 씀 — RLS 켜고 정책 없음.

create table if not exists public.board_posts (
  id uuid primary key default gen_random_uuid(),
  post_type text not null check (post_type in ('review', 'qna')),
  tool text,
  rating smallint check (rating between 1 and 5),
  title text not null,
  body text not null,
  nickname text not null,
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden')),
  answer text,
  answered_at timestamptz,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_posts_status_created_idx
  on public.board_posts (status, created_at desc);

create index if not exists board_posts_tool_type_idx
  on public.board_posts (tool, post_type, status);

create index if not exists board_posts_ip_created_idx
  on public.board_posts (ip_hash, created_at desc);

comment on table public.board_posts is '포털 /community 후기·Q&A (관리자 승인 후 게시)';
comment on column public.board_posts.ip_hash is '작성자 IP의 해시 — 도배 방지용, 원본 IP는 저장하지 않음';

alter table public.board_posts enable row level security;
