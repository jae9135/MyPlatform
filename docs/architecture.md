# MyPlatform 아키텍처

## 정책

1. **공통 샘플·표준** → Supabase Storage (+ `sample_assets` 메타)
2. **사용자 입력·결과** → 클라이언트 기기 (API는 임시 처리 후 삭제)
3. **모바일에서도 점검 실행** → 포털 UI + Render API

## 구성

```
[Mobile/Desktop Browser]
        |  HTTPS
        v
[Vercel: apps/portal] ----fetch----> [Render: apps/api]
        |                                  |
        v                                  v
[Supabase Postgres]              [Supabase Storage / 로컬 표준파일]
```

## 배포 순서

1. Supabase 프로젝트 + SQL migration
2. GitHub push
3. Vercel → `apps/portal`
4. Render → `apps/api` + CORS에 Vercel origin
5. 포털 env에 `NEXT_PUBLIC_API_BASE_URL` 설정

## 진단 도구 (시나리오·범위)

소스코드·보안 / 웹 품질 / 성능 진단의 **검사 범위(시나리오) 정의·통합 계획**은 [diagnostics-scenario-roadmap.md](./diagnostics-scenario-roadmap.md) 참고.
