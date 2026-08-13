import Link from "next/link";

export function PortalNav({ home = false }: { home?: boolean }) {
  return (
    <div className={`portal-nav${home ? " portal-nav-home" : ""}`}>
      {home ? (
        <span className="portal-nav-spacer" />
      ) : (
        <Link className="back" href="/">
          ← MyPlatform
        </Link>
      )}
      <form action="/api/logout" method="post">
        <button className="btn ghost" type="submit">
          로그아웃
        </button>
      </form>
    </div>
  );
}
