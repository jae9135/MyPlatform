# 모바일 실기기 테스트 가이드

## 🎯 목표
iPhone SE, iPad, Galaxy 등 실제 모바일 기기에서 홈페이지를 테스트합니다.

---

## 📱 1단계: 로컬 서버를 네트워크에서 접근 가능하게 설정

### 방법 A: 로컬 IP로 접속 (같은 Wi-Fi 필요)

```powershell
# 1. PC의 로컬 IP 확인
ipconfig

# IPv4 주소 찾기 (예: 192.168.0.123)
```

```powershell
# 2. Next.js 개발 서버를 모든 인터페이스에서 실행
cd c:\Mywork\MyPlatform-2.0\apps\portal
npm run dev -- -H 0.0.0.0

# 또는 package.json에 추가:
# "dev:network": "next dev -H 0.0.0.0"
```

```
# 3. 모바일 기기에서 접속
http://192.168.0.123:3000
(PC의 실제 IP 주소 사용)
```

### 방법 B: ngrok 터널링 (외부 기기도 가능)

```powershell
# 1. ngrok 설치 (https://ngrok.com/)
# 또는 chocolatey:
choco install ngrok

# 2. 개발 서버 실행 (다른 터미널)
npm run dev:portal

# 3. ngrok 터널 시작 (새 터미널)
ngrok http 3000

# 4. 표시된 URL로 접속 (예: https://abc123.ngrok.io)
```

### 방법 C: Vercel 배포 (가장 안정적)

```powershell
# 1. Vercel CLI 설치
npm i -g vercel

# 2. 배포
cd c:\Mywork\MyPlatform-2.0\apps\portal
vercel deploy

# 3. 프리뷰 URL로 접속
```

---

## 🔍 2단계: 테스트 체크리스트

### 필수 테스트 항목

#### ✅ 네비게이션
- [ ] 햄버거 메뉴 열림/닫힘 (940px 이하)
- [ ] 메뉴 링크 클릭 시 스크롤 이동
- [ ] 고정 헤더 스크롤 시 동작
- [ ] CTA 버튼 터치 영역 충분 (44×44px)

#### ✅ 히어로 섹션
- [ ] 제목 텍스트 오버플로 없음
- [ ] CTA 버튼 3개 모두 터치 가능
- [ ] 배경 이미지 로딩
- [ ] 배지 줄바꿈 자연스러움

#### ✅ 통계 바
- [ ] 숫자 가독성 (작은 화면에서)
- [ ] 레이아웃 깨짐 없음

#### ✅ 도구 카탈로그
- [ ] 카드 그리드 정렬 (1열 또는 2열)
- [ ] 썸네일 이미지 로딩
- [ ] 카드 터치 영역 충분
- [ ] 텍스트 오버플로 없음

#### ✅ Receipt 섹션
- [ ] 글래스 모형 중앙 정렬
- [ ] 버튼 터치 시 토스트 애니메이션
- [ ] 텍스트 가독성

#### ✅ 워크플로 섹션
- [ ] SVG 다이어그램 축소 시 가독성
- [ ] 텍스트 크기 적절
- [ ] 버튼 터치 가능

#### ✅ 커스터마이징 섹션
- [ ] 프로세스 5단계 세로 배치
- [ ] 카드 3개 레이아웃
- [ ] 연락처 카드 가독성

#### ✅ 푸터
- [ ] 링크 터치 가능
- [ ] 저작권 문구 가독성

### 성능 테스트
- [ ] 페이지 로딩 속도 (3G 환경)
- [ ] 이미지 lazy loading 동작
- [ ] 스크롤 성능 (60fps)

### 터치 인터랙션
- [ ] 버튼 호버 → 터치 피드백
- [ ] 스크롤 부드러움
- [ ] 링크 터치 지연 없음 (300ms)

---

## 📸 3단계: 스크린샷 캡처

