import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Supabase client สำหรับ Server Component / Route Handler
 * ต้องสร้างใหม่ทุก request ห้ามแชร์ข้าม request (เซสชันจะปนกัน)
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component เขียนคุกกี้ไม่ได้ — middleware จะรีเฟรชเซสชันให้แทน
        }
      },
    },
  });
}
