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
  const mode = (searchParams.get("mode") ?? "visual") as "visual" | "html";

  const [value, setValue] = useState(current);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

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

  function go(raw: string) {
    const normalized = normalizeUrl(raw);
    if (!normalized) return;
    router.push(`/browse?url=${encodeURIComponent(normalized)}&mode=${mode}`);
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
              ? mode === "visual"
                ? "Rendering (Chromium)…"
                : "Loading sanitized view…"
              : current
                ? mode === "visual"
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
          {mode === "visual" ? "Visual mode is a screenshot (non-interactive)" : "Tip: try a domain only (we assume https://)"}
        </div>
      </footer>
    </main>
  );
}

