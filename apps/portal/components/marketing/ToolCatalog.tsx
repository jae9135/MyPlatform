"use client";

import Image from "next/image";
import Link from "next/link";
import { getToolThumb, type ToolCategoryGroup } from "@/lib/marketingAssets";
import { getMarketingTools } from "@/lib/marketingCatalog";

type Props = {
  category?: ToolCategoryGroup;
};

export function ToolCatalog({ category }: Props) {
  const tools = getMarketingTools().filter(
    (t) => !category || t.app.category === category
  );

  return (
    <div className="mkt-tool-grid">
      {tools.map((tool) => {
        const thumb = getToolThumb(tool.slug);
        return (
          <Link key={tool.slug} className="mkt-tool-card" href={`/products/${tool.slug}`}>
            {thumb ? (
              <div className="mkt-tool-card-thumb">
                <Image
                  src={thumb}
                  alt={`${tool.app.name} 실제 화면`}
                  fill
                  className="mkt-tool-card-img"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
            ) : null}
            <span className="mkt-catpill">{tool.categoryLabel}</span>
            <div className="mkt-tool-card-body">
              <h3>{tool.app.name}</h3>
              <p>{tool.tagline}</p>
              <div className="mkt-tool-card-actions">
                <span className="mkt-btn mkt-btn-primary mkt-btn-sm">상세설명 →</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
