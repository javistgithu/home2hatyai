import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export const runtime = "nodejs";

/** ปลายทางของลิงก์ยืนยันอีเมลจาก Supabase — แลกโค้ดเป็นเซสชันแล้วพากลับเข้าแอป */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.redirect(new URL("/", request.url));

  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") || "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback", request.url));
}
