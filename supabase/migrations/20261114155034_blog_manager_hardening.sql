-- Hardening for the private blog manager. Apply after 20261114142940_blog_manager.
-- This migration is intentionally separate because the earlier file is not tracked
-- in Git and its remote application history has not been inspected.

-- Terminal schedule states are immutable. A planned schedule may be completed
-- only inside the publish-history RPC so history and state remain atomic.
create function public.blog_guard_schedule_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'planned' then
      raise exception using errcode = '55000', message = 'terminal schedules cannot be deleted';
    end if;
    return old;
  end if;

  if old.status <> 'planned' and new is distinct from old then
    raise exception using errcode = '55000', message = 'terminal schedules are immutable';
  end if;

  if old.status = 'planned' and new.status = 'completed'
     and pg_catalog.current_setting('app.blog_publish_rpc', true) is distinct from 'on' then
    raise exception using errcode = '55000', message = 'schedule completion requires a publish record';
  end if;
  return new;
end;
$function$;

revoke all on function public.blog_guard_schedule_state() from public, anon, authenticated, service_role;
create trigger blog_schedules_state_guard
before update or delete on public.blog_schedules
for each row execute function public.blog_guard_schedule_state();

-- Durable work records survive failures between Supabase Storage and Postgres.
-- asset_id deliberately has no FK so cleanup work remains after metadata deletion.
create table public.blog_storage_cleanup (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid,
  action text not null check (action in ('delete_asset', 'delete_orphan')),
  storage_path text not null unique check (length(btrim(storage_path)) between 1 and 1024),
  backup_path text unique check (backup_path is null or length(btrim(backup_path)) between 1 and 1024),
  file_name text,
  mime_type text check (mime_type is null or mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  size_bytes bigint check (size_bytes is null or size_bytes > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  alt_text text,
  status text not null default 'pending'
    check (status in ('pending', 'backup_ready', 'object_removed', 'restore_pending', 'retry', 'cleanup_pending', 'source_missing', 'completed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error_code text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((action = 'delete_asset' and asset_id is not null and backup_path is not null and mime_type is not null and size_bytes is not null)
      or (action = 'delete_orphan' and asset_id is null and backup_path is null))
);

create unique index blog_storage_cleanup_asset_id_idx
  on public.blog_storage_cleanup (asset_id) where asset_id is not null;
create index blog_storage_cleanup_retry_idx
  on public.blog_storage_cleanup (status, next_attempt_at)
  where status not in ('completed', 'source_missing');

create function public.blog_guard_storage_cleanup()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'storage cleanup records are retained';
  end if;
  if old.status = 'completed' and new is distinct from old then
    raise exception using errcode = '55000', message = 'completed storage cleanup records are immutable';
  end if;
  return new;
end;
$function$;

revoke all on function public.blog_guard_storage_cleanup() from public, anon, authenticated, service_role;
create trigger blog_storage_cleanup_state_guard
before update or delete on public.blog_storage_cleanup
for each row execute function public.blog_guard_storage_cleanup();

-- Create or reuse a durable delete task only after checking all DB references.
create function public.blog_prepare_asset_cleanup(p_asset_id uuid, p_backup_path text)
returns public.blog_storage_cleanup
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_asset public.blog_assets%rowtype;
  v_job public.blog_storage_cleanup%rowtype;
begin
  select * into v_asset from public.blog_assets where id = p_asset_id for update;
  if not found then
    select * into v_job from public.blog_storage_cleanup where asset_id = p_asset_id;
    if found then return v_job; end if;
    raise exception using errcode = 'P0002', message = 'image metadata not found';
  end if;

  select * into v_job from public.blog_storage_cleanup where asset_id = p_asset_id for update;
  if found and v_job.status <> 'completed' then return v_job; end if;

  if exists (select 1 from public.blog_posts where cover_asset_id = p_asset_id)
     or exists (select 1 from public.blog_post_assets where asset_id = p_asset_id) then
    raise exception using errcode = '55000', message = 'image is still referenced';
  end if;

  insert into public.blog_storage_cleanup (
    asset_id, action, storage_path, backup_path, file_name, mime_type,
    size_bytes, width, height, alt_text, status, attempts,
    last_error_code, next_attempt_at, completed_at, updated_at
  ) values (
    p_asset_id, 'delete_asset', v_asset.storage_path, p_backup_path,
    v_asset.file_name, v_asset.mime_type, v_asset.size_bytes,
    v_asset.width, v_asset.height, v_asset.alt_text, 'pending', 0,
    null, now(), null, now()
  )
  on conflict (asset_id) where asset_id is not null do update
    set storage_path = excluded.storage_path,
        backup_path = excluded.backup_path,
        file_name = excluded.file_name,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        width = excluded.width,
        height = excluded.height,
        alt_text = excluded.alt_text,
        status = 'pending', attempts = 0, last_error_code = null,
        next_attempt_at = now(), completed_at = null, updated_at = now()
  returning * into v_job;
  return v_job;
end;
$function$;

revoke all on function public.blog_prepare_asset_cleanup(uuid, text) from public, anon, authenticated;
grant execute on function public.blog_prepare_asset_cleanup(uuid, text) to service_role;

-- Store request-key state separately so list/history responses never expose
-- request fingerprints. Keys are retained as long as their history row exists.
create table public.blog_publish_idempotency (
  idempotency_key uuid primary key,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  publish_history_id uuid not null unique
    references public.blog_publish_history (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- The new signature requires a key and a normalized request fingerprint.
drop function public.blog_record_publish_history(uuid, text, timestamptz, text, text, uuid);

create function public.blog_record_publish_history(
  p_target_id uuid,
  p_result text,
  p_published_at timestamptz,
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_external_url text default null,
  p_note text default null,
  p_schedule_id uuid default null
)
returns jsonb
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
  v_fingerprint text;
begin
  if p_idempotency_key is null or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid idempotency data';
  end if;
  if p_result not in ('success', 'failed') then
    raise exception using errcode = '22023', message = 'invalid publish result';
  end if;
  if p_result = 'success' and p_published_at is null then
    raise exception using errcode = '23514', message = 'successful publish requires published_at';
  end if;
  if p_external_url is not null and p_external_url !~* '^https?://' then
    raise exception using errcode = '22023', message = 'invalid external url';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select i.request_fingerprint, h into v_fingerprint, v_history
    from public.blog_publish_idempotency as i
    join public.blog_publish_history as h on h.id = i.publish_history_id
   where i.idempotency_key = p_idempotency_key
   for update of i;
  if found then
    if v_fingerprint <> p_request_fingerprint then
      raise exception using errcode = '55000', message = 'idempotency key reused with different request';
    end if;
    return pg_catalog.jsonb_build_object('history', pg_catalog.to_jsonb(v_history), 'replayed', true);
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
    select * into v_schedule from public.blog_schedules
     where id = p_schedule_id and target_id = p_target_id for update;
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

  insert into public.blog_publish_idempotency (idempotency_key, request_fingerprint, publish_history_id)
  values (p_idempotency_key, p_request_fingerprint, v_history.id);

  if p_schedule_id is not null and p_result = 'success' then
    perform pg_catalog.set_config('app.blog_publish_rpc', 'on', true);
    update public.blog_schedules
       set status = 'completed', updated_at = now()
     where id = p_schedule_id;
  end if;

  return pg_catalog.jsonb_build_object('history', pg_catalog.to_jsonb(v_history), 'replayed', false);
end;
$function$;

revoke all on function public.blog_record_publish_history(uuid, text, timestamptz, uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.blog_record_publish_history(uuid, text, timestamptz, uuid, text, text, text, uuid)
  to service_role;

alter table public.blog_storage_cleanup enable row level security;
alter table public.blog_publish_idempotency enable row level security;
revoke all privileges on table public.blog_storage_cleanup, public.blog_publish_idempotency
  from anon, authenticated;
grant all privileges on table public.blog_storage_cleanup, public.blog_publish_idempotency
  to service_role;
