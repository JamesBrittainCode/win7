import sanitizeHtml from "sanitize-html";
import { toAbsoluteUrl } from "./urlSafety";

const ALLOWED_TAGS = [
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "code",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "link",
  "img",
  "kbd",
  "li",
  "main",
  "mark",
  "ol",
  "p",
  "pre",
  "section",
  "small",
  "span",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul"
];

const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ["href", "title", "rel"],
  img: ["src", "alt", "title", "width", "height"],
  link: ["rel", "href", "media"],
  "*": ["class"]
};

function proxifyAsset(absUrl: string) {
  return `/api/asset?url=${encodeURIComponent(absUrl)}`;
}

function proxifyNav(absUrl: string) {
  return `/browse?url=${encodeURIComponent(absUrl)}`;
}

export function sanitizeAndRewriteHtml(html: string, pageUrl: string) {
  const cleaned = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    // We allow <style> for page fidelity; scripts remain disallowed by tag list.
    // Also see CSP + iframe sandbox.
    allowVulnerableTags: true,
    allowedSchemes: ["http", "https"],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    nonTextTags: ["script", "textarea", "noscript"],
    enforceHtmlBoundary: true,
    transformTags: {
      a: (tagName: string, attribs: Record<string, string>) => {
        const href = attribs.href ? toAbsoluteUrl(attribs.href, pageUrl) : null;
        const safeHref = href ? proxifyNav(href) : undefined;
        return {
          tagName,
          attribs: {
            ...attribs,
            href: safeHref,
            rel: "noreferrer noopener"
          }
        };
      },
      link: (tagName: string, attribs: Record<string, string>) => {
        const rel = (attribs.rel || "").toLowerCase();
        if (rel.includes("stylesheet") && attribs.href) {
          const href = toAbsoluteUrl(attribs.href, pageUrl);
          const safeHref = href ? proxifyAsset(href) : undefined;
          return { tagName, attribs: { ...attribs, href: safeHref, rel: "stylesheet" } };
        }
        // Drop non-stylesheet links (preload, icons, etc.) for safety.
        return { tagName: "span", attribs: {} };
      },
      img: (tagName: string, attribs: Record<string, string>) => {
        const src = attribs.src ? toAbsoluteUrl(attribs.src, pageUrl) : null;
        const safeSrc = src ? proxifyAsset(src) : undefined;
        return {
          tagName,
          attribs: {
            ...attribs,
            src: safeSrc
          }
        };
      }
    },
    exclusiveFilter: (frame: { tag?: string; attribs?: Record<string, string> }) => {
      const name = frame.tag?.toLowerCase();
      if (!name) return false;
      if (name === "a" && frame.attribs?.href?.startsWith("javascript:")) return true;
      return false;
    }
  });

  const doc = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <base target="_top" />
    <style>
      :root { color-scheme: light; }
      body { font-family: system-ui, -apple-system, Segoe UI, Arial, sans-serif; line-height: 1.5; padding: 0; margin: 0; background: #fff; color: #111; }
      img { max-width: 100%; height: auto; }
      table { border-collapse: collapse; width: 100%; }
      td, th { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
      pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.95em; }
      pre { background: #f6f8fa; padding: 12px; overflow: auto; border-radius: 10px; }
      a { color: #0b5bd3; }
      a:hover { text-decoration: underline; }
      details { background: #f6f8fa; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; }
    </style>
  </head>
  <body>
    ${cleaned || "<p>(Empty or unsupported content)</p>"}
  </body>
</html>`;

  return doc;
}
