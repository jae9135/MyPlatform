# DBManager samples

| file | use |
|------|-----|
| `design.sample.xlsx` | 테이블정의서 → DDL 생성 |

샘플 INSERT(`99_sample_data.sql`)는 `dbmanager/sample_data.py`가 **설계서 컬럼 길이**에 맞춰 생성합니다.
Served by `GET /v1/db-manager/samples` and `GET /v1/db-manager/samples/{id}`.
