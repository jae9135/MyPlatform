# MyPlatform

여러 로컬 도구(ChkDBStd, DBManager, DeliverableManager, ReceiptToPDF 등)를  
**웹/모바일에서 사용**하기 위한 플랫폼 뼈대입니다.

| 영역 | 기술 | 역할 |
|------|------|------|
| `apps/portal` | Next.js → **Vercel** | 모바일 포털 UI |
| `apps/api` | FastAPI → **Render** | 점검 API (업로드→실행→결과 다운로드) |
| `supabase/` | Postgres + Storage | DB 스키마·샘플 파일 창고 |

정책:

- **공통 샘플/표준** → Supabase Storage
- **사용자 입력·결과** → 기기에만 (서버 미보관 권장)

---

## 1. 로컬에서 포털 실행

```powershell
cd C:\Mywork\MyPlatform\apps\portal
npm install
npm run dev
```

브라우저: http://127.0.0.1:3000

---

## 2. GitHub

```powershell
cd C:\Mywork\MyPlatform
git init
git add .
git commit -m "chore: MyPlatform scaffold"
# GitHub에서 빈 repo 생성 후:
git remote add origin https://github.com/<USER>/MyPlatform.git
git branch -M main
git push -u origin main
```

`gh` CLI가 있으면: `gh repo create MyPlatform --private --source=. --push`

---

## 3. Supabase

1. https://supabase.com 가입 → New project
2. SQL Editor에서 `supabase/migrations/20260326000000_init.sql` 실행
3. Storage → 버킷 `samples` (Public 또는 signed URL), `standards` (비공개 권장)
4. Project Settings → API → URL / anon key 를 `apps/portal/.env.local` 에 복사  
   (`apps/portal/.env.example` 참고)

샘플 업로드 예:

- `samples/chkdbstd/테이블정의서.sample.xlsx`
- `standards/words/공통표준단어.csv`

---

## 4. Vercel (포털)

1. https://vercel.com → Import Git Repository → `MyPlatform`
2. Root Directory: `apps/portal`
3. Framework: Next.js (자동)
4. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_BASE_URL`

CLI:

```powershell
cd C:\Mywork\MyPlatform\apps\portal
npx vercel login
npx vercel --yes
npx vercel --prod --yes
```

---

## 5. Render (API)

1. https://render.com 가입 → New → Blueprint
2. 이 repo의 `render.yaml` 연결  
   또는 Web Service 수동 생성:
   - Root Directory: `apps/api`
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. 환경변수: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (서버 전용), `CORS_ORIGINS` (Vercel URL)

배포 후 Vercel의 `NEXT_PUBLIC_API_BASE_URL` 을 Render URL로 설정.

---

## 폴더 구조

```
MyPlatform/
  apps/
    portal/     # Vercel
    api/        # Render (ChkDBStd 연동 스텁)
  supabase/
    migrations/
    seed/
  docs/
  render.yaml
  vercel.json   # monorepo 힌트(선택)
```

기존 도구 소스(`C:\Mywork\AI\cursor\09 독자 제공용 파일\study\...`)는  
당분간 그 자리에 두고, API에서 점진적으로 이식합니다.

---

## 배포 체크리스트

- [ ] GitHub repo push
- [ ] Supabase 프로젝트 + SQL 마이그레이션
- [ ] Storage 버킷 + 샘플 업로드
- [ ] Vercel → `apps/portal` 배포
- [ ] Render → `apps/api` 배포
- [ ] 포털 env에 API URL 연결
- [ ] 모바일에서 포털 접속·샘플 점검 스모크 테스트
