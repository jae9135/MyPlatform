# MyPlatform API

FastAPI 서비스. 모바일/웹 포털에서 파일을 받아 점검을 실행하고 **화면용 JSON** 또는 **결과 Excel**을 반환합니다.

ChkDBStd 로직·표준 CSV는 `chkdbstd/`, 샘플 설계서는 `samples/` 에 번들됩니다.

## 로컬 실행

```powershell
cd C:\Mywork\MyPlatform\apps\api
pip install -r requirements.txt
$env:CORS_ORIGINS = "http://127.0.0.1:3000,http://localhost:3000"
python -m uvicorn main:app --reload --port 8000
```

- Health: http://127.0.0.1:8000/health
- Samples: http://127.0.0.1:8000/v1/chk-db-std/samples
- Run: `POST /v1/chk-db-std/run` (`format=json|xlsx`)

## Render

환경변수: `CORS_ORIGINS` = Vercel URL  
(선택) `CHKDBSTD_DIR`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
