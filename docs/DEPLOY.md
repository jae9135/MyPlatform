# 배포 실행 가이드 (계정 연동 필요)

이 PC에는 `gh` / 전역 `vercel` CLI가 없고, Supabase·Render·GitHub 원격은  
**사용자 로그인**이 필요해 자동 배포를 여기서 끝까지 완료할 수 없습니다.  
아래 순서로 진행하면 됩니다.

## A. GitHub (필수)

1. https://github.com/new → Repository name: `MyPlatform` (Private 권장)
2. 로컬:

```powershell
cd C:\Mywork\MyPlatform
git remote add origin https://github.com/<USER>/MyPlatform.git
git push -u origin main
```

(`git` 저장소는 이미 초기화·커밋됨)

## B. Supabase

1. https://supabase.com/dashboard → New project
2. SQL → `supabase/migrations/20260326000000_init.sql` 전체 실행
3. Storage → 버킷 `samples`, `standards` 생성
4. Settings → API → Project URL / anon key 복사

## C. Vercel (포털) — 이미 가입됨

**방법 1 (웹, 권장)**  
1. https://vercel.com/new → Import `MyPlatform`  
2. Root Directory: `apps/portal`  
3. Environment Variables:
   - `NEXT_PUBLIC_API_BASE_URL` = (Render URL, 없으면 임시로 `http://127.0.0.1:8000`)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

**방법 2 (CLI)**  

```powershell
cd C:\Mywork\MyPlatform\apps\portal
npx vercel login
npx vercel --yes
npx vercel --prod --yes
```

## D. Render (API)

1. https://render.com → New → Blueprint → GitHub `MyPlatform` → `render.yaml`
2. 또는 Web Service:
   - Root: `apps/api`
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Env:
   - `CORS_ORIGINS` = `https://<your-vercel-app>.vercel.app`
   - `CHKDBSTD_DIR` = (배포 시 표준 로직 경로; 초기에는 stub/로컬 전용일 수 있음)

## E. 연결

Vercel 포털의 `NEXT_PUBLIC_API_BASE_URL`을 Render URL로 맞춘 뒤 Redeploy.

## 로컬 스모크 (배포 전)

```powershell
# 터미널 1
cd C:\Mywork\MyPlatform\apps\api
pip install -r requirements.txt
$env:CHKDBSTD_DIR="C:\Mywork\AI\cursor\09 독자 제공용 파일\study\ChkDBStd"
uvicorn main:app --reload --port 8000

# 터미널 2
cd C:\Mywork\MyPlatform\apps\portal
copy .env.example .env.local
# NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
npm run dev
```

http://127.0.0.1:3000 → ChkDBStd → 파일 선택 → 점검
