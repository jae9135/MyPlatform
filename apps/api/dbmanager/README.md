# DBManager (API bundle)

Excel 테이블정의서 → PostgreSQL DDL.

| 모듈 | 역할 |
|------|------|
| `excel_parser.py` | 설계서 파싱 |
| `type_mapper.py` | Oracle 스타일 → PG 타입 |
| `ddl_generator.py` | SQL 파일 생성 |
| `sample_data.py` | 샘플 INSERT |
| `service.py` | API용 generate 헬퍼 |

- DDL 생성: `service.py`
- Supabase 적용: `db_client.py` + API `DATABASE_URL` (`schema` / `table` / `sample`)
- CREATE DATABASE 단계는 Supabase에서 사용하지 않습니다.
