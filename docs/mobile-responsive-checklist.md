# 모바일 반응형 체크리스트

## 📱 테스트 환경

### 필수 테스트 기기/해상도
- [x] iPhone SE (375×667px) - 가장 작은 현대 기기
- [x] iPhone 12/13 (390×844px) - 표준 사이즈
- [x] Galaxy S21 (360×800px) - Android 표준
- [x] iPad Mini (768×1024px) - 태블릿
- [x] iPad Pro (1024×1366px) - 큰 태블릿
- [ ] Galaxy Fold (280px 접힌 상태) - 극단적 케이스

### 브라우저 DevTools 테스트
```
1. Chrome DevTools (F12)
2. Device Toolbar 활성화 (Ctrl+Shift+M)
3. Responsive 모드에서 375px, 768px, 1024px 테스트
```

---

## ✅ 현재 상태 점검

### 미디어 쿼리 (marketing.css)
```css
@media (max-width: 1024px) { ... }
@media (max-width: 940px) { ... }
@media (max-width: 640px) { ... }
```

### 주요 브레이크포인트
| 구간 | 타겟 | 변경 사항 |
|------|------|-----------|
| > 1024px | 데스크톱 | 기본 레이아웃 |
| 940px ~ 1024px | 태블릿 가로 | 프로세스 행 축소 |
| 640px ~ 940px | 태블릿 세로 | 2컬럼 → 1컬럼 |
| < 640px | 모바일 | 모든 요소 단순화 |

---

## 🔍 섹션별 점검 결과

### ✅ 네비게이션
- [x] 940px 이하: 햄버거 메뉴 표시
- [x] 모바일 메뉴 펼침/접힘 동작
- [x] CTA 버튼 숨김 (모바일 메뉴에만 표시)

### ✅ 히어로 섹션
- [x] 2컬럼 → 1컬럼 (940px)
- [x] 배경 이미지 마스크 처리
- [x] CTA 버튼 세로 배치
- [x] 배지 flex-wrap

### ✅ 통계 바
- [x] 4개 → 2개 (768px)
- [x] 2개 → 1개 (640px)
- [x] 숫자 폰트 크기 축소

### ⚠️ 도구 카탈로그
- [x] 그리드 auto-fit (최소 280px)
- [x] 카드 패딩 축소
- [ ] **개선 필요**: 썸네일 이미지 로딩 최적화

### ✅ Receipt 섹션
- [x] 2컬럼 → 1컬럼
- [x] 모형 중앙 정렬
- [x] 버튼 세로 배치

### ⚠️ 워크플로 섹션
- [x] SVG 너비 100% 자동 축소
- [ ] **개선 필요**: 작은 화면에서 텍스트 가독성

### ✅ 커스터마이징 섹션
- [x] 2컬럼 → 1컬럼
- [x] 프로세스 5단계 세로 배치 (640px)
- [x] 카드 3개 세로 배치

### ✅ 푸터
- [x] 링크 세로 배치
- [x] 저작권 문구 축소

---

## 🔧 발견된 문제 및 개선안

### 1. 작은 화면(375px)에서 텍스트 오버플로
**위치**: 히어로 H1

**현재**:
```css
.mkt-hero h1 {
  font-size: clamp(32px, 5vw, 48px);
}
```

**개선**:
```css
@media (max-width: 375px) {
  .mkt-hero h1 {
    font-size: 28px;
    line-height: 1.3;
  }
}
```

---

### 2. 도구 카드 썸네일 세로 비율
**위치**: `.mkt-tool-card-thumb`

**현재**: 16:9 고정
**문제**: 모바일에서 너무 큼

**개선**:
```css
@media (max-width: 640px) {
  .mkt-tool-card-thumb {
    aspect-ratio: 2 / 1;
  }
}
```

---

### 3. ReceiptGlass 모형 크기
**위치**: `.mkt-receipt-glass`

**현재**: 220px 고정
**문제**: 작은 화면에서 여백 부족

**개선**:
```css
@media (max-width: 375px) {
  .mkt-receipt-glass {
    width: 200px;
  }
}
```

---

### 4. 워크플로 SVG 텍스트 크기
**위치**: `WorkflowConnectDiagram.tsx`

**현재**: font-size 12~13
**문제**: 모바일에서 읽기 어려움

**개선**: SVG viewBox 조정 또는 폰트 크기 증가

---

### 5. 프로세스 단계 아이콘 크기
**위치**: `.mkt-process-step`

**개선**:
```css
@media (max-width: 640px) {
  .mkt-process-step {
    font-size: 12px;
    padding: 12px;
  }
}
```

---

## 📋 즉시 적용 권장 개선 사항

### 추가 미디어 쿼리 필요
```css
/* 아주 작은 기기 (iPhone SE 등) */
@media (max-width: 375px) {
  .mkt-hero h1 { font-size: 28px; }
  .mkt-hero-ctas { gap: 8px; }
  .mkt-receipt-glass { width: 200px; }
  .mkt-tool-card { padding: 16px; }
}

/* Galaxy Fold 접힌 상태 */
@media (max-width: 280px) {
  .mkt-btn { padding: 10px 16px; font-size: 13px; }
  .mkt-eyebrow { font-size: 11px; }
}
```

---

## 🎯 모바일 UX 개선 체크리스트

### 터치 타겟 (최소 44×44px)
- [x] 버튼 (48px 이상)
- [x] 링크 (패딩 추가)
- [x] 햄버거 메뉴 (48×48px)

### 스크롤 성능
- [x] 고정 헤더 (backdrop-filter)
- [ ] **개선 필요**: 이미지 lazy loading

### 폰트 크기
- [x] 본문: 최소 15px
- [x] 버튼: 최소 14px
- [ ] **확인 필요**: 작은 레이블 (12px 미만)

### 간격/여백
- [x] 섹션 간 여백 충분
- [x] 카드 내부 패딩
- [ ] **개선 필요**: 히어로와 통계바 사이 간격

---

## 🧪 실기기 테스트 방법

### 로컬 개발 서버 모바일 접근
```powershell
# 1. 로컬 IP 확인
ipconfig | findstr IPv4

# 2. 개발 서버 실행 (모든 인터페이스)
npm run dev:portal -- -H 0.0.0.0

# 3. 모바일에서 접속
http://192.168.x.x:3000
```

### 터널링 (외부 기기 테스트)
```bash
# ngrok 사용
ngrok http 3000

# 또는 Vercel 배포 후 테스트
vercel deploy --prod
```

---

## 📸 스크린샷 캡처 위치
- [ ] iPhone SE (375px) - 히어로, 도구 카탈로그
- [ ] iPad (768px) - 전체 페이지
- [ ] Galaxy Fold 접힌 상태 (280px) - 극단 테스트

---

## 🔄 다음 단계
1. ✅ OG 이미지 생성 스크립트 실행
2. ⚠️ 추가 미디어 쿼리 적용 (375px, 280px)
3. 🔍 실기기 테스트 수행
4. 📝 발견된 문제 수정
5. ✅ Lighthouse 모바일 점수 확인
