# DBManager (API bundle)

Excel 테이블정의서 → PostgreSQL DDL.

| 모듈 | 역할 |
|------|------|
| `excel_parser.py` | 설계서 파싱 |
| `type_mapper.py` | Oracle 스타일 ↔ PG 타입 |
| `ddl_generator.py` | SQL 파일 생성 |
| `sample_data.py` | 샘플 INSERT |
| `schema_reader.py` | DB 스키마 조회 |
| `excel_writer.py` | DB → 테이블정의서 Excel |
| `data_manager.py` | 테이블 조회·CSV/Excel 업로드 |
| `schema_diff.py` | 설계서 vs DB 비교 / ALTER 초안 |
| `service.py` | API용 generate 헬퍼 |

- DDL 생성: `service.py`
- Supabase 적용: `db_client.py` + API `DATABASE_URL` (`schema` / `table` / `sample`)
- DB → 설계서: `schema_reader` + `excel_writer` (`export-design`)
- 데이터 관리: 조회/검색/CSV·Excel 내보내기, 단건 수정·삭제, 업로드 미리보기
- 설계서↔DB diff: 컬럼 이름 변경 추정, ALTER 검증(dry-run), DROP 없음
- COMMENT는 `한글명 | 코멘트` 형식으로 저장해 설계서 한글명/코멘트를 구분합니다.
- CREATE DATABASE 단계는 Supabase에서 사용하지 않습니다.
