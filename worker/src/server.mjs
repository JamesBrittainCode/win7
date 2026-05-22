import http from "node:http";
import { WebSocketServer } from "ws";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const PORT = Number(process.env.PORT || 8787);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in worker env.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("win7 proxy worker ok\n");
});

const wss = new WebSocketServer({ server, path: "/ws" });

async function getUserFromToken(token) {
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, token };
}

function safeUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

wss.on("connection", async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get("sessionId") || "";
  const token = url.searchParams.get("token") || "";
  const user = await getUserFromToken(token);

  if (!user) {
    ws.close(4401, "unauthorized");
    return;
  }
  if (!sessionId) {
    ws.close(4400, "missing sessionId");
    return;
  }

  const { data: sessionRow, error: sessionErr } = await supabase
    .from("sessions")
    .select("id,user_id,status")
    .eq("id", sessionId)
    .single();

  if (sessionErr || !sessionRow || sessionRow.user_id !== user.user.id) {
    ws.close(4403, "forbidden");
    return;
  }

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  let streaming = false;
  let stop = false;

  async function sendFrame() {
    if (stop || ws.readyState !== ws.OPEN) return;
    try {
      const buf = await page.screenshot({ type: "jpeg", quality: 70 });
      ws.send(JSON.stringify({ type: "frame", mime: "image/jpeg", data: buf.toString("base64") }));
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", message: String(e?.message || e) }));
    }
  }

  async function loop() {
    while (!stop) {
      if (!streaming) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      await sendFrame();
      await new Promise((r) => setTimeout(r, 250)); // ~4 fps
    }
  }

  loop().catch(() => {});

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString("utf-8"));
    } catch {
      return;
    }
    if (msg?.type === "nav") {
      const target = safeUrl(msg.url || "");
      if (!target) return;
      await page.goto(target, { waitUntil: "domcontentloaded" }).catch(() => {});
      return;
    }
    if (msg?.type === "stream") {
      streaming = Boolean(msg.on);
      return;
    }
    if (msg?.type === "click") {
      await page.mouse.click(Number(msg.x || 0), Number(msg.y || 0)).catch(() => {});
      return;
    }
    if (msg?.type === "type") {
      const text = String(msg.text || "");
      await page.keyboard.type(text).catch(() => {});
      return;
    }
    if (msg?.type === "key") {
      const key = String(msg.key || "");
      if (!key) return;
      await page.keyboard.press(key).catch(() => {});
      return;
    }
    if (msg?.type === "scroll") {
      const dx = Number(msg.dx || 0);
      const dy = Number(msg.dy || 0);
      await page.mouse.wheel(dx, dy).catch(() => {});
    }
  });

  ws.on("close", async () => {
    stop = true;
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  });

  ws.send(JSON.stringify({ type: "ready" }));
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`worker listening on :${PORT}`);
});
