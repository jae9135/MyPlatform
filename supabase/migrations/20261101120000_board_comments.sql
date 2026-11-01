-- 게시판 댓글. 포털 서버(service role)만 읽고 씀 — RLS 켜고 정책 없음 (board_posts 와 동일).

create table if not exists public.board_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.board_posts (id) on delete cascade,
  body text not null,
  nickname text not null,
  status text not null default 'published' check (status in ('pending', 'published', 'hidden')),
  is_admin boolean not null default false,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists board_comments_post_idx
  on public.board_comments (post_id, status, created_at);

create index if not exists board_comments_ip_created_idx
  on public.board_comments (ip_hash, created_at desc);

comment on table public.board_comments is '포털 /community 글의 댓글 (링크 포함 댓글은 승인 대기)';
comment on column public.board_comments.is_admin is '관리자 화면에서 단 운영자 댓글';
comment on column public.board_comments.ip_hash is '작성자 IP의 해시 — 도배 방지용, 원본 IP는 저장하지 않음';

alter table public.board_comments enable row level security;
