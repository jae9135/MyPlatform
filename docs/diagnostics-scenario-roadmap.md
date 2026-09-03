# 진단 시나리오 통합 로드맵 (공공 프로젝트)

소스코드·보안 진단, 웹 품질 진단, 성능 진단에서 **시나리오(검사 범위)를 어떻게 정의·공유할지**에 대한 단계별 계획입니다.

> **원칙:** 세 진단을 한 번에 대개편하지 않는다. 공공 SI/감사에 맞게 **고정·재현 가능한 시나리오**를 기본으로 하고, URL 탐색·소스 추출은 **작성·조사용 도구**로 둔다.

---

## 1. 시나리오가란? (진단별)

| 진단 | URL | 시나리오의 의미 | Playwright steps |
|------|-----|-----------------|------------------|
| 소스코드·보안 | `/apps/source-scan` | ZIP/레포 **파일 범위** (`python_globs`, `typescript_globs`) | 사용 안 함 |
| 웹 품질 | `/apps/web-quality` | **화면 상태** (`state_id`, label, steps, access) + 정적 소스 파일 목록 | 런타임 진단에 필요 |
| 성능 | `/apps/perf-test` | WQ와 동일 후보에서 파생한 **HTTP 경로** + (선택) HAR용 화면 열기 | 미리보기/HAR에 필요 |

---

## 2. 현재 구조 (2026-09 기준)

```
                    ┌─────────────────────────────────────┐
                    │     ScenarioCandidate (공통 모델)    │
                    │  scenario_extract.ScenarioCandidate │
                    └─────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
 source_scan/                  web_quality/                   perf_test/
 manifest.py                   manifest.py                    scenario_urls.py
 (globs만)                     SOURCE_FILES, ui_states         fetch_scenarios()
        │                             │                             │
        │              ┌──────────────┼──────────────┐              │
        │              ▼              ▼              ▼              │
        │         ipms_online   scenario_extract  external_        │
        │           .py         (MyGantt TSX)    discover         │
        │              │              │              │              │
        │              └──────────────┼──────────────┘              │
        │                             ▼                             │
        │                    scenario_steps.py                      │
        │                    scenario_open.py                     │
        │                    (ER Modeler 전용 opener 병존)          │
        └──────────────── manifest id 중복· drift 위험 ─────────────┘
```

### 시나리오 생성 방식 (현재)

| 방식 | 위치 | 사용처 | 공공 납품 적합도 |
|------|------|--------|------------------|
| **Manifest 고정** | `web_quality/manifest.py` | WQ 포털 앱, perf-test | ★★★ (재현·감사) |
| **코드 프리셋** | `presets/ipms_online.py` | WQ IPMS, perf-test IPMS | ★★★ |
| **TSX 소스 추출** | `scenario_extract.py` | MyGantt (`extractable: true`) | ★★ (후보 → freeze 필요) |
| **URL 실시간 탐색** | `external_scenario_extract.py` | WQ **외부 URL**만 | ★ (조사용) |
| **Java ZIP 추출** | `java_scenario_extract.py` | WQ **Java ZIP** | ★★ (후보 → freeze) |
| **URL/경로 직접 입력** | perf-test Manual/Portal 탭 | perf-test Locust | ★★ (체크리스트) |

### 이미 반영된 개선 (Phase 1 일부)

- perf-test: `scenario_open.py` 공유, 시나리오 미리보기 API
- perf-test: 로컬 포털 `mp_portal` 세션 검증 (`session/validate`, UI `sessionValidated`)
- HAR: 시나리오별 `open_ok` / `open_error` 상태

---

## 3. 버전·릴리스 전략

| 구간 | 브랜치/버전 | 내용 |
|------|-------------|------|
| **v1.x (현행)** | `main` 유지 | 버그fix, IPMS/세션/미리보기, 프리셋 유지보수 |
| **v2.0 (통합)** | `feature/diagnostics-v2` 또는 태그 `diagnostics-2.0` | shared manifest, preset export, opener 통합 |
| **납품 frozen** | `presets/clients/{기관}/` 또는 Git tag | 검수 통과 `state_ids` + base_url 스냅샷 |

### v2로 **분리 권장** 조건

- manifest 통합으로 **target id·API 응답** 변경
- discover → frozen preset **UI/API** 신규
- ER Modeler **opener 제거** (steps JSON 전환)

### v1에서 **계속 가능** 조건

