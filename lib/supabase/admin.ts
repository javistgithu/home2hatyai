import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Supabase client แบบ service role — ข้าม RLS ทั้งหมด
 *
 * ⚠️ ใช้ได้เฉพาะฝั่งเซิร์ฟเวอร์เท่านั้น (pipeline เก็บข้อมูล / งานเบื้องหลัง)
 *    ห้าม import จาก client component เด็ดขาด และห้ามใส่คีย์นี้ในตัวแปร NEXT_PUBLIC_*
 */
export function createAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY — จำเป็นสำหรับระบบเก็บข้อมูลอัตโนมัติ"
    );
  }
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