### 캡처 위치
```
1. iPhone SE (375px)
   - 히어로 섹션 (전체 버튼 보이게)
   - 도구 카탈로그 (카드 1~2개)
   - Receipt 모형

2. iPad (768px)
   - 전체 페이지 스크롤 캡처
   - 네비게이션 (햄버거 메뉴)

3. 가로 모드
   - iPad 가로 (1024px)
   - iPhone 가로 (667px)
```

### 스크린샷 저장 경로
```
docs/mobile-screenshots/
├── iphone-se-375-hero.png
├── iphone-se-375-tools.png
├── ipad-768-full.png
└── landscape-1024.png
```

---

## 🐛 4단계: 발견된 문제 기록

### 문제 템플릿
```markdown
#### [기기] 문제 제목
- **기기**: iPhone SE (375px)
- **위치**: 히어로 섹션 H1
- **문제**: 텍스트가 2줄로 넘어가면서 버튼과 겹침
- **스크린샷**: docs/mobile-screenshots/issue-001.png
- **수정 방안**: font-size 28px → 26px
```

---

## 🔧 5단계: Chrome DevTools 모바일 에뮬레이션

```
1. Chrome 개발자 도구 (F12)
2. Device Toolbar 활성화 (Ctrl+Shift+M)
3. 기기 선택:
   - iPhone SE (375×667)
   - iPhone 12 Pro (390×844)
   - iPad Mini (768×1024)
   - Galaxy S20 (360×800)
4. Throttling: Fast 3G 선택
5. Lighthouse 실행 (모바일 모드)
```

### Lighthouse 목표 점수
- **Performance**: 90+
- **Accessibility**: 95+
- **Best Practices**: 95+
- **SEO**: 100

---

## ✅ 완료된 개선 사항

### CSS 미디어 쿼리 추가
```css
/* 640px 이하 */
- 도구 카드 패딩 축소 (16px)
- 썸네일 비율 변경 (2:1)
- 프로세스 스텝 폰트 축소 (12px)

/* 375px 이하 (iPhone SE) */
- 히어로 H1 크기 축소 (28px)
- CTA 버튼 간격 축소 (8px)
- Receipt 모형 축소 (200px)
- 버튼 패딩 축소 (11px 18px)
- 통계 숫자 크기 축소 (32px)
```

### OG 이미지 교체
- ✅ 1200×630px 전용 이미지 생성
- ✅ 브랜드 그라데이션 배경
- ✅ 핵심 문구 + 8가지 도구 표시
- ✅ page.tsx 메타데이터 업데이트

---

## 📊 테스트 결과 기록 양식

```markdown
## 테스트 일시: 2026-08-28

### 기기: iPhone SE (375×667)
| 항목 | 결과 | 비고 |
|------|------|------|
| 네비게이션 | ✅ | 햄버거 메뉴 정상 |
| 히어로 | ⚠️ | H1 줄바꿈 개선 필요 |
| 통계 바 | ✅ | 2열 레이아웃 |
| 도구 카탈로그 | ✅ | 1열, 카드 가독성 양호 |
| Receipt | ✅ | 모형 크기 적절 |
| 워크플로 | ⚠️ | SVG 텍스트 작음 |
| 커스터마이징 | ✅ | 세로 배치 정상 |
| 푸터 | ✅ | 링크 터치 가능 |

### 기기: iPad (768×1024)
...
```

---

## 🚀 다음 단계

1. ✅ 로컬 서버 네트워크 접근 설정
2. 🔍 실기기에서 전체 페이지 탐색
3. 📸 주요 화면 스크린샷 캡처
4. 🐛 문제 발견 시 기록
5. 🔧 CSS 수정 후 재테스트
6. ✅ Lighthouse 모바일 점수 확인
7. 📝 최종 테스트 리포트 작성

---

## ⚡ 빠른 테스트 명령어

```powershell
# 터미널 1: 개발 서버 (네트워크 접근)
cd c:\Mywork\MyPlatform-2.0\apps\portal
npm run dev -- -H 0.0.0.0

# 터미널 2: ngrok (선택)
ngrok http 3000

# PC IP 확인
ipconfig | findstr IPv4

# 모바일에서 접속
http://[PC의_IP]:3000
# 예: http://192.168.0.123:3000
```
