-- Harden MyGantt share: no table listing, edit key required to write
-- Run in Supabase SQL Editor after 20260813000000_gantt_projects.sql

alter table public.gantt_projects
  add column if not exists edit_key text;

update public.gantt_projects
set edit_key = id
where edit_key is null or edit_key = '';

alter table public.gantt_projects
  alter column edit_key set not null;

drop policy if exists "public read gantt_projects" on public.gantt_projects;
drop policy if exists "public insert gantt_projects" on public.gantt_projects;
drop policy if exists "public update gantt_projects" on public.gantt_projects;

revoke all on public.gantt_projects from anon, authenticated, public;

create or replace function public.gantt_get(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare payload jsonb;
begin
  select data into payload from public.gantt_projects where id = p_id;
  if payload is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  return payload;
end;
$$;

create or replace function public.gantt_create(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare new_id text;
declare new_key text;
begin
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

grant execute on function public.gantt_get(text) to anon, authenticated;
grant execute on function public.gantt_create(jsonb) to anon, authenticated;
grant execute on function public.gantt_save(text, text, jsonb) to anon, authenticated;
