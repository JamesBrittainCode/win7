import { NextResponse } from "next/server";
import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";
import { parseAndValidateTarget } from "@/lib/urlSafety";
import { assertNoPrivateResolution } from "@/lib/ssrfGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAV_TIMEOUT_MS = 15_000;
const MAX_PIXELS = 3_000_000; // keep images reasonably sized

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url") ?? "";
  const parsed = parseAndValidateTarget(rawUrl);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  try {
    await assertNoPrivateResolution(parsed.url.hostname);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Blocked target." }, { status: 400 });
  }

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 720 },
    executablePath: await chromium.executablePath(),
    headless: true
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    page.setDefaultTimeout(NAV_TIMEOUT_MS);

    // Reduce some attack surface / surprises.
    await page.setBypassCSP(false);
    await page.setJavaScriptEnabled(true); // fidelity mode

    await page.goto(parsed.url.toString(), { waitUntil: "networkidle2" });

    // Guard final URL after redirects.
    const finalUrl = page.url();
    const finalParsed = parseAndValidateTarget(finalUrl);
    if (!finalParsed.ok) throw new Error(finalParsed.error);
    await assertNoPrivateResolution(finalParsed.url.hostname);

    const bodyHandle = await page.$("body");
    if (!bodyHandle) throw new Error("No body to render.");
    const box = await bodyHandle.boundingBox();
    await bodyHandle.dispose();

    const viewport = page.viewport() ?? { width: 1280, height: 720 };
    const rawWidth = Math.ceil(box?.width ?? viewport.width);
    const rawHeight = Math.ceil(box?.height ?? viewport.height);

    // Downscale by increasing deviceScaleFactor if too big? Instead clamp clip size.
    const width = clamp(rawWidth, 320, 1600);
    const height = clamp(rawHeight, 240, 2400);

    // Keep overall pixels bounded.
    const pixels = width * height;
    const scale = pixels > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / pixels) : 1;
    const clipW = Math.max(320, Math.floor(width * scale));
    const clipH = Math.max(240, Math.floor(height * scale));

    await page.setViewport({ width: clipW, height: clipH, deviceScaleFactor: 1 });
    const png = await page.screenshot({ type: "png" });

    return new NextResponse(png, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer"
      }
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Render failed." }, { status: 500 });
  } finally {
    await browser.close();
  }
}
