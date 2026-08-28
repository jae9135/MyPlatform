# 프로젝트 자동화 Platform — 마케팅 에셋

등록·홍보용 이미지·동영상 패키지입니다.

## 매번 다른 결과인가?

**아닙니다.** 같은 스크립트·같은 설정으로 실행하면 **항상 동일한** 이미지·동영상이 생성됩니다.

달라지는 경우:
- `scripts/generate_marketing_assets.py`의 `BRAND`, `TOOLS`, `APP_HOME_META` 등 상수 수정
- `docs/marketing-assets/hero-ai-base.png` 교체
- Pillow / imageio 버전 차이로 JPEG 압축만 미세하게 달라질 수 있음

## 규격

| 유형 | 조건 |
|------|------|
| **이미지** | 가로 **652 ~ 2000px** · PNG / JPG / GIF |
| **동영상** | MP4 · **합계 500MB 이하** |

## 생성 방법

```powershell
cd C:\Mywork\MyPlatform-2.0
python scripts/generate_marketing_assets.py
```

필요 패키지: `pillow`, `imageio[ffmpeg]`

## 공통 이미지 (`images/`)

| 파일 | 크기 | 설명 |
|------|------|------|
| `01-hero-main.jpg` | 1920×1080 | 메인 히어로 배너 |
| `02-hero-medium.jpg` | 1200×675 | 중형 배너 |
| `03-hero-minimum.jpg` | 652×366 | 최소 가로 규격 |
| `04-tools-overview.png` | 1920×1080 | 8종 도구 개요 |
| `05-workflow.jpg` | 1600×900 | 맞춤 개발 프로세스 |
| `06-quality-category.jpg` | 1920×900 | 품질·진단 도구 |
| `07-db-pm-category.jpg` | 1920×900 | DB·설계·업무 도구 |
| `08-cta-contact.jpg` | 1200×630 | 문의 CTA |
| `09-platform-badge.png` | 800×800 | 정사각형 배지 |
| `10-tools-grid-wide.jpg` | 2000×1125 | 와이드 그리드 |
| `11-animated-banner.gif` | 652×366 | GIF (히어로·도구·앱·CTA) |

## 프로그램별 메인 화면 (`images/apps/`)

포털 제품 페이지 mockup과 동일한 **다크 UI 브라우저 프레임** 스타일입니다.

| 파일 | 프로그램 |
|------|----------|
| `app-01-source-scan-home.jpg` | 소스코드·보안 진단 |
| `app-02-web-quality-home.jpg` | 웹 품질 진단 |
| `app-03-perf-test-home.jpg` | 성능 진단 |
| `app-04-chk-db-std-home.jpg` | DB 표준 점검 |
| `app-05-db-manager-home.jpg` | DBManager |
| `app-06-er-modeler-home.jpg` | ER Modeler |
| `app-07-deliverable-manager-home.jpg` | DeliverableManager |
| `app-08-my-gantt-home.jpg` | MyGantt |

## 동영상 (`videos/`)

| 파일 | 구성 |
|------|------|
| `01-promo-overview.mp4` | 히어로 → 도구 개요 → **8개 앱 메인 화면** → 워크플로 → CTA |
| `02-promo-tools.mp4` | 도구 개요 → **8개 앱 메인 화면** → CTA |
| `03-promo-app-screens.mp4` | **8개 앱 메인 화면**만 → CTA |
| `04-promo-jaewook-captures.mp4` | **실제 화면 캡처** 9장 (`docs/이미지_재욱캡처`) |

**합계 용량:** 약 15~25MB (500MB 한도 이내)

### 실제 캡처 동영상 재생성

```powershell
python scripts/build_capture_video.py
```

출력:
- `docs/marketing-assets/videos/04-promo-jaewook-captures.mp4`
- `docs/이미지_재욱캡처/프로젝트자동화Platform-화면소개.mp4` (동일 복본)

## 메타데이터

`manifest.json` — `images`, `app_home_images`, `videos` 목록 및 용량

## 참고

- 히어로 배경: `hero-ai-base.png` (선택)
- 실제 포털 스크린샷이 필요하면 dev 서버 + Playwright 캡처를 별도로 추가할 수 있습니다.
