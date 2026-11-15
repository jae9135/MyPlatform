-- Private blog manager schema. Existing application tables are intentionally untouched.
-- All writes and reads are performed by authenticated portal server routes.

create table public.blog_platforms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('naver', 'tistory')),
  name text not null check (length(btrim(name)) between 1 and 80),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.blog_platforms (code, name)
values ('naver', '네이버 블로그'), ('tistory', '티스토리')
on conflict (code) do nothing;

create table public.blog_accounts (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.blog_platforms (id) on delete restrict,
  account_name text not null check (length(btrim(account_name)) between 1 and 120),
  blog_url text not null check (blog_url ~* '^https?://'),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, blog_url)
);

create index blog_accounts_platform_active_idx
  on public.blog_accounts (platform_id, active);

create table public.blog_topics (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 100),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.blog_categories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.blog_accounts (id) on delete restrict,
  parent_id uuid,
  name text not null check (length(btrim(name)) between 1 and 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, name),
  unique (id, account_id),
  foreign key (parent_id, account_id)
    references public.blog_categories (id, account_id) on delete restrict,
  check (parent_id is null or parent_id <> id)
);

create index blog_categories_account_parent_sort_idx
  on public.blog_categories (account_id, parent_id, sort_order);
create index blog_categories_parent_id_idx on public.blog_categories (parent_id);

create table public.blog_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique check (length(btrim(storage_path)) between 1 and 1024),
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  size_bytes bigint not null check (size_bytes > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  alt_text text,
  created_at timestamptz not null default now()
);

create index blog_assets_created_at_idx on public.blog_assets (created_at desc);

create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  slug text unique check (slug is null or length(btrim(slug)) between 1 and 180),
  excerpt text check (excerpt is null or length(excerpt) <= 1000),
  body_markdown text not null default '',
  body_html text not null default '',
  edit_status text not null default 'draft'
    check (edit_status in ('draft', 'ready', 'archived')),
  cover_asset_id uuid references public.blog_assets (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index blog_posts_status_updated_idx
  on public.blog_posts (edit_status, updated_at desc);
create index blog_posts_created_at_idx on public.blog_posts (created_at desc);

create table public.blog_post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts (id) on delete cascade,
  account_id uuid not null references public.blog_accounts (id) on delete restrict,
  title_override text check (title_override is null or length(btrim(title_override)) between 1 and 200),
  body_markdown_override text,
  body_html_override text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, account_id),
  unique (id, account_id)
);

create index blog_post_targets_account_id_idx on public.blog_post_targets (account_id);

