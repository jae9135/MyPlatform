# 홈페이지 개선안 모음

현재 홈페이지는 수정하지 않고, 제안된 개선 사항들을 별도 컴포넌트로 작성했습니다.
각 파일을 검토 후 적용 여부를 결정해 주세요.

---

## 📁 파일 구조

```
docs/homepage-improvements/
├── README.md                    # 이 파일
├── faq-section.tsx              # FAQ 섹션 컴포넌트
├── faq-section.css              # FAQ 스타일
├── testimonial-section.tsx      # 고객 후기/사례 섹션
├── testimonial-section.css      # 고객 후기 스타일
├── cta-improvement.tsx          # CTA 개선안 (3가지 변형)
├── cta-improvement.css          # CTA 스타일
├── pricing-section.tsx          # 가격/라이선스 섹션
├── pricing-section.css          # 가격 섹션 스타일
└── og-image-generator.py        # OG 이미지 생성 스크립트 (예정)
```

---

## 🎨 개선안 상세

### 1. FAQ 섹션
**파일**: `faq-section.tsx`, `faq-section.css`

**추천 위치**: `#workflow`와 `#customize` 사이

**특징**:
- 아코디언 UI (클릭 시 답변 확장)
- Q/A 아이콘 배지
- 6개 질문 (베타, 기술 스택, 온프레미스, 지원 언어, Excel 양식 등)
- 추가 문의 링크

**적용 방법**:
```tsx
// apps/portal/components/marketing/MarketingHome.tsx
import { FaqSection } from "./FaqSection";

// #workflow 섹션 다음에 추가
<FaqSection />
```

---

### 2. 고객 후기/사례 섹션
**파일**: `testimonial-section.tsx`, `testimonial-section.css`

**추천 위치**: `#tools` 섹션 바로 다음

**특징**:
- 3개 카드 그리드 (금융, 공공, 제조)
- 회사명 익명 처리 (A사, B사...)
- 태그 (#소스코드진단, #DB워크플로 등)
- 호버 효과 (좌측 컬러 바)

**적용 방법**:
```tsx
import { TestimonialSection } from "./TestimonialSection";

// #tools 섹션 다음에 추가
<TestimonialSection />
```

---

### 3. CTA 개선안 (히어로 섹션)
**파일**: `cta-improvement.tsx`, `cta-improvement.css`

**3가지 변형 제공**:

#### Variant 1: 메인 CTA 강조
- 큰 버튼 1개 (8가지 도구 무료 체험)
- 작은 텍스트 링크 2개 (맞춤 개발, 베타 프로그램)

#### Variant 2: 2단 구조
- 주요 버튼 1개 (2줄 텍스트: 메인 + 부연 설명)
- 보조 버튼 2개 (맞춤 상담, 베타 로그인)

#### Variant 3: 카드형
- 3개 카드 (아이콘 + 제목 + 설명)
- 첫 번째 카드만 배경색 강조

**적용 방법**:
```tsx
import { HeroCta_Variant1 } from "./HeroCta";

// 기존 mkt-hero-ctas 대체
<HeroCta_Variant1 />
```

---

### 4. 가격/라이선스 섹션
**파일**: `pricing-section.tsx`, `pricing-section.css`

**추천 위치**: `#customize` 섹션 또는 별도 `/pricing` 페이지

**특징**:
- 3개 플랜 (베타 체험, 기업 라이선스, SaaS 구독)
- 기업 라이선스 카드 강조 (상단 컬러 바)
- SaaS는 "준비중" 상태로 비활성화
- 하단 공통 설명 + 문의 링크

**적용 방법**:
```tsx
import { PricingSection } from "./PricingSection";

// #customize 섹션 다음 또는 별도 페이지
<PricingSection />
```

---

## 📊 Open Graph 이미지 개선

**현재 문제**: `08-cta-contact.jpg` 사용 중 (범용 이미지)

**추천**:
- 브랜드 로고 + 도구 아이콘 8개 + 핵심 문구
- 1200×630px (OG 표준)
- 밝은 그라데이션 배경

**생성 방법**: Python Pillow 또는 Figma/Canva 템플릿
(별도 스크립트 요청 시 작성 가능)

---

## 🎯 적용 우선순위 추천

### 즉시 적용 추천
1. **CTA 개선 (Variant 1)** - 전환율 직접 영향
2. **FAQ 섹션** - 사용자 질문 사전 차단

### 선택 적용
3. **고객 후기** - 신뢰도 향상 (실제 데이터 필요)
4. **가격 섹션** - 별도 페이지로 분리 권장

### 나중에 적용
5. **OG 이미지** - 마케팅 확산 시 중요

---

## 🔧 적용 테스트

각 컴포넌트를 적용한 후:

1. **로컬 빌드**: `.next` 삭제 후 `npm run build`
2. **반응형 확인**: 640px, 940px, 1200px
3. **접근성 테스트**: 키보드 탐색, 스크린리더
4. **성능 측정**: Lighthouse 점수 비교

---

## 💡 추가 제안

### 섹션 재배치 최종안
```
1. Hero
2. Stats Bar
3. Tool Catalog (#tools)
4. 고객 후기 (신규) ← 신뢰도 강화
5. Receipt (#receipt)
6. Workflow (#workflow)
7. FAQ (신규) ← 의문 해소
8. Customize (#customize)
9. 가격 (신규 또는 링크)
10. Footer
```

---

## ❓ 질문 & 피드백

각 개선안에 대해:
- ✅ 적용
- ⚠️ 수정 후 적용 (어떤 부분?)
- ❌ 제외

의견 주시면 반영하겠습니다.
