# DBManager (API bundle)

Excel 테이블정의서 → PostgreSQL DDL.

| 모듈 | 역할 |
|------|------|
| `excel_parser.py` | 설계서 파싱 |
| `type_mapper.py` | Oracle 스타일 → PG 타입 |
| `ddl_generator.py` | SQL 파일 생성 |
| `sample_data.py` | 샘플 INSERT |
| `service.py` | API용 generate 헬퍼 |

1차는 DDL 생성만 지원합니다 (DB 접속·실행은 미포함).