create table public.blog_post_topics (
  post_id uuid not null references public.blog_posts (id) on delete cascade,
  topic_id uuid not null references public.blog_topics (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (post_id, topic_id)
);

create index blog_post_topics_topic_id_idx on public.blog_post_topics (topic_id);

create table public.blog_post_target_categories (
  target_id uuid not null,
  category_id uuid not null,
  account_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (target_id, category_id),
  foreign key (target_id, account_id)
    references public.blog_post_targets (id, account_id) on delete cascade,
  foreign key (category_id, account_id)
    references public.blog_categories (id, account_id) on delete restrict
);

create index blog_post_target_categories_category_id_idx
  on public.blog_post_target_categories (category_id);

create table public.blog_post_assets (
  post_id uuid not null references public.blog_posts (id) on delete cascade,
  asset_id uuid not null references public.blog_assets (id) on delete restrict,
  role text not null default 'inline' check (role in ('cover', 'inline')),
  created_at timestamptz not null default now(),
  primary key (post_id, asset_id)
);

create index blog_post_assets_asset_id_idx on public.blog_post_assets (asset_id);

create table public.blog_schedules (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.blog_post_targets (id) on delete cascade,
  planned_at timestamptz not null,
  status text not null default 'planned'
    check (status in ('planned', 'cancelled', 'completed', 'missed')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index blog_schedules_status_planned_idx
  on public.blog_schedules (status, planned_at);
create index blog_schedules_target_id_idx on public.blog_schedules (target_id);
create unique index blog_schedules_one_planned_per_target_idx
  on public.blog_schedules (target_id)
  where status = 'planned';

create table public.blog_publish_history (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.blog_posts (id) on delete set null,
  target_id uuid references public.blog_post_targets (id) on delete set null,
  account_id uuid references public.blog_accounts (id) on delete set null,
  schedule_id uuid references public.blog_schedules (id) on delete set null,
  post_title_snapshot text not null check (length(btrim(post_title_snapshot)) between 1 and 200),
  platform_code_snapshot text not null check (platform_code_snapshot in ('naver', 'tistory')),
  account_name_snapshot text not null check (length(btrim(account_name_snapshot)) between 1 and 120),
  result text not null check (result in ('success', 'failed')),
  published_at timestamptz,
  external_url text check (external_url is null or external_url ~* '^https?://'),
  note text,
  created_at timestamptz not null default now(),
  check (result <> 'success' or published_at is not null)
);

create index blog_publish_history_post_published_idx
  on public.blog_publish_history (post_id, published_at desc);
create index blog_publish_history_account_published_idx
  on public.blog_publish_history (account_id, published_at desc);
create index blog_publish_history_target_created_idx
  on public.blog_publish_history (target_id, created_at desc);

create table public.blog_metrics (
  id uuid primary key default gen_random_uuid(),
  publish_history_id uuid not null references public.blog_publish_history (id) on delete cascade,
  measured_at timestamptz not null default now(),
  views bigint check (views is null or views >= 0),
  likes bigint check (likes is null or likes >= 0),
  comments bigint check (comments is null or comments >= 0),
  source text not null default 'manual' check (source in ('manual', 'api', 'import')),
  created_at timestamptz not null default now(),
  unique (publish_history_id, measured_at)
);

create index blog_metrics_history_measured_idx
  on public.blog_metrics (publish_history_id, measured_at desc);

-- Append one manual publish result and complete its planned schedule atomically.
create function public.blog_record_publish_history(
  p_target_id uuid,
  p_result text,
  p_published_at timestamptz,
  p_external_url text default null,
  p_note text default null,
  p_schedule_id uuid default null
)
returns public.blog_publish_history
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_target public.blog_post_targets%rowtype;
  v_post public.blog_posts%rowtype;
  v_account public.blog_accounts%rowtype;
  v_platform public.blog_platforms%rowtype;
  v_schedule public.blog_schedules%rowtype;
  v_history public.blog_publish_history%rowtype;
begin
  if p_result not in ('success', 'failed') then
    raise exception using errcode = '22023', message = 'invalid publish result';
  end if;
  if p_result = 'success' and p_published_at is null then
    raise exception using errcode = '23514', message = 'successful publish requires published_at';
  end if;
  if p_external_url is not null and p_external_url !~* '^https?://' then
    raise exception using errcode = '22023', message = 'invalid external url';
  end if;

  select t, p, a, pl
    into v_target, v_post, v_account, v_platform
    from public.blog_post_targets as t
    join public.blog_posts as p on p.id = t.post_id
    join public.blog_accounts as a on a.id = t.account_id
    join public.blog_platforms as pl on pl.id = a.platform_id
   where t.id = p_target_id
   for update of t;

  if not found then
    raise exception using errcode = 'P0002', message = 'publish target not found';
  end if;

  if p_schedule_id is not null then
    select * into v_schedule
      from public.blog_schedules
     where id = p_schedule_id and target_id = p_target_id
     for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'schedule not found for target';
    end if;
    if v_schedule.status <> 'planned' then
      raise exception using errcode = '55000', message = 'schedule is not planned';
    end if;
  end if;

  insert into public.blog_publish_history (
    post_id, target_id, account_id, schedule_id,
    post_title_snapshot, platform_code_snapshot, account_name_snapshot,
    result, published_at, external_url, note
  ) values (
    v_post.id, v_target.id, v_account.id, p_schedule_id,
    coalesce(v_target.title_override, v_post.title), v_platform.code, v_account.account_name,
    p_result, p_published_at, p_external_url, p_note
  ) returning * into v_history;

  if p_schedule_id is not null and p_result = 'success' then
    update public.blog_schedules
       set status = 'completed', updated_at = now()
     where id = p_schedule_id;
  end if;

  return v_history;
end;
$function$;

revoke all on function public.blog_record_publish_history(uuid, text, timestamptz, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.blog_record_publish_history(uuid, text, timestamptz, text, text, uuid)
  to service_role;

-- Blog data is private. The portal authenticates administrators before using its
-- server-side service-role client; no browser-facing role receives table access.
alter table public.blog_platforms enable row level security;
alter table public.blog_accounts enable row level security;
alter table public.blog_topics enable row level security;
alter table public.blog_categories enable row level security;
alter table public.blog_assets enable row level security;
alter table public.blog_posts enable row level security;
alter table public.blog_post_targets enable row level security;
alter table public.blog_post_topics enable row level security;
alter table public.blog_post_target_categories enable row level security;
alter table public.blog_post_assets enable row level security;
alter table public.blog_schedules enable row level security;
alter table public.blog_publish_history enable row level security;
alter table public.blog_metrics enable row level security;

revoke all privileges on table
  public.blog_platforms,
  public.blog_accounts,
  public.blog_topics,
  public.blog_categories,
  public.blog_assets,
  public.blog_posts,
  public.blog_post_targets,
  public.blog_post_topics,
  public.blog_post_target_categories,
  public.blog_post_assets,
  public.blog_schedules,
  public.blog_publish_history,
  public.blog_metrics
from anon, authenticated;

grant all privileges on table
  public.blog_platforms,
  public.blog_accounts,
  public.blog_topics,
  public.blog_categories,
  public.blog_assets,
  public.blog_posts,
  public.blog_post_targets,
  public.blog_post_topics,
  public.blog_post_target_categories,
  public.blog_post_assets,
  public.blog_schedules,
  public.blog_publish_history,
  public.blog_metrics
to service_role;
