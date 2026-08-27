# MyPlatform 사용자 매뉴얼

MyPlatform에 포함된 모든 프로그램의 **화면 구성**, **기능**, **상세 기능**, **작동 방식**, **사용 방법**을 정리한 문서입니다.

## Word (.docx) 버전

Markdown 원본을 Word로 변환한 파일은 [`word/`](./word/) 폴더에 있습니다.

| 파일 | 설명 |
|------|------|
| [MyPlatform-사용자매뉴얼-전체.docx](./word/MyPlatform-사용자매뉴얼-전체.docx) | **통합본** — 모든 앱 매뉴얼 (권장) |
| `00-MyPlatform-매뉴얼-목차.docx` | 목차·분류·환경 설정 |
| `00-MyPlatform-공통.docx` ~ `08-MyGantt.docx` | 앱별 개별 매뉴얼 |

재생성 (Markdown 수정 후):

```powershell
python scripts/build-manual-docx.py
```

필요: [Pandoc](https://pandoc.org/) 설치.

---

## 매뉴얼 목록

| 번호 | 프로그램 | 문서 | URL |
|------|----------|------|-----|
| 00 | 포털 공통 (로그인·내비게이션) | [00-MyPlatform-공통.md](./00-MyPlatform-공통.md) | `/`, `/login` |
| 01 | 소스코드·보안 진단 | [01-소스코드-보안-진단.md](./01-소스코드-보안-진단.md) | `/apps/source-scan` |
| 02 | 웹 품질 진단 | [02-웹-품질-진단.md](./02-웹-품질-진단.md) | `/apps/web-quality` |
| 03 | DB 표준 점검 | [03-DB-표준-점검.md](./03-DB-표준-점검.md) | `/apps/chk-db-std` |
| 04 | DBManager | [04-DBManager.md](./04-DBManager.md) | `/apps/db-manager` |
| 05 | ER Modeler | [05-ER-Modeler.md](./05-ER-Modeler.md) | `/apps/er-modeler` |
| 06 | DeliverableManager | [06-DeliverableManager.md](./06-DeliverableManager.md) | `/apps/deliverable-manager` |
| 07 | ReceiptToPDF | [07-ReceiptToPDF.md](./07-ReceiptToPDF.md) | `/apps/receipt-to-pdf` |
| 08 | MyGantt | [08-MyGantt.md](./08-MyGantt.md) | `/apps/my-gantt` |

---

## 프로그램 분류

| 분류 | 프로그램 | 한 줄 설명 |
|------|----------|------------|
| **품질** | 소스코드·보안 진단, 웹 품질 진단 | 소스·화면 품질·보안 점검 |
| **DB·설계** | DB 표준 점검, DBManager, ER Modeler | 행안부 표준, DDL, ERD |
| **업무** | DeliverableManager, MyGantt | 산출물 목록, 일정·간트 |
| **모바일** | ReceiptToPDF | 영수증 → PDF |

---

## 공통 정책

1. **공통 샘플·표준** → Supabase Storage (서버)
2. **사용자 업로드·진단 결과** → API 서버 임시 처리 또는 브라우저 로컬 저장 (민감 데이터는 서버에 장기 보관하지 않음)
3. **API 연동 앱** → 포털이 `/api/backend` 프록시를 통해 FastAPI(`apps/api`) 호출
4. **로컬 전용 앱** → ER Modeler, MyGantt, ReceiptToPDF는 브라우저에 데이터 저장 가능

---

## 환경 설정 (관리자)

로컬 개발 시 `apps/portal/.env.local` 예시:

| 변수 | 용도 |
|------|------|
| `PORTAL_PASSWORD` | 포털 로그인 암호 |
| `NEXT_PUBLIC_API_BASE_URL` | API 서버 URL (예: `http://127.0.0.1:8001`) |
| `API_ACCESS_KEY` | 포털↔API 인증 키 |
| `NEXT_PUBLIC_SUPABASE_URL` | DeliverableManager, MyGantt 공유 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 익명 키 |

API 서버(`apps/api`) 추가 변수: `DATABASE_URL`, `PMD_HOME`, `SPOTBUGS_HOME`, `JAVA_HOME` 등 — 앱별 매뉴얼 참고.

---

## 스크린샷

`docs/manual/images/` 폴더에 UI 캡처가 있습니다.

- `main.png` — 포털 홈
- `manual-chk-db-std-ui.png` — DB 표준 점검
- `manual-er-modeler-ui.png` — ER Modeler
- `manual-workflow-overview.png` — ER Modeler ↔ DB 표준 점검 흐름

---

## 관련 문서

- [아키텍처](../architecture.md)
- [배포 가이드](../DEPLOY.md)
- [소스스캔 환경 설정](../source-scan-setup.md)
