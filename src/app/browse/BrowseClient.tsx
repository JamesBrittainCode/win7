"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";

function normalizeUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

export default function BrowseClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("url") ?? "";
  const mode = (searchParams.get("mode") ?? "live") as "live" | "visual" | "html";

  const [value, setValue] = useState(current);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [frameSrc, setFrameSrc] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [accessToken, setAccessToken] = useState<string>("");

  const iframeSrc = useMemo(() => {
    if (!current) return "";
    return `/api/proxy?url=${encodeURIComponent(current)}`;
  }, [current]);

  const renderSrc = useMemo(() => {
    if (!current) return "";
    return `/api/render?url=${encodeURIComponent(current)}&t=${Date.now()}`;
  }, [current]);

  useEffect(() => {
    setValue(current);
  }, [current]);

  useEffect(() => {
    if (!current) return;
    setLoading(true);
  }, [current, mode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { supabaseBrowser } = await import("@/lib/supabase/browser");
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? "";
      if (!token) {
        router.replace("/login");
        return;
      }
      if (!cancelled) setAccessToken(token);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/session/create", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` }
      });
      const json = await res.json().catch(() => ({}));
      if (!cancelled && json?.ok && json?.sessionId) setSessionId(String(json.sessionId));
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (mode !== "live") return;
    if (!sessionId || !accessToken) return;
    const base = process.env.NEXT_PUBLIC_WORKER_WS_URL || "";
    if (!base) return;

    const wsUrl = `${base.replace(/\/$/, "")}/ws?sessionId=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(accessToken)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "stream", on: true }));
      if (current) ws.send(JSON.stringify({ type: "nav", url: current }));
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg?.type === "frame" && msg?.mime && msg?.data) {
          setFrameSrc(`data:${msg.mime};base64,${msg.data}`);
        }
      } catch {
        // ignore
      }
    };
    ws.onerror = () => {
      setLoading(false);
    };
    ws.onclose = () => {
      wsRef.current = null;
    };
    return () => {
      try {
        ws.close();
      } catch {}
    };
  }, [mode, sessionId, accessToken, current]);

  function go(raw: string) {
    const normalized = normalizeUrl(raw);
    if (!normalized) return;
    router.push(`/browse?url=${encodeURIComponent(normalized)}&mode=${mode}`);
    if (mode === "live" && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "nav", url: normalized }));
    }
  }

  return (
    <main className={styles.desktop}>
      <div className={styles.window}>
        <header className={styles.titlebar}>
          <div className={styles.left}>
            <div className={styles.icon} aria-hidden />
            <div>
              <div className={styles.title}>Safe Browser</div>
              <div className={styles.subtitle}>Retro UI • safer viewing</div>
            </div>
          </div>

          <div className={styles.right}>
            <div className={styles.mode}>
              <button
                type="button"
                className={`${styles.modeBtn} ${mode === "live" ? styles.modeBtnActive : ""}`}
                onClick={() => router.push(`/browse?${current ? `url=${encodeURIComponent(current)}&` : ""}mode=live`)}
                title="Interactive remote browser (requires worker)"
              >
                Live
              </button>
              <button
                type="button"
                className={`${styles.modeBtn} ${mode === "visual" ? styles.modeBtnActive : ""}`}
                onClick={() => current && router.push(`/browse?url=${encodeURIComponent(current)}&mode=visual`)}
                title="Render via headless Chromium (looks most normal)"
              >
                Visual
              </button>
              <button
                type="button"
                className={`${styles.modeBtn} ${mode === "html" ? styles.modeBtnActive : ""}`}
                onClick={() => current && router.push(`/browse?url=${encodeURIComponent(current)}&mode=html`)}
                title="Sanitized HTML (safer, but can look broken)"
              >
                HTML
              </button>
            </div>
            <button
              className={styles.button}
              type="button"
              onClick={() => {
                if (!current) return;
                go(current);
              }}
              title="Reload"
            >
              Reload
            </button>
            <button className={styles.button} type="button" onClick={() => router.push("/")} title="Home">
              Home
            </button>
          </div>
        </header>

        <div className={styles.toolbar}>
          <form
            className={`${styles.urlbar} ${shake ? styles.shake : ""}`}
            onSubmit={(e) => {
              e.preventDefault();
              const next = normalizeUrl(value);
              if (!next) {
                setShake(true);
                setTimeout(() => setShake(false), 420);
                return;
              }
              go(next);
            }}
          >
            <span className={styles.pill} aria-hidden>
              https://
            </span>
            <input
              className={styles.input}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="example.com (or https://example.com)"
              spellCheck={false}
              inputMode="url"
              aria-label="URL"
            />
            <button className={styles.go} type="submit">
              Go
            </button>
          </form>

          <div className={styles.status} aria-live="polite">
            {loading ? <span className={styles.dot} /> : <span className={`${styles.dot} ${styles.dotOk}`} />}
            {loading
              ? mode === "live"
                ? "Connecting (worker)…"
                : mode === "visual"
                  ? "Rendering (Chromium)…"
                  : "Loading sanitized view…"
              : current
                ? mode === "live"
                  ? "Live"
                  : mode === "visual"
                    ? "Rendered"
                    : "Ready"
                : "Enter a URL to begin"}
          </div>
        </div>

        <section className={styles.viewport} aria-label="Page viewport">
          {!current ? (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>Proxy-style viewing.</div>
              <div className={styles.emptyText}>
                Use <strong>Visual</strong> to see sites as they normally look (screenshot). Use <strong>HTML</strong> for
                a sanitized, non-script version.
              </div>
            </div>
          ) : mode === "html" ? (
            <iframe
              ref={iframeRef}
              className={styles.iframe}
              src={iframeSrc}
              sandbox="allow-forms allow-top-navigation-by-user-activation"
              referrerPolicy="no-referrer"
              onLoad={() => setLoading(false)}
              title="Sanitized page viewer"
            />
          ) : mode === "live" ? (
            <div
              className={styles.liveWrap}
              tabIndex={0}
              onKeyDown={(e) => {
                if (wsRef.current?.readyState !== WebSocket.OPEN) return;
                // Let browser handle shortcuts like Cmd+L etc.
                if (e.metaKey || e.ctrlKey) return;
                if (e.key.length === 1) {
                  wsRef.current.send(JSON.stringify({ type: "type", text: e.key }));
                } else {
                  wsRef.current.send(JSON.stringify({ type: "key", key: e.key }));
                }
              }}
              onWheel={(e) => {
                if (wsRef.current?.readyState !== WebSocket.OPEN) return;
                wsRef.current.send(JSON.stringify({ type: "scroll", dx: e.deltaX, dy: e.deltaY }));
              }}
            >
              {!process.env.NEXT_PUBLIC_WORKER_WS_URL ? (
                <div className={styles.empty}>
                  <div className={styles.emptyTitle}>Missing worker URL</div>
                  <div className={styles.emptyText}>Set `NEXT_PUBLIC_WORKER_WS_URL` (e.g. `wss://your-worker.example`).</div>
                </div>
              ) : (
                <img
                  className={styles.render}
                  src={frameSrc}
                  alt="Live remote browser stream"
                  onLoad={() => setLoading(false)}
                  onClick={(e) => {
                    const el = e.currentTarget;
                    const rect = el.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * el.naturalWidth;
                    const y = ((e.clientY - rect.top) / rect.height) * el.naturalHeight;
                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                      wsRef.current.send(JSON.stringify({ type: "click", x, y }));
                    }
                  }}
                />
              )}
            </div>
          ) : (
            <img
              className={styles.render}
              src={renderSrc}
              alt="Rendered page screenshot"
              onLoad={() => setLoading(false)}
              onError={() => setLoading(false)}
            />
          )}
        </section>
      </div>

      <footer className={styles.taskbar} aria-label="Taskbar">
        <div className={styles.orb} aria-hidden />
        <div className={styles.task}>{current ? "WEB BROWSER" : "WEB BROWSER"}</div>
        <div className={styles.hint}>
          {mode === "live"
            ? "Live mode is interactive (remote browser)"
            : mode === "visual"
              ? "Visual mode is a screenshot (non-interactive)"
              : "Tip: try a domain only (we assume https://)"}
        </div>
      </footer>
    </main>
  );
}
