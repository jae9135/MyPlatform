-- Align portal status for DBManager (DDL generate live as beta)
update public.apps
set status = 'beta',
    description = '테이블정의서 → PostgreSQL DDL 생성 (웹)'
where id = 'db-manager';
