"use client";

import Link from "next/link";
import { getMarketingTools } from "@/lib/marketingCatalog";

export function ToolCatalog() {
  const tools = getMarketingTools();

  return (
    <div className="mkt-tool-grid">
      {tools.map((tool) => (
        <Link key={tool.slug} className="mkt-tool-card" href={`/products/${tool.slug}`}>
          <span className="mkt-catpill">{tool.categoryLabel}</span>
          <div className="mkt-tool-card-body">
            <h3>{tool.app.name}</h3>
            <p>{tool.tagline}</p>
            <div className="mkt-tool-card-actions">
              <span className="mkt-btn mkt-btn-primary mkt-btn-sm">상세설명 →</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
