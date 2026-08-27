# MyGantt — 사용자 매뉴얼

## 1. 개요

| 항목 | 내용 |
|------|------|
| **프로그램명** | MyGantt |
| **URL** | `/apps/my-gantt` |
| **목적** | WBS 기반 **일정·간트** 관리, 공정율, 휴일, 공유 링크, 인쇄 |
| **저장** | localStorage (프로젝트 라이브러리) + Supabase (공유 링크) |

---

## 2. 화면 구성

### 2.1 ProjectHeader (상단)

| 필드 / 버튼 | 설명 |
|-------------|------|
| **프로젝트명** | 프로젝트 제목 |
| **업체명** | 고객/수행사 |
| **PM** | PM 이름 |
| **Project Start/End Date** | 전체 기간 |
| **기준일 (as-of)** | 공정율 시뮬레이션 기준일 + **오늘** 버튼 |
| **Display Week** | 간트 주 단위 표시 |
| **프로젝트 라이브러리** | 새/복제/삭제/전환 |
| **가져오기 / 내보내기** | Excel, JSON |
| **템플릿** | 샘플 xlsx 다운로드 |
| **휴일목록** | 휴일 편집 dialog |
| **공유 링크** | Supabase view/edit URL |
| **인쇄** | 표만 / 표+간트 |

### 2.2 Split pane (본문)

| 영역 | 설명 |
|------|------|
| **Task table (왼쪽)** | WBS 계층 테이블 |
| **Gantt chart (오른쪽)** | 막대 간트 |
| **분할선** | 드래그로 비율 조절 (localStorage 저장) |

**모바ile:** **표** / **간트** 토글로 한쪽만 표시.

### 2.3 Task table 컬럼

| 컬럼 | 설명 |
|------|------|
| WBS | 계층 번호 |
| TASK | 작업명 |
| LEAD | 담당 |
| 계획START/END | 계획 일정 |
| 실제START/END | 실적 일정 |
| DAYS, WORK, M/D | 공수 |
| 총일수 | 자동 계산 |
| 계획공정율 / 실제공정율 | % |
| 비중 | weight |
| 계획실적 / 실행실적 | |
| 공정율 | rollup |
| 산출물 | deliverable 텍스트 |

---

## 3. 기능 상세

### 3.1 WBS 편집

| 기능 | 설명 |
|------|------|
| **행 추가** | 형제 task |
| **하위 추가** | child task |
| **들여쓰기 / 내어쓰기** | WBS 레벨 변경 |
| **위/아래 이동** | 순서 변경 |
| **하위 트리 삭제** | subtree delete |

### 3.2 Gantt 차트

| 기능 | 설명 |
|------|------|
| **Plan bar 드래그** | 계획 시작·종료일 변경 |
| **스크롤 동기** | 표 ↔ 간트 세로 스크롤 연동 |
| **휴일 표시** | 휴일 목록 반영 |

### 3.3 자동 계산 (작동 방식)

- **총일수**, **공정율**, 상위 WBS **rollup** — 하위 task 기준 자동
- **기준일** 변경 시 as-of 공정율 재계산
- **휴일** — 주말 + 사용자 정의 + (선택) 한국 공휴일 merge

### 3.4 휴일목록

- Dialog에서 날짜 추가·삭제
- 간트·일수 계산에서 제외

### 3.5 프로젝트 라이브러리

| 기능 | 설명 |
|------|------|
| **새 프로젝트** | 빈 WBS |
| **복제** | 현재 프로젝트 복사 |
| **삭제** | 프로젝트 제거 |
| **전환** | dropdown 선택 |

**저장:** browser localStorage — 기기별.

### 3.6 Import / Export

| 형식 | 설명 |
|------|------|
| **Excel** | `.xlsx` / `.xls` — 템플릿 호환 |
| **JSON** | 전체 프로젝트 구조 |
| **템플릿** | `/samples/my-gantt/일정계획_템플릿.xlsx` |

### 3.7 공유 링크 (Supabase)

| 링크 종류 | 권한 |
|-----------|------|
| **edit** | URL + edit key — 클라우드 sync, 수정 가능 |
| **view** | view URL only — **읽기 전용** |

**작동 방식:** `gantt_projects` RPC — edit 링크로 열면 Supabase에 저장·동기화.

**로컬만:** Supabase 미설정 시 공유 없이 localStorage만 사용.

### 3.8 인쇄

| 옵션 | 출력 |
|------|------|
| **표만** | task table |
| **표+간트** | split layout |

브라우저 인쇄 dialog 사용.

---

## 4. 사용 방법 (단계별)

### 4.1 새 프로젝트

1. **새 프로젝트** → 프로젝트명·기간·PM 입력
2. Task **추가** → WBS 구조 편집
3. 계획일 입력 또는 **Gantt bar** 드래그
4. **휴일목록** 설정 (필요 시)
5. **엑셀 내보내기** 또는 **인쇄**

### 4.2 Excel에서 가져오기

1. **템플릿** 다운로드 참고
2. **가져오기** → xlsx 선택
3. 컬럼 매핑 확인 → 적용

### 4.3 공유 (팀 협업)

1. Supabase env 설정 확인
2. **공유 링크 만들기** → edit URL 복사 (동료에게)
3. view URL은 stakeholder용 읽기 전용

### 4.4 웹 품질 진단 연계

MyGantt TSX에 `data-wq-target`, `data-wq-state` 속성을 두면 **웹 품질 진단**에서 화면 시나리오 자동 추출 가능. 가이드: `apps/api/web_quality/docs/my-gantt-scenario-guide.md`

---

## 5. 입력·출력

| 구분 | 형식 |
|------|------|
| **입력** | Excel, JSON import |
| **출력** | Excel, JSON export; browser print |
| **공유** | Supabase cloud (edit link) |

---

## 6. 환경 요구사항

| 변수 | 용도 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | 공유 링크 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase RPC |

Migration: `supabase/migrations/20260813000000_gantt_projects.sql`

---

## 7. 주의사항

- **로컬 프로젝트**는 브라우저 삭제 시 소실 — 주기적 JSON/Excel export
- edit key가 있는 URL은 **수정 권한** — 외부 유출 주의
- view 링크는 read-only이나 프로젝트 내용은 노출됨
- 대형 WBS(500+ rows)는 표·간트 성능 저하 가능
