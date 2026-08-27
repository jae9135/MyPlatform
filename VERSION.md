# MyPlatform 2.0

**로컬 개발 버전** — 2026-08-26까지 작업한 베타·마케팅·인증 기능이 포함됩니다.

| 항목 | 내용 |
|------|------|
| 기반 | 1.0 (`daaf4d5`) + 로컬 미커밋 변경분 |
| 생성일 | 2026-08-26 |
| 작업 폴더 | `C:\Mywork\MyPlatform-2.0` |

## 2.0 주요 추가 기능

### 공개·마케팅
- `/` — 공개 마케팅 홈 (밝은 포털 테마, 3열 카드)
- `/products/[slug]` — 상품 상세·화면 목업
- `/contact`, `/customize`, `/demo/*`

### 베타 프로그램
- `/workspace` — 로그인 후 베타 허브
- `/login` — 환경 암호 + Supabase 발급 코드 로그인
- 1일/1회 체험 암호 (`TRIAL_DAY_PASSWORD`, `TRIAL_ONCE_PASSWORD`)

### 관리자·Supabase
- `/admin` — 액세스 코드 발급·폐기
- `portal_access_codes` 테이블 (마이그레이션 필요)
- `SUPABASE_SERVICE_ROLE_KEY` (secret key)

## 로컬 실행

```powershell
cd C:\Mywork\MyPlatform-2.0\apps\portal
npm install
npm run dev
```

`.env.local`은 1.0 작업 폴더에서 복사되어 있습니다. Vercel 2.0 배포 시 env 변수를 다시 설정하세요.

## 1.0과의 관계

| 버전 | 폴더 | 용도 |
|------|------|------|
| **1.0** | `../MyPlatform-1.0` | 현재 Vercel 배포 스냅샷 |
| **2.0** | `../MyPlatform-2.0` | 신규 기능 개발·2.0 배포 |

> 기존 `MyPlatform` 폴더는 복사 원본입니다. 앞으로는 **MyPlatform-2.0**을 메인 작업 공간으로 사용하는 것을 권장합니다.
