import Link from "next/link";

export default function DbManagerPage() {
  return (
    <main>
      <Link className="back" href="/">
        ← MyPlatform
      </Link>
      <section className="hero">
        <h1>DBManager</h1>
        <p>API 연동 준비 중. 로컬에서는 study/DBManager 를 사용하세요.</p>
      </section>
    </main>
  );
}