- Phase 0~1 (규약·문서·세션·버그fix)
- IPMS `ipms_online.py` 메뉴 추가 (기존 패턴)
- 소스 보안 globs만 manifest id 정렬

---

## 4. 단계별 로드맵

### Phase 0 — 규약·운영 (코드 최소)

**목표:** 신규 앱·납품 시 “시나리오를 어디에 적는지” 팀 합의.

| # | 작업 | 산출물 | 손대는 곳 |
|---|------|--------|-----------|
| 0.1 | `data-wq-target` / `data-wq-state` 포털 앱 표준 | TSX 가이드 1페이지 | `docs/`, 신규 앱 TSX |
| 0.2 | IPMS/Java/외부 URL **역할 구분** 문서화 | 본 문서 §2 + WQ 매뉴얼 보강 | `docs/manual/02-*.md` |
| 0.3 | 납품 시 **frozen checklist** 템플릿 | `state_ids`, base_url, preset 버전 기록 양식 | docs 또는 Excel/HTML 보고서 |
| 0.4 | 위험 시나리오 정책 (`file_input`, `confirm`, auth) | 기본 제외·선택 사유 | 팀 정책 |

**완료 기준:** 앱 추가 PR 체크리스트에 “manifest / data-wq / IPMS 프리셋” 분기 명시.

**영향:** 소스 보안 ☆ / WQ ☆ / perf ☆

---

### Phase 1 — 안정화·얇은 공통화 (v1.x)

**목표:** 사용자 pain point 해소, API breaking change 없음.

| # | 작업 | 주요 파일 | 완료 기준 |
|---|------|-----------|-----------|
| 1.1 | 로컬 포털 세션 검증 일원화 | `perf_test/session.py`, `perf-test/page.tsx` | ✅ (2026-09) 탭 전환·복원 시 false “로그인 완료” 방지 |
| 1.2 | WQ ↔ perf **동일 target id** 문서·테스트 | `scenario_urls.fetch_scenarios` | IPMS·ER Modeler·MyGantt 목록 WQ/perf 일치 |
| 1.3 | 시나리오 미리보기 (perf) | `scenario_preview.py`, `scenario_open.py` | ✅ 선택 시나리오 Playwright dry-run |
| 1.4 | HAR per-scenario 상태 | `perf_test/runner.py` | ✅ open_ok / har_request_count |
| 1.5 | WQ external discover **경고 문구** | `web-quality/page.tsx` | ✅ “납품용은 프리셋 JSON 저장” + 조사용 배ner |
| 1.5b | **프리셋 JSON 저장** (UI export) | `web-quality/page.tsx` | ✅ 시나리오 패널 다운로드 |
| 1.6 | 보고서·이력에 **검사 범위** 표시 | WQ/source-scan/perf history JSON | `state_ids`, `target`, `access` 필드 유지·표시 |

**영향:** 소스 보안 ☆~★ (이력 메타만) / WQ ★ / perf ★★

---

### Phase 2 — Shared manifest (v2.0 후보)

**목표:** 앱 목록·id를 **한 곳**에서 관리. 스캐너 로직은 그대로.

| # | 작업 | 설계 | 완료 기준 |
|---|------|------|-----------|
| 2.1 | `apps/api/shared/targets.py` | id, name, path, globs, source_files, tools | ✅ |
| 2.2 | `source_scan/manifest.py` → re-export | globs만 사용 | ✅ |
| 2.3 | `web_quality/manifest.py` → re-export | SOURCE_FILES, ui_states | ✅ |
| 2.4 | IPMS를 `LEGACY_SCENARIO_PRESETS` 로 등록 | `presets/ipms_online.py` 유지 | ✅ |
| 2.5 | 회귀 검증 | `scripts/validate_diagnostic_targets.py` + `GET /v1/diagnostics/targets` | ✅ |

**영향:** 소스 보안 ★ / WQ ★★ / perf ★

**호환:** old import 경로 deprecated wrapper 1~2 릴리스 유지.

---

### Phase 3 — 시나리오 표준화·납품 동결 (v2.0)

**목표:** opener 이중화 제거, discover 결과를 Git 프리셋으로 **export**.

