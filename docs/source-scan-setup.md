# 소스코드·보안 진단 설정 가이드

PMD · FindSecBugs 기준으로 MyPlatform 포털 앱 또는 ZIP 업로드 소스를 점검합니다.

## 개요

| 대상 | 스캐너 | 룰셋 |
|------|--------|------|
| Python (`apps/api`) | [Bandit](https://bandit.readthedocs.io/) | FindSecBugs **analog** 매핑 |
| TypeScript/JS (`apps/portal`) | ESLint + eslint-plugin-security | FindSecBugs / PMD **analog** |
| Java (ZIP) | PMD CLI | PMD |
| Java (ZIP, 빌드 가능) | SpotBugs + findsecbugs-plugin | FindSecBugs |

- **고급 옵션** — 칸을 **비워 두면** 기본 PMD ruleset·제외 경로 적용 (펼치기만 하면 설정 변경 없음)
- placeholder 회색 글씨는 예시이며 **전송되지 않음**
- PMD ruleset 형식: `category/java/security.xml` (쉼표 구분). `security+bestpractices` 같은 약어 불가

## UI 기능

- **진단 실행** / **같은 설정 재진단** / **취소**
- **Excel · HTML · 표지 · ZIP · SARIF** — 완료된 job 결과 내보내기 (재스캔 없음)
- **도구·환경 상태** — mvn, JAVA_HOME, PMD, SpotBugs
- **진단 이력** — API 재시작 후에도 `apps/api/data/source_scan_history/`에 저장
- **이전 대비 diff** — 신규/해소/유지 건수
- **규칙 카탈로그** — PMD / FindSecBugs 규칙 검색
- **고급 옵션** — PMD ruleset, 제외 경로, SpotBugs effort/threshold, ZIP eslint, prebuilt classes

## 로컬 실행

### Windows 일괄 시작

```powershell
.\scripts\start-api-source-scan.ps1
```

포트 8001이 이미 사용 중이면 스크립트가 기존 프로세스를 종료한 뒤 재시작합니다.  
(`npm run dev:api` 터미널이 켜져 있으면 먼저 닫거나, 위 스크립트만 사용하세요.)

### 배포 시 env (포털 `.env`)

| 변수 | 로컬 | 배포 예 |
|------|------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | `http://127.0.0.1:8001` | `https://your-api.onrender.com` |
| `NEXT_PUBLIC_INFRA_RENDER_URL` | (비움 → Render 대시보드) | Render 서비스 URL 또는 대시보드 |
| `NEXT_PUBLIC_PORTAL_URL` | (비움) | `https://your-app.vercel.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | 프로젝트 URL | 동일 |

홈 화면 **Vercel · Render · Supabase** 배지는 위 `NEXT_PUBLIC_INFRA_*` / `NEXT_PUBLIC_PORTAL_URL` 로 링크를 바꿉니다.  
`NEXT_PUBLIC_API_BASE_URL`의 `127.0.0.1`은 Render 배지 링크로 쓰이지 **않습니다** (API 프록시 전용).

### 수동

```powershell
npm run dev:api:stable   # reload 없음 — 코드 변경 후 재시작 필요
npm run dev:portal       # repo root에서
```

### 환경 변수

| 변수 | 설명 |
|------|------|
| `PMD_HOME` | PMD 설치 경로 |
| `PMD_RULESETS` | (선택) UI 고급 옵션으로도 지정 가능 |
| `SPOTBUGS_HOME` | SpotBugs 설치 경로 |
| `FINDSEC_BUGS_PLUGIN_JAR` | findsecbugs-plugin JAR |
| `JAVA_HOME` | JDK 8/11 권장 (레거시 Java) |

### ZIP Java

- `pom.xml` / `build.gradle` — Maven/Gradle compile 후 FindSecBugs
- ZIP에 **`target/classes` 포함** 시 컴파일 생략 (옵션)
- **제외 경로** 기본: `test/`, `target/`, `node_modules/` 등
- **Windows**: `mvn`은 `.CMD` 전체 경로로 실행 (API 코드 반영)

## Docker (PMD + SpotBugs + JDK8 + Playwright)

```powershell
docker build -f docker/source-scan/Dockerfile -t myplatform-api .
docker run --rm -p 8001:8001 -e PORT=8001 myplatform-api
```

**Render Docker:** Settings → Dockerfile Path `docker/source-scan/Dockerfile`, Docker Context `.` (repo root)

findsecbugs-plugin은 GitHub release에 standalone JAR이 없어 **Maven Central**에서 받습니다 (Dockerfile 반영).

## API

| Method | Path | 설명 |
|--------|------|------|
| GET | `/v1/source-scan/environment` | 도구·대기열 상태 |
| GET | `/v1/source-scan/history` | 진단 이력 |
| GET | `/v1/source-scan/history/{id}/diff` | 이전 진단 diff |
| GET | `/v1/source-scan/queue` | 대기열 |
| POST | `/v1/source-scan/jobs/{id}/cancel` | 진단 취소 |
| POST | `/v1/source-scan/validate` | 사전 검증 (ZIP 파일 가능) |
| POST | `/v1/source-scan/run` | 진단 (async job) |
| GET | `/v1/source-scan/jobs/{id}` | 진행/결과 |
| GET | `/v1/source-scan/jobs/{id}/export?format=` | xlsx\|html\|zip\|sarif\|cover |

## Smoke test

```powershell
cd apps/api
python -c "from source_scan.service import run_source_scan; r=run_source_scan('portal','er-modeler'); print(r['stats'])"
```

## 참고

- [FindSecBugs Bug Patterns](https://find-sec-bugs.github.io/bugs.htm)
- [PMD Java Rules](https://docs.pmd-code.org/latest/pmd_rules_java.html)
