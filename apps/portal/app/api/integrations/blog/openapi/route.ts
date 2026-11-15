export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  return Response.json({
    openapi: "3.0.3",
    info: { title: "MyPlatform Blog Support Import", version: "1.0.0", description: "ChatGPT 승인 후 HTML·이미지 ZIP을 블로그 지원 프로그램에 등록합니다." },
    servers: [{ url: "https://YOUR_PORTAL_DOMAIN" }],
    paths: {
      "/api/integrations/blog/import-zip": {
        post: {
          operationId: "importApprovedBlogZip",
          summary: "승인된 블로그 ZIP 등록",
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { "application/zip": { schema: { type: "string", format: "binary" } } } },
          responses: {
            "201": { description: "원고와 이미지가 등록됨" },
            "200": { description: "동일 external_id 또는 ZIP 재전송으로 기존 결과 반환" },
            "401": { description: "인증 실패" },
            "415": { description: "ZIP이 아닌 요청" },
          },
        },
      },
    },
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
  }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
