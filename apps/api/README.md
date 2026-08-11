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
python -m uvicorn main:app --reload --port 8000
```

- Health: http://127.0.0.1:8000/health
- ChkDBStd: `GET /v1/chk-db-std/samples`, `POST /v1/chk-db-std/run` (`format=json|xlsx|word-dict|term-dict`)
- DBManager: `GET /v1/db-manager/samples`, `POST /v1/db-manager/generate` (`format=json|zip`)

## Render

환경변수: `CORS_ORIGINS` = Vercel URL  
(선택) `CHKDBSTD_DIR`, `DBMANAGER_DIR`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
