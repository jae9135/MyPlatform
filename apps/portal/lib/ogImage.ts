/**
 * 공유 미리보기(Open Graph) 이미지 — 네이버 블로그·카카오톡 링크 카드에 표시.
 * 이미지 생성: scripts/generate_og_image.py (한글 폰트 필수)
 * 파일명을 바꾸면 네이버·카카오가 예전 캐시 대신 새 이미지를 가져갑니다.
 */
export const OG_IMAGE_URL = "/marketing/og-image-v2.jpg";

export function ogImages(alt: string) {
  return [{ url: OG_IMAGE_URL, width: 1200, height: 630, alt }];
}
