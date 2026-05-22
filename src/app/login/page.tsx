"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = supabaseBrowser();
    s.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/browse");
    });
  }, [router]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "min(420px, 95vw)", background: "#d9d9d9", border: "2px solid #7b7b7b", padding: 16 }}>
        <div style={{ background: "linear-gradient(180deg,#1a2aa8,#000080)", color: "#fff", padding: "10px 12px" }}>
          <strong>Log On</strong>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const supabase = supabaseBrowser();
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            setBusy(false);
            if (error) return setError(error.message);
            router.replace("/browse");
          }}
          style={{ padding: 12, display: "grid", gap: 10 }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: 8 }} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: 8 }}
            />
          </label>
          {error ? <div style={{ color: "#8a0000" }}>{error}</div> : null}
          <button type="submit" disabled={busy} style={{ padding: 10 }}>
            {busy ? "Signing in…" : "OK"}
          </button>
        </form>
      </div>
    </main>
  );
}

