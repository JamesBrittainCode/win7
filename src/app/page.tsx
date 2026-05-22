import Link from "next/link";
import styles from "./page.module.css";
import { Clock } from "@/components/Clock";

export default function HomePage() {
  return (
    <main className={styles.desktop}>
      <div className={styles.wallpaperGlow} aria-hidden />

      <section className={styles.window} aria-label="Win7 Safe Proxy">
        <header className={styles.titlebar}>
          <div className={styles.traffic} aria-hidden>
            <span className={`${styles.dot} ${styles.red}`} />
            <span className={`${styles.dot} ${styles.yellow}`} />
            <span className={`${styles.dot} ${styles.green}`} />
          </div>
          <div className={styles.title}>Win7 Safe Proxy</div>
          <div className={styles.subtitle}>JS-disabled / sanitized viewer</div>
        </header>

        <div className={styles.content}>
          <p className={styles.lede}>
            This is a <strong>best-effort</strong> safety layer for inspecting risky pages. It strips scripts, blocks
            downloads, and proxies assets — but it is <strong>not</strong> a guarantee against exploitation.
          </p>

          <div className={styles.actions}>
            <Link className={styles.primary} href="/browse">
              Open Browser
            </Link>
            <a className={styles.secondary} href="https://vercel.com" target="_blank" rel="noreferrer">
              Host on Vercel
            </a>
          </div>

          <div className={styles.tips}>
            <div className={styles.tip}>
              <div className={styles.badgeOk}>On</div>
              <div>
                <div className={styles.tipTitle}>Script execution disabled</div>
                <div className={styles.tipText}>No inline or external scripts are allowed in rendered pages.</div>
              </div>
            </div>
            <div className={styles.tip}>
              <div className={styles.badgeWarn}>Limited</div>
              <div>
                <div className={styles.tipTitle}>Asset proxy allowlist</div>
                <div className={styles.tipText}>Only images, CSS, and fonts are proxied, with size limits.</div>
              </div>
            </div>
            <div className={styles.tip}>
              <div className={styles.badgeDanger}>Caution</div>
              <div>
                <div className={styles.tipTitle}>Not “virus-proof”</div>
                <div className={styles.tipText}>Server-side fetches can still hit malicious infrastructure.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.taskbar} aria-label="Taskbar">
        <div className={styles.orb} aria-hidden />
        <div className={styles.task}>Safe Proxy</div>
        <div className={styles.clock}>
          <Clock />
        </div>
      </footer>
    </main>
  );
}
