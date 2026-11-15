-- Durable, retryable audit records for external blog imports.
create table public.blog_imports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.blog_posts (id) on delete set null,
  source_type text not null check (source_type in ('json', 'zip')),
  original_file_name text,
  external_id text,
  platform_code text check (platform_code is null or platform_code in ('naver', 'tistory')),
  account_id uuid references public.blog_accounts (id) on delete set null,
  checksum text not null check (length(btrim(checksum)) between 32 and 128),
  dedupe_key text not null unique check (length(btrim(dedupe_key)) between 1 and 256),
  source_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  -- Compatibility field: attempt_count = automatic + manual attempts.
  attempt_count integer not null default 1 check (attempt_count >= 1),
  auto_attempt_count integer not null default 1 check (auto_attempt_count >= 0),
  manual_attempt_count integer not null default 0 check (manual_attempt_count >= 0),
  manual_approval_by text,
  manual_approval_at timestamptz,
  manual_approval_reason text,
  lease_token uuid,
  error_code text,
  lease_expires_at timestamptz,
  next_retry_at timestamptz,
  cleanup_status text not null default 'none' check (cleanup_status in ('none', 'pending', 'completed', 'failed')),
  cleanup_error_code text,
  cleanup_attempts integer not null default 0 check (cleanup_attempts >= 0),
  cleanup_next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index blog_imports_post_id_idx on public.blog_imports (post_id);
create index blog_imports_created_at_idx on public.blog_imports (created_at desc);
create index blog_imports_status_retry_idx on public.blog_imports (status, next_retry_at, created_at desc);
create index blog_imports_account_checksum_idx on public.blog_imports (account_id, checksum);

-- Durable compensation records linked to their originating import.
create table public.blog_import_cleanup (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.blog_imports (id) on delete cascade,
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 1 and 256),
  target_type text not null check (target_type in ('post', 'asset', 'import')),
  target_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  lease_token uuid,
  lease_expires_at timestamptz,
  error_code text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index blog_import_cleanup_retry_idx on public.blog_import_cleanup (status, next_attempt_at);
create index blog_import_cleanup_import_idx on public.blog_import_cleanup (import_id, created_at);

alter table public.blog_imports enable row level security;
alter table public.blog_import_cleanup enable row level security;
revoke all on public.blog_imports from anon, authenticated;
revoke all on public.blog_import_cleanup from anon, authenticated;
grant select, insert, update on public.blog_imports to service_role;
grant select, insert, update on public.blog_import_cleanup to service_role;

create or replace function public.blog_claim_import(
  p_source_type text, p_original_file_name text, p_external_id text,
  p_platform_code text, p_account_id uuid, p_checksum text, p_dedupe_key text,
  p_source_metadata jsonb default '{}'::jsonb, p_lease_seconds integer default 900,
  p_manual_retry boolean default false, p_manual_approval_by text default null,
  p_manual_approval_reason text default null
)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare
  v_row public.blog_imports;
  v_token uuid := gen_random_uuid();
  v_lease timestamptz := now() + make_interval(secs => greatest(60, least(p_lease_seconds, 3600)));
  v_auto integer;
  v_manual integer;
