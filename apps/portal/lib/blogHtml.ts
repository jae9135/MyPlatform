import type { BlogPost } from "@/lib/blogShared";

export type BlogHtmlImage = { asset: { id: string; file_name: string; alt_text: string | null }; signedUrl: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>']/g, (character) => character === "&" ? "&amp;" : character === "<" ? "&lt;" : character === ">" ? "&gt;" : "&#39;").replace(/"/g, "&quot;");
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;|&#x27;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();
}

function normalizeTitle(value: string): string { return stripTags(value).normalize("NFKC").replace(/\s+/g, " ").trim(); }

function removeDuplicateTitleH1(html: string, title: string): string {
  const expected = normalizeTitle(title);
  let firstH1 = true;
  return html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi, (candidate) => {
    if (!firstH1) return candidate;
    firstH1 = false;
    return normalizeTitle(candidate.replace(/^<h1\b[^>]*>/i, "").replace(/<\/h1>$/i, "")) === expected ? "" : candidate;
  });
}

function sanitizeForOutput(value: string): string {
  return value.replace(/<(script|iframe|object|embed)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/\s(?:src|href)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, "");
}

function replaceImageTokens(html: string, images: BlogHtmlImage[]): string {
  const imageMap = new Map(images.map((image) => [image.asset.id, image]));
  return html.replace(/\{\{image:([0-9a-f-]{36})\}\}/gi, (token, id: string) => {
    const image = imageMap.get(id);
    if (!image) return token;
    return `<img src="${escapeHtml(image.signedUrl)}" alt="${escapeHtml(image.asset.alt_text || image.asset.file_name)}" style="display:inline-block;max-width:100%;height:auto;vertical-align:middle;">`;
  });
}

function normalizeTistoryQuoteMarkup(html: string): string {
  return html
    .replace(/<blockquote\b([^>]*)>/gi, (_match, attributes: string) => {
      const nextAttributes = attributes.replace(/\sstyle=(['"])([\s\S]*?)\1/i, (_styleMatch, quote: string, style: string) => {
        const withoutLeftBorder = style.replace(/\bborder-left\s*:\s*[^;]+;?/gi, "").trim();
        return ` style=${quote}${withoutLeftBorder};border-left:0;quotes:none;${quote}`;
      });
      const withStyle = /\sstyle=/i.test(nextAttributes)
        ? nextAttributes
        : `${nextAttributes} style="border-left:0;quotes:none;"`;
      return `<div data-blog-tistory-quote="true"${withStyle}>`;
    })
    .replace(/<\/blockquote>/gi, "</div>");
}

export function normalizeBlogBodyHtml(post: Pick<BlogPost, "title" | "body_html" | "body_markdown">, images: BlogHtmlImage[], platform?: "naver" | "tistory"): string {
  const original = post.body_html.trim() || `<p>${escapeHtml(post.body_markdown).replace(/\r?\n/g, "<br>")}</p>`;
  const normalized = replaceImageTokens(removeDuplicateTitleH1(sanitizeForOutput(original), post.title), images);
  return platform === "tistory" ? normalizeTistoryQuoteMarkup(normalized) : normalized;
}

export function createBlogPreviewHtml(post: Pick<BlogPost, "title" | "body_html" | "body_markdown">, images: BlogHtmlImage[], platform?: "naver" | "tistory"): string {
  const body = normalizeBlogBodyHtml(post, images, platform);
  const heading = `<h1 style="color:#0f172a;font-weight:800;margin:0 0 20px;">${escapeHtml(post.title)}</h1>`;
  if (/<html\b/i.test(body)) {
    return body.replace(/<body\b([^>]*)>/i, `<body$1>${heading}`);
  }
  return `${heading}${body}`;
}

export function createBlogCopyHtml(post: Pick<BlogPost, "title" | "body_html" | "body_markdown">, images: BlogHtmlImage[], platform?: "naver" | "tistory"): string {
  return normalizeBlogBodyHtml(post, images, platform).replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "");
}

export function htmlToPlainText(html: string): string {
  if (typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(html, "text/html");
    return document.body.textContent?.replace(/\n{3,}/g, "\n\n").trim() ?? "";
  }
  return stripTags(html);
}
