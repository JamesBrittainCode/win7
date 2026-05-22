import { NextResponse } from "next/server";
import { parseAndValidateTarget } from "@/lib/urlSafety";
import { assertNoPrivateResolution } from "@/lib/ssrfGuard";
import { toAbsoluteUrl } from "@/lib/urlSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_ASSET_BYTES = 5_000_000; // 5MB

const ALLOWED_PREFIXES = [
  "image/",
  "text/css",
  "font/",
  "application/font-woff",
  "application/font-woff2"
];

function allowedContentType(ct: string) {
  const v = ct.toLowerCase().split(";")[0].trim();
  return ALLOWED_PREFIXES.some((p) => (p.endsWith("/") ? v.startsWith(p) : v === p));
}

async function readArrayBufferWithLimit(res: Response, limitBytes: number) {
  const reader = res.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limitBytes) throw new Error("Asset too large.");
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return all.buffer;
}

async function readTextWithLimit(res: Response, limitBytes: number) {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limitBytes) throw new Error("Asset too large.");
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(all);
}

function proxifyAsset(absUrl: string) {
  return `/api/asset?url=${encodeURIComponent(absUrl)}`;
}

function rewriteCssUrls(css: string, baseUrl: string) {
  // Best-effort rewrite for url(...) and @import rules so browsers don't fetch third-party assets directly.
  // This preserves "looks normal" for many static sites while keeping all requests going through our proxy.
  const urlRe = /url\(\s*(?:'([^']*)'|"([^"]*)"|([^'")]*))\s*\)/gi;
  const importRe = /@import\s+(?:url\(\s*)?(?:'([^']*)'|"([^"]*)"|([^'";)\s]*))(?:\s*\))?\s*;/gi;

  const rewrite = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return raw;
    const abs = toAbsoluteUrl(trimmed, baseUrl);
    if (!abs) return raw;
    return proxifyAsset(abs);
  };

  const step1 = css.replace(urlRe, (m, a, b, c) => {
    const v = a ?? b ?? c ?? "";
    const rep = rewrite(v);
    return `url("${rep}")`;
  });

  return step1.replace(importRe, (m, a, b, c) => {
    const v = a ?? b ?? c ?? "";
    const rep = rewrite(v);
    return `@import url("${rep}");`;
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url") ?? "";
  const parsed = parseAndValidateTarget(rawUrl);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  try {
    await assertNoPrivateResolution(parsed.url.hostname);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Blocked target." }, { status: 400 });
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(parsed.url.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Win7SafeProxy/0.1 (+https://vercel.com)"
      }
    });
  } catch {
    clearTimeout(t);
    return NextResponse.json({ ok: false, error: "Fetch failed or timed out." }, { status: 502 });
  } finally {
    clearTimeout(t);
  }

  // Guard final URL after redirects.
  try {
    const finalParsed = parseAndValidateTarget(upstream.url);
    if (!finalParsed.ok) throw new Error(finalParsed.error);
    await assertNoPrivateResolution(finalParsed.url.hostname);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? `Blocked redirect: ${e.message}` : "Blocked redirect." },
      { status: 400 }
    );
  }

  const ct = upstream.headers.get("content-type") ?? "";
  if (!allowedContentType(ct)) {
    return NextResponse.json(
      { ok: false, error: `Blocked asset content-type: ${ct || "(none)"}` },
      { status: 415 }
    );
  }

  const ctMain = ct.toLowerCase().split(";")[0].trim();
  if (ctMain === "text/css") {
    try {
      const css = await readTextWithLimit(upstream, MAX_ASSET_BYTES);
      const rewritten = rewriteCssUrls(css, parsed.url.toString());
      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          "content-type": ct,
          "cache-control": "public, max-age=3600, s-maxage=3600",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer"
        }
      });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Read failed." }, { status: 413 });
    }
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await readArrayBufferWithLimit(upstream, MAX_ASSET_BYTES);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Read failed." }, { status: 413 });
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "content-type": ct,
      "cache-control": "public, max-age=3600, s-maxage=3600",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer"
    }
  });
}
