-- ER Modeler portal app registration
insert into public.apps (id, name, description, category, status, portal_path, api_path, sort_order)
values (
  'er-modeler',
  'ER Modeler',
  '테이블정의서 → ERD 편집 → 설계서 내보내기',
  'db-std',
  'beta',
  '/apps/er-modeler',
  '/v1/er-modeler',
  15
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  portal_path = excluded.portal_path,
  api_path = excluded.api_path,
  sort_order = excluded.sort_order;
