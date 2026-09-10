import { handler, ok, fail, db, ApiError } from "@/lib/pos/api";
import { authenticate } from "@/lib/pos/users";
import { setSessionCookie } from "@/lib/pos/session";

export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const { code, pin } = (await req.json()) as { code?: string; pin?: string };
  if (!code || !pin) throw new ApiError("กรุณากรอกรหัสพนักงานและ PIN");

  const user = await authenticate(await db(), code, pin);
  // ไม่บอกว่า "ไม่มีรหัสนี้" หรือ "PIN ผิด" แยกกัน เพื่อไม่ให้เดารหัสพนักงานได้
  if (!user) return fail("รหัสพนักงานหรือ PIN ไม่ถูกต้อง", 401);

  setSessionCookie(user.id);
  return ok(user);
});
