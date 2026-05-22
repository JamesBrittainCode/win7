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

### Env vars (Vercel)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; do not expose)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_WORKER_WS_URL` (for Live mode; e.g. `wss://your-worker.example`)

### Supabase SQL

Create a `sessions` table:

```sql
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'created',
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_id_idx on public.sessions(user_id);
```

Enable RLS and restrict to owner (optional but recommended):

```sql
alter table public.sessions enable row level security;

create policy "sessions: owner read"
on public.sessions for select
to authenticated
using (auth.uid() = user_id);

create policy "sessions: owner insert"
on public.sessions for insert
to authenticated
with check (auth.uid() = user_id);
```

## How it works

- `GET /browse?url=...` loads an iframe pointing at:
  - `GET /api/proxy?url=...` (sanitized HTML document)
- Images are rewritten to:
  - `GET /api/asset?url=...` (allowlisted asset types only)
- Live mode (interactive) connects to a separate worker:
  - `wss://WORKER/ws?sessionId=...&token=...` (token is Supabase access token)

## “Why is the site blank/broken?”

Many modern sites are JS apps (React/Vue/etc). In `HTML` mode, scripts are removed, so those sites will not render.

Use `Visual` mode, which renders the page in headless Chromium and returns a screenshot from:
- `GET /api/render?url=...`

Visual mode looks normal, but it is **not interactive** (it’s a screenshot).

## Live mode (interactive remote browser)

Vercel alone cannot host a real interactive proxy for arbitrary HTTPS sites. Live mode uses a **separate worker** that runs Playwright/Chromium and streams frames + accepts input events.

Worker code is in `worker/`.

### Run the worker

```bash
cd worker
npm install
PORT=8787 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run start
```

Expose it over TLS (so you can use `wss://`). Point `NEXT_PUBLIC_WORKER_WS_URL` at it.
