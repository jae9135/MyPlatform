"use client";

type Props = {
  poster: string;
  src: string;
};

export function HeroPromoVideo({ poster, src }: Props) {
  return (
    <div className="mkt-hero-visual">
      <video
        className="mkt-hero-video"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster={poster}
        aria-label="프로젝트 자동화 플랫폼 화면 소개"
      >
        <source src={src} type="video/mp4" />
      </video>
    </div>
  );
}
