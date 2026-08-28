import Image from "next/image";
import type { ReactNode } from "react";

type Props = {
  image: string;
  alt: string;
  title?: string;
  description?: string;
  compact?: boolean;
  children?: ReactNode;
};

export function MarketingVisualBand({
  image,
  alt,
  title,
  description,
  compact,
  children,
}: Props) {
  return (
    <section className={`mkt-visual-band${compact ? " mkt-visual-band-compact" : ""}`}>
      <Image
        src={image}
        alt=""
        fill
        className="mkt-visual-band-img"
        sizes="100vw"
        priority={false}
        aria-hidden
      />
      <div className="mkt-visual-band-overlay" aria-hidden />
      <div className="mkt-wrap mkt-visual-band-inner">
        {title ? <h2 className="mkt-visual-band-title">{title}</h2> : null}
        {description ? <p className="mkt-visual-band-desc">{description}</p> : null}
        {children}
      </div>
      <span className="sr-only">{alt}</span>
    </section>
  );
}