| # | 작업 | 주요 파일 | 완료 기준 |
|---|------|-----------|-----------|
| 3.1 | ER Modeler → steps JSON | `scenario_open.py`, `ErModelerApp.tsx` | `open_er_modeler_state` 제거 또는 thin wrapper |
| 3.2 | MyGantt 외 extractable 확대 (선택) | `scenario_extract.EXTRACTABLE_TARGETS` | ER Modeler `data-wq-*` 기반 추출 |
| 3.3 | **Preset export API** | `POST /v1/scenarios/export`, `GET /v1/scenarios/presets/{id}` | discover/extract 결과 → JSON/YAML |
| 3.4 | **Preset import / fetch** | `fetch_scenarios(preset_id=...)` | frozen preset이 manifest보다 우선 (옵션) |
| 3.5 | WQ UI: “프리셋으로 저장” | `web-quality/page.tsx` | 파일 다운로드 + `presets/clients/` 배치 가이드 |
| 3.6 | perf-test: WQ와 **동일 preset id** | `perf-test/page.tsx` | URL 쿼리 `?preset=` 또는 target+preset |
| 3.7 | Java ZIP → perf URL 목록 (선택) | `java_scenario_extract` + `scenario_urls` | WQ Java 시나리오를 perf Manual 대체 |

**영향:** 소스 보안 ☆ / WQ ★★★ / perf ★★

---

### Phase 4 — KRDS / UI·UX 가이드라인 (v2.x, 웹품질 확장)

