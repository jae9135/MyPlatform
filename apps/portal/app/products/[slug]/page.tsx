import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductDetailScreens } from "@/components/marketing/AppScreenMockup";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import {
  getMarketingTool,
  getMarketingTools,
  getProductBySlug,
  RECEIPT_STANDALONE,
} from "@/lib/marketingCatalog";
import "../../marketing.css";

type Props = { params: { slug: string } };

export function generateStaticParams() {
  const slugs = getMarketingTools().map((t) => ({ slug: t.slug }));
  return [...slugs, { slug: RECEIPT_STANDALONE.slug }];
}

export default function ProductPage({ params }: Props) {
  const product = getProductBySlug(params.slug);
  if (!product) notFound();

  const isReceipt = product.isStandalone;
  const tool = getMarketingTool(params.slug);

  return (
    <MarketingPageShell>
      {isReceipt ? (
        <p className="mkt-eyebrow">STANDALONE · MOBILE</p>
      ) : tool ? (
        <p className="mkt-eyebrow">{tool.categoryLabel.toUpperCase()}</p>
      ) : null}

      <div className="mkt-product-hero">
        <h1>{product.name}</h1>
        <p className="mkt-product-tagline">{product.tagline}</p>
        <p className="mkt-product-desc">{product.description}</p>
      </div>

      <ProductDetailScreens
        homeScreen={product.homeScreen}
        featureDetails={product.featureDetails}
        appHref={product.href}
      />

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
          <Link className="mkt-btn mkt-btn-primary" href={`/login?next=${encodeURIComponent(product.href)}`}>
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
