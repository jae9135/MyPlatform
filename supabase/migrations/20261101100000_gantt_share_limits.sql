-- MyGantt 공유 저장 남용 방지
--   * 저장 데이터 크기 상한 2MB (현재 최대 약 56KB)
--   * 새 공유 일정표 생성은 전체 기준 1시간 100건까지
-- 로그인 없이 호출되는 함수(anon)라, 아주 큰 데이터나 대량 생성으로 DB 용량을 채우는 것을 막기 위함.

-- 생성 시각 (생성 건수 제한용 — updated_at 은 저장할 때마다 바뀌므로 따로 둠)
alter table public.gantt_projects
  add column if not exists created_at timestamptz not null default now();

create or replace function public.gantt_create(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare new_id text;
declare new_key text;
declare recent int;
begin
  if octet_length(coalesce(p_data, '{}'::jsonb)::text) > 2097152 then
    raise exception '일정표 데이터가 너무 큽니다 (최대 2MB).' using errcode = '22001';
  end if;
  select count(*) into recent
  from public.gantt_projects
  where created_at > now() - interval '1 hour';
  if recent >= 100 then
    raise exception '잠시 후 다시 시도하세요 (공유 생성 한도 초과).' using errcode = '53400';
  end if;
  new_id := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  new_key := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  insert into public.gantt_projects (id, edit_key, data, updated_at)
  values (new_id, new_key, coalesce(p_data, '{}'::jsonb), now());
  return jsonb_build_object('id', new_id, 'edit_key', new_key);
end;
$$;

create or replace function public.gantt_save(p_id text, p_key text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if octet_length(coalesce(p_data, '{}'::jsonb)::text) > 2097152 then
    raise exception '일정표 데이터가 너무 큽니다 (최대 2MB).' using errcode = '22001';
  end if;
  update public.gantt_projects
  set data = coalesce(p_data, '{}'::jsonb),
      updated_at = now()
  where id = p_id
    and edit_key = p_key;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.gantt_create(jsonb) to anon, authenticated;
grant execute on function public.gantt_save(text, text, jsonb) to anon, authenticated;
