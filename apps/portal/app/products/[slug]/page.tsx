import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { betaEntryHref } from "@/lib/authMode";
import { ProductDetailScreens } from "@/components/marketing/AppScreenMockup";
import { ProductReviews } from "@/components/community/ProductReviews";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { loadToolReviews } from "@/lib/board";
import { productJsonLd } from "@/lib/structuredData";
import {
  getMarketingTool,
  getMarketingTools,
  getProductBySlug,
  getProductSeo,
  RECEIPT_STANDALONE,
} from "@/lib/marketingCatalog";
import "../../marketing.css";

type Props = { params: { slug: string } };

/** 후기·평점을 HTML 에 포함하되 5분마다 새로 생성 (ISR) */
export const revalidate = 300;

export function generateStaticParams() {
  const slugs = getMarketingTools().map((t) => ({ slug: t.slug }));
  return [...slugs, { slug: RECEIPT_STANDALONE.slug }];
}

export function generateMetadata({ params }: Props): Metadata {
  const seo = getProductSeo(params.slug);
  const product = getProductBySlug(params.slug);
  if (!product || !seo) {
    return { title: product?.name ?? "제품" };
  }
  const path = `/products/${params.slug}`;
  return {
    title: seo.seoTitle,
    description: seo.seoDescription,
    alternates: { canonical: path },
    openGraph: {
      title: seo.seoTitle,
      description: seo.seoDescription,
      url: path,
      images: [{ url: "/marketing/og-image.jpg", width: 1200, height: 630, alt: product.name }],
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const product = getProductBySlug(params.slug);
  if (!product) notFound();

  const reviews = await loadToolReviews(params.slug);

  const isReceipt = product.isStandalone;
  const tool = getMarketingTool(params.slug);

  return (
    <MarketingPageShell>
      <JsonLd data={productJsonLd(product, reviews)} />
      <div className="mkt-product-hero">
        {isReceipt ? (
          <p className="mkt-eyebrow">STANDALONE · MOBILE</p>
        ) : tool ? (
          <p className="mkt-eyebrow">{tool.categoryLabel.toUpperCase()}</p>
        ) : null}
        <h1>{product.tagline}</h1>
        <p className="mkt-product-tagline">{product.name}</p>
        <p className="mkt-product-desc">{product.description}</p>
      </div>

      <div className="mkt-panel" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>주요 기능</h2>
        <ul className="mkt-feat-list">
          {product.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>

      <ProductDetailScreens
        homeScreen={product.homeScreen}
        featureDetails={product.featureDetails}
        appHref={product.href}
      />

      <ProductReviews tool={params.slug} toolName={product.name} initial={reviews} />

      {"painPoints" in product && product.painPoints ? (
        <div className="mkt-panel" style={{ marginTop: 20 }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>해결하는 업무</h2>
          <ul className="mkt-feat-list">
            {product.painPoints.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {"scenarios" in product && product.scenarios ? (
        <div className="mkt-panel">
          <h2 style={{ marginTop: 0, fontSize: 18 }}>사용 시나리오</h2>
          <ol style={{ color: "var(--mkt-text-dim)", paddingLeft: 20, margin: 0, fontSize: 15 }}>
            {product.scenarios.map((s, i) => (
              <li key={s} style={{ marginBottom: 8 }}>
                {i + 1}. {s}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {"customizeOptions" in product && product.customizeOptions ? (
        <div className="mkt-panel">
          <h2 style={{ marginTop: 0, fontSize: 18 }}>커스터마이징 가능 항목</h2>
          <ul className="mkt-feat-list">
            {product.customizeOptions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 24 }}>
        {!isReceipt ? (
          <Link className="mkt-btn mkt-btn-primary" href={betaEntryHref(product.href)}>
            베타 프로그램에서 열기
          </Link>
        ) : (
          <Link className="mkt-btn mkt-btn-primary" href={product.href}>
            체험하기
          </Link>
        )}
        <Link className="mkt-btn" href={`/contact?tool=${params.slug}&type=customize`}>
          맞춤 문의
        </Link>
        <Link className="mkt-btn mkt-btn-ghost" href="/#tools">
          ← 도구 목록
        </Link>
      </div>
    </MarketingPageShell>
  );
}
