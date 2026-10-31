/** 구조화 데이터(schema.org JSON-LD) — 서버에서 HTML 에 그대로 출력 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  // </script> 주입 방지
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
