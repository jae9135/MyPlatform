# MyPlatform API

FastAPI 서비스. 포털에서 파일을 받아 처리하고 **화면용 JSON** 또는 **파일 다운로드**를 반환합니다.

| 번들 | 경로 |
|------|------|
| ChkDBStd | `chkdbstd/` + `samples/*.sample.xlsx` |
| DBManager | `dbmanager/` + `samples/dbmanager/` |

## 로컬 실행

```powershell
cd C:\Mywork\MyPlatform\apps\api
pip install -r requirements.txt
$env:CORS_ORIGINS = "http://127.0.0.1:3000,http://localhost:3000"
# DBManager Supabase 적용용 (Direct 또는 Session pooler URI)
# $env:DATABASE_URL = "postgresql://postgres....@db.xxxx.supabase.co:5432/postgres"
python -m uvicorn main:app --reload --port 8000
```

- Health: http://127.0.0.1:8000/health (`db_configured`)
- ChkDBStd: `GET /v1/chk-db-std/samples`, `POST /v1/chk-db-std/run` (`format=json|xlsx|word-dict|term-dict`)
- DBManager:
  - `GET /v1/db-manager/samples`
  - `POST /v1/db-manager/generate` (`format=json|zip`)
  - `GET /v1/db-manager/db-status`
  - `GET /v1/db-manager/schemas`, `GET /v1/db-manager/schemas/{schema}/tables`
  - `POST /v1/db-manager/export-design` (DB → 테이블정의서 xlsx)
  - `GET /v1/db-manager/schemas/{schema}/tables/{table}/rows` (`q`, `format=json|csv|xlsx`)
  - `POST /v1/db-manager/data-upload` (`preview=true` 가능)
  - `POST /v1/db-manager/data-row`, `POST /v1/db-manager/data-delete`
  - `POST /v1/db-manager/diff`, `POST /v1/db-manager/apply-alter` (`dry_run`)
  - `GET /v1/db-manager/run-events`
  - `POST /v1/db-manager/apply` (`step=schema|table|sample`)

## Render

환경변수:

- `CORS_ORIGINS` = Vercel URL
- `DATABASE_URL` = Supabase Database URI (Session/Direct 권장, Transaction pooler는 DDL에 비권장)
- (선택) `CHKDBSTD_DIR`, `DBMANAGER_DIR`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

비밀번호는 포털(브라우저)에 두지 않고 API 서버 env에만 둡니다.