**목표:** [디지털 정부서비스 UIUX 가이드라인(2025.08)](https://www.krds.go.kr/html/site/community/community_01_01.html?nttId=9) 검증을 **웹품질과 동일 엔진·시나리오**로 실행하되, **규칙·보고서·UI 탭은 분리**.

| # | 작업 | 주요 파일 | 완료 기준 |
|---|------|-----------|-----------|
| 4.1 | **krds_uiux rule catalog** + JSON Schema | `rules/krds_uiux.json`, `krds_uiux.schema.json` | ✅ `UX-KRDS-*` id, `category: uiux` |
| 4.2 | catalog 로더·API | `catalog.py`, `GET /v1/web-quality/rules` | ✅ `krds_uiux` 배열 반환 |
| 4.3 | 런타임 KRDS 휴리스틱 | `krds_scanner.py`, `runtime_common.scan_page_states` | ✅ 화면별 DOM/CSS 검사 |
| 4.4 | 정적 KRDS (포털 TSX) | `krds_scanner.scan_krds_static_files` | ✅ layout·krds 클래스·viewport |
| 4.5 | 수동 UX 패턴 체크리스트 | `append_krds_manual_findings` | ✅ 신청·동의·로그인·오류 UX |
| 4.6 | WQ UI **「UI·UX(KRDS)」** 탭 + 옵션 | `web-quality/page.tsx`, `include_krds` Form | ✅ 탭 필터·체크박스 |
| 4.7 | Excel **KRDS_UIUX** 시트 | `report.py` | ✅ 규칙·수동확인 시트 |
| 4.8 | catalog 검증 스크립트 | `scripts/validate_krds_catalog.py` | ✅ CI/로컬 실행 |
| 4.9 | 서비스 패턴 시나리오 확대 (선택) | frozen preset + 오류/동의 state | Phase 3 preset과 연계 |
| 4.10 | Figma·시각 diff (선택) | — | v2.1+ |

**원칙**

- KWCAG·전자정부 finding과 **섞지 않음** (`category: uiux` 고정).
- `include_krds=false` 로 기존 웹품질-only 실행 가능 (호환).
- perf-test·source-scan은 **변경 없음** (WQ 전용 rule pack).

**영향:** 소스 보안 × / WQ ★★★ / perf ×

---

## 5. 진단별 — Phase별 수정 필요 여부

| Phase | 소스코드·보안 | 웹 품질 | 성능 진단 |
|-------|:-------------:|:-------:|:---------:|
| 0 | 선택 | 선택 | 선택 |
| 1 | △ (이력) | ○ | ○ |
| 2 | ○ (manifest) | ○ | △ |
| 3 | × | ○ | ○ |
| 4 | × | ○ (KRDS 모듈) | × |

○ = 수정 권장/필요 · △ = 경미 · × = 불필요

**한 줄:** Phase 3까지 가도 **소스 보안 스캐너(Bandit/PMD/SpotBugs)는 건드리지 않는다.** manifest id 정렬(Phase 2)만 해당.

---

## 6. 대상 유형별 권장 시나리오 방식 (운영 표준)

| 대상 | 1순위 | 조사/초기 작성 | perf-test |
|------|--------|----------------|-----------|
| MyPlatform 포털 앱 | manifest + `data-wq-*` + steps | TSX extract (MyGantt형) | 동일 `state_ids` |
| IPMS / O2 SPA | `ipms_online.py` 프리셋 | MenuTree.js 분석 후 PR | 동일 프리셋 |
| Java/JSP 레거시 | Java ZIP extract → **freeze** | ZIP 재업로드 diff | extract URL 또는 Manual |
| 외부 URL | discover → **export freeze** | WQ external만 | Manual/Portal 경로 |
| 소스 보안만 | `source_scan` globs / ZIP | — | — |

---

## 7. 신규 기능·앱 추가 체크리스트

### 포털 앱 (예: 새 `/apps/foo`)

- [ ] shared manifest(또는 `web_quality/manifest.py`)에 `id`, `path`, `ready_selector`
- [ ] `SOURCE_FILES` (WQ 정적 스캔)
- [ ] `python_globs` / `typescript_globs` (`source_scan/manifest`)
- [ ] `ui_states` 또는 TSX `data-wq-target` + `scenario_extract` 힌트
- [ ] `scenario_open.py` 또는 steps JSON
- [ ] `perf-test/page.tsx` `TARGET_OPTIONS` (선택)
- [ ] `docs/manual/` 사용자 매뉴얼 (선택)

### IPMS 메뉴 추가

- [ ] `presets/ipms_online.py` 튜플 + `_menu_candidate`
- [ ] `access`: `public` vs `auth`
- [ ] WQ·perf 양쪽 “시나리오 다시 읽기” 확인

### 공공 납품 frozen preset

- [ ] base_url (localhost vs 127.0.0.1 고정)
- [ ] `state_ids` JSON + preset 버전 + Git tag
- [ ] auth 시나리오: storage_state 생성 절차 문서
- [ ] 보고서 표지에 **Diagnostics preset vX.Y** 기록

---

## 8. API·파일 참조 (개발자)

| API | 용도 |
|-----|------|
| `GET /v1/web-quality/scenarios?target=` | 포털/MyGantt/IPMS 후보 |
| `POST /v1/web-quality/scenarios/discover` | 외부 URL 탐색 (WQ only) |
| `POST /v1/web-quality/scenarios/upload` | Java ZIP |
| `GET /v1/perf-test/scenarios?target=` | perf 후보 (`fetch_scenarios`) |
| `POST /v1/perf-test/scenarios/preview` | Playwright 미리보기 |
| `GET /v1/diagnostics/targets` | shared manifest 조회·정합성 |

| 파일 | 역할 |
|------|------|
| `web_quality/scenario_extract.py` | TSX → ScenarioCandidate |
| `web_quality/scenario_steps.py` | steps JSON 실행 |
| `web_quality/scenario_open.py` | 후보별 opener 라우팅 |
| `web_quality/presets/ipms_online.py` | IPMS 프리셋 |
| `perf_test/scenario_urls.py` | `fetch_scenarios`, Locust URL 변환 |
| `GET/POST /v1/perf-test/session/validate` | 포털 세션 검증 |
| `apps/api/shared/targets.py` | canonical target registry |
| `apps/api/scripts/validate_diagnostic_targets.py` | WQ·source-scan 정합성 검증 |
| `apps/api/presets/clients/` | 납품 frozen preset 보관 |

---

## 9. 관련 문서

- [웹 품질 — 시나리오 설계 초안](../apps/api/web_quality/docs/scenario-from-source-design.md)
- [MyGantt 시나리오 작성 가이드](../apps/api/web_quality/docs/my-gantt-scenario-guide.md)
- [웹 품질 진단 매뉴얼](./manual/02-웹-품질-진단.md)
- [소스코드·보안 진단 매뉴얼](./manual/01-소스코드-보안-진단.md)
- [아키텍처](./architecture.md)

---

## 10. 다음 액션 (권장 순서)

1. ~~**Phase 0.2** — WQ 매뉴얼에 “시나리오 방식 4종” 표 추가~~ ✅
2. ~~**Phase 1.5** — discover 납품 경고 UI + 프리셋 JSON export~~ ✅
3. ~~**Phase 2.1–2.5** — shared targets + 검증 스크립트/API~~ ✅
4. **Phase 1.6** — 이력/보고서에 state_ids·preset 파일명 표시
5. **Phase 3.3–3.6** — preset import API, perf-test preset 연동
6. 납품 일정 확정 시 **v2 브랜치** → ER opener steps 통합 (Phase 3.1)

*최종 갱신: 2026-09-01 (Phase 1.5·2.x 반영)*