begin
  insert into public.blog_imports (
    source_type, original_file_name, external_id, platform_code, account_id,
    checksum, dedupe_key, source_metadata, status, attempt_count,
    auto_attempt_count, manual_attempt_count, lease_token, lease_expires_at, cleanup_status
  ) values (
    p_source_type, p_original_file_name, p_external_id, p_platform_code, p_account_id,
    p_checksum, p_dedupe_key, coalesce(p_source_metadata, '{}'::jsonb), 'processing', 1,
    case when p_manual_retry then 0 else 1 end,
    case when p_manual_retry then 1 else 0 end,
    v_token, v_lease, 'none'
  ) on conflict (dedupe_key) do nothing returning * into v_row;

  if v_row.id is not null then
    return jsonb_build_object('state', 'claimed', 'record', to_jsonb(v_row));
  end if;
  select * into v_row from public.blog_imports where dedupe_key = p_dedupe_key for update;
  if not found then raise exception using errcode = 'P0002', message = 'import record not found after conflict'; end if;
  if v_row.status = 'completed' then return jsonb_build_object('state', 'completed', 'record', to_jsonb(v_row)); end if;
  if v_row.status = 'processing' and v_row.lease_expires_at is not null and v_row.lease_expires_at > now() then
    return jsonb_build_object('state', 'processing', 'record', to_jsonb(v_row));
  end if;
  if not p_manual_retry and v_row.status = 'failed' and v_row.next_retry_at is not null and v_row.next_retry_at > now() then
    return jsonb_build_object('state', 'retry_wait', 'record', to_jsonb(v_row));
  end if;
  if not p_manual_retry and v_row.auto_attempt_count >= 3 then
    return jsonb_build_object('state', 'retry_blocked', 'record', to_jsonb(v_row));
  end if;
  if p_manual_retry and v_row.manual_attempt_count >= 3 and
     (nullif(btrim(coalesce(p_manual_approval_by, v_row.manual_approval_by)), '') is null or nullif(btrim(coalesce(p_manual_approval_reason, v_row.manual_approval_reason)), '') is null) then
    return jsonb_build_object('state', 'manual_approval_required', 'record', to_jsonb(v_row));
  end if;

  v_auto := v_row.auto_attempt_count + case when p_manual_retry then 0 else 1 end;
  v_manual := v_row.manual_attempt_count + case when p_manual_retry then 1 else 0 end;
  update public.blog_imports set
    status = 'processing', attempt_count = v_auto + v_manual,
    auto_attempt_count = v_auto, manual_attempt_count = v_manual,
    lease_token = v_token, error_code = null, lease_expires_at = v_lease,
    manual_approval_by = case when p_manual_retry and v_row.manual_attempt_count >= 3 then coalesce(p_manual_approval_by, manual_approval_by) else manual_approval_by end,
    manual_approval_at = case when p_manual_retry and v_row.manual_attempt_count >= 3 then now() else manual_approval_at end,
    manual_approval_reason = case when p_manual_retry and v_row.manual_attempt_count >= 3 then coalesce(p_manual_approval_reason, manual_approval_reason) else manual_approval_reason end,
    next_retry_at = null, updated_at = now()
   where id = v_row.id returning * into v_row;
  return jsonb_build_object('state', 'claimed', 'record', to_jsonb(v_row));
end;
$$;

create or replace function public.blog_renew_import_lease(p_import_id uuid, p_lease_token uuid, p_lease_seconds integer default 900)
returns public.blog_imports language plpgsql security invoker set search_path = public
as $$ declare v_row public.blog_imports; begin
  update public.blog_imports set lease_expires_at = now() + make_interval(secs => greatest(60, least(p_lease_seconds, 3600))), updated_at = now()
   where id = p_import_id and lease_token = p_lease_token and status = 'processing' and lease_expires_at is not null and lease_expires_at > now()
   returning * into v_row;
  if not found then raise exception using errcode = '55000', message = 'import lease ownership lost'; end if;
  return v_row;
end; $$;

create or replace function public.blog_complete_import(p_import_id uuid, p_lease_token uuid, p_post_id uuid, p_cleanup_status text default 'completed', p_cleanup_error_code text default null)
returns public.blog_imports language plpgsql security invoker set search_path = public
as $$ declare v_row public.blog_imports; begin
  update public.blog_imports set post_id = p_post_id, status = 'completed', error_code = null, lease_token = null, lease_expires_at = null, next_retry_at = null,
    cleanup_status = p_cleanup_status, cleanup_error_code = p_cleanup_error_code, completed_at = now(), updated_at = now()
   where id = p_import_id and lease_token = p_lease_token and status = 'processing' and lease_expires_at is not null and lease_expires_at > now()
   returning * into v_row;
  if not found then raise exception using errcode = '55000', message = 'import lease ownership lost'; end if;
  return v_row;
end; $$;

create or replace function public.blog_fail_import(p_import_id uuid, p_lease_token uuid, p_error_code text, p_cleanup_status text default 'completed', p_cleanup_error_code text default null, p_cleanup_attempts integer default 0)
returns public.blog_imports language plpgsql security invoker set search_path = public
as $$ declare v_row public.blog_imports; begin
  update public.blog_imports set status = 'failed', error_code = left(coalesce(p_error_code, 'import_failed'), 120), lease_token = null, lease_expires_at = null,
    next_retry_at = case when auto_attempt_count < 3 then now() + make_interval(secs => case auto_attempt_count when 1 then 60 when 2 then 300 else 1800 end) else null end,
    cleanup_status = p_cleanup_status, cleanup_error_code = p_cleanup_error_code, cleanup_attempts = greatest(0, p_cleanup_attempts),
    cleanup_next_retry_at = case when p_cleanup_status in ('pending', 'failed') then now() + interval '1 minute' else null end, updated_at = now()
   where id = p_import_id and lease_token = p_lease_token and status = 'processing' and lease_expires_at is not null and lease_expires_at > now()
   returning * into v_row;
  if not found then raise exception using errcode = '55000', message = 'import lease ownership lost'; end if;
  return v_row;
