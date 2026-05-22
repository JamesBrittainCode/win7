import { NextResponse } from "next/server";
import { parseAndValidateTarget } from "@/lib/urlSafety";
import { sanitizeAndRewriteHtml } from "@/lib/sanitizeAndRewrite";
import { assertNoPrivateResolution } from "@/lib/ssrfGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HTML_BYTES = 1_000_000; // 1MB
const FETCH_TIMEOUT_MS = 10_000;

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
    if (total > limitBytes) throw new Error("Response too large.");
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
  const isHtml = ct.includes("text/html") || ct.includes("application/xhtml+xml");
  if (!isHtml) {
    return NextResponse.json(
      { ok: false, error: `Unsupported content-type for HTML view: ${ct || "(none)"}` },
      { status: 415 }
    );
  }

  let html: string;
  try {
    html = await readTextWithLimit(upstream, MAX_HTML_BYTES);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Read failed." }, { status: 413 });
  }

  const safeDoc = sanitizeAndRewriteHtml(html, parsed.url.toString());

  const res = new NextResponse(safeDoc, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "permissions-policy":
        "camera=(), microphone=(), geolocation=(), usb=(), payment=(), interest-cohort=(), fullscreen=(self)",
      // Extra belt-and-suspenders. (Rendered in sandboxed iframe too.)
      "content-security-policy":
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self';"
    }
  });

  return res;
}
