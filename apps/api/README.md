# MyPlatform API

FastAPI 서비스. 모바일/웹 포털에서 파일을 받아 점검을 실행하고 **결과만 다운로드**합니다.

ChkDBStd 로직·표준 CSV는 `apps/api/chkdbstd/` 에 번들되어 있습니다.

## 로컬 실행

```powershell
cd C:\Mywork\MyPlatform\apps\api
pip install -r requirements.txt
$env:CORS_ORIGINS = "http://127.0.0.1:3000,http://localhost:3000"
python -m uvicorn main:app --reload --port 8000
```

Health: http://127.0.0.1:8000/health  
→ `"chkdbstd_found": true` 이면 OK.

선택: 외부 소스를 쓰려면 `$env:CHKDBSTD_DIR = "..."` 로 덮어씁니다.

## Render

`render.yaml` Blueprint 또는 Web Service로 `apps/api` 배포.  
기본값으로 번들 경로(`chkdbstd/`)를 사용합니다.

환경변수:

- `CORS_ORIGINS` = Vercel URL
- `CHKDBSTD_DIR` = (선택) 번들 외 경로
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (Storage 연동 시)
