# 모바일 히어로 이미지 문제 디버깅

## 문제
모바일에서 히어로 섹션 배경 이미지가 안 보임

## 원인 분석

### 1. Next.js Image fill 속성 요구사항
- 부모 요소: `position: relative` ✅
- 부모 요소: 명시적 높이 필요 ✅
- 부모 요소: `display: block` 필요 (추가됨)

### 2. 적용된 수정사항
```css
/* 데스크톱 */
.mkt-hero-visual {
  position: relative;
  width: 100%;              /* 명확한 너비 */
  min-height: clamp(300px, 36vw, 400px);
}

/* 모바일 (940px 이하) */
.mkt-hero-visual {
  width: 100%;
  min-height: 280px;
  max-height: 320px;        /* 최대 높이 제한 */
  display: block;           /* 명시적 display */
  order: -1;                /* 텍스트 위로 이동 */
}

/* 작은 화면 (375px 이하) */
.mkt-hero-visual {
  min-height: 240px;
}
```

---

## 즉시 확인 방법

### 모바일에서 개발자 도구 확인
1. **Chrome 모바일**: 주소창에 `chrome://inspect` 입력
2. **Safari iOS**: 설정 → Safari → 고급 → 웹 인스펙터
3. **원격 디버깅**: PC Chrome DevTools에서 모바일 기기 연결

### 간단 확인 (모바일 브라우저)
```
1. 페이지 로드 후 상단 히어로 섹션 확인
2. 텍스트 위에 배경 이미지가 보여야 함
3. 이미지가 흐릿하게 페이드되며 아래로 사라짐 (마스크 효과)
```

---

## 문제가 지속될 경우

### A. 캐시 삭제
```
모바일 브라우저 → 설정 → 캐시/쿠키 삭제
또는
페이지 새로고침 (강력)
```

### B. 이미지 경로 확인
```
브라우저 주소창:
http://[서버주소]:3000/marketing/hero-bg.png

직접 접속해서 이미지가 로드되는지 확인
```

### C. 임시 대안: JPG로 교체
```typescript
// marketingAssets.ts
hero: "/marketing/02-hero-medium.jpg",  // PNG → JPG
```

---

## 추가 진단 명령어

### 이미지 파일 확인
```powershell
# 파일 존재 확인
Test-Path "c:\Mywork\MyPlatform-2.0\apps\portal\public\marketing\hero-bg.png"

# 파일 크기 확인 (1MB 이상이면 로딩 느림)
Get-Item "c:\Mywork\MyPlatform-2.0\apps\portal\public\marketing\hero-bg.png" | Select-Object Length

# 대안 이미지 목록
Get-ChildItem "c:\Mywork\MyPlatform-2.0\apps\portal\public\marketing" -Filter "*.jpg" | Select-Object Name
```

---

## 최종 해결책: 간단한 이미지로 교체

### 옵션 1: 더 작은 JPG 사용
```typescript
// marketingAssets.ts
export const MARKETING_IMAGES = {
  hero: "/marketing/02-hero-medium.jpg",  // 98KB (PNG 1.3MB 대신)
}
```

### 옵션 2: CSS 배경 이미지로 변경
```css
.mkt-hero-visual {
  background-image: url('/marketing/hero-bg.png');
  background-size: cover;
  background-position: center;
}
```

### 옵션 3: img 태그로 변경
```tsx
<div className="mkt-hero-visual">
  <img 
    src="/marketing/hero-bg.png"
    alt=""
    style={{
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }}
  />
</div>
```

---

## 현재 상태 체크

- [x] CSS position: relative 확인
- [x] 명시적 높이 설정
- [x] width: 100% 추가
- [x] display: block 추가
- [ ] 모바일에서 실제 이미지 로딩 확인
- [ ] 네트워크 탭에서 hero-bg.png 요청 확인

---

## 다음 단계

1. **즉시**: 페이지 강력 새로고침
2. **확인**: 브라우저에서 `/marketing/hero-bg.png` 직접 접속
3. **문제 지속 시**: JPG로 임시 교체 (옵션 1)
