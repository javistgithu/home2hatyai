import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * ทำงานกับทุกเส้นทาง ยกเว้นไฟล์สแตติกและรูปภาพ
     * (ยกเว้น /api/line-webhook ที่ต้องอ่าน raw body เองและไม่ต้องใช้เซสชัน)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/line-webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
