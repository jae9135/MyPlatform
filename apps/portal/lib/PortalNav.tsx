"use client";

export function PortalNav({ home = false }: { home?: boolean }) {
  return (
    <nav className={`portal-nav${home ? " portal-nav-home" : ""}`} aria-label="포털">
      {home ? (
        <span className="portal-nav-spacer" />
      ) : (
        <a
          className="back"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            window.location.assign("/");
          }}
        >
          ← MyPlatform으로 돌아가기
        </a>
      )}
      <form action="/api/logout" method="post">
        <button className="btn ghost" type="submit">
          로그아웃
        </button>
      </form>
    </nav>
  );
}
