# MyPlatform API

FastAPI 서비스. 모바일/웹 포털에서 파일을 받아 점검을 실행하고 **결과만 다운로드**합니다.

## 로컬 실행

```powershell
cd C:\Mywork\MyPlatform\apps\api
pip install -r requirements.txt
$env:CHKDBSTD_DIR = "C:\Mywork\AI\cursor\09 독자 제공용 파일\study\ChkDBStd"
$env:CORS_ORIGINS = "http://127.0.0.1:3000,http://localhost:3000"
uvicorn main:app --reload --port 8000
```

Health: http://127.0.0.1:8000/health

## Render

`render.yaml` Blueprint 또는 Web Service로 `apps/api` 배포.  
표준 CSV/`code_download`는 이미지에 포함하거나 Supabase Storage에서 받도록 추후 확장.

환경변수:

- `CORS_ORIGINS` = Vercel URL
- `CHKDBSTD_DIR` = 배포 시 번들 경로 (또는 코드 이식)
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (Storage 연동 시)
