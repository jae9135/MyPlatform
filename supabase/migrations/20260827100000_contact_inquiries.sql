-- Portal contact form (server-side storage). Service role only.

create table if not exists public.contact_inquiries (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  phone text not null,
  tool text,
  request_type text not null default 'customize',
  message text not null,
  source text not null default 'portal',
  emailed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists contact_inquiries_created_at_idx
  on public.contact_inquiries (created_at desc);

comment on table public.contact_inquiries is '공개 문의 폼 제출 (포털 /contact)';

alter table public.contact_inquiries enable row level security;
