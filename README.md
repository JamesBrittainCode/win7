# Win7 Safe Proxy (Vercel)

A Next.js app you can deploy to Vercel to **inspect risky pages with scripts disabled**.

This project is a *best-effort safety layer*:
- It fetches HTML server-side, **sanitizes it**, and renders it in a sandboxed iframe (no scripts).
- It blocks most non-HTML content in the main view and only proxies a small allowlist of assets (images/CSS/fonts).
- It blocks obvious local/private targets (e.g. `localhost`, `127.0.0.1`, `192.168.0.0/16`).
- It DNS-checks hostnames and blocks ones that resolve to private IPs (best-effort SSRF guard).

It is **not a guarantee** against exploitation, and it still makes network requests to the target sites from your serverless runtime.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Deploy (defaults are fine).

## How it works

- `GET /browse?url=...` loads an iframe pointing at:
  - `GET /api/proxy?url=...` (sanitized HTML document)
- Images are rewritten to:
  - `GET /api/asset?url=...` (allowlisted asset types only)

## “Why is the site blank/broken?”

Many modern sites are JS apps (React/Vue/etc). In `HTML` mode, scripts are removed, so those sites will not render.

Use `Visual` mode, which renders the page in headless Chromium and returns a screenshot from:
- `GET /api/render?url=...`

Visual mode looks normal, but it is **not interactive** (it’s a screenshot).
