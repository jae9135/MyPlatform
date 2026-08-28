# 히어로 이미지 최적화 가이드

## 현재 상태
- **사용 중**: `/marketing/hero-bg.png` (텍스트 없는 배경)
- **크기**: 1.3MB
- **문제**: 모바일에서 로딩이 느릴 수 있음

---

## 해결 방안

### 옵션 1: 이미지 압축 (추천)
```powershell
# ImageMagick 사용 (설치 필요)
magick hero-bg.png -quality 85 -resize 1920x hero-bg-optimized.jpg

# 또는 TinyPNG 온라인 도구
https://tinypng.com/
```

**목표**: 200KB 이하

---

### 옵션 2: Next.js 자동 최적화 활용
현재 이미 적용 중:
```tsx
<Image
  src={MARKETING_IMAGES.hero}
  fill
  priority           // 최우선 로드
  quality={95}       // 85로 낮추면 파일 크기 감소
  sizes="(max-width: 940px) 100vw, 55vw"
/>
```

**개선**:
```tsx
quality={85}  // 95 → 85 (화질 거의 동일, 크기 30% 감소)
```

---

### 옵션 3: WebP 변환
```powershell
# cwebp 사용 (Google WebP 도구)
cwebp -q 85 hero-bg.png -o hero-bg.webp

# 파일명 변경
marketingAssets.ts:
hero: "/marketing/hero-bg.webp"
```

**장점**: PNG 1.3MB → WebP 200KB
**단점**: 구형 브라우저 지원 제한 (2023년 이후는 대부분 지원)

---

### 옵션 4: 반응형 이미지 소스셋
```tsx
<Image
  src="/marketing/hero-bg-large.jpg"
  srcSet="
    /marketing/hero-bg-mobile.jpg 768w,
    /marketing/hero-bg-large.jpg 1920w
  "
  fill
  priority
/>
```

---

## 즉시 적용 가능한 개선

### 1. quality 낮추기
```typescript
// MarketingHome.tsx
<Image
  src={MARKETING_IMAGES.hero}
  alt=""
  fill
  priority
  quality={85}  // 95 → 85
  className="mkt-hero-bg-image"
  sizes="(max-width: 940px) 100vw, 55vw"
/>
```

### 2. placeholder 추가 (로딩 경험 개선)
```tsx
<Image
  ...
  placeholder="blur"
  blurDataURL="data:image/png;base64,iVBORw0KG..."  // 작은 블러 이미지
/>
```

---

## 장기 해결책: 이미지 생성 스크립트

### 스크립트로 최적화된 이미지 생성
```python
# scripts/optimize_hero_images.py
from PIL import Image

img = Image.open("hero-bg.png")

# 데스크톱용 (1920px)
img_desktop = img.resize((1920, 1080), Image.LANCZOS)
img_desktop.save("hero-bg-desktop.jpg", "JPEG", quality=85, optimize=True)

# 모바일용 (768px)
img_mobile = img.resize((768, 432), Image.LANCZOS)
img_mobile.save("hero-bg-mobile.jpg", "JPEG", quality=80, optimize=True)

# WebP 변환
img_desktop.save("hero-bg-desktop.webp", "WEBP", quality=85)
img_mobile.save("hero-bg-mobile.webp", "WEBP", quality=80)
```

---

## 현재 설정 (복원됨)

```typescript
// marketingAssets.ts
hero: "/marketing/hero-bg.png"  // 텍스트 없는 배경
```

```css
/* marketing.css */
.mkt-hero-bg-image {
  object-fit: cover;
  object-position: center right;
  mask-image: linear-gradient(to left, rgba(0,0,0,0.2) 0%, black 18%);
}

/* 모바일 (940px 이하) */
.mkt-hero-bg-image {
  mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  object-position: center center;
}
```

---

## 모바일 로딩 개선 체크리스트

- [x] `priority` 속성 활성화
- [x] `sizes` 속성으로 반응형 최적화
- [ ] `quality` 85로 낮추기
- [ ] WebP 변환
- [ ] 모바일 전용 이미지 생성 (768px)
- [ ] placeholder 블러 추가

---

## 추천 순서

### 즉시 (빠른 개선)
1. `quality={85}` 적용
2. 강력 새로고침

### 단기 (시간 있을 때)
3. TinyPNG로 압축 후 교체
4. WebP 변환

### 장기 (완벽한 해결)
5. 스크립트로 반응형 이미지 세트 생성
6. `<picture>` 태그로 srcset 구현

---

**현재는 `hero-bg.png`로 복원되었으니, 페이지를 새로고침하면 텍스트 없는 배경이 보일 것입니다.**
