import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parsePost } from "@/lib/parser";

export const runtime = "nodejs";

/**
 * ดูผลการแปลงข้อความเป็นประกาศ โดยยังไม่บันทึกลงฐานข้อมูล
 * ใช้ในหน้าแอดมิน "วางข้อความโพสต์" เพื่อตรวจก่อนนำเข้า
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "admin" && role !== "seller") {
    return NextResponse.json({ error: "เฉพาะแอดมินและผู้ขายเท่านั้น" }, { status: 403 });
  }

  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบ JSON ไม่ถูกต้อง" }, { status: 400 });
  }

  const content = body.content?.trim();
  if (!content || content.length < 10) {
    return NextResponse.json({ error: "ข้อความสั้นเกินไป" }, { status: 400 });
  }

  const parsed = await parsePost(content);
  return NextResponse.json(parsed);
}
