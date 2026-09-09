import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/types/database";

export interface SessionContext {
  userId: string;
  email: string | null;
  profile: Profile | null;
  role: UserRole;
}

/** อ่านผู้ใช้ปัจจุบันพร้อมโปรไฟล์ คืน null เมื่อยังไม่ล็อกอิน */
export async function getSession(): Promise<SessionContext | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: (profile as Profile | null) ?? null,
    role: ((profile as Profile | null)?.role ?? "buyer") as UserRole,
  };
}

/** บังคับให้ต้องล็อกอินและมีบทบาทตามที่กำหนด ไม่ผ่านจะพาไปหน้าอื่น */
export async function requireRole(allowed: UserRole[], nextPath: string): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (!allowed.includes(session.role)) redirect("/?error=forbidden");
  return session;
}
