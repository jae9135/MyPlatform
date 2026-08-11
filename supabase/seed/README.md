# Seed / Storage 업로드 가이드

Dashboard → Storage 에서 버킷을 만든 뒤 업로드합니다.

## 버킷

| bucket | 용도 | 권한 |
|--------|------|------|
| `samples` | 데모용 정의서·작은 Excel | 읽기 공개 또는 signed URL |
| `standards` | 공통표준 CSV, 코드 인덱스 | 비공개 (API service role) |

## 권장 경로

```
samples/chkdbstd/design.sample.xlsx
samples/chkdbstd/code-design.sample.xlsx
standards/words/mois_standard_words.csv
standards/terms/mois_standard_terms.csv
standards/domains/mois_standard_domains.csv
standards/codes/index.pkl   # 또는 codes/*.xlsx (대용량은 Git 금지)
```

업로드 후 `sample_assets` 테이블에 메타를 insert 하면 포털에서 목록을 보여줄 수 있습니다.

```sql
insert into public.sample_assets (app_id, title, bucket, object_path, kind, is_public)
values
  ('chk-db-std', '샘플 테이블정의서', 'samples', 'chkdbstd/design.sample.xlsx', 'sample', true);
```
