# DBManager samples

| file | use |
|------|-----|
| `design.sample.xlsx` | 테이블정의서 → DDL 생성 |

샘플 INSERT(`99_sample_data.sql`)는 `dbmanager/sample_data.py`가 **설계서 컬럼 길이**에 맞춰 생성합니다.
PK는 `"1"`, `"2"`, … 형태이며, **Supabase 적용(sample)** 시 DB에 있는 숫자 PK 최댓값+1부터 다시 부여해 중복키를 피합니다.
Served by `GET /v1/db-manager/samples` and `GET /v1/db-manager/samples/{id}`.
