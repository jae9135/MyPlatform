# 데모 페이지 데이터 (/demo/db-workflow, /demo/quality)

데모 페이지의 숫자·표·DDL·ERD·화면은 **실제 프로그램을 샘플로 실행한 결과**를 그대로 옮긴 것입니다.
손으로 만든 값은 넣지 않습니다. 프로그램 로직이 바뀌면 아래 절차로 다시 생성합니다.

## 파일 위치

| 무엇 | 위치 |
|------|------|
| 결과 데이터 | `apps/portal/lib/demo/demoResults.ts` |
| ERD·샘플 페이지 화면 | `apps/portal/public/marketing/demo/*.webp` |
| 샘플 테이블정의서 (내려받기·직접 실행용) | `apps/portal/public/samples/demo/table-design.sample.xlsx` (= `apps/api/samples/테이블정의서_샘플.xlsx`) |
| 샘플 소스 프로젝트 원본 | `sample/demo-shop/` (일부러 보안 약점을 넣은 Java·Python 코드) |
| 샘플 소스 ZIP (직접 실행용, 컴파일된 class 포함) | `apps/portal/public/samples/demo/demo-shop.zip` |
| 웹 품질 샘플 페이지 (일부러 접근성 문제를 넣음, noindex) | `apps/portal/public/samples/demo-shop/index.html` |
| "이 샘플로 직접 실행" 처리 | `apps/portal/lib/demoSamples.ts` + 각 앱의 `?sample=` 처리 |

## 다시 생성하는 방법 (요약)

1. 로컬에서 API 실행 (`apps/api`, PMD·SpotBugs·FindSecBugs 설치, 테스트용 PostgreSQL 연결)
2. DB 워크플로
   - `POST /v1/chk-db-std/run` (kind=term, domain) — 샘플 테이블정의서
   - `POST /v1/er-modeler/import` → ER Modeler 화면에서 가져오기 + 자동 배치 → 캔버스 캡처
   - `POST /v1/db-manager/generate` (format=json)
   - DBManager 「스크립트 → 적용」에서 1. 테이블 생성 → 2. 샘플 데이터 실행 (테스트 DB)
3. 소스 점검: `sample/demo-shop` 을 `javac -d target/classes` 로 컴파일 후 ZIP → `POST /v1/source-scan/run` (mode=upload)
4. 웹 품질: 포털을 띄우고 `POST /v1/web-quality/run` (mode=external, page_url=…/samples/demo-shop/index.html)
5. 응답 JSON 을 `demoResults.ts` 형식으로 옮기고 `generatedAt` 날짜를 갱신

> 운영 DB 에는 적용하지 마세요. 데모의 "DB 적용" 결과는 테스트용 PostgreSQL 에서 얻은 것입니다.
