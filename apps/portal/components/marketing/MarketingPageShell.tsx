import { MarketingFooter } from "./MarketingFooter";
import { MarketingNav } from "./MarketingNav";

export function MarketingPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mkt">
      <MarketingNav />
      <main className="mkt-page-main">
        <div className="mkt-wrap">{children}</div>
      </main>
      <MarketingFooter />
    </div>
  );
}