end; $$;

revoke all on function public.blog_claim_import(text, text, text, text, uuid, text, text, jsonb, integer, boolean, text, text) from public, anon, authenticated;
revoke all on function public.blog_renew_import_lease(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.blog_complete_import(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.blog_fail_import(uuid, uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.blog_claim_import(text, text, text, text, uuid, text, text, jsonb, integer, boolean, text, text) to service_role;
grant execute on function public.blog_renew_import_lease(uuid, uuid, integer) to service_role;
grant execute on function public.blog_complete_import(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.blog_fail_import(uuid, uuid, text, text, text, integer) to service_role;

create or replace function public.blog_claim_import_cleanup(p_cleanup_id uuid, p_lease_seconds integer default 300)
returns public.blog_import_cleanup language plpgsql security invoker set search_path = public
as $$ declare v_row public.blog_import_cleanup; begin
  update public.blog_import_cleanup set status = 'processing', attempts = attempts + 1,
    lease_token = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => greatest(60, least(p_lease_seconds, 900))), updated_at = now()
   where id = p_cleanup_id and status in ('pending', 'failed') and next_attempt_at <= now()
     and attempts < max_attempts and (lease_expires_at is null or lease_expires_at <= now())
   returning * into v_row;
  if not found then raise exception using errcode = '55000', message = 'cleanup lease ownership unavailable'; end if;
  return v_row;
end; $$;

create or replace function public.blog_finish_import_cleanup(p_cleanup_id uuid, p_lease_token uuid, p_success boolean, p_error_code text default null)
returns public.blog_import_cleanup language plpgsql security invoker set search_path = public
as $$ declare v_row public.blog_import_cleanup; begin
  update public.blog_import_cleanup set status = case when p_success then 'completed' else 'failed' end,
    error_code = case when p_success then null else left(coalesce(p_error_code, 'cleanup_failed'), 120) end,
    lease_token = null, lease_expires_at = null,
    next_attempt_at = case when p_success or attempts >= max_attempts then now() else now() + make_interval(secs => least(3600, 60 * (2 ^ least(attempts, 6)))) end,
    completed_at = case when p_success then now() else null end, updated_at = now()
   where id = p_cleanup_id and lease_token = p_lease_token and status = 'processing'
     and lease_expires_at is not null and lease_expires_at > now()
   returning * into v_row;
  if not found then raise exception using errcode = '55000', message = 'cleanup lease ownership lost'; end if;
  return v_row;
end; $$;

revoke all on function public.blog_claim_import_cleanup(uuid, integer) from public, anon, authenticated;
revoke all on function public.blog_finish_import_cleanup(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.blog_claim_import_cleanup(uuid, integer) to service_role;
grant execute on function public.blog_finish_import_cleanup(uuid, uuid, boolean, text) to service_role;

create or replace function public.blog_approve_import_retry(p_import_id uuid, p_approved_by text, p_reason text)
returns public.blog_imports language plpgsql security invoker set search_path = public
as $$ declare v_row public.blog_imports; begin
  if nullif(btrim(p_approved_by), '') is null or nullif(btrim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'approval identity and reason are required';
  end if;
  update public.blog_imports set manual_approval_by = left(btrim(p_approved_by), 200), manual_approval_at = now(), manual_approval_reason = left(btrim(p_reason), 1000), updated_at = now()
   where id = p_import_id and status = 'failed' and manual_attempt_count >= 3 returning * into v_row;
  if not found then raise exception using errcode = 'P0002', message = 'manual retry approval is not applicable'; end if;
  return v_row;
end; $$;
revoke all on function public.blog_approve_import_retry(uuid, text, text) from public, anon, authenticated;
grant execute on function public.blog_approve_import_retry(uuid, text, text) to service_role;
