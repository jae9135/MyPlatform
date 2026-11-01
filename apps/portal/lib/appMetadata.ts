import type { Metadata } from "next";
import { APPS } from "@/lib/apps";
import { BRAND_NAME } from "@/lib/brand";
import { ogImages } from "@/lib/ogImage";

/**
 * 프로그램 화면(/apps/<id>) 메타데이터
 * - 탭 제목: 브라우저 탭·즐겨찾기·방문 기록에서 프로그램을 구분
 * - 공유 카드(og): 블로그·카톡에 프로그램 링크를 붙였을 때 프로그램 이름·설명·이미지 표시
 */
export function appMetadata(id: string): Metadata {
  const app = APPS.find((a) => a.id === id);
  if (!app) return { title: "프로그램" };
  const title = `${app.name} — 무료로 바로 실행`;
  const description = `${app.description}. 샘플 파일로 바로 실행해 볼 수 있습니다. | ${BRAND_NAME}`;
  return {
    title: app.name,
    description,
    openGraph: {
      title,
      description,
      url: app.href,
      type: "website",
      locale: "ko_KR",
      siteName: BRAND_NAME,
      images: ogImages(app.name),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
