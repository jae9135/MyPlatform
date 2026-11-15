-- Preserve the order of inline images imported from external documents.
do $migration$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'blog_post_assets' and column_name = 'sort_order'
  ) then
    alter table public.blog_post_assets
      add column sort_order integer not null default 0 check (sort_order >= 0);
  end if;
end;
$migration$;

create index if not exists blog_post_assets_post_order_idx
  on public.blog_post_assets (post_id, sort_order, created_at);
