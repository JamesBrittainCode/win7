import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ ok: false, error: "Missing bearer token." }, { status: 401 });
  }
  const token = auth.slice("bearer ".length).trim();
  const supabase = supabaseServer();

  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes.user) {
    return NextResponse.json({ ok: false, error: "Invalid token." }, { status: 401 });
  }

  // sessions table is created by user SQL (see README).
  const { data, error } = await supabase
    .from("sessions")
    .insert({ user_id: userRes.user.id, status: "created" })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sessionId: data.id }, { status: 200 });
}

